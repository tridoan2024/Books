# Chapter 1: The Vision --- From Single CLI to Multi-CLI AGI

---

There is a moment every engineer hits when building with AI-assisted tools. You have a Claude Code session running. It's deep into a security audit, context window packed with findings, threat models, CWE references. Then a Slack message arrives: "Can you also refactor the auth module while you're in there?" You paste the request. The model hallucinates a fix that contradicts its own security findings from six turns ago. The context is poisoned. The session is dead.

You've hit this wall. You've hit it enough times to start building your way around it. This book is about finishing that work.

---

## 1.1 The Three Eras of AI-Assisted Development

Software engineering's relationship with AI has compressed three decades of evolution into three years. Understanding where we are --- and where we're going --- requires understanding the eras that preceded us.

### Era 1: Completion Agents (2023)

The first era gave us autocomplete on steroids. GitHub Copilot, TabNine, Amazon CodeWhisperer. Single-turn, stateless, context-limited. You typed a function signature; the model predicted the body. You typed a comment; the model predicted the code beneath it.

The architecture was trivial:

```
User keystroke → Model inference → Inline suggestion → Accept/reject
```

No memory between completions. No understanding of your project beyond the current file and a handful of neighbors pulled in by similarity search. No tool use. No ability to run what it wrote, read the error, and try again.

These tools were useful. They saved keystrokes. But they were fundamentally *reactive* --- they responded to what you were already doing, one completion at a time. They couldn't plan, couldn't decompose problems, couldn't iterate. They were spell-check for code.

The ceiling was low and engineers hit it fast. You couldn't say "build me an authentication system" and walk away. You could say "complete this JWT validation function" and get a reasonable first draft that you'd spend twenty minutes debugging because the model didn't know your project used RS256, not HS256.

### Era 2: Agentic CLIs (2024--2025)

The second era changed the game. Claude Code, Cursor Agent, GitHub Copilot CLI, Aider, Windsurf. These were no longer completion engines. They were *agents* --- systems with tool access, multi-turn conversation, persistent memory, and the ability to operate autonomously within a codebase.

The architecture grew dramatically:

```
User prompt
  → System prompt (CLAUDE.md + rules + skills + context)
    → LLM inference
      → Tool calls (bash, file read/write, grep, web search, git)
        → Observation (tool output)
          → LLM inference (incorporate observation)
            → More tool calls...
              → Stop condition (task complete / user interrupt / token limit)
```

Claude Code's `QueryEngine` --- the while-true agentic loop at the heart of the system --- embodied this pattern. You've read the source. You know the architecture. Layer 4 of the 10-layer stack: an infinite loop that alternates between LLM inference and tool execution until a stop condition fires. It's elegant. It works. It changed how software gets built.

For the first time, you could say "find the bug in the authentication flow, write a failing test, fix it, and verify the test passes" --- and the agent would do it. Multiple tool calls. File reads. Bash executions. Git operations. Iterating on failures. All without human intervention.

But the agentic CLI model has a fundamental architectural constraint: **it's a single agent with a single context window doing everything sequentially**.

That single context window is the bottleneck. 200,000 tokens sounds generous until you're reviewing a 50-file pull request while maintaining a threat model while tracking which tests still need to be written. The model starts dropping information. Early findings evaporate. Specificity degrades into vagueness. The agent begins to contradict itself.

You've watched this happen in real time. You've watched Claude Code's own mitigation strategies kick in: context compaction (`compact.ts`), micro-compaction (`microCompact.ts`), auto-compaction triggers (`autoCompact.ts`), and the emergency `contextCollapse.ts` that throws away everything except a summary when tokens run critically low. These are tourniquet measures. They stop the bleeding. They don't fix the wound.

### Era 3: Multi-CLI AGI Systems (2026+)

The third era is what this book is about. Instead of one agent doing everything, you build a team of specialized agents, each running in its own process, with its own context window, its own tools, its own memory, its own system prompt optimized for a single domain.

```
User prompt
  → Orchestrator CLI (intent analysis, task decomposition)
    → Research CLI (knowledge gathering, RAG, web search)
    → Planner CLI (architecture decisions, dependency graphs)
    → Coder CLI (implementation, refactoring, git operations)
    → Security CLI (SAST, threat models, compliance)
    → Validator CLI (build, lint, type-check, test)
    → QA CLI (adversarial testing, edge cases, acceptance)
    → Documentation CLI (docs, ADRs, changelogs)
  ← Results merge → Orchestrator synthesizes → Delivery
```

This isn't a theoretical architecture. You've already built pieces of it. SwarmForge spawns parallel workers in isolated git worktrees. The claudecode_team system runs multi-agent debate rounds. MultiCLIs manages parallel CLI sessions from a single dashboard. The pieces exist. What's missing is the engineering discipline to make them work as a single, coherent, production-grade system.

That's what this book provides.

---

## 1.2 Why One CLI Is Never Enough

The single-agent model breaks down along five axes. Each failure mode is independently sufficient to justify a multi-agent architecture. Together, they make it inevitable.

### The Context Window Ceiling

200,000 tokens. At approximately 0.75 words per token for code, that's roughly 150,000 words --- or about 500 pages of dense technical content. Sounds like plenty.

It isn't.

A production codebase audit touches hundreds of files. A typical TypeScript file averages 200--400 lines. Reading 50 files consumes 10,000--20,000 lines, which translates to 40,000--80,000 tokens just for the raw source. Add the system prompt (2,000--5,000 tokens), CLAUDE.md instructions (1,000--3,000 tokens), tool call schemas (8,000--12,000 tokens for 40 tools), conversation history (grows with every turn), and tool outputs (each bash execution, each grep result, each file read). A complex task burns through 200,000 tokens in 15--25 turns.

Claude Code's compaction system exists precisely because this ceiling is real:

```typescript
// From claudecode_src/services/compact/autoCompact.ts
// Triggers when context usage exceeds threshold
if (contextUsageRatio > AUTO_COMPACT_THRESHOLD) {
  // Summarize entire conversation into compressed form
  // Loses specificity, loses exact code references
  // Necessary evil to continue operating
  await performCompaction(messages, systemPrompt);
}
```

After compaction, the agent operates on a *summary* of what it previously knew. Exact line numbers are gone. Specific variable names blur. The security finding from turn 3 that identified a SQL injection in `userService.ts:147` becomes "there were some security concerns in the user service." That's not useful. That's dangerous.

With multiple CLIs, each agent has its own 200,000-token window dedicated to a single domain. The Security CLI's entire context is security findings. The Coder CLI's entire context is implementation details. No sharing. No pollution. No compaction-induced amnesia.

### Domain Expertise Dilution

A system prompt that says "You are an expert security auditor AND an expert frontend developer AND an expert DevOps engineer AND an expert technical writer" is a system prompt that produces mediocre work across all four domains. The model's attention is split. Its responses hedge. It qualifies everything because it's trying to satisfy contradictory optimization targets.

Consider the difference:

**Generic prompt (single CLI):**
```
You are a helpful AI assistant. You can write code, review security,
run tests, and write documentation.
```

**Specialized prompt (Security CLI):**
```
You are a security auditor specialized in application security.
Your tools: SAST scanners, dependency audit, OWASP reference database,
CWE/CVE lookup, threat model generator.

You think in terms of attack surfaces, trust boundaries, and
privilege escalation paths. When you see user input flowing to
a database query, you don't think "oh, parameterize that" ---
you think "what's the full injection surface? Are there second-order
injection paths? What about stored XSS through this same vector?
What's the trust boundary between this service and its callers?"

You never generate code. You never write documentation. You never
run tests. You find vulnerabilities and you characterize them
with precision.
```

The specialized prompt produces categorically better security findings. Not incrementally better --- *categorically*. The model's entire 200,000-token context is security knowledge. Its system prompt is 100% focused on threat modeling. Every tool in its toolbox is security-oriented. It doesn't waste cycles deciding whether to also refactor the code it's reviewing.

### The Serial Bottleneck

One agent. One turn at a time. Research, then plan, then code, then test, then review, then document. Sequentially. Each phase waits for the previous one to complete.

Measure the wall-clock time for a non-trivial task --- say, implementing a new API endpoint with authentication, validation, tests, documentation, and a security review:

| Phase | Single CLI | Multi-CLI (parallel) |
|-------|-----------|---------------------|
| Research existing patterns | 2 min | 2 min (Research CLI) |
| Plan architecture | 3 min | 3 min (Planner CLI) |
| Implement endpoint | 8 min | 8 min (Coder CLI) |
| Write tests | 5 min | 5 min (Validator CLI) |
| Security review | 4 min | 4 min (Security CLI) |
| Documentation | 3 min | 3 min (Doc CLI) |
| **Total (serial)** | **25 min** | --- |
| **Total (parallel, phases 3-6)** | --- | **~11 min** |

After the Planner CLI produces the architecture, the Coder, Validator, Security, and Documentation CLIs can all begin working simultaneously on different aspects of the same plan. The Coder writes the implementation while the Security CLI reviews the plan for vulnerabilities. The Validator CLI sets up the test harness. The Documentation CLI drafts the API reference. When the Coder finishes, the Validator runs the tests against the new code. The Security CLI scans the implementation. The Doc CLI updates with actual function signatures.

This is the same pattern that made SwarmForge's task DAG effective:

```javascript
// From DApp/server/task-dag.js
// Dependency-aware parallel scheduling
[
  { id: "db-schema",       role: "backend",  deps: [] },
  { id: "api-endpoints",   role: "backend",  deps: ["db-schema"] },
  { id: "ui-components",   role: "frontend", deps: [] },
  { id: "api-integration", role: "frontend", deps: ["api-endpoints"] }
]
// Wave 1: db-schema + ui-components execute in parallel
// Wave 2: api-endpoints starts after db-schema completes
// Wave 3: api-integration waits for api-endpoints
```

The multi-CLI system applies this same dependency-graph execution model, but at the level of entire specialized agents rather than individual code tasks.

### Memory Pollution

When one agent handles both security auditing and code generation, its memory contains both threat findings and implementation patterns. These contaminate each other.

Security findings in context bias the code generator toward over-defensive patterns --- wrapping every operation in try-catch blocks, adding unnecessary validation layers, producing code that's "secure" but unreadable and unmaintainable. Conversely, code generation patterns in context cause the security scanner to focus on implementation idioms it's recently produced rather than systematically evaluating the full attack surface.

This is measurable. Run the same security prompt twice: once in a clean context, once after 15 turns of code generation. The clean-context scan finds more vulnerabilities, at higher specificity, with more actionable remediation steps. The polluted-context scan produces generic advice tinted by the code it just wrote.

Separate memory spaces solve this:

```
Security CLI Memory:
  - Known vulnerabilities in this codebase
  - CWE references for findings
  - Previous audit results for trend analysis
  - Threat model state

Coder CLI Memory:
  - Project architecture patterns
  - Recent implementation decisions
  - Test coverage state
  - Refactoring history

(These never mix.)
```

### The Proof: Claude Code Already Knows This

Here's the part that should make you uncomfortable. Claude Code itself already uses a multi-agent pattern internally. Look at the tool system --- specifically, the `agent` tool and the `task` tool:

```typescript
// From claudecode_src/tools/agent/
// Subagent spawning for specialized work
{
  name: "task",
  description: "Launch specialized agents in separate context windows",
  agent_types: [
    "explore",         // Fast, read-only codebase exploration
    "task",            // Command execution with output filtering
    "general-purpose", // Full-capability subprocess
    "code-review"      // Specialized code review
  ]
}
```

Claude Code decomposes work into subagents because *its own architects understood that a single agent with a single context window cannot efficiently handle complex multi-faceted tasks*. The explore agent runs with a smaller, faster model. The code-review agent has a specialized system prompt. The general-purpose agent gets a separate context window to keep the parent's context clean.

This is a multi-agent system. It's just a primitive one --- limited to four hardcoded agent types, no persistent memory, no inter-agent communication beyond return values, no specialized tool sets per agent. This book shows you how to take that seed and grow it into a forest.

---

## 1.3 The Multi-CLI Architecture

The target architecture comprises eight specialized CLIs coordinated by a shared communication layer. Each CLI is a complete, standalone agentic system --- its own process, its own LLM connection, its own context window, its own tool set, its own system prompt, its own persistent memory.

### The Eight Specialized CLIs

**1. Orchestrator CLI --- The Brain**

The orchestrator never writes code. It never runs tests. It never scans for vulnerabilities. Its sole purpose is to understand what the user wants, decompose it into tasks, route those tasks to the right specialists, monitor their progress, resolve conflicts between their outputs, and synthesize the final result.

It maintains the global state: which CLIs are active, what phase the project is in, what's blocked, what's complete. It's the only CLI that talks directly to the user.

```
Responsibilities:
  - Intent analysis and classification
  - Task decomposition and dependency graphing
  - Specialist CLI lifecycle management (spawn, monitor, kill)
  - Result aggregation and conflict resolution
  - User communication (status updates, clarifications, delivery)

Tools:
  - CLI spawner (start/stop specialist CLIs)
  - Task graph manager (DAG operations)
  - Memory bus reader (aggregate findings from all CLIs)
  - Synthesis engine (merge specialist outputs)

Does NOT have:
  - File editing tools
  - Bash execution
  - Web search
  - Git operations
```

**2. Research CLI --- The Scholar**

Gathers knowledge before anyone writes a line of code. Searches the web, reads documentation, explores the existing codebase, queries RAG databases, and synthesizes findings into structured briefs that other CLIs consume.

```
Responsibilities:
  - Web search and documentation lookup
  - Codebase exploration (architecture mapping, pattern detection)
  - RAG queries against internal knowledge bases
  - Competitive analysis and technology comparison
  - Brief generation for downstream CLIs

Tools:
  - Web search, web fetch
  - Codebase grep, glob, file read
  - RAG query engine
  - Documentation parser

Does NOT have:
  - File writing or editing
  - Bash execution (beyond read-only commands)
  - Git operations
```

**3. Planner CLI --- The Architect**

Takes research briefs and user requirements, produces architecture decisions, task decompositions, and dependency graphs. Outputs structured plans that the Coder, Validator, and other CLIs consume directly.

```
Responsibilities:
  - Architecture decision records (ADRs)
  - Task decomposition with effort estimates
  - Dependency graph construction
  - Technology selection and justification
  - Interface contract definitions

Output format (consumed by other CLIs):
{
  "tasks": [
    {
      "id": "auth-middleware",
      "assigned_to": "coder",
      "deps": ["db-schema"],
      "spec": "Implement JWT middleware per ADR-003...",
      "acceptance_criteria": [
        "Validates RS256 tokens",
        "Extracts user claims to req.user",
        "Returns 401 with WWW-Authenticate header on failure"
      ]
    }
  ]
}
```

**4. Coder CLI --- The Implementer**

Pure implementation. Receives task specifications with acceptance criteria and writes the code. Has full file system access, git operations, and bash execution. Does not decide *what* to build --- that's the Planner's job. The Coder decides *how* to build it.

**5. Security CLI --- The Adversary**

Thinks like an attacker. Runs static analysis, checks dependencies for known CVEs, builds threat models, validates compliance requirements. Operates on both planned architectures (reviewing Planner output before implementation begins) and actual code (scanning Coder output after implementation).

**6. Validator CLI --- The Gatekeeper**

Owns the build pipeline. Runs linters, type checkers, unit tests, integration tests. Verifies that code compiles, passes all existing tests, and meets coverage thresholds. Reports failures back to the Orchestrator with enough detail for the Coder to fix them.

**7. QA CLI --- The Adversarial Tester**

Different from the Validator. The Validator checks that the code does what it's supposed to do. The QA CLI checks that the code *doesn't do what it's not supposed to do*. Edge cases. Race conditions. Input fuzzing. Boundary value analysis. Regression testing. Acceptance criteria validation from a user's perspective.

**8. Documentation CLI --- The Recorder**

Writes and maintains documentation. API references from code signatures. Architecture decision records from Planner output. Changelogs from git history. README updates. Runbooks. User guides. Operates last in the pipeline, after all other CLIs have finished, so documentation reflects the actual system rather than the planned one.

### Communication Architecture

The CLIs communicate through three channels:

**Shared Memory Bus** --- A structured, typed data store that all CLIs can read from and write to. Not ad-hoc files in a directory. Typed schemas with validation:

```typescript
interface SharedMemory {
  // Research findings
  research: {
    briefs: ResearchBrief[];
    codebaseMap: CodebaseMap;
    externalDocs: DocReference[];
  };

  // Architecture decisions
  architecture: {
    adrs: ArchitectureDecisionRecord[];
    taskGraph: TaskDAG;
    interfaceContracts: Contract[];
  };

  // Implementation state
  implementation: {
    completedTasks: TaskResult[];
    pendingTasks: Task[];
    blockedTasks: BlockedTask[];
  };

  // Security findings
  security: {
    vulnerabilities: Vulnerability[];
    threatModel: ThreatModel;
    complianceStatus: ComplianceCheck[];
  };

  // Validation results
  validation: {
    buildStatus: BuildResult;
    testResults: TestSuite[];
    coverageReport: CoverageReport;
  };
}
```

**Private Memory** --- Each CLI maintains its own persistent memory that other CLIs cannot access. The Security CLI's historical vulnerability database. The Coder CLI's record of past refactoring decisions. The Research CLI's cache of external documentation. Private memory prevents cross-contamination while enabling each CLI to learn from its own history.

**Message Passing** --- Direct, typed messages between CLIs for time-sensitive coordination. When the Validator discovers a test failure, it doesn't just write to shared memory and hope the Coder notices. It sends a direct message:

```typescript
interface Message {
  from: CLIRole;
  to: CLIRole;
  type: 'task_complete' | 'task_failed' | 'blocking_issue' |
        'review_request' | 'approval' | 'rejection';
  payload: unknown;  // Typed per message type
  priority: 'critical' | 'high' | 'normal' | 'low';
  timestamp: number;
  correlationId: string;  // Links to original task
}
```

### The Execution Flow

A user prompt enters the system and flows through these stages:

```
1. User types: "Add rate limiting to the API with Redis backing"

2. Orchestrator CLI:
   - Classifies intent: IMPLEMENT (new feature)
   - Spawns Research CLI → "Find existing rate limiting patterns in codebase,
     research Redis rate limiting best practices"
   - Waits for research brief

3. Research CLI:
   - Searches codebase: finds existing Express middleware patterns
   - Searches web: Redis sliding window rate limiting algorithms
   - Writes ResearchBrief to shared memory
   - Signals completion to Orchestrator

4. Orchestrator spawns Planner CLI:
   - Reads ResearchBrief from shared memory
   - Produces: ADR (why Redis, why sliding window), TaskDAG (4 tasks),
     interface contracts (rate limiter middleware signature)
   - Writes to shared memory

5. Orchestrator reads TaskDAG, spawns parallel execution:
   - Coder CLI: task "redis-client" (no deps) + task "rate-limiter" (deps: redis-client)
   - Security CLI: review Planner's architecture for rate limiting bypass vectors
   - Validator CLI: prepare test harness for rate limiting tests

6. Parallel execution:
   - Coder implements redis-client → signals complete
   - Coder implements rate-limiter middleware → signals complete
   - Security CLI: "Architecture looks sound. Verify IP spoofing via X-Forwarded-For
     is handled." → writes finding to shared memory
   - Validator: runs tests → 2 failures → sends message to Coder with details

7. Coder reads test failures, reads Security finding:
   - Fixes test failures
   - Adds X-Forwarded-For validation
   - Signals complete

8. Validator re-runs → all pass
   QA CLI spawns: edge case testing (concurrent requests, Redis connection failure)
   Documentation CLI: writes API docs for rate limiting headers

9. Orchestrator aggregates all outputs:
   - Code changes: 4 files modified, 2 files created
   - Security review: passed with 1 finding (addressed)
   - Tests: 12 new tests, all passing
   - Documentation: updated API reference, new ADR
   - Delivers to user
```

This entire flow takes 3--5 minutes of wall-clock time. A single CLI doing the same work serially takes 15--25 minutes and produces lower-quality output because its context window is saturated by turn 10.

---

## 1.4 What You've Already Built (And What's Missing)

You didn't arrive at this book as a beginner. You arrived with five working systems, each solving a piece of the multi-CLI puzzle. Let's take inventory of what you have --- and be precise about what you don't.

### td_claudecode: The Source Code

You extracted the Claude Code TypeScript source. 1,913 files. 205,000 lines of code. Ten architectural layers from CLI entry point to persistence. You understand how the `QueryEngine` loop works, how the 40+ tools are registered and dispatched, how the permission system's seven modes operate, how the Ink-based TUI renders React components to ANSI terminal output.

You built `DCode` on top of it --- HTTP/2 persistent connections to the Copilot API, native macOS Keychain token management, zero-copy SSE streaming. You eliminated the proxy overhead. You know this codebase at the source level.

**What's missing:** You understand *one* CLI deeply. The multi-CLI system needs eight, each with a different subset of these layers. The Orchestrator doesn't need the Ink TUI layer. The Security CLI doesn't need the file editing tools. The Documentation CLI doesn't need bash execution. You need to decompose the monolithic Claude Code architecture into composable layers that can be assembled differently for each specialist.

### RCode: The Rust Rewrite

You rebuilt Claude Code from scratch in Rust. 267 source files. 38 planned modules across 10 architectural layers. Tree-sitter for code intelligence. Tokio for true OS-level parallelism. Ratatui for the TUI. Rusqlite for persistence. You proved that the architecture can be reimplemented with fundamentally different performance characteristics --- sub-10ms startup, under 15MB memory, multi-core tool execution via `JoinSet`.

```rust
// From rcode — parallel tool execution
let mut join_set = JoinSet::new();
for tool_call in tool_calls {
    let ctx = context.clone();
    join_set.spawn(async move {
        execute_tool(tool_call, ctx).await
    });
}
// All tools execute simultaneously across CPU cores
while let Some(result) = join_set.join_next().await {
    results.push(result??);
}
```

**What's missing:** RCode is still one CLI doing everything. The swarm coordinator module exists in the architecture document but the multi-agent communication protocol is unimplemented. The 38 modules need to be partitioned into "shared infrastructure" (LLM client, streaming, persistence) and "specialist modules" (security analysis tools go only in Security CLI, code generation tools go only in Coder CLI).

### SwarmForge / DApp: The Orchestration Layer

You built a system that takes a single prompt and spawns a team of workers. PM/Architect supervisor analyzes requirements, produces a PRD, architecture document, and dev plan. The task DAG scheduler identifies dependency waves and launches workers in parallel. Each worker gets its own git worktree --- complete filesystem isolation. A semaphore limits concurrency to 8 workers. A health check loop detects stalled workers and restarts them.

The six agent definitions (`.agent.md` files) give each worker a specialized system prompt: frontend specialist, backend specialist, DevOps engineer, QA validator, security auditor, and the PM/Architect supervisor.

**What's missing:** The workers are generic Copilot CLI instances differentiated only by their system prompts. They all have the same 40+ tools. They all share the same context window configuration. There's no typed communication between them --- they coordinate through filesystem artifacts in `.swarm/` and the Orchestrator polls for completion. There's no mechanism for one worker to request help from another. No learning system. No persistent memory across sessions. No security model --- every worker runs with `--dangerously-skip-permissions`.

### claudecode_team: The Debate System

You proved that multi-agent debate improves output quality. The supervisor parses a prompt, plans a team of 3--7 agents with distinct roles (architect, security, backend, frontend, researcher, reviewer, writer), spawns Claude Code CLI instances, and runs iterative debate rounds. Each agent writes findings to `.team_context/`. In the debate phase, agents read each other's findings and challenge them. A synthesis phase merges everything. A quality scoring loop re-triggers debate if the score falls below 7.

```javascript
// From claudecode_team/server/supervisor.js
// Quality loop: synthesize → assess → re-debate if insufficient
if (qualityScore < 7) {
  await runDebateRound(agents, roundNumber + 1);
  return synthesize(agents); // Recursive refinement
}
```

**What's missing:** No typed message schemas --- agents communicate through raw markdown files. No persistent memory --- every session starts from zero. No security model --- all agents have full system access. No specialized tool sets --- every agent gets the same tools regardless of role. The debate protocol is effective but ad-hoc; there's no formal convergence criterion beyond the quality score threshold.

### MultiCLIs: The Terminal Hub

You built the infrastructure layer. A Python async server (`aiohttp`) manages parallel PTY sessions. Each tab is a separate CLI instance --- dcode, copilot, gemini, codex --- with its own terminal emulator rendered via xterm.js in the browser. Fallback chains handle unavailable CLIs. The async architecture supports dozens of concurrent sessions without blocking.

**What's missing:** The CLIs don't talk to each other. Each tab is an isolated terminal with no awareness of what's happening in the other tabs. There's no shared memory bus. No orchestration layer deciding which CLI should handle which part of a task. No message passing. No result aggregation. It's a terminal multiplexer, not a multi-agent system.

### The Gap Analysis

Across all five projects, here's the systematic accounting of what's missing to reach a production multi-CLI AGI system:

| Capability | Status | Where It's Needed |
|-----------|--------|-------------------|
| Specialized tool sets per CLI | Missing | Each CLI gets only the tools relevant to its domain |
| Domain-optimized system prompts | Partial (SwarmForge `.agent.md`) | Each CLI needs a 2,000+ word system prompt tuned for its specialty |
| Typed shared memory with schemas | Missing | Replace ad-hoc `.team_context/` files with validated, structured data |
| Inter-CLI message passing | Missing | Direct, typed, prioritized messages between CLIs |
| Orchestrator intent analysis | Partial (SwarmForge intent analyzer) | Classify user prompts into task types and route to correct specialists |
| Dependency-aware scheduling | Present (SwarmForge task DAG) | Needs to operate at CLI level, not just task level |
| Learning from outcomes | Missing | Each CLI must improve based on historical success/failure data |
| Per-CLI permission models | Missing | Security CLI can read code but not modify it. Coder CLI can modify code but not deploy it. |
| Session persistence | Partial (Claude Code sessions) | Multi-CLI sessions must be resumable as a unit |
| Failure recovery | Partial (SwarmForge health checks) | If one CLI crashes, the system must recover gracefully without losing work |

This book closes every gap in this table.

---

## 1.5 What "AGI" Really Means Here

Let's be precise about terminology, because imprecision in this domain gets people fired or funded for the wrong reasons.

AGI --- Artificial General Intelligence --- in the popular imagination means a sentient machine. A conscious entity that thinks, reasons, and understands. That is not what we're building. That is not what this book claims to produce. If that's what you're looking for, close this book and open a philosophy textbook.

What we mean by AGI in this context is narrower and more useful: **a system that can autonomously handle any software engineering task given a single natural language prompt, producing production-quality output without human intervention during execution.**

The key word is *any*. Not "any task a junior developer could do." Any task a *senior engineering team* could do:

- "Build a SaaS dashboard with Stripe payments, RBAC, and multi-tenant data isolation" --- and the system produces a deployed application with working payment integration, role-based access control, tenant isolation at the database level, CI/CD pipeline, monitoring, documentation, and security audit.

- "Audit this codebase for OWASP Top 10 vulnerabilities" --- and the system produces a security report with specific file:line references, CWE classifications, severity ratings, exploitation scenarios, and tested remediation patches.

- "Set up CI/CD for this monorepo with preview environments, canary deployments, and automatic rollback" --- and the system produces working GitHub Actions workflows, Terraform configurations, environment provisioning scripts, monitoring dashboards, and runbooks.

- "Write a technical book on multi-agent systems" --- and the system produces 20+ chapters of technically accurate, well-structured content with code examples, diagrams, and cross-references.

No single model can do this. GPT-5, Claude Opus, Gemini Ultra --- none of them, alone, in a single context window, can reliably produce a complete SaaS application from a one-sentence prompt. The context window is too small. The domain expertise required is too broad. The number of sequential steps is too large.

But eight specialized CLIs? Each running a frontier model with a domain-optimized system prompt, a curated tool set, persistent memory, and structured communication channels?

The Research CLI gathers requirements and best practices. The Planner CLI designs the architecture and decomposes it into a task graph. The Coder CLI implements each component. The Security CLI reviews every line for vulnerabilities. The Validator CLI ensures everything builds, passes tests, and meets quality standards. The QA CLI attacks the system from a user's perspective. The Documentation CLI produces the docs. The Orchestrator coordinates everything, resolves conflicts, and delivers the result.

That's not science fiction. That's engineering. And you've already built the components. This book shows you how to assemble them.

---

## 1.6 How This Book Is Structured

This book is organized into five parts, progressing from foundational understanding through implementation to production operations. Each chapter builds on the previous ones. Code examples are cumulative --- the system you build in Chapter 4 is extended in every subsequent chapter.

### Part I: Foundations (Chapters 1--3)

**Chapter 1 (this chapter):** The vision. Why multi-CLI, what the architecture looks like, what you've already built, what's missing.

**Chapter 2: Claude Code's Architecture --- The Blueprint.** A deep technical dissection of Claude Code's 10 architectural layers. Not a tutorial --- you've already read the source. This chapter extracts the *design principles* that make the agentic loop work: the QueryEngine's stop conditions, the tool orchestration's batching strategy, the permission system's deny-tracking, the compaction system's preservation heuristics. These principles carry forward into every specialized CLI you build.

**Chapter 3: Setting Up the Forge.** Infrastructure. The mono-repo structure. Shared libraries for LLM communication, streaming, memory, and message passing. The build system. The development workflow. By the end of this chapter, you have a working skeleton that compiles and runs but does nothing useful yet.

### Part II: Building the Specialists (Chapters 4--11)

One chapter per CLI. Each follows the same structure: domain analysis (what does this specialist need to know?), tool set design (which tools, why these and not others), system prompt engineering (the 2,000+ word prompt that defines the specialist's identity), memory schema (what does this specialist remember between sessions?), implementation, and testing.

**Chapter 4:** Orchestrator CLI  
**Chapter 5:** Research CLI  
**Chapter 6:** Planner CLI  
**Chapter 7:** Coder CLI  
**Chapter 8:** Security CLI  
**Chapter 9:** Validator CLI  
**Chapter 10:** QA CLI  
**Chapter 11:** Documentation CLI  

### Part III: Integration (Chapters 12--14)

**Chapter 12: The Shared Memory Bus.** Typed schemas, concurrent access, conflict resolution, garbage collection. How eight CLIs read and write shared state without corruption, race conditions, or unbounded growth.

**Chapter 13: Inter-CLI Communication.** Message passing protocol. Priority queues. Request/response patterns. Event broadcasting. How the Security CLI tells the Coder CLI about a vulnerability. How the Validator CLI tells the Orchestrator about a test failure. How the Orchestrator tells everyone to stop because the user changed their mind.

**Chapter 14: The CLAUDE.md System.** How each CLI's system prompt is assembled from shared templates and specialist-specific instructions. How the CLAUDE.md hierarchy (global → project → session → task) works across eight CLIs. How to version, test, and iterate on system prompts.

### Part IV: Operations (Chapters 15--18)

**Chapter 15: The Orchestration Protocol.** Intent classification. Task decomposition algorithms. Dependency graph construction and scheduling. Parallel execution management. Result synthesis. Failure recovery. The Orchestrator's decision-making logic in detail.

**Chapter 16: DevSecOps for Multi-CLI Systems.** Permission models per CLI. Secret management. Audit logging. Compliance. How to run eight CLIs with eight different security policies rather than --dangerously-skip-permissions everywhere.

**Chapter 17: Learning and Evolution.** How each CLI improves over time. Outcome tracking. Pattern extraction from successful sessions. Failure analysis. Memory curation. The feedback loop that makes the system get better with every task it completes.

**Chapter 18: Scaling.** From 8 CLIs on one machine to distributed execution. Load balancing. Cloud deployment. Cost optimization. When to scale up (bigger models) versus scale out (more CLIs).

### Part V: Applications (Chapters 19--22)

**Chapter 19:** Case Study --- Building a SaaS Application from One Prompt  
**Chapter 20:** Case Study --- Full Security Audit of a Production Codebase  
**Chapter 21:** Case Study --- Writing and Publishing a Technical Book  
**Chapter 22:** The Road Ahead --- Autonomous Software Engineering at Scale  

---

## 1.7 The One-Prompt Promise

Here is what you will build by the end of this book. Not a concept. Not a diagram. A working system.

You open a terminal. You type:

```
forge "Build a project management API with PostgreSQL, JWT auth,
       RBAC (admin/manager/member), real-time updates via WebSocket,
       and deploy to AWS with Terraform"
```

You press Enter.

Within two seconds, the Orchestrator CLI activates. It classifies the intent: `IMPLEMENT`, complexity `HIGH`, estimated specialist count: `7/8`. It sends its first status message to your terminal:

```
[FORGE] Intent: IMPLEMENT (full-stack API + infrastructure)
[FORGE] Spawning specialists...
  ├─ Research CLI    → gathering patterns, evaluating tech choices
  ├─ Planner CLI     → standing by for research brief
  ├─ Coder CLI       → standing by for task assignments
  ├─ Security CLI    → standing by for architecture review
  ├─ Validator CLI   → standing by for implementation
  ├─ QA CLI          → standing by for test targets
  └─ Documentation CLI → standing by for final artifacts
```

The Research CLI searches the codebase for existing patterns. Finds a similar API structure in a sibling project. Queries its RAG database for PostgreSQL RBAC best practices. Fetches the latest Terraform AWS provider documentation. Within 90 seconds, it writes a structured research brief to the shared memory bus and signals completion.

The Planner CLI reads the brief. Produces an architecture decision record: PostgreSQL with Row-Level Security for tenant isolation, JWT RS256 with refresh token rotation, WebSocket via Socket.io with Redis pub/sub for horizontal scaling, Terraform modules for VPC + ECS + RDS + ElastiCache. Decomposes the work into 14 tasks across 5 dependency waves. Writes the task DAG to shared memory.

The Orchestrator reads the DAG and begins wave execution:

```
[FORGE] Wave 1 (parallel):
  ├─ Coder CLI [task: db-schema]        → creating migrations
  ├─ Coder CLI [task: terraform-base]   → VPC + networking
  ├─ Security CLI [task: arch-review]   → reviewing architecture
  └─ Doc CLI [task: adr-001]            → writing ADR

[FORGE] Wave 2 (after db-schema):
  ├─ Coder CLI [task: user-model]       → User + Role models
  ├─ Coder CLI [task: auth-middleware]  → JWT + RBAC middleware
  └─ Validator CLI [task: test-harness] → setting up Jest + supertest

[FORGE] Wave 3 (after auth-middleware):
  ├─ Coder CLI [task: api-endpoints]    → CRUD routes
  ├─ Coder CLI [task: websocket]        → real-time layer
  ├─ Security CLI [task: code-scan]     → SAST on implementation
  └─ QA CLI [task: edge-cases]          → adversarial test design
```

The Security CLI flags an issue: the Planner's architecture doesn't specify rate limiting on the auth endpoints. It writes a finding to shared memory with severity `HIGH` and a recommended fix. The Orchestrator routes this to the Coder CLI, which adds rate limiting middleware before implementing the auth endpoints.

The Validator CLI runs the test suite after each wave completes. Wave 2 produces a failure: the RBAC middleware doesn't handle the edge case where a user's role is modified mid-session. The Validator sends a typed failure message to the Coder CLI with the exact test output, expected behavior, and stack trace. The Coder fixes it. The Validator re-runs. All green.

The QA CLI finishes its adversarial testing. It found that the WebSocket connection doesn't re-authenticate after token rotation, creating a 15-second window where a revoked token still receives events. It writes this to shared memory. The Coder implements a WebSocket authentication heartbeat. The Validator confirms the fix.

The Documentation CLI has been working in parallel the entire time. It read the ADR from wave 1. It watched the Coder's implementation through shared memory. It produces: API reference (OpenAPI 3.1), deployment runbook, architecture diagram (Mermaid), README with setup instructions, and a changelog.

Eleven minutes after you pressed Enter, the Orchestrator delivers:

```
[FORGE] Complete.
  ├─ 23 files created, 4 files modified
  ├─ 47 tests passing (unit + integration)
  ├─ Security: 0 critical, 0 high, 2 medium (documented, accepted)
  ├─ Coverage: 89% line, 82% branch
  ├─ Terraform: validated, plan generated (12 resources)
  ├─ Documentation: API ref, ADR-001, deployment runbook, README
  └─ Branch: feat/project-management-api (ready for PR)

  Time: 11m 23s | Tokens: 847K across 8 CLIs | Cost: $3.41
```

One prompt. Eight specialists. Eleven minutes. A complete, tested, documented, security-reviewed, deployment-ready API.

That is the system this book teaches you to build. Not by starting from scratch --- you've already built the pieces. By engineering discipline: typed contracts between specialists, dependency-aware scheduling, persistent learning, and security that doesn't require trusting every agent with root access.

The forge is waiting. Let's build it.

---

*Next: Chapter 2 --- Claude Code's Architecture: The Blueprint*
