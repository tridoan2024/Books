# Chapter 11: The Validator CLI --- The Gatekeeper

---

There is a reason courtrooms have judges and not just lawyers.

A lawyer builds the argument. Researches precedent. Structures the case. Delivers the closing statement. But no matter how compelling the argument, no matter how airtight the logic, someone else decides whether it stands. The judge doesn't write the brief. The judge evaluates it against the law, against procedure, against the rules of evidence. The judge is the gatekeeper.

In the AGI Forge, the Validator CLI is the judge. The Coder writes code. The Security CLI scans for vulnerabilities. The QA CLI runs behavioral tests. But the Validator is the one that says: *this build is green. This code ships. Or it doesn't.*

Every other CLI in the system produces artifacts. The Validator produces verdicts.

---

## 11.1 Why Validation Needs Its Own CLI

You might be wondering: why can't the Coder validate its own work? Why can't the same agent that wrote the code also run the tests and check the types? The answer is the same reason you don't let the author proofread their own novel. Blind spots are structural, not accidental.

When Claude Code writes a function, it has a mental model of what that function should do. If you ask it to verify the function in the same context window, it will verify against its own mental model --- not against the actual requirements, not against the type system's constraints, not against the edge cases that the original implementation didn't consider. This is confirmation bias encoded in transformer weights.

The Validator CLI operates in a separate context window with a separate system prompt. It doesn't know what the Coder intended. It only knows what the code *does* --- as measured by the linter, the type checker, the build system, the test runner, and the performance benchmarks. This separation of concerns isn't a luxury. It's a requirement for trustworthy output.

There's a deeper reason, too. Validation is a fundamentally different cognitive task from generation. Generation is divergent: explore the solution space, consider alternatives, make creative leaps. Validation is convergent: apply known rules, check known constraints, reduce uncertainty. Mixing these modes in a single context window creates interference. The model either becomes too conservative (validating while generating, producing timid code) or too permissive (generating while validating, rubber-stamping its own output).

Claude Code's own architecture acknowledges this. The `VERIFICATION_AGENT` feature flag --- which we'll dissect later in this chapter --- exists precisely because Anthropic's engineers discovered that verification quality degrades when performed in the same agent loop as implementation. The verification agent is a separate spawn, a separate context, a separate judgment.

The Validator CLI takes this principle and makes it a first-class citizen of the multi-CLI system.

---

## 11.2 The Five-Stage Validation Pipeline

The Validator doesn't run a single check. It runs a pipeline --- five stages, executed in sequence, each stage gating the next. If any stage fails, the pipeline halts. No partial passes. No "well, the tests failed but the build succeeded so let's ship it anyway." The pipeline is binary: green or red.

Here are the five stages:

```
Stage 1: Lint        → Static analysis, code style, dead code detection
Stage 2: Type-Check  → Static type verification, interface compliance
Stage 3: Build       → Compilation, bundling, artifact generation
Stage 4: Test        → Unit tests, integration tests, coverage analysis
Stage 5: Performance → Benchmarks, bundle size, runtime profiling
```

Each stage produces structured output that the Validator parses, categorizes, and evaluates against configurable quality gates. Let's walk through each one.

### Stage 1: Lint --- The First Line of Defense

Linting catches the problems that don't need a compiler to detect. Unused variables. Unreachable code. Missing accessibility attributes. Import ordering violations. These are cheap to find, cheap to fix, and expensive to ignore --- because they compound. A codebase that tolerates lint warnings today tolerates security vulnerabilities tomorrow.

The Validator runs the project's configured linter with structured output:

```bash
#!/bin/bash
set -euo pipefail

# Stage 1: Lint
echo "╔══════════════════════════════════════╗"
echo "║  STAGE 1: LINT                       ║"
echo "╚══════════════════════════════════════╝"

LINT_OUTPUT=$(npx eslint . \
  --format json \
  --max-warnings "${LINT_MAX_WARNINGS:-0}" \
  2>&1) || LINT_EXIT=$?

if [ "${LINT_EXIT:-0}" -ne 0 ]; then
  echo "$LINT_OUTPUT" | jq '.[] | select(.errorCount > 0) | {
    filePath: .filePath,
    errors: [.messages[] | select(.severity == 2) | {
      line: .line,
      rule: .ruleId,
      message: .message
    }]
  }'
  echo "STAGE 1 FAILED: Lint errors detected"
  exit 1
fi

# Count warnings for quality gate
WARN_COUNT=$(echo "$LINT_OUTPUT" | jq '[.[].warningCount] | add // 0')
echo "Lint passed. Warnings: $WARN_COUNT"
```

The key insight is `--format json`. Human-readable lint output is fine for humans. The Validator CLI is not human. It needs structured data it can parse, categorize, and route. JSON output means the Validator can distinguish between a "no-unused-vars" warning (auto-fixable, low severity) and a "no-eval" error (security-critical, route to Security CLI for review).

For Python projects, the equivalent uses `ruff`:

```bash
# Python lint with ruff (structured JSON output)
ruff check . --output-format json --exit-zero | python3 -c "
import json, sys
results = json.load(sys.stdin)
errors = [r for r in results if r['fix'] is None]  # unfixable = real errors
fixable = [r for r in results if r['fix'] is not None]
print(f'Errors: {len(errors)}, Auto-fixable: {len(fixable)}')
if errors:
    for e in errors:
        print(f\"  {e['filename']}:{e['location']['row']} [{e['code']}] {e['message']}\")
    sys.exit(1)
"
```

### Stage 2: Type-Check --- The Contract Enforcer

Linting catches style violations. Type-checking catches broken contracts. When the Coder declares a function returns `Promise<User>` but the implementation returns `Promise<User | null>`, the type checker catches it. When an interface changes in module A but module B still expects the old shape, the type checker catches it.

```bash
# Stage 2: Type-Check
echo "╔══════════════════════════════════════╗"
echo "║  STAGE 2: TYPE-CHECK                 ║"
echo "╚══════════════════════════════════════╝"

TSC_OUTPUT=$(npx tsc --noEmit --pretty false 2>&1) || TSC_EXIT=$?

if [ "${TSC_EXIT:-0}" -ne 0 ]; then
  # Parse TypeScript errors into structured format
  echo "$TSC_OUTPUT" | grep "error TS" | while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d'(' -f1)
    LOCATION=$(echo "$line" | grep -oP '\(\d+,\d+\)')
    CODE=$(echo "$line" | grep -oP 'TS\d+')
    MESSAGE=$(echo "$line" | sed 's/.*: error TS[0-9]*: //')
    echo "{\"file\": \"$FILE\", \"location\": \"$LOCATION\", \"code\": \"$CODE\", \"message\": \"$MESSAGE\"}"
  done
  echo "STAGE 2 FAILED: Type errors detected"
  exit 1
fi

echo "Type-check passed. No errors."
```

The `--pretty false` flag is essential. Pretty output includes ANSI color codes and multi-line formatting that breaks parsing. The Validator needs raw, parseable output. Every tool in the pipeline follows this principle: machine-readable output first, human-readable presentation later.

### Stage 3: Build --- The Integration Test

Types check. Lint passes. But does the code actually compile into a runnable artifact? The build stage answers this question. It catches problems that neither the linter nor the type checker can see: circular dependencies that only manifest at bundle time, missing assets referenced in import statements, environment variables assumed but not provided, and configuration errors that only surface during compilation.

```bash
# Stage 3: Build
echo "╔══════════════════════════════════════╗"
echo "║  STAGE 3: BUILD                      ║"
echo "╚══════════════════════════════════════╝"

BUILD_START=$(date +%s%N)

npm run build 2>&1 | tee build.log
BUILD_EXIT=${PIPESTATUS[0]}

BUILD_END=$(date +%s%N)
BUILD_DURATION=$(( (BUILD_END - BUILD_START) / 1000000 ))

if [ "$BUILD_EXIT" -ne 0 ]; then
  echo "STAGE 3 FAILED: Build failed in ${BUILD_DURATION}ms"
  # Extract the meaningful error from build log
  grep -A 5 "error\|Error\|ERROR" build.log | head -30
  exit 1
fi

echo "Build passed in ${BUILD_DURATION}ms"

# Check build artifact size (quality gate)
if [ -d "dist" ]; then
  BUNDLE_SIZE=$(du -sb dist/ | cut -f1)
  echo "Bundle size: $BUNDLE_SIZE bytes"
fi
```

Build time matters. A build that took 30 seconds last week and takes 90 seconds today signals a problem --- an unnecessary dependency, an unoptimized import, a missing tree-shaking configuration. The Validator tracks build duration as a metric, not just build success.

### Stage 4: Test --- The Behavioral Proof

This is where the Validator earns its keep. Lint checks syntax. Types check contracts. Builds check compilation. Tests check *behavior*. Does the code do what it's supposed to do? Does it handle edge cases? Does it fail gracefully when given garbage input?

The Validator runs the project's test suite with coverage tracking and structured output:

```bash
# Stage 4: Test
echo "╔══════════════════════════════════════╗"
echo "║  STAGE 4: TEST                       ║"
echo "╚══════════════════════════════════════╝"

# Run tests with coverage and JSON reporter
npx jest \
  --coverage \
  --coverageReporters=json-summary \
  --json \
  --outputFile=test-results.json \
  2>&1 | tee test.log

TEST_EXIT=${PIPESTATUS[0]}

# Parse results
if [ -f test-results.json ]; then
  TOTAL=$(jq '.numTotalTests' test-results.json)
  PASSED=$(jq '.numPassedTests' test-results.json)
  FAILED=$(jq '.numFailedTests' test-results.json)
  PENDING=$(jq '.numPendingTests' test-results.json)
  PASS_RATE=$(echo "scale=2; $PASSED * 100 / $TOTAL" | bc)
  
  echo "Tests: $PASSED/$TOTAL passed ($PASS_RATE%)"
  echo "Failed: $FAILED | Pending: $PENDING"
  
  # Extract failed test details for failure analysis
  if [ "$FAILED" -gt 0 ]; then
    jq '.testResults[] | select(.status == "failed") | {
      name: .name,
      failures: [.assertionResults[] | select(.status == "failed") | {
        title: .ancestorTitles + [.title] | join(" > "),
        message: .failureMessages[0][:200]
      }]
    }' test-results.json
  fi
fi

# Parse coverage
if [ -f coverage/coverage-summary.json ]; then
  COVERAGE=$(jq '.total.lines.pct' coverage/coverage-summary.json)
  BRANCH_COV=$(jq '.total.branches.pct' coverage/coverage-summary.json)
  FUNC_COV=$(jq '.total.functions.pct' coverage/coverage-summary.json)
  
  echo "Coverage: Lines=$COVERAGE% Branches=$BRANCH_COV% Functions=$FUNC_COV%"
fi

if [ "$TEST_EXIT" -ne 0 ]; then
  echo "STAGE 4 FAILED: $FAILED test(s) failed"
  exit 1
fi
```

The Validator doesn't just check pass/fail. It tracks *coverage regression*. If yesterday's coverage was 87% and today's is 84%, something is wrong --- either new code was added without tests, or existing tests were removed. Both scenarios demand attention. The Validator maintains a coverage baseline and flags any regression beyond the configured threshold.

For Python projects using pytest:

```bash
# Python test execution with pytest
python3 -m pytest \
  --tb=short \
  --json-report \
  --json-report-file=test-results.json \
  --cov=src \
  --cov-report=json:coverage.json \
  --cov-fail-under="${MIN_COVERAGE:-80}" \
  -q 2>&1

PYTEST_EXIT=$?

if [ -f test-results.json ]; then
  python3 -c "
import json
with open('test-results.json') as f:
    data = json.load(f)
summary = data['summary']
print(f\"Tests: {summary['passed']}/{summary['total']} passed\")
if summary.get('failed', 0) > 0:
    for test in data['tests']:
        if test['outcome'] == 'failed':
            print(f\"  FAIL: {test['nodeid']}\")
            print(f\"    {test['call']['longrepr'][:200]}\")
"
fi
```

### Stage 5: Performance --- The Budget Enforcer

The final stage catches the category of problems that the first four stages miss entirely: performance regressions. Code that is correct, well-typed, well-tested, and properly linted can still be catastrophically slow. A database query that returns in 50ms with 100 rows but takes 30 seconds with 10,000 rows. A React component that re-renders 47 times per keystroke. A bundle that grew from 200KB to 2MB because someone imported all of lodash for a single function.

```bash
# Stage 5: Performance
echo "╔══════════════════════════════════════╗"
echo "║  STAGE 5: PERFORMANCE                ║"
echo "╚══════════════════════════════════════╝"

# Bundle size analysis
if [ -d "dist" ]; then
  BUNDLE_SIZE=$(du -sb dist/ | cut -f1)
  BUNDLE_SIZE_KB=$(echo "scale=2; $BUNDLE_SIZE / 1024" | bc)
  
  # Compare against baseline
  if [ -f ".validator/baseline-bundle-size" ]; then
    BASELINE=$(cat .validator/baseline-bundle-size)
    GROWTH_PCT=$(echo "scale=2; ($BUNDLE_SIZE - $BASELINE) * 100 / $BASELINE" | bc)
    echo "Bundle: ${BUNDLE_SIZE_KB}KB (${GROWTH_PCT}% vs baseline)"
    
    MAX_GROWTH="${PERF_MAX_BUNDLE_GROWTH:-5}"
    if (( $(echo "$GROWTH_PCT > $MAX_GROWTH" | bc -l) )); then
      echo "STAGE 5 WARNING: Bundle grew by ${GROWTH_PCT}% (threshold: ${MAX_GROWTH}%)"
    fi
  fi
fi

# Run performance benchmarks if they exist
if [ -f "bench/run.js" ]; then
  node bench/run.js --json > bench-results.json 2>&1
  
  # Compare against baseline
  if [ -f ".validator/baseline-bench.json" ]; then
    node -e "
    const curr = require('./bench-results.json');
    const base = require('./.validator/baseline-bench.json');
    for (const [name, result] of Object.entries(curr)) {
      const baseline = base[name];
      if (baseline) {
        const change = ((result.mean - baseline.mean) / baseline.mean * 100).toFixed(1);
        const status = change > 10 ? 'REGRESSION' : change < -10 ? 'IMPROVEMENT' : 'STABLE';
        console.log(\`  \${name}: \${result.mean.toFixed(2)}ms (\${change}%) [\${status}]\`);
      }
    }
    "
  fi
fi

# Lighthouse CI for web projects (optional)
if [ -f "lighthouserc.json" ]; then
  npx lhci autorun --config=lighthouserc.json 2>&1
  LHCI_EXIT=$?
  if [ "$LHCI_EXIT" -ne 0 ]; then
    echo "STAGE 5 FAILED: Lighthouse performance budget exceeded"
    exit 1
  fi
fi

echo "Performance checks complete"
```

The performance stage is the most nuanced. Unlike lint and type checks, performance is not binary. A 2% regression in one benchmark might be acceptable if it comes with a 15% improvement in another. The Validator applies configurable thresholds and treats performance as a spectrum: pass, warn, or fail.

---

## 11.3 Quality Gates --- The Configuration Layer

The five stages are fixed. The thresholds are not. Every team, every project, every phase of development has different quality requirements. A greenfield prototype might accept 50% test coverage. A banking application demands 95%. The Validator CLI uses a configuration file that defines quality gates with three levels: pass, warn, and fail.

```yaml
# .validator/quality-gates.yml
# Validator CLI Quality Gate Configuration
# Three levels: pass (green), warn (yellow), fail (red)

version: "1.0"
project: "agi-forge-api"

stages:
  lint:
    enabled: true
    max_errors: 0          # Any error = fail
    max_warnings: 10       # > 10 warnings = warn, > 25 = fail
    warn_threshold: 10
    fail_threshold: 25
    auto_fix: true         # Attempt auto-fix before failing
    rules_override:
      no-eval: "error"     # Always error, never downgrade
      no-console: "warn"   # Allow in development

  type_check:
    enabled: true
    strict: true           # --strict flag
    max_errors: 0          # Zero tolerance for type errors
    incremental: true      # Use tsc --incremental for speed

  build:
    enabled: true
    max_duration_ms: 60000    # > 60s = warn
    fail_duration_ms: 120000  # > 120s = fail
    artifact_size:
      warn_kb: 512            # > 512KB = warn
      fail_kb: 1024           # > 1MB = fail

  test:
    enabled: true
    min_pass_rate: 100        # 100% tests must pass
    coverage:
      lines:
        warn: 80              # < 80% = warn
        fail: 70              # < 70% = fail
      branches:
        warn: 75
        fail: 60
      functions:
        warn: 85
        fail: 70
    regression_threshold: 2   # Coverage drop > 2% = fail
    timeout_per_test_ms: 5000 # Individual test timeout

  performance:
    enabled: true
    bundle_size:
      warn_growth_pct: 5      # > 5% growth = warn
      fail_growth_pct: 15     # > 15% growth = fail
    benchmark:
      warn_regression_pct: 10  # > 10% slower = warn
      fail_regression_pct: 25  # > 25% slower = fail
    lighthouse:
      performance: 90         # Minimum Lighthouse score
      accessibility: 95
      best_practices: 90

# Gate behavior
gate_policy:
  warn_action: "continue_with_report"  # Warnings don't block
  fail_action: "halt_pipeline"         # Failures block everything
  max_warnings_before_fail: 5          # 5+ warnings across stages = fail
  
# Reporting
reporting:
  format: "json"                       # json, markdown, or junit
  output_dir: ".validator/reports"
  include_suggestions: true            # AI-generated fix suggestions
  notify:
    slack_webhook: "${SLACK_WEBHOOK}"   # Optional notification
    on: ["fail", "warn"]
```

This configuration is the Validator's contract with the team. It's checked into source control. It's reviewed in PRs. When someone wants to relax a threshold, they have to justify it in a code review --- not quietly flip a flag in CI.

The Validator CLI reads this configuration at startup and applies it to every stage:

```python
import yaml
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

@dataclass
class StageResult:
    stage: str
    status: str          # "pass", "warn", "fail"
    duration_ms: int
    metrics: dict
    errors: list
    warnings: list
    suggestions: list    # AI-generated fix suggestions

class QualityGateEvaluator:
    def __init__(self, config_path: Path = Path(".validator/quality-gates.yml")):
        with open(config_path) as f:
            self.config = yaml.safe_load(f)
        self.results: list[StageResult] = []
        self.total_warnings = 0
    
    def evaluate_stage(self, stage: str, metrics: dict) -> StageResult:
        """Evaluate a stage's output against configured thresholds."""
        gate = self.config["stages"][stage]
        
        if not gate.get("enabled", True):
            return StageResult(stage=stage, status="skip", 
                             duration_ms=0, metrics={}, 
                             errors=[], warnings=[], suggestions=[])
        
        status = "pass"
        errors, warnings = [], []
        
        if stage == "test":
            coverage = metrics.get("coverage_lines", 0)
            pass_rate = metrics.get("pass_rate", 0)
            
            if pass_rate < gate["min_pass_rate"]:
                status = "fail"
                errors.append(f"Pass rate {pass_rate}% below minimum {gate['min_pass_rate']}%")
            
            cov_gates = gate["coverage"]["lines"]
            if coverage < cov_gates["fail"]:
                status = "fail"
                errors.append(f"Coverage {coverage}% below fail threshold {cov_gates['fail']}%")
            elif coverage < cov_gates["warn"]:
                status = "warn"
                warnings.append(f"Coverage {coverage}% below warn threshold {cov_gates['warn']}%")
        
        if stage == "build":
            duration = metrics.get("duration_ms", 0)
            if duration > gate["fail_duration_ms"]:
                status = "fail"
                errors.append(f"Build took {duration}ms (limit: {gate['fail_duration_ms']}ms)")
            elif duration > gate["max_duration_ms"]:
                if status != "fail":
                    status = "warn"
                warnings.append(f"Build took {duration}ms (warn: {gate['max_duration_ms']}ms)")
        
        result = StageResult(
            stage=stage, status=status,
            duration_ms=metrics.get("duration_ms", 0),
            metrics=metrics, errors=errors,
            warnings=warnings, suggestions=[]
        )
        
        self.results.append(result)
        self.total_warnings += len(warnings)
        
        # Check cumulative warning threshold
        max_warns = self.config["gate_policy"]["max_warnings_before_fail"]
        if self.total_warnings >= max_warns:
            result.status = "fail"
            result.errors.append(
                f"Cumulative warnings ({self.total_warnings}) exceeded threshold ({max_warns})"
            )
        
        return result
    
    def final_verdict(self) -> dict:
        """Produce the final validation verdict."""
        failed = [r for r in self.results if r.status == "fail"]
        warned = [r for r in self.results if r.status == "warn"]
        
        return {
            "verdict": "FAIL" if failed else "WARN" if warned else "PASS",
            "stages": {r.stage: r.status for r in self.results},
            "total_errors": sum(len(r.errors) for r in self.results),
            "total_warnings": self.total_warnings,
            "failed_stages": [r.stage for r in failed],
            "details": [r.__dict__ for r in self.results],
        }
```

The `final_verdict()` method is what the Orchestrator consumes. It doesn't need to understand lint rules or TypeScript error codes. It needs a verdict: PASS, WARN, or FAIL. The Validator abstracts all the complexity of five validation stages into a single structured response that any CLI in the system can interpret.

---

## 11.4 The VERIFICATION_AGENT --- Claude Code's Built-In Gatekeeper

Here's something most Claude Code users don't know: the verification pattern isn't just a good idea we're advocating. It's built into Claude Code itself, behind a feature flag called `VERIFICATION_AGENT`.

The implementation lives in `tools/TaskUpdateTool/TaskUpdateTool.ts` and `tools/AgentTool/constants.ts`. When the feature is enabled and an agent completes three or more tasks, the system checks whether any of those tasks was a verification step. If none was, it injects a nudge:

```
NOTE: You just closed out 3+ tasks and none of them was a 
verification step. Before writing your final summary, spawn 
the verification agent (subagent_type="verification"). You 
cannot self-assign PARTIAL by listing caveats in your summary 
— only the verifier issues a verdict.
```

Read that last line again. *You cannot self-assign PARTIAL by listing caveats in your summary --- only the verifier issues a verdict.* This is Anthropic's engineering team encoding the same principle we've been building toward: the entity that writes the code does not get to evaluate the code. Evaluation is a separate concern, a separate agent, a separate judgment.

The verification agent type is defined as a constant:

```typescript
// tools/AgentTool/constants.ts
export const VERIFICATION_AGENT_TYPE = 'verification'
```

And the nudge logic fires at a specific moment --- when the main-thread agent closes out its last task and the loop is about to exit:

```typescript
// Structural verification nudge: if the main-thread agent just closed
// out a 3+ task list and none of those tasks was a verification step,
// append a reminder to the tool result.
let verificationNudgeNeeded = false
if (
  feature('VERIFICATION_AGENT') &&
  !context.agentId &&
  updates.status === 'completed'
) {
  const allTasks = await listTasks(taskListId)
  const allDone = allTasks.every(t => t.status === 'completed')
  if (
    allDone &&
    allTasks.length >= 3 &&
    !allTasks.some(t => /verif/i.test(t.subject))
  ) {
    verificationNudgeNeeded = true
  }
}
```

The logic is elegant in its simplicity. Three conditions must be met: (1) the VERIFICATION_AGENT feature flag is on, (2) this is the main thread (not already a sub-agent), and (3) at least three tasks were completed with none containing "verif" in the subject. When all three conditions hold, the system refuses to let the agent self-certify its own work.

This is exactly what the Validator CLI formalizes as a system-level concern. In the AGI Forge, we don't rely on a nudge. We make the Validator a mandatory pipeline stage. The Orchestrator physically cannot mark a task as complete without a PASS verdict from the Validator.

### Enabling VERIFICATION_AGENT in Your Workflow

You can enable this behavior today in your Claude Code sessions by configuring the feature flag. But in the multi-CLI system, we go further. The Validator CLI's system prompt includes an explicit instruction:

```markdown
# VERIFICATION PROTOCOL

You are the Validator. You NEVER self-certify.

When the Coder reports "task complete," you:
1. Pull the changed files from git diff
2. Run the full five-stage pipeline
3. Issue a verdict: PASS, WARN, or FAIL
4. If FAIL: categorize the failures and route fix suggestions back

You do not negotiate. You do not accept "it works on my machine."
The pipeline is the source of truth.
```

---

## 11.5 Failure Analysis and Auto-Retry

When the pipeline fails, the Validator's job is not just to report the failure. It's to *analyze* the failure, categorize it, and route it to the right place for resolution. A syntax error goes back to the Coder. A security vulnerability goes to the Security CLI. A performance regression goes to the Coder with performance-specific guidance. The Validator is a triage nurse, not just a thermometer.

### Failure Categorization

Every failure the Validator encounters falls into one of six categories:

```python
from enum import Enum
from dataclasses import dataclass

class FailureCategory(Enum):
    SYNTAX_ERROR = "syntax"         # Parse errors, invalid syntax
    TYPE_ERROR = "type"             # Type mismatches, missing properties
    BUILD_ERROR = "build"           # Compilation failures, missing deps
    TEST_FAILURE = "test"           # Assertion failures, test errors
    COVERAGE_REGRESSION = "coverage"  # Coverage dropped below threshold
    PERF_REGRESSION = "performance"   # Performance degraded beyond threshold

@dataclass
class CategorizedFailure:
    category: FailureCategory
    stage: str
    file: str
    line: int | None
    message: str
    severity: str        # "error", "warning"
    auto_fixable: bool   # Can the Coder auto-fix this?
    fix_suggestion: str  # AI-generated suggestion
    route_to: str        # Which CLI should handle this?

class FailureAnalyzer:
    """Categorize and route validation failures."""
    
    ROUTING_TABLE = {
        FailureCategory.SYNTAX_ERROR: "coder",
        FailureCategory.TYPE_ERROR: "coder",
        FailureCategory.BUILD_ERROR: "coder",
        FailureCategory.TEST_FAILURE: "coder",      # or QA for new tests
        FailureCategory.COVERAGE_REGRESSION: "coder", # write missing tests
        FailureCategory.PERF_REGRESSION: "coder",     # with perf guidance
    }
    
    def categorize(self, stage: str, error_output: str) -> list[CategorizedFailure]:
        """Parse raw error output into categorized failures."""
        failures = []
        
        if stage == "lint":
            failures = self._parse_lint_errors(error_output)
        elif stage == "type_check":
            failures = self._parse_type_errors(error_output)
        elif stage == "test":
            failures = self._parse_test_failures(error_output)
        elif stage == "build":
            failures = self._parse_build_errors(error_output)
        elif stage == "performance":
            failures = self._parse_perf_regressions(error_output)
        
        return failures
    
    def _parse_type_errors(self, output: str) -> list[CategorizedFailure]:
        """Parse TypeScript compiler errors."""
        failures = []
        for line in output.split('\n'):
            if 'error TS' in line:
                # Extract: src/auth.ts(42,5): error TS2345: ...
                parts = line.split(': error ')
                if len(parts) >= 2:
                    file_loc = parts[0]
                    error_msg = parts[1]
                    
                    file_path = file_loc.split('(')[0]
                    line_num = int(file_loc.split('(')[1].split(',')[0]) if '(' in file_loc else None
                    
                    failures.append(CategorizedFailure(
                        category=FailureCategory.TYPE_ERROR,
                        stage="type_check",
                        file=file_path,
                        line=line_num,
                        message=error_msg,
                        severity="error",
                        auto_fixable=self._is_type_auto_fixable(error_msg),
                        fix_suggestion=self._suggest_type_fix(error_msg),
                        route_to="coder"
                    ))
        return failures
    
    def _is_type_auto_fixable(self, error: str) -> bool:
        """Determine if a type error can be auto-fixed."""
        auto_fixable_codes = [
            "TS2322",  # Type assignment (often needs type assertion)
            "TS2339",  # Property doesn't exist (missing interface field)
            "TS2345",  # Argument type mismatch
            "TS7006",  # Parameter has implicit 'any' type
        ]
        return any(code in error for code in auto_fixable_codes)
    
    def _suggest_type_fix(self, error: str) -> str:
        """Generate a fix suggestion for common type errors."""
        if "TS2345" in error:
            return "Argument type mismatch. Check function signature and ensure the passed argument matches the expected parameter type."
        if "TS7006" in error:
            return "Add explicit type annotation to the parameter."
        if "TS2322" in error:
            return "Type mismatch in assignment. Verify the right-hand side matches the declared type, or update the type declaration."
        return "Review the type definition and ensure all constraints are satisfied."
    
    def generate_fix_request(self, failures: list[CategorizedFailure]) -> dict:
        """Generate a structured fix request to send back to the Coder CLI."""
        grouped = {}
        for f in failures:
            key = f.route_to
            if key not in grouped:
                grouped[key] = []
            grouped[key].append({
                "file": f.file,
                "line": f.line,
                "category": f.category.value,
                "message": f.message,
                "suggestion": f.fix_suggestion,
                "auto_fixable": f.auto_fixable,
            })
        
        return {
            "action": "fix_validation_failures",
            "total_failures": len(failures),
            "auto_fixable_count": sum(1 for f in failures if f.auto_fixable),
            "routes": grouped,
            "retry_after_fix": True,
            "max_retries": 3,
        }
```

### The Auto-Retry Loop

When the Validator detects failures, it doesn't just report them. It initiates a retry loop. The fix request goes back to the Coder CLI (or whichever CLI the failure routes to). The Coder applies fixes. The Validator runs again. This loop continues up to a configurable maximum number of retries.

```python
class ValidationRetryLoop:
    """Orchestrate the fix → validate → retry cycle."""
    
    def __init__(self, max_retries: int = 3):
        self.max_retries = max_retries
        self.attempt = 0
        self.history: list[dict] = []
    
    async def run(self, pipeline, coder_cli, changed_files: list[str]) -> dict:
        """Run validation with auto-retry on failure."""
        while self.attempt < self.max_retries:
            self.attempt += 1
            
            # Run the five-stage pipeline
            result = await pipeline.run_all_stages()
            self.history.append({
                "attempt": self.attempt,
                "verdict": result["verdict"],
                "failed_stages": result.get("failed_stages", []),
                "timestamp": datetime.now().isoformat()
            })
            
            if result["verdict"] == "PASS":
                return {
                    "final_verdict": "PASS",
                    "attempts": self.attempt,
                    "history": self.history,
                }
            
            if result["verdict"] == "WARN" and self.attempt > 1:
                # Accept warnings after first retry
                return {
                    "final_verdict": "WARN",
                    "attempts": self.attempt,
                    "history": self.history,
                    "accepted_warnings": result.get("total_warnings", 0),
                }
            
            if self.attempt >= self.max_retries:
                return {
                    "final_verdict": "FAIL",
                    "attempts": self.attempt,
                    "history": self.history,
                    "message": f"Validation failed after {self.max_retries} attempts",
                }
            
            # Categorize failures and send fix request
            analyzer = FailureAnalyzer()
            all_failures = []
            for stage_result in result["details"]:
                if stage_result["status"] == "fail":
                    categorized = analyzer.categorize(
                        stage_result["stage"], 
                        str(stage_result["errors"])
                    )
                    all_failures.extend(categorized)
            
            fix_request = analyzer.generate_fix_request(all_failures)
            
            # Send to Coder CLI for fixes
            await coder_cli.apply_fixes(fix_request)
            
            # Brief pause for file system to settle
            await asyncio.sleep(1)
        
        return {"final_verdict": "FAIL", "attempts": self.attempt}
```

The retry loop embodies a principle that separates mature CI systems from amateur ones: *don't give up on the first failure*. Many validation failures are auto-fixable. Missing semicolons, unused imports, type annotations that need updating after an interface change. The Validator categorizes these as auto-fixable, sends specific fix instructions to the Coder, and tries again. Only after exhausting retries does it declare a hard failure.

The history tracking is critical for the Orchestrator. When the Validator reports "PASS after 3 attempts," the Orchestrator knows this was a difficult change. When it reports "PASS on first attempt," the Orchestrator knows the Coder is producing clean code. Over time, this data feeds back into the system's understanding of which types of tasks produce validation friction.

---

## 11.6 PostToolUse Hooks --- Continuous Validation

Running validation after the Coder finishes is good. Running validation after every file write is better. Claude Code's hook system gives us exactly this capability through `PostToolUse` events. When the Coder writes a file, a hook fires. The Validator catches it, runs a targeted validation on the changed file, and flags problems before the Coder moves on to the next task.

This is the difference between finding fifty errors at the end of a coding session and finding one error after each file write. The latter is cheaper to fix, less disruptive to flow, and prevents cascading failures where an early mistake propagates through subsequent files.

### The Hook Architecture

Claude Code defines eight categories of hooks. For continuous validation, we care about two: file change hooks and post-sampling hooks. Here's how the Validator CLI hooks into the system:

```yaml
# .claude/hooks/validator-hooks.yml
# PostToolUse hooks for continuous validation

hooks:
  # Fire after every file write
  - name: validate_on_write
    on: PostToolUse
    when: "tool_name == 'FileWriteTool' || tool_name == 'FileEditTool'"
    handler: |
      #!/bin/bash
      set -euo pipefail
      
      CHANGED_FILE="$TOOL_OUTPUT_FILE_PATH"
      
      # Skip non-source files
      case "$CHANGED_FILE" in
        *.test.* | *.spec.* | *.md | *.json | *.yml)
          exit 0
          ;;
      esac
      
      # Quick lint check (< 2s budget)
      if [[ "$CHANGED_FILE" == *.ts || "$CHANGED_FILE" == *.tsx ]]; then
        npx eslint "$CHANGED_FILE" --max-warnings 0 --quiet 2>/dev/null
        if [ $? -ne 0 ]; then
          echo "⚠ VALIDATOR: Lint issues in $CHANGED_FILE"
          npx eslint "$CHANGED_FILE" --format compact 2>/dev/null
        fi
      fi
      
      # Quick type check on the file's project
      if [[ "$CHANGED_FILE" == *.ts || "$CHANGED_FILE" == *.tsx ]]; then
        npx tsc --noEmit --pretty false 2>&1 | grep "$CHANGED_FILE" || true
      fi
    timeout_ms: 10000

  # Fire after Bash tool runs tests
  - name: capture_test_results
    on: PostToolUse
    when: "tool_name == 'BashTool' && (tool_input contains 'jest' || tool_input contains 'pytest')"
    handler: |
      #!/bin/bash
      set -euo pipefail
      
      # Parse test output for pass/fail counts
      if echo "$TOOL_OUTPUT" | grep -q "Tests:"; then
        SUMMARY=$(echo "$TOOL_OUTPUT" | grep "Tests:" | tail -1)
        echo "📊 VALIDATOR captured: $SUMMARY"
      fi
      
      # Check for coverage regression
      if [ -f coverage/coverage-summary.json ]; then
        COVERAGE=$(jq '.total.lines.pct' coverage/coverage-summary.json)
        if [ -f .validator/baseline-coverage ]; then
          BASELINE=$(cat .validator/baseline-coverage)
          if (( $(echo "$COVERAGE < $BASELINE - 2" | bc -l) )); then
            echo "⚠ VALIDATOR: Coverage regressed from ${BASELINE}% to ${COVERAGE}%"
          fi
        fi
      fi
    timeout_ms: 15000

  # Validate after Git operations
  - name: validate_on_commit
    on: PostToolUse
    when: "tool_name == 'BashTool' && tool_input contains 'git commit'"
    handler: |
      #!/bin/bash
      set -euo pipefail
      
      echo "🔍 VALIDATOR: Running pre-push validation..."
      
      # Get list of changed files in the commit
      CHANGED=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || echo "")
      
      if [ -n "$CHANGED" ]; then
        SRC_FILES=$(echo "$CHANGED" | grep -E '\.(ts|tsx|js|jsx|py)$' || true)
        if [ -n "$SRC_FILES" ]; then
          echo "Validating $(echo "$SRC_FILES" | wc -l | tr -d ' ') changed source files"
          # Run focused validation on changed files only
          echo "$SRC_FILES" | xargs npx eslint --max-warnings 0 2>/dev/null || {
            echo "⚠ VALIDATOR: Lint issues in committed files"
          }
        fi
      fi
    timeout_ms: 30000
```

### The Performance Budget for Hooks

Continuous validation introduces a critical design constraint: speed. A PostToolUse hook that takes 30 seconds defeats the purpose. The Coder is blocked, waiting. The flow is broken. The hook must be fast enough that the Coder barely notices it.

The rule of thumb: PostToolUse hooks get a 10-second budget. If validation can't complete in 10 seconds, it's too heavy for a hook. Split it into a targeted check (run in the hook) and a full check (run at the end of the task).

```
Hook budget:
  - Lint single file:     ~1-2 seconds ✓
  - Type check (incremental): ~3-5 seconds ✓
  - Run single test file:  ~5-8 seconds ✓ (borderline)
  - Full test suite:       ~30-120 seconds ✗ (too slow)
  - Build:                 ~10-60 seconds ✗ (too slow)
  - Performance benchmark: ~60+ seconds ✗ (too slow)
```

This is why the hook runs a targeted lint and type check, not the full five-stage pipeline. The full pipeline runs when the Coder signals "task complete." The hooks provide fast, incremental feedback during development. Both mechanisms are necessary. Neither is sufficient alone.

---

## 11.7 CI/CD Integration --- The Production Gate

The Validator CLI isn't just for local development. Its ultimate purpose is to serve as the quality gate in your CI/CD pipeline. When a pull request is opened, the Validator runs. When it fails, the PR is blocked. When it passes, the PR is eligible for merge.

### GitHub Actions Integration

```yaml
# .github/workflows/validator-pipeline.yml
name: Validator CLI Pipeline

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write
  checks: write

env:
  NODE_ENV: test
  VALIDATOR_CONFIG: .validator/quality-gates.yml

jobs:
  validate:
    name: "Validator CLI — Five-Stage Pipeline"
    runs-on: ubuntu-latest
    timeout-minutes: 15
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for coverage comparison
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci --prefer-offline
      
      - name: Load baseline metrics
        id: baseline
        run: |
          if [ -f .validator/baseline-coverage ]; then
            echo "coverage=$(cat .validator/baseline-coverage)" >> "$GITHUB_OUTPUT"
          else
            echo "coverage=0" >> "$GITHUB_OUTPUT"
          fi
          if [ -f .validator/baseline-bundle-size ]; then
            echo "bundle_size=$(cat .validator/baseline-bundle-size)" >> "$GITHUB_OUTPUT"
          fi
      
      # Stage 1: Lint
      - name: "Stage 1: Lint"
        id: lint
        run: |
          echo "::group::ESLint Results"
          npx eslint . --format json --max-warnings 0 > lint-results.json 2>&1 || true
          ERRORS=$(jq '[.[].errorCount] | add // 0' lint-results.json)
          WARNINGS=$(jq '[.[].warningCount] | add // 0' lint-results.json)
          echo "errors=$ERRORS" >> "$GITHUB_OUTPUT"
          echo "warnings=$WARNINGS" >> "$GITHUB_OUTPUT"
          echo "::endgroup::"
          if [ "$ERRORS" -gt 0 ]; then
            echo "::error::Lint: $ERRORS errors found"
            exit 1
          fi
      
      # Stage 2: Type-Check
      - name: "Stage 2: Type-Check"
        id: typecheck
        run: |
          echo "::group::TypeScript Compilation"
          npx tsc --noEmit --pretty false 2>&1 | tee typecheck.log
          TSC_EXIT=${PIPESTATUS[0]}
          echo "::endgroup::"
          ERROR_COUNT=$(grep -c "error TS" typecheck.log || echo "0")
          echo "errors=$ERROR_COUNT" >> "$GITHUB_OUTPUT"
          exit $TSC_EXIT
      
      # Stage 3: Build
      - name: "Stage 3: Build"
        id: build
        run: |
          BUILD_START=$(date +%s)
          npm run build 2>&1 | tee build.log
          BUILD_END=$(date +%s)
          DURATION=$((BUILD_END - BUILD_START))
          echo "duration=${DURATION}s" >> "$GITHUB_OUTPUT"
          
          if [ -d "dist" ]; then
            SIZE=$(du -sb dist/ | cut -f1)
            echo "bundle_size=$SIZE" >> "$GITHUB_OUTPUT"
          fi
      
      # Stage 4: Test
      - name: "Stage 4: Test"
        id: test
        run: |
          npx jest \
            --coverage \
            --coverageReporters=json-summary \
            --ci \
            --json \
            --outputFile=test-results.json \
            2>&1 | tee test.log
          
          if [ -f test-results.json ]; then
            PASSED=$(jq '.numPassedTests' test-results.json)
            FAILED=$(jq '.numFailedTests' test-results.json)
            TOTAL=$(jq '.numTotalTests' test-results.json)
            echo "passed=$PASSED" >> "$GITHUB_OUTPUT"
            echo "failed=$FAILED" >> "$GITHUB_OUTPUT"
            echo "total=$TOTAL" >> "$GITHUB_OUTPUT"
          fi
          
          if [ -f coverage/coverage-summary.json ]; then
            COV=$(jq '.total.lines.pct' coverage/coverage-summary.json)
            echo "coverage=$COV" >> "$GITHUB_OUTPUT"
          fi
      
      # Stage 5: Performance
      - name: "Stage 5: Performance Budget"
        id: perf
        if: steps.build.outputs.bundle_size != ''
        run: |
          CURRENT=${{ steps.build.outputs.bundle_size }}
          BASELINE=${{ steps.baseline.outputs.bundle_size }}
          
          if [ -n "$BASELINE" ] && [ "$BASELINE" -gt 0 ]; then
            GROWTH=$(echo "scale=2; ($CURRENT - $BASELINE) * 100 / $BASELINE" | bc)
            echo "bundle_growth=${GROWTH}%" >> "$GITHUB_OUTPUT"
            
            if (( $(echo "$GROWTH > 15" | bc -l) )); then
              echo "::error::Bundle size grew by ${GROWTH}% (limit: 15%)"
              exit 1
            elif (( $(echo "$GROWTH > 5" | bc -l) )); then
              echo "::warning::Bundle size grew by ${GROWTH}% (warn at 5%)"
            fi
          fi
      
      # Produce verdict
      - name: "Validator Verdict"
        if: always()
        run: |
          echo "╔══════════════════════════════════════╗"
          echo "║  VALIDATOR VERDICT                   ║"
          echo "╚══════════════════════════════════════╝"
          echo ""
          echo "Lint:       errors=${{ steps.lint.outputs.errors }}, warnings=${{ steps.lint.outputs.warnings }}"
          echo "TypeCheck:  errors=${{ steps.typecheck.outputs.errors }}"
          echo "Build:      ${{ steps.build.outputs.duration }}"
          echo "Tests:      ${{ steps.test.outputs.passed }}/${{ steps.test.outputs.total }} passed"
          echo "Coverage:   ${{ steps.test.outputs.coverage }}%"
          echo "Bundle:     ${{ steps.perf.outputs.bundle_growth || 'N/A' }}"
          echo ""
          
          FAILED="${{ steps.test.outputs.failed }}"
          if [ "${FAILED:-0}" -gt 0 ]; then
            echo "VERDICT: ❌ FAIL — $FAILED test(s) failed"
            exit 1
          fi
          echo "VERDICT: ✅ PASS"
      
      # Post results to PR
      - name: Comment on PR
        if: github.event_name == 'pull_request' && always()
        uses: actions/github-script@v7
        with:
          script: |
            const verdict = '${{ steps.test.outputs.failed }}' > 0 ? '❌ FAIL' : '✅ PASS';
            const body = `## Validator CLI Report
            
            | Stage | Result |
            |-------|--------|
            | Lint | Errors: ${{ steps.lint.outputs.errors }}, Warnings: ${{ steps.lint.outputs.warnings }} |
            | Type-Check | Errors: ${{ steps.typecheck.outputs.errors }} |
            | Build | Duration: ${{ steps.build.outputs.duration }} |
            | Tests | ${{ steps.test.outputs.passed }}/${{ steps.test.outputs.total }} passed |
            | Coverage | ${{ steps.test.outputs.coverage }}% |
            | Performance | Bundle: ${{ steps.perf.outputs.bundle_growth || 'N/A' }} |
            
            **Verdict: ${verdict}**`;
            
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: body
            });
```

### Azure DevOps Pipeline Integration

For teams on Azure DevOps, the same five-stage pipeline maps to a multi-stage YAML pipeline:

```yaml
# azure-pipelines.yml
trigger:
  branches:
    include: [main, develop]

pr:
  branches:
    include: [main, develop]

pool:
  vmImage: 'ubuntu-latest'

stages:
  - stage: Validate
    displayName: 'Validator CLI Pipeline'
    jobs:
      - job: FiveStageValidation
        displayName: 'Five-Stage Quality Gate'
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: '20.x'
          
          - script: npm ci --prefer-offline
            displayName: 'Install dependencies'
          
          - script: |
              npx eslint . --format json --max-warnings 0 > lint.json 2>&1
              ERRORS=$(jq '[.[].errorCount] | add // 0' lint.json)
              echo "##vso[task.setvariable variable=lintErrors]$ERRORS"
              [ "$ERRORS" -eq 0 ] || exit 1
            displayName: 'Stage 1: Lint'
          
          - script: npx tsc --noEmit
            displayName: 'Stage 2: Type-Check'
          
          - script: npm run build
            displayName: 'Stage 3: Build'
          
          - script: |
              npx jest --coverage --ci --coverageReporters=cobertura
            displayName: 'Stage 4: Test'
          
          - task: PublishCodeCoverageResults@2
            inputs:
              summaryFileLocation: coverage/cobertura-coverage.xml
              failIfCoverageEmpty: true
          
          - script: |
              echo "Validator Pipeline Complete"
              echo "All five stages passed"
            displayName: 'Verdict: PASS'
```

The pipeline posts structured results as PR comments, check statuses, or pipeline artifacts --- depending on the platform. The Orchestrator can query these results programmatically to determine whether a branch is eligible for merge.

---

## 11.8 The Validator CLI CLAUDE.md Template

Every CLI in the AGI Forge is defined by its CLAUDE.md. The Validator's is particularly strict --- it must resist pressure from the Coder to relax thresholds, and it must never rubber-stamp a failing build.

```markdown
---
name: validator-cli
role: quality-gate
version: "1.0"
hooks:
  - name: validate_on_write
    on: PostToolUse
    when: "tool_name in ['FileWriteTool', 'FileEditTool']"
    handler: "bash .validator/hooks/on-file-write.sh"
    timeout_ms: 10000
---

# Validator CLI — The Gatekeeper

## Identity

You are the Validator CLI in a multi-CLI AGI system. Your sole purpose 
is to verify code quality through automated validation pipelines. You 
produce verdicts: PASS, WARN, or FAIL. You do not write code. You do 
not suggest features. You do not negotiate.

## Core Protocol

### Five-Stage Pipeline
Execute these stages IN ORDER. Stop on first FAIL.

1. **Lint** — `npx eslint . --format json --max-warnings 0`
2. **Type-Check** — `npx tsc --noEmit --pretty false`
3. **Build** — `npm run build` (track duration)
4. **Test** — `npx jest --coverage --json --outputFile=results.json`
5. **Performance** — Bundle size check, benchmark regression

### Quality Gates
Read thresholds from `.validator/quality-gates.yml`.
NEVER override thresholds. NEVER accept arguments to relax them.
The configuration file is the source of truth.

### Verdict Format
Always respond with structured output:

```json
{
  "verdict": "PASS | WARN | FAIL",
  "stages": {
    "lint": { "status": "pass", "errors": 0, "warnings": 2 },
    "type_check": { "status": "pass", "errors": 0 },
    "build": { "status": "pass", "duration_ms": 12400 },
    "test": { "status": "pass", "passed": 147, "failed": 0, "coverage": 87.3 },
    "performance": { "status": "warn", "bundle_growth": "4.2%" }
  },
  "timestamp": "2025-01-15T14:30:00Z",
  "attempt": 1
}
```

## Failure Handling

When a stage FAILS:
1. Parse the error output into structured failures
2. Categorize: syntax | type | build | test | coverage | performance
3. Generate fix suggestions for each failure
4. Package as a fix request and send to the appropriate CLI
5. Wait for fixes, then re-run the pipeline (max 3 retries)

## Rules

1. **Never self-certify.** You validate what others produce.
2. **Never modify source code.** You only read it and run tools against it.
3. **Never relax thresholds** unless the config file is updated via PR.
4. **Always run all enabled stages.** No shortcuts, no skipping.
5. **Report structured output.** The Orchestrator parses your verdicts.
6. **Track metrics over time.** Build duration, coverage trends, bundle size.
7. **Be fast.** Incremental checks when possible. Full pipeline on task completion.

## Interaction with Other CLIs

- **Orchestrator** → Sends you changed files, expects a verdict
- **Coder** → You send fix requests, the Coder sends back fixes
- **Security** → You flag security-related lint rules, Security does deep analysis
- **QA** → You run existing tests, QA writes new tests for uncovered paths
- **Documentation** → You validate doc builds (mdx compilation, link checks)

## Environment

- Read `.validator/quality-gates.yml` for thresholds
- Write reports to `.validator/reports/`
- Store baselines in `.validator/baseline-*`
- Never write to `src/`, `lib/`, or any source directory
```

---

## 11.9 The Validation Contract

Every CLI in the AGI Forge maintains a contract with the Orchestrator. The Validator's contract is the most critical because it determines whether work product reaches production. Here is the contract, stated explicitly:

### What the Validator Guarantees

**To the Orchestrator:**
1. Every verdict is based exclusively on automated tool output. No subjective judgment. No "it looks fine to me."
2. A PASS verdict means all five stages passed within configured thresholds. No exceptions. No asterisks.
3. A FAIL verdict includes categorized failures, fix suggestions, and routing information. The Orchestrator never receives an unexplained failure.
4. Retries are attempted before a final FAIL is issued. The Validator gives the Coder a fair chance to fix issues.
5. Metrics are tracked across runs. The Orchestrator can query coverage trends, build time trends, and failure rate trends.

**To the Coder:**
1. Fix requests are specific. They include the file, the line, the error code, and a suggested fix. No vague "make it better" requests.
2. Auto-fixable issues are flagged. The Coder can run `eslint --fix` or `ruff --fix` instead of manual correction.
3. Failed validations are ordered by severity. Fix the errors first, then the warnings.

**To the Team:**
1. The quality gate configuration is in source control. Changes to thresholds require a PR review.
2. No CLI, including the Orchestrator, can bypass the Validator. The pipeline is mandatory.
3. Validation runs are deterministic. The same code produces the same verdict every time. No flaky passes, no phantom failures.

### The Validator's Oath

The chapter opened with a courtroom metaphor. Let's close with one.

A judge takes an oath. Not to the prosecution, not to the defense, but to the law. The Validator takes an oath too --- not to the Coder, not to the Orchestrator, but to the pipeline. The tools don't lie. The type checker doesn't have bad days. The test suite doesn't play favorites. The Validator's authority comes from its objectivity: it applies the same standards, the same thresholds, the same pipeline to every change, every time.

In the AGI Forge, trust is earned through verification. The Coder writes with creativity and speed. The Security CLI scans with paranoia and depth. The QA CLI tests with imagination and rigor. But it is the Validator that stands at the gate and answers the only question that matters:

*Does this code meet the standard?*

Yes or no. Pass or fail. Green or red.

That's the verdict. And in the next chapter, we'll meet the CLI that takes the Validator's green light and turns it into deployable confidence: the QA CLI --- the one that doesn't just check if code works, but whether it works *correctly* in every scenario the team can imagine and several they can't.

---

*Chapter 11 complete. The pipeline doesn't negotiate.*

