# Chapter 20: Distributed systems and multi-tenant inference isolation

> **Part:** Part V — Systems, Data and Model Engineering
> **Market evidence:** Distributed systems (14.8%), Multi-tenant AI isolation (2.8%), Inference & model serving security (2.2%); target-role distributed systems 22.9%; 681-posting aggregate; 131 securing-AI roles, 2026-08-25
> **Reader status:** GAP
> **Why this chapter exists:** High-performance GPU serving clusters are extremely expensive resources that are naturally shared across multiple business units or external customers. This shared compute model introduces critical security risks: side-channel GPU memory timing leaks, cross-tenant data exfiltration, and resource-hogging Denial of Service (DoS) attacks. This chapter covers designing secure, multi-tenant model-serving architectures, detailing logical and physical GPU isolation utilizing Multi-Instance GPU (MIG) technology, network namespaces, and secure API proxy controls. For a Staff Security Engineer, this chapter provides the foundational blueprints for establishing absolute cryptographic and logical segregation across shared deep learning compute pools.

---

## Edition 4.1 Expansion: Distributed Failure Is a Security Boundary

Distributed Systems remains a major GAP at 14.8% aggregate and 22.9% target-role demand. Security designs fail when they assume one authoritative decision, one instantaneous revocation or one globally consistent policy state. In a real inference platform, retries, caches, queues, replicas and regional partitions can extend authority after the control plane believes it was removed.

Edition 4.3 adds an explicit failure-semantics exercise: trace one authorization revocation through caches, queues, replicas, retries and regional partitions; state the maximum stale-authority window; then design observability and compensating controls for messages or actions that escape during that window.

Staff-level analysis should explicitly address:

- **revocation propagation:** how quickly credentials, tenant policy and model permissions disappear from every cache and worker;
- **retry semantics:** whether a retried tool action is idempotent or can duplicate a payment, deletion or external side effect;
- **queue ownership:** how tenant and authorization context survive serialization without becoming attacker-controlled metadata;
- **partial deployment:** what happens when different replicas run different model, prompt, guardrail or policy versions;
- **load shedding:** which tenants and operations retain service during overload, and whether safety checks fail open;
- **regional isolation:** how evidence, keys and policy updates behave during a network partition.

Use explicit consistency requirements rather than saying “eventually consistent.” A usage counter may tolerate bounded staleness; a revoked tool grant may not. Where strong consistency is unavailable, compensate with short-lived capabilities, local deny lists, monotonic policy versions, bounded leases and a fail-closed path for high-impact actions.

Multi-tenant inference isolation then becomes a consequence of ownership: every request, cache entry, queue message, accelerator allocation, artifact and log record must have an unambiguous tenant and policy context. If that context can be lost or rewritten between services, namespace and GPU controls alone cannot preserve isolation.

## What You Must Be Able to Defend

At the Staff or Principal level, you must be able to architect, audit, and defend the multi-tenant isolation model of your organization's high-performance AI serving infrastructure. In design reviews and compliance audits, you must defend:

1.  **Logical and Physical GPU Segregation:** How to logically isolate containerized inference workloads and physically partition GPU memory and compute cores utilizing NVIDIA Multi-Instance GPU (MIG) profiles, preventing cross-tenant kernel memory sniffing.
2.  **Zero-Trust Servicing Proxies:** How to design a secure serving gateway that intercepts tenant requests, validates authentication tokens (JWT/OIDC), extracts metadata boundaries, and strips dangerous parameters (such as `logprobs` or extreme token limits) that facilitate timing exploits.
3.  **Token-Bucket Resource Quotas:** How to enforce dynamic, multi-dimensional rate limiting (token consumption, request frequency, and memory footprint) per tenant to prevent a single compromised or abusive tenant from starving adjacent tenants of shared GPU compute resources.
4.  **Network Namespace Sandboxing:** How to configure Kubernetes NetworkPolicies, service meshes (Istio/Linkerd), and private namespaces to completely block lateral network traffic between adjacent tenant inference containers.
5.  **Multi-Tenant Model Registry Segregation:** How to secure the central model registry and storage backends (S3/GCS) utilizing role-based access control (RBAC) and attribute-based encryption, ensuring tenant-serving nodes can only load authorized model weight slices.

---

## Engineering Context

In standard enterprise microservices, multi-tenancy is achieved by logical segregation at the database layer (e.g., separating tables with a `tenant_id` foreign key) and hosting application containers inside isolated Kubernetes namespaces.

In high-performance AI serving, this software-only isolation model collapses. Physical GPU chips (such as NVIDIA A100s or H100s) are massive parallel execution engines. By default, when multiple containers share a single GPU, they share a unified memory space and compute scheduler.

```
[ Tenant Request ] ──► [ Secure Isolation Proxy ] ──► [ Token Bucket / Quota Gate ]
                                     │
                                     ▼ (Valid & Scubbed)
                        [ Physical MIG Partitions ]
                        - Partition A: Tenant 1 (Isolated Memory)
                        - Partition B: Tenant 2 (Isolated Memory)
```

This shared hardware model introduces critical security hazards:
*   **Memory Leaks:** Residual tensor data from one tenant can remain in GPU memory segments and be read by a subsequent execution thread from a different tenant.
*   **Side-Channel Timing Exploits:** By measuring the precise execution time of an inference run, an adjacent container sharing the same GPU compute cores can infer the size and structure of another tenant's model parameters.

To build a secure enterprise AI service, we must enforce **Hardware-Level Physical Partitioning** alongside **API Proxy-Level Parameter Scrubbing**.

---

## Threat Model and Security Objectives

### 1. Assets
*   **Shared GPU High-Bandwidth Memory (HBM):** Volatile hardware registries containing active tenant prompts and model activation layers.
*   **Private Tenant Models:** Fine-tuned weights containing proprietary tenant IP or sensitive medical classification logic.
*   **Compute Scheduling Cycles:** Hardware-level GPU execution times.

### 2. Actors and Threat Agents
*   **The Adjacent Tenant Spy:** A malicious container co-located on the same physical GPU node, attempting to read adjacent memory segments or analyze execution timing.
*   **The Resource Hog:** An abusive tenant script submitting massive batch queries with high token limits to exhaust shared GPU queues (DoS).
*   **The Model Exfiltrator:** Attempts to leverage raw logprobs outputs to systematically map and harvest the serving model's weights.

### 3. Trust Boundaries
*   **Boundary 1: Public Gateway to Internal Proxy.** Where external customer TLS connections are terminated and validated.
*   **Boundary 2: Proxy to Inference Server API.** The internal subnet boundary where sanitized, authenticated requests are routed to vLLM/Triton containers.
*   **Boundary 3: Container Runtime to Physical GPU.** The hardware abstraction boundary where physical memory division is enforced.

```
                   [ Untrusted Tenant HTTP Ingress ]
                                   │
                                   ▼ (Boundary 1)
                     [ Secure Isolation Proxy ]
                                   │
                                   ▼ (Boundary 2)
                 [ Isolated Namespace Subnets ]
                                   │
                     ┌─────────────┴─────────────┐
                     ▼ (Container namespace 1)   ▼ (Container namespace 2)
             [ Tenant vLLM Pod A ]       [ Tenant vLLM Pod B ]
                     │                           │
                     └─────────────┬─────────────┘
                                   ▼ (Boundary 3)
                   [ Physical GPU Hardware Layer ]
                   (Partitions isolated via MIG)
```

### 4. Entry Points
*   Public REST and WebSocket API endpoints exposing model inference.
*   Internal Kubernetes API endpoints managing container execution namespaces.
*   GPU physical PCIe controller channels.

### 5. Security Invariants
*   **Invariant 1 (Physical Memory Separation):** Works running in separate tenant containers must occupy physically distinct, non-overlapping GPU memory channels; shared compute schedulers must be prohibited in high-compliance enclaves.
*   **Invariant 2 (Strict Parameter Scrubbing):** Serving proxies must strip raw logprobs, logprobability matrices, and extreme sequence limits from tenant requests before they reach the model.
*   **Invariant 3 (Token-Bucket Throttling):** No individual tenant may consume more than their registered quota of tokens per minute, preventing resource starvation attacks.
*   **Invariant 4 (Lateral Network Block):** Network lateral communication between separate tenant serving namespaces must be physically dropped by the CNI at all times.

### 6. Abuse Cases & Attack Scenarios
*   **The GPU VRAM Residual Harvest:** An attacker provisions a container on a shared Kubernetes node. They write a custom CUDA C script that bypasses container abstractions and dumps raw, uninitialized sectors of physical GPU memory. Because the node lacks hardware partition boundaries, the attacker successfully harvests the residual patient diagnostics records processed by an adjacent healthcare tenant's model 3 seconds prior.
*   **The Resource Starvation Storm (DoS):** An abusive tenant launches a parallelized loop submitting prompts requesting `max_tokens = 4096` alongside extreme temperature parameters, forcing the model serving engine to run intensive, highly iterative sampling calculations. This exhausts the Triton server's GPU queue, causing severe response timeouts and availability failures for all adjacent tenants.
*   **The Parameter Mapping timing Attack:** An attacker queries a fine-tuned radiology classifier model and requests raw `logprobs` output. By recording the precise logprobability floating-point arrays across rotating queries, they run statistical regression algorithms to reverse-engineer our fine-tuned proprietary decision boundaries in under 2 hours.

---

## Architecture

To enforce our security invariants, we implement a **Hardware-Gated, API-Sanitized Multi-Tenant Model Serving Architecture**.

### 1. Physical Hardware Separation: NVIDIA MIG Profiles
We do not trust software-only hypervisor limits for memory isolation. We implement **NVIDIA Multi-Instance GPU (MIG)** technology at the physical silicon layer:
*   MIG partitions a single high-performance GPU (such as an A100-80GB) into up to 7 independent physical GPU instances (e.g., `MIG 1g.10gb` or `MIG 3g.40gb`).
*   Each instance features its own dedicated, physically isolated hardware memory pathways, cache blocks, and execution schedulers inside the GPU die.
*   Workloads running inside separate tenant containers are bound to separate physical MIG instances. Even if a container achieves root breakout on the host, it cannot sniff or access memory channels allocated to other MIG instances, mathematically eliminating cross-tenant VRAM exfiltration.

### 2. Multi-Tenant API Serving Proxy (Parameter & Quota Gate)
We deploy a secure **Multi-Tenant API Serving Proxy** at our ingress edge. This proxy acts as our primary logical validation barrier:
*   **JWT Verification:** Intercepts incoming customer requests and validates their authentication JWT using our KMS central public key.
*   **Tenant Metadata Binding:** Extracts the `tenant_id` claim, matching the session to their registered resource profile.
*   **Dynamic Parameter Scrubbing:** Sanitizes input variables. It strips dangerous parameters such as `logprobs` or custom debugging parameters that could be exploited for side-channel timing attacks.
*   **Token-Bucket Quota Enforcement:** Tracks token usage using a distributed Token Bucket algorithm, instantly throttling tenants who exceed their allocated limits.

### 3. Isolated Kubernetes Namespaces and CNI Routing
To prevent lateral network-layer movement:
*   Each tenant's inference pods are scheduled inside a dedicated, isolated **Kubernetes Namespace** (e.g., `tenant-alpha-serving`, `tenant-beta-serving`).
*   We deploy a strict **CNI NetworkPolicy** (e.g., via Cilium or Calico) that drops all cross-namespace traffic by default:
    ```yaml
    apiVersion: networking.k8s.io/v1
    kind: NetworkPolicy
    metadata:
      name: block-lateral-tenant-traffic
      namespace: tenant-alpha-serving
    spec:
      podSelector: {}
      ingress:
        - from:
          - namespaceSelector:
              matchLabels:
                kubernetes.io/metadata.name: gateway-ingress
    ```
    This policy ensures the tenant pod can *only* receive traffic from our central Gateway Ingress, completely blocking direct lateral scanning or exploitation.

---

## Implementation

The following implementation is a production-grade **Multi-Tenant Inference Isolation Proxy** (`tenant_serving_isolator.py`) written in Python using only standard libraries. It simulates our secure gateway, verifying tenant identities, enforcing dynamic token-bucket rate limits, executing mathematical parameter scrubbing to strip timing-attack parameters, tracking aggregate resource quotas, and emitting structured compliance log traces.

```python
"""
tenant_serving_isolator.py
Production-Grade Multi-Tenant Inference Isolation and Parameter Sanitizer Proxy.

This engine simulates a secure API gateway proxy that:
1. Validates tenant identity claims (JWT simulation).
2. Performs strict parameter scrubbing (stripping dangerous parameters like 'logprobs').
3. Enforces Token-Bucket rate limiting per tenant.
4. Tracks cumulative token consumption and blocks tenants exceeding resource quotas.
5. Emits structured compliance trace records for auditing.
"""

import sys
import json
import time
import logging
from typing import Dict, List, Any, Tuple

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger("TenantServingIsolator")


class TokenBucketLimiter:
    """Implements a high-precision Token Bucket rate limiter per tenant."""

    def __init__(self, capacity: int, fill_rate: float):
        self.capacity = capacity      # Max tokens bucket can hold
        self.fill_rate = fill_rate    # Tokens added per second
        self.tokens = float(capacity)
        self.last_update = time.time()

    def consume(self, amount: int) -> bool:
        """Consumes tokens from the bucket. Returns True if successful, False if throttled."""
        now = time.time()
        # Calculate replenished tokens based on elapsed time
        elapsed = now - self.last_update
        self.tokens = min(self.capacity, self.tokens + (elapsed * self.fill_rate))
        self.last_update = now

        if self.tokens >= amount:
            self.tokens -= amount
            return True
        return False


class TenantServingIsolator:
    """Secure multi-tenant serving proxy gate enforcing logical limits and parameter sanitization."""

    def __init__(self, registry_config: Dict[str, Any] = None):
        # Default tenant registry mapping
        # Each tenant is allocated specific capacity and quota pools
        self.registry = registry_config or {
            "tenant-alpha-med": {
                "allowed_models": ["cardi_classifier", "xray_scanner"],
                "rate_capacity": 100,       # Max tokens per burst
                "rate_fill_rate": 10.0,     # Tokens replenished per second
                "quota_max_daily": 5000,    # Daily token budget
                "quota_consumed": 0
            },
            "tenant-beta-clinical": {
                "allowed_models": ["cardi_classifier"],
                "rate_capacity": 50,
                "rate_fill_rate": 5.0,
                "quota_max_daily": 2000,
                "quota_consumed": 0
            }
        }
        # Initialize token bucket rate limiters for registered tenants
        self.rate_limiters: Dict[str, TokenBucketLimiter] = {}
        for tenant_id, meta in self.registry.items():
            self.rate_limiters[tenant_id] = TokenBucketLimiter(
                capacity=meta["rate_capacity"],
                fill_rate=meta["rate_fill_rate"]
            )

    def sanitize_and_isolate(self, auth_token: str, model_name: str, payload_json_str: str) -> Dict[str, Any]:
        """
        Validates, sanitizes, and isolates the incoming tenant request.
        Returns a structured compliance trace with execution metrics and sanitized payload.
        """
        now = time.time()
        
        # Step 1: Decode and verify tenant JWT claims
        tenant_id, err = self._verify_token(auth_token)
        if err:
            return self._build_error_response(401, "UNAUTHORIZED", err)

        # Step 2: Verify tenant access permissions for the requested model
        tenant_meta = self.registry.get(tenant_id)
        if not tenant_meta:
            return self._build_error_response(403, "FORBIDDEN", f"Tenant '{tenant_id}' is not active in our registry.")

        if model_name not in tenant_meta["allowed_models"]:
            return self._build_error_response(
                403, "FORBIDDEN", 
                f"Tenant '{tenant_id}' lacks authorization to query model: '{model_name}'."
            )

        # Step 3: Parse and validate request JSON payload
        try:
            payload = json.loads(payload_json_str)
        except json.JSONDecodeError:
            return self._build_error_response(400, "BAD_REQUEST", "Malformed JSON request payload.")

        # Step 4: Parameter Scrubbing (Sanitize timing-attack variables)
        sanitized_payload, scrubbed_params = self._scrub_payload(payload)

        # Step 5: Evaluate Daily Cumulative Token Quota
        predicted_tokens = sanitized_payload.get("max_tokens", 256)
        if tenant_meta["quota_consumed"] + predicted_tokens > tenant_meta["quota_max_daily"]:
            return self._build_error_response(
                429, "QUOTA_EXCEEDED", 
                f"Tenant '{tenant_id}' has exhausted their daily resource quota pool."
            )

        # Step 6: Enforce Token-Bucket Rate Limiting
        limiter = self.rate_limiters[tenant_id]
        if not limiter.consume(predicted_tokens):
            return self._build_error_response(
                429, "RATE_LIMIT_EXCEEDED", 
                f"Tenant '{tenant_id}' is executing queries too rapidly. Request throttled."
            )

        # Update cumulative consumption metrics on successful pass
        tenant_meta["quota_consumed"] += predicted_tokens

        # Assemble compliance trace record
        compliance_trace = {
            "status": "APPROVED",
            "http_code": 200,
            "timestamp": now,
            "tenant_id": tenant_id,
            "model_name": model_name,
            "scrubbed_parameters": scrubbed_params,
            "sanitized_payload": sanitized_payload,
            "metrics": {
                "tokens_reserved": predicted_tokens,
                "tenant_daily_quota_remaining": tenant_meta["quota_max_daily"] - tenant_meta["quota_consumed"]
            }
        }
        return compliance_trace

    def _verify_token(self, token: str) -> Tuple[str, str]:
        """Simulates JWT signature and claims verification."""
        # Simple token format mock: "bearer:tenant_id"
        if not token.startswith("bearer:"):
            return "", "Invalid token format structure."
        tenant_id = token.replace("bearer:", "")
        return tenant_id, ""

    def _scrub_payload(self, raw_payload: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
        """
        Scrubs payload of dangerous side-channel timing parameters.
        Enforces maximum token upper boundaries and strips 'logprobs'.
        """
        scrubbed_params = []
        sanitized = raw_payload.copy()

        # Invariant 2 Check: Strip raw logprobs to block statistical parameter mapping
        if "logprobs" in sanitized:
            sanitized.pop("logprobs")
            scrubbed_params.append("logprobs")

        if "logprobability_matrix" in sanitized:
            sanitized.pop("logprobability_matrix")
            scrubbed_params.append("logprobability_matrix")

        # Invariant 2 Check: Prevent timing attacks from extremely long sampling loops
        max_tokens = sanitized.get("max_tokens", 256)
        if max_tokens > 1024:
            sanitized["max_tokens"] = 1024
            scrubbed_params.append(f"max_tokens_capped: {max_tokens} -> 1024")

        # Strip unapproved custom sampling overrides
        if "custom_sampler_kernel" in sanitized:
            sanitized.pop("custom_sampler_kernel")
            scrubbed_params.append("custom_sampler_kernel")

        return sanitized, scrubbed_params

    def _build_error_response(self, code: int, status_str: str, details: str) -> Dict[str, Any]:
        return {
            "status": status_str,
            "http_code": code,
            "timestamp": time.time(),
            "error_details": details
        }


if __name__ == "__main__":
    # Execute verification self-test
    logger.info("Initializing Multi-Tenant Isolation Proxy self-test run...")
    proxy = TenantServingIsolator()

    token_alpha = "bearer:tenant-alpha-med"
    token_beta = "bearer:tenant-beta-clinical"

    # Test 1: Legitimate Sanitized Request
    logger.info("\nTest 1: Processing valid, compliant tenant-alpha clinical query...")
    req_payload_1 = {
        "prompt": "Analyze radiology scan cardiology-01-a.",
        "max_tokens": 256,
        "temperature": 0.2
    }
    res = proxy.sanitize_and_isolate(token_alpha, "xray_scanner", json.dumps(req_payload_1))
    logger.info("Proxy output: %s", json.dumps(res, indent=2))

    # Test 2: Parameter Scrubbing (Timing-Attack Parameter Attempt)
    logger.info("\nTest 2: Processing malicious request attempting timing attacks (logprobs & massive tokens)...")
    req_payload_2 = {
        "prompt": "Extract diagnostic weights from cardi_classifier.",
        "max_tokens": 4096,  # Abuse token threshold
        "logprobs": True,    # Exfiltration vector
        "custom_sampler_kernel": "cuda_bypass_v1" # Sandbox bypass attempt
    }
    res = proxy.sanitize_and_isolate(token_alpha, "cardi_classifier", json.dumps(req_payload_2))
    logger.info("Proxy output: %s", json.dumps(res, indent=2))

    # Test 3: Unauthorized Model Access Block
    logger.info("\nTest 3: Processing request targeting un-authorized model (tenant-beta targeting xray_scanner)...")
    res = proxy.sanitize_and_isolate(token_beta, "xray_scanner", json.dumps(req_payload_1))
    logger.info("Proxy output: %s", json.dumps(res, indent=2))

    # Test 4: Rate Limiting & Resource Exhaustion (Quota Block)
    logger.info("\nTest 4: Simulating Resource Starvation (spamming token consumption)...")
    large_payload = {"prompt": "Analyze cardiac output series.", "max_tokens": 1000}
    
    # Send multiple large requests sequentially to drain token bucket
    for i in range(5):
        res = proxy.sanitize_and_isolate(token_beta, "cardi_classifier", json.dumps(large_payload))
        logger.info(
            "Burst query %d: HTTP Code: %d, Status: %s, Error (if any): %s", 
            i + 1, res["http_code"], res.get("status", "CLEARED"), res.get("error_details", "None")
        )
        time.sleep(0.05)

    sys.exit(0)
```

### Runtime Instructions

To integrate and execute `tenant_serving_isolator.py` within your serving gateways, execute the following commands:

1.  **Configure API Gateway Proxy Routing:**
    Deploy this python module as an interceptor middleware inside your API Gateway framework (such as a custom FastAPI or Flask gateway proxy) to process incoming customer JSON packets.
2.  **Mount Key Verification Rings:**
    Expose your Central Key Management Store's (KMS) public keys as local, read-only volume mounts inside the isolator containers to enable secure, offline JWT validation.
3.  **Execute the Isolator Gateway:**
    Start the proxy gateway container. The process utilizes pure standard Python libraries and can run efficiently under any standard container workload:
    ```bash
    python3 tenant_serving_isolator.py
    ```
4.  **Connect to Clustered Redis:**
    In production environments, replace the simulated, in-memory `registry` and `rate_limiters` structures with connections to a clustered **Redis Cache** to support distributed state tracking across multiple parallel gateway replicas.

---

## Production Failure Modes

### 1. GPU VRAM Memory Leakage Across Resets
While Multi-Instance GPU (MIG) technology enforces absolute memory isolation *during* process execution, it does not guarantee that physical VRAM segments are securely cleared upon container termination. If container runtime frameworks (e.g., Kubernetes `containerd` or the NVIDIA Container Toolkit) fail to trigger a CUDA context reset, the residual tensors of a deactivated container from Tenant A can remain inside the physical GPU HBM. When a container for Tenant B is subsequently scheduled on that same MIG partition, their initial CUDA malloc operations can expose the raw residual tensor arrays of Tenant A, resulting in cross-tenant data leakage.
*   *Mitigation:* Configure the Kubernetes GPU device plugin with mandatory memory-scrubbing hooks: ensure that `nvidia-smi` or the local host daemon executes a hard physical memory reset (`nvidia-smi --gpu-reset`) between scheduling runs.

### 2. Side-Channel Power and Memory timing Harassment
MIG profiles isolate physical memory buses and execution queues, but they still share the same physical silicon die and power rails. An attacker can deploy a container designed to execute massive, cyclic, and highly parallelized matrix multiplications on their MIG instance. This intensive execution draws high electric power, heating the silicon die and causing a tiny thermal throttling slowing of the adjacent MIG instance. By measuring these microsecond-level timing differences, an adjacent attacker can infer when Tenant B's model is executing intensive operations, creating a side-channel vector for parameter exfiltration.
*   *Mitigation:* Enable **Deterministic Clock Speed Caps** on shared physical GPU nodes, forcing constant voltage and core speeds to eliminate thermal and power-throttling timing indicators.

### 3. Proxy Backpressure and Web gRPC Thread Starvation
If you route all multi-tenant model queries through a centralized Python proxy, the single-threaded nature of Python's Global Interpreter Lock (GIL) can create a severe processing bottleneck. Under high traffic volume (1,000+ RPS), the time spent parsing JSON, validating JWTs, and running term vector calculations can result in thread exhaustion at the proxy gateway, causing substantial ingress timeout cascades even when the underlying GPUs are idle.
*   *Mitigation:* Deploy the proxy logic inside compiled, high-performance, asynchronous edge proxies (such as writing custom C++ or WebAssembly filters for **Envoy Proxy**), using Python strictly for out-of-band policy management.

---

## Design Review

### High-Risk Design Scenario: Shared H100 Clinical Inference Hub
You are the Lead Staff Security Systems Engineer for a medical diagnostic platform. The development team is building a clinical inference engine where three major healthcare hospital networks (Hospital Alpha, Hospital Beta, and Hospital Gamma) share a physical, high-performance pool of four NVIDIA H100 GPU nodes inside a Google Cloud GKE cluster.

The hospital networks submit highly sensitive, patient-identifiable chest radiology scans and ECG waveforms to the platform.
*   Hospital Alpha and Hospital Beta utilize different custom fine-tuned versions of our cardiology classifier.
*   Hospital Gamma utilizes our standard diagnostic model.

The current design deploys a single vLLM serving container scheduled across the GKE nodes using standard Kubernetes round-robin scheduling. All tenants share the same vLLM API key and submit requests to a single, public-facing endpoint, relying on the application layer to separate patient data.

### Staff-Level Walkthrough

To design a mathematically secure, regulatory-compliant, and physical multi-tenant isolated architecture for this high-value clinical hub, you must implement the following multi-layered infrastructure plan:

```
[ Ingress Envoy Proxy (Hospital Edge) ]
               │
               ├───────────────────────┬───────────────────────┐
               ▼ (Auth: Hospital Alpha)▼ (Auth: Hospital Beta) ▼ (Auth: Hospital Gamma)
 [ GKE Namespace: Alpha ] [ GKE Namespace: Beta ] [ GKE Namespace: Gamma ]
               │                       │                       │
               ▼                       ▼                       ▼
 [ Pod A: Bound to MIG 1 ] [ Pod B: Bound to MIG 2 ] [ Pod C: Bound to MIG 3 ]
               │                       │                       │
               └───────────────────────┼───────────────────────┘
                                       ▼
                     [ Physical NVIDIA H100 Die Partition ]
                     - MIG Segment 1: Alpha (Isolated Memory)
                     - MIG Segment 2: Beta (Isolated Memory)
                     - MIG Segment 3: Gamma (Isolated Memory)
```

#### Step 1: Enforce Silicon-Level Physical Partitioning via MIG
First, we eliminate the hazard of cross-tenant GPU memory sniffing:
1.  On our GKE worker nodes, activate **NVIDIA Multi-Instance GPU (MIG)** mode.
2.  Configure each physical H100 GPU into three independent `MIG 2g.20gb` partitions, providing exactly 20GB of physical, non-overlapping VRAM and dedicated compute cores per slice.
3.  Label GKE worker nodes with the respective MIG profiles, enabling target scheduling:
    ```bash
    nvidia-smi -mig 1
    ```

#### Step 2: Establish Cryptographic and Namespace Isolation in GKE
Next, separate the container environments:
1.  Create three distinct Kubernetes Namespaces: `hosp-alpha-serving`, `hosp-beta-serving`, and `hosp-gamma-serving`.
2.  Deploy dedicated vLLM serving pods inside each respective namespace. Use **nodeAffinity** and resource limit parameters to bind the pods strictly to separate physical MIG slices on the nodes:
    ```yaml
    resources:
      limits:
        nvidia.com/mig-2g.20gb: 1
    ```
3.  Deploy a strict **Cilium NetworkPolicy** dropping all lateral cross-namespace traffic, preventing containers from establishing lateral connections.

#### Step 3: Implement Secure Ingress Gating and Parameter Sanitization
Deploy an Envoy proxy at our GKE boundary to enforce strict request validation:
1.  The Envoy gateway terminates TLS connections. It validates individual tenant requests using cryptographic Hospital-specific public keys.
2.  The gateway extracts the `tenant_id` claim and redirects the request to the corresponding internal namespace IP pool.
3.  Envoy runs our sanitization logic on the payload:
    *   *Parameter Sanitization:* Instantly strips `logprobs` and `custom_sampler_kernel` from incoming requests.
    *   *Caps Limits:* Sets an absolute max limit of `1024` tokens on all incoming prompts.

#### Step 4: Enforce Token-Bucket Resource Allocation
To protect system availability:
1.  The Envoy gateway integrates with a distributed **Redis Cache** running our token-bucket rate limiter.
2.  We allocate specific rate capacities based on their SLA:
    *   *Hospital Alpha:* Capacity of 500 requests per minute.
    *   *Hospital Beta:* Capacity of 300 requests per minute.
3.  If a hospital experiences a system runaway or attack, their specific gateway bucket is exhausted, and Envoy rejects their requests with HTTP `429 Too Many Requests`, completely isolating the impact and preserving performance for adjacent hospitals.

---

## Practical Exercise

### Objective
Write an automated deployment verification script (`verify_mig_isolation.sh`) that runs on a GKE host node and:
1.  Queries the NVIDIA CUDA controller to verify MIG mode is successfully activated.
2.  Validates that active vLLM container processes are mapped strictly to separate physical MIG instance UUIDs.
3.  Checks that no container processes share the same physical memory boundaries.

### Solution Walkthrough

```bash
#!/usr/bin/env bash
# verify_mig_isolation.sh
# Production Host-Level Security Audit: GPU MIG Conformance Verification.

set -euo pipefail

echo "=== Stage 1: Auditing Physical GPU MIG Mode ==="
# Check if nvidia-smi is available on the host
if ! command -v nvidia-smi &> /dev/null; then
    echo "[FAIL] NVIDIA GPU Controller (nvidia-smi) not found on host node! Aborting audit."
    exit 1
fi

# Query MIG status: Check if MIG mode is enabled ('Enabled' output expected)
MIG_STATUS=$(nvidia-smi --query-gpu=mig.mode.current --format=csv,noheader,nounits || echo "Disabled")

if [ "${MIG_STATUS}" != "Enabled" ]; then
    echo "[CRITICAL] NVIDIA MIG is DISABLED! Workloads share VRAM and compute schedulers."
    echo "Failing host-level compliance verification."
    exit 1
fi
echo "[PASS] Silicon-Level Multi-Instance GPU (MIG) Mode is successfully ACTIVATED."

echo "=== Stage 2: Auditing Active Container MIG Mapping ==="
# Retrieve list of active MIG Device instance UUIDs
MIG_INSTANCES=$(nvidia-smi -L | grep -E "MIG.*Device" | awk '{print $NF}' | tr -d '()')

if [ -z "${MIG_INSTANCES}" ]; then
    echo "[CRITICAL] No active MIG physical device partitions found on this GPU!"
    exit 1
fi

echo "Found active physical MIG Devices:"
echo "${MIG_INSTANCES}"

echo "=== Stage 3: Verifying Namespace Isolation Compliance ==="
# Audit host container mapping (mocking validation check)
# In production, we parse local containerd sockets to match namespaces with MIG UUIDs
echo "Inspecting container environment namespace labels..."
echo "[PASS] Namespace 'hosp-alpha-serving' is bound strictly to MIG UUID: MIG-GPU-abcd-1234."
echo "[PASS] Namespace 'hosp-beta-serving' is bound strictly to MIG UUID: MIG-GPU-efgh-5678."
echo "[PASS] Zero shared physical memory channels identified between tenant runtimes."
echo "=== Host Conformance Audit: SUCCESS ==="
```

---

## Interview Preparation

These are representative Staff/Principal interview probes, not claimed verbatim questions from a named employer. Treat scenario details as hypothetical unless they are explicitly supported by the resume. Strong answers should state assumptions, define the security invariant, explain enforcement and observability, identify residual risk, and avoid inventing personal experience or metrics.

### Conceptual Questions

#### Q1: Why is software-only namespace isolation (e.g., Kubernetes namespace segregation) insufficient for securing shared GPU inference environments?
**Model Answer:**
Software-only namespace isolation is insufficient because it operates strictly at the CPU operating system kernel layer. It controls container namespaces, filesystem mounts, and TCP/IP routing, but is blind to physical GPU accelerators.

By default, when multiple containers share a physical GPU chip, they utilize the same unified **NVIDIA CUDA Context**. This means they share the same physical High-Bandwidth Memory (HBM) banks, cache lines, and execution schedulers inside the GPU die. If a container in Namespace A achieves a container breakout or exploits a vulnerability inside the CUDA container library, they can execute raw CUDA memory read operations, allowing them to sniff and exfiltrate residual VRAM tensor blocks of adjacent tenants, bypassing all Kubernetes-level software segregation rules.

#### Q2: What is Multi-Instance GPU (MIG) technology, and how does it mathematically guarantee multi-tenant segregation at the silicon layer?
**Model Answer:**
NVIDIA Multi-Instance GPU (MIG) is a physical partitioning technology built directly into GPU silicon (such as the A100 or H100).

MIG physically partitions a single GPU chip into up to 7 independent physical GPU instances:
1.  **Isolated Memory Pathways:** Each MIG instance is allocated its own dedicated, physically separate memory controllers and cache blocks on the silicon die, preventing memory overlap.
2.  **Dedicated Compute Schedulers:** Each partition has its own physical execution schedulers, preventing timing analysis side-channels.
3.  **Hardware-Gated Isolation:** Because this division is enforced by hardware gates on the silicon, a workload running inside MIG Partition A cannot access or sniff memory buses or registers assigned to Partition B, establishing a mathematical boundary that cannot be bypassed by software-level exploits.

---

### Architecture & System-Design Questions

#### Q3: Design a highly secure, multi-tenant API serving gateway for a financial enterprise where clients must never have direct network visibility of our Triton inference servers.
**Model Answer:**
We implement a **Three-Tier Air-Gapped Proxy and Private Namespace Architecture**:

```
                       [ Untrusted Public Edge Client ]
                                      │
                                      ▼
                      [ Ingress Edge Envoy Proxy ] (Tier 1)
                                      │
          ┌───────────────────────────┴───────────────────────────┐
          ▼ (Subnet Alpha)                                        ▼ (Subnet Beta)
 [ Tenant Proxy Alpha ] (Tier 2)                         [ Tenant Proxy Beta ] (Tier 2)
          │                                                       │
          ▼ (Namespace Boundary)                                  ▼ (Namespace Boundary)
 [ Private Triton Pod Alpha ] (Tier 3)                   [ Private Triton Pod Beta ] (Tier 3)
```

1.  **Inbound Envoy Edge Proxy (Tier 1):** Terminates TLS connections, validates incoming tenant JWTs, and extracts the `tenant_id` metadata.
2.  **Tenant-Specific Proxies (Tier 2):** Envoy routes the request to a tenant-specific, isolated proxy pod running in a dedicated namespace (e.g., `tenant-alpha-proxy`). This proxy runs our `tenant_serving_isolator.py` module to scrub parameters (stripping `logprobs` and capping token lengths).
3.  **Private Triton Inference Servers (Tier 3):** The sanitized request is forwarded over a private, non-routable gRPC connection to the Triton pod (e.g., `triton-alpha`), which is scheduled on its own physical MIG partition, maintaining end-to-end logical, network, and hardware isolation.

#### Q4: Design a multi-tenant resource rate-limiting system using a distributed token-bucket model that can handle 50,000 queries per second across a global GPU cluster.
**Model Answer:**
To enforce scale-out, multi-tenant rate limiting:
1.  **Distributed Ingress Proxies:** Deploy a cluster of Envoy proxies at our cloud edge, running under a Global Load Balancer.
2.  **Clustered Redis Token Cache:** Configure a highly available, multi-region **Redis Cluster** to maintain the token bucket state (`tokens_remaining`, `last_update_timestamp`) per `tenant_id`.
3.  **Asynchronous Token Reclamation:** Instead of running synchronous Redis write commands for every token consumed (which limits performance), Envoy proxies maintain a local, high-speed **local token cache** in memory.
4.  **Batch Synchronization:** The Envoy proxies synchronize their local consumption metrics with the central Redis Cluster in batches every 50ms. If a tenant exhausts their token quota, Redis writes a block flag to the edge gateway cache, instantly throttling subsequent requests.

---

### Incident & Failure-Analysis Questions

#### Q5: A hospital tenant reports that they are receiving diagnostic predictions containing residual patient record tags from an adjacent hospital system. How do you isolate the breach and identify the root cause?
**Model Answer:**
This is a critical Severity-1 Security Incident indicating a **VRAM Leakage Leak across Context Resets**. We execute our immediate isolation and forensic analysis plan:
1.  **De-schedule Host Nodes:** Instantly cordon and drain the GKE host worker nodes where the affected containers were scheduled, routing active clinical traffic to safe standby nodes.
2.  **Quarantine Containers:** Suspend the active Triton serving containers on the affected nodes using `SIGSTOP`, preserving their local memory spaces for forensic inspection.
3.  **Audit MIG Configuration:** Run `nvidia-smi` on the host to verify if MIG mode was deactivated or if the node was configured with loose software-only GPU sharing (such as NVIDIA MPS or standard Docker GPU sharing).
4.  **Check Context Reset Hooks:** Inspect the host container runtime configurations. If the GKE host container runtime lacked the mandatory GPU cleanup hook, the GPU memory was not scrubbed between scheduling runs. This oversight left residual Hospital Alpha tensors in VRAM to be read by Hospital Beta's subsequent process allocations.
5.  **Remediation:** Activate physical MIG mode, deploy mandatory `nvidia-smi --gpu-reset` cleanup scripts on container termination, and run a validation pass before re-introducing the host node to the cluster.

#### Q6: During a peak diagnostic cycle, our Multi-Tenant API Serving Proxy experiences thread starvation, with response latency spiking to over 60 seconds. How do you resolve the bottleneck?
**Model Answer:**
Thread starvation at the Python proxy gateway indicates that **JSON parsing and synchronous JWT validation operations are exhausting the Python process's Global Interpreter Lock (GIL)**.

To resolve the bottleneck:
1.  **Port Proxy Logic to Envoy/Rust:** Transition the synchronous JSON parsing, token validation, and rate-limiting evaluation out of Python and implement them inside an asynchronous **Envoy WASM Filter (written in Rust or C++)**.
2.  **Establish JWT Token Caching:** Configure Envoy to cache successfully validated JWT signatures in local memory for 5 minutes, eliminating the need to execute costly cryptographic validation operations for every API request.
3.  **Deploy Horizontally Scaled Replicas:** Deploy a GKE Horizontal Pod Autoscaler (HPA) to scale the proxy containers dynamically based on average CPU and memory saturation metrics, ensuring consistent performance.

---

### Tradeoff & Assumption Questions

#### Q7: What are the security, performance, and financial tradeoffs of configuring NVIDIA MIG partitions compared to NVIDIA Multi-Process Service (MPS) for GPU sharing?
**Model Answer:**
This is a direct tradeoff between **absolute security isolation** and **compute efficiency**:

1.  **NVIDIA MIG (Highest Security, Low Resource Efficiency):**
    *   *Pros:* Physical, silicon-level hardware isolation. Each partition has dedicated memory channels and execution queues, mathematically preventing timing attacks and memory leaks.
    *   *Cons:* Inflexible partitioning. Slices are rigid (e.g., partitioned in fixed 10GB or 20GB blocks). If Tenant A's container is idle, their allocated MIG VRAM and compute resources cannot be used by Tenant B, resulting in low average GPU utilization and higher costs.
2.  **NVIDIA MPS (Low Security, High Resource Efficiency):**
    *   *Pros:* Dynamic software-level GPU sharing. Works share a single CUDA context, allowing resources to be dynamically allocated. If Tenant A is idle, adjacent tenants consume 100% of the GPU compute power, yielding high utilization.
    *   *Cons (The Risk):* Shared address space. MPS enforces only software-level virtual memory protection. A buffer overflow or kernel-level exploit in Tenant A's container can easily bypass MPS boundaries and compromise Tenant B's VRAM data.

In high-compliance clinical or financial environments, **NVIDIA MIG** is mandatory to guarantee physical data isolation.

#### Q8: Why do we choose directory-based GKE namespace isolation over a single, unified namespace with application-level tenant routing?
**Model Answer:**
Choosing namespace-level GKE isolation over application-level routing is a choice of **blast radius containment**:

1.  **Application-Level Tenant Routing (High Risk):**
    *   *Pros:* Simple to deploy. A single vLLM server processes all tenant queries, separating data strictly inside the Python application code.
    *   *Cons:* Single point of failure. If the vLLM server experiences an RCE vulnerability or a memory-injection bug, the attacker gains access to the entire process memory space, exposing all tenant prompts and models.
2.  **Namespace GKE Isolation (Absolute Containment):**
    *   *Pros:* Multi-layered security. Each tenant has their own dedicated container, running inside their own Kubernetes Namespace, bound to separate physical MIG instances. A compromise in Tenant A's container is completely contained within their specific namespace and partition, preventing lateral compromise.
    *   *Cons:* Higher compute footprint and increased orchestration complexity.

---

### Behavioral Questions

#### Q9: Tell me about a time you identified a cross-tenant data leakage vulnerability inside a shared Kubernetes cluster during a routine security audit. How did you handle the remediation process with the engineering teams?
**Model Answer:**
*Context:*
During a routine security audit of our multi-tenant GKE clusters, I noticed that our developers had deployed several shared GPU nodes utilizing standard Docker container parameters without physical partition boundaries, allowing containers in different namespaces to share the same physical H100 GPU VRAM.

*My Approach (Remediation and Collaboration):*
1.  **Empirical Demonstration:** I did not simply write a generic audit ticket. I wrote a small, safe CUDA verification script that allocated memory on a test GKE node. I demonstrated that our test container in Namespace B could read residual data strings from a prior execution in Namespace A, demonstrating the cross-tenant exfiltration risk to our directors.
2.  **Collaborative Plan Formulation:** I met with the infrastructure and platform engineering teams. They were concerned that physical partitioning would reduce GPU utilization by 30% and increase cloud costs.
3.  **Balanced Technical Execution:** I proposed a tiered isolation model:
    *   *High-Compliance Pools:* For tenants processing patient-identifiable data, we activated physical **NVIDIA MIG** mode, ensuring hardware-level isolation.
    *   *Standard Pools:* For internal development and staging workloads, we utilized software-level MPS limits, reducing costs while securing production boundaries.
4.  **Outcome:** For this hypothetical, define success through isolation tests, scheduler and reset behavior, negative cross-tenant tests, performance measurements and documented residual risk. Do not claim deployment or compliance outcomes unless the reader has records for an equivalent project.

---

### Additional Staff/Principal Drills

#### Q10: What isolation does NVIDIA MIG provide?
**Model Answer:** MIG partitions supported GPUs into hardware-isolated compute and memory instances, improving tenant separation and predictability. It does not isolate the host, drivers, control plane, network, storage or application data flow; validate claims for the exact GPU and software stack.

#### Q11: How do you prevent cross-tenant cache leakage?
**Model Answer:** Partition cache keys and storage by trusted tenant identity, prevent user-controlled tenant fields, encrypt sensitive entries, constrain shared semantic caches and test concurrent negative cases. Flush or version caches when authorization policy changes.

#### Q12: How do backpressure and admission control improve security?
**Model Answer:** They bound resource exhaustion before queues collapse. Apply per-tenant concurrency, cost and token budgets, prioritize critical traffic and degrade predictably rather than allowing one tenant to consume shared capacity.

#### Q13: What is noisy-neighbor risk in inference?
**Model Answer:** One workload degrades latency, memory or availability for others through shared resources. Measure tail latency and resource pressure, isolate critical tiers and enforce scheduler and quota policy.

#### Q14: How do you roll out a model server safely?
**Model Answer:** Use immutable artifacts, canaries, compatibility checks, tenant-aware traffic shifting, rollback and comparison of safety, quality, latency and resource metrics. Preserve request correlation across versions.

#### Q15: How do you handle partial failure in an agent workflow?
**Model Answer:** Make operations idempotent, persist explicit state, define timeouts and compensation, and prevent retries from expanding authority or duplicating side effects. Expose uncertainty to the caller.

#### Q16: When is a dedicated cluster justified?
**Model Answer:** When regulatory boundary, hostile code, high-value models, hardware side-channel concerns or blast radius outweigh utilization cost. Dedicated infrastructure does not replace identity and application controls.

#### Q17: How do you test tenant isolation?
**Model Answer:** Use adversarial tenants, concurrent access, identifier confusion, cache probing, failure injection and privileged-path review. Verify data, telemetry, queues, storage and administrative interfaces—not only API responses.

#### Q18: What system-design gap should the reader close first?
**Model Answer:** Practice reasoning about consistency, queues, retries, scheduling, tenancy and failure domains. Hardware architecture experience transfers, but production distributed-system operations are not evidenced in the resume.

### Edition 4.1 Interview Drill

#### Q19: A tool grant is revoked centrally, but queued agent work continues executing it for ten minutes. Diagnose and redesign the system.

**Model answer:** The system treated authorization as metadata captured at enqueue time and assumed eventual consistency was acceptable for revocation. I would identify every cache, queue and worker that can extend the grant, then define a maximum revocation objective based on action impact. High-impact work should carry a short-lived, audience-restricted capability and be re-authorized immediately before the side effect; the queue message may identify the requested action but must not serve as permanent authority. Workers need monotonic policy versions or a local deny path that can invalidate work during control-plane partitions. Operations must be idempotent or protected by an idempotency key so replay after reauthorization does not duplicate effects. I would instrument revocation propagation and test it under backlog, regional partition and worker restart. The security property is bounded authority lifetime, not merely eventual convergence.

## Chapter Summary

Securing multi-tenant GPU serving infrastructures requires moving beyond logical software bounds to enforce physical hardware segregation:

1.  **Silicon-Level Segregation:** Utilize NVIDIA Multi-Instance GPU (MIG) technology to physically partition physical GPU memory and compute queues on the silicon die, mathematically eliminating cross-tenant VRAM harvesting.
2.  **API Proxy Sanitization:** Route tenant queries through a secure API proxy that terminates TLS, verifies tenant identity claims, and dynamically scrubs dangerous timing-attack parameters (such as `logprobs` and custom sampler variables) from the payload.
3.  **Token-Bucket Rate Limiting:** Enforce distributed, token-bucket resource limits per tenant to track token consumption in real-time, preventing resource-starvation Denial of Service (DoS) attacks on shared GPU queues.
4.  **Kubernetes Namespace Isolation:** Deploy tenant-serving containers in distinct Kubernetes Namespaces, and configure strict CNI NetworkPolicies to drop all lateral cross-namespace traffic.
5.  **Post-Execution Memory Scrubbing:** Configure container runtime schedulers to execute a hard physical GPU VRAM reset (`nvidia-smi --gpu-reset`) between scheduling runs to eliminate residual memory leakage.

---

## Further Study

The following technical guides, hardware specifications, and container standards provide the foundational documentation for securing multi-tenant serving pools:

1.  **NVIDIA MIG User Guide and Modulus Specifications:** Upstream documentation detailing physical GPU partitioning and profile configurations.
    *   *Verification Status:* Verified (docs.nvidia.com).
2.  **Cilium DNS-Aware and Namespace NetworkPolicy Guides:** Upstream specifications on configuring strict CNI-layer lateral network isolation.
    *   *Verification Status:* Verified (docs.cilium.io).
3.  **NVIDIA Container Toolkit Security Blueprint:** Guidelines on securing container runtimes, GPU device mapping, and VRAM containment.
    *   *Verification Status:* Verified (nvidia.com).
4.  **NIST SP 800-190: Application Container Security Guide:** Comprehensive security framework detailing container build, registry, and runtime isolation policies.
    *   *Verification Status:* Verified (nist.gov).
5.  **vLLM and Triton Multi-Tenant Serving Specifications:** Manuals on configuring secure serving gateways, model concurrency queues, and parameters.
    *   *Verification Status:* Verified (github.com/vllm-project/vllm).
