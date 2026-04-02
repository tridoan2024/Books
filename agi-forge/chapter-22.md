# Chapter 22: Scaling — From Laptop to Enterprise

---

There is a moment in every multi-CLI builder's journey when the laptop fan starts screaming. You have eight Claude Code instances running — a Planner decomposing a migration, a Security auditor scanning dependencies, three Coders implementing features in parallel, a Reviewer watching their output, a Documentation writer keeping the README current, and a QA validator running tests. Your MacBook's 32GB of RAM is at 94%. Swap is engaged. The Planner's context window compaction just kicked in because the system is thrashing. One of the Coders silently OOM-killed in the background, and you don't notice until its PR comes back empty.

You've built a system that works. Now you need a system that *scales*.

This chapter maps the path from a single developer running everything on one machine to an enterprise deployment serving fifty engineers across three continents. The territory is technical — resource allocation, memory budgets, container orchestration, cost modeling, rate limiting — but the underlying question is architectural: how do you grow a multi-CLI system without losing the properties that made it powerful in the first place?

The answer comes in three tiers. Each tier has its own resource profile, its own failure modes, and its own economics. You don't climb from one to the next because the higher tier is "better." You climb because you've hit the ceiling of the tier you're on and the pain has become more expensive than the upgrade.

---

## 22.1 Tier 1: The Solo Developer — Eight CLIs on a MacBook

The first tier is where everyone starts. One machine. One developer. Multiple Claude Code sessions sharing a single set of hardware resources. The constraints are physical — RAM, CPU, API rate limits — and the goal is to maximize throughput without destabilizing the system.

### The Resource Calculator

Claude Code is a TypeScript application built on React/Ink with a full agent loop. Each session maintains a streaming connection to the Anthropic API, a local tool execution environment, and an in-memory conversation history. The resource profile varies dramatically based on what the session is doing.

From the source code (specifically `InProcessTeammateTask/types.ts`), we know the real numbers:

```
Per-session memory footprint:
  Idle/light usage:     ~20 MB RSS
  Active with tools:    ~60-80 MB RSS
  Heavy context (500+ turns): ~125 MB RSS
  With 1M context window:     ~200 MB RSS (conversation cache)

Per-session CPU:
  Idle (waiting for API):  ~0% (event loop sleeping)
  Tool execution (bash):   Spikes to 100% of one core
  Streaming response:      ~5-10% of one core
  Context compaction:      ~15% of one core for 2-5 seconds
```

This gives us a resource calculator for the solo developer:

```
┌──────────────────────────────────────────────────────┐
│         SOLO DEVELOPER RESOURCE CALCULATOR            │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Machine: MacBook Pro M3/M4, 32 GB RAM               │
│  OS overhead: ~6 GB                                  │
│  IDE + browser: ~4 GB                                │
│  Available for CLIs: ~22 GB                          │
│                                                      │
│  Conservative (all heavy): 22 GB / 200 MB = 110 CLIs │
│  Realistic (mixed load):  22 GB / 80 MB  = 27 CLIs  │
│  Safe maximum:            8 CLIs (with headroom)     │
│                                                      │
│  Why 8, not 27?                                      │
│  - Bash tool execution spawns child processes        │
│  - npm install / cargo build can spike 2-4 GB each   │
│  - Context compaction bursts across multiple CLIs    │
│  - You need 30% headroom or macOS will OOM-kill      │
│                                                      │
│  CPU budget:                                         │
│  - M3 Pro: 12 cores → 8 CLIs = fine                  │
│  - M3 base: 8 cores → 6 CLIs max before contention   │
│  - Bottleneck is bash tools, not Claude Code itself  │
│                                                      │
│  Network:                                            │
│  - Each streaming connection: ~50 KB/s sustained     │
│  - 8 concurrent streams: ~400 KB/s = negligible     │
│  - Real bottleneck: API rate limits, not bandwidth   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Model Assignment Per CLI

Not every CLI needs the most expensive model. This is the single biggest cost optimization available, and most builders miss it entirely.

The `task-budgets` beta header (released 2026-03-13) enables per-task token budgets, but even without it, you can assign different models to different CLIs using environment variables and the `--model` flag:

```bash
# Tier 1 Model Assignment Strategy
# Total monthly cost target: $50-80/month solo developer

# Planner CLI — needs deep reasoning, rare usage
claude --model opus --print "Decompose this migration into tasks..."
# Cost: ~$15/month (few long sessions, high token cost)

# Security CLI — needs careful analysis, moderate usage
claude --model sonnet --print "Audit auth module for OWASP Top 10..."
# Cost: ~$10/month (thorough but focused sessions)

# Coder CLIs (x3) — bulk of the work, high token volume
claude --model sonnet --print "Implement the user profile endpoint..."
# Cost: ~$30/month ($10 each, high volume)

# Reviewer CLI — quick passes, high frequency
claude --model haiku --print "Review this diff for bugs..."
# Cost: ~$3/month (fast, cheap, high volume but short sessions)

# QA CLI — validation, test running
claude --model haiku --print "Run tests and report failures..."
# Cost: ~$2/month (mostly tool execution, minimal reasoning)

# Documentation CLI — writing, moderate reasoning
claude --model sonnet --print "Update API docs for new endpoints..."
# Cost: ~$5/month (moderate volume, focused sessions)
```

The logic behind this assignment:

| CLI Role | Model | Why |
|----------|-------|-----|
| Planner | Opus | Architectural reasoning, task decomposition, long-range planning. Errors here cascade to every downstream CLI. Worth the premium. |
| Security | Sonnet | Needs careful analysis but operates on bounded scope. Sonnet catches 95% of what Opus would. |
| Coder | Sonnet | Best cost/quality ratio for implementation. Fast enough for iteration loops. |
| Reviewer | Haiku | Pattern matching on diffs. Doesn't need deep reasoning — needs speed. |
| QA | Haiku | Mostly running commands and parsing output. The intelligence is in the test suite, not the model. |
| Docs | Sonnet | Writing quality matters. Haiku produces thin documentation. |

The `effort` beta header (2025-11-24) adds another dimension. Even within the same model, you can dial reasoning up or down:

```bash
# High effort for architectural decisions
claude --model sonnet --betas effort-2025-11-24 \
  --print "Design the database schema for multi-tenant auth..."

# Low effort for simple routing decisions
claude --model sonnet --betas effort-2025-11-24 \
  --print "Which file should I edit to fix this import?"
```

### The Solo Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     MACBOOK PRO (32 GB)                         │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Planner  │ │ Security │ │ Coder 1  │ │ Coder 2  │          │
│  │ (Opus)   │ │ (Sonnet) │ │ (Sonnet) │ │ (Sonnet) │          │
│  │ 125 MB   │ │  80 MB   │ │  80 MB   │ │  80 MB   │          │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘          │
│       │            │            │            │                  │
│  ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐          │
│  │ Coder 3  │ │ Reviewer │ │   QA     │ │  Docs    │          │
│  │ (Sonnet) │ │ (Haiku)  │ │ (Haiku)  │ │ (Sonnet) │          │
│  │  80 MB   │ │  20 MB   │ │  20 MB   │ │  60 MB   │          │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘          │
│       │            │            │            │                  │
│  ┌────┴────────────┴────────────┴────────────┴──────────┐      │
│  │              Shared Filesystem (Git repo)             │      │
│  │         ~/.claude/  (memory, sessions, config)        │      │
│  │         CLAUDE.md   (shared project context)          │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                 │
│  Total RSS: ~545 MB (CLIs only)                                │
│  Peak with tool execution: ~2-4 GB (npm install spikes)        │
│  API connections: 8 concurrent SSE streams                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Rate Limiting and the UNATTENDED_RETRY Flag

When you run eight CLIs against the Anthropic API simultaneously, you will hit rate limits. The API returns 429 (Too Many Requests) or 529 (Overloaded) responses. By default, Claude Code retries with exponential backoff — but the default behavior is optimized for interactive use, where a human is watching and can intervene.

For unattended multi-CLI systems, the source reveals a critical feature flag: `UNATTENDED_RETRY`. Found in `services/api/withRetry.ts`:

```typescript
// CLAUDE_CODE_UNATTENDED_RETRY: for unattended sessions.
// Retries 429/529 indefinitely with higher backoff and periodic
// keep-alive yields so the host environment does not mark the
// session idle mid-wait.

const PERSISTENT_MAX_BACKOFF_MS = 5 * 60 * 1000    // 5 min max backoff
const PERSISTENT_RESET_CAP_MS = 6 * 60 * 60 * 1000 // 6 hour total cap
const HEARTBEAT_INTERVAL_MS = 30_000                 // 30s keep-alive
```

Enable it for your non-interactive CLIs:

```bash
# For any CLI running in --print mode (non-interactive)
export CLAUDE_CODE_UNATTENDED_RETRY=1

# Combined with --print for pipeline usage
CLAUDE_CODE_UNATTENDED_RETRY=1 claude --print \
  --model sonnet \
  "Implement the user service..."
```

Without this flag, a 429 error after default retries kills the session. With it, the CLI backs off gracefully — up to 5 minutes between retries — and keeps trying for up to 6 hours. The 30-second heartbeat prevents infrastructure tools (systemd, Kubernetes liveness probes, CI runners) from assuming the process is dead.

### BG_SESSIONS: Background Execution

The `BG_SESSIONS` feature flag enables non-interactive background sessions — Claude Code instances that run without a terminal attached. This is the foundation for running multiple CLIs as background workers rather than terminal tabs.

From the source (`main.tsx:1116`):

```typescript
if (feature('BG_SESSIONS') && agentCli) {
  // Background session mode — no TTY required
}
```

Combined with the `--print` flag and process management:

```bash
#!/bin/bash
# launch-background-clis.sh — Start 8 CLIs as background workers

set -euo pipefail

export CLAUDE_CODE_UNATTENDED_RETRY=1

TASKS=(
  "planner:opus:Decompose the Q3 migration into implementation tasks"
  "security:sonnet:Run OWASP Top 10 audit on src/auth/"
  "coder1:sonnet:Implement user profile endpoint per spec in docs/api.md"
  "coder2:sonnet:Implement notification service per spec in docs/api.md"
  "coder3:sonnet:Implement search indexing per spec in docs/api.md"
  "reviewer:haiku:Review all open PRs and comment on issues"
  "qa:haiku:Run full test suite and report failures"
  "docs:sonnet:Update API documentation for new endpoints"
)

for task in "${TASKS[@]}"; do
  IFS=: read -r name model prompt <<< "$task"
  echo "Starting $name ($model)..."
  claude --print --model "$model" "$prompt" \
    > "logs/${name}.log" 2>&1 &
  echo "$!" > "pids/${name}.pid"
done

echo "All CLIs launched. Monitor with: tail -f logs/*.log"
```

---

## 22.2 Tier 2: The Team — Shared Infrastructure

The solo developer hits the ceiling when a second person needs access to the system. The problems are immediate:

- **Memory isolation**: Two developers' CLIs write conflicting facts to the same `~/.claude/` directory
- **CLAUDE.md governance**: Who decides what goes in the shared project context?
- **Skill consistency**: Developer A has a custom security skill; Developer B doesn't know it exists
- **Cost visibility**: Whose CLIs burned $200 last month?
- **Rate limits**: Team-wide API usage hits organization rate limits faster than individual usage

### From SQLite to PostgreSQL

The solo developer's memory system runs on SQLite — a file-based database that excels at single-writer, single-reader workloads. The moment two developers are writing to the same memory store, SQLite's write lock becomes a bottleneck.

The migration path:

```
Solo:   ~/.claude/memory.db  (SQLite, local filesystem)
   ↓
Team:   PostgreSQL instance  (shared, concurrent access)
   ↓
Enterprise: PostgreSQL cluster (replicated, backed up)
```

Here's a practical migration schema:

```sql
-- Team memory server: PostgreSQL schema
-- Migrated from SQLite ~/.claude/memory.db

CREATE TABLE memories (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,           -- semantic, episodic, procedural
    category    TEXT NOT NULL,           -- fact, decision, bug_recipe, etc.
    key         TEXT NOT NULL,
    value       TEXT NOT NULL,
    importance  INTEGER DEFAULT 3,
    confidence  REAL DEFAULT 0.95,
    project_path TEXT,
    created_by  TEXT NOT NULL,           -- developer identifier
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    access_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMPTZ,
    
    -- Team-specific: who wrote it, who can read it
    visibility  TEXT DEFAULT 'team'      -- private, team, project
);

CREATE INDEX idx_memories_project ON memories(project_path);
CREATE INDEX idx_memories_category ON memories(category);
CREATE INDEX idx_memories_key ON memories(key);
CREATE INDEX idx_memories_created_by ON memories(created_by);

-- Full-text search for memory retrieval
CREATE INDEX idx_memories_search ON memories 
    USING GIN(to_tsvector('english', key || ' ' || value));

-- Team knowledge sharing: cross-pollinate discoveries
CREATE VIEW team_knowledge AS
SELECT m.*, 
       COUNT(DISTINCT ml.to_memory) as link_count,
       MAX(m.importance) as max_importance
FROM memories m
LEFT JOIN memory_links ml ON m.id = ml.from_memory
WHERE m.visibility IN ('team', 'project')
GROUP BY m.id
ORDER BY m.importance DESC, m.updated_at DESC;
```

### The Shared Skills Repository

Skills in Claude Code are markdown files that teach the model domain-specific capabilities. On a solo setup, they live in `.claude/skills/` inside the project or the user's home directory. On a team, skills need to be versioned, shared, and consistent.

```
┌─────────────────────────────────────────────────────────────────┐
│                    TEAM SKILLS ARCHITECTURE                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐      │
│  │         Git Repository: team-claude-skills           │      │
│  │                                                      │      │
│  │  skills/                                             │      │
│  │  ├── security/                                       │      │
│  │  │   ├── owasp-audit.md                              │      │
│  │  │   ├── dependency-scan.md                          │      │
│  │  │   └── threat-model.md                             │      │
│  │  ├── coding/                                         │      │
│  │  │   ├── api-conventions.md                          │      │
│  │  │   ├── error-handling.md                           │      │
│  │  │   └── database-patterns.md                        │      │
│  │  ├── review/                                         │      │
│  │  │   ├── pr-checklist.md                             │      │
│  │  │   └── code-review.md                              │      │
│  │  └── docs/                                           │      │
│  │      ├── api-documentation.md                        │      │
│  │      └── adr-template.md                             │      │
│  │                                                      │      │
│  │  templates/                                          │      │
│  │  ├── CLAUDE.md.template                              │      │
│  │  └── agents.json.template                            │      │
│  │                                                      │      │
│  └──────────────────────────────────────────────────────┘      │
│       │                                                         │
│       │  git submodule / symlink                                │
│       ▼                                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│  │  Dev A  │  │  Dev B  │  │  Dev C  │  │  Dev D  │          │
│  │  local  │  │  local  │  │  local  │  │  local  │          │
│  │ .claude │  │ .claude │  │ .claude │  │ .claude │          │
│  │ /skills │  │ /skills │  │ /skills │  │ /skills │          │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### CLAUDE.md Governance

The `CLAUDE.md` file is the project brain — the system prompt that shapes how every CLI behaves. On a team, ungoverned CLAUDE.md changes cause chaos: one developer adds a "never use semicolons" rule, another adds "always use semicolons," and every CLI starts producing inconsistent code.

The governance model:

```markdown
# CLAUDE.md Governance — Team Protocol

## Structure
CLAUDE.md is split into layers:

1. **Organization layer** (~/.claude/CLAUDE.md)
   - Company-wide standards
   - Maintained by: Platform team
   - Review required: Architecture review board
   
2. **Project layer** (repo root CLAUDE.md)
   - Project-specific context, conventions, architecture
   - Maintained by: Tech lead
   - Review required: PR review (minimum 2 approvals)
   
3. **Developer layer** (~/.claude/CLAUDE.md per-user)
   - Personal preferences (editor keybindings, verbosity)
   - Maintained by: Individual developer
   - No review required

## Change Protocol
- All CLAUDE.md changes go through pull requests
- Changes to coding standards require team RFC
- Auto-execute routing table changes require architecture review
- Never add secrets, API keys, or internal URLs to CLAUDE.md
```

### Team Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TEAM SETUP (5-10 devs)                       │
│                                                                     │
│  ┌─────────────┐                                                    │
│  │  PostgreSQL  │ ←── Shared memory store                           │
│  │  (memory)    │     Team knowledge, cross-pollination             │
│  └──────┬──────┘                                                    │
│         │                                                           │
│  ┌──────┴──────┐                                                    │
│  │  Git Server  │ ←── Skills repo, CLAUDE.md templates              │
│  │  (skills)    │     Versioned, reviewed, consistent               │
│  └──────┬──────┘                                                    │
│         │                                                           │
│  ┌──────┴──────────────────────────────────────────────────────┐    │
│  │                    Shared API Key / OAuth                    │    │
│  │              (Anthropic Organization Account)               │    │
│  │         Rate limits: 4,000 RPM / 400K input TPM             │    │
│  └──────┬──────────────┬──────────────┬──────────────┬────────┘    │
│         │              │              │              │              │
│  ┌──────┴───┐   ┌──────┴───┐   ┌──────┴───┐   ┌──────┴───┐        │
│  │  Dev A   │   │  Dev B   │   │  Dev C   │   │  Dev D   │        │
│  │  MacBook │   │  MacBook │   │  Linux   │   │  Remote  │        │
│  │  4 CLIs  │   │  6 CLIs  │   │  8 CLIs  │   │  2 CLIs  │        │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘        │
│                                                                     │
│  Total CLIs: 20 concurrent                                         │
│  Monthly cost: ~$300-500                                           │
│  Rate limit strategy: per-developer quotas                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Team Cost Breakdown

```
┌──────────────────────────────────────────────────────────────┐
│              TIER 2: TEAM MONTHLY COST MODEL                 │
│              (5 developers, 20 concurrent CLIs)              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  API Costs (Anthropic):                                      │
│    Opus sessions (2 per dev):    10 × $15  = $150            │
│    Sonnet sessions (2 per dev):  10 × $10  = $100            │
│    Haiku sessions (misc):        varies    = $30             │
│    Subtotal:                                 $280            │
│                                                              │
│  Infrastructure:                                             │
│    PostgreSQL (memory server):   RDS small  = $30            │
│    Git server (skills repo):     GitHub     = $0 (existing)  │
│    Monitoring (Grafana Cloud):   free tier  = $0             │
│    Subtotal:                                 $30             │
│                                                              │
│  TOTAL:                                      ~$310/month     │
│  Per developer:                              ~$62/month      │
│                                                              │
│  Compare: GitHub Copilot Business = $19/dev/month            │
│  Multi-CLI advantage: 10-50x more autonomous throughput      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 22.3 Tier 3: Enterprise — Containerized at Scale

The team setup breaks when you need:
- **Isolation**: CLIs that can't access each other's filesystems
- **Reproducibility**: Identical environments across 50 developers
- **Compliance**: Audit logs, access controls, data residency
- **Elasticity**: Scale from 5 CLIs at midnight to 200 CLIs during a sprint
- **Multi-region**: Teams in San Francisco, London, and Singapore

This is where containers enter the picture.

### The Session Server

Claude Code's source reveals a built-in HTTP+WebSocket server mode that was designed precisely for this use case:

```typescript
// From main.tsx — the server command
program.command('server')
  .description('Start a Claude Code session server')
  .option('--port <number>', 'HTTP port', '0')
  .option('--host <string>', 'Bind address', '0.0.0.0')
  .option('--auth-token <token>', 'Bearer token for auth')
  .option('--unix <path>', 'Listen on a unix domain socket')
  .option('--workspace <dir>', 'Default working directory')
  .option('--idle-timeout <ms>', 'Idle timeout for detached sessions', '600000')
  .option('--max-sessions <n>', 'Maximum concurrent sessions', '32')
```

Key parameters:
- **`--max-sessions 32`**: Each server instance handles up to 32 concurrent sessions
- **`--idle-timeout 600000`**: Sessions expire after 10 minutes of inactivity (configurable)
- **`--auth-token`**: Bearer token authentication for API access
- **`--workspace`**: Default working directory for all sessions

This server is the deployment unit for enterprise scaling.

### Docker Compose: Development Environment

Start here. Docker Compose gives your team identical environments without the complexity of Kubernetes.

```yaml
# docker-compose.yml — Multi-CLI development environment
version: '3.8'

services:
  # Session server — manages up to 32 Claude Code sessions
  claude-server:
    build:
      context: .
      dockerfile: Dockerfile.claude
    ports:
      - "3100:3100"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - CLAUDE_CODE_UNATTENDED_RETRY=1
      - NODE_OPTIONS=--max-old-space-size=4096
    volumes:
      - ./workspace:/workspace
      - claude-memory:/root/.claude
      - skills-repo:/root/.claude/skills
    command: >
      claude server
        --port 3100
        --host 0.0.0.0
        --auth-token ${SESSION_AUTH_TOKEN}
        --workspace /workspace
        --max-sessions 32
        --idle-timeout 600000
    deploy:
      resources:
        limits:
          memory: 8G
          cpus: '4'
        reservations:
          memory: 2G
          cpus: '1'
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3100/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # PostgreSQL — shared team memory
  memory-db:
    image: postgres:16
    environment:
      POSTGRES_DB: claude_memory
      POSTGRES_USER: claude
      POSTGRES_PASSWORD: ${MEMORY_DB_PASSWORD}
    volumes:
      - memory-data:/var/lib/postgresql/data
      - ./init-memory-schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
    ports:
      - "5432:5432"
    deploy:
      resources:
        limits:
          memory: 1G

  # Prometheus — metrics collection
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"

  # Grafana — dashboards
  grafana:
    image: grafana/grafana:latest
    volumes:
      - ./monitoring/dashboards:/var/lib/grafana/dashboards
      - ./monitoring/datasources.yml:/etc/grafana/provisioning/datasources/ds.yml
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}

volumes:
  claude-memory:
  skills-repo:
  memory-data:
  prometheus-data:
```

### Kubernetes: Production Deployment

When Docker Compose isn't enough — when you need auto-scaling, rolling updates, and multi-region — you move to Kubernetes.

```yaml
# k8s/claude-session-server.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-session-server
  labels:
    app: claude-cli
    component: session-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: claude-cli
  template:
    metadata:
      labels:
        app: claude-cli
        component: session-server
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9100"
    spec:
      containers:
      - name: claude-server
        image: your-registry/claude-code-server:latest
        ports:
        - containerPort: 3100
          name: http
        - containerPort: 9100
          name: metrics
        env:
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: claude-secrets
              key: api-key
        - name: CLAUDE_CODE_UNATTENDED_RETRY
          value: "1"
        - name: NODE_OPTIONS
          value: "--max-old-space-size=4096"
        command:
        - claude
        - server
        - --port=3100
        - --host=0.0.0.0
        - --max-sessions=32
        - --idle-timeout=600000
        - --workspace=/workspace
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "8Gi"
            cpu: "4000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3100
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /ready
            port: 3100
          initialDelaySeconds: 5
          periodSeconds: 10
        volumeMounts:
        - name: workspace
          mountPath: /workspace
        - name: claude-config
          mountPath: /root/.claude
      volumes:
      - name: workspace
        persistentVolumeClaim:
          claimName: workspace-pvc
      - name: claude-config
        configMap:
          name: claude-config
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: claude-session-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: claude-session-server
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 70
  - type: Pods
    pods:
      metric:
        name: active_sessions
      target:
        type: AverageValue
        averageValue: "24"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Pods
        value: 2
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Pods
        value: 1
        periodSeconds: 120
---
apiVersion: v1
kind: Service
metadata:
  name: claude-session-service
spec:
  selector:
    app: claude-cli
  ports:
  - port: 3100
    targetPort: 3100
  type: ClusterIP
```

### The Enterprise Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ENTERPRISE DEPLOYMENT                                  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                    KUBERNETES CLUSTER                            │       │
│  │                                                                  │       │
│  │  ┌──────────────────────────────────────────────────────────┐   │       │
│  │  │            Ingress / Load Balancer                        │   │       │
│  │  │         (TLS termination, auth, routing)                 │   │       │
│  │  └───────┬──────────────┬──────────────┬────────────────────┘   │       │
│  │          │              │              │                         │       │
│  │  ┌───────┴───┐  ┌───────┴───┐  ┌───────┴───┐                   │       │
│  │  │  Server 1 │  │  Server 2 │  │  Server N │  ← HPA scales     │       │
│  │  │  32 sess  │  │  32 sess  │  │  32 sess  │    2-20 pods      │       │
│  │  │  8 GB RAM │  │  8 GB RAM │  │  8 GB RAM │                   │       │
│  │  └───────┬───┘  └───────┬───┘  └───────┬───┘                   │       │
│  │          │              │              │                         │       │
│  │  ┌───────┴──────────────┴──────────────┴────────────────────┐   │       │
│  │  │              Shared Persistent Volume                     │   │       │
│  │  │         (workspace, git repos, build artifacts)          │   │       │
│  │  └──────────────────────────────────────────────────────────┘   │       │
│  │                                                                  │       │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │       │
│  │  │  PostgreSQL   │  │  Prometheus   │  │   Grafana    │          │       │
│  │  │  (memory)     │  │  (metrics)    │  │  (dashboards)│          │       │
│  │  │  HA replica   │  │  15d retain   │  │              │          │       │
│  │  └──────────────┘  └──────────────┘  └──────────────┘          │       │
│  │                                                                  │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                             │
│  External:                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                      │
│  │  Anthropic    │  │  OpenAI      │  │  Local LLMs  │                      │
│  │  API          │  │  API         │  │  (Ollama)    │                      │
│  │  (Claude)     │  │  (GPT)       │  │  (Llama)     │                      │
│  └──────────────┘  └──────────────┘  └──────────────┘                      │
│                                                                             │
│  Capacity: 2-20 pods × 32 sessions = 64-640 concurrent CLIs               │
│  Monthly cost: $3,000-8,000 (API + infrastructure)                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 22.4 BRIDGE_MODE: Remote Teams and Federated Architecture

For distributed teams, running everything in a single cluster isn't always possible. Data residency requirements, network latency, or simply the preference for local development — these demand a federated approach. Claude Code's `BRIDGE_MODE` was built for this.

### What BRIDGE_MODE Enables

From the source analysis, BRIDGE_MODE is gated behind `feature('BRIDGE_MODE')` and unlocks:

- **Remote terminal session control**: Operate Claude Code instances on remote machines
- **CCR multi-session**: Up to **32 parallel sessions** per bridge (hardcoded in `tengu_ccr_bridge_multi_session`)
- **Environment-less operation**: Sessions that don't require a local environment (`tengu_bridge_repl_v2`)
- **JWT-based trust**: Secure device authentication between bridge endpoints
- **Subgates**: DAEMON (process supervision), CCR_AUTO_CONNECT (automatic reconnection), CCR_MIRROR (session mirroring)

### The Federated Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FEDERATED MULTI-CLI (BRIDGE_MODE)                        │
│                                                                             │
│  San Francisco                    London                   Singapore        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │  Bridge Node A   │  │  Bridge Node B   │  │  Bridge Node C   │          │
│  │  32 sessions     │  │  32 sessions     │  │  32 sessions     │          │
│  │                  │  │                  │  │                  │          │
│  │  ┌────────────┐  │  │  ┌────────────┐  │  │  ┌────────────┐  │          │
│  │  │ Local CLIs │  │  │  │ Local CLIs │  │  │  │ Local CLIs │  │          │
│  │  │ (8 active) │  │  │  │ (8 active) │  │  │  │ (4 active) │  │          │
│  │  └─────┬──────┘  │  │  └─────┬──────┘  │  │  └─────┬──────┘  │          │
│  │        │         │  │        │         │  │        │         │          │
│  │  ┌─────┴──────┐  │  │  ┌─────┴──────┐  │  │  ┌─────┴──────┐  │          │
│  │  │ Local Git  │  │  │  │ Local Git  │  │  │  │ Local Git  │  │          │
│  │  │ Local Mem  │  │  │  │ Local Mem  │  │  │  │ Local Mem  │  │          │
│  │  └────────────┘  │  │  └────────────┘  │  │  └────────────┘  │          │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘          │
│           │                     │                     │                     │
│           └─────────────────────┼─────────────────────┘                     │
│                                 │                                           │
│                    ┌────────────┴────────────┐                              │
│                    │   Central Orchestrator   │                              │
│                    │   (COORDINATOR_MODE)     │                              │
│                    │                          │                              │
│                    │   Routes tasks to the    │                              │
│                    │   nearest bridge node    │                              │
│                    │   with available capacity│                              │
│                    └────────────┬────────────┘                              │
│                                 │                                           │
│                    ┌────────────┴────────────┐                              │
│                    │  PostgreSQL (replicated) │                              │
│                    │  Memory sync across      │                              │
│                    │  all bridge nodes        │                              │
│                    └─────────────────────────┘                              │
│                                                                             │
│  Total capacity: 3 nodes × 32 sessions = 96 concurrent CLIs               │
│  Latency: <50ms to nearest node (local tools), ~200ms to API              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Setting Up a Bridge Node

```bash
#!/bin/bash
# setup-bridge-node.sh — Configure a remote machine as a bridge node
set -euo pipefail

# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Configure bridge mode
export CLAUDE_CODE_BRIDGE_MODE=1
export CLAUDE_CODE_UNATTENDED_RETRY=1

# Start the session server with bridge capabilities
claude server \
  --port 3100 \
  --host 0.0.0.0 \
  --auth-token "${BRIDGE_AUTH_TOKEN}" \
  --max-sessions 32 \
  --idle-timeout 1800000 \
  --workspace /srv/workspace

# The bridge node now accepts remote session requests
# Connect from any machine:
# claude connect --url ws://bridge-node:3100 --token $BRIDGE_AUTH_TOKEN
```

### DAEMON and SUPERVISOR Mode

When `BRIDGE_MODE` is combined with the `DAEMON` feature flag, Claude Code gains process supervision capabilities:

```
DAEMON + BRIDGE_MODE enables:
  - Worker spawning: automatically start new CLI instances
  - Lifecycle management: restart crashed sessions
  - Cross-crash persistence: recover session state after failures
  - CLI entry: --daemon-worker=<kind>
```

This is the foundation for self-healing multi-CLI systems. A daemon process monitors the health of each CLI session and automatically restarts any that crash or become unresponsive.

---

## 22.5 Multi-LLM Mixing: The Right Model for Every CLI

A production multi-CLI system shouldn't be locked to a single LLM provider. Different CLIs have different requirements, and the best model for deep architectural reasoning is not the best model for rapid test validation.

### The Model Routing Matrix

```
┌──────────────────────────────────────────────────────────────────────┐
│                     MODEL ROUTING STRATEGY                           │
├──────────┬─────────────┬───────────┬───────────┬────────────────────┤
│ CLI Role │ Primary     │ Fallback  │ Effort    │ Why                │
├──────────┼─────────────┼───────────┼───────────┼────────────────────┤
│ Planner  │ Opus        │ Sonnet    │ max       │ Errors cascade     │
│ Architect│ Opus        │ Sonnet    │ max       │ Design decisions   │
│ Security │ Sonnet      │ Opus      │ high      │ Balanced depth     │
│ Coder    │ Sonnet      │ Haiku     │ medium    │ Best cost/quality  │
│ Reviewer │ Haiku       │ Sonnet    │ low       │ Speed over depth   │
│ QA       │ Haiku       │ Sonnet    │ low       │ Mostly tool exec   │
│ Docs     │ Sonnet      │ Haiku     │ medium    │ Writing quality    │
│ Router   │ Haiku       │ —         │ low       │ Simple dispatch    │
├──────────┼─────────────┼───────────┼───────────┼────────────────────┤
│ TOTAL    │ Mixed       │ Mixed     │ Mixed     │ Optimized spend    │
└──────────┴─────────────┴───────────┴───────────┴────────────────────┘
```

### Cross-Provider Configuration

For enterprise deployments, you can route different CLIs through different providers:

```bash
# Planner: Claude Opus via Anthropic API (best reasoning)
ANTHROPIC_API_KEY="sk-ant-..." \
  claude --model opus --print "Plan the database migration..."

# Coder: Claude Sonnet via AWS Bedrock (compliance, data residency)
AWS_REGION=us-east-1 \
CLAUDE_CODE_USE_BEDROCK=1 \
  claude --model sonnet --print "Implement the user service..."

# Lightweight tasks: local model via Ollama (zero API cost)
# For simple code formatting, linting, test selection
ANTHROPIC_API_KEY="" \
CLAUDE_CODE_MODEL_PROVIDER=ollama \
  claude --model llama3:70b --print "Select which tests to run for auth changes..."
```

### The Fallback Chain

The `--fallback-model` flag enables automatic degradation when the primary model is overloaded:

```bash
# Primary: Opus. If overloaded, fall back to Sonnet automatically.
claude --model opus --fallback-model sonnet --print \
  "Design the migration strategy..."

# This is critical for CI/CD pipelines where you can't tolerate
# failures due to API capacity. The fallback triggers on 529
# (overloaded) responses and seamlessly switches models.
```

### Token Budget Control

The `task-budgets` beta header (2026-03-13) enables per-task token limits:

```bash
# Cap each Coder CLI at $2 per task
claude --print \
  --max-budget-usd 2.00 \
  --model sonnet \
  "Implement the notification endpoint..."

# Cap total turns for validation tasks  
claude --print \
  --max-turns 5 \
  --model haiku \
  "Run the test suite and report failures"
```

This prevents runaway costs from CLIs that enter infinite loops or hallucinate long implementation plans. A Coder CLI that hits its budget cap stops gracefully and reports what it completed.

---

## 22.6 Performance Monitoring and Optimization

You cannot optimize what you cannot measure. A multi-CLI system needs observability at three levels: per-session metrics, per-server aggregates, and system-wide dashboards.

### Prometheus Metrics

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'claude-sessions'
    static_configs:
      - targets: ['claude-server:9100']
    metrics_path: /metrics
    scrape_interval: 10s
```

Key metrics to track:

```
# Session-level metrics
claude_session_active_count          # Currently active sessions
claude_session_total_created         # Total sessions created
claude_session_duration_seconds      # Session duration histogram
claude_session_turns_total           # Total turns per session

# API-level metrics
claude_api_request_total             # Total API requests (by model)
claude_api_request_duration_seconds  # API latency histogram
claude_api_tokens_input_total        # Input tokens consumed
claude_api_tokens_output_total       # Output tokens consumed
claude_api_rate_limit_hits_total     # 429 responses received
claude_api_overload_hits_total       # 529 responses received
claude_api_retry_total               # Total retry attempts
claude_api_cost_usd_total            # Estimated cost in USD

# Tool-level metrics
claude_tool_execution_total          # Tool calls (by tool name)
claude_tool_duration_seconds         # Tool execution time
claude_tool_failure_total            # Failed tool executions

# Resource metrics
claude_memory_rss_bytes              # RSS memory per session
claude_cpu_usage_percent             # CPU usage per session
```

### Grafana Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CLAUDE MULTI-CLI OPERATIONS DASHBOARD                                     │
├─────────────────────────┬───────────────────────────────────────────────────┤
│                         │                                                   │
│   Active Sessions       │   API Cost (24h rolling)                          │
│   ┌───────────────┐    │   ┌───────────────────────────────────────┐       │
│   │    24 / 96    │    │   │  $47.23  (+12% vs yesterday)          │       │
│   │   ████████░░  │    │   │  ▄▄▆▇▇█▇▆▅▃▃▂▁▁▂▃▃▄▅▆▇██            │       │
│   └───────────────┘    │   └───────────────────────────────────────┘       │
│                         │                                                   │
│   By Model:             │   Token Usage by Model:                           │
│   Opus:    4 (17%)     │   Opus:    320K input / 180K output              │
│   Sonnet: 14 (58%)     │   Sonnet:  2.1M input / 890K output             │
│   Haiku:   6 (25%)     │   Haiku:   480K input / 120K output             │
│                         │                                                   │
├─────────────────────────┼───────────────────────────────────────────────────┤
│                         │                                                   │
│   Rate Limit Events     │   Session Duration Distribution                   │
│   (last 1h)             │                                                   │
│   429: ██░░ 3           │   <1m:   ████████████  45%                       │
│   529: █░░░ 1           │   1-5m:  ██████████    38%                       │
│   Retries: 7            │   5-15m: ████           12%                       │
│   Avg backoff: 12s      │   >15m:  ██              5%                       │
│                         │                                                   │
├─────────────────────────┼───────────────────────────────────────────────────┤
│                         │                                                   │
│   Memory Usage          │   Top Tool Calls (24h)                            │
│   Per Pod:              │   1. Bash:     4,230  (42%)                      │
│   Pod 1: 5.2 GB / 8 GB │   2. FileEdit: 2,180  (22%)                      │
│   Pod 2: 3.8 GB / 8 GB │   3. Read:     1,560  (15%)                      │
│   Pod 3: 6.1 GB / 8 GB │   4. Grep:       890   (9%)                      │
│                         │   5. Agent:      340   (3%)                      │
│                         │                                                   │
└─────────────────────────┴───────────────────────────────────────────────────┘
```

### Alert Rules

```yaml
# monitoring/alerts.yml
groups:
  - name: claude-cli-alerts
    rules:
    # High rate limit frequency — need to reduce concurrent CLIs
    - alert: HighRateLimitRate
      expr: rate(claude_api_rate_limit_hits_total[5m]) > 0.1
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High rate limit hit rate ({{ $value }}/s)"
        action: "Reduce concurrent sessions or stagger CLI startup"

    # Memory pressure — pods approaching limits
    - alert: HighMemoryUsage
      expr: claude_memory_rss_bytes / 8e9 > 0.85
      for: 2m
      labels:
        severity: critical
      annotations:
        summary: "Pod memory at {{ $value | humanizePercentage }}"
        action: "Scale up pods or reduce max-sessions per pod"

    # Cost runaway — daily spend exceeding budget
    - alert: DailyCostOverBudget
      expr: sum(increase(claude_api_cost_usd_total[24h])) > 300
      labels:
        severity: warning
      annotations:
        summary: "Daily API cost ${{ $value }} exceeds $300 budget"
        action: "Review top-spending sessions and model assignments"

    # Session stuck — a CLI hasn't made progress
    - alert: SessionStuck
      expr: time() - claude_session_last_turn_timestamp > 900
      labels:
        severity: warning
      annotations:
        summary: "Session {{ $labels.session_id }} idle for 15+ minutes"
        action: "Check for hung tool execution or API timeout"

    # All servers at capacity
    - alert: NoSessionCapacity
      expr: sum(claude_session_active_count) / sum(32 * kube_deployment_spec_replicas{deployment="claude-session-server"}) > 0.9
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Session capacity at {{ $value | humanizePercentage }}"
        action: "HPA should scale — check if max replicas reached"
```

---

## 22.7 Cost Analysis: The Three Tiers Compared

Every engineering decision is ultimately an economic decision. Here's the full cost model across all three tiers:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      MONTHLY COST COMPARISON                                │
├────────────────────┬────────────────┬────────────────┬──────────────────────┤
│                    │  Tier 1: Solo  │  Tier 2: Team  │  Tier 3: Enterprise  │
│                    │  (1 dev)       │  (5-10 devs)   │  (20-50 devs)        │
├────────────────────┼────────────────┼────────────────┼──────────────────────┤
│ Developers         │  1             │  5-10          │  20-50               │
│ Concurrent CLIs    │  4-8           │  20-40         │  100-640             │
│ Hardware           │  MacBook (own) │  MacBooks (own)│  K8s cluster         │
├────────────────────┼────────────────┼────────────────┼──────────────────────┤
│ API Costs          │                │                │                      │
│   Opus             │  $15           │  $150          │  $600-1,500          │
│   Sonnet           │  $30           │  $200          │  $800-2,000          │
│   Haiku            │  $5            │  $30           │  $100-300            │
│   Subtotal         │  $50           │  $380          │  $1,500-3,800        │
├────────────────────┼────────────────┼────────────────┼──────────────────────┤
│ Infrastructure     │                │                │                      │
│   Compute          │  $0 (laptop)   │  $0 (laptops)  │  $800-2,000 (K8s)    │
│   Database         │  $0 (SQLite)   │  $30 (RDS)     │  $200 (RDS HA)       │
│   Monitoring       │  $0 (local)    │  $0 (free tier)│  $100 (Grafana Cloud)│
│   Networking       │  $0            │  $0            │  $50-200 (LB, DNS)   │
│   Subtotal         │  $0            │  $30           │  $1,150-2,500        │
├────────────────────┼────────────────┼────────────────┼──────────────────────┤
│ TOTAL              │  ~$50/month    │  ~$410/month   │  ~$2,650-6,300/month │
│ Per developer      │  $50           │  $41-82        │  $53-126             │
├────────────────────┼────────────────┼────────────────┼──────────────────────┤
│ ROI Comparison     │                │                │                      │
│   vs. hire 1 dev   │  60x cheaper   │  12x cheaper   │  5-10x cheaper       │
│   ($8K/month)      │                │                │                      │
│   vs. Copilot Biz  │  2.6x more     │  2-4x more     │  3-7x more           │
│   ($19/dev/month)  │                │                │                      │
│   Throughput gain   │  3-5x          │  5-10x         │  10-50x              │
│   vs. single CLI   │                │                │                      │
└────────────────────┴────────────────┴────────────────┴──────────────────────┘
```

The economics favor multi-CLI at every tier. Even at the enterprise level where infrastructure costs add up, the throughput gain — 10 to 50 times the output of a single CLI — makes the per-developer cost trivially justified. The real constraint is not money. It's the operational complexity of managing the system.

---

## 22.8 The Decision Framework: When to Upgrade

You don't upgrade because you want to. You upgrade because you have to. Here are the signals that tell you it's time.

### Tier 1 → Tier 2: When Solo Becomes Team

Upgrade when **any three** of these are true:

```
□  A second developer needs CLI access to the same codebase
□  You're hitting API rate limits more than 3x per day
□  Memory on shared CLAUDE.md is causing conflicting outputs
□  Skills drift — different developers have different skill sets installed
□  Cost tracking is impossible — you can't tell who spent what
□  A failed session lost knowledge that took hours to rebuild
□  You need CLIs running when you're not at your desk
```

The migration effort: **One weekend**. Set up PostgreSQL (or use a managed service), create the skills repo, establish the CLAUDE.md governance protocol. The hardest part is the social contract, not the technology.

### Tier 2 → Tier 3: When Team Becomes Enterprise

Upgrade when **any three** of these are true:

```
□  More than 10 developers need concurrent CLI access
□  Compliance requires audit logs and access controls
□  Data residency means you can't run everything in one region
□  You need auto-scaling — demand varies 10x between night and day
□  A single machine failure takes out multiple developers' work
□  Security requires network isolation between CLI workspaces
□  You're spending >$1,000/month on API costs and need cost controls
□  CI/CD pipeline integration requires API access to session management
```

The migration effort: **Two to four weeks** with a DevOps engineer. Containerize the session server, set up Kubernetes, deploy monitoring, establish the Helm chart, configure auto-scaling, and run a parallel deployment alongside the existing setup.

### The Anti-Pattern: Premature Scaling

The most common mistake in multi-CLI scaling is jumping to Tier 3 before you need it. A solo developer running Kubernetes is spending 80% of their time on infrastructure and 20% on the actual work the CLIs are supposed to do. The laptop setup with eight well-configured CLIs will outperform a poorly managed Kubernetes cluster every time.

The decision framework is designed to prevent this. You don't upgrade based on ambition or architecture diagrams in blog posts. You upgrade based on pain signals — concrete, measurable problems that the current tier cannot solve.

---

## 22.9 Operational Playbook

### Daily Operations Checklist

```
Morning:
  □  Check Grafana dashboard for overnight anomalies
  □  Review cost tracking — flag any sessions >$10
  □  Verify all bridge nodes are healthy (if Tier 3)
  □  Check rate limit alert history from the last 12 hours

During Sprint:
  □  Monitor active session count vs. capacity
  □  Watch for "SessionStuck" alerts — investigate immediately
  □  Review memory usage trends — scale up before hitting limits
  □  Spot-check one random CLI's output for quality regression

Weekly:
  □  Review API cost breakdown by model and developer
  □  Prune stale sessions (idle >24h)
  □  Update skills repo with any new patterns discovered
  □  Run memory database maintenance (VACUUM, index rebuild)
  □  Review and merge any pending CLAUDE.md change proposals

Monthly:
  □  Full cost analysis — compare actual vs. budget
  □  Model routing review — are expensive models justified?
  □  Capacity planning — project next month's session needs
  □  Skills audit — remove unused skills, update outdated ones
  □  Security review — rotate API keys, review access logs
```

### Incident Response

When a multi-CLI system fails, the blast radius is proportional to the tier:

| Failure | Tier 1 Impact | Tier 2 Impact | Tier 3 Impact |
|---------|---------------|---------------|---------------|
| API outage | All CLIs stop | All CLIs stop | All CLIs stop (mitigated by fallback models) |
| Memory DB crash | Sessions lose recent knowledge | Team loses shared memory | Auto-failover to replica |
| Session crash | Restart manually | Restart manually | DAEMON auto-restarts |
| Rate limit burst | Manual backoff | Manual backoff | UNATTENDED_RETRY handles it |
| OOM kill | Lose one CLI | Lose one CLI | Pod restarts, session recovers |
| Network partition | N/A | CLIs on VPN lose access | Bridge nodes continue locally |

The key insight: higher tiers don't prevent failures — they make recovery automatic. The DAEMON supervisor restarts crashed sessions. The UNATTENDED_RETRY flag handles rate limits. Kubernetes restarts OOM-killed pods. PostgreSQL replicas handle database failures. You trade operational simplicity for operational resilience.

---

## 22.10 Looking Forward

The scaling story doesn't end with Kubernetes. The Claude Code source reveals features that will change the enterprise scaling equation:

**COORDINATOR_MODE** (`feature('COORDINATOR_MODE')`): A dedicated orchestration mode where a single Claude Code instance manages multiple worker CLIs. It has a restricted tool set — only `AgentTool`, `TaskStop`, `SendMessage`, `SyntheticOutput`, `TeamCreate`, and `TeamDelete` — because its job is to coordinate, not to code. This is the foundation for autonomous multi-CLI teams that don't need human orchestration.

**UDS_INBOX** (`feature('UDS_INBOX')`): Unix Domain Socket inter-process messaging via the `/peer` and `/peers` commands. Socket path: `claude-swarm-${process.pid}`. This enables peer-to-peer communication between CLIs without a central broker — a mesh architecture that scales horizontally without a coordination bottleneck.

**KAIROS** (`feature('KAIROS')`): Scheduled and cron-based agent execution. Subgates include `KAIROS_BRIEF`, `KAIROS_DREAM`, `KAIROS_CHANNELS`, `KAIROS_GITHUB_WEBHOOKS`, and `KAIROS_PUSH_NOTIFICATION`. This turns multi-CLI systems from on-demand tools into continuous autonomous systems — CLIs that run security scans every night, update documentation when PRs merge, and consolidate memory during idle hours.

**KAIROS_DREAM** specifically (`feature('KAIROS_DREAM')`): A background memory consolidation agent that runs a 4-stage pipeline — **orient → gather → consolidate → prune** — to automatically distill session knowledge into long-term memory. Updates `MEMORY.md` (capped at 200 lines / 25KB). This is the self-improving multi-CLI system: it learns from every session and gets better over time without human intervention.

These features are partially implemented in the source today. By the time you're reading this, some or all of them may be generally available. The architecture patterns in this chapter — the three-tier model, the bridge nodes, the model routing, the monitoring — are designed to accommodate these features as they ship.

---

## Summary

Scaling a multi-CLI system is not a technology problem. It's an operations problem with technology solutions.

**Tier 1** (Solo, ~$50/month): Eight CLIs on a MacBook. RAM is your constraint. Model routing is your biggest lever. UNATTENDED_RETRY and BG_SESSIONS let you run unattended. Good enough for 90% of individual developers.

**Tier 2** (Team, ~$400/month): PostgreSQL for shared memory, Git for shared skills, governance for shared CLAUDE.md. The hard part is the social contract, not the infrastructure. Upgrade when a second developer needs access.

**Tier 3** (Enterprise, ~$3-6K/month): Containerized session servers on Kubernetes with auto-scaling, monitoring, and BRIDGE_MODE for distributed teams. 64 to 640 concurrent CLIs across multiple regions. Upgrade when compliance, isolation, or scale demands it.

The decision framework is simple: upgrade when the pain of staying exceeds the cost of moving. Not before. The best multi-CLI system is the one you actually operate, not the one with the most impressive architecture diagram.

In the next chapter, we'll tackle the other side of scaling — not the infrastructure, but the intelligence. How do you make a multi-CLI system that gets *smarter* over time? Shared memory, cross-session learning, and the dream of persistent multi-agent knowledge.
