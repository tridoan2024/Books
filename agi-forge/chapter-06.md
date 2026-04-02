# Chapter 6: The Orchestrator CLI --- The Brain

---

There is a question that separates a collection of tools from a system: *who decides what happens next?*

You have eight specialist CLIs. A security auditor that can tear apart a codebase for vulnerabilities. A backend engineer that can design and implement APIs. A DevOps agent that can wire up CI/CD pipelines. A QA validator that can generate test suites. Each one is excellent at its job. But excellence in isolation is not a system. Eight musicians warming up independently is not an orchestra.

The Orchestrator CLI is the conductor. It is the single component that transforms eight disconnected specialists into a coordinated team capable of executing complex, multi-phase projects. It never writes a line of application code. It never runs a test. It never deploys anything. What it does is think --- decompose problems, assign work, manage dependencies, handle failures, and synthesize results into a coherent whole.

This chapter is about building that brain.

---

## 6.1 Why You Need an Orchestrator

Consider what happens when a user says: *"Build me a REST API with JWT authentication, role-based access control, PostgreSQL persistence, and full test coverage."*

A single Claude Code session would attempt this sequentially. It would start with the database schema, then write the API routes, then add authentication middleware, then bolt on RBAC, then write tests. By the time it reaches testing, the context window has consumed 80,000 tokens of code, tool outputs, and intermediate reasoning. The model starts forgetting design decisions it made during the schema phase. Test assertions contradict the actual API responses because the context compactor summarized away the route definitions. The session degrades into a cycle of writing tests, running them, discovering they test a hallucinated API, rewriting them, running out of context, compacting, losing more information.

You've seen this failure mode. It's the single-context bottleneck from Chapter 1, manifested at scale.

Now consider the alternative. An Orchestrator CLI receives the same prompt. Within seconds, it has:

1. **Analyzed intent**: Backend-heavy project requiring database, API, auth, and testing expertise.
2. **Decomposed into sub-tasks**: Twelve discrete work units, from "Design database schema" to "Write integration tests for RBAC endpoints."
3. **Built a dependency graph**: Schema must precede models. Models must precede routes. Auth middleware must precede RBAC. Tests depend on all of the above.
4. **Dispatched to specialists**: Backend CLI gets database and API tasks. Security CLI gets authentication and RBAC. QA CLI gets test generation. DevOps CLI gets Docker and CI configuration.
5. **Managed parallel execution**: Independent tasks run simultaneously. Dependent tasks queue until prerequisites complete.
6. **Synthesized results**: Merged code from four specialists into a coherent, tested, deployable project.

The entire process runs faster than the single-session approach because independent work happens in parallel. The quality is higher because each specialist operates with a focused context window --- the Security CLI's entire 200,000-token budget is dedicated to authentication and access control, not split across twelve concerns. And failures are contained --- if the DevOps CLI crashes writing the Dockerfile, the API and tests are already complete and unaffected.

This is why you need an orchestrator. Not because individual CLIs are insufficient. Because complex tasks have structure --- dependencies, parallelism, specialization requirements --- and exploiting that structure requires a component whose sole job is to see the whole picture.

### The Three Things an Orchestrator Must Do

Every orchestrator, regardless of implementation, must perform three functions:

**Decomposition**: Transform an ambiguous natural-language prompt into a set of concrete, assignable tasks. This is the hardest part. "Build me a REST API" contains implicit requirements (error handling, input validation, logging) that must be made explicit. The orchestrator must understand the problem domain well enough to enumerate what's needed, even when the user doesn't specify it.

**Coordination**: Manage the execution order of those tasks. Some can run in parallel. Some have strict dependencies. Some may need to be re-executed if upstream tasks change. The orchestrator must build and maintain a dependency graph, dispatch work when prerequisites are met, and handle the inevitable failures and retries.

**Synthesis**: Merge the outputs of multiple specialists into a coherent result. This is more than concatenation. When the Backend CLI writes API routes and the Security CLI writes authentication middleware, someone needs to verify that the middleware is actually applied to the routes, that the JWT claims match the RBAC model, that the error responses are consistent. The orchestrator performs this integration, either by verifying directly or by dispatching a final validation pass to a QA specialist.

These three functions map directly to the components we'll build in this chapter: the Intent Analysis Engine (decomposition), the Task DAG Engine (coordination), and the Result Synthesis Pipeline (synthesis).

---

## 6.2 COORDINATOR_MODE --- The Restricted Brain

Claude Code ships with a feature that embodies the orchestrator pattern at the platform level: Coordinator Mode. Studying its implementation reveals fundamental design decisions about what an orchestrator should and should not be allowed to do.

### Activation

Coordinator Mode is dual-gated. A compile-time feature flag must be enabled, and a runtime environment variable must be set:

```typescript
// coordinator/coordinatorMode.ts
export function isCoordinatorMode(): boolean {
  if (feature('COORDINATOR_MODE')) {
    return isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)
  }
  return false
}
```

The dual gate is intentional. Feature flags control rollout across the user base. The environment variable lets individual sessions opt in. When you resume a session that was running in coordinator mode, the system flips the environment variable automatically via `matchSessionMode()` to maintain consistency across session boundaries.

### The Restricted Tool Set

Here is the most important design decision in the entire coordinator architecture: **the coordinator cannot use most tools**.

In regular mode, a Claude Code agent has access to forty-plus tools: file read, file write, bash execution, grep, glob, web search, notebook editing, git operations, and more. In Coordinator Mode, the main agent is restricted to exactly three:

```typescript
// The coordinator's entire toolkit:
AgentTool      // Spawn and dispatch workers
SendMessageTool // Continue communication with running workers  
TaskStopTool   // Kill a running worker
```

That's it. The coordinator cannot read files. It cannot write code. It cannot run bash commands. It cannot search the web. It cannot touch the filesystem at all.

Workers, meanwhile, get the full set:

```typescript
// constants/tools.ts
export const ASYNC_AGENT_ALLOWED_TOOLS = new Set([
  FILE_READ_TOOL_NAME,
  FILE_EDIT_TOOL_NAME,
  FILE_WRITE_TOOL_NAME,
  GREP_TOOL_NAME,
  GLOB_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  ...SHELL_TOOL_NAMES,        // Bash, Python, etc.
  NOTEBOOK_EDIT_TOOL_NAME,
  SKILL_TOOL_NAME,            // Project-specific skills
  SYNTHETIC_OUTPUT_TOOL_NAME,
  TOOL_SEARCH_TOOL_NAME,
  ENTER_WORKTREE_TOOL_NAME,   // Git worktree isolation
  EXIT_WORKTREE_TOOL_NAME,
])
```

And critically, workers are blocked from spawning their own agents. No `AgentTool` access. No `TaskStopTool`. No recursive delegation. The hierarchy is enforced structurally: the coordinator delegates down, workers execute and report up. No lateral delegation. No recursive spawning.

### Why Restriction Matters

The tool restriction is not a limitation. It is the single most important architectural constraint in the system.

Consider what happens without it. A coordinator with file-read access will read files to "understand the codebase better" before delegating. Now its context window fills with source code. It starts making implementation decisions that should belong to specialists. It becomes a bottleneck --- reading, analyzing, then delegating what it already half-decided. The specialist receives a task colored by the coordinator's incomplete analysis and produces work that satisfies the coordinator's biased framing rather than the actual requirement.

This is the **god-orchestrator anti-pattern**, and it is the most common failure mode in multi-agent systems. The coordinator tries to be omniscient. It reads everything, understands everything, micromanages everything. And in doing so, it reproduces the single-context bottleneck that the multi-agent architecture was designed to eliminate.

By removing file access from the coordinator, the architecture enforces a clean separation of concerns:

- **Coordinator**: Thinks strategically. Decomposes problems. Assigns work. Reads only worker reports, never raw source code.
- **Workers**: Execute tactically. Read files. Write code. Run tests. Report results.

The coordinator operates on abstractions --- task descriptions, dependency relationships, completion status, error summaries. Workers operate on concrete artifacts --- files, processes, test outputs. This separation keeps the coordinator's context window clean. A coordinator managing twelve tasks consumes perhaps 5,000 tokens of task metadata. A coordinator that also reads source files consumes 50,000 tokens before it delegates anything.

### The System Prompt

Coordinator Mode injects a specialized system prompt that defines the four-phase workflow:

```
Phase 1: RESEARCH
  → Spawn workers to investigate the codebase
  → Workers report file paths, structures, patterns

Phase 2: SYNTHESIS  
  → Coordinator reads worker findings
  → Crafts detailed implementation specifications
  → Every spec includes exact file paths, line numbers, changes

Phase 3: IMPLEMENTATION
  → Workers receive self-contained specs
  → Execute targeted changes
  → Commit and report

Phase 4: VERIFICATION
  → Workers run tests
  → Report pass/fail with details
```

The critical constraint in this workflow: **synthesis is always done by the coordinator**. Workers cannot see the conversation. Workers cannot see each other's work. Every follow-up message from the coordinator must be entirely self-contained --- specific file paths, line numbers, exact changes. No "based on your earlier findings." No "as we discussed." Each message to a worker is a complete, standalone specification.

This forces the coordinator to actually think. It cannot delegate lazily with "investigate and fix." It must understand the worker's findings well enough to write a concrete implementation spec. This synthesis step is where the orchestrator earns its role.

### Worker Context Injection

The coordinator dynamically tells workers what tools are available, adapting to the current environment:

```typescript
// coordinator/coordinatorMode.ts
export function getCoordinatorUserContext(
  mcpClients: ReadonlyArray<{ name: string }>,
  scratchpadDir?: string,
): { [k: string]: string } {
  let content = `Workers have access to these tools: ${workerTools}`

  if (mcpClients.length > 0) {
    const serverNames = mcpClients.map(c => c.name).join(', ')
    content += `\nWorkers also have MCP tools from: ${serverNames}`
  }

  if (scratchpadDir && isScratchpadGateEnabled()) {
    content += `\nScratchpad directory: ${scratchpadDir}`
    content += `\nWorkers can read/write here without permission prompts.`
  }

  return { workerToolsContext: content }
}
```

The scratchpad directory deserves attention. It's a shared filesystem location where workers can persist intermediate results that other workers --- or the coordinator in subsequent iterations --- can access. This is the coordinator's equivalent of a shared whiteboard. No context window tokens consumed. No message-passing overhead. Just files on disk.

---

## 6.3 The Intent Analysis Engine

When a user types "Build me a dashboard with real-time data," the orchestrator's first job is to understand what that means in terms of specialist assignments. This is intent analysis: parsing natural language into structured routing decisions.

### Pattern-Based Intent Detection

The SwarmForge implementation takes a deliberately simple approach. No LLM inference. No embedding similarity. Just keyword pattern matching:

```typescript
// intent-analyzer.ts

interface IntentResult {
  roles: string[];
  suggestedWorkers: number;
  projectType: 'web-app' | 'api' | 'cli' | 'library' | 'mobile';
}

const ROLE_PATTERNS: Record<string, string[]> = {
  frontend: [
    'react', 'vue', 'angular', 'next', 'dashboard', 'ui',
    'tailwind', 'component', 'form', 'chart', 'css', 'layout'
  ],
  backend: [
    'api', 'database', 'server', 'auth', 'graphql', 'postgres',
    'mongo', 'redis', 'webhook', 'rest', 'endpoint', 'middleware'
  ],
  devops: [
    'docker', 'ci/cd', 'kubernetes', 'vercel', 'aws', 'terraform',
    'pipeline', 'nginx', 'deploy', 'infrastructure'
  ],
  qa: [
    'test', 'qa', 'e2e', 'unit test', 'playwright', 'cypress',
    'jest', 'coverage', 'integration test', 'spec'
  ],
  security: [
    'security', 'audit', 'owasp', 'rbac', 'jwt', 'oauth',
    'encryption', 'cors', 'vulnerability', 'penetration'
  ],
};

export function analyzeIntent(prompt: string): IntentResult {
  const lower = prompt.toLowerCase();
  const matchedRoles = new Set<string>();

  for (const [role, keywords] of Object.entries(ROLE_PATTERNS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        matchedRoles.add(role);
        break;
      }
    }
  }

  // Supervisor is always included
  const roles = ['supervisor', ...matchedRoles];

  // Detect project type
  const projectType = detectProjectType(lower);

  return {
    roles,
    suggestedWorkers: matchedRoles.size,
    projectType,
  };
}

function detectProjectType(prompt: string): IntentResult['projectType'] {
  if (/\b(dashboard|spa|website|landing)\b/.test(prompt)) return 'web-app';
  if (/\b(api|rest|graphql|microservice)\b/.test(prompt)) return 'api';
  if (/\b(cli|command.?line|terminal)\b/.test(prompt)) return 'cli';
  if (/\b(library|package|sdk|module)\b/.test(prompt)) return 'library';
  if (/\b(mobile|ios|android|react.?native)\b/.test(prompt)) return 'mobile';
  return 'web-app'; // sensible default
}
```

Here's what this produces for our running example:

```typescript
analyzeIntent("Build me a REST API with JWT authentication, RBAC, PostgreSQL, and full test coverage")
// → {
//     roles: ['supervisor', 'backend', 'security', 'qa'],
//     suggestedWorkers: 3,
//     projectType: 'api'
//   }
```

Three specialists. No frontend (the prompt doesn't mention UI). DevOps would be added later if the orchestrator's planning phase determines deployment artifacts are needed.

### Why Not Use the LLM for Intent Analysis?

You could route the user's prompt through Claude with a structured output schema and get richer, more nuanced intent detection. Multi-hop reasoning. Implicit requirement inference. Contextual disambiguation.

The SwarmForge implementation deliberately avoids this, and the reasoning applies to any orchestrator you build: **intent analysis is on the critical path**. Every millisecond between the user pressing Enter and the first worker starting execution is latency the user feels. Pattern matching runs in microseconds. An LLM round-trip takes three to ten seconds. For the common case --- prompts that mention the technologies they need --- keyword matching is sufficient and instantaneous.

The fallback is simple: if pattern matching fails to identify any roles, the supervisor handles decomposition. The supervisor is an LLM-backed agent that receives the raw prompt and produces a structured plan. It's slower, but it's the backstop for ambiguous or novel requests.

This is a general principle for orchestrator design: **use heuristics for the fast path, models for the edge cases**. The two-stage pattern mirrors Claude Code's own permission system, which uses fast regex matching for obvious cases and falls back to model inference only when the heuristic is uncertain.

### Production Intent Analyzer

For a production system, you'd extend the basic pattern matcher with three additions:

**Confidence scoring**: Instead of binary match/no-match, score each role by the number and specificity of keyword hits. A prompt mentioning "React," "Tailwind," and "component library" scores higher for frontend than one that mentions only "dashboard."

**Implicit role inference**: Some combinations imply additional roles. Backend + security almost always needs DevOps (because auth systems need environment configuration). Frontend + backend always needs QA (because integration points need testing). Encode these implications as rules.

**Context accumulation**: In multi-turn interactions, the user might say "Build a REST API" in one message and "Oh, and add a React admin panel" in the next. The intent analyzer must accumulate roles across turns, not reset on each message.

```typescript
interface EnhancedIntentResult extends IntentResult {
  confidence: Record<string, number>;   // role → 0.0-1.0
  impliedRoles: string[];               // roles added by inference rules
  requiresLLMFallback: boolean;         // true if confidence too low
}

const IMPLICATION_RULES: Array<{
  condition: (roles: Set<string>) => boolean;
  implies: string;
  reason: string;
}> = [
  {
    condition: (roles) => roles.has('backend') && roles.has('security'),
    implies: 'devops',
    reason: 'Auth systems require environment configuration',
  },
  {
    condition: (roles) => roles.has('frontend') && roles.has('backend'),
    implies: 'qa',
    reason: 'Frontend-backend integration requires testing',
  },
  {
    condition: (roles) => roles.size >= 3,
    implies: 'devops',
    reason: 'Multi-component projects need CI/CD',
  },
];
```

---

## 6.4 The Task DAG Engine

Intent analysis tells you *who* should work on the problem. The Task DAG tells you *in what order*.

A DAG --- Directed Acyclic Graph --- is the natural data structure for task dependencies. Each node is a task. Each edge means "this task must complete before that task can start." The "acyclic" constraint means no circular dependencies: task A cannot depend on task B if task B depends on task A.

### Building the Graph

The SwarmForge implementation provides a clean reference for the Task DAG engine:

```typescript
// task-dag.ts

type TaskStatus = 'pending' | 'ready' | 'active' | 'complete' | 'failed';

interface DAGTask {
  id: string;
  role: string;           // Which specialist handles this
  description: string;    // What the task requires
  deps: string[];         // IDs of tasks this depends on
  status: TaskStatus;
  workerId?: string;      // Assigned worker (once active)
  result?: string;        // Output (once complete)
  retries: number;
}

export class TaskDAG {
  private tasks: Map<string, DAGTask> = new Map();

  constructor(taskDefs: Array<{
    id: string;
    role: string;
    description: string;
    deps: string[];
  }>) {
    // Register all tasks
    for (const def of taskDefs) {
      this.tasks.set(def.id, {
        ...def,
        status: 'pending',
        retries: 0,
      });
    }

    // Validate: all dependency references must point to existing tasks
    for (const task of this.tasks.values()) {
      for (const dep of task.deps) {
        if (!this.tasks.has(dep)) {
          throw new Error(
            `Task "${task.id}" depends on "${dep}" which does not exist`
          );
        }
      }
    }

    // Detect cycles (topological sort — Kahn's algorithm)
    this.detectCycles();

    // Mark tasks with no dependencies as ready
    for (const task of this.tasks.values()) {
      if (task.deps.length === 0) {
        task.status = 'ready';
      }
    }
  }

  private detectCycles(): void {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const task of this.tasks.values()) {
      inDegree.set(task.id, task.deps.length);
      for (const dep of task.deps) {
        const edges = adjacency.get(dep) || [];
        edges.push(task.id);
        adjacency.set(dep, edges);
      }
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    let visited = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      visited++;
      for (const neighbor of adjacency.get(current) || []) {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    if (visited !== this.tasks.size) {
      throw new Error(
        `Cycle detected in task dependencies. ` +
        `Visited ${visited} of ${this.tasks.size} tasks.`
      );
    }
  }

  /** Returns all tasks whose dependencies are satisfied */
  getReadyTasks(): DAGTask[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.status === 'ready'
    );
  }

  /** Mark a task as actively being worked on */
  markActive(taskId: string, workerId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'ready') {
      throw new Error(`Cannot activate task "${taskId}" — status is ${task?.status}`);
    }
    task.status = 'active';
    task.workerId = workerId;
  }

  /** Mark a task as complete and unblock dependents */
  markComplete(taskId: string, result?: string): string[] {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Unknown task: ${taskId}`);
    task.status = 'complete';
    task.result = result;

    // Find newly unblocked tasks
    const newlyReady: string[] = [];
    for (const candidate of this.tasks.values()) {
      if (candidate.status !== 'pending') continue;
      const allDepsMet = candidate.deps.every(
        (dep) => this.tasks.get(dep)?.status === 'complete'
      );
      if (allDepsMet) {
        candidate.status = 'ready';
        newlyReady.push(candidate.id);
      }
    }
    return newlyReady;
  }

  /** Mark a task as failed */
  markFailed(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Unknown task: ${taskId}`);
    task.status = 'failed';
  }

  /** Reset a failed task for retry */
  markRetry(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'failed') return;
    task.status = 'ready';
    task.retries++;
    task.workerId = undefined;
    task.result = undefined;
  }

  /** Check if all tasks are terminal (complete or failed) */
  isComplete(): boolean {
    return Array.from(this.tasks.values()).every(
      (t) => t.status === 'complete' || t.status === 'failed'
    );
  }

  /** Detect deadlock: nothing active, nothing ready, but not complete */
  isStuck(): boolean {
    const stats = this.getStats();
    return stats.active === 0 && stats.ready === 0 && !this.isComplete();
  }

  getStats(): Record<TaskStatus, number> {
    const stats: Record<string, number> = {
      pending: 0, ready: 0, active: 0, complete: 0, failed: 0,
    };
    for (const task of this.tasks.values()) {
      stats[task.status]++;
    }
    return stats as Record<TaskStatus, number>;
  }
}
```

### Wave-Based Execution

The DAG naturally produces execution "waves" --- groups of tasks that can run in parallel because they share no dependencies:

```
User prompt: "Build a REST API with JWT auth, RBAC, PostgreSQL, and test coverage"

Task Decomposition:
┌──────────────────────────────────────────────────────────────────┐
│ Wave 0 (no dependencies — start immediately)                     │
│                                                                  │
│  t1: Design DB schema         [backend]     deps: []             │
│  t2: Define API contract       [backend]     deps: []             │
│  t3: Set up project structure  [devops]      deps: []             │
└──────────────────────┬──────────────┬──────────────┬─────────────┘
                       ↓              ↓              ↓
┌──────────────────────────────────────────────────────────────────┐
│ Wave 1 (depends on Wave 0 tasks)                                 │
│                                                                  │
│  t4: Implement DB models       [backend]     deps: [t1, t3]      │
│  t5: Design JWT auth flow      [security]    deps: [t2]          │
│  t6: Define RBAC policy model  [security]    deps: [t2]          │
└──────────────────────┬──────────────┬──────────────┬─────────────┘
                       ↓              ↓              ↓
┌──────────────────────────────────────────────────────────────────┐
│ Wave 2 (depends on Wave 1 tasks)                                 │
│                                                                  │
│  t7: Implement API routes      [backend]     deps: [t4, t5]      │
│  t8: Implement auth middleware [security]    deps: [t5]          │
│  t9: Implement RBAC middleware [security]    deps: [t6, t4]      │
└──────────────────────┬──────────────┬──────────────┬─────────────┘
                       ↓              ↓              ↓
┌──────────────────────────────────────────────────────────────────┐
│ Wave 3 (integration and validation)                              │
│                                                                  │
│  t10: Wire middleware to routes [backend]    deps: [t7, t8, t9]  │
│  t11: Write unit tests          [qa]         deps: [t7, t8, t9]  │
└──────────────────────┬──────────────┬────────────────────────────┘
                       ↓              ↓
┌──────────────────────────────────────────────────────────────────┐
│ Wave 4 (final validation)                                        │
│                                                                  │
│  t12: Integration tests + E2E   [qa]         deps: [t10, t11]   │
└──────────────────────────────────────────────────────────────────┘
```

Twelve tasks. Five waves. In a sequential single-CLI execution, these would run one after another --- perhaps forty minutes of wall time. With the DAG, Waves 0 through 2 each have tasks that run in parallel. The critical path is five waves deep, but the actual execution time is dominated by the longest task in each wave, not the sum of all tasks.

The orchestrator's execution loop is straightforward:

```typescript
async function executeDAG(
  dag: TaskDAG,
  dispatch: (task: DAGTask) => Promise<string>,
  maxConcurrency: number
): Promise<void> {
  const semaphore = new Semaphore(maxConcurrency);

  while (!dag.isComplete()) {
    if (dag.isStuck()) {
      throw new Error(
        'DAG is stuck: no tasks are active or ready, but not all tasks are complete. ' +
        `Stats: ${JSON.stringify(dag.getStats())}`
      );
    }

    const readyTasks = dag.getReadyTasks();
    if (readyTasks.length === 0) {
      // All ready tasks are active; wait for one to complete
      await sleep(1000);
      continue;
    }

    // Launch all ready tasks (up to concurrency limit)
    const launches = readyTasks.map(async (task) => {
      await semaphore.acquire();
      dag.markActive(task.id, `worker-${task.id}`);

      try {
        const result = await dispatch(task);
        const newlyReady = dag.markComplete(task.id, result);

        if (newlyReady.length > 0) {
          console.log(`[DAG] Unblocked: ${newlyReady.join(', ')}`);
        }
      } catch (error) {
        dag.markFailed(task.id);
        console.error(`[DAG] Task ${task.id} failed: ${error}`);
      } finally {
        semaphore.release();
      }
    });

    // Don't await all — let them run and loop back to check for newly ready tasks
    await Promise.race([
      Promise.allSettled(launches),
      sleep(2000), // Re-check periodically
    ]);
  }
}
```

The `Promise.race` with a sleep timer is important. It allows the execution loop to re-check for newly ready tasks even while other tasks are still running. When task `t1` completes and unblocks `t4`, the loop doesn't wait for `t2` and `t3` to finish before launching `t4`. It detects the newly ready task on its next iteration and dispatches immediately.

### Concurrency Control

The semaphore prevents resource exhaustion. Each CLI worker is a separate process with its own memory, its own context window, its own API calls. Running twelve simultaneously would spike costs and potentially hit rate limits. The semaphore defaults to three or four concurrent workers --- enough for meaningful parallelism without overwhelming the system.

```typescript
class Semaphore {
  private current: number = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.current--;
    const next = this.queue.shift();
    if (next) {
      this.current++;
      next();
    }
  }
}
```

---

## 6.5 The Dispatch Protocol

The dispatch protocol is the full lifecycle of turning a user prompt into coordinated action. It connects the intent analyzer, the task DAG, and the specialist CLIs into a single pipeline.

### The Five Stages

```
┌──────────────────────────────────────────────────────────────────┐
│                    USER PROMPT                                    │
│  "Build a REST API with JWT auth, RBAC, PostgreSQL, test coverage" │
└────────────────────────────┬─────────────────────────────────────┘
                             ↓
┌────────────────────────────────────────────────────────────────────┐
│  STAGE 1: INTENT ANALYSIS                                          │
│  analyzeIntent(prompt) → { roles, projectType, suggestedWorkers }  │
│  Output: [supervisor, backend, security, qa] / api / 3 workers     │
└────────────────────────────┬───────────────────────────────────────┘
                             ↓
┌────────────────────────────────────────────────────────────────────┐
│  STAGE 2: PLANNING (Supervisor Agent)                              │
│  Supervisor receives raw prompt + intent analysis                   │
│  Produces: PRD.md → architecture.md → dev-plan.json                │
│  dev-plan.json contains: task list with IDs, roles, dependencies   │
└────────────────────────────┬───────────────────────────────────────┘
                             ↓
┌────────────────────────────────────────────────────────────────────┐
│  STAGE 3: DAG CONSTRUCTION                                         │
│  Parse dev-plan.json into TaskDAG                                  │
│  Validate dependencies, detect cycles                              │
│  Mark Wave 0 tasks as READY                                        │
└────────────────────────────┬───────────────────────────────────────┘
                             ↓
┌────────────────────────────────────────────────────────────────────┐
│  STAGE 4: PARALLEL EXECUTION                                       │
│  For each READY task:                                              │
│    1. Acquire semaphore slot                                       │
│    2. Create git worktree (isolation)                               │
│    3. Spawn headless CLI with agent role + task prompt              │
│    4. Monitor execution (health checks every 15s)                  │
│    5. On completion: merge branch, mark complete, unblock deps     │
│    6. On failure: retry once, then mark failed                     │
│  Loop until DAG.isComplete()                                       │
└────────────────────────────┬───────────────────────────────────────┘
                             ↓
┌────────────────────────────────────────────────────────────────────┐
│  STAGE 5: SYNTHESIS                                                │
│  Collect all worker artifacts                                      │
│  Run integration validation                                        │
│  Produce final report: what was built, what succeeded, what failed │
└────────────────────────────────────────────────────────────────────┘
```

### Stage 2: The Supervisor's Planning Phase

The supervisor is a special agent --- it's the first CLI the orchestrator spawns, and it runs with elevated context. It receives the raw user prompt plus the intent analysis results and produces three artifacts:

**PRD.md** --- A product requirements document that makes implicit requirements explicit. The user said "REST API with auth." The supervisor adds input validation, error handling, rate limiting, logging, and health check endpoints because those are implicit in any production API.

**architecture.md** --- Technical architecture decisions. PostgreSQL means we need a migration system. JWT means we need a token refresh flow. RBAC means we need a permission model.

**dev-plan.json** --- The machine-readable task list. This is the input to the DAG constructor:

```json
{
  "tasks": [
    {
      "id": "t1",
      "role": "backend",
      "task": "Design PostgreSQL schema: users table with id/email/password_hash/role, sessions table with id/user_id/token/expires_at. Use UUID primary keys. Write migration file.",
      "deps": []
    },
    {
      "id": "t2",
      "role": "backend",
      "task": "Define OpenAPI 3.0 contract for all endpoints: POST /auth/login, POST /auth/refresh, GET /users, GET /users/:id, PUT /users/:id, DELETE /users/:id. Include request/response schemas.",
      "deps": []
    },
    {
      "id": "t3",
      "role": "devops",
      "task": "Initialize project: package.json, tsconfig.json, Docker Compose for PostgreSQL, directory structure (src/routes, src/middleware, src/models, src/utils, tests/).",
      "deps": []
    },
    {
      "id": "t4",
      "role": "backend",
      "task": "Implement Drizzle ORM models matching the schema from t1. Include TypeScript types for User and Session entities.",
      "deps": ["t1", "t3"]
    },
    {
      "id": "t5",
      "role": "security",
      "task": "Implement JWT auth flow: login handler (bcrypt verify → sign access + refresh tokens), refresh handler (validate refresh → issue new pair), logout handler (invalidate session). RS256 signing.",
      "deps": ["t2"]
    }
  ]
}
```

Notice the specificity. Each task description is self-contained. Task `t5` doesn't say "implement auth." It specifies the exact handlers, the token flow, the signing algorithm. This specificity is what makes autonomous execution possible --- the Security CLI doesn't need to make architectural decisions, it needs to implement a concrete specification.

### Stage 4: Worker Isolation via Git Worktrees

When the orchestrator dispatches a task to a specialist CLI, it doesn't run the CLI in the main working directory. Each worker gets its own git worktree --- a separate checkout of the repository on its own branch:

```typescript
async function activateWorker(
  workerId: string,
  task: DAGTask,
  worktreeManager: WorktreeManager
): Promise<void> {
  // Create isolated branch and working directory
  const branch = `feature/${workerId}`;
  const worktreePath = await worktreeManager.create(workerId, branch);

  // Spawn headless CLI in the isolated worktree
  const { pid } = spawnHeadless({
    id: workerId,
    cwd: worktreePath,           // Isolated directory
    agent: task.role,            // e.g., 'backend-specialist'
    task: task.description,      // Self-contained task spec
    env: {
      SWARMFORGE: '1',
      SWARMFORGE_WORKER_ID: workerId,
    },
  });

  // On exit: merge branch back to main
  onTerminalExit(workerId, async (id, exitCode) => {
    if (exitCode === 0) {
      await worktreeManager.merge(workerId);
    }
  });
}
```

Worktree isolation solves three problems:

1. **No write conflicts**: Two workers can edit different files simultaneously without git conflicts. When they edit the *same* file (rare, if the DAG is well-constructed), the merge step detects conflicts and the orchestrator can dispatch a resolution task.

2. **Clean rollback**: If a worker fails, its branch is simply deleted. No partial changes pollute the main branch.

3. **Parallel git operations**: Each worktree has its own `.git` directory. Workers can commit, diff, and log without blocking each other.

### The Task Notification Protocol

When a worker completes or fails, the orchestrator receives a structured notification. Claude Code's implementation uses XML:

```xml
<task-notification>
  <task-id>worker-t5</task-id>
  <status>completed</status>
  <summary>Agent "Implement JWT auth" completed</summary>
  <result>
    Implemented JWT auth flow in src/middleware/auth.ts:
    - login: bcrypt verify → sign RS256 access (15min) + refresh (7d)
    - refresh: validate refresh token → issue new pair
    - logout: delete session from DB
    Files: src/middleware/auth.ts, src/routes/auth.ts, src/utils/jwt.ts
    Tests: 8 passing
  </result>
  <usage>
    <total_tokens>12847</total_tokens>
    <tool_uses>23</tool_uses>
    <duration_ms>45200</duration_ms>
  </usage>
  <worktree>
    <worktreePath>/project/.worktrees/worker-t5</worktreePath>
    <worktreeBranch>feature/worker-t5</worktreeBranch>
  </worktree>
</task-notification>
```

The notification includes usage metrics --- tokens consumed, tool calls made, wall time. This data feeds into the orchestrator's cost tracking and helps calibrate future task decomposition. If a "simple" task consistently consumes 50,000 tokens, the task descriptions need to be more precise.

---

## 6.6 The SwarmForge Supervisor Pattern

The claudecode_team project implements a richer variant of the supervisor pattern with five phases instead of four. The additional phases --- debate and quality gating --- are what separate a task dispatcher from a true orchestrator.

### Phase 1: Planning

The supervisor spawns a single-turn "planner" agent that receives the user's prompt and outputs a structured JSON plan:

```typescript
interface TeamPlan {
  analysis: string;                    // Supervisor's understanding of the task
  agents: Array<{
    id: string;                        // Unique identifier
    role: string;                      // Specialist type
    task: string;                      // Specific assignment
  }>;
  debate_rounds: number;              // How many debate cycles (0-3)
}
```

The debate round count is a planning decision. Simple tasks (formatting a file, fixing a typo) get zero debate rounds --- spawn, execute, synthesize. Complex tasks (designing a system architecture, performing a security audit) get two or three rounds, because multiple perspectives need to converge.

### Phase 2: Spawning

All agents launch simultaneously:

```typescript
const agentPromises = plan.agents.map((agentDef) =>
  agentManager.spawnAgent({
    id: agentDef.id,
    role: agentDef.role,
    task: agentDef.task,
    systemPrompt: buildRolePrompt(agentDef.role),
    workingDir: projectDir,
    model: 'claude-opus-4.6',
    maxTurns: 15,
  })
);

const agents = await Promise.all(agentPromises);
```

Each agent runs as a separate `claude` CLI process, spawned via `node-pty` with role-specific system prompts. The agent manager tracks the full lifecycle: spawned → running → complete/failed, with hang detection (30-second timeout after result message) and output streaming via WebSocket.

### Phase 3: Debate

This is where the multi-agent pattern earns its value. Each agent has produced findings from its specialized perspective. The security agent found three vulnerabilities. The backend agent proposed an API structure. The architect agent identified a scalability concern. These findings may conflict.

The debate phase gives agents visibility into each other's work:

```typescript
async function runDebateRound(
  agents: Agent[],
  round: number,
  sharedMemory: SharedMemory
): Promise<void> {
  for (const agent of agents) {
    // Each agent reads all other agents' findings
    const otherFindings = agents
      .filter(a => a.id !== agent.id)
      .map(a => ({
        role: a.role,
        findings: sharedMemory.readAgentFindings(a.id),
      }));

    const debatePrompt = `
Round ${round} of debate. Review these findings from your colleagues:

${otherFindings.map(f => `### ${f.role}\n${f.findings}`).join('\n\n')}

Respond with:
1. Points of agreement
2. Points of disagreement (with specific reasoning)
3. New insights that emerge from combining perspectives
4. Your updated recommendation

Write your response to: ${sharedMemory.getDebatePath(agent.id, round)}
    `;

    await agentManager.sendMessage(agent.id, debatePrompt);
  }
}
```

The shared memory filesystem is critical here. Agent findings are not passed through message fields (which truncate at token limits). They're written to disk:

```
.team_context/session_{id}/
├── blackboard.md                 # Supervisor's instructions
├── agents/
│   ├── agent-security/
│   │   ├── findings.md           # Full security analysis
│   │   ├── debate_1.md           # Round 1 response
│   │   └── debate_2.md           # Round 2 response
│   ├── agent-backend/
│   │   ├── findings.md           # Full API design
│   │   └── debate_1.md
│   └── agent-architect/
│       ├── findings.md           # Full architecture review
│       └── debate_1.md
└── synthesis/
    ├── draft.md                  # Combined output
    └── quality.json              # Quality gate verdict
```

Each agent reads the complete, untruncated findings of every other agent. This is zero-truncation knowledge sharing. No context window limits on inter-agent communication because the communication medium is the filesystem, not the prompt.

### Phase 4: Synthesis

The supervisor reads all findings and debate responses, then spawns a single-turn "synthesizer" agent:

```typescript
const allFindings = agents.map(agent => {
  const findings = sharedMemory.readAgentFindings(agent.id) || '(none)';
  const debates = Array.from({ length: debateRounds }, (_, i) =>
    sharedMemory.readAgentDebate(agent.id, i + 1) || ''
  ).filter(Boolean);

  return `### ${agent.role}\n\n${findings}\n\n${debates.join('\n\n')}`;
}).join('\n\n---\n\n');

const synthesisPrompt = `
Original request: ${userPrompt}

Agent findings and debate responses:
${allFindings}

Synthesize these into a cohesive response. Resolve conflicts.
Prioritize security concerns over convenience.
Include specific action items with file paths and line numbers.
`;
```

The synthesis output becomes the final deliverable: an integration header (executive summary) followed by the full, verbatim agent reports.

### Phase 5: Quality Gate

The final phase is what prevents the orchestrator from delivering mediocre work. A "quality assessor" agent receives the synthesis and scores it:

```typescript
interface QualityVerdict {
  score: number;          // 1-10
  feedback: string;       // What's wrong
  issues: string[];       // Specific problems
  verdict: 'pass' | 'refine';
}
```

If the score is below 7 and fewer than two refinement loops have run, the system cycles back: quality feedback goes to all agents, they update their findings, synthesis runs again, quality checks again. This loop caps at two iterations to prevent infinite refinement.

The quality gate is the difference between "we ran some agents and concatenated their output" and "we produced a vetted, cross-validated deliverable." It's expensive --- an extra agent spawning costs tokens and time --- but it catches the 20% of cases where agent outputs contradict each other or miss critical requirements.

---

## 6.7 Result Synthesis

Synthesis is the orchestrator's final act, and it's more complex than it appears. You have outputs from three, four, maybe six specialist CLIs. Each has made changes to the codebase in its own worktree branch. Each has produced a text report of what it did. Merging these into a coherent whole requires both code integration and narrative integration.

### Code Integration

When workers operate in isolated git worktrees, their code changes must eventually merge into the main branch. The orchestrator handles this sequentially to minimize conflicts:

```typescript
async function mergeWorkerBranches(
  workers: Worker[],
  mainBranch: string
): Promise<MergeReport> {
  const report: MergeReport = { merged: [], conflicts: [], failed: [] };

  // Sort by completion order (earliest first)
  const sorted = [...workers]
    .filter(w => w.status === 'complete')
    .sort((a, b) => a.completedAt - b.completedAt);

  for (const worker of sorted) {
    try {
      await git('checkout', mainBranch);
      await git('merge', worker.branch, '--no-ff',
        '-m', `Merge ${worker.role}: ${worker.task}`);
      report.merged.push(worker.id);
    } catch (error) {
      if (isConflict(error)) {
        // Abort merge, record conflict for manual resolution
        await git('merge', '--abort');
        report.conflicts.push({
          workerId: worker.id,
          files: parseConflictFiles(error),
        });
      } else {
        report.failed.push({ workerId: worker.id, error: String(error) });
      }
    }
  }

  return report;
}
```

Merge conflicts are rare when the DAG is well-constructed --- tasks that touch the same files should have dependencies between them. But when conflicts occur, the orchestrator can dispatch a "merge resolution" task to a specialist:

```typescript
if (report.conflicts.length > 0) {
  await dispatch({
    id: 'merge-resolution',
    role: 'backend',
    description: `Resolve merge conflicts in: ${report.conflicts.map(c => c.files).flat().join(', ')}`,
    deps: [],
  });
}
```

### Narrative Integration

Beyond code, the orchestrator produces a human-readable report. This isn't just concatenation --- it's a structured synthesis that answers: *What was requested? What was delivered? What worked? What didn't?*

```typescript
function synthesizeReport(
  originalPrompt: string,
  workers: Worker[],
  dagStats: Record<string, number>,
  mergeReport: MergeReport
): string {
  const sections: string[] = [];

  sections.push(`## Project Summary\n\n**Request**: ${originalPrompt}`);
  sections.push(`**Tasks**: ${dagStats.complete} completed, ${dagStats.failed} failed`);
  sections.push(`**Workers**: ${workers.length} specialists deployed`);

  // Per-worker summaries
  for (const worker of workers) {
    sections.push(`### ${worker.role} (${worker.status})`);
    sections.push(worker.result || '(no output)');
  }

  // Merge status
  if (mergeReport.conflicts.length > 0) {
    sections.push(`### ⚠️ Merge Conflicts`);
    for (const conflict of mergeReport.conflicts) {
      sections.push(`- ${conflict.workerId}: ${conflict.files.join(', ')}`);
    }
  }

  return sections.join('\n\n');
}
```

### Cross-Session Memory

The claudecode_team implementation saves session summaries to persistent storage for cross-session learning:

```typescript
sharedMemory.saveToTeamMemory({
  id: sessionId,
  prompt: originalPrompt.slice(0, 200),
  agentCount: agents.length,
  qualityScore: qualityVerdict.score,
  keyFindings: synthesisResult.slice(0, 500),
  timestamp: new Date().toISOString(),
});
```

This enables the orchestrator to learn from past sessions. If a similar prompt comes in next week, the orchestrator can reference past decisions: "Last time we built an API with RBAC, the security agent identified that role hierarchies need to be modeled as a DAG, not a flat list. Let's include that requirement upfront."

The memory file caps at fifty sessions and one hundred insights to prevent unbounded growth. Old entries are pruned based on recency and relevance.

---

## 6.8 Custom Slash Commands

The Orchestrator CLI exposes four slash commands that give users direct control over the dispatch lifecycle.

### /dispatch --- Submit a Task

The primary entry point. Takes a natural-language description and runs it through the full pipeline:

```typescript
// commands/dispatch.ts
export const dispatchCommand: SlashCommand = {
  name: 'dispatch',
  description: 'Decompose and dispatch a task to specialist CLIs',
  usage: '/dispatch <task description>',

  async execute(args: string, context: OrchestratorContext): Promise<void> {
    const prompt = args.trim();
    if (!prompt) {
      context.output('Usage: /dispatch <task description>');
      return;
    }

    // Stage 1: Intent analysis
    const intent = analyzeIntent(prompt);
    context.output(`Detected roles: ${intent.roles.join(', ')}`);
    context.output(`Project type: ${intent.projectType}`);

    // Stage 2: Planning (supervisor generates dev-plan.json)
    context.output('Planning...');
    const plan = await runSupervisorPlanning(prompt, intent);
    context.output(`Plan: ${plan.tasks.length} tasks across ${intent.roles.length} roles`);

    // Stage 3: DAG construction
    const dag = new TaskDAG(plan.tasks);
    context.output(`DAG: ${dag.getStats().ready} tasks ready (Wave 0)`);

    // Stage 4: Execution
    context.output('Dispatching...');
    await executeDAG(dag, context.dispatch, context.maxConcurrency);

    // Stage 5: Synthesis
    const report = synthesizeReport(prompt, context.workers, dag.getStats());
    context.output(report);
  },
};
```

### /status --- Monitor Execution

Provides a real-time snapshot of the DAG state:

```typescript
export const statusCommand: SlashCommand = {
  name: 'status',
  description: 'Show current task execution status',

  async execute(_args: string, context: OrchestratorContext): Promise<void> {
    if (!context.dag) {
      context.output('No active dispatch. Use /dispatch to start.');
      return;
    }

    const stats = context.dag.getStats();
    context.output(`
┌─────────────────────────────┐
│ Orchestrator Status          │
├─────────────────────────────┤
│ Pending:  ${String(stats.pending).padStart(3)}               │
│ Ready:    ${String(stats.ready).padStart(3)}               │
│ Active:   ${String(stats.active).padStart(3)}               │
│ Complete: ${String(stats.complete).padStart(3)}               │
│ Failed:   ${String(stats.failed).padStart(3)}               │
├─────────────────────────────┤
│ Total:    ${String(stats.pending + stats.ready + stats.active + stats.complete + stats.failed).padStart(3)}               │
└─────────────────────────────┘
    `);

    // Show active workers
    for (const worker of context.getActiveWorkers()) {
      const elapsed = Math.round((Date.now() - worker.startedAt) / 1000);
      context.output(`  ▶ ${worker.id} [${worker.role}] — ${elapsed}s — ${worker.task.slice(0, 60)}...`);
    }
  },
};
```

### /team --- Manage Specialists

Lists available specialist agents and their current assignments:

```typescript
export const teamCommand: SlashCommand = {
  name: 'team',
  description: 'List specialist CLIs and their status',

  async execute(args: string, context: OrchestratorContext): Promise<void> {
    const subcommand = args.trim().split(' ')[0];

    switch (subcommand) {
      case 'list':
        for (const [role, agent] of context.agents) {
          const status = agent.active ? '🟢 Active' : '⚪ Idle';
          context.output(`  ${status} ${role}: ${agent.description}`);
        }
        break;

      case 'add':
        const roleName = args.trim().split(' ')[1];
        context.output(`Adding specialist: ${roleName}`);
        await context.registerAgent(roleName);
        break;

      case 'remove':
        const removeRole = args.trim().split(' ')[1];
        await context.unregisterAgent(removeRole);
        context.output(`Removed: ${removeRole}`);
        break;

      default:
        context.output('Usage: /team [list|add <role>|remove <role>]');
    }
  },
};
```

### /dag --- Visualize Dependencies

Renders the current task dependency graph in ASCII:

```typescript
export const dagCommand: SlashCommand = {
  name: 'dag',
  description: 'Display the task dependency graph',

  async execute(_args: string, context: OrchestratorContext): Promise<void> {
    if (!context.dag) {
      context.output('No active DAG. Use /dispatch to create one.');
      return;
    }

    const waves = context.dag.getWaves();
    for (let i = 0; i < waves.length; i++) {
      context.output(`Wave ${i}:`);
      for (const task of waves[i]) {
        const icon = statusIcon(task.status);
        const deps = task.deps.length > 0 ? ` ← [${task.deps.join(', ')}]` : '';
        context.output(`  ${icon} ${task.id} [${task.role}] ${task.description.slice(0, 50)}${deps}`);
      }
      context.output('');
    }
  },
};

function statusIcon(status: string): string {
  switch (status) {
    case 'complete': return '✅';
    case 'active':   return '🔄';
    case 'ready':    return '🟡';
    case 'failed':   return '❌';
    default:         return '⬜';
  }
}
```

---

## 6.9 The Complete Orchestrator CLAUDE.md

Every CLI in the multi-agent system is defined by its CLAUDE.md file. The orchestrator's CLAUDE.md is the most important because it determines how the brain thinks. Here is the complete template, annotated:

```markdown
# Orchestrator CLI — System Instructions

## Identity
You are the Orchestrator — the coordinating intelligence of a multi-CLI
agent system. You NEVER write application code, run tests, or execute
deployments directly. You decompose, delegate, coordinate, and synthesize.

## Core Principle: Restricted Tool Use
You have access to exactly three tools:
- **Agent**: Spawn specialist workers with specific task prompts
- **SendMessage**: Continue communication with running workers
- **TaskStop**: Terminate a running worker

You CANNOT read files, write code, run bash, or search the web.
This restriction is intentional. Your context window is reserved for
strategic thinking, not source code.

## Workflow Protocol

### Phase 1: Research
When you receive a user request:
1. Spawn 1-3 research workers to investigate the codebase
2. Each worker should report: file paths, structures, patterns, dependencies
3. Workers must NOT modify any files during research
4. Wait for all research workers to complete

### Phase 2: Synthesis (YOU do this — never delegate)
1. Read worker findings from task notifications
2. Identify conflicts between worker reports
3. Craft implementation specifications with:
   - Exact file paths and line numbers
   - Specific code changes (not vague descriptions)
   - Dependencies between changes
   - Acceptance criteria for each change

### Phase 3: Implementation
1. Spawn implementation workers with self-contained specs
2. Each spec must include ALL context — workers cannot see
   your conversation or other workers' outputs
3. Use worktree isolation when workers modify overlapping areas
4. Monitor progress via task notifications

### Phase 4: Verification
1. Spawn QA workers to validate changes
2. Workers run existing tests + write new tests for changes
3. If tests fail, dispatch fix tasks with specific failure details

## Task Decomposition Rules
- Maximum 15 tasks per dispatch (more = too granular)
- Minimum 2 tasks per dispatch (fewer = should be single-agent)
- Every task must have a clear completion criteria
- Dependencies must be explicit — no implicit ordering
- Prefer wide DAGs (parallel) over deep DAGs (sequential)

## Worker Communication Protocol
- Every message to a worker must be self-contained
- Never reference "your earlier findings" — restate the findings
- Include file paths, line numbers, and exact expected changes
- If a worker fails, provide the error output in the retry message

## Specialist Roster
| Role | Agent ID | Capabilities |
|------|----------|-------------|
| Backend | backend-specialist | APIs, databases, models, migrations |
| Frontend | frontend-specialist | UI, components, styles, client logic |
| Security | security-auditor | Auth, RBAC, vulnerability scanning |
| DevOps | devops-engineer | CI/CD, Docker, infrastructure |
| QA | qa-validator | Unit tests, integration tests, E2E |
| Docs | doc-writer | README, API docs, architecture docs |

## Cost Awareness
- Each worker spawn costs tokens and money
- Prefer fewer, well-specified workers over many vague ones
- Use research workers sparingly — one broad researcher
  is better than five narrow ones
- Track cumulative cost and alert if approaching budget limits

## Anti-Patterns to Avoid
- DO NOT read files yourself — delegate to workers
- DO NOT write implementation specs without research first
- DO NOT spawn more than 6 concurrent workers
- DO NOT retry failed workers more than twice
- DO NOT send vague tasks like "fix the bugs" — be specific
```

This CLAUDE.md encodes every design decision from this chapter: restricted tools, four-phase workflow, self-contained worker messages, DAG construction rules, and explicit anti-patterns. When you configure your Orchestrator CLI, this file is what transforms a general-purpose LLM into a coordination engine.

---

## 6.10 Error Handling: When Specialists Fail

In a multi-agent system, failures are not exceptional. They are expected, frequent, and varied. A specialist CLI might crash mid-task. The LLM might hallucinate invalid code that causes a test failure. A network timeout might kill an API call. A worker might hit its token limit before completing its assignment. The orchestrator must handle all of these gracefully.

### Failure Taxonomy

**Process failures**: The CLI process itself dies. Exit code non-zero. The task notification arrives with `status: failed` and an error summary. This is the simplest case --- the worker produced no output, so there's nothing to merge.

**Partial completion**: The worker made some changes before failing. It committed code to its worktree branch, then crashed. This is more dangerous because the partial work might be valid and useful, or it might be a half-finished state that breaks everything.

**Silent failures**: The worker reports success, but its output is wrong. Tests pass because the tests themselves are incorrect. Code compiles but doesn't implement the specification. These are caught by the quality gate, not by exit codes.

**Cascade failures**: Task `t7` depends on `t4` and `t5`. If `t4` fails, `t7` can never become ready. If the orchestrator doesn't detect this, it waits forever for `t7` to unblock --- a deadlock.

### The Retry Protocol

SwarmForge implements a single-retry policy:

```typescript
async function handleWorkerFailure(
  worker: Worker,
  dag: TaskDAG,
  exitCode: number,
  maxRetries: number = 1
): Promise<'retried' | 'abandoned'> {
  if (worker.retries < maxRetries) {
    worker.retries++;
    worker.status = 'pending';
    worker.branch = `feature/${worker.id}-retry${worker.retries}`;

    // Clean up failed worktree
    await worktreeManager.cleanup(worker.id);

    // Reset DAG task to ready
    dag.markRetry(worker.taskId);

    return 'retried';
  }

  // Max retries exceeded — mark as permanently failed
  worker.status = 'failed';
  dag.markFailed(worker.taskId);

  // Check for cascade failures
  const blocked = dag.getBlockedBy(worker.taskId);
  if (blocked.length > 0) {
    console.warn(
      `Task ${worker.taskId} failed permanently. ` +
      `Blocked tasks: ${blocked.map(t => t.id).join(', ')}`
    );
  }

  return 'abandoned';
}
```

A single retry is the sweet spot. Zero retries means transient failures (network blips, rate limits) kill the entire pipeline. Two or more retries means deterministic failures (wrong specification, impossible task) waste time and tokens repeating the same mistake. One retry catches transients while failing fast on fundamental errors.

### Deadlock Detection

The DAG's `isStuck()` method catches deadlocks:

```typescript
isStuck(): boolean {
  const stats = this.getStats();
  return stats.active === 0 
    && stats.ready === 0 
    && !this.isComplete();
}
```

When stuck, the orchestrator has two options:

1. **Skip blocked tasks**: Mark tasks whose dependencies failed as "skipped" and continue with whatever tasks can still proceed. This produces partial results but doesn't abandon the entire project.

2. **Replan**: Feed the failure information back to the supervisor and ask it to produce a revised plan that works around the failed component. If the database schema task failed, perhaps the API routes can be built with a mock data layer instead.

### Health Monitoring

The SwarmForge orchestrator runs a health check every fifteen seconds:

```typescript
setInterval(() => {
  for (const worker of activeWorkers()) {
    const lastOutput = getLastOutput(worker.terminalId);
    const silentFor = Date.now() - lastOutput;

    if (silentFor > 120_000) { // 2 minutes of silence
      if (workerHasCommits(worker)) {
        // Worker did useful work but hung — force complete
        killTerminal(worker.terminalId);
        worker.status = 'complete';
      } else {
        // Worker is genuinely stuck
        flagAsStalled(worker);
      }
    }
  }
}, 15_000);
```

The distinction between "hung after producing work" and "stuck producing nothing" is important. Claude Code sometimes completes its task, writes the result message, but the process doesn't exit cleanly. The health monitor detects this (result received, no new output for two minutes) and force-kills the process, treating it as a successful completion. Without this, zombie processes accumulate and block the semaphore.

---

## 6.11 Orchestrator Anti-Patterns

Building an orchestrator is an exercise in restraint. The most common failures come not from missing features but from the orchestrator doing too much. Here are the anti-patterns to avoid.

### The God Orchestrator

**Symptom**: The orchestrator reads files, analyzes code, and makes implementation decisions before delegating. Its context window fills with source code. Workers receive biased, pre-digested specifications that reflect the orchestrator's incomplete understanding rather than the actual codebase state.

**Fix**: Enforce tool restrictions. The orchestrator should never read source files. Research is a worker's job. The orchestrator reads worker reports, synthesizes, and delegates.

### Sequential-Only Dispatch

**Symptom**: The orchestrator assigns tasks one at a time, waiting for each to complete before starting the next. A twelve-task project takes the wall time of twelve sequential workers instead of five parallel waves.

**Fix**: Build a real DAG. Identify independent tasks. Dispatch them simultaneously. The orchestrator should only serialize tasks that have genuine data dependencies.

### Vague Delegation

**Symptom**: Tasks like "set up the backend" or "handle authentication." Workers spend half their token budget figuring out what to do, make assumptions that conflict with other workers' assumptions, and produce work that doesn't integrate.

**Fix**: Every task specification must include concrete deliverables, specific file paths (from research phase), and explicit acceptance criteria. "Implement JWT auth" is vague. "Implement RS256 JWT signing in src/middleware/auth.ts with 15-minute access tokens and 7-day refresh tokens, using the bcrypt-verified user.id as the subject claim" is actionable.

### Ignoring Failures

**Symptom**: A worker fails and the orchestrator proceeds as if it succeeded. Downstream tasks receive incomplete dependencies and produce broken output. The final synthesis includes work built on a missing foundation.

**Fix**: The DAG must propagate failure. When a task fails, every task that depends on it (transitively) must be either blocked, replanned, or explicitly skipped. The final report must acknowledge what was not completed and why.

### Over-Decomposition

**Symptom**: A simple task is split into twenty-five micro-tasks. The overhead of spawning, coordinating, and merging twenty-five workers exceeds the cost of having three workers handle the job with broader scope. Context-switching between tasks costs the orchestrator more tokens than the tasks save.

**Fix**: Aim for five to twelve tasks per dispatch. Each task should represent a meaningful unit of work --- something that takes a specialist five to fifteen minutes of focused effort. If a task can be described in one sentence and completed in under a minute, it's too granular. Merge it with a related task.

### The Silent Orchestrator

**Symptom**: The orchestrator dispatches work and goes quiet. The user has no visibility into progress. They don't know if workers are running, stuck, or complete. They wait in silence until the final result appears (or doesn't).

**Fix**: The `/status` command and real-time WebSocket broadcasts exist for a reason. The orchestrator should proactively report phase transitions, worker completions, and failures as they happen. Transparency builds trust. An orchestrator that says "3 of 12 tasks complete, worker-t5 is running auth implementation (45s elapsed)" gives the user confidence that the system is working. Silence breeds doubt.

---

## 6.12 Chapter Summary

The Orchestrator CLI is the component that transforms a collection of tools into a system. Its architecture rests on three pillars:

1. **Decomposition** via intent analysis and supervisor planning --- turning "build me an API" into twelve concrete, assignable tasks.

2. **Coordination** via the Task DAG --- managing dependencies, enabling parallelism, handling failures, and preventing deadlocks.

3. **Synthesis** via result merging and quality gating --- combining specialist outputs into a coherent, validated deliverable.

The most important design decision is what the orchestrator *cannot* do. By restricting it to three tools --- spawn, message, and stop --- you force a clean separation between strategic thinking and tactical execution. The orchestrator thinks. Workers do. This separation keeps context windows clean, enables true parallelism, and prevents the god-orchestrator anti-pattern that plagues naive multi-agent implementations.

Claude Code's `COORDINATOR_MODE` proves this pattern works at scale. SwarmForge's implementation proves it works in practice. The claudecode_team's debate-and-quality-gate pattern proves it works for complex, ambiguous problems that require multiple perspectives.

In the next chapter, we'll build the first specialist --- the Security Auditor CLI. Where the orchestrator sees the whole picture, the security auditor sees every shadow.

---
