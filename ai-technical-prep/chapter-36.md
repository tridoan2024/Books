# Chapter 36: AI reliability engineering, capacity and FinOps

> **Part:** Part IX — Principal Engineering for Enterprise Agentic AI Platforms  
> **Market evidence:** Target-role review (Abbott Principal AI Platform Engineer `PL`, Principal AI/Agentic Engineer `AG`, and AI/ML Engineer `ML`, Oct 2026). Required and core duties: Service Level Objectives (SLOs), error budgets, streaming cancellation, backpressure, capacity planning, Kubernetes sizing, incident response runbooks, FinOps token accounting, and build-vs-buy vendor economics. Builds on Chapters 14, 15, 16, 18, 19, 20, and 27.  
> **Reader status:** Principal / Staff+ platform architects, SRE leads, and engineering directors accountable for the 99.9% uptime, scalability, and cloud economics of enterprise AI systems. Assumes Kubernetes, Terraform/IaC, and Site Reliability Engineering prerequisites.  
> **Why this chapter exists:** AI applications break traditional SRE playbooks. An agent service can return HTTP 200 OK while hallucinating nonsense, or stall on a 90-second streaming completion that blows past client timeouts. Furthermore, the financial model of GenAI is variable and unconstrained: an unchecked agent loop can burn $10,000 of GPU or cloud tokens in an hour. AI Reliability Engineering (AIRE) unites classical availability SLOs with token capacity planning and strict FinOps governance. This chapter teaches how to define AI-specific SLIs/SLOs, engineer backpressure and graceful degradation, size Kubernetes infrastructure, and operate an enterprise FinOps cost control system.  
> **Source review:** October 2026. SRE principles (Google SRE Book), FinOps Foundation Open Standards for AI, Kubernetes auto-scaling (KEDA, HPA), and GPU serving capacity metrics (KV-cache utilization, vLLM continuous batching) are integrated.  

---

## What You Must Be Able to Defend

In an enterprise SRE review or Principal interview, you must defend:
1. **AI-Specific Service Level Indicators (SLIs) and SLOs:** Why standard HTTP 200 availability is deceptive, and how to define composite SLIs measuring *Task Success Rate*, *Time-to-First-Token (TTFT)*, *Tokens-per-Second (TPS)*, and *Grounded Answer Ratio*.
2. **Streaming Resilience and Client Cancellation:** The mechanics of propagating client disconnects upstream to abort token generation at the provider, preventing phantom GPU spend and queue saturation.
3. **Capacity Modeling & Queue Backpressure:** How Little’s Law ($L = \lambda W$) applies to agent concurrency, and how to size worker pools and Redis/Kafka queue depths to avoid cascading memory exhaustion.
4. **Kubernetes Autoscaling for AI Workloads:** How to configure KEDA (Kubernetes Event-driven Autoscaling) using custom queue lag metrics and provider quota saturation rather than naive CPU/Memory thresholds.
5. **Unit Economics and FinOps Cost Attribution:** How to calculate the *Cost per Successful Business Outcome* rather than crude cost-per-million-tokens, and how to enforce hard spending limits and automated budget circuit breakers.
6. **On-Call Triage & Degradation Tiers:** The exact operational runbook and degradation cascades (Tier 1: full multi-agent reflection → Tier 2: fast single-shot model → Tier 3: deterministic cached fallback) during upstream cloud outages.

---

## Engineering Context

### 1. Why Traditional SRE Metrics Fail in Generative AI

Traditional web services measure availability as:
$$\text{Availability} = \frac{\text{Successful Requests (2xx)}}{\text{Total Requests}} \ge 99.9\%$$

In Generative AI, this metric hides critical operational failures:
- A model service returns HTTP 200 with an empty string or a polite refusal (*"I cannot help with that"*). Classical monitoring records this as 100% success; the user experiences 100% failure.
- A model takes 75 seconds to generate an answer. The HTTP connection succeeds, but the end-user abandoned the page at second 12.
- A provider rate limit (HTTP 429) was triggered because a batch job consumed all shared tokens. Is this an internal system defect, an upstream vendor outage, or an expected policy rejection?

AI Reliability Engineering (AIRE) establishes **Composite SLIs** that evaluate latency, correctness, and task completion simultaneously:

```
TRADITIONAL SRE:
[User Request] ───► [HTTP 200 OK] ───► Recorded as 100% Healthy (Even if output was garbage!)

AI RELIABILITY ENGINEERING (AIRE):
[User Request] 
      │
      ▼
[Composite Evaluation Gate]
  ├── Did HTTP status equal 200?
  ├── Did Time-to-First-Token arrive within <1,500ms?
  ├── Did Total Task Duration complete within <15,000ms?
  ├── Was output schema valid (JSON / Pydantic)?
  └── Was response grounded with zero unhandled tool errors?
      │
      └── ALL MUST PASS to count as a "Good Interaction" in the SLI.
```

### 2. Multi-Tier Graceful Degradation Matrix

When upstream providers (Azure OpenAI, AWS Bedrock) degrade or experience regional latency spikes, the system must not collapse. The platform must execute an automated degradation cascade:

| Operating Tier | Trigger Condition | System Behavior & Routing | User Impact / Trade-off |
|---|---|---|---|
| **Tier 0: Optimal (Green)** | p95 Latency $< 3s$, Error Rate $< 0.5\%$. | Full multi-agent deliberation, cross-encoder reranking, multi-candidate reflection, frontier models (Claude 3.5 Sonnet / GPT-4o). | Highest quality, full capabilities, standard token cost. |
| **Tier 1: Degraded (Yellow)** | p95 Latency $> 6s$ OR Provider 429 Rate $> 5\%$. | Disable multi-agent reflection loops; switch to single-turn planner; enable aggressive semantic response caching. | Slightly simplified answers, 50% token cost reduction, maintained interactivity. |
| **Tier 2: Constrained (Orange)** | Primary Provider Circuit Breaker OPEN. | Fallback to fast/compact models (GPT-4o-mini / Claude 3.5 Haiku) or secondary cloud provider (Azure $\to$ Bedrock). | Reduced reasoning depth for complex edge cases; latency maintained; zero outage. |
| **Tier 3: Emergency (Red)** | All Frontier Providers Down / Quotas Exhausted. | Route strictly to deterministic rule-based FAQ engines, cached responses, or safe human escalation queues. | Basic task fulfillment; complete preservation of corporate data integrity and safety. |

---

## Threat Model and Security Objectives

### 1. Denial of Wallet via Recursive Agent Loops

- **Threat:** An agent planner encounters an ambiguous error from a tool. It attempts to repair the error by invoking the tool again with a slightly different prompt. It enters an infinite loop, executing 5,000 reasoning steps overnight, consuming millions of tokens and thousands of dollars.
- **Objective:** Hard step limits, time budgets, and spending kill-switches.
  - Every agent execution task must carry a non-negotiable `max_steps` ceiling (e.g., maximum 10 tool iterations).
  - The runtime enforces an absolute wall-clock timeout (e.g., maximum 60 seconds).
  - The gateway enforces a financial budget ceiling: if an individual task exceeds $0.50 USD in cumulative token spend, the runner terminates the loop immediately and raises a `BudgetExceededException`.

### 2. Queue Starvation via Slow Streaming Sessions

- **Threat:** 200 users initiate long-running, 128k-token generation streams. Worker pods keep connections open for minutes. The ingress queue fills up, causing incoming short-latency queries (which could complete in 200ms) to time out in the queue.
- **Objective:** Separate thread pools and streaming backpressure.
  - Interactive streaming connections must not block worker threads handling short transactional queries.
  - Use asynchronous event-driven runtimes (asyncio / Go goroutines / Tokio) with strict per-tenant concurrency slots.

---

## Architecture: AI Capacity and FinOps Engine

```
                                  Client Request
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Ingress & Concurrency Gate (Envoy / K8s Ingress)                         │
│    - Global & Tenant Active Request Tracking                                │
│    - Priority Queue: Real-time Interactive (P0) vs. Batch Jobs (P1)         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. Dynamic Degradation Controller (Health & Latency Monitor)                 │
│    - Monitors p95 TTFT, Error Budgets, and Upstream Circuit Breakers        │
│    - Selects Operating Tier (Tier 0: Full -> Tier 2: Compact Fallback)      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. Streaming Engine with Cancellation Hooks                                 │
│    - Propagates client TCP abort to upstream model provider                 │
│    - Prevents orphan token generation                                       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. FinOps Accounting & Ledger Service                                       │
│    - Real-time token metering (Prompt, Completion, Cache Hits)              │
│    - Tenant Cost Allocation & Departmental Budget Enforcement               │
│    - Automated Kill-Switch when monthly burn exceeds threshold              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Guidance

Below is a complete, production-grade Python implementation of an AI SRE engine featuring Composite SLI monitoring, a client streaming cancellation hook, and a FinOps budget controller with automated kill-switches.

### 1. Composite SLI and Health Evaluator

```python
"""
reliability/sli.py - Composite Service Level Indicator monitoring.
"""
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class InteractionMetrics:
    http_status: int
    ttft_ms: float               # Time-to-First-Token
    total_duration_ms: float
    schema_valid: bool
    grounded: bool
    tokens_generated: int
    cost_usd: float


class CompositeSLITracker:
    """Tracks composite SLI success across strict availability and quality gates."""

    def __init__(
        self,
        target_ttft_ms: float = 2000.0,
        target_duration_ms: float = 20000.0,
    ):
        self.target_ttft_ms = target_ttft_ms
        self.target_duration_ms = target_duration_ms
        self.total_interactions = 0
        self.good_interactions = 0

    def evaluate(self, metrics: InteractionMetrics) -> bool:
        self.total_interactions += 1

        # Strict multi-factor SLI check
        is_good = (
            metrics.http_status == 200
            and metrics.ttft_ms <= self.target_ttft_ms
            and metrics.total_duration_ms <= self.target_duration_ms
            and metrics.schema_valid is True
            and metrics.grounded is True
        )

        if is_good:
            self.good_interactions += 1
        return is_good

    def current_sli(self) -> float:
        if self.total_interactions == 0:
            return 1.0
        return self.good_interactions / self.total_interactions
```

### 2. Streaming Cancellation and Orphan Prevention

```python
"""
reliability/streaming.py - Client disconnect propagation to upstream model provider.
"""
import asyncio
import logging
from typing import AsyncIterator

logger = logging.getLogger("StreamingEngine")


class StreamAbortedException(Exception):
    pass


async def resilient_stream_generator(
    client_connected_check: callable,
    upstream_provider_stream: AsyncIterator[str],
) -> AsyncIterator[str]:
    """
    Streams tokens to client while continuously monitoring client socket connectivity.
    Aborts upstream token generation instantly if client disconnects.
    """
    try:
        async for chunk in upstream_provider_stream:
            # 1. Check if client has dropped connection
            if not client_connected_check():
                logger.warning("Client disconnected! Aborting upstream model stream to prevent waste.")
                raise StreamAbortedException("Client socket closed.")

            # 2. Yield token chunk to client
            yield chunk

    except asyncio.CancelledError:
        logger.warning("Task cancelled by caller. Halting provider stream.")
        raise
```

### 3. FinOps Budget Controller and Hard Kill-Switch

```python
"""
reliability/finops.py - Real-time token budget tracker and automated kill-switch.
"""
import time
from dataclasses import dataclass
from typing import Dict


class BudgetLimitExceeded(Exception):
    pass


@dataclass
class TenantBudget:
    tenant_id: str
    monthly_budget_usd: float
    current_spend_usd: float = 0.0
    task_spend_limit_usd: float = 1.00  # Max per single task execution


class FinOpsBudgetController:
    def __init__(self):
        self._tenants: Dict[str, TenantBudget] = {}

    def register_tenant(self, tenant: TenantBudget):
        self._tenants[tenant.tenant_id] = tenant

    def check_task_admission(self, tenant_id: str) -> None:
        tenant = self._tenants.get(tenant_id)
        if not tenant:
            raise ValueError(f"Unknown tenant: {tenant_id}")

        if tenant.current_spend_usd >= tenant.monthly_budget_usd:
            raise BudgetLimitExceeded(
                f"Tenant {tenant_id} has exhausted monthly budget (${tenant.monthly_budget_usd:.2f})!"
            )

    def record_consumption(self, tenant_id: str, cost_usd: float) -> None:
        tenant = self._tenants.get(tenant_id)
        if tenant:
            tenant.current_spend_usd += cost_usd
            if tenant.current_spend_usd > tenant.monthly_budget_usd:
                # Trigger alerting / circuit breaker
                pass
```

---

## Production Failure Modes

### 1. The Phantom Token Bleed (Orphan Streaming)
- **Scenario:** A user queries a chatbot for a complete code refactor. The model begins generating 4,000 tokens. After 2 seconds, the user closes the browser tab. The backend server does not listen for the socket close event; it continues consuming upstream tokens for another 35 seconds, paying the provider for all 4,000 tokens.
- **Root Failure:** Lack of bidirectional cancellation propagation.
- **Architectural Solution:** The gateway must monitor the HTTP/2 transport connection. When the client resets the stream (`RST_STREAM`), the gateway immediately cancels the Python async task, which in turn drops the connection to Azure/Bedrock, halting token generation and billing.

### 2. Cascading Worker Exhaustion via Little's Law
- **Scenario:** Upstream model latency doubles from 2.0s to 4.0s during an OpenAI outage. Inflow rate remains constant at 100 requests/sec. According to Little’s Law ($L = \lambda W$), the number of concurrent in-flight requests doubles from 200 to 400. The worker pod thread pool (sized for 250 concurrent requests) saturates completely. Subsequent requests queue up and time out, causing 100% service failure.
- **Root Failure:** Inadequate concurrency sizing and missing admission backpressure.
- **Architectural Solution:** Enforce active request limits per worker. When in-flight requests reach 80% of capacity, the gateway activates backpressure, immediately shedding non-interactive batch workloads and returning HTTP 429 to lower-priority tenants.

### 3. The Unbudgeted Agent Runaway Spike
- **Scenario:** A developer deploys an agent with an unhandled exception in its error reflection loop. The agent retries 200 times per minute. By morning, the single testing agent has consumed $18,000 in GPT-4o tokens.
- **Root Failure:** Lack of per-task token and spending ceilings.
- **Architectural Solution:** Enforce non-negotiable budget bounds inside the execution runtime:
  - Max loop iterations = 10.
  - Max task token spend = 50,000 tokens ($0.50 USD).
  - Any task breaching this limit is halted with an unrecoverable `TaskBudgetExceeded` error.

---

## Design Review

```
[ ] Composite SLI: Does service health tracking require both technical success (200 OK, latency) and cognitive success (schema, grounding)?
[ ] Client Disconnect Propagation: Does the streaming layer immediately abort upstream provider generation upon client disconnect?
[ ] Hard Task Ceilings: Does every agent workflow enforce hard limits on iterations (<=10) and wall-clock duration (<=60s)?
[ ] FinOps Enforcement: Are costs tracked in real-time with automated kill-switches when tenant monthly budgets are breached?
[ ] Autoscaling by Queue Lag: Is Kubernetes autoscaling (KEDA) driven by queue lag and in-flight tokens rather than raw pod CPU?
[ ] Degradation Cascade: Does the system feature documented, automated fallback tiers (full reasoning -> compact model -> cached rules)?
```

---

## Practical Exercise

**Objective:** Write an automated test suite verifying:
1. Composite SLI calculation accurately flagging slow or ungrounded responses as failed interactions despite HTTP 200 status.
2. Streaming generator aborting upstream token generation when client disconnect is detected.
3. FinOps budget controller blocking task admission when monthly spending limits are reached.

```python
"""
tests/test_reliability_and_finops.py - Test suite for AIRE and FinOps controls.
"""
import pytest
from reliability.sli import CompositeSLITracker, InteractionMetrics
from reliability.streaming import resilient_stream_generator, StreamAbortedException
from reliability.finops import FinOpsBudgetController, TenantBudget, BudgetLimitExceeded


def test_composite_sli_evaluation():
    tracker = CompositeSLITracker(target_ttft_ms=1500.0, target_duration_ms=10000.0)

    # 1. Perfect interaction
    good = InteractionMetrics(
        http_status=200,
        ttft_ms=800.0,
        total_duration_ms=4500.0,
        schema_valid=True,
        grounded=True,
        tokens_generated=350,
        cost_usd=0.005,
    )
    assert tracker.evaluate(good) is True

    # 2. HTTP 200 OK, but ungrounded (hallucination) -> MUST FAIL SLI
    hallucinated = InteractionMetrics(
        http_status=200,
        ttft_ms=700.0,
        total_duration_ms=3000.0,
        schema_valid=True,
        grounded=False,  # Failed grounding!
        tokens_generated=200,
        cost_usd=0.003,
    )
    assert tracker.evaluate(hallucinated) is False

    # 3. HTTP 200 OK, but excessive latency -> MUST FAIL SLI
    slow = InteractionMetrics(
        http_status=200,
        ttft_ms=2500.0,  # Exceeds 1500ms target
        total_duration_ms=12000.0,
        schema_valid=True,
        grounded=True,
        tokens_generated=500,
        cost_usd=0.008,
    )
    assert tracker.evaluate(slow) is False

    assert tracker.current_sli() == 1.0 / 3.0


@pytest.mark.asyncio
async def test_streaming_disconnect_abortion():
    # Simulate client connection dropping after 2 chunks
    connected = True
    chunks_yielded = []

    async def mock_provider():
        for i in range(10):
            yield f"token_{i} "

    def check_connection():
        return connected

    stream = resilient_stream_generator(check_connection, mock_provider())

    with pytest.raises(StreamAbortedException):
        async for chunk in stream:
            chunks_yielded.append(chunk)
            if len(chunks_yielded) == 2:
                connected = False  # Client disconnects!

    assert len(chunks_yielded) == 2


def test_finops_budget_controller():
    controller = FinOpsBudgetController()
    tenant = TenantBudget(
        tenant_id="dept_sales",
        monthly_budget_usd=100.0,
        current_spend_usd=99.50,
    )
    controller.register_tenant(tenant)

    # Allowed initially
    controller.check_task_admission("dept_sales")

    # Record consumption that pushes over $100
    controller.record_consumption("dept_sales", 1.00)

    # Subsequent admission must be blocked!
    with pytest.raises(BudgetLimitExceeded):
        controller.check_task_admission("dept_sales")
```

---

## Interview Preparation

### Q1: How does Site Reliability Engineering for Generative AI differ from traditional web service SRE?
**Model Answer:** Classical SRE focuses on the golden signals: latency, traffic, errors, and saturation, typically measured via HTTP status codes and endpoint response times. In Generative AI:
1. **Errors are Semantic:** A model service can return HTTP 200 OK while hallucinating, emitting toxic content, or generating empty strings.
2. **Latencies are Asymmetric:** Time-to-First-Token (TTFT) governs perceived responsiveness, while Tokens-per-Second (TPS) governs overall streaming throughput.
3. **Economics are Variable:** A single user query can trigger a 10-step agent loop consuming $2.00 of cloud tokens.
Therefore, AI SRE establishes **Composite SLIs** that combine HTTP status, TTFT, structural schema validity, and verified factual grounding into a single binary pass/fail criterion, coupled with real-time FinOps budget controls.

### Q2: What is your operational runbook when an upstream LLM provider experiences severe latency degradation?
**Model Answer:** We implement an automated, 4-tier degradation cascade:
1. **Tier 0 (Normal):** Full multi-agent reflection and large frontier models.
2. **Tier 1 (Latency Spike):** The gateway detects p95 latency $> 5s$. It dynamically strips complex multi-step reflection loops, switches to single-turn execution, and forces higher semantic cache utilization.
3. **Tier 2 (Circuit Breaker Tripped):** The gateway opens the circuit for the primary provider and fails over to our secondary cloud provider (e.g., Azure OpenAI $\to$ AWS Bedrock) or smaller compact models (GPT-4o-mini).
4. **Tier 3 (Catastrophic Outage):** If all cloud providers are unreachable, the system fails gracefully to rule-based fallback responses, deterministic FAQ retrieval, and automated customer escalation tickets, ensuring users receive structured notices rather than hanging connections.

### Q3: How do you size Kubernetes worker pools for agentic AI workloads?
**Model Answer:** We size pools using Little’s Law ($L = \lambda W$) based on concurrency rather than CPU utilization. Because agent workers are heavily I/O-bound (waiting on model streaming and external tool APIs), sizing by CPU causes massive under-utilization.
1. We calculate required concurrency: if peak arrival rate $\lambda = 50\text{ req/sec}$ and average agent task duration $W = 6\text{ sec}$, average in-flight concurrency is $L = 300$.
2. We size pods based on memory required to maintain 30 concurrent asynchronous streaming connections per pod with headroom, yielding a cluster of 15 pods.
3. We configure KEDA (Kubernetes Event-driven Autoscaling) to scale pod counts based on **queue lag** and **in-flight active connections**, rather than pod CPU percentages.

---

## Chapter Summary

- **Composite SLIs:** Evaluate HTTP availability, Time-to-First-Token, schema adherence, and factual grounding together.
- **Client Disconnect Hooks:** Always cancel upstream provider generation when clients disconnect to prevent orphan token billing and queue saturation.
- **FinOps Hard Bounds:** Enforce strict ceilings on task steps, runtime duration, and token spending to prevent runaway financial burn.
- **Automated Degradation:** Design multi-tier fallback matrices (frontier model $\to$ compact model $\to$ cached deterministic rules) to maintain service during major cloud provider outages.

---

## Further Study

- **Google SRE Book (Beyer et al.):** Service Level Objectives, Error Budgets, and Managing Critical State.
- **FinOps Foundation:** FinOps Open Cost Management Standards for Generative AI.
- **KEDA Documentation:** Kubernetes Event-driven Autoscaling via Custom Telemetry and Queue Lag.
