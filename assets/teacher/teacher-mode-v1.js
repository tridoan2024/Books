(function () {
  "use strict";
  var lesson = window.DBOOK_TEACHER_LESSON;
  var launch = document.getElementById("btn-teacher");
  if (!lesson || !launch) return;
  var pageOptions = new URLSearchParams(location.search);
  var detachedMode = pageOptions.get("teacherDetached") === "1";
  var lectureChannel = window.BroadcastChannel ? new BroadcastChannel("dbooks-lecture:" + lesson.id) : null;

  function legacyBeats(source) {
    return (source.segments || []).map(function (segment, index) {
      return {
        id: "v0-" + index,
        role: "legacy",
        title: segment.title,
        speech: segment.narration,
        pauseAfterMs: 0,
        unitId: "v0",
        unitIndex: index,
        beatIndex: 0,
        unitTitle: segment.title,
        unitQuestion: segment.objective,
        unitOutcome: segment.objective,
        legacyBoard: segment.board
      };
    });
  }

  var beats = lesson.beats || legacyBeats(lesson);
  var state = {
    index: 0, playing: false, paused: false, awaiting: false, cached: false,
    audio: null, sentenceActive: -1,
    timer: null, timing: null, timingIndex: -1, boardEventCount: -1, playbackRun: 0,
    currentMs: 0, durationMs: 1, audioObjectUrl: null,
    audioRelease: null, audioManifest: null, audioManifestPromise: null
  };
  var lessonKey = "dbooks:teacher:" + lesson.id + ":" + lesson.version;
  var audioVersion = lesson.audioVersion || lesson.version;
  window.DBOOK_TEACHER_AUDIO_RESULT = null;
  try {
    var rawSavedIndex = localStorage.getItem(lessonKey + ":index");
    var savedIndex = Number(rawSavedIndex) || 0;
    var migrationKey = lessonKey + ":index-migration-v2";
    if (lesson.indexMigrationOffset && rawSavedIndex !== null && !localStorage.getItem(migrationKey)) {
      savedIndex += lesson.indexMigrationOffset;
      localStorage.setItem(migrationKey, "done");
      localStorage.setItem(lessonKey + ":index", String(savedIndex));
    }
    state.index = Math.max(0, Math.min(beats.length - 1, savedIndex));
  } catch (_) {}

  var panel = document.createElement("section");
  panel.className = "teacher-panel teacher-professor";
  panel.id = "teacher-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Professor Mode lesson");
  panel.innerHTML =
    '<div class="teacher-panel-head"><div><span class="teacher-kicker">PROFESSOR MODE</span><h2></h2><div class="teacher-version"></div></div><div class="teacher-window-actions"><button class="teacher-detach" type="button">Detach lesson</button><button class="teacher-close" aria-label="Hide Teacher Mode">Hide</button></div></div>' +
    '<div class="teacher-provider"><i></i><span>Checking saved lecture audio…</span></div>' +
    '<div class="teacher-status" aria-live="polite"></div><div class="teacher-progress"><i></i></div><input class="teacher-scrubber" type="range" min="0" max="1000" value="0" aria-label="Lecture position">' +
    '<div class="teacher-actions"><button data-action="prev" title="Previous teaching beat">←</button><button data-action="play" class="teacher-primary">Teach this beat</button><button data-action="next" title="Next teaching beat">→</button><button data-action="stop">Stop</button><button data-action="board">Hide whiteboard</button></div>' +
    '<section class="teacher-map"><span></span><strong></strong><small></small><em></em></section>' +
    '<aside class="teacher-board" aria-label="Professor whiteboard"><div class="teacher-board-top"><span></span><b></b></div><h3></h3><div class="teacher-board-canvas"><svg aria-hidden="true"></svg><div class="teacher-board-elements"></div></div></aside>' +
    '<div class="teacher-stage"><div class="teacher-caption"></div></div>' +
    '<div class="teacher-options"><span>Natural professor narration only · device speech is disabled</span></div>' +
    '<p class="teacher-note"></p>';
  document.body.appendChild(panel);

  var title = panel.querySelector("h2");
  var version = panel.querySelector(".teacher-version");
  var status = panel.querySelector(".teacher-status");
  var progress = panel.querySelector(".teacher-progress i");
  var scrubber = panel.querySelector(".teacher-scrubber");
  var play = panel.querySelector('[data-action="play"]');
  var boardButton = panel.querySelector('[data-action="board"]');
  var boardPanel = panel.querySelector(".teacher-board");
  var boardCanvas = panel.querySelector(".teacher-board-canvas");
  var boardElements = panel.querySelector(".teacher-board-elements");
  var boardSvg = panel.querySelector(".teacher-board-canvas svg");
  var caption = panel.querySelector(".teacher-caption");
  var provider = panel.querySelector(".teacher-provider");
  var note = panel.querySelector(".teacher-note");
  var map = panel.querySelector(".teacher-map");
  var syncStatus = map.querySelector("em");
  var detachButton = panel.querySelector(".teacher-detach");
  title.textContent = lesson.title;
  version.innerHTML = lesson.id === "ai-technical-prep-chapter-03"
    ? '<label>Lecture version <select><option value="v1">v1 Professor</option><option value="v0">v0 POC</option></select></label>'
    : '<label>Lecture version <select><option value="v1">v1 Professor</option></select></label>';
  version.querySelector("select").value = lesson.generation === "v1" ? "v1" : "v0";
  note.textContent = lesson.generation === "v1"
    ? "v1 uses short teaching beats. Audio is cached by beat, so only changed material must be regenerated."
    : "v0 is preserved for direct comparison with the original Chapter 3 proof of concept.";

  function current() { return beats[state.index]; }

  function broadcastLectureState(type) {
    if (!lectureChannel) return;
    var active = caption.querySelector(".teacher-phrase.active, .teacher-sentence.active");
    var items = Array.prototype.map.call(
      boardPanel.querySelectorAll(".teacher-board-element, .teacher-board-boundary"),
      function (item) { return item.textContent.replace(/\s+/g, " ").trim(); }
    ).filter(Boolean).slice(0, 12);
    lectureChannel.postMessage({
      type: type || "lecture-state", detached: detachedMode, sentAt: Date.now(), index: state.index,
      context: {
        position: status.textContent, role: map.querySelector("span").textContent,
        beat: map.querySelector("strong").textContent, objective: map.querySelector("small").textContent,
        phrase: active ? active.textContent.trim() : "",
        boardQuestion: boardPanel.querySelector("h3").textContent,
        boardItems: items, audioSeconds: Math.round(state.currentMs / 1000),
        playing: state.playing, paused: state.paused
      }
    });
  }
  if (lectureChannel && !detachedMode) lectureChannel.onmessage = function (event) {
    var message = event.data;
    if (!message || !message.detached || !message.context) return;
    try {
      localStorage.setItem(lessonKey + ":index", String(message.index));
      localStorage.setItem(lessonKey + ":position:" + message.index, String((message.context.audioSeconds || 0)));
    } catch (_) {}
    if (message.type === "lecture-detached-closed") {
      if (state.audio) { state.audio.pause(); state.audio.src = ""; state.audio.remove(); }
      state.audio = null; state.cached = false; state.playing = false; state.paused = false;
      state.index = Math.max(0, Math.min(beats.length - 1, Number(message.index) || 0));
      state.timing = null; state.timingIndex = -1; state.boardEventCount = -1;
      render();
    }
  };
  function unitFor(entry) { return lesson.units ? lesson.units[entry.unitIndex] : null; }
  function words(text) { return (text.match(/\S+/g) || []).length; }
  function estimatedSeconds(entry) { return Math.max(8, words(entry.speech) / 125 * 60); }
  function roleLabel(role) { return String(role || "explain").replace(/-/g, " ").toUpperCase(); }

  function setProvider(kind, text) {
    provider.className = "teacher-provider " + kind;
    provider.querySelector("span").textContent = text;
  }

  function createBoardElement(action) {
    var element = document.createElement("div");
    element.className = "teacher-board-element teacher-board-" + (action.action === "note" ? "note" : "node") + " kind-" + (action.kind || "tool");
    element.dataset.boardId = action.id;
    element.textContent = action.label || action.text || "";
    var width = Number(action.w) || (action.action === "note" ? 31 : 19);
    var x = Math.max(0, Math.min(100 - width, Number(action.x) || 0));
    var y = Math.max(0, Math.min(84, Number(action.y) || 0));
    element.style.left = x + "%";
    element.style.top = y + "%";
    if (action.w) element.style.width = width + "%";
    if (action.h) element.style.height = action.h + "%";
    boardElements.appendChild(element);
  }

  function nodeCenter(id) {
    var element = boardElements.querySelector('[data-board-id="' + CSS.escape(id) + '"]');
    if (!element) return null;
    return {
      x: parseFloat(element.style.left) + (element.offsetWidth / Math.max(1, boardCanvas.clientWidth) * 50),
      y: parseFloat(element.style.top) + (element.offsetHeight / Math.max(1, boardCanvas.clientHeight) * 50)
    };
  }

  function drawEdge(action) {
    var from = nodeCenter(action.from), to = nodeCenter(action.to);
    if (!from || !to) return;
    var ns = "http://www.w3.org/2000/svg";
    var line = document.createElementNS(ns, "line");
    line.setAttribute("x1", from.x + "%"); line.setAttribute("y1", from.y + "%");
    line.setAttribute("x2", to.x + "%"); line.setAttribute("y2", to.y + "%");
    line.setAttribute("marker-end", "url(#teacher-arrow)");
    boardSvg.appendChild(line);
    if (action.label) {
      var label = document.createElementNS(ns, "text");
      label.setAttribute("x", ((from.x + to.x) / 2) + "%");
      label.setAttribute("y", ((from.y + to.y) / 2 - 2) + "%");
      label.textContent = action.label;
      boardSvg.appendChild(label);
    }
  }

  function applyBoardAction(action) {
    if (action.action === "clear") {
      boardPanel.querySelector("h3").textContent = action.title || "";
      boardElements.innerHTML = "";
      boardSvg.innerHTML = '<defs><marker id="teacher-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z"></path></marker></defs>';
      return;
    }
    if (action.action === "node" || action.action === "note") { createBoardElement(action); return; }
    if (action.action === "boundary") {
      var boundary = document.createElement("div");
      boundary.className = "teacher-board-boundary";
      boundary.dataset.boardId = action.id;
      boundary.style.left = action.x + "%"; boundary.style.top = action.y + "%";
      boundary.style.width = action.w + "%"; boundary.style.height = action.h + "%";
      boundary.textContent = action.label;
      boardElements.appendChild(boundary); return;
    }
    if (action.action === "edge") { drawEdge(action); return; }
    var target = boardElements.querySelector('[data-board-id="' + CSS.escape(action.target || "") + '"]');
    if (!target) return;
    if (action.action === "highlight") target.classList.add("active");
    if (action.action === "crossOut") target.classList.add("crossed");
  }

  function renderLegacyBoard(entry) {
    var board = entry.legacyBoard;
    boardPanel.querySelector("h3").textContent = board.heading;
    boardElements.innerHTML = "";
    boardSvg.innerHTML = "";
    (board.nodes || []).forEach(function (item, index) {
      createBoardElement({ action: "node", id: "legacy-" + index, label: typeof item === "string" ? item : item.title + "\n" + item.detail, x: 3 + (index % 3) * 32, y: 8 + Math.floor(index / 3) * 42, kind: "tool" });
    });
  }

  function renderBoard(entry, currentMs) {
    boardPanel.querySelector(".teacher-board-top span").textContent = entry.unitTitle;
    boardPanel.querySelector(".teacher-board-top b").textContent = roleLabel(entry.role);
    if (entry.legacyBoard) { renderLegacyBoard(entry); return; }
    boardElements.innerHTML = "";
    boardSvg.innerHTML = '<defs><marker id="teacher-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z"></path></marker></defs>';
    var section = unitFor(entry);
    if (!section) return;
    boardPanel.querySelector("h3").textContent = section.question;
    section.beats.slice(0, entry.beatIndex + 1).forEach(function (item) {
      var actions = item.boardActions || [];
      if (item === entry && state.timing && state.timingIndex === state.index) {
        var allowed = state.timing.boardEvents.filter(function (event) { return currentMs >= event.atMs; }).length;
        actions = actions.slice(0, allowed);
      }
      actions.forEach(applyBoardAction);
    });
  }

  function renderCaption(entry) {
    state.sentenceActive = -1;
    caption.scrollTop = 0;
    if (state.timing && state.timingIndex === state.index && state.timing.phrases) {
      caption.innerHTML = "";
      state.timing.phrases.forEach(function (item) {
        var phrase = document.createElement("span");
        phrase.className = "teacher-sentence teacher-phrase";
        phrase.dataset.startMs = String(item.startMs);
        phrase.dataset.endMs = String(item.endMs);
        phrase.textContent = item.text + " ";
        caption.appendChild(phrase);
      });
      return;
    }
    var sentences = entry.speech.match(/[^.!?]+[.!?]+[”"']?|[^.!?]+$/g) || [entry.speech];
    var counts = sentences.map(words);
    var total = counts.reduce(function (sum, count) { return sum + count; }, 0) || 1;
    var elapsed = 0;
    caption.innerHTML = "";
    sentences.forEach(function (text, index) {
      var sentence = document.createElement("span");
      sentence.className = "teacher-sentence";
      sentence.dataset.start = String(elapsed / total);
      elapsed += counts[index];
      sentence.dataset.end = String(elapsed / total);
      sentence.textContent = text.trim() + " ";
      caption.appendChild(sentence);
    });
  }

  function updateTeaching(currentMs, durationMs) {
    currentMs = Math.max(0, currentMs || 0);
    durationMs = Math.max(1, durationMs || estimatedSeconds(current()) * 1000);
    state.currentMs = currentMs; state.durationMs = durationMs;
    var ratio = Math.max(0, Math.min(1, currentMs / durationMs));
    var sentences = caption.querySelectorAll(".teacher-sentence");
    var active = -1;
    sentences.forEach(function (sentence, index) {
      var timed = sentence.dataset.startMs !== undefined;
      var start = timed ? Number(sentence.dataset.startMs) : Number(sentence.dataset.start) * durationMs;
      var end = timed ? Number(sentence.dataset.endMs) : Number(sentence.dataset.end) * durationMs;
      sentence.classList.toggle("past", currentMs >= end);
      sentence.classList.toggle("active", currentMs >= start && currentMs < end);
      if (currentMs >= start && currentMs < end) active = index;
    });
    if (active !== state.sentenceActive) {
      state.sentenceActive = active;
      var currentSentence = sentences[active];
      if (currentSentence) caption.scrollTo({ top: Math.max(0, currentSentence.offsetTop - caption.offsetTop - caption.clientHeight * 0.4), behavior: "smooth" });
    }
    if (!current().legacyBoard && state.timing && state.timingIndex === state.index) {
      var eventCount = state.timing.boardEvents.filter(function (event) { return currentMs >= event.atMs; }).length;
      if (eventCount !== state.boardEventCount) {
        state.boardEventCount = eventCount;
        renderBoard(current(), currentMs);
      }
    }
    broadcastLectureState();
  }

  function cacheSegment(entry, index) {
    return entry.audioSegment == null ? String(index) : String(entry.audioSegment);
  }

  function teacherApiUrl(path) {
    var base = location.protocol === "file:" ? "http://127.0.0.1:8765" : "";
    return base + path;
  }

  function cacheApiUrl(path, entry, index) {
    var query = "?lesson=" + encodeURIComponent(lesson.id) + "&version=" + encodeURIComponent(audioVersion) + "&segment=" + encodeURIComponent(cacheSegment(entry, index));
    var pointer = state.audioRelease && state.audioRelease.pointer;
    if (location.protocol !== "file:" && pointer) {
      query += "&release=" + encodeURIComponent(pointer.releaseId) +
        "&releaseManifestSHA256=" + encodeURIComponent(pointer.releaseManifestSHA256) +
        "&generationManifestSHA256=" + encodeURIComponent(pointer.generationManifestSHA256);
    }
    return teacherApiUrl(path) + query;
  }

  function sameAudioProfile(value) {
    var expected = lesson.audioProfile;
    return !!expected && !!value &&
      value.model === expected.model &&
      value.voice === expected.voice &&
      Number(value.speed) === Number(expected.speed) &&
      value.instructionsSHA256 === expected.instructionsSHA256;
  }

  function validSHA256(value) {
    return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
  }

  function orthographicSignature(value) {
    var normalized = String(value || "").normalize("NFKC").toLowerCase()
      .replace(/[’‘]/g, "'");
    var matches = Array.from(normalized.matchAll(/[a-z0-9]+/g));
    var characters = "", boundaries = {}, flexible = {}, offset = 0;
    matches.forEach(function (match, index) {
      characters += match[0];
      if (index >= matches.length - 1) return;
      offset += match[0].length;
      boundaries[offset] = true;
      var separator = normalized.slice(match.index + match[0].length, matches[index + 1].index);
      if (/[-']/.test(separator)) flexible[offset] = true;
    });
    return { characters: characters, boundaries: boundaries, flexible: flexible };
  }

  function providerTranscriptMatches(approved, transcript) {
    var left = orthographicSignature(approved), right = orthographicSignature(transcript);
    if (left.characters !== right.characters) return false;
    var positions = Object.assign({}, left.boundaries, right.boundaries);
    return Object.keys(positions).every(function (position) {
      return !!left.boundaries[position] === !!right.boundaries[position] ||
        !!left.flexible[position] || !!right.flexible[position];
    });
  }

  function manifestUrl() {
    if (!lesson.audioRelease) return null;
    return cacheApiUrl("/api/teacher-manifest", beats[0], 0);
  }

  function loadDirectFileValue(url, globalName) {
    return new Promise(function (resolve) {
      var script = document.createElement("script");
      window[globalName] = null;
      script.onload = function () {
        var value = window[globalName] || null;
        window[globalName] = null;
        script.remove();
        resolve(value);
      };
      script.onerror = function () {
        window[globalName] = null;
        script.remove();
        resolve(null);
      };
      script.src = url;
      document.head.appendChild(script);
    });
  }

  function directFileAssetUrl(entry, index, suffix) {
    if (!state.audioRelease) return null;
    return new URL(
      encodeURIComponent(cacheSegment(entry, index)) + suffix,
      state.audioRelease.baseUrl
    ).href;
  }

  async function loadDirectFileRelease() {
    if (!lesson.audioReleaseScript) return null;
    var pointerUrl = new URL(lesson.audioReleaseScript, location.href);
    var pointer = await loadDirectFileValue(
      pointerUrl.href,
      "DBOOK_TEACHER_AUDIO_RELEASE"
    );
    if (!pointer || pointer.schemaVersion !== 1 ||
        !validSHA256(pointer.releaseId) ||
        pointer.lessonId !== lesson.id ||
        pointer.lessonVersion !== lesson.version ||
        pointer.audioVersion !== audioVersion ||
        pointer.narrationSHA256 !== lesson.narrationSHA256 ||
        !sameAudioProfile(pointer.profile) ||
        !validSHA256(pointer.releaseManifestSHA256) ||
        !validSHA256(pointer.generationManifestSHA256)) return null;
    var baseUrl = new URL("releases/" + pointer.releaseId + "/", pointerUrl);
    var releaseManifest = await loadDirectFileValue(
      new URL("release-manifest.js", baseUrl).href,
      "DBOOK_TEACHER_AUDIO_RELEASE_MANIFEST"
    );
    if (!releaseManifest ||
        await sha256(JSON.stringify(releaseManifest)) !== pointer.releaseManifestSHA256 ||
        releaseManifest.schemaVersion !== 1 ||
        releaseManifest.releaseId !== pointer.releaseId ||
        releaseManifest.lessonId !== lesson.id ||
        releaseManifest.lessonVersion !== lesson.version ||
        releaseManifest.audioVersion !== audioVersion ||
        releaseManifest.narrationSHA256 !== lesson.narrationSHA256 ||
        !sameAudioProfile(releaseManifest.profile) ||
        releaseManifest.generationManifestFile !== "generation-manifest.json" ||
        releaseManifest.generationManifestSHA256 !== pointer.generationManifestSHA256 ||
        !Array.isArray(releaseManifest.beats) ||
        releaseManifest.beats.length !== beats.length) return null;
    for (var i = 0; i < beats.length; i += 1) {
      var entry = beats[i], item = releaseManifest.beats[i];
      if (!item || item.index !== i || item.beatId !== entry.id ||
          item.audioSegment !== cacheSegment(entry, i) ||
          item.audioFile !== cacheSegment(entry, i) + ".webm" ||
          item.timingFile !== cacheSegment(entry, i) + ".timing.json" ||
          !validSHA256(item.audioSHA256) || !validSHA256(item.timingSHA256)) return null;
    }
    return { pointer: pointer, manifest: releaseManifest, baseUrl: baseUrl };
  }

  async function loadDirectFileManifest() {
    var release = await loadDirectFileRelease();
    if (!release) return null;
    var manifest = await loadDirectFileValue(
      new URL("generation-manifest.js", release.baseUrl).href,
      "DBOOK_TEACHER_AUDIO_MANIFEST"
    );
    if (!manifest ||
        await sha256(JSON.stringify(manifest)) !== release.pointer.generationManifestSHA256) return null;
    state.audioRelease = release;
    return manifest;
  }

  function utf8Bytes(value) {
    if (window.TextEncoder) return Array.prototype.slice.call(new TextEncoder().encode(value));
    var encoded = unescape(encodeURIComponent(value)), bytes = [];
    for (var i = 0; i < encoded.length; i += 1) bytes.push(encoded.charCodeAt(i));
    return bytes;
  }

  function sha256BytesFallback(value) {
    var bytes = Array.prototype.slice.call(value), words = [], bitLength = bytes.length * 8;
    var constants = [], hashes = [], prime = 2;
    function isPrime(number) {
      for (var divisor = 2; divisor * divisor <= number; divisor += 1) if (number % divisor === 0) return false;
      return true;
    }
    while (constants.length < 64) {
      if (isPrime(prime)) {
        if (hashes.length < 8) hashes.push((Math.pow(prime, 0.5) * 0x100000000) | 0);
        constants.push((Math.pow(prime, 1 / 3) * 0x100000000) | 0);
      }
      prime += 1;
    }
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    var highBits = Math.floor(bitLength / 0x100000000);
    var lowBits = bitLength >>> 0;
    for (var high = 3; high >= 0; high -= 1) bytes.push((highBits >>> (high * 8)) & 255);
    for (var low = 3; low >= 0; low -= 1) bytes.push((lowBits >>> (low * 8)) & 255);
    for (var offset = 0; offset < bytes.length; offset += 64) {
      var schedule = [];
      for (var index = 0; index < 16; index += 1) {
        var start = offset + index * 4;
        schedule[index] = (bytes[start] << 24) | (bytes[start + 1] << 16) | (bytes[start + 2] << 8) | bytes[start + 3];
      }
      for (index = 16; index < 64; index += 1) {
        var x = schedule[index - 15], y = schedule[index - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        schedule[index] = (schedule[index - 16] + s0 + schedule[index - 7] + s1) | 0;
      }
      var a = hashes[0], b = hashes[1], c = hashes[2], d = hashes[3];
      var e = hashes[4], f = hashes[5], g = hashes[6], h = hashes[7];
      for (index = 0; index < 64; index += 1) {
        var e1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var choice = (e & f) ^ (~e & g);
        var temp1 = (h + e1 + choice + constants[index] + schedule[index]) | 0;
        var a1 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var majority = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (a1 + majority) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      hashes[0] = (hashes[0] + a) | 0; hashes[1] = (hashes[1] + b) | 0;
      hashes[2] = (hashes[2] + c) | 0; hashes[3] = (hashes[3] + d) | 0;
      hashes[4] = (hashes[4] + e) | 0; hashes[5] = (hashes[5] + f) | 0;
      hashes[6] = (hashes[6] + g) | 0; hashes[7] = (hashes[7] + h) | 0;
    }
    return hashes.map(function (word) { return (word >>> 0).toString(16).padStart(8, "0"); }).join("");
  }

  async function sha256Bytes(value) {
    var bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    if (!window.crypto || !window.crypto.subtle) return sha256BytesFallback(bytes);
    var digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.prototype.map.call(new Uint8Array(digest), function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
  }

  function sha256(value) {
    return sha256Bytes(new Uint8Array(utf8Bytes(value)));
  }

  function decodeBase64(value) {
    var binary = atob(value), bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function responseRelease(response) {
    var pointer = {
      schemaVersion: 1,
      releaseId: response.headers.get("X-DBooks-Release-Id"),
      releaseManifestSHA256: response.headers.get("X-DBooks-Release-Manifest-SHA256"),
      generationManifestSHA256: response.headers.get("X-DBooks-Generation-Manifest-SHA256")
    };
    if (!validSHA256(pointer.releaseId) ||
        !validSHA256(pointer.releaseManifestSHA256) ||
        !validSHA256(pointer.generationManifestSHA256)) return null;
    return { pointer: pointer, manifest: null, baseUrl: null };
  }

  async function loadHttpManifest(url) {
    var response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    var release = responseRelease(response);
    if (!release) return null;
    var manifest = await response.json();
    if (await sha256(JSON.stringify(manifest)) !== release.pointer.generationManifestSHA256) return null;
    state.audioRelease = release;
    return manifest;
  }

  async function loadAudioManifest() {
    if (state.audioManifest) return state.audioManifest;
    if (!state.audioManifestPromise) {
      var url = manifestUrl();
      if (!url && !lesson.audioReleaseScript) return null;
      var requested = loadDirectFileManifest().then(function (manifest) {
        if (manifest || location.protocol === "file:" || !url) return manifest;
        return loadHttpManifest(url);
      });
      state.audioManifestPromise = requested.then(async function (manifest) {
          var canonical = beats.map(function (entry) {
            return { id: entry.id, speech: entry.speech, pauseAfterMilliseconds: entry.pauseAfterMs || 0 };
          });
          var narrationHash = await sha256(JSON.stringify(canonical));
          if (!narrationHash || narrationHash !== lesson.narrationSHA256 ||
              !manifest || manifest.schemaVersion !== 1 ||
              manifest.lessonId !== lesson.id ||
              manifest.lessonVersion !== lesson.version ||
              manifest.audioVersion !== audioVersion ||
              manifest.narrationSHA256 !== narrationHash ||
              !sameAudioProfile(manifest.profile) ||
              !Array.isArray(manifest.beats) || manifest.beats.length !== beats.length) return null;
          for (var i = 0; i < beats.length; i += 1) {
            var entry = beats[i], item = manifest.beats[i];
            var beatHash = await sha256(entry.speech);
            var providerHash = item && typeof item.providerTranscript === "string"
              ? await sha256(item.providerTranscript) : null;
            var releaseBeat = state.audioRelease && state.audioRelease.manifest && state.audioRelease.manifest.beats[i];
            if (!item || !beatHash || item.index !== i || item.beatId !== entry.id ||
                item.audioSegment !== cacheSegment(entry, i) ||
                item.pauseAfterMilliseconds !== (entry.pauseAfterMs || 0) ||
                item.audioFile !== cacheSegment(entry, i) + ".webm" ||
                item.narrationSHA256 !== beatHash ||
                !validSHA256(item.audioSHA256) ||
                item.codec !== "opus" || item.sampleRate !== 48000 || item.channels !== 1 ||
                item.durationMilliseconds <= 0 || !sameAudioProfile(item.profile) ||
                typeof item.providerSessionId !== "string" || !item.providerSessionId ||
                typeof item.providerResponseId !== "string" || !item.providerResponseId ||
                !providerTranscriptMatches(entry.speech, item.providerTranscript) ||
                providerHash !== item.providerTranscriptSHA256 ||
                (releaseBeat && (releaseBeat.audioSHA256 !== item.audioSHA256 ||
                  releaseBeat.audioFile !== item.audioFile))) return null;
          }
          state.audioManifest = manifest;
          return manifest;
      })
      .catch(function () { return null; });
    }
    return state.audioManifestPromise;
  }

  function manifestEntry(manifest, entry, index) {
    if (!manifest || !Array.isArray(manifest.beats)) return null;
    var item = manifest.beats[index];
    if (!item || item.beatId !== entry.id || item.audioSegment !== cacheSegment(entry, index)) return null;
    return item;
  }

  function timingMatchesLesson(timing, entry, manifestBeat, index) {
    var alignment = timing && timing.alignment;
    var verifiers = alignment && alignment.acousticVerifiers;
    if (!timing || !manifestBeat || timing.schemaVersion !== 3 ||
        timing.lessonId !== lesson.id || timing.lessonVersion !== lesson.version ||
        timing.audioVersion !== audioVersion || timing.beatIndex !== index ||
        timing.beatId !== entry.id ||
        timing.audioSegment !== cacheSegment(entry, index) ||
        timing.narrationSHA256 !== manifestBeat.narrationSHA256 ||
        timing.audioFile !== manifestBeat.audioFile ||
        timing.audioSHA256 !== manifestBeat.audioSHA256 ||
        timing.providerTranscriptSHA256 !== manifestBeat.providerTranscriptSHA256 ||
        timing.durationMs !== manifestBeat.durationMilliseconds ||
        !sameAudioProfile(timing.profile) || !alignment ||
        alignment.status !== "pass" || Number(alignment.matchRatio) < 0.90 ||
        !Array.isArray(alignment.acceptedEdits) ||
        !Array.isArray(alignment.rejectedEdits) || alignment.rejectedEdits.length ||
        !Array.isArray(alignment.unresolvedEdits) || alignment.unresolvedEdits.length ||
        !Array.isArray(verifiers) || verifiers.length !== 2) return false;
    var models = {};
    for (var i = 0; i < verifiers.length; i += 1) {
      var verifier = verifiers[i];
      if (!verifier || !validSHA256(verifier.modelSHA256) ||
          !validSHA256(verifier.transcriptSHA256) ||
          typeof verifier.transcript !== "string") return false;
      models[verifier.modelSHA256] = true;
    }
    return Object.keys(models).length === 2;
  }

  function timingUrl(entry, index) {
    if (location.protocol === "file:") return null;
    return cacheApiUrl("/api/teacher-timing", entry, index);
  }

  async function loadTiming(index, suppliedManifest) {
    if (lesson.generation !== "v1") return null;
    try {
      var entry = beats[index];
      var manifest = suppliedManifest || await loadAudioManifest();
      var expected = manifestEntry(manifest, entry, index);
      if (!expected) return null;
      var timing;
      if (state.audioRelease && state.audioRelease.manifest && state.audioRelease.baseUrl) {
        var timingPayload = await loadDirectFileValue(
          directFileAssetUrl(entry, index, ".timing.js"),
          "DBOOK_TEACHER_TIMING_PAYLOAD"
        );
        if (!timingPayload || typeof timingPayload.json !== "string") return null;
        var timingBytes = new Uint8Array(utf8Bytes(timingPayload.json));
        var releaseBeat = state.audioRelease && state.audioRelease.manifest.beats[index];
        if (!releaseBeat ||
            await sha256Bytes(timingBytes) !== releaseBeat.timingSHA256) return null;
        timing = JSON.parse(timingPayload.json);
      } else {
        var response = await fetch(timingUrl(entry, index), { cache: "no-store" });
        if (!response.ok) return null;
        timing = await response.json();
      }
      if (index !== state.index || !timingMatchesLesson(timing, entry, expected, index)) return null;
      state.timing = timing; state.timingIndex = index; state.boardEventCount = -1;
      syncStatus.textContent = "Word-aligned · " + Math.round(timing.alignment.matchRatio * 100) + "% match";
      return timing;
    } catch (_) { return null; }
  }

  function render() {
    var entry = current(), section = unitFor(entry);
    map.querySelector("span").textContent = roleLabel(entry.role);
    map.querySelector("strong").textContent = entry.title;
    map.querySelector("small").textContent = section ? section.outcome : entry.unitOutcome;
    status.textContent = lesson.generation === "v1"
      ? "Unit " + (entry.unitIndex + 1) + " of " + lesson.units.length + " · Beat " + (entry.beatIndex + 1) + " of " + section.beats.length + " · " + lesson.estimatedMinutes + " estimated minutes"
      : "v0 concept " + (state.index + 1) + " of " + beats.length;
    progress.style.width = ((state.index + 1) / beats.length * 100) + "%";
    scrubber.value = "0";
    play.textContent = state.awaiting ? "Continue" : state.playing ? (state.paused ? "Resume" : "Pause") : "Teach this beat";
    var saved = 0;
    try { saved = Number(localStorage.getItem(lessonKey + ":position:" + state.index)) || 0; } catch (_) {}
    renderBoard(entry, saved * 1000);
    renderCaption(entry);
    updateTeaching(saved * 1000, estimatedSeconds(entry) * 1000);
    if (lesson.generation === "v1" && state.timingIndex !== state.index) {
      var requestedIndex = state.index;
      loadTiming(requestedIndex).then(function (timing) {
        if (!timing || requestedIndex !== state.index) return;
        renderCaption(current());
        renderBoard(current(), saved * 1000);
        updateTeaching(saved * 1000, timing.durationMs);
      });
    }
  }

  function runIsCurrent(run, index) { return run === state.playbackRun && index === state.index; }

  function finishBeat(run, index) {
    if (!runIsCurrent(run, index)) return;
    state.playing = false; state.paused = false;
    try { localStorage.removeItem(lessonKey + ":position:" + index); } catch (_) {}
    if (new URLSearchParams(location.search).get("teacherSingle") === "1") { render(); return; }
    var delay = Math.max(0, Number(current().pauseAfterMs) || 0);
    state.timer = setTimeout(function () { if (runIsCurrent(run, index)) advance(); }, delay);
  }

  function advance() {
    state.awaiting = false;
    if (state.index >= beats.length - 1) { render(); status.textContent = "Lecture complete. " + status.textContent; return; }
    state.index += 1;
    state.timing = null; state.timingIndex = -1; state.boardEventCount = -1;
    try { localStorage.setItem(lessonKey + ":index", String(state.index)); } catch (_) {}
    render(); speak();
  }

  function setAudioResult(statusValue, index, details) {
    var entry = beats[index];
    window.DBOOK_TEACHER_AUDIO_RESULT = Object.assign({
      status: statusValue,
      index: index,
      beatId: entry.id,
      audioSegment: cacheSegment(entry, index),
      lessonVersion: lesson.version,
      audioVersion: audioVersion
    }, details || {});
  }

  function loadAudioMetadata(audio) {
    return new Promise(function (resolve, reject) {
      function clear() {
        audio.removeEventListener("loadedmetadata", loaded);
        audio.removeEventListener("error", failed);
      }
      function loaded() { clear(); resolve(); }
      function failed() { clear(); reject(new Error("Saved professor audio did not decode")); }
      audio.addEventListener("loadedmetadata", loaded);
      audio.addEventListener("error", failed);
      audio.load();
    });
  }

  async function loadDirectFileAudio(entry, index, expected) {
    if (location.protocol !== "file:" && state.audioRelease && state.audioRelease.baseUrl) {
      var response = await fetch(
        new URL(expected.audioFile, state.audioRelease.baseUrl).href,
        { cache: "no-store" }
      );
      if (!response.ok) return null;
      var fetchedBytes = new Uint8Array(await response.arrayBuffer());
      if (await sha256Bytes(fetchedBytes) !== expected.audioSHA256) return null;
      return URL.createObjectURL(
        new Blob([fetchedBytes], { type: "audio/webm;codecs=opus" })
      );
    }
    var payload = await loadDirectFileValue(
      directFileAssetUrl(entry, index, ".audio.js"),
      "DBOOK_TEACHER_AUDIO_PAYLOAD"
    );
    if (!payload || payload.audioSegment !== cacheSegment(entry, index) ||
        payload.audioSHA256 !== expected.audioSHA256 ||
        payload.mimeType !== "audio/webm;codecs=opus" ||
        typeof payload.base64 !== "string") return null;
    var bytes = decodeBase64(payload.base64);
    if (await sha256Bytes(bytes) !== expected.audioSHA256) return null;
    return URL.createObjectURL(new Blob([bytes], { type: payload.mimeType }));
  }

  async function playCached(run, index) {
    var entry = beats[index];
    var audio = document.createElement("audio");
    try {
      audio.preload = "auto"; audio.setAttribute("playsinline", "");
      var resumeAt = 0;
      try { resumeAt = Number(localStorage.getItem(lessonKey + ":position:" + index)) || 0; } catch (_) {}
      var manifest = await loadAudioManifest();
      var expected = manifestEntry(manifest, entry, index);
      if (!expected || !runIsCurrent(run, index)) return false;
      var timing = await loadTiming(index, manifest);
      if (!runIsCurrent(run, index)) return true;
      if (!timing) throw new Error("Saved professor timing did not match its manifest");
      renderCaption(current());
      if (state.audioRelease && state.audioRelease.manifest && state.audioRelease.baseUrl) {
        state.audioObjectUrl = await loadDirectFileAudio(entry, index, expected);
        if (!state.audioObjectUrl) throw new Error("Saved professor audio did not match its manifest");
        if (!runIsCurrent(run, index)) {
          URL.revokeObjectURL(state.audioObjectUrl);
          state.audioObjectUrl = null;
          return true;
        }
        audio.src = state.audioObjectUrl;
      } else {
        audio.src = cacheApiUrl("/api/teacher-audio", entry, index);
      }
      panel.appendChild(audio);
      await loadAudioMetadata(audio);
      if (!runIsCurrent(run, index)) return true;
      if (!isFinite(audio.duration) ||
          Math.abs(audio.duration * 1000 - expected.durationMilliseconds) > 250) {
        throw new Error("Saved professor audio duration did not match its manifest");
      }
      if (resumeAt > 0 && resumeAt < audio.duration - 1) audio.currentTime = resumeAt;
      scrubber.value = String(Math.round(audio.currentTime / audio.duration * 1000));
      updateTeaching(audio.currentTime * 1000, audio.duration * 1000);
      audio.ontimeupdate = function () { if (!runIsCurrent(run, index)) return; try { localStorage.setItem(lessonKey + ":position:" + index, String(audio.currentTime)); } catch (_) {} scrubber.value = String(Math.round(audio.currentTime / audio.duration * 1000)); updateTeaching(audio.currentTime * 1000, audio.duration * 1000); };
      audio.onended = function () {
        if (state.audioObjectUrl) URL.revokeObjectURL(state.audioObjectUrl);
        state.audioObjectUrl = null;
        finishBeat(run, index);
      };
      state.audio = audio; state.cached = true; state.playing = true;
      await audio.play();
      if (!runIsCurrent(run, index)) return true;
      setAudioResult("cached", index);
      setProvider("professional", "Saved professor audio · no generation charge");
      render(); return true;
    } catch (_) {
      audio.onended = null; audio.ontimeupdate = null;
      audio.pause(); audio.removeAttribute("src"); audio.load(); audio.remove();
      if (state.audioObjectUrl) URL.revokeObjectURL(state.audioObjectUrl);
      state.audioObjectUrl = null;
      if (state.audio === audio) state.audio = null;
      state.cached = false; state.playing = false;
      return false;
    }
  }

  function fallbackSpeak(run, index) {
    if (!runIsCurrent(run, index)) return;
    setAudioResult("unavailable", index, {
      reason: "Verified natural professor audio is unavailable for this teaching beat"
    });
    setProvider("fallback", "Natural professor audio not recorded yet");
    state.audio = null; state.cached = false; state.playing = false; state.paused = false;
    render();
    status.textContent = "Natural professor audio is not available for this beat. Device speech is disabled.";
  }

  async function speak() {
    var run = ++state.playbackRun, index = state.index;
    window.DBOOK_TEACHER_AUDIO_RESULT = null;
    if (await playCached(run, index)) return;
    if (runIsCurrent(run, index)) fallbackSpeak(run, index);
  }

  function stop() {
    state.playbackRun += 1;
    if (state.timer) clearTimeout(state.timer);
    if (window.speechSynthesis) speechSynthesis.cancel();
    if (state.audio) { if (state.cached) try { localStorage.setItem(lessonKey + ":position:" + state.index, String(state.audio.currentTime)); } catch (_) {} state.audio.onended = null; state.audio.ontimeupdate = null; state.audio.onloadedmetadata = null; state.audio.pause(); state.audio.removeAttribute("src"); state.audio.load(); state.audio.remove(); }
    if (state.audioObjectUrl) URL.revokeObjectURL(state.audioObjectUrl);
    state.playing = false; state.paused = false; state.awaiting = false; state.cached = false; state.audio = null; state.audioObjectUrl = null; render();
  }

  function togglePlay() {
    if (state.awaiting) { advance(); return; }
    if (state.playing && !state.paused) { state.paused = true; if (state.cached && state.audio) state.audio.pause(); else speechSynthesis.pause(); render(); return; }
    if (state.playing && state.paused) { if (state.cached && state.audio) state.audio.play(); else speak(); state.paused = false; render(); return; }
    speak();
  }

  function move(delta) { stop(); state.awaiting = false; state.index = Math.max(0, Math.min(beats.length - 1, state.index + delta)); state.timing = null; state.timingIndex = -1; state.boardEventCount = -1; try { localStorage.setItem(lessonKey + ":index", String(state.index)); } catch (_) {} render(); }
  function toggleBoard() { boardPanel.hidden = !boardPanel.hidden; boardButton.textContent = boardPanel.hidden ? "Show whiteboard" : "Hide whiteboard"; }

  function hidePanel() {
    if (state.playing && !state.paused) {
      if (state.cached && state.audio) state.audio.pause();
      else if (window.speechSynthesis) speechSynthesis.pause();
      state.paused = true;
      render();
    }
    panel.hidden = true;
    launch.setAttribute("aria-pressed", "false");
  }

  function detachLesson() {
    if (detachedMode) { window.close(); return; }
    if (state.audio && state.cached) {
      try { localStorage.setItem(lessonKey + ":position:" + state.index, String(state.audio.currentTime)); } catch (_) {}
    }
    hidePanel();
    var url = new URL(location.href);
    url.searchParams.set("teacherDetached", "1");
    url.searchParams.set("teacherVersion", version.querySelector("select").value);
    var detached = window.open(url.toString(), "dbooks-detached-" + lesson.id, "popup=yes,width=1400,height=950,resizable=yes");
    if (!detached) status.textContent = "Allow pop-ups to detach the lesson window.";
  }

  launch.addEventListener("click", function () { if (panel.hidden) { panel.hidden = false; launch.setAttribute("aria-pressed", "true"); render(); } else hidePanel(); });
  panel.querySelector(".teacher-close").addEventListener("click", function () { hidePanel(); launch.focus(); });
  detachButton.addEventListener("click", detachLesson);
  panel.querySelector('[data-action="play"]').addEventListener("click", togglePlay);
  panel.querySelector('[data-action="prev"]').addEventListener("click", function () { move(-1); });
  panel.querySelector('[data-action="next"]').addEventListener("click", function () { move(1); });
  panel.querySelector('[data-action="stop"]').addEventListener("click", stop);
  panel.querySelector('[data-action="board"]').addEventListener("click", toggleBoard);
  scrubber.addEventListener("input", function () {
    if (!state.audio || !isFinite(state.audio.duration)) return;
    state.audio.currentTime = Number(scrubber.value) / 1000 * state.audio.duration;
    updateTeaching(state.audio.currentTime * 1000, state.audio.duration * 1000);
  });
  version.querySelector("select").addEventListener("change", function (event) {
    var url = new URL(location.href); url.searchParams.set("teacherVersion", event.target.value); location.href = url.toString();
  });
  if (detachedMode) {
    document.body.classList.add("teacher-detached-window");
    launch.hidden = true;
    panel.hidden = false;
    detachButton.textContent = "Return to reader";
    panel.querySelector(".teacher-close").textContent = "Close";
    panel.querySelector(".teacher-close").addEventListener("click", function () { window.close(); });
    render();
    broadcastLectureState();
    setInterval(function () { broadcastLectureState(); }, 1000);
    window.addEventListener("beforeunload", function () { broadcastLectureState("lecture-detached-closed"); });
  }
}());
