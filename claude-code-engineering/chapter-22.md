# Chapter 22: The Command System

Configuration tells your agent *what* it can do. Commands tell it *what the user wants to do right now*. In the previous chapter, we built a seven-tier configuration system that resolves settings from managed policies down to built-in defaults. But configuration is passive — it sits in JSON files waiting to be read. The command system is the active counterpart: the 90+ slash commands that let users steer the agent in real time, switch models mid-conversation, inspect context consumption, manage sessions, and invoke complex multi-step workflows like deep planning and codebase analytics.

This chapter covers how to build a command system that scales from 10 commands to 100+ without becoming unmaintainable. We'll implement the `Command` trait, the `CommandRegistry` for O(1) lookup and tab completion, an argument parser that handles positional args, flags, and quoted strings, and a structured output system that lets commands communicate actions back to the UI layer. Then we'll tackle the hard problems: how to distinguish commands that execute immediately (like `/clear`) from commands that need to be queued through the LLM (like `/plan`), how to gate commands behind feature flags so internal tools never leak to external users, and how to build two of the most complex commands in the system — `/plan` for deep structured planning and `/insights` for comprehensive project analytics.

---

## 22.1 The Command Trait and Type System

Every command system starts with a trait. The trait needs to be broad enough to support everything from a zero-argument `/clear` to a multi-subcommand `/insights code /path/to/project`, yet constrained enough that the registry can provide uniform tab completion, help generation, and validation.

### The Core Trait

```typescript
interface Command {
  // Identity
  name(): string;                          // Canonical name without "/"
  aliases(): string[];                     // Alternative names (e.g., "cls" for "clear")
  description(): string;                   // One-liner for /help output
  usage(): string;                         // Usage pattern (e.g., "/model [name]")
  category(): CommandCategory;             // Grouping for help display
  
  // Visibility
  hidden(): boolean;                       // Hidden from /help (debug commands)
  
  // Validation
  validateArgs(args: string[]): Result<void>;
  longHelp(): string;                      // Multi-line help text
  
  // Tab completion
  completions(args: string[], position: number, ctx: CommandContext): string[];
  
  // Execution
  execute(args: string[], ctx: CommandContext): Promise<string>;
}
```

The key design decisions here are worth calling out:

**Aliases are declared by the command itself**, not by the registry. This means `/cls` maps to `/clear` because the `ClearCommand` struct declares `aliases() -> ["cls"]`, not because someone added a mapping table somewhere. This keeps the routing logic co-located with the command implementation.

**Every command gets a `CommandContext`** — a mutable snapshot of session state that commands can both read and modify. When `/effort high` changes the thinking budget, it writes directly to `ctx.effort_level`. When `/clear --hard` resets token counters, it zeroes out `ctx.input_tokens` and `ctx.output_tokens`. This is deliberate: commands are the mechanism by which users alter session state.

**The return type is a simple string**, not a rich structured response. This keeps the trait simple. Commands that need to communicate structured data back to the UI use the `CommandOutput` wrapper (discussed in Section 22.3), but the trait itself stays minimal.

### Command Categories

Commands are grouped into ten categories, each serving a distinct user intent:

```typescript
enum CommandCategory {
  General,     // help, clear, exit — the basics
  Session,     // resume, export, sessions — session lifecycle
  Model,       // model, effort, fast, think — LLM control
  Config,      // config, permissions, hooks — settings management
  Context,     // compact, context, ctx-viz, tokens — context window
  Git,         // commit, diff, branch, pr — version control
  Debug,       // debug-tool, doctor, ctx-viz — diagnostics
  Auth,        // login, logout, oauth — authentication
  Analysis,    // insights, stats — analytics and metrics
  Plugin,      // plugin, mcp, reload-plugins — extensions
}
```

Categories serve two purposes: they organize the `/help` output into scannable groups, and they enable the tab completion system to prioritize suggestions by relevance. When you type `/` in the middle of a debugging session, the completer can boost Debug-category commands to the top of the list.

The `all()` method returns categories in a fixed display order. This matters more than you'd expect — users build muscle memory around help output layout, and reordering categories between releases breaks that mental model.

### The CommandContext

The `CommandContext` is the bridge between the command system and the rest of the agent. It carries everything a command might need:

```typescript
interface CommandContext {
  // Environment
  cwd: string;                    // Current working directory
  dataDir: string;                // Path to .rcode data directory
  projectInitialized: boolean;    // Whether /init has been run
  
  // LLM state
  currentModel: string;           // Active model identifier
  effortLevel: EffortLevel;       // Thinking budget tier
  fastMode: boolean;              // Low-latency mode
  thinkMode: boolean;             // Extended reasoning mode
  provider: string;               // "anthropic", "openai", etc.
  authenticated: boolean;         // Whether auth is valid
  
  // Session metrics
  sessionId: string;              // UUID v4
  sessionStart: Instant;          // When the session began
  turnCount: number;              // User-assistant turn count
  toolInvocations: number;        // Total tool calls this session
  
  // Token accounting
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  
  // Conversation state
  history: [string, string][];    // (role, content) pairs
  config: Map<string, string>;    // Effective config key-values
}
```

A critical design choice: `CommandContext` is **mutable**. Commands like `/clear` need to wipe the history. Commands like `/model` need to update the active model. Commands like `/effort` need to change the thinking budget. Making the context immutable would force every state-modifying command to return a new context, adding complexity without benefit — these operations are inherently sequential (the user types one command at a time).

The context also provides computed properties that prevent commands from duplicating arithmetic:

```typescript
// CommandContext methods
totalTokens(): number {
  return this.inputTokens + this.outputTokens;
}

cacheHitRate(): number {
  return this.inputTokens > 0 
    ? (this.cacheReadTokens / this.inputTokens) * 100.0 
    : 0.0;
}

avgTokensPerTurn(): number {
  return this.turnCount > 0 
    ? this.totalTokens() / this.turnCount 
    : 0;
}

estimatedCost(): number {
  return calculateCostFromContext(this);
}
```

These computed values are used by `/stats`, `/insights`, `/cost`, and the status bar. Centralizing them in the context ensures consistent numbers across every surface.

---

## 22.2 Registration and Routing

With 90+ commands, the registration system needs to be maintainable. You cannot have a 200-line `switch` statement routing input to handlers. The `CommandRegistry` solves this with a registration pattern that provides O(1) lookup by name or alias.

### The Registry Data Structure

```typescript
class CommandRegistry {
  private commands: Command[] = [];           // Registration order
  private nameIndex: Map<string, number>;     // Canonical name -> index
  private aliases: Map<string, string>;       // Alias -> canonical name
  
  register(cmd: Command): void {
    const name = cmd.name();
    const idx = this.commands.length;
    
    // Register aliases first
    for (const alias of cmd.aliases()) {
      this.aliases.set(alias, name);
    }
    
    this.nameIndex.set(name, idx);
    this.commands.push(cmd);
  }
  
  find(nameOrAlias: string): Command | undefined {
    const canonical = this.resolveAlias(nameOrAlias);
    const idx = this.nameIndex.get(canonical);
    return idx !== undefined ? this.commands[idx] : undefined;
  }
  
  resolveAlias(name: string): string {
    return this.aliases.get(name) ?? name;
  }
}
```

The dual-index approach — `nameIndex` for canonical names and `aliases` for alternative names — means lookup is always one or two hash lookups. No linear scans. This matters when the tab completion system is filtering 90+ commands on every keystroke.

### Registration at Startup

During bootstrap, the engine registers all commands in a deterministic order:

```typescript
function buildRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  
  // General
  registry.register(new HelpCommand());
  registry.register(new ClearCommand());
  registry.register(new ExitCommand());
  
  // Session
  registry.register(new ResumeCommand());
  registry.register(new ExportCommand());
  registry.register(new SessionsCommand());
  
  // Model
  registry.register(new ModelCommand());
  registry.register(new EffortCommand());
  registry.register(new FastCommand());
  registry.register(new ThinkCommand());
  
  // Context
  registry.register(new CompactCommand());
  registry.register(new ContextCommand());
  registry.register(new CtxVizCommand());
  registry.register(new TokensCommand());
  
  // Git
  registry.register(new CommitCommand());
  registry.register(new DiffCommand());
  registry.register(new BranchCommand());
  registry.register(new PrCommand());
  
  // Analysis
  registry.register(new InsightsCommand());
  registry.register(new StatsCommand());
  
  // Debug (hidden from /help but still routable)
  registry.register(new DebugToolCommand());
  registry.register(new CtxVizCommand());
  
  // ... 60+ more
  
  return registry;
}
```

Registration order matters for one reason: tab completion. When the user types `/c`, the completer iterates commands in registration order and returns the first matches. By registering common commands (clear, compact, config) before obscure ones (ctx-viz, color), you get better default completion behavior.

### Input Routing

The routing pipeline processes raw user input through several stages:

```
User types: "/model set claude-opus --verbose"
         │
         ▼
┌─────────────────────────────┐
│ 1. Strip leading whitespace │
│ 2. Strip "/" prefix         │
│ 3. Split on first space     │
│    name = "model"           │
│    rest = "set claude-opus  │
│           --verbose"        │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│ 4. Lowercase the name       │
│ 5. Resolve alias            │
│ 6. Look up in registry      │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│ 7. Tokenize args string     │
│ 8. Validate args            │
│ 9. Execute command           │
└─────────────────────────────┘
```

The implementation handles edge cases that matter in practice:

```typescript
async execute(input: string, ctx: CommandContext): Promise<string> {
  const trimmed = input.trim();
  const withoutSlash = trimmed.startsWith('/') 
    ? trimmed.slice(1) 
    : trimmed;
  
  // Split on first whitespace — command name can't contain spaces
  const spaceIdx = withoutSlash.search(/\s/);
  const name = spaceIdx >= 0 
    ? withoutSlash.slice(0, spaceIdx).toLowerCase()
    : withoutSlash.toLowerCase();
  const argsStr = spaceIdx >= 0 
    ? withoutSlash.slice(spaceIdx).trim() 
    : '';
  
  // Resolve alias before lookup
  const canonical = this.resolveAlias(name);
  const cmd = this.find(canonical);
  if (!cmd) {
    throw new CommandError(`Unknown command: /${name}. Type /help for available commands.`);
  }
  
  // Tokenize arguments
  const args = argsStr ? argsStr.split(/\s+/) : [];
  
  return cmd.execute(args, ctx);
}
```

Case insensitivity is applied to the command name but *not* to arguments. `/MODEL` resolves to `/model`, but `/model Claude-Opus` preserves the casing of "Claude-Opus" because model identifiers are case-sensitive.

---

## 22.3 Structured Output and Action Signaling

Some commands need to do more than return text. `/clear` needs to tell the UI to wipe the message display. `/model` needs to tell the engine to switch the active model. `/exit` needs to terminate the REPL loop. But the `Command` trait returns a simple string.

The solution is `CommandOutput` — a structured wrapper that carries both display content and metadata:

```typescript
interface CommandOutput {
  content: string;                    // Text to display
  isError: boolean;                   // Whether this is an error
  metadata: Map<string, string>;      // Action signals + arbitrary data
}
```

The metadata map carries action signals — key-value pairs that tell the caller what side effects to apply:

```typescript
// Static constructors for common patterns
CommandOutput.ok("Model switched to opus")
CommandOutput.error("Unknown model: gpt-6")
CommandOutput.action("clear", "Conversation cleared")
CommandOutput.action("switch_model", "Switched to claude-opus-4")

// The caller checks for actions
const output = await registry.execute(input, ctx);
const action = output.metadata.get("action");
if (action === "clear") {
  ui.clearMessages();
} else if (action === "switch_model") {
  engine.reloadModel(ctx.currentModel);
} else if (action === "exit") {
  process.exit(0);
}
```

This design keeps commands decoupled from the UI. A command never calls `ui.clearMessages()` directly — it signals intent through metadata, and the REPL or TUI interprets the signal. This means the same command implementations work across the terminal REPL, the Ink-based TUI, the headless API mode, and the bridge daemon.

---

## 22.4 The Argument Parser

Simple commands take no arguments or a single positional argument. But complex commands like `/insights cost /path/to/project --json` need a real parser. The argument system supports three kinds of arguments:

```typescript
interface ParsedArgs {
  raw: string;                             // Unparsed input
  positional: string[];                    // ["cost", "/path/to/project"]
  named: Map<string, string>;             // --key=value or --key value
  flags: Set<string>;                      // --json, --verbose
}
```

The parser handles quoted strings, which matters when file paths contain spaces:

```typescript
function parseArgs(raw: string): ParsedArgs {
  const tokens = tokenize(raw);     // Respects "quoted strings"
  const positional: string[] = [];
  const named = new Map<string, string>();
  const flags = new Set<string>();
  
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    
    if (tok.startsWith('--')) {
      const rest = tok.slice(2);
      const eqIdx = rest.indexOf('=');
      
      if (eqIdx >= 0) {
        // --key=value
        named.set(rest.slice(0, eqIdx), rest.slice(eqIdx + 1));
      } else if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
        // --key value (next token is the value)
        named.set(rest, tokens[i + 1]);
        i++;
      } else {
        // --flag (boolean flag)
        flags.add(rest);
      }
    } else {
      positional.push(tok);
    }
    i++;
  }
  
  return { raw, positional, named, flags };
}
```

The tokenizer is a state machine that tracks whether we're inside a quoted string:

```typescript
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote: string | null = null;
  
  for (const ch of input) {
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;    // Close quote — don't include quote char
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;        // Open quote — don't include quote char
    } else if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  
  if (current) tokens.push(current);
  return tokens;
}
```

`ParsedArgs` provides convenience accessors so command implementations stay clean:

```typescript
// In a command's execute() method:
const args = parseArgs(rawArgs);

const subcommand = args.subcommand();      // First positional arg
const path = args.positional(1);           // Second positional arg
const format = args.getOr("format", "text"); // Named arg with default
const verbose = args.flag("verbose");      // Boolean flag check
const rest = args.rest();                  // Everything after first positional
```

This approach scales well. The `/insights` command uses `subcommand()` to dispatch to analyzers. The `/plan` command uses `subcommand()` to dispatch to operations (new, add, done, next). File-oriented commands use `positional(1)` to get the target path.

---

## 22.5 Immediate vs. Queued Execution

Not all commands are created equal. Some execute instantly and return a result. Others need to be routed through the LLM query loop because they inject content into the conversation. This distinction creates two execution modes:

### Immediate Commands

Immediate commands execute synchronously (or with trivial async work) and return their result directly:

```
/clear          →  Wipe history, return confirmation
/model opus     →  Update ctx.currentModel, return confirmation
/effort high    →  Update ctx.effortLevel, return confirmation
/stats          →  Compute metrics from ctx, return formatted output
/exit           →  Signal termination
/help           →  Generate help text from registry
/version        →  Return version string
```

These commands never touch the LLM. They manipulate local state, compute derived values, or perform I/O (like `/export` writing a file). Their execution time is bounded — milliseconds, not seconds.

### Queued Commands

Queued commands inject content into the conversation and require an LLM turn to complete:

```
/plan "Build auth system"    →  Creates a plan + queues LLM to elaborate
/compact security            →  Triggers context compaction with LLM summarization
/simplify                    →  Loads changed code + queues LLM review
/batch "Update all endpoints"→  Spawns parallel agents via LLM
/btw "What does this regex?" →  Side conversation via LLM
```

The REPL handles this distinction at the event loop level:

```typescript
// In the REPL event loop
async handleEvent(event: ReplEvent): Promise<ReplAction> {
  if (event.type === 'Command') {
    const { name, args } = event;
    
    // Check if this is an immediate command
    if (isImmediateCommand(name)) {
      const output = await registry.execute(`/${name} ${args.join(' ')}`, ctx);
      this.displayOutput(output);
      return ReplAction.Continue;
    }
    
    // Queued command — inject into conversation
    return ReplAction.SendMessage(`/${name} ${args.join(' ')}`);
  }
}
```

The classification is determined by the command implementation. Immediate commands return their full result from `execute()`. Queued commands return a confirmation message from `execute()` and separately inject content into the conversation history that triggers an LLM turn.

This creates a clean UX pattern: immediate commands produce output instantly (no spinner, no streaming), while queued commands show the standard streaming response. Users quickly learn the difference — `/stats` shows numbers immediately, while `/plan` starts a streaming response.

### Hybrid Commands

Some commands exhibit both behaviors depending on arguments:

```
/model           →  Immediate: show current model
/model opus      →  Immediate: switch model, show confirmation
/model recommend →  Queued: ask LLM to recommend a model based on context
```

```
/compact         →  Queued: triggers LLM-based summarization
/compact --hard  →  Immediate: truncates history without LLM
```

The command decides which path to take inside its `execute()` method. If it needs the LLM, it returns a marker in the `CommandOutput` metadata that tells the REPL to queue rather than display.

---

## 22.6 Feature Gating and Conditional Availability

A production agent serves multiple audiences: external developers, internal teams, enterprise customers, and the developers building the agent itself. Each audience needs a different set of commands. The feature gating system controls which commands are available in each context.

### Compile-Time Feature Gates

Some commands should never be included in external builds. Debug-only commands like `/debug-tool` and internal analytics like `/insights` can be gated at compile time using feature flags:

```typescript
// In the registry builder
function buildRegistry(features: FeatureFlags): CommandRegistry {
  const registry = new CommandRegistry();
  
  // Always available
  registry.register(new HelpCommand());
  registry.register(new ClearCommand());
  registry.register(new ModelCommand());
  
  // Feature-gated
  if (features.has('mcp')) {
    registry.register(new McpCommand());
  }
  if (features.has('memory')) {
    registry.register(new MemoryCommand());
  }
  if (features.has('plugins')) {
    registry.register(new PluginCommand());
    registry.register(new ReloadPluginsCommand());
  }
  if (features.has('telemetry')) {
    registry.register(new InsightsCommand());
    registry.register(new StatsCommand());
  }
  if (features.has('tui')) {
    registry.register(new ThemeCommand());
    registry.register(new VimCommand());
  }
  if (features.has('web')) {
    // Web-related commands only when web tools are compiled in
    registry.register(new ShareCommand());
  }
  
  return registry;
}
```

As we discussed in Chapter 8, compile-time feature flags enable dead code elimination. When a feature is disabled, the bundler strips the entire command module — not just the registration call, but the implementation, its dependencies, and any transitive imports. For a command like `/insights` that pulls in a TOML parser, line counting, git analysis, and project type detection, this can save significant bundle size.

### The Hidden Flag

Commands that should be accessible but not discoverable use the `hidden()` flag:

```typescript
class DebugToolCommand implements Command {
  hidden(): boolean { return true; }
  
  // Still routable: /debug-tool works
  // But invisible in /help output and tab completion
}
```

Hidden commands are excluded from:
- `/help` listings (the `listByCategory()` method filters them)
- Tab completion (the `completions()` method skips them)
- Autocomplete UI (the typeahead system respects `hidden()`)

But they remain fully functional. If you know the name, you can invoke it. This is the right UX for diagnostic commands: power users who need `/debug-tool` already know it exists.

### Runtime Gating

Some commands are conditionally available based on runtime state:

```typescript
class CommitCommand implements Command {
  async execute(args: string[], ctx: CommandContext): Promise<string> {
    // Gate: requires git repository
    if (!ctx.cwd.join('.git').exists()) {
      return CommandOutput.error(
        "Not a git repository. Run 'git init' first."
      );
    }
    
    // Gate: requires authentication for signed commits
    if (args.includes('--sign') && !ctx.authenticated) {
      return CommandOutput.error(
        "Signed commits require authentication. Run /login first."
      );
    }
    
    // ... implementation
  }
}
```

Runtime gating happens inside `execute()`, not during registration. This means the command always appears in help and completion, but produces a clear error message when invoked in an unsupported context. This is better UX than silently hiding commands — users who see `/commit` in help but find it missing from their tab completion will think the tool is broken.

---

## 22.7 Deep Planning: The /plan Command

The `/plan` command is one of the most sophisticated commands in the system. It provides structured project planning with dependency tracking, priority management, topological ordering, and progress visualization. In the reference implementation, the planning subsystem spans over 900 lines — and that's before the LLM integration that turns natural-language requests into structured plans.

### The Plan Data Model

```typescript
interface PlanStep {
  id: string;                          // e.g., "s1", "setup", "auth-module"
  title: string;                       // Human-readable step name
  description: string;                 // Detailed description
  status: StepStatus;                  // Todo | InProgress | Done | Blocked | Skipped
  priority: Priority;                  // Critical | High | Medium | Low | Nice
  dependencies: string[];              // IDs of prerequisite steps
  subtasks: PlanStep[];               // Nested sub-steps
  notes: string[];                     // Running commentary
  assignee?: string;                   // Who's working on this
  estimate?: string;                   // Time estimate
  createdAt: Date;
  updatedAt: Date;
}

interface Plan {
  title: string;
  description: string;
  steps: PlanStep[];
  createdAt: Date;
  updatedAt: Date;
}
```

The `StepStatus` enum captures the full lifecycle of a plan step:

```typescript
enum StepStatus {
  Todo,                              // Not started
  InProgress,                        // Currently being worked on
  Done,                              // Completed successfully
  Blocked(reason: string),           // Waiting on external dependency
  Skipped(reason: string),           // Intentionally bypassed
}
```

Both `Done` and `Skipped` count as "complete" for dependency resolution — if step B depends on step A, B becomes actionable when A is either done or explicitly skipped. This matches how real project management works: sometimes you skip a step (e.g., "skip i18n for MVP") and downstream steps should still unblock.

### Dependency Resolution

The plan system uses topological sorting to determine execution order:

```typescript
topologicalOrder(): PlanStep[] {
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>();
  const stepMap = new Map<string, PlanStep>();
  
  // Build the dependency graph
  for (const step of this.steps) {
    stepMap.set(step.id, step);
    inDegree.set(step.id, inDegree.get(step.id) ?? 0);
    
    for (const dep of step.dependencies) {
      const edges = graph.get(dep) ?? [];
      edges.push(step.id);
      graph.set(dep, edges);
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
    }
  }
  
  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  
  const result: PlanStep[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const step = stepMap.get(id);
    if (step) result.push(step);
    
    for (const neighbor of graph.get(id) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }
  
  // Detect cycles
  if (result.length !== this.steps.length) {
    throw new Error("Circular dependency detected in plan");
  }
  
  return result;
}
```

This is standard Kahn's algorithm. The cycle detection is critical — without it, a circular dependency like A -> B -> A would silently produce a partial ordering, and the user would never understand why some steps never become actionable.

### The Next-Actionable Algorithm

The most-used operation is finding which steps the user should work on next:

```typescript
nextActionable(): PlanStep[] {
  const doneIds = new Set(
    this.steps
      .filter(s => s.status === 'Done' || s.status.startsWith('Skipped'))
      .map(s => s.id)
  );
  
  return this.steps
    .filter(s => s.status === 'Todo')
    .filter(s => s.dependencies.every(dep => doneIds.has(dep)));
}
```

This is the function that makes `/plan next` valuable. It automatically identifies steps whose prerequisites are satisfied, saving the user from manually tracking dependency chains.

### The Plan Manager

For projects that need multiple concurrent plans (e.g., one for the current sprint and one for the backlog), the `PlanManager` maintains a collection with an active plan pointer:

```typescript
class PlanManager {
  plans: Map<string, Plan>;
  activePlan: string | null;
  
  createPlan(id: string, title: string): void;
  deletePlan(id: string): void;
  setActive(id: string): void;
  active(): Plan;
  listPlans(): [string, Plan][];
}
```

### Command Dispatch

The `/plan` command uses subcommand dispatch — the first positional argument determines the operation:

```
/plan                    →  Show active plan status
/plan new sprint1 Sprint →  Create a new plan
/plan add setup Setup    →  Add a step to active plan
/plan done setup         →  Mark step as complete
/plan start auth         →  Mark step as in-progress
/plan block auth "Waiting for API keys"
/plan skip i18n "Defer to v2"
/plan next               →  Show next actionable steps
/plan export             →  Export plan as markdown
/plan list               →  List all plans
```

The dispatch table is a match expression that routes to specific operations:

```typescript
execute(manager: PlanManager, args: string[]): string {
  if (args.length === 0) return this.showActive(manager);
  
  switch (args[0]) {
    case 'new': case 'create':
      return this.createPlan(manager, args);
    case 'add': case 'step':
      return this.addStep(manager, args);
    case 'done': case 'complete':
      return this.markDone(manager, args);
    case 'start': case 'begin':
      return this.markInProgress(manager, args);
    case 'block':
      return this.markBlocked(manager, args);
    case 'skip':
      return this.markSkipped(manager, args);
    case 'next':
      return this.showNextActionable(manager);
    case 'export': case 'md':
      return this.exportMarkdown(manager);
    case 'list': case 'ls':
      return this.listPlans(manager);
    default:
      // Treat as shorthand plan creation
      return this.createPlan(manager, args);
  }
}
```

The default case is a nice ergonomic touch — if the user types `/plan Build the auth system`, it creates a plan with that title rather than returning an error. This aligns with the "just do it" philosophy we discussed in the auto-execute protocol.

### Progress Visualization

The plan status renders as a progress bar with counters:

```
[████████████░░░░░░░░] 60%  done=5 wip=2 blocked=1 skip=1 todo=1
```

And the full plan renders with checkbox-style indicators:

```
━━━ Plan: Sprint 1 ━━━
[████████████░░░░░░░░] 60%  done=5 wip=2 blocked=1 skip=1 todo=1

[x] HIGH s1: Database schema design
[-] CRITICAL s2: Authentication module
[ ] MEDIUM s3: API endpoints
    deps: s1, s2
[!] LOW s4: Documentation
    BLOCKED: Waiting for API finalization
[~] NICE s5: Dark mode support
    SKIPPED: Deferred to v2

Next:
  → s3 — API endpoints
```

Each status gets a distinct checkbox marker: `[x]` done, `[-]` in progress, `[ ]` todo, `[!]` blocked, `[~]` skipped. Priority gets a color marker. Dependencies and notes are indented below each step. The "Next" section at the bottom tells you exactly what to work on.

---

## 22.8 Internal Analytics: The /insights Command

The `/insights` command is the largest single command in the system. With nine subcommands — summary, code, session, project, deps, git, perf, security, and cost — it provides a comprehensive analytics dashboard for everything from line-of-code counts to API cost projections. In the reference implementation, the insights module spans over 2,300 lines including 80+ tests.

### Architecture

The insights system follows the analyzer pattern. Each subcommand maps to a dedicated analyzer class:

```
/insights              →  SummaryGenerator (combined overview)
/insights code         →  CodeAnalyzer (language breakdown, LOC, health)
/insights session      →  SessionAnalyzer (tokens, turns, cache rate)
/insights project      →  ProjectAnalyzer (config files, structure, health)
/insights deps         →  DependencyAnalyzer (Cargo.toml, package.json)
/insights git          →  GitAnalyzer (branch, authors, activity sparkline)
/insights perf         →  PerformanceAnalyzer (throughput, efficiency)
/insights security     →  SecurityAnalyzer (sensitive files, pattern scan)
/insights cost         →  CostAnalyzer (token economics, projections)
```

Dispatch is a simple match on the first argument:

```typescript
dispatchSubcommand(sub: string, path: string, ctx: CommandContext): string {
  switch (sub) {
    case 'code': case 'c':    return CodeAnalyzer.analyze(path);
    case 'session': case 's': return SessionAnalyzer.analyze(ctx);
    case 'project': case 'p': return ProjectAnalyzer.analyze(path);
    case 'deps': case 'd':   return DependencyAnalyzer.analyze(path);
    case 'git': case 'g':    return GitAnalyzer.analyze(path);
    case 'perf':              return PerformanceAnalyzer.analyze(ctx);
    case 'security': case 'sec': return SecurityAnalyzer.analyze(path);
    case 'cost': case '$':    return CostAnalyzer.analyze(ctx);
    case 'summary': case '':  return SummaryGenerator.generate(path, ctx);
    default: throw new Error(`Unknown subcommand: ${sub}`);
  }
}
```

Each subcommand gets a short alias (`c` for code, `s` for session, `$` for cost) for power users.

### The Code Analyzer

The code analyzer walks the project directory, counts lines by category (code, comment, blank), and produces a comprehensive report:

```typescript
class CodeAnalyzer {
  static analyze(path: string): string {
    const files = collectFileStats(path, 10_000);
    const report = new InsightReport("Code Analysis");
    
    // 1. Language breakdown table
    const byLang = groupByLanguage(files);
    report.section("Language Breakdown", formatTable(byLang));
    report.section("Lines of Code", formatBarChart(byLang));
    
    // 2. Summary statistics
    report.section("Summary", {
      "Total files": totalFiles,
      "Code files": codeFiles,
      "Total lines": totalLines,
      "Code lines": codeLines,
      "Comments": `${commentLines} (${commentRatio}%)`,
      "Code density": `${density}%`,
    });
    
    // 3. Top 10 largest files
    report.section("Top 10 Largest Files", formatTable(top10));
    
    // 4. Health check
    report.section("Health", healthCheck.render());
    
    return report.render();
  }
}
```

The line counting is language-aware — it uses each language's comment prefix to distinguish comments from code:

```typescript
function countLines(content: string, lang: Language): LineCount {
  const prefix = lang.commentPrefix();    // "//" for Rust, "#" for Python
  let code = 0, blank = 0, comment = 0, total = 0;
  
  for (const line of content.split('\n')) {
    total++;
    const trimmed = line.trim();
    if (trimmed === '') {
      blank++;
    } else if (prefix && trimmed.startsWith(prefix)) {
      comment++;
    } else {
      code++;
    }
  }
  
  return { code, blank, comment, total };
}
```

The language detection covers 18 languages from the file extension:

| Extension | Language | Comment Prefix |
|-----------|----------|---------------|
| `.rs` | Rust | `//` |
| `.py`, `.pyi` | Python | `#` |
| `.js`, `.mjs` | JavaScript | `//` |
| `.ts`, `.tsx` | TypeScript | `//` |
| `.go` | Go | `//` |
| `.c`, `.h` | C | `//` |
| `.sh`, `.bash` | Shell | `#` |
| `.lua` | Lua | `--` |
| `.sql` | SQL | `--` |
| `.html` | HTML | `<!--` |
| `.md` | Markdown | None |
| `.json` | JSON | None |
| `.yaml` | YAML | `#` |

### The Health Check System

Multiple analyzers use a shared `HealthCheck` abstraction — a list of scored dimensions that produce an aggregate grade:

```typescript
class HealthCheck {
  dimensions: HealthDimension[] = [];
  
  add(name: string, score: number, detail: string): void {
    this.dimensions.push({
      name,
      score: Math.max(0, Math.min(100, score)),   // Clamp 0-100
      detail,
    });
  }
  
  overallScore(): number {
    if (this.dimensions.length === 0) return 0;
    const sum = this.dimensions.reduce((s, d) => s + d.score, 0);
    return sum / this.dimensions.length;
  }
  
  render(): string {
    // Each dimension gets a bar chart line
    // Overall gets a letter grade: A+ (90+), A (80+), B (70+), ...
  }
}
```

The code analyzer evaluates three health dimensions:
- **Documentation**: Comment ratio. 15%+ = 90, 8%+ = 70, 3%+ = 50, below = 30.
- **File Size**: Average file length. <200 lines = 90, <500 = 70, <1000 = 50, above = 30.
- **Complexity**: Number of languages. 1-3 = 90, 4-6 = 70, 7-10 = 50, above = 30.

### The Cost Analyzer

The cost analyzer deserves special attention because it solves a problem every LLM-powered tool faces: helping users understand and predict their API costs.

```typescript
class CostAnalyzer {
  static analyze(ctx: CommandContext): string {
    const pricing = modelPricing(ctx.currentModel);
    const report = new InsightReport("Cost Analysis");
    
    // 1. Model pricing reference
    report.section("Model Pricing", {
      "Input": `$${pricing.inputPerM}/Mtok`,
      "Output": `$${pricing.outputPerM}/Mtok`,
      "Cache read": `$${pricing.cacheReadPerM}/Mtok`,
      "Cache write": `$${pricing.cacheWritePerM}/Mtok`,
    });
    
    // 2. Cost breakdown by category
    const inputCost = ctx.inputTokens * pricing.inputPerM / 1_000_000;
    const outputCost = ctx.outputTokens * pricing.outputPerM / 1_000_000;
    report.section("Cost Breakdown", formatTable(breakdown));
    
    // 3. Cache savings
    const wouldHaveCost = ctx.cacheReadTokens * pricing.inputPerM / 1_000_000;
    const actualCost = ctx.cacheReadTokens * pricing.cacheReadPerM / 1_000_000;
    const saved = wouldHaveCost - actualCost;
    report.section("Cache Savings", { saved });
    
    // 4. Projections
    const hourlyRate = cost / (elapsed / 3600);
    report.section("Projections", {
      "Hourly": formatCost(hourlyRate),
      "Daily (8h)": formatCost(hourlyRate * 8),
      "Monthly (160h)": formatCost(hourlyRate * 160),
    });
    
    return report.render();
  }
}
```

The cache savings calculation is particularly valuable. When a user sees "Saved: $2.40 from caching" in their cost report, it validates the prompt caching strategy we built in Chapter 5 and gives them concrete motivation to structure their prompts for cache-friendly prefixes.

### The InsightReport Builder

All analyzers share a common report builder that produces consistent formatting:

```typescript
class InsightReport {
  title: string;
  sections: ReportSection[] = [];
  
  section(title: string, body: string): void {
    this.sections.push({ title, body });
  }
  
  render(): string {
    const banner = `═══ ${this.title} ═══`;
    let output = banner + '\n';
    
    for (const section of this.sections) {
      output += `── ${section.title} ──\n`;
      output += section.body;
      if (!section.body.endsWith('\n')) output += '\n';
    }
    
    output += '═'.repeat(banner.length) + '\n';
    return output;
  }
}
```

The double-line borders (`═══`) for the report title and single-line borders (`──`) for sections create clear visual hierarchy in terminal output. Every analyzer uses this same builder, so users learn the format once and recognize it across all nine subcommands.

---

## 22.9 Command Lifecycle and Notifications

Commands don't operate in isolation. They participate in the agent's lifecycle through several integration points.

### Hook Integration

As we built in Chapters 18 and 19, the hook system fires events throughout the tool lifecycle. Commands integrate at two points:

1. **UserPromptSubmit**: Before a slash command is dispatched, the `UserPromptSubmit` hook fires with the raw input. Hooks can modify, block, or log the command.

2. **Notification**: After a long-running command completes, the `Notification` hook fires. On macOS, this pops a desktop notification via `osascript`:

```bash
osascript -e 'display notification "Plan completed: 8 steps" 
  with title "rcode"'
```

### Tab Completion Lifecycle

Tab completion is a per-keystroke operation that must complete in under 50ms to feel responsive. The flow:

```
User presses Tab
    │
    ▼
Parse current input position
    │
    ├── At start of input?  →  Show all non-hidden command names
    │
    ├── After "/"?          →  Filter commands by prefix
    │
    └── After command name? →  Delegate to command's completions()
```

The `completions()` method on each command provides context-aware suggestions:

```typescript
// /model command completions
completions(args: string[], position: number): string[] {
  return KNOWN_MODELS;    // List of all supported model IDs
}

// /effort command completions
completions(args: string[], position: number): string[] {
  return ["low", "medium", "high"];
}

// /insights command completions
completions(args: string[], position: number): string[] {
  if (position === 0) {
    return ["summary", "code", "session", "project", "deps", 
            "git", "perf", "security", "cost"];
  }
  // No completions for subsequent positions
  return [];
}
```

The registry's top-level completion method handles the prefix filtering:

```typescript
completions(prefix: string): string[] {
  const normalized = prefix.startsWith('/') ? prefix.slice(1) : prefix;
  
  return this.commands
    .filter(cmd => !cmd.hidden())
    .filter(cmd => cmd.name().startsWith(normalized))
    .map(cmd => `/${cmd.name()}`)
    .sort();
}
```

### Validation Pipeline

Before `execute()` is called, the registry runs the command's `validateArgs()`:

```typescript
// ClearCommand validation
validateArgs(args: string[]): void {
  for (const arg of args) {
    if (!['--keep-context', '--hard', '-k', '-h'].includes(arg)) {
      throw new Error(`Unknown flag '${arg}'. Use --keep-context or --hard.`);
    }
  }
}

// InsightsCommand validation
validateArgs(args: string[]): void {
  const valid = ['summary', 'code', 'session', 'project', 'deps', 
                 'git', 'perf', 'security', 'cost',
                 'c', 's', 'p', 'd', 'g', 'sec', '$'];
  if (args[0] && !valid.includes(args[0])) {
    throw new Error(`Unknown insights subcommand: ${args[0]}`);
  }
}
```

Validation runs before execution, so invalid commands fail fast with a clear error message. The alternative — catching errors inside `execute()` — would be fine for simple commands, but for commands that do setup work before checking arguments, it wastes effort.

---

## 22.10 Key Takeaways

The command system is the user's primary interface to the agent beyond natural language. Building it well means building it for scale, consistency, and discoverability.

**Design for 100 commands on day one.** Even if you start with 10, the architecture should support 100 without refactoring. The `Command` trait, `CommandRegistry`, and category system accomplish this. Each new command is a single struct implementing a single trait, registered with a single call. No routing tables to update, no switch statements to extend.

**The Command trait is the contract.** Every command implements the same interface — name, description, category, validation, completion, execution. This uniformity enables the registry to provide uniform help generation, tab completion, and validation without knowing anything about individual commands.

**Separate immediate from queued execution.** Commands that manipulate local state should execute instantly. Commands that need the LLM should be queued through the conversation loop. The REPL handles this distinction at the event loop level, giving users a consistent UX: instant feedback for state changes, streaming output for LLM operations.

**Structured output decouples commands from UI.** `CommandOutput` carries both display text and action metadata. Commands never call UI methods directly — they signal intent through metadata, and the REPL interprets the signals. This enables the same command implementations to work across terminal, TUI, headless, and remote modes.

**Feature gates control the surface area.** Compile-time feature flags exclude entire command modules from external builds. The `hidden()` flag makes commands accessible but not discoverable. Runtime gating in `execute()` handles context-dependent availability. Together, these three mechanisms ensure each user sees only the commands relevant to their context.

**Complex commands use subcommand dispatch.** `/plan` and `/insights` both route on the first positional argument to dedicated sub-handlers. This pattern scales better than adding 9 separate top-level commands (nobody wants `/insights-code`, `/insights-session`, `/insights-git`). It also enables the tab completion system to suggest subcommands after the command name.

**Health checks and report builders are reusable abstractions.** The `HealthCheck` class and `InsightReport` builder are used across multiple analyzers. When you build analytics commands, resist the temptation to hand-format each report — invest in a report builder that ensures consistent formatting, and a health check system that produces letter-grade summaries from scored dimensions.

In the next chapter, we'll shift from controlling the agent to remembering what it learns. Chapter 23 explores the memory architecture — how the agent persists knowledge across sessions using a file-based memory system with four memory types, a 25KB-capped index, and background extraction via dream tasks.
