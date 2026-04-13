# Chapter 24: Session Management

A CLI agent that loses its memory the moment you close the terminal is barely more useful than a one-shot script. Users need to pause work, resume conversations, switch between projects, search through past interactions, and understand how much each session cost them. Claude Code's session management system addresses all of this through a persistence layer spanning over 5,100 lines of code in `sessionStorage.ts` alone, backed by SQLite with WAL mode, schema migrations, JSONL transcript streaming, full-text search via FTS5, and a concurrent session registry that prevents conflicts when multiple instances run simultaneously.

In this chapter, we will build a production-grade session management system from the ground up. We will start with the data model and storage schema, move through the transcript format and persistence engine, then cover session resume, cross-project support, search, metadata management, and concurrent session handling. As we saw in Chapter 23, the memory system provides cross-session knowledge persistence. Session management is complementary -- it preserves the full conversation state: every message, every tool call, every token count and cost, ready to be resumed or analyzed.

---

## 24.1 Architecture Overview

Session management sits at the intersection of three concerns: **persistence** (saving conversations to durable storage), **lifecycle** (tracking session state from creation through completion), and **discovery** (searching, listing, and navigating past sessions). The architecture reflects this separation:

```
┌──────────────────────────────────────────────────────────────┐
│                      Session Commands                         │
│  /sessions  /resume  /session  /search  /tag  /export        │
└──────────┬──────────┬──────────┬──────────┬─────────────────┘
           │          │          │          │
           ▼          ▼          ▼          ▼
┌──────────────────────────────────────────────────────────────┐
│                    Session Store (Core)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ CRUD     │ │ Search   │ │ Export   │ │ Lifecycle Mgmt │  │
│  │ (create, │ │ (FTS5,   │ │ (JSON,  │ │ (fork, merge, │  │
│  │  load,   │ │  snippet │ │  MD,    │ │  replay, GC)  │  │
│  │  save,   │ │  context)│ │  HTML,  │ │               │  │
│  │  delete) │ │          │ │  text)  │ │               │  │
│  └────┬─────┘ └────┬─────┘ └────┬────┘ └───────┬───────┘  │
│       │            │            │               │           │
│       ▼            ▼            ▼               ▼           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              SQLite + WAL Mode                        │   │
│  │  ┌────────┐ ┌──────────┐ ┌────────────┐ ┌─────────┐ │   │
│  │  │sessions│ │ messages │ │content_    │ │usage_   │ │   │
│  │  │        │ │          │ │blocks      │ │stats    │ │   │
│  │  └────────┘ └──────────┘ └────────────┘ └─────────┘ │   │
│  │  ┌────────────┐ ┌─────────────┐ ┌──────────────────┐│   │
│  │  │large_      │ │session_tags │ │messages_fts (FTS5)││   │
│  │  │results     │ │             │ │                   ││   │
│  │  └────────────┘ └─────────────┘ └──────────────────┘│   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

The session store itself uses two parallel storage strategies. The primary store is a SQLite database with WAL (Write-Ahead Logging) mode for crash safety and concurrent reader support. The secondary store keeps individual session files as JSON on the filesystem, making sessions easy to inspect, back up, and version-control. This dual approach means that even if the database becomes corrupted, sessions are recoverable from the JSON files.

### Design Principles

Three principles guide the architecture:

1. **Never lose data.** Session writes use atomic rename (write to `.tmp`, then rename), WAL mode prevents corruption on crash, and soft-delete means a deleted session is recoverable from the `.trash/` directory for at least one GC cycle.

2. **Resume must be instant.** Session metadata is cached separately from message content, so listing and filtering sessions only loads lightweight `SessionInfo` structs. The full message payload is loaded lazily only when the user actually resumes a session.

3. **Storage must be bounded.** Without active management, sessions accumulate indefinitely. The system enforces retention periods, maximum session counts, and database size limits. A background garbage collector archives old sessions before permanently deleting them after a configurable cooling period.

---

## 24.2 The Database Schema

The schema is the foundation. Getting it wrong means painful migrations later -- or worse, data loss. Here is the initial schema, designed to handle everything from simple conversations to multi-tool agentic sessions with embedded images and documents:

```typescript
// Schema version 1: Core tables
const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    model TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    project_dir TEXT,
    total_turns INTEGER DEFAULT 0,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_cost_usd REAL DEFAULT 0.0,
    status TEXT DEFAULT 'active',
    metadata TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL,
    model TEXT,
    stop_reason TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    turn_number INTEGER DEFAULT 0,
    metadata TEXT DEFAULT '{}',
    FOREIGN KEY (session_id)
      REFERENCES sessions(id) ON DELETE CASCADE
  );
  CREATE INDEX idx_messages_session ON messages(session_id);
  CREATE INDEX idx_messages_role ON messages(role);

  CREATE TABLE IF NOT EXISTS content_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    block_type TEXT NOT NULL,
    block_index INTEGER NOT NULL,
    text_content TEXT,
    tool_use_id TEXT,
    tool_name TEXT,
    tool_input TEXT,
    tool_result_id TEXT,
    is_error INTEGER DEFAULT 0,
    thinking_text TEXT,
    image_media_type TEXT,
    image_data_ref TEXT,
    doc_media_type TEXT,
    doc_filename TEXT,
    doc_data_ref TEXT,
    FOREIGN KEY (message_id)
      REFERENCES messages(id) ON DELETE CASCADE
  );
  CREATE INDEX idx_blocks_message ON content_blocks(message_id);

  CREATE TABLE IF NOT EXISTS usage_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_creation_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0.0,
    latency_ms INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id)
      REFERENCES sessions(id) ON DELETE CASCADE
  );
  CREATE INDEX idx_usage_session ON usage_stats(session_id);
`;
```

### Why This Structure

The schema uses **normalized tables** rather than stuffing everything into a single JSONL blob. Here is why:

**Content blocks are separate from messages.** A single assistant message can contain a text block, a thinking block, a tool-use block, and an image reference. Keeping these in their own table lets us query for specific block types (e.g., "find all bash tool calls across sessions") without parsing JSON.

**Usage stats are per-turn.** Storing token counts at the turn level rather than just the session level enables cost analysis over time: which turns were expensive, which models were used for which operations, what is the average cost per tool call.

**The `tool_result` references are inline.** The `tool_result_id` in `content_blocks` links a tool result back to its corresponding `tool_use` block. This is critical for reconstructing the conversation during resume -- the API requires matched tool-use and tool-result pairs.

**Binary data uses references, not inline storage.** Images and documents store a `data_ref` pointing to an external file rather than embedding base64 in the database. This keeps the database lean and avoids SQLite's performance degradation with large blobs.

### Schema Migrations

Real systems evolve. You cannot redesign the schema from scratch every release -- you need migrations. Here is the migration engine:

```typescript
interface Migration {
  fromVersion: number;
  toVersion: number;
  description: string;
  sql: string;
}

const CURRENT_SCHEMA_VERSION = 3;

function allMigrations(): Migration[] {
  return [
    {
      fromVersion: 0,
      toVersion: 1,
      description: "Initial schema",
      sql: SCHEMA_V1,
    },
    {
      fromVersion: 1,
      toVersion: 2,
      description: "Add large results table",
      sql: `
        CREATE TABLE IF NOT EXISTS large_results (
          id TEXT PRIMARY KEY,
          content_block_id INTEGER,
          data TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (content_block_id)
            REFERENCES content_blocks(id) ON DELETE CASCADE
        );
        CREATE INDEX idx_large_results_block
          ON large_results(content_block_id);
      `,
    },
    {
      fromVersion: 2,
      toVersion: 3,
      description: "Add full-text search and tags",
      sql: `
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
          USING fts5(
            session_id,
            role,
            text_content,
            content='content_blocks',
            content_rowid='id'
          );

        CREATE TABLE IF NOT EXISTS session_tags (
          session_id TEXT NOT NULL,
          tag TEXT NOT NULL,
          PRIMARY KEY (session_id, tag),
          FOREIGN KEY (session_id)
            REFERENCES sessions(id) ON DELETE CASCADE
        );
      `,
    },
  ];
}
```

The migration runner checks the current schema version, applies any pending migrations in order, and updates the version atomically. A critical implementation detail: the `schema_version` table itself is created by the first migration check, so it bootstraps cleanly on a fresh database:

```typescript
class SessionStore {
  private db: Database;
  private config: SessionStoreConfig;

  static open(dbPath: string): SessionStore {
    const db = new Database(dbPath);

    // WAL mode for crash safety and concurrent reads
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");

    const store = new SessionStore(db, defaultConfig(dbPath));
    store.runMigrations();
    return store;
  }

  private runMigrations(): void {
    const current = this.getSchemaVersion();
    const migrations = allMigrations()
      .filter(m => m.fromVersion >= current
                   && m.toVersion <= CURRENT_SCHEMA_VERSION)
      .sort((a, b) => a.fromVersion - b.fromVersion);

    for (const migration of migrations) {
      this.db.exec(migration.sql);
      this.setSchemaVersion(migration.toVersion);
    }
  }
}
```

The `large_results` table in migration v2 deserves special attention. When a tool returns a very large result (e.g., `cat` on a 200KB file), storing it inline in the `content_blocks` table makes the database unwieldy. The threshold is 50KB:

```typescript
const LARGE_RESULT_THRESHOLD = 50 * 1024; // 50 KB

function storeToolResult(
  store: SessionStore,
  blockId: number,
  result: string
): void {
  if (result.length > LARGE_RESULT_THRESHOLD) {
    const refId = generateId();
    store.storeLargeResult(refId, blockId, result);
    // Store a reference marker instead of the full content
    store.updateBlockContent(blockId, `[large-result:${refId}]`);
  } else {
    store.updateBlockContent(blockId, result);
  }
}
```

---

## 24.3 The Transcript Format

While SQLite stores the structured data, the agent also needs a **streaming-friendly** format for real-time persistence. If the process crashes mid-conversation, you want to recover everything up to the last completed event. This is where JSONL (JSON Lines) comes in.

### JSONL Event Stream

Each line in the transcript is a self-contained JSON object representing a single event:

```jsonl
{"type":"session_start","session_id":"abc12345","model":"claude-sonnet-4-20250514","ts":1705123456}
{"type":"user_message","id":"msg-001","content":"Fix the auth bug","ts":1705123460}
{"type":"assistant_start","id":"msg-002","model":"claude-sonnet-4-20250514","ts":1705123461}
{"type":"text_block","message_id":"msg-002","text":"I'll investigate the authentication module...","ts":1705123462}
{"type":"tool_use","message_id":"msg-002","tool_use_id":"tu-001","name":"Read","input":{"file_path":"src/auth.ts"},"ts":1705123463}
{"type":"tool_result","tool_use_id":"tu-001","content":"export function authenticate(...)...","is_error":false,"ts":1705123464}
{"type":"assistant_end","id":"msg-002","stop_reason":"end_turn","input_tokens":1200,"output_tokens":450,"ts":1705123470}
{"type":"usage","turn":1,"input_tokens":1200,"output_tokens":450,"cost_usd":0.0103,"ts":1705123470}
```

### Why JSONL Over a Single JSON File

Three reasons:

1. **Append-only writes.** You never need to rewrite the entire file. Each event is appended, which is both fast and crash-safe (a partial last line is simply truncated during recovery).

2. **Streaming replay.** You can process the transcript line by line without loading the entire file into memory. This matters for sessions with thousands of tool calls.

3. **Incremental backup.** Backup tools can sync only the new lines, not the entire file.

The transcript writer is deliberately simple:

```typescript
class TranscriptWriter {
  private fd: number;
  private path: string;

  constructor(sessionDir: string, sessionId: string) {
    this.path = path.join(sessionDir, `${sessionId}.jsonl`);
    this.fd = fs.openSync(this.path, "a"); // append mode
  }

  write(event: TranscriptEvent): void {
    const line = JSON.stringify(event) + "\n";
    fs.writeSync(this.fd, line);
    // No explicit fsync -- WAL mode on the DB is the durability guarantee.
    // The JSONL is a recovery backup, not the primary store.
  }

  close(): void {
    fs.closeSync(this.fd);
  }
}
```

### Recovery from Transcript

When the SQLite database is corrupted or missing, the recovery process reads the JSONL transcript and reconstructs the session:

```typescript
function recoverFromTranscript(
  transcriptPath: string,
  store: SessionStore
): SessionMetadata | null {
  const lines = fs.readFileSync(transcriptPath, "utf-8")
    .split("\n")
    .filter(line => line.trim().length > 0);

  let sessionMeta: SessionMetadata | null = null;
  const messages: StoredMessage[] = [];
  let currentMessage: Partial<StoredMessage> | null = null;

  for (const line of lines) {
    let event: TranscriptEvent;
    try {
      event = JSON.parse(line);
    } catch {
      // Truncated last line from crash -- skip it
      continue;
    }

    switch (event.type) {
      case "session_start":
        sessionMeta = {
          id: event.session_id,
          model: event.model,
          startedAt: new Date(event.ts * 1000),
          status: "active",
          // ... other fields
        };
        break;

      case "user_message":
        messages.push({
          id: event.id,
          sessionId: sessionMeta!.id,
          role: "user",
          contentBlocks: [{ type: "text", text: event.content }],
          createdAt: new Date(event.ts * 1000),
        });
        break;

      case "assistant_start":
        currentMessage = {
          id: event.id,
          role: "assistant",
          contentBlocks: [],
        };
        break;

      case "text_block":
        if (currentMessage) {
          currentMessage.contentBlocks!.push({
            type: "text",
            text: event.text,
          });
        }
        break;

      case "assistant_end":
        if (currentMessage) {
          currentMessage.inputTokens = event.input_tokens;
          currentMessage.outputTokens = event.output_tokens;
          messages.push(currentMessage as StoredMessage);
          currentMessage = null;
        }
        break;
    }
  }

  if (sessionMeta) {
    store.createSession(sessionMeta);
    for (const msg of messages) {
      store.storeMessage(msg);
    }
  }

  return sessionMeta;
}
```

---

## 24.4 Session Persistence Engine

The persistence engine bridges the in-memory conversation state and durable storage. Its core responsibility: after every turn, persist the current state so that a resume will produce a conversation indistinguishable from the original.

### The SessionStore Class

The store wraps SQLite and provides a typed API for all session operations:

```typescript
interface SessionStoreConfig {
  dbPath: string;
  walMode: boolean;
  maxDbSize: number;           // bytes, default 500MB
  retentionPeriod: number;     // seconds, default 30 days
  maxSessions: number;         // default 1000
  largeResultThreshold: number; // bytes, default 50KB
  enableFts: boolean;          // full-text search
  autoVacuum: boolean;
  busyTimeoutMs: number;       // default 5000
}

class SessionStore {
  private config: SessionStoreConfig;
  private sessions: Map<string, SessionMetadata>;
  private messageCache: Map<string, StoredMessage[]>;

  // --- Session CRUD ---

  createSession(metadata: SessionMetadata): void {
    this.sessions.set(metadata.id, metadata);
    this.messageCache.set(metadata.id, []);
    this.persistSessionRow(metadata);
  }

  endSession(id: string, status: SessionStatus): void {
    const session = this.sessions.get(id);
    if (!session) throw new StoreError("session_not_found", id);
    session.endedAt = new Date();
    session.status = status;
    this.persistSessionRow(session);
  }

  // --- Message Storage ---

  storeMessage(msg: StoredMessage): void {
    const cache = this.messageCache.get(msg.sessionId) ?? [];
    cache.push(msg);
    this.messageCache.set(msg.sessionId, cache);

    // Update session aggregate stats
    const session = this.sessions.get(msg.sessionId);
    if (session) {
      session.totalTurns += 1;
      session.totalInputTokens += msg.inputTokens;
      session.totalOutputTokens += msg.outputTokens;
    }

    this.persistMessage(msg);
  }
}
```

### Content Block Serialization

The trickiest part of persistence is faithfully serializing content blocks. Claude's API returns multiple block types -- text, thinking, tool-use, tool-result, image, and document -- and each must round-trip perfectly through storage:

```typescript
interface StoredContentBlock {
  id: number;
  messageId: string;
  blockType: string;  // "text" | "tool_use" | "tool_result" | "thinking" | "image" | "document"
  blockIndex: number;
  textContent: string | null;
  toolUseId: string | null;
  toolName: string | null;
  toolInput: string | null;     // JSON-serialized
  toolResultId: string | null;
  isError: boolean;
  thinkingText: string | null;
  imageMediaType: string | null;
  imageDataRef: string | null;  // reference to file, not inline data
  docMediaType: string | null;
  docFilename: string | null;
  docDataRef: string | null;
}

function serializeContentBlock(
  block: ContentBlock,
  messageId: string,
  index: number
): StoredContentBlock {
  const base = {
    id: 0, // auto-increment
    messageId,
    blockIndex: index,
    blockType: block.type,
    // All nullable fields default to null
    textContent: null, toolUseId: null, toolName: null,
    toolInput: null, toolResultId: null, isError: false,
    thinkingText: null, imageMediaType: null, imageDataRef: null,
    docMediaType: null, docFilename: null, docDataRef: null,
  };

  switch (block.type) {
    case "text":
      return { ...base, textContent: block.text };

    case "thinking":
      return { ...base, thinkingText: block.thinking };

    case "tool_use":
      return {
        ...base,
        toolUseId: block.id,
        toolName: block.name,
        toolInput: JSON.stringify(block.input),
      };

    case "tool_result":
      return {
        ...base,
        toolResultId: block.tool_use_id,
        textContent: block.content,
        isError: block.is_error ?? false,
      };

    case "image":
      // Store image to external file, keep reference
      const imageRef = storeExternalData(
        block.source.data,
        block.source.media_type
      );
      return {
        ...base,
        imageMediaType: block.source.media_type,
        imageDataRef: imageRef,
      };

    case "document":
      const docRef = storeExternalData(
        block.source.data,
        block.source.media_type
      );
      return {
        ...base,
        docMediaType: block.source.media_type,
        docFilename: block.title ?? null,
        docDataRef: docRef,
      };

    default:
      return base;
  }
}
```

The deserialization path reconstructs content blocks from the database, loading external data references only when needed. This lazy loading is important -- an image attached to turn 3 of a 50-turn session should not be loaded into memory when the user resumes at turn 50.

### Atomic Writes

Production persistence cannot use naive file writes. A power failure during a write can corrupt the file. The solution is atomic rename:

```typescript
function atomicSaveSession(session: Session, sessionsDir: string): void {
  const targetPath = path.join(sessionsDir, `${session.id}.json`);
  const tmpPath = targetPath + ".tmp";

  const json = JSON.stringify(session, null, 2);
  fs.writeFileSync(tmpPath, json, { mode: 0o600 });
  fs.renameSync(tmpPath, targetPath);
}
```

The rename operation is atomic on all major filesystems. If the process crashes between `writeFileSync` and `renameSync`, the temp file exists but the original is untouched. If it crashes during the rename, the filesystem guarantees the rename either happened or did not.

---

## 24.5 Session Resume and Conversation Recovery

Resume is the feature users interact with most. The `/resume` command must handle partial IDs, disambiguation, read-only mode, and the complex task of reconstructing a conversation that the API can continue.

### The Resume Flow

```
User: /resume abc123
         │
         ▼
┌─────────────────────┐     ┌──────────────────────┐
│ 1. Resolve partial  │────→│ Prefix match against  │
│    session ID       │     │ all session files     │
└─────────────────────┘     └──────────┬───────────┘
                                       │
         ┌─────────────────────────────┘
         │ 0 matches → error: "No session found"
         │ 1 match   → proceed
         │ N matches → error: "Ambiguous ID"
         ▼
┌─────────────────────┐
│ 2. Load session     │
│    metadata + full  │
│    message history  │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 3. Reconstruct      │
│    conversation:     │
│    - Restore history │
│    - Set model       │
│    - Set turn count  │
│    - Set token state │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 4. Display summary  │
│    and ready prompt  │
└─────────────────────┘
```

### Partial ID Resolution

Users should not need to type a 36-character UUID. The system supports prefix matching with a minimum of 4 characters to avoid ambiguity:

```typescript
function resolveSessionId(
  sessionsDir: string,
  partial: string
): string {
  if (partial.length < 4) {
    throw new Error(
      `Session ID must be at least 4 characters. Got '${partial}'.`
    );
  }

  const entries = fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith(".json"))
    .map(f => f.replace(".json", ""));

  const matches = entries.filter(id => id.startsWith(partial));

  switch (matches.length) {
    case 0:
      throw new Error(
        `No session found matching '${partial}'.\n`
        + `Use /resume to see available sessions.`
      );
    case 1:
      return matches[0];
    default:
      const list = matches.map(id => `  ${id.slice(0, 12)}`).join("\n");
      throw new Error(
        `Ambiguous ID '${partial}' matches ${matches.length} sessions:\n`
        + `${list}\n\nProvide more characters to disambiguate.`
      );
  }
}
```

### What Gets Restored vs. What Does Not

This distinction is critical for user expectations. When you resume a session:

| Restored | Not Restored |
|----------|-------------|
| Conversation history (all messages) | Tool state (file handles, processes) |
| Model setting | File system changes |
| Token/cost counters | Running background tasks |
| Turn count | MCP server connections |
| Session metadata and tags | Permission approval history |

The reason tool state is not restored is fundamental: tool calls are side-effectful. The file that existed when you ran `Read` in the original session may have changed since then. The process you launched with `Bash` is long dead. Resume restores the conversation context so the LLM can continue intelligently, but it does not try to recreate the world state.

### Applying the Resume

```typescript
function applyResume(
  ctx: CommandContext,
  session: ResumableSession,
  flags: ResumeFlags
): string {
  if (!flags.readonly) {
    // Restore mutable state
    ctx.history = session.history;
    ctx.turnCount = session.turnCount;
    ctx.currentModel = session.model;
    ctx.sessionId = session.id;
    ctx.inputTokens = session.inputTokens;
    ctx.outputTokens = session.outputTokens;
  }

  // Build summary for the user
  return formatResumeSummary(session, flags);
}
```

The `--readonly` flag is a subtle but important feature. It lets you inspect a past session's conversation without modifying the original. This is useful when you want to reference what happened in a previous session without risking state corruption.

---

## 24.6 Cross-Project Resume Support

A developer often works on multiple projects. When you switch from project A to project B and want to resume a conversation from project A, the system needs to handle the context mismatch gracefully.

### Project Directory Tracking

Every session records the `project_dir` it was created in:

```typescript
interface SessionMetadata {
  id: string;
  model: string;
  startedAt: Date;
  endedAt: Date | null;
  projectDir: string | null;  // The working directory at session start
  totalTurns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  status: SessionStatus;
  tags: string[];
  metadata: Record<string, string>;
}
```

### The Session Filter System

Cross-project resume relies on a rich filtering system. Rather than just listing sessions from the current directory, you can filter by any combination of criteria:

```typescript
interface SessionFilter {
  dateFrom?: number;         // Unix epoch, inclusive
  dateTo?: number;           // Unix epoch, inclusive
  tags?: string[];           // Session must contain ALL of these
  searchText?: string;       // Full-text search across messages
  minTurns?: number;
  maxTurns?: number;
  model?: string;
  status?: SessionStatus;
  projectDir?: string;       // Filter by project directory
  sortBy: SortField;         // created_at, updated_at, turn_count, etc.
  sortDesc: boolean;
  limit: number;             // Pagination
  offset: number;
}
```

When filtering by `projectDir`, the system does an exact match on the stored directory path. This ensures that sessions from `/home/user/project-a` do not show up when you are working in `/home/user/project-b` unless you explicitly request all sessions.

The `/sessions` command exposes this with `--all`:

```
/sessions              # Sessions from current project only
/sessions --all        # Sessions from ALL projects
/sessions --limit 5    # Last 5 sessions
/sessions --json       # JSON output for scripting
```

### Session Listing Implementation

The listing implementation loads lightweight `SessionInfo` structs rather than full sessions:

```typescript
function listSessions(
  store: SessionStore,
  filter: SessionFilter
): SessionInfo[] {
  const all = store.loadAllSessionInfos();

  return all
    .filter(s => {
      // Skip soft-deleted unless explicitly requested
      if (s.status === "deleted" && filter.status !== "deleted") {
        return false;
      }
      // Date range
      if (filter.dateFrom && s.createdAt < filter.dateFrom) return false;
      if (filter.dateTo && s.createdAt > filter.dateTo) return false;
      // Tags: session must contain ALL filter tags
      if (filter.tags?.length) {
        if (!filter.tags.every(t => s.tags.includes(t))) return false;
      }
      // Project directory
      if (filter.projectDir && s.projectDir !== filter.projectDir) {
        return false;
      }
      // Model
      if (filter.model && s.model !== filter.model) return false;
      // Status
      if (filter.status && s.status !== filter.status) return false;
      return true;
    })
    .sort((a, b) => {
      const cmp = compareBySortField(a, b, filter.sortBy);
      return filter.sortDesc ? -cmp : cmp;
    })
    .slice(filter.offset, filter.offset + filter.limit);
}
```

---

## 24.7 Session Title Generation and Caching

An effective title system transforms a list of opaque session IDs into something meaningful. The title needs to be generated automatically after the first exchange but also support manual override.

### Auto-Title Generation

The simplest approach, and what production systems use, is to extract a summary from the first assistant response:

```typescript
function autoGenerateTitle(messages: Message[]): string | null {
  const firstAssistant = messages.find(m => m.role === "assistant");
  if (!firstAssistant) return null;

  const textBlock = firstAssistant.content.find(
    b => b.type === "text" && b.text.trim().length > 0
  );
  if (!textBlock) return null;

  const text = textBlock.text.trim();
  // Truncate to 80 chars at a UTF-8 safe boundary
  if (text.length <= 80) return text;

  let end = 80;
  while (end > 0 && !isCharBoundary(text, end)) {
    end--;
  }
  return text.slice(0, end);
}
```

This is fast, requires no API call, and produces titles like "I'll investigate the authentication module and..." or "Here's how to implement the search feature...". Not perfect, but immediately useful.

### Title Cache

Computing titles on every listing would be expensive for large session counts. The title is cached at two levels:

1. **In the session metadata row** in SQLite, so subsequent listings read it directly.
2. **In the session JSON file** on disk, so even without the database the title is available.

The update logic only writes the title if it has not been set:

```typescript
function updateTitleIfEmpty(
  store: SessionStore,
  sessionId: string,
  title: string
): void {
  // Only set if the current title is the auto-generated default
  const session = store.getSession(sessionId);
  if (session && session.title.startsWith("Session ")) {
    session.title = title;
    store.updateSession(session);
  }
}
```

### Manual Title Override

The `/rename session` command lets users set a meaningful title:

```
/rename session "auth refactor exploration"
```

This updates both the database and the JSON file, ensuring consistency across storage layers.

---

## 24.8 Full-Text Search

Finding a specific conversation across hundreds of sessions requires more than filename matching. The system uses SQLite's FTS5 (Full-Text Search 5) extension for efficient substring and phrase matching.

### FTS5 Index

The FTS5 virtual table indexes the text content of all content blocks:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  session_id,
  role,
  text_content,
  content='content_blocks',
  content_rowid='id'
);
```

This creates an inverted index over the `text_content` column, enabling fast queries like:

```sql
SELECT session_id, role, snippet(messages_fts, 2, '»', '«', '...', 32)
FROM messages_fts
WHERE text_content MATCH 'authentication AND bug'
ORDER BY rank;
```

### Search Result Structure

Search results carry enough context for the user to evaluate each hit without loading the full session:

```typescript
interface SearchResult {
  sessionId: string;
  sessionTitle: string;
  messageId: string;
  role: string;
  snippet: string;             // Text with match context
  rank: number;                // Relevance score
  highlightRanges: [number, number][]; // Byte offsets for highlighting
}
```

### Snippet Extraction

The snippet builder extracts text around the match with configurable context:

```typescript
function buildSearchSnippet(
  text: string,
  query: string,
  contextChars: number
): { snippet: string; highlights: [number, number][] } {
  const lower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  const pos = lower.indexOf(queryLower);
  if (pos === -1) {
    // No match -- return head of text
    return { snippet: text.slice(0, contextChars * 2), highlights: [] };
  }

  // Snap to character boundaries
  const start = snapToCharBoundary(text, Math.max(0, pos - contextChars));
  const end = snapToCharBoundary(
    text,
    Math.min(text.length, pos + query.length + contextChars)
  );

  const snippet = text.slice(start, end);
  const hlStart = pos - start;
  const hlEnd = hlStart + query.length;

  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";

  return {
    snippet: `${prefix}${snippet}${suffix}`,
    highlights: [[prefix.length + hlStart, prefix.length + hlEnd]],
  };
}
```

### In-Session Search

The `/search` command searches within the current session's history:

```
/search database          # Find messages mentioning 'database'
/search auth token -n 5   # Limit to 5 results
/find TODO --case-sensitive
```

This searches the in-memory message history directly, without hitting the database, since all messages for the current session are already loaded. As we saw in Chapter 22, the command system routes these to the search handler which iterates over `ctx.history` with match highlighting.

---

## 24.9 Session Metadata: Tags and Activity Tracking

Tags transform sessions from a flat list into an organized collection. Combined with activity tracking, they enable workflows like "show me all sessions tagged 'bugfix' from last week."

### Tag System Architecture

Tags are stored in a dedicated table with a composite primary key:

```sql
CREATE TABLE session_tags (
  session_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (session_id, tag),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

The tag operations use a separate index file for fast lookup without database queries:

```typescript
// Tag index format (tags.idx):
// Each line: tag_name: session_id_1,session_id_2,...
//
// Example:
// bugfix: abc12345,def67890
// auth: abc12345,ghi11111

class TagIndex {
  private tags: Map<string, Set<string>>;

  static load(indexPath: string): TagIndex {
    const index = new TagIndex();
    if (!fs.existsSync(indexPath)) return index;

    const content = fs.readFileSync(indexPath, "utf-8");
    for (const line of content.split("\n")) {
      if (line.startsWith("#") || !line.includes(":")) continue;
      const [tag, sessionsStr] = line.split(":", 2);
      const sessions = new Set(
        sessionsStr.split(",").map(s => s.trim()).filter(Boolean)
      );
      index.tags.set(tag.trim().toLowerCase(), sessions);
    }
    return index;
  }

  addTag(tag: string, sessionId: string): void {
    const normalized = tag.toLowerCase();
    this.validateTagName(normalized);
    const set = this.tags.get(normalized) ?? new Set();
    set.add(sessionId);
    this.tags.set(normalized, set);
  }

  private validateTagName(tag: string): void {
    if (tag.length === 0) throw new Error("Tag name cannot be empty.");
    if (tag.length > 50) throw new Error("Tag name must be 50 characters or fewer.");
    if (!/^[a-z0-9_-]+$/.test(tag)) {
      throw new Error(
        "Tag names may only contain alphanumeric characters, hyphens, and underscores."
      );
    }
  }
}
```

### The `/tag` Command

Tags are managed through subcommands:

```
/tag add bugfix auth     # Tag current session with 'bugfix' and 'auth'
/tag remove bugfix       # Remove the 'bugfix' tag
/tag list                # Show all tags with session counts
/tag filter auth         # Show sessions tagged 'auth'
/tag search bug          # Find tags containing 'bug'
```

### Activity Tracking

Beyond tags, sessions track aggregate usage statistics at the turn level:

```typescript
interface StoredUsageStats {
  sessionId: string;
  turnNumber: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  latencyMs: number;
  createdAt: string;
}
```

This per-turn granularity enables analytics that session-level aggregates cannot provide:

```typescript
// Which turns were the most expensive?
function topCostlyTurns(
  store: SessionStore,
  sessionId: string,
  n: number
): StoredUsageStats[] {
  return store.getUsageStats(sessionId)
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, n);
}

// What is the average latency per model?
function avgLatencyByModel(
  store: SessionStore,
  sessionId: string
): Map<string, number> {
  const stats = store.getUsageStats(sessionId);
  const byModel = new Map<string, { total: number; count: number }>();

  for (const s of stats) {
    const entry = byModel.get(s.model) ?? { total: 0, count: 0 };
    entry.total += s.latencyMs;
    entry.count += 1;
    byModel.set(s.model, entry);
  }

  return new Map(
    [...byModel.entries()].map(([model, { total, count }]) =>
      [model, total / count]
    )
  );
}
```

---

## 24.10 Advanced Operations: Fork, Merge, and Replay

Production session management goes beyond basic CRUD. Three advanced operations cover the most common power-user needs.

### Session Forking

Forking creates a copy of a session up to a specific turn, enabling "what if" explorations without losing the original conversation:

```typescript
interface ForkOptions {
  fromTurn: number;          // Fork after this many turns (0 = empty)
  newTitle?: string;         // Title for the fork (auto-generate if null)
  copyTags: boolean;         // Copy tags from parent
  copyMetadata: boolean;     // Copy metadata from parent
}

function forkSession(
  store: SessionStore,
  parentId: string,
  options: ForkOptions
): Session {
  const parent = store.loadSession(parentId);
  if (!parent) throw new Error(`Session not found: ${parentId}`);

  // Keep messages up to the specified turn
  const keptMessages: SessionMessage[] = [];
  let turn = 0;
  for (const msg of parent.messages) {
    if (msg.role === "user") turn++;
    if (turn > options.fromTurn && options.fromTurn > 0) break;
    keptMessages.push(structuredClone(msg));
  }

  const title = options.newTitle
    ?? `${parent.title} (fork@turn ${options.fromTurn})`;

  const forked: Session = {
    id: generateSessionId(),
    title,
    model: parent.model,
    projectDir: parent.projectDir,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "active",
    messages: keptMessages,
    tags: options.copyTags ? [...parent.tags] : [],
    metadata: options.copyMetadata
      ? { ...parent.metadata, forked_from: parentId }
      : { forked_from: parentId },
    // Recompute token counts from kept messages
    inputTokens: sumTokens(keptMessages, "user"),
    outputTokens: sumTokens(keptMessages, "assistant"),
    turnCount: keptMessages.filter(m => m.role === "user").length,
    totalCostUsd: 0, // Will be recomputed
  };

  store.saveSession(forked);
  return forked;
}
```

The key design decision: forking is a deep copy, not a reference. This ensures modifying the fork never affects the parent session.

### Session Merging

Merging combines multiple sessions into one, useful when a task spanned several sessions:

```typescript
type MergeStrategy = "interleave" | "concatenate" | "by_timestamp";

function mergeSessions(
  store: SessionStore,
  ids: string[],
  strategy: MergeStrategy,
  title: string
): Session {
  const sources = ids.map(id => {
    const s = store.loadSession(id);
    if (!s) throw new Error(`Session not found: ${id}`);
    return s;
  });

  let mergedMessages: SessionMessage[];

  switch (strategy) {
    case "interleave":
      // Round-robin messages from each session
      mergedMessages = [];
      const maxLen = Math.max(...sources.map(s => s.messages.length));
      for (let i = 0; i < maxLen; i++) {
        for (const session of sources) {
          if (i < session.messages.length) {
            mergedMessages.push(session.messages[i]);
          }
        }
      }
      break;

    case "concatenate":
      // Append sessions in order
      mergedMessages = sources.flatMap(s => s.messages);
      break;

    case "by_timestamp":
      // Global chronological sort
      mergedMessages = sources
        .flatMap(s => s.messages)
        .sort((a, b) => a.createdAt - b.createdAt);
      break;
  }

  // Build merged session with metadata tracking the merge
  const merged: Session = {
    id: generateSessionId(),
    title,
    messages: mergedMessages,
    metadata: {
      merged_from: ids.join(","),
      merge_strategy: strategy,
    },
    tags: ["merged"],
    // ... compute aggregates from mergedMessages
  };

  store.saveSession(merged);
  return merged;
}
```

### Session Replay

Replay produces a timeline of events suitable for a UI visualization:

```typescript
interface ReplayEvent {
  turn: number;
  role: string;
  contentPreview: string; // First 200 chars
  timestamp: number;
  tokens: number;
  toolCalls: number;
  durationMs?: number;   // Delta from previous event
}

function sessionReplay(
  store: SessionStore,
  sessionId: string
): ReplayEvent[] {
  const session = store.loadSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const events: ReplayEvent[] = [];
  let turn = 0;
  let prevTs: number | null = null;

  for (const msg of session.messages) {
    if (msg.role === "user") turn++;

    events.push({
      turn,
      role: msg.role,
      contentPreview: msg.content.slice(0, 200),
      timestamp: msg.createdAt,
      tokens: msg.tokens,
      toolCalls: msg.toolCalls.length,
      durationMs: prevTs !== null
        ? (msg.createdAt - prevTs) * 1000
        : undefined,
    });

    prevTs = msg.createdAt;
  }

  return events;
}
```

---

## 24.11 Concurrent Session Management

When multiple terminal tabs or IDE panels run the agent simultaneously, session conflicts become a real problem. Two instances writing to the same session file will corrupt it. Two instances claiming the same session ID will produce inconsistent state.

### The Concurrency Problem

Consider this scenario:
1. Terminal A starts a session, gets ID `abc12345`
2. Terminal B starts a session, also gets `abc12345` (UUIDs are unique, but there are subtler issues)
3. Both terminals write usage stats to the same session row
4. One terminal's stats overwrite the other's

Even with unique IDs, the database needs protection:

### WAL Mode and Busy Timeout

SQLite's WAL mode provides the first line of defense:

```typescript
// During store initialization
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000"); // Wait up to 5s for locks
```

WAL mode allows multiple simultaneous readers and one writer. A reader never blocks a writer, and a writer never blocks readers. The 5-second busy timeout ensures that if two writers collide, the second one waits rather than immediately failing.

### Session Registration

For managed remote sessions, a more sophisticated approach tracks all active sessions and enforces capacity limits:

```typescript
class SessionManager {
  private sessions: Map<string, ManagedSession>;
  private maxSessions: number;
  private gcIdleTimeout: Duration; // 30 minutes default

  async createSession(config: SessionConfig): Promise<string> {
    config.validate();

    const activeCount = [...this.sessions.values()]
      .filter(s => !s.state.isTerminal)
      .length;

    if (activeCount >= this.maxSessions) {
      throw new Error(
        `Session limit reached: ${this.maxSessions} concurrent sessions`
      );
    }

    const session = new ManagedSession(config);
    this.sessions.set(session.id, session);
    return session.id;
  }
}
```

### State Machine for Session Lifecycle

Each managed session follows a strict state machine that prevents invalid transitions:

```
Created ──→ Connecting ──→ Active ──→ Processing
                             │  ↑       │  ↑
                             │  └───────┘  │
                             ▼             │
                           Idle ──────────┘
                             │
               All states ──→ Disconnected (terminal)
```

The transition validator ensures the state machine is respected:

```typescript
function validateTransition(
  from: SessionState,
  to: SessionState
): boolean {
  const validTransitions: Record<SessionState, SessionState[]> = {
    created:      ["connecting", "disconnected"],
    connecting:   ["active", "disconnected"],
    active:       ["processing", "idle", "disconnected"],
    processing:   ["active", "idle", "disconnected"],
    idle:         ["active", "processing", "disconnected"],
    disconnected: [], // Terminal -- no transitions allowed
  };

  return validTransitions[from]?.includes(to) ?? false;
}
```

### Garbage Collection

Idle sessions accumulate. The garbage collector runs on a 60-second sweep interval and removes sessions that:

1. Are already in a terminal state (Disconnected)
2. Have been idle longer than the GC timeout (default 30 minutes)
3. Have exceeded their configured timeout
4. Have exceeded their maximum turn limit

```typescript
async function garbageCollect(
  manager: SessionManager
): Promise<string[]> {
  const removed: string[] = [];

  for (const [id, session] of manager.sessions) {
    if (session.state.isTerminal) {
      removed.push(id);
      continue;
    }
    if (session.idleDuration > manager.gcIdleTimeout) {
      session.sendMessage({ type: "status", status: "disconnected" });
      removed.push(id);
      continue;
    }
    if (session.isExpired || session.isTurnLimited) {
      removed.push(id);
    }
  }

  for (const id of removed) {
    manager.sessions.delete(id);
  }

  return removed;
}
```

---

## 24.12 Session Export

Export transforms a session from the internal storage format into something humans or tools can consume. The system supports four formats, each serving a different purpose.

### Export Formats

| Format | Use Case | Includes |
|--------|----------|----------|
| JSON | Programmatic processing, re-import | Full structured data |
| Markdown | Documentation, sharing | Formatted conversation |
| HTML | Browser viewing | Styled, self-contained |
| Plaintext | Piping to other tools | Raw text, no formatting |

### The Export Pipeline

```typescript
interface ExportOptions {
  format: "json" | "markdown" | "html" | "plaintext";
  includeMetadata: boolean;
  includeToolDetails: boolean;
  includeThinking: boolean;
  includeTimestamps: boolean;
  maxMessages?: number; // null = all
}

function exportSession(
  store: SessionStore,
  sessionId: string,
  options: ExportOptions
): string {
  const session = store.loadSession(sessionId);

  const messages = options.maxMessages
    ? session.messages.slice(0, options.maxMessages)
    : session.messages;

  switch (options.format) {
    case "json":     return exportJson(session, messages, options);
    case "markdown": return exportMarkdown(session, messages, options);
    case "html":     return exportHtml(session, messages, options);
    case "plaintext":return exportPlaintext(session, messages, options);
  }
}
```

The Markdown exporter produces a document with YAML-like frontmatter and role-labeled messages:

```markdown
# Auth Refactor Session

---
- **ID**: abc12345-6789-...
- **Model**: claude-sonnet-4-20250514
- **Status**: completed
- **Turns**: 25
- **Tokens**: 12,000 input / 8,500 output
- **Cost**: $0.1635
- **Tags**: bugfix, auth
---

## User

Fix the authentication bug where expired tokens are accepted.

## Assistant

I'll investigate the authentication module...

<details>
<summary>Tool calls</summary>

- **Read** (`tu-001`): src/auth.ts (120ms)
- **Bash** (`tu-002`): grep -r "token" src/ (85ms)

</details>
```

The HTML exporter generates a self-contained document with embedded CSS, role-based styling, and collapsible tool call details. No external dependencies are needed to view it in a browser.

---

## 24.13 Cleanup and Retention

Unbounded storage growth is a slow-motion disaster. The cleanup system enforces retention policies through a two-phase approach: archive first, delete later.

### Two-Phase Garbage Collection

```typescript
function gcOldSessions(
  store: SessionStore,
  maxAgeDays: number
): GcResult {
  const now = Date.now() / 1000;
  const archiveCutoff = now - (maxAgeDays * 86400);
  const deleteCutoff = now - (maxAgeDays * 86400 * 2); // 2x retention

  let archivedCount = 0;
  let deletedCount = 0;
  let freedBytes = 0;

  for (const session of store.loadAllSessions()) {
    // Phase 1: Archive old live sessions
    if (session.status.isLive && session.updatedAt < archiveCutoff) {
      session.status = "archived";
      session.updatedAt = now;
      store.saveSession(session);
      archivedCount++;
      continue;
    }

    // Phase 2: Delete long-archived sessions
    if (session.status === "archived" && session.updatedAt < deleteCutoff) {
      const size = store.sessionFileSize(session.id);
      store.permanentlyDelete(session.id);
      deletedCount++;
      freedBytes += size;
    }
  }

  return { archivedCount, deletedCount, freedBytes };
}
```

The key design decision: archived sessions are kept for **twice** the retention period before permanent deletion. This gives users a safety window to recover accidentally archived sessions.

### Max Sessions Enforcement

Beyond time-based retention, the store enforces a maximum session count:

```typescript
function enforceMaxSessions(store: SessionStore): void {
  const sessions = store.listSessions()
    .sort((a, b) => a.startedAt - b.startedAt); // Oldest first

  if (sessions.length <= store.config.maxSessions) return;

  const excess = sessions.length - store.config.maxSessions;
  for (let i = 0; i < excess; i++) {
    // Never delete active sessions
    if (sessions[i].status !== "active") {
      store.deleteSession(sessions[i].id);
    }
  }
}
```

### Soft Delete with Trash

The `/session delete` command moves sessions to a `.trash/` directory rather than permanently removing them:

```typescript
function softDeleteSession(
  sessionsDir: string,
  sessionId: string
): void {
  const sourcePath = path.join(sessionsDir, `${sessionId}.json`);
  const trashDir = path.join(sessionsDir, ".trash");
  fs.mkdirSync(trashDir, { recursive: true });

  const trashPath = path.join(trashDir, `${sessionId}.json`);
  fs.renameSync(sourcePath, trashPath);
}
```

The `.trash/` directory is cleaned during the next GC sweep. This pattern -- soft delete first, hard delete later -- prevents accidental data loss while keeping storage bounded.

---

## 24.14 Cost Tracking and Analytics

Every API call costs money. Session management provides the infrastructure for tracking and analyzing that spend.

### Per-Model Cost Calculation

```typescript
function calculateSessionCost(
  inputTokens: number,
  outputTokens: number,
  model: string
): number {
  // Pricing per million tokens
  const pricing: Record<string, [number, number]> = {
    "sonnet":     [3.00,  15.00],
    "haiku":      [0.25,   1.25],
    "opus":       [15.00, 75.00],
    "gpt-4o":     [2.50,  10.00],
    "gpt-4o-mini":[0.15,   0.60],
  };

  const [inputRate, outputRate] = Object.entries(pricing)
    .find(([key]) => model.includes(key))?.[1]
    ?? [3.00, 15.00]; // Default to Sonnet pricing

  return (inputTokens / 1_000_000) * inputRate
       + (outputTokens / 1_000_000) * outputRate;
}
```

### Aggregate Statistics

The store computes aggregate statistics across all sessions:

```typescript
interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  totalTurns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  storageBytes: number;
  oldestSession?: number;
  newestSession?: number;
  sessionsByModel: Record<string, number>;
  sessionsByStatus: Record<string, number>;
  avgTurnsPerSession: number;
  avgTokensPerSession: number;
  mostUsedTools: [string, number][]; // [toolName, count]
}
```

These stats power the `/stats` command and provide data for cost dashboards. The `mostUsedTools` field is particularly useful -- if Bash accounts for 60% of all tool calls, that tells you where to focus optimization efforts.

---

## 24.15 Putting It All Together

Let us trace the complete lifecycle of a session from creation through resume:

**1. Session Creation** -- When the user starts a new conversation, the bootstrap sequence (Chapter 2) generates a UUID, creates a `SessionMetadata` record, and registers it with the store. The JSONL transcript writer opens an append-only file.

**2. Active Conversation** -- Each turn persists: the user message is stored immediately, then the assistant message with all content blocks is stored after streaming completes. Usage stats are recorded per-turn. The session's aggregate counters are updated in-place.

**3. Title Generation** -- After the first assistant response, `autoGenerateTitle` extracts the first 80 characters and sets it on the session. This title appears in all subsequent listings.

**4. Session End** -- When the user exits or runs `/clear`, the session status transitions to `completed`. The `ended_at` timestamp is set, and the JSONL transcript writer is flushed and closed.

**5. Discovery** -- Later, the user runs `/sessions` to list past sessions. The system loads lightweight `SessionInfo` structs (no message content), applies filters, sorts, and returns a paginated table. The user sees session IDs, titles, durations, turn counts, and costs.

**6. Resume** -- The user runs `/resume abc1`. The system resolves the partial ID, loads the full session including all messages, reconstructs the conversation context, and the user picks up where they left off. The session status changes back to `active`, and new turns append to the existing history.

**7. Cleanup** -- In the background, the GC sweep archives sessions older than the retention period and permanently deletes sessions that have been archived for twice the retention period. The max-sessions limit evicts the oldest non-active sessions when capacity is exceeded.

This lifecycle ensures that session data flows seamlessly from creation through long-term storage, with every piece recoverable and searchable at each stage. The dual storage strategy (SQLite + JSON files), the JSONL transcript for crash recovery, and the two-phase GC policy together provide a persistence layer that is both durable and practical for daily use.

The session management system embodies a principle that applies throughout the agent's design: build for the common case (quick resume of the last session), but handle the edge cases (cross-project search, concurrent writes, database corruption recovery) without requiring the user to think about them. When the infrastructure is invisible, the user can focus entirely on the conversation.
