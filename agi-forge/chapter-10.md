# Chapter 10: The Security CLI --- The Guardian

---

There is a reason bank vaults don't have doorknobs on the inside.

A vault that can be opened from within is not a vault. It's a room with a heavy door. The entire security model collapses the moment the contents have agency over the containment. This is not a theoretical concern. It's the reason every serious financial institution separates the people who manage assets from the people who audit them. The auditor who can also move money is not an auditor. They're a risk.

The Security CLI is your auditor. It reads everything. It modifies nothing. It runs in its own process, with its own context window, with its own tools --- and every single one of those tools is read-only by design. Not by convention. Not by a comment in the system prompt that says "please don't modify files." By architectural enforcement. The Security CLI's `CLAUDE.md` does not grant write permissions. Its tool interface does not expose file-edit operations. Its bash permissions block every command that could alter state. It is read-only the way a wall is read-only: not because it chooses not to let you through, but because there is no door.

This is the most important architectural decision in the entire multi-CLI system, and it's the one most teams get wrong. They build a security scanner that can also apply fixes. They tell themselves it's more efficient --- why flag a vulnerability and then wait for the Coder CLI to fix it when the Security CLI could just patch it inline? The answer is the same answer the banking industry discovered three centuries ago: because the entity that finds problems must never be the entity that fixes them. The moment your auditor can modify code, you've lost the ability to trust the audit.

You've watched this failure mode in the wild. Security tools that auto-remediate introduce their own vulnerabilities. Dependency bots that auto-merge patches break builds. AI agents that simultaneously analyze and modify code hallucinate fixes that pass their own checks --- because the checker and the fixer share the same context, the same biases, the same blind spots.

The Security CLI has no blind spots about its own work because it does no work that could create them. It analyzes. It reports. It blocks. That's all.

---

## 10.1 Why Read-Only Is a Security Boundary, Not a Limitation

When you first encounter the Security CLI's permission model, your instinct will be to see it as a constraint. Every other CLI in the system can write files, run builds, execute tests. The Security CLI can only read. It feels like you've built the weakest agent in the fleet.

You've built the strongest.

Read-only is not a limitation any more than a judge's inability to arrest people is a limitation. It's the separation of powers. The Security CLI's authority comes precisely from the fact that it cannot be compromised by its own actions. When it reports that `src/auth/jwt.ts:47` contains a hard-coded HMAC secret, you know that finding was not produced by an agent that also modified `src/auth/jwt.ts:47` three turns ago and might be hallucinating consistency with its own edit. The finding is clean. The auditor never touched the code.

This matters more with LLMs than with traditional static analysis tools. Semgrep doesn't hallucinate. ESLint doesn't confabulate. But a Claude Code instance that has been reading, writing, and reasoning about a file for thirty turns develops something analogous to confirmation bias --- it becomes invested in the correctness of its own changes. An independent agent with a fresh context window looking at the same file has no investment. It sees what's there, not what should be there.

### The Permission Architecture

Claude Code's permission system --- the 2,621-line `bashPermissions.ts` and its tree-sitter AST security analysis in `utils/bash/ast.ts` --- already provides the building blocks. The system classifies every bash command through a multi-stage pipeline:

1. **Tree-sitter parse**: The command is parsed into an AST using tree-sitter-bash. If the parse succeeds, the system walks the tree with an explicit allowlist of node types. Any unrecognized node type triggers a `too-complex` classification, which forces a permission prompt.

2. **Security analysis**: Each `SimpleCommand` extracted from the AST has its `argv[0]` matched against permission rules. The system distinguishes between read-only commands (`cat`, `grep`, `find`, `ls`), write commands (`npm install`, `git commit`), and destructive commands (`rm -rf`, `dd`, `git push --force`).

3. **Environment variable stripping**: Safe environment variables (like `NODE_ENV`, `RUST_LOG`) are stripped before matching. Dangerous ones (`PATH`, `LD_PRELOAD`, `PYTHONPATH`) are never stripped --- they elevate the command's risk level because they can alter execution behavior in ways the static analysis cannot detect.

4. **Fail-closed design**: The system's key property, stated explicitly in the source: "We never interpret structure we don't understand. If tree-sitter produces a node we haven't explicitly allowlisted, we refuse to extract argv and the caller must ask the user."

For the Security CLI, we take this architecture and lock it to the most restrictive mode. The CLAUDE.md template (Section 10.8) explicitly configures:

```
Bash(cat:*) allow
Bash(grep:*) allow
Bash(find:*) allow
Bash(rg:*) allow
Bash(wc:*) allow
Bash(head:*) allow
Bash(tail:*) allow
Bash(jq:*) allow
Bash(tree:*) allow
Bash(file:*) allow
Bash(stat:*) allow
Bash(git log:*) allow
Bash(git show:*) allow
Bash(git diff:*) allow
Bash(node --eval:*) allow
Bash(npx semgrep:*) allow
Bash(npx gitleaks:*) allow
Bash(npm audit:*) allow
Bash(pip audit:*) allow
```

Everything else is denied. Not prompted --- *denied*. The Security CLI cannot `git commit`, cannot `npm install`, cannot `echo "text" > file.txt`. It cannot write. Period.

### The Trust Chain

The read-only constraint creates a trust chain that flows in one direction:

```
Coder CLI (writes code)
    ↓ commits to branch
Security CLI (reads code, produces findings)
    ↓ structured JSON report
Orchestrator (reads findings, decides action)
    ↓ dispatch
Coder CLI (fixes what Security CLI found)
    ↓ commits fix
Security CLI (re-scans --- did the fix actually work?)
```

At no point does the entity that found the problem also fix it. At no point does the entity that fixed the problem also verify the fix. The Coder CLI never sees the Security CLI's findings until the Orchestrator reformats them into a task assignment. The Security CLI never sees the Coder CLI's fix until the Orchestrator dispatches a re-scan.

This is not bureaucracy. This is the same separation of concerns that makes compilers trustworthy: the parser doesn't also generate code, the type checker doesn't also optimize, the optimizer doesn't also link. Each phase operates on the output of the previous phase and knows nothing about the internals.

---

## 10.2 The Six-Pass Security Analysis Pipeline

When the Orchestrator dispatches the Security CLI against a codebase --- or more commonly, against a set of changed files from a Coder CLI commit --- the Security CLI runs six analysis passes in sequence. Each pass uses different tools, looks for different vulnerability classes, and produces findings in the same structured format.

Here is the dispatch flow:

```
Orchestrator: "Security CLI, analyze commit abc123 on branch feat/auth-system"
    ↓
Security CLI receives:
  - Branch name
  - Commit SHA (or range)
  - Changed file list
  - Architecture context (from Planner CLI's ADRs)
    ↓
Pass 1: SAST (Static Application Security Testing)
  → Tree-sitter AST pattern scanning
  → Custom Semgrep rules
  → Language-specific vulnerability patterns
    ↓
Pass 2: Secret Scanning
  → Gitleaks integration
  → Custom regex patterns for internal secret formats
  → Entropy analysis for high-entropy strings
    ↓
Pass 3: Dependency Audit
  → npm audit / pip audit / cargo audit
  → CVE database cross-reference
  → License compliance check
  → Outdated package detection
    ↓
Pass 4: OWASP Top 10 Automated Checks
  → One detection tool per vulnerability category
  → Pattern matching against known-bad code constructs
    ↓
Pass 5: STRIDE Threat Modeling
  → Architecture description → threat model generation
  → Data flow analysis
  → Trust boundary identification
    ↓
Pass 6: Compliance Checklist
  → SOC2 / HIPAA / PCI-DSS control mapping
  → Automated evidence collection
  → Gap analysis against framework requirements
    ↓
Structured Finding Report (JSON)
  → Severity-rated findings with CWE references
  → File:line locations
  → Remediation guidance
  → Confidence scores
```

Each pass is implemented as a dedicated tool in the Security CLI's tool interface. Let's build them.

---

## 10.3 Pass 1: SAST --- Tree-Sitter AST Security Pattern Scanning

Static Application Security Testing is the foundation. It's the first pass because it's the fastest and catches the most common vulnerability patterns. Traditional SAST tools --- Semgrep, CodeQL, Checkmarx --- work well for known patterns. But they can't reason about intent, context, or architectural implications the way an LLM can.

The Security CLI combines both: it runs tree-sitter AST analysis for deterministic pattern detection, then uses Claude's reasoning to evaluate the context around each finding. This eliminates the false-positive problem that makes traditional SAST tools unusable at scale --- the "alert fatigue" that causes teams to ignore real findings buried under hundreds of noise alerts.

### How Claude Code's AST Analysis Works

The tree-sitter integration in Claude Code's source (`utils/bash/ast.ts`) demonstrates the pattern we're adapting. The key design properties:

1. **Fail-closed**: Unknown node types are rejected, not ignored. If the parser encounters structure it hasn't been taught to evaluate, it escalates rather than silently passing.

2. **Explicit allowlisting**: Every node type that can appear in a "safe" command is explicitly enumerated. The `STRUCTURAL_TYPES` set contains only `program`, `list`, `pipeline`, and `redirected_statement`. The `SEPARATOR_TYPES` set contains only `&&`, `||`, `|`, `;`, `&`, `|&`, and `\n`. Anything else triggers `too-complex`.

3. **Placeholder substitution**: Command substitutions (`$(...)`) are replaced with `__CMDSUB_OUTPUT__` placeholders, and the inner commands are analyzed separately. This prevents nested command injection from bypassing outer-level analysis.

We adapt this pattern for application code analysis. Instead of analyzing bash commands, we analyze TypeScript, Python, and JavaScript source files for security-relevant patterns:

```typescript
// security-cli/tools/sast-scanner.ts

import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import Python from 'tree-sitter-python';
import JavaScript from 'tree-sitter-javascript';

interface SecurityPattern {
  id: string;
  cwe: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  name: string;
  description: string;
  nodeType: string;
  matchFn: (node: Parser.SyntaxNode, source: string) => boolean;
  remediation: string;
}

// SQL Injection detection via AST pattern matching
const SQL_INJECTION_PATTERNS: SecurityPattern[] = [
  {
    id: 'SAST-001',
    cwe: 'CWE-89',
    severity: 'critical',
    name: 'SQL Injection via String Concatenation',
    description: 'SQL query constructed using string concatenation with user input',
    nodeType: 'template_string',
    matchFn: (node, source) => {
      const text = source.slice(node.startIndex, node.endIndex);
      // Detect template literals containing SQL keywords with interpolation
      const sqlKeywords = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b/i;
      const hasInterpolation = /\$\{[^}]+\}/.test(text);
      return sqlKeywords.test(text) && hasInterpolation;
    },
    remediation: 'Use parameterized queries. Replace string interpolation with query parameters: db.query("SELECT * FROM users WHERE id = $1", [userId])',
  },
  {
    id: 'SAST-002',
    cwe: 'CWE-89',
    severity: 'critical',
    name: 'SQL Injection via String Concatenation (Binary Expression)',
    description: 'SQL query built by concatenating strings with variables',
    nodeType: 'binary_expression',
    matchFn: (node, source) => {
      if (node.childForFieldName('operator')?.text !== '+') return false;
      const fullExpr = source.slice(node.startIndex, node.endIndex);
      const sqlKeywords = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b/i;
      return sqlKeywords.test(fullExpr) && node.descendantsOfType('identifier').length > 0;
    },
    remediation: 'Use parameterized queries or an ORM. Never concatenate user input into SQL strings.',
  },
];

// XSS detection patterns
const XSS_PATTERNS: SecurityPattern[] = [
  {
    id: 'SAST-003',
    cwe: 'CWE-79',
    severity: 'high',
    name: 'Cross-Site Scripting via innerHTML',
    description: 'Dynamic content assigned to innerHTML without sanitization',
    nodeType: 'assignment_expression',
    matchFn: (node, source) => {
      const left = node.childForFieldName('left');
      if (!left) return false;
      const text = source.slice(left.startIndex, left.endIndex);
      return text.includes('innerHTML') || text.includes('outerHTML');
    },
    remediation: 'Use textContent instead of innerHTML, or sanitize with DOMPurify: element.innerHTML = DOMPurify.sanitize(userInput)',
  },
  {
    id: 'SAST-004',
    cwe: 'CWE-79',
    severity: 'high',
    name: 'Cross-Site Scripting via dangerouslySetInnerHTML',
    description: 'React dangerouslySetInnerHTML with potentially unsanitized input',
    nodeType: 'jsx_attribute',
    matchFn: (node, source) => {
      const name = node.childForFieldName('name');
      return name?.text === 'dangerouslySetInnerHTML';
    },
    remediation: 'Sanitize input with DOMPurify before passing to dangerouslySetInnerHTML, or refactor to avoid it entirely.',
  },
];

// Path Traversal detection
const PATH_TRAVERSAL_PATTERNS: SecurityPattern[] = [
  {
    id: 'SAST-005',
    cwe: 'CWE-22',
    severity: 'high',
    name: 'Path Traversal via Unsanitized Input',
    description: 'File path constructed from user input without normalization',
    nodeType: 'call_expression',
    matchFn: (node, source) => {
      const callee = source.slice(
        node.childForFieldName('function')?.startIndex ?? 0,
        node.childForFieldName('function')?.endIndex ?? 0
      );
      const fsOps = ['readFile', 'readFileSync', 'createReadStream',
                     'writeFile', 'writeFileSync', 'open', 'access',
                     'readdir', 'stat', 'unlink', 'rmdir'];
      if (!fsOps.some(op => callee.includes(op))) return false;
      // Check if any argument contains a template literal or concatenation
      const args = node.childForFieldName('arguments');
      if (!args) return false;
      const argText = source.slice(args.startIndex, args.endIndex);
      return /\$\{|req\.|params\.|query\.|body\./.test(argText);
    },
    remediation: 'Normalize paths with path.resolve() and verify they stay within the expected base directory: if (!resolved.startsWith(baseDir)) throw new Error("path traversal")',
  },
];

// The scanner engine
class SASTScanner {
  private parser: Parser;
  private patterns: SecurityPattern[];

  constructor() {
    this.parser = new Parser();
    this.patterns = [
      ...SQL_INJECTION_PATTERNS,
      ...XSS_PATTERNS,
      ...PATH_TRAVERSAL_PATTERNS,
      ...COMMAND_INJECTION_PATTERNS,
      ...CRYPTO_WEAKNESS_PATTERNS,
      ...HARDCODED_SECRET_PATTERNS,
    ];
  }

  async scanFile(filePath: string, source: string): Promise<Finding[]> {
    const lang = this.detectLanguage(filePath);
    if (!lang) return [];

    this.parser.setLanguage(lang);
    const tree = this.parser.parse(source);
    const findings: Finding[] = [];

    // Walk the AST and test every node against every pattern
    const cursor = tree.walk();
    const visit = (): void => {
      const node = cursor.currentNode;

      for (const pattern of this.patterns) {
        if (node.type === pattern.nodeType || pattern.nodeType === '*') {
          if (pattern.matchFn(node, source)) {
            findings.push({
              id: pattern.id,
              cwe: pattern.cwe,
              severity: pattern.severity,
              name: pattern.name,
              description: pattern.description,
              file: filePath,
              line: node.startPosition.row + 1,
              column: node.startPosition.column + 1,
              snippet: source.split('\n').slice(
                Math.max(0, node.startPosition.row - 2),
                node.startPosition.row + 3
              ).join('\n'),
              remediation: pattern.remediation,
              confidence: 0.85,
            });
          }
        }
      }

      // Recurse into children
      if (cursor.gotoFirstChild()) {
        do { visit(); } while (cursor.gotoNextSibling());
        cursor.gotoParent();
      }
    };

    visit();
    return this.deduplicateFindings(findings);
  }

  private detectLanguage(filePath: string): any {
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx'))
      return TypeScript.typescript;
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx'))
      return JavaScript;
    if (filePath.endsWith('.py'))
      return Python;
    return null;
  }

  private deduplicateFindings(findings: Finding[]): Finding[] {
    const seen = new Set<string>();
    return findings.filter(f => {
      const key = `${f.id}:${f.file}:${f.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
```

The critical design decision here is that the tree-sitter AST analysis runs *first*, producing deterministic findings with no hallucination risk. The LLM reasoning layer runs *second*, evaluating each finding in context --- checking whether the SQL concatenation is actually user-controlled, whether the innerHTML assignment uses sanitized data, whether the file path is already validated upstream. This two-stage approach gives you the precision of static analysis with the contextual reasoning of an LLM, without either one's weaknesses dominating.

### Adapting Claude Code's Fail-Closed Pattern

The `parseForSecurityFromAst` function in Claude Code's source uses an explicit allowlist of AST node types. We adapt this principle for our SAST scanner:

```typescript
// security-cli/utils/ast-allowlist.ts

// Node types we know how to analyze for security issues.
// Any node type NOT in this set triggers manual review escalation.
const ANALYZED_NODE_TYPES = new Set([
  // Expressions we can evaluate for taint flow
  'call_expression',
  'assignment_expression',
  'binary_expression',
  'template_string',
  'template_substitution',
  'member_expression',
  'subscript_expression',

  // Declarations we track for data flow
  'variable_declarator',
  'function_declaration',
  'arrow_function',
  'method_definition',

  // Structural nodes we recurse through
  'program',
  'statement_block',
  'if_statement',
  'for_statement',
  'while_statement',
  'try_statement',
  'catch_clause',
  'return_statement',
  'expression_statement',

  // Import tracking (dependency analysis)
  'import_declaration',
  'import_specifier',

  // JSX (for XSS analysis)
  'jsx_element',
  'jsx_attribute',
  'jsx_expression',
]);

function isAnalyzable(node: Parser.SyntaxNode): boolean {
  if (ANALYZED_NODE_TYPES.has(node.type)) return true;
  // Fail-closed: unknown node types get flagged for manual review
  return false;
}
```

This allowlist approach is directly inspired by Claude Code's `bashPermissions.ts` architecture. The principle is identical: if you encounter structure you don't understand, don't guess. Escalate.

---

## 10.4 Pass 2: Secret Scanning with Gitleaks Integration

Secret scanning is the highest-ROI security check. A single leaked API key can cost more than every other vulnerability in the codebase combined. The Security CLI wraps `gitleaks` --- the industry standard for git secret scanning --- and augments it with custom patterns for organization-specific secret formats.

```typescript
// security-cli/tools/secret-scanner.ts

interface SecretScanConfig {
  gitleaksPath: string;
  customPatternsPath: string;
  entropyThreshold: number;
  scanHistory: boolean;  // scan git history, not just current state
  allowlist: string[];   // paths to exclude (e.g., test fixtures)
}

interface SecretFinding {
  id: string;
  rule: string;
  file: string;
  line: number;
  match: string;        // redacted: first 4 chars + "..." + last 4 chars
  entropy: number;
  commit?: string;       // if found in git history
  author?: string;
  date?: string;
  severity: 'critical';  // secrets are always critical
  cwe: 'CWE-798';       // Hard-coded credentials
}

class SecretScanner {
  private config: SecretScanConfig;

  constructor(config: SecretScanConfig) {
    this.config = config;
  }

  async scan(targetPath: string): Promise<SecretFinding[]> {
    const findings: SecretFinding[] = [];

    // Stage 1: Gitleaks scan (current state)
    const gitleaksFindings = await this.runGitleaks(targetPath, false);
    findings.push(...gitleaksFindings);

    // Stage 2: Gitleaks scan (git history) - catches rotated secrets
    if (this.config.scanHistory) {
      const historyFindings = await this.runGitleaks(targetPath, true);
      findings.push(...historyFindings);
    }

    // Stage 3: Custom entropy analysis for unknown secret formats
    const entropyFindings = await this.entropyAnalysis(targetPath);
    findings.push(...entropyFindings);

    return this.deduplicateAndRedact(findings);
  }

  private async runGitleaks(
    targetPath: string,
    scanHistory: boolean
  ): Promise<SecretFinding[]> {
    const args = [
      'detect',
      '--source', targetPath,
      '--report-format', 'json',
      '--report-path', '-',  // stdout
      '--config', this.config.customPatternsPath,
      '--no-banner',
    ];

    if (scanHistory) {
      args.push('--log-opts', '--all');
    } else {
      args.push('--no-git');
    }

    // Execute gitleaks (read-only --- it only reads files and git history)
    const result = await execReadOnly(this.config.gitleaksPath, args);
    return this.parseGitleaksOutput(result.stdout);
  }

  private async entropyAnalysis(targetPath: string): Promise<SecretFinding[]> {
    // Shannon entropy analysis for high-entropy strings that
    // don't match known secret patterns but look suspiciously random
    const findings: SecretFinding[] = [];
    const files = await glob(`${targetPath}/**/*.{ts,js,py,json,yaml,yml,env}`);

    for (const file of files) {
      if (this.config.allowlist.some(p => file.includes(p))) continue;
      const content = await readFile(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        // Extract string literals and check entropy
        const strings = this.extractStringLiterals(lines[i]);
        for (const str of strings) {
          if (str.length < 16) continue;  // too short to be a secret
          const entropy = this.shannonEntropy(str);
          if (entropy > this.config.entropyThreshold) {
            findings.push({
              id: `ENTROPY-${file}:${i + 1}`,
              rule: 'high-entropy-string',
              file,
              line: i + 1,
              match: this.redact(str),
              entropy,
              severity: 'critical',
              cwe: 'CWE-798',
            });
          }
        }
      }
    }
    return findings;
  }

  private shannonEntropy(str: string): number {
    const freq = new Map<string, number>();
    for (const char of str) {
      freq.set(char, (freq.get(char) ?? 0) + 1);
    }
    let entropy = 0;
    for (const count of freq.values()) {
      const p = count / str.length;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  private redact(secret: string): string {
    if (secret.length <= 8) return '****';
    return secret.slice(0, 4) + '...' + secret.slice(-4);
  }
}
```

The custom gitleaks configuration extends the default rules with organization-specific patterns:

```toml
# security-cli/config/gitleaks.toml

title = "Security CLI Custom Rules"

# Extend default rules
[extend]
useDefault = true

# Organization-specific patterns
[[rules]]
id = "internal-api-key"
description = "Internal API key pattern"
regex = '''(?i)INTERNAL[_-]?API[_-]?KEY\s*[=:]\s*['"]?([a-zA-Z0-9_-]{32,})'''
secretGroup = 1
entropy = 3.5

[[rules]]
id = "jwt-private-key-inline"
description = "JWT private key embedded in source"
regex = '''-----BEGIN (RSA |EC )?PRIVATE KEY-----'''

[[rules]]
id = "database-connection-string"
description = "Database connection string with credentials"
regex = '''(?i)(postgres|mysql|mongodb)://[^:]+:[^@]+@'''

# Allowlist for test fixtures and documentation examples
[allowlist]
paths = [
  '''test/fixtures/.*''',
  '''docs/examples/.*''',
  '''.*\.test\.(ts|js|py)$''',
  '''.*\.spec\.(ts|js|py)$''',
]
```

---

## 10.5 Pass 3: Dependency Audit --- CVEs, Outdated Packages, License Compliance

Dependency vulnerabilities account for more production breaches than application-level bugs. The Security CLI's dependency audit goes beyond `npm audit` by combining three checks into one pass:

```typescript
// security-cli/tools/dependency-auditor.ts

interface DependencyFinding {
  id: string;
  type: 'vulnerability' | 'outdated' | 'license';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  package: string;
  currentVersion: string;
  fixedVersion?: string;
  cve?: string;
  cwe?: string;
  advisory?: string;
  license?: string;
  licenseRisk?: string;
  description: string;
  remediation: string;
}

class DependencyAuditor {

  async audit(projectPath: string): Promise<DependencyFinding[]> {
    const findings: DependencyFinding[] = [];
    const ecosystem = await this.detectEcosystem(projectPath);

    // 1. Vulnerability scan (CVEs)
    if (ecosystem.includes('npm')) {
      findings.push(...await this.npmAudit(projectPath));
    }
    if (ecosystem.includes('pip')) {
      findings.push(...await this.pipAudit(projectPath));
    }
    if (ecosystem.includes('cargo')) {
      findings.push(...await this.cargoAudit(projectPath));
    }

    // 2. Outdated package detection
    findings.push(...await this.checkOutdated(projectPath, ecosystem));

    // 3. License compliance
    findings.push(...await this.checkLicenses(projectPath, ecosystem));

    return findings;
  }

  private async npmAudit(projectPath: string): Promise<DependencyFinding[]> {
    // npm audit --json is read-only (does not modify node_modules)
    const result = await execReadOnly('npm', [
      'audit', '--json', '--omit=dev',
      '--prefix', projectPath
    ]);

    const audit = JSON.parse(result.stdout);
    return Object.entries(audit.vulnerabilities ?? {}).map(
      ([pkg, vuln]: [string, any]) => ({
        id: `DEP-CVE-${pkg}-${vuln.via?.[0]?.source ?? 'unknown'}`,
        type: 'vulnerability' as const,
        severity: this.mapNpmSeverity(vuln.severity),
        package: pkg,
        currentVersion: vuln.range,
        fixedVersion: vuln.fixAvailable?.version,
        cve: vuln.via?.[0]?.cve,
        cwe: vuln.via?.[0]?.cwe?.join(', '),
        advisory: vuln.via?.[0]?.url,
        description: vuln.via?.[0]?.title ?? 'Known vulnerability',
        remediation: vuln.fixAvailable
          ? `Update ${pkg} to ${vuln.fixAvailable.version}: npm update ${pkg}`
          : `No fix available. Consider replacing ${pkg} with an alternative.`,
      })
    );
  }

  private async checkLicenses(
    projectPath: string,
    ecosystem: string[]
  ): Promise<DependencyFinding[]> {
    const findings: DependencyFinding[] = [];

    // Copyleft licenses that may be problematic for commercial use
    const riskyLicenses: Record<string, string> = {
      'GPL-2.0': 'Copyleft — requires derivative works to be GPL-licensed',
      'GPL-3.0': 'Strong copyleft — requires derivative works to be GPL-3.0',
      'AGPL-3.0': 'Network copyleft — server use triggers distribution',
      'SSPL-1.0': 'Server-side copyleft — controversial license',
      'EUPL-1.2': 'European copyleft',
      'CC-BY-SA-4.0': 'Share-alike — derivatives must use same license',
    };

    // No-license packages are the highest risk
    const noLicenseRisk = 'No license declared — legally all rights reserved';

    if (ecosystem.includes('npm')) {
      const result = await execReadOnly('npx', [
        'license-checker', '--json', '--start', projectPath
      ]);
      const licenses = JSON.parse(result.stdout);

      for (const [pkg, info] of Object.entries(licenses) as any) {
        const license = info.licenses;
        if (!license || license === 'UNKNOWN') {
          findings.push({
            id: `DEP-LIC-${pkg}`,
            type: 'license',
            severity: 'high',
            package: pkg,
            currentVersion: info.version ?? 'unknown',
            license: 'NONE',
            licenseRisk: noLicenseRisk,
            description: `Package ${pkg} has no declared license`,
            remediation: `Contact ${pkg} maintainer or replace with a licensed alternative`,
          });
        } else if (riskyLicenses[license]) {
          findings.push({
            id: `DEP-LIC-${pkg}`,
            type: 'license',
            severity: 'medium',
            package: pkg,
            currentVersion: info.version ?? 'unknown',
            license,
            licenseRisk: riskyLicenses[license],
            description: `Package ${pkg} uses ${license}: ${riskyLicenses[license]}`,
            remediation: `Review license compatibility. If distributing, ensure compliance with ${license} terms.`,
          });
        }
      }
    }

    return findings;
  }
}
```

The dependency auditor is deliberately conservative. It flags `AGPL-3.0` packages even in internal tools because license compliance requirements can change when internal tools become products --- and by the time that transition happens, the dependency is deeply embedded. Better to know now.

---

## 10.6 Pass 4: OWASP Top 10 Automated Checks

The OWASP Top 10 is the industry standard for web application security risks. The Security CLI implements one dedicated detection tool per category, each with pattern-matching rules tuned for the languages in your stack. This isn't a checkbox exercise. Each tool contains the accumulated knowledge of how these vulnerabilities actually manifest in production code --- not the textbook examples, but the real-world variants that slip past manual reviews.

```typescript
// security-cli/tools/owasp-checker.ts

interface OWASPCategory {
  id: string;          // e.g., "A01:2021"
  name: string;
  cwe_range: string[];
  patterns: DetectionPattern[];
}

interface DetectionPattern {
  language: 'typescript' | 'python' | 'javascript' | 'all';
  pattern: RegExp | ((ast: Parser.Tree, source: string) => Finding[]);
  description: string;
  falsePositiveHints: string[];
}

const OWASP_TOP_10: OWASPCategory[] = [
  {
    id: 'A01:2021',
    name: 'Broken Access Control',
    cwe_range: ['CWE-200', 'CWE-201', 'CWE-352', 'CWE-284', 'CWE-285',
                'CWE-639', 'CWE-862', 'CWE-863'],
    patterns: [
      {
        language: 'typescript',
        pattern: /app\.(get|post|put|delete|patch)\s*\([^)]*(?!.*auth|.*middleware|.*protect|.*guard|.*verify)/,
        description: 'Route handler without authentication middleware',
        falsePositiveHints: ['Public endpoints (health, login) are expected'],
      },
      {
        language: 'typescript',
        pattern: /req\.params\.\w+.*(?:findById|findOne|getById|load)/,
        description: 'Direct object reference from URL parameter without ownership check',
        falsePositiveHints: ['Admin-only endpoints may legitimately skip ownership'],
      },
      {
        language: 'python',
        pattern: /@app\.route\([^)]+\)\s*\ndef\s+\w+\([^)]*\)(?:(?!@login_required|@auth|@requires_auth)[\s\S])*?:/,
        description: 'Flask route without authentication decorator',
        falsePositiveHints: ['Public routes are expected for login/register'],
      },
    ],
  },
  {
    id: 'A02:2021',
    name: 'Cryptographic Failures',
    cwe_range: ['CWE-259', 'CWE-327', 'CWE-331', 'CWE-798'],
    patterns: [
      {
        language: 'all',
        pattern: /(?:md5|sha1|SHA1|MD5)\s*\(/,
        description: 'Use of deprecated hash function (MD5/SHA1)',
        falsePositiveHints: ['Non-security contexts like checksums may be acceptable'],
      },
      {
        language: 'all',
        pattern: /(?:DES|RC4|Blowfish|3DES)(?:\s|['"])/i,
        description: 'Use of deprecated encryption algorithm',
        falsePositiveHints: ['Legacy system interop may require deprecated algorithms'],
      },
      {
        language: 'typescript',
        pattern: /createCipher\s*\(/,
        description: 'crypto.createCipher() uses weak key derivation --- use createCipheriv()',
        falsePositiveHints: [],
      },
      {
        language: 'python',
        pattern: /(?:AES\.new|DES\.new)\s*\([^,]+,\s*(?:AES|DES)\.MODE_ECB/,
        description: 'ECB mode encryption leaks patterns in ciphertext',
        falsePositiveHints: [],
      },
    ],
  },
  {
    id: 'A03:2021',
    name: 'Injection',
    cwe_range: ['CWE-79', 'CWE-89', 'CWE-73', 'CWE-77', 'CWE-78'],
    patterns: [
      {
        language: 'typescript',
        pattern: /exec\s*\(\s*`[^`]*\$\{/,
        description: 'Command injection via template literal in exec()',
        falsePositiveHints: [],
      },
      {
        language: 'python',
        pattern: /os\.system\s*\(\s*f['"]|subprocess\.\w+\(\s*f['"]|eval\s*\(/,
        description: 'Command/code injection via f-string in os.system/subprocess/eval',
        falsePositiveHints: [],
      },
      {
        language: 'typescript',
        pattern: /\$\(.*\)\.\s*html\s*\(|\.html\s*\(\s*[^'"<]/,
        description: 'jQuery .html() with potentially unsanitized input',
        falsePositiveHints: ['Static HTML strings are safe'],
      },
    ],
  },
  {
    id: 'A04:2021',
    name: 'Insecure Design',
    cwe_range: ['CWE-209', 'CWE-256', 'CWE-501', 'CWE-522'],
    patterns: [
      {
        language: 'all',
        pattern: /(?:password|secret|token|apikey|api_key)\s*[:=]\s*['"][^'"]{3,}['"]/i,
        description: 'Hardcoded credential in source code',
        falsePositiveHints: ['Test fixtures may contain test credentials'],
      },
      {
        language: 'typescript',
        pattern: /catch\s*\(\w+\)\s*\{[^}]*res\.\w+\(\s*(?:err|error|e)\s*[.)]/,
        description: 'Stack trace or error details exposed to client',
        falsePositiveHints: ['Development-only error handlers'],
      },
    ],
  },
  {
    id: 'A05:2021',
    name: 'Security Misconfiguration',
    cwe_range: ['CWE-16', 'CWE-611', 'CWE-1004'],
    patterns: [
      {
        language: 'typescript',
        pattern: /cors\s*\(\s*\{[^}]*origin\s*:\s*(?:true|['"]?\*['"]?)/,
        description: 'CORS configured to allow all origins',
        falsePositiveHints: ['Public APIs may intentionally allow all origins'],
      },
      {
        language: 'all',
        pattern: /(?:debug|DEBUG)\s*[:=]\s*(?:true|True|1|'1'|"1")/,
        description: 'Debug mode enabled --- may expose sensitive information',
        falsePositiveHints: ['Development configuration files'],
      },
      {
        language: 'typescript',
        pattern: /helmet\s*\(\s*\)|(?!.*helmet)app\.listen/,
        description: 'Express app without Helmet security headers',
        falsePositiveHints: ['Headers may be set at reverse proxy level'],
      },
    ],
  },
  {
    id: 'A06:2021',
    name: 'Vulnerable and Outdated Components',
    cwe_range: ['CWE-1035', 'CWE-1104'],
    patterns: [
      // Handled by dependency auditor (Pass 3)
      // This category cross-references findings from the dep audit
    ],
  },
  {
    id: 'A07:2021',
    name: 'Identification and Authentication Failures',
    cwe_range: ['CWE-287', 'CWE-384', 'CWE-256', 'CWE-307'],
    patterns: [
      {
        language: 'typescript',
        pattern: /(?:session|cookie).*(?:secure\s*:\s*false|httpOnly\s*:\s*false|sameSite\s*:\s*['"]?none)/i,
        description: 'Session/cookie misconfiguration (missing secure/httpOnly/sameSite)',
        falsePositiveHints: ['Development environments may disable secure flag'],
      },
      {
        language: 'all',
        pattern: /(?:bcrypt|argon2|scrypt|pbkdf2).*rounds?\s*[:=]\s*(\d+)/,
        description: 'Password hashing with potentially insufficient rounds',
        falsePositiveHints: ['Check if rounds meet current recommendations'],
      },
      {
        language: 'typescript',
        pattern: /jwt\.sign\s*\([^)]*expiresIn\s*:\s*['"](\d+[dhms])['"].*(?:3600[1-9]|[4-9]\d{3}|[1-9]\d{4,}).*\)/,
        description: 'JWT with excessive expiration time',
        falsePositiveHints: ['Refresh tokens may intentionally have long expiry'],
      },
    ],
  },
  {
    id: 'A08:2021',
    name: 'Software and Data Integrity Failures',
    cwe_range: ['CWE-345', 'CWE-353', 'CWE-426', 'CWE-494', 'CWE-502'],
    patterns: [
      {
        language: 'python',
        pattern: /pickle\.load|yaml\.load\s*\([^)]*(?!Loader|SafeLoader)/,
        description: 'Deserialization of untrusted data (pickle/unsafe yaml)',
        falsePositiveHints: [],
      },
      {
        language: 'typescript',
        pattern: /JSON\.parse\s*\(\s*(?:req\.|request\.|body|params|query)/,
        description: 'JSON.parse on raw request data without schema validation',
        falsePositiveHints: ['If validated by Zod/Joi/Yup downstream'],
      },
    ],
  },
  {
    id: 'A09:2021',
    name: 'Security Logging and Monitoring Failures',
    cwe_range: ['CWE-117', 'CWE-223', 'CWE-532', 'CWE-778'],
    patterns: [
      {
        language: 'all',
        pattern: /console\.\w+\s*\(.*(?:password|secret|token|apikey|api_key|credit.?card)/i,
        description: 'Sensitive data potentially written to logs',
        falsePositiveHints: ['Logging field names vs. values'],
      },
      {
        language: 'typescript',
        pattern: /(?:login|auth|signin).*(?:catch|error|fail)(?:(?!log|audit|track|record)[\s\S]){0,200}$/m,
        description: 'Authentication failure not logged for monitoring',
        falsePositiveHints: ['Logging may occur in middleware or error handler'],
      },
    ],
  },
  {
    id: 'A10:2021',
    name: 'Server-Side Request Forgery (SSRF)',
    cwe_range: ['CWE-918'],
    patterns: [
      {
        language: 'typescript',
        pattern: /(?:fetch|axios|got|request|http\.get)\s*\(\s*(?:req\.|params\.|query\.|body\.|\$\{)/,
        description: 'HTTP request with user-controlled URL (SSRF risk)',
        falsePositiveHints: ['If URL is validated against an allowlist'],
      },
      {
        language: 'python',
        pattern: /requests\.(?:get|post|put|delete)\s*\(\s*(?:request\.|f['"]\{)/,
        description: 'HTTP request with user-controlled URL (SSRF risk)',
        falsePositiveHints: ['If URL domain is validated against allowlist'],
      },
    ],
  },
];
```

Each OWASP category checker produces findings in the same structured format. The key value of implementing these as separate tools rather than one monolithic scanner is traceability --- when the Orchestrator receives a finding tagged `A03:2021`, it knows exactly which category produced it, which CWE references apply, and what the standard remediation approach is. This structured classification is what enables the Security Gate Protocol in Section 10.9.

---

## 10.7 Pass 5: STRIDE Threat Modeling Automation

STRIDE threat modeling is the highest-level analysis the Security CLI performs. While passes 1--4 look at code-level details, STRIDE looks at architectural decisions --- the kind of decisions the Planner CLI made in Chapter 8 and the Coder CLI implemented in Chapter 9.

The input to STRIDE analysis is the Architecture Decision Records (ADRs) and the component diagram from the Planner CLI's output. The Security CLI reads these artifacts, identifies trust boundaries, data flows, and entry points, then systematically evaluates each component against the six STRIDE threat categories.

```typescript
// security-cli/tools/stride-modeler.ts

interface STRIDECategory {
  id: string;
  name: string;
  question: string;
  mitigations: string[];
}

const STRIDE_CATEGORIES: STRIDECategory[] = [
  {
    id: 'S',
    name: 'Spoofing',
    question: 'Can an attacker pretend to be this component or user?',
    mitigations: ['Authentication', 'Digital signatures', 'MFA',
                  'Certificate pinning', 'API key rotation'],
  },
  {
    id: 'T',
    name: 'Tampering',
    question: 'Can an attacker modify data in transit or at rest?',
    mitigations: ['Input validation', 'Integrity checks (HMAC/signatures)',
                  'TLS', 'Immutable audit logs', 'Database constraints'],
  },
  {
    id: 'R',
    name: 'Repudiation',
    question: 'Can an attacker deny performing an action?',
    mitigations: ['Audit logging', 'Digital signatures', 'Timestamps',
                  'Non-repudiation protocols', 'Tamper-evident logs'],
  },
  {
    id: 'I',
    name: 'Information Disclosure',
    question: 'Can an attacker access data they should not see?',
    mitigations: ['Encryption at rest', 'Encryption in transit',
                  'Access control', 'Data masking', 'Principle of least privilege'],
  },
  {
    id: 'D',
    name: 'Denial of Service',
    question: 'Can an attacker prevent legitimate users from accessing the system?',
    mitigations: ['Rate limiting', 'Input size limits', 'Circuit breakers',
                  'CDN/WAF', 'Auto-scaling', 'Graceful degradation'],
  },
  {
    id: 'E',
    name: 'Elevation of Privilege',
    question: 'Can an attacker gain higher access than authorized?',
    mitigations: ['Principle of least privilege', 'Role-based access control',
                  'Input validation', 'Sandboxing', 'Separation of duties'],
  },
];

interface ThreatModelInput {
  components: ArchitectureComponent[];
  dataFlows: DataFlow[];
  trustBoundaries: TrustBoundary[];
  entryPoints: EntryPoint[];
}

interface ArchitectureComponent {
  name: string;
  type: 'web-app' | 'api' | 'database' | 'queue' | 'cache'
       | 'external-service' | 'file-storage' | 'worker';
  description: string;
  technologies: string[];
  authRequired: boolean;
  dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
}

interface DataFlow {
  from: string;
  to: string;
  protocol: string;
  data: string;
  encrypted: boolean;
  authenticated: boolean;
}

interface TrustBoundary {
  name: string;
  components: string[];
  description: string;
}

interface Threat {
  id: string;
  strideCategory: string;
  component: string;
  dataFlow?: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  likelihood: 'certain' | 'likely' | 'possible' | 'unlikely' | 'rare';
  impact: string;
  mitigations: string[];
  status: 'identified' | 'mitigated' | 'accepted' | 'transferred';
}

class STRIDEModeler {

  async generateThreatModel(input: ThreatModelInput): Promise<Threat[]> {
    const threats: Threat[] = [];

    // For each component, evaluate all 6 STRIDE categories
    for (const component of input.components) {
      for (const category of STRIDE_CATEGORIES) {
        const componentThreats = this.evaluateComponent(
          component, category, input
        );
        threats.push(...componentThreats);
      }
    }

    // For each data flow crossing a trust boundary, evaluate threats
    for (const flow of input.dataFlows) {
      if (this.crossesTrustBoundary(flow, input.trustBoundaries)) {
        const flowThreats = this.evaluateDataFlow(flow, input);
        threats.push(...flowThreats);
      }
    }

    return this.prioritize(threats);
  }

  private evaluateComponent(
    component: ArchitectureComponent,
    category: STRIDECategory,
    input: ThreatModelInput
  ): Threat[] {
    const threats: Threat[] = [];

    // Spoofing checks
    if (category.id === 'S' && !component.authRequired) {
      threats.push({
        id: `STRIDE-${category.id}-${component.name}`,
        strideCategory: category.name,
        component: component.name,
        description: `${component.name} does not require authentication. `
          + `${category.question}`,
        severity: component.dataClassification === 'restricted'
          ? 'critical' : 'high',
        likelihood: 'likely',
        impact: `Unauthorized access to ${component.type} handling `
          + `${component.dataClassification} data`,
        mitigations: category.mitigations,
        status: 'identified',
      });
    }

    // Information Disclosure for sensitive data stores
    if (category.id === 'I'
        && component.type === 'database'
        && component.dataClassification !== 'public') {
      const flows = input.dataFlows.filter(f => f.to === component.name);
      const unencrypted = flows.filter(f => !f.encrypted);
      if (unencrypted.length > 0) {
        threats.push({
          id: `STRIDE-${category.id}-${component.name}-unencrypted`,
          strideCategory: category.name,
          component: component.name,
          dataFlow: unencrypted.map(f => `${f.from}→${f.to}`).join(', '),
          description: `${component.name} receives ${component.dataClassification} `
            + `data over unencrypted channels: ${unencrypted.map(f => f.protocol).join(', ')}`,
          severity: 'critical',
          likelihood: 'possible',
          impact: `${component.dataClassification} data interceptable in transit`,
          mitigations: ['Enable TLS for all database connections',
                       'Use encrypted connection strings',
                       'Implement mutual TLS for service-to-database traffic'],
          status: 'identified',
        });
      }
    }

    // Denial of Service for entry points
    if (category.id === 'D'
        && (component.type === 'web-app' || component.type === 'api')) {
      const inboundFlows = input.dataFlows.filter(
        f => f.to === component.name
      );
      const entryPoint = input.entryPoints.find(
        e => e.component === component.name
      );
      if (entryPoint && !entryPoint.rateLimited) {
        threats.push({
          id: `STRIDE-${category.id}-${component.name}-no-ratelimit`,
          strideCategory: category.name,
          component: component.name,
          description: `${component.name} exposes ${entryPoint.protocol} `
            + `endpoint without rate limiting`,
          severity: 'high',
          likelihood: 'likely',
          impact: 'Service degradation or outage under volumetric attack',
          mitigations: ['Implement rate limiting per IP/user',
                       'Add request size limits',
                       'Deploy WAF with DDoS protection',
                       'Implement circuit breakers for downstream services'],
          status: 'identified',
        });
      }
    }

    // Elevation of Privilege for multi-tenant components
    if (category.id === 'E'
        && component.authRequired
        && component.dataClassification !== 'public') {
      threats.push({
        id: `STRIDE-${category.id}-${component.name}-tenant-isolation`,
        strideCategory: category.name,
        component: component.name,
        description: `Verify ${component.name} enforces tenant isolation. `
          + `${category.question}`,
        severity: 'high',
        likelihood: 'possible',
        impact: 'Cross-tenant data access or privilege escalation',
        mitigations: ['Row-level security in database',
                     'Tenant ID validation on every query',
                     'Separate encryption keys per tenant',
                     'Automated tenant isolation tests'],
        status: 'identified',
      });
    }

    return threats;
  }

  private crossesTrustBoundary(
    flow: DataFlow,
    boundaries: TrustBoundary[]
  ): boolean {
    for (const boundary of boundaries) {
      const fromInside = boundary.components.includes(flow.from);
      const toInside = boundary.components.includes(flow.to);
      if (fromInside !== toInside) return true;
    }
    return false;
  }

  private evaluateDataFlow(
    flow: DataFlow,
    input: ThreatModelInput
  ): Threat[] {
    const threats: Threat[] = [];

    if (!flow.encrypted) {
      threats.push({
        id: `STRIDE-T-flow-${flow.from}-${flow.to}`,
        strideCategory: 'Tampering',
        component: `${flow.from} → ${flow.to}`,
        dataFlow: `${flow.from} → ${flow.to}`,
        description: `Data flow carries ${flow.data} via ${flow.protocol} `
          + `without encryption. Crossing trust boundary.`,
        severity: 'critical',
        likelihood: 'likely',
        impact: 'Data tampering or interception in transit',
        mitigations: ['Enable TLS 1.3', 'Implement message signing',
                     'Use mutual TLS between services'],
        status: 'identified',
      });
    }

    if (!flow.authenticated) {
      threats.push({
        id: `STRIDE-S-flow-${flow.from}-${flow.to}`,
        strideCategory: 'Spoofing',
        component: `${flow.from} → ${flow.to}`,
        dataFlow: `${flow.from} → ${flow.to}`,
        description: `Data flow from ${flow.from} to ${flow.to} is not `
          + `authenticated. Any component could impersonate ${flow.from}.`,
        severity: 'high',
        likelihood: 'possible',
        impact: `Unauthorized data injection into ${flow.to}`,
        mitigations: ['Service-to-service authentication (mTLS, JWT)',
                     'API key rotation', 'IP allowlisting'],
        status: 'identified',
      });
    }

    return threats;
  }

  private prioritize(threats: Threat[]): Threat[] {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return threats.sort((a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity]
    );
  }
}
```

The STRIDE modeler produces a complete threat model from architecture descriptions. The Orchestrator feeds it the Planner CLI's ADRs and component diagrams; it returns a prioritized list of threats that maps directly to engineering work. Each threat becomes a potential task for the Coder CLI: "Implement rate limiting on the API gateway" or "Enable TLS for the database connection."

This is where the multi-CLI architecture pays compound dividends. The Planner designed the architecture. The Coder implemented it. The Security CLI threat-modeled it. The findings feed back to the Orchestrator, which dispatches fixes to the Coder, which get re-scanned by the Security CLI. The loop closes. No single agent carries the full context. Each specialist does its job.

---

## 10.8 Pass 6: Compliance Framework Automation

Compliance is where security meets bureaucracy --- and where automation delivers the most relief. SOC2, HIPAA, PCI-DSS: each framework defines hundreds of controls, most of which map to technical implementations that can be verified programmatically. The Security CLI doesn't replace your compliance team. It gives them evidence.

```typescript
// security-cli/tools/compliance-checker.ts

interface ComplianceControl {
  id: string;            // e.g., "SOC2-CC6.1"
  framework: 'SOC2' | 'HIPAA' | 'PCI-DSS';
  name: string;
  description: string;
  automatable: boolean;
  checkFn?: (projectPath: string) => Promise<ComplianceResult>;
  evidence: string[];     // what artifacts prove compliance
}

interface ComplianceResult {
  controlId: string;
  status: 'pass' | 'fail' | 'partial' | 'manual-review';
  evidence: string[];
  gaps: string[];
  remediation?: string;
}

// SOC2 Common Criteria — automated controls
const SOC2_CONTROLS: ComplianceControl[] = [
  {
    id: 'SOC2-CC6.1',
    framework: 'SOC2',
    name: 'Logical Access Security',
    description: 'The entity implements logical access security software, '
      + 'infrastructure, and architectures over protected information assets.',
    automatable: true,
    checkFn: async (projectPath) => {
      const evidence: string[] = [];
      const gaps: string[] = [];

      // Check: Authentication middleware exists
      const authFiles = await glob(`${projectPath}/**/auth/**/*.{ts,js,py}`);
      if (authFiles.length > 0) {
        evidence.push(`Auth module found: ${authFiles.length} files`);
      } else {
        gaps.push('No authentication module detected');
      }

      // Check: RBAC or permission system exists
      const rbacFiles = await glob(
        `${projectPath}/**/*{permission,role,rbac,policy}*.{ts,js,py}`
      );
      if (rbacFiles.length > 0) {
        evidence.push(`RBAC/permission system: ${rbacFiles.length} files`);
      } else {
        gaps.push('No role-based access control system detected');
      }

      // Check: Session management with expiry
      const sessionRefs = await grep(projectPath, /session.*expir|token.*expir|maxAge/i);
      if (sessionRefs.length > 0) {
        evidence.push(`Session expiry configured: ${sessionRefs.length} references`);
      } else {
        gaps.push('No session/token expiry configuration detected');
      }

      return {
        controlId: 'SOC2-CC6.1',
        status: gaps.length === 0 ? 'pass'
              : gaps.length < 2 ? 'partial' : 'fail',
        evidence,
        gaps,
        remediation: gaps.length > 0
          ? 'Implement: ' + gaps.join('; ') : undefined,
      };
    },
    evidence: ['Authentication module', 'RBAC system', 'Session management'],
  },
  {
    id: 'SOC2-CC6.6',
    framework: 'SOC2',
    name: 'Encryption of Data in Transit',
    description: 'The entity implements controls to prevent unauthorized access '
      + 'to data transmitted over networks.',
    automatable: true,
    checkFn: async (projectPath) => {
      const evidence: string[] = [];
      const gaps: string[] = [];

      // Check: TLS/HTTPS configuration
      const tlsRefs = await grep(projectPath, /https|TLS|ssl|cert|certificate/i);
      if (tlsRefs.length > 0) {
        evidence.push(`TLS/SSL references: ${tlsRefs.length} files`);
      } else {
        gaps.push('No TLS/SSL configuration detected');
      }

      // Check: No HTTP (unencrypted) URLs in production config
      const httpUrls = await grep(
        projectPath,
        /http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/
      );
      if (httpUrls.length > 0) {
        gaps.push(`${httpUrls.length} non-localhost HTTP URLs found`);
      } else {
        evidence.push('No unencrypted external HTTP URLs');
      }

      return {
        controlId: 'SOC2-CC6.6',
        status: gaps.length === 0 ? 'pass' : 'fail',
        evidence,
        gaps,
      };
    },
    evidence: ['TLS configuration', 'Certificate management', 'HSTS headers'],
  },
  {
    id: 'SOC2-CC8.1',
    framework: 'SOC2',
    name: 'Change Management',
    description: 'The entity authorizes, designs, develops or acquires, '
      + 'configures, documents, tests, approves, and implements changes.',
    automatable: true,
    checkFn: async (projectPath) => {
      const evidence: string[] = [];
      const gaps: string[] = [];

      // Check: CI/CD pipeline exists
      const ciFiles = await glob(
        `${projectPath}/**/{.github/workflows,.gitlab-ci,Jenkinsfile,`
        + `azure-pipelines,bitbucket-pipelines}*`
      );
      if (ciFiles.length > 0) {
        evidence.push(`CI/CD pipeline: ${ciFiles.map(f => f).join(', ')}`);
      } else {
        gaps.push('No CI/CD pipeline configuration detected');
      }

      // Check: Branch protection / PR-required workflow
      const prTemplates = await glob(
        `${projectPath}/**/{pull_request_template,PULL_REQUEST_TEMPLATE}*`
      );
      if (prTemplates.length > 0) {
        evidence.push('PR template found');
      }

      // Check: Test suite exists
      const testFiles = await glob(
        `${projectPath}/**/*.{test,spec}.{ts,js,py}`
      );
      if (testFiles.length > 0) {
        evidence.push(`Test suite: ${testFiles.length} test files`);
      } else {
        gaps.push('No automated test suite detected');
      }

      return {
        controlId: 'SOC2-CC8.1',
        status: gaps.length === 0 ? 'pass'
              : gaps.length < 2 ? 'partial' : 'fail',
        evidence,
        gaps,
      };
    },
    evidence: ['CI/CD pipeline', 'PR process', 'Test coverage'],
  },
];
```

The compliance checker generates a report that maps every control to concrete evidence from the codebase. When your compliance team asks "How do we prove CC6.1?", the Security CLI has already gathered the evidence: authentication module paths, RBAC file counts, session configuration references. This is not a substitute for the compliance audit. It's the pre-work that makes the audit take one day instead of one week.

---

## 10.9 The Structured Finding Format

Every finding from every pass uses the same JSON format. This is not optional. The Orchestrator needs a consistent schema to make automated decisions --- which findings block deployment, which get assigned to the Coder CLI, which get logged for tracking.

```typescript
// security-cli/types/finding.ts

interface SecurityFinding {
  // Identification
  id: string;                    // Unique finding ID (e.g., "SAST-001-jwt.ts-47")
  pass: 'sast' | 'secrets' | 'dependencies' | 'owasp' | 'stride' | 'compliance';
  tool: string;                  // Tool that produced the finding

  // Classification
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: number;            // 0.0 - 1.0
  cwe?: string;                  // CWE reference (e.g., "CWE-89")
  owasp?: string;                // OWASP category (e.g., "A03:2021")
  stride?: string;               // STRIDE category (e.g., "Tampering")
  complianceControl?: string;    // Compliance control (e.g., "SOC2-CC6.1")

  // Location
  file?: string;                 // File path
  line?: number;                 // Line number
  column?: number;               // Column number
  component?: string;            // Architectural component name
  dataFlow?: string;             // Data flow path

  // Details
  name: string;                  // Short finding name
  description: string;           // Full description
  snippet?: string;              // Code snippet (3-5 lines of context)
  remediation: string;           // How to fix it

  // Metadata
  timestamp: string;             // ISO 8601
  scanId: string;                // Scan session identifier
  commitSha?: string;            // Git commit that introduced the issue
  firstSeen?: string;            // When this finding first appeared
}

// The complete scan report
interface SecurityScanReport {
  scanId: string;
  timestamp: string;
  target: {
    branch: string;
    commitSha: string;
    changedFiles: string[];
  };
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    passRate: Record<string, number>;   // findings per pass
  };
  findings: SecurityFinding[];
  compliance: {
    framework: string;
    controlsChecked: number;
    controlsPassed: number;
    controlsFailed: number;
    results: ComplianceResult[];
  }[];
  recommendation: 'block' | 'warn' | 'pass';
  blockReasons?: string[];       // why deployment should be blocked
}
```

This structured format enables the Orchestrator to make programmatic decisions. A `recommendation: 'block'` with `blockReasons: ['2 critical findings in authentication module']` is not ambiguous. It does not require interpretation. The Orchestrator reads the recommendation and acts accordingly.

---

## 10.10 The Complete Security CLI CLAUDE.md

Here is the complete system prompt template for the Security CLI. This is the file that defines the agent's identity, permissions, tools, and behavior:

```markdown
# CLAUDE.md — Security CLI (The Guardian)

## Identity
You are the Security CLI in a multi-CLI AGI system. Your role is
security analysis ONLY. You audit code, architecture, and configuration
for vulnerabilities, compliance gaps, and security risks.

## CRITICAL: READ-ONLY PERMISSIONS
You CANNOT modify any files. You CANNOT write to disk.
You CANNOT execute commands that alter system state.
This is a security boundary, not a limitation.

Your analysis is trusted BECAUSE you cannot modify what you analyze.
Separation of duties: the entity that audits must never be the entity
that implements.

## Allowed Commands (Read-Only)
```
Bash(cat:*) allow
Bash(grep:*) allow
Bash(rg:*) allow
Bash(find:*) allow
Bash(head:*) allow
Bash(tail:*) allow
Bash(wc:*) allow
Bash(jq:*) allow
Bash(tree:*) allow
Bash(file:*) allow
Bash(stat:*) allow
Bash(ls:*) allow
Bash(git log:*) allow
Bash(git show:*) allow
Bash(git diff:*) allow
Bash(git blame:*) allow
Bash(git rev-parse:*) allow
Bash(node --eval:*) allow
Bash(npx semgrep:*) allow
Bash(npx gitleaks:*) allow
Bash(npm audit:*) allow
Bash(pip audit:*) allow
Bash(cargo audit:*) allow
```

## Denied Commands (Everything Else)
All commands not explicitly listed above are DENIED.
This includes but is not limited to:
- File write operations (echo >, tee, cp, mv, sed -i, etc.)
- Package installation (npm install, pip install, etc.)
- Git operations that modify state (commit, push, merge, etc.)
- Build commands (npm run build, make, cargo build, etc.)
- Any command with output redirection (>, >>)

## Analysis Pipeline
Execute the six-pass analysis in this order:
1. SAST — Tree-sitter AST pattern scanning
2. Secrets — Gitleaks + entropy analysis
3. Dependencies — CVE + license + outdated
4. OWASP — Top 10 category checks
5. STRIDE — Threat model from architecture docs
6. Compliance — SOC2/HIPAA/PCI-DSS control mapping

## Output Format
Return ALL findings as a JSON SecurityScanReport. Every finding MUST
include: id, severity, confidence, file:line (or component), CWE
reference, description, and remediation.

## Severity Definitions
- critical: Exploitable vulnerability, data breach risk, or leaked secret
- high: Significant security weakness requiring immediate fix
- medium: Security concern that should be addressed in current sprint
- low: Best-practice deviation or defense-in-depth improvement
- info: Observation or recommendation, no immediate risk

## Recommendation Rules
- If ANY critical finding exists: recommendation = "block"
- If 3+ high findings exist: recommendation = "block"
- If ANY high finding exists: recommendation = "warn"
- Otherwise: recommendation = "pass"

## Behavior Rules
- Never suggest "this is probably fine" — if there is doubt, flag it
- Always include remediation guidance — never flag without a fix
- False positives are better than false negatives
- When confidence < 0.5, mark the finding as "needs-human-review"
- Cross-reference findings across passes: a hardcoded secret (Pass 2)
  in an auth module (Pass 4 A07) that handles restricted data
  (Pass 5 STRIDE-I) is a compound finding with escalated severity
```

This CLAUDE.md template is comprehensive but rigid. That rigidity is the point. The Security CLI has no room for creative interpretation of its mandate. It scans. It reports. It recommends. It does not deviate.

---

## 10.11 The Security Gate Protocol

The final piece is how the Security CLI's findings integrate with the Orchestrator's deployment decision. This is the Security Gate Protocol --- the mechanism that blocks deployment when critical findings exist.

```typescript
// orchestrator/security-gate.ts

interface SecurityGateConfig {
  blockOnCritical: boolean;         // default: true
  blockOnHighCount: number;         // default: 3
  requireCompliancePass: boolean;   // default: true for regulated industries
  allowedExceptions: string[];      // finding IDs that have been accepted
  notifyChannels: string[];         // Slack/Teams channels for alerts
}

class SecurityGate {
  private config: SecurityGateConfig;

  constructor(config: SecurityGateConfig) {
    this.config = config;
  }

  evaluate(report: SecurityScanReport): GateDecision {
    // Filter out accepted exceptions
    const activeFindings = report.findings.filter(
      f => !this.config.allowedExceptions.includes(f.id)
    );

    const criticals = activeFindings.filter(f => f.severity === 'critical');
    const highs = activeFindings.filter(f => f.severity === 'high');

    // Block conditions
    const blockReasons: string[] = [];

    if (this.config.blockOnCritical && criticals.length > 0) {
      blockReasons.push(
        `${criticals.length} critical finding(s): `
        + criticals.map(f => `${f.name} at ${f.file}:${f.line}`).join('; ')
      );
    }

    if (highs.length >= this.config.blockOnHighCount) {
      blockReasons.push(
        `${highs.length} high-severity findings (threshold: `
        + `${this.config.blockOnHighCount})`
      );
    }

    if (this.config.requireCompliancePass) {
      for (const compliance of report.compliance) {
        if (compliance.controlsFailed > 0) {
          blockReasons.push(
            `${compliance.framework}: ${compliance.controlsFailed} `
            + `controls failed`
          );
        }
      }
    }

    const decision: GateDecision = {
      allowed: blockReasons.length === 0,
      reasons: blockReasons,
      report,
      actions: this.determineActions(report, blockReasons),
    };

    return decision;
  }

  private determineActions(
    report: SecurityScanReport,
    blockReasons: string[]
  ): GateAction[] {
    const actions: GateAction[] = [];

    if (blockReasons.length > 0) {
      // Blocked: dispatch findings to Coder CLI for remediation
      actions.push({
        type: 'dispatch-to-coder',
        priority: 'immediate',
        findings: report.findings.filter(
          f => f.severity === 'critical' || f.severity === 'high'
        ),
        instruction: 'Fix all critical and high-severity findings. '
          + 'Each finding includes remediation guidance. '
          + 'After fixing, the Security CLI will re-scan.',
      });

      // Notify humans for oversight
      actions.push({
        type: 'notify',
        channels: this.config.notifyChannels,
        message: `🛡️ Security Gate BLOCKED deployment. `
          + `${blockReasons.length} blocking condition(s). `
          + `${report.summary.critical} critical, `
          + `${report.summary.high} high findings.`,
      });
    } else if (report.summary.medium > 0 || report.summary.low > 0) {
      // Allowed but with warnings: create tracking tasks
      actions.push({
        type: 'create-tracking-tasks',
        priority: 'next-sprint',
        findings: report.findings.filter(
          f => f.severity === 'medium' || f.severity === 'low'
        ),
        instruction: 'Create backlog items for non-blocking findings.',
      });
    }

    return actions;
  }
}
```

The Security Gate Protocol completes the feedback loop. The flow is:

```
Coder CLI commits code
    ↓
Orchestrator dispatches Security CLI
    ↓
Security CLI runs 6-pass analysis
    ↓
Security CLI returns SecurityScanReport
    ↓
Orchestrator feeds report to SecurityGate
    ↓
Gate evaluates: block / warn / pass
    ↓
If blocked:
  → Findings dispatched to Coder CLI for remediation
  → Humans notified
  → Deployment held
  → After fix: Security CLI re-scans (new context, fresh audit)
    ↓
If passed:
  → Deployment proceeds
  → Non-blocking findings become backlog items
```

This is the closed loop. The Security CLI never fixes. The Coder CLI never audits. The Orchestrator never does either --- it coordinates. Each agent operates within its domain. Each agent's output is the next agent's input. No shared context. No cross-contamination. No single point of failure.

---

## 10.12 Putting It All Together: A Complete Security Scan

Let's walk through a concrete scenario from start to finish. The Coder CLI has just finished implementing a JWT authentication system across six files. The Orchestrator dispatches the Security CLI.

**Orchestrator → Security CLI:**
```json
{
  "task": "security-scan",
  "branch": "feat/jwt-auth",
  "commit": "a1b2c3d",
  "changedFiles": [
    "src/auth/jwt.ts",
    "src/auth/middleware.ts",
    "src/routes/login.ts",
    "src/routes/protected.ts",
    "src/config/auth.config.ts",
    "src/types/auth.d.ts"
  ],
  "architectureContext": {
    "components": ["api-gateway", "auth-service", "user-database"],
    "adrs": ["docs/adr/004-jwt-auth.md"]
  }
}
```

**Security CLI executes six passes:**

**Pass 1 (SAST)** finds: `src/auth/jwt.ts:47` uses `HS256` with a key derived from `process.env.JWT_SECRET` that has no minimum length validation. The tree-sitter AST analysis catches the `createHmac` call and traces the key argument back to an environment variable without validation logic.

**Pass 2 (Secrets)** finds: `src/config/auth.config.ts:12` contains `jwtSecret: 'development-secret-key-change-me'` as a default fallback. Gitleaks flags it. The entropy analysis confirms it's low-entropy (not a real secret), but the pattern --- a hardcoded fallback that might ship to production --- is the real finding.

**Pass 3 (Dependencies)** finds: The `jsonwebtoken` package is at version 8.5.1; version 9.0.0 patched CVE-2022-23529 (arbitrary code injection via crafted JWTs). Severity: critical.

**Pass 4 (OWASP)** finds: `src/routes/protected.ts` has a route handler that reads `req.params.userId` and queries the database without verifying that the authenticated user's ID matches the requested ID. This is A01:2021 (Broken Access Control) --- an Insecure Direct Object Reference.

**Pass 5 (STRIDE)** finds: The data flow from `api-gateway` to `auth-service` uses HTTP (not HTTPS) in the service mesh configuration referenced by the ADR. This is a Tampering + Information Disclosure threat for the JWT tokens in transit.

**Pass 6 (Compliance)** finds: SOC2 CC6.1 passes (auth module exists, session expiry configured). SOC2 CC8.1 partially passes (CI/CD exists, but no test files for the new auth module).

**Security CLI → Orchestrator:**
```json
{
  "scanId": "scan-a1b2c3d-20260415",
  "recommendation": "block",
  "blockReasons": [
    "1 critical finding: CVE-2022-23529 in jsonwebtoken@8.5.1",
    "1 critical finding: hardcoded fallback secret in auth.config.ts"
  ],
  "summary": {
    "total": 7,
    "critical": 2,
    "high": 2,
    "medium": 2,
    "low": 1
  }
}
```

The Orchestrator reads `recommendation: "block"` and holds deployment. It dispatches the critical and high findings to the Coder CLI with remediation instructions extracted from each finding. The Coder CLI updates `jsonwebtoken` to 9.0.2, removes the hardcoded fallback, adds IDOR protection to the route handler, and writes auth module tests.

The Orchestrator dispatches the Security CLI again. Fresh context. Fresh analysis. No memory of the previous scan. It finds the critical and high issues resolved. Two medium findings remain (logging configuration, JWT expiry length). Recommendation: `pass`.

Deployment proceeds.

---

This is the Security CLI. It doesn't write code. It doesn't fix bugs. It doesn't deploy containers. It reads, analyzes, and reports. Its authority comes from its constraints. Its trustworthiness comes from its inability to compromise itself.

The guardian never picks up a sword. That's what makes it a guardian.
