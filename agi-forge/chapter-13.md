# Chapter 13: The Documentation CLI --- The Chronicler

---

There is a graveyard in every engineering organization. It doesn't have headstones or flowers. It has Confluence pages last edited eighteen months ago, README files that describe an API that was rewritten twice since, and architecture diagrams that reference services decommissioned before the current team was hired. The graveyard is the documentation, and it died the way all documentation dies --- not from neglect, exactly, but from the fundamental asymmetry between creating software and describing it.

Writing code is its own reward. You write a function, run it, see it work. Dopamine. Writing documentation is a chore performed after the dopamine has dissipated, when the deadline is breathing down your neck and the next feature is already in the backlog. So the documentation gets written once, at the point of maximum enthusiasm and minimum accuracy --- during the initial build, when the API is still shifting and the edge cases haven't been discovered yet. Then the code evolves and the documentation stays frozen in amber, a fossil record of what the system used to be.

You know this graveyard. You've wandered through it at 2 AM trying to understand an integration that nobody documented correctly because the engineer who built it left the company eight months ago and the Slack messages explaining the quirks were in a channel that got archived. You've opened a README that starts with "Getting Started" and ends with a setup process that references environment variables that no longer exist. You've stared at an OpenAPI spec that describes fourteen endpoints, eleven of which have been deprecated and three of which have new required parameters that nobody added to the spec.

The problem isn't laziness. Engineers aren't lazy. The problem is that documentation is a second-class artifact in every development workflow ever designed. Code gets written, tested, reviewed, deployed. Documentation gets... written. Maybe. If there's time. And then it's never tested against the code it describes, never validated for accuracy, never automatically updated when the code changes. It exists in a parallel universe that diverges from reality with every commit.

The Documentation CLI is the solution to the graveyard problem. It is the eighth and final specialized CLI in the multi-CLI system, and it has a relationship with every other CLI that none of the others have with each other: *it documents their work*. The Coder writes code; the Documentation CLI explains it. The Planner makes architecture decisions; the Documentation CLI records them. The Security CLI finds vulnerabilities; the Documentation CLI catalogs them. The QA CLI discovers edge cases; the Documentation CLI turns them into warnings for future engineers.

This chapter builds the Chronicler --- the CLI that ensures nothing built by the multi-CLI system is ever lost to the graveyard.

---

## 13.1 The Documentation Problem Is a Synchronization Problem

Most teams treat documentation as a content problem. They think the issue is *writing quality* --- if only the docs were better written, more thorough, more carefully structured. So they hire technical writers, buy documentation platforms, create style guides with meticulous rules about Oxford commas and heading capitalization.

They're solving the wrong problem. Documentation quality is irrelevant if the documentation is out of date. A beautifully written API reference that describes yesterday's endpoints is worse than no documentation at all, because it actively misleads. The core problem is *synchronization* --- keeping documentation in lockstep with the code it describes, automatically, without human intervention.

This reframing changes everything about how you architect a documentation system. It's not a content management system. It's a synchronization engine. And synchronization engines need three things:

1. **A source of truth.** The code itself. Not a wiki, not a Notion page, not a developer's memory. The actual source files, the actual route handlers, the actual type definitions.

2. **Change detection.** A mechanism that knows when the source of truth changes. In the multi-CLI system, this is the hook system --- specifically, the `FileChanged` hook that fires whenever a file in the repository is modified.

3. **Transformation logic.** Code that reads the source of truth and produces documentation artifacts --- API references, changelogs, architecture diagrams, usage examples.

The Documentation CLI implements all three. It watches for changes, reads the changed code, and produces documentation that is accurate *by construction* --- not because someone remembered to update it, but because it was generated from the code that just changed.

### The FileChanged Hook: Documentation's Trigger

The hook system introduced in Chapter 6 provides the architectural foundation. The Documentation CLI registers a `FileChanged` hook that activates whenever source files change:

```yaml
# Documentation CLI CLAUDE.md (hooks section)
hooks:
  - name: doc_sync_trigger
    on: FileChanged
    watchPaths:
      - "src/**/*.ts"
      - "src/**/*.py"
      - "api/**/*.ts"
      - "lib/**/*.ts"
    run: |
      echo "FILES_CHANGED=${changed_files}"
      echo "CHANGE_TYPE=${change_type}"
    behavior: post
```

When the Coder CLI modifies `src/api/routes/users.ts`, the hook fires. The Orchestrator receives the event and routes it to the Documentation CLI with a structured payload:

```typescript
interface DocSyncEvent {
  trigger: "FileChanged";
  changedFiles: string[];
  changeType: "created" | "modified" | "deleted";
  gitDiff: string;
  commitMessage?: string;
  relatedCLI: "coder" | "security" | "qa" | "planner";
}
```

The Documentation CLI doesn't need to poll, doesn't need cron jobs, doesn't need a developer to remember. It activates *because the code changed*. The synchronization is structural, not procedural.

### The Cascade Pattern

Not every file change requires the same documentation response. A change to a route handler needs API doc updates. A change to a configuration file needs deployment guide updates. A change to a core algorithm needs architecture doc updates. The Documentation CLI uses a cascade pattern to determine which documentation artifacts to regenerate:

```typescript
class DocumentationCascade {
  private rules: CascadeRule[] = [
    {
      pattern: /^src\/api\/routes\//,
      generates: ["openapi-spec", "api-reference", "usage-examples"],
      priority: "high",
    },
    {
      pattern: /^src\/models\//,
      generates: ["data-model-docs", "migration-guide"],
      priority: "medium",
    },
    {
      pattern: /^src\/config\//,
      generates: ["deployment-guide", "env-reference"],
      priority: "medium",
    },
    {
      pattern: /^src\/core\//,
      generates: ["architecture-docs", "adr-review"],
      priority: "high",
    },
    {
      pattern: /\.github\/workflows\//,
      generates: ["ci-cd-docs", "deployment-guide"],
      priority: "low",
    },
    {
      pattern: /^src\/.*\.test\./,
      generates: ["test-coverage-report"],
      priority: "low",
    },
  ];

  determine(changedFiles: string[]): DocumentationTask[] {
    const tasks: Map<string, DocumentationTask> = new Map();

    for (const file of changedFiles) {
      for (const rule of this.rules) {
        if (rule.pattern.test(file)) {
          for (const docType of rule.generates) {
            if (!tasks.has(docType) || rule.priority === "high") {
              tasks.set(docType, {
                type: docType,
                triggeredBy: file,
                priority: rule.priority,
              });
            }
          }
        }
      }
    }

    return Array.from(tasks.values())
      .sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority));
  }
}
```

When the Coder modifies three files --- a route handler, a model, and a test --- the cascade determines that five documentation artifacts need regeneration: the OpenAPI spec, the API reference, usage examples, data model docs, and the test coverage report. Each is queued by priority and processed in order.

---

## 13.2 API Documentation Generation --- From Routes to OpenAPI

The highest-value documentation the Chronicler produces is the API reference. In most organizations, API docs are written by hand --- a developer finishes a route handler, opens a YAML file, and manually transcribes the endpoint's method, path, parameters, request body, and response schema. This process is error-prone at birth and fatal over time. The route handler changes; the YAML doesn't.

The Documentation CLI inverts this. It *reads* the route handlers and *generates* the OpenAPI specification. The source of truth is always the code.

### Parsing Route Handlers

The API doc generator works with both Express (TypeScript/Node.js) and FastAPI (Python) route patterns. Here's the Express parser:

```typescript
import * as ts from "typescript";
import { OpenAPIV3 } from "openapi-types";

interface ParsedRoute {
  method: "get" | "post" | "put" | "delete" | "patch";
  path: string;
  handler: string;
  params: ParameterDef[];
  requestBody?: SchemaRef;
  responseSchema?: SchemaRef;
  middleware: string[];
  jsdocComment?: string;
}

class RouteParser {
  private sourceFile: ts.SourceFile;

  constructor(filePath: string) {
    const content = ts.sys.readFile(filePath)!;
    this.sourceFile = ts.createSourceFile(
      filePath, content, ts.ScriptTarget.Latest, true
    );
  }

  parse(): ParsedRoute[] {
    const routes: ParsedRoute[] = [];
    const visit = (node: ts.Node) => {
      if (this.isRouteCall(node)) {
        const route = this.extractRoute(node as ts.CallExpression);
        if (route) routes.push(route);
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(this.sourceFile, visit);
    return routes;
  }

  private isRouteCall(node: ts.Node): boolean {
    if (!ts.isCallExpression(node)) return false;
    const expr = node.expression;
    if (!ts.isPropertyAccessExpression(expr)) return false;
    const method = expr.name.text;
    return ["get", "post", "put", "delete", "patch"].includes(method);
  }

  private extractRoute(call: ts.CallExpression): ParsedRoute | null {
    const expr = call.expression as ts.PropertyAccessExpression;
    const method = expr.name.text as ParsedRoute["method"];
    const args = call.arguments;

    if (args.length < 2) return null;

    const pathArg = args[0];
    if (!ts.isStringLiteral(pathArg)) return null;
    const path = pathArg.text;

    // Extract path parameters from Express-style :param notation
    const params = this.extractPathParams(path);

    // Extract middleware (arguments between path and final handler)
    const middleware = args.slice(1, -1)
      .filter(ts.isIdentifier)
      .map(id => id.text);

    // Extract JSDoc comment above the route
    const jsdoc = this.extractJSDoc(call);

    // Extract request body and response types from TypeScript generics
    const { requestBody, responseSchema } = this.extractTypes(call);

    return {
      method, path, params, middleware,
      requestBody, responseSchema,
      handler: this.getHandlerName(args[args.length - 1]),
      jsdocComment: jsdoc,
    };
  }

  private extractPathParams(path: string): ParameterDef[] {
    const paramRegex = /:(\w+)/g;
    const params: ParameterDef[] = [];
    let match: RegExpExecArray | null;
    while ((match = paramRegex.exec(path)) !== null) {
      params.push({
        name: match[1],
        in: "path",
        required: true,
        schema: { type: "string" },
      });
    }
    return params;
  }

  private extractJSDoc(node: ts.Node): string | undefined {
    const fullText = this.sourceFile.getFullText();
    const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
    if (!ranges) return undefined;

    for (const range of ranges) {
      const comment = fullText.slice(range.pos, range.end);
      if (comment.startsWith("/**")) {
        return comment
          .replace(/^\/\*\*/, "").replace(/\*\/$/, "")
          .split("\n")
          .map(line => line.replace(/^\s*\*\s?/, "").trim())
          .filter(Boolean)
          .join("\n");
      }
    }
    return undefined;
  }

  // ... extractTypes and getHandlerName implementations
}
```

### Generating OpenAPI YAML

With parsed routes in hand, the Documentation CLI transforms them into a valid OpenAPI 3.0 specification:

```typescript
class OpenAPIGenerator {
  private spec: OpenAPIV3.Document;

  constructor(projectName: string, version: string) {
    this.spec = {
      openapi: "3.0.3",
      info: { title: projectName, version, description: "" },
      paths: {},
      components: { schemas: {}, securitySchemes: {} },
    };
  }

  addRoute(route: ParsedRoute): void {
    const pathKey = route.path.replace(/:(\w+)/g, "{$1}");
    if (!this.spec.paths[pathKey]) {
      this.spec.paths[pathKey] = {};
    }

    const operation: OpenAPIV3.OperationObject = {
      summary: this.extractSummary(route),
      description: route.jsdocComment || "",
      parameters: route.params.map(p => ({
        name: p.name,
        in: p.in,
        required: p.required,
        schema: p.schema,
      })),
      responses: {
        "200": {
          description: "Successful response",
          content: route.responseSchema
            ? { "application/json": { schema: route.responseSchema } }
            : undefined,
        },
      },
    };

    if (route.requestBody) {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": { schema: route.requestBody },
        },
      };
    }

    if (route.middleware.includes("authenticate")) {
      operation.security = [{ bearerAuth: [] }];
    }

    (this.spec.paths[pathKey] as any)[route.method] = operation;
  }

  toYAML(): string {
    return yaml.dump(this.spec, { lineWidth: 100, noRefs: true });
  }

  private extractSummary(route: ParsedRoute): string {
    if (route.jsdocComment) {
      return route.jsdocComment.split("\n")[0];
    }
    const action = {
      get: "Retrieve", post: "Create", put: "Update",
      delete: "Delete", patch: "Partially update",
    }[route.method];
    const resource = route.path.split("/").filter(Boolean).pop() || "resource";
    return `${action} ${resource}`;
  }
}
```

The workflow is fully automatic. The Coder CLI finishes a new endpoint. The `FileChanged` hook fires. The Documentation CLI parses the route handler, generates the OpenAPI spec, and commits the updated `openapi.yaml` alongside the code change. The spec is *never* out of sync because it is *never* written by hand.

---

## 13.3 Changelog Generation --- From Git Log to Release Notes

The second highest-value artifact is the changelog. Release notes are the public face of every software project, and they are universally terrible. Either they're a raw `git log` dump that nobody reads, or they're hand-crafted summaries that the release manager writes at 6 PM on Friday from memory, omitting half the changes and misdescribing the other half.

The Documentation CLI solves this by parsing conventional commits and producing categorized, user-facing release notes --- the same pattern Claude Code uses for its own `/release-notes` command.

### Conventional Commit Parsing

The system assumes conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `test:`, `chore:`, `BREAKING CHANGE:`). If the project doesn't use conventional commits, the Documentation CLI infers categories from the diff content.

```typescript
interface ChangelogEntry {
  type: "feature" | "fix" | "breaking" | "performance" | "docs" | "internal";
  scope?: string;
  description: string;
  prNumber?: number;
  author?: string;
  hash: string;
}

class ChangelogGenerator {
  async generate(fromRef: string, toRef: string): Promise<string> {
    const commits = await this.getCommits(fromRef, toRef);
    const entries = commits.map(c => this.parseCommit(c));
    const grouped = this.groupByType(entries);
    return this.render(grouped, toRef);
  }

  private parseCommit(commit: GitCommit): ChangelogEntry {
    const conventionalRegex =
      /^(feat|fix|docs|refactor|perf|test|chore|ci)(?:\(([^)]+)\))?(!)?:\s*(.+)/;
    const match = commit.message.match(conventionalRegex);

    if (match) {
      const [, rawType, scope, breaking, description] = match;
      return {
        type: breaking ? "breaking" : this.mapType(rawType),
        scope: scope || undefined,
        description: description.trim(),
        hash: commit.hash,
        author: commit.author,
        prNumber: this.extractPR(commit.message),
      };
    }

    // Fallback: infer type from diff content
    return this.inferType(commit);
  }

  private inferType(commit: GitCommit): ChangelogEntry {
    const msg = commit.message.toLowerCase();
    const diff = commit.diff || "";

    if (msg.includes("breaking") || msg.includes("migrate"))
      return this.entry("breaking", commit);
    if (diff.includes("+ app.get(") || diff.includes("+ router."))
      return this.entry("feature", commit);
    if (msg.includes("fix") || msg.includes("bug") || msg.includes("patch"))
      return this.entry("fix", commit);
    if (msg.includes("perf") || msg.includes("optim") || msg.includes("cache"))
      return this.entry("performance", commit);

    return this.entry("internal", commit);
  }

  private render(
    grouped: Map<string, ChangelogEntry[]>, version: string
  ): string {
    const date = new Date().toISOString().split("T")[0];
    const lines: string[] = [`## ${version} (${date})`, ""];

    const sectionOrder: [string, string][] = [
      ["breaking", "⚠️ Breaking Changes"],
      ["feature", "✨ Features"],
      ["fix", "🐛 Bug Fixes"],
      ["performance", "⚡ Performance"],
      ["docs", "📚 Documentation"],
    ];

    for (const [type, heading] of sectionOrder) {
      const entries = grouped.get(type);
      if (!entries?.length) continue;

      lines.push(`### ${heading}`, "");
      for (const entry of entries) {
        const scope = entry.scope ? `**${entry.scope}:** ` : "";
        const pr = entry.prNumber ? ` (#${entry.prNumber})` : "";
        lines.push(`- ${scope}${entry.description}${pr}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  // ... helper methods
}
```

### The Release Notes Workflow

When the Orchestrator signals a release, the Documentation CLI executes a four-step release notes workflow:

1. **Collect.** Parse all commits between the previous release tag and `HEAD`. Group by conventional commit type.
2. **Enrich.** For each commit, pull the associated PR description (if any) for additional context. Cross-reference with the QA CLI's test reports and the Security CLI's audit findings.
3. **Humanize.** Transform terse commit messages into user-facing descriptions. `"feat(auth): add PKCE support"` becomes `"Added PKCE (Proof Key for Code Exchange) support for OAuth flows, improving security for public clients."` This is where the LLM shines --- it understands what the change *means to users*, not just what code was modified.
4. **Render.** Output in the project's changelog format (Markdown, Keep a Changelog, GitHub Releases, or custom template).

The humanization step is the differentiator. Any tool can parse conventional commits. The Documentation CLI *understands* them, because it has access to the full diff, the PR discussion, and the architectural context from the Planner CLI. It writes release notes that a product manager would be proud to ship.

---

## 13.4 Architecture Decision Records --- Capturing the Why

Code tells you *what* the system does. Tests tell you *whether* it works. Neither tells you *why* it was built that way. Architecture Decision Records (ADRs) fill that gap --- they capture the context, constraints, and rationale behind significant design choices so that future engineers can understand not just the system but the reasoning that shaped it.

In the multi-CLI system, the Planner CLI makes architecture decisions. It decomposes tasks, selects approaches, identifies tradeoffs. But the Planner doesn't document those decisions --- it moves on to the next task. The Documentation CLI watches the Planner's output and automatically generates ADRs.

### The ADR Template

The Documentation CLI uses a structured ADR format that captures everything a future engineer needs:

```markdown
# ADR-{number}: {title}

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-{n}
**Date:** {date}
**Deciders:** {CLI names and human reviewers}
**Context Source:** Planner CLI session {session_id}

## Context

{What is the problem or decision that needs to be made?
 What constraints exist? What forces are at play?}

## Decision

{What is the change that we're proposing or have agreed to implement?}

## Rationale

{Why this decision over alternatives? What tradeoffs were considered?
 Reference specific analysis from the Planner CLI.}

## Alternatives Considered

### Alternative A: {name}
- **Pros:** {list}
- **Cons:** {list}
- **Rejected because:** {reason}

### Alternative B: {name}
- **Pros:** {list}
- **Cons:** {list}
- **Rejected because:** {reason}

## Consequences

### Positive
- {expected benefit}

### Negative
- {accepted tradeoff}

### Risks
- {identified risk and mitigation}

## Related
- **Implements:** {issue/ticket numbers}
- **Supersedes:** ADR-{n} (if applicable)
- **Related ADRs:** ADR-{n}, ADR-{m}
```

### Auto-Generation from Planner Output

The Planner CLI produces structured output when evaluating approaches. The Documentation CLI intercepts this via the `AgentHook` (which fires after a sub-agent completes) and transforms it into an ADR:

```typescript
class ADRGenerator {
  private adrDir: string;
  private nextNumber: number;

  constructor(projectRoot: string) {
    this.adrDir = path.join(projectRoot, "docs", "decisions");
    this.nextNumber = this.getNextNumber();
  }

  async fromPlannerOutput(plannerResult: PlannerDecision): Promise<string> {
    const adr: ADRContent = {
      number: this.nextNumber,
      title: plannerResult.decision_title,
      status: "Proposed",
      date: new Date().toISOString().split("T")[0],
      deciders: ["Planner CLI", ...plannerResult.human_reviewers],
      context: plannerResult.problem_statement,
      decision: plannerResult.chosen_approach.description,
      rationale: plannerResult.chosen_approach.rationale,
      alternatives: plannerResult.rejected_approaches.map(alt => ({
        name: alt.name,
        pros: alt.advantages,
        cons: alt.disadvantages,
        rejectedBecause: alt.rejection_reason,
      })),
      positiveConsequences: plannerResult.expected_benefits,
      negativeConsequences: plannerResult.accepted_tradeoffs,
      risks: plannerResult.identified_risks,
      relatedIssues: plannerResult.ticket_numbers,
    };

    const rendered = this.renderADR(adr);
    const filePath = path.join(
      this.adrDir,
      `${String(adr.number).padStart(4, "0")}-${slugify(adr.title)}.md`
    );

    await fs.writeFile(filePath, rendered, "utf-8");
    return filePath;
  }

  private getNextNumber(): number {
    const existing = fs.readdirSync(this.adrDir)
      .filter(f => /^\d{4}-/.test(f))
      .map(f => parseInt(f.slice(0, 4), 10));
    return existing.length > 0 ? Math.max(...existing) + 1 : 1;
  }
}
```

The ADR is committed to `docs/decisions/` alongside the code that implements the decision. Six months later, when an engineer wonders "why did we use Redis instead of Memcached for session storage?", the answer is in `docs/decisions/0023-redis-for-session-storage.md` --- complete with the alternatives considered, the tradeoffs accepted, and a reference to the Planner CLI session that analyzed the options.

---

## 13.5 Diagram Rendering --- Making Architecture Visible

Text-based documentation has a ceiling. Some concepts --- data flows, component relationships, sequence interactions --- are best understood visually. The Documentation CLI generates Mermaid diagrams from code structure and embeds them in documentation artifacts.

### Architecture Diagrams from Import Graphs

The Documentation CLI scans the project's import structure and generates component diagrams:

```typescript
class DiagramGenerator {
  generateComponentDiagram(
    modules: ModuleMap
  ): string {
    const lines: string[] = ["graph TD"];

    for (const [moduleName, moduleInfo] of modules) {
      const shortName = this.abbreviate(moduleName);
      const label = `${shortName}["${moduleName}"]`;
      lines.push(`    ${label}`);

      for (const dep of moduleInfo.dependencies) {
        const depShort = this.abbreviate(dep);
        lines.push(`    ${shortName} --> ${depShort}`);
      }
    }

    // Style by layer
    lines.push("");
    lines.push("    classDef api fill:#e1f5fe,stroke:#0288d1");
    lines.push("    classDef core fill:#f3e5f5,stroke:#7b1fa2");
    lines.push("    classDef data fill:#e8f5e9,stroke:#388e3c");

    for (const [moduleName] of modules) {
      const shortName = this.abbreviate(moduleName);
      if (moduleName.includes("route") || moduleName.includes("api"))
        lines.push(`    class ${shortName} api`);
      else if (moduleName.includes("model") || moduleName.includes("db"))
        lines.push(`    class ${shortName} data`);
      else
        lines.push(`    class ${shortName} core`);
    }

    return lines.join("\n");
  }

  generateSequenceDiagram(
    workflow: WorkflowStep[]
  ): string {
    const lines: string[] = ["sequenceDiagram"];

    for (const step of workflow) {
      const arrow = step.async ? "->>" : "->>";
      lines.push(`    ${step.from}-${arrow}${step.to}: ${step.action}`);
      if (step.response) {
        lines.push(`    ${step.to}-->>${ step.from}: ${step.response}`);
      }
    }

    return lines.join("\n");
  }
}
```

### The Multi-CLI Workflow Diagram

One of the Documentation CLI's most useful outputs is the workflow diagram showing how all eight CLIs interact. This diagram regenerates every time the Orchestrator's routing logic changes:

```
sequenceDiagram
    participant User
    participant Orch as Orchestrator
    participant Plan as Planner
    participant Code as Coder
    participant Sec as Security
    participant QA as QA CLI
    participant Val as Validator
    participant Doc as Documentation

    User->>Orch: "Add user search endpoint"
    Orch->>Plan: Decompose task
    Plan-->>Orch: Subtask list + approach
    Orch->>Doc: Generate ADR from Planner decision
    Orch->>Code: Implement search endpoint
    Code-->>Orch: Code changes complete
    Orch->>Sec: Audit new endpoint
    Sec-->>Orch: Security findings
    Orch->>QA: Adversarial testing
    QA-->>Orch: Edge case report
    Orch->>Val: Full validation pipeline
    Val-->>Orch: PASS
    Orch->>Doc: Sync all documentation
    Doc-->>Orch: API spec + changelog + README updated
    Orch-->>User: Task complete
```

This isn't a static diagram in a slide deck. It's a living artifact that the Documentation CLI regenerates from the Orchestrator's actual routing table. When a new CLI is added or the pipeline order changes, the diagram updates automatically.

---

## 13.6 Style Enforcement --- Consistent Voice Across All Docs

Documentation written by eight different CLIs (and the humans who prompt them) will naturally drift in tone, terminology, and formatting. The Documentation CLI enforces consistency through a style engine that normalizes all documentation output.

### The Style Configuration

```yaml
# docs/.style.yaml
voice:
  tone: "professional-technical"
  person: "second"           # "you" not "the user"
  tense: "present"           # "returns" not "will return"
  contractions: true         # "don't" not "do not"

terminology:
  preferred:
    - term: "endpoint"
      not: ["route", "path", "URL"]
    - term: "request body"
      not: ["payload", "body", "data"]
    - term: "authentication"
      not: ["auth", "authn"]
      except_in: ["code blocks", "file names"]
    - term: "API key"
      not: ["api-key", "apikey", "api_key"]
      except_in: ["code blocks", "environment variables"]

formatting:
  headings: "sentence-case"    # "Getting started" not "Getting Started"
  code_blocks: "always-specify-language"
  lists: "end-with-period"
  line_length: 100

structure:
  api_reference:
    order: ["summary", "authentication", "request", "response", "errors", "examples"]
  readme:
    order: ["overview", "quickstart", "installation", "usage", "api", "contributing"]
```

### The Style Linter

The Documentation CLI runs a style linter against every documentation artifact it produces --- and against human-written docs when they're committed:

```typescript
class DocStyleLinter {
  private config: StyleConfig;

  constructor(configPath: string) {
    this.config = yaml.load(fs.readFileSync(configPath, "utf-8")) as StyleConfig;
  }

  lint(content: string, docType: string): StyleViolation[] {
    const violations: StyleViolation[] = [];

    // Terminology checks
    for (const rule of this.config.terminology.preferred) {
      for (const banned of rule.not) {
        const regex = new RegExp(`\\b${this.escapeRegex(banned)}\\b`, "gi");
        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
          if (this.isInExcludedContext(content, match.index, rule.except_in)) {
            continue;
          }
          violations.push({
            line: this.getLineNumber(content, match.index),
            severity: "warning",
            message: `Use "${rule.term}" instead of "${match[0]}"`,
            rule: "terminology",
            autofix: { old: match[0], new: rule.term },
          });
        }
      }
    }

    // Voice checks
    if (this.config.voice.person === "second") {
      const thirdPersonPatterns = [
        /\bthe user\b/gi, /\bthe developer\b/gi,
        /\busers can\b/gi, /\bdevelopers should\b/gi,
      ];
      for (const pattern of thirdPersonPatterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content)) !== null) {
          violations.push({
            line: this.getLineNumber(content, match.index),
            severity: "info",
            message: `Prefer second person ("you") over "${match[0]}"`,
            rule: "voice",
          });
        }
      }
    }

    // Heading case check
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    let headingMatch: RegExpExecArray | null;
    while ((headingMatch = headingRegex.exec(content)) !== null) {
      const heading = headingMatch[2];
      if (this.config.formatting.headings === "sentence-case") {
        if (this.isTitleCase(heading) && heading.split(" ").length > 1) {
          violations.push({
            line: this.getLineNumber(content, headingMatch.index),
            severity: "info",
            message: `Heading should use sentence case: "${this.toSentenceCase(heading)}"`,
            rule: "heading-case",
            autofix: { old: heading, new: this.toSentenceCase(heading) },
          });
        }
      }
    }

    return violations;
  }

  autofix(content: string, violations: StyleViolation[]): string {
    let fixed = content;
    // Apply fixes in reverse order to preserve line positions
    const fixable = violations
      .filter(v => v.autofix)
      .sort((a, b) => b.line - a.line);

    for (const violation of fixable) {
      fixed = fixed.replace(violation.autofix!.old, violation.autofix!.new);
    }
    return fixed;
  }
}
```

The style linter catches the kinds of inconsistencies that make documentation feel amateurish: mixing "endpoint" and "route" in the same paragraph, switching between "you" and "the user", inconsistent heading capitalization. These are exactly the issues that humans miss during review because they don't read documentation the way a linter does --- word by word, rule by rule.

---

## 13.7 SKILL.md Authoring --- Teaching Other CLIs

The Documentation CLI has a unique meta-capability: it writes SKILL.md files for the other CLIs. Skills are the mechanism by which CLIs learn new capabilities --- they're structured instruction files that extend a CLI's behavior without modifying its core CLAUDE.md.

### Observing Patterns

The Documentation CLI monitors the other CLIs' operations through the hook system. When it detects a repeated pattern --- the Coder CLI handling a specific type of task, the Security CLI applying a particular audit technique --- it generates a SKILL.md that codifies the pattern.

```typescript
class SkillAuthor {
  async generateSkill(
    observation: CLIObservation
  ): Promise<string> {
    const skill = {
      name: observation.patternName,
      description: observation.description,
      triggers: observation.activationPatterns,
      instructions: this.buildInstructions(observation),
      examples: observation.successfulExecutions.slice(0, 3),
    };

    return this.renderSkillMD(skill);
  }

  private renderSkillMD(skill: SkillDefinition): string {
    return `# ${skill.name}

## Description
${skill.description}

## Activation
This skill activates when:
${skill.triggers.map(t => `- ${t}`).join("\n")}

## Instructions
${skill.instructions}

## Examples

${skill.examples.map((ex, i) => `### Example ${i + 1}
**Input:** ${ex.prompt}
**Action:** ${ex.action}
**Output:** ${ex.result}
`).join("\n")}
`;
  }
}
```

For example, the Documentation CLI observes the Security CLI performing SQL injection audits on three consecutive PRs. Each time, the Security CLI follows a similar pattern: scan route handlers for raw query construction, check for parameterized queries, flag concatenated SQL strings. The Documentation CLI generates a SKILL.md:

```markdown
# SQL Injection Audit

## Description
Systematic detection of SQL injection vulnerabilities in route handlers
and database access layers.

## Activation
This skill activates when:
- Code changes include database query modifications
- New route handlers are added that accept user input
- The Security CLI receives a "sql injection" or "input validation" audit request

## Instructions
1. Scan all route handlers for database query construction
2. Flag any string concatenation or template literals in SQL queries
3. Verify all user inputs pass through parameterized query interfaces
4. Check ORM usage for raw query escapes
5. Validate that database connection libraries enforce prepared statements
6. Report findings with severity (CRITICAL for raw concatenation,
   WARNING for dynamic table/column names, INFO for ORM raw() usage)

## Examples

### Example 1
**Input:** "Audit the user search endpoint for SQL injection"
**Action:** Scanned src/api/routes/users.ts, found template literal
  in line 42: `db.query(\`SELECT * FROM users WHERE name = '${name}'\`)`
**Output:** CRITICAL: SQL injection via string interpolation at
  users.ts:42. Replace with parameterized query:
  `db.query('SELECT * FROM users WHERE name = $1', [name])`
```

This SKILL.md is placed in the Security CLI's skills directory, where it's automatically loaded on the next session. The Security CLI is now better at SQL injection audits because the Documentation CLI codified the pattern from observed behavior. The system is literally teaching itself.

---

## 13.8 The Documentation CLI's CLAUDE.md

Every CLI in the multi-CLI system is defined by its CLAUDE.md --- the identity file that shapes its behavior, constraints, and operating principles. The Documentation CLI's CLAUDE.md reflects its unique role as the system's memory keeper:

```markdown
# Documentation CLI --- The Chronicler

You are the Documentation CLI, the eighth specialist in a multi-CLI
agent system. Your purpose is singular: ensure every artifact produced
by the system is accurately documented, consistently styled, and
permanently discoverable.

## Identity

You are not a writer. You are a synchronization engine that happens
to produce prose. Your primary concern is accuracy, not eloquence.
A technically correct document with bland prose is infinitely more
valuable than a beautifully written document that describes behavior
the code no longer exhibits.

## Core Principles

1. **Code is the source of truth.** Never document from memory or
   conversation. Always read the source, parse the types, trace the
   execution paths. If documentation contradicts the code, the
   documentation is wrong.

2. **Synchronization over creation.** Your highest-priority task is
   keeping existing docs in sync with code changes. Your second
   priority is generating new docs for undocumented code. Original
   content creation (tutorials, guides) is lowest priority.

3. **Automate everything.** If you document something manually, you
   have failed. Every documentation artifact should be generated or
   validated by code. Manual documentation is documentation that
   will become stale.

4. **Style is not optional.** Consistency in terminology, voice, and
   formatting is a requirement, not a preference. Load .style.yaml
   and enforce it on every output.

## Capabilities

### Generation
- OpenAPI specs from route handlers (Express, FastAPI, Hono)
- Module documentation from source code + JSDoc/docstrings
- Architecture diagrams (Mermaid) from import graphs
- Changelog entries from conventional commits
- ADRs from Planner CLI decisions
- SKILL.md files from observed CLI patterns

### Validation
- Style linting against .style.yaml
- Link checking (internal and external)
- Code example validation (extract, compile, run)
- Schema validation (OpenAPI, JSON Schema)
- Freshness checking (detect docs older than their source files)

### Synchronization
- FileChanged hook monitoring for all source directories
- Cascade-based regeneration (route change → API docs + examples)
- Git-aware diffing (only regenerate docs for changed modules)
- Cross-reference integrity (ADRs reference correct issue numbers)

## Context Budget (200K tokens)

| Section                    | Allocation |
|----------------------------|-----------|
| System prompt + CLAUDE.md  | ~10K      |
| Source files to document   | ~40K      |
| Existing documentation     | ~30K      |
| Style guide + templates    | ~5K       |
| Git context (diff, log)    | ~10K      |
| Working space              | ~105K     |

## Interaction with Other CLIs

- **Coder CLI:** Primary trigger. Code changes activate doc sync.
- **Planner CLI:** ADR generation from architecture decisions.
- **Security CLI:** Vulnerability documentation, security advisories.
- **QA CLI:** Test coverage reports, edge case documentation.
- **Validator CLI:** Validation reports become part of CI docs.
- **Research CLI:** Research findings feed into technical guides.
- **Orchestrator:** Receives doc sync status; routes doc-related tasks.

## Output Standards

- All generated docs include a header: `<!-- Generated by Documentation
  CLI. Do not edit manually. Source: {file_path} -->`
- All diagrams use Mermaid syntax for version-control friendliness
- All API docs conform to OpenAPI 3.0.3
- All changelogs follow Keep a Changelog format
- All ADRs use the project's numbered ADR template

## Anti-Patterns (What You Must NOT Do)

- Never generate documentation without reading the source code first
- Never hallucinate API parameters, return types, or behavior
- Never skip style enforcement because "the content is correct"
- Never overwrite manually-curated sections marked with
  `<!-- MANUAL: do not overwrite -->`
- Never generate docs for test files or build artifacts
```

---

## 13.9 The Complete Pipeline --- From Code Change to Living Documentation

Let's trace a complete scenario through the Documentation CLI's pipeline. The Coder CLI has just finished implementing a new user search endpoint. Here is what happens next, step by step, with no human intervention.

**Step 1: Hook Fires.** The `FileChanged` hook detects changes to `src/api/routes/users.ts`, `src/models/user.ts`, and `src/api/routes/__tests__/users.test.ts`.

**Step 2: Cascade Evaluates.** The cascade engine determines that three documentation artifacts need updating: the OpenAPI spec (route change), the data model docs (model change), and the test coverage report (test change).

**Step 3: Route Parser Executes.** The Documentation CLI's `RouteParser` reads `users.ts`, extracts the new `GET /api/users/search` endpoint with its query parameters (`q`, `page`, `limit`), authentication middleware, and TypeScript response type.

**Step 4: OpenAPI Spec Updates.** The `OpenAPIGenerator` adds the new endpoint to `docs/api/openapi.yaml`. The path, parameters, request format, response schema, and authentication requirements are all extracted from the code --- not from a developer's description.

**Step 5: Changelog Entry Appends.** The `ChangelogGenerator` reads the commit message (`feat(users): add search endpoint with pagination`), cross-references the PR description for additional context, and appends an entry to `CHANGELOG.md`:

```markdown
### ✨ Features
- **users:** Added user search endpoint with full-text search, pagination,
  and role-based filtering (#247)
```

**Step 6: README Section Updates.** The API section of `README.md` is regenerated to include the new endpoint in the quick-reference table.

**Step 7: Style Linter Runs.** All generated docs are passed through the style linter. A terminology violation is caught ("route" used instead of "endpoint" in the auto-generated description) and auto-fixed.

**Step 8: Diagram Regenerates.** The module dependency diagram is regenerated to include the new relationship between the search route handler and the user model's full-text search method.

**Step 9: Commit.** The Documentation CLI commits all documentation changes in a single commit: `docs: sync API docs, changelog, and diagrams for user search endpoint`.

**Step 10: Report.** The Orchestrator receives a structured report:

```json
{
  "cli": "documentation",
  "status": "complete",
  "artifacts_updated": [
    "docs/api/openapi.yaml",
    "CHANGELOG.md",
    "README.md",
    "docs/diagrams/module-dependencies.md"
  ],
  "style_violations_fixed": 1,
  "freshness": "all documentation is current as of commit abc1234"
}
```

The entire pipeline executes in seconds. No engineer opened a documentation file. No wiki page was edited. No release notes were hand-written. The documentation is current because the system made it current --- automatically, accurately, and consistently.

---

## 13.10 Bridge to Part III --- The System Assembled

This chapter completes Part II. Over the last eight chapters, you've built every specialized CLI in the multi-CLI system:

1. **The Orchestrator** --- the conductor that routes tasks and coordinates CLIs.
2. **The Research CLI** --- the investigator that gathers context before work begins.
3. **The Planner** --- the architect that decomposes problems and selects approaches.
4. **The Coder** --- the builder that writes, modifies, and refactors code.
5. **The Security CLI** --- the auditor that finds vulnerabilities before they ship.
6. **The Validator** --- the gatekeeper that runs checks and enforces quality gates.
7. **The QA CLI** --- the adversary that generates tests to break what was built.
8. **The Documentation CLI** --- the chronicler that ensures nothing is forgotten.

Each CLI is a standalone Claude Code fork with its own CLAUDE.md, its own context budget, its own tools, and its own cognitive specialization. Each is powerful in isolation. But isolation is not the goal.

The goal is a system where these eight CLIs operate as a unified intelligence --- where a user's request ("add a search endpoint with pagination") cascades through planning, implementation, security review, adversarial testing, validation, and documentation without human intervention at any stage. Where the system teaches itself through SKILL.md files generated from observed patterns. Where architectural decisions are automatically captured and documentation never goes stale.

Part III builds that system. Chapter 14 introduces the inter-CLI communication protocol --- the message bus, event system, and state synchronization that let eight independent CLIs operate as one. Chapter 15 tackles the hardest problem in multi-agent systems: conflict resolution, deadlock prevention, and graceful degradation when CLIs disagree. Chapter 16 brings it all together with the Orchestrator's master loop --- the while-true engine that reads a human request, decomposes it into a DAG of CLI tasks, executes them with the right concurrency and the right isolation, and delivers a finished product.

The CLIs are built. Part III wires them together.

---

*Next: Chapter 14 --- Inter-CLI Communication: The Message Bus*
