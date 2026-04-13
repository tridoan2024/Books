# Chapter 41: The Cron Scheduler

A CLI agent that only acts when a human types a prompt is fundamentally reactive. It waits, it responds, it waits again. That model works for interactive pair-programming, but it fails the moment the user needs something to happen at 2 AM, every Tuesday, or whenever a particular file changes on disk. The cron scheduler is what transforms the agent from a conversational tool into an autonomous system capable of acting on its own schedule.

In the previous chapter, we examined the security infrastructure that protects the agent's execution environment (Chapter 40). Now we turn to the subsystem that governs *when* the agent executes: the cron scheduler. This is not a simple wrapper around the operating system's `crontab`. It is a purpose-built scheduling engine with its own expression parser, a dual-tier persistence model (durable on disk versus ephemeral in memory), deterministic jitter to prevent thundering herds, automatic expiry to prevent zombie tasks, and a file watcher that enables hot-reload of task definitions without restarting the agent.

The implementation draws from three modules in the codebase: a `CronTool` that handles user-facing CRUD operations (`tools/cron.ts`), a `CronExpr` parser used by the Kairos autonomous scheduler runtime (`kairos/triggers.ts`), and a `FileWatcher` that monitors the task configuration file for changes (`watcher/mod.ts`). Together they form a scheduling system that is both powerful enough for production agent orchestration and safe enough that a runaway cron expression cannot flood the system with spawned processes.

---

## 41.1 Why Build a Custom Cron Parser?

The first question a pragmatic engineer asks is: why not use an existing cron library? Node has `node-cron`, `cron-parser`, `croner`, and a dozen other battle-tested packages. Rust has the `cron` crate. The answer is threefold.

**First, control over field semantics.** Standard cron expressions come in several dialects: the POSIX 5-field format, the Vixie cron extension with seconds, the Quartz scheduler's 6-field format with both seconds and year, and the Spring variant that adds `?` and `L` modifiers. An external library supporting the Quartz format would accept `0 0 12 ? * MON-FRI *`, but the agent's users are engineers who think in the classic `minute hour day-of-month month day-of-week` format. Supporting exactly one dialect eliminates ambiguity.

**Second, zero-dependency parsing.** The cron parser runs inside the tool execution sandbox. Any dependency it pulls in becomes part of the agent's attack surface. A hand-rolled parser that operates on string slices and produces a simple enum has zero transitive dependencies, is trivially auditable, and compiles in milliseconds.

**Third, predictable next-fire computation.** The agent needs to compute the exact next run time for display in `cron list` output and for the scheduler's tick loop. External libraries vary wildly in how they handle edge cases like daylight saving transitions, months with fewer than 31 days, and leap years. A custom implementation lets you define the behavior precisely and test it exhaustively.

---

## 41.2 The 5-Field Cron Expression Format

The scheduler uses the standard POSIX cron format:

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, 0=Sunday)
│ │ │ │ │
* * * * *
```

Each field supports five expression types:

| Syntax | Name | Example | Meaning |
|--------|------|---------|---------|
| `*` | Wildcard | `* * * * *` | Every minute |
| `N` | Exact | `30 2 * * *` | 2:30 AM daily |
| `N-M` | Range | `0 9-17 * * *` | Every hour 9 AM-5 PM |
| `*/N` | Step | `*/15 * * * *` | Every 15 minutes |
| `N,M,P` | List | `0 0 1,15 * *` | 1st and 15th at midnight |

The parser rejects anything outside these five forms. No `L` for "last day of month," no `W` for "nearest weekday," no `#` for "Nth weekday of month." Those extensions are useful in enterprise schedulers but create confusion in a CLI tool where the user is typing a cron expression inline.

### The CronField Enum

The parser's core data structure is an enum that represents one parsed field:

```typescript
// Conceptual TypeScript representation of the parsed field
type CronField =
  | { type: "any" }                          // *
  | { type: "exact"; value: number }         // 30
  | { type: "range"; start: number; end: number } // 9-17
  | { type: "step"; step: number }           // */15
  | { type: "set"; values: number[] };       // 1,15,28
```

In the reference implementation, this is a Rust enum with five variants:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum CronField {
    Any,
    Exact(u32),
    Set(Vec<u32>),
    Range { start: u32, end: u32 },
    Step(u32),
}
```

The enum is `Serialize`/`Deserialize` because task definitions are persisted to disk. Storing the parsed representation avoids re-parsing on every tick and makes the serialized format self-documenting: a human reading the JSON can see `{"Range": {"start": 9, "end": 17}}` and immediately understand what hours the task runs.

### Field Parsing

Each field token is parsed with strict bounds checking:

```rust
pub fn parse_cron_field(token: &str, min: u32, max: u32) -> Result<CronField> {
    let token = token.trim();

    if token == "*" {
        return Ok(CronField::Any);
    }

    // Step: */N
    if let Some(step_str) = token.strip_prefix("*/") {
        let step: u32 = step_str.parse()
            .map_err(|_| anyhow!("invalid step value: {step_str}"))?;
        if step == 0 || step > max {
            return Err(anyhow!("step {step} out of range 1..={max}"));
        }
        return Ok(CronField::Step(step));
    }

    // Range: a-b
    if token.contains('-') && !token.starts_with('-') {
        let parts: Vec<&str> = token.splitn(2, '-').collect();
        let start: u32 = parts[0].parse()?;
        let end: u32 = parts[1].parse()?;
        if start < min || end > max || start > end {
            return Err(anyhow!("range {start}-{end} out of bounds {min}..={max}"));
        }
        return Ok(CronField::Range { start, end });
    }

    // Set: a,b,c
    if token.contains(',') {
        let values: Result<Vec<u32>> = token.split(',')
            .map(|s| {
                let v: u32 = s.trim().parse()?;
                if v < min || v > max {
                    return Err(anyhow!("set value {v} out of bounds {min}..={max}"));
                }
                Ok(v)
            })
            .collect();
        return Ok(CronField::Set(values?));
    }

    // Exact value
    let val: u32 = token.parse()?;
    if val < min || val > max {
        return Err(anyhow!("value {val} out of bounds {min}..={max}"));
    }
    Ok(CronField::Exact(val))
}
```

Notice the parsing order: wildcard, step, range, set, exact. This ordering matters because `-` can appear in negative numbers (handled by the `!token.starts_with('-')` guard), and `,` has lower priority than `-` in standard cron semantics.

The `min` and `max` parameters encode the legal range for each field position. Minutes get `(0, 59)`, hours get `(0, 23)`, day-of-month gets `(1, 31)`, month gets `(1, 12)`, and day-of-week gets `(0, 6)`. This parameterization means the same parsing function handles all five positions with different bounds.

### Full Expression Parsing

Assembling a full expression is straightforward — split on whitespace, enforce exactly five tokens, parse each with the correct bounds:

```rust
pub fn parse_cron_expression(expr: &str) -> Result<CronExpression> {
    let fields: Vec<&str> = expr.split_whitespace().collect();
    if fields.len() != 5 {
        return Err(anyhow!("expected 5 fields, got {}", fields.len()));
    }

    Ok(CronExpression {
        minute:       parse_cron_field(fields[0], 0, 59)?,
        hour:         parse_cron_field(fields[1], 0, 23)?,
        day_of_month: parse_cron_field(fields[2], 1, 31)?,
        month:        parse_cron_field(fields[3], 1, 12)?,
        day_of_week:  parse_cron_field(fields[4], 0, 6)?,
    })
}
```

The parser is strict: `"0 12 *"` (only 3 fields) produces an error, `"0 12 * * * *"` (6 fields) also produces an error. No guessing, no auto-padding. If the user provides a malformed expression, the tool returns a clear error message with the expected count.

---

## 41.3 Expression Matching and Next-Fire Computation

Parsing a cron expression is only half the work. The scheduler needs two operations on a parsed expression: (1) does it match a given datetime? and (2) when is the next time it will match?

### Field Matching

Each `CronField` variant has a corresponding match rule:

```rust
pub fn field_matches(field: &CronField, value: u32) -> bool {
    match field {
        CronField::Any => true,
        CronField::Exact(v) => *v == value,
        CronField::Set(vs) => vs.contains(&value),
        CronField::Range { start, end } => value >= *start && value <= *end,
        CronField::Step(step) => value % step == 0,
    }
}
```

The `Step` variant uses modulo arithmetic: `*/15` for the minute field matches 0, 15, 30, and 45. This is the POSIX semantics where the step is applied against the full range of the field starting from zero (or one, for day-of-month and month).

A full expression matches a datetime when all five fields match simultaneously:

```rust
pub fn expression_matches(expr: &CronExpression, dt: &NaiveDateTime) -> bool {
    field_matches(&expr.minute, dt.minute())
        && field_matches(&expr.hour, dt.hour())
        && field_matches(&expr.day_of_month, dt.day())
        && field_matches(&expr.month, dt.month())
        && field_matches(&expr.day_of_week, dt.weekday().num_days_from_sunday())
}
```

Note the `num_days_from_sunday()` call for day-of-week. POSIX cron defines Sunday as 0, Monday as 1, through Saturday as 6. The Chrono library's `Weekday` enum starts with Monday, so the conversion is necessary.

### The Dual Implementation Pattern

The codebase contains two cron parsers that serve different architectural roles. The `CronField` enum approach in `tools/cron.ts` stores the parsed representation lazily -- it preserves the original expression type (Range, Step, etc.) and evaluates matches at runtime. The `CronExpr` struct in `kairos/triggers.ts` takes a different approach: it eagerly expands every field into a `Vec<u32>` of matching values at parse time.

```rust
// kairos/triggers.ts approach: eager expansion
pub struct CronField {
    pub values: Vec<u32>,   // Pre-computed matching values
    pub is_wildcard: bool,  // Optimization: skip contains() check
}
```

For `*/15` on the minute field, the eager approach pre-computes `[0, 15, 30, 45]` at parse time. The lazy approach stores `Step(15)` and computes `value % 15 == 0` at match time. Both produce identical results, but the tradeoffs differ:

| Approach | Parse Cost | Match Cost | Memory | Best For |
|----------|-----------|------------|--------|----------|
| Lazy (enum) | O(1) | O(1) per field | Minimal | Tool CRUD operations |
| Eager (Vec) | O(range) | O(n) contains check | Higher | Scheduler hot path |

The lazy approach wins for the tool layer where expressions are created, listed, and deleted -- operations where you parse once and rarely match. The eager approach wins in the scheduler's tick loop where you match against the current time every 60 seconds for potentially hundreds of registered schedules. The `is_wildcard` flag in the eager version is a critical optimization: wildcard fields return `true` immediately without scanning the values vector.

### Next-Fire Computation

Computing the next time an expression fires requires scanning forward from the current time. The implementation uses a brute-force minute-by-minute scan with a 366-day horizon:

```rust
pub fn next_run_after(expr: &CronExpression, after: NaiveDateTime) -> Option<NaiveDateTime> {
    let mut candidate = after + chrono::Duration::minutes(1);
    // Zero out seconds to align on minute boundaries
    candidate = candidate.date()
        .and_hms_opt(candidate.hour(), candidate.minute(), 0)?;

    let horizon = after + chrono::Duration::days(366);

    while candidate < horizon {
        if expression_matches(expr, &candidate) {
            return Some(candidate);
        }
        candidate += chrono::Duration::minutes(1);
    }
    None
}
```

The 366-day horizon guarantees that even a February 29th expression (`0 0 29 2 *`) finds a match within the scan window. The function returns `None` for pathologically impossible expressions, though the parser's bounds checking makes those rare.

Is a minute-by-minute scan efficient enough? For a single expression, the worst case is 366 * 24 * 60 = 527,040 iterations. Each iteration is a handful of comparisons -- no allocations, no string operations, no I/O. On modern hardware, this completes in under 10 milliseconds. Since `next_run_after` is called at most once per task per trigger cycle (not once per tick), the total overhead is negligible. A more sophisticated algorithm could skip months or days that cannot match, but the added complexity is not justified when the brute-force approach is already fast enough for the expected task counts (the store is capped at 256 tasks).

---

## 41.4 The CronTool: User-Facing CRUD Operations

The agent exposes cron scheduling through a tool interface with three sub-commands: `create`, `list`, and `delete`. This follows the same pattern we saw in the task management tools (Chapter 14), where a single tool handles multiple operations through an `action` parameter.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": ["create", "list", "delete"],
      "description": "Sub-command: create, list, or delete."
    },
    "expression": {
      "type": "string",
      "description": "5-field cron expression (required for create)."
    },
    "command": {
      "type": "string",
      "description": "Shell command to run (required for create)."
    },
    "id": {
      "type": "string",
      "description": "Task ID (required for delete)."
    }
  },
  "required": ["action"]
}
```

Only `action` is globally required. The tool validates that `expression` and `command` are present for `create`, and that `id` is present for `delete`. This conditional validation is handled in the `run()` method rather than in the JSON Schema, because JSON Schema's `if/then/else` conditionals are poorly supported by LLM tool-use implementations.

### Task Creation

When the model calls `cron create`, the flow is:

1. Parse the cron expression (reject invalid expressions immediately).
2. Generate a unique task ID using a truncated microsecond timestamp.
3. Construct a `CronTask` struct with the parsed expression, raw expression string, command, and creation timestamp.
4. Insert into the in-memory store (reject if at capacity).
5. Return the task ID.

```rust
"create" => {
    let expr_raw = input.get("expression")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("'expression' is required for create"))?;
    let command = input.get("command")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("'command' is required for create"))?;

    let expression = parse_cron_expression(expr_raw)?;
    let id = generate_task_id();

    let task = CronTask {
        id: id.clone(),
        expression_raw: expr_raw.to_string(),
        expression,
        command: command.to_string(),
        enabled: true,
        created_at: Local::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
    };

    self.store.insert(task)?;
    Ok(ToolResult::ok(format!("Created task {id}")))
}
```

The task ID generation uses a truncated microsecond timestamp masked to 32 bits and formatted as hex:

```rust
pub fn generate_task_id() -> String {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    format!("cron-{:x}", ts & 0xFFFF_FFFF)
}
```

This produces IDs like `cron-a3f7b2c1`. The 32-bit mask means IDs recycle roughly every 4,295 seconds (about 71 minutes), but since the store is keyed by ID and collisions only matter if two tasks are created in the same microsecond, this is acceptable. For production deployments with hundreds of tasks, you would use a proper UUID as the Kairos runtime does.

### Task Listing

The `list` action enumerates all registered tasks with their next scheduled run time:

```
Scheduled tasks (3):
  cron-a3f7b2c1  ON   */15 * * * *    next=2026-04-12 14:45  cmd=git pull
  cron-b8e2d0f4  ON   0 9-17 * * 1-5  next=2026-04-14 09:00  cmd=run-tests.sh
  cron-c1a9e3b7  OFF  0 2 * * *       next=2026-04-13 02:00  cmd=backup.sh
```

Each line shows the task ID, enabled/disabled status, the raw expression, the computed next fire time, and the command. The next fire time is computed on demand by calling `next_run_after` with the current time, which means the display is always accurate even if the user lists tasks hours after creation.

### Read-Only and Destructive Classification

The tool implements the `is_read_only` and `is_destructive` methods that the permission system checks before execution (as discussed in Chapter 15):

```rust
fn is_read_only(&self, input: &Value) -> bool {
    input.get("action")
        .and_then(|v| v.as_str())
        .map(|a| a == "list")
        .unwrap_or(false)
}

fn is_destructive(&self, input: &Value) -> bool {
    input.get("action")
        .and_then(|v| v.as_str())
        .map(|a| a == "delete")
        .unwrap_or(false)
}
```

This means `cron list` runs without permission prompts in auto-mode, `cron create` requires standard tool permission, and `cron delete` triggers the destructive action confirmation. The asymmetric permission model prevents the agent from silently deleting scheduled tasks while allowing it to inspect what tasks exist.

---

## 41.5 Durable Tasks vs. Session-Only Tasks

The scheduler maintains two tiers of task storage, each with different persistence guarantees and lifecycle characteristics.

### Session-Only Tasks (In-Memory)

The `CronStore` is a thread-safe in-memory hash map wrapped in `Arc<Mutex<>>`:

```rust
#[derive(Debug, Clone, Default)]
pub struct CronStore {
    tasks: Arc<Mutex<HashMap<String, CronTask>>>,
}
```

Tasks in this store exist only for the lifetime of the current agent process. When the user closes the terminal or the session times out, session-only tasks vanish. This is the right default for most interactive use cases: "run `git pull` every 15 minutes while I'm working" should not persist after the user logs off.

The store enforces a hard capacity limit:

```rust
const MAX_TASKS: usize = 256;

pub fn insert(&self, task: CronTask) -> Result<()> {
    let mut map = self.tasks.lock()
        .map_err(|e| anyhow!("lock poisoned: {e}"))?;
    if map.len() >= MAX_TASKS {
        return Err(anyhow!("maximum of {MAX_TASKS} tasks reached"));
    }
    map.insert(task.id.clone(), task);
    Ok(())
}
```

The 256-task limit prevents runaway task creation. Without it, a model in a loop could create thousands of tasks, each spawning a process every minute, effectively launching a fork bomb. The limit is deliberately conservative -- most real-world schedules involve fewer than 20 recurring tasks.

### Durable Tasks (`.claude/scheduled_tasks.json`)

For tasks that should survive session restarts, the scheduler persists them to `.claude/scheduled_tasks.json` in the project root. The file format is a JSON array of task definitions:

```json
{
  "version": 1,
  "tasks": [
    {
      "id": "cron-a3f7b2c1",
      "expression_raw": "0 9 * * 1-5",
      "expression": {
        "minute": { "Exact": 0 },
        "hour": { "Range": { "start": 9, "end": 9 } },
        "day_of_month": { "Any": null },
        "month": { "Any": null },
        "day_of_week": { "Range": { "start": 1, "end": 5 } }
      },
      "command": "run-tests.sh",
      "enabled": true,
      "created_at": "2026-04-12T14:30:00",
      "expires_at": "2026-04-19T14:30:00",
      "jitter_ms": 15000
    }
  ],
  "updated_at": "2026-04-12T14:30:00"
}
```

Several design decisions in this schema deserve explanation:

**The parsed expression is stored alongside the raw string.** This avoids re-parsing on every load and makes the file self-documenting. A human reviewing the file can read the raw string for a quick understanding and consult the parsed representation for exact semantics.

**Each task carries an `expires_at` timestamp.** This implements the 7-day auto-expiry discussed in Section 41.7. Without explicit expiry, a durable task file accumulates zombie tasks over months -- tasks whose purpose has been forgotten, whose commands reference deleted scripts, or whose schedules no longer make sense.

**Each task carries a `jitter_ms` field.** This is the deterministic jitter offset discussed in Section 41.6. Storing it per-task rather than computing it at runtime ensures that the jitter is stable across restarts.

**The file uses a `version` field for forward compatibility.** If the task schema evolves (say, adding `max_retries` or `notification_channel` fields), the loader can migrate v1 tasks to v2 format without losing data.

### Loading Durable Tasks at Startup

When the agent starts, the session initialization pipeline checks for `.claude/scheduled_tasks.json` and loads any durable tasks into the in-memory store:

```typescript
async function loadDurableTasks(store: CronStore, projectRoot: string): Promise<void> {
  const taskFile = path.join(projectRoot, ".claude", "scheduled_tasks.json");

  if (!fs.existsSync(taskFile)) {
    return; // No durable tasks configured
  }

  const content = fs.readFileSync(taskFile, "utf-8");
  const data = JSON.parse(content);

  const now = new Date();
  let expiredCount = 0;

  for (const task of data.tasks) {
    // Skip expired tasks
    if (task.expires_at && new Date(task.expires_at) < now) {
      expiredCount++;
      continue;
    }

    // Skip tasks with unparseable expressions (defensive)
    try {
      parseCronExpression(task.expression_raw);
    } catch {
      continue;
    }

    store.insert(task);
  }

  if (expiredCount > 0) {
    // Rewrite the file without expired tasks
    data.tasks = data.tasks.filter(
      (t: any) => !t.expires_at || new Date(t.expires_at) >= now
    );
    fs.writeFileSync(taskFile, JSON.stringify(data, null, 2));
  }
}
```

The loading process is defensive: it silently skips expired tasks and tasks with malformed expressions. This means a hand-edited task file with a typo in the expression does not crash the agent on startup -- the malformed task is simply ignored. The expired tasks are pruned from the file during loading so the file does not grow unboundedly over time.

---

## 41.6 Jitter Configuration: Deterministic Offset

When multiple scheduled tasks share the same cron expression -- say, three different housekeeping scripts all scheduled at `0 * * * *` (every hour on the hour) -- they all fire simultaneously. This creates a burst of concurrent process spawns that can overwhelm the machine, especially if the commands are resource-intensive (running test suites, rebuilding indexes, compiling code).

The scheduler addresses this with deterministic jitter: a per-task delay offset computed from the task ID that spreads simultaneous firings over a configurable window.

### Why Deterministic, Not Random?

Random jitter is the standard approach in distributed systems (see AWS's blog post on "Jitter in Retry" or Google's SRE book). But random jitter has a problem in a CLI tool: the user runs `cron list` and sees "next run: 14:00." The task actually fires at 14:00 plus a random offset. The user checks at 14:01, sees nothing happened, and files a bug report. Deterministic jitter from the task ID produces the same offset every time, making the behavior predictable and the next-fire display accurate.

### Computing the Offset

The jitter offset is derived from the task ID using a simple hash:

```typescript
function computeJitter(taskId: string, maxJitterMs: number): number {
  // FNV-1a hash of the task ID
  let hash = 2166136261;
  for (let i = 0; i < taskId.length; i++) {
    hash ^= taskId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % maxJitterMs;
}
```

The FNV-1a hash is fast, non-cryptographic (which is fine for jitter), and produces a uniform distribution over the output range. With a default `maxJitterMs` of 30,000 (30 seconds), three tasks scheduled at the same time will fire within a 30-second window, but each at a consistent offset.

For the task `cron-a3f7b2c1` with max jitter of 30,000 ms, the hash might produce 17,423 ms. Every time this task fires, it waits 17.4 seconds after the nominal fire time. The user sees this reflected in the `cron list` output: "next=14:00:17" instead of "next=14:00:00."

### Jitter in the Kairos Runtime

The Kairos autonomous scheduler takes the jitter concept further with its `BackoffStrategy`, which also uses deterministic pseudo-jitter for restart delays:

```rust
impl BackoffStrategy {
    pub fn delay_for(&self, attempt: u32) -> Duration {
        let base = self.initial_delay_ms as f64 * self.multiplier.powi(attempt as i32);
        let capped = base.min(self.max_delay_ms as f64);

        let jittered = if self.jitter > 0.0 {
            // Deterministic-ish jitter from attempt number
            let pseudo = ((attempt as f64 * 7.3).sin().abs()) * self.jitter;
            capped * (1.0 + pseudo)
        } else {
            capped
        };

        Duration::from_millis(jittered as u64)
    }
}
```

This uses the sine function as a cheap pseudo-random source, seeded by the attempt number multiplied by an irrational-ish constant (7.3). The result is deterministic for a given attempt count but appears random across different counts. The jitter factor (0.0 to 1.0) controls the spread -- a factor of 0.1 means up to 10% variation from the base delay.

The default backoff configuration uses a 2x multiplier with a 30-second cap:

```
Attempt 0: 500ms
Attempt 1: 1,000ms + jitter
Attempt 2: 2,000ms + jitter
Attempt 3: 4,000ms + jitter
...
Attempt 6+: 30,000ms (capped) + jitter
```

This prevents a crashing task from being restarted in a tight loop while still recovering quickly from transient failures.

---

## 41.7 Seven-Day Auto-Expiry for Recurring Tasks

Durable tasks persisted in `scheduled_tasks.json` carry an `expires_at` field set to 7 days after creation. When the agent loads the task file at startup, expired tasks are silently removed.

### Why 7 Days?

The expiry window is a safety mechanism, not a feature constraint. Without it, consider this scenario:

1. A developer schedules `cron create "*/5 * * * *" "npm test"` to run tests every 5 minutes during an intense debugging session.
2. The developer finishes, closes the terminal, goes on vacation.
3. Two weeks later, the developer opens the project. The agent loads the durable task file and starts running `npm test` every 5 minutes -- on a codebase that may have changed significantly, in a context the developer has forgotten about.

Seven days is long enough to survive a weekend (the most common interruption pattern for developers) but short enough that stale tasks do not accumulate. Tasks that genuinely need to persist longer -- nightly builds, weekly reports -- should be managed through proper CI/CD systems (GitHub Actions, Jenkins, etc.), not through a CLI agent's built-in scheduler.

### Renewal

A task's expiry can be renewed by re-creating it with the same command:

```
cron create "0 2 * * *" "backup.sh"
```

This creates a new task (with a new ID and a fresh 7-day expiry) even if an identical command already exists. The old task continues to exist until it expires. This is intentional -- automated renewal prevents the "silently expired" problem, and duplicate tasks for the same command are visible in `cron list`.

### Expiry in the Kairos Runtime

The Kairos runtime takes a different approach to lifecycle management. Instead of time-based expiry, it uses failure-based auto-disabling:

```rust
fn record_failure(&mut self) {
    self.failure_count += 1;
    if self.max_retries > 0 && self.failure_count >= self.max_retries {
        self.enabled = false;
    }
}
```

A schedule that fails 3 consecutive times (the default `max_retries`) is automatically disabled. This is more appropriate for the autonomous agent context where tasks are long-running agent executions rather than simple shell commands. A shell command that fails is probably misconfigured; an agent execution that fails might be hitting a transient API error, a rate limit, or a resource contention issue.

The two approaches complement each other: time-based expiry prevents zombie tasks in the durable file, and failure-based disabling prevents runaway retries in the live runtime.

---

## 41.8 The Scheduler Tick Loop

The Kairos runtime's scheduler operates on a 60-second tick interval. Every tick, it evaluates all registered schedules and fires those whose conditions are met.

### The Core Loop

```rust
pub fn start(&mut self) -> Result<(), KairosError> {
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
    self.shutdown_tx = Some(shutdown_tx);

    let inner = Arc::clone(&self.inner);
    let event_tx = self.event_tx.clone();
    let interval = self.tick_interval;

    let handle = tokio::spawn(async move {
        let _ = event_tx.send(KairosEvent::RuntimeStarted).await;

        loop {
            tokio::select! {
                _ = tokio::time::sleep(interval) => {
                    Self::tick(&inner, &event_tx).await;
                }
                _ = shutdown_rx.recv() => {
                    let _ = event_tx.send(KairosEvent::RuntimeStopped).await;
                    break;
                }
            }
        }
    });

    self.loop_handle = Some(handle);
    Ok(())
}
```

The `tokio::select!` macro provides cooperative shutdown: the loop either processes a tick or receives a shutdown signal, whichever comes first. This avoids the common anti-pattern of setting a boolean flag and busy-waiting for it.

### Tick Evaluation

Each tick evaluates every enabled schedule:

```rust
async fn tick(inner: &Arc<RwLock<RuntimeInner>>, event_tx: &mpsc::Sender<KairosEvent>) {
    let now = Utc::now();
    let schedules: Vec<AgentSchedule> = {
        let guard = inner.read().await;
        guard.schedules.values().cloned().collect()
    };

    for schedule in schedules {
        if !schedule.enabled {
            continue;
        }

        // Skip if already running
        {
            let guard = inner.read().await;
            if guard.running.contains_key(&schedule.id) {
                let _ = event_tx.send(KairosEvent::Skipped {
                    schedule_id: schedule.id.clone(),
                    reason: "already running".into(),
                }).await;
                continue;
            }
        }

        let should_fire = Self::evaluate_triggers(&schedule, now);
        if should_fire {
            Self::execute_agent(inner, event_tx, schedule).await;
        }
    }
}
```

Three important behaviors here:

1. **Snapshot isolation.** The schedules are cloned under a read lock, then the lock is released before evaluation begins. This prevents the evaluation loop from holding the lock while agents execute, which would block all `schedule_agent` and `unschedule` operations.

2. **Single-execution guard.** If a schedule is already running, the tick skips it and emits a `Skipped` event. This prevents task pile-up when an agent execution takes longer than the tick interval. Without this guard, a task scheduled every minute that takes 90 seconds to run would accumulate overlapping executions.

3. **Event-driven observability.** Every significant scheduler action emits a `KairosEvent` through a channel. The events are collected in an in-memory log and can be consumed by notification channels (terminal, file, webhook, push notification -- as discussed in the channels module). This makes the scheduler's behavior fully auditable.

### Trigger Evaluation

The `evaluate_triggers` method checks both the cron expression and any additional trigger sources:

```rust
fn evaluate_triggers(schedule: &AgentSchedule, now: DateTime<Utc>) -> bool {
    // Cron-based check
    if let Some(ref expr) = schedule.cron_expr {
        if let Ok(cron) = CronExpr::parse(expr) {
            if let Some(next) = schedule.next_run {
                if now >= next {
                    return true;
                }
            } else if cron.matches(now) {
                return true;
            }
        }
    }

    // Additional trigger sources
    for trigger in &schedule.triggers {
        match trigger.evaluate(now, schedule.last_run) {
            TriggerResult::Fire { .. } => return true,
            TriggerResult::Skip { .. } => continue,
        }
    }

    false
}
```

The cron check uses the pre-computed `next_run` timestamp when available (which is updated after every execution via `mark_ran`). This is more efficient than re-evaluating the cron expression against the current minute, and it correctly handles the case where the scheduler was not running during the scheduled time (it catches up on the next tick).

The trigger system supports five trigger types beyond cron: webhooks (HMAC-SHA256 verified HTTP payloads), time gates (fire after N minutes since last run), session thresholds (fire after N sessions), and filesystem/git events. This makes the scheduler a general-purpose event-driven execution engine, not just a time-based one. As discussed in Chapter 18 (Hook Architecture), hooks and triggers share a similar evaluation model, but triggers operate at the schedule level while hooks operate at the tool-call level.

---

## 41.9 File Watcher for Task Hot-Reload

The scheduler watches `scheduled_tasks.json` for changes using the same `FileWatcher` infrastructure that powers the settings change detector (Chapter 21). When a user or external tool modifies the task file, the scheduler reloads it without requiring a session restart.

### The File Watcher Architecture

The `FileWatcher` is built on the `notify` crate (Rust's cross-platform filesystem notification library, equivalent to Node's `chokidar` or Python's `watchdog`). It produces debounced `FileChange` events through a tokio channel:

```rust
pub struct FileWatcher {
    watcher: notify::RecommendedWatcher,
    receiver: mpsc::UnboundedReceiver<FileChange>,
    watched_paths: Vec<PathBuf>,
    callbacks: Arc<Mutex<Vec<(Pattern, WatchCallback)>>>,
    debounce_task: JoinHandle<()>,
}
```

The debouncing is critical. When a text editor saves a file, it typically produces multiple filesystem events: a write, a metadata change, possibly a rename-and-replace (the "safe save" pattern used by Vim, VS Code, and others). Without debouncing, the scheduler would reload the task file three or four times for a single save.

The debounce implementation coalesces events within a 100-millisecond window:

```rust
const DEBOUNCE_WINDOW: Duration = Duration::from_millis(100);
const DEBOUNCE_TICK: Duration = Duration::from_millis(50);

async fn debounce_loop(
    mut raw_rx: mpsc::UnboundedReceiver<FileChange>,
    tx: mpsc::UnboundedSender<FileChange>,
    callbacks: Arc<Mutex<Vec<(Pattern, WatchCallback)>>>,
) {
    let mut buffer: HashMap<PathBuf, (ChangeKind, Instant)> = HashMap::new();
    let mut interval = tokio::time::interval(DEBOUNCE_TICK);

    loop {
        tokio::select! {
            biased;
            msg = raw_rx.recv() => match msg {
                Some(change) => {
                    buffer.insert(change.path, (change.kind, Instant::now()));
                }
                None => {
                    flush_all(&mut buffer, &tx, &callbacks);
                    break;
                }
            },
            _ = interval.tick() => {
                flush_ready(&mut buffer, &tx, &callbacks);
            }
        }
    }
}
```

Events are buffered per-path. Every 50 milliseconds, the loop checks for buffered events older than 100 milliseconds and flushes them. This means a burst of 5 events for the same file within 100ms produces exactly one `FileChange` event. The `biased` keyword in `tokio::select!` ensures incoming events are processed before flush ticks, preventing premature flushing during a burst.

### Ignored Directories

The watcher filters events from directories that should never trigger reloads:

```rust
const IGNORED_DIRS: &[&str] = &[
    ".git", "node_modules", "target", "__pycache__",
    ".rcode", ".next", "dist", ".mypy_cache",
    ".pytest_cache", ".tox", "venv", ".venv",
    "build", "vendor", ".cache",
];
```

This prevents git operations, package installations, and build processes from triggering spurious reloads. The filtering happens at the event level (after the OS notifies) rather than by excluding subdirectories (before the OS watches), because recursive watching is typically cheaper than maintaining a complex inclusion list.

### Callback Registration for Hot-Reload

The watcher supports glob-pattern callbacks that fire when matching files change:

```rust
pub fn register_callback(&self, pattern: &str, callback: WatchCallback) -> Result<()> {
    let pat = Pattern::new(pattern)?;
    self.callbacks.lock()?.push((pat, callback));
    Ok(())
}
```

For task hot-reload, the scheduler registers a callback for the task file:

```typescript
watcher.registerCallback(
  "**/scheduled_tasks.json",
  (change) => {
    log.info(`Task file changed (${change.kind}), reloading...`);
    loadDurableTasks(store, projectRoot);
  }
);
```

When the callback fires, `loadDurableTasks` re-reads the file, prunes expired tasks, and updates the in-memory store. Because the store uses an `Arc<Mutex<HashMap>>`, the reload is atomic from the scheduler's perspective -- the next tick will see the updated task set.

### Edge Cases in Hot-Reload

Several edge cases require careful handling:

**Deleted file.** If the user deletes `scheduled_tasks.json`, the watcher emits a `Deleted` event. The callback should clear the durable tasks from the in-memory store but not remove session-only tasks.

**Malformed JSON.** If the user introduces a syntax error while editing the file, the reload silently fails and the existing tasks continue running. The callback logs a warning but does not crash.

**Rapid successive edits.** The 100ms debounce window handles this, but there is a subtlety: if the user saves, the watcher fires, the scheduler starts reloading, and the user saves again before the reload completes, the second reload should be queued, not dropped. The channel-based architecture handles this naturally -- the second event is buffered in the debounce loop while the first reload is processing.

**Race with scheduler tick.** If a tick is evaluating tasks while a reload is replacing them, the snapshot isolation pattern (clone under read lock, then evaluate) ensures the tick completes with a consistent view of the task set. The next tick picks up the new tasks.

---

## 41.10 The Kairos Autonomous Agent Scheduler

The cron tool and the in-memory store handle the simple case: schedule a shell command, run it periodically. The Kairos runtime handles the complex case: schedule an entire agent execution with model configuration, tool whitelists, timeout policies, failure handling, and notification routing.

### AgentSchedule Configuration

```rust
pub struct AgentSchedule {
    pub id: String,
    pub label: String,
    pub cron_expr: Option<String>,
    pub triggers: Vec<Trigger>,
    pub agent_config: AgentConfig,
    pub last_run: Option<DateTime<Utc>>,
    pub next_run: Option<DateTime<Utc>>,
    pub enabled: bool,
    pub max_retries: u32,
    pub failure_count: u32,
    pub working_dir: Option<PathBuf>,
    pub channels: Vec<Channel>,
    pub dream_after: bool,
}
```

The `dream_after` flag is particularly interesting. When set, the Kairos runtime runs the AutoDream memory consolidation pipeline (a 4-stage orient-gather-consolidate-prune process) after the scheduled agent completes. This means a nightly agent that reviews and organizes the codebase can also consolidate the day's accumulated knowledge into long-term memory. The scheduling system becomes the backbone of the agent's autonomous learning cycle.

### Agent Isolation

Each scheduled agent execution runs in an isolated tokio task with its own timeout:

```rust
let handle = tokio::spawn(async move {
    let start = std::time::Instant::now();

    let result = tokio::time::timeout(timeout, async {
        // Real implementation: engine::run_agent(agent_config)
        // Isolated process with tool whitelist enforcement
    }).await;

    match result {
        Ok(Ok(summary)) => {
            // Mark success, reset failure count, update next_run
            schedule.mark_ran(Utc::now());
        }
        Ok(Err(err)) => {
            // Record failure, possibly auto-disable
            schedule.record_failure();
        }
        Err(_timeout) => {
            // Timeout is treated as a failure
            schedule.record_failure();
        }
    }
});
```

The timeout wraps the entire agent execution. If the agent exceeds its budget (default 300 seconds), it is cancelled and the failure is recorded. Three consecutive failures auto-disable the schedule, preventing a broken agent configuration from consuming resources indefinitely.

### Notification Channels

When a scheduled agent triggers, completes, or fails, the Kairos runtime dispatches events to configured notification channels. Four channel types are supported:

| Channel | Transport | Use Case |
|---------|-----------|----------|
| Terminal | stderr | Development debugging |
| File | Append to `.rcode/kairos/logs/` | Audit trail |
| Webhook | HTTP POST with retry | Slack/Teams integration |
| Push | macOS `osascript` | Desktop alerts |

The webhook channel includes exponential backoff with deterministic jitter (the same pattern from Section 41.6):

```rust
fn exponential_backoff(attempt: u32) -> Duration {
    let base_ms = 500u64;
    let max_ms = 60_000u64;
    let backoff_ms = base_ms.saturating_mul(1u64 << attempt.min(10));
    let jitter_ms = (attempt as u64 * 137) % 500;
    Duration::from_millis((backoff_ms + jitter_ms).min(max_ms))
}
```

The jitter here uses `attempt * 137 mod 500`, where 137 is a prime that produces good spread over the 500ms jitter window. Capping the shift at 10 prevents overflow (1 << 10 = 1024, and 500 * 1024 = 512,000 < u64::MAX).

---

## 41.11 Integration with the Supervisor Tree

As discussed in Chapter 35 (The Bridge), the agent can run as a daemon with multiple worker processes. The Kairos scheduler is one of those workers, managed by the supervisor tree with dependency-ordered start/stop:

```
bridge ──depends-on──▶ kairos
bridge ──depends-on──▶ agent-1
kairos ──depends-on──▶ (nothing -- leaf node)
```

The supervisor starts Kairos before the bridge and agent workers, ensuring that scheduled tasks are evaluating by the time interactive sessions begin. If Kairos crashes, the supervisor restarts it with exponential backoff and propagates the restart to any workers that depend on it.

---

## 41.12 Summary

The cron scheduler is where the agent crosses the line from interactive tool to autonomous system. The key engineering decisions that make it work:

1. **Custom 5-field parser** with strict bounds checking eliminates the ambiguity of supporting multiple cron dialects.
2. **Dual-tier storage** (in-memory for session tasks, JSON file for durable tasks) provides the right persistence guarantees for each use case.
3. **Deterministic jitter** from task ID hashing spreads simultaneous firings without introducing unpredictability.
4. **Seven-day auto-expiry** prevents zombie tasks from accumulating in the durable store.
5. **Debounced file watching** enables hot-reload of task definitions without restart.
6. **Single-execution guards** prevent task pile-up when executions exceed the tick interval.
7. **Failure-based auto-disabling** stops broken schedules from consuming resources.

In the next chapter, we will examine startup performance engineering (Chapter 42) -- how the agent minimizes time-to-first-prompt through parallel prefetching, lazy imports, and checkpoint-based profiling.
