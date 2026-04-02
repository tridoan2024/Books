# Chapter 4: Setting Up the Forge — Your Multi-CLI Development Environment

> *"A blacksmith doesn't hammer steel on a kitchen table. Before you forge anything worth wielding, you build the forge itself."*

You have studied the architecture. You understand that a multi-CLI agent system is not one monolithic AI assistant but a coordinated team of specialized processes — each with its own system prompt, its own tools, its own permissions boundary. You have seen how Claude Code works internally: the query loop, the tool dispatch, the permission gates, the conversation threading.

Now you build.

This chapter is about constructing the physical workspace — the directory structures, build systems, configuration hierarchies, and version control strategies that will support a fleet of eight or more specialized CLI agents working in concert. We will walk both paths available to you: forking Claude Code's TypeScript codebase for rapid iteration, and rewriting core functionality in Rust for production-grade performance. By the end of this chapter, you will have two CLI agents running simultaneously, with one dispatching work to the other and receiving results back.

This is not a thought experiment. You will type commands, compile binaries, and watch agents communicate.

---

## 3.1 Two Paths — TypeScript Fork vs Rust Rewrite

Every builder of multi-CLI systems faces the same fork in the road early on. Claude Code is an open-source TypeScript application — a sophisticated one, spanning roughly 15,000 source files and half a million lines of code. It runs on Bun, renders its terminal interface with React and Ink, and implements a tool system that any LLM can invoke. You can fork it, modify it, and have a working custom CLI within hours.

Or you can start from scratch in a systems language, building exactly the features you need, with full control over memory layout, concurrency, and binary size.

Both paths are legitimate. Both have tradeoffs. And nothing stops you from walking both simultaneously — using a TypeScript fork for rapid prototyping while building the Rust rewrite for production deployment.

### The TypeScript Fork Path

The fastest route to a working custom CLI is forking Claude Code directly. You inherit the entire feature set — the conversation engine, the tool framework, the permission system, the MCP client, the React/Ink terminal UI — and you modify only the pieces you need.

**Step 1: Clone the source.**

```bash
git clone https://github.com/anthropics/claude-code.git upstream-claude-code
cd upstream-claude-code
bun install
```

Claude Code uses Bun as its JavaScript runtime and package manager. If you are accustomed to Node.js and npm, Bun is a near-drop-in replacement with significantly faster install and execution times. The project's `package.json` defines the build pipeline, and `bun run build` produces the distributable CLI.

**Step 2: Understand the build system.**

The build chain is straightforward: TypeScript source in `src/` is compiled and bundled, producing a CLI entry point in `dist/`. The project uses React with Ink for terminal rendering — the same component model you would use for a web application, but targeting a TTY instead of a browser DOM. This is not a curiosity. It means the entire UI is declarative, composable, and testable with standard React patterns.

```bash
bun run build
./dist/cli.js --version
```

If that prints a version string, you have a working build.

**Step 3: Establish a forking strategy.**

The naive approach — editing files directly in the cloned repository — will make it impossible to pull upstream updates without merge conflicts on every changed file. A professional forking strategy separates your customizations from the upstream source.

Create a `custom/` overlay directory:

```
upstream-claude-code/
├── src/                    # Upstream source (don't modify)
├── custom/                 # Your additions
│   ├── tools/              # Custom tool implementations
│   ├── commands/           # Custom slash commands
│   ├── config/             # Override configuration
│   └── patches/            # Surgical patches to upstream files
├── build-custom.sh         # Build script that applies overlays
└── CLAUDE.md               # Your custom system prompt (this file IS modified)
```

The `build-custom.sh` script copies your `custom/tools/` into the source tree before building, and applies any patches from `custom/patches/` using `git apply`. This lets you rebase onto new upstream releases with minimal friction. The only file you modify directly in the upstream tree is `CLAUDE.md`, which defines the system prompt and is designed to be user-customized.

**Step 4: Create your first custom tool.**

Tools in Claude Code follow a consistent interface. Each tool exports a definition object with a name, category, input schema (using Zod for validation), and an asynchronous execution function. Here is a minimal custom tool that counts lines of code in a directory:

```typescript
// custom/tools/loc-counter.ts
import { z } from 'zod';
import { execSync } from 'child_process';
import type { Tool } from '../src/tools/tool';

export const LocCounter: Tool = {
  name: 'loc_count',
  category: 'analysis',
  description: 'Count lines of code by language in a directory',
  inputSchema: z.object({
    directory: z.string().describe('Directory to analyze'),
    exclude: z.array(z.string()).optional().describe('Patterns to exclude'),
  }),
  isConcurrencySafe: true,
  async exec(input, context) {
    const excludeFlags = (input.exclude || ['node_modules', '.git'])
      .map(p => `--exclude-dir=${p}`)
      .join(' ');
    const cmd = `find ${input.directory} -type f | head -10000 | xargs wc -l | tail -1`;
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
    return { type: 'text', text: result.trim() };
  },
};
```

**Step 5: Register the tool and add slash commands.**

Tools must be registered in the tool registry so the LLM knows they exist. In Claude Code's architecture, this is typically handled through a central registration file. Your build script should inject your custom tools into this registry during the build step.

For slash commands — the `/` prefixed commands that users type directly — you add entries to the command handler. A slash command is simpler than a tool: it receives the user's text input and returns a response, without going through the LLM.

```typescript
// custom/commands/security.ts
export const securityCommands = {
  '/scan': {
    description: 'Run a quick security scan on the current project',
    async handler(args: string, context: CommandContext) {
      // Dispatch to the security tool
      return context.invokeTool('sast_scan', { target: args || '.' });
    },
  },
  '/cves': {
    description: 'Check dependencies for known CVEs',
    async handler(_args: string, context: CommandContext) {
      return context.invokeTool('dep_audit', { target: '.' });
    },
  },
};
```

**Step 6: Build, test, iterate.**

```bash
./build-custom.sh && ./dist/cli.js
```

You now have a modified Claude Code with custom tools and commands. The entire upstream feature set — conversation history, MCP support, permission management, React/Ink UI — comes along for free.

### The Rust Rewrite Path

The TypeScript fork is fast to start but carries baggage: a large dependency tree, garbage collection pauses, startup time measured in seconds, and a binary size that dwarfs what is strictly necessary. If you are building a fleet of eight specialized CLIs that may run concurrently on developer machines or in CI pipelines, these costs compound.

The Rust rewrite path trades development speed for runtime performance. You build exactly what you need, with no runtime overhead you did not choose.

Let us examine a real Cargo.toml from a working Rust rewrite, and understand why each dependency was selected:

```toml
[package]
name = "rcode"
version = "0.2.0"
edition = "2024"
description = "AI coding agent for the terminal"

[dependencies]
# === Async Runtime ===
tokio = { version = "1", features = ["full"] }
futures = "0.3"
async-trait = "0.1"
```

**Tokio** is the async runtime. This is not optional — it is the foundation. Every tool execution, every API call to the LLM provider, every file system operation runs as an async task on Tokio's work-stealing thread pool. The `"full"` feature flag enables the multi-threaded scheduler, I/O driver, timers, and signal handling. Unlike Node.js's single-threaded event loop, Tokio gives you true OS-level parallelism. When your security scanner is parsing ASTs in one task and your LLM client is streaming tokens in another, they run on separate CPU cores simultaneously.

```toml
# === HTTP + Streaming ===
reqwest = { version = "0.12", features = ["stream", "json", "rustls-tls"],
            default-features = false }
eventsource-stream = "0.2"
reqwest-eventsource = "0.6"
```

**Reqwest** handles HTTP communication with LLM providers. The `stream` feature enables Server-Sent Events (SSE) streaming — essential for token-by-token output from Claude's API. The `rustls-tls` feature uses a pure-Rust TLS implementation, eliminating the dependency on OpenSSL and the cross-compilation headaches that come with it. **Eventsource-stream** and **reqwest-eventsource** provide the SSE protocol parser that turns an HTTP response stream into a stream of typed events.

```toml
# === Terminal UI ===
ratatui = "0.29"
crossterm = "0.28"
syntect = "5"
```

**Ratatui** is the terminal UI framework — Rust's answer to React/Ink, but rendering directly to terminal escape codes with zero overhead. Where Claude Code's Ink renderer maintains a virtual DOM and diffs it on each update, Ratatui writes directly to a buffer that is flushed to the terminal. The result is visually identical but measurably faster, particularly when rendering large code blocks or streaming LLM output at high token rates. **Crossterm** provides the cross-platform terminal abstraction layer. **Syntect** handles syntax highlighting using the same grammar files as Sublime Text and VS Code.

```toml
# === Code Intelligence ===
tree-sitter = "0.24"
tree-sitter-rust = "0.23"
tree-sitter-python = "0.23"
tree-sitter-javascript = "0.23"
tree-sitter-typescript = "0.23"
tree-sitter-go = "0.23"
```

**Tree-sitter** is the code intelligence engine. It parses source code into concrete syntax trees in real time, enabling your tools to understand code structurally rather than treating it as text. When your security scanner tool looks for SQL injection vulnerabilities, it does not grep for string concatenation — it walks the AST looking for string interpolation nodes inside function calls to database query methods. Tree-sitter parsers are generated as C code and compiled to native machine code, making parsing nearly instantaneous even on large files. Five language grammars are included here; adding more is a one-line Cargo.toml change.

```toml
# === Plugin System ===
mlua = { version = "0.10", features = ["luau", "async", "serialize"] }
```

**Mlua** embeds the Luau runtime (Roblox's typed Lua variant) into your CLI. This is the user extensibility layer. Rather than requiring users to write Rust code and recompile the binary to add custom tools, they write Lua scripts that are loaded at startup. The `async` feature allows Lua scripts to call async Rust functions and await their results. The `serialize` feature enables automatic conversion between Lua tables and Rust structs via Serde.

```toml
# === Configuration ===
figment = { version = "0.10", features = ["toml", "json", "env"] }
```

**Figment** provides layered configuration merging. A single `Config` struct is populated from multiple sources in priority order: compiled defaults, then TOML files, then environment variables, then CLI flags. This is critical for multi-CLI systems where you have a shared team configuration, per-CLI overrides, per-project overrides, and per-invocation flags. Figment handles the merge logic so you write one config struct and get all four layers for free.

```toml
# === Persistence ===
rusqlite = { version = "0.32", features = ["bundled"] }
```

**Rusqlite** provides SQLite access with the `bundled` feature compiling SQLite directly into your binary — no system library dependency. Every CLI session, every memory entry, every conversation turn is persisted to a local SQLite database. The `bundled` feature is essential for deployment: your single binary carries its own database engine.

```toml
# === File System ===
ignore = "0.4"
notify = { version = "8", features = ["macos_kqueue"] }
```

**Ignore** is the file-walking library extracted from ripgrep. It respects `.gitignore`, `.ignore`, and other ignore files while walking directories in parallel. When your tool needs to search a codebase, it uses the same high-performance walker that makes ripgrep fast. **Notify** provides file system event watching using kqueue on macOS and inotify on Linux. When a file changes on disk, your CLI knows immediately — no polling required.

```toml
# === Serialization ===
serde = { version = "1", features = ["derive"] }
serde_json = "1"
toml = "0.8"
```

**Serde** is the serialization framework that everything else plugs into. Every struct in your codebase that needs to be read from TOML, sent as JSON to the LLM API, stored in SQLite, or passed to a Lua plugin implements Serde's `Serialize` and `Deserialize` traits — usually via a single `#[derive]` annotation.

**Building the Rust CLI:**

```bash
cargo build --release
ls -lh target/release/rcode
```

The release binary compiles to approximately 7.5MB — a single, statically-linked executable with no runtime dependencies. It starts in under 50 milliseconds. Compare this to a Node.js/Bun application that must load a JavaScript runtime, parse thousands of source files, and initialize a React component tree.

**The module structure** of a real Rust rewrite spans 35 directories under `src/`:

```
src/
├── main.rs          # Entry point, CLI argument parsing, runtime bootstrap
├── agents/          # Sub-agent spawning and lifecycle management
├── bridge/          # Protocol bridges (MCP, HTTP, WebSocket)
├── cli/             # Command-line argument definitions (clap)
├── commands/        # Slash command implementations
├── config/          # Figment-based layered configuration
├── engine/          # Core query loop — the heart of the CLI
├── hooks/           # Event hooks (pre-tool, post-tool, session lifecycle)
├── installer/       # Self-update and dependency management
├── intent/          # User intent classification
├── keybindings/     # Terminal keybinding configuration
├── llm/             # LLM provider abstraction (Claude, GPT, local)
├── mcp/             # Model Context Protocol client and server
├── memory/          # Session memory and persistent knowledge store
├── permissions/     # Permission gates and policy enforcement
├── plugins/         # Lua plugin system (registry, sandbox, marketplace)
├── rules/           # Rule engine for CLAUDE.md and .claude/rules/
├── screens/         # TUI screen definitions (chat, diff, settings)
├── services/        # Background services (file watcher, indexer)
├── session/         # Session management and persistence
├── settings/        # Runtime settings and preferences
├── skills/          # Skill definitions and execution
├── state/           # Application state management
├── swarm/           # Multi-agent swarm coordination
├── tasks/           # Task execution and scheduling
├── telemetry/       # Usage metrics and diagnostics
├── tools/           # Tool implementations (bash, file ops, search)
├── treesitter/      # Tree-sitter integration and language grammars
├── tui/             # Terminal UI components (ratatui widgets)
├── ui/              # UI abstractions and layout engine
├── utils/           # Shared utilities
└── watcher/         # File system event monitoring
```

Each directory is a Rust module with its own `mod.rs` that defines the public API. The separation is strict: `engine/` never imports from `tui/`, `tools/` never imports from `screens/`. Dependencies flow downward, from high-level orchestration modules toward low-level utilities.

### When to Choose Which

The decision is not binary, and the two paths complement each other:

**Choose the TypeScript fork when:**
- You need a working custom CLI this week, not this quarter
- You want the full Claude Code feature set (React/Ink UI, all built-in tools, MCP ecosystem)
- You plan to stay close to upstream and benefit from Anthropic's ongoing development
- Your team already knows TypeScript and React
- You are prototyping agent behaviors and do not yet know your final architecture

**Choose the Rust rewrite when:**
- You are deploying a fleet of CLI agents and startup time, memory usage, and binary size matter
- You need true parallel tool execution across CPU cores, not single-threaded concurrency
- You want a single binary with no runtime dependencies — copy it to a server and run it
- You need the plugin system (Lua) for end-user extensibility without recompilation
- You want AST-level code intelligence via tree-sitter compiled to native code
- You are building for production and can invest the upfront development time

In practice, most builders of multi-CLI systems start with the TypeScript fork for the first three months while simultaneously building the Rust rewrite. The TypeScript fork lets you iterate on agent behaviors and orchestration patterns quickly. Once those patterns stabilize, you port them to Rust for the production system.

---

## 3.2 The Workspace Structure

A professional multi-CLI development environment is not a collection of ad-hoc directories. It is a structured workspace where every file has a predictable location, shared resources are centralized, and the build system can compile, test, and deploy the entire fleet with a single command.

Here is the workspace layout we will build throughout this book:

```
~/multi-cli-forge/
├── upstream/                        # Claude Code source (git submodule)
│   └── claude-code/
├── clis/                            # Your specialized CLIs
│   ├── orchestrator/                # The conductor — dispatches to all others
│   │   ├── src/
│   │   ├── CLAUDE.md                # Orchestrator system prompt
│   │   ├── .claude/
│   │   │   ├── settings.json        # Orchestrator-specific settings
│   │   │   └── agents/              # Sub-agent definitions
│   │   └── package.json | Cargo.toml
│   ├── researcher/                  # Deep research and web search
│   ├── planner/                     # Architecture and task decomposition
│   ├── coder/                       # Code generation and editing
│   ├── security/                    # Vulnerability scanning and audit
│   ├── validator/                   # Test execution and verification
│   ├── qa/                          # Quality assurance and review
│   └── documenter/                  # Documentation generation
├── shared/                          # Shared across all CLIs
│   ├── memory/                      # Shared memory store
│   │   ├── project-context.md       # Current project state
│   │   ├── decisions.md             # Architecture decisions
│   │   └── findings.db              # SQLite findings store
│   ├── protocols/                   # Message schemas
│   │   └── messages.schema.json
│   ├── config/                      # Shared configuration
│   │   └── team.toml
│   └── scripts/                     # Build, test, deploy scripts
│       ├── build-all.sh
│       ├── test-integration.sh
│       └── release.sh
├── orchestration/                   # Orchestration infrastructure
│   ├── task-dag/                    # Task dependency engine
│   ├── message-bus/                 # Inter-CLI communication
│   └── dashboard/                   # Web monitoring UI
├── tests/                           # Integration tests for the full system
│   ├── scenarios/                   # End-to-end test scenarios
│   └── fixtures/                    # Test data and mock responses
└── docs/                            # Architecture documentation
    ├── architecture.md
    ├── adding-a-cli.md
    └── message-protocol.md
```

Let us examine the design principles behind this layout.

**The `upstream/` directory** contains Claude Code as a git submodule. This is your reference implementation — you read it, you study it, but you do not modify it. When Anthropic releases updates, you pull them here and selectively port improvements to your CLIs. The submodule pin ensures reproducible builds: everyone on your team works against the same upstream commit.

```bash
git submodule add https://github.com/anthropics/claude-code.git upstream/claude-code
git submodule update --init --recursive
```

**The `clis/` directory** holds your specialized CLIs. Each subdirectory is a self-contained project with its own source, configuration, and build artifacts. The critical insight is that each CLI has its own `CLAUDE.md` — its own identity. The Orchestrator's `CLAUDE.md` says *"You are a project manager who decomposes tasks and delegates to specialists."* The Security CLI's `CLAUDE.md` says *"You are a security auditor. You never modify code. You analyze and report."* These are not different prompts sent to the same binary; they are different binaries with different tool sets, different permission boundaries, and different behavioral contracts.

**The `shared/` directory** is the nervous system. All CLIs read from and write to the shared memory store. When the Coder CLI makes an architecture decision, it writes to `shared/memory/decisions.md`. When the Security CLI runs a scan, findings go to `shared/memory/findings.db`. The Orchestrator reads from both to understand the project's current state. The `protocols/` subdirectory defines the JSON schema for inter-CLI messages, ensuring that every CLI speaks the same language. The `config/` subdirectory holds the team-wide configuration — model preferences, cost limits, permission defaults — that all CLIs inherit.

**The `orchestration/` directory** contains the infrastructure that connects CLIs together. The task DAG engine tracks which tasks depend on which, enabling parallel execution of independent work. The message bus provides the communication channel — whether Unix domain sockets, WebSocket, or stdio pipes. The dashboard gives you a web-based view of what every CLI is doing at any moment.

**The `tests/` directory** is not an afterthought. Integration tests verify that the full multi-CLI system works end-to-end. A test scenario might say: *"Given a new Express.js project, the Orchestrator should decompose the work into frontend, backend, and infrastructure tasks, dispatch them to the appropriate CLIs, wait for completion, merge the results, and pass QA validation."* These tests catch regressions that per-CLI unit tests cannot.

---

## 3.3 Building Your First Custom CLI

Theory is cheap. Let us build something real.

We will create a Security CLI — a specialized agent that analyzes codebases for vulnerabilities, audits dependencies, scans for hardcoded secrets, and produces structured security reports. It cannot modify code. It cannot execute arbitrary commands. It reads, analyzes, and reports.

### Step 1: Start from Base

If you are on the TypeScript path, copy the core engine files from your upstream fork — the query loop, tool system, permission framework, and LLM client. If you are on the Rust path, your shared library crate provides these foundations.

```bash
mkdir -p clis/security/src
cd clis/security
```

For Rust, initialize the project:

```bash
cargo init --name security-cli
```

Add dependencies from your shared workspace:

```toml
# clis/security/Cargo.toml
[package]
name = "security-cli"
version = "0.1.0"
edition = "2024"

[dependencies]
forge-core = { path = "../../shared/forge-core" }  # Shared engine
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tree-sitter = "0.24"
tree-sitter-javascript = "0.23"
tree-sitter-python = "0.23"
tree-sitter-rust = "0.23"
anyhow = "1"
async-trait = "0.1"
clap = { version = "4", features = ["derive"] }
rusqlite = { version = "0.32", features = ["bundled"] }
ignore = "0.4"
regex = "1"
```

### Step 2: Strip Irrelevant Tools

The Security CLI does not need the `file_write` tool, the `file_edit` tool, or any tool that modifies the filesystem. It does not need the `bash` tool's full power — only a restricted subset for running analysis commands.

In your tool registry, include only:

- `file_read` — read any file for analysis
- `directory_list` — explore project structure
- `grep_search` — search for patterns across files
- `sast_scan` — your custom static analysis tool
- `dep_audit` — dependency vulnerability checker
- `secret_scan` — hardcoded secret detector
- `threat_model` — STRIDE-based threat analysis generator
- `bash` (restricted) — only allows `grep`, `find`, `semgrep`, `trivy`, `gitleaks`

This is the principle of least privilege applied to AI agents. The Security CLI physically cannot delete your files because the tool does not exist in its binary.

### Step 3: Add Domain Tools

Here is the SAST scanner tool implemented in both languages:

**TypeScript (for the fork path):**

```typescript
// clis/security/src/tools/sast-scanner.ts
import { z } from 'zod';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import type { Tool, ToolContext, ToolResult } from 'forge-core';

interface Finding {
  rule: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  file: string;
  line: number;
  message: string;
  cwe?: string;
}

const PATTERNS: Array<{
  rule: string;
  severity: Finding['severity'];
  pattern: RegExp;
  message: string;
  cwe: string;
  extensions: string[];
}> = [
  {
    rule: 'sql-injection',
    severity: 'critical',
    pattern: /(?:execute|query|raw)\s*\(\s*[`'"].*\$\{/,
    message: 'Possible SQL injection via string interpolation in query',
    cwe: 'CWE-89',
    extensions: ['.ts', '.js', '.py'],
  },
  {
    rule: 'hardcoded-secret',
    severity: 'high',
    pattern: /(?:password|secret|api_key|token)\s*[:=]\s*['"][^'"]{8,}/i,
    message: 'Possible hardcoded secret or credential',
    cwe: 'CWE-798',
    extensions: ['.ts', '.js', '.py', '.rb', '.go', '.rs', '.java'],
  },
  {
    rule: 'path-traversal',
    severity: 'high',
    pattern: /(?:readFile|open|include|require)\s*\([^)]*(?:req\.|input\.|params\.)/,
    message: 'Possible path traversal via unsanitized user input',
    cwe: 'CWE-22',
    extensions: ['.ts', '.js', '.py'],
  },
  {
    rule: 'eval-usage',
    severity: 'critical',
    pattern: /\beval\s*\(/,
    message: 'Use of eval() allows arbitrary code execution',
    cwe: 'CWE-95',
    extensions: ['.ts', '.js', '.py'],
  },
];

export const SASTScanner: Tool = {
  name: 'sast_scan',
  category: 'security',
  description: 'Run static application security testing on source files',
  inputSchema: z.object({
    target: z.string().describe('File or directory to scan'),
    rules: z.array(z.string()).optional()
      .describe('Specific rules to check; omit for all rules'),
    severity_threshold: z.enum(['critical', 'high', 'medium', 'low', 'info'])
      .optional().default('low')
      .describe('Minimum severity to report'),
  }),
  isConcurrencySafe: true,

  async exec(input, context: ToolContext): Promise<ToolResult> {
    const findings: Finding[] = [];
    const files = collectFiles(input.target);
    const activeRules = input.rules
      ? PATTERNS.filter(p => input.rules!.includes(p.rule))
      : PATTERNS;

    for (const filePath of files) {
      const ext = extname(filePath);
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const rule of activeRules) {
        if (!rule.extensions.includes(ext)) continue;
        for (let i = 0; i < lines.length; i++) {
          if (rule.pattern.test(lines[i])) {
            findings.push({
              rule: rule.rule,
              severity: rule.severity,
              file: filePath,
              line: i + 1,
              message: rule.message,
              cwe: rule.cwe,
            });
          }
        }
      }
    }

    const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
    const thresholdIndex = severityOrder.indexOf(input.severity_threshold);
    const filtered = findings.filter(
      f => severityOrder.indexOf(f.severity) <= thresholdIndex
    );
    filtered.sort(
      (a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity)
    );

    return {
      type: 'text',
      text: JSON.stringify({
        scan_target: input.target,
        total_files: files.length,
        total_findings: filtered.length,
        findings: filtered,
      }, null, 2),
    };
  },
};

function collectFiles(target: string): string[] {
  const stat = statSync(target);
  if (stat.isFile()) return [target];
  const results: string[] = [];
  const entries = readdirSync(target, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(target, entry.name);
    if (entry.isDirectory()) results.push(...collectFiles(full));
    else if (entry.isFile()) results.push(full);
  }
  return results;
}
```

**Rust (for the rewrite path):**

```rust
// clis/security/src/tools/sast_scan.rs
use anyhow::{Context, Result};
use async_trait::async_trait;
use ignore::WalkBuilder;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::Path;

use forge_core::{Tool, ToolContext, ToolResult};

pub struct SastScanTool {
    rules: Vec<ScanRule>,
}

#[derive(Debug, Clone, Serialize)]
struct Finding {
    rule: String,
    severity: String,
    file: String,
    line: usize,
    message: String,
    cwe: String,
}

#[derive(Debug, Clone)]
struct ScanRule {
    name: String,
    severity: String,
    pattern: Regex,
    message: String,
    cwe: String,
    extensions: Vec<String>,
}

impl SastScanTool {
    pub fn new() -> Self {
        Self {
            rules: vec![
                ScanRule {
                    name: "sql-injection".into(),
                    severity: "critical".into(),
                    pattern: Regex::new(
                        r#"(?:execute|query|raw)\s*\(\s*[`'"].*\$\{"#
                    ).unwrap(),
                    message: "Possible SQL injection via string interpolation".into(),
                    cwe: "CWE-89".into(),
                    extensions: vec![".ts".into(), ".js".into(), ".py".into()],
                },
                ScanRule {
                    name: "hardcoded-secret".into(),
                    severity: "high".into(),
                    pattern: Regex::new(
                        r#"(?i)(?:password|secret|api_key|token)\s*[:=]\s*['"][^'"]{8,}"#
                    ).unwrap(),
                    message: "Possible hardcoded secret or credential".into(),
                    cwe: "CWE-798".into(),
                    extensions: vec![
                        ".ts".into(), ".js".into(), ".py".into(),
                        ".rs".into(), ".go".into(), ".java".into(),
                    ],
                },
                ScanRule {
                    name: "eval-usage".into(),
                    severity: "critical".into(),
                    pattern: Regex::new(r#"\beval\s*\("#).unwrap(),
                    message: "Use of eval() allows arbitrary code execution".into(),
                    cwe: "CWE-95".into(),
                    extensions: vec![".ts".into(), ".js".into(), ".py".into()],
                },
            ],
        }
    }

    fn scan_file(&self, path: &Path) -> Vec<Finding> {
        let mut findings = Vec::new();
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .map(|e| format!(".{e}"))
            .unwrap_or_default();

        let content = match fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => return findings,
        };

        for rule in &self.rules {
            if !rule.extensions.contains(&ext) {
                continue;
            }
            for (i, line) in content.lines().enumerate() {
                if rule.pattern.is_match(line) {
                    findings.push(Finding {
                        rule: rule.name.clone(),
                        severity: rule.severity.clone(),
                        file: path.display().to_string(),
                        line: i + 1,
                        message: rule.message.clone(),
                        cwe: rule.cwe.clone(),
                    });
                }
            }
        }
        findings
    }
}

#[async_trait]
impl Tool for SastScanTool {
    fn name(&self) -> &str { "sast_scan" }
    fn category(&self) -> &str { "security" }
    fn description(&self) -> &str {
        "Run static application security testing on source files"
    }

    async fn execute(&self, input: Value, _ctx: &ToolContext) -> Result<ToolResult> {
        let target = input["target"].as_str().context("target path required")?;
        let mut all_findings = Vec::new();
        let mut file_count = 0;

        let walker = WalkBuilder::new(target)
            .hidden(true)          // Skip hidden files
            .git_ignore(true)      // Respect .gitignore
            .build();

        for entry in walker.flatten() {
            if entry.file_type().map_or(true, |ft| !ft.is_file()) {
                continue;
            }
            file_count += 1;
            all_findings.extend(self.scan_file(entry.path()));
        }

        // Sort by severity: critical first
        let severity_order = ["critical", "high", "medium", "low", "info"];
        all_findings.sort_by_key(|f| {
            severity_order.iter().position(|s| *s == f.severity).unwrap_or(99)
        });

        let report = serde_json::json!({
            "scan_target": target,
            "total_files": file_count,
            "total_findings": all_findings.len(),
            "findings": all_findings,
        });

        Ok(ToolResult::text(serde_json::to_string_pretty(&report)?))
    }
}
```

Notice how the Rust version uses the `ignore` crate's `WalkBuilder` — the same parallel, gitignore-aware file walker that powers ripgrep. On a large codebase, this scans thousands of files in milliseconds.

### Step 4: Write the CLAUDE.md

The system prompt is the soul of your CLI. It defines not just what the agent can do, but what it believes it is.

```markdown
# Security CLI — System Prompt

You are SecurityCLI, a specialized security analysis agent. You are part of a
multi-CLI team managed by an Orchestrator.

## Identity
- **Role**: Security Guardian
- **Mode**: Read-only analysis. You NEVER modify source code.
- **Output**: Structured findings with severity, CWE references, and remediation.

## Capabilities
You have access to these tools:
- `sast_scan` — Static analysis for code vulnerabilities (SQL injection, XSS, etc.)
- `dep_audit` — Check dependencies for known CVEs via OSV/NVD databases
- `secret_scan` — Detect hardcoded secrets, API keys, tokens in source
- `threat_model` — Generate STRIDE-based threat models for architectures
- `file_read` — Read any file for manual analysis
- `grep_search` — Search for patterns across the codebase
- `bash` (restricted) — Run: grep, find, semgrep, trivy, gitleaks ONLY

## Rules
1. Always report findings with: file path, line number, severity, CWE ID
2. Never suggest "it's probably fine" — if uncertain, flag it as INFO severity
3. Prioritize findings: CRITICAL → HIGH → MEDIUM → LOW → INFO
4. For each finding, provide a one-line remediation suggestion
5. When asked for a full audit, run ALL tools and produce a consolidated report
6. Write findings to shared/memory/findings.db when the Orchestrator requests persistence

## Communication Protocol
When receiving tasks from the Orchestrator, respond with structured JSON:
{
  "status": "complete" | "in_progress" | "blocked",
  "findings_count": { "critical": N, "high": N, "medium": N, "low": N },
  "summary": "One paragraph executive summary",
  "details": [ ...findings array... ]
}
```

### Step 5: Configure Permissions

The permission configuration is where you enforce the principle of least privilege at the system level, not just the prompt level. A well-intentioned LLM might try to "help" by running a risky command. The permission system prevents this regardless of what the LLM attempts.

```toml
# clis/security/.claude/permissions.toml
[permissions]
mode = "strict"

[permissions.tools]
allow = [
  "sast_scan",
  "dep_audit",
  "secret_scan",
  "threat_model",
  "file_read",
  "directory_list",
  "grep_search",
]
deny = [
  "file_write",
  "file_edit",
  "file_delete",
]

[permissions.bash]
allow = ["grep", "find", "wc", "cat", "head", "tail", "semgrep", "trivy", "gitleaks"]
deny = ["rm", "mv", "cp", "dd", "chmod", "curl -X POST", "wget"]

[permissions.network]
allow_outbound = ["https://osv.dev/api/*", "https://nvd.nist.gov/api/*"]
deny_outbound = ["*"]
```

### Step 6: Add Custom Slash Commands

```typescript
// clis/security/src/commands.ts
export const commands = {
  '/audit': {
    description: 'Run full security audit on the current project',
    async handler(_args: string, ctx: CommandContext) {
      const sast = await ctx.invokeTool('sast_scan', { target: '.' });
      const deps = await ctx.invokeTool('dep_audit', { target: '.' });
      const secrets = await ctx.invokeTool('secret_scan', { target: '.' });
      return ctx.format([sast, deps, secrets], 'security-report');
    },
  },
  '/threat': {
    description: 'Generate a STRIDE threat model for the project',
    async handler(args: string, ctx: CommandContext) {
      return ctx.invokeTool('threat_model', {
        scope: args || 'full-application',
      });
    },
  },
  '/cves': {
    description: 'Check all dependencies for known CVEs',
    async handler(_args: string, ctx: CommandContext) {
      return ctx.invokeTool('dep_audit', { target: '.', format: 'table' });
    },
  },
};
```

### Step 7: Test in Isolation

Before connecting any CLI to the multi-agent system, verify it works standalone:

```bash
cd clis/security
cargo build --release

# Test the SAST scanner on a sample project
echo 'const query = `SELECT * FROM users WHERE id = ${req.params.id}`;' > test-vuln.js
./target/release/security-cli --prompt "Scan test-vuln.js for vulnerabilities"

# Expected: finding for sql-injection, CWE-89, line 1
rm test-vuln.js
```

The CLI should identify the SQL injection vulnerability, report its CWE identifier, severity level, file location, and line number. If it does, your Security CLI works as a standalone agent.

### Step 8: Register as MCP Server

The final step connects your Security CLI to the multi-agent ecosystem. By registering it as an MCP (Model Context Protocol) server, other CLIs can invoke its tools programmatically.

```json
{
  "mcpServers": {
    "security-cli": {
      "command": "./clis/security/target/release/security-cli",
      "args": ["--mcp-server"],
      "env": {
        "SECURITY_CLI_MODE": "mcp-server",
        "FINDINGS_DB": "./shared/memory/findings.db"
      }
    }
  }
}
```

When another CLI — say, the Orchestrator — adds this to its MCP configuration, it gains access to all of the Security CLI's tools: `sast_scan`, `dep_audit`, `secret_scan`, and `threat_model`. The Orchestrator does not need to know how these tools are implemented. It invokes them by name and receives structured results.

---

## 3.4 The Build Pipeline

With eight specialized CLIs in the workspace, you cannot afford to build them one at a time. A parallel build pipeline compiles the entire fleet in minutes.

```bash
#!/usr/bin/env bash
# shared/scripts/build-all.sh — Build all CLIs in parallel
set -euo pipefail

FORGE_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLIS=(orchestrator researcher planner coder security validator qa documenter)
FAILED=()
PIDS=()

echo "=== Multi-CLI Forge — Parallel Build ==="
echo "Building ${#CLIS[@]} CLIs from ${FORGE_ROOT}/clis/"
echo ""

for cli in "${CLIS[@]}"; do
    cli_dir="${FORGE_ROOT}/clis/${cli}"
    if [[ ! -d "$cli_dir" ]]; then
        echo "  SKIP  $cli (directory not found)"
        continue
    fi

    echo "  START $cli"
    (
        cd "$cli_dir"
        if [[ -f "Cargo.toml" ]]; then
            cargo build --release 2>&1 | tail -1
        elif [[ -f "package.json" ]]; then
            bun run build 2>&1 | tail -1
        fi
    ) &
    PIDS+=($!)
done

# Wait for all builds and collect failures
for i in "${!PIDS[@]}"; do
    if ! wait "${PIDS[$i]}"; then
        FAILED+=("${CLIS[$i]}")
    fi
done

echo ""
if [[ ${#FAILED[@]} -gt 0 ]]; then
    echo "=== BUILD FAILED ==="
    printf '  FAIL  %s\n' "${FAILED[@]}"
    exit 1
fi

echo "=== All CLIs built successfully ==="
echo ""

# Verify all binaries exist and print versions
for cli in "${CLIS[@]}"; do
    cli_dir="${FORGE_ROOT}/clis/${cli}"
    binary="${cli_dir}/target/release/${cli}-cli"
    if [[ -f "$binary" ]]; then
        version=$("$binary" --version 2>/dev/null || echo "unknown")
        size=$(du -h "$binary" | cut -f1)
        echo "  OK    $cli  ${version}  ${size}"
    elif [[ -f "${cli_dir}/dist/cli.js" ]]; then
        echo "  OK    $cli  (TypeScript)"
    fi
done
```

On a modern machine with 8+ cores, the Rust CLIs compile in parallel — Cargo's build cache means incremental builds take seconds, not minutes. The script collects failures without aborting early, so you see all broken CLIs at once rather than fixing them one at a time.

For CI/CD, wrap this in a GitHub Actions workflow:

```yaml
# .github/workflows/build-all.yaml
name: Build All CLIs
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: "clis/* -> target"
      - name: Build all CLIs
        run: ./shared/scripts/build-all.sh
      - name: Run integration tests
        run: ./shared/scripts/test-integration.sh
```

The `rust-cache` action caches compiled dependencies across CI runs. After the first build, subsequent builds only recompile your code — not the hundreds of dependency crates.

---

## 3.5 Version Control Strategy

A multi-CLI workspace has unique version control challenges. You are managing an upstream dependency (Claude Code), eight independent CLI projects that share code, and an orchestration layer that ties them together.

### Upstream Tracking

Claude Code is pinned as a git submodule at a specific commit. When Anthropic releases updates, you review the changes before updating:

```bash
cd upstream/claude-code
git fetch origin
git log --oneline HEAD..origin/main | head -20  # Review new commits

# If the changes are safe, update the submodule
git checkout origin/main
cd ../..
git add upstream/claude-code
git commit -m "chore: update upstream claude-code to $(cd upstream/claude-code && git rev-parse --short HEAD)"
```

Never blindly update the submodule. Read the changelog. If an upstream change breaks your custom tools or changes the tool interface, handle it in a dedicated branch first.

### Branch Strategy

```
main                    # Stable, tested, deployable
├── develop             # Integration branch
│   ├── cli/security    # Security CLI feature work
│   ├── cli/coder       # Coder CLI feature work
│   ├── feat/message-bus    # Orchestration features
│   └── fix/sast-false-pos  # Bug fixes
```

- **main**: Always builds. Always passes all tests. Tagged with version numbers.
- **develop**: Integration branch where CLI branches merge. Integration tests run here.
- **cli/\***: Per-CLI branches for isolated development.
- **feat/\***: Cross-cutting features (shared libraries, orchestration changes).
- **fix/\***: Bug fixes, branched from `main` for hotfixes or `develop` for non-urgent fixes.

### Shared Library Management

Common code — the tool interface, message types, configuration structs, LLM client — lives in a shared library. For Rust, this is a workspace crate:

```toml
# Cargo.toml (workspace root)
[workspace]
members = [
    "shared/forge-core",
    "clis/orchestrator",
    "clis/researcher",
    "clis/planner",
    "clis/coder",
    "clis/security",
    "clis/validator",
    "clis/qa",
    "clis/documenter",
]

[workspace.dependencies]
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
anyhow = "1"
async-trait = "0.1"
```

Each CLI's `Cargo.toml` references the shared crate:

```toml
[dependencies]
forge-core = { path = "../../shared/forge-core" }
```

When you change the shared library, every CLI that depends on it is automatically recompiled. The Cargo workspace ensures version consistency — all CLIs use the same version of every dependency.

For TypeScript, the equivalent is an npm workspace with a `packages/forge-core/` shared package.

### Versioning

All CLIs share a single version number, defined in the workspace root and released together. This is a deliberate choice: it means the Orchestrator version 1.3.0 is always tested against Security CLI version 1.3.0. You never have to wonder whether a communication failure is caused by a version mismatch.

```bash
# shared/scripts/release.sh
VERSION="$1"
if [[ -z "$VERSION" ]]; then
    echo "Usage: release.sh <version>"
    exit 1
fi

# Update all Cargo.toml versions
for toml in clis/*/Cargo.toml shared/*/Cargo.toml; do
    sed -i '' "s/^version = \".*\"/version = \"${VERSION}\"/" "$toml"
done

git add -A
git commit -m "release: v${VERSION}"
git tag "v${VERSION}"
```

---

## 3.6 Configuration Hierarchy

A multi-CLI system needs a configuration system that is both unified (shared settings apply everywhere) and specialized (each CLI has its own overrides). The four-layer hierarchy solves this:

**Layer 1: Compiled defaults** — hardcoded in the binary, always present.
**Layer 2: Team configuration** — `shared/config/team.toml`, applies to all CLIs.
**Layer 3: CLI-specific configuration** — `clis/<name>/config.toml`, overrides team settings.
**Layer 4: Runtime overrides** — environment variables and CLI flags, highest priority.

```toml
# shared/config/team.toml — Layer 2: applies to ALL CLIs
[shared]
memory_path = "shared/memory"
message_bus = "unix:///var/run/multicli.sock"
log_level = "info"

[models]
default = "claude-sonnet-4"
expensive = "claude-opus-4.6"
fast = "claude-haiku-4.5"

[cost]
max_per_session = 5.00
max_per_task = 2.00
warn_threshold = 0.80  # Warn at 80% of limit

[orchestration]
max_parallel_agents = 4
task_timeout_seconds = 300
retry_on_failure = true
max_retries = 2
```

```toml
# clis/security/config.toml — Layer 3: Security CLI specific
[identity]
name = "SecurityCLI"
role = "security-guardian"

[tools]
enabled = [
  "sast_scan",
  "dep_audit",
  "secret_scan",
  "threat_model",
  "file_read",
  "directory_list",
  "grep_search",
]
disabled = ["file_write", "file_edit", "file_delete"]

[permissions]
mode = "strict"

[permissions.bash]
allow = ["grep", "find", "wc", "cat", "head", "tail", "semgrep", "trivy", "gitleaks"]
deny = ["rm", "mv", "cp", "dd", "chmod", "chown"]

[memory]
shared_topics = [
  "project-context",
  "architecture-decisions",
  "security-findings",
]
private_topics = [
  "vulnerability-patterns",
  "false-positive-cache",
]

[reporting]
output_format = "json"
severity_threshold = "low"
include_cwe = true
include_remediation = true
```

In Rust, Figment merges these layers with three lines of code:

```rust
use figment::{Figment, providers::{Toml, Env, Serialized}};

let config: AppConfig = Figment::new()
    .merge(Serialized::defaults(AppConfig::default()))  // Layer 1
    .merge(Toml::file("../../shared/config/team.toml")) // Layer 2
    .merge(Toml::file("config.toml"))                   // Layer 3
    .merge(Env::prefixed("SECURITY_CLI_"))               // Layer 4
    .extract()?;
```

A team member who wants to override the model for a single run simply sets an environment variable:

```bash
SECURITY_CLI_MODELS_DEFAULT=claude-opus-4.6 ./security-cli --prompt "Deep audit of auth module"
```

The `models.default` setting from Layer 2 is overridden by the environment variable in Layer 4. No configuration file is modified. No command-line flag is needed. The environment variable follows the convention: prefix (`SECURITY_CLI_`), section (`MODELS_`), key (`DEFAULT`).

---

## 3.7 The "Hello Multi-CLI" Test

Every system needs a smoke test — the simplest possible proof that the pieces connect and communicate. For a multi-CLI system, that means: start two CLIs, send a task from one to the other, and verify the result flows back.

We will use the Orchestrator and Coder CLIs. The Orchestrator receives a human prompt, decomposes it into a task, dispatches it to the Coder, and presents the result.

### Step 1: Prepare the Coder CLI

The Coder CLI needs to run as an MCP server — a process that listens on stdio for JSON-RPC messages and responds with tool results.

```bash
# Terminal 1: Start the Coder CLI in MCP server mode
cd clis/coder
./target/release/coder-cli --mcp-server
```

In MCP server mode, the CLI does not show a TUI. It reads JSON-RPC requests from stdin and writes responses to stdout. The protocol is defined by the Model Context Protocol specification: `initialize`, `tools/list`, `tools/call`, and `resources/read` are the core methods.

When started, the Coder CLI advertises its tools:

```json
{
  "tools": [
    { "name": "file_write", "description": "Create or overwrite a file" },
    { "name": "file_edit", "description": "Make targeted edits to a file" },
    { "name": "bash", "description": "Execute a shell command" },
    { "name": "grep_search", "description": "Search files for a pattern" }
  ]
}
```

### Step 2: Configure the Orchestrator

The Orchestrator's MCP configuration tells it how to connect to the Coder CLI:

```json
{
  "mcpServers": {
    "coder": {
      "command": "./clis/coder/target/release/coder-cli",
      "args": ["--mcp-server"],
      "env": {
        "CODER_CLI_SHARED_MEMORY": "./shared/memory"
      }
    }
  }
}
```

When the Orchestrator starts, it spawns the Coder CLI as a child process, performs the MCP handshake, and discovers its tools. From the Orchestrator's perspective, the Coder's tools are now available alongside its own.

### Step 3: Start the Orchestrator

```bash
# Terminal 2: Start the Orchestrator
cd clis/orchestrator
./target/release/orchestrator-cli
```

The Orchestrator's `CLAUDE.md` tells it to decompose tasks and delegate to specialized CLIs:

```markdown
You are the Orchestrator — a project manager for a team of specialized CLI agents.

When you receive a task:
1. Decompose it into subtasks appropriate for each specialist
2. Dispatch subtasks using MCP tool calls to the appropriate CLI
3. Monitor progress and collect results
4. Synthesize the final response from all specialists' output

Available specialists:
- **coder** (via MCP): file_write, file_edit, bash, grep_search
- **security** (via MCP): sast_scan, dep_audit, secret_scan, threat_model

Always delegate coding tasks to the coder. Never write code yourself.
```

### Step 4: Send the Test Prompt

In the Orchestrator's terminal, type:

```
Create a hello world Express.js API with a /health endpoint that returns { "status": "ok" }
```

### Step 5: Watch the Delegation

The Orchestrator processes this prompt through its LLM, which recognizes it as a coding task. Following its system prompt, it delegates to the Coder CLI via MCP:

```
Orchestrator → LLM: "User wants an Express API. I should delegate to the coder."
Orchestrator → Coder (MCP tool_call): file_write("package.json", "...")
Coder → Orchestrator (MCP result): { "success": true, "path": "package.json" }
Orchestrator → Coder (MCP tool_call): file_write("server.js", "...")
Coder → Orchestrator (MCP result): { "success": true, "path": "server.js" }
Orchestrator → Coder (MCP tool_call): bash("npm install")
Coder → Orchestrator (MCP result): { "stdout": "added 64 packages..." }
```

Each arrow represents a JSON-RPC message over the stdio pipe connecting the two processes. The Orchestrator makes decisions; the Coder executes them.

### Step 6: Verify the Result

The Orchestrator synthesizes the Coder's outputs and presents the result to you:

```
✓ Created package.json with Express dependency
✓ Created server.js with /health endpoint
✓ Installed dependencies (64 packages)

The Express API is ready. Run `node server.js` and test:
  curl http://localhost:3000/health
  → { "status": "ok" }
```

Verify it actually works:

```bash
cd test-project
node server.js &
sleep 2
curl -s http://localhost:3000/health | python3 -m json.tool
kill %1
```

Expected output:

```json
{
    "status": "ok"
}
```

### What You Just Proved

This simple test validated several critical properties of your multi-CLI system:

1. **Process isolation**: The Coder CLI runs as a separate process with its own memory space. If it crashes, the Orchestrator survives.
2. **MCP communication**: Tool calls flow over JSON-RPC stdio pipes — the standard protocol that any MCP-compatible client can use.
3. **Delegation**: The Orchestrator's LLM correctly identified the task type and delegated to the appropriate specialist.
4. **Tool bridging**: The Coder's tools (`file_write`, `bash`) were accessible to the Orchestrator as if they were its own.
5. **Result synthesis**: The Orchestrator collected multiple tool results and presented a coherent summary.

This is the nucleus of your multi-CLI system. Every feature you build from here — the task DAG, the shared memory, the security audit pipeline, the parallel execution engine — is an extension of this basic pattern: one CLI dispatches work to another, and the results flow back.

---

## Summary

You now have a working development forge. The workspace is structured, the build system compiles all CLIs in parallel, the configuration hierarchy merges four layers cleanly, and the version control strategy keeps upstream updates separate from your customizations.

More importantly, you have two CLIs communicating. The Orchestrator delegates to the Coder over MCP, and the results flow back. This is not a diagram or an aspiration — it is a running system on your machine.

In Chapter 4, we will replace the ad-hoc delegation with a proper orchestration engine: a task DAG that decomposes work into parallel tracks, a message bus that routes results between CLIs, and a dashboard that shows you what every agent is doing in real time. The two-CLI system becomes an eight-CLI team, and the forge begins to produce real work.

But first, commit what you have built. Tag it `v0.1.0`. The forge is open.
