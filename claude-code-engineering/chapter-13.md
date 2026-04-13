# Chapter 13: The Agent & Subagent Architecture

One of the most powerful capabilities of an AI-powered CLI tool is the ability to spawn copies of itself. When a task requires investigating multiple files, researching a topic while editing code, or running parallel workstreams, a single-threaded agent loop becomes a bottleneck. Claude Code solves this with a subagent system that can spawn specialized child agents — each with its own model, tools, permission mode, isolation level, and visual identity — while maintaining coordination through a peer-to-peer mailbox protocol.

The agent system spans thousands of lines across the `AgentTool`, `SendMessageTool`, and supporting infrastructure. It balances three competing concerns: **isolation** (worktrees and remote sandboxes prevent agents from stepping on each other), **efficiency** (fork subagents share parent context for prompt cache reuse), and **safety** (tiered tool restrictions prevent privilege escalation and recursive spawning).

---

## 13.1 Agent Definition and Discovery

### Custom Agent Loading

Users define custom agents as markdown files in `.claude/agents/`. The discovery system at `tools/AgentTool/loadAgentsDir.ts:296-392` searches three locations:

1. Current directory: `.claude/agents/*.md`
2. Project root: `<project>/.claude/agents/*.md`
3. User home: `~/.claude/agents/*.md`

Each markdown file is parsed for YAML frontmatter that defines the agent's capabilities:

```typescript
const AgentJsonSchema = z.object({
  description: z.string().min(1),
  tools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  prompt: z.string().min(1),
  model: z.string().optional(),            // opus/sonnet/haiku/inherit
  effort: z.union([z.enum(EFFORT_LEVELS), z.number()]).optional(),
  permissionMode: z.enum(PERMISSION_MODES).optional(),
  mcpServers: z.array(AgentMcpServerSpecSchema()).optional(),
  hooks: HooksSchema().optional(),
  maxTurns: z.number().int().positive().optional(),
  skills: z.array(z.string()).optional(),
  isolation: z.enum(['worktree']).optional(),
  memory: z.enum(['user', 'project', 'local']).optional(),
  background: z.boolean().optional(),
})
```

Note the `isolation` field: external users get only `'worktree'`, while Anthropic internal builds also include `'remote'` — a conditional enum that prevents external users from accessing the cloud compute backend.

### The Three-Variant Type System

Agent definitions aren't a single type — they're a discriminated union of three variants rooted in a shared `BaseAgentDefinition`:

```typescript
// Built-in agents - dynamic prompts, take toolUseContext
export type BuiltInAgentDefinition = BaseAgentDefinition & {
  source: 'built-in'
  getSystemPrompt: (params: {
    toolUseContext: Pick<ToolUseContext, 'options'>
  }) => string
}

// Custom agents from user/project/policy settings
export type CustomAgentDefinition = BaseAgentDefinition & {
  getSystemPrompt: () => string
  source: SettingSource
}

// Plugin agents - similar to custom but with plugin metadata
export type PluginAgentDefinition = BaseAgentDefinition & {
  getSystemPrompt: () => string
  source: 'plugin'
  plugin: string
}

export type AgentDefinition =
  | BuiltInAgentDefinition
  | CustomAgentDefinition
  | PluginAgentDefinition
```

The critical architectural difference: built-in agents take `toolUseContext` in their `getSystemPrompt()` function, enabling dynamic prompts that adapt to available tools. Custom and plugin agents close over their parsed markdown body at load time — they can't adapt to runtime context, but they're simpler to author.

### Agent Deduplication and Priority

When multiple sources define agents with the same `agentType`, the system applies last-write-wins deduplication at `getActiveAgentsFromList()`:

```typescript
const agentGroups = [
  builtInAgents, pluginAgents, userAgents,
  projectAgents, flagAgents, managedAgents,
]

const agentMap = new Map<string, AgentDefinition>()
for (const agents of agentGroups) {
  for (const agent of agents) {
    agentMap.set(agent.agentType, agent)
  }
}
```

Priority ordering: built-in < plugin < userSettings < projectSettings < flagSettings < policySettings (managed). The last group to set a key wins. This means an enterprise-managed agent definition always overrides a user-defined one with the same `agentType` — critical for compliance enforcement where organizations need to control what agents can do.

Source priority follows the settings cascade: built-in agents → plugin agents → user agents → project agents → CLI flag agents → managed agents (later sources override earlier ones). This means an enterprise can enforce specific agent configurations through managed settings that project-level definitions cannot override.

### The Built-In Agent Registry

Claude Code ships with several built-in agent types that are always available:

| Agent Type | Model | Specialty |
|-----------|-------|-----------|
| `general-purpose` | Sonnet | Default subagent for multi-step tasks |
| `Explore` | Sonnet | Codebase exploration, quick file/code search |
| `Plan` | Opus | Architecture and implementation planning |
| `code-reviewer` | Sonnet | Code quality, bugs, performance review |
| `security-reviewer` | Opus | Security vulnerability analysis |
| `debugger` | Opus | Root cause investigation |
| `researcher` | Sonnet | Web research and synthesis |
| `doc-writer` | Sonnet | Technical documentation |

Each built-in agent has carefully chosen defaults — security review gets Opus for depth and precision, while code review uses Sonnet for speed on larger diffs. These defaults can be overridden by the user's model parameter or by custom agent definitions that shadow the built-in name.

### Agent Definition Parsing

The parsing at `loadAgentsDir.ts:445-499` handles the full lifecycle of converting a markdown file into a functional agent definition:

```typescript
export function parseAgentFromJson(
  name: string, definition: unknown, source: SettingSource
) {
  const parsed = AgentJsonSchema().parse(definition)
  let tools = parseAgentToolsFromFrontmatter(parsed.tools)

  return {
    agentType: name,
    whenToUse: parsed.description,
    getSystemPrompt: () =>
      parsed.prompt + (parsed.memory
        ? loadAgentMemoryPrompt(name, parsed.memory) : ''),
    source,
    model: parsed.model,
    effort: parsed.effort,
    permissionMode: parsed.permissionMode,
    mcpServers: parsed.mcpServers,
    hooks: parsed.hooks,
    maxTurns: parsed.maxTurns,
    skills: parsed.skills,
    isolation: parsed.isolation,
    memory: parsed.memory,
    background: parsed.background,
    tools,
    disallowedTools: parsed.disallowedTools,
  }
}
```

The `getSystemPrompt` function is a lazy evaluator — the memory prompt is loaded at spawn time, not definition time. This ensures the agent gets the latest memory content rather than a stale snapshot from when the definition was parsed.

### Memory Auto-Injection

When an agent definition includes `memory: 'project'` (or 'user'/'local'), the parser automatically injects file operation tools into the agent's tool list:

```typescript
if (isAutoMemoryEnabled() && parsed.memory && tools) {
  tools = [...tools, FILE_WRITE_TOOL_NAME, FILE_EDIT_TOOL_NAME,
           FILE_READ_TOOL_NAME]
}
```

This ensures memory-enabled agents can read and write their memory files without the definition author needing to explicitly list file tools.

---

## 13.2 Agent Spawning Pipeline

The `AgentTool` at `tools/AgentTool/AgentTool.tsx` orchestrates agent selection, configuration, and launch. The spawning pipeline handles both synchronous (inline) and asynchronous (background) execution.

### Agent Selection

When the model calls the Agent tool, the system resolves the agent definition through a multi-step process at lines 239-417:

1. **Type matching**: The `subagent_type` parameter is matched against available agents (built-in + custom). If no type is specified, the default `general-purpose` agent is selected.
2. **MCP server resolution**: Required MCP servers are checked — if the agent definition specifies `mcpServers`, those servers are initialized or reused from the parent session before the agent launches.
3. **Isolation determination**: The effective isolation mode is resolved from (in priority order): tool parameter → agent definition → default (none).
4. **Color assignment**: The agent type gets a color from the palette if it doesn't already have one assigned.
5. **System prompt assembly**: The agent's system prompt is built from the definition's `prompt` field, memory prompt (if enabled), and any skill injections.
6. **Permission mode**: The agent's permission mode is determined — `dontAsk` for most subagents (they shouldn't prompt the user), but can be overridden by the agent definition.

The selection process also validates that the agent's required tools are available. If an agent definition requests a tool that doesn't exist (perhaps because an MCP server isn't configured), the tool is silently omitted rather than failing the entire spawn — a resilience pattern that lets agents degrade gracefully when optional tools are unavailable.

### Model Resolution Cascade

Agent model selection follows a multi-level cascade at `runAgent.ts:340`:

```typescript
const resolvedAgentModel = getAgentModel(
  agentDefinition.model,                // Agent frontmatter
  toolUseContext.options.mainLoopModel,  // Parent's model
  model,                                // Tool param override
  permissionMode
)
```

The resolution order:
1. If the tool call specifies a `model` parameter → use it (highest priority)
2. Else if the agent definition specifies a model → use it
3. Else if the agent definition says `'inherit'` → use parent's model
4. Else default to `getDefaultSubagentModel()` (Sonnet)

Fork subagents are a special case — they always use the parent's exact model to maximize prompt cache hit rates. As discussed in Chapter 5, prompt cache misses on 50-70K token conversations waste significant API budget.

---

## 13.3 The runAgent Execution Engine

The core execution function at `tools/AgentTool/runAgent.ts:248` is the async generator that drives the agent's lifecycle:

```typescript
export async function* runAgent({
  agentDefinition,
  promptMessages,
  toolUseContext,
  isAsync,
  model,
  isolation,
  worktreePath,
  description,
  // ... 20+ params
}): AsyncGenerator<Message, void>
```

### Message Forking for Cache Safety

At lines 370-398, the function prepares the message history for the subagent. This isn't a simple copy — it filters out incomplete tool calls and ensures the message sequence is valid for a new API conversation:

```typescript
// Filter messages for cache-safe context sharing
const forkedMessages = forkMessagesForSubagent(
  promptMessages,
  { filterIncompleteToolCalls: true }
)
```

This is critical for fork subagents that share their parent's conversation context. An incomplete tool call in the parent's history would cause an API validation error in the child.

### Context Optimization

At lines 385-410, the engine makes cost-saving decisions about what context the subagent actually needs:

**CLAUDE.md Omission**: Read-only agents (Explore, Plan) skip CLAUDE.md to save tokens:

```typescript
const shouldOmitClaudeMd =
  agentDefinition.omitClaudeMd &&
  !override?.userContext &&
  getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_slim_subagent_claudemd', true
  )
```

This optimization saves ~5-15 Gtok/week across 34M+ Explore spawns. The reasoning: the parent agent already has full CLAUDE.md context, so read-only subagents that just search files or plan architectures don't need the project-specific rules repeated. They inherit the behavioral patterns implicitly through the parent's prompt.

**Git Status Omission**: Explore and Plan agents also skip `gitStatus` from system context. The git status snapshot is stale from session start, and these agents can run `git status` themselves if they need current data. Removing it saves ~500-2K tokens per spawn.

### Tool Assembly

At lines 500-664, `resolveAgentTools()` builds the agent's tool pool. The resolution considers:

- **Agent definition tools**: The frontmatter `tools` array (or wildcard `'*'` for all tools)
- **Disallowed tools**: Both the global disallowed set and per-agent exclusions
- **Async restrictions**: Background agents get a limited tool set
- **MCP tools**: Always included regardless of filtering

```typescript
export function filterToolsForAgent({
  tools, isBuiltIn, isAsync, permissionMode
}): Tools {
  return tools.filter(tool => {
    if (tool.name.startsWith('mcp__')) return true
    if (ALL_AGENT_DISALLOWED_TOOLS.has(tool.name)) return false
    if (!isBuiltIn && CUSTOM_AGENT_DISALLOWED_TOOLS.has(tool.name))
      return false
    if (isAsync && !ASYNC_AGENT_ALLOWED_TOOLS.has(tool.name)) return false
    return true
  })
}
```

### The Agent Query Loop

At lines 748-806, the agent enters its own `query()` loop — the same async generator architecture described in Chapter 4. Each message from the agent is yielded upstream to the parent, with sidechain transcript recording for debugging:

```typescript
for await (const message of query(agentQueryParams)) {
  recordSidechainTranscript(message)
  yield message
}
```

The agent's query params include several important overrides:
- **`maxTurns`**: From the agent definition (default varies by type). Prevents runaway agents from consuming unlimited API calls.
- **`permissionMode`**: Typically `dontAsk` so the agent doesn't prompt users mid-execution.
- **`effortLevel`**: From the agent definition, controlling reasoning depth.
- **`mainLoopModel`**: The resolved model from the cascade described above.
- **`parentAgentId`**: Creates a lineage chain for debugging multi-level agent hierarchies.

The sidechain transcript records every message the agent sends and receives, written to a temporary file. This is invaluable for debugging — when an agent produces unexpected results, the transcript reveals its reasoning chain, the tool calls it made, and the results it received.

### Abort Controller Strategy

The choice of abort controller at lines 520-528 has significant implications:

```typescript
const agentAbortController = override?.abortController
  ? override.abortController
  : isAsync
    ? new AbortController()       // Async: independent lifecycle
    : toolUseContext.abortController  // Sync: shares parent's
```

Async agents get their own `AbortController` so they can be killed independently via `TaskStop` (Chapter 14). Sync agents share the parent's controller so cancelling the parent automatically cancels all sync children — a cascade that prevents orphaned sub-computations when the user presses Esc.

### Permission Mode Cascade

Agent permission modes follow a strict cascade at lines 412-498:

```typescript
if (
  agentPermissionMode &&
  state.toolPermissionContext.mode !== 'bypassPermissions' &&
  state.toolPermissionContext.mode !== 'acceptEdits' &&
  !(feature('TRANSCRIPT_CLASSIFIER') &&
    state.toolPermissionContext.mode === 'auto')
) {
  toolPermissionContext = {
    ...toolPermissionContext,
    mode: agentPermissionMode,
  }
}
```

The key rule: parent modes `bypassPermissions`, `acceptEdits`, and `auto` always take precedence over an agent's own `permissionMode`. This prevents agents from downgrading security — if the parent runs in auto mode with its classifier, the subagent inherits that protection regardless of what its definition says.

Background agents have an additional constraint: they can't show permission prompts to the user (who may be doing other work), so they default to `dontAsk` mode unless their permission mode is `bubble` — a special mode that surfaces prompts to the parent's terminal.

### MCP Server Initialization

At lines 649-657, agents that specify `mcpServers` in their definition get their own MCP server instances:

```typescript
const { newClients, sharedClients } = await initializeAgentMcpServers(
  agentDefinition.mcpServers,
  existingMcpClients
)
```

The system distinguishes between newly-created and shared MCP clients. Shared clients (already running from the parent's session) are reused to avoid redundant server startups. Only newly-created clients are terminated during agent cleanup — shared ones persist for the parent and other agents to use.

This distinction prevents a common class of bugs in multi-agent systems: one agent's cleanup killing a resource that another agent depends on. By tracking ownership explicitly, the system ensures clean teardown without resource leaks.

### Cleanup

At lines 817-858, agent cleanup handles multiple resource types:
- **MCP servers**: Disconnect newly-created servers (shared servers stay alive)
- **Hooks**: Deregister frontmatter hooks registered at spawn time (as described in Chapter 10)
- **File state**: Clear file tracking and checkpoint state
- **Bash tasks**: Terminate any shell processes the agent started
- **Perfetto tracing**: Flush performance traces for debugging

---

## 13.4 Isolation Modes

### Worktree Isolation

When an agent runs with `isolation: 'worktree'`, Claude Code creates a temporary git worktree at spawn time (`AgentTool.tsx:590-685`):

```typescript
if (effectiveIsolation === 'worktree') {
  const slug = `agent-${earlyAgentId.slice(0, 8)}`
  worktreeInfo = await createAgentWorktree(slug)
}
```

The worktree gives the agent its own copy of the repository, allowing it to make changes without affecting the parent's working directory. This is essential for parallel editing — two agents modifying the same file in the main working tree would create conflicts.

Cleanup logic at lines 644-685 is nuanced:
- **Hook-based worktrees**: Always kept (the system can't reliably detect whether changes are meaningful)
- **VCS-tracked worktrees**: Removed if no commits were made (via `hasWorktreeChanges()`)
- **Changed worktrees**: Kept for user inspection, with the worktree path and branch name returned in the result

### CWD Override

Worktree agents run with a `cwd` override that transparently redirects all file operations:

```typescript
const cwdOverridePath = cwd ?? worktreeInfo?.worktreePath
const wrapWithCwd = <T,>(fn: () => T): T =>
  cwdOverridePath ? runWithCwdOverride(cwdOverridePath, fn) : fn()
```

This means the agent's `Read`, `Write`, `Edit`, `Bash`, and `Glob` tools all operate relative to the worktree — the agent doesn't need to know it's in an isolated copy.

### In-Process Agents

The default mode runs agents in-process with no isolation. The agent shares the parent's working directory, file system state, and git repository. This is suitable for read-only agents (research, code review) or agents that make non-conflicting changes.

In-process agents have an important advantage: they can share the parent's MCP server connections and bash process pool, avoiding the startup cost of initializing these resources. For short-lived agents (a quick code review or a file search), this overhead savings can be significant — MCP server initialization alone can take several seconds.

The tradeoff is clear: in-process agents are faster to spawn but riskier for parallel writes. Worktree agents are safer but slower to initialize. The system lets the agent definition author or the calling model make this choice based on the task requirements.

### Remote Agents

For the highest level of isolation, the system supports remote agent execution via cloud compute sessions. Remote agents run in completely separate processes, potentially on different machines:

```typescript
if (effectiveIsolation === 'remote') {
  const session = await teleportToRemote({...})
  const result = registerRemoteAgentTask({...})
}
```

Remote agents are always asynchronous (they run in separate processes) and return a session URL for monitoring. This mode is primarily used in enterprise deployments where agents need access to specific compute resources or network environments.

---

## 13.5 The Tool Restriction Hierarchy

Agent tool access follows a strict tiered model:

### Globally Disallowed Tools

Every agent, regardless of type, is denied access to:

```typescript
export const ALL_AGENT_DISALLOWED_TOOLS = new Set([
  TASK_OUTPUT_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  ASK_USER_QUESTION_TOOL_NAME,
  TASK_STOP_TOOL_NAME,
  WORKFLOW_TOOL_NAME,  // Prevents recursive workflows
])
```

The `AgentTool` itself is disallowed by default (preventing recursive agent spawning), though this restriction is lifted for internal Anthropic builds where multi-level agent hierarchies are tested.

### Custom Agent Restrictions

Custom agents (defined in `.claude/agents/`) face additional restrictions beyond the global set. This prevents user-defined agents from accessing internal tools that could destabilize the system.

### Async Agent Allowlist

Background agents operate on an explicit allowlist rather than a denylist:

```typescript
export const ASYNC_AGENT_ALLOWED_TOOLS = new Set([
  FILE_READ_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  GREP_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  GLOB_TOOL_NAME,
  ...SHELL_TOOL_NAMES,
  FILE_EDIT_TOOL_NAME,
  FILE_WRITE_TOOL_NAME,
  NOTEBOOK_EDIT_TOOL_NAME,
])
```

MCP tools bypass all filtering (`tool.name.startsWith('mcp__')` always returns true), ensuring that server-provided tools remain accessible regardless of agent restrictions.

### In-Process Teammate Exception

Despite being async agents, in-process teammates (the swarm system described in later chapters) get special treatment:

```typescript
if (isAsync && !ASYNC_AGENT_ALLOWED_TOOLS.has(tool.name)) {
  if (isAgentSwarmsEnabled() && isInProcessTeammate()) {
    if (toolMatchesName(tool, AGENT_TOOL_NAME)) return true
    if (IN_PROCESS_TEAMMATE_ALLOWED_TOOLS.has(tool.name)) return true
  }
  return false
}
```

In-process teammates can spawn sync subagents (they need the Agent tool to delegate sub-tasks) and use task coordination tools (TaskCreate, TaskUpdate, etc.) that regular async agents cannot access. This exception recognizes that teammates are semi-trusted — they were spawned by a coordinator agent that the user explicitly authorized, and they need full coordination capabilities to function as team members.

### Permission Rule Scoping

When an agent defines `allowedTools`, those rules replace ALL session-level allow rules:

```typescript
if (allowedTools !== undefined) {
  toolPermissionContext = {
    ...toolPermissionContext,
    alwaysAllowRules: {
      cliArg: state.toolPermissionContext.alwaysAllowRules.cliArg,
      session: [...allowedTools],
    },
  }
}
```

CLI argument rules (`--allowedTools` from the SDK) are preserved — they represent the host application's security policy. But session-level approvals don't leak through. If the user approved `Bash(git *)` for the parent, the subagent doesn't inherit that approval. Each agent starts with a clean permission slate, and must earn or be granted its own approvals. This prevents privilege escalation through agent chains.

---

## 13.6 Background Agent Lifecycle

### Detection

An agent runs in the background when any of these conditions hold (`AgentTool.tsx:567`):

```typescript
const shouldRunAsync = (
  run_in_background === true ||        // Explicit parameter
  selectedAgent.background === true || // Agent definition
  isCoordinator ||                     // Coordinator mode
  forceAsync ||                        // Fork experiment gate
  assistantForceAsync                  // KAIROS assistant mode
) && !isBackgroundTasksDisabled
```

### Registration and Launch

Background agents are registered through the task system (`AgentTool.tsx:688-698`):

```typescript
const agentBackgroundTask = registerAsyncAgent({
  agentId: asyncAgentId,
  description,
  prompt,
  selectedAgent,
  setAppState: rootSetAppState,
  toolUseId: toolUseContext.toolUseId
})
```

The use of `rootSetAppState` (not the parent's no-op setter) is critical — background agents need to update the global application state for progress tracking and task list display.

### Lifecycle Execution

The full lifecycle wrapper handles worktree creation, agent execution, summarization, and cleanup:

```typescript
void runWithAgentContext(asyncAgentContext, () =>
  wrapWithCwd(() =>
    runAsyncAgentLifecycle({
      taskId: agentBackgroundTask.agentId,
      abortController: agentBackgroundTask.abortController!,
      makeStream: onCacheSafeParams => runAgent({...}),
      enableSummarization: isCoordinator || isForkSubagentEnabled(),
      getWorktreeResult: cleanupWorktreeIfNeeded
    })
  )
)
```

The `void` prefix is intentional — background agents are fire-and-forget from the parent's perspective. The parent continues its own work immediately while the child runs independently.

### Auto-Background Timer

An experimental feature at `AgentTool.tsx:72-77` automatically backgrounds agents that exceed a timeout:

```typescript
function getAutoBackgroundMs(): number {
  return isEnvTruthy(process.env.CLAUDE_AUTO_BACKGROUND_TASKS)
    || getFeatureValue_CACHED_MAY_BE_STALE(
         'tengu_auto_background_agents', false)
    ? 120_000 : 0  // 2 minutes
}
```

If an agent runs for more than 2 minutes, it's automatically promoted to a background task, freeing the parent to continue its work. This prevents long-running agents from blocking the interactive loop — a common frustration in single-threaded agent systems.

### The Async Agent Lifecycle

The full lifecycle at `runAsyncAgentLifecycle` manages the complete background agent execution:

1. **Start**: Register task, set status to `in_progress`
2. **Execute**: Stream through `runAgent()`, collecting messages
3. **Summarize**: If enabled (coordinator or fork mode), generate a summary of the agent's work using a fast model
4. **Report**: Write output to the task's output file for the parent to read
5. **Classify handoff**: In auto mode, the safety classifier reviews the agent's output before returning it to the parent
6. **Cleanup**: Terminate MCP servers, deregister hooks, optionally remove worktree
7. **Notify**: If the agent was launched with `asyncRewake`, enqueue a notification to wake the parent

The ordering here is critical: `completeAsyncAgent()` is called BEFORE `classifyHandoffIfNeeded()` and worktree cleanup. This ensures that `TaskOutput(block=true)` unblocks immediately even if the classifier or git operations hang — the parent can read the output while post-processing continues.

### Handoff Classification

In auto mode, the system classifies agent output before it reaches the parent:

```typescript
export async function classifyHandoffIfNeeded({
  agentMessages, tools, toolPermissionContext,
  abortSignal, subagentType, totalToolUseCount,
}): Promise<string | null> {
  if (feature('TRANSCRIPT_CLASSIFIER')) {
    if (toolPermissionContext.mode !== 'auto') return null
    const agentTranscript = buildTranscriptForClassifier(
      agentMessages, tools
    )
    const classifierResult = await classifyYoloAction(
      agentMessages, /* ... */
    )
    if (classifierResult.shouldBlock) {
      return classifierResult.unavailable
        ? 'Note: The safety classifier was unavailable...'
        : 'SECURITY WARNING: This sub-agent performed actions...'
    }
  }
  return null
}
```

When the classifier is unavailable (e.g., rate-limited), the system fails open — the output is allowed through with a warning. This is a deliberate availability-over-security tradeoff: blocking all agent output when the classifier is down would make the system unusable during classifier outages. The warning lets the user make their own risk assessment.

---

## 13.7 Cross-Agent Communication — The Mailbox Protocol

The `SendMessageTool` at `tools/SendMessageTool/SendMessageTool.ts` implements peer-to-peer messaging between agents. Unlike shared-memory coordination, the mailbox protocol keeps agents decoupled — each agent maintains its own mailbox, and messages are delivered asynchronously.

### Message Routing

At lines 741-873, message routing follows a hierarchy:

1. **In-process routing**: Check `appState.agentNameRegistry` for a running or stopped subagent by name
2. **Auto-resume**: If the target agent is stopped, call `resumeAgentBackground()` with the message injected as a prompt
3. **Team mailbox fallback**: For multi-process teams, write to `/tmp/.claude/teams/<teamName>/mailbox/<agentName>`

```typescript
async function handleMessage(
  recipientName: string,
  content: string,
  summary: string,
  context: ToolUseContext
): Promise<{ data: MessageOutput }>
```

### Structured Messages

Beyond free-text messages, the system supports a discriminated union of structured message types at lines 47-65:

- **`shutdown_request`** → `handleShutdownRequest()` (lines 268-303): A coordinator asks an agent to finish its current task, save its work, and shut down. The agent can comply immediately or negotiate for more time.
- **`shutdown_response`** → `handleShutdownApproval()` (lines 305-399): The agent acknowledges the shutdown, reporting what it completed and any remaining work.
- **`plan_approval_response`** → `handlePlanApproval()`/`handlePlanRejection()` (lines 434-518): Handling plan mode approval or rejection across agent boundaries, enabling a reviewer agent to approve or reject another agent's plan.

These structured messages enable workflow orchestration patterns. A coordinator agent can:
1. Spawn multiple worker agents with specific tasks
2. Monitor their progress via task output
3. Send shutdown requests when deadlines approach
4. Collect results and synthesize a final output

### Message Metadata

Every message carries metadata for attribution and debugging:

```typescript
{
  sender: string,       // Agent name
  senderColor: string,  // Agent's assigned color
  timestamp: number,    // Unix timestamp
  content: string,      // Message body
  summary: string,      // One-line summary for task output
}
```

The sender color is captured at send time, not resolved at receive time. This ensures consistent color attribution even if the sending agent has terminated by the time the receiving agent reads the message.

### Team Mailbox for Multi-Process Teams

When agents run across multiple processes (e.g., copilot CLI team mode), in-process routing fails. The fallback writes to the filesystem:

```
/tmp/.claude/teams/<teamName>/mailbox/<agentName>/
```

Each message is a JSON file with a sequential ID. The receiving agent polls its mailbox directory for new messages. This filesystem-based approach is deliberately simple — it avoids the need for a message broker or shared database, at the cost of higher latency (polling interval vs. immediate delivery).

The tradeoff is acceptable because team-based multi-agent workflows are inherently asynchronous — agents work for minutes on tasks, so a 1-second polling delay in message delivery is invisible. A message broker (Redis, RabbitMQ) would add operational complexity and a single point of failure. The filesystem is already there, already shared, and already durable.

---

## 13.8 Agent Color Management

Each agent type gets a unique color for visual differentiation in the terminal UI. The system at `tools/AgentTool/agentColorManager.ts` manages a palette of 8 colors:

```typescript
export const AGENT_COLORS = [
  'red', 'blue', 'green', 'yellow',
  'purple', 'orange', 'pink', 'cyan'
] as const
```

Colors are stored in `AppState.agentColorMap` and persist across turns. When a new agent type is spawned, it's assigned the next available color. The theme system (Chapter 12) maps these logical colors to actual terminal colors through `AGENT_COLOR_TO_THEME_COLOR`, with dedicated theme tokens like `red_FOR_SUBAGENTS_ONLY` to prevent collision with other UI elements.

General-purpose agents don't get a color assignment (they use the default theme), ensuring the color palette is reserved for specialized agents that the user needs to distinguish visually.

---

## 13.9 Fork Subagents — Cache-Efficient Children

Fork subagents are a specialized spawning mode optimized for prompt cache reuse. Instead of starting with a fresh conversation, a fork subagent inherits its parent's message history, allowing the API's prompt cache to cover the shared prefix.

Key differences from regular subagents:

1. **Model override ignored**: Fork children use the parent's exact model to maximize cache hit rates
2. **Message history shared**: The parent's conversation is forked (with incomplete tool calls filtered)
3. **Context alignment**: The forked child starts with the same cached context, avoiding the cache miss penalty on 50-70K+ token conversations

```typescript
model: isForkPath ? undefined : model  // Fork children inherit parent model
```

This optimization is significant. As discussed in Chapter 5, a prompt cache miss on a 100K-token conversation can cost several dollars. Fork subagents avoid this by starting from a cached prefix, paying only for the incremental tokens specific to their task.

### Fork Configuration

The fork agent definition reveals the cache-sharing design:

```typescript
export const FORK_AGENT = {
  agentType: FORK_SUBAGENT_TYPE,
  tools: ['*'],               // Parent's exact tool pool
  maxTurns: 200,
  model: 'inherit',           // Parent's model for cache parity
  permissionMode: 'bubble',   // Surface prompts to parent terminal
  getSystemPrompt: () => '',  // Intentionally empty
}
```

The empty `getSystemPrompt()` is intentional. The fork path passes `override.systemPrompt` with the parent's already-rendered system prompt bytes. Re-calling `getSystemPrompt()` could diverge (GrowthBook cold vs. warm state) and bust the prompt cache — even a single-byte difference in the system prompt changes the cache key.

### Recursive Fork Prevention

Fork subagents must not spawn their own forks — this would create an exponential explosion of agents:

```typescript
export function isInForkChild(messages: MessageType[]): boolean {
  return messages.some(m => {
    if (m.type !== 'user') return false
    const content = m.message.content
    if (!Array.isArray(content)) return false
    return content.some(
      block => block.type === 'text'
        && block.text.includes(`<${FORK_BOILERPLATE_TAG}>`)
    )
  })
}
```

The detection scans the message history for a sentinel tag injected when the fork was created. If found, fork spawning is disabled for this agent. This is a belt-and-suspenders approach — even if the feature gate logic fails, the message-history check prevents recursive forking.

---

## 13.10 Engineering Patterns

The agent system demonstrates several patterns applicable to any multi-agent architecture:

**Tiered tool restrictions**: Global deny → custom deny → async allowlist. Each level adds constraints without the ability to remove constraints from higher levels. This mirrors the permission system's deny-trumps-allow principle from Chapter 9. The MCP exemption (`tool.name.startsWith('mcp__')` always passes) is a pragmatic escape hatch — MCP tools are already sandboxed by their server processes.

**Fire-and-forget with task tracking**: Background agents are launched with `void` (no await), but their lifecycle is tracked through the task system. The parent gets a task ID for progress checking without blocking on the result. This pattern appears throughout distributed systems — RPC libraries call it "one-way messaging," and queue-based architectures call it "fire-and-forget with dead letter queue."

**Isolation through filesystem**: Worktrees provide process-level isolation without the overhead of containers or VMs. The `cwd` override makes isolation transparent to the agent's tools — no tool needs to know whether it's running in a worktree or the main working directory. This transparency principle is critical: if tools needed worktree awareness, every tool would need special-case code for isolation.

**Color as identity**: Assigning persistent colors to agent types creates visual coherence across the session. When users see blue-bordered output, they know it's from the security reviewer regardless of which specific instance produced it. The color persistence through `AppState.agentColorMap` ensures consistency even when agents are spawned, terminated, and re-spawned during a long session.

**Mailbox over shared state**: The SendMessage protocol keeps agents decoupled. No shared memory, no locks, no race conditions. Messages are immutable, timestamped, and attributed to their sender. The filesystem fallback for cross-process teams sacrifices latency for simplicity — a JSON file per message is far easier to debug than a message broker.

**Lazy system prompt evaluation**: Agent definitions store a `getSystemPrompt()` function, not a string. Memory prompts are loaded at spawn time, ensuring fresh content. This pattern prevents stale configuration — a memory updated between agent spawns is immediately visible to the next agent.

**Fork for cache efficiency**: Fork subagents inherit the parent's message history to hit prompt cache. The model override is disabled (`undefined`) to maintain cache key identity. This optimization is invisible to the agent's logic — it doesn't know it was forked — but saves significant API cost on large conversations. As discussed in Chapter 5, the savings on a 100K-token conversation can be several dollars per fork.

---

## Summary

The agent and subagent architecture transforms Claude Code from a single-threaded tool into a multi-agent platform. Custom agent definitions let users create specialized experts. Isolation modes prevent conflicts between parallel agents. The tool restriction hierarchy maintains safety without sacrificing capability. And the mailbox protocol enables coordination without coupling.

For engineers building multi-agent systems, the key insight is that agent isolation and coordination are separate concerns that deserve separate mechanisms. Worktrees handle isolation. Mailboxes handle coordination. The task system handles lifecycle tracking. By keeping these concerns orthogonal, the system avoids the complexity explosion that plagues monolithic multi-agent frameworks.

In Chapter 14, we examine the task management system that underlies background agent tracking — the tools, state machines, and persistence mechanisms that let users monitor and control parallel workstreams.
