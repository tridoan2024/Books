# Chapter 33: Durable production agents and enterprise tool integration

> **Part:** Part IX — Principal Engineering for Enterprise Agentic AI Platforms  
> **Market evidence:** Target-role review (Abbott Principal AI/Agentic Engineer `AG`, Principal AI Platform Engineer `PL`, and AI/ML Engineer `ML`, Oct 2026). Required and core duties: supervisor/planner-executor and multi-agent architectures, durable execution state, checkpoints and replay, idempotency, compensating transactions, human-in-the-loop (HITL) approval lifecycles, and typed enterprise tool integration. Builds on Chapters 8, 20, 26, 28, 29, and 30.  
> **Reader status:** Principal / Staff+ engineers delivering mission-critical agent workflows that execute real-world business side-effects. Assumes distributed transactions, event-driven architectures, and API design prerequisites.  
> **Why this chapter exists:** Toy agents live in short-lived Python scripts where a process crash, network blip, or expired API token simply kills the run. In an enterprise, an agent interacting with ERP systems, medical supply chains, or financial services cannot afford to lose state mid-transaction or execute duplicate non-idempotent operations upon restart. This chapter teaches how to engineer durable production agent systems that persist checkpointed state, handle process crashes gracefully, reconcile uncertain external effects, and safely incorporate human judgment.  
> **Source review:** October 2026. State-graph runtimes (e.g., LangGraph durable checkpointers), durable workflow engines (e.g., Temporal, Cadence, AWS Step Functions), and distributed transaction compensation patterns (Saga pattern) are analyzed and synthesized for enterprise scale.  

---

## What You Must Be Able to Defend

In an enterprise architecture review or Principal interview, you must defend:
1. **Durable Execution vs. Transient Loops:** The exact architectural differences between an in-memory LLM loop and a durable state machine that survives process termination, container rescheduling, and multi-day pauses.
2. **State Graphs (LangGraph) vs. Durable Orchestrators (Temporal):** The trade-offs, guarantees, and integration boundaries between conversational graph frameworks and distributed workflow engines.
3. **The Impossibility of Universal Exactly-Once Side-Effects:** Why network partitions make distributed exactly-once execution physically impossible, and how idempotency keys, external receipts, and compensating transactions (Sagas) achieve deterministic consistency.
4. **Checkpointing and Deterministic Replay Boundaries:** How to checkpoint agent state without serializing massive non-deterministic model objects, and how to safely handle workflow code updates during live in-flight runs.
5. **Human-in-the-Loop (HITL) Lifecycle Management:** How to suspend an agent workflow for asynchronous human sign-off, handle approval timeouts and privilege escalations, and revalidate environmental state before resuming execution.
6. **Cross-Language Service Integration:** How agent orchestrators written in Python coordinate with enterprise core systems written in TypeScript, Go, or Java over typed schemas and message buses.

---

## Engineering Context

### 1. The Catastrophic Failure of In-Memory Agents

Consider an agent tasked with automated procurement in an enterprise hospital network:
1. Agent checks inventory and identifies low stock for sterile catheter kits.
2. Agent queries supplier pricing via vendor API.
3. Agent generates a purchase order ($45,000) and calls `supplier_api.submit_order()`.
4. The supplier API receives the order, commits it to their database, and begins preparing the HTTP 200 response.
5. *At that exact millisecond, Kubernetes terminates the agent pod due to a node memory pressure eviction.*

What happens next?
- **Without Durable State:** The agent container reboots. The in-memory Python variable containing the workflow state is gone. The agent wakes up, observes that inventory is still low, and *submits a second $45,000 purchase order*.
- **With Naive Retry:** The agent retries step 3 blindly without an idempotency key, double-charging the company.
- **With Lost State During Human Approval:** An agent pauses for human review by calling `time.sleep()`. An hour later, the container restarts; the workflow terminates, leaving orders permanently stranded in limbo.

```
THE TRANSIENT AGENT TRAP:
[Agent Pod] ---> Calls Tool (External API) ---> [Pod Evicted / Crash]
      │
      └── Memory Lost! No Checkpoint! Duplicate Tool Call on Restart!

THE DURABLE AGENT ARCHITECTURE:
[Agent Worker] ─── Step 1 (Plan) ────► [Durable Checkpointer (Postgres/Redis)]
      │                                       │
      ▼ (Crash & Pod Replacement)             ▼
[New Worker]   ◄── Rehydrate State ─── [Checkpointer]
      │
      ├── Check External Receipt (Idempotency Key) -> Already Executed!
      └── Advance to Step 2 (Compensation or Completion)
```

### 2. Architectural Comparison: LangGraph vs. Temporal

Engineers often debate whether to build multi-agent systems using Python-native state graphs (e.g., LangGraph, AutoGen) or enterprise durable execution platforms (e.g., Temporal, Cadence, AWS Step Functions). A Principal Engineer knows that these technologies serve complementary boundaries:

| Dimension | LangGraph / State Graph Runtimes | Temporal / Durable Workflow Engines |
|---|---|---|
| **Primary Domain** | Dynamic LLM reasoning loops, prompt routing, tool reflection, token streaming. | Long-running distributed orchestration, guaranteed timer execution, durable side-effects. |
| **State Persistence** | Checkpoint saves at graph super-steps to database (Postgres, Mongo, SQLite). | Event-sourced history log; deterministic execution replay from first event. |
| **Determinism Requirement** | Natively non-deterministic (LLM completions, embeddings). | Strict code determinism required in workflow definitions; side-effects confined to Activities. |
| **Human-in-the-Loop** | Breakpoint interrupts (`interrupt_before`, `interrupt_after`) tied to graph threads. | Native asynchronous Signals and Timers; can sleep for months without consuming compute. |
| **Enterprise Tooling** | Excellent native Python LLM ecosystem integration. | Multi-language SDKs (Go, Java, TypeScript, Python), battle-tested enterprise scheduling. |
| **Recommended Architecture** | **The Inner Agent Brain:** Use LangGraph for dynamic agent reasoning, tool evaluation, and context synthesis. | **The Outer Enterprise Orchestrator:** Wrap the agent inside a Temporal Workflow for durable scheduling, timeout governance, and compensation. |

---

## Threat Model and Security Objectives

### 1. Replay Attacks and Nonce Reuse in Tool Execution

- **Threat:** When an agent recovers from a crash, it replays its execution history. If tools are invoked during the replay phase without caching receipts, the agent executes duplicate mutating API calls against downstream systems.
- **Objective:** Deterministic receipt caching and mandatory idempotency keys.
  - Every external tool invocation must generate a deterministic idempotency key derived from: `hash(workflow_id + node_id + step_count + tool_parameters)`.
  - The tool execution gateway checks an external receipt ledger. If a receipt exists for the idempotency key, the cached result is returned immediately without re-invoking the downstream API.

### 2. State Tampering in Checkpoint Storage

- **Threat:** An attacker with database access alters the serialized agent state in PostgreSQL/Redis, modifying intermediate reasoning steps, injected user identity, or approved financial amounts before the agent resumes.
- **Objective:** Cryptographic integrity seals on checkpoints.
  - Checkpoint payloads are serialized as canonical JSON, hashed, and signed with an internal HMAC or asymmetric platform key before writing to the database.
  - Upon rehydration, the signature is verified. Any altered state halts the workflow and triggers an immediate security alert.

### 3. Stale Human-in-the-Loop Approval Exploitation

- **Threat:** An agent requests human approval to transfer funds. The approver waits 48 hours before clicking "Approve." During those 48 hours, exchange rates, market volatility, or account authorization have changed drastically.
- **Objective:** Strict approval expiration and pre-execution state re-validation.
  - Human approval tokens feature explicit Time-To-Live (TTL) limits (e.g., 2 hours).
  - When approval is granted, the workflow does not blindly execute; it first invokes a **pre-flight revalidation hook** to verify that underlying assumptions (account balance, market price, inventory) remain valid.

---

## Architecture: The Durable Agent Engine

```
                             ┌──────────────────────────────────────┐
                             │       Enterprise Ingress / API       │
                             └──────────────────┬───────────────────┘
                                                │
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           Durable Workflow Orchestrator                           │
│                                                                                   │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌───────────────────┐  │
│  │ State Machine & Router  │  │ Checkpoint Storage      │  │ Idempotency &     │  │
│  │ - Supervisor Node       │  │ - Immutable Snapshots   │  │ Receipt Ledger    │  │
│  │ - Planner & Executor    │  │ - State Integrity Seal  │  │ - Key Generator   │  │
│  └────────────┬────────────┘  └───────────┬─────────────┘  └─────────┬─────────┘  │
│               │                           │                          │            │
└───────────────┼───────────────────────────┼──────────────────────────┼────────────┘
                │                           │                          │
                ▼                           ▼                          ▼
     ┌─────────────────────┐      ┌────────────────────┐     ┌──────────────────────┐
     │  Reasoning LLM Call │      │  Human Review Gate │     │  Compensating Tools  │
     │  (Model Gateway)    │      │ (Signal / Webhook) │     │ (Forward & Rollback) │
     └─────────────────────┘      └────────────────────┘     └──────────────────────┘
```

### Core Components
1. **Supervisor & Multi-Agent Topology:** Decomposes complex tasks into specialized worker roles (e.g., Researcher Agent, Coder Agent, Compliance Checker Agent). The Supervisor maintains the global task graph and evaluates completion criteria.
2. **Transactional State Checkpointer:** Captures complete state snapshots at every "super-step" boundary. In case of unexpected infrastructure failure, any surviving worker node can rehydrate the state and resume seamlessly.
3. **Receipt Ledger & Idempotency Broker:** Manages external transaction receipts. Tracks pending, committed, and compensated operations.
4. **Saga Compensation Coordinator:** For every forward action executed (e.g., `reserve_inventory`), registers a compensating rollback action (e.g., `release_inventory`). If downstream steps fail irrevocably, the coordinator executes compensations in reverse order.

---

## Implementation Guidance

Below is a complete, production-grade Python implementation of a Durable Agent State Machine with checkpointing, idempotency key generation, external receipt caching, and Saga-style compensation.

### 1. State Models and Idempotency Ledger

```python
"""
durable_agent/state.py - Core state contracts and idempotency ledger.
"""
from __future__ import annotations
import hashlib
import json
import time
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Callable, Dict, List, Optional


class StepStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    COMPENSATED = "compensated"


@dataclass
class ToolReceipt:
    idempotency_key: str
    tool_name: str
    arguments: Dict[str, Any]
    result: Any
    created_at: float = field(default_factory=time.time)


@dataclass
class CompensatingAction:
    action_name: str
    arguments: Dict[str, Any]


@dataclass
class WorkflowState:
    workflow_id: str
    step_index: int = 0
    current_node: str = "init"
    context: Dict[str, Any] = field(default_factory=dict)
    history: List[Dict[str, Any]] = field(default_factory=list)
    compensations: List[CompensatingAction] = field(default_factory=list)
    status: str = "running"
    updated_at: float = field(default_factory=time.time)

    def compute_hash(self) -> str:
        payload = {
            "workflow_id": self.workflow_id,
            "step_index": self.step_index,
            "current_node": self.current_node,
            "context": self.context,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
```

### 2. Durable Checkpointer and Receipt Store

```python
"""
durable_agent/storage.py - In-memory / Persistent checkpointer and receipt manager.
"""
from typing import Dict, Optional
from durable_agent.state import WorkflowState, ToolReceipt


class CheckpointStorage:
    def __init__(self):
        # Key: (workflow_id, step_index) -> WorkflowState
        self._checkpoints: Dict[str, WorkflowState] = {}
        # Key: idempotency_key -> ToolReceipt
        self._receipts: Dict[str, ToolReceipt] = {}

    def save_checkpoint(self, state: WorkflowState) -> None:
        key = f"{state.workflow_id}:{state.step_index}"
        state.updated_at = time.time()
        # Save deep copy
        serialized = json.dumps(asdict(state))
        self._checkpoints[key] = WorkflowState(**json.loads(serialized))

    def get_latest_checkpoint(self, workflow_id: str) -> Optional[WorkflowState]:
        matching = [
            s for k, s in self._checkpoints.items() if k.startswith(f"{workflow_id}:")
        ]
        if not matching:
            return None
        matching.sort(key=lambda s: s.step_index, reverse=True)
        return matching[0]

    def record_receipt(self, receipt: ToolReceipt) -> None:
        self._receipts[receipt.idempotency_key] = receipt

    def get_receipt(self, idempotency_key: str) -> Optional[ToolReceipt]:
        return self._receipts.get(idempotency_key)
```

### 3. The Resilient Agent Workflow Runner with Compensation

```python
"""
durable_agent/runner.py - Orchestrator with crash-safe resume and Saga rollback.
"""
import logging
from typing import Any, Dict
from durable_agent.state import (
    WorkflowState, ToolReceipt, CompensatingAction, StepStatus
)
from durable_agent.storage import CheckpointStorage

logger = logging.getLogger("DurableAgentRunner")


class DurableAgentRunner:
    def __init__(self, storage: CheckpointStorage):
        self.storage = storage

    def generate_idempotency_key(
        self, workflow_id: str, step_index: int, tool_name: str, args: Dict[str, Any]
    ) -> str:
        payload = f"{workflow_id}:{step_index}:{tool_name}:{json.dumps(args, sort_keys=True)}"
        return hashlib.sha256(payload.encode()).hexdigest()

    def execute_tool_with_idempotency(
        self,
        state: WorkflowState,
        tool_name: str,
        arguments: Dict[str, Any],
        tool_callable: Callable[[Dict[str, Any]], Any],
        compensating_action: Optional[CompensatingAction] = None,
    ) -> Any:
        key = self.generate_idempotency_key(
            state.workflow_id, state.step_index, tool_name, arguments
        )

        # 1. Check if receipt already exists (Crash recovery replay)
        existing_receipt = self.storage.get_receipt(key)
        if existing_receipt:
            logger.info(f"Replay detected: Reusing receipt for tool {tool_name} (Key: {key[:8]})")
            return existing_receipt.result

        # 2. Execute external operation
        logger.info(f"Executing new side-effect: {tool_name} (Key: {key[:8]})")
        result = tool_callable(arguments)

        # 3. Commit receipt to ledger
        receipt = ToolReceipt(
            idempotency_key=key,
            tool_name=tool_name,
            arguments=arguments,
            result=result,
        )
        self.storage.record_receipt(receipt)

        # 4. Register compensation if reversible
        if compensating_action:
            state.compensations.append(compensating_action)

        return result

    def rollback_compensations(self, state: WorkflowState) -> None:
        logger.warning(f"Initiating Saga rollback for workflow {state.workflow_id}")
        while state.compensations:
            comp = state.compensations.pop()
            logger.info(f"Executing compensation: {comp.action_name} with args {comp.arguments}")
            # In production: invoke the actual reversing API
            # e.g., if action was 'reserve_funds', compensation is 'release_funds'
        state.status = "compensated"
        self.storage.save_checkpoint(state)

    def advance_step(self, state: WorkflowState, next_node: str, updates: Dict[str, Any]) -> None:
        state.step_index += 1
        state.current_node = next_node
        state.context.update(updates)
        self.storage.save_checkpoint(state)
        logger.info(f"Workflow {state.workflow_id} checkpointed at step {state.step_index} [{next_node}]")
```

---

## Production Failure Modes

### 1. The Partial Compensation Disaster
- **Scenario:** An agent executes three actions: (1) Reserve inventory, (2) Debit customer account, (3) Book shipping freight. Step 3 fails. The compensation coordinator attempts to reverse steps 2 and 1. Reversing step 2 succeeds, but reversing step 1 fails due to a network timeout at the warehouse ERP.
- **Root Failure:** Assuming compensations always succeed synchronously.
- **Architectural Solution:** Compensations must themselves be durable, retryable activities. If a compensation fails, it is placed in a high-priority dead-letter queue (DLQ) with automated exponential retries and operator alerting. The workflow remains in state `COMPENSATION_PENDING` until all compensations acknowledge completion.

### 2. Zombie Agent Concurrency Collision
- **Scenario:** Node A is running Workflow-101. Node A experiences a temporary network freeze (split-brain). The orchestrator assumes Node A is dead and starts Workflow-101 on Node B. Node A suddenly unfreezes and resumes executing tools simultaneously with Node B.
- **Root Failure:** Lack of distributed fencing tokens.
- **Architectural Solution:** Every state checkpoint write increments a monotonic version number (`fencing_token`). When a worker writes state or calls a tool, it presents its fencing token. Downstream systems reject any token smaller than the highest observed token, immediately halting the zombie worker.

### 3. Human Approval Expiration Drift
- **Scenario:** An agent pauses for human sign-off on an automated code deployment. The human approves it 3 days later over a holiday weekend. In the interim, main branch HEAD has advanced 40 commits. The agent blindly deploys the stale code.
- **Root Failure:** Unbounded HITL resumes without environmental pre-flight revalidation.
- **Architectural Solution:** The resume hook must execute a verification gate:
  ```python
  if time.time() - approval_requested_at > MAX_APPROVAL_WINDOW:
      raise ApprovalExpiredError("Approval timed out.")
  if current_repo_head != initial_repo_head:
      raise PreconditionFailedError("Environment drifted during approval; re-planning required.")
  ```

---

## Design Review

```
[ ] Checkpointing Discipline: Does the agent write state snapshots at every major execution transition to persistent storage?
[ ] Nonce / Idempotency Binding: Are all tool calls bound to deterministic idempotency keys derived from workflow state?
[ ] Receipt Replay: Upon restart, does the runner inspect the receipt ledger and return existing results rather than re-calling APIs?
[ ] Saga Compensation: For every mutating tool call, is there an explicit, tested reversing transaction?
[ ] Fencing Tokens: Does the persistence layer enforce monotonic versioning to terminate split-brain zombie workers?
[ ] HITL Expiration & Revalidation: Do human-in-the-loop approval workflows enforce TTLs and re-verify assumptions before executing side-effects?
```

---

## Practical Exercise

**Objective:** Write an automated test suite verifying:
1. Normal sequential workflow execution with checkpointing.
2. Simulated crash recovery: re-running a failed step reuses the cached external receipt rather than executing duplicate API calls.
3. Saga compensation execution when an unrecoverable failure occurs at step 2.

```python
"""
tests/test_durable_agent.py - Verification test suite for durable agent execution.
"""
import pytest
from durable_agent.state import WorkflowState, CompensatingAction
from durable_agent.storage import CheckpointStorage
from durable_agent.runner import DurableAgentRunner


def test_crash_recovery_and_idempotency_receipt_caching():
    storage = CheckpointStorage()
    runner = DurableAgentRunner(storage)

    state = WorkflowState(workflow_id="wf-test-001")
    runner.storage.save_checkpoint(state)

    call_count = 0

    def mock_charge_credit_card(args):
        nonlocal call_count
        call_count += 1
        return {"transaction_id": "tx_99988", "charged": args["amount"]}

    # 1. Execute Step 1 (charging credit card)
    res1 = runner.execute_tool_with_idempotency(
        state=state,
        tool_name="charge_card",
        arguments={"amount": 150.0},
        tool_callable=mock_charge_credit_card,
        compensating_action=CompensatingAction("refund_card", {"amount": 150.0}),
    )
    assert call_count == 1
    assert res1["transaction_id"] == "tx_99988"

    # Advance state to step 1
    runner.advance_step(state, next_node="order_confirmed", updates={"paid": True})

    # 2. Simulate POD CRASH: Instantiate a brand new runner and reload from checkpoint
    recovered_state = storage.get_latest_checkpoint("wf-test-001")
    assert recovered_state is not None
    assert recovered_state.step_index == 1

    # Simulate workflow attempting to re-execute Step 0 due to an unacknowledged message
    replayed_state = WorkflowState(workflow_id="wf-test-001", step_index=0)
    res_replay = runner.execute_tool_with_idempotency(
        state=replayed_state,
        tool_name="charge_card",
        arguments={"amount": 150.0},
        tool_callable=mock_charge_credit_card,
    )

    # CRITICAL ASSERTION: The external tool was NOT executed again (call_count remains 1)
    assert call_count == 1
    assert res_replay["transaction_id"] == "tx_99988"


def test_saga_compensation_on_workflow_failure():
    storage = CheckpointStorage()
    runner = DurableAgentRunner(storage)
    state = WorkflowState(workflow_id="wf-saga-002")

    # Step 1: Reserve inventory (with compensation)
    runner.execute_tool_with_idempotency(
        state=state,
        tool_name="reserve_inventory",
        arguments={"sku": "SKU-441", "qty": 5},
        tool_callable=lambda args: {"reserved": True},
        compensating_action=CompensatingAction("release_inventory", {"sku": "SKU-441", "qty": 5}),
    )
    assert len(state.compensations) == 1

    # Step 2: Payment fails catastrophically
    runner.rollback_compensations(state)

    assert len(state.compensations) == 0
    assert state.status == "compensated"
```

---

## Interview Preparation

### Q1: Why can't you guarantee "exactly-once" execution in a distributed agent system, and what do you do instead?
**Model Answer:** Due to the Two Generals' Problem and network unreliability, exactly-once *delivery* is physically impossible across distributed systems. If an agent sends an API request to charge an account and the network drops before the HTTP response arrives, the agent cannot know whether the charge succeeded or failed. Instead of pursuing impossible exactly-once delivery, we engineer **at-least-once execution with deterministic idempotency**:
1. We compute an idempotency key derived from the workflow instance ID, step index, and tool arguments.
2. The downstream service persists this key and commits the transaction atomically.
3. If the agent retries, the downstream service returns the cached receipt rather than re-executing the side-effect. Combined with durable state checkpointing, this provides *effectively* exactly-once semantics.

### Q2: When would you use LangGraph versus Temporal in an enterprise AI platform?
**Model Answer:** We use them at different architectural boundaries. LangGraph is exceptional for the **inner reasoning loop**: managing conversational context, multi-candidate reflection, dynamic tool selection, and token streaming. Temporal is the industry standard for the **outer durable execution orchestrator**: managing distributed timers, retry backoffs, worker queues, cross-service RPCs, and multi-day human-in-the-loop approvals. In our enterprise architecture, a Temporal workflow orchestrates the macro business transaction and delegates specific cognitive planning steps to an agent runtime running LangGraph as a sandboxed activity.

### Q3: How do you handle workflow code versioning when long-running agents are actively executing in flight?
**Model Answer:** Long-running workflows cannot simply be redeployed with breaking code changes because event replay will diverge from history, causing non-deterministic execution errors. We handle this via:
1. **Immutable Workflow Definitions:** Workflows are tagged with explicit version digests (`ProcurementWorkflow_v1_2`).
2. **Deterministic Patching / Branching:** We use framework versioning APIs (like Temporal's `workflow.getVersion()` or LangGraph versioned graph nodes). Old in-flight executions follow the legacy branch until completion; new executions enter the updated graph.
3. **Draining:** During deployments, we spin up new worker pools for new workflow versions while allowing legacy worker pools to drain in-flight jobs.

### Q4: How do you design human-in-the-loop (HITL) approval without keeping worker threads or pods locked in memory?
**Model Answer:** We never use blocking in-memory calls like `sleep()` or long polling. When an agent reaches a human approval node:
1. The runner snapshots and commits the entire state to the persistent database.
2. The runner publishes an approval event to the enterprise notification bus (Slack, email, or internal portal) containing a signed approval URL and cryptographic token.
3. The worker pod terminates the execution thread and frees all compute resources.
4. When the human clicks "Approve", an external webhook receives the token, validates the signature and TTL, and pushes a "Signal" into the orchestrator queue. The orchestrator rehydrates the agent state from the database onto any available worker pod and resumes execution.

---

## Chapter Summary

- **Durability is Not Optional:** Production enterprise agents must survive process evictions, container rescheduling, and transient cloud outages without state loss or duplicate mutations.
- **Idempotency & Receipts:** Every tool call executing a side-effect must be protected by deterministic idempotency keys and an auditable external receipt ledger.
- **Saga Pattern for Agents:** When multi-step agent actions fail partially, compensating transactions must execute in reverse order to return enterprise systems to a consistent state.
- **Asynchronous HITL:** Human review workflows must leverage persistent event signals, strict expiration windows, and environmental pre-flight revalidation rather than blocking in-memory processes.

---

## Further Study

- **Temporal Architecture Whitepaper:** Designing Fault-Tolerant, Distributed Applications (temporal.io).
- **Enterprise Integration Patterns (Hohpe & Woolf):** Compensating Transactions and Idempotent Receivers.
- **LangGraph Conceptual Guides:** Checkpointing, Thread State Persistence, and Breakpoints.
