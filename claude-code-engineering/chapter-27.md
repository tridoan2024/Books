# Chapter 27: The REPL Screen

In Chapter 26, we dissected the Ink rendering engine — the custom terminal DOM that turns React components into ANSI escape sequences painted onto your terminal. That engine is the foundation. Now we build the cathedral on top of it.

The REPL screen is Claude Code's main interface. Every keystroke you type, every streaming response you watch assemble word by word, every tool result that unfolds beneath a spinner — all of it routes through a single file: `screens/REPL.tsx`. At 5,005 lines, it is the largest React component in the entire codebase, orchestrating over 80 custom hooks, a virtual scrolling engine, a typeahead system, background task management, and session lifecycle control. It is the cockpit of the application.

This chapter is about how that cockpit works. We will walk through the component hierarchy that structures the screen, the hooks that power its behavior, the virtual scrolling system that keeps 10,000-line conversations responsive, the typeahead engine that surfaces file paths and slash commands as you type, and the background task infrastructure that lets you fork conversations while Claude works. By the end, you will understand not just what the REPL screen does, but why a 5,000-line component is the right design — and how to build one that does not collapse under its own weight.

---

## 27.1 The Component Hierarchy

The REPL screen does not exist in isolation. It sits inside a component tree that looks deceptively simple:

```
App
 └── REPL
      ├── MessageList
      │    ├── UserMessage
      │    ├── AssistantMessage
      │    │    ├── TextBlock
      │    │    ├── ToolUseBlock
      │    │    │    └── ToolResult
      │    │    └── ThinkingBlock
      │    └── SystemMessage
      ├── PromptInput
      │    ├── TextInput
      │    ├── TypeaheadOverlay
      │    └── StatusLine
      ├── PermissionPrompt
      ├── SidePanel
      └── BackgroundTaskBar
```

Three things are notable about this hierarchy. First, `REPL` is the god component — it owns nearly all application state and passes it down via props and context. Second, `MessageList` and `PromptInput` are the two heavyweight children, each large enough to warrant their own chapters (Chapter 28 covers Input in detail). Third, the hierarchy is deliberately flat. There are no intermediate "container" or "layout" components wrapping things for organizational purity. The REPL renders its children directly because terminal UIs cannot afford the layout overhead of deep nesting — every extra Ink `<Box>` node means another Yoga layout calculation.

### The REPL Component's Core Structure

The REPL component follows a pattern you will see in many large interactive applications: a state machine wrapped in a render function. The component's 5,005 lines break down roughly as follows:

| Section | Lines (approx.) | Purpose |
|---------|-----------------|---------|
| Imports and type definitions | 1–180 | Dependencies, interfaces, enums |
| Hook declarations | 180–1,400 | 80+ hooks wiring up all behavior |
| Event handlers | 1,400–2,800 | Keyboard, mouse, resize, paste, stream events |
| State machine logic | 2,800–3,600 | Mode transitions, permission flow, error recovery |
| Helper functions | 3,600–4,200 | Message formatting, scroll math, layout calculation |
| Render function | 4,200–5,005 | JSX that assembles the screen |

The key insight is that the render function — the part that actually produces JSX — is only about 800 lines. The other 4,200 lines are behavior. This is typical of complex interactive components: rendering is the easy part. The hard part is managing state transitions, coordinating async operations, and handling the combinatorial explosion of user interactions.

### State Ownership and the "God Component" Pattern

In web development, the "god component" is an anti-pattern. In terminal UIs, it is often the correct choice. Here is why.

Terminal applications have fundamentally different constraints than web applications. There is no CSS grid spanning multiple components. There is no event bubbling through a DOM tree. There is no browser layout engine handling reflows. The terminal is a character grid, and the REPL component needs to know exactly how many rows and columns it has, exactly where the cursor is, exactly which messages are visible, and exactly what mode the application is in — all at the same time, all in a single render pass.

Splitting this state across multiple components creates coordination problems. If `MessageList` owns scroll state and `PromptInput` owns cursor state, who decides what happens when the user presses Page Up while mid-sentence? The answer is the REPL — it always was the REPL. Distributing the state just adds indirection.

The REPL component centralizes state into a single struct-like shape:

```typescript
// Simplified from the actual component — real version has 80+ state variables
function REPL({ config, session }: REPLProps) {
  // === Mode and lifecycle ===
  const [mode, setMode] = useState<InputMode>('normal');
  const [shouldQuit, setShouldQuit] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  // === Conversation state ===
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [streamingBuffer, setStreamingBuffer] = useState('');
  const [activeTools, setActiveTools] = useState<ActiveTool[]>([]);

  // === Scroll state ===
  const [scrollOffset, setScrollOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [totalLines, setTotalLines] = useState(0);

  // === Input state ===
  const [inputValue, setInputValue] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // === Permission state ===
  const [permissionRequest, setPermissionRequest] = useState<PermissionState | null>(null);

  // === Layout state ===
  const [terminalWidth, setTerminalWidth] = useState(process.stdout.columns);
  const [terminalHeight, setTerminalHeight] = useState(process.stdout.rows);
  const [sidePanelVisible, setSidePanelVisible] = useState(false);

  // ... 60+ more state variables
```

In a web app, you would reach for Redux or Zustand. In a terminal app rendering at 100ms tick intervals, external state management adds latency you cannot afford. Direct `useState` with careful update batching is faster and — critically — easier to debug when something goes wrong.

---

## 27.2 The 80+ Hooks That Power the REPL

The REPL component calls over 80 custom hooks. This is not a code smell — it is the result of a deliberate decomposition strategy. Each hook encapsulates one behavioral concern, and the REPL component composes them into a coherent whole. Think of hooks not as React's abstraction mechanism, but as the REPL's nervous system — each hook is a nerve fiber carrying one signal.

### Hook Categories

The hooks fall into seven categories:

**1. Input Handling (12 hooks)**

```typescript
const { value, cursor, insert, delete: del, ... } = useTextInput(config);
const { handleKey } = useKeyBindings(mode, keymap);
const { search, results, select } = useHistorySearch(history);
const { detect, flush } = usePasteDetection();
const { vim } = useVimMode(config.vimEnabled);
```

Input hooks manage the text editor — cursor movement, character insertion, word deletion, clipboard operations, paste detection (distinguishing between fast typing and a paste event by timing inter-keystroke intervals), and optional Vim mode. Chapter 28 covers these in exhaustive detail.

**2. Scroll Management (6 hooks)**

```typescript
const scroll = useVirtualScroll(messages, viewportHeight);
const { isSearching, searchTerm, highlights } = useScrollSearch();
const { jumpTo, anchors } = useMessageAnchors(messages);
```

Scroll hooks manage the virtual viewport, search-within-conversation, and anchor-based navigation (jumping to specific messages by index).

**3. Typeahead and Completion (8 hooks)**

```typescript
const typeahead = useTypeahead(inputValue, cursorPosition, cwd);
const { complete, cycle, dismiss } = useTabCompletion(commands, files);
const { suggest, accept } = useSlashCommandSuggestion(commands);
const fileSuggestions = useFileSuggestion(inputValue, cwd);
```

Completion hooks surface suggestions as the user types — slash commands starting with `/`, file paths starting with `@`, and inline completions for common patterns.

**4. Streaming and Messages (10 hooks)**

```typescript
const stream = useStreamingResponse(session);
const { append, finalize } = useStreamBuffer();
const { format, collapse } = useMessageFormatting(terminalWidth);
const { track, spinners } = useToolTracking();
const costDisplay = useCostTracking(messages);
```

Streaming hooks handle the real-time flow of tokens from the API, buffer management for partial renders, message formatting (markdown to terminal), tool execution tracking (spinner animation, progress), and cost/token accounting.

**5. Session and Lifecycle (15 hooks)**

```typescript
const session = useSession(config);
const { save, restore } = useSessionPersistence(sessionId);
const { fork, background, foreground } = useSessionForking();
const { connected, reconnect } = useConnectionStatus();
const { idle, active } = useIdleDetection(IDLE_TIMEOUT);
```

Session hooks manage the connection to Claude's API, session persistence (saving/restoring conversation state), session forking (running a task in the background while starting a new conversation), connection health monitoring, and idle timeout handling.

**6. Layout and Rendering (10 hooks)**

```typescript
const layout = useTerminalLayout();
const { width, height, onResize } = useTerminalSize();
const { columns } = useResponsiveLayout(width);
const statusLine = useStatusLine(mode, session, config);
const { theme, colors } = useTheme(config.theme);
```

Layout hooks handle terminal resize events, responsive breakpoints (adjusting layout when the terminal is narrow), status line content generation, and theme management.

**7. Integration and Side Effects (19+ hooks)**

```typescript
const memory = useMemory(config);
const { check, request } = usePermissions(config.permissionMode);
const notifications = useNotifications();
const { tasks, create, complete } = useTaskManagement();
const hooks = useHookExecution(config.hooks);
const mcp = useMCPServers(config.mcpServers);
```

Integration hooks connect the REPL to external systems — the memory layer, the permission system, desktop notifications, the task tracking system, lifecycle hooks, and MCP server connections.

### Why Not Fewer, Larger Hooks?

A natural question: why 80 small hooks instead of 15 medium ones? The answer is testability and composability.

Each hook can be tested in isolation. `useVirtualScroll` does not need a real terminal — give it a message array and viewport height, and you can assert on scroll positions. `usePasteDetection` does not need a real keyboard — feed it keystroke timestamps and assert on detection thresholds. Small hooks mean small test surfaces.

Composability matters because not every screen needs every hook. The compact mode that runs during `/compact` operations uses a subset of these hooks. The permission prompt overlay uses only the keyboard and layout hooks. By keeping hooks granular, each screen variant picks exactly what it needs.

---

## 27.3 Virtual Scrolling

A Claude Code conversation can easily reach 10,000 rendered lines. Rendering all of them every frame would be catastrophic — even with Ink's differential rendering (Chapter 26), computing the layout for 10,000 lines of styled text takes hundreds of milliseconds. Virtual scrolling solves this by rendering only the lines visible in the viewport, plus a small buffer above and below for smooth scrolling.

### The Core Data Structure

The virtual scroll implementation centers on a `ScrollState` object that tracks three values:

```typescript
interface ScrollState {
  offset: number;        // Lines scrolled from the top
  totalLines: number;    // Total rendered lines across all messages
  viewportHeight: number; // Visible rows in the terminal
}
```

From these three values, everything else derives:

```typescript
// Which lines are visible right now
const visibleStart = offset;
const visibleEnd = Math.min(offset + viewportHeight, totalLines);

// How far can we scroll
const maxOffset = Math.max(0, totalLines - viewportHeight);

// Are we at the bottom (should auto-scroll on new content)
const isAtBottom = offset >= maxOffset;
```

The `maxOffset` calculation is the most important line. It ensures you cannot scroll past the last screenful of content, and it defines the "auto-scroll zone" — when `offset >= maxOffset`, new messages automatically scroll into view.

### The useVirtualScroll Hook

The virtual scroll hook manages offset updates and exposes navigation methods:

```typescript
function useVirtualScroll(
  messages: DisplayMessage[],
  viewportHeight: number
) {
  const [offset, setOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const totalLinesRef = useRef(0);

  // Recompute total lines when messages change
  useEffect(() => {
    let total = 0;
    for (const msg of messages) {
      total += msg.renderedHeight; // Pre-computed line count
    }
    totalLinesRef.current = total;

    // If auto-scroll is on, snap to bottom
    if (autoScroll) {
      setOffset(Math.max(0, total - viewportHeight));
    }
  }, [messages, viewportHeight, autoScroll]);

  const scrollUp = useCallback((lines: number = 1) => {
    setOffset(prev => Math.max(0, prev - lines));
    setAutoScroll(false); // User scrolled up, disable auto-scroll
  }, []);

  const scrollDown = useCallback((lines: number = 1) => {
    setOffset(prev => {
      const maxOffset = Math.max(0, totalLinesRef.current - viewportHeight);
      const next = Math.min(maxOffset, prev + lines);
      // Re-enable auto-scroll if we hit the bottom
      if (next >= maxOffset) setAutoScroll(true);
      return next;
    });
  }, [viewportHeight]);

  const scrollToBottom = useCallback(() => {
    const maxOffset = Math.max(0, totalLinesRef.current - viewportHeight);
    setOffset(maxOffset);
    setAutoScroll(true);
  }, [viewportHeight]);

  const pageUp = useCallback(() => scrollUp(viewportHeight - 2), [scrollUp, viewportHeight]);
  const pageDown = useCallback(() => scrollDown(viewportHeight - 2), [scrollDown, viewportHeight]);

  // Return which lines to render
  const visibleRange = useMemo(() => ({
    start: offset,
    end: Math.min(offset + viewportHeight, totalLinesRef.current),
  }), [offset, viewportHeight]);

  return { offset, autoScroll, visibleRange, scrollUp, scrollDown, pageUp, pageDown, scrollToBottom };
}
```

### The Auto-Scroll Contract

Auto-scroll is the behavior users expect but never think about: when Claude is streaming a response, new lines appear and the viewport follows. When you scroll up to re-read something, the viewport stays put even as new content arrives below. When you scroll back to the bottom, auto-scroll re-engages.

The contract is simple:

1. **Auto-scroll starts ON.** New messages snap the viewport to the bottom.
2. **Any upward scroll disables auto-scroll.** Even scrolling up by one line.
3. **Scrolling to the exact bottom re-enables auto-scroll.** Specifically, `offset >= maxOffset`.
4. **Pressing a "go to bottom" shortcut forces auto-scroll on.** This is Cmd+End or `G` in Vim mode.

The critical edge case is step 3. When streaming content arrives while the user is scrolled up, `totalLines` increases but `offset` stays fixed. The user sees the same content, and a subtle indicator appears showing "N new lines below." Only when they scroll down far enough that `offset >= maxOffset` does auto-scroll kick back in — and at that point, the viewport snaps to the very bottom, potentially jumping past content the user has not read. This is intentional: re-engaging auto-scroll is an explicit user action.

### Viewport-Sliced Rendering

The performance win from virtual scrolling comes not from skipping React renders, but from skipping layout computation. The `MessageList` component only lays out messages within the visible range:

```typescript
function MessageList({ messages, visibleRange, renderer }: MessageListProps) {
  // Only compute rendered output for visible messages
  const visibleMessages = useMemo(() => {
    const result: RenderedMessage[] = [];
    let lineAccumulator = 0;

    for (const msg of messages) {
      const msgEnd = lineAccumulator + msg.renderedHeight;

      // Skip messages entirely above the viewport
      if (msgEnd <= visibleRange.start) {
        lineAccumulator = msgEnd;
        continue;
      }

      // Stop once we pass below the viewport
      if (lineAccumulator >= visibleRange.end) break;

      // This message is (partially) visible — render it
      const rendered = renderer.renderMessage(msg);

      // If partially visible, slice the rendered lines
      const sliceStart = Math.max(0, visibleRange.start - lineAccumulator);
      const sliceEnd = Math.min(
        rendered.lines.length,
        visibleRange.end - lineAccumulator
      );

      result.push({
        ...rendered,
        lines: rendered.lines.slice(sliceStart, sliceEnd),
      });

      lineAccumulator = msgEnd;
    }

    return result;
  }, [messages, visibleRange, renderer]);

  return (
    <Box flexDirection="column">
      {visibleMessages.map(msg => (
        <MessageView key={msg.id} rendered={msg} />
      ))}
    </Box>
  );
}
```

The `slice` operation on line arrays is the key performance optimization. A message that renders to 500 lines of markdown but is only partially visible (say, lines 490–500 are in the viewport) produces only 10 `Line` objects for the Ink layout engine to process. Without slicing, every frame would compute layout for all 500 lines and then discard 490 of them.

### Pre-Computing Rendered Heights

Virtual scrolling requires knowing each message's rendered height *before* rendering it. This creates a chicken-and-egg problem: you need the height to decide which messages are visible, but you need to render a message to know its height.

The solution is a two-pass approach. When a message arrives or the terminal resizes, a background computation estimates rendered heights:

```typescript
function computeRenderedHeight(message: DisplayMessage, width: number): number {
  let lines = 0;

  // Header: role icon + name + timestamp = 1 line
  lines += 1;

  // Content: wrap each paragraph to terminal width
  for (const block of message.content) {
    if (block.type === 'text') {
      lines += wrapText(block.text, width).length;
    } else if (block.type === 'code') {
      // Code blocks: line count + 2 for fences + 1 for language label
      lines += block.code.split('\n').length + 3;
    } else if (block.type === 'tool_use') {
      lines += 2; // Header + collapsed summary
    } else if (block.type === 'tool_result') {
      // Capped at MAX_TOOL_OUTPUT_LINES (default: 20)
      const outputLines = block.output.split('\n').length;
      lines += Math.min(outputLines, MAX_TOOL_OUTPUT_LINES) + 1;
    }
  }

  // Separator line between messages
  lines += 1;

  return lines;
}
```

This estimation is *approximate* — it does not account for Unicode wide characters, complex markdown tables, or nested list indentation. The actual rendered height may differ by a few lines. The scroll system tolerates this imprecision because the viewport buffer (rendering a few extra lines above and below) absorbs small mismatches. If you scroll to a specific message anchor, the system re-measures the actual height at that point and corrects the offset.

---

## 27.4 The Typeahead System

Claude Code's typeahead is the feature users interact with most frequently without noticing. It powers three distinct completion surfaces:

1. **Slash command completion** — typing `/` shows available commands: `/commit`, `/clear`, `/compact`, etc.
2. **File path completion** — typing `@` shows files in the current directory, with fuzzy matching.
3. **Inline suggestions** — typing certain patterns (like a function name after "fix ") shows contextual suggestions.

### Architecture Overview

The typeahead system is split into three layers:

```
┌────────────────────────────────────────────┐
│  TypeaheadOverlay (UI)                      │
│  Renders the dropdown, handles selection    │
└────────────────┬───────────────────────────┘
                 │
┌────────────────┴───────────────────────────┐
│  useTypeahead (Coordinator)                 │
│  Determines which completer to invoke       │
│  Manages visibility, selection index        │
└────────────────┬───────────────────────────┘
                 │
      ┌──────────┼──────────┐
      ▼          ▼          ▼
┌──────────┐ ┌────────┐ ┌──────────┐
│ Command  │ │  File  │ │ Context  │
│Completer │ │Completer│ │Completer │
└──────────┘ └────────┘ └──────────┘
```

### The useTypeahead Hook

The coordinator hook inspects the current input to decide which completer to engage:

```typescript
function useTypeahead(
  input: string,
  cursorPosition: number,
  cwd: string
) {
  const [results, setResults] = useState<CompletionResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  // Extract the "word" being typed at the cursor position
  const currentWord = useMemo(() => {
    const beforeCursor = input.slice(0, cursorPosition);
    const match = beforeCursor.match(/(\S+)$/);
    return match ? match[1] : '';
  }, [input, cursorPosition]);

  // Determine which completer to use based on prefix
  useEffect(() => {
    if (currentWord.startsWith('/')) {
      // Slash command completion
      const matches = completeCommand(currentWord, availableCommands);
      setResults(matches);
      setVisible(matches.length > 0);
    } else if (currentWord.startsWith('@')) {
      // File path completion — async because it hits the filesystem
      completeFilePath(currentWord.slice(1), cwd).then(matches => {
        setResults(matches);
        setVisible(matches.length > 0);
      });
    } else {
      setVisible(false);
    }
    setSelectedIndex(0); // Reset selection on every input change
  }, [currentWord, cwd]);

  const accept = useCallback(() => {
    if (!visible || results.length === 0) return null;
    const selected = results[selectedIndex];
    setVisible(false);
    return selected;
  }, [visible, results, selectedIndex]);

  const cycle = useCallback((direction: 1 | -1) => {
    setSelectedIndex(prev => {
      const next = prev + direction;
      if (next < 0) return results.length - 1;
      if (next >= results.length) return 0;
      return next;
    });
  }, [results.length]);

  return { results, selectedIndex, visible, accept, cycle, dismiss: () => setVisible(false) };
}
```

### Slash Command Completion

Slash command completion is the simpler case — the command list is static and small (typically 30–70 commands). Matching uses prefix filtering with fuzzy fallback:

```typescript
function completeCommand(
  partial: string,
  commands: CommandDefinition[]
): CompletionResult[] {
  const query = partial.slice(1).toLowerCase(); // Remove leading '/'

  // Exact prefix matches first
  const prefixMatches = commands
    .filter(cmd => cmd.name.toLowerCase().startsWith(query))
    .map(cmd => ({
      text: `/${cmd.name}`,
      description: cmd.description,
      score: 100 + (cmd.name.length === query.length ? 50 : 0), // Exact match bonus
    }));

  // Fuzzy matches second (only if few prefix matches)
  let fuzzyMatches: CompletionResult[] = [];
  if (prefixMatches.length < 5) {
    fuzzyMatches = commands
      .filter(cmd => !cmd.name.toLowerCase().startsWith(query))
      .filter(cmd => fuzzyMatch(query, cmd.name))
      .map(cmd => ({
        text: `/${cmd.name}`,
        description: cmd.description,
        score: fuzzyScore(query, cmd.name),
      }));
  }

  return [...prefixMatches, ...fuzzyMatches]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10); // Cap at 10 results
}
```

### File Path Completion

File completion is more complex because it involves the filesystem. The implementation uses a cached directory tree with lazy expansion:

```typescript
class FileCompleter {
  private cache: Map<string, PathEntry[]> = new Map();
  private cwd: string;
  private maxDepth: number = 3;
  private maxResults: number = 50;

  async complete(partial: string): Promise<CompletionResult[]> {
    const normalized = partial.replace(/^~/, os.homedir());
    const dir = path.dirname(normalized);
    const base = path.basename(normalized);

    // Check cache first
    let entries = this.cache.get(dir);
    if (!entries) {
      entries = await this.scanDirectory(dir);
      this.cache.set(dir, entries);
    }

    // Filter by prefix
    return entries
      .filter(entry => entry.name.toLowerCase().startsWith(base.toLowerCase()))
      .sort((a, b) => {
        // Directories first, then alphabetical
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, this.maxResults)
      .map(entry => ({
        text: `@${path.join(dir, entry.name)}${entry.isDirectory ? '/' : ''}`,
        description: entry.isDirectory ? 'directory' : this.formatSize(entry.size),
        icon: entry.isDirectory ? '/' : this.fileIcon(entry.name),
        score: 0,
      }));
  }

  private async scanDirectory(dir: string): Promise<PathEntry[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries
        .filter(e => !e.name.startsWith('.')) // Skip hidden files by default
        .map(e => ({
          name: e.name,
          isDirectory: e.isDirectory(),
          size: 0, // Lazy — only stat if needed for display
        }));
    } catch {
      return []; // Directory not readable
    }
  }
}
```

The cache is invalidated on directory change (`cwd` change) and on a 30-second timer. This means if you create a file in another terminal tab, it will appear in typeahead within 30 seconds — or immediately if you change directories and change back.

### Tab Completion vs. Typeahead

Tab completion and typeahead are related but distinct features. Typeahead shows a dropdown as you type, requiring no explicit action. Tab completion fires on the Tab key, cycling through results. They share the same completers but differ in trigger and presentation:

```typescript
// Typeahead: fires on every input change
useEffect(() => {
  const results = completer.complete(currentWord);
  setTypeaheadResults(results);
}, [currentWord]);

// Tab completion: fires on Tab keypress, cycles on repeated Tab
function handleTab() {
  if (tabResults.length === 0) {
    // First Tab: compute completions
    const results = completer.complete(currentWord);
    setTabResults(results);
    setTabIndex(0);
    if (results.length === 1) {
      // Single match: insert immediately
      acceptCompletion(results[0]);
    }
  } else {
    // Subsequent Tab: cycle to next result
    setTabIndex(prev => (prev + 1) % tabResults.length);
    acceptCompletion(tabResults[tabIndex]);
  }
}
```

When there is exactly one match, Tab inserts it immediately — no cycling needed. When there are multiple matches, repeated Tab presses cycle through them, replacing the current word each time. Shift+Tab cycles backwards. Escape dismisses both the typeahead dropdown and the Tab completion state.

---

## 27.5 Message Rendering Pipeline

Every message in the conversation passes through a rendering pipeline that transforms structured data into styled terminal output. The pipeline has four stages:

### Stage 1: Role Dispatch

Each message has a role — `User`, `Assistant`, `System`, `Tool`, `Error`, `Thinking`, `Cost` — and each role renders differently. A dispatcher routes to the appropriate renderer:

```typescript
function renderMessage(message: Message, width: number): RenderedMessage {
  const header = renderHeader(message.role, message.timestamp, message.model);

  switch (message.role) {
    case 'user':
      return { header, body: renderUserContent(message.content, width) };
    case 'assistant':
      return { header, body: renderAssistantContent(message.content, width) };
    case 'tool':
      return { header, body: renderToolBlock(message, width) };
    case 'thinking':
      return { header, body: renderThinkingBlock(message.content, width) };
    case 'error':
      return { header, body: renderErrorBlock(message.content, width) };
    default:
      return { header, body: [{ text: message.content, style: 'dim' }] };
  }
}
```

### Stage 2: Content Block Processing

Assistant messages contain multiple content blocks — text, code, tool invocations, and tool results. Each block type has its own renderer:

- **Text blocks** pass through the inline markdown renderer, producing styled `Span` objects for bold, italic, code, and links.
- **Code blocks** receive syntax highlighting via a token-based highlighter (a Dracula-palette color scheme is the default), with line numbers and language labels.
- **Tool use blocks** render as a collapsible header showing the tool name and a one-line argument summary. The full arguments expand on selection.
- **Tool result blocks** truncate output to `MAX_TOOL_OUTPUT_LINES` (default 20) with a "show more" indicator. Error results get a red prefix.

### Stage 3: Word Wrapping

After content blocks are rendered to styled spans, they must be wrapped to the terminal width. This is more complex than splitting on spaces because of:

- **ANSI escape sequences** — style codes are zero-width but must not be split mid-sequence.
- **Wide characters** — CJK characters occupy two columns. A line of 40 CJK characters is 80 columns wide.
- **URLs** — breaking a URL mid-path creates confusing output. The wrapper avoids breaks inside URLs when possible.
- **Indentation preservation** — wrapped lines in a code block maintain the indentation level of the first line.

```typescript
class WordWrapper {
  private width: number;

  wrap(spans: StyledSpan[]): Line[] {
    const lines: Line[] = [];
    let currentLine: StyledSpan[] = [];
    let currentWidth = 0;

    for (const span of spans) {
      const displayWidth = this.measureDisplayWidth(span.text);

      if (currentWidth + displayWidth <= this.width) {
        // Fits on current line
        currentLine.push(span);
        currentWidth += displayWidth;
      } else {
        // Need to wrap — find the best break point
        const breakPoint = this.findBreakPoint(span.text, this.width - currentWidth);

        if (breakPoint > 0) {
          // Split the span at the break point
          const [before, after] = this.splitSpan(span, breakPoint);
          currentLine.push(before);
          lines.push({ spans: currentLine });

          // Start new line with the remainder
          currentLine = [after];
          currentWidth = this.measureDisplayWidth(after.text);
        } else {
          // No good break point — push current line and start fresh
          if (currentLine.length > 0) {
            lines.push({ spans: currentLine });
          }
          currentLine = [span];
          currentWidth = displayWidth;
        }
      }
    }

    if (currentLine.length > 0) {
      lines.push({ spans: currentLine });
    }

    return lines;
  }

  private measureDisplayWidth(text: string): number {
    let width = 0;
    for (const char of text) {
      // Skip ANSI escape sequences
      if (char === '\x1b') { /* skip until 'm' */ continue; }
      // CJK characters are double-width
      width += isWideCharacter(char) ? 2 : 1;
    }
    return width;
  }
}
```

### Stage 4: Streaming Integration

When Claude is actively generating a response, the rendering pipeline operates in streaming mode. Partial text arrives as chunks, typically a few tokens at a time. The streaming renderer accumulates these chunks and re-renders the current message on each update:

```typescript
class StreamingRenderer {
  private buffer: string = '';
  private cursor: string = ' \u258B'; // The blinking cursor character: ▋

  pushChunk(chunk: string): void {
    this.buffer += chunk;
  }

  renderPartial(width: number): RenderedMessage {
    // Render whatever we have so far, with cursor appended
    const content = this.buffer + this.cursor;
    return renderAssistantContent([{ type: 'text', text: content }], width);
  }

  finalize(): Message {
    // Remove cursor, create final immutable message
    const finalContent = this.buffer;
    this.buffer = '';
    return { role: 'assistant', content: finalContent, timestamp: Date.now() };
  }
}
```

The cursor character (`▋`) appended during streaming is a visual indicator that the response is still generating. It is stripped during finalization. The streaming renderer re-renders on every chunk — but because virtual scrolling limits rendering to the visible viewport, and because Ink's differential renderer (Chapter 26) only repaints changed characters, the actual terminal I/O per chunk is typically just a few dozen bytes.

---

## 27.6 Background Tasks and Session Forking

One of Claude Code's most powerful features is the ability to background a running task and start a new conversation — then bring the backgrounded task back to the foreground when it completes. This is conceptually similar to job control in Unix shells (`Ctrl+Z`, `bg`, `fg`), but applied to AI conversations.

### The Background Task Model

Background tasks are managed by a scheduler that maintains a priority-ordered pool of async work:

```typescript
interface BackgroundTask {
  id: string;
  name: string;
  priority: TaskPriority;
  status: 'pending' | 'running' | 'completed' | 'cancelled';
  cancelToken: AbortController;
  result?: TaskResult;
  startedAt: number;
}

enum TaskPriority {
  Low = 0,
  Normal = 1,
  High = 2,
  Critical = 3, // Bypasses concurrency limits
}

class BackgroundScheduler {
  private maxConcurrent: number = 4;
  private tasks: Map<string, BackgroundTask> = new Map();

  async spawn(
    name: string,
    priority: TaskPriority,
    work: (signal: AbortSignal) => Promise<TaskResult>
  ): Promise<string> {
    const id = generateId();
    const controller = new AbortController();

    const task: BackgroundTask = {
      id, name, priority,
      status: 'pending',
      cancelToken: controller,
      startedAt: Date.now(),
    };

    this.tasks.set(id, task);

    // Respect concurrency limits (except Critical priority)
    if (priority < TaskPriority.Critical) {
      await this.waitForSlot();
    }

    task.status = 'running';

    // Execute in the background
    work(controller.signal)
      .then(result => {
        task.status = 'completed';
        task.result = result;
      })
      .catch(err => {
        if (err.name === 'AbortError') {
          task.status = 'cancelled';
        } else {
          task.status = 'completed';
          task.result = { error: err.message };
        }
      });

    return id;
  }

  cancel(id: string): void {
    const task = this.tasks.get(id);
    if (task && task.status === 'running') {
      task.cancelToken.abort();
    }
  }

  async drain(timeout: number): Promise<void> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const running = [...this.tasks.values()].filter(t => t.status === 'running');
      if (running.length === 0) return;
      await sleep(100);
    }
    // Force-cancel anything still running after timeout
    for (const task of this.tasks.values()) {
      if (task.status === 'running') this.cancel(task.id);
    }
  }
}
```

### Session Forking

Session forking is the user-facing feature built on top of background tasks. When you press the background shortcut (or use `/background`), the current conversation is suspended and moved to a background task. A new, empty REPL session takes the foreground:

```typescript
async function backgroundCurrentSession(): Promise<void> {
  // 1. Snapshot current session state
  const snapshot = {
    messages: [...currentMessages],
    streamingState: isStreaming ? captureStreamState() : null,
    scrollPosition: scroll.offset,
    inputValue: input.value,
  };

  // 2. Spawn background task to continue the current API call
  const taskId = await scheduler.spawn(
    `Session: ${sessionId}`,
    TaskPriority.Normal,
    async (signal) => {
      if (snapshot.streamingState) {
        // Continue receiving the streaming response
        return await continueStream(snapshot.streamingState, signal);
      }
      return { messages: snapshot.messages };
    }
  );

  // 3. Save the association
  backgroundedSessions.set(taskId, { sessionId, snapshot });

  // 4. Start fresh REPL session
  resetToNewSession();
}
```

Foregrounding a completed background task restores the snapshot and appends any new messages that arrived while backgrounded:

```typescript
async function foregroundSession(taskId: string): Promise<void> {
  const task = scheduler.getTask(taskId);
  const { snapshot } = backgroundedSessions.get(taskId)!;

  if (task.status === 'completed' && task.result) {
    // Restore messages + append new results
    setMessages([...snapshot.messages, ...task.result.newMessages]);
    scroll.scrollToBottom();
  } else if (task.status === 'running') {
    // Re-attach to the live stream
    reattachStream(task);
  }

  backgroundedSessions.delete(taskId);
}
```

### The BackgroundTaskBar Component

A thin bar at the bottom of the REPL shows active background tasks:

```
 [1] Fixing auth bug (streaming...) | [2] Running tests (done ✓)  Ctrl+1/2 to foreground
```

Each task displays its name, status, and a keyboard shortcut to foreground it. The bar renders only when background tasks exist, consuming exactly one terminal row. Tasks that complete while backgrounded show a notification (via the `notify-macos.sh` hook) and their status updates to `done ✓`.

---

## 27.7 Session Lifecycle and State Machine

The REPL operates as a finite state machine with six modes:

```
                    ┌──────────────┐
                    │    Normal    │ ← Default mode: accepting input
                    └──────┬───────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
    ┌──────────────┐ ┌──────────┐ ┌──────────────┐
    │  Streaming   │ │  Search  │ │   Command    │
    │  (AI reply)  │ │  (Ctrl+R)│ │  (/ prefix)  │
    └──────┬───────┘ └────┬─────┘ └──────┬───────┘
           │              │              │
           ▼              ▼              ▼
    ┌──────────────┐                    │
    │  Permission  │ ◄──────────────────┘
    │  (tool ask)  │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │    Error     │
    │  (recovery)  │
    └──────────────┘
```

**Normal mode** accepts text input, processes keyboard shortcuts, and dispatches commands. This is where the user spends most of their time.

**Streaming mode** activates when the API is generating a response. Input is restricted — you can type ahead (the input is buffered), press Escape to cancel generation, or press the background shortcut to fork the session.

**Search mode** activates on Ctrl+R, enabling reverse history search. The input area transforms into a search field, and the message list highlights matches. Pressing Enter selects a match and returns to Normal mode.

**Command mode** activates when the input starts with `/`. The typeahead overlay shows matching commands, and the input area provides argument hints.

**Permission mode** activates when Claude requests permission to use a tool. The REPL displays the tool name, arguments, and a prompt asking the user to allow or deny. Keyboard input is restricted to the permission response keys (y/n/a for yes/no/always).

**Error mode** activates on unrecoverable errors — API disconnection, rate limiting, or internal exceptions. The REPL displays the error with recovery options (retry, quit, reconnect).

Mode transitions are handled by a central dispatcher:

```typescript
function handleModeTransition(event: ModeEvent): void {
  switch (mode) {
    case 'normal':
      if (event.type === 'stream_start') setMode('streaming');
      if (event.type === 'search_activate') setMode('search');
      if (event.type === 'slash_command') setMode('command');
      break;

    case 'streaming':
      if (event.type === 'stream_end') setMode('normal');
      if (event.type === 'permission_request') setMode('permission');
      if (event.type === 'stream_error') setMode('error');
      break;

    case 'permission':
      if (event.type === 'permission_granted') setMode('streaming');
      if (event.type === 'permission_denied') setMode('streaming'); // Continues with denial
      break;

    case 'error':
      if (event.type === 'retry') setMode('streaming');
      if (event.type === 'dismiss') setMode('normal');
      break;

    case 'search':
      if (event.type === 'search_accept') setMode('normal');
      if (event.type === 'search_cancel') setMode('normal');
      break;

    case 'command':
      if (event.type === 'command_execute') setMode('normal');
      if (event.type === 'command_cancel') setMode('normal');
      break;
  }
}
```

The state machine is deliberately simple — six states with clear transitions. Complex behaviors emerge from the interaction between the state machine and the 80+ hooks, not from the state machine itself.

---

## 27.8 Streaming Response Handling

Streaming is the defining characteristic of the REPL experience. When Claude generates a response, tokens arrive one at a time over a Server-Sent Events connection. The REPL must render each token as it arrives, maintain scroll position, track tool executions that begin mid-stream, and handle interruption gracefully.

### The Streaming Pipeline

```
API SSE Connection
       │
       ▼
┌──────────────────┐
│  Event Parser     │  Parses SSE events into typed messages
│  (content_block,  │  (text delta, tool_use start, tool_result, etc.)
│   message_delta)  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Stream Buffer    │  Accumulates text deltas into coherent blocks
│                   │  Detects block boundaries (text → tool → text)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Render Trigger   │  Debounces renders (max 1 per 16ms = 60fps)
│                   │  Batches multiple tokens into single update
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  MessageList      │  Re-renders the streaming message
│  + VirtualScroll  │  Auto-scrolls if at bottom
└──────────────────┘
```

The render debounce is critical for performance. Tokens arrive faster than the terminal can render — a fast response generates 50–100 tokens per second, but terminal rendering above 60fps causes visible tearing. The debounce batches tokens that arrive within a 16ms window into a single render update:

```typescript
function useStreamBuffer() {
  const bufferRef = useRef('');
  const pendingRef = useRef(false);

  const append = useCallback((chunk: string) => {
    bufferRef.current += chunk;

    if (!pendingRef.current) {
      pendingRef.current = true;
      // Schedule render for next frame (16ms)
      setTimeout(() => {
        setDisplayText(bufferRef.current);
        pendingRef.current = false;
      }, 16);
    }
  }, []);

  return { append, text: displayText };
}
```

### Tool Execution During Streaming

Mid-stream tool executions create a complex rendering challenge. The assistant's response might be: text → tool call → (wait for tool result) → more text. The REPL must:

1. Render the initial text as it streams.
2. Detect the tool call block and render a tool header with a spinner.
3. Pause text accumulation while the tool executes.
4. Render the tool result when it arrives.
5. Resume text accumulation for the continuation.

The active tools tracker manages this:

```typescript
interface ActiveTool {
  id: string;
  name: string;
  args: Record<string, unknown>;
  startedAt: number;
  spinnerFrame: number;
  status: 'running' | 'completed' | 'error';
  result?: string;
}

function useToolTracking() {
  const [activeTools, setActiveTools] = useState<ActiveTool[]>([]);

  const track = useCallback((toolUse: ToolUseEvent) => {
    setActiveTools(prev => [...prev, {
      id: toolUse.id,
      name: toolUse.name,
      args: toolUse.args,
      startedAt: Date.now(),
      spinnerFrame: 0,
      status: 'running',
    }]);
  }, []);

  // Advance spinner frames every 100ms tick
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTools(prev =>
        prev.map(tool =>
          tool.status === 'running'
            ? { ...tool, spinnerFrame: (tool.spinnerFrame + 1) % SPINNER_FRAMES.length }
            : tool
        )
      );
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return { activeTools, track, complete: completeToolTracking };
}
```

The spinner frames cycle through `['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']` — the Braille pattern spinner that has become Claude Code's visual signature. Each running tool renders as:

```
⠹ Running Bash(git diff HEAD~3)...  12.4s
```

When the tool completes, the spinner is replaced with a status icon (`✓` or `✗`) and the result renders below.

---

## 27.9 The Render Function

After 4,200 lines of hooks, handlers, and state management, the REPL's render function assembles the final output. It is structurally simple — a vertical stack of components within an Ink `<Box>`:

```typescript
return (
  <Box flexDirection="column" height={terminalHeight}>
    {/* Main content area: messages + scroll */}
    <Box flexGrow={1} flexDirection="row">
      <Box flexGrow={1} flexDirection="column">
        <MessageList
          messages={messages}
          visibleRange={scroll.visibleRange}
          renderer={messageRenderer}
          streamingMessage={isStreaming ? streamBuffer : null}
          activeTools={activeTools}
        />
      </Box>

      {/* Side panel (context viewer, file preview) */}
      {sidePanelVisible && (
        <Box width={Math.floor(terminalWidth * 0.35)} borderStyle="single">
          <SidePanel content={sidePanelContent} />
        </Box>
      )}
    </Box>

    {/* Background task bar */}
    {backgroundTasks.length > 0 && (
      <BackgroundTaskBar tasks={backgroundTasks} />
    )}

    {/* Permission prompt (overlays input when active) */}
    {mode === 'permission' && (
      <PermissionPrompt
        request={permissionRequest}
        onAllow={handlePermissionAllow}
        onDeny={handlePermissionDeny}
        onAlways={handlePermissionAlways}
      />
    )}

    {/* Input area */}
    <Box flexDirection="column">
      <StatusLine
        mode={mode}
        model={session.model}
        tokens={costDisplay.totalTokens}
        cost={costDisplay.totalCost}
      />
      <PromptInput
        value={inputValue}
        cursor={cursorPosition}
        onSubmit={handleSubmit}
        disabled={mode === 'permission'}
      />

      {/* Typeahead overlay (renders above input) */}
      {typeahead.visible && (
        <TypeaheadOverlay
          results={typeahead.results}
          selectedIndex={typeahead.selectedIndex}
        />
      )}
    </Box>
  </Box>
);
```

The layout uses Ink's flexbox model (powered by Yoga, as covered in Chapter 26). The message list gets `flexGrow={1}`, consuming all available vertical space after the status line and input area claim their rows. The side panel, when visible, takes 35% of the terminal width. The background task bar claims exactly one row when tasks exist.

This render function executes on every state change — potentially dozens of times per second during streaming. The Ink differential renderer (Chapter 26) ensures that only changed characters are written to the terminal, keeping the actual I/O minimal.

---

## 27.10 Performance Considerations

A 5,005-line component with 80+ hooks sounds like a performance nightmare. In practice, the REPL renders each frame in under 16ms on modern hardware. Several design decisions make this possible:

**1. Virtual scrolling eliminates layout computation for off-screen messages.** A conversation with 500 messages but a 40-row viewport only lays out 40 rows of content.

**2. Memoization prevents redundant computation.** Message rendering is memoized by message ID and terminal width. A message that was rendered in the previous frame and has not changed returns its cached output instantly.

**3. Stream debouncing batches token arrivals.** Instead of re-rendering on every token (50–100 per second), the stream buffer batches tokens into 60fps render cycles.

**4. Ref-based state for high-frequency updates.** Values that change every frame (spinner positions, stream buffer text) use `useRef` instead of `useState` to avoid triggering React's reconciliation on every update. A single `useState` counter increments on a 100ms tick to trigger the actual re-render.

**5. Pre-computed message heights avoid layout thrashing.** Heights are computed once when messages arrive and cached. The virtual scroll system uses cached heights, not real-time layout measurements.

**6. Lazy rendering for tool results.** Tool results longer than 20 lines render as a collapsed summary. Expanding them triggers a one-time full render that is then cached.

The result is a REPL that feels instantaneous even in conversations with thousands of messages, on terminals as narrow as 40 columns or as wide as 300.

---

## 27.11 Lessons from a 5,000-Line Component

The REPL screen violates several "best practices" from web development: it is a god component, it has 80+ hooks, it mixes concerns, and it is enormous. Yet it works — and it works better than a decomposed alternative would.

The lesson is that best practices are contextual. Web components render inside a browser layout engine that handles reflow, event propagation, and accessibility for free. Terminal components render inside a character grid where every abstraction layer costs performance and every component boundary creates coordination overhead.

The REPL teaches three specific lessons:

**Centralize state when coordination dominates.** If most state updates require knowing other state (scroll position depends on message count, which depends on streaming status, which depends on permission mode), centralizing that state in one component eliminates prop drilling, context providers, and subscription patterns. The cost is a large file. The benefit is that every state transition is visible in one place.

**Decompose behavior, not components.** The 80+ hooks are the decomposition. Each hook is testable, reusable, and single-purpose. The component composes them. This is the inverse of the typical React advice to "break components into smaller components." In terminal UIs, break *behavior* into smaller hooks and keep the component that composes them as a single unit.

**Optimize the hot path, tolerate the cold path.** Streaming renders happen 60 times per second — they must be fast. Initial conversation load happens once — it can be slower. Message height computation happens on arrival — it can be lazy. The REPL optimizes aggressively for streaming (debouncing, memoization, virtual scrolling) and is relaxed about everything else.

---

In the next chapter, we will zoom into the input system — the `PromptInput` component and its supporting hooks — where Vim mode, paste detection, multi-line editing, and keybinding resolution create another surprisingly deep subsystem within the REPL screen.
