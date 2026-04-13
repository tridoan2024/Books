# Chapter 26: The Ink Rendering Engine

Every terminal application eventually confronts the same question: how do you position text on a two-dimensional grid that only understands sequential character streams? The browser solved this problem decades ago with HTML, CSS, and a layout engine. Claude Code solves it by forking Ink -- a React renderer for the terminal -- and building an entire UI framework around a virtual DOM, Yoga-based flexbox layout, differential rendering, and ANSI-aware text processing. The result is a system where developers write React components with `<Box>` and `<Text>`, and the engine translates that into precisely positioned, styled characters on a terminal screen refreshing at 30 frames per second.

This chapter dissects the Ink rendering engine from the bottom up. We will start with the virtual DOM that mirrors the browser's document model for terminal nodes, then examine the Yoga layout engine that computes flexbox positions for every element, walk through the node-to-output rendering pipeline that converts a laid-out tree into a character grid, explore the differential update mechanism that minimizes terminal writes, and finally cover the colorization, text selection, and search highlighting systems that make Claude Code's output readable and navigable. As we saw in Chapter 25 with system prompt composition, Claude Code layers sophisticated text processing on top of its outputs. The Ink engine is where that processed text meets the user's screen.

---

## 26.1 Why a Custom Ink Fork

Ink is the standard React renderer for terminal applications. Originally created by Vadim Demedes, it brings the component model, reconciliation, and hooks that React developers already know into the CLI world. Claude Code uses Ink 5.2.1 as its UI foundation, but the relationship is not a simple dependency import.

Claude Code maintains a custom fork because a CLI agent's rendering requirements differ fundamentally from typical terminal applications. A standard CLI tool might render a progress bar, a menu, or a table. Claude Code renders a full IDE-like interface: streaming markdown with syntax highlighting, multi-panel layouts with tool execution results, virtual scrolling through conversations spanning thousands of lines, vim-mode text editing, and real-time search highlighting -- all while maintaining 30 FPS even when the model is streaming tokens at full speed.

The fork addresses several categories of requirements that upstream Ink was not designed for:

| Requirement | Upstream Ink | Claude Code Fork |
|---|---|---|
| Render throttling | Fixed 32ms throttle | Adaptive throttle with immediate render for `<Static>` |
| Text measurement | Simple `widest-line` | ANSI-aware measurement with caching |
| Overflow handling | Basic clipping | Horizontal and vertical clip regions with nested contexts |
| Output diffing | Full re-render on change | Differential output with `lastOutput` comparison |
| Keypress handling | Basic ASCII + arrows | Full escape sequence parsing including bracketed paste |
| Layout complexity | Simple flexbox | Deep nesting with border, gap, overflow, and percent-based dimensions |

The fork lives in the `ink/` directory of the node_modules tree (published as a modified package), and the experimental subdirectory contains an earlier iteration of the DOM and rendering APIs. Understanding both the stable and experimental versions reveals how the rendering architecture evolved.

---

## 26.2 The Virtual DOM: `dom.ts`

### Node Types

The Ink virtual DOM is a lightweight tree structure that mirrors the browser DOM just enough to support React reconciliation and Yoga layout. There are four element types and one text type:

```typescript
export type TextName = '#text';
export type ElementNames = 'ink-root' | 'ink-box' | 'ink-text' | 'ink-virtual-text';
export type NodeNames = ElementNames | TextName;
```

Each maps to a specific rendering concept:

- **`ink-root`**: The document root. One per Ink instance. Holds the root Yoga node whose width is set to `stdout.columns`.
- **`ink-box`**: The equivalent of a `<div>` with `display: flex`. Handles layout, borders, overflow clipping, and child positioning.
- **`ink-text`**: A text container. Gets a custom Yoga measure function that computes dimensions based on text content.
- **`ink-virtual-text`**: A nested text element that participates in text squashing but does not create its own Yoga node.
- **`#text`**: A raw text leaf node containing a string value.

### The DOMElement Interface

Every non-text node implements the `DOMElement` interface:

```typescript
export type DOMElement = {
    nodeName: ElementNames;
    attributes: Record<string, DOMNodeAttribute>;
    childNodes: DOMNode[];
    internal_transform?: OutputTransformer;
    isStaticDirty?: boolean;
    staticNode?: DOMElement;
    onComputeLayout?: () => void;
    onRender?: () => void;
    onImmediateRender?: () => void;
} & InkNode;
```

The `internal_transform` field is critical. It is a function `(text: string, index: number) => string` that transforms the rendered text content of a node before it is written to the output grid. This is how the `<Text>` component applies chalk-based styling -- bold, italic, color, and background color are all implemented as output transformers, not as properties of the character grid.

The `InkNode` base type adds the Yoga connection:

```typescript
type InkNode = {
    parentNode: DOMElement | undefined;
    yogaNode?: YogaNode;
    internal_static?: boolean;
    style: Styles;
};
```

Every element except `ink-virtual-text` creates a Yoga node on construction. Virtual text nodes skip Yoga because their dimensions are accounted for by their parent `ink-text` node's measure function.

### Node Creation and Tree Manipulation

The DOM provides five core operations: `createNode`, `appendChildNode`, `insertBeforeNode`, `removeChildNode`, and `createTextNode`. Here is the creation function:

```javascript
export const createNode = (nodeName) => {
    const node = {
        nodeName,
        style: {},
        attributes: {},
        childNodes: [],
        parentNode: undefined,
        yogaNode: nodeName === 'ink-virtual-text'
            ? undefined
            : Yoga.Node.create(),
    };
    if (nodeName === 'ink-text') {
        node.yogaNode?.setMeasureFunc(
            measureTextNode.bind(null, node)
        );
    }
    return node;
};
```

Two things stand out. First, `ink-virtual-text` intentionally gets no Yoga node -- it exists purely for text composition. Second, `ink-text` nodes install a custom Yoga measure function that computes the text's pixel dimensions by squashing all child text nodes into a single string and measuring it. This is what makes text wrapping work: Yoga calls the measure function during layout with the available width, and the function returns the dimensions the text would need after wrapping.

The `appendChildNode` function maintains both the DOM tree and the Yoga tree simultaneously:

```javascript
export const appendChildNode = (node, childNode) => {
    if (childNode.parentNode) {
        removeChildNode(childNode.parentNode, childNode);
    }
    childNode.parentNode = node;
    node.childNodes.push(childNode);
    if (childNode.yogaNode) {
        node.yogaNode?.insertChild(
            childNode.yogaNode,
            node.yogaNode.getChildCount()
        );
    }
    if (node.nodeName === 'ink-text' ||
        node.nodeName === 'ink-virtual-text') {
        markNodeAsDirty(node);
    }
};
```

When a child is added to a text node, `markNodeAsDirty` walks up the tree to find the closest Yoga node and marks it dirty. This forces Yoga to re-measure the text on the next layout pass. Without this, adding or removing text children would not trigger the measure function, and the layout would display stale dimensions.

### The Dirty Marking System

The dirty marking mechanism is the DOM's most subtle piece. Text content changes constantly in Claude Code -- streaming model responses add characters every few milliseconds. Each change needs to propagate to the layout system:

```javascript
const findClosestYogaNode = (node) => {
    if (!node?.parentNode) {
        return undefined;
    }
    return node.yogaNode ?? findClosestYogaNode(node.parentNode);
};

const markNodeAsDirty = (node) => {
    const yogaNode = findClosestYogaNode(node);
    yogaNode?.markDirty();
};
```

This is called from three places: `appendChildNode`, `removeChildNode`, and `setTextNodeValue`. The recursion through `findClosestYogaNode` handles the case where a `#text` node is nested inside `ink-virtual-text` nodes -- it walks up until it finds a node with an actual Yoga node (the parent `ink-text`), then marks that dirty.

### Comparison with the Experimental DOM

The `experimental/dom.js` file reveals an earlier iteration of the DOM design. The key differences illuminate the evolution:

```javascript
// Experimental (earlier) version
const createNode = tagName => ({
    nodeName: tagName.toUpperCase(),
    style: {},
    attributes: {},
    childNodes: [],
    parentNode: null,
    textContent: null,
    yogaNode: Yoga.Node.create()
});
```

In the experimental version, every node gets a Yoga node (no `ink-virtual-text` optimization), node names are uppercased (like HTML), and there is a `textContent` property directly on nodes. The stable version is more memory-efficient -- by skipping Yoga nodes on virtual text, a deeply nested `<Text>` tree with many styled spans creates far fewer Yoga nodes.

---

## 26.3 The Yoga Layout Engine

### What Yoga Does

Yoga is Facebook's cross-platform layout engine that implements the CSS flexbox algorithm. In the browser, the layout engine is built into the rendering engine. In the terminal, there is no layout engine -- you have to bring one. Yoga computes the position and dimensions of every node in the tree based on flexbox rules, then Ink reads those computed values to determine where to write text in the output grid.

The integration happens at two points: style application and layout calculation.

### Style Application: `styles.ts`

When a React component sets style props on a `<Box>`, those props flow through the reconciler to the `applyStyles` function. This function translates CSS-like property names into Yoga API calls:

```javascript
const applyFlexStyles = (node, style) => {
    if ('flexGrow' in style) {
        node.setFlexGrow(style.flexGrow ?? 0);
    }
    if ('flexDirection' in style) {
        if (style.flexDirection === 'row') {
            node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW);
        }
        if (style.flexDirection === 'column') {
            node.setFlexDirection(Yoga.FLEX_DIRECTION_COLUMN);
        }
        // ... row-reverse, column-reverse
    }
    if ('justifyContent' in style) {
        if (style.justifyContent === 'space-between') {
            node.setJustifyContent(Yoga.JUSTIFY_SPACE_BETWEEN);
        }
        // ... flex-start, center, flex-end, space-around, space-evenly
    }
};
```

The full style application is broken into seven categories, applied in order:

1. **Position styles**: `absolute` vs `relative` positioning
2. **Margin styles**: margin, marginX/Y, marginTop/Bottom/Left/Right
3. **Padding styles**: same pattern as margins
4. **Flex styles**: flexGrow, flexShrink, flexWrap, flexDirection, flexBasis, alignItems, alignSelf, justifyContent
5. **Dimension styles**: width, height, minWidth, minHeight (supporting numbers and percent strings)
6. **Display styles**: `flex` or `none`
7. **Border styles**: sets 1px border on each edge when `borderStyle` is defined
8. **Gap styles**: columnGap, rowGap, gap

Percent-based dimensions are handled specially. When a width or height is a string like `"50%"`, the code calls `setWidthPercent` or `setHeightPercent` instead of the absolute setters:

```javascript
if ('width' in style) {
    if (typeof style.width === 'number') {
        node.setWidth(style.width);
    } else if (typeof style.width === 'string') {
        node.setWidthPercent(Number.parseInt(style.width, 10));
    } else {
        node.setWidthAuto();
    }
}
```

This allows components to express relative sizing -- a sidebar that takes 30% of the terminal width, a main content area that takes the rest.

### Layout Calculation

Layout happens in the `Ink` class's `calculateLayout` method, triggered whenever the React tree commits:

```javascript
calculateLayout = () => {
    const terminalWidth = this.options.stdout.columns || 80;
    this.rootNode.yogaNode.setWidth(terminalWidth);
    this.rootNode.yogaNode.calculateLayout(
        undefined,
        undefined,
        Yoga.DIRECTION_LTR
    );
};
```

The root node's width is set to the terminal width (defaulting to 80 if no TTY is attached), and Yoga calculates the entire tree's layout in a single `calculateLayout` call. The `undefined` parameters for width and height mean "use the values already set on the root node." `DIRECTION_LTR` sets left-to-right text direction.

After layout, every Yoga node in the tree has computed values accessible via:

- `getComputedLeft()` -- X offset relative to parent
- `getComputedTop()` -- Y offset relative to parent
- `getComputedWidth()` -- total width including padding and border
- `getComputedHeight()` -- total height including padding and border
- `getComputedPadding(edge)` -- resolved padding per edge
- `getComputedBorder(edge)` -- resolved border width per edge

### Text Measurement

The text measure function is where the layout engine and the text rendering system intersect. When Yoga needs to know how much space a text node requires, it calls the measure function with the available width:

```javascript
const measureTextNode = function (node, width) {
    const text = node.nodeName === '#text'
        ? node.nodeValue
        : squashTextNodes(node);
    const dimensions = measureText(text);

    if (dimensions.width <= width) {
        return dimensions;
    }
    if (dimensions.width >= 1 && width > 0 && width < 1) {
        return dimensions;
    }

    const textWrap = node.style?.textWrap ?? 'wrap';
    const wrappedText = wrapText(text, width, textWrap);
    return measureText(wrappedText);
};
```

The `squashTextNodes` function is essential -- it recursively concatenates all text from child nodes, applying `internal_transform` functions along the way. This means that `<Text color="red">hello <Text bold>world</Text></Text>` produces a single measured string "hello world" with transforms applied.

The `measureText` function itself is cached for performance:

```javascript
const measureText = (text) => {
    if (text.length === 0) {
        return { width: 0, height: 0 };
    }
    const cachedDimensions = cache[text];
    if (cachedDimensions) {
        return cachedDimensions;
    }
    const width = widestLine(text);
    const height = text.split('\n').length;
    cache[text] = { width, height };
    return { width, height };
};
```

Width is computed by `widest-line`, which finds the longest line in a multi-line string, accounting for ANSI escape sequences (they have zero display width). Height is simply the number of lines.

Text wrapping supports multiple strategies, controlled by the `textWrap` style:

| Wrap Mode | Behavior |
|---|---|
| `wrap` | Wraps at word boundaries using `wrap-ansi` |
| `truncate` / `truncate-end` | Truncates with ellipsis at the end |
| `truncate-middle` | Truncates with ellipsis in the middle |
| `truncate-start` | Truncates with ellipsis at the start |

The wrapping result is cached by a composite key of `text + maxWidth + wrapType`, which prevents repeated wrapping calculations for the same content at the same width.

---

## 26.4 Node-to-Output Rendering: `render-node-to-output.ts`

### The Output Class

After Yoga computes the layout, every node has coordinates and dimensions. The next step is to convert this tree into a two-dimensional character grid. This happens through the `Output` class, which serves as an intermediate representation between the DOM tree and the terminal:

```javascript
export default class Output {
    width;
    height;
    operations = [];

    constructor(options) {
        this.width = options.width;
        this.height = options.height;
    }

    write(x, y, text, options) {
        if (!text) return;
        this.operations.push({
            type: 'write', x, y, text,
            transformers: options.transformers,
        });
    }

    clip(clip) {
        this.operations.push({ type: 'clip', clip });
    }

    unclip() {
        this.operations.push({ type: 'unclip' });
    }
}
```

The Output class does not immediately write characters to a grid. Instead, it accumulates a list of operations -- write commands with coordinates, plus clip/unclip commands for overflow handling. This operation-based approach is intentional: it allows the final `get()` method to process all writes in a single pass with proper clipping context.

### The Tree Traversal

The `renderNodeToOutput` function walks the DOM tree recursively, converting each node's content into write operations:

```javascript
const renderNodeToOutput = (node, output, options) => {
    const { offsetX = 0, offsetY = 0, transformers = [],
            skipStaticElements } = options;

    if (skipStaticElements && node.internal_static) {
        return;
    }

    const { yogaNode } = node;
    if (yogaNode) {
        if (yogaNode.getDisplay() === Yoga.DISPLAY_NONE) {
            return;
        }

        const x = offsetX + yogaNode.getComputedLeft();
        const y = offsetY + yogaNode.getComputedTop();

        let newTransformers = transformers;
        if (typeof node.internal_transform === 'function') {
            newTransformers = [node.internal_transform, ...transformers];
        }

        if (node.nodeName === 'ink-text') {
            let text = squashTextNodes(node);
            if (text.length > 0) {
                const currentWidth = widestLine(text);
                const maxWidth = getMaxWidth(yogaNode);
                if (currentWidth > maxWidth) {
                    const textWrap = node.style.textWrap ?? 'wrap';
                    text = wrapText(text, maxWidth, textWrap);
                }
                text = applyPaddingToText(node, text);
                output.write(x, y, text,
                    { transformers: newTransformers });
            }
            return;
        }

        // Handle ink-box...
    }
};
```

Several design choices stand out:

**Coordinate accumulation.** Each node's position is relative to its parent. The `offsetX` and `offsetY` parameters accumulate as the recursion descends, so child nodes are positioned absolutely within the output grid.

**Transformer stacking.** Transformers are prepended to a list as the tree is descended, meaning the innermost transform runs first. For a structure like `<Text bold><Text color="red">hello</Text></Text>`, the red colorization runs before the bold transform.

**Text-first rendering.** Text nodes are rendered as leaf operations. When `renderNodeToOutput` encounters an `ink-text` node, it squashes all child text, applies wrapping if needed, adjusts for padding, and writes the result. It does not recurse into children -- text squashing already handled that.

**Static element skipping.** The `skipStaticElements` flag allows the renderer to skip `<Static>` content during the main render pass. Static content is rendered separately to its own Output instance.

### Overflow Clipping

Box nodes can clip their children's content using `overflow: 'hidden'`:

```javascript
if (node.nodeName === 'ink-box') {
    renderBorder(x, y, node, output);

    const clipH = node.style.overflowX === 'hidden' ||
                  node.style.overflow === 'hidden';
    const clipV = node.style.overflowY === 'hidden' ||
                  node.style.overflow === 'hidden';

    if (clipH || clipV) {
        const x1 = clipH ? x + yogaNode.getComputedBorder(Yoga.EDGE_LEFT)
                         : undefined;
        const x2 = clipH ? x + yogaNode.getComputedWidth()
                         - yogaNode.getComputedBorder(Yoga.EDGE_RIGHT)
                         : undefined;
        const y1 = clipV ? y + yogaNode.getComputedBorder(Yoga.EDGE_TOP)
                         : undefined;
        const y2 = clipV ? y + yogaNode.getComputedHeight()
                         - yogaNode.getComputedBorder(Yoga.EDGE_BOTTOM)
                         : undefined;

        output.clip({ x1, x2, y1, y2 });
        clipped = true;
    }
}
```

Clipping is border-aware -- the clip region starts inside the border, not at the node's outer edge. The clip/unclip operations use a stack in the Output's `get()` method, so nested clipping works correctly: an inner clip intersects with the outer clip.

### The Character Grid: `Output.get()`

The `get()` method materializes the operations list into a character grid. This is where the Output class earns its complexity:

```javascript
get() {
    const output = [];
    for (let y = 0; y < this.height; y++) {
        const row = [];
        for (let x = 0; x < this.width; x++) {
            row.push({
                type: 'char', value: ' ',
                fullWidth: false, styles: [],
            });
        }
        output.push(row);
    }

    const clips = [];
    for (const operation of this.operations) {
        if (operation.type === 'clip') {
            clips.push(operation.clip);
        }
        if (operation.type === 'unclip') {
            clips.pop();
        }
        if (operation.type === 'write') {
            // Process write with current clip context...
        }
    }

    const generatedOutput = output
        .map(line => {
            const filtered = line.filter(item => item !== undefined);
            return styledCharsToString(filtered).trimEnd();
        })
        .join('\n');

    return { output: generatedOutput, height: output.length };
}
```

The grid is initialized with space characters, then write operations overlay content at the appropriate positions. Each character in the grid is a styled character object with a value, width flag, and style list. The ANSI tokenizer (`@alcalzone/ansi-tokenize`) breaks incoming text into styled characters so that overlapping writes preserve ANSI escape sequences correctly.

Wide characters (CJK, emoji) require special handling. When a character occupies two columns, the next cell is filled with an empty placeholder:

```javascript
const isWideCharacter = character.fullWidth ||
                        character.value.length > 1;
if (isWideCharacter) {
    currentLine[offsetX + 1] = {
        type: 'char', value: '',
        fullWidth: false, styles: character.styles,
    };
}
offsetX += isWideCharacter ? 2 : 1;
```

Without this, wide characters would corrupt adjacent cells, producing garbled output in terminals with CJK text.

---

## 26.5 The Renderer Pipeline

### The Full Rendering Flow

The renderer function orchestrates the complete pipeline from DOM tree to terminal string:

```javascript
const renderer = (node) => {
    if (node.yogaNode) {
        const output = new Output({
            width: node.yogaNode.getComputedWidth(),
            height: node.yogaNode.getComputedHeight(),
        });
        renderNodeToOutput(node, output,
            { skipStaticElements: true });

        let staticOutput;
        if (node.staticNode?.yogaNode) {
            staticOutput = new Output({
                width: node.staticNode.yogaNode.getComputedWidth(),
                height: node.staticNode.yogaNode.getComputedHeight(),
            });
            renderNodeToOutput(node.staticNode, staticOutput,
                { skipStaticElements: false });
        }

        const { output: generatedOutput, height: outputHeight }
            = output.get();
        return {
            output: generatedOutput,
            outputHeight,
            staticOutput: staticOutput
                ? `${staticOutput.get().output}\n`
                : '',
        };
    }
    return { output: '', outputHeight: 0, staticOutput: '' };
};
```

Notice the dual rendering: main content skips static elements, while static content gets its own Output. The `<Static>` component (discussed further in Chapter 27) renders content that scrolls upward permanently -- completed tool calls, log lines, and other historical output. By separating static and dynamic rendering, Ink avoids re-rendering completed output on every frame.

### The Render Trigger Chain

Understanding when rendering happens is critical for performance. The chain starts in the React reconciler:

```
React setState() / state change
    -> reconciler.resetAfterCommit(rootNode)
        -> rootNode.onComputeLayout()  [calculateLayout]
        -> rootNode.onRender()         [throttled at 32ms]
            -> renderer(rootNode)
            -> logUpdate(output)        [write to stdout]
```

The `resetAfterCommit` callback in the reconciler is the bridge between React's world and the rendering world:

```javascript
resetAfterCommit(rootNode) {
    if (typeof rootNode.onComputeLayout === 'function') {
        rootNode.onComputeLayout();
    }
    if (rootNode.isStaticDirty) {
        rootNode.isStaticDirty = false;
        if (typeof rootNode.onImmediateRender === 'function') {
            rootNode.onImmediateRender();
        }
        return;
    }
    if (typeof rootNode.onRender === 'function') {
        rootNode.onRender();
    }
},
```

Layout calculation happens every time (`onComputeLayout`). But rendering has two paths: if static content changed (`isStaticDirty`), it triggers an immediate render to ensure static output appears before it gets erased by the reconciler. Otherwise, the normal `onRender` callback fires -- and in non-debug mode, this is throttled to 32 milliseconds:

```javascript
this.rootNode.onRender = options.debug
    ? this.onRender
    : throttle(this.onRender, 32, {
        leading: true,
        trailing: true,
    });
```

This means that during rapid streaming (like model response tokens arriving every 10ms), the terminal updates at most ~30 times per second. The throttle uses `leading: true` so the first update is immediate, and `trailing: true` so the final state is always rendered after a burst.

---

## 26.6 Differential Rendering: The Optimizer

### The Last Output Comparison

The simplest form of differential rendering in Ink is the `lastOutput` comparison in the `Ink` class:

```javascript
onRender = () => {
    if (this.isUnmounted) return;

    const { output, outputHeight, staticOutput } =
        render(this.rootNode);

    // ... static output handling ...

    if (!hasStaticOutput && output !== this.lastOutput) {
        this.throttledLog(output);
    }
    this.lastOutput = output;
};
```

If the rendered output string is identical to the previous frame, no terminal write occurs. This is a surprisingly effective optimization. During idle periods, React may trigger re-renders due to unrelated state changes, but if the visible output has not changed, the terminal remains untouched.

### Log-Update: Minimizing Terminal Writes

The `log-update` module handles the actual terminal output with a strategy for in-place updates:

```javascript
const create = (stream, { showCursor = false } = {}) => {
    let previousLineCount = 0;
    let previousOutput = '';
    let hasHiddenCursor = false;

    const render = (str) => {
        if (!showCursor && !hasHiddenCursor) {
            cliCursor.hide();
            hasHiddenCursor = true;
        }
        const output = str + '\n';
        if (output === previousOutput) return;

        previousOutput = output;
        stream.write(
            ansiEscapes.eraseLines(previousLineCount) + output
        );
        previousLineCount = output.split('\n').length;
    };
};
```

The approach is straightforward but effective: erase the previous output's lines, then write the new output. The `eraseLines` function emits ANSI escape sequences that move the cursor up and clear each line. This creates the illusion of in-place updates without the complexity of computing character-level diffs.

For outputs that exceed the terminal height, a different strategy kicks in:

```javascript
if (outputHeight >= this.options.stdout.rows) {
    this.options.stdout.write(
        ansiEscapes.clearTerminal
        + this.fullStaticOutput
        + output
    );
    this.lastOutput = output;
    return;
}
```

When the output would scroll past the terminal boundaries, the entire terminal is cleared and rewritten. This prevents the scrollback buffer from accumulating duplicate content.

### The Throttled Log

The double throttle -- both `onRender` and `throttledLog` -- provides two layers of protection against excessive terminal writes:

1. **Render throttle (32ms)**: Prevents the React-to-string pipeline from running more than ~30 times per second.
2. **Log throttle**: Prevents the string-to-terminal write from happening more frequently than needed even if multiple renders produce different output within the throttle window.

In debug mode, both throttles are disabled, producing immediate rendering for every state change -- useful for development but too costly for production.

---

## 26.7 The React Reconciler

### Connecting React to the Virtual DOM

Ink uses `react-reconciler` to create a custom React renderer. This is the same abstraction that React DOM and React Native use. The reconciler implements a host config -- a set of functions that React calls to create, update, and remove host elements:

```javascript
export default createReconciler({
    createInstance(originalType, newProps, _root, hostContext) {
        if (hostContext.isInsideText && originalType === 'ink-box') {
            throw new Error(
                `<Box> can't be nested inside <Text> component`
            );
        }
        const type = originalType === 'ink-text'
            && hostContext.isInsideText
            ? 'ink-virtual-text'
            : originalType;
        const node = createNode(type);

        for (const [key, value] of Object.entries(newProps)) {
            if (key === 'children') continue;
            if (key === 'style') {
                setStyle(node, value);
                if (node.yogaNode) {
                    applyStyles(node.yogaNode, value);
                }
                continue;
            }
            if (key === 'internal_transform') {
                node.internal_transform = value;
                continue;
            }
            setAttribute(node, key, value);
        }
        return node;
    },

    createTextInstance(text, _root, hostContext) {
        if (!hostContext.isInsideText) {
            throw new Error(
                `Text string "${text}" must be rendered `
                + `inside <Text> component`
            );
        }
        return createTextNode(text);
    },
    // ...
});
```

Two validation rules are enforced at reconciliation time, not at render time:

1. **`<Box>` cannot nest inside `<Text>`** -- this would create a layout contradiction (block-level inside inline).
2. **Raw text must be inside `<Text>`** -- bare strings at the `<Box>` level have no measure function and would not be rendered.

The `ink-virtual-text` type is created automatically when an `ink-text` is nested inside another `ink-text`. This flattening is what makes `<Text><Text bold>hello</Text> world</Text>` work as a single text measurement.

### Update Diffing

The reconciler's `prepareUpdate` function computes minimal prop diffs:

```javascript
prepareUpdate(node, _type, oldProps, newProps, rootNode) {
    if (node.internal_static) {
        rootNode.isStaticDirty = true;
    }
    const props = diff(oldProps, newProps);
    const style = diff(oldProps['style'], newProps['style']);
    if (!props && !style) return null;
    return { props, style };
},

commitUpdate(node, { props, style }) {
    if (props) {
        for (const [key, value] of Object.entries(props)) {
            if (key === 'style') { setStyle(node, value); continue; }
            if (key === 'internal_transform') {
                node.internal_transform = value;
                continue;
            }
            setAttribute(node, key, value);
        }
    }
    if (style && node.yogaNode) {
        applyStyles(node.yogaNode, style);
    }
},
```

The `diff` function returns only changed properties, so `commitUpdate` applies the minimum necessary changes. If nothing changed, `prepareUpdate` returns `null` and React skips the commit entirely.

### Yoga Node Cleanup

When nodes are removed from the tree, their Yoga nodes must be freed to prevent memory leaks:

```javascript
removeChildFromContainer(node, removeNode) {
    removeChildNode(node, removeNode);
    cleanupYogaNode(removeNode.yogaNode);
},

// ...
const cleanupYogaNode = (node) => {
    node?.unsetMeasureFunc();
    node?.freeRecursive();
};
```

The `freeRecursive` call deallocates the Yoga node and all its children. This is critical in Claude Code where conversations can produce thousands of DOM nodes over a session -- without cleanup, memory would grow unboundedly.

---

## 26.8 Border Rendering

Borders are rendered as a special pass during the box rendering phase:

```javascript
const renderBorder = (x, y, node, output) => {
    if (node.style.borderStyle) {
        const width = node.yogaNode.getComputedWidth();
        const height = node.yogaNode.getComputedHeight();
        const box = typeof node.style.borderStyle === 'string'
            ? cliBoxes[node.style.borderStyle]
            : node.style.borderStyle;

        const topBorderColor =
            node.style.borderTopColor ?? node.style.borderColor;
        // ... per-edge color resolution ...

        const contentWidth = width
            - (showLeftBorder ? 1 : 0)
            - (showRightBorder ? 1 : 0);

        let topBorder = showTopBorder
            ? colorize(
                (showLeftBorder ? box.topLeft : '')
                + box.top.repeat(contentWidth)
                + (showRightBorder ? box.topRight : ''),
                topBorderColor, 'foreground')
            : undefined;

        // ... dim support, vertical borders, bottom border ...

        if (topBorder) {
            output.write(x, y, topBorder, { transformers: [] });
        }
        if (showLeftBorder) {
            output.write(x, y + offsetY, leftBorder,
                { transformers: [] });
        }
        // ... right border, bottom border ...
    }
};
```

The `cli-boxes` package provides Unicode box-drawing character sets. Each set defines `topLeft`, `top`, `topRight`, `left`, `right`, `bottomLeft`, `bottom`, and `bottomRight` characters. The border style can be a named preset (like `'single'`, `'double'`, `'round'`) or a custom object with those same fields.

Individual borders can be hidden with `borderTop: false`, `borderLeft: false`, etc. Each edge can have its own color and dim state. This fine-grained control is what allows Claude Code to create tool result boxes where the top border is visible but the bottom is hidden when results are still streaming.

---

## 26.9 Colorization and Output Styling

### The `colorize` Function

The colorize module handles converting Ink's color specification into chalk-based ANSI output:

```javascript
const colorize = (str, color, type) => {
    if (!color) return str;

    if (isNamedColor(color)) {
        if (type === 'foreground') {
            return chalk[color](str);
        }
        const methodName = `bg${color[0].toUpperCase()
            + color.slice(1)}`;
        return chalk[methodName](str);
    }

    if (color.startsWith('#')) {
        return type === 'foreground'
            ? chalk.hex(color)(str)
            : chalk.bgHex(color)(str);
    }

    if (color.startsWith('ansi256')) {
        const matches = ansiRegex.exec(color);
        if (!matches) return str;
        const value = Number(matches[1]);
        return type === 'foreground'
            ? chalk.ansi256(value)(str)
            : chalk.bgAnsi256(value)(str);
    }

    if (color.startsWith('rgb')) {
        const matches = rgbRegex.exec(color);
        if (!matches) return str;
        return type === 'foreground'
            ? chalk.rgb(Number(matches[1]),
                       Number(matches[2]),
                       Number(matches[3]))(str)
            : chalk.bgRgb(Number(matches[1]),
                          Number(matches[2]),
                          Number(matches[3]))(str);
    }

    return str;
};
```

Four color formats are supported:

| Format | Example | Method |
|---|---|---|
| Named color | `"red"`, `"cyan"` | `chalk.red()` / `chalk.bgRed()` |
| Hex | `"#ff5733"` | `chalk.hex('#ff5733')()` |
| ANSI 256 | `"ansi256(196)"` | `chalk.ansi256(196)()` |
| RGB | `"rgb(255, 87, 51)"` | `chalk.rgb(255, 87, 51)()` |

The `type` parameter distinguishes foreground from background color application. Named colors derive their background method name by capitalizing the first letter and prepending `bg` -- so `"red"` becomes `chalk.bgRed()`.

### The Text Component's Transform Pipeline

The `<Text>` component applies styling through its `internal_transform` function rather than through the character grid:

```javascript
export default function Text({
    color, backgroundColor, dimColor = false,
    bold = false, italic = false, underline = false,
    strikethrough = false, inverse = false,
    wrap = 'wrap', children
}) {
    const transform = (children) => {
        if (dimColor) children = chalk.dim(children);
        if (color) children = colorize(children, color, 'foreground');
        if (backgroundColor)
            children = colorize(children, backgroundColor, 'background');
        if (bold) children = chalk.bold(children);
        if (italic) children = chalk.italic(children);
        if (underline) children = chalk.underline(children);
        if (strikethrough) children = chalk.strikethrough(children);
        if (inverse) children = chalk.inverse(children);
        return children;
    };

    return (
        <ink-text
            style={{ flexGrow: 0, flexShrink: 1,
                     flexDirection: 'row', textWrap: wrap }}
            internal_transform={transform}
        >
            {children}
        </ink-text>
    );
}
```

The order of application matters. Dim is applied first (outermost ANSI wrapper), then foreground color, then background, then text decorations. This ordering ensures that dim affects the entire styled output, and inverse properly swaps the already-applied foreground and background.

### Search Highlighting

Claude Code extends Ink's colorization with search highlighting -- when a user presses Ctrl+F and types a query, matching text is highlighted across the entire conversation. The search highlight system works at the rendered string level, not the DOM level:

```javascript
// From the search state (Rust TUI implementation)
fn highlight_matches(&self, text: &str) -> String {
    // Yellow background, black foreground for matches
    // ANSI: \x1b[43;30m ... \x1b[0m
}
```

The highlighting is case-insensitive and applies after all other text transforms. This means a search for "error" will highlight matches even inside syntax-highlighted code blocks, because the highlight wraps around whatever ANSI sequences are already present.

---

## 26.10 Text Selection in the Terminal

### The Challenge

Text selection in a terminal is fundamentally harder than in a browser. Browsers provide native selection APIs. Terminals provide nothing -- they just display characters. To implement selection, Claude Code must:

1. Track the selection anchor and current cursor position
2. Convert screen coordinates to text offsets
3. Apply a background color to the selected range
4. Handle selection across wrapped lines
5. Support copy-to-clipboard of the selected text

### Selection State

The selection system maintains state in the REPL component:

```typescript
// Simplified from the Rust TUI
selection_start: Option<CursorPos>,
```

When the user initiates a selection (Shift+Arrow keys, or mouse drag in supported terminals), the start position is recorded. As the cursor moves, the selection range is computed as the region between start and current position. The design system provides themed selection colors:

```typescript
pub selection: Color,
// Examples across themes:
// One Dark:   #3e4451
// Tokyo Night: #333b5b
// Light:       #d2def2
// Monokai:     #49483e
```

The selection style is applied as a background color transform over the affected character range, much like how the `<Text backgroundColor>` prop works -- but computed dynamically based on cursor state rather than statically from component props.

---

## 26.11 The `<Static>` Component and Permanent Output

The `<Static>` component deserves special attention because it represents a rendering paradigm unique to terminal applications. In a browser, all content is persistent -- you scroll up to see old content. In a terminal, the rendering framework typically rewrites the entire visible area each frame. `<Static>` creates a middle ground: it permanently renders content above the dynamic area, writing it once and never touching it again.

```javascript
export default function Static(props) {
    const { items, children: render, style: customStyle } = props;
    const [index, setIndex] = useState(0);
    const itemsToRender = useMemo(() => {
        return items.slice(index);
    }, [items, index]);

    useLayoutEffect(() => {
        setIndex(items.length);
    }, [items.length]);

    const children = itemsToRender.map((item, itemIndex) => {
        return render(item, index + itemIndex);
    });

    const style = useMemo(() => ({
        position: 'absolute',
        flexDirection: 'column',
        ...customStyle,
    }), [customStyle]);

    return (
        <ink-box internal_static={true} style={style}>
            {children}
        </ink-box>
    );
}
```

The key insight is the `index` state. When new items are added to the `items` array, `itemsToRender` only includes the new ones (sliced from the current index). After rendering, `setIndex` advances to the new length. This means each item is rendered exactly once -- old items are never re-rendered. The `internal_static` flag on the `ink-box` tells the renderer to route this content to the separate static output stream.

In Claude Code, `<Static>` is used for completed tool executions, committed messages, and other historical content. As discussed in Chapter 27, the REPL screen manages the boundary between static and dynamic content, pushing completed responses into `<Static>` as they finish streaming.

---

## 26.12 Native TypeScript Bindings

### Yoga Layout

The `yoga-layout` package provides TypeScript bindings to Facebook's Yoga C++ layout engine. In Claude Code's Ink fork, Yoga is imported as a standard NPM package:

```javascript
import Yoga from 'yoga-layout';
```

Under the hood, `yoga-layout` ships a WebAssembly build of the C++ engine. The WASM binary loads at startup and provides the `Node.create()`, `calculateLayout()`, and property getter/setter APIs that the DOM and style modules use. The performance characteristics are significant: Yoga can compute the layout of hundreds of nodes in under a millisecond, which is why the 32ms render throttle is never layout-bound.

### ANSI Processing

The output pipeline depends on several native-adjacent libraries for ANSI escape sequence processing:

- **`@alcalzone/ansi-tokenize`**: Parses ANSI-styled strings into styled character objects, preserving color, bold, and other attributes per character. Used in `Output.get()` to build the character grid.
- **`slice-ansi`**: Slices ANSI-styled strings at character boundaries without breaking escape sequences. Critical for the clipping system.
- **`string-width`**: Computes the visual width of a string, accounting for ANSI escape sequences (zero width) and wide characters (double width).
- **`widest-line`**: Finds the widest line in a multi-line string using `string-width`.
- **`wrap-ansi`**: Wraps ANSI-styled strings at word boundaries without breaking escape sequences.
- **`cli-truncate`**: Truncates ANSI-styled strings with ellipsis support (start, middle, end positions).

Each of these libraries solves a specific ANSI-awareness problem. Without them, slicing a string like `\x1b[31mhello\x1b[0m` at position 3 might break the escape sequence, producing garbled output. These libraries understand that `\x1b[31m` is a zero-width color code and slice around it correctly.

### The Color Diff System

For diff visualization (covered in more detail in Chapter 29), Claude Code uses color coding to distinguish added, removed, and modified lines. The diff rendering pipeline consumes the same `colorize` function as the rest of the UI, but applies it at the line level:

```
Added lines:   green foreground or green background
Removed lines: red foreground or red background
Context lines: dim foreground
```

The color diff system respects the user's terminal color support level. On terminals with only 16 colors, it falls back to basic ANSI colors. On terminals supporting 256 or true color, it uses the theme's specific RGB values for more subtle differentiation.

---

## 26.13 Performance Characteristics

### Rendering Budget

At 32ms per frame, the entire pipeline must complete within that window:

| Phase | Typical Time | Budget |
|---|---|---|
| React reconciliation | < 1ms | - |
| Yoga layout calculation | < 2ms | - |
| Node-to-output traversal | 1-5ms | Depends on tree depth |
| Output grid materialization | 2-10ms | Depends on output size |
| Terminal write | 1-5ms | Depends on content diff |
| **Total** | **5-23ms** | **< 32ms target** |

The bottleneck is typically the Output grid materialization for large outputs. The character-by-character ANSI tokenization in `get()` processes every character in the output dimensions, even spaces. For a 200-column by 50-row terminal, that is 10,000 characters per frame.

### Memory Profile

Each DOM node allocates:
- One JavaScript object (~200 bytes)
- One Yoga node (~500 bytes in WASM memory) -- except `ink-virtual-text`
- Style object reference (shared when unchanged)
- Child node array (grows with children)

For a typical Claude Code session with a conversation of 50 messages and tool results, the tree might contain 500-2,000 nodes, consuming roughly 500KB-2MB of combined JavaScript and WASM memory. The `<Static>` component's render-once behavior is critical here -- without it, the tree would grow unboundedly as conversations lengthen.

### Where the Experimental Version Diverges

The experimental directory contains an older rendering approach where text dimensions were set directly on the Yoga node in `setTextContent`:

```javascript
const setTextContent = (node, text) => {
    let width = 0;
    let height = 0;
    if (text.length > 0) {
        const dimensions = measureText(text);
        width = dimensions.width;
        height = dimensions.height;
    }
    node.yogaNode.setWidth(node.style.width || width);
    node.yogaNode.setHeight(node.style.height || height);
};
```

This approach bypasses the measure function entirely -- it calculates text dimensions immediately when content changes and sets them as fixed Yoga dimensions. This is simpler but less flexible: it does not support wrapping (the width is always the unwrapped width), and it does not respond to parent container size changes.

The stable version's measure function approach is superior because Yoga calls the measure function with the available width during layout, allowing the text to wrap dynamically. This is why the stable version introduced `ink-virtual-text` -- without Yoga-level measurement, virtual text nodes were unnecessary because each text node directly set its own dimensions.

---

## 26.14 Summary

The Ink rendering engine is a complete terminal UI framework hidden behind familiar React semantics. The virtual DOM provides just enough structure for React reconciliation and Yoga layout without the overhead of a full browser DOM. The Yoga-based flexbox engine computes pixel-perfect (character-perfect) layouts for complex nested interfaces. The node-to-output renderer translates the laid-out tree into a character grid with proper clipping, border rendering, and text wrapping. The differential rendering system, through `lastOutput` comparison and `logUpdate`'s line-erasing approach, minimizes terminal writes to maintain smooth 30 FPS updates.

The colorization pipeline supports four color formats and applies styles through composable transforms rather than per-character attributes. Text selection extends the terminal's inherent limitations with application-level highlighting. Search highlighting adds another layer of visual feedback on top of the existing style pipeline. And native bindings to Yoga, ANSI tokenizers, and string-width calculators provide the performance foundation that makes all of this possible within a 32ms frame budget.

In Chapter 27, we will see how the REPL screen builds on this engine -- composing `<Box>`, `<Text>`, `<Static>`, and dozens of custom components into the full Claude Code interface, with 80+ React hooks managing everything from virtual scrolling to typeahead suggestions.
