# Chapter 24: Case Study — Full-Stack SaaS with 8 CLIs

---

You've read the architecture chapters. You've studied the Orchestrator's intent analysis, the task DAG engine, the debate protocol, the memory bridge. You understand --- in theory --- how eight specialized CLIs can coordinate to build software.

Theory is dead weight until it ships code.

This chapter kills the theory. You're going to watch the forge build a complete SaaS application from a single human prompt. Not a toy. Not a demo. A task management platform with authentication, a REST API, a PostgreSQL database, a React frontend, real-time WebSocket notifications, Docker containerization, and a CI/CD pipeline. The kind of application a senior engineering team of four would spend three to five days delivering. The forge will do it in twenty-three minutes.

Every timestamp is real. Every CLI output is pulled from the session logs. Every debate, every security objection, every refactor --- it happened. You're reading the execution trace of an actual build.

One prompt. Eight CLIs. Twenty-three minutes. Let's watch.

---

## 24.1 The Prompt

The clock starts at T+0:00. The user types a single message into the SwarmForge dashboard:

```
Build a task management SaaS application. Requirements:
- JWT + OAuth authentication (Google, GitHub)
- REST API with Express/Node.js
- PostgreSQL database with Prisma ORM
- React + TypeScript frontend with Tailwind
- Real-time notifications via WebSocket
- Docker deployment with CI/CD pipeline
- Full test coverage, security audit, and documentation
```

Forty-seven words. No architecture decisions. No file structure. No technology debates about whether to use Prisma or Drizzle, REST or GraphQL, Zustand or Redux. The user states *what* they want. The forge decides *how* to build it.

The moment the user hits Enter, the Orchestrator's intent analyzer receives the prompt. Within 200 milliseconds, it has parsed the message into a structured intent object:

```json
{
  "intent": "full_stack_build",
  "complexity": "high",
  "estimated_components": 7,
  "requires_clis": ["researcher", "architect", "coder_backend", "coder_frontend",
                     "security", "qa", "devops", "writer"],
  "parallelization_potential": "high",
  "estimated_duration_minutes": 20,
  "risk_factors": ["oauth_complexity", "realtime_state_sync", "prisma_migration_ordering"]
}
```

Eight CLIs. All of them. This is the forge operating at full capacity.

---

## 24.2 T+0:00 to T+0:30 — The Orchestrator Wakes the Forge

The Orchestrator doesn't start all eight CLIs simultaneously. That would be chaos --- eight agents writing code with no shared understanding of what they're building. Instead, it follows the execution model from Chapter 15: phased activation with dependency gates.

**Phase 1: Research + Architecture** (parallel, 2 CLIs)
**Phase 2: Backend + Database** (parallel, 2 CLIs)
**Phase 3: Frontend + DevOps** (parallel, gated on Phase 2 API contracts)
**Phase 4: Security + QA** (parallel, continuous from Phase 2 onward)
**Phase 5: Documentation** (sequential, after all code stabilizes)

The Orchestrator writes the task DAG to `.swarm/tasks/dag.json`:

```json
{
  "phases": [
    {
      "id": "phase-1",
      "name": "research_and_architecture",
      "workers": ["researcher", "architect"],
      "parallel": true,
      "gate": "architecture_approved"
    },
    {
      "id": "phase-2",
      "name": "core_implementation",
      "workers": ["coder_backend", "coder_frontend"],
      "parallel": true,
      "depends_on": "phase-1",
      "gate": "api_contracts_stable"
    },
    {
      "id": "phase-3",
      "name": "infrastructure",
      "workers": ["devops"],
      "depends_on": "phase-2"
    },
    {
      "id": "phase-4",
      "name": "validation",
      "workers": ["security", "qa"],
      "parallel": true,
      "continuous_from": "phase-2"
    },
    {
      "id": "phase-5",
      "name": "documentation",
      "workers": ["writer"],
      "depends_on": ["phase-2", "phase-3", "phase-4"]
    }
  ]
}
```

At T+0:02, the Orchestrator spawns the first two CLIs into isolated git worktrees:

```
[T+0:02] ORCHESTRATOR → Spawning researcher into worktree research/
[T+0:02] ORCHESTRATOR → Spawning architect into worktree architecture/
[T+0:03] RESEARCHER   → Online. Context: 47-word user prompt + intent analysis.
[T+0:03] ARCHITECT    → Online. Context: 47-word user prompt + intent analysis.
```

Two processes. Two worktrees. Two context windows. Zero shared state except the task definitions in `.swarm/tasks/`.

---

## 24.3 T+0:30 to T+2:00 — Research and Architecture

The Researcher CLI doesn't write code. It reads. Chapter 8 defined its role: gather context, analyze prior art, identify risks, and produce a research brief that every other CLI will consume. Here it executes seventeen tool calls in ninety seconds:

```
[T+0:35] RESEARCHER → web_search("JWT + OAuth2 Express.js best practices 2025")
[T+0:38] RESEARCHER → web_search("Prisma PostgreSQL schema design task management")
[T+0:41] RESEARCHER → web_search("React TypeScript real-time WebSocket patterns")
[T+0:44] RESEARCHER → web_search("Docker multi-stage build Node.js production")
[T+0:48] RESEARCHER → Synthesizing 4 search results...
[T+0:55] RESEARCHER → web_search("OWASP Top 10 2025 authentication vulnerabilities")
[T+1:02] RESEARCHER → web_search("Prisma connection pooling production PostgreSQL")
[T+1:10] RESEARCHER → web_search("Express rate limiting best practices")
[T+1:18] RESEARCHER → web_search("React query vs SWR data fetching 2025")
[T+1:25] RESEARCHER → Analyzing 9 sources. Extracting patterns...
```

While the Researcher searches, the Architect works in parallel. It doesn't wait for the research brief --- it starts from its own expertise, trained into its system prompt from thousands of architecture decisions across previous projects. It sketches the system:

```
[T+0:45] ARCHITECT → Generating system architecture...
[T+1:00] ARCHITECT → Writing .swarm/artifacts/architecture.md
[T+1:15] ARCHITECT → Generating API contract: .swarm/artifacts/api-contract.yaml
[T+1:30] ARCHITECT → Generating database schema: .swarm/artifacts/schema.prisma
[T+1:45] ARCHITECT → Generating component tree: .swarm/artifacts/component-tree.md
```

At T+1:30, the Researcher publishes its brief to `.swarm/artifacts/research-brief.md`. The Architect reads it immediately --- this is the message bus at work, the file-system-based communication layer from Chapter 16. The research brief flags three risks the Architect hasn't addressed:

```markdown
## Risk Flags

1. **OAuth token storage**: Do NOT store OAuth tokens in localStorage.
   Use httpOnly secure cookies with CSRF protection.
2. **Prisma connection exhaustion**: Default pool size (10) insufficient
   for WebSocket connections. Set connection_limit=25, pool_timeout=15.
3. **WebSocket authentication**: Every WS connection must validate JWT
   on upgrade. Do NOT rely on initial HTTP auth alone.
```

The Architect reads this, pauses, and revises. This is the feedback loop in action --- not a debate yet, but one CLI's output correcting another's assumptions. The architecture document gets a second revision:

```
[T+1:50] ARCHITECT → Revision 2: Updated auth flow per research brief.
                      OAuth tokens → httpOnly cookies (not localStorage).
                      Added WS auth middleware on upgrade handler.
                      Prisma pool: connection_limit=25.
[T+1:55] ARCHITECT → Architecture approved. Publishing gate signal.
```

At T+2:00, the Orchestrator detects the `architecture_approved` gate signal. Phase 1 is complete. The forge has a research brief, an architecture document, an API contract in OpenAPI format, a Prisma schema draft, and a React component tree. No code yet. But every CLI that wakes up next will share the same mental model.

The Orchestrator logs:

```
[T+2:00] ORCHESTRATOR → Phase 1 complete. Duration: 1m58s.
                         Artifacts: 5 files, 2,847 words.
                         Opening Phase 2 gate. Spawning coder_backend, coder_frontend.
                         Opening Phase 4 gate (continuous). Spawning security, qa.
```

Four CLIs come online simultaneously. The forge is now running six processes.

---

## 24.4 T+2:00 to T+8:00 — The Backend Takes Shape

The Backend Coder CLI receives its task file:

```json
{
  "worker": "coder_backend",
  "task": "Implement REST API + WebSocket server + auth system",
  "inputs": [
    ".swarm/artifacts/architecture.md",
    ".swarm/artifacts/api-contract.yaml",
    ".swarm/artifacts/schema.prisma"
  ],
  "output_directory": "packages/api/",
  "constraints": [
    "Express.js + TypeScript",
    "Prisma ORM",
    "JWT + OAuth (Google, GitHub)",
    "WebSocket via ws library",
    "Follow API contract exactly"
  ]
}
```

The Backend Coder works methodically. It doesn't try to build everything at once. It follows the pattern established in Chapter 10: scaffold first, then flesh out:

```
[T+2:05] CODER_BACKEND → mkdir -p packages/api/src/{routes,middleware,services,types,ws}
[T+2:08] CODER_BACKEND → Writing packages/api/package.json (23 dependencies)
[T+2:10] CODER_BACKEND → Writing packages/api/tsconfig.json
[T+2:12] CODER_BACKEND → Writing packages/api/prisma/schema.prisma (from architect artifact)
[T+2:15] CODER_BACKEND → npm install (backgrounded, continuing while deps install)
```

The first real code drops at T+2:18. The authentication module:

```typescript
// packages/api/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string };
}

export const authenticate = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  const token = req.cookies?.access_token
    || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload;
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

Notice it reads `JWT_SECRET` from `process.env`. Remember this. Security will have something to say about it in four minutes.

By T+3:30, the Backend Coder has produced:

```
packages/api/
├── prisma/
│   └── schema.prisma          (87 lines — User, Task, Project, Comment, Notification)
├── src/
│   ├── index.ts               (server bootstrap, WS upgrade handler)
│   ├── routes/
│   │   ├── auth.ts            (login, register, oauth callback, refresh)
│   │   ├── tasks.ts           (CRUD + assign + status transitions)
│   │   ├── projects.ts        (CRUD + member management)
│   │   └── notifications.ts   (list, mark-read, preferences)
│   ├── middleware/
│   │   ├── auth.ts            (JWT verification)
│   │   ├── rbac.ts            (role-based access control)
│   │   ├── rateLimiter.ts     (sliding window, Redis-backed)
│   │   └── validation.ts      (Zod schemas for all endpoints)
│   ├── services/
│   │   ├── authService.ts     (password hashing, token generation, OAuth flow)
│   │   ├── taskService.ts     (business logic, status machine)
│   │   ├── projectService.ts  (team management, permissions)
│   │   └── notificationService.ts (create, broadcast, persist)
│   ├── ws/
│   │   ├── handler.ts         (connection management, room-based routing)
│   │   └── events.ts          (typed event definitions)
│   └── types/
│       └── index.ts           (shared TypeScript interfaces)
├── package.json
├── tsconfig.json
└── .env.example
```

Twenty-two files. 1,847 lines of TypeScript. Three minutes and thirty seconds.

---

## 24.5 T+3:00 to T+6:00 — The First Debate: Security Objects

At T+3:00, the Security Auditor CLI came online as part of the Phase 4 continuous validation. It doesn't wait for the backend to finish. It watches the worktree, scanning files as they appear. Chapter 12 defined this behavior: continuous audit mode, where the Security CLI runs static analysis on every file write event.

At T+3:35, five seconds after the Backend Coder writes `authService.ts`, Security flags its first finding:

```
[T+3:35] SECURITY → CRITICAL: packages/api/src/services/authService.ts:14
         JWT_SECRET loaded from process.env.
         Severity: HIGH | CWE-798 (Hard-coded/Env-stored Credentials)
         Risk: Environment variables are visible in process listings,
               Docker inspect output, and CI/CD logs.
         Recommendation: Use a secrets manager (Vault, AWS Secrets Manager,
                        or at minimum dotenv with .env excluded from Docker image).
```

This isn't a suggestion. It's a blocking finding. The Security CLI writes it to `.swarm/messages/security-to-coder_backend-001.json`:

```json
{
  "from": "security",
  "to": "coder_backend",
  "type": "blocking_finding",
  "severity": "high",
  "file": "packages/api/src/services/authService.ts",
  "line": 14,
  "finding": "JWT_SECRET from process.env exposes secret in process listings and container inspection",
  "cwe": "CWE-798",
  "recommendation": "Implement secrets manager abstraction with Vault/AWS SM backend",
  "requires_response": true
}
```

The Orchestrator's message bus routes this to the Backend Coder. What happens next is the debate protocol from Chapter 17 in action.

The Backend Coder reads the finding. It doesn't ignore it --- the system prompt explicitly states that `blocking_finding` messages from Security must be addressed before the task can be marked complete. But the Backend Coder pushes back:

```
[T+3:42] CODER_BACKEND → Response to security-to-coder_backend-001:
         Acknowledged. However, introducing Vault adds operational complexity
         that may exceed the scope of this MVP. Counter-proposal:
         1. Use dotenv with strict .env exclusion from Docker builds
         2. Document that production deployments MUST use secrets injection
            (K8s secrets, Docker secrets, or Vault)
         3. Add runtime validation: if JWT_SECRET is default/empty, refuse to start
```

The Security CLI reads the counter-proposal. This is the kind of moment where a single-CLI system would either accept the risk silently or refuse to proceed. The multi-CLI system *negotiates*:

```
[T+3:50] SECURITY → Response to counter-proposal:
         Partial accept. Conditions:
         1. ✅ dotenv with .env in .dockerignore — accepted
         2. ✅ Documentation of production secrets requirement — accepted
         3. ✅ Runtime validation of JWT_SECRET — accepted
         4. ➕ ADDITIONAL: Add secrets abstraction layer (interface)
            so Vault can be plugged in without code changes.
            This is 15 lines of code. Non-negotiable.
```

The Backend Coder agrees. It writes a `SecretsProvider` interface:

```typescript
// packages/api/src/services/secrets.ts
export interface SecretsProvider {
  get(key: string): Promise<string>;
}

class EnvSecretsProvider implements SecretsProvider {
  async get(key: string): Promise<string> {
    const value = process.env[key];
    if (!value) throw new Error(`Missing required secret: ${key}`);
    return value;
  }
}

// Production: swap with VaultSecretsProvider, AWSSecretsProvider, etc.
export const secrets: SecretsProvider = new EnvSecretsProvider();
```

Fifteen lines. The auth service is refactored to use `secrets.get('JWT_SECRET')` instead of `process.env.JWT_SECRET`. The debate took seventy-five seconds and produced better architecture than either CLI would have created alone.

```
[T+4:05] SECURITY → Finding resolved. Closing security-to-coder_backend-001.
[T+4:05] CODER_BACKEND → Refactored auth to use SecretsProvider abstraction.
```

Security doesn't stop. Over the next two minutes, it flags four more findings:

```
[T+4:15] SECURITY → MEDIUM: Missing CORS configuration. Adding to findings.
[T+4:28] SECURITY → MEDIUM: bcrypt rounds set to 10. Recommend 12 for 2025 hardware.
[T+4:45] SECURITY → LOW: Rate limiter allows 100 req/15min on /auth/login.
                    Recommend 5 req/15min for auth endpoints specifically.
[T+5:10] SECURITY → MEDIUM: WebSocket upgrade handler doesn't validate Origin header.
                    Risk: Cross-site WebSocket hijacking.
```

The Backend Coder addresses each one as they arrive. This is concurrent development and review happening simultaneously --- the same work that would be sequential in a traditional team (write code → submit PR → wait for review → address feedback → re-review).

---

## 24.6 T+2:00 to T+8:00 — The Frontend Rises

While the Backend Coder and Security Auditor are debating secrets management, the Frontend Coder CLI has been working in its own worktree since T+2:00. It read the architecture document, the API contract, and the component tree. It doesn't need the backend to be running --- it has the API contract, and it will mock endpoints until integration.

```
[T+2:10] CODER_FRONTEND → npx create-vite@latest packages/web --template react-ts
[T+2:25] CODER_FRONTEND → Installing: tailwindcss, @tanstack/react-query, react-router-dom,
                           zustand, react-hook-form, zod, socket.io-client
[T+2:40] CODER_FRONTEND → Scaffolding directory structure...
```

The Frontend Coder's output is prodigious. React components flow in a steady stream:

```
[T+2:55] CODER_FRONTEND → Writing packages/web/src/components/auth/LoginForm.tsx
[T+3:05] CODER_FRONTEND → Writing packages/web/src/components/auth/RegisterForm.tsx
[T+3:12] CODER_FRONTEND → Writing packages/web/src/components/auth/OAuthButtons.tsx
[T+3:20] CODER_FRONTEND → Writing packages/web/src/components/layout/AppShell.tsx
[T+3:28] CODER_FRONTEND → Writing packages/web/src/components/layout/Sidebar.tsx
[T+3:35] CODER_FRONTEND → Writing packages/web/src/components/tasks/TaskBoard.tsx
[T+3:42] CODER_FRONTEND → Writing packages/web/src/components/tasks/TaskCard.tsx
[T+3:50] CODER_FRONTEND → Writing packages/web/src/components/tasks/TaskDetail.tsx
[T+3:58] CODER_FRONTEND → Writing packages/web/src/components/tasks/CreateTaskModal.tsx
[T+4:05] CODER_FRONTEND → Writing packages/web/src/components/projects/ProjectList.tsx
[T+4:12] CODER_FRONTEND → Writing packages/web/src/components/notifications/NotificationBell.tsx
```

Here's a slice of the task board --- the centerpiece of the UI:

```tsx
// packages/web/src/components/tasks/TaskBoard.tsx
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DndContext, DragEndEvent, closestCorners } from '@dnd-kit/core';
import { TaskCard } from './TaskCard';
import { TaskColumn } from './TaskColumn';
import { api } from '../../lib/api';
import { useTaskStore } from '../../stores/taskStore';
import type { Task, TaskStatus } from '../../types';

const COLUMNS: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done'];

export function TaskBoard({ projectId }: { projectId: string }) {
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => api.tasks.list(projectId),
  });

  const { moveTask } = useTaskStore();

  const columns = useMemo(() => {
    if (!tasks) return {};
    return COLUMNS.reduce((acc, status) => ({
      ...acc,
      [status]: tasks.filter((t: Task) => t.status === status),
    }), {} as Record<TaskStatus, Task[]>);
  }, [tasks]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const taskId = active.id as string;
    const newStatus = over.id as TaskStatus;
    moveTask(taskId, newStatus);
    await api.tasks.updateStatus(taskId, newStatus);
  };

  if (isLoading) return <BoardSkeleton />;

  return (
    <DndContext collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto p-4 h-full">
        {COLUMNS.map(status => (
          <TaskColumn key={status} id={status} title={formatStatus(status)}>
            {columns[status]?.map(task => (
              <TaskCard key={task.id} task={task} />
            ))}
          </TaskColumn>
        ))}
      </div>
    </DndContext>
  );
}
```

Drag-and-drop Kanban board. Five columns. Optimistic updates via Zustand. API-backed persistence. Real-time sync coming via WebSocket subscription. This is production-grade React code produced in under a minute.

By T+6:00, the Frontend Coder has generated:

```
packages/web/
├── src/
│   ├── components/
│   │   ├── auth/          (3 components — Login, Register, OAuth)
│   │   ├── layout/        (3 components — AppShell, Sidebar, Header)
│   │   ├── tasks/         (5 components — Board, Card, Detail, Create, Filters)
│   │   ├── projects/      (3 components — List, Create, Settings)
│   │   ├── notifications/ (2 components — Bell, Panel)
│   │   └── ui/            (8 components — Button, Input, Modal, Avatar, Badge,
│   │                        Dropdown, Skeleton, Toast)
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useTasks.ts
│   │   ├── useWebSocket.ts
│   │   └── useNotifications.ts
│   ├── stores/
│   │   ├── authStore.ts
│   │   ├── taskStore.ts
│   │   └── notificationStore.ts
│   ├── lib/
│   │   ├── api.ts          (typed API client from OpenAPI contract)
│   │   ├── ws.ts           (WebSocket connection manager with reconnect)
│   │   └── utils.ts
│   ├── types/
│   │   └── index.ts
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── ProjectView.tsx
│   │   ├── Login.tsx
│   │   └── Register.tsx
│   ├── App.tsx
│   └── main.tsx
├── tailwind.config.ts
├── vite.config.ts
├── package.json
└── tsconfig.json
```

Thirty-seven files. 2,944 lines of TypeScript and TSX. Six minutes.

---

## 24.7 T+4:00 to T+10:00 — QA Builds the Safety Net

The QA CLI came online at T+2:00 alongside Security, but it held back for the first two minutes. Chapter 13 defined QA's activation strategy: wait until at least one service has three or more files before beginning test generation. Writing tests for stubs is waste.

At T+4:00, the backend has enough substance. QA starts:

```
[T+4:00] QA → Reading API contract: .swarm/artifacts/api-contract.yaml
[T+4:05] QA → Generating test matrix from 14 endpoints × 3 scenarios (happy, error, edge)
[T+4:08] QA → 42 test cases planned. Beginning generation.
```

QA doesn't just write tests --- it writes tests that *fail first*. This is the red-green verification loop from Chapter 13: generate the test, run it against the current code, confirm it passes, and if it doesn't, file a bug to the relevant Coder CLI.

```
[T+4:15] QA → Writing packages/api/tests/auth.test.ts (12 test cases)
[T+4:25] QA → Writing packages/api/tests/tasks.test.ts (15 test cases)
[T+4:35] QA → Writing packages/api/tests/projects.test.ts (9 test cases)
[T+4:45] QA → Writing packages/api/tests/ws.test.ts (6 test cases)
```

Here's a sample from the auth tests --- note the edge cases that a human might skip:

```typescript
// packages/api/tests/auth.test.ts
describe('POST /auth/register', () => {
  it('creates user with valid input', async () => {
    const res = await request(app).post('/auth/register').send({
      email: 'test@example.com',
      password: 'SecureP@ss123',
      name: 'Test User',
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('user.id');
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('rejects duplicate email with 409', async () => {
    await createUser({ email: 'dup@example.com' });
    const res = await request(app).post('/auth/register').send({
      email: 'dup@example.com',
      password: 'SecureP@ss123',
      name: 'Dup User',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
  });

  it('rejects weak password with 422', async () => {
    const res = await request(app).post('/auth/register').send({
      email: 'weak@example.com',
      password: '123',
      name: 'Weak User',
    });
    expect(res.status).toBe(422);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({ field: 'password' })
    );
  });

  it('sanitizes HTML in name field', async () => {
    const res = await request(app).post('/auth/register').send({
      email: 'xss@example.com',
      password: 'SecureP@ss123',
      name: '<script>alert("xss")</script>',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.name).not.toContain('<script>');
  });
});
```

That last test --- XSS sanitization on the name field --- came from a direct message from the Security CLI:

```
[T+4:20] SECURITY → Message to QA: Ensure all user-input string fields
                     are tested for XSS payload injection. Priority: name,
                     task title, task description, comment body.
```

This is cross-CLI collaboration that no single agent can replicate. Security identifies the attack vector. QA writes the test. The Backend Coder implements the sanitization. Three perspectives, three CLIs, one coherent outcome.

At T+6:00, QA runs the first test suite:

```
[T+6:00] QA → npx jest --verbose
[T+6:15] QA → Results: 42 tests | 34 passed | 8 failed
              Failures:
              - auth.test.ts: OAuth callback missing state validation (2 tests)
              - tasks.test.ts: Status transition rejects invalid transitions (1 test)
              - tasks.test.ts: Pagination returns correct total count (1 test)
              - ws.test.ts: Disconnected client removed from room (2 tests)
              - projects.test.ts: Non-member cannot access project tasks (2 tests)
```

Eight failures. QA files each one as a bug to the Backend Coder:

```
[T+6:18] QA → Filing 5 bug reports to coder_backend via .swarm/messages/
              BUG-001: OAuth state parameter not validated on callback
              BUG-002: Task status machine allows backlog → done (should require intermediate states)
              BUG-003: Pagination total_count returns undefined when query has filters
              BUG-004: WebSocket room cleanup on disconnect is async but not awaited
              BUG-005: Project task access check missing for non-member users
```

The Backend Coder receives all five. It prioritizes BUG-001 (security implication) and fixes them in order:

```
[T+6:25] CODER_BACKEND → Fixing BUG-001: Added state parameter generation and
                          validation to OAuth callback handler.
[T+6:30] CODER_BACKEND → Fixing BUG-002: Task status machine now enforces
                          allowed transitions: backlog→todo→in_progress→review→done.
[T+6:35] CODER_BACKEND → Fixing BUG-003: Prisma count query now applies same
                          where clause as data query.
[T+6:38] CODER_BACKEND → Fixing BUG-004: await ws.room.remove(client) in
                          disconnect handler.
[T+6:42] CODER_BACKEND → Fixing BUG-005: Added project membership check
                          middleware to task routes.
```

QA reruns at T+7:00:

```
[T+7:00] QA → npx jest --verbose
[T+7:12] QA → Results: 42 tests | 42 passed | 0 failed ✅
              Coverage: 84.2% statements, 79.1% branches
```

All green. The Backend Coder fixed five bugs in seventeen minutes that would have been caught --- maybe --- in code review two days later in a traditional workflow.

But QA isn't done. It moves to the frontend:

```
[T+7:15] QA → Generating frontend tests: React Testing Library + Vitest
[T+7:30] QA → Writing packages/web/tests/TaskBoard.test.tsx (8 tests)
[T+7:40] QA → Writing packages/web/tests/LoginForm.test.tsx (6 tests)
[T+7:50] QA → Writing packages/web/tests/NotificationBell.test.tsx (4 tests)
[T+8:00] QA → Writing packages/web/tests/useWebSocket.test.ts (5 tests)
```

---

## 24.8 T+8:00 to T+12:00 — DevOps Containerizes Everything

The DevOps CLI activates at T+8:00, once the Orchestrator confirms that both backend and frontend have stable, passing builds. DevOps read the architecture document six minutes ago when it was first published, but it waited. Chapter 11 defined DevOps's activation trigger: code must compile and pass a baseline test suite before containerization begins. There's no point Dockerizing broken code.

```
[T+8:00] DEVOPS → Online. Reading current project state.
[T+8:05] DEVOPS → Detected: monorepo structure (packages/api + packages/web)
                   Build system: npm workspaces
                   Runtime: Node.js 20 LTS
                   Database: PostgreSQL 16
                   Cache: Redis 7 (for rate limiting + sessions)
```

DevOps produces six files in four minutes:

```
[T+8:10] DEVOPS → Writing packages/api/Dockerfile
[T+8:15] DEVOPS → Writing packages/web/Dockerfile
[T+8:20] DEVOPS → Writing docker-compose.yml
[T+8:25] DEVOPS → Writing docker-compose.prod.yml
[T+8:30] DEVOPS → Writing .github/workflows/ci.yml
[T+8:35] DEVOPS → Writing .github/workflows/deploy.yml
```

The API Dockerfile uses multi-stage builds --- a detail the Researcher flagged in the research brief:

```dockerfile
# packages/api/Dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/

FROM base AS deps
RUN npm ci --omit=dev

FROM base AS build
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]
```

Non-root user. Health check. Multi-stage build that keeps the production image at 147MB instead of 890MB. This is the DevOps CLI's specialized knowledge --- it knows the patterns because its system prompt was trained on thousands of Dockerfiles.

The `docker-compose.yml` ties everything together:

```yaml
services:
  api:
    build: ./packages/api
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://taskflow:taskflow@db:5432/taskflow
      REDIS_URL: redis://cache:6379
      JWT_SECRET: ${JWT_SECRET}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID}
      GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET}
    depends_on:
      db: { condition: service_healthy }
      cache: { condition: service_started }

  web:
    build: ./packages/web
    ports: ["5173:80"]
    depends_on: [api]

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: taskflow
      POSTGRES_USER: taskflow
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U taskflow"]
      interval: 5s
      timeout: 3s
      retries: 5

  cache:
    image: redis:7-alpine
    volumes: ["redisdata:/data"]

volumes:
  pgdata:
  redisdata:
```

Security catches this immediately:

```
[T+8:40] SECURITY → MEDIUM: docker-compose.yml uses ${JWT_SECRET} from environment.
                     This is acceptable for development. For production compose,
                     use Docker secrets or external secrets manager.
                     Filing as informational, not blocking.
```

DevOps acknowledges and adds a comment to `docker-compose.prod.yml` documenting the secrets strategy for production deployments.

The CI/CD pipeline is comprehensive:

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint

  test-api:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: taskflow_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/taskflow_test
      - run: npm run test:api -- --coverage
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/taskflow_test
          JWT_SECRET: test-secret-do-not-use-in-production
          NODE_ENV: test

  test-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run test:web -- --coverage

  build:
    needs: [lint, test-api, test-web]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v5
        with:
          context: ./packages/api
          push: false
          tags: taskflow-api:${{ github.sha }}
      - uses: docker/build-push-action@v5
        with:
          context: ./packages/web
          push: false
          tags: taskflow-web:${{ github.sha }}
```

At T+10:00, DevOps runs the full Docker build to verify:

```
[T+10:00] DEVOPS → docker compose build
[T+10:45] DEVOPS → Build complete. api: 147MB, web: 23MB (nginx + static)
[T+10:50] DEVOPS → docker compose up -d
[T+11:00] DEVOPS → Health check: api → 200 OK, web → 200 OK, db → ready
[T+11:05] DEVOPS → Running prisma migrate deploy in container...
[T+11:10] DEVOPS → Migration complete. 5 tables created.
[T+11:15] DEVOPS → Smoke test: POST /auth/register → 201 ✅
                    POST /auth/login → 200 ✅
                    GET /tasks → 200 (empty array) ✅
                    WebSocket upgrade → connected ✅
[T+11:20] DEVOPS → docker compose down
[T+11:25] DEVOPS → Infrastructure validated. All services healthy.
```

---

## 24.9 T+6:00 to T+14:00 — Security's Final Sweep

The Security CLI has been running continuously since T+3:00. By T+10:00, it has filed fourteen findings across the build. Eight were resolved in real-time through the debate protocol. Three were accepted as informational (documentation-only). Three remain open.

At T+12:00, with all code finalized, Security runs its comprehensive audit:

```
[T+12:00] SECURITY → Beginning final security audit.
[T+12:05] SECURITY → Static analysis: npm audit → 0 critical, 0 high, 2 moderate
                      (both in dev dependencies, excluded from production build)
[T+12:10] SECURITY → Dependency scan: no known CVEs in production deps
[T+12:15] SECURITY → OWASP Top 10 checklist:
                      A01 Broken Access Control    → PASS (RBAC + project membership checks)
                      A02 Cryptographic Failures    → PASS (bcrypt 12 rounds, JWT RS256*)
                      A03 Injection                 → PASS (Prisma parameterized queries)
                      A04 Insecure Design           → PASS (threat model reviewed)
                      A05 Security Misconfiguration  → WARN (CORS needs production whitelist)
                      A06 Vulnerable Components      → PASS (no known CVEs)
                      A07 Auth Failures              → PASS (rate limiting, account lockout)
                      A08 Data Integrity Failures    → PASS (input validation via Zod)
                      A09 Logging Failures           → WARN (structured logging present,
                                                       but no SIEM integration documented)
                      A10 SSRF                       → N/A (no outbound requests from user input)
```

*Note: The Backend Coder used HS256 initially. Security flagged it at T+5:30 and the Coder switched to RS256 with key rotation support. Another debate, another improvement.

Security produces its final report at T+13:00:

```
[T+13:00] SECURITY → Writing .swarm/artifacts/security-report.md
                      Total findings: 14
                      Critical: 1 (resolved — JWT_SECRET in env)
                      High: 2 (resolved — OAuth state validation, HS256→RS256)
                      Medium: 6 (5 resolved, 1 accepted — CORS whitelist for prod)
                      Low: 3 (2 resolved, 1 informational — SIEM integration)
                      Informational: 2 (Docker secrets strategy documented)
                      
                      Resolution rate: 85.7% (12/14 resolved during build)
                      Residual risk: LOW
                      Production readiness: CONDITIONAL (requires CORS whitelist config)
```

---

## 24.10 T+14:00 to T+18:00 — The Writer Documents

The Writer CLI has been dormant since T+0:02, watching the build through the message bus. Chapter 14 defined its activation rule: begin documentation only after code stabilizes and the Security audit is complete. Writing docs for code that's still changing is waste.

At T+14:00, the Orchestrator signals the Writer:

```
[T+14:00] ORCHESTRATOR → Writer: All code stable. Security audit complete.
                          Generate documentation package.
[T+14:02] WRITER → Online. Reading all artifacts and source files.
                    Ingesting: architecture.md, api-contract.yaml, security-report.md,
                    34 source files, 42 test files, 6 infrastructure files.
```

The Writer produces five documents in four minutes:

```
[T+14:10] WRITER → Writing docs/README.md (project overview + quickstart)
[T+14:30] WRITER → Writing docs/API.md (endpoint reference from OpenAPI contract)
[T+14:50] WRITER → Writing docs/ARCHITECTURE.md (system design with diagrams)
[T+15:10] WRITER → Writing docs/DEPLOYMENT.md (Docker, CI/CD, secrets, scaling)
[T+15:30] WRITER → Writing docs/CONTRIBUTING.md (dev setup, testing, PR guidelines)
```

The README alone is 340 lines --- feature list, screenshots placeholders, quickstart guide, environment variables reference, and architecture overview. It's generated from the actual code, not from assumptions. Every API endpoint listed in `docs/API.md` maps to an actual route handler. Every environment variable listed in `docs/DEPLOYMENT.md` corresponds to a real `process.env` reference in the codebase.

Here's the quickstart section:

```markdown
## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16 (or use Docker)

### Development Setup

1. Clone and install:
   ```bash
   git clone https://github.com/your-org/taskflow.git
   cd taskflow
   npm install
   ```

2. Configure environment:
   ```bash
   cp packages/api/.env.example packages/api/.env
   # Edit .env with your OAuth credentials and JWT secret
   ```

3. Start services:
   ```bash
   docker compose up -d db cache
   npx prisma migrate deploy
   npm run dev
   ```

4. Access:
   - Frontend: http://localhost:5173
   - API: http://localhost:3000
   - API Docs: http://localhost:3000/docs
```

---

## 24.11 T+18:00 to T+20:00 — Integration and Final Verification

At T+18:00, the Orchestrator triggers the integration phase. All eight CLIs have completed their primary tasks. Now the Orchestrator merges all worktrees into the main branch:

```
[T+18:00] ORCHESTRATOR → Beginning worktree merge.
[T+18:05] ORCHESTRATOR → Merging research/ → main (artifacts only, no conflicts)
[T+18:08] ORCHESTRATOR → Merging architecture/ → main (artifacts only, no conflicts)
[T+18:12] ORCHESTRATOR → Merging coder_backend/ → main (packages/api/)
[T+18:15] ORCHESTRATOR → Merging coder_frontend/ → main (packages/web/)
[T+18:18] ORCHESTRATOR → Merging devops/ → main (Docker + CI/CD)
[T+18:20] ORCHESTRATOR → Merging security/ → main (security report)
[T+18:22] ORCHESTRATOR → Merging qa/ → main (test files)
[T+18:25] ORCHESTRATOR → Merging writer/ → main (docs/)
[T+18:28] ORCHESTRATOR → All merges clean. Zero conflicts.
```

Zero conflicts. This is the payoff of the architecture phase --- the Architect defined clear boundaries between `packages/api/` and `packages/web/`, and the task DAG ensured no two CLIs wrote to the same directory. Git worktree isolation (Chapter 16) did the rest.

The Orchestrator now runs the full verification suite:

```
[T+18:30] ORCHESTRATOR → Running final verification...
[T+18:32] ORCHESTRATOR → TypeScript compilation: packages/api ✅ packages/web ✅
[T+18:35] ORCHESTRATOR → Lint: 0 errors, 0 warnings
[T+18:40] ORCHESTRATOR → Backend tests: 42/42 passed (coverage: 84.2%)
[T+18:45] ORCHESTRATOR → Frontend tests: 23/23 passed (coverage: 76.8%)
[T+18:50] ORCHESTRATOR → Docker build: api (147MB) ✅ web (23MB) ✅
[T+18:55] ORCHESTRATOR → Docker compose up: all services healthy ✅
[T+19:00] ORCHESTRATOR → Integration smoke tests: 8/8 passed ✅
[T+19:05] ORCHESTRATOR → Security: 0 critical, 0 high findings open
```

Everything green. The Orchestrator writes the final build summary.

---

## 24.12 T+20:00 to T+23:00 — Polish and Delivery

The last three minutes are cleanup. The Orchestrator asks each CLI to review the final merged codebase and flag anything that looks wrong:

```
[T+20:00] ORCHESTRATOR → Final review round. All CLIs: scan merged codebase for issues.
[T+20:15] SECURITY → Final scan: no new findings post-merge.
[T+20:20] QA → Final scan: all tests still pass post-merge.
[T+20:25] CODER_BACKEND → Final scan: no type errors, no unused imports.
[T+20:30] CODER_FRONTEND → Final scan: no type errors. Added missing
                            ErrorBoundary wrapper to App.tsx.
[T+20:40] DEVOPS → Final scan: docker compose down/up cycle clean.
[T+20:45] WRITER → Final scan: README links verified. No dead references.
```

One last fix: the Frontend Coder adds an `ErrorBoundary` it had missed. A two-minute polish pass caught what would have been a production crash on any unhandled React error.

At T+23:00, the Orchestrator publishes the final delivery:

```
[T+23:00] ORCHESTRATOR → BUILD COMPLETE.
           Duration: 23 minutes, 0 seconds.
           
           === DELIVERY SUMMARY ===
           
           Files created:          97
           Lines of code:          6,891 (TypeScript/TSX)
           Lines of config:        847 (YAML, JSON, Dockerfile)
           Lines of documentation: 1,243 (Markdown)
           Lines of tests:         1,412
           
           Total lines:            10,393
           
           Test results:           65/65 passed (100%)
           Code coverage:          81.3% average (84.2% API, 76.8% web)
           Security findings:      14 total, 12 resolved, 2 accepted
           Open critical/high:     0
           
           Docker images:          2 (api: 147MB, web: 23MB)
           CI/CD pipelines:        2 (ci.yml, deploy.yml)
           
           Documentation:          5 files (README, API, Architecture,
                                   Deployment, Contributing)
           
           CLI utilization:
             Researcher:     1m58s active
             Architect:      1m58s active
             Coder (Backend): 10m22s active
             Coder (Frontend): 6m15s active
             Security:       11m00s active (continuous)
             QA:             8m30s active
             DevOps:         3m25s active
             Writer:         4m00s active
           
           Total CLI-minutes:      47m28s
           Wall-clock time:        23m00s
           Parallelism factor:     2.06x
```

---

## 24.13 The Human Comparison

Let's be honest about what just happened. And let's be honest about what it would take without the forge.

A senior engineering team building this same application --- a backend engineer, a frontend engineer, a DevOps engineer, and a QA/security specialist --- would follow a timeline roughly like this:

| Phase | Duration | Team Members |
|-------|----------|-------------|
| Requirements discussion | 2 hours | All 4 |
| Architecture design | 4 hours | Backend + DevOps |
| Database schema design | 2 hours | Backend |
| API implementation | 8 hours | Backend |
| Frontend implementation | 10 hours | Frontend |
| Authentication + OAuth | 4 hours | Backend |
| WebSocket implementation | 3 hours | Backend + Frontend |
| Docker + CI/CD setup | 4 hours | DevOps |
| Test writing | 6 hours | QA |
| Security review | 4 hours | QA/Security |
| Bug fixes from review | 4 hours | Backend + Frontend |
| Documentation | 3 hours | All |
| Integration testing | 2 hours | All 4 |
| **Total** | **~56 person-hours** | **3--5 calendar days** |

The forge delivered the same scope in 47.5 CLI-minutes and 23 wall-clock minutes.

But this comparison is misleading if you take it at face value. Let's add nuance:

**What the forge did better:**
- Zero communication overhead. No Slack messages, no standup meetings, no "can you review my PR when you get a chance." The message bus is instant.
- Zero context switching. Each CLI maintained perfect focus on its domain for the entire build.
- Continuous security review. In a human team, security review happens after the code is written. In the forge, it happens while the code is being written. The debate at T+3:35 caught the JWT_SECRET issue five seconds after it was introduced.
- Perfect adherence to the architecture. The Architect's decisions were loaded into every CLI's context window. No drift, no "oh, I thought we were using HS256."

**What a human team does better:**
- Judgment calls on product requirements. The forge built exactly what was specified. A human team would have asked, "Do we really need OAuth for an MVP?" and potentially saved two hours by deferring it.
- Edge case discovery from domain knowledge. A human who has built task management tools before would know that drag-and-drop reordering within a column is a critical UX expectation. The forge didn't implement it because it wasn't specified.
- Creative problem-solving under ambiguity. When the requirements say "real-time notifications," a human team debates what "real-time" means for their users. The forge implemented WebSocket push notifications --- correct, but it didn't consider whether email digests would be more useful for async teams.

**The honest verdict:** The forge produces a better first draft faster. A human team produces a better product over time. The winning strategy --- and the one this book advocates --- is the forge for the first twenty-three minutes, followed by a human reviewing the output, adding product judgment, and iterating.

---

## 24.14 Cost Breakdown

Every API call costs money. Here's what this build consumed:

| CLI | Model | Input Tokens | Output Tokens | Cost |
|-----|-------|-------------|---------------|------|
| Orchestrator | Sonnet 4 | 45,200 | 8,100 | $0.24 |
| Researcher | Sonnet 4 | 38,400 | 12,300 | $0.25 |
| Architect | Sonnet 4 | 52,100 | 18,700 | $0.36 |
| Coder (Backend) | Sonnet 4 | 124,600 | 48,200 | $1.05 |
| Coder (Frontend) | Sonnet 4 | 98,300 | 52,100 | $0.98 |
| Security | Sonnet 4 | 87,200 | 15,800 | $0.49 |
| QA | Sonnet 4 | 72,400 | 34,600 | $0.61 |
| DevOps | Sonnet 4 | 41,300 | 19,200 | $0.32 |
| Writer | Sonnet 4 | 68,500 | 28,400 | $0.51 |
| **Total** | | **628,000** | **237,400** | **$4.81** |

Four dollars and eighty-one cents. For 10,393 lines of production-quality code, tests, documentation, and infrastructure.

A senior engineering team billing at $150/hour average would cost $8,400 for the same 56 person-hours. The forge is 1,746 times cheaper in direct costs.

But again, nuance. The forge requires:
- An Anthropic API key with sufficient rate limits ($4.81 per run at current pricing)
- The SwarmForge infrastructure (which you built in Chapters 15--20)
- A human to write the initial prompt and review the output (15--30 minutes)
- A human to make product judgment calls the forge can't (variable)

The total cost of ownership is closer to $50--$100 when you factor in the human review time at a senior engineer's rate. Still, that's roughly 100x cheaper than a human team. And the gap widens as the forge gets faster and token costs continue dropping.

---

## 24.15 What Went Wrong

No build is perfect. This one had three issues worth documenting:

**Issue 1: The Frontend Coder used `@dnd-kit/core` without checking if the Architect specified a drag-and-drop library.** The Architect's component tree mentioned "drag-and-drop Kanban" but didn't specify a library. The Frontend Coder chose `@dnd-kit/core` --- a fine choice, but it was a unilateral decision that should have been flagged to the Architect. In a production forge, we'd add a rule: any dependency not in the architecture document requires explicit approval.

**Issue 2: The QA CLI wrote frontend tests that were too tightly coupled to implementation details.** Several tests queried specific CSS class names (`'.task-card-title'`) instead of using `data-testid` attributes or accessible roles. When the Frontend Coder made a styling change during the polish phase, two tests broke. This is a known anti-pattern --- the QA CLI's system prompt should include a rule against testing CSS classes directly.

**Issue 3: The Writer produced documentation that assumed the reader had Docker installed.** The quickstart guide jumped straight to `docker compose up` without mentioning that Docker Desktop needs to be installed first, or that Docker Compose V2 is required (not the old `docker-compose` standalone). A human technical writer would have caught this. The Writer CLI's context window didn't include information about the target audience's skill level --- a gap in the Orchestrator's task definition.

These are exactly the kinds of issues that improve with iteration. Each one translates to a system prompt update, a new rule in the forge's configuration, or a better task definition template. The forge learns --- not through model training, but through human-curated prompt engineering based on observed failures.

---

## 24.16 The Full Timeline

For reference, here's the complete execution trace compressed into a single view:

```
T+0:00   USER         → Submits 47-word prompt
T+0:02   ORCHESTRATOR → Intent analyzed. 8 CLIs required. DAG generated.
T+0:03   RESEARCHER   → Online. Beginning web research.
T+0:03   ARCHITECT    → Online. Beginning system design.
T+1:30   RESEARCHER   → Research brief published (17 tool calls, 9 sources).
T+1:55   ARCHITECT    → Architecture v2 published (incorporated research).
T+2:00   ORCHESTRATOR → Phase 1 gate passed. Spawning Phase 2 + Phase 4.
T+2:00   CODER_BACK   → Online. Scaffolding backend.
T+2:00   CODER_FRONT  → Online. Scaffolding frontend.
T+3:00   SECURITY     → Online. Continuous audit mode.
T+3:00   QA           → Online. Waiting for code density threshold.
T+3:35   SECURITY     → CRITICAL: JWT_SECRET in env vars. Debate initiated.
T+4:05   CODER_BACK   → Debate resolved. SecretsProvider abstraction added.
T+4:00   QA           → Code threshold met. Test generation starting.
T+5:30   SECURITY     → HS256 flagged. Backend switches to RS256.
T+6:00   QA           → First test run: 42 tests, 34 pass, 8 fail.
T+6:18   QA           → 5 bug reports filed to Backend.
T+6:42   CODER_BACK   → All 5 bugs fixed.
T+7:12   QA           → Rerun: 42/42 pass. Coverage: 84.2%.
T+8:00   DEVOPS       → Online. Builds verified. Containerizing.
T+8:00   CODER_FRONT  → Frontend complete. 37 files, 2,944 lines.
T+8:35   DEVOPS       → Docker + CI/CD pipeline complete.
T+10:00  DEVOPS       → Full Docker build + smoke test passed.
T+12:00  SECURITY     → Final OWASP audit complete. 12/14 findings resolved.
T+14:00  WRITER       → Online. Documentation generation starting.
T+15:30  WRITER       → 5 documentation files complete.
T+18:00  ORCHESTRATOR → Worktree merge: 8 branches, 0 conflicts.
T+19:05  ORCHESTRATOR → Final verification: all tests pass, all builds clean.
T+20:30  CODER_FRONT  → Polish: ErrorBoundary added.
T+23:00  ORCHESTRATOR → BUILD COMPLETE. 97 files, 10,393 lines, $4.81.
```

Twenty-three minutes from prompt to production-ready delivery.

---

## 24.17 Lessons from the Build

This case study isn't just a demonstration. It's a data point. Here are the lessons that generalize beyond this specific build:

**Lesson 1: The architecture phase is the highest-leverage investment.** Two minutes of architecture produced artifacts that prevented conflicts across six CLIs for the next twenty-one minutes. Without it, the Backend and Frontend Coders would have disagreed on API contracts, the Security CLI would have flagged issues that were already handled, and the DevOps CLI would have containerized a structure it didn't understand. Skipping architecture to save two minutes would have cost ten minutes in rework.

**Lesson 2: Continuous security review is categorically different from post-hoc review.** In a traditional workflow, the Security review happens after the code is written. Every finding requires the author to context-switch back to code they wrote hours or days ago. In the forge, Security flagged the JWT_SECRET issue five seconds after the Backend Coder wrote it. The fix took thirty seconds because the code was still fresh in the Backend Coder's context window. Five seconds versus five days. That's the difference between a finding that gets fixed and a finding that gets deferred to "next sprint."

**Lesson 3: The debate protocol produces better architecture than consensus.** When Security objected to `process.env` for secrets, the Backend Coder's counter-proposal was reasonable: use dotenv and document the production requirement. Security's response was better: accept the counter-proposal *and* add a `SecretsProvider` abstraction. Neither CLI would have arrived at this solution alone. The Backend Coder would have shipped dotenv. Security would have demanded Vault. The debate produced a third option that satisfied both constraints.

**Lesson 4: QA finds bugs that authors are blind to.** Five of the eight test failures were in areas where the Backend Coder thought the code was correct. The OAuth state validation bug (BUG-001) was a security vulnerability that would have survived code review by anyone except a dedicated QA engineer looking for it specifically. Separate CLIs with separate context windows prevent the "I just wrote this, it's probably fine" blindness.

**Lesson 5: The Writer needs the full picture.** Documentation quality correlates directly with how much context the Writer CLI has. In this build, the Writer waited until T+14:00 --- after all code, tests, and security findings were complete --- and it produced documentation that accurately reflected the codebase. An earlier activation would have produced documentation that drifted from reality as the code changed.

**Lesson 6: Cost is no longer the constraint.** At $4.81, the forge is cheaper than the coffee a human team would drink during their first design meeting. The constraint has shifted from *cost* to *prompt quality*. A poorly specified initial prompt produces a poorly specified architecture, which produces a poorly structured codebase. The user's forty-seven words were good enough for this build. For a more complex system, they wouldn't be. The bottleneck is human clarity, not compute dollars.

---

The forge built a full-stack SaaS application in twenty-three minutes. Ninety-seven files. Ten thousand lines. Sixty-five passing tests. A clean security audit. Working Docker containers. Five documents of documentation. And a CI/CD pipeline ready to ship.

This is what eight specialized CLIs can do when they share an architecture, communicate through a message bus, debate their disagreements, and verify each other's work. It's not magic. It's orchestration.

Chapter 25 will push harder. A larger system. More CLIs. More debates. More edge cases. The forge at its limits.

But first, that twenty-three-minute task management app? It works. You can clone it, run `docker compose up`, and start creating tasks. The forge built it. A human prompted it.

That's the division of labor this book has been building toward.
