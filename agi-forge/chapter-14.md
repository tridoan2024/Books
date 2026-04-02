# Chapter 14: Shared Memory Architecture

---

There is a moment in every multi-agent system's evolution when you realize the agents aren't learning. They're executing. They're completing tasks. They're producing output. But they're not *remembering*.

You built eight specialized CLIs in Part II. A Coder that writes clean TypeScript. A Security Auditor that catches OWASP Top 10 violations. A Reviewer that maintains code quality standards. An Architect that validates system design. They work. They work well. But every session starts from zero. The Security Auditor catches the same SQL injection pattern it caught last week and doesn't recognize it. The Coder reimplements a utility function it wrote three days ago in a different module. The Reviewer flags a style violation that was explicitly approved by the team lead in a previous review cycle.

Your agents have amnesia. Expensive, token-burning, time-wasting amnesia.

This chapter fixes that.

Memory is the substrate that transforms a collection of independent agents into an intelligent system. It's the difference between a team of contractors who show up every day having never met each other and a team of engineers who've worked together for years, who know each other's patterns, who remember what worked and what didn't, who can say "we tried that approach on the billing module and it failed because of X" without anyone having to look it up.

Claude Code's source reveals one of the most sophisticated memory architectures in any AI-assisted development tool. Eight distinct memory layers, from ephemeral conversation context to persistent cross-session knowledge. Feature-flagged subsystems for automatic knowledge extraction (`EXTRACT_MEMORIES`), agent state capture (`AGENT_MEMORY_SNAPSHOT`), and background memory consolidation (`KAIROS_DREAM`) — a system that literally dreams, reviewing and organizing its memories while you sleep.

We're going to dissect all of it. Then we're going to build something better: a shared memory bus that connects all eight CLIs to a common knowledge substrate while preserving each agent's private memory space. A system where the Coder's implementation decisions inform the Security Auditor's analysis, where the Reviewer's feedback shapes the Coder's future output, where the Architect's design constraints propagate to every agent that touches the codebase.

By the end of this chapter, your multi-CLI system won't just execute. It will learn.

---

## 14.1 The Memory Problem in Multi-CLI Systems

Single-agent systems have a straightforward memory model: one context window, one conversation history, one set of accumulated knowledge. When Claude Code runs as a single CLI, its memory architecture — however sophisticated — serves one master. Every memory is written by the same agent that reads it. There are no conflicts, no synchronization issues, no questions about who knows what.

Multi-agent systems shatter this simplicity.

Consider a scenario. Your Coder CLI implements a new authentication module using JWT tokens with RS256 signing. During implementation, it discovers that the existing token validation library has a subtle timing vulnerability — it uses string comparison instead of constant-time comparison for signature verification. The Coder fixes it. The session ends.

Two hours later, the Security Auditor CLI runs its scheduled scan. It encounters the authentication module. Without shared memory, it has two options: either it re-discovers the timing vulnerability (wasting tokens on analysis the Coder already completed), or it misses it entirely because the fix is already in place and there's no record of *why* the code looks the way it does. It doesn't know that this pattern was a deliberate security fix. It doesn't know to watch for regressions. It doesn't know that the team lead specifically requested constant-time comparison after reading a CVE report.

All of that knowledge — the discovery, the fix, the rationale, the team decision — evaporated when the Coder's session ended.

This is the memory problem. And it has three dimensions.

**Dimension 1: Temporal Isolation.** Each CLI session is a temporal island. Knowledge generated in session A is invisible to session B, even when both sessions involve the same CLI operating on the same codebase. Yesterday's Coder doesn't talk to today's Coder.

**Dimension 2: Agent Isolation.** Even within the same time window, different CLIs don't share context. The Security Auditor doesn't know what the Coder just did. The Reviewer doesn't know what the Architect decided. Each agent operates in a private universe of information.

**Dimension 3: Granularity Mismatch.** Different agents need different types of knowledge at different levels of detail. The Coder needs implementation patterns — "use `bcrypt` with cost factor 12 for password hashing." The Security Auditor needs threat context — "this endpoint processes untrusted XML input; watch for XXE." The Architect needs system-level constraints — "the auth service must handle 10K concurrent sessions with sub-100ms latency." Dumping all knowledge into a single flat store creates noise. Each agent wastes tokens parsing information it doesn't need.

Solving the memory problem requires an architecture that addresses all three dimensions simultaneously: bridging time, bridging agents, and filtering by relevance. That architecture is the memory bus.

---

## 14.2 The Memory Bus Architecture

The memory bus is the central nervous system of the multi-CLI forge. It's not a database. It's not a message queue. It's a structured knowledge substrate with well-defined read/write semantics, conflict resolution policies, and access control boundaries.

Here's the architecture:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SHARED MEMORY BUS                                │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  decisions   │  │  patterns   │  │  threats     │  │  feedback    │ │
│  │  (arch)      │  │  (impl)     │  │  (security)  │  │  (review)    │ │
│  └─────────────┘  └─────────────┘  └──────────────┘  └──────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  test_intel  │  │  perf_data  │  │  team_prefs  │  │  doc_index   │ │
│  │  (qa)        │  │  (perf)     │  │  (shared)    │  │  (docs)      │ │
│  └─────────────┘  └─────────────┘  └──────────────┘  └──────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  memories (SQLite)                                                │  │
│  │  ┌─────┬──────┬───────┬───────────┬──────┬───────┬────────────┐  │  │
│  │  │ id  │ type │  key  │   value   │ imp  │ decay │ written_by │  │  │
│  │  └─────┴──────┴───────┴───────────┴──────┴───────┴────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└───────┬─────────┬─────────┬─────────┬─────────┬─────────┬──────────────┘
        │         │         │         │         │         │
   ┌────┴───┐┌────┴───┐┌────┴───┐┌────┴───┐┌────┴───┐┌────┴───┐
   │ Coder  ││Security││Reviewer││Architect││  QA    ││  Perf  │
   │  CLI   ││  CLI   ││  CLI   ││  CLI    ││  CLI   ││  CLI   │
   ├────────┤├────────┤├────────┤├─────────┤├────────┤├────────┤
   │private │││private ││private ││private  ││private ││private │
   │memory  │││memory  ││memory  ││memory   ││memory  ││memory  │
   └────────┘└────────┘└────────┘└─────────┘└────────┘└────────┘
```

Each CLI connects to the shared bus through a standardized interface. The bus itself is a SQLite database — the same technology Claude Code uses internally for session storage — with a schema designed for typed, scored, decaying knowledge.

But the bus isn't the only memory each CLI has. Every agent maintains a private memory store for agent-specific knowledge that shouldn't pollute the shared space. The Coder's private memory might contain personal coding patterns, preferred library versions, and implementation shortcuts. The Security Auditor's private memory contains its threat model heuristics, CVE watchlists, and scanning strategies. This two-tier model — shared bus plus private stores — mirrors how human teams work. You share decisions with the team. You keep your personal notes to yourself.

### The Shared Memory Schema

The shared memory bus uses a single SQLite database with a carefully designed schema:

```sql
CREATE TABLE memories (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL CHECK(type IN (
                    'user', 'feedback', 'project', 'reference',
                    'decision', 'pattern', 'threat', 'test_intel'
                )),
    key         TEXT NOT NULL,
    value       TEXT NOT NULL,
    importance  INTEGER NOT NULL DEFAULT 3 CHECK(importance BETWEEN 1 AND 5),
    written_by  TEXT NOT NULL,          -- which CLI wrote this
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    accessed_at TEXT,                    -- last read timestamp
    access_count INTEGER DEFAULT 0,     -- how often this gets read
    decay_rate  REAL DEFAULT 1.0,       -- multiplier for decay calculation
    is_archived INTEGER DEFAULT 0,

    UNIQUE(type, key)                    -- no duplicate type+key pairs
);

CREATE INDEX idx_memories_type ON memories(type);
CREATE INDEX idx_memories_importance ON memories(importance DESC);
CREATE INDEX idx_memories_written_by ON memories(written_by);
CREATE INDEX idx_memories_updated ON memories(updated_at DESC);

CREATE TABLE memory_links (
    from_id     TEXT NOT NULL REFERENCES memories(id),
    to_id       TEXT NOT NULL REFERENCES memories(id),
    relation    TEXT NOT NULL CHECK(relation IN (
                    'related_to', 'evolved_from', 'caused_by',
                    'part_of', 'contradicts', 'supersedes'
                )),
    strength    REAL DEFAULT 1.0 CHECK(strength BETWEEN 0.0 AND 1.0),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),

    PRIMARY KEY (from_id, to_id, relation)
);

CREATE TABLE memory_access_log (
    memory_id   TEXT NOT NULL REFERENCES memories(id),
    accessed_by TEXT NOT NULL,           -- which CLI read this
    accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
    context     TEXT                     -- what triggered the access
);
```

This schema captures four critical dimensions of shared knowledge:

1. **Typed memories** with a constrained taxonomy (`user`, `feedback`, `project`, `reference`, `decision`, `pattern`, `threat`, `test_intel`). Types enable agents to query only what's relevant to them — the Security CLI reads `threat` and `decision` memories; it rarely needs `test_intel`.

2. **Provenance tracking** via `written_by`. Every memory carries the identity of the agent that created it. This enables trust weighting — a `threat` memory written by the Security CLI carries more authority than one written by the Coder CLI.

3. **Temporal metadata** with `created_at`, `updated_at`, and `accessed_at`. These timestamps drive the decay algorithm that keeps memory fresh. A decision from six months ago that nobody has accessed should fade. A pattern accessed every day should persist.

4. **Relational links** via `memory_links`. Knowledge doesn't exist in isolation. A `decision` about using JWT tokens is `related_to` a `threat` about token replay attacks. A `pattern` for input validation `evolved_from` an earlier, simpler pattern. A new `threat` finding `contradicts` an old assessment that a particular endpoint was safe. These links create a knowledge graph that agents can traverse.

### Read/Write Semantics

The bus enforces clear ownership semantics:

- **Any CLI can read any shared memory.** Access is logged in `memory_access_log` for analytics and decay scoring.
- **Any CLI can write new memories.** The `written_by` field records provenance.
- **Only the writing CLI can update its own memories.** If the Security CLI wrote a threat assessment, the Coder CLI cannot modify it. It can write a *new* memory that `contradicts` or `supersedes` the original, linked via `memory_links`.
- **Archival is consensus-based.** A memory is archived only when its importance drops below threshold through the decay algorithm, or when two or more CLIs agree it's obsolete.

These semantics prevent the most dangerous failure mode in shared memory systems: one agent silently overwriting another agent's knowledge. When disagreements arise, they're captured as explicit contradictions in the knowledge graph, not as silent overwrites.

---

## 14.3 The Eight Memory Layers of Claude Code

Before we build the multi-CLI memory system, we need to understand what Claude Code already provides. The source code reveals eight distinct memory layers, each serving a different purpose, each operating at a different timescale. Understanding these layers is essential because our shared memory bus must integrate with — not replace — Claude Code's native memory infrastructure.

### Layer 1: CLAUDE.md — The Project Brain

```
Location: ~/.claude/CLAUDE.md (user), .claude/CLAUDE.md (project)
Lifetime: Permanent (version-controlled)
Scope: All sessions in the project
```

CLAUDE.md is the oldest and most stable memory layer. It's a markdown file loaded into the system prompt at every session start. It contains project-specific instructions, coding standards, architectural decisions, and behavioral rules. In the Claude Code source, the context assembly pipeline injects CLAUDE.md content before any user message is processed.

For multi-CLI systems, CLAUDE.md serves as the *constitutional layer* — the shared rules that all agents must follow. Each CLI loads the same project CLAUDE.md, ensuring baseline behavioral consistency. But each CLI can also have its own CLAUDE.md overlay with agent-specific instructions that extend (never override) the project constitution.

### Layer 2: Session Persistence — The Conversation Transcript

```
Location: ~/.claude/projects/<project>/sessions/<session-id>.jsonl
Lifetime: Indefinite (JSONL append-only log)
Scope: Single session
```

Every conversation turn is persisted as a JSONL entry — user messages, assistant responses, tool calls, tool results, system messages. These transcripts serve two purposes: session restoration (resume where you left off) and cross-session knowledge mining (the `KAIROS_DREAM` system reads these to consolidate learnings).

The transcripts are large. A typical hour-long coding session produces 50–200KB of JSONL data. This is why `KAIROS_DREAM` greps them narrowly rather than reading whole files — the consolidation agent searches for specific terms, not bulk-reads transcripts.

### Layer 3: memdir/ (MEMORY.md) — The Typed Memory Store

```
Location: ~/.claude/projects/<project>/memory/MEMORY.md (index)
         ~/.claude/projects/<project>/memory/*.md (topic files)
Lifetime: Persistent, pruned by consolidation
Scope: All sessions in the project
Size cap: 200 lines / 25KB for MEMORY.md
```

This is Claude Code's primary persistent memory system. The `memdir/` module implements a file-based memory store with a strictly typed taxonomy. From the source code in `memdir/memoryTypes.ts`, memories are constrained to four types:

- **`user`** — Information about the user's role, preferences, and knowledge level
- **`feedback`** — Guidance about approach: what to avoid, what to keep doing
- **`project`** — Ongoing work context: goals, deadlines, initiatives, bugs
- **`reference`** — Pointers to external systems: issue trackers, dashboards, documentation

Each memory file uses YAML frontmatter for structured metadata:

```markdown
---
type: feedback
created: 2026-03-15
updated: 2026-04-01
---
# Integration tests must use real database

**Rule:** Never mock the database in integration tests.
**Why:** Prior incident (Q1 2026) where mock/prod divergence masked a broken migration.
**How to apply:** When writing tests that touch data access layers, always spin up a test database instance.
```

The `MEMORY.md` entrypoint serves as an index — one line per memory, under 150 characters, linking to topic files for detail. The hard caps (200 lines, 25KB) are enforced by `truncateEntrypointContent()` in `memdir.ts`, which appends a warning when limits are approached. This is critical: MEMORY.md is injected into the system prompt every turn, so its size directly impacts available context for actual work.

### Layer 4: File History — Git as Memory

```
Location: .git/
Lifetime: Permanent
Scope: All sessions, all time
```

Claude Code injects git context into every turn: current branch, default branch, `git status --short` (capped at 2,000 characters), and the last five commits. This is memory-by-proxy — the codebase itself, and its version history, is the most reliable memory of what happened, when, and why.

For multi-CLI systems, git is the ultimate source of truth. When the memory bus records that the Coder fixed a timing vulnerability, and git shows the actual diff, the git evidence takes precedence. Memory is a complement to git, not a replacement.

### Layer 5: Conversation Context — The Working Set

```
Location: In-memory (API message array)
Lifetime: Current session only
Scope: Single session
Size: Up to 200K tokens (or 1M with [1m] suffix)
```

The most ephemeral layer. The conversation context is the full message history for the current session: system prompt, user messages, assistant responses, tool calls, tool results. This is where active reasoning happens. It's managed by seven compaction strategies (auto-compact, reactive compact, context collapse, micro-compact, snip compaction, manual `/compact`, and the 1M context opt-in) that progressively compress or discard older messages to stay within token limits.

For multi-CLI systems, conversation context is strictly private. No agent should have access to another agent's in-flight conversation. The shared bus handles cross-agent communication; the conversation context handles within-agent reasoning.

### Layer 6: Key-Value Storage — Session State

```
Location: ~/.claude/projects/<project>/settings.json
Lifetime: Persistent
Scope: Project
```

Simple key-value pairs for configuration and state: model preferences, permission settings, feature flags. In the multi-CLI architecture, this layer stores per-agent configuration that persists across sessions but doesn't belong in the shared memory bus.

### Layer 7: EXTRACT_MEMORIES — Automatic Knowledge Extraction

```
Feature flag: feature('EXTRACT_MEMORIES')
Trigger: Post-sampling hook (after each agent turn)
Location: Services → extractMemories/extractMemories.ts
```

This is where Claude Code's memory system transcends simple note-taking. The `EXTRACT_MEMORIES` feature flag enables a background subagent that runs *after every conversation turn*, scanning the dialogue for knowledge worth preserving. We'll dissect this system in detail in Section 14.4.

### Layer 8: AGENT_MEMORY_SNAPSHOT — Cross-Agent State Transfer

```
Feature flag: feature('AGENT_MEMORY_SNAPSHOT')
Trigger: Agent session end
Location: tools/AgentTool/agentMemory.ts
Scopes: user (~/.claude/agent-memory/), project (.claude/agent-memory/), local (.claude/agent-memory-local/)
```

The newest memory layer. `AGENT_MEMORY_SNAPSHOT` captures an agent's accumulated knowledge at session end and makes it available to other agents — or to the same agent in future sessions. This is the closest thing Claude Code has to inter-agent memory sharing, and it's the foundation our shared memory bus builds upon. Section 14.5 covers it in depth.

---

## 14.4 EXTRACT_MEMORIES: The Automatic Knowledge Miner

Most memory systems are passive. They store what you explicitly tell them to store. Claude Code's `EXTRACT_MEMORIES` system is active — it mines knowledge from conversations without being asked.

Here's how it works, reconstructed from the source at `services/extractMemories/extractMemories.ts`:

### The Extraction Pipeline

```
User message → Agent response → Post-sampling hook fires
                                          │
                                          ▼
                              ┌──────────────────────┐
                              │  EXTRACT_MEMORIES     │
                              │  gate check           │
                              │  (feature flag +      │
                              │   autoMemoryEnabled)  │
                              └──────────┬───────────┘
                                         │ enabled
                                         ▼
                              ┌──────────────────────┐
                              │  Count new messages   │
                              │  since last extraction│
                              │  (skip if agent wrote │
                              │   directly to memory) │
                              └──────────┬───────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │  Fork subagent with:  │
                              │  - Conversation tail  │
                              │  - Memory directory   │
                              │  - Typed memory rules │
                              │  - 5-turn max budget  │
                              └──────────┬───────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │  Subagent writes to   │
                              │  memdir/ files using  │
                              │  FileEdit/FileWrite   │
                              │  (restricted toolset) │
                              └──────────┬───────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │  Log: files written,  │
                              │  tokens used, cache   │
                              │  hit rate, duration   │
                              └──────────────────────┘
```

The extraction subagent operates under heavy constraints. From the `createAutoMemCanUseTool` function in the source, the subagent is limited to:

- **Read tools:** `GrepTool`, `GlobTool`, `ReadTool` — it can examine the codebase for context
- **Write tools:** `FileEditTool`, `FileWriteTool` — but ONLY to paths within the memory directory
- **Shell:** Read-only bash commands only (`ls`, `find`, `grep`, `cat`, `stat`, `wc`, `head`, `tail`)
- **Budget:** Maximum 5 agentic turns before forced stop

Everything else — `BashTool` with write access, `WebFetchTool`, `AgentTool`, network operations — is explicitly denied. The subagent cannot modify code, cannot spawn other agents, cannot make external requests. It can only read the world and write to memory.

This constraint model is critical for multi-CLI systems. When eight CLIs are each running extraction subagents concurrently, you need absolute certainty that an extraction agent can't accidentally modify code or interfere with another CLI's work. The restricted toolset is a security boundary, not just a convenience.

### The Skip Heuristic

The extraction pipeline includes an important optimization: it checks whether the main agent already wrote to memory files during the conversation. If it did — if the user explicitly said "remember this" and the agent saved to `memdir/` — the extraction subagent skips entirely. This prevents double-writing: the agent already captured what mattered; no need for the background miner to duplicate the work.

From the source:

```typescript
// If the conversation already wrote to memory files, skip extraction.
// hasMemoryWritesSince checks for FileEdit/FileWrite tool_use blocks
// targeting paths within the memory directory.
if (hasMemoryWritesSince(messages, lastExtractedMessageId)) {
  logForDebugging(
    '[extractMemories] skipping — conversation already wrote to memory files'
  );
  return;
}
```

### The Coalescing Pattern

When extraction is already running and another turn completes, the new context is *stashed* rather than spawning a second extraction agent. When the current extraction finishes, it checks for stashed context and runs a trailing extraction pass. This coalescing pattern prevents resource contention — at most one extraction subagent runs per CLI at any time.

For the multi-CLI forge, this means eight concurrent extraction agents maximum (one per CLI), each writing to isolated memory directories. The shared memory bus aggregates their findings during the consolidation phase.

### Multi-CLI Extraction Strategy

In the forge architecture, each CLI runs its own `EXTRACT_MEMORIES` pipeline writing to its private memory store. A separate *memory aggregator* process periodically scans all private stores and promotes high-importance memories to the shared bus:

```python
def aggregate_memories(private_stores: list[Path], shared_bus: SharedMemoryBus):
    """Promote high-importance private memories to the shared bus."""
    for store in private_stores:
        for memory_file in store.glob("*.md"):
            metadata = parse_frontmatter(memory_file)
            if metadata.get("importance", 3) >= 4:
                # High-importance: promote to shared bus
                shared_bus.write(
                    type=metadata["type"],
                    key=metadata.get("title", memory_file.stem),
                    value=memory_file.read_text(),
                    written_by=store.parent.name,  # CLI identity
                    importance=metadata["importance"],
                )
```

This two-phase model — extract privately, promote selectively — keeps the shared bus clean. Low-importance observations stay in private stores where they might help the originating CLI but don't clutter the shared space. Only knowledge that scores importance 4 or higher gets promoted to the bus where all CLIs can access it.

---

## 14.5 AGENT_MEMORY_SNAPSHOT: Capturing and Sharing Agent State

While `EXTRACT_MEMORIES` mines knowledge from conversations, `AGENT_MEMORY_SNAPSHOT` captures the *state* of an agent — its accumulated understanding, its active context, its working hypotheses — and persists that state for future use.

The feature is gated behind `feature('AGENT_MEMORY_SNAPSHOT')` and operates at session boundaries. From `main.tsx` in the Claude Code source:

```typescript
// Check for pending agent memory snapshot updates
// (only for --agent mode, ant-only)
if (
  feature('AGENT_MEMORY_SNAPSHOT') &&
  mainThreadAgentDefinition &&
  isCustomAgent(mainThreadAgentDefinition) &&
  mainThreadAgentDefinition.memory &&
  mainThreadAgentDefinition.pendingSnapshotUpdate
) {
  const mergePrompt = buildMergePrompt(
    agentDef.agentType,
    agentDef.memory!
  );
  // ... execute snapshot merge
}
```

The key insight is the three-scope memory model from `agentMemory.ts`:

```typescript
type AgentMemoryScope = 'user' | 'project' | 'local'

// user scope:    ~/.claude/agent-memory/<agentType>/MEMORY.md
// project scope: .claude/agent-memory/<agentType>/MEMORY.md  
// local scope:   .claude/agent-memory-local/<agentType>/MEMORY.md
```

- **User scope** stores knowledge that applies across all projects — the agent's general expertise, global preferences, cross-project patterns. This is shared via `~/.claude/agent-memory/`.
- **Project scope** stores knowledge specific to this codebase — architectural decisions, team conventions, project-specific patterns. This is checked into version control via `.claude/agent-memory/`, making it available to team members.
- **Local scope** stores machine-specific knowledge — local environment details, dev machine configurations, personal workflow tweaks. This lives in `.claude/agent-memory-local/` and is git-ignored.

For multi-CLI systems, the project scope is the bridge between agents. When the Coder CLI writes a snapshot to `.claude/agent-memory/coder/MEMORY.md`, the Security CLI can read it at `.claude/agent-memory/coder/MEMORY.md` using the standard `memdir` loading infrastructure. Every agent's project-scope memory is readable by every other agent.

The `loadAgentMemoryPrompt` function in the source builds the memory context for an agent at spawn time:

```typescript
export function loadAgentMemoryPrompt(
  agentType: string,
  scope: AgentMemoryScope,
): string {
  const memoryDir = getAgentMemoryDir(agentType, scope);
  void ensureMemoryDirExists(memoryDir);
  return buildMemoryPrompt({
    displayName: 'Persistent Agent Memory',
    memoryDir,
    extraGuidelines: [scopeNote],
  });
}
```

The function ensures the memory directory exists, then builds a prompt that includes the memory contents plus behavioral guidelines for how the agent should read and write its memories. The `scopeNote` parameter varies by scope:

- **User scope:** "Keep learnings general since they apply across all projects"
- **Project scope:** "Tailor your memories to this project"
- **Local scope:** "Tailor your memories to this project and machine"

### Snapshot Merge Strategy

When an agent session ends with a pending snapshot update, Claude Code runs a merge operation. The merge prompt instructs the agent to:

1. Read its current MEMORY.md
2. Compare with the knowledge gained in the just-completed session
3. Update MEMORY.md with new learnings, resolving any conflicts with existing entries
4. Prune outdated entries that the session's work has superseded

This isn't a blind append. It's a reasoning-based merge where the agent actively reconciles old and new knowledge. If yesterday's snapshot says "the billing module uses Stripe v2 API" and today's session revealed a migration to Stripe v3, the agent updates — not duplicates — the memory.

---

## 14.6 KAIROS_DREAM: Background Memory Consolidation

`KAIROS_DREAM` is the most ambitious feature in Claude Code's memory stack. It's a background consolidation agent that reviews accumulated session transcripts, extracts cross-session patterns, prunes stale knowledge, and reorganizes memories for optimal retrieval. It literally dreams — running as a forked subagent while the main session continues, consolidating memories the way human memory consolidation happens during sleep.

### The Four-Stage Pipeline

From the consolidation prompt in `services/autoDream/consolidationPrompt.ts`:

```
Phase 1 — ORIENT
├── ls the memory directory
├── Read MEMORY.md (current index)
├── Skim existing topic files
└── Assess current state of knowledge

Phase 2 — GATHER
├── Scan daily logs (logs/YYYY/MM/YYYY-MM-DD.md)
├── Check for drifted facts (memories contradicted by code)
├── Grep session transcripts for narrow terms
└── Identify new information worth persisting

Phase 3 — CONSOLIDATE
├── Merge new signal into existing topic files
├── Convert relative dates to absolute dates
├── Delete contradicted facts
└── Write new memories using typed format

Phase 4 — PRUNE AND INDEX
├── Update MEMORY.md to stay under 200 lines / 25KB
├── Remove pointers to stale/superseded memories
├── Demote verbose entries (>200 char → topic file)
├── Add pointers to newly important memories
└── Resolve contradictions between files
```

### Trigger Conditions

The dream agent doesn't run on every session. From `autoDream.ts`, it's gated by three conditions checked in order of computational cost:

```typescript
// Gate 1: Time — hours since last consolidation >= minHours (default: 24)
const hoursSince = (Date.now() - lastConsolidatedAt) / 3_600_000;
if (hoursSince < cfg.minHours) return;

// Gate 2: Sessions — enough new sessions to justify consolidation
const sessionIds = await listSessionsTouchedSince(lastConsolidatedAt);
if (sessionIds.length < cfg.minSessions) return;  // default: 5

// Gate 3: Lock — no other process mid-consolidation
const acquired = await tryAcquireConsolidationLock();
if (!acquired) return;
```

The lock is file-based (`.consolidate-lock`), checked by PID to detect stale locks from crashed processes. If a dream run fails, the lock's mtime is rolled back so the time gate passes again on the next trigger.

### Tool Constraints

Like the extraction subagent, the dream agent operates under restricted permissions:

```
ALLOWED:
  - Read-only bash (ls, find, grep, cat, stat, wc, head, tail)
  - GrepTool, GlobTool, ReadTool
  - FileEditTool, FileWriteTool (memory directory only)

DENIED:
  - Write bash, network operations, agent spawning
  - Any file operation outside the memory directory
```

The dream agent can read session transcripts (large JSONL files), but the prompt explicitly instructs it to grep narrowly: "Don't exhaustively read transcripts. Look only for things you already suspect matter." This is a token-efficiency optimization — a week's worth of transcripts could be megabytes, and the dream agent has a finite context window.

### The DreamTask UI Surface

From `tasks/DreamTask/DreamTask.ts`, the dream operation is surfaced in Claude Code's task registry with its own UI state:

```typescript
type DreamTaskState = TaskStateBase & {
  type: 'dream'
  phase: DreamPhase              // 'starting' | 'updating'
  sessionsReviewing: number      // how many sessions being consolidated
  filesTouched: string[]         // memory files modified
  turns: DreamTurn[]             // assistant text + tool use counts
  abortController?: AbortController  // user can kill the dream
  priorMtime: number             // for lock rollback on failure
}
```

The dream task transitions from `starting` to `updating` when the first file write is detected. Users can watch progress via `Shift+Down` and can kill the dream if it's taking too long — the abort controller cancels the forked agent and the lock mtime is rolled back so the next session can retry.

### Multi-CLI Dream Coordination

In the forge architecture, each CLI can trigger its own dream cycle. But we need coordination to prevent eight simultaneous dream agents from thrashing the same memory store. The solution: a single forge-level dream coordinator.

```yaml
# forge-memory-config.yaml
dream:
  coordinator: architect-cli     # Only Architect CLI triggers dreams
  schedule:
    min_hours: 12                # Consolidate every 12 hours minimum
    min_sessions: 3              # After at least 3 CLI sessions
  scope:
    - private: true              # Each CLI's private store
    - shared: true               # The shared memory bus
  budget:
    max_turns: 10                # More turns for cross-CLI consolidation
    max_tokens: 50000            # Higher budget for multi-store review
```

The Architect CLI owns the dream cycle because it has the broadest view of the system. It reads all eight private memory stores plus the shared bus, consolidates cross-cutting patterns, resolves inter-agent contradictions, and updates the shared bus with synthesized knowledge.

---

## 14.7 Typed Memory Schemas

Claude Code's memory type system — `user`, `feedback`, `project`, `reference` — is designed for a single-agent, single-user workflow. The multi-CLI forge needs a richer taxonomy that captures the kinds of knowledge generated by specialized agents working in concert.

### The Extended Type Taxonomy

```yaml
# Memory types for the multi-CLI forge
types:
  # === Inherited from Claude Code ===
  user:
    scope: private
    description: "User role, preferences, knowledge level"
    written_by: any
    
  feedback:
    scope: private | shared
    description: "Behavioral guidance — what to avoid, what to keep doing"
    written_by: any
    
  project:
    scope: shared
    description: "Ongoing work context — goals, deadlines, bugs"
    written_by: any
    
  reference:
    scope: shared
    description: "Pointers to external systems and resources"
    written_by: any

  # === New types for multi-CLI ===
  decision:
    scope: shared
    description: "Architectural and design decisions with rationale"
    written_by: [architect, coder]
    requires_fields: [rationale, alternatives_considered]
    
  pattern:
    scope: shared
    description: "Recurring implementation patterns to reuse or avoid"
    written_by: [coder, reviewer]
    requires_fields: [pattern_type, example_file]
    
  threat:
    scope: shared
    description: "Security findings, vulnerability assessments"
    written_by: [security, reviewer]
    requires_fields: [severity, cwe_id, affected_components]
    
  test_intel:
    scope: shared
    description: "Test coverage insights, flaky tests, edge cases"
    written_by: [qa, coder]
    requires_fields: [coverage_impact, test_files]
    
  perf_baseline:
    scope: shared
    description: "Performance baselines and regression markers"
    written_by: [perf]
    requires_fields: [metric, baseline_value, measurement_date]
    
  doc_gap:
    scope: shared
    description: "Identified documentation gaps and priorities"
    written_by: [docs, reviewer]
    requires_fields: [affected_apis, priority]
```

Each type declares which CLIs are authorized to write it (`written_by`), which fields are required (`requires_fields`), and whether it belongs in the shared bus or private stores (`scope`). The schema validator rejects memories that violate these constraints — the QA CLI cannot write `threat` memories, and a `decision` memory without a `rationale` field is rejected at write time.

### Structured Memory Files

Each memory in the file-based store follows a strict template:

```markdown
---
type: threat
severity: high
cwe_id: CWE-89
affected_components: [src/api/users.ts, src/api/admin.ts]
written_by: security-cli
created: 2026-04-01T14:30:00Z
updated: 2026-04-01T14:30:00Z
importance: 5
---
# SQL Injection in User Search Endpoint

**Finding:** The `searchUsers` function in `src/api/users.ts:142` concatenates 
user input directly into a SQL query string without parameterization.

**Impact:** An attacker can extract arbitrary database contents, modify data, 
or escalate privileges via the admin search endpoint which shares the same 
vulnerable pattern.

**Fix Applied:** Migrated to parameterized queries using `$1, $2` placeholders 
(commit abc123). Both `users.ts` and `admin.ts` patched.

**Regression Watch:** Any new search endpoint must use the `buildSafeQuery()` 
helper from `src/utils/db.ts`. The Coder CLI has been notified of this pattern.
```

The frontmatter is machine-readable. The body is human-readable. Both are consumable by agents. This dual format enables the shared bus to index and query by metadata while preserving the rich context that makes memories useful in practice.

---

## 14.8 Conflict Resolution

Two CLIs write to the shared memory bus simultaneously. Both target the same `type + key` pair. What happens?

This is the hardest problem in shared memory systems, and there's no universally correct answer. The right strategy depends on the memory type, the agents involved, and the nature of the conflict. The forge implements a three-tier resolution hierarchy.

### Tier 1: Last-Write-Wins (for low-stakes memories)

For memory types where recency is more important than completeness — `project` status updates, `reference` pointers, `perf_baseline` measurements — the most recent write simply wins. The previous value is preserved in an audit log but doesn't block the update.

```sql
-- Last-write-wins update with audit trail
INSERT INTO memory_audit (
    memory_id, previous_value, previous_written_by, 
    replaced_at, replaced_by
)
SELECT id, value, written_by, datetime('now'), :new_writer
FROM memories
WHERE type = :type AND key = :key;

INSERT OR REPLACE INTO memories (id, type, key, value, written_by, importance, updated_at)
VALUES (:id, :type, :key, :new_value, :new_writer, :importance, datetime('now'));
```

This works because `project` and `reference` memories are point-in-time snapshots. If the Coder says "merge freeze starts Thursday" and the Architect says "merge freeze starts Friday," the latest update wins — presumably someone got updated information.

### Tier 2: Merge (for accumulative memories)

For memory types where both contributions have value — `pattern` libraries, `test_intel` collections, `doc_gap` inventories — conflicts are merged by appending the new information to the existing memory, with a conflict marker:

```markdown
---
type: pattern
pattern_type: input_validation
written_by: coder-cli
updated_by: [coder-cli, reviewer-cli]  # Multiple authors
---
# Input Validation Patterns

## From coder-cli (2026-03-28):
Use zod schemas at API boundaries. Define once in `src/schemas/`, 
import in route handlers.

## From reviewer-cli (2026-03-29):
Additionally, validate file upload MIME types server-side. 
Don't trust Content-Type headers — use magic bytes detection 
via `file-type` npm package.
```

The merged memory preserves authorship for each contribution. Future consolidation passes (via `KAIROS_DREAM`) may synthesize these into a coherent whole, but the raw contributions are never lost.

### Tier 3: Explicit Contradiction (for high-stakes memories)

For memory types where disagreement is itself meaningful — `decision` rationales, `threat` assessments, security findings — conflicts create a `contradicts` link rather than overwriting:

```sql
-- Don't overwrite — create a contradiction link
INSERT INTO memories (id, type, key, value, written_by, importance)
VALUES (:new_id, :type, :new_key, :new_value, :new_writer, :importance);

INSERT INTO memory_links (from_id, to_id, relation, strength)
VALUES (:new_id, :existing_id, 'contradicts', 1.0);
```

When the Security CLI rates an endpoint as "high risk" and the Coder CLI rates it as "mitigated," both assessments persist with a `contradicts` link between them. The next agent to query this endpoint sees both assessments and can make an informed judgment — or escalate to a human.

This three-tier model reflects a fundamental principle: **conflicts are information, not errors.** A system that silently resolves conflicts loses signal. A system that surfaces conflicts creates opportunities for deeper understanding.

### The Conflict Resolution Matrix

```
┌─────────────────┬───────────────┬─────────────────┬──────────────────┐
│   Memory Type   │ Same Author   │ Different Author │ Authority Agent  │
│                 │ Same Type     │ Same Type        │ Override         │
├─────────────────┼───────────────┼─────────────────┼──────────────────┤
│ user            │ Overwrite     │ N/A (private)    │ N/A              │
│ feedback        │ Overwrite     │ Merge            │ N/A              │
│ project         │ Overwrite     │ Last-write-wins  │ Architect        │
│ reference       │ Overwrite     │ Last-write-wins  │ Any              │
│ decision        │ Update+audit  │ Contradiction    │ Architect        │
│ pattern         │ Update        │ Merge            │ Reviewer         │
│ threat          │ Update+audit  │ Contradiction    │ Security         │
│ test_intel      │ Update        │ Merge            │ QA               │
│ perf_baseline   │ Overwrite     │ Last-write-wins  │ Perf             │
│ doc_gap         │ Update        │ Merge            │ Docs             │
└─────────────────┴───────────────┴─────────────────┴──────────────────┘
```

The "Authority Agent" column identifies which CLI has final say when contradictions need resolution. The Security CLI's threat assessment overrides the Coder's optimistic risk rating. The Architect's design decision overrides the Coder's implementation preference. This authority model prevents deadlocks where contradictions accumulate without resolution.

---

## 14.9 Memory Evolution and Pruning

Memory without decay is a hoarder's attic. Every fact ever recorded, regardless of relevance, competing for attention in the system prompt. Claude Code's 200-line / 25KB cap on MEMORY.md is a hard boundary against this failure mode. But in a multi-CLI system where eight agents each generate memories at every turn, the problem is amplified eightfold.

### The Relevance Score

Every memory in the shared bus carries a dynamic relevance score computed from five factors:

```python
def compute_relevance(memory: Memory, now: datetime) -> float:
    """
    7-factor relevance score. Range: 0.0 to 10.0.
    Memories below ARCHIVE_THRESHOLD (1.0) are candidates for archival.
    """
    # Factor 1: Importance (user-assigned, 1-5)
    # Importance 5 gets 2x multiplier
    importance_score = memory.importance * (2.0 if memory.importance == 5 else 1.0)
    
    # Factor 2: Recency — exponential decay from last update
    days_since_update = (now - memory.updated_at).total_seconds() / 86400
    half_life = 30.0 * memory.decay_rate  # base: 30 days, scaled by type
    recency_score = 2.0 ** (-days_since_update / half_life)
    
    # Factor 3: Access frequency — memories that get read stay alive
    access_score = min(memory.access_count / 10.0, 1.0)
    
    # Factor 4: Link density — well-connected memories are more valuable
    link_count = len(memory.outgoing_links) + len(memory.incoming_links)
    link_score = min(link_count / 5.0, 1.0)
    
    # Factor 5: Cross-agent access — memories read by multiple CLIs
    unique_readers = len(set(
        log.accessed_by for log in memory.access_log
    ))
    cross_agent_score = min(unique_readers / 4.0, 1.0)
    
    # Weighted combination
    return (
        importance_score * 0.30 +
        recency_score    * 0.25 +
        access_score     * 0.20 +
        link_score       * 0.10 +
        cross_agent_score * 0.15
    ) * 10.0
```

This scoring algorithm embodies a key insight: **the best predictor of future relevance is past access.** A memory that multiple CLIs keep reading is load-bearing knowledge. A memory that nobody has touched in 90 days, regardless of its initial importance, is probably obsolete.

The `cross_agent_score` factor is unique to multi-CLI systems. It captures a signal that doesn't exist in single-agent architectures: if the Coder, Security CLI, and Reviewer all read the same decision memory, that decision is clearly important enough to the system's operation that it should resist decay.

### The Pruning Cycle

Pruning runs as part of the `KAIROS_DREAM` consolidation cycle, but with additional multi-CLI logic:

```python
def prune_shared_bus(bus: SharedMemoryBus, threshold: float = 1.0):
    """Archive memories below relevance threshold."""
    now = datetime.utcnow()
    candidates = bus.query("SELECT * FROM memories WHERE is_archived = 0")
    
    for memory in candidates:
        score = compute_relevance(memory, now)
        
        if score < threshold:
            # Check: does any other memory depend on this one?
            dependents = bus.query("""
                SELECT COUNT(*) FROM memory_links 
                WHERE to_id = ? AND relation IN ('part_of', 'caused_by')
            """, memory.id)
            
            if dependents > 0:
                # Don't archive — other memories reference this
                # Instead, reduce importance to slow future decay
                bus.execute("""
                    UPDATE memories 
                    SET importance = MAX(importance - 1, 1)
                    WHERE id = ?
                """, memory.id)
            else:
                # Safe to archive
                bus.execute("""
                    UPDATE memories 
                    SET is_archived = 1, updated_at = datetime('now')
                    WHERE id = ?
                """, memory.id)
```

The dependency check is critical. If Memory A (`threat: SQL injection in user search`) is referenced by Memory B (`decision: all search endpoints must use parameterized queries`), archiving A would leave B without its justification. Instead of archiving, the algorithm reduces A's importance, slowing its decay curve while preserving the reference chain.

### The Memory Lifecycle

```
Creation → Active Use → Declining Access → Archive Candidate
    │          │               │                    │
    │     importance ≥ 4   relevance < 2.0    relevance < 1.0
    │     access_count ↑   access_count = 0   no dependents
    │          │               │                    │
    │          ▼               ▼                    ▼
    │     High Relevance   Low Relevance       ARCHIVED
    │     (stays in        (dream agent         (removed from
    │      system prompt)   may update)          system prompt,
    │                                            retained in DB)
    │
    └── Contradiction detected ──▶ Both kept, linked
```

Archived memories aren't deleted. They're removed from the system prompt injection (saving tokens) but remain in the database, queryable through explicit search. If a future conversation references a topic that matches an archived memory, the memory can be *resurrected* — its `is_archived` flag is cleared and its `accessed_at` timestamp is refreshed, restarting the decay clock.

---

## 14.10 copilot-mem: A Reference Implementation

Everything we've discussed — shared buses, typed schemas, conflict resolution, decay algorithms — exists in a working implementation: the `copilot-mem` MCP system that powers the memory layer of the GitHub Copilot CLI. It's not a toy. It runs in production, managing hundreds of memories across sessions, with the full stack of features described in this chapter.

### Architecture Overview

`copilot-mem` is implemented as an MCP (Model Context Protocol) server with 18 tools:

```
Memory Operations:
  save_fact          — Store a permanent fact (type: semantic)
  save_preference    — Store a user preference (never expires)
  save_decision      — Record a decision with rationale
  record_episode     — Log what happened (type: episodic, short-lived)
  search_memory      — Full-text search with relevance scoring
  forget             — Archive a memory (recoverable for 30 days)

Context Operations:
  get_active_context — Read current working focus
  set_active_context — Update what we're working on now
  get_daily_log      — Read the day's activity journal

Project Operations:
  save_project_profile    — Create/update structured project metadata
  get_project_profile     — Load project: purpose, stack, architecture
  list_project_profiles   — Browse all known projects
  get_project_knowledge   — All memories scoped to a project

Knowledge Graph:
  capture_app_knowledge   — Deep knowledge capture (11 subtypes)
  save_knowledge_link     — Link two memories (5 relation types)
  get_related_knowledge   — Traverse the knowledge graph

System:
  memory_status           — Dashboard: counts, scores, storage stats
  search_sessions         — Search past conversation history
```

The `capture_app_knowledge` tool deserves special attention. It supports eleven knowledge subtypes that map directly to the multi-CLI forge's memory needs:

| Knowledge Type | Multi-CLI Use Case |
|---|---|
| `app_profile` | What this project does — shared by all CLIs |
| `architecture` | System design — read by Architect, informed by all |
| `api_pattern` | API conventions — read by Coder, validated by Reviewer |
| `bug_recipe` | How bugs were fixed — read by QA, informed by Coder |
| `tech_insight` | Technical learnings — shared by all CLIs |
| `design_rationale` | Why decisions were made — written by Architect |
| `component_map` | What files/components do — shared by all CLIs |
| `workflow_recipe` | How to do things — operational knowledge |
| `doc_summary` | Documentation notes — written by Docs CLI |
| `evolution_log` | How the project changed — written by any CLI |

### The Scoring Algorithm

`copilot-mem` uses a 7-factor relevance scoring algorithm that directly influenced the multi-CLI bus design:

```python
# From copilot-mem's scoring engine
score = (
    recency_factor     * 0.20 +   # How recently accessed/updated
    frequency_factor   * 0.15 +   # How often accessed
    importance_factor  * 0.25 +   # User-assigned importance (1-5)
    project_match      * 0.15 +   # Does it match the current project?
    query_match        * 0.10 +   # Keyword relevance to current query
    type_factor        * 0.05 +   # Episodic < Procedural < Semantic
    temporal_tier      * 0.10     # Short-term < Medium-term < Long-term
)
```

The `importance_factor` at level 5 receives a 2× multiplier, meaning importance-5 memories score 4× higher than importance-2 memories. Combined with the temporal tier boost for semantic memories (which have the longest half-life), this creates a natural hierarchy: critical architectural decisions persist indefinitely, while ephemeral episode logs decay within days.

### The Auto-Sync Injection

`copilot-mem`'s most innovative feature is its auto-sync: every session start, the top 30 memories by relevance score are automatically injected into `copilot-instructions.md`, which in turn gets loaded into the agent's system prompt. This means the agent doesn't have to explicitly search memory — the most relevant knowledge is already in context.

For the multi-CLI forge, this pattern translates directly: each CLI's system prompt is seeded with the highest-relevance memories from both its private store and the shared bus. The Coder starts every session knowing the most important decisions, patterns, and threats. The Security CLI starts every session knowing the most critical vulnerabilities and their current status. No explicit memory queries needed for the top-priority knowledge.

---

## 14.11 Complete Memory Architecture

Here's the complete architecture of the forge's shared memory system, combining all the components we've discussed:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     THE AGI FORGE — MEMORY ARCHITECTURE                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                    SYSTEM PROMPT INJECTION                         │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │  │
│  │  │CLAUDE.md │  │ Top 30   │  │ Agent    │  │ Active Context    │ │  │
│  │  │(const.)  │  │ memories │  │ snapshot │  │ (what we're doing)│ │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └───────────────────┘ │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                              ▲                                           │
│                              │ auto-inject top N                         │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                     SHARED MEMORY BUS (SQLite)                     │  │
│  │                                                                    │  │
│  │  memories    memory_links    memory_access_log    memory_audit     │  │
│  │  (typed)     (graph)         (who read what)      (change history) │  │
│  │                                                                    │  │
│  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │ CONFLICT RESOLUTION ENGINE                                   │  │  │
│  │  │ Tier 1: Last-Write-Wins │ Tier 2: Merge │ Tier 3: Contradict│  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  │                                                                    │  │
│  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │ DECAY ENGINE                                                 │  │  │
│  │  │ relevance = f(importance, recency, access, links, readers)   │  │  │
│  │  │ threshold < 1.0 → archive (recoverable)                     │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  └───────┬──────────┬──────────┬──────────┬──────────┬───────────────┘  │
│          │          │          │          │          │                    │
│     ┌────┴───┐ ┌────┴───┐ ┌────┴───┐ ┌────┴───┐ ┌────┴───┐             │
│     │ Coder  │ │Security│ │Reviewer│ │Architct│ │  QA    │  ...         │
│     │  CLI   │ │  CLI   │ │  CLI   │ │  CLI   │ │  CLI   │             │
│     ├────────┤ ├────────┤ ├────────┤ ├────────┤ ├────────┤             │
│     │EXTRACT │ │EXTRACT │ │EXTRACT │ │EXTRACT │ │EXTRACT │             │
│     │MEMORIES│ │MEMORIES│ │MEMORIES│ │MEMORIES│ │MEMORIES│             │
│     ├────────┤ ├────────┤ ├────────┤ ├────────┤ ├────────┤             │
│     │Private │ │Private │ │Private │ │Private │ │Private │             │
│     │Memory  │ │Memory  │ │Memory  │ │Memory  │ │Memory  │             │
│     └────────┘ └────────┘ └────────┘ └────────┘ └────────┘             │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  KAIROS_DREAM CONSOLIDATION (runs on Architect CLI schedule)       │  │
│  │  orient → gather → consolidate → prune                             │  │
│  │  Merges private stores → shared bus, resolves contradictions       │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  PERSISTENCE LAYER                                                 │  │
│  │  Git (source of truth) │ Session JSONL │ AGENT_MEMORY_SNAPSHOT     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### The Complete Configuration

```yaml
# forge-memory-config.yaml — Complete memory configuration
# Place in .forge/memory-config.yaml at project root

bus:
  database: .forge/shared-memory.db
  max_memories: 10000
  archive_threshold: 1.0          # relevance below this → archive
  injection_limit: 30             # top N memories in system prompt

types:
  user:        { scope: private, decay_half_life: 90 }
  feedback:    { scope: private, decay_half_life: 60 }
  project:     { scope: shared,  decay_half_life: 30 }
  reference:   { scope: shared,  decay_half_life: 45 }
  decision:    { scope: shared,  decay_half_life: 120, authority: architect }
  pattern:     { scope: shared,  decay_half_life: 90,  authority: reviewer }
  threat:      { scope: shared,  decay_half_life: 60,  authority: security }
  test_intel:  { scope: shared,  decay_half_life: 30,  authority: qa }
  perf_baseline: { scope: shared, decay_half_life: 14, authority: perf }
  doc_gap:     { scope: shared,  decay_half_life: 30,  authority: docs }

extraction:
  enabled: true
  max_turns: 5
  promote_threshold: 4            # importance >= 4 → shared bus
  coalesce: true                  # stash pending when extraction running

consolidation:
  enabled: true
  coordinator: architect-cli
  min_hours: 12
  min_sessions: 3
  max_turns: 10
  scope: [private, shared]

conflict_resolution:
  default: last_write_wins
  overrides:
    decision: contradiction
    threat: contradiction
    pattern: merge
    test_intel: merge
    feedback: merge
    doc_gap: merge

agents:
  coder:
    private_store: .forge/memory/coder/
    reads: [decision, pattern, threat, feedback, project, reference]
    writes: [pattern, project, reference]
    
  security:
    private_store: .forge/memory/security/
    reads: [decision, pattern, threat, test_intel, project]
    writes: [threat, decision]
    
  reviewer:
    private_store: .forge/memory/reviewer/
    reads: [decision, pattern, threat, feedback, project, doc_gap]
    writes: [pattern, feedback, doc_gap]
    
  architect:
    private_store: .forge/memory/architect/
    reads: [all]
    writes: [decision, project, reference]
    
  qa:
    private_store: .forge/memory/qa/
    reads: [decision, pattern, threat, test_intel, project]
    writes: [test_intel, project]
    
  perf:
    private_store: .forge/memory/perf/
    reads: [decision, pattern, perf_baseline, project]
    writes: [perf_baseline, pattern]
    
  docs:
    private_store: .forge/memory/docs/
    reads: [decision, pattern, project, reference, doc_gap]
    writes: [doc_gap, reference]
    
  deploy:
    private_store: .forge/memory/deploy/
    reads: [decision, threat, project, reference, perf_baseline]
    writes: [project, reference]
```

---

## 14.12 Scenario: Memory in Action

Let's trace a complete scenario through the memory architecture. This is the scenario we described at the chapter's opening, but now with the full memory infrastructure in place.

**Day 1, 2:00 PM — The Coder implements authentication.**

The Coder CLI writes a new JWT authentication module. During implementation, it discovers a timing vulnerability in the existing token validation library — string comparison instead of constant-time comparison.

The Coder fixes the vulnerability. The `EXTRACT_MEMORIES` subagent fires after the session and captures two memories:

```markdown
# Private memory (coder/patterns/auth-timing-fix.md)
---
type: pattern
importance: 4
---
Use crypto.timingSafeEqual() for signature comparison, never === or ==.
Found in token validation library. Fixed in commit abc123.

# Promoted to shared bus (importance >= 4)
{
  type: "threat",
  key: "timing-vuln-token-validation",  
  value: "Token validation used string comparison (===) for signature 
         verification. Vulnerable to timing attacks. Fixed with 
         crypto.timingSafeEqual(). Affects: src/auth/validate.ts",
  written_by: "coder-cli",
  importance: 4
}
```

**Day 1, 3:00 PM — The Architect records the decision.**

The Architect CLI reviews the auth module design. It writes a `decision` memory:

```json
{
  "type": "decision",
  "key": "auth-constant-time-comparison-policy",
  "value": "All cryptographic comparisons must use constant-time operations. Policy: no string equality operators (===, ==, strcmp) for secrets, tokens, hashes, or signatures.",
  "rationale": "Timing attack found in token validation (coder-cli, Day 1). Generalizing to project-wide policy.",
  "written_by": "architect-cli",
  "importance": 5
}
```

The `memory_links` table now contains:
```
architect-decision → coder-threat : "caused_by"
```

**Day 2, 10:00 AM — The Security CLI scans.**

The Security CLI starts its session. The system prompt auto-injection loads the top 30 memories, including both the Coder's threat finding and the Architect's policy decision. The Security CLI *doesn't need to re-discover the timing vulnerability*. It knows about it from memory.

Instead, it focuses on scanning for *other* instances of the same pattern — uses of `===` for cryptographic comparison elsewhere in the codebase. It finds one in a webhook signature verification module. It writes a new threat memory, linked to the original:

```json
{
  "type": "threat",
  "key": "timing-vuln-webhook-verification",
  "value": "Webhook signature verification in src/webhooks/verify.ts:89 uses === for HMAC comparison. Same class as token validation finding.",
  "written_by": "security-cli",
  "importance": 5
}
```

Link: `security-threat → coder-threat : "related_to"`

**Day 2, 11:00 AM — The Coder fixes the second instance.**

The Coder CLI starts a new session. The injection includes both timing vulnerability memories and the Architect's policy. The Coder immediately sees the unresolved webhook finding and fixes it — no investigation needed, no context-building, no re-discovery. It updates the threat memory's status and writes a pattern memory:

```json
{
  "type": "pattern",
  "key": "constant-time-comparison-helper",
  "value": "Created src/utils/crypto.ts with safeCompare() wrapper. All crypto comparisons should use this helper. See: src/auth/validate.ts, src/webhooks/verify.ts for usage examples.",
  "written_by": "coder-cli",
  "importance": 4
}
```

**Day 3, 2:00 AM — KAIROS_DREAM consolidates.**

The Architect CLI's dream agent fires (12+ hours since last consolidation, 4+ CLI sessions accumulated). It reviews all memory stores and:

1. Merges the two timing vulnerability findings into a single consolidated threat assessment
2. Links the Coder's helper pattern to the Architect's policy decision
3. Updates MEMORY.md's index with a single line: `- [Constant-time crypto policy](threat/timing-vuln-consolidated.md) — all crypto comparisons must use safeCompare()`
4. Prunes the individual finding memories (they're now superseded by the consolidated version)

The result: four sessions of work across three CLIs distilled into three tightly linked memories — a policy decision, a consolidated threat assessment, and a helper pattern. Any new CLI session gets this knowledge automatically, in three concise lines.

---

## 14.13 The Memory Manifesto

Memory is what separates a system from a team. We close this chapter with the principles that should guide every memory architecture decision in your multi-CLI forge.

**Principle 1: Memory is a tax.** Every memory injected into the system prompt consumes tokens that could be used for reasoning. The best memory system is the smallest one that preserves essential knowledge. If a memory can be derived from the codebase, it shouldn't be stored — `git log` and `grep` are faster and more accurate than recalled facts.

**Principle 2: Conflicts are signal, not noise.** When two agents disagree, the disagreement itself is valuable information. Never silently resolve conflicts. Surface them. Link them. Let the next agent — or the next human — make an informed decision.

**Principle 3: Decay is a feature, not a bug.** Knowledge that isn't accessed is knowledge that isn't needed. Aggressive decay with easy resurrection is better than permanent storage with token-wasting clutter. Set your archive threshold high and your resurrection threshold low.

**Principle 4: Provenance matters.** A threat finding from the Security CLI carries more weight than one from the Docs CLI. A design decision from the Architect carries more authority than one from the Coder. Track who wrote what, and use that provenance to weight trust.

**Principle 5: Private before shared.** Not every observation deserves a place on the shared bus. Extract privately, promote selectively. The shared bus should contain knowledge that changes behavior across multiple agents. If only one agent uses it, it belongs in that agent's private store.

**Principle 6: The dream is essential.** Without consolidation, memory grows without bound and degrades without maintenance. The `KAIROS_DREAM` pattern — periodic review, synthesis, pruning — is not optional. Schedule it. Budget tokens for it. Treat it as infrastructure, not overhead.

**Principle 7: Memory serves the mission.** The point of shared memory isn't to have a comprehensive knowledge base. It's to make agents more effective at their jobs. Every memory should pass the question: "Does this change what an agent would do?" If the answer is no, don't store it.

---

In the next chapter, we connect the memory bus to the orchestration layer — building the event system that lets agents react to each other's actions in real time. Memory gives the system knowledge. Events give it reflexes.

