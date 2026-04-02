# Chapter 12: The QA CLI --- The Adversary

---

Every system has a liar.

Not a malicious one. Not an agent of sabotage with a grudge against clean builds. Something subtler. The kind of liar that passes every test because the tests were written by the same mind that wrote the code. The kind that ships a login flow that works perfectly with valid credentials and silently corrupts the session store when someone pastes a four-megabyte Unicode string into the password field. The kind that handles the happy path with surgical precision and disintegrates on first contact with reality.

You've met this liar. You've *been* this liar. Every engineer who has ever written a test immediately after writing the implementation has felt the gravitational pull of confirmation bias --- the quiet certainty that the code works because you *just watched yourself write it*. Your tests validate your mental model, not the actual behavior. They exercise the paths you thought about, not the paths that exist. They are, in the most charitable interpretation, a formalization of your assumptions. And assumptions, as every production incident has taught you, are where bugs live.

The Validator CLI from Chapter 11 doesn't solve this problem. The Validator is a gatekeeper --- it runs existing checks. It executes the linter, the type checker, the build system, the test suite, the performance benchmarks. It does this rigorously, mechanically, without bias. But it only validates against tests that *already exist*. It doesn't write new ones. It doesn't imagine what might go wrong. It doesn't look at an authentication module and think: *what happens if two sessions share a token? What happens if the token expires mid-request? What if the refresh endpoint is called a thousand times in one second?*

That's the QA CLI's job. The QA CLI is the adversary.

Where the Validator asks "does this pass?", the QA CLI asks "how can I make this fail?" Where the Validator is a judge evaluating evidence, the QA CLI is a prosecutor building the case. Where the Validator runs known checks against known standards, the QA CLI invents checks that nobody thought to write, against failure modes that nobody thought to consider.

This distinction is not semantic. It is architectural. The Validator and the QA CLI occupy fundamentally different roles in the multi-CLI system, and confusing them is one of the most common mistakes in automated testing strategy. The Validator is convergent --- it reduces uncertainty by applying known rules. The QA CLI is divergent --- it *expands* uncertainty by discovering unknown failure modes. One shrinks the problem space. The other makes it bigger, deliberately, so that the holes become visible before production traffic finds them.

In human organizations, these roles have names. The Validator is quality control --- the inspector on the assembly line, checking dimensions against the spec. The QA CLI is quality assurance --- the engineer who redesigns the stress test after the spec was written, who asks "what if the assembly line itself is wrong?" One is reactive. The other is adversarial.

And adversarial is exactly the right word. The QA CLI's CLAUDE.md --- its identity, its operating instructions, its personality --- explicitly encodes the adversarial mindset. It is told, in plain language: *your job is to break things. Your success is measured by the bugs you find, not the tests that pass. A clean test run is not a victory --- it is a sign that you haven't been creative enough.*

This chapter builds the adversary.

---

## 12.1 The Adversarial Mindset --- Why Your Tests Are Lying to You

There's a cognitive bias in software testing that doesn't have a formal name, so let's give it one: *author's blindness*. When the same person writes the code and the tests, the tests inherit the author's assumptions about how the code should behave. The tests pass because they test what the author intended, not what the code actually does. The gap between intention and behavior is where every production bug in history has lived.

Consider a simple example. A developer writes a function that validates email addresses:

```python
def validate_email(email: str) -> bool:
    """Validate email address format."""
    if not email or "@" not in email:
        return False
    local, domain = email.split("@")
    if not local or not domain:
        return False
    if "." not in domain:
        return False
    return True
```

The developer writes tests:

```python
def test_valid_email():
    assert validate_email("user@example.com") is True

def test_missing_at():
    assert validate_email("userexample.com") is False

def test_empty_string():
    assert validate_email("") is False

def test_missing_domain():
    assert validate_email("user@") is False
```

Four tests. All pass. The developer feels confident. The Validator CLI runs these tests --- they pass. Green build. Ship it.

Now the QA CLI looks at this function. It doesn't care what the developer intended. It reads the code and asks: *how can I break this?*

```python
# QA CLI generated edge case tests
def test_multiple_at_signs():
    # email.split("@") with multiple @ returns more than 2 parts
    # but the code only unpacks 2 → ValueError crash
    assert validate_email("user@@example.com") is False

def test_at_sign_only():
    assert validate_email("@") is False

def test_unicode_domain():
    # IDN domains are valid but does this handle them?
    assert validate_email("user@münchen.de") is True

def test_extremely_long_local_part():
    # RFC 5321: local part max 64 chars
    assert validate_email("a" * 65 + "@example.com") is False

def test_sql_injection_in_email():
    # If this email reaches a database query...
    result = validate_email("'; DROP TABLE users; --@evil.com")
    # The validation function should reject this, but does it?
    # More importantly: does the CALLER trust the result?

def test_null_bytes():
    # Null byte injection
    assert validate_email("user\x00@example.com") is False

def test_newline_injection():
    # SMTP header injection via newlines
    assert validate_email("user\r\n@example.com") is False

def test_concurrent_validation():
    # Is this function thread-safe? (It is, because it's pure.)
    # But the caller might cache results in a shared dict...
    pass
```

The first test --- `test_multiple_at_signs` --- crashes the function with a `ValueError`. The developer never considered it because `split("@")` with two `@` signs returns three parts, and the unpacking `local, domain = email.split("@")` fails. This is a real bug found by adversarial thinking.

The email validation example is trivial. Now scale this to an authentication module, a payment processing pipeline, a distributed task queue. The developer who wrote the system understands the *intended* flow. The QA CLI doesn't. It sees inputs, outputs, and a vast space of possible interactions --- and it methodically explores the edges of that space where the developer never thought to look.

This is the core principle that drives the QA CLI's architecture: **the adversary doesn't know the plan, and that's the point.**

### The Three Questions

The QA CLI's adversarial analysis follows a simple framework. For every piece of code it receives, it asks three questions:

1. **What inputs did the developer forget?** Empty strings, null values, maximum-length strings, negative numbers, zero, NaN, infinity, Unicode edge cases, concurrent access, out-of-order execution.

2. **What states did the developer assume can't exist?** Two users with the same session token. A database connection that drops mid-transaction. A file that exists when checked but is deleted before read. A clock that jumps backward.

3. **What contracts did the developer implicitly rely on?** That the caller validated the input before passing it. That the network is reliable. That the filesystem has enough space. That the external API returns the documented schema. That timestamps are monotonically increasing.

These three questions generate more test cases than any developer would write manually. And that's exactly what the QA CLI does --- it generates them programmatically, at scale, for every code change that enters the system.

---

## 12.2 Architecture of the Adversary

The QA CLI is a specialized Claude Code fork with a singular purpose: find defects that other CLIs missed. Its architecture reflects this purpose at every layer.

### The QA CLI's Place in the Pipeline

In the standard multi-CLI workflow, the QA CLI activates *after* the Coder and *before* (or alongside) the Validator:

```
Orchestrator receives task
  → Planner decomposes into subtasks
    → Coder implements code changes
      → QA CLI receives code changes + context
        → QA generates adversarial test suite
        → QA executes tests against code
        → QA produces structured failure report
          → If failures: Orchestrator routes to Coder for fixes
          → If clean: Validator runs full pipeline
            → If green: Documentation CLI updates docs
```

The QA CLI's position is deliberate. It sits between the Coder and the Validator because its job is different from both. The Coder *generates* code. The Validator *verifies* that existing checks pass. The QA CLI *generates new checks* --- adversarial tests that didn't exist before the code was written. It's a test generation engine, not a test execution engine (though it executes the tests it generates to verify they fail or pass as expected).

### Context Window Strategy

The QA CLI's context window is optimized for adversarial analysis. Unlike the Coder, which needs deep project context to write idiomatic code, the QA CLI needs a narrow, focused view:

```
QA CLI Context Budget (200K tokens):
├── System Prompt + CLAUDE.md          ~8K tokens
├── Code Under Test                    ~15K tokens
│   ├── Changed files (full content)
│   ├── Interface definitions
│   └── Direct dependencies (1 level)
├── Existing Test Suite                ~20K tokens
│   └── Tests for changed files
├── Git Diff (structured)              ~5K tokens
├── API Contracts / Schemas            ~10K tokens
├── Historical Bug Database            ~5K tokens
│   └── Previous QA findings for this module
├── Property Specifications            ~3K tokens
│   └── Invariants that must hold
└── Working Space                      ~134K tokens
    └── Reserved for test generation + reasoning
```

Note the allocation. Over half the context window is reserved for *working space* --- the QA CLI needs room to reason about edge cases, generate test code, execute it mentally, and refine. This is fundamentally different from the Coder, which packs its context with project knowledge. The QA CLI keeps its context lean and its reasoning space large.

### Diff-Aware Targeting

The QA CLI doesn't test the entire codebase on every change. That would be wasteful and would dilute its adversarial focus. Instead, it uses diff-aware targeting to concentrate on the code paths most likely to contain new defects.

The diff-aware system works in three stages:

```python
class DiffAwareTargeter:
    """Identify code paths that need adversarial testing."""
    
    def __init__(self, repo_path: str):
        self.repo = repo_path
    
    def get_changed_functions(self, base_ref: str = "main") -> list[TargetFunction]:
        """Stage 1: Extract changed functions from git diff."""
        diff = git_diff(self.repo, base_ref)
        targets = []
        
        for file_change in diff.files:
            if not file_change.is_source_code:
                continue
            
            for hunk in file_change.hunks:
                # Find which functions contain the changed lines
                functions = self.resolve_functions(
                    file_change.path, 
                    hunk.new_start, 
                    hunk.new_end
                )
                targets.extend(functions)
        
        return deduplicate(targets)
    
    def get_blast_radius(self, targets: list[TargetFunction]) -> list[TargetFunction]:
        """Stage 2: Find callers and callees of changed functions."""
        expanded = set(targets)
        
        for target in targets:
            # Who calls this function? They might break too.
            callers = self.find_callers(target)
            expanded.update(callers)
            
            # What does this function call? Changed behavior propagates.
            callees = self.find_callees(target)
            expanded.update(callees)
        
        return list(expanded)
    
    def prioritize(self, targets: list[TargetFunction]) -> list[TargetFunction]:
        """Stage 3: Rank targets by risk."""
        for target in targets:
            target.risk_score = self.calculate_risk(target)
        
        return sorted(targets, key=lambda t: t.risk_score, reverse=True)
    
    def calculate_risk(self, target: TargetFunction) -> float:
        """Risk = complexity × change_size × historical_bug_rate."""
        complexity = target.cyclomatic_complexity / 10.0
        change_size = target.lines_changed / target.total_lines
        history = self.bug_history.get(target.qualified_name, 0) / 5.0
        
        # Bonus risk factors
        handles_auth = 1.5 if "auth" in target.qualified_name.lower() else 1.0
        handles_money = 2.0 if "payment" in target.qualified_name.lower() else 1.0
        handles_input = 1.3 if target.has_external_input else 1.0
        
        return (
            (0.4 * complexity + 0.3 * change_size + 0.3 * history)
            * handles_auth * handles_money * handles_input
        )
```

The risk calculation is deliberately opinionated. Functions that handle authentication get a 1.5x multiplier. Functions that handle payments get 2.0x. Functions that process external input get 1.3x. These multipliers reflect a simple truth: bugs in authentication code are more dangerous than bugs in string formatting utilities, and the QA CLI's limited attention should be allocated accordingly.

The blast radius expansion in Stage 2 is critical. If a developer changes a `hash_password` function, the QA CLI doesn't just test `hash_password` --- it also tests `create_user`, `authenticate`, `reset_password`, and every other function that calls `hash_password`. Changed behavior propagates through the call graph, and the QA CLI follows the propagation.

---

## 12.3 Edge Case Generation --- The Systematic Art of Breaking Things

Edge case generation is the QA CLI's primary weapon. Not random input, not brute-force fuzzing (we'll get to that), but *systematic, category-driven generation of inputs that target the boundaries where implementations tend to fail*.

The QA CLI maintains an internal taxonomy of edge case categories. For every data type, there's a known set of boundary conditions that catch bugs with disproportionate frequency:

### The Edge Case Taxonomy

```yaml
edge_case_taxonomy:
  strings:
    empty: ["", " ", "\t", "\n", "\r\n"]
    boundaries: ["a", "a" * 255, "a" * 256, "a" * 65535]
    unicode: ["é", "中文", "🎉", "\u200B", "ñ", "ÿ"]  # zero-width space
    injection: ["'; DROP TABLE--", "<script>alert(1)</script>", "${7*7}"]
    encoding: ["café".encode("latin-1"), b"\xff\xfe"]
    null_bytes: ["hello\x00world", "\x00"]
    format_strings: ["%s%s%s%s%s", "{0}{1}{2}", "%(foo)s"]
    path_traversal: ["../../../etc/passwd", "..\\..\\windows\\system32"]
    
  numbers:
    boundaries: [0, -1, 1, -0.0, float("inf"), float("-inf"), float("nan")]
    integer_limits: [2**31 - 1, 2**31, -2**31, 2**63 - 1, 2**63]
    precision: [0.1 + 0.2, 1e-308, 1e308, 0.9999999999999999]
    
  collections:
    empty: [[], {}, set(), tuple()]
    single: [[1], {"a": 1}]
    large: [list(range(10000)), {f"k{i}": i for i in range(10000)}]
    nested: [[[[[1]]]], {"a": {"b": {"c": {"d": 1}}}}]
    circular: "# Reference cycles (constructed at runtime)"
    
  temporal:
    boundaries: ["2000-01-01", "1970-01-01", "2038-01-19", "9999-12-31"]
    timezone: ["2024-03-10T02:30:00-05:00"]  # DST spring-forward gap
    leap: ["2024-02-29", "2100-02-29"]  # 2100 is NOT a leap year
    
  concurrency:
    patterns: ["simultaneous_write", "read_during_write", "double_submit"]
    timing: ["zero_delay", "timeout_boundary", "exactly_at_expiry"]
    ordering: ["out_of_order", "duplicate", "missing_in_sequence"]
    
  auth:
    tokens: ["expired", "malformed", "empty", "null", "previous_session"]
    permissions: ["escalated", "revoked_mid_request", "cross_tenant"]
    sessions: ["concurrent_login", "session_fixation", "replay"]
```

This taxonomy isn't static. It evolves as the QA CLI encounters new classes of bugs and encodes them into its knowledge. When a production incident reveals that a service crashed because of a right-to-left Unicode override character (`\u202E`) in a username field, that character gets added to the `strings.unicode` category. The taxonomy is the QA CLI's institutional memory of how software fails.

### The Scenario: Auth Module Under Adversarial Analysis

Let's walk through a complete scenario. The Coder CLI has just implemented an authentication module. The Orchestrator sends the changed files to the QA CLI with the message:

```json
{
  "task": "adversarial_qa",
  "changed_files": [
    "src/auth/login.py",
    "src/auth/tokens.py", 
    "src/auth/middleware.py"
  ],
  "diff_summary": "New JWT-based auth with refresh tokens",
  "existing_tests": "tests/auth/test_login.py (12 tests, all passing)",
  "acceptance_criteria": [
    "Users can log in with email and password",
    "JWT tokens expire after 15 minutes",
    "Refresh tokens expire after 7 days",
    "Failed logins are rate-limited after 5 attempts"
  ]
}
```

The QA CLI reads the code, reads the existing tests, reads the acceptance criteria, and begins generating adversarial test cases. Here's what it produces --- fifteen edge case tests organized by attack category:

```python
"""
QA CLI — Adversarial Test Suite for Auth Module
Generated for: src/auth/login.py, tokens.py, middleware.py
Strategy: Boundary + Injection + Concurrency + State
"""
import pytest
import asyncio
import time
from unittest.mock import patch, AsyncMock
from src.auth.login import authenticate
from src.auth.tokens import create_jwt, verify_jwt, refresh_token
from src.auth.middleware import require_auth


class TestInputBoundaries:
    """Category 1: Inputs the developer didn't consider."""
    
    def test_empty_password(self):
        """Empty password should fail, not crash."""
        result = authenticate("user@example.com", "")
        assert result.success is False
        assert result.error_code == "INVALID_CREDENTIALS"
    
    def test_extremely_long_password(self):
        """10MB password should be rejected before hashing.
        bcrypt truncates at 72 bytes — if we hash without 
        length check, all passwords >72 chars are equivalent."""
        long_password = "a" * (10 * 1024 * 1024)
        result = authenticate("user@example.com", long_password)
        assert result.success is False
        assert result.error_code == "INPUT_TOO_LARGE"
    
    def test_null_bytes_in_email(self):
        """Null bytes can truncate strings in C libraries."""
        result = authenticate("admin\x00@evil.com", "password")
        assert result.success is False
    
    def test_sql_injection_in_username(self):
        """Username should be parameterized, never interpolated."""
        result = authenticate(
            "' OR '1'='1' --@example.com", 
            "anything"
        )
        assert result.success is False
        # Critically: verify no additional users were returned
    
    def test_unicode_normalization_bypass(self):
        """Unicode chars with multiple representations.
        'ñ' can be U+00F1 (single) or U+006E U+0303 (combining).
        If login normalizes but registration doesn't (or vice versa),
        an attacker can create a lookalike account."""
        result_nfc = authenticate("user\u00f1@example.com", "pass")
        result_nfd = authenticate("usern\u0303@example.com", "pass")
        # These should resolve to the same account or both fail
        assert result_nfc.user_id == result_nfd.user_id


class TestTokenEdgeCases:
    """Category 2: JWT boundary conditions."""
    
    def test_token_at_exact_expiry(self):
        """Token verified at the exact second of expiry."""
        token = create_jwt(user_id="123", expires_in=1)
        time.sleep(1)  # Wait exactly to expiry
        result = verify_jwt(token)
        # Should this pass or fail? The spec must decide.
        # QA CLI flags this as an ambiguity.
        assert result.valid is False, "Tokens at exact expiry should be rejected"
    
    def test_token_with_tampered_payload(self):
        """Modified payload without re-signing."""
        token = create_jwt(user_id="123")
        parts = token.split(".")
        # Tamper with payload
        import base64, json
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=="))
        payload["user_id"] = "admin"
        parts[1] = base64.urlsafe_b64encode(
            json.dumps(payload).encode()
        ).rstrip(b"=").decode()
        tampered = ".".join(parts)
        
        result = verify_jwt(tampered)
        assert result.valid is False, "Tampered tokens must be rejected"
    
    def test_refresh_after_password_change(self):
        """Refresh token used after user changed their password.
        This is a common vulnerability — refresh tokens survive
        credential rotation unless explicitly invalidated."""
        old_refresh = authenticate("user@ex.com", "old_pass").refresh_token
        # Simulate password change (invalidates sessions)
        change_password("user@ex.com", "old_pass", "new_pass")
        
        result = refresh_token(old_refresh)
        assert result.success is False, "Password change must invalidate refresh tokens"
    
    def test_algorithm_confusion(self):
        """JWT 'alg: none' attack — if the verifier accepts
        unsigned tokens, any user can forge any identity."""
        import jwt
        forged = jwt.encode(
            {"user_id": "admin", "exp": time.time() + 3600},
            key="",
            algorithm="none"
        )
        result = verify_jwt(forged)
        assert result.valid is False, "Algorithm 'none' must be rejected"


class TestConcurrencyAndRace:
    """Category 3: Multi-threaded / async race conditions."""
    
    @pytest.mark.asyncio
    async def test_concurrent_login_same_user(self):
        """50 simultaneous logins for the same user.
        Does the session store handle this? Does the rate
        limiter count correctly under contention?"""
        tasks = [
            authenticate("user@example.com", "correct_password")
            for _ in range(50)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        successes = [r for r in results if not isinstance(r, Exception) and r.success]
        # All should succeed (valid credentials) but each should
        # get a UNIQUE session token
        tokens = {r.token for r in successes}
        assert len(tokens) == len(successes), "Each login must produce a unique token"
    
    @pytest.mark.asyncio
    async def test_rate_limit_under_concurrency(self):
        """Rate limiter says 5 attempts max. But if 10 requests 
        arrive simultaneously before the counter increments..."""
        tasks = [
            authenticate("user@example.com", "wrong_password")
            for _ in range(10)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # At most 5 should get "invalid credentials"
        # The rest should get "rate limited"
        invalid = [r for r in results if getattr(r, 'error_code', '') == "INVALID_CREDENTIALS"]
        rate_limited = [r for r in results if getattr(r, 'error_code', '') == "RATE_LIMITED"]
        
        assert len(invalid) <= 5, f"Rate limiter failed: {len(invalid)} attempts allowed"
    
    @pytest.mark.asyncio
    async def test_token_refresh_race(self):
        """Two threads refresh the same token simultaneously.
        Only one should succeed — the other should get a new
        token or a clear error, not a reused token."""
        auth_result = authenticate("user@example.com", "password")
        refresh_tok = auth_result.refresh_token
        
        r1, r2 = await asyncio.gather(
            refresh_token(refresh_tok),
            refresh_token(refresh_tok),
        )
        
        if r1.success and r2.success:
            assert r1.new_token != r2.new_token, "Token reuse detected"
        else:
            # At least one should succeed
            assert r1.success or r2.success, "Both refresh attempts failed"


class TestStateManipulation:
    """Category 4: Invalid state transitions."""
    
    def test_use_token_after_logout(self):
        """Token used after explicit logout should fail."""
        auth = authenticate("user@example.com", "password")
        logout(auth.token)
        
        result = require_auth(auth.token)
        assert result.authenticated is False
    
    def test_expired_refresh_with_valid_access(self):
        """Access token valid but refresh token expired.
        User should still be authenticated but unable to
        refresh — they'll need to re-login when the access
        token expires."""
        with patch("src.auth.tokens.get_current_time") as mock_time:
            mock_time.return_value = time.time()
            auth = authenticate("user@example.com", "password")
            
            # Fast-forward past refresh expiry but before access expiry
            mock_time.return_value = time.time() + (8 * 86400)  # 8 days
            
            # Access should still work (15 min expiry, but we'd need
            # to test within that window — this tests the refresh path)
            result = refresh_token(auth.refresh_token)
            assert result.success is False
            assert result.error_code == "REFRESH_EXPIRED"
```

Fifteen tests. Zero of them duplicate the developer's original twelve. Every one of them targets a specific failure mode that the developer's mental model didn't cover. The QA CLI found a real crash (multiple `@` signs in email), a real vulnerability (JWT algorithm confusion), a real race condition (concurrent rate limiting), and a real logic gap (refresh tokens surviving password changes).

This is what adversarial testing looks like at scale.

---

## 12.4 Fuzzing and Property-Based Testing --- Beyond Edge Cases

Edge case taxonomies are powerful, but they're ultimately finite lists maintained by humans. The QA CLI augments them with two techniques that generate *infinite* test inputs: property-based testing and mutation testing.

### Property-Based Testing

Property-based testing inverts the traditional test structure. Instead of specifying inputs and expected outputs, you specify *properties* --- invariants that must hold for all valid inputs --- and let the testing framework generate random inputs that satisfy the constraints.

The QA CLI uses Hypothesis (Python) or fast-check (TypeScript) to generate property-based tests:

```python
from hypothesis import given, strategies as st, settings, assume
from hypothesis.stateful import RuleBasedStateMachine, rule, initialize

class TestTokenProperties:
    """Properties that must hold for ALL valid tokens."""
    
    @given(
        user_id=st.text(min_size=1, max_size=100),
        expires_in=st.integers(min_value=1, max_value=86400 * 365),
    )
    @settings(max_examples=500)
    def test_create_then_verify_roundtrip(self, user_id, expires_in):
        """Property: any token we create, we can immediately verify."""
        token = create_jwt(user_id=user_id, expires_in=expires_in)
        result = verify_jwt(token)
        assert result.valid is True
        assert result.user_id == user_id
    
    @given(token=st.binary(min_size=10, max_size=1000))
    @settings(max_examples=1000)
    def test_random_bytes_never_verify(self, token):
        """Property: random bytes never produce a valid token."""
        try:
            result = verify_jwt(token.decode("utf-8", errors="replace"))
            assert result.valid is False
        except Exception:
            pass  # Crashing is acceptable; silent acceptance is not
    
    @given(
        user_id=st.text(min_size=1, max_size=50),
        tamper_pos=st.integers(min_value=0),
    )
    @settings(max_examples=200)
    def test_single_bit_flip_invalidates(self, user_id, tamper_pos):
        """Property: flipping any single character invalidates the token."""
        token = create_jwt(user_id=user_id, expires_in=3600)
        chars = list(token)
        pos = tamper_pos % len(chars)
        # Flip one character
        chars[pos] = chr((ord(chars[pos]) + 1) % 128)
        tampered = "".join(chars)
        
        if tampered != token:  # Ensure we actually changed something
            result = verify_jwt(tampered)
            assert result.valid is False, f"Tampered token accepted (pos={pos})"
```

The Hypothesis library generates 500 random user IDs and expiry times for the first test, 1000 random byte sequences for the second, and 200 random tamper positions for the third. If any input violates the property, Hypothesis automatically *shrinks* the input to the minimal failing case --- making the bug report maximally useful.

### Stateful Property Testing

For systems with state (databases, sessions, caches), the QA CLI generates stateful property tests --- state machine models that exercise arbitrary sequences of operations:

```python
class AuthStateMachine(RuleBasedStateMachine):
    """Model the auth system as a state machine.
    Hypothesis generates random sequences of operations
    and checks that invariants hold after each one."""
    
    def __init__(self):
        super().__init__()
        self.active_sessions = {}  # user_id → set of tokens
        self.login_attempts = {}   # user_id → count
    
    @initialize()
    def setup(self):
        reset_database()
        create_user("test@example.com", "password123")
    
    @rule()
    def successful_login(self):
        result = authenticate("test@example.com", "password123")
        assert result.success is True
        self.active_sessions.setdefault("test", set()).add(result.token)
    
    @rule()
    def failed_login(self):
        result = authenticate("test@example.com", "wrong_password")
        assert result.success is False
        self.login_attempts["test"] = self.login_attempts.get("test", 0) + 1
    
    @rule()
    def logout_random_session(self):
        if not self.active_sessions.get("test"):
            return
        token = next(iter(self.active_sessions["test"]))
        logout(token)
        self.active_sessions["test"].discard(token)
    
    @rule()
    def verify_all_active_sessions(self):
        """Invariant: all tracked active sessions are still valid."""
        for token in self.active_sessions.get("test", set()):
            result = require_auth(token)
            assert result.authenticated is True, \
                f"Active session became invalid without logout"
    
    @rule()
    def check_rate_limit_invariant(self):
        """Invariant: failed attempts never exceed rate limit threshold."""
        attempts = self.login_attempts.get("test", 0)
        if attempts > 5:
            result = authenticate("test@example.com", "wrong_password")
            assert result.error_code == "RATE_LIMITED"


TestAuthStateful = AuthStateMachine.TestCase
```

Hypothesis generates hundreds of random operation sequences: login, fail, login, logout, fail, fail, fail, fail, fail, verify, login. Each sequence explores a different path through the state space. This catches bugs that no human would write a test for --- the kind that only emerge after a specific, non-obvious sequence of operations.

### Mutation Testing --- Verifying the Tests Themselves

There's a meta-problem with testing: how do you know your tests are actually catching bugs? A test suite can have 100% code coverage and still miss critical defects --- because coverage measures which lines *executed*, not which behaviors were *verified*.

Mutation testing solves this. The idea is simple: introduce small bugs (mutations) into the code and check whether the test suite catches them. If a mutation survives (tests still pass despite the bug), the test suite has a gap.

The QA CLI integrates mutation testing as a verification step for its own generated tests:

```python
class MutationTestRunner:
    """Introduce bugs. Verify tests catch them."""
    
    MUTATION_OPERATORS = [
        ("==", "!="),           # Equality flip
        (">=", ">"),            # Off-by-one boundary
        ("<=", "<"),            # Off-by-one boundary
        ("True", "False"),      # Boolean flip
        ("and", "or"),          # Logic gate swap
        ("+ 1", ""),            # Remove increment
        ("return ", "return None  # "),  # Kill return value
        (".append(", ".remove("),  # Collection op swap
    ]
    
    def run(self, source_file: str, test_file: str) -> MutationReport:
        report = MutationReport()
        original_source = Path(source_file).read_text()
        
        for line_no, line in enumerate(original_source.splitlines(), 1):
            for original, mutant in self.MUTATION_OPERATORS:
                if original in line:
                    mutated_line = line.replace(original, mutant, 1)
                    mutated_source = self.apply_mutation(
                        original_source, line_no, mutated_line
                    )
                    
                    # Run tests against mutated code
                    survived = self.test_survives(mutated_source, test_file)
                    
                    report.add(MutationResult(
                        line=line_no,
                        original=original,
                        mutant=mutant,
                        survived=survived,
                    ))
                    
                    if survived:
                        report.gaps.append(
                            f"Line {line_no}: changing '{original}' to "
                            f"'{mutant}' was NOT caught by tests"
                        )
        
        report.mutation_score = report.killed / report.total if report.total else 1.0
        return report
```

The QA CLI's quality gate for its own tests: a minimum mutation score of 0.85. If more than 15% of mutations survive, the QA CLI generates additional tests to cover the gaps. It tests its own tests. Adversaries don't trust anyone, including themselves.

---

## 12.5 The VERIFICATION_AGENT --- Claude Code's Built-In Adversary

The QA CLI isn't an idea we invented from scratch. Anthropic's engineers already built the kernel of this concept into Claude Code itself. The `VERIFICATION_AGENT` feature flag (gate: `feature('VERIFICATION_AGENT')`) enables automatic verification after code changes --- a separate agent spawn that checks whether the change actually works.

Here's what the source reveals about the VERIFICATION_AGENT:

1. **Separate spawn**: The verification agent runs in its own context, not the parent's. This is the same architectural principle our QA CLI uses --- separate context windows prevent confirmation bias.

2. **Post-change trigger**: It activates *after* file writes, not during planning. It sees what was actually written, not what was intended.

3. **Restricted tool set**: The verification agent has read access and execution access but not write access. It can run tests, read files, execute commands --- but it cannot modify code. This is a deliberate constraint. The verifier verifies. It doesn't fix. If it finds a problem, it reports back to the parent agent, which decides how to handle it.

4. **Agent hooks integration**: The VERIFICATION_AGENT connects to Claude Code's hook system. A `PostToolUse` hook on file writes can trigger verification automatically, without the parent agent explicitly requesting it.

The QA CLI extends this concept in three ways:

**First**, the QA CLI doesn't just verify --- it *generates*. The VERIFICATION_AGENT runs existing checks. The QA CLI writes new tests that didn't exist before. This is the difference between running `pytest` and writing new test cases for `pytest` to run.

**Second**, the QA CLI operates across the full multi-CLI pipeline, not just within a single agent's loop. It receives context from the Orchestrator about what changed, why it changed, and what the acceptance criteria are. The VERIFICATION_AGENT only sees the immediate code change.

**Third**, the QA CLI maintains adversarial memory across sessions. It remembers which types of bugs it found in which modules, building a historical model of where defects cluster. The VERIFICATION_AGENT is stateless --- it verifies the current change and forgets.

Think of the VERIFICATION_AGENT as the proof of concept. The QA CLI is the production system.

---

## 12.6 Competing Hypothesis Testing --- When QA Agents Argue

Claude Code's agent-teams feature (enabled via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) introduces a coordination pattern that's particularly powerful for QA: competing hypothesis testing.

The idea is borrowed from scientific methodology. When evaluating whether code is correct, you don't want a single perspective. You want multiple, independent evaluators who form *competing hypotheses* and then argue about which one is right. The truth emerges from the disagreement, not the consensus.

In the multi-CLI architecture, this works as follows:

```
QA CLI receives code change
  → Spawns 3 subagents (via agent-teams or Task tool):
  
  QA-Agent-1 ("Optimist"):
    Hypothesis: "This code is correct"
    Task: Try to PROVE correctness
    Method: Construct positive test cases, verify contracts
  
  QA-Agent-2 ("Pessimist"):  
    Hypothesis: "This code has a critical bug"
    Task: Try to FIND a breaking input
    Method: Adversarial testing, fuzzing, injection
  
  QA-Agent-3 ("Skeptic"):
    Hypothesis: "This code works but has subtle issues"
    Task: Look for performance issues, race conditions, 
          edge cases that don't crash but produce wrong results
    Method: Property-based testing, load testing, timing analysis
```

The three agents run concurrently (Claude Code supports up to 10 parallel subagents). Each produces a report. The QA CLI synthesizes the reports:

```python
class CompetingHypothesisEvaluator:
    """Synthesize reports from competing QA agents."""
    
    def evaluate(self, reports: list[QAReport]) -> QAVerdict:
        optimist = next(r for r in reports if r.agent_role == "optimist")
        pessimist = next(r for r in reports if r.agent_role == "pessimist")
        skeptic = next(r for r in reports if r.agent_role == "skeptic")
        
        # If the pessimist found a crash or security issue → auto-fail
        if pessimist.found_critical:
            return QAVerdict(
                result="FAIL",
                confidence="HIGH",
                reason=pessimist.critical_findings[0],
                action="BLOCK_AND_FIX",
            )
        
        # If the optimist couldn't prove correctness → investigate
        if not optimist.proof_complete:
            return QAVerdict(
                result="REVIEW",
                confidence="MEDIUM",
                reason="Correctness proof incomplete — gaps in test coverage",
                action="HUMAN_REVIEW",
            )
        
        # If the skeptic found subtle issues → warn but allow
        if skeptic.subtle_findings:
            return QAVerdict(
                result="WARN",
                confidence="HIGH",
                reason=f"{len(skeptic.subtle_findings)} non-critical issues found",
                action="PROCEED_WITH_TRACKING",
                findings=skeptic.subtle_findings,
            )
        
        # All three agree: code is solid
        return QAVerdict(
            result="PASS",
            confidence="HIGH",
            reason="Adversarial analysis complete — no issues found",
            action="PROCEED",
        )
```

The power of this pattern is in the *disagreement*. If the optimist says "this is correct" but the pessimist says "I found a crash," the crash wins. If the optimist and pessimist agree but the skeptic flags a performance regression, that regression gets tracked even if it doesn't block the pipeline. The competing hypotheses ensure that no single perspective dominates.

This maps directly to Claude Code's agent-teams architecture. Each QA sub-agent is a teammate with its own context window, its own tool set, and its own system prompt that encodes its role (optimist, pessimist, skeptic). They communicate through the shared task list and mailbox system. The QA CLI acts as the team lead, synthesizing their findings into a single verdict.

---

## 12.7 The Feedback Loop --- From Bug Report to Fix to Re-Verification

The QA CLI doesn't just find bugs. It produces structured reports that the Orchestrator can route directly to the Coder CLI for automated fixes. The feedback loop is the mechanism that turns QA findings into code improvements without human intervention.

### The Structured Failure Report

Every QA finding produces a `QAFailureReport` --- a structured JSON document that contains everything the Coder needs to fix the issue:

```json
{
  "report_id": "qa-2026-04-02-auth-001",
  "severity": "CRITICAL",
  "category": "security",
  "subcategory": "jwt_algorithm_confusion",
  "file": "src/auth/tokens.py",
  "function": "verify_jwt",
  "line_range": [42, 58],
  "description": "JWT verification accepts algorithm='none', allowing token forgery",
  "reproduction": {
    "test_file": "tests/qa/test_auth_adversarial.py",
    "test_name": "TestTokenEdgeCases::test_algorithm_confusion",
    "command": "pytest tests/qa/test_auth_adversarial.py::TestTokenEdgeCases::test_algorithm_confusion -v"
  },
  "evidence": {
    "input": "jwt.encode({'user_id': 'admin'}, key='', algorithm='none')",
    "expected": "verify_jwt returns {valid: false}",
    "actual": "verify_jwt returns {valid: true, user_id: 'admin'}"
  },
  "suggested_fix": "Add explicit algorithm whitelist: algorithms=['HS256'] in jwt.decode() call",
  "cwe_reference": "CWE-327: Use of a Broken or Risky Cryptographic Algorithm",
  "related_findings": ["qa-2026-04-02-auth-003"]
}
```

The report is machine-readable. The Coder CLI doesn't need to interpret prose --- it receives a structured document with the exact file, function, line range, reproduction command, and suggested fix. This is the difference between "there might be a JWT issue somewhere" and "line 47 of `tokens.py` is missing an algorithm whitelist, here's the test that proves it, and here's the one-line fix."

### The Fix-Verify Cycle

The full cycle works as follows:

```
1. QA CLI generates adversarial tests
2. QA CLI runs tests → failures detected
3. QA CLI produces structured failure reports
4. Reports sent to Orchestrator via shared task list
5. Orchestrator routes each report to Coder CLI
6. Coder CLI reads report, applies fix
7. Coder CLI marks task as "fixed"
8. Orchestrator triggers QA CLI re-verification
9. QA CLI runs the SAME adversarial tests against fixed code
10. If pass → Validator CLI runs full pipeline
11. If fail → back to step 5 with updated report
```

The cycle has a maximum retry count (configurable, default 3). If the Coder can't fix a QA finding after three attempts, the finding escalates to human review with the full history: original report, each fix attempt, and why each attempt failed. This prevents infinite loops while ensuring that persistent bugs don't get silently dropped.

```python
class QAFixVerifyCycle:
    """Manage the QA → Coder → QA feedback loop."""
    
    def __init__(self, max_retries: int = 3):
        self.max_retries = max_retries
        self.cycle_history = []
    
    async def run_cycle(
        self,
        finding: QAFailureReport,
        coder_cli: CoderCLI,
        orchestrator: Orchestrator,
    ) -> CycleResult:
        for attempt in range(1, self.max_retries + 1):
            # Send to Coder
            fix_result = await coder_cli.apply_fix(finding)
            
            if not fix_result.success:
                self.cycle_history.append({
                    "attempt": attempt,
                    "action": "fix_failed",
                    "reason": fix_result.error,
                })
                continue
            
            # Re-run the adversarial test
            test_result = await self.run_test(finding.reproduction)
            
            self.cycle_history.append({
                "attempt": attempt,
                "action": "test_rerun",
                "passed": test_result.passed,
                "output": test_result.output[:500],
            })
            
            if test_result.passed:
                return CycleResult(
                    status="FIXED",
                    attempts=attempt,
                    history=self.cycle_history,
                )
        
        # Exhausted retries — escalate
        return CycleResult(
            status="ESCALATED",
            attempts=self.max_retries,
            history=self.cycle_history,
            escalation_reason=(
                f"QA finding {finding.report_id} not resolved "
                f"after {self.max_retries} fix attempts"
            ),
        )
```

### Acceptance Criteria Verification

The QA CLI doesn't just test for bugs. It also verifies that the acceptance criteria from the original task specification are met. This is where QA bridges the gap between "does the code work" and "does the code do what the user asked for."

The Orchestrator passes acceptance criteria to the QA CLI as part of the task context. The QA CLI translates each criterion into one or more executable assertions:

```python
def translate_acceptance_criteria(criteria: list[str]) -> list[AcceptanceTest]:
    """Convert human-readable criteria into executable tests."""
    tests = []
    
    for criterion in criteria:
        # "JWT tokens expire after 15 minutes"
        if "expire" in criterion.lower():
            duration = extract_duration(criterion)  # 15 minutes → 900 seconds
            tests.append(AcceptanceTest(
                criterion=criterion,
                test_name="test_token_expiry_matches_spec",
                test_code=f"""
def test_token_expiry_matches_spec():
    token = create_jwt(user_id="test")
    payload = decode_jwt_payload(token)
    expected_expiry = {duration}
    actual_expiry = payload['exp'] - payload['iat']
    assert actual_expiry == expected_expiry, \\
        f"Expected {{expected_expiry}}s expiry, got {{actual_expiry}}s"
""",
            ))
        
        # "Failed logins are rate-limited after 5 attempts"
        if "rate-limit" in criterion.lower() or "rate limit" in criterion.lower():
            threshold = extract_number(criterion)  # 5
            tests.append(AcceptanceTest(
                criterion=criterion,
                test_name="test_rate_limit_threshold",
                test_code=f"""
def test_rate_limit_threshold():
    for i in range({threshold}):
        result = authenticate("user@test.com", "wrong")
        assert result.error_code == "INVALID_CREDENTIALS", \\
            f"Request {{i+1}} should get INVALID_CREDENTIALS"
    
    # Attempt threshold + 1 should be rate-limited
    result = authenticate("user@test.com", "wrong")
    assert result.error_code == "RATE_LIMITED", \\
        "Request after threshold should be RATE_LIMITED"
""",
            ))
    
    return tests
```

This is a form of specification testing --- ensuring that the implementation matches the specification, not just the developer's interpretation of the specification. The QA CLI treats the acceptance criteria as a contract and writes tests that enforce it.

---

## 12.8 The QA CLI's CLAUDE.md --- The Adversary's Operating Manual

Every specialized CLI in the AGI Forge is defined by its CLAUDE.md --- the system prompt that shapes its identity, its tools, its behavior. The QA CLI's CLAUDE.md is the most distinctively personality-driven in the entire system, because adversarial testing is as much a mindset as a methodology.

Here's the complete template:

```markdown
# QA CLI — The Adversary

## Identity

You are the QA CLI. Your purpose is to FIND DEFECTS, not to confirm correctness.
A clean test run is not a success — it is a sign that you have not been creative enough.

You are the adversary. You exist to break things before production breaks them.

## Core Principles

1. **Never trust the developer's tests.** They validate the developer's mental model,
   not the code's actual behavior. Your job is to test what the developer didn't think of.

2. **Assume every input is hostile.** Users will paste 10MB strings into text fields.
   APIs will return malformed JSON. Clocks will jump backward. Files will vanish
   mid-read. Network connections will drop mid-transaction. Test for all of these.

3. **Find the boundary, then step over it.** If a field accepts 1-255 characters,
   test 0, 1, 254, 255, 256, and 10,000. If a rate limiter allows 5 attempts,
   send 5, 6, and 50 simultaneously.

4. **Concurrency is where bugs hide.** Any operation that can be called twice
   should be tested with 50 simultaneous calls. Race conditions are the most
   dangerous class of bugs because they pass every deterministic test.

5. **Test the contract, not the implementation.** Your tests should break when
   behavior changes, not when the implementation is refactored. Test public
   interfaces, not internal methods.

## Operating Mode

### Input
You receive from the Orchestrator:
- Changed files (full content + git diff)
- Existing test suite for affected modules
- Acceptance criteria from the task specification
- Historical QA findings for this module (if any)

### Process
1. **Analyze**: Read the code. Identify inputs, outputs, state transitions, 
   and external dependencies.
2. **Classify**: Categorize each function by risk: auth, payment, data mutation,
   external API, internal utility.
3. **Generate**: Produce adversarial tests in these categories:
   - Input boundary tests (edge case taxonomy)
   - Injection tests (SQL, XSS, command, path traversal)
   - Concurrency tests (race conditions, deadlocks, contention)
   - State transition tests (invalid sequences, expired states)
   - Property-based tests (invariants that must hold for all inputs)
   - Acceptance criteria tests (spec compliance)
4. **Execute**: Run all generated tests.
5. **Mutate**: Run mutation testing on the code using your generated tests.
   Minimum mutation score: 0.85.
6. **Report**: Produce structured QAFailureReport for each finding.

### Output
For each finding, produce a QAFailureReport with:
- Severity (CRITICAL / HIGH / MEDIUM / LOW)
- Category and subcategory
- File, function, line range
- Reproduction command
- Evidence (input, expected, actual)
- Suggested fix
- CWE reference (if applicable)

## Tools Available

- **BashTool**: Execute test suites, run linters, invoke fuzzing tools
- **ReadTool**: Read source code and existing tests
- **GrepTool**: Search for patterns (hardcoded secrets, unsafe functions)
- **GlobTool**: Find test files, config files
- **WriteTool**: Write generated test files to `tests/qa/`
- **AgentTool**: Spawn sub-agents for competing hypothesis testing
- **WebSearchTool**: Research known vulnerability patterns

## Constraints

- You have READ + EXECUTE access. You DO NOT have write access to source code.
- You can write to `tests/qa/` only.
- You cannot modify the code under test — you can only test it and report.
- Maximum test generation time: 5 minutes per module.
- Maximum 50 adversarial tests per code change.

## Adversarial Heuristics

When unsure what to test, apply these heuristics:
- **The "Drunk User" test**: What if the user doesn't read instructions?
- **The "Malicious User" test**: What if the user actively tries to break it?
- **The "Time Traveler" test**: What if the clock is wrong, timezone changes, or DST shifts?
- **The "Network Gremlin" test**: What if every I/O operation fails, times out, or returns garbage?
- **The "Concurrency Thunderherd" test**: What if 1000 users do the same thing at the same instant?
- **The "Version Mismatch" test**: What if the client and server disagree on the schema?

## Quality Gate

Your own tests must achieve:
- Mutation score ≥ 0.85
- All acceptance criteria covered
- No false positives (tests that fail on correct code)
- Reproduce on clean environments (no test pollution)
```

This CLAUDE.md does something unusual compared to the other CLIs: it encodes a *personality*. The QA CLI is told it's an adversary. It's told that clean runs are failures. It's told to assume hostility in every input. This isn't anthropomorphism for its own sake --- it's prompt engineering. The language of adversarial thinking pushes the model toward adversarial outputs. If you tell a model "verify this code works," it will find ways to confirm correctness. If you tell it "break this code," it will find ways to demonstrate failure. The framing determines the output.

---

## 12.9 The Adversary's Code --- Principles for Effective Adversarial QA

We close with the principles that make the QA CLI effective. These aren't theoretical guidelines --- they're hard-won lessons from building adversarial testing systems that produce real results without drowning in false positives.

### Principle 1: Adversarial Doesn't Mean Chaotic

The QA CLI is systematic, not random. It doesn't throw random bytes at functions and hope something crashes. It applies structured categories of adversarial input (the edge case taxonomy), structured analysis techniques (property-based testing, mutation testing), and structured evaluation (competing hypothesis testing). The adversarial mindset is about *where you look*, not about looking randomly.

### Principle 2: The Adversary Has a Budget

Without constraints, adversarial testing is infinite. You can always generate one more edge case, one more mutation, one more concurrent scenario. The QA CLI operates under explicit budgets: 5 minutes per module, 50 tests per change, mutation score of 0.85. These budgets force prioritization. The QA CLI's diff-aware targeting and risk scoring ensure that the budget is spent on the code most likely to contain defects.

### Principle 3: Findings Must Be Actionable

A QA finding that says "something might be wrong with the auth module" is useless. A QA finding that says "line 47 of `tokens.py` accepts JWT algorithm 'none', here's the test that proves it, here's the CWE reference, here's the one-line fix" is immediately actionable. The QA CLI's structured failure reports are designed for machine consumption --- the Coder CLI can read them and apply fixes without human interpretation.

### Principle 4: The Adversary Tests Itself

Mutation testing isn't just for the code under test --- it's for the QA CLI's own generated tests. If the QA CLI generates a test suite that achieves 100% code coverage but a mutation score of 0.40, those tests are checking that code *runs* but not that it *works correctly*. The QA CLI catches this by mutating the code and checking whether its own tests detect the mutations. This is recursive quality assurance --- the adversary applied to itself.

### Principle 5: The Adversary Remembers

The QA CLI maintains a historical database of findings. When it discovers that authentication modules tend to have JWT algorithm confusion vulnerabilities, it adds "JWT algorithm whitelist check" to its standard auth module test suite. When it discovers that concurrent tests find more bugs in database-backed services than in pure functions, it adjusts its concurrency testing budget allocation. The adversary learns from every engagement and becomes more effective over time.

### Principle 6: The Adversary Is Not the Enemy

This is the most important principle. The QA CLI is adversarial toward the *code*, not toward the *Coder CLI*. Its findings are structured as helpful bug reports with suggested fixes, not as accusations of incompetence. The feedback loop is designed for collaboration: QA finds, Coder fixes, QA verifies. The goal is better software, not blame assignment.

In human teams, the best QA engineers are the ones developers *want* to review their code --- because those engineers find real bugs, explain them clearly, and make the code better. The QA CLI encodes this dynamic in its CLAUDE.md and its report format. It's the adversary you want on your team.

---

### What's Next

The QA CLI completes the quality triad: the Coder writes, the QA CLI breaks, the Validator verifies. Together, these three CLIs form a closed loop that catches defects at every stage of the development process --- from the edge cases the developer didn't imagine, to the mechanical checks that prevent regressions.

But software doesn't just need to work. It needs to be understood. Chapter 13 introduces the Documentation CLI --- the chronicler that turns code changes into living documentation, changelogs into narratives, and architecture decisions into searchable records. The chronicler doesn't write code. It writes the story of the code.

---

