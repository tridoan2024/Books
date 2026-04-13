# Chapter 29: Output & Formatting

## Part VIII: The UI System

Every terminal application lives or dies by the quality of its output. Users don't experience your architecture, your test coverage, or your clever abstractions — they experience what appears on their screen. For an AI coding assistant that generates markdown, renders diffs, displays syntax-highlighted code blocks, and manages hundreds of lines of tool output, the formatting engine isn't a cosmetic layer bolted on at the end. It is the product surface.

Claude Code's output system spans roughly 12,000 lines across eighteen files, handling everything from ANSI escape sequence arithmetic to WCAG-compliant contrast enforcement. It renders markdown to styled terminal output, visualizes diffs with word-level granularity across three display formats, collapses verbose tool output while preserving error context, and supports twelve built-in themes plus user-defined custom themes loaded from TOML files. The system operates at multiple abstraction layers — a TUI rendering layer built on ratatui, a UI message layer for structured output, and a raw ANSI layer for direct terminal control — each with its own markdown parser, diff engine, and ANSI processor tuned for different performance and fidelity requirements.

In this chapter, we'll build a complete terminal output engine. We'll start with the core output format system, then work through markdown rendering, diff visualization, ANSI processing, output collapsing, brief mode, and finally the theme and plugin architecture that makes all of it customizable.

---

## 29.1 The Output Format Engine

The output system begins with a deceptively simple question: what format should the output be in? The answer depends on context — a human at a terminal wants colors and formatting, a CI pipeline wants structured JSON, and a downstream tool consuming stdout wants plain text.

### The OutputFormat Enum

The format system is defined in `commands/output_style.rs` (259 lines):

```rust
pub enum OutputFormat {
    Concise,    // line_width 60,  color: true
    Normal,     // line_width 80,  color: true
    Verbose,    // line_width 100, color: true
    Json,       // line_width MAX, color: false
    Markdown,   // line_width 80,  color: false
    Plain,      // line_width 80,  color: false
}
```

Each variant controls three things: maximum line width before wrapping, whether ANSI color codes are emitted, and how key-value pairs are formatted. The `format_kv()` method shows the divergence clearly:

```rust
impl OutputFormat {
    pub fn format_kv(&self, key: &str, value: &str) -> String {
        match self {
            Self::Json => format!("\"{}\":\"{}\"", key, value),
            Self::Markdown => format!("**{}:** {}", key, value),
            Self::Plain => format!("{}: {}", key, value),
            _ => format!("\x1b[1m{}\x1b[0m: {}", key, value), // bold key
        }
    }
}
```

This enum is threaded through every output path. When a tool result needs to be displayed, the current format determines whether it gets ANSI bold headers, Markdown bold syntax, JSON quoting, or plain text labels. The design avoids the common mistake of sprinkling `if supports_color()` checks throughout the codebase — instead, the format decision is made once and propagated as a value.

### The Print Engine Entry Point

The print engine itself is defined in `cli/print.rs`, which acts as a coordination layer across the output primitives:

```rust
pub struct PrinterConfig {
    pub format: OutputFormat,
    pub width: usize,
    pub color: bool,
    pub syntax_theme: String,
}

pub struct Printer {
    config: PrinterConfig,
    theme: Theme,
    highlighter: SyntaxHighlightEngine,
}
```

The `Printer` delegates to specialized renderers based on content type. It owns a `TableBuilder` for tabular data, a `DiffFormatter` for change visualization, a `BoxStyle` for bordered content blocks, a `ProgressBar` for long-running operations, and a `TreeNode` renderer for hierarchical output. Each of these primitives respects the `PrinterConfig` — they never independently check terminal capabilities.

### Progress Indicators

Terminal output isn't just static text. Long-running operations need spinners and progress bars to signal liveness. The progress system in `tui/progress.rs` defines eighteen spinner styles:

```rust
pub enum SpinnerStyle {
    Dots,        // ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]
    Braille,     // braille pattern cycle
    Line,        // ["|","/","−","\\"]
    Arrow,       // ["←","↖","↑","↗","→","↘","↓","↙"]
    Circle,      // ["◐","◓","◑","◒"]
    Clock,       // 12 clock face emojis
    Moon,        // 8 moon phase emojis
    Pulse,       // ["█","▓","▒","░","▒","▓"]
    Star,        // ["✶","✸","✹","✺","✹","✸"]
    Pipe,        // ["┤","┘","┴","└","├","┌","┬","┐"]
    Binary,      // ["010010","001100","100101",...]
    BouncingBar, // ["[    ]","[=   ]","[==  ]",...]
    // ... plus 6 more
}
```

The progress bar system adds six visual styles — Blocks, Smooth, Ascii, Arrows, Thick, and Thin — each with partial-fill characters for sub-block precision. The `Smooth` style, for instance, uses Unicode block elements `▏▎▍▌▋▊▉█` to render fill levels at one-eighth character granularity, giving a polished feel without requiring any graphical toolkit.

---

## 29.2 Markdown Rendering for Terminal

Rendering markdown in a terminal is fundamentally different from rendering it in a browser. You have no DOM, no CSS, no proportional fonts. You have a grid of monospace characters, a fixed width, and ANSI escape codes for styling. The challenge is producing output that feels like reading formatted text — not like reading raw markup with some colors sprinkled on.

### The Markdown Parser

The primary markdown renderer lives in `tui/render.rs` (~1,200 lines). It defines a block-level AST:

```rust
pub enum MarkdownBlock {
    Paragraph(Vec<InlineElement>),
    Header(u8, Vec<InlineElement>),
    CodeBlock { lang: String, code: String },
    BlockQuote(Vec<MarkdownBlock>),
    UnorderedList(Vec<Vec<InlineElement>>),
    OrderedList(Vec<Vec<InlineElement>>),
    Table { headers: Vec<String>, rows: Vec<Vec<String>> },
    HorizontalRule,
}
```

The inline parser handles the six standard inline formatting constructs:

```rust
fn parse_inline_formatting(text: &str) -> Vec<InlineElement> {
    // Handles:
    // **bold** and __bold__
    // *italic* and _italic_
    // `inline code`
    // [text](url) links
    // ~~strikethrough~~
    // Nested combinations: **bold with `code` inside**
}
```

Parsing inline markdown correctly is trickier than it looks. Consider the string `"a_b_c * d_e * f"` — is `_b_` italic? Is `* d_e *` italic? The parser uses a greedy left-to-right scan with delimiter tracking, handling the common edge cases that trip up naive regex-based parsers (underscores in the middle of words, asterisks in mathematical expressions, backtick-delimited regions that suppress all other formatting).

### The Color Palette

The terminal color scheme uses a Dracula-inspired palette defined as RGB constants:

```rust
const HEADER1_COLOR: Color = Color::Rgb(189, 147, 249); // purple
const HEADER2_COLOR: Color = Color::Rgb(139, 233, 253); // cyan
const HEADER3_COLOR: Color = Color::Rgb(80, 250, 123);  // green
const BOLD_COLOR:    Color = Color::Rgb(255, 184, 108);  // orange
const ITALIC_COLOR:  Color = Color::Rgb(241, 250, 140);  // yellow
const CODE_COLOR:    Color = Color::Rgb(248, 248, 242);  // foreground
const CODE_BG:       Color = Color::Rgb(40, 42, 54);     // dark background
const LINK_COLOR:    Color = Color::Rgb(139, 233, 253);  // cyan
const QUOTE_COLOR:   Color = Color::Rgb(98, 114, 164);   // muted comment
```

These aren't arbitrary choices. Purple for H1 headers gives maximum visual weight — it's the rarest color in most terminal color schemes, so it pops. Cyan for H2 is the next most distinctive. Green for H3 provides a natural hierarchy. The code background uses a dark gray that provides contrast without overwhelming the content, matching the convention established by editors like VS Code and Sublime Text.

### Header Rendering with Box-Drawing Characters

Headers use Unicode box-drawing prefixes to create visual hierarchy without relying solely on color:

```rust
fn render_header(&self, level: u8, content: &[InlineElement]) -> Vec<Line<'static>> {
    let prefix = match level {
        1 => "█ ",   // full block — heaviest visual weight
        2 => "▌ ",   // left half block — medium weight
        3 => "▎ ",   // left one-quarter block — light weight
        _ => "  ",   // indent only
    };
    // Applies HEADER1_COLOR/HEADER2_COLOR/HEADER3_COLOR + Bold attribute
}
```

This is a crucial accessibility decision. Users with color-impaired vision or terminals that remap colors can still distinguish heading levels by the thickness of the block prefix. The blocks degrade gracefully — even on terminals that render them as simple rectangles, the size difference is visible.

### Code Block Rendering

Code blocks receive the most elaborate treatment because they're the most common output element in a coding assistant:

```rust
fn render_code_block(&self, lang: &str, code: &str) -> Vec<Line<'static>> {
    // Top border:    "╭─ rust ────────────────────────────╮"
    // Each line:     "│  1 │ fn main() {                  │"
    // Bottom border: "╰───────────────────────────────────╯"
}
```

The renderer draws a Unicode box around the code, embeds the language label in the top border (using the `╭─ lang ─╮` pattern), and adds line numbers with a thin separator. Inside the box, syntax highlighting is applied via the `SyntaxHighlightEngine` that wraps the `syntect` crate. The language is auto-detected from the fenced code block marker, with a fallback `LanguageDetector` that examines file extensions, filename patterns (Makefile, Dockerfile), shebang lines (`#!/usr/bin/env python`), and content heuristics — covering 20+ languages.

### Line Wrapping with Unicode Width

Line wrapping in a terminal cannot simply count bytes or even characters. A CJK character occupies two terminal columns. An ANSI escape sequence occupies zero. An emoji might occupy one or two columns depending on the terminal. The wrapping system uses display width calculation:

```rust
pub fn wrap_spans_to_lines(
    spans: &[StyledSpan],
    max_width: usize,
) -> Vec<Vec<StyledSpan>> {
    // Iterates through styled spans
    // Tracks current column position using display_width()
    // Splits spans at word boundaries when possible
    // Preserves style continuity across line breaks
    // Never breaks inside an ANSI escape sequence
}
```

The key insight here is that wrapping must operate on *styled spans*, not plain text. When a bold red span wraps to the next line, the continuation must carry the same bold red style — otherwise you get visual corruption where formatting "leaks" or drops at line boundaries. The implementation maintains a style stack and re-applies the current style at each line break.

---

## 29.3 Diff Visualization

Diff visualization is the second most important output feature after markdown rendering. Every file edit, every code suggestion, every conflict resolution flows through the diff engine. Claude Code implements two parallel diff systems — a TUI widget layer (`tui/diff_view.rs`, 2,392 lines) and a UI rendering layer (`ui/diff.rs`, 2,085 lines) — each optimized for different display contexts.

### Diff Computation

The diff engine supports three algorithms and three display formats:

```rust
pub enum DiffFormat    { Unified, SideBySide, Inline }
pub enum DiffAlgorithm { Myers, Patience, Lcs }

pub struct DiffOptions {
    pub format: DiffFormat,
    pub algorithm: DiffAlgorithm,
    pub context_lines: usize,          // default 3
    pub show_line_numbers: bool,
    pub word_diff: bool,
    pub ignore_whitespace: bool,
    pub tab_width: usize,
}
```

The algorithm choice matters more than you might expect. **Myers** (the default git algorithm) is fastest but produces suboptimal diffs when code is moved between functions — it finds a minimal edit distance but not necessarily the most *readable* edit distance. **Patience** diff produces more intuitive results for structural changes because it anchors on unique matching lines (like function signatures) and aligns changes around those anchors. **LCS** (longest common subsequence) is the classic dynamic programming approach — slower but deterministic in its output.

The engine is built on the `similar` crate, configured per invocation:

```rust
impl DiffComputer {
    pub fn compute_unified(
        old: &str,
        new: &str,
        options: &DiffOptions,
    ) -> DiffResult {
        // Configures similar::TextDiff with selected algorithm
        // Groups changes into hunks with context_lines
        // Optionally computes word-level diffs within changed lines
    }
}
```

### Word-Level Diff

Line-level diffs tell you *which* lines changed. Word-level diffs tell you *what* changed within those lines. This is the difference between seeing a whole line highlighted red/green versus seeing exactly which function argument was modified:

```rust
fn compute_word_diff(old_line: &str, new_line: &str) -> Vec<WordChange> {
    // Step 1: Tokenize both lines into words, punctuation, and whitespace
    // Step 2: Run similar::TextDiff::diff_slices on token arrays
    // Step 3: Return Vec<WordChange> with tag (Equal/Insert/Delete) and text
}
```

The tokenizer splits on word boundaries, preserving punctuation and whitespace as separate tokens. This means a change from `foo(bar, baz)` to `foo(bar, qux)` produces three word changes: `Equal("foo(bar, ")`, `Delete("baz")`, `Insert("qux")`, `Equal(")")`. The renderer then highlights only the changed words with bold and background color, making the actual change instantly visible.

### Color Mapping

The diff color system uses semantic tags mapped to both foreground and background colors:

```rust
pub enum DiffLineTag {
    Context,
    Added,
    Removed,
    ModifiedOld,
    ModifiedNew,
}

impl DiffLineTag {
    pub fn color(&self) -> Color {
        match self {
            Self::Context                     => Color::Gray,
            Self::Added | Self::ModifiedNew   => Color::Green,
            Self::Removed | Self::ModifiedOld => Color::Red,
        }
    }
    pub fn bg_color(&self) -> Option<Color> {
        match self {
            Self::Added | Self::ModifiedNew   => Some(Color::Rgb(0, 40, 0)),
            Self::Removed | Self::ModifiedOld => Some(Color::Rgb(40, 0, 0)),
            Self::Context                     => None,
        }
    }
}
```

The background colors are intentionally subtle — dark green (`#002800`) and dark red (`#280000`) — so they provide visual grouping without overwhelming the syntax highlighting applied to the actual code. This dual-channel approach (foreground color for the `+`/`-` gutter, background tint for the line content) is the same pattern used by GitHub's diff viewer and VS Code's inline diff, so it matches user expectations.

### Three Renderers

Each display format has its own renderer:

**UnifiedDiffRenderer** produces the classic `+`/`-` prefix format that every developer knows from `git diff`. It's the most compact format and works well for small changes.

**SideBySideDiffRenderer** splits the terminal into two columns separated by a `│` character, with old content on the left and new content on the right. Corresponding lines are paired so you can scan horizontally to see what changed. This format excels for refactoring where you want to compare old and new implementations simultaneously, but it halves your effective line width.

**InlineDiffRenderer** interleaves old and new lines within a single column, applying word-level highlights. Deleted content appears in red immediately followed by the replacement in green. This format is the most information-dense for changes that modify existing lines (as opposed to pure insertions or deletions).

### The Interactive Diff Widget

The TUI layer wraps the renderers in an interactive `DiffView` widget with keyboard navigation:

```rust
pub struct DiffView {
    diff_result: DiffResult,
    scroll_offset: usize,
    selected_hunk: usize,
    format: DiffFormat,
}

// Navigation:
// j/Down  = scroll down       k/Up     = scroll up
// n       = next hunk          p        = previous hunk
// u       = unified view       s        = side-by-side view
// i       = inline view
```

Users can switch between formats on the fly with `u`/`s`/`i` keystrokes, navigate between hunks with `n`/`p`, and scroll within hunks with `j`/`k`. The widget maintains scroll position when switching formats — it tracks the current hunk index, not the absolute scroll offset, so switching from unified to side-by-side keeps you at the same logical position in the diff.

### Git Diff Parsing

Raw git diffs arrive as text that must be parsed into structured data:

```rust
pub struct GitDiffParser;

impl GitDiffParser {
    pub fn parse(raw_diff: &str) -> Vec<FileDiff> {
        // Parses "diff --git a/... b/..." blocks
        // Extracts file paths, rename detection, binary flags
        // Parses @@ -old,count +new,count @@ hunk headers
        // Returns structured FileDiff entries with hunks
    }
}
```

The parser handles edge cases that trip up simpler implementations: binary files (which have no hunks), renamed files (which need the `similarity index` line), files with `---/+++` content that could be confused with diff headers, and symlink changes. Each `FileDiff` includes metadata about the change type (added, modified, deleted, renamed) that the UI uses to display appropriate icons and summary bars.

### Auto-Collapsing Large Diffs

The UI diff layer adds intelligent auto-collapsing:

```rust
pub struct DiffDisplay {
    hunks: Vec<Hunk>,
    collapsed: bool,
    summary: DiffSummary,
}
```

When a diff exceeds 100 changed lines (`COLLAPSE_THRESHOLD`), it automatically collapses to a summary view showing a visual bar `+++++++----` proportional to additions and deletions. The user can expand any individual hunk without expanding the entire diff. This prevents a 500-line generated file from burying the three-line configuration change that actually matters.

---

## 29.4 ANSI Processing

ANSI escape sequences are the assembly language of terminal formatting. Every bold word, every colored character, every background tint is ultimately an escape sequence that the terminal interprets. Claude Code operates on ANSI at three levels: a full parser for rendering, a width calculator for layout, and a byte-level stripper for cleaning command output.

### The Full ANSI Parser

The most complete parser lives in `ui/messages.rs`:

```rust
pub struct AnsiParser {
    current_fg: Option<Color>,
    current_bg: Option<Color>,
    bold: bool,
    italic: bool,
    underline: bool,
    dim: bool,
    strikethrough: bool,
}
```

The parser is a state machine. It scans input text for the escape introducer `\x1b[`, then reads SGR (Select Graphic Rendition) parameters — the semicolon-delimited numbers between `\x1b[` and `m` — and updates its style state. Everything between escape sequences becomes a styled `Span` with the current accumulated style.

The `apply_sgr()` method handles the full SGR parameter set:

```rust
impl AnsiParser {
    pub fn apply_sgr(&mut self, params: &str) {
        // Standard attributes:
        //   0 = reset all    1 = bold        2 = dim
        //   3 = italic       4 = underline   7 = reverse
        //   9 = strikethrough
        //
        // Attribute removal:
        //   22 = no bold/dim  23 = no italic  24 = no underline
        //
        // 8-color foreground: 30-37    background: 40-47
        // Bright foreground:  90-97    background: 100-107
        // 256-color:  38;5;N (fg)   48;5;N (bg)
        // True color: 38;2;R;G;B    48;2;R;G;B
        // Default:    39 (fg)       49 (bg)
    }
}
```

The tricky part is the 256-color and true-color sequences. `\x1b[38;5;196m` sets foreground to color 196 in the 256-color palette. `\x1b[38;2;255;128;0m` sets foreground to RGB(255, 128, 0). These use multi-parameter sequences where `38` means "extended foreground" and the next parameter (`5` or `2`) selects between 256-color and true-color mode. A parser that doesn't handle these correctly will misinterpret the remaining parameters as separate SGR codes, producing garbled output.

### Terminal Color Capability Detection

Not all terminals support all color modes. The system detects capabilities at startup:

```rust
pub enum ColorCapability {
    None,       // NO_COLOR env set, or dumb terminal
    Basic,      // 8 standard colors
    Color256,   // xterm-256color
    TrueColor,  // COLORTERM=truecolor or 24bit
}

impl ColorCapability {
    pub fn detect() -> Self {
        if env::var("NO_COLOR").is_ok() { return Self::None; }
        if env::var("COLORTERM").map_or(false, |v|
            v == "truecolor" || v == "24bit"
        ) { return Self::TrueColor; }
        if env::var("TERM").map_or(false, |v|
            v.contains("256color")
        ) { return Self::Color256; }
        if atty::is(atty::Stream::Stdout) { return Self::Basic; }
        Self::None
    }
}
```

This detection follows the standard convention: `NO_COLOR` is an explicit opt-out (see https://no-color.org/), `COLORTERM` signals true-color support, `TERM` containing `256color` signals 256-color mode, and a TTY without other signals gets basic 8-color. When piping to a file or another process, colors are disabled entirely. The detection result feeds into the `OutputFormat` selection, ensuring that ANSI sequences never leak into contexts that can't render them.

### Display Width Calculation

Computing how wide a string appears in a terminal requires three separate concerns: stripping invisible ANSI sequences, counting character widths (including double-width CJK), and ignoring control characters.

```rust
pub fn display_width(s: &str) -> usize {
    // 1. Strip all ANSI escape sequences
    // 2. For each remaining character:
    //    - Wide (CJK) characters count as 2 columns
    //    - Control characters count as 0 columns
    //    - Everything else counts as 1 column
}
```

The CJK width detection covers the full Unicode range:

```rust
pub fn is_wide_char(c: char) -> bool {
    let cp = c as u32;
    matches!(cp,
        0x1100..=0x115F    // Hangul Jamo
        | 0x2E80..=0x303E  // CJK Radicals, Kangxi, CJK Symbols
        | 0x3040..=0x33BF  // Hiragana, Katakana, Bopomofo, CJK Compat
        | 0x3400..=0x4DBF  // CJK Unified Ideographs Extension A
        | 0x4E00..=0x9FFF  // CJK Unified Ideographs
        | 0xA000..=0xA4CF  // Yi syllables
        | 0xAC00..=0xD7AF  // Hangul Syllables
        | 0xF900..=0xFAFF  // CJK Compatibility Ideographs
        | 0xFE30..=0xFE6F  // CJK Compatibility Forms
        | 0xFF01..=0xFF60  // Fullwidth Forms
        | 0xFFE0..=0xFFE6  // Fullwidth Signs
        | 0x1F000..=0x1F9FF // Emoticons and Symbols
        | 0x20000..=0x2FFFF // CJK Extension B+
        | 0x30000..=0x3FFFF // CJK Extension G+
    )
}
```

This function is called on every character during line wrapping, table column sizing, side-by-side diff layout, and progress bar rendering. It's one of those utility functions that touches everything but is invisible until it breaks — and when it breaks, CJK users see misaligned tables, diffs where the two columns don't line up, and code blocks where the border doesn't close.

### Byte-Level ANSI Stripping

Command output from bash tools arrives as raw bytes that may contain ANSI sequences, OSC (Operating System Command) sequences for terminal titles, and 8-bit CSI sequences from non-standard programs:

```rust
pub fn strip_ansi_escapes(input: &[u8]) -> Vec<u8> {
    // Handles three escape sequence types:
    // 1. CSI: \x1b[ ... (terminates at byte in 0x40-0x7E range)
    // 2. OSC: \x1b] ... (terminates at BEL \x07 or ST \x1b\\)
    // 3. 8-bit CSI: \x9b ... (terminates at byte in 0x40-0x7E range)
}
```

This operates on raw `&[u8]` rather than `&str` for two reasons. First, command output might not be valid UTF-8 — programs that write binary data to stdout produce bytes that Rust's `str` type would reject. Second, byte-level processing is significantly faster for large outputs (build logs, test suites, `find` results) where you're stripping thousands of escape sequences from megabytes of text.

---

## 29.5 Brief Mode and Condensed Output

Not every output needs full formatting. When context tokens are precious (approaching the model's context window limit) or when the user is scanning results quickly, condensed output trades visual richness for information density.

### The Brief System

The `Brief` structure in `tools/brief.rs` (504 lines) manages condensed output with token awareness:

```rust
pub struct Brief {
    pub summary: String,
    pub attachments: Vec<BriefAttachment>,
    pub created_at: u64,
    pub updated_at: u64,
    pub session_id: String,
    pub tags: Vec<String>,
}

const MAX_BRIEF_CHARS: usize = 16_000;
const MAX_BRIEF_TOKENS: usize = 4_000;
const MAX_ATTACHMENTS: usize = 10;
const CHARS_PER_TOKEN: usize = 4;
```

The token estimation uses a simple heuristic: approximately 4 characters per token. This isn't precise for all content types — code tends to have more tokens per character than prose because of short identifiers and punctuation — but it's fast and conservative enough to prevent context overflow. The `BriefTool` implements the standard `Tool` trait with four actions: `create`, `update`, `get`, and `clear`.

### Condensed Command Output

Bash command output gets special condensed treatment:

```rust
pub fn format_brief(output: &str, exit_code: i32) -> String {
    // For successful commands (exit_code == 0):
    //   First line + "... N more lines ..." + last line
    // For failed commands:
    //   Full output preserved — errors need complete context
}
```

This asymmetry is deliberate and important. A successful `npm install` might produce 200 lines of progress output, of which only the summary line matters. But a failed `npm install` produces error messages where line 47 might be the actual root cause, buried between dependency resolution output and post-install script failures. Truncating error output risks hiding the exact information needed to diagnose the problem.

### The Concise Format

`OutputFormat::Concise` provides the most aggressive formatting compression. It uses a 60-character line width (versus 80 for Normal and 100 for Verbose) and strips all decoration from key-value pairs. This format is designed for information-dense displays where you're presenting many results simultaneously — search results, test summaries, branch listings — and visual formatting would add noise rather than clarity.

---

## 29.6 Message Collapsing

When an AI coding assistant runs tools, the raw output can be enormous. A `grep` across a large codebase returns thousands of lines. A test suite produces pages of pass/fail results. A build log fills screens. Displaying all of this verbatim would bury the assistant's actual analysis in noise. The collapsing system solves this by intelligently truncating output while preserving the lines that matter most.

### The Collapsing Algorithm

The core logic lives in `utils/messages_deep.rs`:

```rust
pub struct CollapseResult {
    pub output: String,
    pub lines_hidden: usize,
    pub error_lines_preserved: Vec<String>,
}

pub fn collapse_tool_output(
    output: &str,
    max_lines: usize,
) -> CollapseResult {
    let lines: Vec<&str> = output.lines().collect();
    if lines.len() <= max_lines {
        return CollapseResult {
            output: output.to_string(),
            lines_hidden: 0,
            error_lines_preserved: vec![],
        };
    }

    let head_count = max_lines / 2;
    let tail_count = max_lines - head_count;
    let hidden_range = &lines[head_count..lines.len() - tail_count];
    let hidden_count = hidden_range.len();

    // Preserve error lines from hidden region
    let error_lines: Vec<String> = hidden_range.iter()
        .filter(|l| {
            l.contains("error") || l.contains("Error") ||
            l.contains("ERROR") || l.contains("panic") ||
            l.contains("FAILED")
        })
        .map(|l| l.to_string())
        .collect();

    let mut result = lines[..head_count].join("\n");
    result.push_str(&format!(
        "\n... [{} lines hidden] ...\n", hidden_count
    ));
    if !error_lines.is_empty() {
        result.push_str(
            "  [preserved error lines from hidden region:]\n"
        );
        for el in &error_lines {
            result.push_str(&format!("  > {}\n", el));
        }
    }
    result.push_str(&lines[lines.len() - tail_count..].join("\n"));

    CollapseResult {
        output: result,
        lines_hidden: hidden_count,
        error_lines_preserved: error_lines,
    }
}
```

The algorithm is a head/tail split with error extraction from the hidden middle section. It keeps the first N/2 lines (which typically include the command being run and initial output), the last N/2 lines (which typically include the summary and exit status), and then scans the hidden region for any line containing error-related keywords. These error lines are surfaced in a special `[preserved error lines]` section so they're never lost.

This design reflects a key insight about command output: the beginning and end are almost always the most informative parts. The beginning shows what was invoked. The end shows the result. The middle is usually repetitive progress output. But errors can appear anywhere — a compilation error on line 847 of a 2,000-line build log is exactly the line you need — so error extraction from the hidden region is essential.

### Fold State Management

The TUI layer manages collapsible sections through a `FoldState`:

```rust
pub struct FoldState {
    collapsed: HashMap<usize, bool>,
    pub threshold: usize,  // default 30 lines
}

impl FoldState {
    pub fn auto_collapse(&mut self, index: usize, line_count: usize) {
        if line_count > self.threshold {
            self.collapsed.insert(index, true);
        }
    }
    pub fn toggle(&mut self, index: usize) { /* flip state */ }
    pub fn is_collapsed(&self, index: usize) -> bool { /* lookup */ }
}
```

Any tool output exceeding 30 lines is automatically collapsed. The user can toggle individual sections to expand them. The threshold is deliberately conservative — 30 lines is roughly one screen of output at typical terminal sizes. This means that by default, each tool result takes at most one screen of vertical space, keeping the conversation navigable even after dozens of tool invocations.

### Tool Output Classification

The display system classifies tool output by type to apply appropriate formatting:

```rust
pub enum OutputType {
    PlainText, Code, Diff, Error, Json, Table, Xml, Log,
}

pub enum FileChangeKind {
    Created,    // icon: "+", color: green
    Modified,   // icon: "~", color: yellow
    Deleted,    // icon: "-", color: red
    Renamed,    // icon: ">", color: cyan
}
```

Each `OutputType` gets different rendering treatment. `Code` output receives syntax highlighting. `Diff` output is routed through the diff visualization pipeline. `Error` output gets red styling and is never auto-collapsed. `Json` output gets pretty-printing with indentation. `Log` output is parsed to detect common log formats (`[LEVEL] message`, `timestamp LEVEL msg`) and colorize severity levels. The classification happens automatically by examining the content — the tool doesn't need to declare its output type.

### Conversation Compaction

At a higher level, the entire conversation history undergoes compaction as it approaches the context window limit. The system in `engine/compact_system.rs` defines five escalating strategies:

```rust
pub struct CompactConfig {
    pub auto_compact_threshold: f32,    // 0.80 = 80% of context
    pub micro_compact_threshold: f32,   // 0.50
    pub preserve_recent_turns: usize,   // 3
}

pub enum CompactStrategy {
    Micro,          // ~15% token savings
    Light,          // ~30% savings
    Medium,         // ~55% savings
    Full,           // ~75% savings
    SessionMemory,  // ~80% savings, extracts key facts
}
```

The auto-compactor monitors token usage and triggers at configurable thresholds. At 50% capacity, it applies `Micro` compaction — summarizing tool outputs that were already processed. At 80%, it escalates to heavier strategies. The `preserve_recent_turns` setting ensures the last three conversation exchanges are never compacted, since the model needs recent context to maintain coherence.

The deep compaction system in `engine/compact_deep.rs` adds time-based aging:

```rust
pub struct AutoCompactConfig {
    pub trigger_token_count: usize,  // 120_000
    pub auto_escalation: bool,
    pub time_based_aging: bool,
}
```

With time-based aging enabled, older messages receive more aggressive compaction than recent ones. A tool output from 45 minutes ago that has already been discussed gets compacted more heavily than one from 5 minutes ago that the user might still reference. This produces a natural "forgetting curve" where the conversation retains recent detail while older context fades to summaries.

---

## 29.7 Output Styles and Theming

The final layer of the output system is theming — the ability to change every color in the interface from a single configuration point, including custom themes loaded from external files.

### The Theme Architecture

The theme system in `tui/themes.rs` (1,936 lines) defines a comprehensive color mapping:

```rust
pub struct Theme {
    pub name: String,
    pub colors: ThemeColors,
    pub syntax: SyntaxColors,
    pub ui: UiColors,
    pub diff: DiffColors,
    pub diagnostics: DiagnosticColors,
}

pub struct ThemeManager {
    themes: HashMap<String, Theme>,
    active: String,
    custom_dir: PathBuf,
}
```

The `ThemeManager` loads twelve built-in themes: dark, light, solarized_dark, solarized_light, monokai, dracula, nord, gruvbox_dark, gruvbox_light, catppuccin_mocha, tokyo_night, and one_dark. Each theme provides complete color definitions across five categories — general colors, syntax highlighting colors, UI element colors, diff colors, and diagnostic severity colors.

### Semantic Colors

Rather than scattering concrete color values throughout the codebase, the system uses semantic color tokens:

```rust
pub enum SemanticColor {
    Error, Warning, Info, Success,
    Muted, Accent, Link, Code,
    Heading, Emphasis, StringLiteral,
    NumberLiteral, Keyword, Comment,
}
```

Every rendering call uses semantic tokens: "render this as `Error`" rather than "render this in red". The active theme maps each semantic token to a concrete color and style. This means switching from a dark theme to a light theme doesn't just swap background colors — it inverts the entire semantic palette so that `Error` remains high-contrast and visually alarming regardless of the background.

### Custom Theme Loading

The `ThemeManager` scans a configurable directory for TOML files:

```rust
impl ThemeManager {
    pub fn load_custom_themes(&mut self) -> Result<()> {
        // Scans custom_dir for *.toml files
        // Parses each TOML file into a Theme struct
        // Registers theme by name
    }

    pub fn register_theme(&mut self, theme: Theme) { ... }
    pub fn set_active(&mut self, name: &str) -> Result<()> { ... }
    pub fn get_active(&self) -> &Theme { ... }
}
```

A custom theme TOML file specifies color values as hex strings, and the parser converts them to `Color::Rgb` values. This allows teams to create branded themes that match their corporate color palette, or individual users to match their terminal's existing color scheme precisely.

### WCAG-Compliant Contrast Enforcement

The most sophisticated piece of the color system is automatic contrast enforcement:

```rust
pub struct ColorUtil;

impl ColorUtil {
    pub fn hex_to_color(hex: &str) -> Color { ... }
    pub fn darken(color: Color, amount: f32) -> Color { ... }
    pub fn lighten(color: Color, amount: f32) -> Color { ... }
    pub fn blend(a: Color, b: Color, ratio: f32) -> Color { ... }
    pub fn contrast_ratio(fg: Color, bg: Color) -> f32 { ... }

    pub fn ensure_contrast(
        fg: Color,
        bg: Color,
        min_ratio: f32,
    ) -> Color {
        // WCAG 2.0 contrast enforcement
        // Iteratively lightens or darkens fg
        // Until minimum contrast ratio is met
    }
}
```

`ensure_contrast()` takes a foreground color, a background color, and a minimum contrast ratio (WCAG 2.0 AA requires 4.5:1 for normal text, 3:1 for large text). If the pair doesn't meet the minimum, it iteratively adjusts the foreground — lightening on dark backgrounds, darkening on light backgrounds — until the ratio passes. This means that even a poorly designed custom theme produces *readable* output, because every color pairing is validated before it reaches the terminal.

The contrast ratio calculation follows the WCAG 2.0 algorithm: compute relative luminance for both colors using the sRGB-to-luminance formula (with the 0.04045 threshold for the linear/gamma boundary), then compute `(L1 + 0.05) / (L2 + 0.05)` where L1 is the lighter color. This is the same algorithm that browser accessibility tools use, applied at the terminal output level.

### The Color Scheme Command

For users who don't want the full theme system, a simpler `ColorScheme` enum provides preset palettes:

```rust
pub enum ColorScheme {
    Auto,        // detect from terminal background
    Dark, Light,
    Solarized, Monokai, Nord, Dracula,
    None,        // disable all colors
}
```

Each scheme maps semantic names ("primary", "success", "warning", "error", "muted") to 256-color ANSI codes, providing broad terminal compatibility without requiring true-color support.

---

## 29.8 Putting It All Together

The output pipeline, from model response to terminal pixels, flows through these stages:

```
Model Response (markdown text)
       │
       ▼
  MarkdownParser
  ├── Headers → box-drawing prefixes + header colors
  ├── Code blocks → syntax highlighting + bordered boxes
  ├── Inline formatting → bold/italic/code/link spans
  ├── Tables → aligned columns with Unicode borders
  └── Block quotes → indented with QUOTE_COLOR
       │
       ▼
  Theme Application
  ├── SemanticColor → concrete Color via active Theme
  └── ensure_contrast() → WCAG compliance check
       │
       ▼
  Line Wrapping
  ├── display_width() for Unicode-correct column counting
  ├── Style continuity across line breaks
  └── Word-boundary splitting when possible
       │
       ▼
  Output Format Selection
  ├── Terminal → ANSI escape sequences
  ├── JSON → structured data, no colors
  ├── Markdown → raw markdown, no ANSI
  └── Plain → stripped text
       │
       ▼
  Collapsing & Compaction
  ├── Tool outputs > 30 lines auto-folded
  ├── Error lines preserved from hidden regions
  └── Conversation compacted at 80% context usage
       │
       ▼
  Terminal
```

Each stage is independently testable. The markdown parser doesn't know about ANSI codes — it produces styled spans. The theme system doesn't know about markdown — it maps semantic tokens to colors. The line wrapper doesn't know about themes — it operates on width calculations. The collapsing system doesn't know about rendering — it operates on line counts and pattern matching. This separation means you can add a new output format (say, HTML for a web interface) by implementing a new renderer at the "Output Format Selection" stage without touching any upstream logic.

The total system — ~12,000 lines across eighteen files — handles the full range of terminal output challenges: internationalization through CJK width tables, accessibility through WCAG contrast enforcement, performance through byte-level ANSI stripping, usability through intelligent collapsing, and aesthetics through a twelve-theme palette with custom TOML extension. It is, line for line, the subsystem that most directly determines whether users perceive the tool as polished or rough. And it earns every one of those lines.

---

## Summary

The output and formatting engine is the product surface — the layer that users actually experience. It operates at three abstraction levels (TUI widgets, UI messages, raw ANSI) with specialized implementations at each level tuned for different performance and fidelity requirements. The markdown renderer uses box-drawing characters and a Dracula-inspired palette to create readable terminal output. The diff engine supports three algorithms and three display formats with word-level granularity. ANSI processing handles the full SGR parameter set including true-color, with CJK-aware width calculation for correct layout. The collapsing system preserves error context while keeping the conversation navigable. And the theme architecture provides twelve built-in themes, TOML-based custom themes, and WCAG-compliant contrast enforcement — ensuring that the output is not just colorful, but readable for everyone.

In [Chapter 30](chapter-30.md), we'll move from output formatting to the Model Context Protocol (MCP) architecture — the system that extends Claude Code's capabilities by connecting to external servers, each providing tools, resources, and prompts through a standardized protocol.
