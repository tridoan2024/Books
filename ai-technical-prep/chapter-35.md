# Chapter 35: Agent evaluation, GenAI tracing and release evidence

> **Reading note — additive technical review (October 16, 2026):** The original examples and interview answers are retained; their “production-grade,” “signed,” calibrated-judge and benchmark claims are not verified releases. SHA-256 is a digest, not a signature. Order swapping can expose positional instability but cannot eliminate all judge bias. Sample counts, kappa thresholds and p-values need workload-specific justification. The original invalid-output test actually yields four failure reasons, not its asserted three, and its module imports are incomplete. Read [Technical Foundations and Clarifications](#technical-foundations-and-clarifications) for statistics, tracing and a fail-closed offline gate; a passing evaluation still does not authorize deployment. The appendix uses a pinned OTel convention revision rather than treating “v1.28+” as a timeless standard.

> **Part:** Part IX — Principal Engineering for Enterprise Agentic AI Platforms  
> **Market evidence:** Target-role review (All three Abbott Principal roles: `AG`, `PL`, `ML`, Oct 2026). Required and core duties: evaluation frameworks, task success and safety metrics, programmatic assertions vs. LLM-as-judge calibration, OpenTelemetry GenAI distributed tracing, online/shadow/A-B evaluation, and machine-readable release evidence bundles. Builds on Chapters 10, 11, 18, 23, and 24.  
> **Reader status:** Principal / Staff+ engineers, MLOps leads, and quality engineering architects responsible for certifying AI agent systems for production release. Assumes statistical hypothesis testing, distributed tracing, and CI/CD pipeline prerequisites.  
> **Why this chapter exists:** "Vibe checks" (developers informally testing prompts in a playground) are completely unacceptable for enterprise systems. An agent that modifies code, queries patient data, or executes financial transactions requires rigorous, reproducible, statistical release evidence. If a prompt or model update degrades tool-calling accuracy by 4% or increases jailbreak vulnerability, the CI/CD pipeline must fail automatically. This chapter teaches how to engineer an end-to-end evaluation harness, calibrated judge pipelines, OpenTelemetry-compliant distributed tracing, and immutable release evidence bundles.  
> **Source review:** October 2026. OpenTelemetry Semantic Conventions for Generative AI (v1.28+), LLM-as-a-Judge statistical alignment (Cohen's Kappa, Pearson correlation), and modern observability platforms (Langfuse, Arize Phoenix, OpenInference) are synthesized into enterprise release standards.  

---

## What You Must Be Able to Defend

In an enterprise release gate review or Principal interview, you must defend:
1. **Programmatic Assertions vs. Model Judgments:** Why deterministic assertions (JSON schema validity, tool call parameters, latency limits, regex boundaries) must form the primary release gate before spending budget on LLM-as-a-judge evaluators.
2. **LLM-as-a-Judge Calibration & Bias Mitigation:** How to measure inter-annotator agreement (Cohen’s Kappa $\kappa \ge 0.70$) between model judges and gold-standard human reviewers, and how to eliminate position bias, verbosity bias, and self-enhancement bias.
3. **End-to-End GenAI Distributed Tracing:** How OpenTelemetry spans link the entire execution DAG: User Ingress → Gateway → Agent Planner → Tool Calls → Context Retrieval → Model Generation, carrying immutable artifact version tags.
4. **Statistical Release Gates and Paired Regressions:** How McNemar’s test and paired t-tests prove that an agent update improves task success with statistical significance ($p < 0.05$) without introducing regressions on critical safety benchmarks.
5. **PII/PHI Sanitization in Observability:** How to capture distributed traces for debugging without logging sensitive healthcare records, passwords, or customer PII into observability backends.
6. **Machine-Readable Release Evidence Bundles:** What constitutes an auditable cryptographic release manifest that satisfies internal governance, compliance officers, and external auditors.

---

## Engineering Context

### 1. The Death of "Vibe Checks"

In early-stage AI engineering, an engineer edits a prompt, tries three queries, observes reasonable responses, and commits the code. In production, this causes immediate disasters:
- The updated prompt improves creative formatting but reduces tool-calling parameter accuracy by 8%.
- The new prompt accidentally removes a system safeguard against prompt extraction.
- A model upgrade from `gpt-4o-mini-2024-07-18` to `gpt-4o-2024-08-06` increases token generation costs by 400% without improving task success on domain tasks.

Enterprise AI release engineering replaces human intuition with an **Automated Evidence Pipeline**. Every PR modifying an agent, prompt, tool, or retrieval pipeline runs through a multi-tiered test suite that emits a signed, machine-readable verification artifact.

```
THE MATURE RELEASE EVIDENCE PIPELINE:
[Git PR: Prompt / Code / Tool Update]
          │
          ▼
┌────────────────────────────────────────────────────────┐
│ Tier 1: Deterministic Gates (Fast, Free, Local)       │
│ - Schema Validation (Pydantic / JSON Schema)           │
│ - Security Linting & Regex Injection Scans             │
│ - Unit Tests & Tool Mock Assertions                    │
└───────────────────────┬────────────────────────────────┘
                        ▼ (Pass)
┌────────────────────────────────────────────────────────┐
│ Tier 2: Offline Golden Dataset Evals                   │
│ - 500 Curated Production Domain Cases                  │
│ - Ground Truth Execution Assertions                    │
│ - Calibrated LLM-as-a-Judge Evaluation                │
│ - Statistical Paired Significance Test (McNemar / p<0.05)│
└───────────────────────┬────────────────────────────────┘
                        ▼ (Pass)
┌────────────────────────────────────────────────────────┐
│ Tier 3: Canary / Shadow Online Evaluation              │
│ - 5% Production Traffic Shadowing                      │
│ - OpenTelemetry Trace Telemetry (Drift, TTFT, Cost)    │
│ - Real-Time User Feedback / Escalation Signals         │
└───────────────────────┬────────────────────────────────┘
                        ▼ (Pass)
          [Cryptographically Signed Release Bundle] ───► Production Deployment
```

### 2. The Evaluation Hierarchy

Evaluation metrics must be stratified by computational cost, determinism, and business impact:

| Eval Level | Metric Examples | Evaluator Type | When to Run | Cost / Latency |
|---|---|---|---|---|
| **Level 1: Syntactic & Structural** | JSON Schema compliance, valid tool name, required parameters present, max token bounds. | Deterministic Python / JSON Schema validator. | Pre-commit / Every CI commit. | $0.00 / <5ms per test. |
| **Level 2: Grounding & Retrieval** | Context Precision, Context Recall, Faithfulness (RAG Triad), Citation validity. | Deterministic token overlap + Small NLI cross-encoder. | CI Integration suite. | ~$0.001 / <100ms per test. |
| **Level 3: Task & Semantic Correctness** | Goal completion, reasoning trajectory accuracy, tone/empathy compliance. | Calibrated LLM-as-a-Judge (e.g., GPT-4o / Claude 3.5 Sonnet with strict rubric). | Nightly / Pre-release PR gate. | ~$0.02 / 1-3s per test. |
| **Level 4: Adversarial & Safety** | Prompt injection resistance, PII leakage, jailbreak susceptibility, clinical boundary adherence. | Red-teaming fuzzers + Specialized Safety Classifiers (Llama-Guard). | Release candidate certification. | ~$0.05 / 2-5s per test. |

---

## Threat Model and Security Objectives

### 1. Benchmark Contamination and Overfitting

- **Threat:** Evaluation datasets are inadvertently included in training data, or developers tune prompts specifically to pass the 50 test cases, masking severe regressions on real-world edge cases.
- **Objective:** Private, rotating canary datasets.
  - Test suites maintain a separate, held-out evaluation set refreshed weekly from real sanitized production traces.
  - Hash comparisons and n-gram overlap checks ensure test questions do not appear in prompt exemplars or fine-tuning datasets.

### 2. LLM-as-a-Judge Exploitation & Position Bias

- **Threat:** An evaluation model preferentially awards higher scores to responses that are longer (verbosity bias), appear first in pairwise comparisons (position bias), or originate from its own model family (self-enhancement bias).
- **Objective:** Symmetrical evaluation and calibration.
  - In pairwise evaluation, swap the order of candidates: `Score(A, B)` and `Score(B, A)`. If the judge disagrees with itself, the comparison is discarded or flagged as uncertain.
  - Use absolute score rubrics with few-shot calibrated anchors rather than open-ended qualitative prompts.
  - Calculate Cohen’s Kappa ($\kappa$) against expert human labels; judges with $\kappa < 0.65$ are disqualified.

### 3. Telemetry PII/PHI Bleed

- **Threat:** OpenTelemetry GenAI traces send full user input prompts and LLM completions to third-party SaaS observability backends, violating HIPAA, GDPR, and enterprise confidentiality.
- **Objective:** Client-side scrubbing and token-level pseudonymization.
  - Telemetry exporters run high-speed regex and NER (Named Entity Recognition) masking filters (Presidio) to redact Social Security Numbers, emails, medical IDs, and names before emitting spans.
  - Raw prompts are hashed or stored in access-controlled internal cold storage; observability traces retain only spans, metadata, token counts, and sanitized execution graphs.

---

## Architecture: OpenTelemetry GenAI Tracing

```
Client Request
      │
      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Span: agent.task (Root)                                                     │
│ Attributes:                                                                 │
│ - gen_ai.agent.name: "CustomerTriageAgent"                                  │
│ - gen_ai.agent.version: "2.4.0@sha256:889f..."                             │
│ - tenant.id: "tenant-cardiology"                                            │
│                                                                             │
│   ├── Span: gen_ai.retrieval                                                │
│   │   Attributes: db.system: "qdrant", top_k: 5, recall_latency_ms: 42      │
│   │                                                                         │
│   ├── Span: gen_ai.client (Model Call 1 - Plan)                             │
│   │   Attributes:                                                           │
│   │   - gen_ai.system: "anthropic"                                          │
│   │   - gen_ai.request.model: "claude-3-5-sonnet"                           │
│   │   - gen_ai.usage.prompt_tokens: 1420                                    │
│   │   - gen_ai.usage.completion_tokens: 180                                 │
│   │   - gen_ai.response.finish_reasons: ["tool_use"]                        │
│   │                                                                         │
│   ├── Span: tool.execution (MCP Tool Call)                                  │
│   │   Attributes:                                                           │
│   │   - tool.name: "fetch_patient_history"                                  │
│   │   - tool.idempotency_key: "e3b0c44..."                                  │
│   │   - tool.duration_ms: 110                                               │
│   │                                                                         │
│   └── Span: gen_ai.client (Model Call 2 - Final Synthesis)                  │
│       Attributes:                                                           │
│       - gen_ai.usage.prompt_tokens: 2200                                    │
│       - gen_ai.usage.completion_tokens: 350                                 │
│       - gen_ai.response.finish_reasons: ["stop"]                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Guidance

Below is a complete, production-grade Python evaluation harness featuring deterministic schema assertions, an LLM-as-a-judge scorer with position bias mitigation, and release evidence generator.

### 1. Evaluation Contracts and Deterministic Assertions

```python
"""
evaluation/harness.py - Test case runner and deterministic assertions.
"""
from __future__ import annotations
import json
import jsonschema
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


@dataclass
class TestCase:
    case_id: str
    user_input: str
    expected_tool: Optional[str] = None
    expected_tool_schema: Optional[Dict[str, Any]] = None
    expected_facts: List[str] = field(default_factory=list)
    forbidden_terms: List[str] = field(default_factory=list)


@dataclass
class EvalResult:
    case_id: str
    passed: bool
    deterministic_checks_passed: bool
    judge_score: float  # 0.0 to 1.0
    failure_reasons: List[str] = field(default_factory=list)


class DeterministicEvaluator:
    @staticmethod
    def evaluate(test_case: TestCase, agent_output: Dict[str, Any]) -> Tuple[bool, List[str]]:
        failures = []

        # 1. Check Tool Selection
        if test_case.expected_tool:
            actual_tool = agent_output.get("tool_call", {}).get("name")
            if actual_tool != test_case.expected_tool:
                failures.append(f"Expected tool '{test_case.expected_tool}', got '{actual_tool}'")

        # 2. Check Tool Arguments Schema
        if test_case.expected_tool_schema and "tool_call" in agent_output:
            args = agent_output["tool_call"].get("arguments", {})
            try:
                jsonschema.validate(instance=args, schema=test_case.expected_tool_schema)
            except jsonschema.ValidationError as err:
                failures.append(f"Tool arguments schema violation: {err.message}")

        # 3. Check Forbidden Terms (Safety / Leakage)
        response_text = agent_output.get("text", "")
        for term in test_case.forbidden_terms:
            if term.lower() in response_text.lower():
                failures.append(f"Forbidden term detected in output: '{term}'")

        # 4. Check Required Factual Anchors
        for fact in test_case.expected_facts:
            if fact.lower() not in response_text.lower():
                failures.append(f"Missing required factual anchor: '{fact}'")

        return len(failures) == 0, failures
```

### 2. Calibrated LLM-as-a-Judge with Position Bias Elimination

```python
"""
evaluation/judge.py - Position-debiased LLM-as-a-judge scorer.
"""
from typing import Dict, Tuple


class CalibratedJudge:
    def __init__(self, judge_model_callable: Callable[[str], str]):
        self.judge_model_callable = judge_model_callable

    def evaluate_grounding(self, query: str, context: str, response: str) -> float:
        """Evaluates whether the response is strictly grounded in the context (0.0 to 1.0)."""
        rubric_prompt = f"""
You are an impartial, highly rigorous compliance auditor.
Evaluate whether the following AI Response is strictly grounded in the Provided Evidence.

[User Query]: {query}
[Provided Evidence]: {context}
[AI Response]: {response}

Score on a scale of 0 to 5 based strictly on this rubric:
5: Completely grounded. Every factual claim is directly supported by the evidence.
3: Partially grounded. General points supported, but includes minor unverified extrapolation.
0: Severe hallucination or contradicts the provided evidence.

Output ONLY a single integer score between 0 and 5.
"""
        raw_output = self.judge_model_callable(rubric_prompt).strip()
        try:
            score_int = int(raw_output)
            return max(0.0, min(1.0, score_int / 5.0))
        except ValueError:
            return 0.0

    def pairwise_compare_debiased(
        self, query: str, response_a: str, response_b: str
    ) -> str:
        """Compares two responses with order-swapping to eliminate position bias."""
        prompt_forward = f"Query: {query}\nResponse 1: {response_a}\nResponse 2: {response_b}\nWhich is better? Reply '1' or '2'."
        vote_1 = self.judge_model_callable(prompt_forward).strip()

        # Swap positions to check for position bias
        prompt_reverse = f"Query: {query}\nResponse 1: {response_b}\nResponse 2: {response_a}\nWhich is better? Reply '1' or '2'."
        vote_2 = self.judge_model_callable(prompt_reverse).strip()

        # Reconcile
        if vote_1 == "1" and vote_2 == "2":
            return "A"
        elif vote_1 == "2" and vote_2 == "1":
            return "B"
        else:
            return "TIE_OR_POSITION_BIASED"
```

### 3. Machine-Readable Release Evidence Bundle Generator

```python
"""
evaluation/release_evidence.py - Generates an immutable, signed release manifest.
"""
import hashlib
import json
import time
from typing import Any, Dict, List


def generate_release_evidence_bundle(
    agent_id: str,
    agent_version: str,
    commit_sha: str,
    eval_results: List[Dict[str, Any]],
    accuracy_threshold: float = 0.95,
) -> Dict[str, Any]:
    total_cases = len(eval_results)
    passed_cases = sum(1 for r in eval_results if r["passed"])
    pass_rate = passed_cases / max(1, total_cases)

    status = "APPROVED" if pass_rate >= accuracy_threshold else "REJECTED"

    bundle = {
        "manifest_version": "1.0.0",
        "timestamp": time.time(),
        "agent": {
            "agent_id": agent_id,
            "version": agent_version,
            "commit_sha": commit_sha,
        },
        "evaluation_summary": {
            "total_test_cases": total_cases,
            "passed_cases": passed_cases,
            "pass_rate": pass_rate,
            "required_threshold": accuracy_threshold,
            "status": status,
        },
        "results_breakdown": eval_results,
    }

    # Cryptographic integrity signature of the test evidence
    serialized = json.dumps(bundle, sort_keys=True).encode("utf-8")
    bundle["evidence_digest_sha256"] = hashlib.sha256(serialized).hexdigest()
    return bundle
```

---

## Production Failure Modes

### 1. Judge Hallucination / Self-Scoring Inflation
- **Scenario:** An engineering team uses `gpt-4o-mini` as an evaluation judge for an agent powered by `gpt-4o-mini`. The judge consistently assigns 5/5 stars to flawed, rambling answers.
- **Root Failure:** Using a weak model to evaluate an equivalent model, introducing severe self-enhancement bias.
- **Architectural Solution:** The Judge model must possess higher reasoning capacity than the agent model (e.g., use Claude 3.5 Sonnet or GPT-4o with high reasoning effort to evaluate smaller agent models). Judges must be calibrated on a baseline set of 100 human-labeled examples; if judge-human alignment drops below $\kappa = 0.70$, the judge is rejected.

### 2. The Statistical Fluke Promotion (The $N=10$ Trap)
- **Scenario:** A team runs a prompt eval on 10 examples. The new prompt achieves 10/10 (100%), whereas the old prompt scored 8/10 (80%). The team declares victory and deploys. In production, error rates surge by 15%.
- **Root Failure:** Insufficient sample size lacking statistical power. A difference of 2 successes out of 10 samples has a p-value $> 0.30$ (statistically indistinguishable from random noise).
- **Architectural Solution:** Mandatory statistical power sizing. Release evaluations require a minimum of 200–500 curated examples. Automated CI gates execute McNemar’s test for paired categorical outcomes; promotion requires $p < 0.05$.

### 3. PII Leakage Through Span Attributes
- **Scenario:** An engineer debugging an agent adds `span.set_attribute("gen_ai.prompt", user_input)`. A patient submits their medical history and credit card. The trace is exported to a cloud APM vendor, triggering a massive HIPAA and PCI-DSS breach notification.
- **Root Failure:** Unsanitized raw input logging in distributed traces.
- **Architectural Solution:** Strictly adhere to OpenTelemetry GenAI v1.28 opt-in privacy guidelines: prompt and completion payloads are disabled by default. If payload capture is enabled in lower environments, all strings pass through an inline Presidio scrubber that redacts PHI/PII prior to exporter dispatch.

---

## Design Review

```
[ ] Deterministic Prioritization: Does the test harness validate schema, tool calls, and constraints deterministically before invoking LLM judges?
[ ] Judge Calibration: Has the LLM-as-a-judge pipeline been measured against expert human labels (Cohen's Kappa >= 0.70)?
[ ] Position Bias Elimination: Does pairwise comparison invert candidate order (A vs B, then B vs A) to eliminate positional skew?
[ ] OpenTelemetry Compliance: Do agent spans follow standard semantic conventions (gen_ai.system, gen_ai.usage, gen_ai.agent.name)?
[ ] PII Scrubbing: Are prompt and completion bodies either redacted or masked by an inline privacy filter prior to trace emission?
[ ] Machine-Readable Release Bundle: Does CI emit an immutable, content-hashed evidence bundle certifying test pass rates before promotion?
```

---

## Practical Exercise

**Objective:** Write an automated test suite verifying:
1. Deterministic evaluation correctly rejecting invalid tool arguments and detecting forbidden terms.
2. Pairwise judge eliminating position bias.
3. Generating a signed release evidence bundle and verifying status rejection when accuracy falls below 95%.

```python
"""
tests/test_evaluation_harness.py - Test suite for agent evaluation and release evidence.
"""
from evaluation.harness import TestCase, DeterministicEvaluator
from evaluation.judge import CalibratedJudge
from evaluation.release_evidence import generate_release_evidence_bundle


def test_deterministic_evaluator():
    test_case = TestCase(
        case_id="tc_101",
        user_input="Schedule an appointment for patient 441",
        expected_tool="schedule_appointment",
        expected_tool_schema={
            "type": "object",
            "properties": {"patient_id": {"type": "integer"}},
            "required": ["patient_id"],
        },
        expected_facts=["appointment confirmed"],
        forbidden_terms=["password", "unauthorized"],
    )

    # Valid agent output
    valid_output = {
        "tool_call": {"name": "schedule_appointment", "arguments": {"patient_id": 441}},
        "text": "Your appointment confirmed for tomorrow.",
    }
    passed, failures = DeterministicEvaluator.evaluate(test_case, valid_output)
    assert passed is True
    assert len(failures) == 0

    # Invalid agent output (wrong tool, missing fact, forbidden term)
    invalid_output = {
        "tool_call": {"name": "cancel_appointment", "arguments": {}},
        "text": "Error: unauthorized access.",
    }
    passed, failures = DeterministicEvaluator.evaluate(test_case, invalid_output)
    assert passed is False
    assert len(failures) == 3


def test_release_evidence_bundle_generation():
    results = [
        {"case_id": "c1", "passed": True},
        {"case_id": "c2", "passed": True},
        {"case_id": "c3", "passed": False},  # 2/3 = 66.7%
    ]

    bundle = generate_release_evidence_bundle(
        agent_id="care-triage-agent",
        agent_version="1.2.0",
        commit_sha="a1b2c3d4",
        eval_results=results,
        accuracy_threshold=0.90,  # Requires 90%
    )

    assert bundle["evaluation_summary"]["status"] == "REJECTED"
    assert "evidence_digest_sha256" in bundle
    assert len(bundle["evidence_digest_sha256"]) == 64
```

---

## Interview Preparation

### Q1: How do you design an evaluation harness for an autonomous agent that takes multiple non-deterministic tool actions?
**Model Answer:** Evaluating an agent requires testing both the **trajectory** (how it reasoned and selected tools) and the **final outcome** (what it produced):
1. **Trajectory Evaluation:** We compare the agent's sequence of tool calls against an optimal execution graph. Did it call `search_database` before `send_email`? Were the parameters schema-valid? We measure Tool Selection Precision and Unnecessary Tool Overhead.
2. **Deterministic State Assertions:** Instead of judging text, we inspect the environmental state after the run: was the row actually inserted in the mock database? Did the file match the expected hash?
3. **Calibrated Semantic Evaluation:** For user-facing responses, we use a calibrated LLM judge measuring Faithfulness to retrieved context and Tone compliance, using strict rubrics and position-bias order swapping.

### Q2: What is "position bias" in LLM judges, and how do you eliminate it?
**Model Answer:** Position bias is the systematic tendency of language models in pairwise evaluations to favor whichever response is presented first (Response A), regardless of quality. In benchmarks, this bias can alter scores by 15% to 30%. We eliminate it through **symmetrical order inversion**:
- We query the judge on `(Response A, Response B)` and record the winner.
- We immediately query the judge on the reversed pair: `(Response B, Response A)`.
- If the judge selects the first option in both cases (Response A in call 1, Response B in call 2), the judge exhibits position bias, and the result is classified as an inconclusive tie. A candidate is only declared a winner if it wins under both permutations.

### Q3: How do you implement OpenTelemetry distributed tracing across an agentic system without leaking PII?
**Model Answer:** We adhere to the OpenTelemetry Generative AI Semantic Conventions (v1.28+). We structure the trace hierarchically: a root `agent.task` span containing child spans for `gen_ai.retrieval`, `gen_ai.client` (model inferences), and `tool.execution`. Crucially, we enforce strict data hygiene:
1. Spans record operational metadata: model name, provider, token counts (`prompt_tokens`, `completion_tokens`), latency, and error codes.
2. Prompt and completion text bodies are *omitted by default* in production.
3. If payload tracing is mandated for quality audits, all text passes through an inline sanitization processor running Presidio NER to redact names, phone numbers, and medical record numbers before exporting spans to Jaeger, Langfuse, or Arize.

---

## Chapter Summary

- **Evaluation Hierarchy:** Enforce deterministic schema and tool assertions first; reserve expensive LLM-as-a-judge pipelines for grounded semantic evaluation.
- **Judge Calibration:** Validate model judges against human gold standards ($\kappa \ge 0.70$) and eliminate position bias via symmetrical prompt inversion.
- **OpenTelemetry Standards:** Standardize tracing across agent steps, tool executions, and model calls using versioned GenAI semantic conventions.
- **Auditable Evidence:** Every production release must produce a cryptographically signed, machine-readable evidence bundle containing statistical pass rates and regression proofs.

---

## Further Study

- **OpenTelemetry Semantic Conventions for GenAI (v1.28+):** Distributed Tracing Specifications for Agents and LLMs.
- **Zheng et al. (UC Berkeley):** Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena.
- **NIST Special Publication 800-218:** Secure Software Development Framework (SSDF) — Attestation and Release Evidence.


---

## Technical Foundations and Clarifications

### Observation, evaluation and authorization are different jobs

A **trace** records what an application did. An **evaluation** compares an observed result with a declared criterion. A **release decision** weighs evaluation, operational evidence and risk under an authorized process. A log of a successful HTTP call is not proof of a correct answer, and a high evaluation score is not permission to deploy.

Begin with an equipment lookup assistant. A task case specifies caller scope, source revision, requested part, acceptable outputs and forbidden actions. After execution, inspect the actual retrieved record and returned value. The question “was the response JSON?” is different from “was its price correct?” and “was the caller allowed to read it?” Define these outcomes separately. A single score can conceal a serious authorization failure behind many correct low-risk answers.

A **dataset** is the collection of test cases and reviewed reference outcomes. The unit should match the claim: a user task, document, issue or workflow, not each nearly identical paraphrase treated as independent. Split development and held-out cases by source family or issue to avoid tuning on the same underlying information. Version inputs, labels, evaluator rubrics, model/prompt/tool/runtime bundles and environment fixtures. Record missing labels and inconclusive runs instead of removing them from the denominator.

### Deterministic assertions and semantic judgments

**Programmatic checks** compare observable structure or state: required fields, allowed tool identifiers, exact resource IDs, authorization outcomes, persisted mock changes and maximum cost. They are reproducible given fixed inputs, but can still encode the wrong requirement. A substring check for “appointment confirmed” can pass an incorrect negated statement. A forbidden-word check can flag an innocent quotation while missing an unsafe paraphrase.

An **LLM-as-a-judge** evaluates qualities such as groundedness or explanation clarity using a rubric. It is another model and can be influenced by candidate text. Provide bounded evidence, anchor examples and explicit abstention; isolate it from execution authority. Compare its labels with reviewed human labels on the target task. A larger model or different provider may help but does not guarantee reliable judgment. Some exact tasks need no model judge at all.

Order swapping checks consistency of pairwise preference: A must win whether placed first or second. Disagreement should remain an uncertainty result, with coverage reported. Removing every disagreement can inflate measured performance. This procedure mitigates one source of bias but does not eliminate shared factual mistakes, verbosity preference or rubric ambiguity. A consistent wrong judge is still wrong.

### Calculate agreement and uncertainty rather than asserting them

**Cohen's kappa** measures categorical agreement beyond chance implied by annotator marginals. Let observed agreement be `po` and expected agreement be `pe`; kappa is `(po-pe)/(1-pe)`. Suppose a human and judge each label fifty of one hundred cases positive, and agree on eighty. Then `pe=0.5`, `po=0.8`, and kappa is 0.6. The same raw agreement with different class balance can produce a different kappa. Inspect false-positive and false-negative rates, especially for rare harmful outcomes; no universal 0.70 cutoff certifies safety.

A **confidence interval** expresses sampling uncertainty under stated assumptions; it is not a model's self-reported confidence. Ten successes out of ten do not prove perfect future performance. For zero observed failures in `n` independent representative trials, the one-sided 95% binomial upper failure bound is `1 - 0.05^(1/n)`. With ten trials it is about 25.9%; with three hundred about 1%. Correlated cases or dataset mismatch weaken interpretation. Sample size must follow the tolerated error and effect size, not a blanket “500 cases” rule.

For **paired regressions**, run baseline and candidate on the same independent cases. Count baseline-success/candidate-failure cases `b` and baseline-failure/candidate-success cases `c`. McNemar's test conditions on discordant pairs, not simply the aggregate success counts. For `b=0,c=2`, the exact two-sided binomial p-value is 0.5. A p-value assesses compatibility with a null under its assumptions; it neither proves improvement nor measures the magnitude or business relevance of the change. Prespecify non-inferiority/safety constraints, correct repeated testing where appropriate, and retain effect sizes and uncertainty. Chapter 11 provides deeper statistical gate design.

### Traces connect task outcomes to exact versions

**OpenTelemetry (OTel)** is an observability framework. A **span** describes a bounded operation with timing, attributes, status and relationships. A **trace** connects spans belonging to a distributed activity; links can connect asynchronous or replayed work without pretending every event has one synchronous parent. Carry trace context through queues and tool adapters, while separately retaining durable task and operation IDs. Trace delivery can fail and sampling can omit spans; accounting and safety evidence should not depend solely on a sampled tracing stream.

Record request/response model identity, prompt/tool/agent bundle versions, source references, latency, token usage provenance and outcome/error categories. Do not invent hidden chain-of-thought or call a descriptive “reasoning trace” an exact view into model internals. Tool-call receipts and state transitions are observable. An arbitrary custom span name can be useful, but must not be presented as an official convention.

The inspected **semantic-conventions v1.37.0** GenAI client-span document is marked **Development**. It uses `gen_ai.operation.name`, `gen_ai.provider.name` and `gen_ai.request.model`, and specifies a migration opt-in for newer experimental conventions. This pinned revision is used to illustrate versioning; it is not claimed to be the latest installed instrumentation. The original `gen_ai.system` and prompt/completion token fields must be mapped according to the actual emitted convention version, not mixed silently with newer dashboards. [F35-1]

**Personally identifiable information (PII)** and **protected health information (PHI)** can appear in prompts, tool output, error text and metadata. Prefer a minimal operational attribute allowlist. Payload recording should require explicit policy, retention and access controls. Redaction with regular expressions or named-entity recognition reduces exposure but can miss indirect identifiers and contextual health facts. Pseudonymization is not automatically de-identification. Keep authorized quality-audit payloads in a separately governed store, and verify export behavior rather than relying on a library default.

### Release evidence is bound data, not a dashboard screenshot

An evidence bundle should identify the evaluated artifact, dataset/label revisions, evaluator versions, environment, individual outcomes, unresolved gaps and gate policy. A digest binds bytes only when the expected digest is trusted. A digital signature binds an accepted signing identity to those bytes; neither proves the assertions are meaningful. Promotion additionally requires current authority and the policy's required checks. An evaluation object named `APPROVED` can be a local recommendation, but cannot create deployment permission.

A gate should reject empty evidence, duplicate case IDs, missing required results and malformed outcomes. Keep separate critical-safety vetoes and quality thresholds. An overall 99% pass rate can still include the single harmful case that matters. Record confidence and coverage; don't silently convert evaluator transport failure to a genuine negative label. Online **shadow evaluation** observes a candidate without user-visible effects, so mock or suppress mutations. **A/B testing** assigns cohorts to real behavior and therefore needs an authorized, safe exposure policy. A canary's healthy HTTP status does not establish clinical validity or absence of rare harm.

### Offline Foundation Example

```python
# Standard-library, synthetic categorical outcomes; no model or deployment.
from math import comb, isclose

def exact_mcnemar(b, c):
    if any(type(x) is not int or x < 0 for x in (b, c)):
        raise ValueError("nonnegative pair counts required")
    n = b + c
    if not n:
        return 1.0
    return min(1.0, 2 * sum(comb(n, k) for k in range(min(b, c) + 1)) / 2**n)

def gate(results, minimum_quality=0.9):
    if not 0 <= minimum_quality <= 1:
        raise ValueError("invalid threshold")
    if not results:
        return "insufficient"
    ids = [r["case_id"] for r in results]
    if len(set(ids)) != len(ids):
        return "invalid"
    if any(type(r["quality"]) is not bool or type(r["safe"]) is not bool for r in results):
        return "invalid"
    if not all(r["safe"] for r in results):
        return "reject"
    return "candidate" if sum(r["quality"] for r in results) / len(results) >= minimum_quality else "reject"

assert exact_mcnemar(0, 2) == 0.5
assert exact_mcnemar(0, 0) == 1.0
assert isclose((0.8 - 0.5) / (1 - 0.5), 0.6)
assert gate([]) == "insufficient"
cases = [{"case_id": str(i), "quality": True, "safe": True} for i in range(100)]
assert gate(cases) == "candidate"
cases[-1]["safe"] = False
assert gate(cases) == "reject"
assert gate([cases[0], cases[0]]) == "invalid"
assert 1 - 0.05**(1/10) > 0.25
```

“Candidate” means this finite fixture satisfies its local gate, not that a release is authorized. The example validates arithmetic and failure handling, not judge calibration, trace delivery or a statistically powered product evaluation. In the original invalid-output fixture, wrong tool, missing required argument, forbidden term and missing expected phrase produce **four** reasons; the preserved assertion of three is a known inconsistency. The `Callable` judge import and some other file-level type imports must also be supplied if those snippets are extracted as modules.

### Local exercise and review progression

Run the offline block, restore the safety failure and observe the gate change. Add a duplicate case, an absent result and a simulated evaluator timeout, keeping each distinguishable from a failed task. Build a paired table with both improved and regressed cases rather than only totals. On paper, map one task to ingress, retrieval, model, tool and final-check spans and identify which fields could contain private data. Finally produce a small evidence manifest with explicit unrun online and clinical checks; do not replace those gaps with a claim of a signed or approved release.

### Foundation self-checks

**Q1: Does a high kappa prove a judge detects rare harm?** No. Kappa depends on marginals and summarizes agreement. Inspect class-specific error rates, representative rare cases and confidence bounds; use human/clinical review where the task requires it.

**Q2: Why separate trace ID from operation ID?** Traces may be sampled, regenerated or linked across retries. Durable operation identity controls effect deduplication and recovery; observability identity explains execution but cannot replace that contract.

**Q3: Can a 99% pass rate justify automatic promotion?** Not without defined case coverage, critical-safety rules, uncertainty, artifact binding and current release authority. A single critical failure can veto a high average, and missing tests remain missing.

### Foundation Key Takeaways

- Declare the task unit, independent labels, dataset splits and acceptance criteria before evaluation.
- Use deterministic state checks where possible and calibrated judges only for appropriate semantic questions.
- Report agreement, uncertainty, regressions and coverage, not only pass percentages.
- Pin tracing conventions and minimize sensitive payloads; traces are not financial or safety source-of-truth ledgers.
- Bind evidence to artifacts and retain a separate authorized release decision.

### Foundation Sources and Boundaries

- **F35-1:** OpenTelemetry, [GenAI client spans, semantic-conventions v1.37.0](https://github.com/open-telemetry/semantic-conventions/blob/v1.37.0/docs/gen-ai/gen-ai-spans.md), inspected October 16, 2026, Development status, inference attributes and migration warning. Fixed revision, not a claim of newest or installed conventions.
- **F35-2:** Zheng et al., [Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena](https://arxiv.org/abs/2306.05685), historical reference for judge limitations and bias; no new reproduction of its results is claimed.
- Chapter 11 owns statistical depth and Chapter 18 privacy-aware telemetry. The new exact arithmetic checks are local evidence only; prior claims of peer review, calibration and production-grade code were not substantiated by the earlier publication receipts.
