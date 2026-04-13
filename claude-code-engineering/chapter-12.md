# Chapter 12: The UI Renderer — React for the Terminal

Most CLI tools write lines to stdout and call it a day. Claude Code builds an entire graphical application inside the terminal — with flexbox layout, double-buffered rendering, text selection, smooth scrolling, focus management, a theme system with 80+ color tokens, and a React reconciler that targets a custom virtual DOM instead of the browser. The UI layer spans ~15,000 lines across ~90 files in the `ink/` directory alone, with another several thousand in components and screens.

This is not a wrapper around ncurses or blessed. Anthropic forked the Ink library, rewrote its rendering pipeline, and added capabilities that the open-source version lacks: cell-based screen buffers with interned identifiers, DECSTBM hardware scrolling, adaptive scroll drain rates, a full DOM-like event system with capture/bubble phases, and React 19 reconciler integration with the React Compiler runtime.

In this chapter, we'll trace the rendering pipeline from React component tree to terminal pixels, examining the engineering decisions that make a 60fps terminal UI possible.

---

## 12.1 The Rendering Stack

The UI architecture forms a clear bottom-to-top stack:

```
Terminal (stdout/stdin)
    ↑
ink/terminal.ts          — Raw terminal I/O
ink/log-update.ts        — Frame diff engine (773 lines)
ink/screen.ts            — Cell-based screen buffer (1,486 lines)
ink/output.ts            — Operation collector (797 lines)
ink/render-node-to-output.ts  — DOM tree → screen ops (1,462 lines)
ink/renderer.ts          — Render pipeline factory (178 lines)
ink/reconciler.ts        — React 19 reconciler (512 lines)
ink/ink.tsx              — Ink instance manager (1,722 lines)
ink/dom.ts               — Virtual DOM model (484 lines)
ink/styles.ts            — Yoga style application (771 lines)
    ↑
ink/components/          — Base primitives (Box, Text, ScrollBox)
components/design-system — Themed wrappers (ThemedText, ThemedBox)
components/              — App-level (Messages, Spinner, Permissions)
screens/REPL.tsx         — Main screen orchestrator (5,005 lines)
```

Every layer has a distinct responsibility, and the flow is strictly unidirectional: React state changes flow down through the reconciler, through layout computation, through screen buffer generation, through frame diffing, and finally to terminal escape sequences. No layer reaches back up.

---

## 12.2 The Custom React Reconciler

Claude Code uses `react-reconciler` to create a custom React renderer — the same mechanism React Native uses to target mobile platforms instead of the browser DOM.

### Seven Element Types

The virtual DOM has seven element types, defined at `ink/dom.ts:19-27`:

```typescript
export type ElementNames =
  | 'ink-root'
  | 'ink-box'
  | 'ink-text'
  | 'ink-virtual-text'
  | 'ink-link'
  | 'ink-progress'
  | 'ink-raw-ansi'
```

`ink-box` is the flexbox container (analogous to `<div>`). `ink-text` renders text with a Yoga measure function. `ink-virtual-text` is an optimization for text nested inside other text — it avoids creating a separate Yoga node for inline styling. `ink-raw-ansi` passes pre-formatted ANSI escape sequences through the rendering pipeline unmodified.

### Reconciler Configuration

The reconciler bridges React's tree-diffing algorithm with the custom DOM model at `ink/reconciler.ts:224-506`:

```typescript
const reconciler = createReconciler<
  ElementNames,     // Type
  Props,            // Props
  DOMElement,       // Container
  DOMElement,       // Instance
  TextNode,         // TextInstance
  DOMElement,       // SuspenseInstance
  ...
>({
  createInstance(originalType, props, rootNode, hostContext) {
    // Validate: <Box> cannot be nested inside <Text>
    if (hostContext.isInsideText && originalType === 'ink-box') {
      throw new Error(`<Box> can't be nested inside <Text> component`)
    }
    // Promote ink-text to ink-virtual-text inside text context
    const type = originalType === 'ink-text' && hostContext.isInsideText
      ? 'ink-virtual-text'
      : originalType
    // ...create DOM node with Yoga layout node
  },

  commitUpdate(node, _type, oldProps, newProps) {
    // React 19 style: receives old and new props directly
    const props = diff(oldProps, newProps)
    const style = diff(oldProps['style'], newProps['style'])
    // Apply changed props and styles to Yoga node
  },

  resetAfterCommit(rootNode) {
    // Phase 1: Yoga layout computation
    rootNode.onComputeLayout?.()
    // Phase 2: Render pipeline
    rootNode.onRender?.()
  },
})
```

The critical callback is `resetAfterCommit` — it fires after React finishes committing all DOM mutations. This is where layout computation and rendering happen, ensuring they always see a consistent tree.

### Performance Instrumentation

The reconciler has built-in profiling gated on the `CLAUDE_CODE_COMMIT_LOG` environment variable:

```typescript
const COMMIT_LOG = process.env.CLAUDE_CODE_COMMIT_LOG
let _commits = 0
let _lastLog = 0
let _lastCommitAt = 0
let _maxGapMs = 0
let _createCount = 0
```

When enabled, it logs slow Yoga layouts (>20ms), slow paints (>10ms), and commit frequency to a file. This instrumentation is how the team identifies rendering bottlenecks in real user sessions.

---

## 12.3 The Virtual DOM Model

The `DOMElement` type at `ink/dom.ts:31-91` reveals the full scope of the virtual DOM:

```typescript
export type DOMElement = {
  nodeName: ElementNames
  attributes: Record<string, DOMNodeAttribute>
  childNodes: DOMNode[]
  textStyles?: TextStyles

  // Layout
  onComputeLayout?: () => void
  onRender?: () => void
  dirty: boolean
  isHidden?: boolean

  // Scroll state (lives on DOM, not React state)
  scrollTop?: number
  pendingScrollDelta?: number
  scrollHeight?: number
  scrollViewportHeight?: number
  stickyScroll?: boolean
  scrollAnchor?: { el: DOMElement; offset: number }

  // Focus management
  focusManager?: FocusManager

  // Event handlers
  _eventHandlers?: Record<string, unknown>
} & InkNode // Yoga node, parent, style
```

A critical design decision: **scroll state lives on DOM nodes, not React state**. Scroll events bypass React reconciliation entirely — they mutate the DOM node directly and trigger Ink's render pipeline. This is why terminal scrolling feels instant even with complex component trees.

### Node Creation

At `ink/dom.ts:110-132`, node creation determines which element types get Yoga layout nodes:

```typescript
export const createNode = (nodeName: ElementNames): DOMElement => {
  const needsYogaNode =
    nodeName !== 'ink-virtual-text' &&
    nodeName !== 'ink-link' &&
    nodeName !== 'ink-progress'
  const node: DOMElement = {
    nodeName, style: {}, attributes: {}, childNodes: [],
    parentNode: undefined,
    yogaNode: needsYogaNode ? createLayoutNode() : undefined,
    dirty: false,
  }
  if (nodeName === 'ink-text') {
    node.yogaNode?.setMeasureFunc(measureTextNode.bind(null, node))
  }
  return node
}
```

Three element types skip Yoga nodes entirely: `ink-virtual-text`, `ink-link`, and `ink-progress`. These are inline elements that don't participate in flexbox layout, saving the overhead of Yoga node allocation and layout computation.

### Dirty Tracking

The `markDirty` function propagates dirtiness from any modified node up to the root. This is how the renderer knows which subtrees need re-rendering. Combined with the blit optimization (copying unchanged regions from the previous screen buffer), this enables incremental rendering that only touches what changed.

---

## 12.4 The Screen Buffer System

The screen buffer at `ink/screen.ts` (1,486 lines) is a cell-based grid where each cell stores interned integer identifiers rather than string data.

### String Interning Pools

Three interning pools eliminate string allocation on the rendering hot path:

```typescript
export class CharPool {
  private strings: string[] = [' ', '']  // Index 0 = space, 1 = empty
  private stringMap = new Map<string, number>()
  private ascii: Int32Array = initCharAscii()

  intern(char: string): number {
    // ASCII fast-path: direct array lookup instead of Map.get
    if (char.length === 1) {
      const code = char.charCodeAt(0)
      if (code < 128) {
        const cached = this.ascii[code]!
        if (cached !== -1) return cached
        // ... intern new ASCII char ...
      }
    }
    // Map lookup for non-ASCII (emoji, CJK, etc.)
  }
}
```

The `CharPool` has a fast path for ASCII characters (direct array lookup via char code) and falls back to `Map.get` for non-ASCII. The `StylePool` interns ANSI style code sequences. The `HyperlinkPool` interns OSC 8 URLs. All three pools are shared across screens, so interning happens once per unique value for the entire session.

### Style ID Bit Encoding

The `StylePool` packs a rendering hint into the style ID itself:

```typescript
intern(styles: AnsiCode[]): number {
  const key = styles.length === 0
    ? ''
    : styles.map(s => s.code).join('\0')
  let id = this.ids.get(key)
  if (id === undefined) {
    const rawId = this.styles.length
    this.styles.push(styles.length === 0 ? [] : styles)
    id = (rawId << 1) |
      (styles.length > 0 && hasVisibleSpaceEffect(styles) ? 1 : 0)
    this.ids.set(key, id)
  }
  return id
}
```

Bit 0 of the style ID encodes whether the style is visible on space characters (background color, inverse video, underline). The diff engine uses this bit as a mask to skip invisible trailing spaces — a single integer AND operation that saves potentially thousands of string comparisons per frame.

---

## 12.5 The Rendering Pipeline

### Phase 1: Yoga Layout

After React commits DOM changes, `onComputeLayout` runs Yoga's `calculateLayout()` on the root node. This computes flexbox positions and sizes for the entire tree. Performance is tracked via `recordYogaMs()` — Yoga layouts exceeding 20ms trigger a warning in the commit log.

### Phase 2: DOM to Screen Buffer

The renderer at `ink/renderer.ts:31-178` creates the pipeline that converts the DOM tree into a screen buffer:

```typescript
export default function createRenderer(
  node: DOMElement, stylePool: StylePool
): Renderer {
  let output: Output | undefined
  return options => {
    const width = Math.floor(node.yogaNode.getComputedWidth())
    const height = options.altScreen ? terminalRows : yogaHeight

    // Reuse Output across frames for cache persistence
    if (output) {
      output.reset(width, height, screen)
    } else {
      output = new Output({ width, height, stylePool, screen })
    }

    renderNodeToOutput(node, output, {
      prevScreen: options.prevFrameContaminated ? undefined : prevScreen,
    })

    return { screen: output.get(), viewport: {...}, cursor: {...} }
  }
}
```

Key engineering decisions:
- **Output object reuse**: The `Output` instance persists across frames, so the `charCache` (grapheme-clustered lines) persists. Most lines don't change between renders — the cache avoids re-tokenizing them.
- **Double buffering**: `frontFrame` and `backFrame` alternate. The renderer writes to the back buffer while the front buffer represents what the terminal currently shows.
- **Previous screen blitting**: Unchanged regions are copied from the previous screen buffer rather than re-rendered, a critical optimization for large displays.

### Phase 3: Frame Diffing

The `LogUpdate` class at `ink/log-update.ts` (773 lines) diffs the previous frame's screen buffer against the new one, producing a `Diff` — an array of `Patch` operations:

```typescript
export type Patch =
  | { type: 'stdout'; content: string }
  | { type: 'clear'; count: number }
  | { type: 'clearTerminal'; reason: FlickerReason }
  | { type: 'cursorHide' }
  | { type: 'cursorShow' }
  | { type: 'cursorMove'; x: number; y: number }
  | { type: 'cursorTo'; col: number }
  | { type: 'carriageReturn' }
  | { type: 'hyperlink'; uri: string }
  | { type: 'styleStr'; str: string }
```

The diff engine uses the `StylePool` for zero-allocation style transitions: `StylePool.transition(fromId, toId)` returns a pre-serialized ANSI string cached by the (from, to) pair. This means switching from blue text to red text always produces the same escape sequence bytes, avoiding repeated string concatenation.

### Frame Rate Control

```typescript
// ink/constants.ts
export const FRAME_INTERVAL_MS = 16  // ~60fps
```

Renders are throttled to 60fps via `lodash.throttle` in the `scheduleRender` function. Rapid state changes within a single 16ms window are coalesced into one frame. This prevents React re-renders from overwhelming the terminal with escape sequences.

---

## 12.6 The Ink Instance

The `Ink` class at `ink/ink.tsx` (1,722 lines) coordinates the entire rendering lifecycle. One instance per stdout stream.

```typescript
export default class Ink {
  private readonly log: LogUpdate
  private readonly terminal: Terminal
  private scheduleRender: (() => void) & { cancel?: () => void }
  private readonly container: FiberRoot
  private rootNode: DOMElement
  readonly focusManager: FocusManager
  private renderer: Renderer
  private readonly stylePool: StylePool
  private charPool: CharPool
  private hyperlinkPool: HyperlinkPool
  private frontFrame: Frame
  private backFrame: Frame
  readonly selection: SelectionState
  private altScreenActive = false
  private prevFrameContaminated = false
  // ...
}
```

### Double Buffering

The frame swap cycle:
1. Renderer writes to `backFrame.screen`
2. `LogUpdate` diffs `frontFrame.screen` vs `backFrame.screen`
3. Patches are written to the terminal
4. Frames swap: `backFrame` becomes the new `frontFrame`

### Selection Overlay and Contamination

Text selection (mouse drag in alternate screen mode) is an overlay pass that runs *after* the render pipeline. It inverts cell styles in the selected range directly on the screen buffer. This is why `prevFrameContaminated` exists — the selection overlay mutates the screen buffer, so the next frame can't trust it for blitting and must do a full render.

---

## 12.7 Scrolling Architecture

The scroll system at `ink/render-node-to-output.ts` (1,462 lines) represents some of the most performance-sensitive code in the entire codebase.

### Hardware Scroll via DECSTBM

When a `ScrollBox`'s `scrollTop` changes between frames and nothing else in the viewport moved, the renderer can emit a hardware scroll instruction (DECSTBM — DEC Set Top and Bottom Margins) instead of rewriting every character:

```typescript
export type ScrollHint = { top: number; bottom: number; delta: number }
```

This tells the terminal to scroll a region of the screen by `delta` rows using its own buffer — no data transfer needed for the shifted content. Only the newly revealed rows need to be transmitted.

### Adaptive Scroll Drain

Different drain strategies for different terminal environments:

```typescript
const SCROLL_INSTANT_THRESHOLD = 5
const SCROLL_HIGH_PENDING = 12
const SCROLL_STEP_MED = 2
const SCROLL_STEP_HIGH = 3
const SCROLL_MAX_PENDING = 30
```

For xterm.js (VS Code terminals): low pending (≤5 rows) drains all at once for instant response. Higher pending uses small fixed steps for smooth animation. For native terminals: proportional drain (~3/4 of remaining) for logarithmic catch-up. Excess beyond 30 rows snaps immediately — smooth animation of 50 rows of scroll would feel sluggish.

### Layout Shift Detection

A global flag tracks whether any node's Yoga position or size changed:

```typescript
let layoutShifted = false
export function resetLayoutShifted(): void { layoutShifted = false }
export function didLayoutShift(): boolean { return layoutShifted }
```

When no layout shift occurred, the Ink instance can use narrow damage bounds — only re-rendering the cells that actually changed content. When layout shifts *did* occur, the full-damage code path is needed because nodes may have moved to entirely different screen positions.

---

## 12.8 Core Components

### Box — The Layout Primitive

At `ink/components/Box.tsx` (213 lines), Box renders as `<ink-box>` with flexbox styles. Defaults: `flexDirection="row"`, `flexGrow=0`, `flexShrink=1`, `flexWrap="nowrap"`. It supports the full DOM-like event model: `onClick`, `onFocus`/`onBlur`, `onKeyDown` (capture + bubble), `onMouseEnter`/`onMouseLeave`, and `tabIndex` for focus management.

### Text — Styled Content

At `ink/components/Text.tsx` (253 lines), Text renders as `<ink-text>` with text styles. A noteworthy type-level constraint: **bold and dim are mutually exclusive** in terminals, enforced statically:

```typescript
type WeightProps = {
  bold?: never; dim?: never;
} | {
  bold: boolean; dim?: never;
} | {
  dim: boolean; bold?: never;
}
```

This prevents runtime surprises where setting both would produce terminal-dependent rendering. Text also pre-memoizes style objects for each of 8 text wrapping modes (wrap, truncate-end, truncate-middle, etc.).

### ScrollBox — Scrollable Containers

At `ink/components/ScrollBox.tsx` (236 lines), ScrollBox provides an imperative scroll API:

```typescript
export type ScrollBoxHandle = {
  scrollTo: (y: number) => void
  scrollBy: (dy: number) => void
  scrollToElement: (el: DOMElement, offset?: number) => void
  scrollToBottom: () => void
  getScrollTop: () => number
  getScrollHeight: () => number
  getViewportHeight: () => number
  isSticky: () => boolean
  subscribe: (listener: () => void) => () => void
}
```

As noted earlier, scrolling bypasses React entirely. `scrollTo`/`scrollBy` mutate `scrollTop` directly on the DOM node, mark it dirty, and call `scheduleRender`. No reconciler overhead per wheel event.

### AlternateScreen — Fullscreen Mode

At `ink/components/AlternateScreen.tsx` (79 lines), this component switches to the terminal's alternate screen buffer (DEC 1049). It uses `useInsertionEffect` (not `useLayoutEffect`) for a subtle timing reason: the insertion effect fires during React's mutation phase, *before* `resetAfterCommit`. With `useLayoutEffect`, the first `onRender` would fire before the alt-screen enter — writing a frame to the main screen that gets preserved and revealed when the user exits.

---

## 12.9 The Theme System

### Theme Definition

The theme type at `utils/theme.ts` (639 lines) contains 80+ color tokens covering every UI element:

```typescript
export type Theme = {
  autoAccept: string
  bashBorder: string
  claude: string              // Claude orange
  claudeShimmer: string       // Lighter for shimmer animation
  permission: string
  planMode: string
  text: string
  inverseText: string
  inactive: string
  success: string
  error: string
  warning: string
  diffAdded: string
  diffRemoved: string
  diffAddedWord: string       // Word-level diff highlighting
  diffRemovedWord: string
  selectionBg: string
  // ... 60+ more tokens
}
```

Six built-in themes: `dark`, `light`, `light-daltonized`, `dark-daltonized`, `light-ansi`, `dark-ansi`. The daltonized variants remap red/green indicators that are indistinguishable to colorblind users. The ANSI variants use only the 8 basic terminal colors for maximum compatibility with constrained environments (SSH into legacy systems, unusual terminal emulators). The `'auto'` setting resolves at runtime by probing the terminal's background color via the OSC 11 terminal query.

### The Export Layer

The public API at `ink.ts` (85 lines) wraps every render call with `ThemeProvider` and exports themed versions of base components by default:

```typescript
function withTheme(node: ReactNode): ReactNode {
  return createElement(ThemeProvider, null, node)
}

// Public exports use themed wrappers
export { default as Box } from './components/design-system/ThemedBox.js'
export { default as Text } from './components/design-system/ThemedText.js'
```

The base Ink primitives (`BaseBox`, `BaseText`) remain available for performance-critical code that doesn't need theme resolution. This two-tier export pattern ensures that all application code gets theming by default while hot-path rendering code can opt out.

### ThemedText Color Resolution

`ThemedText` at `components/design-system/ThemedText.tsx` (123 lines) resolves colors from either theme tokens or raw color values:

```typescript
function resolveColor(
  color: keyof Theme | Color | undefined, theme: Theme
): Color | undefined {
  if (!color) return undefined
  if (color.startsWith('rgb(') || color.startsWith('#') ||
      color.startsWith('ansi256(') || color.startsWith('ansi:')) {
    return color as Color
  }
  return theme[color as keyof Theme] as Color
}
```

It also supports `TextHoverColorContext` — a context that colors uncolored text in a subtree, crossing `Box` boundaries. This is different from Ink's native style cascade, which stops at `Box` boundaries.

### Color Level Management

At `ink/colorize.ts` (231 lines), two startup adjustments handle terminal color capability misdetection:

**xterm.js boost**: VS Code's integrated terminal supports truecolor (24-bit), but chalk's detection identifies it as 256-color. The code checks `TERM_PROGRAM === 'vscode'` and boosts `chalk.level` from 2 to 3.

**tmux clamp**: tmux doesn't reliably pass truecolor unless specifically configured. Without the `CLAUDE_CODE_TMUX_TRUECOLOR` env var, color level is clamped to 2 (256 colors) inside tmux sessions.

### Theme Provider and Live Preview

The `ThemeProvider` at `components/design-system/ThemeProvider.tsx` (169 lines) supports live theme preview during the theme picker — switching themes instantly without a restart. It also watches for terminal theme changes (dark mode toggle) when `'auto'` is active.

---

## 12.10 State Management

### The Minimal Store

Rather than reaching for Redux or Zustand, the UI uses a hand-rolled pub/sub store at `state/store.ts` (35 lines):

```typescript
export function createStore<T>(initialState: T, onChange?: OnChange<T>): Store<T> {
  let state = initialState
  const listeners = new Set<Listener>()
  return {
    getState: () => state,
    setState: (updater) => {
      const prev = state
      const next = updater(prev)
      if (Object.is(next, prev)) return  // Skip if unchanged
      state = next
      onChange?.({ newState: next, oldState: prev })
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

The `AppState` type is deeply immutable (via `DeepImmutable<>`) and contains everything the UI needs. React integration uses `useSyncExternalStore` (React 18+) to subscribe components to the store with tear-free reads.

### Context Architecture

Nine React contexts separate cross-cutting concerns:

| Context | Purpose |
|---------|---------|
| `fpsMetrics` | Frame performance tracking |
| `mailbox` | Inter-agent messaging |
| `modalContext` | Modal dialog management |
| `notifications` | User notification system |
| `overlayContext` | Overlay/popover state |
| `promptOverlayContext` | Prompt overlay UI |
| `QueuedMessageContext` | Message queue |
| `stats` | Usage statistics |
| `voice` | Voice input state |

---

## 12.11 Input Handling

### Key Parsing

At `ink/parse-keypress.ts` (801 lines), raw terminal input bytes are parsed into structured `ParsedKey` objects. This handles the full complexity of terminal input: single characters, escape sequences, arrow keys, function keys, modifier combinations, Kitty keyboard protocol extended events, SGR mouse events (position, button, drag, wheel), bracketed paste mode, and terminal query responses (XTVERSION, OSC 11).

The `App` component at `ink/components/App.tsx` (657 lines) receives all stdin data and dispatches through the event system. Multi-click detection (double-click for word selection, triple-click for line selection) uses a 500ms timeout and 1-cell distance threshold:

```typescript
const MULTI_CLICK_TIMEOUT_MS = 500
const MULTI_CLICK_DISTANCE = 1
```

### Terminal Resume Detection

After a >5 second stdin silence (tmux detach, SSH reconnect, laptop wake from sleep), the next input triggers terminal mode re-assertion:

```typescript
const STDIN_RESUME_GAP_MS = 5000
```

This re-enables mouse tracking, extended key reporting, and other DEC private modes that terminals reset on reconnect. Without this, users returning from a lunch break would find mouse scrolling broken until they restarted the session.

### The Text Input Hook

At `hooks/useTextInput.ts` (529 lines), a full text editor lives inside a React hook. It supports:

- **Cursor movement**: arrow keys, Home/End, Ctrl+A/E (Emacs bindings)
- **Kill ring**: Ctrl+K (kill to end), Ctrl+U (kill to start), Ctrl+Y (yank), Alt+Y (yank-pop)
- **History navigation**: Up/Down arrows cycle through previous inputs
- **Multiline editing**: Enter for newline, special submit handling
- **Inline ghost text**: typeahead suggestions rendered in a dimmed style
- **Image paste detection**: recognizes base64-encoded image data from clipboard
- **Input filtering**: configurable character filtering

The kill ring implementation is particularly noteworthy — it implements the Emacs-style ring buffer where Ctrl+Y pastes the most recent kill and Alt+Y cycles through previous kills. This is a detail that experienced terminal users expect but few CLI tools implement.

### The Event System

A DOM-like event system at `ink/events/` (8 files) provides capture and bubble phases:

- `dispatcher.ts` — Event dispatch with React priority integration
- `keyboard-event.ts` — Keyboard events with modifier tracking
- `click-event.ts` — Mouse click events with coordinates
- `focus-event.ts` — Focus/blur events for `tabIndex` navigation
- `input-event.ts` — Text input events (legacy compatibility)

Hit testing at `ink/hit-test.ts` walks the DOM tree and checks if mouse coordinates fall within computed Yoga bounds. Events bubble from the deepest hit Box upward, with `stopPropagation()` and `stopImmediatePropagation()` support.

### Focus Management

The `FocusManager` at `ink/focus.ts` (145 lines) implements `tabIndex`-based focus navigation for the terminal:

```typescript
interface FocusableElement {
  node: DOMElement
  tabIndex: number
  autoFocus?: boolean
}
```

Focus cycles through elements in `tabIndex` order: 0 → 1 → 2 → ... → back to 0. Elements with `tabIndex={-1}` are focusable programmatically but skip Tab navigation. This mirrors the browser's focus model, making the terminal UI feel familiar to web developers.

The focus system integrates with the permission dialog — when a tool requires approval, focus automatically moves to the permission prompt, and after the user responds, focus returns to the input prompt. This focus restoration is managed through a stack that tracks the focus chain across modal transitions.

### Native TypeScript Bindings

The rendering stack uses native Bun bindings for performance-critical operations:

- **Yoga layout**: The flexbox engine runs as a compiled native module, not a JavaScript port. Layout computation for complex component trees (100+ nodes) completes in under 20ms — the performance target enforced by the commit log profiling.
- **File indexer**: The file suggestion system uses a native Rust-based file indexer for sub-millisecond glob matching, used by the typeahead/autocomplete system.
- **Color diff**: A native color differencing algorithm powers the auto-theme detection, comparing the terminal's reported background color against theme luminance thresholds to select light vs. dark themes.

These native bindings are conditionally loaded — if the native module isn't available (unusual platform, missing binary), the system falls back to pure-JavaScript implementations. This graceful degradation ensures Claude Code works on any platform that supports Bun, even if the native modules can't be loaded.

---

## 12.12 Permission Dialog UI

Each tool type has a specialized permission dialog that knows how to display that tool's inputs in a human-readable way. The routing happens at `components/permissions/PermissionRequest.tsx` (216 lines):

```typescript
function permissionComponentForTool(tool: Tool) {
  switch (tool) {
    case FileEditTool:     return FileEditPermissionRequest
    case FileWriteTool:    return FileWritePermissionRequest
    case BashTool:         return BashPermissionRequest
    case PowerShellTool:   return PowerShellPermissionRequest
    case WebFetchTool:     return WebFetchPermissionRequest
    case NotebookEditTool: return NotebookEditPermissionRequest
    case SkillTool:        return SkillPermissionRequest
    default:               return FallbackPermissionRequest
  }
}
```

`BashPermissionRequest` shows the command with syntax highlighting. `FileEditPermissionRequest` renders a diff view showing the exact string replacement. `FileWritePermissionRequest` shows the target path and file contents. Each dialog provides contextual information that lets the user make an informed allow/deny decision without needing to read raw JSON.

---

## 12.13 Tool Use Visualization

Each tool has a `UI.tsx` file that provides rendering during and after execution:

| Tool | Visualization |
|------|--------------|
| BashTool | Command being executed, stdout/stderr streaming, background hint (Ctrl+B) |
| FileEditTool | Diff view with added/removed highlighting |
| FileWriteTool | File path and content preview |
| FileReadTool | File path with line range |
| GrepTool | Match count and file list |
| GlobTool | Matched file paths |
| WebSearchTool | Search query and result summaries |
| AgentTool | Agent status, model, and progress |
| MCPTool | MCP server name and tool call details |

The tool UI components use the design system's themed primitives — `ThemedText` for consistent color tokens, `ThemedBox` for borders and layout. This means tool output automatically adapts to the user's chosen theme (dark, light, daltonized).

---

## 12.14 Spinner and Animation

The spinner at `components/Spinner.tsx` (561 lines) is more sophisticated than a simple character rotation:

```typescript
const DEFAULT_CHARACTERS = getDefaultCharacters()
const SPINNER_FRAMES = [
  ...DEFAULT_CHARACTERS,
  ...[...DEFAULT_CHARACTERS].reverse()  // Ping-pong animation
]
```

The ping-pong animation creates a smoother visual effect than a cyclic loop — the eye perceives the reversal as continuous motion rather than a jarring jump from the last frame back to the first.

The shimmer effect uses `computeShimmerSegments()` to animate color gradients across text — the Claude logo "shimmers" during processing, using the `claudeShimmer` theme token (a lighter variant of `claude` orange). The `SpinnerWithVerb` component branches on `isBriefOnly` to show a minimal spinner in brief/assistant mode versus a full status message in interactive mode.

Animation timing is driven by `useAnimationFrame` from Ink, which provides frame-synced updates at 60fps. This is the same animation infrastructure that powers smooth scroll animations and progress bar updates.

---

## 12.15 The App Root Component

The `App` component at `ink/components/App.tsx` (657 lines) is notably a **class component**, not a functional one. This is deliberate — class components have `componentDidCatch` for error boundaries, and the `App` root must catch rendering errors gracefully rather than crashing the terminal.

Its render method reveals the context provider hierarchy:

```typescript
render() {
  return (
    <TerminalSizeContext.Provider value={{ columns, rows }}>
      <AppContext.Provider value={{ exit: this.handleExit }}>
        <StdinContext.Provider value={{ stdin, setRawMode }}>
          <TerminalFocusProvider>
            <ClockProvider>
              <CursorDeclarationContext.Provider value={...}>
                {this.state.error
                  ? <ErrorOverview error={this.state.error} />
                  : this.props.children}
              </CursorDeclarationContext.Provider>
            </ClockProvider>
          </TerminalFocusProvider>
        </StdinContext.Provider>
      </AppContext.Provider>
    </TerminalSizeContext.Provider>
  )
}
```

Six contexts wrap the entire application tree:
1. **TerminalSizeContext** — columns and rows, updated on terminal resize
2. **AppContext** — the exit handler for graceful shutdown
3. **StdinContext** — stdin stream, raw mode control, event emitter, terminal querier
4. **TerminalFocusProvider** — focus-in/focus-out events (terminal gaining/losing OS focus)
5. **ClockProvider** — shared animation timer for synchronized 60fps updates
6. **CursorDeclarationContext** — IME cursor positioning for international text input

---

## 12.16 The REPL Screen

At `screens/REPL.tsx` (5,005 lines), the largest file in the codebase, the REPL screen orchestrates the entire interactive experience. Its first 200 lines are imports — 180+ import statements. This is the convergence point of the application: message display, prompt input, API query management, permission request routing, tool use visualization, session management, cost tracking, background task navigation, and teammate/agent view switching all meet here.

The `Messages` component at `components/Messages.tsx` (833 lines) handles the core message rendering — transforming the API message array into a scrollable list of formatted message blocks with tool use visualization, markdown rendering, and diff display.

The REPL is where the theoretical architecture becomes a living application. Every abstraction described in this chapter — the reconciler, the screen buffer, the scroll system, the theme engine — exists to serve this 5,000-line React component that makes Claude Code feel like a native terminal application rather than a chatbot wrapped in `readline`.

---

## 12.17 React Compiler Integration

Every component in the codebase uses the React Compiler runtime:

```typescript
import { c as _c } from "react/compiler-runtime"

export default function Text(t0) {
  const $ = _c(29)  // 29-slot memo cache
  // ... destructure props, check each slot against cache ...
}
```

The compiler transforms components into an optimized form with a slot-based memo cache. Each slot tracks a dependency expression; if deps haven't changed, the cached value is returned. This eliminates manual `useMemo`/`useCallback` wrapping entirely — the compiler handles it automatically with fine-grained dependency tracking at the expression level.

---

## 12.18 Engineering Patterns Worth Stealing

Seven patterns from the UI renderer that apply to any terminal application:

**1. Bypass React for performance-critical paths.** Scrolling, selection, and cursor positioning mutate DOM nodes directly and trigger the render pipeline without going through React reconciliation. React handles structural changes; hot-path state mutations go direct.

**2. Intern everything on the hot path.** Characters, styles, and hyperlinks are interned into integer IDs. The screen buffer stores only integers. Comparisons are integer equality checks, not string comparisons. Style transitions are pre-serialized and cached by (from, to) pair.

**3. Pack hints into identifiers.** Bit 0 of the style ID encodes whether the style has visible effect on spaces. One bitmask operation saves thousands of string comparisons per frame.

**4. Double buffer with contamination tracking.** Front and back frames alternate. Overlay passes (selection highlighting) that mutate the screen buffer set a contamination flag so the next frame knows it can't trust the buffer for incremental updates.

**5. Adapt to the terminal environment.** Different scroll drain rates for xterm.js vs native terminals. Color level boosting for VS Code, clamping for tmux. Hardware scroll (DECSTBM) when available, full repaint when not.

**6. Let the React Compiler handle memoization.** No manual `useMemo`/`useCallback`. The compiler generates expression-level dependency tracking that's both more granular and more correct than hand-written memoization.

**7. Keep the store minimal.** 35 lines of pub/sub with `useSyncExternalStore` beats any state management library for this use case. `Object.is` equality check with deeply immutable state prevents unnecessary re-renders.

---

## Summary

The UI renderer is where Claude Code's engineering ambition is most visible. Building a React application inside a terminal — complete with flexbox layout, smooth scrolling, text selection, theming, and 60fps rendering — required solving problems that few CLI tools ever attempt. The custom reconciler bridges React's programming model to terminal rendering. The interned screen buffer makes cell-by-cell diffing cheap. The adaptive scroll system handles both VS Code's xterm.js and native terminals. And the React Compiler eliminates an entire category of performance bugs.

For engineers building CLI tools: the investment in a proper rendering architecture pays for itself the moment your UI has more than one moving part. The patterns here — double buffering, dirty tracking, frame coalescing, hardware scroll, style interning — are not novel, but their combination in a TypeScript terminal application proves that terminal UIs can be as sophisticated as their graphical counterparts.

In Chapter 13, we move from the presentation layer to the coordination layer — examining how Claude Code spawns, manages, and communicates with subagents to parallelize complex tasks across multiple model instances.
