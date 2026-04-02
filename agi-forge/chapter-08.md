# Chapter 8: The Planner CLI --- The Architect

---

There is a reason architects don't lay bricks.

An architect who lays bricks is an architect who stops thinking about load-bearing walls, fire egress routes, and structural tolerances the moment they pick up a trowel. Their attention collapses from the whole system to the single brick in their hand. The building might still go up. But it goes up without the benefit of someone whose sole job is to ensure every component connects to every other component in a way that survives contact with reality.

The Planner CLI is your architect. It never writes a line of application code. It never runs a test. It never deploys a container. What it does --- the *only* thing it does --- is think. It takes a vague human request and transforms it into a precise, dependency-ordered, resource-annotated execution plan that the Orchestrator can dispatch across your specialist fleet.

In Chapter 6, you built the Orchestrator --- the brain that manages task dispatch, failure recovery, and result synthesis. But the Orchestrator isn't designed to *plan*. It's designed to *execute plans*. When you gave it a complex request, it had to do its own decomposition inline, burning context tokens on architectural reasoning that could have been handled by a dedicated specialist with a system prompt optimized for exactly that kind of thinking.

This chapter separates planning from execution. The result is a system where complex requests get *better plans* because a purpose-built agent spends its entire context budget on decomposition, dependency analysis, and architectural decision-making --- then hands a structured artifact to the Orchestrator, which spends its own context budget purely on dispatch and coordination.

This is the difference between a construction manager who also draws the blueprints and a construction manager who receives blueprints from a licensed architect. Both buildings go up. Only one of them reliably survives an earthquake.

---

## 8.1 Why Dedicated Planning Matters

You could argue that planning is just another sub-task. Let the Orchestrator handle it. After all, Claude Code's built-in `EnterPlanMode` tool already does plan-then-execute within a single session. Why extract planning into its own CLI?

Three reasons.

### Context Budget Isolation

Planning consumes tokens differently than execution. When the Planner is analyzing a request like "Build a microservice with JWT auth, PostgreSQL, a REST API, rate limiting, and CI/CD," it needs to:

- Explore the existing codebase for conventions and patterns
- Research architectural options (session-based vs. token-based auth, ORM vs. raw SQL)
- Evaluate tradeoffs (Redis for rate limiting vs. in-memory sliding window)
- Generate a dependency graph of 20--30 atomic tasks
- Write Architecture Decision Records explaining *why* each choice was made
- Produce Mermaid diagrams showing component relationships

That's easily 40,000--60,000 tokens of reasoning. If that reasoning happens inside the Orchestrator's context, the Orchestrator has already consumed a third of its budget before dispatching a single task. Subsequent coordination --- failure handling, re-planning, result synthesis --- runs on a degraded context. You've watched this happen. The Orchestrator starts dropping task dependencies, re-assigning work to the wrong specialist, or forgetting that Task 12 was blocked on Task 7.

A dedicated Planner spends those 60,000 tokens in its *own* context window. The Orchestrator receives a structured plan --- a JSON artifact with tasks, dependencies, and metadata --- that consumes maybe 3,000 tokens. The Orchestrator's context stays clean for coordination.

### Specialization Depth

System prompts shape model behavior more than most engineers realize. A Planner CLI loaded with architectural reasoning instructions, ADR templates, decomposition heuristics, and dependency resolution algorithms produces measurably better plans than a general-purpose Orchestrator asked to "also plan things."

The Planner's `CLAUDE.md` (which we'll build later in this chapter) is 2,000+ words of pure planning logic: how to break tasks down, when to stop decomposing, how to detect missing validation steps, what constitutes a proper dependency edge. That's cognitive specialization. It's the difference between asking a general practitioner to perform heart surgery and asking a cardiac surgeon. Both went to medical school. Only one should hold the scalpel.

### ULTRAPLAN and Remote Reasoning

Here's where it gets interesting. Claude Code's source contains a hidden feature called ULTRAPLAN --- a mechanism for delegating complex planning to Anthropic's most powerful model running remotely on cloud infrastructure. The gate is `feature('ULTRAPLAN')`, the timeout is 30 minutes, and the model is Opus 4.6.

ULTRAPLAN doesn't just use a bigger model. It uses a fundamentally different execution architecture: a remote CCR (Cloud Compute Runtime) session that polls for an approved `ExitPlanMode` tool result over a 3-second interval, for up to 30 minutes. The remote Opus instance explores, reasons, writes a plan to a file, and calls `ExitPlanMode`. The local client polls until the plan is approved, then teleports it back to the user's terminal.

A dedicated Planner CLI is the natural home for this capability. When the Orchestrator encounters a request that exceeds normal planning complexity --- a full-stack application, a distributed system, a security architecture overhaul --- it routes to the Planner, which can invoke ULTRAPLAN to get Opus-grade reasoning on the plan before a single line of code is written.

We'll implement this integration in Section 8.5.

---

## 8.2 The Task Decomposition Engine

The Planner's core function is turning fuzzy human requests into atomic, executable work items. This is harder than it sounds.

Consider the request: *"Build a REST API microservice with JWT authentication, role-based access control, PostgreSQL database, rate limiting, comprehensive testing, Docker containerization, and CI/CD pipeline."*

A naive decomposition produces a flat list:

```
1. Create project structure
2. Set up PostgreSQL database
3. Build REST API
4. Add JWT authentication
5. Add RBAC
6. Add rate limiting
7. Write tests
8. Create Dockerfile
9. Set up CI/CD
```

This is useless. "Build REST API" is not an atomic task. "Write tests" doesn't specify *what* tests for *what* component. "Set up PostgreSQL database" says nothing about schema design, migrations, connection pooling, or ORM configuration. Every item is a chapter, not a sentence.

### Recursive Decomposition with Stop Conditions

The Planner uses a recursive decomposition algorithm. Each task is evaluated against a set of *atomicity criteria*. If a task fails any criterion, it's decomposed further. If it passes all criteria, it's marked as atomic and added to the plan.

```typescript
interface TaskNode {
  id: string;
  title: string;
  description: string;
  specialist: SpecialistType;
  estimatedTokens: number;
  inputs: string[];      // file paths, schemas, or artifact IDs
  outputs: string[];     // what this task produces
  dependencies: string[]; // IDs of tasks that must complete first
  validationCriteria: string[];
  isAtomic: boolean;
}

type SpecialistType = 
  | 'coder' 
  | 'security' 
  | 'qa' 
  | 'devops' 
  | 'documentation' 
  | 'research';

interface AtomicityCriteria {
  singleSpecialist: boolean;  // Can one specialist handle this?
  boundedScope: boolean;      // Touches ≤ 5 files?
  clearInputOutput: boolean;  // Inputs and outputs are well-defined?
  estimatedUnder10kTokens: boolean; // Completable in < 10K tokens?
  noAmbiguousDecisions: boolean;    // No unresolved architectural choices?
}

function isAtomic(task: TaskNode): boolean {
  const criteria: AtomicityCriteria = {
    singleSpecialist: task.specialist !== undefined,
    boundedScope: task.outputs.length <= 5,
    clearInputOutput: task.inputs.length > 0 && task.outputs.length > 0,
    estimatedUnder10kTokens: task.estimatedTokens < 10_000,
    noAmbiguousDecisions: !task.description.includes('decide') 
                          && !task.description.includes('choose'),
  };
  return Object.values(criteria).every(Boolean);
}
```

The decomposition function is recursive with a depth limit to prevent infinite splitting:

```typescript
const MAX_DECOMPOSITION_DEPTH = 4;

async function decompose(
  task: TaskNode, 
  depth: number = 0
): Promise<TaskNode[]> {
  if (depth >= MAX_DECOMPOSITION_DEPTH) {
    // Force-mark as atomic at max depth; flag for human review
    task.isAtomic = true;
    task.validationCriteria.push('REVIEW: Force-atomized at max depth');
    return [task];
  }

  if (isAtomic(task)) {
    task.isAtomic = true;
    return [task];
  }

  // Ask the LLM to split this task into sub-tasks
  const subTasks = await plannerLLM.decompose(task);
  
  // Recursively decompose each sub-task
  const results: TaskNode[] = [];
  for (const sub of subTasks) {
    const decomposed = await decompose(sub, depth + 1);
    results.push(...decomposed);
  }

  return results;
}
```

### The Microservice Decomposition in Practice

Applied to our microservice request, the Planner's recursive decomposition produces something like this:

**Depth 0 --- Initial split:**

```
"Build microservice with auth, DB, API, tests, CI/CD"
  → 7 high-level task groups
```

**Depth 1 --- Group decomposition:**

```
"Set up PostgreSQL database"
  → "Design database schema for users, roles, sessions"
  → "Create migration files using Knex/Prisma"
  → "Configure connection pooling (pg-pool)"  
  → "Write seed data for development"
```

**Depth 2 --- Further refinement:**

```
"Design database schema for users, roles, sessions"
  → "Create users table (id, email, password_hash, created_at, updated_at)"
  → "Create roles table (id, name, permissions JSONB)"
  → "Create user_roles junction table"
  → "Create refresh_tokens table (id, user_id, token_hash, expires_at)"
```

**Depth 3 --- Atomic tasks:**

Each of those table creation tasks is now atomic: single specialist (Coder), bounded scope (one migration file), clear input (schema design from parent task), clear output (migration file), and under 10K tokens.

The full decomposition of the microservice request produces 25--35 atomic tasks, depending on complexity. Here's a representative subset:

| ID | Task | Specialist | Dependencies |
|----|------|-----------|-------------|
| `db-001` | Create users table migration | Coder | — |
| `db-002` | Create roles table migration | Coder | — |
| `db-003` | Create user_roles junction migration | Coder | db-001, db-002 |
| `db-004` | Create refresh_tokens migration | Coder | db-001 |
| `db-005` | Configure connection pool | Coder | db-001 |
| `db-006` | Write seed data | Coder | db-001, db-002, db-003 |
| `api-001` | Create Express app skeleton | Coder | — |
| `api-002` | Implement user CRUD routes | Coder | db-001, api-001 |
| `api-003` | Implement role management routes | Coder | db-002, db-003, api-001 |
| `auth-001` | Implement JWT token generation | Security | api-001 |
| `auth-002` | Implement token validation middleware | Security | auth-001 |
| `auth-003` | Implement refresh token rotation | Security | auth-001, db-004 |
| `auth-004` | Implement RBAC middleware | Security | auth-002, db-003 |
| `rl-001` | Implement rate limiting middleware | Coder | api-001 |
| `rl-002` | Configure rate limit storage (Redis/memory) | Coder | rl-001 |
| `test-001` | Write unit tests for auth module | QA | auth-001, auth-002 |
| `test-002` | Write integration tests for API routes | QA | api-002, api-003, auth-004 |
| `test-003` | Write integration tests for rate limiting | QA | rl-001, rl-002 |
| `docker-001` | Create Dockerfile | DevOps | api-001 |
| `docker-002` | Create docker-compose.yml (app + postgres + redis) | DevOps | docker-001, db-005 |
| `ci-001` | Create GitHub Actions workflow | DevOps | test-001, test-002, docker-001 |
| `doc-001` | Generate API documentation (OpenAPI spec) | Documentation | api-002, api-003 |
| `doc-002` | Write README with setup instructions | Documentation | docker-002, ci-001 |
| `sec-001` | Security review of auth implementation | Security | auth-001, auth-002, auth-003, auth-004 |
| `sec-002` | OWASP Top 10 audit of API routes | Security | api-002, api-003, rl-001 |

Twenty-five tasks. Clear ownership. Explicit dependencies. Defined inputs and outputs. The Orchestrator can look at this plan and immediately identify which tasks can run in parallel (db-001, db-002, and api-001 have no dependencies), which specialists to spin up, and what the critical path is.

That's what dedicated planning buys you.

---

## 8.3 Dependency Graph Construction --- Building the DAG

A flat task list with dependency IDs is useful. A validated directed acyclic graph is *reliable*. The difference matters when you're dispatching 25 tasks across 5 specialist CLIs and a circular dependency would deadlock your entire system.

### The DAG Engine

The dependency graph engine validates the task list, detects cycles, computes topological ordering, identifies the critical path, and determines maximum parallelism at each stage.

```typescript
class DependencyGraph {
  private nodes: Map<string, TaskNode> = new Map();
  private edges: Map<string, Set<string>> = new Map(); // task → depends on
  private reverseEdges: Map<string, Set<string>> = new Map(); // task → blocks

  addTask(task: TaskNode): void {
    this.nodes.set(task.id, task);
    this.edges.set(task.id, new Set(task.dependencies));
    
    // Build reverse edges for downstream notification
    for (const dep of task.dependencies) {
      if (!this.reverseEdges.has(dep)) {
        this.reverseEdges.set(dep, new Set());
      }
      this.reverseEdges.get(dep)!.add(task.id);
    }
  }

  /**
   * Kahn's algorithm for topological sort.
   * Returns ordered task IDs or throws on cycle detection.
   */
  topologicalSort(): string[] {
    const inDegree = new Map<string, number>();
    for (const [id] of this.nodes) {
      inDegree.set(id, this.edges.get(id)?.size ?? 0);
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      const dependents = this.reverseEdges.get(current) ?? new Set();
      for (const dep of dependents) {
        const newDegree = inDegree.get(dep)! - 1;
        inDegree.set(dep, newDegree);
        if (newDegree === 0) queue.push(dep);
      }
    }

    if (sorted.length !== this.nodes.size) {
      const cycleNodes = [...this.nodes.keys()]
        .filter(id => !sorted.includes(id));
      throw new CyclicDependencyError(
        `Circular dependency detected among: ${cycleNodes.join(', ')}`,
        cycleNodes
      );
    }

    return sorted;
  }

  /**
   * Compute execution stages --- groups of tasks that can run in parallel.
   * Each stage contains tasks whose dependencies are all in previous stages.
   */
  computeExecutionStages(): TaskNode[][] {
    const sorted = this.topologicalSort();
    const stageMap = new Map<string, number>();
    
    for (const id of sorted) {
      const deps = this.edges.get(id) ?? new Set();
      if (deps.size === 0) {
        stageMap.set(id, 0);
      } else {
        const maxDepStage = Math.max(
          ...[...deps].map(d => stageMap.get(d)!)
        );
        stageMap.set(id, maxDepStage + 1);
      }
    }

    const stages: TaskNode[][] = [];
    for (const [id, stage] of stageMap) {
      while (stages.length <= stage) stages.push([]);
      stages[stage].push(this.nodes.get(id)!);
    }

    return stages;
  }

  /**
   * Find the critical path --- the longest chain of sequential dependencies.
   * This determines the minimum possible execution time.
   */
  criticalPath(): TaskNode[] {
    const sorted = this.topologicalSort();
    const dist = new Map<string, number>();
    const prev = new Map<string, string | null>();

    for (const id of sorted) {
      dist.set(id, 0);
      prev.set(id, null);
    }

    for (const id of sorted) {
      const dependents = this.reverseEdges.get(id) ?? new Set();
      for (const dep of dependents) {
        const newDist = dist.get(id)! + 
          (this.nodes.get(dep)?.estimatedTokens ?? 1);
        if (newDist > dist.get(dep)!) {
          dist.set(dep, newDist);
          prev.set(dep, id);
        }
      }
    }

    // Find the node with maximum distance (end of critical path)
    let maxNode = sorted[0];
    for (const id of sorted) {
      if (dist.get(id)! > dist.get(maxNode)!) maxNode = id;
    }

    // Trace back
    const path: TaskNode[] = [];
    let current: string | null = maxNode;
    while (current !== null) {
      path.unshift(this.nodes.get(current)!);
      current = prev.get(current)!;
    }

    return path;
  }

  /** Tasks with no dependencies --- can start immediately. */
  getRoots(): TaskNode[] {
    return [...this.nodes.values()]
      .filter(t => (this.edges.get(t.id)?.size ?? 0) === 0);
  }

  /** Tasks with no dependents --- final outputs. */
  getLeaves(): TaskNode[] {
    return [...this.nodes.values()]
      .filter(t => (this.reverseEdges.get(t.id)?.size ?? 0) === 0);
  }

  /** Summary statistics for the plan. */
  getStats(): PlanStats {
    const stages = this.computeExecutionStages();
    const critical = this.criticalPath();
    return {
      totalTasks: this.nodes.size,
      executionStages: stages.length,
      maxParallelism: Math.max(...stages.map(s => s.length)),
      criticalPathLength: critical.length,
      criticalPathTokens: critical.reduce(
        (sum, t) => sum + t.estimatedTokens, 0
      ),
      tasksBySpecialist: this.countBySpecialist(),
    };
  }

  private countBySpecialist(): Record<SpecialistType, number> {
    const counts: Record<string, number> = {};
    for (const task of this.nodes.values()) {
      counts[task.specialist] = (counts[task.specialist] ?? 0) + 1;
    }
    return counts as Record<SpecialistType, number>;
  }
}
```

### Validating the Graph

Before any plan reaches the Orchestrator, the DAG engine runs a validation pass:

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

function validatePlan(graph: DependencyGraph): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // 1. Cycle detection (already handled by topologicalSort)
  try {
    graph.topologicalSort();
  } catch (e) {
    if (e instanceof CyclicDependencyError) {
      errors.push({ 
        type: 'CIRCULAR_DEPENDENCY', 
        nodes: e.cycleNodes 
      });
    }
  }

  // 2. Orphan detection — tasks with dependencies that don't exist
  for (const [id, deps] of graph.edges) {
    for (const dep of deps) {
      if (!graph.nodes.has(dep)) {
        errors.push({ 
          type: 'MISSING_DEPENDENCY', 
          task: id, 
          missingDep: dep 
        });
      }
    }
  }

  // 3. Missing validation tasks
  const hasTests = [...graph.nodes.values()]
    .some(t => t.specialist === 'qa');
  if (!hasTests) {
    warnings.push({ 
      type: 'NO_VALIDATION_TASKS',
      message: 'Plan has no QA tasks. Add test generation.' 
    });
  }

  // 4. Missing security review for auth-related tasks
  const hasAuthTasks = [...graph.nodes.values()]
    .some(t => t.title.toLowerCase().includes('auth') 
            || t.title.toLowerCase().includes('jwt'));
  const hasSecReview = [...graph.nodes.values()]
    .some(t => t.specialist === 'security');
  if (hasAuthTasks && !hasSecReview) {
    warnings.push({ 
      type: 'NO_SECURITY_REVIEW',
      message: 'Auth tasks present but no security review task.' 
    });
  }

  // 5. Disconnected subgraphs
  const roots = graph.getRoots();
  const leaves = graph.getLeaves();
  if (leaves.length > 5) {
    warnings.push({
      type: 'FRAGMENTED_PLAN',
      message: `${leaves.length} leaf tasks suggest fragmented plan. Consider adding integration tasks.`
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
```

### Visualizing the Execution Stages

For the microservice example, `computeExecutionStages()` produces:

```
Stage 0 (parallel): db-001, db-002, api-001
Stage 1 (parallel): db-003, db-004, db-005, api-002, api-003, auth-001, rl-001
Stage 2 (parallel): db-006, auth-002, auth-003, rl-002
Stage 3 (parallel): auth-004, test-001, docker-001
Stage 4 (parallel): test-002, test-003, docker-002, sec-001
Stage 5 (parallel): ci-001, sec-002, doc-001
Stage 6 (parallel): doc-002
```

Seven stages. Maximum parallelism of 7 in Stage 1. The Orchestrator can spin up seven specialist CLIs simultaneously for that stage, each working on an independent task with well-defined inputs and outputs.

The critical path runs through: `db-001 → db-003 → auth-002 → auth-004 → test-002 → ci-001 → doc-002` --- seven sequential tasks that determine the minimum wall-clock time for the project, regardless of how much parallelism you throw at it.

---

## 8.4 Inside Claude Code's Planning Mode

Before building our own planning system, let's study the one Anthropic already built. Claude Code has a two-tool planning mechanism that reveals how the engineers at Anthropic think about plan-then-execute workflows.

### EnterPlanMode

The `EnterPlanMode` tool transitions the agent from execution mode to planning mode. Here's what happens internally when it fires:

1. **Permission context shifts.** The `prePlanMode` field on the `ToolPermissionContext` stores the agent's current permission mode (e.g., `auto`, `default`). Planning mode restricts the tool set --- the agent can *read* files, *search* the codebase, and *explore*, but it cannot *write* files, *execute* bash commands, or *modify* anything.

2. **A plan file path is generated.** Claude Code uses a word-slug system (`generateWordSlug()`) to create a unique, human-readable filename like `~/.claude/plans/graceful-dancing-neptune.md`. This is where the plan gets written.

3. **The agent explores freely.** In plan mode, the agent uses `GlobTool`, `GrepTool`, and `ReadTool` to understand the codebase, existing patterns, and architectural constraints. It's doing exactly what our Planner CLI does --- reconnaissance before commitment.

4. **The plan is written to the plan file.** The agent writes a structured markdown plan to the generated file path. Not to the conversation. To a *file*. This is a crucial design decision --- plans as persistent artifacts, not ephemeral conversation turns.

The `EnterPlanMode` prompt distinguishes between two use cases worth noting. The external prompt (for non-Anthropic users) encourages plan mode for "any non-trivial implementation task" and lists seven trigger conditions: new feature implementation, multiple valid approaches, code modifications, architectural decisions, multi-file changes, unclear requirements, and user preference questions. The internal Anthropic prompt is significantly more conservative --- it only recommends plan mode for "genuine ambiguity" and explicitly says to "just get started" when the implementation path is reasonably clear.

This asymmetry is revealing. Anthropic's own engineers trust the model to make good inline decisions; external users benefit from more structured planning. For our multi-CLI system, we take the aggressive planning approach --- every request above a complexity threshold gets a dedicated plan.

### ExitPlanMode

The `ExitPlanMode` tool is where the real machinery lives. When the agent calls `ExitPlanMode`:

1. **The plan file is read from disk.** The tool doesn't accept the plan as a parameter --- it reads the file the agent wrote during plan mode. This prevents the plan from being lost to context compaction.

2. **For standalone sessions:** The plan is displayed to the user for approval. Accept, reject with feedback, or cancel.

3. **For teammate agents (`isPlanModeRequired`):** The plan is sent to the team leader via mailbox (`writeToMailbox`) as a `plan_approval_request`. The leader reviews and approves or rejects. This is the multi-agent pattern we're implementing.

4. **Permission mode restores.** On approval, the agent's permission mode reverts to `prePlanMode` --- the mode it was in before entering plan mode. The agent can now write files, run commands, and implement the approved plan.

5. **Circuit breaker defense.** A safety mechanism prevents `ExitPlanMode` from accidentally bypassing auto-mode circuit breakers. If the pre-plan mode was an auto-like mode but the circuit breaker tripped during planning, the agent reverts to `default` mode instead. Without this, planning could be exploited as a permission escalation vector.

The V2 implementation also tracks `hasExitedPlanModeInSession` --- a boolean that prevents the agent from entering plan mode repeatedly in the same session, which would be a sign of confused or looping behavior.

Here's the architectural insight: **Claude Code's planning system treats plans as first-class artifacts, not conversation messages.** Plans are written to files, read from files, and survive context compaction. Our Planner CLI takes this principle further --- plans are structured JSON documents that get validated, visualized, and transmitted to the Orchestrator as typed data.

---

## 8.5 ULTRAPLAN Integration --- Remote Opus for Complex Decisions

ULTRAPLAN is one of Claude Code's most powerful hidden features, gated behind `feature('ULTRAPLAN')` and currently internal to Anthropic. Understanding how it works is essential for building a production-grade Planner CLI, because it demonstrates the pattern for delegating planning to a more capable model when the stakes justify the cost.

### How ULTRAPLAN Works

The mechanism is elegant:

1. **Local client detects a complex planning request.** When `feature('ULTRAPLAN')` is enabled and the user enters a prompt that triggers plan mode, the REPL offers an "ULTRAPLAN" option alongside the standard plan mode.

2. **A remote CCR session is created.** ULTRAPLAN uses Claude Code's Bridge Mode infrastructure to spawn a remote Cloud Compute Runtime session running Opus 4.6 --- Anthropic's most powerful model. The session is configured with `plan_mode_required` via a `set_permission_mode` control request.

3. **The remote Opus instance plans autonomously.** For up to 30 minutes (`ULTRAPLAN_TIMEOUT_MS = 30 * 60 * 1000`), the remote session explores the codebase, reasons about architecture, evaluates tradeoffs, and writes a comprehensive plan to the plan file. It has the full tool set available for read operations --- `GlobTool`, `GrepTool`, `ReadTool`, `WebSearchTool`, `WebFetchTool`.

4. **The local client polls for completion.** The `ExitPlanModeScanner` class polls the remote session events every 3 seconds (`POLL_INTERVAL_MS = 3000`), watching for an `ExitPlanMode` tool call with an approved result. It handles transient network errors with a 5-failure tolerance (`MAX_CONSECUTIVE_FAILURES = 5`).

5. **Plan extraction and teleportation.** When the remote session's plan is approved, the scanner extracts the plan text from the `ExitPlanMode` tool result. If the user clicks "teleport back to terminal," the plan text follows the `__ULTRAPLAN_TELEPORT_LOCAL__` sentinel marker, and the local client receives the full plan without needing to read the remote plan file.

6. **Phase tracking for UI.** The scanner tracks three phases: `running` (Opus is working), `needs_input` (Opus asked a question), and `plan_ready` (Opus called `ExitPlanMode`). This drives the pill badge in Claude Code's terminal UI.

### Implementing ULTRAPLAN in the Planner CLI

For our multi-CLI system, we adapt ULTRAPLAN's architecture into a tiered planning system:

```typescript
interface PlannerConfig {
  // Tier 1: Fast planning for simple tasks (< 5 sub-tasks expected)
  fastModel: string;      // e.g., 'claude-sonnet-4-20250514'
  fastTimeout: number;    // 60 seconds
  
  // Tier 2: Standard planning (5-20 sub-tasks)
  standardModel: string;  // e.g., 'claude-sonnet-4-20250514' with extended thinking
  standardTimeout: number; // 5 minutes
  
  // Tier 3: Deep planning (20+ sub-tasks, architectural decisions)
  deepModel: string;      // e.g., 'claude-opus-4-20250514'
  deepTimeout: number;    // 30 minutes (ULTRAPLAN-equivalent)
}

async function selectPlanningTier(
  request: string,
  codebaseContext: CodebaseContext
): Promise<'fast' | 'standard' | 'deep'> {
  // Heuristic-based tier selection
  const indicators = {
    multipleServices: /microservice|distributed|multi.?service/i.test(request),
    securityCritical: /auth|security|encrypt|credential|secret/i.test(request),
    infraRequired: /ci\/cd|deploy|docker|kubernetes|terraform/i.test(request),
    fullStack: /frontend.*backend|full.?stack|api.*ui/i.test(request),
    largeCodebase: codebaseContext.fileCount > 500,
    existingArchitecture: codebaseContext.hasArchitectureDocs,
  };

  const complexity = Object.values(indicators).filter(Boolean).length;

  if (complexity >= 4) return 'deep';
  if (complexity >= 2) return 'standard';
  return 'fast';
}
```

The deep planning tier mirrors ULTRAPLAN's behavior: spawn a subprocess (or remote session) running the most capable model, give it extended time and full read access to the codebase, and poll for the structured plan artifact. The key difference is that our Planner CLI does this as its *primary function*, not as an optional upgrade path.

---

## 8.6 Architecture Decision Records --- Auto-Documenting the "Why"

Every non-trivial plan involves decisions. JWT vs. session tokens. PostgreSQL vs. MongoDB. Express vs. Fastify. Rate limiting in Redis vs. in-memory. These decisions have context (why this choice made sense), consequences (what tradeoffs were accepted), and alternatives (what was considered and rejected).

Most teams lose this context within weeks. The developer who chose JWT over sessions leaves. The Jira ticket says "implement auth" but not *why* JWT was chosen. Six months later, someone tries to add OAuth federation and discovers that the JWT architecture makes it painful --- and there's no record of whether OAuth was considered and rejected or simply never evaluated.

The Planner CLI generates Architecture Decision Records (ADRs) automatically, as a first-class output alongside the task graph.

### ADR Template

```typescript
interface ArchitectureDecisionRecord {
  id: string;           // e.g., "ADR-001"
  title: string;        // e.g., "Use JWT for API Authentication"
  status: 'proposed' | 'accepted' | 'deprecated' | 'superseded';
  context: string;      // What forces are at play
  decision: string;     // What was decided
  consequences: {
    positive: string[];
    negative: string[];
    neutral: string[];
  };
  alternatives: {
    name: string;
    reason_rejected: string;
  }[];
  relatedTasks: string[]; // Task IDs from the plan
  date: string;
}

function generateADRMarkdown(adr: ArchitectureDecisionRecord): string {
  return `# ${adr.id}: ${adr.title}

**Status:** ${adr.status}  
**Date:** ${adr.date}

## Context

${adr.context}

## Decision

${adr.decision}

## Consequences

### Positive
${adr.consequences.positive.map(c => `- ${c}`).join('\n')}

### Negative
${adr.consequences.negative.map(c => `- ${c}`).join('\n')}

### Neutral
${adr.consequences.neutral.map(c => `- ${c}`).join('\n')}

## Alternatives Considered

${adr.alternatives.map(a => 
  `### ${a.name}\n**Rejected because:** ${a.reason_rejected}`
).join('\n\n')}

## Related Tasks

${adr.relatedTasks.map(t => `- \`${t}\``).join('\n')}
`;
}
```

For the microservice example, the Planner generates ADRs like:

**ADR-001: Use JWT for API Authentication**
- *Context:* Microservice needs stateless auth for horizontal scaling. No session affinity available behind the load balancer.
- *Decision:* RS256 JWT with 15-minute access tokens and 7-day refresh tokens stored in the database.
- *Alternatives rejected:* Session-based auth (requires sticky sessions or shared session store), API keys (no user identity), OAuth-only (too complex for internal service).
- *Related tasks:* auth-001, auth-002, auth-003

**ADR-002: PostgreSQL with Prisma ORM**
- *Context:* Relational data model with user-role relationships. Team has existing PostgreSQL expertise.
- *Decision:* PostgreSQL 16 with Prisma ORM for type-safe queries and migration management.
- *Alternatives rejected:* MongoDB (poor fit for relational data), raw SQL with pg driver (maintenance burden), TypeORM (less active maintenance).
- *Related tasks:* db-001 through db-006

These ADRs become part of the plan artifact. When the Documentation CLI generates project documentation later, it has a structured record of *why* every architectural choice was made.

---

## 8.7 Mermaid Diagram Generation --- Visualizing the Architecture

A plan that exists only as text is a plan that gets misunderstood. The Planner CLI generates Mermaid diagrams for three aspects of every plan: the system architecture, the data flow, and the task dependency graph itself.

### System Architecture Diagram

```typescript
function generateArchitectureDiagram(
  tasks: TaskNode[], 
  adrs: ArchitectureDecisionRecord[]
): string {
  // Analyze tasks to identify system components
  const components = extractComponents(tasks);
  
  let mermaid = `graph TB
    subgraph "Client Layer"
        CLIENT[REST Client]
    end
    
    subgraph "API Layer"
        ROUTER[Express Router]
        AUTH_MW[JWT Auth Middleware]
        RBAC_MW[RBAC Middleware]
        RATE_MW[Rate Limiter]
    end
    
    subgraph "Business Logic"
        USER_SVC[User Service]
        ROLE_SVC[Role Service]
        AUTH_SVC[Auth Service]
    end
    
    subgraph "Data Layer"
        PRISMA[Prisma ORM]
        PG[(PostgreSQL)]
        REDIS[(Redis Cache)]
    end
    
    CLIENT --> RATE_MW --> AUTH_MW --> RBAC_MW --> ROUTER
    ROUTER --> USER_SVC & ROLE_SVC & AUTH_SVC
    USER_SVC & ROLE_SVC & AUTH_SVC --> PRISMA --> PG
    RATE_MW -.-> REDIS
    AUTH_SVC -.-> REDIS
`;

  return mermaid;
}
```

### Task Dependency Graph

```typescript
function generateDependencyDiagram(graph: DependencyGraph): string {
  const stages = graph.computeExecutionStages();
  let mermaid = 'graph LR\n';

  // Color-code by specialist
  const colors: Record<SpecialistType, string> = {
    coder: '#4A90D9',
    security: '#E74C3C',
    qa: '#2ECC71',
    devops: '#F39C12',
    documentation: '#9B59B6',
    research: '#1ABC9C',
  };

  for (const [stageIdx, stage] of stages.entries()) {
    mermaid += `    subgraph "Stage ${stageIdx}"\n`;
    for (const task of stage) {
      mermaid += `        ${task.id}["${task.title}"]\n`;
    }
    mermaid += '    end\n';
  }

  // Add dependency edges
  for (const task of graph.getAllTasks()) {
    for (const dep of task.dependencies) {
      mermaid += `    ${dep} --> ${task.id}\n`;
    }
  }

  // Add styling
  for (const task of graph.getAllTasks()) {
    mermaid += `    style ${task.id} fill:${colors[task.specialist]},color:#fff\n`;
  }

  return mermaid;
}
```

### Data Flow Diagram

The Planner also generates sequence diagrams showing how data flows through the system during key operations:

```typescript
function generateAuthFlowDiagram(): string {
  return `sequenceDiagram
    participant C as Client
    participant RL as Rate Limiter
    participant A as Auth Middleware
    participant R as RBAC Middleware
    participant API as API Handler
    participant DB as PostgreSQL
    participant Redis as Redis Cache

    C->>RL: POST /api/users (+ JWT)
    RL->>Redis: Check rate limit
    Redis-->>RL: 42/100 requests
    RL->>A: Forward request
    A->>A: Validate JWT signature (RS256)
    A->>Redis: Check token blacklist
    Redis-->>A: Token valid
    A->>R: Forward with user context
    R->>DB: SELECT permissions FROM roles
    DB-->>R: ["users:read", "users:write"]
    R->>API: Forward (authorized)
    API->>DB: Query/mutation
    DB-->>API: Result
    API-->>C: 200 OK + response body
`;
}
```

These diagrams are embedded in the plan artifact and rendered by the Documentation CLI when generating project documentation. They're also displayed in the Orchestrator's status dashboard, giving the human operator a visual overview of what's being built.

---

## 8.8 The Planner CLI CLAUDE.md Template

Here is the complete system prompt for the Planner CLI. This is what transforms a generic Claude Code instance into a specialized planning agent.

```markdown
# CLAUDE.md — Planner CLI (The Architect)

## Identity

You are the Planner CLI, the architectural brain of a multi-CLI agent system. 
Your sole function is transforming vague human requests into precise, 
dependency-ordered, resource-annotated execution plans. You never write 
application code. You never run tests. You never deploy.

## Core Protocol

When you receive a planning request:

1. **EXPLORE** — Read the existing codebase. Use Glob, Grep, and Read tools 
   to understand conventions, patterns, existing architecture, and constraints.
   Minimum 5 file reads before producing any plan.

2. **DECOMPOSE** — Break the request into atomic tasks using recursive 
   decomposition. Each atomic task must satisfy ALL criteria:
   - Assignable to exactly ONE specialist (coder/security/qa/devops/docs)
   - Touches ≤ 5 files
   - Completable in < 10,000 tokens
   - Has well-defined inputs and outputs
   - Contains no unresolved architectural decisions

3. **CONNECT** — Build the dependency graph. Every task must declare:
   - dependencies: task IDs that must complete before this task starts
   - inputs: file paths or artifact IDs this task needs
   - outputs: file paths or artifacts this task produces
   Validate the graph is a DAG (no cycles). Run cycle detection before output.

4. **DECIDE** — For every non-trivial architectural choice, generate an 
   Architecture Decision Record (ADR) with:
   - Context (what forces are at play)
   - Decision (what was chosen)
   - Consequences (positive, negative, neutral)
   - Alternatives considered and reasons for rejection

5. **VISUALIZE** — Generate Mermaid diagrams:
   - System architecture (component relationships)
   - Task dependency graph (execution stages, color-coded by specialist)
   - Data flow diagrams for critical paths (auth, data pipeline, etc.)

6. **VALIDATE** — Before outputting the plan:
   - Verify no circular dependencies
   - Verify every code task has a corresponding test task
   - Verify security-sensitive tasks have security review tasks
   - Verify the plan has a documentation task
   - Flag tasks force-atomized at max depth for human review

## Output Format

Your output is ALWAYS a structured JSON plan artifact:

```json
{
  "planId": "plan-<uuid>",
  "request": "<original user request>",
  "tasks": [TaskNode],
  "adrs": [ArchitectureDecisionRecord],
  "diagrams": {
    "architecture": "<mermaid string>",
    "dependencies": "<mermaid string>",
    "dataFlow": "<mermaid string>"
  },
  "stats": {
    "totalTasks": 25,
    "executionStages": 7,
    "maxParallelism": 7,
    "criticalPathLength": 7,
    "estimatedTotalTokens": 150000
  },
  "warnings": ["<any validation warnings>"]
}
```

## Decomposition Heuristics

- If a task description contains "and" joining two unrelated actions → split
- If a task touches both frontend and backend → split by layer
- If a task requires two different specialists → split by expertise
- If estimated tokens exceed 10K → split into smaller scoped tasks
- Every database schema change needs a migration task + seed task
- Every API endpoint needs a test task + documentation task
- Every auth component needs a security review task

## Stop Conditions for Decomposition

Stop decomposing when:
- Task is a single file creation/modification
- Task is a single configuration change
- Task is a single test file
- Depth reaches 4 (force-atomize and flag for review)

## Specialist Assignment Rules

| Task Pattern | Specialist |
|---|---|
| Database schema, API routes, business logic, utilities | coder |
| Auth, encryption, access control, input validation | security |
| Unit tests, integration tests, E2E tests, test fixtures | qa |
| Docker, CI/CD, deployment, infrastructure | devops |
| README, API docs, ADRs, architecture docs | documentation |
| Technology evaluation, library comparison | research |

## Anti-Patterns to Avoid

1. **Over-planning**: Don't decompose simple tasks (< 3 files, clear approach).
   Not every bug fix needs 15 sub-tasks.
2. **Circular dependencies**: Always validate the DAG. If A depends on B and 
   B depends on A, one dependency is wrong — remove it.
3. **Missing validation**: Every code task needs a test task downstream.
4. **God tasks**: No single task should touch > 5 files or require > 10K tokens.
5. **Phantom dependencies**: Don't add dependencies "just to be safe." Every 
   edge must represent a real data or artifact dependency.
```

---

## 8.9 How the Planner Feeds Work Items to the Orchestrator

The Planner produces a structured plan artifact. The Orchestrator consumes it. The interface between them is the critical contract that makes the system work.

### The Plan Artifact Schema

```typescript
interface PlanArtifact {
  planId: string;
  version: number;
  request: string;
  createdAt: string;
  
  tasks: TaskNode[];
  adrs: ArchitectureDecisionRecord[];
  diagrams: PlanDiagrams;
  stats: PlanStats;
  warnings: string[];
  
  // Metadata for the Orchestrator
  executionHints: {
    /** Suggested specialist concurrency limit */
    maxParallelWorkers: number;
    /** Tasks that should be dispatched to the same CLI instance */
    affinityGroups: string[][];
    /** Estimated total wall-clock time in minutes */
    estimatedDuration: number;
  };
}
```

### The Handoff Protocol

The communication between Planner and Orchestrator follows a strict request-response pattern:

```typescript
// 1. Orchestrator sends planning request
interface PlanRequest {
  type: 'plan_request';
  requestId: string;
  userPrompt: string;
  codebaseContext: {
    rootPath: string;
    language: string;
    framework: string;
    existingFiles: string[];  // key file paths
  };
  constraints?: {
    maxTasks?: number;
    excludeSpecialists?: SpecialistType[];
    prioritize?: 'speed' | 'quality' | 'security';
  };
}

// 2. Planner returns structured plan
interface PlanResponse {
  type: 'plan_response';
  requestId: string;
  status: 'success' | 'needs_clarification' | 'error';
  plan?: PlanArtifact;
  clarificationQuestions?: string[];
  error?: string;
}

// 3. Orchestrator processes the plan
async function processPlanResponse(
  response: PlanResponse
): Promise<void> {
  if (response.status === 'needs_clarification') {
    // Route questions back to user via Orchestrator
    const answers = await askUser(response.clarificationQuestions!);
    // Re-submit with answers as additional context
    return requestPlan({ ...originalRequest, clarifications: answers });
  }

  if (response.status === 'error') {
    throw new PlanningError(response.error!);
  }

  const plan = response.plan!;
  
  // Validate the plan independently
  const graph = buildGraphFromPlan(plan);
  const validation = validatePlan(graph);
  
  if (!validation.valid) {
    // Return to Planner with validation errors
    return requestPlanRevision(plan, validation.errors);
  }

  // Log warnings but proceed
  for (const warning of validation.warnings) {
    logger.warn(`Plan warning: ${warning.message}`);
  }

  // Compute execution stages and begin dispatch
  const stages = graph.computeExecutionStages();
  await executeStages(stages, plan.executionHints);
}
```

### Affinity Groups

The `affinityGroups` field in execution hints is subtle but important. Some tasks --- even if they could theoretically run on different specialist instances --- benefit from running on the *same* CLI instance because they share codebase state.

For example, `auth-001` (JWT token generation) and `auth-002` (token validation middleware) both work in the `src/auth/` directory. If dispatched to different CLI instances, each would independently read the same files, consuming duplicate tokens. If dispatched to the same instance with the `auth-001` result already in context, `auth-002` can build directly on that context.

```typescript
function computeAffinityGroups(tasks: TaskNode[]): string[][] {
  const groups: Map<string, string[]> = new Map();
  
  for (const task of tasks) {
    // Group by shared output directories
    for (const output of task.outputs) {
      const dir = path.dirname(output);
      if (!groups.has(dir)) groups.set(dir, []);
      groups.get(dir)!.push(task.id);
    }
  }

  // Only return groups with > 1 task
  return [...groups.values()].filter(g => g.length > 1);
}
```

The Orchestrator uses affinity groups as *hints*, not constraints. If a specialist CLI is overloaded, the Orchestrator can still dispatch affinity-group tasks to different instances --- it just prefers to keep them together when capacity allows.

---

## 8.10 Planning Anti-Patterns

Every system has failure modes. The Planner CLI is no exception. Here are the patterns that destroy planning quality, learned from building and operating multi-CLI agent systems.

### Anti-Pattern 1: Over-Planning

**Symptom:** User asks "Fix the typo in the README" and the Planner generates a 12-task plan with a dependency graph, an ADR explaining the decision to use correct spelling, and a Mermaid diagram of the README's information architecture.

**Root cause:** The Planner is applied indiscriminately to all requests, regardless of complexity.

**Fix:** Implement a complexity gate. Requests below a threshold skip the Planner entirely and go directly to a specialist:

```typescript
function shouldPlan(request: string, context: CodebaseContext): boolean {
  const complexitySignals = [
    /\band\b.*\band\b/i.test(request),      // Multiple "and" conjunctions
    request.split(/[,;]/).length > 3,         // Multiple comma-separated items
    /architect|design|system|infrastructure/i.test(request),
    context.fileCount > 100,
    /auth|security|deploy|migrate/i.test(request),
  ];
  
  return complexitySignals.filter(Boolean).length >= 2;
}
```

### Anti-Pattern 2: Circular Dependencies

**Symptom:** The plan deadlocks. Task A waits for Task B, which waits for Task A. The Orchestrator logs fill up with "waiting for dependency" messages. Nothing executes.

**Root cause:** The Planner inferred a bidirectional relationship ("auth needs the database schema" AND "the database schema needs to know the auth token structure") without recognizing the cycle.

**Fix:** Always validate the DAG with cycle detection before output. When a cycle is detected, resolve it by:
1. Identifying which dependency is weaker (usually the reverse direction)
2. Breaking the cycle by removing the weaker edge
3. Adding a shared artifact that both tasks can reference independently

```typescript
function breakCycle(cycleNodes: string[], graph: DependencyGraph): void {
  // Find the edge with the weakest justification
  let weakestEdge = { from: '', to: '', score: Infinity };
  
  for (let i = 0; i < cycleNodes.length; i++) {
    const from = cycleNodes[i];
    const to = cycleNodes[(i + 1) % cycleNodes.length];
    const score = edgeStrength(from, to, graph);
    if (score < weakestEdge.score) {
      weakestEdge = { from, to, score };
    }
  }
  
  // Remove weakest edge
  graph.removeDependency(weakestEdge.to, weakestEdge.from);
  
  // Add a shared interface task that both can depend on
  const interfaceTask: TaskNode = {
    id: `interface-${weakestEdge.from}-${weakestEdge.to}`,
    title: `Define shared interface between ${weakestEdge.from} and ${weakestEdge.to}`,
    specialist: 'coder',
    dependencies: [],
    // ... other fields
  };
  graph.addTask(interfaceTask);
  graph.addDependency(weakestEdge.from, interfaceTask.id);
  graph.addDependency(weakestEdge.to, interfaceTask.id);
}
```

### Anti-Pattern 3: Missing Validation Tasks

**Symptom:** The plan produces code but no tests. The Orchestrator dispatches all code tasks, marks the plan as "complete," and the resulting codebase has zero test coverage. The first bug report arrives within hours.

**Root cause:** The Planner's decomposition algorithm doesn't enforce the invariant that every code-producing task must have a downstream test task.

**Fix:** Add a post-decomposition validation pass:

```typescript
function ensureValidationCoverage(tasks: TaskNode[]): TaskNode[] {
  const codeTasks = tasks.filter(t => 
    t.specialist === 'coder' && 
    t.outputs.some(o => o.endsWith('.ts') || o.endsWith('.js'))
  );
  
  const additionalTasks: TaskNode[] = [];
  
  for (const codeTask of codeTasks) {
    const hasTest = tasks.some(t => 
      t.specialist === 'qa' && 
      t.dependencies.includes(codeTask.id)
    );
    
    if (!hasTest) {
      additionalTasks.push({
        id: `test-auto-${codeTask.id}`,
        title: `Write tests for ${codeTask.title}`,
        specialist: 'qa',
        dependencies: [codeTask.id],
        inputs: codeTask.outputs,
        outputs: codeTask.outputs.map(o => 
          o.replace(/\.(ts|js)$/, '.test.$1')
        ),
        validationCriteria: ['All tests pass', 'Coverage > 80%'],
        estimatedTokens: 5000,
        isAtomic: true,
        description: `Generate unit tests for outputs of ${codeTask.id}`,
      });
    }
  }

  return [...tasks, ...additionalTasks];
}
```

### Anti-Pattern 4: The God Task

**Symptom:** One task in the plan is "Implement the authentication system." It has no sub-tasks. Its estimated token count is 50,000. It's assigned to a single specialist. It inevitably fails because the specialist's context window can't hold all the auth logic, middleware, token management, and RBAC in a single session.

**Root cause:** The decomposition algorithm stopped too early, or the max-depth limit was reached and the force-atomization flag was ignored.

**Fix:** Hard-enforce the 10K token limit. Any task exceeding it gets flagged and re-decomposed, even if it means exceeding the max depth:

```typescript
function enforceTokenLimits(tasks: TaskNode[]): TaskNode[] {
  const oversized = tasks.filter(t => t.estimatedTokens > 10_000);
  
  if (oversized.length > 0) {
    console.warn(
      `${oversized.length} tasks exceed 10K token limit: ` +
      oversized.map(t => t.id).join(', ')
    );
    // Force re-decomposition with raised depth limit
    for (const task of oversized) {
      task.isAtomic = false;
      task.validationCriteria.push(
        'WARNING: Re-decomposed due to token limit violation'
      );
    }
  }
  
  return tasks;
}
```

### Anti-Pattern 5: Phantom Dependencies

**Symptom:** The plan has 25 tasks but only 2 execution stages because almost every task depends on almost every other task. Maximum parallelism is 2. What should take 10 minutes takes 90 minutes.

**Root cause:** The Planner added "safety" dependencies --- "the CI/CD pipeline depends on the README" or "the rate limiter depends on the database schema" --- that represent no actual data or artifact dependency.

**Fix:** Every dependency edge must answer the question: *"What specific artifact does Task B need from Task A?"* If the answer is "nothing specific, it just seems like A should come first," the edge is phantom and should be removed.

```typescript
function prunePhantomDependencies(tasks: TaskNode[]): TaskNode[] {
  for (const task of tasks) {
    task.dependencies = task.dependencies.filter(depId => {
      const dep = tasks.find(t => t.id === depId);
      if (!dep) return false;
      
      // Check if any output of the dependency is an input of this task
      const hasRealArtifactLink = dep.outputs.some(output => 
        task.inputs.includes(output)
      );
      
      if (!hasRealArtifactLink) {
        console.warn(
          `Pruning phantom dependency: ${task.id} → ${depId} ` +
          `(no shared artifacts)`
        );
      }
      
      return hasRealArtifactLink;
    });
  }
  
  return tasks;
}
```

---

## Key Takeaways

- **Separate planning from execution.** A dedicated Planner CLI produces better plans because its entire context budget is spent on decomposition and architectural reasoning, not task dispatch.

- **Recursive decomposition with stop conditions** turns vague requests into 25+ atomic tasks. Each atomic task is assignable to one specialist, touches five or fewer files, and completes in under 10,000 tokens.

- **The dependency graph is a DAG**, validated with Kahn's algorithm for topological sorting and cycle detection. Execution stages determine which tasks can run in parallel.

- **Claude Code's planning internals** --- `EnterPlanMode`, `ExitPlanMode`, plan files, and the `prePlanMode` permission restoration --- demonstrate that plans should be *persistent artifacts*, not conversation messages.

- **ULTRAPLAN shows the pattern** for delegating complex planning to a more capable model. A tiered planning system (fast/standard/deep) matches planning resources to request complexity.

- **ADRs are non-negotiable.** Every architectural decision in the plan gets a structured record with context, decision, consequences, and alternatives. This is how teams avoid losing institutional knowledge.

- **Mermaid diagrams** make plans visual. System architecture, dependency graphs, and data flow diagrams turn abstract task lists into concrete system designs.

- **The Orchestrator receives a structured artifact**, not a conversation transcript. The `PlanArtifact` schema defines the contract: tasks, ADRs, diagrams, stats, and execution hints including affinity groups.

- **Five anti-patterns** will destroy your planning: over-planning simple tasks, circular dependencies, missing validation tasks, god tasks that exceed context windows, and phantom dependencies that serialize naturally parallel work.

The Planner CLI is the difference between a team that builds by improvisation and a team that builds from blueprints. In Chapter 9, we'll build the specialist that turns those blueprints into code --- the Coder CLI.
