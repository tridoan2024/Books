# Chapter 34: Coordinator Mode

Chapter 33 examined the swarm system's in-process teammate architecture -- how agents are spawned inside the same process boundary, how `AsyncLocalStorage` provides context isolation, and how mailboxes enable message passing between teammates. That system handles the common case: a handful of agents collaborating within a single session. But some tasks demand more. When you need to orchestrate dozens of agents across multiple processes, enforce strict resource budgets, manage dynamic team composition, and build hierarchical command structures that can recurse three levels deep, you need a different abstraction. You need Coordinator Mode.

Coordinator Mode is the control plane that sits above the swarm. It is not a replacement for in-process teammates -- it is an orchestration layer that manages agents as external resources with strict lifecycle rules, token budgets, tool restrictions, and audit logging. If the swarm system from Chapter 33 is a shared office where teammates work side by side, Coordinator Mode is the operations center that dispatches field teams, tracks their progress, and enforces organizational constraints.

This chapter covers five interconnected systems: the coordinator mode restricted execution environment, the plan-based coordinator that decomposes goals into dependency graphs, the team management layer with templates and shared context, the tmux-based pyramid architecture for dynamic hierarchical teams, and the scratchpad mechanism that enables durable cross-worker communication. Together, these 10,235 lines of Rust across nine source files form the most sophisticated multi-agent orchestration system in the codebase.

---

## 34.1 The Coordinator Mode Execution Environment

The coordinator mode execution environment lives in `swarm/coordinator_mode.rs` (1,201 lines). Its job is deceptively simple: restrict what a coordinating agent can do, manage the agents it controls, and enforce resource limits that prevent runaway orchestration from consuming unbounded tokens or time.

### Activation and Detection

Coordinator mode is activated via an environment variable -- a deliberately low-tech mechanism that ensures every subprocess can detect whether it is running inside a coordinated session:

```rust
const COORDINATOR_ENV: &str = "RCODE_COORDINATOR_MODE";

pub fn enter_coordinator_mode(config: CoordinatorConfig) -> CoordinatorState {
    std::env::set_var(COORDINATOR_ENV, "1");
    // Initialize event logger, agent registry, task queue
    CoordinatorState::new(config)
}

pub fn exit_coordinator_mode(state: &mut CoordinatorState) {
    std::env::remove_var(COORDINATOR_ENV);
    state.shutdown();
}

pub fn is_coordinator() -> bool {
    std::env::var(COORDINATOR_ENV)
        .map(|v| v == "1")
        .unwrap_or(false)
}
```

Why an environment variable instead of a struct field or global state? Because coordinator mode spans process boundaries. When the coordinator spawns a child agent via tmux, that child process needs to know it is operating under coordination constraints. Environment variables are inherited by child processes automatically. No IPC required, no handshake protocol, no race condition where the child starts executing before the coordination context is established.

### Configuration and Resource Limits

The coordinator's configuration defines the operational envelope:

```rust
pub struct CoordinatorConfig {
    pub max_agents: usize,                    // Default: 8
    pub restricted_tools: Vec<CoordinatorTool>,
    pub task_timeout: Duration,               // Default: 300s
    pub resource_limits: ResourceLimits,
    pub session_label: Option<String>,
}

pub struct ResourceLimits {
    pub max_total_tokens: u64,                // 500,000
    pub max_tokens_per_agent: u64,            // 100,000
    pub max_session_duration: Duration,       // 30 minutes
    pub max_disk_bytes: u64,                  // 100 MB
}
```

These defaults are not arbitrary. The 500,000 total token budget reflects the practical ceiling where orchestration overhead starts to dominate useful work -- beyond this, you are spending more tokens coordinating agents than the agents spend solving problems. The 100,000 per-agent limit prevents a single runaway agent from consuming the entire budget. The 30-minute session duration is a safety valve against coordination deadlocks where agents wait on each other indefinitely.

The 100 MB disk limit deserves special attention. Agents write intermediate results, scratchpad files, and temporary artifacts. Without a disk budget, a coordinator could orchestrate agents that collectively fill the disk -- particularly dangerous in CI/CD environments where disk exhaustion affects all running jobs. The limit is checked before each task dispatch, not continuously polled, which keeps the overhead negligible.

### Tool Restriction

The coordinator operates with a whitelist of exactly ten tools:

```rust
pub enum CoordinatorTool {
    TeamCreate,
    TeamDelete,
    SendMessage,
    SyntheticOutput,
    TaskCreate,
    TaskUpdate,
    TaskStop,
    TaskGet,
    TaskList,
    Agent,
}
```

Notice what is absent: `Bash`, `FileRead`, `FileWrite`, `Grep`, `Glob`. The coordinator cannot directly execute commands, read files, or modify the filesystem. It can only manage agents and tasks. This is the principle of least privilege applied to orchestration -- the coordinator's job is to delegate, not to do. If the coordinator could directly read and write files, there would be no reason to spawn agents at all, and the tool restriction would be meaningless.

Tool validation happens at parse time:

```rust
impl CoordinatorTool {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "TeamCreate" => Some(Self::TeamCreate),
            "TeamDelete" => Some(Self::TeamDelete),
            "SendMessage" => Some(Self::SendMessage),
            // ... remaining matches
            _ => None,
        }
    }

    pub fn is_allowed(tool_name: &str, config: &CoordinatorConfig) -> bool {
        Self::from_str(tool_name)
            .map(|t| config.restricted_tools.contains(&t))
            .unwrap_or(false)
    }
}
```

Any tool call not in the whitelist is rejected before execution. The coordinator agent receives feedback that the tool was blocked, allowing it to adjust its approach -- typically by delegating the work to an agent that does have the necessary tool access.

### Agent Lifecycle

Agents under coordination follow a strict state machine:

```
                ┌─────────┐
                │  Idle   │◄──────────────────┐
                └────┬────┘                   │
                     │ dispatch_task()         │ reset_agent()
                     ▼                        │
                ┌─────────┐                   │
                │ Working │───────────────────┤
                │{task_id}│                   │
                └────┬────┘                   │
                     │                        │
              ┌──────┴──────┐                 │
              ▼             ▼                 │
        ┌───────────┐ ┌──────────┐           │
        │ Completed │ │  Failed  │           │
        │ {task_id} │ │{task_id, │───────────┘
        └───────────┘ │ reason}  │
                      └──────────┘

        ┌──────────┐
        │ Crashed  │  (terminal — agent process died)
        │{reason}  │
        └──────────┘
```

```rust
pub enum AgentStatus {
    Idle,
    Working { task_id: String },
    Completed { task_id: String },
    Failed { task_id: String, reason: String },
    Crashed { reason: String },
}
```

The `Crashed` state is terminal -- there is no automatic recovery from a crashed agent because the coordinator cannot know whether the agent left shared resources in a corrupt state. Recovery requires explicit intervention: deregister the crashed agent, assess damage, and optionally spawn a replacement. This is a deliberate design choice that favors safety over liveness. In production orchestration, silently restarting a crashed agent can lead to duplicate work, inconsistent state, or infinite crash loops.

Each managed agent tracks its own metrics:

```rust
pub struct ManagedAgent {
    id: String,
    role: String,
    status: AgentStatus,
    tokens_consumed: u64,
    tasks_completed: usize,
    spawned_at: Instant,
}
```

Registration enforces the `max_agents` limit immediately:

```rust
pub fn register_agent(&mut self, id: String, role: String) -> Result<()> {
    if self.agents.len() >= self.config.max_agents {
        return Err(CoordinatorError::AgentLimitReached {
            max: self.config.max_agents,
            current: self.agents.len(),
        });
    }
    self.agents.insert(id.clone(), ManagedAgent {
        id, role, status: AgentStatus::Idle,
        tokens_consumed: 0, tasks_completed: 0,
        spawned_at: Instant::now(),
    });
    Ok(())
}
```

This is a hard limit, not a soft suggestion. If you configure `max_agents: 8`, the ninth registration attempt fails immediately with a clear error. The coordinator must deregister an existing agent before registering a new one. This prevents the common orchestration failure mode where a coordinator keeps spawning agents to handle a growing workload until the system runs out of resources.

---

## 34.2 Task Dispatch and Result Collection

Tasks are the unit of work in coordinator mode. Each task packages a description, an assignment, tool permissions, a deadline, and a priority level:

```rust
pub struct CoordinatorTask {
    pub id: String,
    pub description: String,
    pub assigned_to: String,                 // Agent ID
    pub tools_allowed: Vec<CoordinatorTool>,
    pub deadline: Option<Duration>,
    pub priority: TaskPriority,
    pub metadata: HashMap<String, Value>,
}

pub enum TaskPriority {
    Low = 0,
    Normal = 1,
    High = 2,
    Critical = 3,
}
```

The `tools_allowed` field on a task is a subset of the coordinator's own tool whitelist. This enables fine-grained delegation: you might allow a research agent to use `SendMessage` but not `TeamCreate`, while a lead agent gets the full set. The coordinator validates this subset relationship at dispatch time.

### The Dispatch Pipeline

Task dispatch is not a simple "assign and forget." It performs five checks before the task begins executing:

```rust
pub fn dispatch_task(&mut self, task: CoordinatorTask) -> Result<()> {
    // 1. Check global token budget
    if self.is_token_budget_exceeded() {
        return Err(CoordinatorError::TokenBudgetExceeded);
    }

    // 2. Validate agent exists
    let agent = self.agents.get(&task.assigned_to)
        .ok_or(CoordinatorError::AgentNotFound)?;

    // 3. Validate agent is idle
    if !matches!(agent.status, AgentStatus::Idle) {
        return Err(CoordinatorError::AgentBusy {
            agent_id: task.assigned_to.clone(),
            current_status: agent.status.clone(),
        });
    }

    // 4. Validate tool permissions are a subset of coordinator's
    for tool in &task.tools_allowed {
        if !self.config.restricted_tools.contains(tool) {
            return Err(CoordinatorError::ToolNotAllowed {
                tool: tool.clone(),
            });
        }
    }

    // 5. Transition agent to Working
    let agent = self.agents.get_mut(&task.assigned_to).unwrap();
    agent.status = AgentStatus::Working {
        task_id: task.id.clone(),
    };

    // Log the event
    self.logger.log(CoordinatorEventKind::TaskAssigned {
        task_id: task.id.clone(),
        agent_id: task.assigned_to.clone(),
        priority: task.priority as u32,
    });

    self.pending_tasks.insert(task.id.clone(), task);
    Ok(())
}
```

Check number 3 is worth highlighting: you cannot dispatch a task to a busy agent. The coordinator does not queue tasks on agents. If you want task queuing, you implement it at the coordinator level -- maintaining your own queue and dispatching tasks as agents become idle. This keeps the agent model simple (one task at a time) and puts queuing policy where it belongs: in the orchestration logic, not the agent runtime.

### Result Submission

When an agent completes work, it submits a result:

```rust
pub struct TaskResult {
    pub task_id: String,
    pub agent_id: String,
    pub status: TaskResultStatus,
    pub output: Value,
    pub duration: Duration,
    pub tokens_used: u64,
}

pub enum TaskResultStatus {
    Success,
    Failed,
    TimedOut,
    Cancelled,
}
```

The result submission updates agent metrics and enforces per-agent token budgets:

```rust
pub fn submit_result(&mut self, result: TaskResult) -> Result<()> {
    let agent = self.agents.get_mut(&result.agent_id)
        .ok_or(CoordinatorError::AgentNotFound)?;

    // Update metrics
    agent.tokens_consumed += result.tokens_used;
    agent.tasks_completed += 1;
    agent.status = AgentStatus::Idle;

    // Check per-agent token budget
    if agent.tokens_consumed > self.config.resource_limits.max_tokens_per_agent {
        self.logger.log(CoordinatorEventKind::AgentBudgetExceeded {
            agent_id: result.agent_id.clone(),
            tokens: agent.tokens_consumed,
            limit: self.config.resource_limits.max_tokens_per_agent,
        });
    }

    // Log completion or failure
    match result.status {
        TaskResultStatus::Success => {
            self.logger.log(CoordinatorEventKind::TaskCompleted {
                task_id: result.task_id.clone(),
                agent_id: result.agent_id.clone(),
                tokens: result.tokens_used,
            });
        }
        _ => {
            self.logger.log(CoordinatorEventKind::TaskFailed {
                task_id: result.task_id.clone(),
                agent_id: result.agent_id.clone(),
                reason: format!("{:?}", result.status),
            });
        }
    }

    self.results.push(result);
    Ok(())
}
```

Notice that exceeding the per-agent budget logs a warning but does not kill the agent. This is a monitoring signal, not a hard stop. The reason: you might want to finish the current task even though the agent has exceeded its budget, rather than losing partial work. The hard stop happens at dispatch time -- `is_token_budget_exceeded()` checks the global budget and prevents new tasks from being dispatched to over-budget agents.

### Event Logging

Every state change is logged to a JSONL file at `~/.rcode/coordinator/events.jsonl`:

```rust
pub struct CoordinatorEvent {
    pub timestamp_ms: u64,
    pub kind: CoordinatorEventKind,
    pub session_label: Option<String>,
}

pub enum CoordinatorEventKind {
    CoordinatorStarted,
    CoordinatorStopped,
    AgentSpawned { agent_id: String, role: String },
    TaskAssigned { task_id: String, agent_id: String, priority: u32 },
    TaskCompleted { task_id: String, agent_id: String, tokens: u64 },
    TaskFailed { task_id: String, agent_id: String, reason: String },
    AgentCrashed { agent_id: String, reason: String },
    AgentBudgetExceeded { agent_id: String, tokens: u64, limit: u64 },
}
```

JSONL (one JSON object per line) is chosen over structured databases or binary formats for a simple reason: it is append-only and human-readable. You can `tail -f` the event log during a coordination session to watch tasks being dispatched and completed in real time. You can `grep` for a specific agent ID to trace its activity. You can pipe it through `jq` for structured analysis. No special tooling required.

---

## 34.3 Plan-Based Coordination

The coordinator mode environment from section 34.1 is the execution substrate -- it manages agents and enforces limits. The plan-based coordinator in `swarm/coordinator.rs` (1,447 lines) is the intelligence layer -- it decomposes goals into dependency graphs, assigns tasks to agents by role, and executes plans using different strategies.

### Execution Modes

The coordinator supports four execution strategies:

```rust
pub enum CoordinatorMode {
    Sequential,      // One step at a time
    Parallel,        // Independent steps concurrently
    Pipeline,        // Output of step N feeds input of step N+1
    MapReduce,       // Fan-out map steps, fan-in reduce
}
```

These are not arbitrary categories. They map to the four fundamental patterns you encounter when decomposing any engineering task:

- **Sequential**: Steps with strict ordering. "Write the schema, then generate the migration, then run tests." Each step depends on the previous step's output.
- **Parallel**: Independent work items. "Review file A, review file B, review file C." No dependencies between items.
- **Pipeline**: Transformations. "Parse the input, validate the data, transform to output format, write results." Each stage transforms the output of the previous stage.
- **MapReduce**: Fan-out and aggregate. "Research five competing libraries, then compare and recommend." The map phase is parallel, the reduce phase synthesizes.

### Task Plans and Dependency Graphs

A plan packages steps with their dependency relationships:

```rust
pub struct TaskPlan {
    pub id: String,
    pub description: String,
    pub steps: Vec<TaskStep>,
    pub dependencies: HashMap<String, Vec<String>>,  // step_id → [dep_ids]
    pub timeout: Duration,
}

pub struct TaskStep {
    pub id: String,
    pub description: String,
    pub required_role: String,
    pub inputs: Vec<String>,
    pub expected_outputs: Vec<String>,
}
```

The `required_role` field is how the coordinator decides which agent should execute a step. Roles are inferred from keywords in the step description:

```rust
fn infer_role(description: &str) -> &str {
    let lower = description.to_lowercase();
    if lower.contains("test") || lower.contains("verify") { return "tester"; }
    if lower.contains("review") || lower.contains("check") { return "reviewer"; }
    if lower.contains("research") || lower.contains("investigate") { return "researcher"; }
    if lower.contains("plan") || lower.contains("decompose") { return "planner"; }
    if lower.contains("architect") || lower.contains("design") { return "architect"; }
    if lower.contains("write") || lower.contains("document") { return "writer"; }
    "coder"  // Default role
}
```

This is a heuristic, not a classifier. It works because task descriptions in practice are written by the coordinator agent, which naturally uses these verbs. A step described as "test the authentication module" will be assigned to a `tester`. A step described as "review the database schema changes" will go to a `reviewer`. The heuristic fails gracefully -- anything that does not match gets assigned to a `coder`, which is the most general role.

### Dependency Validation with Cycle Detection

Before executing a plan, the coordinator validates its dependency graph using Kahn's algorithm for topological sorting:

```rust
pub fn validate_plan(plan: &TaskPlan) -> Result<Vec<String>> {
    if plan.steps.is_empty() {
        return Err(PlanError::EmptyPlan);
    }

    // Build in-degree map
    let mut in_degree: HashMap<&str, usize> = HashMap::new();
    let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();

    for step in &plan.steps {
        in_degree.entry(&step.id).or_insert(0);
        if let Some(deps) = plan.dependencies.get(&step.id) {
            *in_degree.entry(&step.id).or_insert(0) += deps.len();
            for dep in deps {
                adj.entry(dep.as_str()).or_default().push(&step.id);
            }
        }
    }

    // Kahn's algorithm
    let mut queue: VecDeque<&str> = in_degree.iter()
        .filter(|(_, &deg)| deg == 0)
        .map(|(&id, _)| id)
        .collect();

    let mut order = Vec::new();
    while let Some(node) = queue.pop_front() {
        order.push(node.to_string());
        if let Some(neighbors) = adj.get(node) {
            for &next in neighbors {
                let deg = in_degree.get_mut(next).unwrap();
                *deg -= 1;
                if *deg == 0 {
                    queue.push_back(next);
                }
            }
        }
    }

    if order.len() != plan.steps.len() {
        return Err(PlanError::CyclicDependency);
    }

    Ok(order)
}
```

Cycle detection is not optional for plan execution. Without it, a plan where step A depends on step B and step B depends on step A would deadlock permanently -- both steps waiting for the other to complete. The topological sort both validates acyclicity and produces the execution order used by sequential and pipeline modes.

### Parallel Execution in Waves

The parallel and MapReduce modes execute steps in "waves" -- groups of steps whose dependencies are all satisfied:

```rust
async fn execute_parallel(&mut self, plan: &TaskPlan) -> Result<Vec<StepResult>> {
    let topo_order = validate_plan(plan)?;
    let mut completed: HashSet<String> = HashSet::new();
    let mut all_results = Vec::new();
    let mut iterations = 0;
    let max_iterations = plan.steps.len() * 2; // Safety valve

    while completed.len() < plan.steps.len() {
        iterations += 1;
        if iterations > max_iterations {
            return Err(PlanError::ExecutionStalled);
        }

        // Find all steps whose dependencies are satisfied
        let ready: Vec<&TaskStep> = plan.steps.iter()
            .filter(|s| !completed.contains(&s.id))
            .filter(|s| {
                plan.dependencies.get(&s.id)
                    .map(|deps| deps.iter().all(|d| completed.contains(d)))
                    .unwrap_or(true)
            })
            .collect();

        if ready.is_empty() {
            return Err(PlanError::NoProgress);
        }

        // Execute wave concurrently
        let handles: Vec<_> = ready.iter().map(|step| {
            let step_clone = step.clone();
            tokio::spawn(async move {
                execute_step(step_clone).await
            })
        }).collect();

        for handle in handles {
            let result = handle.await??;
            completed.insert(result.step_id.clone());
            all_results.push(result);
        }
    }

    Ok(all_results)
}
```

The safety valve (`max_iterations`) prevents infinite loops in the case of bugs in the dependency resolution logic. If the number of iterations exceeds twice the number of steps, something has gone wrong -- perhaps a step is repeatedly failing and being re-queued. The coordinator stops and reports the stall rather than running forever.

### Conflict Detection and Resolution

When parallel steps produce conflicting results -- for example, two agents modifying the same output field with different values -- the coordinator detects and resolves the conflict:

```rust
pub fn detect_conflicts(results: &[StepResult]) -> Vec<Conflict> {
    let mut output_map: HashMap<String, Vec<(String, Value)>> = HashMap::new();

    for result in results {
        if let Some(outputs) = result.outputs.as_object() {
            for (key, value) in outputs {
                output_map.entry(key.clone())
                    .or_default()
                    .push((result.step_id.clone(), value.clone()));
            }
        }
    }

    output_map.into_iter()
        .filter(|(_, values)| {
            values.windows(2).any(|w| w[0].1 != w[1].1)
        })
        .map(|(key, values)| Conflict { key, values })
        .collect()
}

pub fn resolve_conflicts(conflicts: &[Conflict]) -> HashMap<String, Value> {
    // Majority vote: the value appearing most often wins
    conflicts.iter().map(|conflict| {
        let mut counts: HashMap<&Value, usize> = HashMap::new();
        for (_, value) in &conflict.values {
            *counts.entry(value).or_insert(0) += 1;
        }
        let winner = counts.into_iter()
            .max_by_key(|&(_, count)| count)
            .map(|(value, _)| value.clone())
            .unwrap();
        (conflict.key.clone(), winner)
    }).collect()
}
```

Majority vote is a pragmatic default. For most engineering tasks -- code reviews, research synthesis, test results -- the majority answer is correct. When it is not, the coordinator logs the conflict details so the human operator can investigate.

### Rebalancing After Failure

When an agent fails mid-plan, the coordinator attempts to reassign its pending steps:

```rust
pub fn rebalance(&mut self, failed_agent_id: &str) -> usize {
    let orphaned_steps: Vec<String> = self.assignments.iter()
        .filter(|(_, agent_id)| *agent_id == failed_agent_id)
        .map(|(step_id, _)| step_id.clone())
        .collect();

    let mut reassigned = 0;
    for step_id in orphaned_steps {
        let step = self.plan.steps.iter().find(|s| s.id == step_id);
        if let Some(step) = step {
            // Find replacement with same role
            if let Some(replacement) = self.find_idle_agent(&step.required_role) {
                self.assignments.insert(step_id, replacement.clone());
                reassigned += 1;
            } else if self.agents.len() < self.config.max_agents {
                // Spawn a new agent if under capacity
                let new_id = format!("agent-{}", self.next_agent_id());
                self.register_agent(new_id.clone(), step.required_role.clone());
                self.assignments.insert(step_id, new_id);
                reassigned += 1;
            }
        }
    }
    reassigned
}
```

The rebalancing logic tries the cheapest option first (reassign to an existing idle agent) before the more expensive option (spawn a new agent). This is important in resource-constrained environments where each agent consumes memory, tokens, and potentially a tmux pane.

---

## 34.4 Team Management and Shared Context

The team management layer in `swarm/team.rs` (2,007 lines) provides a higher-level abstraction over raw agent coordination. Teams have named members with roles, shared communication channels, and pre-built templates for common workflows.

### Team Structure

```rust
pub struct Team {
    pub config: TeamConfig,
    pub state: TeamState,                    // Created → Running → Completed/Failed
    pub shared_context: SharedTeamContext,
    pub created_at: SystemTime,
    pub started_at: Option<SystemTime>,
    pub finished_at: Option<SystemTime>,
    pub current_task: Option<String>,
    pub retry_count: u32,
}

pub enum TeamState {
    Created,
    Running,
    Completed,
    Failed { reason: String },
}

pub struct TeamMember {
    pub id: String,
    pub name: String,
    pub role: AgentRole,
    pub capabilities: Vec<String>,
    pub max_concurrent_tasks: usize,
    pub current_tasks: usize,
    pub available: bool,
    pub output: Option<String>,
}
```

Teams differ from raw coordinator agents in three key ways. First, members have names and roles, making orchestration logic more readable -- "assign to the reviewer" instead of "assign to agent-3." Second, teams have shared context (the scratchpad), enabling members to communicate without going through the coordinator. Third, teams support four communication modes:

```rust
pub enum CommunicationMode {
    Sequential,    // Pipeline: output of N → input of N+1
    Parallel,      // All work simultaneously, shared context
    Coordinated,   // Hub-and-spoke: lead coordinates members
    Broadcast,     // Members broadcast to all others
}
```

### The Scratchpad: SharedTeamContext

The scratchpad is the mechanism that enables durable cross-worker communication without routing every message through the coordinator:

```rust
pub struct SharedTeamContext {
    pub data: HashMap<String, Value>,
    pub messages: Vec<TeamMessage>,
    pub version: u64,
}

pub struct TeamMessage {
    pub id: String,
    pub from: String,
    pub to: String,           // or "*" for broadcast
    pub content: String,
    pub timestamp: SystemTime,
    pub read: bool,
}
```

The `version` counter is incremented on every write to the data store:

```rust
impl SharedTeamContext {
    pub fn set(&mut self, key: String, value: Value) {
        self.data.insert(key, value);
        self.version += 1;
    }

    pub fn get(&self, key: &str) -> Option<&Value> {
        self.data.get(key)
    }

    pub fn push_message(&mut self, msg: TeamMessage) {
        self.messages.push(msg);
    }

    pub fn unread_messages_for(&self, member_id: &str) -> Vec<&TeamMessage> {
        self.messages.iter()
            .filter(|m| !m.read && (m.to == member_id || m.to == "*"))
            .collect()
    }

    pub fn mark_read(&mut self, member_id: &str) {
        for msg in &mut self.messages {
            if !msg.read && (msg.to == member_id || msg.to == "*") {
                msg.read = true;
            }
        }
    }
}
```

The version counter enables optimistic concurrency. If two workers read version 5, both modify the scratchpad, and submit their changes, the coordinator can detect that both writes started from the same base version and flag a potential conflict. This is the same principle behind ETags in HTTP and compare-and-swap in lock-free data structures.

The broadcast address `"*"` allows any member to post a message visible to all other members. This is essential for the `Broadcast` communication mode, where every member's findings should be visible to every other member. In practice, broadcast messages are used for sharing intermediate discoveries ("I found the root cause is in module X") that change the direction of other members' work.

### Built-in Team Templates

Five pre-built templates cover the most common multi-agent workflows:

```rust
pub fn create_template(name: &str, task: &str) -> Option<TeamConfig> {
    match name {
        "code_review" => Some(TeamConfig {
            name: format!("code-review-{}", uuid()),
            members: vec![
                member("coder", AgentRole::Coder),
                member("reviewer-1", AgentRole::Reviewer),
                member("reviewer-2", AgentRole::Reviewer),
            ],
            communication: CommunicationMode::Coordinated,
            timeout: Duration::from_secs(300),
            task: task.to_string(),
        }),
        "full_stack" => Some(TeamConfig {
            name: format!("full-stack-{}", uuid()),
            members: vec![
                member("architect", AgentRole::Architect),
                member("frontend", AgentRole::Coder),
                member("backend", AgentRole::Coder),
                member("tester", AgentRole::Tester),
            ],
            communication: CommunicationMode::Parallel,
            timeout: Duration::from_secs(600),
            task: task.to_string(),
        }),
        "research" => Some(/* 3 researchers + 1 writer, broadcast mode */),
        "bug_fix" => Some(/* planner + coder + tester + reviewer, sequential */),
        "documentation" => Some(/* researcher + 2 writers + reviewer, coordinated */),
        _ => None,
    }
}
```

The templates encode domain knowledge about effective team composition. A code review team uses `Coordinated` mode because the coder needs to respond to reviewer feedback -- not just receive it. The full-stack team uses `Parallel` mode because the architect, frontend, backend, and tester can all work simultaneously on different aspects of the task. The research team uses `Broadcast` mode so every researcher's findings are visible to every other researcher, preventing duplicate work.

### Team Execution

The `TeamManager` orchestrates team lifecycle through a tmux-first strategy:

```rust
pub async fn execute(&mut self, team_name: &str, task: &str) -> Result<TeamOutput> {
    let team = self.teams.get_mut(team_name)
        .ok_or(TeamError::NotFound)?;

    team.start()?;

    // Try tmux dispatch first
    if is_team_mode() && tmux_available() {
        let session = std::env::var("RCODE_TEAM_SESSION")?;
        let prompts: Vec<_> = team.config.members.iter()
            .map(|m| build_member_prompt(m, task, &team.shared_context))
            .collect();

        let results = self.tmux.dispatch_and_wait(prompts).await?;

        for (member, result) in team.config.members.iter_mut().zip(results) {
            member.output = Some(result.output);
        }
        team.shared_context.set(
            "dispatch_mode".into(),
            Value::String("tmux".into()),
        );
    } else {
        // Local fallback: simulate assignment
        self.execute_local(team, task).await?;
    }

    team.complete();
    Ok(self.merge_results(team))
}
```

The tmux-first strategy reflects a practical reality: real multi-agent work benefits enormously from process isolation. Each agent in a tmux pane has its own memory space, its own context window, and its own terminal output. If one agent crashes, it does not affect the others. The local fallback exists for environments where tmux is not available (CI/CD containers, restricted shells), but it loses the isolation benefits.

---

## 34.5 The Tmux Pyramid Architecture

The most distinctive feature of the orchestration system is the tmux-based pyramid architecture in `swarm/tmux_team.rs` (1,009 lines). This is where coordination becomes hierarchical -- leads can promote agents to sub-leads, who manage their own teams, creating a recursive tree of agents up to three levels deep.

### Architecture Overview

```
Session (depth 0): "rcode-team-42"
├── Lead pane (this process — the coordinator)
├── Agent 1 pane (executing task A)
├── Agent 2 pane ──► PROMOTED to sub-lead
│   └── Sub-session (depth 1): "rcode-team-42-sub-2"
│       ├── Sub-Agent 2.1 pane
│       ├── Sub-Agent 2.2 pane
│       └── Sub-Agent 2.3 pane ──► PROMOTED
│           └── Sub-session (depth 2): "rcode-team-42-sub-2-sub-2.3"
│               ├── Sub-Sub-Agent 2.3.1 pane
│               └── Sub-Sub-Agent 2.3.2 pane
├── Agent 3 pane (executing task C)
└── Agent 4 pane (idle)
```

### Safety Constants

```rust
const SESSION_PREFIX: &str = "rcode-team";
const MAX_AGENTS_PER_LEVEL: usize = 10;
const MAX_TOTAL_AGENTS: usize = 20;
const MAX_PYRAMID_DEPTH: u32 = 3;
const IDLE_MARKER: &str = "❯";
const AGENT_TIMEOUT: Duration = Duration::from_secs(600);
const POLL_INTERVAL: Duration = Duration::from_secs(5);
```

These constants form a safety envelope. `MAX_PYRAMID_DEPTH = 3` means you can have at most four levels (0, 1, 2, 3) of hierarchy. Each level can have at most 10 agents. The global cap of 20 agents prevents combinatorial explosion -- even if every lead tried to spawn maximum sub-agents, the system would stop at 20 total.

The `IDLE_MARKER` is the shell prompt character `❯`. The polling system detects when an agent has finished by checking if the last line of its tmux pane output contains this marker -- meaning the agent's REPL is waiting for input, not processing a command.

### Session Creation

```rust
pub async fn create_session(&mut self) -> Result<()> {
    // 1. Create the tmux session
    Command::new("tmux")
        .args(["new-session", "-d",
               "-s", &self.config.session_id,
               "-x", "220", "-y", "60",
               "-c", &self.config.working_dir])
        .status()?;

    // 2. Split panes for each agent
    for i in 0..self.config.initial_agents {
        Command::new("tmux")
            .args(["split-window",
                   "-t", &format!("{}:0", self.config.session_id),
                   "-h",
                   "-c", &self.config.working_dir])
            .status()?;
    }

    // 3. Apply layout
    Command::new("tmux")
        .args(["select-layout",
               "-t", &format!("{}:0", self.config.session_id),
               "main-vertical"])
        .status()?;

    // 4. Launch agent CLI in each pane with staggered startup
    for i in 1..=self.config.initial_agents {
        Command::new("tmux")
            .args(["send-keys",
                   "-t", &format!("{}:0.{}", self.config.session_id, i),
                   "copilot", "Enter"])
            .status()?;
        tokio::time::sleep(Duration::from_secs(3)).await;
    }

    Ok(())
}
```

The 3-second stagger between agent launches is not arbitrary. It prevents thundering herd problems where all agents simultaneously hit the API for authentication, model loading, and initial context setup. As noted in the project's operational knowledge, launching more than about four agents simultaneously triggers 429 rate limits from shared API rate windows.

### Agent Communication via Tmux

Sending a prompt to an agent is a five-step sequence that works around tmux's input limitations:

```rust
pub async fn send_prompt(&mut self, agent_index: usize, prompt: &str) -> Result<()> {
    let pane_target = format!("{}:0.{}", self.config.session_id, agent_index);
    let temp_file = format!("/tmp/rcode_agent{}_prompt.txt", agent_index);

    // 1. Write prompt to temp file (avoids shell escaping issues)
    std::fs::write(&temp_file, prompt)?;

    // 2. Load into tmux buffer
    Command::new("tmux")
        .args(["load-buffer", &temp_file])
        .status()?;

    // 3. Paste into target pane
    Command::new("tmux")
        .args(["paste-buffer", "-t", &pane_target])
        .status()?;

    // 4. Wait for paste completion
    tokio::time::sleep(Duration::from_secs(2)).await;

    // 5. Send Enter to submit
    Command::new("tmux")
        .args(["send-keys", "-t", &pane_target, "Enter"])
        .status()?;

    self.agents[agent_index].status = AgentPaneStatus::Working;
    self.agents[agent_index].task_started = Some(Instant::now());

    Ok(())
}
```

Why not just `send-keys` the prompt directly? Because tmux's `send-keys` interprets special characters. A prompt containing `#`, `;`, `Enter`, or escape sequences would be mangled. The temp-file-load-buffer-paste-buffer pattern sends the exact bytes without any interpretation. It is the tmux equivalent of parameterized queries -- you separate the data (the prompt) from the control channel (the tmux command).

### Dispatch and Wait

The core orchestration loop dispatches tasks to agents and polls for completion:

```rust
pub async fn dispatch_and_wait(
    &mut self,
    tasks: Vec<(usize, String)>,  // (agent_index, prompt)
) -> Result<Vec<AgentResult>> {
    // Dispatch all prompts
    for (agent_idx, prompt) in &tasks {
        self.send_prompt(*agent_idx, prompt).await?;
    }

    let start = Instant::now();
    let global_timeout = self.config.agent_timeout + Duration::from_secs(60);

    // Poll until all agents are done
    loop {
        tokio::time::sleep(self.config.poll_interval).await;

        let mut all_done = true;
        for (agent_idx, _) in &tasks {
            let agent = &mut self.agents[*agent_idx];
            match agent.status {
                AgentPaneStatus::Working => {
                    if self.is_agent_timed_out(agent) {
                        agent.status = AgentPaneStatus::TimedOut;
                    } else if self.is_agent_idle(agent).await? {
                        agent.status = AgentPaneStatus::Completed;
                    } else {
                        all_done = false;
                    }
                }
                AgentPaneStatus::Completed | AgentPaneStatus::TimedOut => {}
                _ => { all_done = false; }
            }
        }

        if all_done || start.elapsed() > global_timeout {
            break;
        }
    }

    // Collect results
    let mut results = Vec::new();
    for (agent_idx, _) in &tasks {
        let output = self.capture_pane_output(*agent_idx).await?;
        results.push(AgentResult {
            agent_index: *agent_idx,
            agent_name: self.agents[*agent_idx].name.clone(),
            status: self.agents[*agent_idx].status.clone(),
            output,
            elapsed: self.agents[*agent_idx].task_started
                .map(|t| t.elapsed())
                .unwrap_or_default(),
        });
    }

    Ok(results)
}
```

The global timeout (`agent_timeout + 60s`) is a safety valve above the per-agent timeout. It catches the edge case where all agents time out simultaneously -- without the global timeout, the loop would continue checking timed-out agents indefinitely.

Idle detection works by capturing the last few lines of the agent's tmux pane and checking for the prompt marker:

```rust
async fn is_agent_idle(&self, agent: &AgentPane) -> Result<bool> {
    let output = Command::new("tmux")
        .args(["capture-pane", "-p",
               "-t", &format!("{}:0.{}", self.config.session_id, agent.pane_number)])
        .output()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let last_lines: Vec<&str> = text.lines().rev().take(5).collect();
    Ok(last_lines.iter().any(|l| l.contains(IDLE_MARKER)))
}
```

### Promotion to Sub-Lead

The most powerful capability of the pyramid architecture is promotion -- converting a regular agent into a sub-lead that manages its own team:

```rust
pub async fn promote_to_sub_lead(
    &mut self,
    agent_index: usize,
    num_sub_agents: usize,
) -> Result<()> {
    // Enforce depth limit
    if self.config.pyramid_depth >= MAX_PYRAMID_DEPTH {
        return Err(TeamError::MaxDepthReached {
            current: self.config.pyramid_depth,
            max: MAX_PYRAMID_DEPTH,
        });
    }

    let agent = &self.agents[agent_index];
    let sub_session = format!("{}-sub-{}", self.config.session_id, agent.pane_id);

    let sub_config = SubLeadConfig {
        sub_session_name: sub_session.clone(),
        working_dir: self.config.working_dir.clone(),
        num_sub_agents,
        max_sub_agents: MAX_AGENTS_PER_LEVEL,
        remaining_depth: MAX_PYRAMID_DEPTH - self.config.pyramid_depth - 1,
        agent_binary: "copilot".to_string(),
        idle_marker: IDLE_MARKER.to_string(),
        original_task: String::new(),
    };

    // Generate and send promotion prompt
    let prompt = build_sub_lead_prompt(&sub_config);
    self.send_prompt(agent_index, &prompt).await?;

    // Mark as promoted
    self.agents[agent_index].status = AgentPaneStatus::Promoted;
    self.agents[agent_index].is_sub_lead = true;
    self.agents[agent_index].sub_session = Some(sub_session);

    Ok(())
}
```

The promotion prompt (generated by `sub_lead_prompt.rs`, 228 lines) teaches the promoted agent how to manage its sub-team using tmux commands. It includes shell scripts for creating the sub-session, launching agents, dispatching prompts, polling for completion, and cleaning up. The remaining depth is passed explicitly so the sub-lead knows whether it can promote its own agents further:

```rust
let nesting_note = if sub_config.remaining_depth > 0 {
    format!(
        "If any sub-task is still too complex, you may promote a sub-agent \
         to a deeper sub-lead (remaining depth: {})",
        sub_config.remaining_depth
    )
} else {
    "You are at the maximum pyramid depth. Do NOT create deeper sub-leads.".into()
};
```

### Session Cleanup

Destroying a pyramid session requires depth-first traversal to kill sub-sessions before the parent:

```rust
pub async fn destroy_session(&mut self) -> Result<()> {
    // Find all sub-sessions (depth-first cleanup)
    let output = Command::new("tmux")
        .args(["list-sessions", "-F", "#{session_name}"])
        .output()?;
    let sessions = String::from_utf8_lossy(&output.stdout);

    let sub_prefix = format!("{}-sub-", self.config.session_id);
    let mut sub_sessions: Vec<&str> = sessions.lines()
        .filter(|s| s.starts_with(&sub_prefix))
        .collect();

    // Sort by depth (deepest first) for clean teardown
    sub_sessions.sort_by(|a, b| b.matches("-sub-").count().cmp(&a.matches("-sub-").count()));

    for sub in sub_sessions {
        Command::new("tmux")
            .args(["kill-session", "-t", sub])
            .status()?;
    }

    // Kill main session
    Command::new("tmux")
        .args(["kill-session", "-t", &self.config.session_id])
        .status()?;

    Ok(())
}
```

Sorting sub-sessions by depth (deepest first) ensures that a sub-sub-session is killed before its parent sub-session. If you killed the parent first, the sub-sub-session would become an orphan -- still running but no longer manageable.

---

## 34.6 Worker Model Selection and Autonomy

Not all agents need the same model. A research agent summarizing web pages does fine with Sonnet. A security reviewer analyzing complex code paths needs Opus. The orchestration system supports per-agent model selection at multiple levels.

In the deep swarm layer (`deep_swarm.rs`), task configuration includes an optional model override:

```rust
pub struct TaskConfig {
    pub name: String,
    pub timeout_secs: u64,
    pub max_tokens: Option<u64>,
    pub model: Option<String>,      // "sonnet", "opus", "haiku"
    pub working_dir: Option<PathBuf>,
    pub env_vars: HashMap<String, String>,
    // ... additional fields
}
```

The swarm manager assigns concurrency weights per role, reflecting the computational cost of different agent types:

```rust
impl AgentRole {
    pub fn weight(&self) -> usize {
        match self {
            AgentRole::Coder => 3,       // Heavy: reads and writes code
            AgentRole::Reviewer => 2,    // Medium: reads code, produces feedback
            AgentRole::Researcher => 2,  // Medium: web search + synthesis
            AgentRole::Writer => 2,      // Medium: produces documentation
            AgentRole::Tester => 2,      // Medium: reads code, runs tests
            AgentRole::Planner => 1,     // Light: decomposes tasks
            AgentRole::Architect => 1,   // Light: produces designs
            AgentRole::Custom(_) => 2,   // Default medium weight
        }
    }
}
```

These weights feed into concurrency scheduling. The system has a total concurrency budget, and each agent consumes `weight` units of that budget. A system with a budget of 12 could run four coders (4 x 3 = 12), or six reviewers (6 x 2 = 12), or a mix. This prevents the common failure mode of spawning too many heavy agents simultaneously and overwhelming the API with concurrent requests.

The deep swarm also enforces per-type concurrency limits as a secondary constraint:

```rust
pub struct ConcurrencyConfig {
    pub max_global: usize,          // 16
    pub max_dream: usize,           // 2
    pub max_local_agent: usize,     // 3
    pub max_in_process: usize,      // 8
    pub max_local_shell: usize,     // 6
    pub max_remote_agent: usize,    // 4
}
```

The `max_dream: 2` limit is particularly interesting. Dream tasks are autonomous background thinking -- the agent analyzes conversation history and extracts insights for memory. Running too many dreams simultaneously would consume token budget without producing user-visible work. Two concurrent dreams is enough to keep the memory system updated without starving real tasks.

---

## 34.7 The Team Lead Prompt

The team lead prompt (generated by `team_prompt.rs`, 259 lines) is the system message that teaches the coordinator agent how to manage its team. It is not hardcoded text -- it is dynamically generated based on the actual team composition, including pane numbers, agent names, roles, and available commands.

The generated prompt includes an agent table listing every team member:

```
Your team:
- Pane 1 (Agent 1): Coder — "frontend"
- Pane 2 (Agent 2): Reviewer — "security-reviewer"
- Pane 3 (Agent 3): Sub-Lead (rcode-team-42-sub-3)
- Pane 4 (Agent 4): Tester — "integration-tester"
```

Shortcut syntax for rapid dispatch:

```
@agent1 Write the unit tests for the auth module
@agent2 Review the database schema changes
@all Share your progress
```

And a command reference for dynamic team management:

```
/team-status      — Show all agent statuses
/team-collect     — Capture all outputs
/team-tree        — Display pyramid hierarchy
/team-add [N]     — Add N new agents (default 1)
/team-remove N    — Remove agent N
/team-promote N [count] — Promote agent N to sub-lead
/team-send N <prompt>   — Send prompt to specific agent
/team-broadcast <prompt> — Send to all and wait
```

The prompt also includes the dispatch implementation details -- the five-step temp-file-load-paste-wait-enter sequence -- so the lead can manually dispatch prompts if the shortcut commands fail. This is defensive design: even if the command parsing breaks, the lead can fall back to raw tmux commands.

---

## 34.8 Putting It All Together

The full data flow of a coordinated multi-agent task looks like this:

```
User: "Refactor the authentication module"
  │
  ▼
Coordinator Agent (enter_coordinator_mode)
  │
  ├─ Create plan: 5 steps
  │  ├─ Step 1: "Analyze current auth architecture" (researcher)
  │  ├─ Step 2: "Design new module structure" (architect)
  │  ├─ Step 3: "Implement refactored code" (coder) [depends: 1, 2]
  │  ├─ Step 4: "Write tests for new code" (tester) [depends: 3]
  │  └─ Step 5: "Review changes" (reviewer) [depends: 3]
  │
  ├─ Validate plan (cycle detection via topological sort)
  │
  ├─ Create team from "code_review" template + customization
  │
  ├─ Execute via tmux pyramid:
  │  ├─ Wave 1: Steps 1, 2 (parallel — no dependencies)
  │  ├─ Wave 2: Step 3 (depends on 1 and 2)
  │  ├─ Wave 3: Steps 4, 5 (parallel — both depend only on 3)
  │  │
  │  │  [Step 3 proves too complex]
  │  │  └─ Promote coder agent to sub-lead
  │  │     └─ Sub-session with 3 sub-agents
  │  │        ├─ Sub-agent 3.1: Refactor token handling
  │  │        ├─ Sub-agent 3.2: Refactor session management
  │  │        └─ Sub-agent 3.3: Update API endpoints
  │  │
  │  └─ Collect results from all waves
  │
  ├─ Detect conflicts (reviewer vs coder disagree on interface)
  ├─ Resolve via majority vote
  │
  ├─ Submit final result
  │
  └─ exit_coordinator_mode
      └─ Log CoordinatorStopped event
      └─ Destroy tmux session (depth-first)
```

This flow demonstrates every subsystem working together: coordinator mode provides the resource envelope, the plan-based coordinator decomposes the goal, the team layer manages member roles and shared context, and the tmux pyramid enables recursive delegation when tasks prove more complex than initially estimated.

The key engineering insight is that these layers are independently useful. You can use coordinator mode without plans (for simple multi-agent tasks). You can use plans without tmux (for in-process orchestration). You can use tmux teams without the full coordinator mode (for ad-hoc parallel work). Each layer adds capability without requiring the layers above or below it. This is not accidental -- it is the result of designing each layer with a clean interface that hides its implementation details from its consumers.

---

## 34.9 Lessons for Production Orchestration

Building a multi-agent orchestration system teaches you several things that are not obvious from the academic literature on multi-agent systems:

**Token budgets matter more than time budgets.** Time is cheap -- agents can wait. Tokens are expensive and finite. Every design decision in this system prioritizes token efficiency: hard limits at dispatch time, per-agent budgets, role-based concurrency weights. If you build an orchestration system without token budgets, your first production incident will be a runaway coordinator that spends $200 in ten minutes.

**State machines prevent impossible states.** The `AgentStatus` enum makes it impossible to dispatch a task to a working agent, submit a result for a non-existent task, or resume a crashed agent. Every illegal transition is a compile-time or runtime error, never a silent bug. If you are building orchestration, make your state transitions explicit and validate them.

**Hierarchy needs depth limits.** The `MAX_PYRAMID_DEPTH = 3` limit exists because the first version of this system did not have it. A coordinator promoted an agent, which promoted its own agent, which promoted yet another, until the system had dozens of tmux sessions consuming memory and accomplishing nothing. Unbounded recursion in orchestration is as dangerous as unbounded recursion in code.

**Idle detection is harder than it sounds.** The system checks for the prompt marker `❯` in the last five lines of terminal output. This works because the agent's REPL always shows the prompt when idle. But it fails if the agent's output contains the prompt character, or if the terminal wraps in a way that pushes the prompt off the bottom of the capture buffer. The 5-second poll interval is a compromise: fast enough to detect completion promptly, slow enough to avoid overwhelming tmux with capture commands.

**Cleanup must be depth-first.** If you kill a parent session before its children, the children become orphans. Orphan tmux sessions consume resources indefinitely because nothing knows they exist. The depth-first cleanup in `destroy_session` sorts sub-sessions by nesting depth and kills the deepest first. This is the same principle as destroying resources in reverse order of creation.

These are not theoretical concerns. Every safety mechanism in the coordinator -- token budgets, agent limits, depth limits, timeout valves, event logging -- exists because the absence of that mechanism caused a real failure during development. The 10,235 lines of orchestration code are not a monument to complexity. They are a map of every way multi-agent coordination can go wrong, with a guardrail at each cliff edge.
