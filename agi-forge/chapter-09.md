# Chapter 9: The Coder CLI — The Builder

---

There is a reason every engineering team has more builders than architects. Architecture without implementation is a blueprint gathering dust. Planning without execution is a meeting that should have been an email. Research without code is an academic paper that ships nothing.

The Coder CLI is the builder. When the Orchestrator decomposes a task, when the Planner produces a dependency graph, when the Research CLI delivers the knowledge required to proceed — it is the Coder that opens files, writes code, runs tests, and commits the result. It is the most tool-heavy CLI in the system. It interacts with the filesystem more than any other specialist. It executes more bash commands, triggers more test runs, and generates more git commits than the other seven CLIs combined.

This chapter is about building a CLI that writes code the way a senior engineer writes code — with discipline. Not the fastest possible path to a green test, but the most reliable. Write a failing test first. Implement the minimum code to pass it. Refactor. Verify. Commit with a message that explains *why*, not just *what*. The Coder CLI doesn't just generate code. It engineers software.

---

## 9.1 The Tool Arsenal — What the Coder Wields

A human developer has a text editor, a terminal, a file browser, a debugger, and a version control client. The Coder CLI has the equivalent of all five, exposed as structured tool calls that the LLM can invoke within the agentic loop. Understanding these tools — their capabilities, their constraints, their performance characteristics — is foundational to building a CLI that uses them effectively.

### File Operations: Read, Write, Edit

The Coder CLI's most frequent operations are file reads and writes. Claude Code implements these as three distinct tools, each optimized for a different access pattern.

**FileReadTool** is the eyes. It reads a file from disk and returns the contents to the model's context window. But it is not a naive `cat` — it handles PDF extraction with page range parsing, image resizing with token-aware compression, Jupyter notebook cell mapping, and intelligent encoding detection. It blocks dangerous device files (`/dev/zero`, `/dev/random`) and respects permission boundaries. For a Coder CLI, the critical behavior is line-numbered output — every file read returns content with line numbers prefixed, enabling the model to reference specific locations in subsequent edits.

```typescript
// FileReadTool output schema
{
  filePath: string,
  content: string,        // Line-numbered content
  encoding: string,       // Detected file encoding
  structuredPatch?: Patch  // Optional diff context
}
```

**FileWriteTool** creates new files or overwrites existing ones entirely. It returns a before/after diff via `structuredPatch`, integrates with git diff tracking through `fetchSingleFileGitDiff`, clears stale LSP diagnostics for the affected file, and notifies connected IDE instances of the change. For the Coder CLI, this is the tool for generating new files — new modules, new test files, new configuration. It is not the right tool for modifying existing code, because overwriting an entire file when you only need to change three lines is wasteful and error-prone.

**FileEditTool** is the surgical instrument. It performs in-place string replacement — find `old_string`, replace with `new_string`. This is the tool the Coder CLI uses most frequently, because most coding work is modification, not creation. The implementation preserves original line endings, detects and maintains file encoding, tracks edit history for undo support, and validates that the file has not been modified externally since the last read. That last feature — unexpected modification detection — is critical in a multi-CLI system where another specialist might be editing the same file.

```typescript
// FileEditTool input schema
{
  file_path: string,
  old_string: string,     // Exact text to find
  new_string: string,     // Replacement text
  replace_all?: boolean   // Replace all occurrences (default: first only)
}
```

The `replace_all` flag enables batch renaming within a single file — change every occurrence of `UserManager` to `UserService` in one tool call instead of fourteen sequential edits. But it requires confidence that every occurrence should change, which is why the Coder CLI typically reads the file first, verifies the occurrences, and only then applies `replace_all`.

**The Multi-Edit Pattern.** Claude Code does not expose a separate "MultiEdit" tool. Instead, the pattern for batch edits across a single file is sequential FileEditTool calls, each with a different `old_string`/`new_string` pair. Each call validates file state with `checkUnexpectedlyModifiedError`, which means the file is re-read between edits to catch external modifications. This is intentionally conservative. In a multi-CLI system, another agent might modify the same file between your edits, and silent conflicts are worse than a detected collision and retry.

### Glob and Grep: Finding What You Need

Before you edit, you must find. The Coder CLI uses two discovery tools that map directly to the operations every developer performs unconsciously.

**GlobTool** finds files by name pattern. Need every TypeScript test file in the project? `**/*.test.ts`. Need all migration files? `src/db/migrations/*.sql`. The implementation wraps a glob library with a default result limit of 100 files, returns a truncation flag when results exceed the limit, relativizes paths under the current working directory to save context tokens, and is marked `isConcurrencySafe: true` — meaning it can run in parallel with other glob or grep operations without contention.

**GrepTool** searches file contents using ripgrep, the same regex-powered search engine that powers VS Code's search functionality. It supports multiple output modes — `content` (matching lines with context), `files_with_matches` (just file paths), and `count` (match counts per file). It supports context lines before and after matches, case-insensitive search, file type filtering, multiline regex, and a configurable head limit that defaults to 250 lines to prevent context bloat.

```typescript
// GrepTool input — find all JWT references in TypeScript files
{
  pattern: "jwt|JsonWebToken|Bearer",
  path: "src/",
  glob: "*.ts",
  output_mode: "content",
  "-n": true,              // Line numbers
  "-i": true,              // Case insensitive
  "-C": 2                  // 2 lines context before and after
}
```

The grep tool's VCS exclusion list automatically skips `.git`, `.svn`, `.hg`, `.bzr`, `.jj`, and `.sl` directories. The ripgrep binary itself is bundled within the Claude Code distribution to prevent PATH hijacking attacks — a security consideration that matters when the Coder CLI operates autonomously.

The discovery-then-edit pattern is the Coder CLI's most common workflow: grep to find every file containing a pattern, glob to enumerate every file matching a name, then sequential edit calls to modify each one. The efficiency of this pattern depends entirely on the specificity of the initial search.

### Bash: The Universal Tool

The BashTool is the Coder CLI's escape hatch — anything that cannot be accomplished through structured file operations is accomplished through shell commands. Running tests. Installing dependencies. Starting development servers. Compiling code. Checking git status. Creating branches. Pushing commits.

The implementation is significantly more sophisticated than a raw `child_process.exec`. It supports foreground execution (synchronous, 30-minute timeout), background execution (asynchronous, returning a `shellId` for monitoring), command classification that determines UI collapse behavior, and a security system with 23 numbered checks that block shell metacharacter injection, command substitution attacks, IFS manipulation, and obfuscated flags.

```typescript
// Command classification — determines UI behavior
const BASH_SEARCH_COMMANDS = new Set([
  'find', 'grep', 'rg', 'ag', 'ack', 'locate', 'which', 'whereis'
])
const BASH_READ_COMMANDS = new Set([
  'cat', 'head', 'tail', 'less', 'more', 'jq', 'awk', 'cut', 'sort', 'uniq', 'tr'
])
const BASH_SILENT_COMMANDS = new Set([
  'mv', 'cp', 'rm', 'mkdir', 'rmdir', 'chmod', 'touch', 'ln', 'cd'
])
```

For the Coder CLI, the Bash tool's most critical feature is **git operation tracking**. Every git command — commit, push, merge, rebase, cherry-pick, PR creation — is parsed from the command string and stdout using regex patterns. The system extracts commit SHAs, branch names, and PR URLs, fires analytics events, and increments telemetry counters. This tracking is not cosmetic. In a multi-CLI system, the Orchestrator needs to know when the Coder has committed, what SHA was produced, and which branch was pushed — and this information flows back through the tool result.

```typescript
// Git operation detection
const GIT_COMMIT_RE = gitCmdRe('commit')
const GIT_PUSH_RE = gitCmdRe('push')
const GH_PR_ACTIONS = [
  { re: /\bgh\s+pr\s+create\b/, action: 'created', op: 'pr_create' },
  // ... merge, comment, close, ready
]
```

---

## 9.2 The StreamingToolExecutor — Parallel Execution

Traditional agent loops are sequential: the model generates a response, the response contains tool calls, the runtime executes the tools, the results are appended to the conversation, the model generates the next response. Each tool call blocks the next. If the model requests five file reads, they execute one at a time.

Claude Code breaks this model with the `StreamingToolExecutor` — a system that executes tools *as they appear in the streaming response*, not after the complete response is received. This is the single most important performance optimization in the tool system, and the Coder CLI inherits it directly.

### How Streaming Execution Works

The executor maintains a list of tracked tools, each with a lifecycle state:

```typescript
type TrackedTool = {
  id: string
  block: ToolUseBlock
  assistantMessage: AssistantMessage
  status: 'queued' | 'executing' | 'completed' | 'yielded'
  isConcurrencySafe: boolean
  promise?: Promise<void>
  results?: Message[]
}
```

When a tool use block appears in the streaming response, the executor calls `addTool()`, which immediately evaluates whether the tool can execute based on concurrency rules:

1. **Concurrent-safe tools** (file reads, glob, grep, web fetch) can run in parallel with other concurrent-safe tools. If four file reads appear in the stream, all four start executing simultaneously.

2. **Non-concurrent tools** (file writes, bash, edit) require exclusive access. They wait until all currently executing tools complete before starting.

```typescript
private canExecuteTool(isConcurrencySafe: boolean): boolean {
  const executingTools = this.tools.filter(t => t.status === 'executing')
  return (
    executingTools.length === 0 ||
    (isConcurrencySafe && executingTools.every(t => t.isConcurrencySafe))
  )
}
```

The result ordering is deterministic: results are yielded in the order tools were received, regardless of completion order. If tool B finishes before tool A, tool B's results wait until tool A's results are yielded first. This preserves the model's expectation that tool results correspond to tool calls in order.

### Error Cascading

Not all tool failures are equal. The streaming executor implements asymmetric error cascading:

- **Bash errors abort sibling tasks.** If a bash command fails, all other currently executing tools are cancelled via the `siblingAbortController`. The reasoning: bash commands often have implicit dependencies on each other (install dependencies, then build), and allowing siblings to continue after a bash failure produces confusing, misleading results.

- **Read/fetch errors do not cascade.** If one file read fails (file not found), other concurrent reads continue unaffected. A missing file does not invalidate the contents of the files that do exist.

```typescript
if (isErrorResult) {
  if (tool.block.name === BASH_TOOL_NAME) {
    this.hasErrored = true
    this.siblingAbortController.abort('sibling_error')
  }
}
```

This design decision is directly relevant to the Coder CLI. When the model requests five file reads and a bash command in a single response, the reads execute in parallel while the bash command waits for exclusive access. If one read fails, the others complete. If the bash command fails, everything stops. This matches the intuition of a developer: if `cat package.json` fails, you still want `cat tsconfig.json` to succeed, but if `npm install` fails, there's no point running `npm test`.

### Why This Matters for the Coder CLI

The Coder CLI generates more tool calls per turn than any other specialist. A typical implementation turn might include: read the existing module → read the test file → grep for related imports → read the type definitions → then edit the module, edit the test file, and run the tests. Without streaming execution, those four reads happen sequentially — four round trips. With streaming execution, they happen in parallel — one round trip. The Coder CLI is four times faster at information gathering because of this single architectural decision.

When building your Coder CLI, preserve this behavior. Do not regress to sequential tool execution. The performance difference is not marginal — it is the difference between a CLI that feels responsive and one that feels broken.

---

## 9.3 Code Intelligence — LSP and Tree-Sitter

A developer does not write code by reading files as flat text. They navigate code through symbols — functions, classes, types, imports. They jump to definitions. They find all references. They rename a function and expect every call site to update. The Coder CLI needs this same intelligence, and it achieves it through two complementary systems: the Language Server Protocol (LSP) for live, project-aware analysis, and tree-sitter for fast, offline AST parsing.

### LSP Integration

Claude Code includes a built-in LSP client that connects to language servers running in the project environment. The LSPTool exposes nine operations that the model can invoke:

```typescript
operation: z.enum([
  'goToDefinition',       // Jump to where a symbol is defined
  'findReferences',       // Find all uses of a symbol
  'hover',                // Get type information and documentation
  'documentSymbol',       // List all symbols in a file
  'workspaceSymbol',      // Search symbols across the project
  'goToImplementation',   // Find concrete implementations of an interface
  'prepareCallHierarchy', // Analyze call chains
  'incomingCalls',        // Who calls this function?
  'outgoingCalls',        // What does this function call?
])
```

Each operation takes a file path and a cursor position (line and character, both 1-based), and returns structured results. The LSP manager follows a singleton pattern with explicit initialization states — `not-started`, `pending`, `success`, `failed` — and the tool is only available when the LSP is successfully connected. A diagnostic registry tracks diagnostics per file and clears them when files are written, preventing stale error reports from polluting the model's context.

For the Coder CLI, LSP integration transforms refactoring from a brute-force grep-and-replace operation into a semantic operation. Instead of grepping for `getUserById` and hoping you catch every reference (what about `user.getUserById`? What about the re-export in `index.ts`? What about the type definition that uses it as a callback parameter?), you invoke `findReferences` on the symbol and get every reference in the project, regardless of how it's accessed.

Consider renaming a function across a codebase. Without LSP:

```
Step 1: grep -rn "getUserById" src/ → 14 matches
Step 2: Manually review each match — some are comments, some are string literals
Step 3: Edit each file, hope you didn't miss any
Step 4: Run tests, discover you missed the re-export in index.ts
Step 5: Fix the missed reference, run tests again
```

With LSP:

```
Step 1: findReferences("getUserById", "src/users.ts", line 42, char 17) → 14 references
Step 2: Every reference is a precise location — file, line, character range
Step 3: Edit each reference with exact positions
Step 4: Run tests — they pass on the first try
```

The difference is not just speed. It is correctness. The LSP understands the language's semantics. It knows that `getUserById` in a comment is not a reference. It knows that `this.getUserById()` in a subclass *is* a reference. It knows that `type Fetcher = typeof getUserById` is a reference even though the function is never called. Grep operates on text. LSP operates on meaning.

### Tree-Sitter Code Intelligence

LSP requires a running language server, which requires the project's dependencies to be installed and its build system to be functional. Tree-sitter provides a complementary capability: fast, dependency-free AST parsing that works on raw source files without any project context.

The RCode implementation demonstrates how to build a production-grade tree-sitter integration supporting five languages. The `CodeIntel` struct initializes language-specific parsers:

```rust
pub struct CodeIntel {
    parsers: HashMap<String, tree_sitter::Parser>,
}

// Supported grammars
let languages: &[(&str, tree_sitter::Language)] = &[
    ("rust",       tree_sitter_rust::LANGUAGE.into()),
    ("python",     tree_sitter_python::LANGUAGE.into()),
    ("javascript", tree_sitter_javascript::LANGUAGE.into()),
    ("typescript", tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()),
    ("go",         tree_sitter_go::LANGUAGE.into()),
];
```

File extensions are mapped to languages — `.rs` for Rust, `.py` and `.pyi` for Python, `.js`, `.jsx`, `.mjs`, `.cjs` for JavaScript, `.ts` and `.tsx` for TypeScript, `.go` for Go. The parser takes raw source text and produces an immutable AST that can be walked recursively.

The core parsing pipeline:

```rust
pub fn parse_source(&mut self, source: &str, language: &str) -> Result<Vec<Symbol>> {
    let parser = self.parsers.get_mut(language)?;
    let tree = parser.parse(source, None)
        .context("tree-sitter parse failed")?;
    let root = tree.root_node();
    let src = source.as_bytes();
    
    let mut symbols = Vec::new();
    Self::walk_node(root, src, language, &mut symbols, None);
    Ok(symbols)
}
```

Each extracted symbol carries rich metadata:

```rust
pub struct Symbol {
    pub name: String,
    pub kind: SymbolKind,          // Function, Method, Class, Struct, Enum, etc.
    pub line: usize,               // 1-based start line
    pub end_line: usize,           // 1-based end line
    pub signature: Option<String>, // Full function signature
    pub doc_comment: Option<String>,
    pub parent_name: Option<String>, // For methods: the owning class/struct
    pub children: Vec<Symbol>,
}
```

The AST walking is language-specific. Each language has its own extraction function that maps tree-sitter node types to `Symbol` instances. For Python, a `function_definition` node becomes a `Function` or `Method` (depending on whether its grandparent is a `class_definition`). For Rust, a `function_item` inside an `impl_item` becomes a `Method`. For TypeScript, a `lexical_declaration` containing an `arrow_function` becomes a `Function` — recognizing that `const handler = async (req, res) => { ... }` is a function definition, not a variable assignment.

The parent tracking is particularly sophisticated. When the walker encounters a class or impl block, it propagates the parent name to all child symbols:

```rust
let new_parent = match language {
    "rust" if node.kind() == "impl_item" => 
        Self::rust_impl_type_name(node, src),
    "python" if node.kind() == "class_definition" => 
        node.child_by_field_name("name").map(|n| Self::node_text(n, src)),
    "javascript" | "typescript" if node.kind() == "class_declaration" =>
        node.child_by_field_name("name").map(|n| Self::node_text(n, src)),
    _ => None,
};
```

This means the Coder CLI can ask "what methods does the `AuthService` class have?" and get a precise answer without loading the entire file into context — tree-sitter parses the AST, extracts symbols with parent annotations, and returns only the relevant methods.

### When to Use Which

LSP and tree-sitter serve different purposes, and the Coder CLI should use both:

| Scenario | Tool | Why |
|---|---|---|
| Rename a symbol across the project | LSP `findReferences` | Semantic accuracy — catches re-exports, type references |
| List all functions in a file before editing | Tree-sitter `parse_source` | Fast, no project setup required |
| Find the definition of an imported function | LSP `goToDefinition` | Follows import chains across files |
| Generate a module dependency map | Tree-sitter import extraction | Parses every file independently, no server needed |
| Check for type errors after an edit | LSP diagnostics | Real-time compiler-level analysis |
| Extract function signatures for documentation | Tree-sitter `Symbol.signature` | Batch processing, no server needed |

The key insight: tree-sitter is fast and self-contained but operates on individual files without cross-file context. LSP is slower and requires a running server but understands the entire project as a connected graph. The Coder CLI uses tree-sitter for discovery and LSP for precision.

---

## 9.4 A Complete Scenario — From Assignment to Commit

Theory becomes engineering only when it survives contact with reality. Let us walk through a complete scenario: the Orchestrator dispatches a task to the Coder CLI, and the Coder executes it from start to finish. The task: **implement JWT authentication middleware for an Express.js application**.

### Step 1: Receive the Task Assignment

The Orchestrator sends a structured task object through the inter-CLI communication protocol established in Chapter 5:

```json
{
  "task_id": "task-0042",
  "type": "implement",
  "title": "JWT Authentication Middleware",
  "description": "Create Express middleware that validates JWT tokens from the Authorization header. Support RS256 algorithm. Return 401 for missing/invalid tokens. Attach decoded payload to req.user.",
  "dependencies": ["task-0038"],
  "artifacts": {
    "task-0038": {
      "type": "schema",
      "path": "src/types/auth.ts",
      "description": "User and JWTPayload type definitions"
    }
  },
  "constraints": {
    "branch_prefix": "feat/",
    "test_required": true,
    "lint_required": true
  }
}
```

The Coder CLI parses this assignment and immediately understands: this is an implementation task with a dependency on existing type definitions. The types have already been created by a previous task. Tests are mandatory. A feature branch is required.

### Step 2: Create the Feature Branch

The Coder's first action is git hygiene. Never work on the default branch.

```bash
git checkout -b feat/jwt-auth-middleware
```

The branch name follows the convention specified in `constraints.branch_prefix`. The Coder CLI's CLAUDE.md template (shown later in this chapter) codifies this: feature branches start with `feat/`, bug fixes with `fix/`, refactors with `refactor/`. This is not a suggestion — it is a rule enforced by the system prompt.

### Step 3: Read the Dependency Artifacts

Before writing any code, the Coder reads what already exists. The task's `artifacts` section identifies the type definitions produced by the previous task:

```
Read src/types/auth.ts → 
  export interface JWTPayload {
    sub: string
    email: string
    roles: string[]
    iat: number
    exp: number
  }
  
  export interface AuthenticatedRequest extends Request {
    user: JWTPayload
  }
```

The Coder also discovers the project structure through targeted searches:

```
Glob "src/middleware/*.ts" → [src/middleware/cors.ts, src/middleware/rateLimit.ts]
Grep "express" package.json → "express": "^4.18.2"
Grep "jsonwebtoken\|jose\|jwt" package.json → (no matches)
```

These three tool calls execute in parallel via the StreamingToolExecutor — one glob and two greps, all concurrent-safe. The results tell the Coder: there is an existing middleware directory with a naming convention, the project uses Express 4, and no JWT library is installed yet.

### Step 4: Write the Failing Test First

This is the discipline. The Coder CLI does not jump to implementation. It writes a test that describes the expected behavior, runs it, confirms it fails, and only then writes the code to make it pass.

```typescript
// src/middleware/__tests__/jwtAuth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'
import { jwtAuth } from '../jwtAuth'

describe('jwtAuth middleware', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction

  beforeEach(() => {
    mockReq = { headers: {} }
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }
    mockNext = vi.fn()
  })

  it('returns 401 when Authorization header is missing', async () => {
    await jwtAuth(mockReq as Request, mockRes as Response, mockNext)

    expect(mockRes.status).toHaveBeenCalledWith(401)
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Authorization header required',
    })
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('returns 401 when token format is invalid', async () => {
    mockReq.headers = { authorization: 'InvalidFormat' }
    await jwtAuth(mockReq as Request, mockRes as Response, mockNext)

    expect(mockRes.status).toHaveBeenCalledWith(401)
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('returns 401 when token is expired', async () => {
    const expiredToken = createExpiredToken()
    mockReq.headers = { authorization: `Bearer ${expiredToken}` }
    await jwtAuth(mockReq as Request, mockRes as Response, mockNext)

    expect(mockRes.status).toHaveBeenCalledWith(401)
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('expired') })
    )
  })

  it('attaches decoded payload to req.user on valid token', async () => {
    const validToken = createValidToken({ sub: 'user-1', roles: ['admin'] })
    mockReq.headers = { authorization: `Bearer ${validToken}` }
    await jwtAuth(mockReq as Request, mockRes as Response, mockNext)

    expect(mockNext).toHaveBeenCalled()
    expect((mockReq as any).user).toEqual(
      expect.objectContaining({ sub: 'user-1', roles: ['admin'] })
    )
  })
})
```

The Coder writes this file using FileWriteTool (it's a new file), then runs the test:

```bash
npx vitest run src/middleware/__tests__/jwtAuth.test.ts
```

The test fails. The module `../jwtAuth` does not exist. This is the correct failure — it confirms the test is real, not a tautology. The red phase of red-green-refactor is complete.

### Step 5: Install Dependencies and Implement

The Coder now installs the JWT library and creates the implementation:

```bash
npm install jose
npm install -D @types/express
```

Then creates the middleware:

```typescript
// src/middleware/jwtAuth.ts
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { Request, Response, NextFunction } from 'express'
import { JWTPayload, AuthenticatedRequest } from '../types/auth'

const JWKS_URI = process.env.JWKS_URI
if (!JWKS_URI) {
  throw new Error('JWKS_URI environment variable is required')
}

const jwks = createRemoteJWKSet(new URL(JWKS_URI))

export async function jwtAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    res.status(401).json({ error: 'Authorization header required' })
    return
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({ error: 'Invalid authorization format. Use: Bearer <token>' })
    return
  }

  const token = parts[1]

  try {
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ['RS256'],
    })

    ;(req as AuthenticatedRequest).user = {
      sub: payload.sub as string,
      email: payload.email as string,
      roles: (payload.roles as string[]) || [],
      iat: payload.iat as number,
      exp: payload.exp as number,
    }

    next()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token validation failed'
    res.status(401).json({ error: message })
  }
}
```

### Step 6: Run the Tests — Green Phase

```bash
npx vitest run src/middleware/__tests__/jwtAuth.test.ts
```

The tests pass. Four green checks. The implementation satisfies every test case: missing header returns 401, invalid format returns 401, expired token returns 401 with an appropriate message, valid token attaches the decoded payload to `req.user` and calls `next()`.

### Step 7: Lint and Type-Check

The Coder does not commit code that fails lint or type checks. These are sequential bash commands, each gated on the success of the previous:

```bash
npx eslint src/middleware/jwtAuth.ts src/middleware/__tests__/jwtAuth.test.ts
npx tsc --noEmit
```

Both pass. The code is clean.

### Step 8: Commit with Intent

The commit message follows the imperative mood convention and explains *why*, not just *what*:

```bash
git add src/middleware/jwtAuth.ts src/middleware/__tests__/jwtAuth.test.ts package.json package-lock.json
git commit -m "feat: add JWT auth middleware with RS256 validation

Implement Express middleware that:
- Validates Bearer tokens from Authorization header
- Verifies signatures using remote JWKS endpoint (RS256)
- Attaches decoded payload to req.user
- Returns 401 with descriptive errors for missing/invalid/expired tokens

Uses jose library instead of jsonwebtoken for modern JWKS support.
Includes 4 test cases covering all error and success paths.

Closes task-0042"
```

Note the specificity. Not `git add .` — specific files are staged. The commit message has a title line, a body explaining the implementation choices, and a reference to the task ID. The git operation tracking system parses this commit, extracts the SHA, and includes it in the tool result that flows back to the Orchestrator.

### Step 9: Report Completion

The Coder CLI reports back to the Orchestrator with a structured result:

```json
{
  "task_id": "task-0042",
  "status": "completed",
  "branch": "feat/jwt-auth-middleware",
  "commit_sha": "a7f3b2e",
  "files_changed": [
    "src/middleware/jwtAuth.ts",
    "src/middleware/__tests__/jwtAuth.test.ts",
    "package.json",
    "package-lock.json"
  ],
  "test_results": {
    "total": 4,
    "passed": 4,
    "failed": 0
  },
  "lint_status": "clean",
  "type_check_status": "clean"
}
```

The Orchestrator now knows: the task is done, the code is on a feature branch, all tests pass, lint is clean, types check out. It can dispatch dependent tasks — perhaps the Security CLI to review the authentication logic, or the QA CLI to write adversarial test cases for token tampering.

This nine-step sequence — receive, branch, read, test, implement, verify, lint, commit, report — is the Coder CLI's core loop. Every implementation task follows this pattern. The details change. The discipline does not.

---

## 9.5 Multi-File Refactoring Patterns

Implementation is the Coder CLI's bread and butter, but refactoring is where it earns its reputation. Multi-file refactoring — the systematic restructuring of code across dozens of files while maintaining correctness — is the task that most dramatically separates a capable Coder CLI from a naive code generator.

The difficulty is threefold. **Dependency chains**: changing a function signature in file A requires updating every caller in files B through Z. **Ordering sensitivity**: some changes must happen before others — rename the type before updating the functions that use it. **Consistency requirements**: a partial refactor is worse than no refactor at all — half the codebase using the old name and half using the new is a guaranteed runtime failure.

### Pattern 1: The Rename

The most common refactoring. Rename a class, function, type, or variable across the entire codebase.

**Step 1: Discover scope with LSP.**

```
LSP findReferences("UserManager", "src/services/UserManager.ts", line 5, char 14)
→ 14 source files, 3 test files, 3 docs files, 2 config files = 22 total references
```

**Step 2: Rename the definition file first.**

```bash
git mv src/services/UserManager.ts src/services/UserService.ts
```

**Step 3: Update the class definition.**

```
Edit src/services/UserService.ts:
  old: "export class UserManager"
  new: "export class UserService"
```

**Step 4: Update every reference file.**

For each file containing a reference, the Coder reads it, identifies all occurrences (import statements, instantiation, type annotations, comments), and edits them. For files with many occurrences, `replace_all: true` handles the batch. For files where only some occurrences should change (a comment explaining "formerly known as UserManager"), the Coder uses individual edits.

**Step 5: Verify.**

```bash
npx tsc --noEmit && npx vitest run
```

Type-check catches any missed references. Tests verify behavior is preserved.

### Pattern 2: Extract and Move

A function has grown too large and belongs in its own module. The Coder must extract it from the original file, create a new module, update the original to import from the new location, and update every other file that imports the function.

This is ordering-sensitive. If you update importers before creating the new module, the imports break. If you remove the function from the original before adding the import, the original breaks. The correct order:

1. Create the new module with the extracted function
2. Add an import of the new module to the original file
3. Remove the function definition from the original (but keep the re-export)
4. Update direct importers to use the new module (optional — re-export preserves compatibility)
5. Run tests at each step

### Pattern 3: Interface Extraction

Multiple classes implement the same behavior but share no common interface. The Coder extracts the shared methods into an interface, then updates each class to explicitly implement it.

```
Step 1: Tree-sitter parse all candidate classes → extract method signatures
Step 2: Identify common methods (same name, compatible signatures)
Step 3: Create interface file with shared method signatures
Step 4: Edit each class to add "implements" clause
Step 5: Type-check — the compiler verifies each class satisfies the interface
```

Tree-sitter is the right tool for Step 1 — it extracts method signatures without needing the project to compile. LSP is the right tool for Step 5 — it provides compiler-level verification.

### The Five-File Rule

When a refactoring affects more than five files, the Coder CLI switches from direct execution to plan-first execution. It uses plan mode (or the equivalent planning phase) to enumerate every file that will change, the order of changes, and the verification steps between changes. This plan is reviewed before execution begins.

The reasoning is probabilistic. A three-file refactoring has few enough moving parts that the model can hold the entire operation in context. A twenty-file refactoring does not fit — the model will lose track of which files have been updated and which haven't. The plan serves as an external checklist that survives context compaction.

---

## 9.6 Git Workflow Automation

The Coder CLI's relationship with git is not casual. Every piece of code it writes exists within a version control context. Branches, commits, diffs, and pull request preparation are not afterthoughts — they are integral to the workflow.

### Branch Naming Conventions

The Coder CLI follows a strict naming convention drawn from its CLAUDE.md:

```
feat/    → New feature implementation
fix/     → Bug fix
refactor/ → Code restructuring without behavior change  
docs/    → Documentation updates
test/    → Test additions or modifications
chore/   → Build, CI, dependency updates
```

Branch names are derived from task descriptions: `feat/jwt-auth-middleware`, `fix/race-condition-session-store`, `refactor/extract-payment-module`. Spaces become hyphens. The name should be readable by a human reviewing the branch list.

### Commit Message Generation

The Coder CLI generates commit messages that follow the Conventional Commits specification, with bodies that explain the reasoning:

```
<type>(<scope>): <description>

<body — why this change was made, what alternatives were considered>

<footer — task references, breaking changes>
```

The model generates this from the diff. It reads `git diff --staged`, summarizes the changes, and produces a commit message that a human reviewer would write. Crucially, the Coder stages specific files — `git add src/middleware/jwtAuth.ts` — not `git add .`. Staging everything is the mark of a careless developer. The Coder CLI is not careless.

### Diff Review Before Commit

Before every commit, the Coder reviews its own changes:

```bash
git diff --staged
```

This is not theater. The model reads the diff, checks for debugging artifacts (`console.log`, `debugger`, `TODO: remove this`), verifies that test files are included, and confirms that no unrelated changes leaked into the staged set. If the review reveals issues, the Coder fixes them before committing.

### Pull Request Preparation

When the task is complete and all commits are pushed, the Coder CLI prepares a pull request:

```bash
gh pr create \
  --title "feat: JWT auth middleware with RS256 validation" \
  --body "## Summary
Implements Express middleware for JWT authentication.

## Changes
- Added \`src/middleware/jwtAuth.ts\` — Bearer token validation using jose library
- Added \`src/middleware/__tests__/jwtAuth.test.ts\` — 4 test cases
- Added \`jose\` dependency for modern JWKS support

## Testing
All 4 tests pass. Lint clean. Type-check clean.

## Related
Closes task-0042
Depends on task-0038 (type definitions)" \
  --base main
```

The PR body is structured for the reviewer: summary, change list, test status, and task references. The `gh pr create` command is tracked by the git operation tracking system, which extracts the PR URL and includes it in the tool result for the Orchestrator.

---

## 9.7 The Coder CLI CLAUDE.md Template

Every specialist CLI in the multi-CLI system is defined by its CLAUDE.md — the system prompt that shapes its behavior, permissions, and constraints. The Coder CLI's CLAUDE.md is the longest and most detailed of the eight specialists because it has the most tools and the most rules governing their use.

```markdown
# CLAUDE.md — Coder CLI

## Identity
You are the Coder CLI, the implementation specialist in a multi-CLI agent system.
You write code, run tests, and commit results. You do not make architectural
decisions (that's the Planner). You do not research unfamiliar topics (that's
Research). You do not audit for security vulnerabilities (that's Security).
You implement the task you are given, verify it works, and report completion.

## Tool Permissions

### Always Allowed
- FileReadTool — read any file in the project
- GlobTool — find files by pattern
- GrepTool — search file contents
- LSPTool — code intelligence operations
- BashTool — with restrictions below

### Bash Restrictions
- ALLOWED: git operations, test runners, linters, type checkers, package managers
- ALLOWED: build commands (npm run build, make, cargo build)
- BLOCKED: deployment commands (kubectl, terraform, aws, gcloud)
- BLOCKED: destructive operations (rm -rf /, chmod 777, dd)
- BLOCKED: network operations beyond package install (curl to external APIs)

### File Write Rules
- FileWriteTool — only for NEW files (creating modules, tests, configs)
- FileEditTool — for modifying EXISTING files (prefer surgical edits)
- Never overwrite a file that already exists using FileWriteTool
- Always read a file before editing it

## Coding Standards

### General
- Write the failing test BEFORE the implementation
- Run tests after every implementation change
- Run lint and type-check before committing
- Never commit code that fails tests, lint, or type-check
- Prefer explicit types over inference in function signatures
- No debugging artifacts in committed code (console.log, debugger, TODO)

### Git Discipline
- Create a feature branch for every task: feat/, fix/, refactor/, etc.
- Stage specific files, never `git add .`
- Commit messages: imperative mood, explain WHY not just WHAT
- Review `git diff --staged` before every commit
- Include task ID in commit footer

### Test Requirements
- Every new function must have at least one test
- Every bug fix must include a regression test
- Test the behavior, not the implementation
- Use descriptive test names: "returns 401 when token is expired"
- Prefer integration tests over unit tests for I/O boundaries

### Refactoring Rules
- Never refactor and add features in the same commit
- For >5 file changes, create a plan before executing
- Run tests after each file modification, not just at the end
- Use LSP findReferences for rename operations, not grep
- Preserve all existing behavior — refactoring changes structure, not function

## Task Protocol

### On Receiving a Task
1. Read the task description and dependency artifacts
2. Create a feature branch
3. Discover the codebase context (glob, grep, read relevant files)
4. Write failing tests
5. Implement to pass the tests
6. Run full verification: tests + lint + type-check
7. Commit with a descriptive message
8. Report completion with branch, SHA, files changed, and test results

### On Failure
- If tests fail after 3 implementation attempts, report failure with:
  - What was attempted
  - What the test output shows
  - What the likely root cause is
- Never commit failing code
- Never report success when tests fail

## Communication
- Report progress after each major step (branch created, tests written, 
  implementation complete, verification passed)
- Include file paths and line numbers in all references
- When reporting completion, include the full test result summary
```

This CLAUDE.md is dense because the Coder CLI's behavior must be precisely constrained. An unconstrained Coder that skips tests, commits to main, or deploys to production is not a specialist — it's a liability. The system prompt is the contract between the Orchestrator and the Coder: if you follow these rules, the output can be trusted.

---

## 9.8 The Coder's Discipline — Verification Loops

The difference between a Coder CLI that works and one that ships reliable software is a single concept: verification loops. Every action the Coder takes is followed by a verification step that confirms the action succeeded. Not eventually. Not at the end. After every significant change.

### The Inner Loop: Test After Every Change

The Coder CLI runs relevant tests after every file modification, not just at the end of the task. This catches regressions immediately, when the cause is obvious (the last edit you made), rather than at the end, when the cause could be any of fifteen edits.

```
Edit file A → Run tests touching file A → Pass? → Continue
Edit file B → Run tests touching file A and B → Pass? → Continue  
Edit file C → Run tests touching file A, B, and C → Pass? → Continue
```

The overhead is real but the economics favor it overwhelmingly. Fixing a regression immediately after introducing it takes seconds — you know exactly what changed. Fixing a regression discovered after fifteen more edits takes minutes or hours — you're debugging a haystack.

For speed, the Coder CLI runs the narrowest possible test scope. Not the full suite — just the tests affected by the change. Vitest and Jest support file-specific runs (`vitest run src/auth/jwt.test.ts`). Pytest supports marker-based runs (`pytest -m auth`). The full suite runs once, at the end, as a final gate.

### The Outer Loop: Lint, Type-Check, Test Before Commit

No code is committed without passing three gates:

1. **Lint** — catches formatting violations, unused imports, unreachable code
2. **Type-check** — catches type errors that tests might miss (TypeScript `--noEmit`, mypy for Python)
3. **Test** — catches behavioral regressions

These three tools catch different categories of errors with minimal overlap. Lint catches what the type-checker ignores (style, convention). The type-checker catches what tests miss (type mismatches in untested code paths). Tests catch what both ignore (behavioral correctness). Running all three before every commit is not redundant — it is defense in depth.

### The Meta Loop: Never Report False Success

The final verification loop is epistemic. The Coder CLI never reports success based on what it *intended* to do. It reports success based on what it *verified*:

- "Tests pass" means the Coder ran the tests and observed them passing — not that it believes they should pass.
- "Lint clean" means the Coder ran the linter and observed zero errors — not that it followed the style guide while writing.
- "Type-check clean" means the Coder ran the type-checker and observed zero errors — not that it used correct types.

This distinction matters because LLMs hallucinate. A model can convince itself that code is correct without running it. A model can believe tests pass without executing them. The Coder CLI's CLAUDE.md explicitly forbids this: **never report success when tests fail**. The verification must be empirical — executed, observed, confirmed — not theoretical.

### The Recovery Protocol

When verification fails, the Coder CLI does not panic. It follows a structured recovery protocol:

1. **Read the error output.** The test failure message, the lint error, the type-check diagnostic. These are data, not obstacles.

2. **Diagnose the root cause.** Is the error in the new code, in the test, or in a pre-existing issue exposed by the change?

3. **Fix and re-verify.** Make the smallest change that addresses the root cause. Run verification again. If it passes, continue. If it fails with a different error, return to step 1.

4. **Escalate after three attempts.** If the Coder cannot make tests pass after three implementation attempts, it stops and reports failure to the Orchestrator with full diagnostic information. The Orchestrator can then reassign the task, adjust the requirements, or dispatch a debugging specialist.

This escalation protocol prevents infinite loops. A Coder that retries forever is no better than a Coder that ships broken code — both waste resources. Three attempts is the empirical sweet spot: enough to fix genuine mistakes, not enough to mask fundamental misunderstandings.

---

## 9.9 The Coder in the System

The Coder CLI does not operate in isolation. It is one node in a larger system, and its effectiveness depends on how well it integrates with the other seven specialists.

**From the Orchestrator**, the Coder receives structured task assignments with dependencies, constraints, and artifact references. It never self-assigns work. It never decides what to build next. That is the Orchestrator's job.

**From the Planner**, the Coder receives architectural guidance — module boundaries, API contracts, dependency graphs. The Coder implements within these boundaries. If the Planner says the authentication module exports a single `jwtAuth` function, the Coder does not create a class hierarchy with abstract base classes and factory methods. It creates the function.

**From the Research CLI**, the Coder receives technical knowledge — library documentation, API specifications, best practice references. The Coder does not Google how RS256 works. It receives that knowledge pre-digested from the Research CLI's output.

**To the Security CLI**, the Coder hands off completed code for security review. The Security CLI analyzes the authentication middleware for vulnerabilities — token replay attacks, algorithm confusion attacks, missing expiry validation. If the Security CLI finds issues, they flow back through the Orchestrator as new fix tasks for the Coder.

**To the Validator CLI**, the Coder's commits trigger build and test verification in a clean environment. The Validator runs the full test suite, checks build reproducibility, and verifies that the feature branch merges cleanly with the default branch. This catches "works on my machine" failures that the Coder's local verification might miss.

**To the QA CLI**, the Coder's implementation becomes the target for adversarial testing. The QA CLI generates edge cases the Coder didn't consider — what happens with an empty Bearer token? A token with 10,000 characters? A valid token from a revoked signing key? These adversarial tests flow back as additional test cases that the Coder must make pass.

**To the Documentation CLI**, the Coder's code becomes the source of truth for API documentation, README updates, and changelog entries. The Documentation CLI reads the Coder's implementation and generates accurate docs — it does not ask the Coder to write docs.

This is the power of specialization. The Coder does one thing — write and verify code — and it does it with a level of discipline that would be impossible if it were also responsible for research, security analysis, adversarial testing, and documentation. Each specialist's focused context window means the Coder can hold the entire implementation in its working memory without context compaction, while the Security CLI simultaneously holds the entire threat model in its working memory without interference.

Eight focused agents, each excellent at one thing, coordinated by an Orchestrator that sees the whole picture. That is the architecture. The Coder is its hands.

---

The discipline of the Coder CLI is not merely technical. It is epistemological. The Coder does not assume its code works — it proves it works, with tests. It does not assume its edits are correct — it verifies them, with lint and type-checks. It does not assume its commits are clean — it reviews them, with diff inspection. And when it cannot prove correctness, it does the hardest thing a builder can do: it stops, reports what it knows, and asks for help.

That discipline is what makes the Coder trustworthy. And trust is the only currency that matters in a system where eight agents depend on each other's output.
