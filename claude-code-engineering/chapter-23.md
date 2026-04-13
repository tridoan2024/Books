# Chapter 23: Memory Architecture

An AI agent without memory is a goldfish. It helps you refactor your authentication module on Monday, and on Tuesday it asks what language your project uses. Every session starts from zero. For a CLI tool that engineers live inside for hours a day, this is unacceptable. The memory subsystem is what transforms a stateless LLM wrapper into something that feels like a teammate who actually remembers what happened yesterday.

Claude Code's memory architecture is built around a deceptively simple idea: markdown files in a directory. No vector databases, no embedding pipelines, no external services required for the core path. A directory called `memdir/` holds `.md` files with YAML frontmatter. A single index file called `MEMORY.md` acts as a capped summary of everything the agent has learned. A background consolidation agent called `DreamTask` periodically reads recent sessions, extracts knowledge, and prunes stale entries. And a CRDT-inspired sync engine propagates memories across team members working in the same codebase.

This chapter covers how to build all four layers: the file-based storage engine, the capped index, the automatic extraction pipeline, and the team synchronization protocol. As we saw in Chapter 21, the configuration system manages how the agent is *told* to behave. Memory manages what the agent *learns* from experience.

---

## 23.1 The memdir/ Storage Engine

The foundation is a flat directory of markdown files, each representing one discrete piece of knowledge. This design was chosen over SQLite, vector stores, and key-value databases for three reasons: files are inspectable by humans, they survive tool failures gracefully (no corruption from partial writes to a database journal), and they integrate naturally with git for version control and backup.

### Directory Structure

```
~/.agent/memory/
  user_preferences.md          # source: user, priority: 5
  project_rust_tips.md         # source: user, priority: 3
  feedback_no_shortcuts.md     # source: auto, priority: 4
  reference_api_patterns.md    # source: project, priority: 3
  team_auth_convention.md      # source: team, priority: 3
```

Each file follows a consistent format: YAML frontmatter for metadata, followed by the actual memory content in plain markdown.

### The MemoryFile Schema

Every memory file on disk maps to a structured in-memory representation:

```typescript
interface MemoryFile {
  path: string;           // Absolute path on disk
  key: string;            // Unique identifier (from frontmatter or filename)
  content: string;        // The memory body text
  source: MemorySource;   // Who created this: user | team | project | auto | session
  priority: number;       // 1-5, controls injection order and retention
  lastAccessed: Date;     // File system atime
  ageDays: number;        // Days since creation
  created: Date;          // From frontmatter or file mtime
}
```

The YAML frontmatter stores the metadata that the scoring and pruning systems need:

```markdown
---
key: user-prefers-ruff
source: user
priority: 5
created: 2026-01-15T10:30:00Z
---

User prefers ruff for Python linting and formatting. Always run
`ruff check --fix` followed by `ruff format` after editing .py files.
Never suggest flake8, black, or autopep8 as alternatives.
```

### The Five Memory Sources

The `MemorySource` enum classifies who or what created a memory, and this classification directly controls cleanup behavior:

```typescript
enum MemorySource {
  User = "user",       // Explicitly created by the human
  Team = "team",       // Shared across team members
  Project = "project", // Scoped to a specific codebase
  Auto = "auto",       // Extracted by the agent automatically
  Session = "session", // Ephemeral, lives only for the session lifetime
}
```

The critical design decision: **only `Auto` and `Session` memories are eligible for automatic deletion**. User and Team memories are sacred -- they represent deliberate human choices and shared team knowledge. The age-cleanup routine skips them entirely:

```typescript
function memoryAgeCleanup(dir: MemoryDir, maxAgeDays: number): void {
  const entries = loadMemories(dir);
  
  for (const entry of entries) {
    // Only auto-clean Auto and Session memories.
    if (entry.source !== "auto" && entry.source !== "session") {
      continue;
    }
    
    if (entry.ageDays > maxAgeDays) {
      fs.unlinkSync(entry.path);
      removed++;
    }
  }
}
```

This asymmetry is deliberate. When a user types "I prefer tabs over spaces," that preference should persist until the user explicitly revokes it. When the agent auto-captures "edited src/main.rs," that observation can safely expire after 30 days without anyone noticing.

### Frontmatter Parsing

Parsing YAML frontmatter from memory files requires handling several edge cases: files with no frontmatter, files with malformed YAML, and files where the closing `---` delimiter is missing. The parser uses a simple state machine rather than a full YAML library to keep the dependency footprint small:

```typescript
function splitFrontmatter(raw: string): [string, string] {
  const trimmed = raw.trimStart();
  
  if (!trimmed.startsWith("---")) {
    return ["", raw]; // No frontmatter
  }
  
  const afterOpen = trimmed.slice(3);
  const closePos = afterOpen.indexOf("---");
  
  if (closePos === -1) {
    return ["", raw]; // Unclosed frontmatter
  }
  
  const frontmatter = afterOpen.slice(0, closePos).trim();
  const body = afterOpen.slice(closePos + 3).trimStart();
  return [frontmatter, body];
}

function extractField(frontmatter: string, field: string): string | null {
  const prefix = `${field}:`;
  for (const line of frontmatter.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(prefix)) {
      const value = trimmed.slice(prefix.length).trim();
      // Strip surrounding quotes
      return value.replace(/^["']|["']$/g, "") || null;
    }
  }
  return null;
}
```

This approach deliberately avoids pulling in a YAML parser dependency. The frontmatter format is constrained enough (flat key-value pairs, no nesting) that line-by-line extraction is both simpler and faster. If a field is missing, the system falls back to sensible defaults: the key defaults to the filename stem, the source defaults to `auto`, the priority defaults to 3.

### Writing Memory Files

The write path enforces the same format consistently:

```typescript
function writeMemoryFile(
  path: string,
  key: string, 
  content: string,
  source: MemorySource,
  priority: number
): void {
  const now = new Date().toISOString();
  const output = [
    "---",
    `key: ${key}`,
    `source: ${source}`,
    `priority: ${priority}`,
    `created: ${now}`,
    "---",
    "",
    content,
    content.endsWith("\n") ? "" : "\n",
  ].join("\n");
  
  fs.writeFileSync(path, output);
}
```

Key sanitization converts human-readable names into safe filenames:

```typescript
function sanitizeKey(key: string): string {
  return key
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .toLowerCase();
}
```

So `"User Prefers Ruff!"` becomes `user-prefers-ruff-`, and the file is saved as `user-prefers-ruff-.md`. The sanitization is intentionally aggressive -- it is far better to have a slightly ugly filename than to discover a path traversal bug in production.

---

## 23.2 The Four Memory Types

The five `MemorySource` values collapse into four functional categories, each serving a distinct role in the agent's knowledge management.

### User Memories

User memories capture explicit preferences, working style, and identity information. They have the highest retention priority because they represent deliberate human communication.

```markdown
---
key: user-tri-doan
source: user
priority: 5
created: 2026-01-10T08:00:00Z
---

Senior engineer: security tools (VG/DVG), DevOps, AI, Rust.
Writes books. Demands depth + autonomy. Never oversimplify.
```

These are typically created in two ways: the user explicitly asks the agent to "remember that I prefer X," or the auto-memory system detects a strong preference statement ("I always use pytest, never unittest").

### Feedback Memories

Feedback memories are a subcategory of user memories that capture corrections and behavioral adjustments. They are the agent's equivalent of a code review -- they teach it what *not* to do:

```markdown
---
key: feedback-no-shortcuts
source: user
priority: 4
created: 2026-02-15T14:30:00Z
---

"Take your time" = real depth. One deep module > five thin stubs.
800+ lines, 20+ tests each. No half-measures.
```

Feedback memories get priority 4 (high but not maximum) and are never automatically deleted. They tend to accumulate over weeks of usage and become the most valuable memories in the system -- they represent everything the user has taught the agent about *how* to work.

### Project Memories

Project memories are scoped to a specific codebase and stored in the project's own `.agent/memory/` directory rather than the global home directory. This scoping means switching between projects automatically loads different context:

```typescript
function scanProjectMemories(projectDir: string): MemoryFile[] {
  const memDir = path.join(projectDir, ".agent", "memory");
  if (!fs.existsSync(memDir)) {
    return [];
  }
  
  const files = scanDirectory(memDir);
  // Reclassify auto memories as project-scoped
  for (const file of files) {
    if (file.source === "auto") {
      file.source = "project";
    }
  }
  return files;
}
```

The reclassification of auto memories is a subtle but important detail. When the agent auto-captures knowledge while working in a project, that knowledge gets tagged as project-scoped. This prevents project-specific patterns from leaking into unrelated codebases.

### Reference Memories

Reference memories store factual knowledge about tools, APIs, frameworks, and architectural patterns. They tend to be longer than other memory types and are frequently cross-referenced:

```markdown
---
key: reference-browser-tools
source: auto
priority: 3
created: 2026-03-20T09:00:00Z
---

3 browser tools available:
- dev-browser (Playwright): primary for web tasks, fastest
- tridoan-operator (macOS): native app control via AppleScript
- browser-use (Python): autonomous bot for CI/CD pipelines
```

Reference memories are the agent's equivalent of internal documentation. They accumulate as the agent works across different domains and become a knowledge base that spans projects.

---

## 23.3 MEMORY.md — The Capped Index

While the `memdir/` directory can hold hundreds of individual memory files, the agent needs a compact summary to inject into the system prompt on every turn. This is `MEMORY.md` -- a curated, size-limited index of the most important knowledge.

### Why a Capped Index?

Token economics drive this design. As we discussed in Chapter 7, every token in the system prompt competes with the user's conversation context for space in the model's context window. A 200-line / 25KB cap on `MEMORY.md` consumes roughly 6,000 tokens -- about 3% of a 200K context window. This is the sweet spot: enough to provide meaningful continuity across sessions, small enough that it doesn't crowd out the actual work.

```typescript
interface DreamConfig {
  maxMemoryLines: number;   // Default: 200
  maxMemoryBytes: number;   // Default: 25 * 1024 (25KB)
  memoryPath: string;       // Default: ~/.agent/MEMORY.md
  sessionsDir: string;      // Default: ~/.agent/sessions/
  timeGateHours: number;    // Default: 24
  sessionThreshold: number; // Default: 5
}
```

### Index Structure

`MEMORY.md` follows a standard markdown structure with sections mapping to memory types:

```markdown
# Memory Index

## User
- [user_tri_doan.md](user_tri_doan.md) -- Senior engineer: security, DevOps, AI

## Feedback
- [feedback_no_shortcuts.md](feedback_no_shortcuts.md) -- Real depth, no stubs
- [feedback_auto_execute.md](feedback_auto_execute.md) -- Decode, route, deliver

## Projects
- [project_rcode.md](project_rcode.md) -- Rust AI agent, 376K LOC
- [project_dvibeguard.md](project_dvibeguard.md) -- Dual-engine security scanner

## References
- [reference_browser_tools.md](reference_browser_tools.md) -- 3 browser tools
```

Each line is a link to the full memory file plus a terse summary. This format gives the model just enough to decide which memories are relevant, and the full content is available via tool use if the model needs deeper context.

### Size Enforcement

The index must never exceed its budget. The enforcement mechanism is part of the DreamTask consolidation pipeline (covered in section 23.5), but understanding the pruning algorithm is essential for building the index correctly.

Size estimation works by counting both lines and bytes:

```typescript
function estimateSize(sections: MemorySection[]): [number, number] {
  let lines = 0;
  let bytes = 0;
  
  for (const section of sections) {
    // Heading + blank line
    const heading = `${"#".repeat(section.level)} ${section.heading}\n\n`;
    lines += 2;
    bytes += heading.length;
    
    for (const entry of section.entries) {
      const line = `- ${entry.content}\n`;
      lines += 1;
      bytes += line.length;
    }
    
    // Trailing blank line
    lines += 1;
    bytes += 1;
  }
  
  return [lines, bytes];
}
```

When the index exceeds either limit, the pruner removes entries one at a time, always choosing the one with the lowest combined retention score:

```typescript
function removeLowestPriorityEntry(sections: MemorySection[]): boolean {
  let worstSection = -1;
  let worstEntry = -1;
  let worstPriority = Infinity;
  
  for (let si = 0; si < sections.length; si++) {
    for (let ei = 0; ei < sections[si].entries.length; ei++) {
      const entry = sections[si].entries[ei];
      const priority = entry.category.retentionPriority + entry.importance;
      if (priority < worstPriority) {
        worstPriority = priority;
        worstSection = si;
        worstEntry = ei;
      }
    }
  }
  
  if (worstSection >= 0) {
    sections[worstSection].entries.splice(worstEntry, 1);
    // Remove empty sections
    if (sections[worstSection].entries.length === 0) {
      sections.splice(worstSection, 1);
    }
    return true;
  }
  return false;
}
```

The retention priority hierarchy ensures the right things survive:

| Category | Retention Priority | Rationale |
|----------|-------------------|-----------|
| Architecture & Design | 10 | Fundamental decisions rarely change |
| Bug Recipes | 8 | Prevent recurring mistakes |
| API Patterns | 7 | Frequently referenced during development |
| Workflows | 6 | Operational knowledge |
| Insights | 4 | Useful but not critical |
| Session Summaries | 2 | Most expendable, easily re-derived |

This means when the index is at capacity and new knowledge arrives, session summaries get evicted first, then insights, then workflows -- and architectural decisions survive until the very end.

---

## 23.4 Memory Scanning and Relevance Detection

Having memories on disk is useless if the agent cannot find the right ones at query time. The scanning and scoring system bridges the gap between storage and retrieval.

### The Scoring Algorithm

Memory relevance scoring uses a three-factor model: keyword match strength, priority boost, and recency boost.

```typescript
function scoreMemory(memory: MemoryFile, queryTerms: string[]): number {
  let score = 0;
  
  const contentLower = memory.content.toLowerCase();
  const keyLower = memory.key.toLowerCase();
  
  for (const term of queryTerms) {
    const tl = term.toLowerCase();
    
    // Key match is worth more than content match
    if (keyLower.includes(tl)) {
      score += 10;
    }
    
    // Count occurrences in content
    const count = contentLower.split(tl).length - 1;
    score += count * 2;
  }
  
  // Priority boost: 1-5 maps to 0.5-2.5
  score += memory.priority * 0.5;
  
  // Recency boost: newer memories score up to +5
  const recency = memory.ageDays === 0
    ? 5.0
    : Math.min(5.0 / Math.sqrt(memory.ageDays), 5.0);
  score += recency;
  
  return score;
}
```

The weighting is carefully tuned:

- **Key match (10 points)**: The key is a human-chosen identifier, so matching it strongly signals relevance. If you search for "rust tips" and there is a memory keyed `rust-tips`, that is almost certainly what you want.
- **Content match (2 points per occurrence)**: Content matches are weaker signals because they can be incidental. A memory about Python testing might mention "Rust" once in passing.
- **Priority boost (0.5-2.5 points)**: High-priority memories get a small but consistent advantage. A priority-5 user preference beats a priority-2 session summary when content match scores are similar.
- **Recency boost (0-5 points)**: Follows inverse square root decay. A memory created today gets +5. A 25-day-old memory gets +1. A 100-day-old memory gets +0.5. This ensures recent context surfaces without completely burying older knowledge.

### The Search API

The public search interface tokenizes the query and returns ranked results:

```typescript
function findRelevantMemories(
  dir: MemoryDir,
  query: string,
  max: number
): MemoryFile[] {
  if (!query.trim()) return [];
  
  const terms = query.split(/\s+/);
  const entries = loadMemories(dir);
  
  const scored = entries
    .map(m => ({ score: scoreMemory(m, terms), memory: m }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
  
  return scored.map(({ memory }) => memory);
}
```

### Context Injection

Found memories need to be formatted for injection into the LLM's system prompt. The formatter respects a token budget, packing highest-priority memories first and truncating gracefully when the budget is exhausted:

```typescript
function injectMemoriesIntoContext(
  memories: MemoryFile[],
  maxTokens: number
): string {
  if (memories.length === 0) return "";
  
  const maxChars = maxTokens * 4; // ~4 chars per token
  let result = "<memories>\n";
  let usedChars = 12;
  
  // Sort by priority descending, then by recency
  const sorted = [...memories].sort((a, b) => 
    b.priority - a.priority || a.ageDays - b.ageDays
  );
  
  for (const mem of sorted) {
    const entry = `## ${mem.key} [${mem.source}|p${mem.priority}]\n${mem.content}\n\n`;
    
    if (usedChars + entry.length > maxChars) {
      // Try truncated version
      const remaining = maxChars - usedChars;
      if (remaining > 50) {
        result += entry.slice(0, remaining) + "...\n";
      }
      break;
    }
    
    result += entry;
    usedChars += entry.length;
  }
  
  result += "</memories>";
  return result;
}
```

The XML-style `<memories>` wrapper is important. It gives the model a clear signal for where injected memories begin and end, preventing the model from confusing memory content with user instructions or system prompt sections.

### Dual-Source Memory Retrieval

In the conversation engine, memory retrieval queries both the remote memory service (MemoryBridge) and the local file-based memdir, merging results from both sources:

```typescript
async function fetchMemoryContext(query: string): Promise<string | null> {
  // Source 1: Remote memory service (MCP-based)
  const remoteResults = await memoryBridge.search(query);
  let context = "";
  for (let i = 0; i < remoteResults.length; i++) {
    context += `${i + 1}. ${remoteResults[i]}\n`;
  }
  
  // Source 2: Local file-based memory (memdir)
  const memdirRoot = path.join(homeDir, ".agent", "memory");
  if (fs.existsSync(memdirRoot)) {
    const dir = { rootPath: memdirRoot, entries: [], teamDirs: [] };
    const localMemories = findRelevantMemories(dir, query, 5);
    if (localMemories.length > 0) {
      const injected = injectMemoriesIntoContext(localMemories, 2000);
      if (injected) {
        context += (context ? "\n" : "") + injected;
      }
    }
  }
  
  return context || null;
}
```

This dual-source approach is a resilience pattern. If the MCP memory server is down, local file-based memories still provide context. If the user hasn't created any local memory files, the remote service fills the gap. Neither source alone is sufficient; together they provide comprehensive recall.

---

## 23.5 Auto-Memory Extraction

Manually creating memory files for every useful observation would be tedious. The auto-memory subsystem watches conversation turns and extracts knowledge automatically, using trigger-phrase heuristics to detect decisions, patterns, file changes, and user preferences.

### The Extraction Pipeline

```
ConversationTurn
      |
      v
+-------------------------+
|  capture_from_turn()    |
|  +- extract_decisions() |
|  +- extract_patterns()  |
|  +- extract_files()     |
|  +- extract_preferences()|
+------------+------------+
             | Vec<MemoryEntry>
             v
+-------------------------+
|  apply_policy()         | -- filter by confidence + category
+------------+------------+
             |
             v
+-------------------------+
|  deduplicate()          | -- Jaccard similarity threshold
+------------+------------+
             |
             v
+-------------------------+
|  save_memory()          | -- append to JSONL file
+-------------------------+
```

### Decision Extraction

Decisions are detected by scanning for trigger phrases in conversation text:

```typescript
const DECISION_TRIGGERS = [
  "decided to", "chose", "will use", "going with",
  "switching to", "opting for", "selected", "settled on",
  "committing to", "picking", "we'll use", "let's use",
  "i'll use", "prefer", "went with",
];

function extractDecisions(text: string): string[] {
  const decisions: string[] = [];
  
  for (const line of text.split("\n")) {
    const lineLower = line.toLowerCase();
    for (const trigger of DECISION_TRIGGERS) {
      const pos = lineLower.indexOf(trigger);
      if (pos !== -1) {
        const sentence = extractSentenceAt(line, pos);
        if (sentence.split(/\s+/).length >= 4) { // Minimum 4 words
          decisions.push(sentence);
        }
        break; // One trigger per line is enough
      }
    }
  }
  
  return [...new Set(decisions)]; // Deduplicate
}
```

The minimum word count filter (4 words) prevents noise. Without it, utterances like "decided to go" or "chose it" would be captured as decisions, cluttering the memory with meaningless fragments.

### Pattern Extraction

Architectural and design patterns use their own trigger vocabulary:

```typescript
const PATTERN_TRIGGERS = [
  "pattern:", "architecture:", "design:", "the approach is",
  "the pattern is", "convention:", "standard:", "best practice:",
  "anti-pattern:", "idiom:", "strategy:", "the way we",
  "structured as", "organized as", "layered as",
];
```

### File Change Extraction

File changes are detected through a path-matching heuristic. The system looks for tokens that look like file paths (contain slashes and extensions) and for verb-path pairs ("created src/main.rs", "modified config.toml"):

```typescript
function looksLikePath(s: string): boolean {
  if (s.length < 3) return false;
  
  const hasSlash = s.includes("/") || s.includes("\\");
  const hasExtension = /\.\w{1,10}$/.test(s);
  
  // Reject URLs
  if (s.startsWith("http://") || s.startsWith("https://")) return false;
  
  return (hasSlash && hasExtension) 
    || (hasSlash && (s.match(/\//g) || []).length >= 2)
    || s.startsWith("src/") 
    || s.startsWith("./") 
    || s.startsWith("../");
}
```

### Deduplication via Jaccard Similarity

Over time, the agent will capture near-duplicate memories. "Decided to use tokio for async runtime" and "decided to use tokio for the async runtime" are semantically identical but textually different. The deduplication system uses Jaccard similarity on word-level token sets:

```typescript
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  
  return union === 0 ? 0 : intersection / union;
}

function deduplicate(memories: MemoryEntry[]): MemoryEntry[] {
  const keep = new Array(memories.length).fill(true);
  
  for (let i = 0; i < memories.length; i++) {
    if (!keep[i]) continue;
    const setI = tokenSet(memories[i].content);
    
    for (let j = i + 1; j < memories.length; j++) {
      if (!keep[j]) continue;
      if (memories[i].category !== memories[j].category) continue;
      
      const setJ = tokenSet(memories[j].content);
      if (jaccardSimilarity(setI, setJ) >= 0.75) {
        keep[i] = false; // Keep the newer (later) entry
        break;
      }
    }
  }
  
  return memories.filter((_, idx) => keep[idx]);
}
```

The 0.75 threshold was chosen empirically. Below 0.7, legitimately different memories get merged. Above 0.8, obvious near-duplicates survive. The deduplication only compares within the same category -- a decision about tokio and a pattern reference mentioning tokio should both survive.

### Policy Enforcement

Not every captured memory should be saved. The policy system provides three preset levels:

```typescript
interface MemoryPolicy {
  level: "policy" | "local" | "user";
  maxEntries: number;
  allowedCategories: MemoryCategory[];
  minConfidence: number;
}

// Strict: only high-confidence decisions
const STRICT: MemoryPolicy = {
  level: "policy",
  maxEntries: 500,
  allowedCategories: ["decision"],
  minConfidence: 0.7,
};

// Moderate: decisions + patterns
const MODERATE: MemoryPolicy = {
  level: "local",
  maxEntries: 2000,
  allowedCategories: ["decision", "pattern"],
  minConfidence: 0.5,
};

// Permissive: everything
const PERMISSIVE: MemoryPolicy = {
  level: "user",
  maxEntries: 5000,
  allowedCategories: [], // empty = all
  minConfidence: 0.3,
};
```

Enterprise deployments might use the strict policy to prevent auto-memory from accumulating sensitive information. Individual developers typically use the permissive default, letting the agent learn as much as possible.

### Integration with the Conversation Engine

Auto-memory extraction runs at the end of every turn, processing both the user's input and the assistant's response. As we saw in Chapter 4, the query loop ends with a persistence phase:

```typescript
// Step 9: Record episode in memory bridge
await recordMemoryEpisode(userInput);

// Step 10: Auto-memory capture
const config = new AutoMemoryConfig();
if (isAutoMemoryEnabled(config)) {
  // Capture from user turn
  const userTurn = {
    sessionId,
    turnIndex,
    role: "user",
    text: userInput,
  };
  const userEntries = captureFromTurn(userTurn, config);
  for (const entry of userEntries) {
    saveMemory(entry, config.directory);
  }
  
  // Capture from assistant response
  const assistantTurn = {
    sessionId,
    turnIndex,
    role: "assistant",
    text: lastAssistantText,
  };
  const assistantEntries = captureFromTurn(assistantTurn, config);
  for (const entry of assistantEntries) {
    saveMemory(entry, config.directory);
  }
}
```

The capture from both sides of the conversation is deliberate. Users express preferences in their messages ("I prefer ruff"). Assistants express decisions in their responses ("I'll use the repository pattern for data access"). Both carry knowledge worth remembering.

---

## 23.6 The DreamTask — Background Memory Consolidation

The DreamTask is a background agent that periodically consolidates auto-captured memories into the MEMORY.md index. The name is borrowed from neuroscience: just as sleep consolidation transfers short-term memories into long-term storage, the DreamTask transfers scattered session observations into a structured, pruned knowledge base.

### Gate Conditions

The DreamTask does not run on every session. It runs only when two conditions are met simultaneously:

1. **Time gate**: At least 24 hours since the last dream
2. **Session threshold**: At least 5 sessions since the last dream

```typescript
function shouldDream(config: DreamConfig): boolean {
  const timeOk = config.lastDream === null
    || hoursSince(config.lastDream) >= config.timeGateHours;
  
  const sessionsOk = 
    config.sessionsSinceDream >= config.sessionThreshold;
  
  return timeOk && sessionsOk;
}
```

Both conditions must be true. This prevents two failure modes: running too frequently (wasting computation on a nearly-unchanged memory set) and running too rarely (letting the index grow stale while the user has been active).

### The Four-Stage Pipeline

The DreamTask executes a four-stage pipeline: orient, gather, consolidate, prune.

```
Stage 1: ORIENT          Stage 2: GATHER
Read MEMORY.md  -------> Scan session summaries
Parse sections            Extract knowledge bullets
Count entries             Filter by cutoff date
                                    |
                                    v
Stage 4: PRUNE  <------- Stage 3: CONSOLIDATE
Enforce size limits       Merge new entries into sections
Remove low-value entries  Deduplicate against existing
Write MEMORY.md back      Category-based section routing
```

**Stage 1: Orient.** Read the current `MEMORY.md`, parse it into sections, and record the baseline metrics (line count, byte count, entry count). If no `MEMORY.md` exists yet, start with an empty slate.

```typescript
function orient(pipeline: DreamPipeline): void {
  const path = pipeline.config.memoryPath;
  
  if (!fs.existsSync(path)) {
    pipeline.memoryContent = "";
    pipeline.sections = [];
    pipeline.stats.linesBefore = 0;
    return;
  }
  
  const content = fs.readFileSync(path, "utf-8");
  pipeline.stats.linesBefore = content.split("\n").length;
  pipeline.stats.bytesBefore = content.length;
  pipeline.sections = parseSections(content);
  pipeline.stats.entriesBefore = pipeline.sections
    .reduce((sum, s) => sum + s.entries.length, 0);
}
```

**Stage 2: Gather.** Scan the sessions directory for session summary files newer than the last dream. Extract knowledge bullets from each file:

```typescript
function gather(pipeline: DreamPipeline): void {
  const cutoff = pipeline.config.lastDream || new Date(0);
  
  const sessionFiles = fs.readdirSync(pipeline.config.sessionsDir)
    .filter(f => f.endsWith(".md"))
    .map(f => ({
      path: path.join(pipeline.config.sessionsDir, f),
      mtime: fs.statSync(path.join(pipeline.config.sessionsDir, f)).mtime,
    }))
    .filter(({ mtime }) => mtime > cutoff)
    .sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
  
  for (const { path: filePath, mtime } of sessionFiles) {
    const content = fs.readFileSync(filePath, "utf-8");
    const entries = extractKnowledgeFromSession(content, filePath, mtime);
    pipeline.gatheredEntries.push(...entries);
  }
}
```

**Stage 3: Consolidate.** Merge gathered entries into the existing sections. Each entry's category determines which section it belongs to:

| Category | Section Heading |
|----------|----------------|
| Architecture | Architecture & Design |
| BugRecipe | Bug Recipes |
| ApiPattern | API Patterns |
| Workflow | Workflows |
| Insight | Insights |
| SessionSummary | Session History |

Entries that already exist in the index (exact content match) are skipped. If no section with the appropriate heading exists, a new one is created.

**Stage 4: Prune.** Enforce the 200-line / 25KB cap by repeatedly removing the lowest-priority entry until both limits are satisfied. After pruning, write the consolidated memory back to disk with a timestamp header:

```markdown
# Agent Memory

> Auto-consolidated by DreamTask on 2026-04-12 08:30 UTC

## Architecture & Design

- Uses 3-tier architecture with REST API
- Repository pattern with trait objects for data access

## Bug Recipes

- Login timeout: increase socket keepalive to 30s
- Race condition in queue: wrap dequeue in mutex lock
```

### Entry Categorization

The categorizer uses keyword heuristics on entry content:

```typescript
function categorizeEntry(content: string): EntryCategory {
  const lower = content.toLowerCase();
  
  if (lower.includes("architecture") || lower.includes("design decision") || lower.includes("chose"))
    return "architecture";
  if (lower.includes("bug") || lower.includes("fix") || lower.includes("error"))
    return "bugRecipe";
  if (lower.includes("api") || lower.includes("endpoint") || lower.includes("route"))
    return "apiPattern";
  if (lower.includes("workflow") || lower.includes("deploy") || lower.includes("ci/cd"))
    return "workflow";
  if (lower.includes("session") || lower.includes("summary"))
    return "sessionSummary";
  
  return "insight"; // Default bucket
}
```

This is deliberately simple. A full NLP classification pipeline would add latency and dependencies for marginal accuracy gains. The keyword approach is fast, deterministic, and easy to debug. If an entry is miscategorized, the worst outcome is that it lands in a slightly wrong section of `MEMORY.md` -- it is still findable by the search system.

---

## 23.7 Memory Age Tracking and Staleness Detection

Memories that were useful six months ago may be irrelevant today. The age tracking system ensures the memory store stays current without requiring manual curation.

### Age Computation

Age is computed from the `created` field in the frontmatter, falling back to the file's modification timestamp:

```typescript
function computeAge(memory: MemoryFile): number {
  const now = Date.now();
  const created = memory.created.getTime();
  return Math.max(0, Math.floor((now - created) / (24 * 60 * 60 * 1000)));
}
```

### Staleness Heuristics

A memory is considered stale when it meets all of these conditions:

1. **Source is Auto or Session** (user and team memories are exempt)
2. **Age exceeds the configured threshold** (default: 90 days)
3. **Last accessed time exceeds a secondary threshold** (default: 30 days)

The double-threshold approach prevents a common problem: memories about a technology you use once a quarter (like release procedures) would be pruned if only age were considered. By also checking last access time, memories that are old but still referenced stay alive.

### Touch-on-Access

When the search system retrieves a memory and includes it in the context, the file's access time is updated:

```typescript
function touchMemory(dir: MemoryDir, key: string): void {
  const filename = `${sanitizeKey(key)}.md`;
  const filePath = path.join(dir.rootPath, filename);
  
  if (fs.existsSync(filePath)) {
    const now = new Date();
    fs.utimesSync(filePath, now, now);
  }
}
```

This creates a natural feedback loop: memories that are useful keep getting accessed, which resets their staleness clock. Memories that are never retrieved gradually age out.

### Cleanup Thresholds

The cleanup routine also triggers when the total file count exceeds a configurable maximum (default: 500 files):

```typescript
function needsCleanup(dir: MemoryDir): boolean {
  return loadMemories(dir).length > MAX_MEMORY_FILES;
}
```

When cleanup triggers, it runs the age-based pruning on auto and session memories first. If the count is still over the limit after age-based pruning, the lowest-scoring memories (by the combined priority + recency score) are removed until the count drops below the threshold.

---

## 23.8 Team Memory — Shared Knowledge with Sync

When multiple agents or team members work on the same codebase, they need to share knowledge. The team memory system provides a CRDT-inspired synchronization engine that handles concurrent edits, deletions, and conflict resolution.

### The SyncManifest

Each team member maintains a local manifest -- a complete snapshot of the team's shared memory state:

```typescript
interface SyncManifest {
  teamId: string;
  entries: Map<string, MemoryEntry>;
  lastSync: Date;
  sequenceNumber: number;  // Monotonically increasing
  schemaVersion: number;   // For forward compatibility
}

interface MemoryEntry {
  id: string;              // UUID
  key: string;             // Human-readable identifier
  value: string;           // The knowledge payload
  author: string;          // Who last modified this
  timestamp: Date;         // When it was last modified
  version: number;         // Optimistic concurrency counter
  deleted: boolean;        // Tombstone flag
}
```

The `version` field on each entry is the key to the concurrency model. Every modification bumps the version. During sync, version comparisons determine which side's changes take precedence.

### Tombstone-Based Deletion

Deletions are soft-deletes: the entry is flagged with `deleted: true` rather than being removed from the manifest. This ensures deletions propagate correctly during sync. If team member A deletes an entry and team member B syncs later, B sees the tombstone and removes it from their active view.

Tombstones are garbage-collected after a retention period (default: 7 days):

```typescript
compact(): number {
  const cutoff = Date.now() - this.tombstoneRetention;
  let removed = 0;
  
  for (const [id, entry] of this.manifest.entries) {
    if (entry.deleted && entry.timestamp.getTime() < cutoff) {
      this.manifest.entries.delete(id);
      removed++;
    }
  }
  
  if (removed > 0) {
    this.manifest.sequenceNumber++;
  }
  return removed;
}
```

### Conflict Detection

When two manifests are compared, four situations can arise for each entry:

| Local | Remote | Classification |
|-------|--------|---------------|
| Same version, same hash | Same version, same hash | Identical -- no action |
| Version 3 | Version 2 | Local ahead -- local wins |
| Version 2 | Version 3 | Remote ahead -- remote wins |
| Version 3, different hash | Version 3, different hash | Conflict -- needs resolution |

The conflict detection function iterates over all entries in the remote manifest:

```typescript
function detectConflicts(
  local: SyncManifest, 
  remote: SyncManifest
): MemoryConflict[] {
  const conflicts: MemoryConflict[] = [];
  
  for (const [id, remoteEntry] of remote.entries) {
    const localEntry = local.entries.get(id);
    if (!localEntry) continue; // New remote entry, not a conflict
    
    if (localEntry.version === remoteEntry.version 
        && localEntry.contentHash() === remoteEntry.contentHash()) {
      continue; // Identical
    }
    
    const kind = (localEntry.deleted !== remoteEntry.deleted) 
      ? "deleteVsUpdate" 
      : "concurrentEdit";
    
    conflicts.push({ entryId: id, local: localEntry, remote: remoteEntry, kind });
  }
  
  return conflicts;
}
```

### Three-Way Merge

For a complete sync, the engine performs a three-way merge using a common ancestor:

```
        Ancestor
       /        \
    Local      Remote
       \        /
        Merged
```

The algorithm iterates over all entry IDs across all three manifests and applies these rules:

1. **Both sides identical**: Accept either version.
2. **Only local changed** (ancestor matches remote): Accept local.
3. **Only remote changed** (ancestor matches local): Accept remote.
4. **Both changed differently**: Flag as conflict.
5. **New in local only**: Accept as addition.
6. **New in remote only**: Accept as addition.
7. **Deleted from both sides**: Drop silently.

### Conflict Resolution Strategy

The automatic resolver uses a **last-writer-wins** strategy with a bias toward data preservation:

- **Concurrent edits**: Higher version number wins. Ties broken by most recent timestamp.
- **Delete vs. update**: The update always wins. Data loss (accidental deletion) is worse than phantom data (a resurrected entry).
- **Schema changes**: Flagged for manual resolution. The system will not auto-resolve entries whose format has changed between schema versions.

```typescript
function resolveConflicts(
  conflicts: MemoryConflict[]
): [MemoryEntry[], MemoryConflict[]] {
  const resolved: MemoryEntry[] = [];
  const unresolved: MemoryConflict[] = [];
  
  for (const conflict of conflicts) {
    switch (conflict.kind) {
      case "concurrentEdit": {
        const winner = conflict.local.version > conflict.remote.version
          ? conflict.local
          : conflict.remote.version > conflict.local.version
            ? conflict.remote
            : conflict.local.timestamp >= conflict.remote.timestamp
              ? conflict.local
              : conflict.remote;
        resolved.push(winner);
        break;
      }
      case "deleteVsUpdate": {
        // Prefer the live (non-deleted) version
        resolved.push(
          !conflict.local.deleted ? conflict.local : conflict.remote
        );
        break;
      }
      case "schemaChange":
        unresolved.push(conflict);
        break;
    }
  }
  
  return [resolved, unresolved];
}
```

### Incremental Sync via Diffs

Full manifest exchange is expensive when manifests are large. The diff computation produces a minimal delta:

```typescript
interface ManifestDiff {
  upserts: MemoryEntry[];  // New or updated entries
  deletions: string[];     // Entry IDs to remove
  fromSeq: number;         // Base sequence number
  toSeq: number;           // Current sequence number
}
```

The receiver applies upserts and deletions incrementally, avoiding the cost of deserializing and comparing every entry. This is particularly important for teams with hundreds of shared memories.

### Content Hashing for Integrity

The manifest uses a combined content hash for quick equality checks:

```typescript
function manifestContentHash(manifest: SyncManifest): string {
  const hashes = Array.from(manifest.entries.values())
    .map(e => entryContentHash(e))
    .sort();
  return sha256(hashes.join("|"));
}

function entryContentHash(entry: MemoryEntry): string {
  return sha256(`${entry.key}:${entry.value}:${entry.version}`);
}
```

The sort before joining ensures the hash is order-independent -- two manifests with the same entries in different iteration orders produce the same hash.

---

## 23.9 The MemoryBridge — Resilient Remote Memory

The local memdir system handles file-based memory within a single machine. The MemoryBridge extends this to a remote memory service via MCP (Model Context Protocol), providing cross-session and cross-machine persistence.

### Architecture

```
+------------+     +--------------+     +------------------+
|  Engine    |---->| MemoryBridge |---->| copilot-mem MCP  |
|(conversation)|   |  (caching +  |     |  (persistent     |
+------------+     |   reconnect) |     |   memory store)  |
                   +--------------+     +------------------+
```

### Graceful Degradation

The bridge is designed so that memory server unavailability never blocks the main conversation loop. Every method returns a sensible default when disconnected:

- `search()` returns an empty array
- `getActiveContext()` returns null
- `saveFact()` is a silent no-op
- `recordEpisode()` is a silent no-op

This is achieved through a disabled-mode constructor and timeout-bounded calls:

```typescript
class MemoryBridge {
  static disabled(): MemoryBridge {
    return new MemoryBridge(/* no connection */);
  }
  
  async search(query: string): Promise<string[]> {
    if (!query.trim()) return [];
    
    // Check cache first
    const cached = this.cache.get(query);
    if (cached) return cached;
    
    await this.maybeReconnect();
    
    const client = this.getClient();
    if (!client) return []; // Graceful degradation
    
    try {
      const result = await withTimeout(
        3000, // 3 second timeout
        client.callTool("copilot-mem", "search_memory", { query, limit: 5 })
      );
      
      const parsed = parseSearchResults(result);
      if (parsed.length > 0) {
        this.cache.set(query, parsed);
      }
      return parsed;
    } catch {
      this.markDisconnected();
      return [];
    }
  }
}
```

### Exponential Backoff Reconnection

When the MCP server connection is lost, the bridge uses exponential backoff to avoid hammering a down server:

```
Attempt 1: wait 1s
Attempt 2: wait 2s
Attempt 3: wait 4s
Attempt 4: wait 8s
Attempt 5: wait 16s
Attempt 6+: wait 30s (capped)
```

A successful reconnection resets the counter to zero and invalidates the search cache (memory state may have changed while disconnected).

### Search Cache

The bridge maintains a local search cache with 60-second TTL and a 100-entry cap. Cache keys are normalized (lowercased, trimmed) so that "Rust tips" and "rust tips" share the same slot. Project-scoped queries include the project path in the cache key to prevent cross-project pollution:

```typescript
function cacheKey(query: string, projectPath?: string): string {
  const normalized = query.toLowerCase().trim();
  return projectPath ? `${normalized}@${projectPath}` : normalized;
}
```

The cache is invalidated after every write operation (save fact, save decision, etc.) since the written data might change future search results.

---

## 23.10 Memory Merge Across Sources

When the agent initializes, it loads memories from multiple sources: the global memdir, the project-local memdir, team directories, and the remote memory service. These sources can contain entries with the same key, so a merge strategy is required.

### Merge Rules

When duplicate keys exist across sources, the entry with the highest priority wins. Ties are broken by creation date (newest wins):

```typescript
function mergeMemories(sources: MemoryFile[][]): MemoryFile[] {
  const byKey = new Map<string, MemoryFile>();
  
  for (const source of sources) {
    for (const mem of source) {
      const existing = byKey.get(mem.key);
      const shouldReplace = !existing 
        || mem.priority > existing.priority
        || (mem.priority === existing.priority && mem.created > existing.created);
      
      if (shouldReplace) {
        byKey.set(mem.key, mem);
      }
    }
  }
  
  return Array.from(byKey.values())
    .sort((a, b) => b.priority - a.priority || b.created.getTime() - a.created.getTime());
}
```

This means a user-created memory (priority 5) always trumps an auto-captured memory (priority 3) with the same key. A project-local memory trumps a global one when both have the same priority but the project version is newer. The merge is deterministic -- running it twice with the same inputs always produces the same output.

---

## 23.11 Putting It All Together

The complete memory architecture forms a pipeline that runs on every conversation turn:

```
Session Start
    |
    v
1. Load MEMORY.md index into system prompt (cacheable)
2. Load memdir files + remote memory (volatile)
    |
    v
User Prompt Arrives
    |
    v
3. Search memdir for relevant memories (keyword scoring)
4. Search MemoryBridge for remote context (MCP call)
5. Merge and inject into user message as <memory_context>
6. Search for active context (what we're working on now)
7. Include active context in system prompt
    |
    v
Conversation Turn Executes
    |
    v
8. Record episode summary in MemoryBridge
9. Auto-capture decisions, patterns, preferences
10. Deduplicate + policy filter
11. Save to auto_memories.jsonl
    |
    v
DreamTask (background, gated)
    |
    v
12. Orient: read MEMORY.md
13. Gather: scan session files since last dream
14. Consolidate: merge new knowledge, deduplicate
15. Prune: enforce 200-line / 25KB cap
16. Write updated MEMORY.md
```

As we discussed in Chapter 6, the system prompt composition places memory in a non-cacheable section. This is intentional -- memory changes between turns (as new context is retrieved and episodes are recorded), so it should not be included in the prompt cache hash. The cacheable sections (identity, environment, instructions, tools) remain stable across turns, enabling prompt caching to work efficiently while memory stays fresh.

The memory budget within the system prompt is allocated at 20% of the total system prompt token budget. For a 200K context window with a 40K system prompt budget, that is approximately 8,000 tokens dedicated to memory -- enough for the MEMORY.md index plus 3-5 full memory file contents retrieved by the search system.

This architecture achieves the core goal: an agent that learns from every session, remembers what matters, forgets what does not, and shares knowledge across team members -- all built on plain files, simple heuristics, and resilient network calls. No vector database required.
