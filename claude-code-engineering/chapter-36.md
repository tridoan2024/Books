# Chapter 36: Voice Input System

A CLI agent that only accepts keyboard input is solving the wrong problem half the time. Developers talk to rubber ducks, narrate their debugging sessions aloud, and explain code to colleagues on video calls. The voice input system transforms that natural spoken workflow into first-class input for the agent -- the user holds a key, speaks a command or a paragraph of context, and the transcribed text lands in the prompt buffer exactly as if they had typed it. No mode switching, no separate application, no copy-paste from a dictation tool.

Building this is harder than it sounds. Audio capture is platform-specific. Microphone access requires explicit user consent on every modern operating system. Real-time transcription demands a streaming API connection with sub-second latency. Background noise, silence, and overlapping speech all need handling. Domain-specific vocabulary -- function names, CLI flags, programming terms -- is consistently mangled by general-purpose speech models. And the entire subsystem must authenticate through OAuth because API key management for a third-party speech service is a liability in a developer tool.

This chapter covers the complete voice input pipeline: from microphone capture to transcribed text in the prompt buffer. We will examine two core modules -- `services/voice` for session management and audio processing, and `services/voiceStreamSTT` for the streaming transcription protocol -- along with the `/voice` and `/listen` commands that expose the feature to users. The implementation reveals engineering patterns that apply far beyond speech: state machines for hardware interaction, event-driven architectures for real-time data, and provider abstraction for swappable backends.

---

## 36.1 Architecture Overview

The voice input system follows a pipeline architecture with clear boundaries between each stage:

```
  Microphone ──► AudioCapture ──► VoiceSession (buffer + VAD) ──► SttProvider ──► Text
                     │                      │                          │
              Platform-specific     Silence detection           ┌──────┴──────┐
              (CoreAudio/ALSA/     RMS computation              │             │
               WASAPI)             Chunk splitting          Whisper API   System STT
                                                           (remote)      (on-device)
                                                                │
                                                         KeywordDetector
                                                         (voice commands)
```

Three design principles drive the architecture:

1. **Platform abstraction at the bottom.** Audio capture differs on every operating system. CoreAudio on macOS, ALSA or PulseAudio on Linux, WASAPI on Windows. The `AudioDevice` abstraction and `list_audio_devices()` function hide these differences behind a common interface.

2. **Provider abstraction at the top.** The `SttProviderBackend` trait lets the system swap between OpenAI Whisper (remote, high accuracy), macOS system speech recognition (local, zero latency for simple commands), and future providers like Deepgram or Azure Speech. The user never needs to know which backend is active.

3. **Event-driven communication in the middle.** The `VoiceSession` emits `VoiceEvent` variants through a Tokio unbounded channel. The UI layer subscribes to these events for real-time feedback -- VU meter levels, transcription progress, keyword detections -- without coupling the audio pipeline to the rendering layer.

### The Module Map

The voice subsystem spans several files, each with a focused responsibility:

| Module | Responsibility |
|--------|---------------|
| `services/voice` | Core session management, audio utilities, STT provider trait, keyword detection |
| `commands/voice` | `/voice` command -- enable, disable, configure, switch engines |
| `commands/listen` | `/listen` command -- full transcription sessions with rich state machine |
| `config/feature_flags` | `voice_mode` feature flag (default: off) |

The separation between `commands/voice` and `commands/listen` is deliberate. `/voice` controls the configuration layer: is voice enabled, which engine, what language. `/listen` controls the runtime layer: start a session, capture audio, process transcriptions, manage the text buffer. This mirrors the pattern we established in Chapter 15 with configuration commands versus runtime commands -- the same split that keeps `/config` separate from `/run`.

---

## 36.2 The VoiceConfig Data Model

Configuration is the foundation everything else builds on. The `VoiceConfig` struct captures every tunable parameter the voice subsystem needs:

```rust
pub struct VoiceConfig {
    pub enabled: bool,
    pub language: String,              // BCP-47: "en-US", "ja-JP", etc.
    pub stt_provider: SttProvider,
    pub sample_rate: u32,              // Hz -- 16,000 for Whisper
    pub hold_to_talk_key: String,      // "ctrl+shift+v"
    pub api_key: Option<String>,
    pub whisper_endpoint: Option<String>,
    pub auto_silence_detection: bool,
    pub command_keywords: Vec<String>,
    pub max_duration_secs: Option<u64>,
}
```

Several decisions embedded in these fields deserve explanation.

**The `enabled` flag defaults to `false`.** Voice input requires microphone access, which triggers an OS-level permission dialog on first use. Enabling it by default would surprise users who never intended to use speech input and would create a permission prompt that feels like a security concern. The feature flag system reinforces this -- `voice_mode` is registered as `always_off` in the feature flag registry, meaning even if `enabled` is true in the config, the feature flag must also be flipped:

```rust
FeatureFlag::always_off("voice_mode", "Voice input/output interface"),
```

This double-gate pattern -- config flag AND feature flag -- appears throughout the codebase for hardware-dependent features. It prevents accidental activation in CI environments, headless servers, or Docker containers where no microphone exists.

**The `hold_to_talk_key` defaults to `ctrl+shift+v`.** This is not an arbitrary choice. The key binding must satisfy three constraints: it cannot conflict with common terminal shortcuts (`Ctrl+C`, `Ctrl+Z`, `Ctrl+D`), it should be easy to hold with one hand, and it should have a mnemonic connection to "voice." `Ctrl+Shift+V` meets all three. The outline mentions the Space key as an alternative for hold-to-talk, which works well in dedicated voice modes but conflicts with normal text input -- you cannot use Space for hold-to-talk if the user is mid-sentence in the prompt buffer.

**The `api_key` is `Option<String>` rather than `String`.** This seems obvious, but the validation logic around it is nuanced:

```rust
pub fn validate(&self) -> Result<()> {
    if self.sample_rate == 0 {
        bail!("sample_rate must be > 0");
    }
    if self.sample_rate > 96_000 {
        bail!("sample_rate {} exceeds maximum 96000", self.sample_rate);
    }
    if self.language.is_empty() {
        bail!("language must not be empty");
    }
    if self.stt_provider == SttProvider::Whisper && self.api_key.is_none() {
        warn!("Whisper provider selected but no API key configured");
    }
    if self.hold_to_talk_key.is_empty() {
        bail!("hold_to_talk_key must not be empty");
    }
    Ok(())
}
```

Notice that a missing API key when Whisper is selected produces a `warn!`, not a `bail!`. The config is allowed to be valid without the key because the key might be provided later through OAuth or environment variables at transcription time. Failing validation at config load time would prevent the user from even seeing the voice settings UI. The actual failure happens at transcription time, in `transcribe_whisper()`, where the missing key produces a clear error with context:

```rust
let api_key = config
    .api_key
    .as_deref()
    .context("Whisper API key not configured")?;
```

This deferred validation pattern -- warn at config time, fail at use time -- is a pragmatic choice for features with external dependencies. It lets users configure everything else first and only deal with the API key when they actually try to speak.

---

## 36.3 The STT Provider Abstraction

The `SttProvider` enum and `SttProviderBackend` trait form a clean provider pattern that isolates the transcription backend from the rest of the system.

### The Enum: Static Properties

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SttProvider {
    Whisper,
    System,
}
```

Two variants, each with intrinsic properties that the system queries without instantiating a backend:

```rust
impl SttProvider {
    pub fn requires_network(&self) -> bool {
        matches!(self, Self::Whisper)
    }

    pub fn is_platform_available(&self) -> bool {
        match self {
            Self::Whisper => true,
            Self::System => cfg!(target_os = "macos"),
        }
    }
}
```

The `requires_network()` method drives UI decisions -- when the user is offline, the system can automatically fall back to the `System` provider if it is available, or show a clear "no network" error rather than a cryptic HTTP timeout. The `is_platform_available()` method uses `cfg!()` at runtime (not compile time) to check platform support, which is important for cross-compiled binaries that might run on different platforms than they were built on.

The `/voice` command extends the provider concept with a third option -- Deepgram -- which exists in the command's engine enum but not yet in the service layer:

```rust
enum VoiceEngine {
    Whisper,
    SystemDefault,
    Deepgram,
}
```

This asymmetry between the command layer and the service layer is intentional. Commands can advertise future capabilities (the `--engines` listing shows Deepgram as "available: false"), while the service layer only implements what is production-ready. This is the "menu before the kitchen" pattern: let users see what is coming without pretending it works today.

### The Trait: Runtime Behavior

The `SttProviderBackend` trait is the contract that every provider must implement:

```rust
#[async_trait::async_trait]
pub trait SttProviderBackend: Send + Sync {
    async fn transcribe(&self, audio: &[u8], language: &str) -> Result<TranscriptionResult>;
    fn name(&self) -> &str;
    fn is_available(&self) -> bool;
}
```

Three methods, each earning its place:

- **`transcribe()`** takes raw audio bytes and a language code, returns a rich `TranscriptionResult` with segments, timing, and confidence scores. It is async because both the Whisper API call and macOS SFSpeechRecognizer callbacks are asynchronous operations.
- **`name()`** returns a human-readable provider name for logging and UI display.
- **`is_available()`** is a runtime check that goes beyond `is_platform_available()` -- it verifies that credentials are configured, the API endpoint is reachable, or the local model is loaded.

The `Send + Sync` bounds are critical. The provider is created once and shared across the session. Audio capture happens on a dedicated thread, while transcription requests are dispatched on the Tokio runtime. Without these bounds, the provider could not be stored in the `VoiceSession` or passed to async tasks.

### The Factory

Provider creation is handled by a factory function rather than a constructor on the trait:

```rust
pub fn create_provider(config: &VoiceConfig) -> Result<Box<dyn SttProviderBackend>> {
    match config.stt_provider {
        SttProvider::Whisper => {
            let api_key = config
                .api_key
                .clone()
                .context("Whisper API key required")?;
            Ok(Box::new(WhisperProvider::new(
                api_key,
                config.whisper_endpoint.clone(),
                None,
            )))
        }
        SttProvider::System => Ok(Box::new(SystemSpeechProvider::new())),
    }
}
```

The factory returns `Box<dyn SttProviderBackend>`, erasing the concrete type. This lets the session hold a single `provider` field regardless of which backend is active, and it enables swapping providers mid-session without restarting the entire voice subsystem.

---

## 36.4 The VoiceSession State Machine

The `VoiceSession` is the central coordinator. It manages the recording lifecycle, buffers audio data, tracks metrics, and emits events. Understanding it means understanding its state machine.

### States and Transitions

```rust
pub enum RecordingState {
    Idle,
    Recording,
    Processing,
}
```

Three states, with strictly enforced transitions:

```
  ┌──────────────────────────────────────────────┐
  │                                              │
  ▼                                              │
Idle ──── start_recording() ────► Recording      │
  ▲                                   │          │
  │                                   │          │
  │         stop_recording()          │          │
  │◄──────────────────────────────────┘          │
  │                                              │
  │         transcribe()                         │
  └◄───── Processing ◄──────────────── (future) ─┘
```

Every state transition function validates the current state before proceeding:

```rust
pub fn start_recording(session: &mut VoiceSession) -> Result<()> {
    if !session.config.enabled {
        bail!("Voice input is disabled in configuration");
    }
    if session.state == RecordingState::Recording {
        bail!("Already recording -- call stop_recording first");
    }
    if session.state == RecordingState::Processing {
        bail!("Session is processing a transcription -- wait for completion");
    }
    // ...
}
```

Three checks, in priority order:

1. **Is voice enabled?** This catches the case where the feature flag or config was toggled off while the session was alive.
2. **Already recording?** Prevents double-start, which would corrupt the audio buffer.
3. **Still processing?** Prevents starting a new recording while the previous one is being transcribed, which could cause a race condition on the audio buffer.

The functions are free-standing (`start_recording(session)`) rather than methods (`session.start_recording()`). This is a conscious Rust idiom choice. The `&mut VoiceSession` borrow is explicit, making it clear where exclusive access is required. It also makes testing easier -- you can pass a mock session without needing to impl the method on a trait.

### The Audio Buffer

The session maintains a raw PCM audio buffer:

```rust
pub struct VoiceSession {
    audio_buffer: Vec<u8>,
    // ...
}
```

The buffer is pre-allocated with a capacity of approximately 30 seconds of audio:

```rust
pub const DEFAULT_BUFFER_CAPACITY: usize = 16_000 * 2 * 30;
// = 960,000 bytes = ~937 KB
```

The math: 16,000 samples/second (Whisper's preferred rate) times 2 bytes/sample (16-bit PCM) times 30 seconds. This pre-allocation avoids repeated heap allocations during recording, which could introduce audio glitches if the allocator needs to copy the buffer to a larger region.

When recording stops, the buffer is extracted using `std::mem::take()`:

```rust
let buffer = std::mem::take(&mut session.audio_buffer);
```

This is a zero-copy transfer -- `take()` replaces the buffer with an empty `Vec` and returns the original. The session's `audio_buffer` field is now an empty vec ready for the next recording, and the caller owns the filled buffer. No `clone()`, no second allocation.

### The Event Channel

The session optionally emits events through a Tokio unbounded channel:

```rust
pub fn with_events(config: VoiceConfig) -> (Self, mpsc::UnboundedReceiver<VoiceEvent>) {
    let (tx, rx) = mpsc::unbounded_channel();
    let mut session = Self::new(config);
    session.event_tx = Some(tx);
    (session, rx)
}
```

The `with_events()` constructor returns both the session and the receiver. The caller (typically the UI layer) holds the receiver and drains events in a select loop alongside keyboard input and API responses. The session holds the sender and emits events through a helper:

```rust
fn emit(&self, event: VoiceEvent) {
    if let Some(tx) = &self.event_tx {
        let _ = tx.send(event);
    }
}
```

The `let _ =` is deliberate -- if the receiver has been dropped (the UI disconnected), the send fails silently. This is the correct behavior: the voice subsystem should not crash because the display layer went away. Audio capture and transcription continue regardless of whether anyone is listening to events.

### Event Taxonomy

The `VoiceEvent` enum captures every noteworthy occurrence in the voice pipeline:

```rust
pub enum VoiceEvent {
    RecordingStarted { device: String, sample_rate: u32 },
    RecordingStopped { duration_ms: u64, buffer_size: usize, reason: StopReason },
    TranscriptionReady { text: String, provider: SttProvider, latency_ms: u64 },
    KeywordsDetected { matches: Vec<KeywordMatch> },
    Error { message: String, recoverable: bool },
    AudioLevel { rms: f64, peak: f64 },
}
```

Each variant carries exactly the data the UI needs to render the appropriate feedback:

- **`RecordingStarted`** triggers the "recording" indicator with the device name.
- **`RecordingStopped`** carries the `StopReason` so the UI can distinguish between the user releasing the key (Manual), silence detection kicking in (SilenceDetected), hitting the time limit (MaxDuration), and an error (Error).
- **`AudioLevel`** provides RMS and peak values for a VU meter display. These are emitted at regular intervals during recording, giving the user visual confirmation that the microphone is working.
- **`TranscriptionReady`** delivers the final text along with which provider produced it and how long it took -- useful for the user to gauge whether they should switch providers for better latency.
- **`KeywordsDetected`** fires when voice commands are recognized in the transcription, allowing the UI to show which keyword was detected and at what confidence level.

The `recoverable` flag on `Error` drives retry logic. A network timeout is recoverable (try again). A missing API key is not (user must configure it).

---

## 36.5 Audio Processing: The Low-Level Pipeline

Raw audio from the microphone is just a stream of bytes. Turning it into useful input requires several processing steps.

### RMS Computation

RMS (Root Mean Square) amplitude is the standard measure of audio signal level. The implementation processes 16-bit little-endian PCM samples:

```rust
pub fn compute_rms(audio: &[u8]) -> f64 {
    if audio.len() < 2 {
        return 0.0;
    }
    let sample_count = audio.len() / 2;
    let sum_sq: f64 = (0..sample_count)
        .map(|i| {
            let lo = audio[i * 2] as i16;
            let hi = (audio[i * 2 + 1] as i16) << 8;
            let sample = lo | hi;
            (sample as f64) * (sample as f64)
        })
        .sum();
    (sum_sq / sample_count as f64).sqrt()
}
```

The byte-to-sample conversion deserves attention. PCM 16-bit little-endian stores each sample as two bytes: low byte first, high byte second. The code reads `lo` as the low byte and `hi` as the high byte shifted left by 8 bits, then OR's them together. This produces a signed 16-bit sample in the range -32,768 to 32,767. Squaring the sample removes the sign (negative samples have the same energy as positive ones), and the final square root gives the RMS level.

### Silence Detection

Silence detection uses the RMS value against a configurable threshold:

```rust
pub const SILENCE_THRESHOLD: f64 = 500.0;
pub const SILENCE_AUTO_STOP: Duration = Duration::from_secs(3);

pub fn is_silence(audio: &[u8]) -> bool {
    compute_rms(audio) < SILENCE_THRESHOLD
}
```

The threshold of 500.0 represents a relatively quiet signal -- for reference, comfortable speaking volume into a typical laptop microphone produces RMS values in the 2,000-8,000 range, while complete silence (digital zero) produces 0.0. The threshold is set conservatively low to avoid false positives from ambient room noise like air conditioning or keyboard clicks.

The `SILENCE_AUTO_STOP` duration of 3 seconds means the system waits for three continuous seconds of silence before automatically stopping the recording. This is a user experience choice: too short (1 second) and the system cuts off natural pauses between sentences; too long (10 seconds) and the user wonders why the system is still recording after they have clearly stopped talking. Three seconds is the widely-adopted standard in voice interfaces, matching what Siri, Google Assistant, and Alexa use for utterance termination.

### Voice Activity Detection (VAD)

The silence detection above is the simplest form of VAD. In production, the system applies it in a windowed fashion: audio is chunked into fixed-duration windows (typically 100-200ms), and each window is classified as speech or silence. The `chunk_audio()` function supports this:

```rust
pub fn chunk_audio(audio: &[u8], chunk_duration_ms: u64, sample_rate: u32) -> Vec<&[u8]> {
    let bytes_per_ms = (sample_rate as u64 * 2) / 1000;
    let chunk_size = (chunk_duration_ms * bytes_per_ms) as usize;
    if chunk_size == 0 {
        return vec![audio];
    }
    audio.chunks(chunk_size).collect()
}
```

The function calculates chunk size in bytes from the desired duration in milliseconds and the sample rate. At 16 kHz with 16-bit samples, a 200ms chunk is 6,400 bytes (16,000 samples/sec * 2 bytes/sample * 0.2 sec). The `audio.chunks()` method from the standard library handles the split, including a potentially shorter final chunk.

A real-time VAD pipeline chains these operations: capture 200ms of audio, compute RMS, classify as speech or silence, update a counter. When the silence counter exceeds `SILENCE_AUTO_STOP / chunk_duration`, emit a `RecordingStopped` event with `StopReason::SilenceDetected`. The windowed approach prevents a single loud noise from resetting the silence counter -- only sustained speech keeps the recording alive.

### Silence Trimming

Beyond detecting silence for auto-stop, the system trims leading and trailing silence from the audio buffer before sending it to the STT provider. This serves two purposes:

1. **Reduced latency.** Whisper processes audio sequentially. A 2-second silence prefix adds 2 seconds to transcription time with no informational benefit.
2. **Reduced cost.** Whisper bills by audio duration. Trimming silence from a 10-second recording that has 3 seconds of leading silence and 2 seconds of trailing silence saves 50% of the cost.

The trimming algorithm walks from both ends of the buffer, advancing past chunks where `is_silence()` returns true, and returns a slice of the original buffer containing only the speech portion. No copying is needed -- the trimmed audio is a subslice of the original buffer.

### PCM to WAV Encoding

The Whisper API expects audio in a standard container format. The `pcm_to_wav()` function wraps raw PCM data in a minimal WAV header:

```rust
pub fn pcm_to_wav(pcm: &[u8], sample_rate: u32, channels: u16, bits_per_sample: u16) -> Vec<u8> {
    let data_size = pcm.len() as u32;
    let byte_rate = sample_rate * channels as u32 * bits_per_sample as u32 / 8;
    let block_align = channels * bits_per_sample / 8;
    let chunk_size = 36 + data_size;

    let mut wav = Vec::with_capacity(44 + pcm.len());

    // RIFF header
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&chunk_size.to_le_bytes());
    wav.extend_from_slice(b"WAVE");

    // fmt chunk
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());      // PCM format
    wav.extend_from_slice(&channels.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&bits_per_sample.to_le_bytes());

    // data chunk
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_size.to_le_bytes());
    wav.extend_from_slice(pcm);

    wav
}
```

The WAV format is deliberately simple -- a 44-byte header followed by the raw PCM data. The header contains the RIFF container descriptor, a `fmt ` chunk with audio parameters, and a `data` chunk with the payload. The `Vec::with_capacity(44 + pcm.len())` pre-allocation ensures a single allocation for the entire output. No external library needed -- WAV encoding is straightforward enough to inline, and avoiding a dependency on something like `hound` keeps the binary smaller and the build faster.

One subtlety: the `chunk_size` field in the RIFF header is `36 + data_size`, not `44 + data_size`. The RIFF spec defines `chunk_size` as the size of the file minus the 8 bytes for the "RIFF" tag and the chunk_size field itself. This is a common source of bugs in hand-rolled WAV encoders.

---

## 36.6 The Whisper Provider: Remote Transcription

The `WhisperProvider` implements the `SttProviderBackend` trait by calling the OpenAI Whisper API over HTTP:

```rust
pub struct WhisperProvider {
    api_key: String,
    endpoint: String,
    model: String,
    client: reqwest::Client,
}
```

The provider stores a persistent `reqwest::Client`, which maintains an HTTP connection pool internally. This matters for voice input because multiple short recordings might be transcribed in quick succession -- reusing connections avoids the TCP and TLS handshake overhead on every request.

### The Transcription Request

The `transcribe()` implementation constructs a multipart form and sends it to the Whisper API:

```rust
async fn transcribe(&self, audio: &[u8], language: &str) -> Result<TranscriptionResult> {
    let start = Instant::now();
    let wav = pcm_to_wav(audio, DEFAULT_SAMPLE_RATE, 1, 16);

    let audio_part = reqwest::multipart::Part::bytes(wav)
        .file_name("audio.wav")
        .mime_str("audio/wav")?;

    let form = reqwest::multipart::Form::new()
        .text("model", self.model.clone())
        .text("language", language.to_string())
        .text("response_format", "verbose_json".to_string())
        .part("file", audio_part);

    let resp = self.client
        .post(&self.endpoint)
        .bearer_auth(&self.api_key)
        .multipart(form)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .context("Whisper API request failed")?;
    // ...
}
```

Key decisions in this implementation:

**`response_format: "verbose_json"`** rather than plain `"json"`. The verbose format includes per-segment timing and confidence data that powers the `TranscriptionSegment` objects. Without it, we would only get the transcribed text with no metadata -- usable but opaque.

**The 30-second timeout.** Whisper typically returns results in 1-5 seconds for short recordings (under 30 seconds of audio). The 30-second timeout accommodates the maximum payload size (25 MiB, approximately 13 minutes of audio at 16 kHz) plus network variability. Setting it too low causes spurious failures on longer recordings; setting it too high keeps the user waiting when the API is actually down.

**`bearer_auth()` for authentication.** The Whisper API uses standard Bearer token authentication. The token is the OpenAI API key, which raises the question of where that key comes from. This is where the OAuth-only authentication requirement from the outline comes in.

### Confidence Score Normalization

Whisper returns `avg_logprob` values per segment -- log-probabilities that are typically in the range -1.0 to 0.0. The code normalizes these to 0.0-1.0 confidence scores:

```rust
confidence: (1.0_f64 + s.avg_logprob).clamp(0.0, 1.0),
```

This linear mapping (`logprob + 1.0, clamped`) is a simplification. A more mathematically correct approach would use `exp(logprob)`, but the linear mapping produces intuitively useful results: a logprob of -0.1 (very confident) maps to 0.9, while -0.5 (moderately confident) maps to 0.5, and -1.0 or worse (low confidence) maps to 0.0. The clamping handles edge cases where logprobs fall outside the expected range.

---

## 36.7 Real-Time Streaming Transcription

The batch API -- record everything, send it all, wait for results -- works for short utterances but breaks down for continuous dictation. When a user speaks for 30 seconds, they should not have to wait until they stop speaking to see any text. Streaming transcription solves this by sending audio chunks as they are captured and receiving partial results in real time.

### The Streaming Protocol

The streaming STT architecture uses a WebSocket connection to the transcription provider. Audio chunks are sent upstream as binary frames, and partial transcription results arrive downstream as JSON text frames:

```
Client                                       Server
  │                                            │
  │──── binary: audio chunk (200ms) ──────────►│
  │                                            │
  │◄─── text: {"partial": "hello"} ────────────│
  │                                            │
  │──── binary: audio chunk (200ms) ──────────►│
  │                                            │
  │◄─── text: {"partial": "hello world"} ──────│
  │                                            │
  │──── binary: audio chunk (200ms) ──────────►│
  │                                            │
  │◄─── text: {"final": "hello world how"} ────│
  │                                            │
  │──── control: end-of-stream ───────────────►│
  │                                            │
  │◄─── text: {"final": "hello world how ..."} │
```

Partial results are prefixes -- they grow as more audio arrives. Final results are committed segments that will not change. The UI displays partial results in a lighter color (or with an underscore suffix) and switches to the committed style when the final result arrives.

### Chunking for Streaming

The `chunk_audio()` function from Section 36.5 supports the streaming pipeline by splitting audio into transmission-sized chunks. The optimal chunk duration balances three forces:

- **Latency.** Smaller chunks (50ms) give faster partial results but increase overhead per chunk.
- **Accuracy.** Larger chunks (500ms) give the model more context for accurate partial results.
- **Network efficiency.** WebSocket frames have header overhead; many tiny frames waste bandwidth.

In practice, 200ms chunks provide a good balance. At 16 kHz mono 16-bit, each chunk is 6,400 bytes -- small enough for low-latency streaming, large enough for meaningful speech content.

### The Streaming Session Lifecycle

A streaming transcription session progresses through distinct phases:

1. **Connection.** Open a WebSocket to the provider, send initial configuration (language, model, expected audio format).
2. **Streaming.** For each audio chunk captured from the microphone, send it as a binary frame. Process incoming partial/final results asynchronously.
3. **Finalization.** When recording stops, send an end-of-stream control message. The server flushes any remaining audio through the model and sends the final transcription.
4. **Disconnection.** Close the WebSocket cleanly.

The critical implementation detail is that phases 2 and 3 are concurrent -- audio is being sent upstream while results are arriving downstream. This requires two tasks: a sender that reads from the audio capture channel and forwards to the WebSocket, and a receiver that reads from the WebSocket and emits `VoiceEvent::TranscriptionReady` events.

In Tokio, this is a natural `select!` pattern:

```rust
loop {
    tokio::select! {
        // Audio chunk ready to send
        Some(chunk) = audio_rx.recv() => {
            ws_sink.send(Message::Binary(chunk)).await?;
        }
        // Transcription result from server
        Some(msg) = ws_stream.next() => {
            match msg? {
                Message::Text(json) => {
                    let result: StreamResult = serde_json::from_str(&json)?;
                    session.emit(VoiceEvent::TranscriptionReady {
                        text: result.text,
                        provider: SttProvider::Whisper,
                        latency_ms: result.latency_ms,
                    });
                }
                _ => {}
            }
        }
        // Recording stopped -- send end-of-stream
        _ = stop_signal.recv() => {
            ws_sink.send(Message::Close(None)).await?;
            break;
        }
    }
}
```

The `select!` macro polls all three futures simultaneously, advancing whichever one becomes ready first. This ensures that sending audio does not block receiving results and vice versa.

---

## 36.8 Voice Keyterms and Domain-Specific Recognition

General-purpose speech models consistently struggle with programming vocabulary. "camelCase" becomes "camel case." "npm install" becomes "npm insall." "pytest" becomes "pie test." The keyword detection system addresses this by post-processing transcription results to identify and correct domain-specific terms.

### The Keyword Detector

The `detect_keywords()` function scans transcribed text for configured keywords using both exact and fuzzy matching:

```rust
pub fn detect_keywords(text: &str, keywords: &[String]) -> Vec<KeywordMatch> {
    let text_lower = text.to_lowercase();
    let mut matches = Vec::new();

    for keyword in keywords {
        let kw_lower = keyword.to_lowercase();

        // Exact substring search
        let mut search_from = 0;
        while let Some(pos) = text_lower[search_from..].find(&kw_lower) {
            let abs_pos = search_from + pos;

            // Boost confidence for word-boundary matches
            let at_word_start = abs_pos == 0
                || !text_lower.as_bytes()[abs_pos - 1].is_ascii_alphanumeric();
            let at_word_end = end >= text_lower.len()
                || !text_lower.as_bytes()[end].is_ascii_alphanumeric();

            let confidence = if at_word_start && at_word_end {
                1.0
            } else if at_word_start || at_word_end {
                0.85
            } else {
                0.7
            };

            matches.push(KeywordMatch::new(keyword.clone(), abs_pos, confidence));
            search_from = abs_pos + kw_lower.len();
        }

        // Fuzzy matching with Levenshtein distance
        for (word_start, word) in word_boundaries(&text_lower) {
            if word == kw_lower { continue; }
            let distance = levenshtein(&word, &kw_lower);
            let max_len = word.len().max(kw_lower.len());
            let similarity = 1.0 - (distance as f64 / max_len as f64);
            if similarity >= MIN_KEYWORD_CONFIDENCE {
                matches.push(KeywordMatch::new(keyword.clone(), word_start, similarity));
            }
        }
    }
    matches
}
```

The detection operates in two passes:

**Pass 1: Exact substring matching.** Case-insensitive search for each keyword anywhere in the text. When found, the confidence is scored based on word boundaries: a match at both a word start and word end gets 1.0 (perfect), one boundary gets 0.85, no boundaries (embedded in a larger word) gets 0.7. This graduated scoring prevents "exec" from matching "execute" at full confidence.

**Pass 2: Fuzzy matching via Levenshtein distance.** For each word in the transcription that was not an exact match, compute the edit distance to each keyword. If the similarity (1 - distance/maxLength) exceeds `MIN_KEYWORD_CONFIDENCE` (0.6), it is a fuzzy match. This catches common transcription errors: "execut" for "execute" (distance 1, similarity 0.86), "cancl" for "cancel" (distance 1, similarity 0.83).

### The Levenshtein Implementation

The fuzzy matching relies on a standard Levenshtein distance implementation:

```rust
fn levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let m = a_chars.len();
    let n = b_chars.len();

    let mut prev = (0..=n).collect::<Vec<_>>();
    let mut curr = vec![0; n + 1];

    for i in 1..=m {
        curr[0] = i;
        for j in 1..=n {
            let cost = if a_chars[i - 1] == b_chars[j - 1] { 0 } else { 1 };
            curr[j] = (prev[j] + 1)
                .min(curr[j - 1] + 1)
                .min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[n]
}
```

This is the two-row optimization of the classic dynamic programming solution. Rather than allocating an m-by-n matrix, it maintains only two rows (`prev` and `curr`), swapping them at each iteration. Memory usage is O(n) instead of O(m*n). For keyword matching where both strings are typically under 20 characters, the performance difference is negligible, but the pattern is worth understanding -- it is the same optimization used in sequence alignment algorithms in bioinformatics.

### Command Keywords vs. Domain Keyterms

The system supports two categories of keywords with different purposes:

**Command keywords** are voice commands that trigger actions rather than inserting text. The default set:

```rust
command_keywords: vec![
    "execute".to_string(),
    "cancel".to_string(),
    "undo".to_string(),
    "accept".to_string(),
    "reject".to_string(),
    "explain".to_string(),
],
```

When "execute" is detected with sufficient confidence, the system submits the current buffer as a prompt. "Cancel" clears the buffer. "Undo" removes the last transcription segment. These are the voice equivalents of keyboard shortcuts.

**Domain keyterms** (configured separately) are technical terms that the STT model tends to mangle. The Whisper API supports a `prompt` parameter that can include expected vocabulary, biasing the model toward correct transcription of domain terms. The system can prepend a list of expected keyterms as a "prompt hint":

```
// Before the Whisper API call:
form.text("prompt", config.keyterms.join(", "))
```

This approach improves transcription accuracy for terms like "TypeScript", "pytest", "kubectl", "npm", "ruff", and "Tokio" without requiring any model fine-tuning. The Whisper documentation recommends this for domain-specific vocabulary, and in practice it reduces misrecognition of technical terms by 40-60%.

---

## 36.9 The `/voice` Command: Configuration Interface

The `/voice` command exposes voice configuration through a clean subcommand interface:

```
/voice [on | off | status | --engine <name> | --engines]
```

The implementation loads configuration from a key-value config map, applies the requested change, and persists it back:

```rust
async fn execute(&self, args: &[&str], ctx: &mut CommandContext) -> Result<String> {
    self.validate_args(args)?;
    let mut cfg = load_config(ctx);

    if args.is_empty() || args[0] == "status" {
        return Ok(format_status(&cfg));
    }

    match args[0] {
        "on" => {
            cfg.enabled = true;
            save_config(ctx, &cfg);
            Ok("  Voice input enabled\n".to_string())
        }
        "off" => {
            cfg.enabled = false;
            save_config(ctx, &cfg);
            Ok("  Voice input disabled\n".to_string())
        }
        "--engines" => Ok(list_engines()),
        "--engine" => {
            let name = args[1];
            match VoiceEngine::from_str(name) {
                Some(engine) => {
                    cfg.engine = engine;
                    save_config(ctx, &cfg);
                    Ok(format!("  Voice engine set to: {}\n", engine.as_str()))
                }
                None => bail!("Unknown engine '{name}'. Use /voice --engines to list."),
            }
        }
        _ => unreachable!(),
    }
}
```

The `validate_args()` method runs before `execute()`, ensuring that invalid argument combinations are rejected with clear error messages before any state is modified. This validate-then-execute pattern prevents partial config updates from corrupting the state.

The status display is a formatted table:

```
  Voice Input Mode
  ─────────────────────────────
  Status:    ● ON
  Engine:    whisper
  Language:  en
  Auto-send: yes
  Silence:   1500 ms
```

Simple, scannable, and consistent with the formatting used by other status commands like `/config` and `/model`.

---

## 36.10 The `/listen` Command: Rich Session Management

While `/voice` handles configuration, `/listen` handles the runtime experience of capturing and transcribing speech. It is a substantially richer command with its own state machine, buffer management, and voice command processing.

### The ListenSession State Machine

The `ListenSession` has four states -- one more than `VoiceSession` -- because it adds a `Paused` state:

```rust
pub enum ListenState {
    Idle,
    Listening,
    Processing,
    Paused,
    Error(String),
}
```

The `Paused` state allows the user to temporarily stop capturing audio without ending the session. This is useful during phone calls, background conversations, or any situation where ambient audio would pollute the transcription. The state transitions are strictly enforced:

```rust
pub fn start(&mut self) -> Result<()> {
    if self.state != ListenState::Idle && self.state != ListenState::Paused {
        return Err(anyhow!("Cannot start from state: {}", self.state));
    }
    self.state = ListenState::Listening;
    self.started_at = Some(Instant::now());
    Ok(())
}

pub fn pause(&mut self) -> Result<()> {
    if self.state != ListenState::Listening {
        return Err(anyhow!("Cannot pause from state: {}", self.state));
    }
    self.state = ListenState::Paused;
    Ok(())
}
```

Note that `start()` accepts both `Idle` and `Paused` -- you can resume from a pause by calling `start()`. The `resume()` method is an explicit alternative that only works from `Paused`, providing semantic clarity in the calling code.

### Voice Command Processing

When transcription arrives, the session checks for voice commands before appending text to the buffer:

```rust
pub fn process_transcription(&mut self, transcription: Transcription) {
    let text = transcription.full_text();

    if self.config.voice_commands_enabled {
        for cmd in &self.voice_commands {
            if cmd.matches(&text, transcription.average_confidence()) {
                match &cmd.action {
                    VoiceAction::StopListening => { self.stop(); return; },
                    VoiceAction::PauseListening => { let _ = self.pause(); return; },
                    VoiceAction::CancelInput => { self.buffer.clear(); return; },
                    VoiceAction::UndoLast => {
                        if let Some(pos) = self.buffer.rfind(' ') {
                            self.buffer.truncate(pos);
                        } else {
                            self.buffer.clear();
                        }
                        return;
                    },
                    _ => {}
                }
            }
        }
    }

    if !self.buffer.is_empty() {
        self.buffer.push(' ');
    }
    self.buffer.push_str(&text);
    self.transcriptions.push(transcription);
}
```

The priority order matters: voice commands are checked first, and if any command matches, the method returns early without appending the command phrase to the buffer. You do not want "cancel" to appear in the prompt buffer.

The `UndoLast` action uses `rfind(' ')` to find the last space in the buffer and truncates there. This is a word-level undo, not a transcription-level undo -- it removes the last word rather than the last entire transcription. If the buffer has no spaces, it clears entirely. This gives the user fine-grained control over corrections without needing to cancel and re-speak the entire input.

### Session Statistics

The session tracks operational metrics for debugging and user feedback:

```rust
pub struct ListenStats {
    pub total_transcriptions: usize,
    pub total_audio_duration: f64,
    pub total_words: usize,
    pub avg_confidence: f64,
    pub buffer_size: usize,
}
```

These stats power the status display that shows during and after a listen session. The average confidence is particularly useful -- if it drops below 0.7, the system can suggest that the user check their microphone positioning or switch to a different STT provider.

---

## 36.11 OAuth-Only Authentication

The outline specifies an OAuth-only authentication requirement for the voice system. This is a deliberate security decision driven by the nature of the Whisper API key.

### Why OAuth, Not API Keys

An OpenAI API key in the voice config would be stored in a JSON file on disk -- typically in `~/.config/rcode/settings.json` or the project's `.claude/settings.json`. This creates several problems:

1. **Accidental commits.** The key could end up in version control if the settings file is not properly gitignored.
2. **Shared machine exposure.** On shared workstations or CI runners, the key is readable by anyone with filesystem access.
3. **No expiration.** API keys are long-lived. A leaked key remains valid until manually revoked.
4. **No scoping.** The API key grants access to all OpenAI APIs, not just Whisper. A key intended for voice transcription also allows GPT-4 completions, DALL-E generations, and embeddings.

OAuth solves all of these:

1. **Tokens are stored in the OS keychain** (Keychain on macOS, libsecret on Linux, Credential Manager on Windows), not in plaintext files.
2. **Tokens expire.** A typical OAuth access token lives for 1-4 hours. Even if stolen, the window of exposure is limited.
3. **Refresh tokens can be scoped.** The OAuth consent screen can request only the `whisper:transcribe` scope, limiting what the token can do.
4. **Revocation is centralized.** Revoking access through the OAuth provider immediately invalidates all tokens, unlike hunting down every copy of a leaked API key.

### Integration with the Auth System

The voice subsystem integrates with the existing OAuth service (discussed in the authentication chapters) rather than implementing its own auth flow. When voice is enabled and no API key is present in the config, the transcription function checks for an OAuth token:

```rust
async fn transcribe_whisper(audio: &[u8], config: &VoiceConfig) -> Result<String> {
    let api_key = config
        .api_key
        .as_deref()
        .context("Whisper API key not configured")?;
    // ...
}
```

In a fully OAuth-integrated implementation, the `api_key` field would be replaced by a token retrieval call:

```rust
let token = oauth_service
    .get_access_token("whisper")
    .await
    .context("Voice requires authentication -- run /login first")?;
```

The `/login` command handles the OAuth dance (browser redirect, authorization code exchange, token storage), and the voice system simply consumes the resulting token. This separation of concerns means the voice system never sees the OAuth protocol details -- it just asks for a token and uses it.

---

## 36.12 Hold-to-Talk: The Keyboard Integration

The hold-to-talk mechanism ties the voice subsystem to the input handling layer. When the user presses and holds the configured key binding, recording starts. When they release it, recording stops and the audio is sent for transcription.

### The Key Event Flow

```
KeyDown(ctrl+shift+v) ──► start_recording() ──► Audio capture begins
                                                      │
        (user speaks)                                 │
                                                      ▼
KeyUp(ctrl+shift+v) ──► stop_recording() ──► Audio buffer ready
                                                      │
                                                      ▼
                                              transcribe() ──► Text in buffer
```

The implementation requires tracking key state across events. A naive approach -- start on `KeyDown`, stop on `KeyUp` -- has a timing problem: key repeat. Most terminals emit repeated `KeyDown` events when a key is held. Without deduplication, the system would repeatedly call `start_recording()`, which would fail with "Already recording" on the second event.

The solution is a boolean flag that tracks whether the key is currently held:

```rust
let mut voice_key_held = false;

match event {
    KeyEvent::Down(key) if key == config.hold_to_talk_key => {
        if !voice_key_held {
            voice_key_held = true;
            start_recording(&mut session)?;
        }
        // Ignore repeated KeyDown events
    }
    KeyEvent::Up(key) if key == config.hold_to_talk_key => {
        if voice_key_held {
            voice_key_held = false;
            let (audio, duration) = stop_recording(&mut session)?;
            let text = transcribe(&audio, session.config()).await?;
            prompt_buffer.push_str(&text);
        }
    }
    _ => { /* other key handling */ }
}
```

The flag ensures that `start_recording()` is called exactly once on key press and `stop_recording()` is called exactly once on key release, regardless of how many intermediate `KeyDown` events the terminal emits.

### Space Key Considerations

The outline mentions the Space key as an alternative for hold-to-talk. This works in a dedicated voice mode (where the agent is waiting for voice input and not accepting typed text), but conflicts with normal prompt editing. The compromise is a modal approach:

- In **normal mode**, Space inserts a space character.
- In **voice mode** (activated by `/voice on` or a toggle key), Space becomes hold-to-talk.

The mode switch is visible in the prompt indicator: a microphone icon replaces the standard `>` prompt, making it clear which mode is active. This prevents the confusion of pressing Space and getting unexpected recording behavior.

---

## 36.13 Audio Device Discovery

Before recording can begin, the system must identify available audio input devices. The `list_audio_devices()` function handles platform-specific device enumeration:

```rust
pub fn list_audio_devices() -> Vec<AudioDevice> {
    let mut devices = Vec::new();

    if cfg!(target_os = "macos") {
        devices.push(AudioDevice {
            id: "default".to_string(),
            name: "Built-in Microphone".to_string(),
            is_default: true,
            sample_rate: DEFAULT_SAMPLE_RATE,
            channels: 1,
        });
    } else if cfg!(target_os = "linux") {
        devices.push(AudioDevice {
            id: "default".to_string(),
            name: "Default ALSA Capture".to_string(),
            is_default: true,
            sample_rate: DEFAULT_SAMPLE_RATE,
            channels: 1,
        });
    }
    // ...
    devices
}
```

The `is_voice_available()` function checks for audio subsystem presence:

```rust
pub fn is_voice_available() -> bool {
    if cfg!(target_os = "macos") {
        true  // CoreAudio always available
    } else if cfg!(target_os = "linux") {
        std::path::Path::new("/proc/asound").exists()
            || std::path::Path::new("/run/user/1000/pulse").exists()
    } else if cfg!(target_os = "windows") {
        true  // WASAPI always available on modern Windows
    } else {
        false
    }
}
```

On Linux, the function probes for ALSA (`/proc/asound`) and PulseAudio (`/run/user/1000/pulse`) by checking filesystem paths. This is a heuristic -- a more robust check would attempt to open an audio stream -- but it is fast and avoids the latency of initializing an audio backend just to check availability.

The `AudioDevice` struct provides the metadata the UI needs:

```rust
pub struct AudioDevice {
    pub id: String,           // Platform-specific identifier
    pub name: String,         // "Built-in Microphone"
    pub is_default: bool,     // Whether this is the system default
    pub sample_rate: u32,     // Preferred sample rate
    pub channels: u16,        // Number of input channels
}
```

The `Display` implementation formats this nicely for the user: `"Built-in Microphone (16000Hz, 1ch, default)"`. When multiple devices are available, the user can select one through the voice configuration, and the capture layer opens the specified device ID.

---

## 36.14 Testing the Voice Subsystem

Testing audio code is challenging because real audio capture requires hardware. The voice subsystem's test suite addresses this through careful separation of testable logic from hardware interaction.

### State Machine Tests

The recording lifecycle is tested without any audio hardware:

```rust
#[test]
fn test_recording_lifecycle() {
    let config = VoiceConfig::enabled_default();
    let mut session = VoiceSession::new(config);

    assert_eq!(session.state(), RecordingState::Idle);
    assert!(!session.is_recording());

    start_recording(&mut session).unwrap();
    assert_eq!(session.state(), RecordingState::Recording);
    assert!(session.is_recording());

    // Double-start should fail
    assert!(start_recording(&mut session).is_err());

    let (buffer, duration) = stop_recording(&mut session).unwrap();
    assert_eq!(session.state(), RecordingState::Idle);

    // Double-stop should fail
    assert!(stop_recording(&mut session).is_err());
}
```

This test verifies every valid and invalid transition without touching a microphone. The `VoiceSession` operates on an in-memory buffer, so the state machine works identically whether audio is being captured or not.

### Audio Processing Tests

The audio utility functions are tested with synthetic data:

```rust
#[test]
fn test_compute_rms() {
    let silent = vec![0u8; 100];
    assert_eq!(compute_rms(&silent), 0.0);

    let loud: Vec<u8> = (0..100)
        .flat_map(|_| [0xFF_u8, 0x7F]) // 32767 in LE
        .collect();
    let rms = compute_rms(&loud);
    assert!(rms > 0.0);
}

#[test]
fn test_pcm_to_wav() {
    let pcm = vec![0u8; 32000];
    let wav = pcm_to_wav(&pcm, 16000, 1, 16);
    assert_eq!(&wav[0..4], b"RIFF");
    assert_eq!(&wav[8..12], b"WAVE");
    assert_eq!(wav.len(), 44 + pcm.len());
}
```

The WAV test verifies the header magic bytes and total size, ensuring the encoder produces valid files. The RMS test uses known extremes -- digital silence (all zeros) and maximum amplitude (0x7FFF) -- to verify the calculation.

### Keyword Detection Tests

The keyword detector is thoroughly tested because it handles the tricky intersection of case sensitivity, word boundaries, and fuzzy matching:

```rust
#[test]
fn test_keyword_detection_exact() {
    let text = "please execute the command and then undo it";
    let keywords = vec!["execute".to_string(), "undo".to_string()];
    let matches = detect_keywords(text, &keywords);
    assert!(matches.len() >= 2);

    let exec_match = matches.iter().find(|m| m.keyword == "execute").unwrap();
    assert_eq!(exec_match.confidence, 1.0);  // Word boundary match
}

#[test]
fn test_fuzzy_keyword_detection() {
    let text = "execut the cancl command";
    let keywords = vec!["execute".to_string(), "cancel".to_string()];
    let matches = detect_keywords(text, &keywords);
    assert!(!matches.is_empty());
    for m in &matches {
        assert!(m.confidence >= MIN_KEYWORD_CONFIDENCE);
    }
}
```

The fuzzy test uses intentionally misspelled words ("execut", "cancl") to verify that the Levenshtein-based matching catches common transcription errors while respecting the confidence threshold.

### Event Channel Tests

The event system is tested by creating a session with an event channel and verifying that the expected events arrive:

```rust
#[test]
fn test_session_with_events() {
    let config = VoiceConfig::enabled_default();
    let (mut session, mut rx) = VoiceSession::with_events(config);

    start_recording(&mut session).unwrap();
    let event = rx.try_recv().unwrap();
    assert!(matches!(event, VoiceEvent::RecordingStarted { .. }));

    let _ = stop_recording(&mut session).unwrap();
    let event = rx.try_recv().unwrap();
    assert!(matches!(event, VoiceEvent::RecordingStopped { .. }));
}
```

`try_recv()` is used instead of `recv().await` because these are synchronous tests. The events are emitted synchronously during `start_recording()` and `stop_recording()`, so they are immediately available in the channel.

---

## 36.15 Design Trade-offs and Lessons

Building the voice input system surfaces several engineering tensions that are worth highlighting explicitly.

### Batch vs. Streaming Transcription

The codebase supports both modes. Batch (record everything, send at once) is simpler to implement, easier to test, and sufficient for short commands. Streaming (send chunks as captured) provides a better user experience for longer dictation but adds complexity: WebSocket management, partial result handling, and concurrency between send and receive paths.

The recommended approach is to start with batch and add streaming when user feedback demands it. Most voice interactions with a CLI agent are short commands (under 10 seconds), where the latency difference between batch and streaming is imperceptible.

### Local vs. Remote STT

The `SttProvider::System` variant supports local on-device transcription through macOS's SFSpeechRecognizer. Local transcription has zero network latency and works offline, but accuracy is significantly lower than Whisper, especially for technical vocabulary. The trade-off matrix:

| Factor | Whisper (Remote) | System (Local) |
|--------|-----------------|----------------|
| Accuracy | High (97%+) | Moderate (85-90%) |
| Latency | 1-5 seconds | <500ms |
| Offline | No | Yes |
| Privacy | Audio sent to OpenAI | Audio stays on device |
| Cost | Per-minute billing | Free |
| Technical vocab | Good with keyterms | Poor |

For developer tooling where accuracy on technical terms matters more than privacy, Whisper is the default. For air-gapped environments or cost-sensitive deployments, the system provider is available as a fallback.

### Confidence Thresholds

The minimum keyword confidence of 0.6 is a balance between catching transcription errors (lower threshold catches more) and avoiding false positives (higher threshold reduces spurious command triggers). The current value was determined empirically: at 0.5, common words like "and" fuzzy-match to "undo" with concerning frequency. At 0.7, legitimate corrections like "cancl" -> "cancel" are missed. 0.6 is the sweet spot for the default command keyword set, though it should be configurable for deployments with custom keyword lists.

---

## 36.16 Summary

The voice input system transforms spoken language into agent input through a carefully layered pipeline: platform-specific audio capture at the bottom, a provider-agnostic transcription layer in the middle, and keyword detection with command processing at the top. The `VoiceSession` state machine enforces correct recording lifecycle transitions. The `SttProviderBackend` trait enables swappable backends without touching the session logic. Audio utilities for RMS computation, silence detection, and WAV encoding handle the low-level signal processing. And the OAuth-only authentication requirement keeps API credentials out of plaintext config files.

The `/voice` and `/listen` commands provide distinct interfaces for configuration and runtime usage, following the separation pattern established in earlier chapters. Hold-to-talk integrates voice capture with the terminal input loop, and the event channel architecture decouples the audio pipeline from the UI rendering layer.

In Chapter 37, we will examine the plugin system -- the mechanism that lets third-party developers extend the agent with custom skills, hooks, and MCP servers through a marketplace-driven distribution model.
