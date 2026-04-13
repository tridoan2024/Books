# Chapter 11: File Operation Tools

In Chapter 8, we examined the tool architecture — the generic `Tool` interface, the `buildTool()` factory, the registration pipeline, and how every tool implements the same 40+ method contract. That chapter treated tools as a category. This chapter opens six specific tools that form the agent's primary interface with the filesystem: reading files, editing them, writing them, searching by name pattern, searching by content, and manipulating Jupyter notebooks. Together, these six tools and their supporting infrastructure span roughly 4,500 lines of implementation code across 15 files, plus another 1,200 lines of shared utilities for file state tracking, range-based reading, and checkpointing.

The file tools are the most frequently invoked tools in any Claude Code session. Telemetry shows that in a typical coding session, 40-60% of all tool calls are file operations — reads, edits, greps, globs. Every design decision here is shaped by three constraints that pull in different directions: **accuracy** (the model must see exactly what's on disk), **token efficiency** (sending 50KB of file content per read burns context fast), and **safety** (preventing data loss when the model edits files concurrently with the user). The solutions to these tensions — deduplication, mtime-based staleness detection, LRU state caching, and atomic read-modify-write sections — are what make the difference between a toy prototype and a production file system interface.

### Tool Summary

| Tool | File | Lines | Read/Write | Concurrency-Safe |
|------|------|-------|-----------|-----------------|
| `FileReadTool` | `tools/FileReadTool/FileReadTool.ts` | ~1,180 | Read | Yes |
| `FileEditTool` | `tools/FileEditTool/FileEditTool.ts` | ~626 | Write | No |
| `FileWriteTool` | `tools/FileWriteTool/FileWriteTool.ts` | ~435 | Write | No |
| `GlobTool` | `tools/GlobTool/GlobTool.ts` | ~199 | Read | Yes |
| `GrepTool` | `tools/GrepTool/GrepTool.ts` | ~578 | Read | Yes |
| `NotebookEditTool` | `tools/NotebookEditTool/NotebookEditTool.ts` | ~491 | Write | No |

The read tools declare `isConcurrencySafe: true` and `isReadOnly: true`, which tells the query engine (Chapter 4) they can execute in parallel. The write tools don't — simultaneous edits to the same file would race on the mtime check.

---

## FileReadTool: The Multi-Format Reader

`FileReadTool.ts` is the longest of the six tools at roughly 1,180 lines. The complexity comes from the fact that "reading a file" actually means five different things depending on what the file is.

### The Dispatch Architecture

The tool's `call()` method is a dispatch hub. After path normalization and deduplication checks, it delegates to format-specific handlers based on the file extension:

```typescript
// FileReadTool.ts:821-1017 (simplified)
async function callInner(file_path, fullFilePath, resolvedFilePath, ext, ...) {
  // --- Notebook ---
  if (ext === 'ipynb') {
    const cells = await readNotebook(resolvedFilePath)
    // validate size, validate tokens, update readFileState
    return { data: { type: 'notebook', file: { filePath, cells } } }
  }

  // --- Image ---
  if (IMAGE_EXTENSIONS.has(ext)) {
    const data = await readImageWithTokenBudget(resolvedFilePath, maxTokens)
    return { data }
  }

  // --- PDF ---
  if (isPDFExtension(ext)) {
    // page extraction or full read depending on size and model support
    return { data: pdfData, newMessages: [documentBlock] }
  }

  // --- Text file (default) ---
  const { content, lineCount, totalLines } = await readFileInRange(
    resolvedFilePath, lineOffset, limit, maxSizeBytes, signal
  )
  return { data: { type: 'text', file: { filePath, content, numLines, startLine, totalLines } } }
}
```

The output is a discriminated union with six variants: `text`, `image`, `notebook`, `pdf`, `parts` (extracted PDF pages), and `file_unchanged` (dedup stub). Each variant flows through `mapToolResultToToolResultBlockParam()` to produce the correct API format — text becomes line-numbered content, images become base64 blocks, PDFs become document blocks.

### The Output Schema

The output type system at `FileReadTool.ts:248-332` uses Zod discriminated unions to enforce that each return path carries exactly the right fields:

| Output Type | Trigger | Data Shape | Token Cost |
|------------|---------|------------|------------|
| `text` | `.ts`, `.py`, `.md`, etc. | content + line numbers + range info | Variable (up to 25K tokens) |
| `image` | `.png`, `.jpg`, `.gif`, `.webp` | base64 + media type + dimensions | ~1 token per 8 base64 chars |
| `notebook` | `.ipynb` | parsed cells array | Variable |
| `pdf` | `.pdf` (supported model) | base64 PDF as document block | Model-dependent |
| `parts` | `.pdf` (page extraction) | extracted page images | Per-page image tokens |
| `file_unchanged` | Dedup hit | file path only | ~20 tokens |

### Two-Tier Token Enforcement

The Read tool enforces two independent limits on output size, each with different cost characteristics (`limits.ts:1-14`):

| Limit | Default | Check Cost | On Overflow |
|-------|---------|-----------|-------------|
| `maxSizeBytes` | 256 KB | 1 `stat()` call | Throws pre-read |
| `maxTokens` | 25,000 | API roundtrip | Throws post-read |

The byte limit gates on total file size (not the requested slice), serving as a fast pre-flight check. The token limit uses a two-phase strategy at `FileReadTool.ts:755-772`: first a rough heuristic (`roughTokenCountEstimationForFileType`) — if the estimate is under 25% of the cap, skip the API call. Only when the heuristic says "maybe too large" does it call `countTokensWithAPI()` for a precise count. This avoids an API roundtrip on ~90% of reads while catching genuinely oversized files.

### Line-Oriented Range Reading

Text file reading delegates to `readFileInRange()` at `utils/readFileInRange.ts`, which implements two code paths:

**Fast path** (regular files < 10 MB): Reads the entire file with `readFile()`, then splits lines in memory. This avoids per-chunk async overhead of `createReadStream` and is roughly 2x faster for typical source files.

**Streaming path** (files >= 10 MB, pipes, devices): Uses `createReadStream` with manual `indexOf('\n')` scanning. Lines outside the requested range are counted for `totalLines` but discarded — reading line 1 of a 100 GB file won't balloon RSS. The event handlers are module-level named functions with zero closures; state lives in a `StreamState` object passed via `.bind()`:

```typescript
// readFileInRange.ts:200-216
type StreamState = {
  stream: ReturnType<typeof createReadStream>
  offset: number
  endLine: number
  maxBytes: number | undefined
  resolve: (value: ReadFileRangeResult) => void
  totalBytesRead: number
  selectedLines: string[]
  partial: string  // cross-chunk line fragment
  isFirstChunk: boolean
  // ...
}
```

Both paths strip UTF-8 BOM and normalize `\r\n` to `\n`. The `mtime` comes from `fstat` on the already-open file descriptor — no extra `open()` call.

### Read Deduplication

A significant optimization at `FileReadTool.ts:525-573` prevents duplicate reads from consuming context tokens. When the model reads the same file with the same offset/limit and the file hasn't changed on disk (verified by mtime), the tool returns a `file_unchanged` stub instead of the full content:

```typescript
// FileReadTool.ts:547-571
if (existingState && !existingState.isPartialView && existingState.offset !== undefined) {
  const rangeMatch = existingState.offset === offset && existingState.limit === limit
  if (rangeMatch) {
    const mtimeMs = await getFileModificationTimeAsync(fullFilePath)
    if (mtimeMs === existingState.timestamp) {
      return { data: { type: 'file_unchanged', file: { filePath: file_path } } }
    }
  }
}
```

The dedup only applies to entries created by prior Read calls (where `offset !== undefined`). Edit and Write tools store `offset: undefined` in the state cache because their readFileState entry reflects post-edit mtime — deduping against it would wrongly point the model at pre-edit content still in context. This distinction, documented in a comment citing telemetry data ("18% of Read calls are same-file collisions, up to 2.64% of fleet cache_creation tokens"), shows the level of attention paid to token efficiency in production.

### Image Token Budgeting

Image reads at `FileReadTool.ts:1097-1183` implement a three-tier compression strategy:

1. **Standard resize**: `maybeResizeAndDownsampleImageBuffer()` — fits the image within the API's dimension limits.
2. **Token budget check**: Estimates tokens as `base64.length * 0.125`. If over budget, falls through to aggressive compression.
3. **Aggressive compression**: `compressImageBufferWithTokenLimit()` — iteratively reduces quality/dimensions until the token estimate fits.
4. **Emergency fallback**: 400x400 JPEG at quality 20, using sharp.

The file is read exactly once. All compression passes operate on the same in-memory buffer — no re-reads from disk.

### Blocked Device Paths

A pragmatic safety check at `FileReadTool.ts:98-128` prevents the agent from hanging on device files:

```typescript
const BLOCKED_DEVICE_PATHS = new Set([
  '/dev/zero',     // Infinite output — never reach EOF
  '/dev/random', '/dev/urandom', '/dev/full',
  '/dev/stdin', '/dev/tty', '/dev/console',  // Blocks waiting for input
  '/dev/stdout', '/dev/stderr',              // Nonsensical to read
  '/dev/fd/0', '/dev/fd/1', '/dev/fd/2',
])
```

The check is path-based only (no I/O). Safe devices like `/dev/null` are intentionally omitted. Linux `/proc/self/fd/0-2` aliases are also caught.

---

## FileEditTool: Exact String Replacement

`FileEditTool.ts` (626 lines) implements a surgical editing model. Instead of sending entire file contents for overwrites, the model specifies an `old_string` to find and a `new_string` to replace it with. This design forces the model to demonstrate understanding of the file's current state before modifying it.

### The Input Contract

The schema at `types.ts:6-19` is deceptively simple:

```typescript
z.strictObject({
  file_path: z.string(),
  old_string: z.string(),
  new_string: z.string(),
  replace_all: semanticBoolean(z.boolean().default(false).optional()),
})
```

But the validation logic at `FileEditTool.ts:137-362` enforces a surprisingly deep set of invariants:

1. **Identity check**: `old_string === new_string` is rejected immediately (errorCode 1).
2. **Deny rule check**: The file path is checked against permission deny rules before any filesystem I/O.
3. **UNC path guard**: Windows UNC paths (`\\server\share`) skip all filesystem operations to prevent NTLM credential leaks.
4. **Size guard**: Files over 1 GiB are rejected to prevent OOM (V8/Bun string limit is ~2^30 characters).
5. **Encoding detection**: Reads the file as bytes and checks for UTF-16LE BOM (`0xFF 0xFE`), defaulting to UTF-8.
6. **Read-before-edit guard**: The file must exist in `readFileState` with a non-partial view. This prevents the model from editing a file it hasn't read in this session.
7. **Staleness detection**: Compares the file's current mtime against the cached timestamp. If the file was modified externally (by the user, a linter, or a format-on-save hook), the edit is rejected.
8. **Uniqueness validation**: When `replace_all` is false, the `old_string` must appear exactly once in the file. Multiple matches produce a descriptive error with the match count.
9. **Notebook guard**: `.ipynb` files are redirected to `NotebookEditTool`.

### Quote Normalization

A subtle problem: the model cannot output curly quotes (they're outside its generation vocabulary), but source files may contain them. The `findActualString()` function at `utils.ts:73-93` handles this:

```typescript
export function findActualString(fileContent: string, searchString: string): string | null {
  // First try exact match
  if (fileContent.includes(searchString)) return searchString

  // Try with normalized quotes
  const normalizedSearch = normalizeQuotes(searchString)
  const normalizedFile = normalizeQuotes(fileContent)
  const searchIndex = normalizedFile.indexOf(normalizedSearch)
  if (searchIndex !== -1) {
    return fileContent.substring(searchIndex, searchIndex + searchString.length)
  }
  return null
}
```

When a match is found via normalization, `preserveQuoteStyle()` applies the file's curly quote conventions to `new_string`, so the edit preserves the file's typography. The function uses an open/close heuristic: a quote preceded by whitespace or opening punctuation is treated as opening; otherwise closing. Apostrophes between letters ("don't") are treated as contractions, not quotes.

### The Atomic Critical Section

The `call()` method at `FileEditTool.ts:387-574` is structured around a critical section where no async operations occur between reading the file and writing it back:

```typescript
// FileEditTool.ts:427-430 — comment in source
// Ensure parent directory exists before the atomic read-modify-write section.
// These awaits must stay OUTSIDE the critical section below — a yield between
// the staleness check and writeTextContent lets concurrent edits interleave.
await fs.mkdir(dirname(absoluteFilePath))

// 2. Load current state — synchronous read
const { content, fileExists, encoding, lineEndings } = readFileForEdit(absoluteFilePath)

// Staleness check (synchronous mtime comparison)
if (fileExists) {
  const lastWriteTime = getFileModificationTime(absoluteFilePath)
  const lastRead = readFileState.get(absoluteFilePath)
  if (!lastRead || lastWriteTime > lastRead.timestamp) {
    throw new Error(FILE_UNEXPECTEDLY_MODIFIED_ERROR)
  }
}

// 3-5. Find string, generate patch, write — all synchronous
const actualOldString = findActualString(originalFileContents, old_string) || old_string
const { patch, updatedFile } = getPatchForEdit({ ... })
writeTextContent(absoluteFilePath, updatedFile, encoding, endings)
```

The `readFileForEdit()` helper at line 599 uses `readFileSyncWithMetadata()` — a synchronous read that returns content, encoding, and line endings in a single call. This is deliberately synchronous: an `await` between the staleness check and the write would yield control to the event loop, allowing another concurrent edit to slip in and produce a corrupted file.

After writing, the tool updates `readFileState` with the new content and mtime, then fires LSP notifications (`didChange` + `didSave`) for IDE integration, and notifies VSCode for diff view rendering.

### Desanitization

A unique challenge at `utils.ts:531-574`: the API sanitizes certain XML-like strings before they reach the model (to prevent prompt injection). When the model generates `old_string` values, it produces the sanitized versions. The edit tool applies reverse mappings before matching:

```typescript
const DESANITIZATIONS: Record<string, string> = {
  '<fnr>': '<function_results>',
  '<n>': '<name>',
  '</n>': '</name>',
  '\n\nH:': '\n\nHuman:',
  '\n\nA:': '\n\nAssistant:',
  // ... 15 more pairs
}
```

---

## FileWriteTool: Full Content Replacement

`FileWriteTool.ts` (435 lines) handles two cases: creating new files and overwriting existing ones. It's the blunter instrument compared to FileEditTool — it replaces entire file contents rather than performing surgical edits.

### The Read-Before-Write Guard

The most important safety mechanism is the read-before-write requirement at `FileWriteTool.ts:198-206`:

```typescript
const readTimestamp = toolUseContext.readFileState.get(fullFilePath)
if (!readTimestamp || readTimestamp.isPartialView) {
  return {
    result: false,
    message: 'File has not been read yet. Read it first before writing to it.',
    errorCode: 2,
  }
}
```

This prevents a common failure mode: the model deciding to overwrite a file based on assumptions rather than actual content. For new file creation, the check is skipped (ENOENT during stat means the file doesn't exist yet). The `isPartialView` flag handles auto-injected files like CLAUDE.md where the model saw a processed version (stripped HTML comments, truncated MEMORY.md) — not the raw bytes on disk.

### Line Ending Policy

A design decision documented in a comment at `FileWriteTool.ts:300-305`:

```typescript
// Write is a full content replacement — the model sent explicit line endings
// in `content` and meant them. Do not rewrite them. Previously we preserved
// the old file's line endings (or sampled the repo via ripgrep for new
// files), which silently corrupted e.g. bash scripts with \r on Linux when
// overwriting a CRLF file or when binaries in cwd poisoned the repo sample.
writeTextContent(fullFilePath, content, enc, 'LF')
```

The original approach tried to be clever — detect the file's line ending convention and preserve it. This caused real bugs. The current approach is intentionally simple: the model's output is treated as authoritative. If it sends `\n`, you get `\n`.

### Secret Guard

Before any filesystem operation, FileWriteTool (and FileEditTool) check for secrets in the new content at `FileWriteTool.ts:157-159`:

```typescript
const secretError = checkTeamMemSecrets(fullFilePath, content)
if (secretError) {
  return { result: false, message: secretError, errorCode: 0 }
}
```

This is specifically for team memory files — shared configuration that gets synced across team members. Writing an API key into a team memory file would expose it to the entire team. The check runs before permission checks because secret leakage is a higher-severity concern than access control.

### Create vs. Update Detection

The tool detects whether this is a creation or update based on whether it successfully read existing content:

```typescript
// FileWriteTool.ts:359-413
if (oldContent) {
  const patch = getPatchForDisplay({ filePath, fileContents: oldContent,
    edits: [{ old_string: oldContent, new_string: content, replace_all: false }]
  })
  return { data: { type: 'update', filePath, content, structuredPatch: patch, originalFile: oldContent } }
}
return { data: { type: 'create', filePath, content, structuredPatch: [], originalFile: null } }
```

For updates, it generates a structured diff patch for the UI. For creates, the patch is empty and `originalFile` is null. The model-facing result is the same either way — just a success message with the file path.

---

## GlobTool: File Pattern Matching

`GlobTool.ts` (199 lines) is the most concise of the six tools. It wraps ripgrep's `--files` mode for pattern matching.

### Ripgrep as the Backend

The implementation at `utils/glob.ts:66-130` delegates entirely to ripgrep rather than using Node.js glob libraries:

```typescript
const args = [
  '--files',        // list files instead of searching content
  '--glob', searchPattern,
  '--sort=modified', // oldest first (reversed: most recent shown last)
  ...(noIgnore ? ['--no-ignore'] : []),
  ...(hidden ? ['--hidden'] : []),
]
const allPaths = await ripGrep(args, searchDir, abortSignal)
```

Why ripgrep instead of `fast-glob` or `glob`? Memory safety. Node.js glob implementations build the entire file tree in memory before filtering. On a monorepo with 500K files, this can consume hundreds of megabytes. Ripgrep streams results, applies the pattern during traversal, and respects `.gitignore` rules natively. The tradeoff: ripgrep's `--glob` flag only works with relative patterns, so `extractGlobBaseDirectory()` at `glob.ts:17-64` splits absolute patterns into a base directory and a relative pattern before invoking ripgrep.

The extraction logic walks the pattern string to find the first glob special character (`*`, `?`, `[`, `{`), takes everything before it as the static prefix, and splits at the last path separator. Edge cases include root directory patterns (`/*.txt` where the base directory is `/`), Windows drive roots (`C:/*.txt` where `C:` must become `C:\` to be an absolute root, not a relative-to-drive path), and patterns with no glob characters at all (treated as literal paths, split into directory + filename).

### Result Capping

Results are capped at 100 files by default (configurable via `globLimits?.maxResults`). The truncation flag is passed to the model so it knows to narrow its search:

```typescript
// GlobTool.ts:177-197
if (output.filenames.length === 0) {
  return { content: 'No files found' }
}
return {
  content: [
    ...output.filenames,
    ...(output.truncated
      ? ['(Results are truncated. Consider using a more specific path or pattern.)']
      : []),
  ].join('\n'),
}
```

Paths are relativized to the working directory via `toRelativePath()` to save tokens — absolute paths waste context on repeated prefix strings.

---

## GrepTool: Content Search

`GrepTool.ts` (578 lines) wraps ripgrep for content search with three output modes, context lines, pagination, and automatic path relativization.

### Three Output Modes

| Mode | ripgrep Flag | Returns | Default `head_limit` |
|------|-------------|---------|---------------------|
| `files_with_matches` | `-l` | File paths sorted by mtime | 250 |
| `content` | (none) | Matching lines with context | 250 |
| `count` | `-c` | `filename:count` pairs | 250 |

The default mode is `files_with_matches` — the model gets file paths first, then reads the specific files it needs. This two-step pattern (grep to find, read to examine) is more token-efficient than dumping all matching content at once.

### Pagination via `head_limit` and `offset`

The `applyHeadLimit()` function at `GrepTool.ts:110-128` implements shell-like `| tail -n +N | head -N` semantics:

```typescript
function applyHeadLimit<T>(items: T[], limit: number | undefined, offset: number = 0) {
  if (limit === 0) return { items: items.slice(offset), appliedLimit: undefined }  // explicit 0 = unlimited
  const effectiveLimit = limit ?? DEFAULT_HEAD_LIMIT  // 250
  const sliced = items.slice(offset, offset + effectiveLimit)
  const wasTruncated = items.length - offset > effectiveLimit
  return { items: sliced, appliedLimit: wasTruncated ? effectiveLimit : undefined }
}
```

The `appliedLimit` is only set when truncation actually occurred, so the model knows there are more results and can paginate with a higher offset. The default cap of 250 entries prevents unbounded content-mode greps from filling the 20KB persist threshold.

### Files-With-Matches: mtime Sorting

In `files_with_matches` mode, results are sorted by modification time (most recent first) at `GrepTool.ts:529-553`. This surfaces recently changed files at the top — when debugging, the model is more likely to need files it or the user recently touched. The stat calls use `Promise.allSettled` so a single ENOENT (file deleted between ripgrep's scan and the stat) doesn't reject the whole batch.

### Argument Construction

The `call()` method builds ripgrep arguments incrementally at `GrepTool.ts:310-441`. A few decisions are worth noting:

- **`--max-columns 500`**: Limits line length in output to prevent base64 blobs or minified JavaScript from consuming the entire result. Lines exceeding 500 characters are truncated.
- **`--hidden`**: Always enabled. Hidden files (`.env.example`, `.gitignore`) are legitimate search targets.
- **Multiline mode**: Only enabled when explicitly requested via `multiline: true`, which adds `-U --multiline-dotall`. This makes `.` match newlines, enabling cross-line patterns like `struct \{[\s\S]*?field`. It's opt-in because multiline matching changes regex semantics in ways that could surprise the model.
- **Dash-prefixed patterns**: If the regex starts with `-`, the tool uses `-e pattern` to prevent ripgrep from interpreting it as a command-line flag.

### Built-in Exclusions

The tool automatically excludes version control directories:

```typescript
const VCS_DIRECTORIES_TO_EXCLUDE = ['.git', '.svn', '.hg', '.bzr', '.jj', '.sl']
```

It also applies permission-based ignore patterns from the app state, normalizes them relative to the search directory for ripgrep's gitignore-style pattern matching, and excludes orphaned plugin cache directories to prevent stale search results. The glob patterns are negated with `!` — ripgrep treats un-negated patterns as inclusion filters and negated ones as exclusion filters.

---

## NotebookEditTool: Jupyter Cell Manipulation

`NotebookEditTool.ts` (491 lines) handles the structural editing of `.ipynb` files — JSON documents with a cells array. While FileReadTool reads notebooks by parsing cells, this tool modifies them.

### Three Edit Modes

```typescript
edit_mode: z.enum(['replace', 'insert', 'delete'])
```

**Replace**: Updates the source of an existing cell by index or cell ID. Resets `execution_count` and clears `outputs` for code cells, since the cell's content no longer matches its output.

**Insert**: Adds a new cell after the specified cell ID (or at the beginning if no ID). Generates a random cell ID for notebooks with nbformat >= 4.5.

**Delete**: Removes a cell by splicing it from the array.

### Cell ID Resolution

The tool supports two cell identification methods at `NotebookEditTool.ts:269-291`:

1. **Native cell ID**: Matches against the `cell.id` field present in nbformat 4.5+ notebooks.
2. **Numeric index**: Falls back to parsing a `cell-N` format string via `parseCellId()`.

This dual resolution handles both modern notebooks (which have UUIDs as cell IDs) and older notebooks (which only have positional indices).

### Read-Before-Edit Enforcement

Like FileEditTool and FileWriteTool, NotebookEditTool requires a prior read at `NotebookEditTool.ts:221-237`:

```typescript
const readTimestamp = toolUseContext.readFileState.get(fullPath)
if (!readTimestamp) {
  return { result: false, message: 'File has not been read yet.', errorCode: 9 }
}
if (getFileModificationTime(fullPath) > readTimestamp.timestamp) {
  return { result: false, message: 'File has been modified since read.', errorCode: 10 }
}
```

The source comment explicitly notes this "matches FileEditTool/FileWriteTool" — the three write tools enforce the same staleness protocol.

### JSON Parse Pitfall

A subtle correctness issue at `NotebookEditTool.ts:329-332`: the tool must use `jsonParse()` (non-memoized) instead of `safeParseJSON()` (memoized). `safeParseJSON` caches by content string and returns a shared object reference. Since the tool mutates the notebook in place (`cells.splice`, `targetCell.source = ...`), using the memoized version would poison the cache — subsequent validation calls would see the mutated object.

---

## File State Caching

All six tools interact with a shared `FileStateCache` at `utils/fileStateCache.ts`. This is the central mechanism that coordinates reads and writes across tools and prevents stale edits.

### The Cache Structure

```typescript
export type FileState = {
  content: string        // file content at read time
  timestamp: number      // mtime in milliseconds
  offset: number | undefined   // Read offset (undefined for Edit/Write entries)
  limit: number | undefined    // Read limit
  isPartialView?: boolean      // true for auto-injected content (CLAUDE.md)
}
```

The cache is an LRU with two eviction dimensions (`fileStateCache.ts:33-39`):

```typescript
this.cache = new LRUCache<string, FileState>({
  max: maxEntries,          // Default: 100 entries
  maxSize: maxSizeBytes,    // Default: 25 MB
  sizeCalculation: value => Math.max(1, Buffer.byteLength(value.content)),
})
```

All path keys are `normalize()`d before access, ensuring consistent cache hits regardless of trailing slashes, redundant segments (`/foo/../bar`), or mixed separators on Windows.

### The Staleness Protocol

Every write tool (Edit, Write, NotebookEdit) follows the same three-step protocol:

1. **Read check**: Verify the file exists in `readFileState` with a non-partial view.
2. **Mtime check**: Compare `getFileModificationTime(path)` against the cached timestamp. If the file was modified externally, reject with an error asking the model to re-read.
3. **Content fallback** (Windows): If mtime changed but content is identical (cloud sync, antivirus can touch mtime without changing content), allow the edit to proceed.

After writing, all three tools update the cache with the new content and current mtime. Edit and Write set `offset: undefined` — this is a deliberate signal. FileReadTool's dedup logic only matches entries where `offset !== undefined`, so an Edit followed by a Read will always re-read from disk rather than returning the dedup stub.

### Cache Cloning for Subagents

When the agent spawns a subagent (Chapter 8's `AgentTool`), the file state cache is cloned via `cloneFileStateCache()`:

```typescript
export function cloneFileStateCache(cache: FileStateCache): FileStateCache {
  const cloned = createFileStateCacheWithSizeLimit(cache.max, cache.maxSize)
  cloned.load(cache.dump())
  return cloned
}
```

This gives each subagent its own view of file state. When merging back, `mergeFileStateCaches()` takes the more recent entry (by timestamp) for each file path — if the subagent edited a file, its newer mtime wins.

---

## File History and Checkpointing

Beyond the in-memory state cache, Claude Code maintains a persistent file history system at `utils/fileHistory.ts` that enables undo across tool uses.

### Backup Strategy

Before every edit or write, the tool calls `fileHistoryTrackEdit()` — this creates a backup of the file's pre-edit content. Backups are keyed by content hash (SHA-256), making them idempotent: if the file was already backed up with the same content, no duplicate is created.

```typescript
export type FileHistorySnapshot = {
  messageId: UUID           // associated message ID
  trackedFileBackups: Record<string, FileHistoryBackup>  // path -> backup
  timestamp: Date
}
```

Snapshots are capped at `MAX_SNAPSHOTS = 100`. Each snapshot records which files were modified during a single message exchange. The `snapshotSequence` counter is monotonically increasing even when old snapshots are evicted — this gives the UI a reliable activity signal.

### Undo and Revert

The `/rewind` command uses file history snapshots to reverse changes. When the user rewinds to a specific message, the system:

1. Identifies all snapshots created after that message
2. Restores each backed-up file to its pre-edit content
3. Rolls back the conversation transcript to that point

The content-hash keying prevents duplicate backups — if the model edits a file, then the user manually reverts it, then the model edits it again, the first and third backups share the same key. Only the actual content bytes are stored once.

### Concurrent Edit Safety

File history snapshots interact with the worktree system (Chapter 13). When a subagent runs in a worktree, its file history is isolated — backups go to the worktree's own history. When the worktree is merged back, the parent's file history doesn't include the worktree changes. This prevents a rewind in the parent from accidentally reverting changes that were already committed in the worktree's branch.

### Interaction with the Write Protocol

File history backups are intentionally called before the staleness check, outside the critical section:

```typescript
// FileEditTool.ts:431-439
// Backup captures pre-edit content — safe to call before the staleness
// check (idempotent v1 backup keyed on content hash; if staleness fails
// later we just have an unused backup, not corrupt state).
await fileHistoryTrackEdit(updateFileHistoryState, absoluteFilePath, parentMessage.uuid)
```

If the subsequent staleness check fails, you have an unused backup — not corrupt state. The idempotent backup design means this is harmless.

---

## Cross-Cutting Patterns

Several engineering patterns recur across all six file tools. These are worth calling out because they represent deliberate architectural decisions.

### Path Normalization

Every tool calls `expandPath()` on input paths before any filesystem operation. This function resolves `~`, strips trailing whitespace, and normalizes separators. The `backfillObservableInput()` hook ensures the expanded path is what hook scripts see — preventing bypass of allow/deny lists via `~/` or relative paths:

```typescript
backfillObservableInput(input) {
  if (typeof input.file_path === 'string') {
    input.file_path = expandPath(input.file_path)
  }
}
```

### UNC Path Security

All six tools check for UNC paths (`\\server\share` or `//server/share`) and skip filesystem operations. On Windows, even an `fs.stat()` on a UNC path triggers SMB authentication, which can leak NTLM credentials to a malicious server. This check appears identically in every tool's `validateInput()`.

### Skill Discovery

Read, Edit, and Write tools all trigger skill discovery for the files they touch:

```typescript
const newSkillDirs = await discoverSkillDirsForPaths([fullFilePath], cwd)
if (newSkillDirs.length > 0) {
  for (const dir of newSkillDirs) {
    context.dynamicSkillDirTriggers?.add(dir)
  }
  addSkillDirectories(newSkillDirs).catch(() => {})
}
activateConditionalSkillsForPaths([fullFilePath], cwd)
```

When you edit a file in `src/api/`, the API conventions skill auto-activates. This fire-and-forget pattern (no `await` on `addSkillDirectories`) keeps the tool's hot path fast while loading skills in the background.

### Symlink Safety

All file tools check for symbolic links at the boundary between user-visible paths and actual filesystem paths. The `expandPath()` function resolves `~` and normalizes separators, but deliberately does NOT follow symlinks — the resolved path must point to a regular file, not a symlink. This prevents an attack where a sandboxed agent creates a symlink from a legitimate path to a sensitive system file, then uses FileWriteTool to overwrite the target.

The check works with the sandbox system: inside the sandbox, symlinks pointing outside the allowed directory tree are blocked by the kernel. Outside the sandbox, the tools rely on the path normalization and deny-list checking to catch malicious paths.

### LSP Integration

Both FileEditTool and FileWriteTool notify LSP servers after writes via `didChange` and `didSave` events. This triggers real-time diagnostics (TypeScript errors, lint warnings) that appear as attachments on the next model turn. The notifications are fire-and-forget with `.catch()` to prevent LSP failures from blocking file operations.

---

## Design Lessons

The file tools in Claude Code encode several lessons that apply to any agent filesystem interface:

**1. The read-before-write invariant is non-negotiable.** Without it, the model can and will overwrite files based on hallucinated content. The `readFileState` cache makes this enforceable without requiring the model to re-send file content — the tool just checks that a prior read exists and the file hasn't changed since.

**2. Surgical edits beat full rewrites.** FileEditTool's exact-string-replacement model forces the model to demonstrate it knows the file's current state. This catches hallucinated edits at the tool level rather than corrupting files. The tradeoff — uniqueness validation can be annoying when the model picks too small a match string — is worth the safety.

**3. Token efficiency requires active management.** Read deduplication, path relativization, default `head_limit` on grep, and the two-tier token enforcement all exist because context tokens are the scarce resource in an agent loop. Every token spent on file content is a token not available for reasoning.

**4. Staleness detection must be mtime-based, not content-based.** Comparing file content on every write would be expensive (large files) and racy (content could change between comparison and write). Mtime comparison is one syscall and catches all modifications, including those from external tools and linters. The content fallback for Windows handles the edge case where cloud sync touches mtime without changing content.

**5. Critical sections must be synchronous.** The read-modify-write pattern in FileEditTool uses synchronous filesystem operations deliberately. An `await` between reading current content and writing new content yields to the event loop, allowing concurrent edits to interleave and produce corruption. The async operations (mkdir, file history backup) are moved outside the critical section.

In Chapter 12, we'll examine the UI renderer — how Claude Code's forked Ink framework renders these tool results, diffs, and permission dialogs to the terminal using a cell-based screen buffer, double-buffered rendering, and a custom React reconciler.
