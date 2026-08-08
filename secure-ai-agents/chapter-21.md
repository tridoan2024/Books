# Chapter 21: Secure Agent SDLC, Supply Chain Assurance & Release Engineering

An agent is not a model; it is an *assembly*. A production agent is a graph of prompts, tool schemas, authorization policies, a model version, memory configuration, and orchestration logic — each of which independently determines the system's behavior and its security posture. Change a single sentence in a system prompt and you may grant the agent an autonomy it never had; swap a model minor version and a previously-refused injection may now succeed; add one MCP server to the tool set and you inherit its entire trust boundary. Traditional SDLC and supply-chain assurance assume the deployable unit is compiled code with a fixed dependency tree. Agents break that assumption: the most consequential "dependencies" are natural-language artifacts and third-party autonomous services, and the "capabilities" of the build change at the granularity of a prompt edit.

This chapter treats the agent as a versioned, attestable, progressively-releasable artifact. We start by putting **agent artifacts as code** — prompts, tool schemas, policies, and graph definitions in git with a concrete repo layout and a prompt-manifest schema — and by making review gates fire on **threat-model diffs** and **capability changes** rather than line counts, with environment parity that scopes tools differently across dev, staging, and prod. We then build supply-chain integrity: an **AI-BOM** that extends SBOM to models, datasets, prompts, and MCP servers; signing and provenance with **Sigstore/cosign**, **in-toto** attestations, and **SLSA** levels mapped specifically onto agent builds; and a scored rubric for assessing third-party MCP servers and agent vendors. Finally we cover safe release: progressive delivery that ramps *autonomy* rather than merely traffic — shadow mode, canary autonomy, capability ramping — feature flags gating autonomy levels with emergency rollback, and drift management for model upgrades gated on safety regression detection.

By the end you will be able to version an agent as a reviewable, signed, provenance-bearing artifact and release changes to its behavior and autonomy under the same rigor you apply to production infrastructure.

---

## 21.1 Agent Artifacts as Code

### 21.1.1 Versioning Prompts, Tool Schemas, Policies, and Graph Definitions

The precondition for every downstream control — review, attestation, rollback, forensics — is that **every artifact that determines agent behavior lives in version control**, is content-addressable, and is deployed by digest, not by mutable reference. A prompt edited in a web console with no version history is unauditable; a tool added at runtime is unattestable. Treat prompts, tool schemas, policies, and graph definitions as first-class source with the same review, CI, and provenance as application code.

A concrete repository layout keeps the artifacts separated by kind so that a change's *class* is legible from the diff path (which the review gates in 21.1.2 depend on):

```
agent-repo/
├── manifests/
│   └── refund-agent.yaml          # top-level manifest: pins every artifact by digest
├── prompts/
│   ├── system/refund.v7.md        # immutable, versioned; hashed into telemetry (Ch.19.1.3)
│   └── policies/refusal.v3.md
├── tools/
│   ├── transfer_funds.schema.json # JSON Schema; capability-relevant
│   └── search_orders.schema.json
├── policies/
│   ├── authz.rego                 # OPA/Rego runtime policy (see Ch.11)
│   └── egress_allowlist.yaml
├── graph/
│   └── refund.graph.yaml          # orchestration/state-graph definition
└── eval/
    ├── regression/                # known-injection corpus (Ch.20.4.2)
    └── internal_benchmark.py      # blast-radius benchmark (Ch.20.2.2)
```

The **prompt manifest** is the keystone: a schema that pins every artifact by content digest and declares the agent's granted capabilities explicitly, so the manifest itself is the auditable statement of what the agent can do.

```yaml
# manifests/refund-agent.yaml — the deployable unit, pinned by digest
apiVersion: agents/v1
kind: AgentManifest
metadata:
  name: refund-agent
  version: 7.2.0
spec:
  model:
    id: gpt-x
    version: "2026-05-01"          # pinned; upgrades gated by 21.3.3
    digest: sha256:5f3c…
  system_prompt:
    ref: prompts/system/refund.v7.md
    sha256: 9c1e…                   # matches agent.system_prompt.sha256 in spans
  autonomy_level: 3                 # taxonomy from Ch.1.1.2; changes are review-gated
  tools:                            # the capability surface — every entry is a grant
    - name: search_orders          {schema: tools/search_orders.schema.json, scope: read}
    - name: transfer_funds         {schema: tools/transfer_funds.schema.json,
                                     scope: write, hitl: required, max_severity: critical}
  policies:
    authz: {ref: policies/authz.rego, sha256: a11b…}
    egress: {ref: policies/egress_allowlist.yaml, sha256: 4d2f…}
  memory: {scope: per_tenant, ttl_days: 30}
```

Because the manifest pins digests, a deploy is reproducible and a rollback is exact — you redeploy a prior manifest and get byte-identical behavior, which is also what makes the forensic system-prompt-version pinning of Ch. 19.1.3 meaningful.

### 21.1.2 Review Gates: Threat Model Diffs and Capability-Change Approvals

Reviewing agent changes by reading the prose diff misses the point: the security question is not "did the wording change" but "did the agent's *capability* change." A one-line prompt edit that says "you may also access the admin API" is a privilege escalation that a casual review waves through. Review gates must therefore be driven by **capability diffs** and **threat-model diffs**, computed mechanically from the manifest, so that any expansion of the agent's power triggers mandatory security review regardless of diff size.

The gate computes the difference in granted capabilities between the old and new manifest and classifies it:

```python
import yaml
from pathlib import Path

CRITICAL_SCOPES = {"write", "delete", "admin"}

def load_caps(manifest: Path) -> dict:
    spec = yaml.safe_load(manifest.read_text())["spec"]
    return {t["name"]: t for t in spec["tools"]} | {
        "_autonomy": spec["autonomy_level"]}

def capability_diff(old: Path, new: Path) -> dict:
    a, b = load_caps(old), load_caps(new)
    added = {k: b[k] for k in b.keys() - a.keys()}
    removed = {k: a[k] for k in a.keys() - b.keys()}
    escalated = {k: (a[k], b[k]) for k in a.keys() & b.keys()
                 if k != "_autonomy" and a[k].get("scope") != b[k].get("scope")}
    autonomy_up = b["_autonomy"] > a["_autonomy"]
    return {"added": added, "removed": removed,
            "escalated": escalated, "autonomy_up": autonomy_up}

def requires_security_review(diff: dict) -> bool:
    """Any capability expansion forces mandatory security review."""
    if diff["autonomy_up"]:
        return True
    if any(t.get("scope") in CRITICAL_SCOPES for t in diff["added"].values()):
        return True
    if any(new.get("scope") in CRITICAL_SCOPES for _, new in diff["escalated"].values()):
        return True
    return False
```

Wire this into CI as a required check: a diff that adds a write/delete tool, escalates a tool's scope, or raises the autonomy level (Ch. 1.1.2) blocks merge until a security reviewer approves, and the **threat-model document** for the agent is updated in the same PR. This makes the threat model a living artifact that co-evolves with capability, and it defeats the slow, invisible privilege creep that accumulates when each individual prompt tweak looks harmless.

| Change class | Detected from | Gate |
| :--- | :--- | :--- |
| New read-only tool | manifest `tools` added, scope=read | Standard review |
| New write/delete tool | added, scope ∈ critical | **Security review + threat-model diff** |
| Tool scope escalation | `escalated` scope change | **Security review** |
| Autonomy level raise | `autonomy_level` increased | **Security review + staged rollout (21.3)** |
| Prompt wording only | prompts/ diff, no capability delta | Standard review + regression suite |

### 21.1.3 Environment Parity: Dev, Staging, and Production Tool Scoping

Environment parity in agentic systems has a twist absent from classic 12-factor deployment: the same manifest must run everywhere, but the *tools it binds to* and *the blast radius of those tools* must differ by environment. In dev, `transfer_funds` should hit a mock that records intent and moves nothing; in staging, a sandbox ledger with honeytoken accounts (so red-team benchmarks from Ch. 20.2.2 run safely); in prod, the real payments API behind HITL. Getting this wrong in either direction is dangerous: a dev agent wired to prod tools is a catastrophe waiting for a fuzzing run, while a staging agent wired to mocks that behave *unlike* prod gives false assurance.

The discipline is **tool binding by environment, manifest by digest**: the agent manifest is identical across environments (same prompts, same policies, same digests — that is what makes staging predictive), but a separate, environment-scoped binding layer resolves each tool name to a concrete endpoint and credential scope.

```yaml
# tool-bindings.prod.yaml — resolves manifest tool names to real endpoints
env: prod
bindings:
  transfer_funds:
    endpoint: https://payments.internal/v2/transfer
    identity: spiffe://corp/agents/refund-agent          # SPIFFE SVID (Ch.12)
    scope: [payments:write]                              # least privilege
    hitl: required
  search_orders:
    endpoint: https://orders.internal/read-replica
    identity: spiffe://corp/agents/refund-agent
    scope: [orders:read]
---
# tool-bindings.dev.yaml — same names, harmless targets
env: dev
bindings:
  transfer_funds: {endpoint: mock://transfer, scope: [], hitl: false}
  search_orders:  {endpoint: fixture://orders, scope: [], hitl: false}
```

Three parity rules follow. First, **credential scoping is environment-specific and least-privilege** — the prod binding grants exactly `payments:write`, never a broad token, and uses a workload identity (Ch. 12) so containment can revoke it (Ch. 19.4.2). Second, **staging tool contracts must be behaviorally faithful** to prod — same schemas, same error modes, same rate limits — or staging evaluation does not predict prod behavior. Third, **promotion is a manifest digest promotion**: the exact artifact tested in staging is what ships to prod, with only the binding layer swapped, closing the "works in staging, breaks in prod" gap that untracked prompt edits create.

---

## 21.2 Supply Chain Integrity

### 21.2.1 AI-BOM: Extending SBOM to Models, Datasets, Prompts, and MCP Servers

A conventional **SBOM** enumerates software dependencies so you can answer "am I affected by this vulnerability." For agents that question is broader: you must also know which *model*, which *training/fine-tuning datasets*, which *prompts*, and which *MCP servers* compose the system — because a poisoned dataset, a backdoored model, or a malicious MCP server is a supply-chain compromise no code SBOM captures. An **AI-BOM** extends the SBOM to these AI-specific components with their provenance and integrity metadata, expressed in a standard format like **CycloneDX** so it is machine-consumable by the same tooling that ingests code SBOMs.

The AI-BOM must answer, for every component: what is it, where did it come from, what is its cryptographic digest, and how was it verified. A CycloneDX-flavored fragment for our refund agent:

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.6",
  "metadata": { "component": { "type": "application", "name": "refund-agent",
                               "version": "7.2.0" } },
  "components": [
    { "type": "machine-learning-model", "name": "gpt-x",
      "version": "2026-05-01",
      "hashes": [{ "alg": "SHA-256", "content": "5f3c…" }],
      "properties": [
        { "name": "model:format", "value": "safetensors" },
        { "name": "model:provenance", "value": "vendor-hosted-api" } ] },
    { "type": "data", "name": "refund-policy-finetune-set",
      "version": "2026-03", "hashes": [{ "alg": "SHA-256", "content": "b7e2…" }],
      "properties": [{ "name": "dataset:license", "value": "internal-only" }] },
    { "type": "file", "name": "system/refund.v7.md",
      "hashes": [{ "alg": "SHA-256", "content": "9c1e…" }],
      "properties": [{ "name": "artifact:kind", "value": "prompt" }] },
    { "type": "service", "name": "mcp-crm-server", "version": "1.4.0",
      "properties": [
        { "name": "mcp:transport", "value": "streamable-http" },
        { "name": "mcp:vendor", "value": "acme-crm" },
        { "name": "mcp:auth", "value": "oauth2.1+rfc8707" },
        { "name": "trust:tier", "value": "third-party" } ] }
  ]
}
```

Two AI-specific integrity notes. Prefer **safetensors over pickle** for model weights: pickle deserialization executes arbitrary code, making a pickled model a remote-code-execution vector, so the AI-BOM should record the format and CI should reject pickle. And MCP servers appear as `service` components with their transport, auth mode, and **trust tier** — because a third-party MCP server is a live external trust boundary (21.2.3), not a static file. The AI-BOM is generated in CI, signed (21.2.2), and stored with the release so that when a model or MCP server is later found compromised, you can query which deployed agents are affected.

### 21.2.2 Signing and Provenance: Sigstore, in-toto Attestations, and SLSA Levels for Agent Builds

Knowing *what* is in the agent (the AI-BOM) is necessary but not sufficient; you must also prove *how it was built and that it was not tampered with in transit*. This is provenance. **Sigstore/cosign** provides keyless signing (identity-bound signatures via OIDC, logged to the Rekor transparency log) for the manifest, the AI-BOM, and any packaged artifacts. **in-toto** attestations record verifiable statements about build steps — who built it, from which source commit, with which eval results — as signed metadata. Together they let a deployer verify, before admitting an agent to prod, that this exact manifest digest was produced by the trusted pipeline from reviewed source and passed the adversarial gates (Ch. 20.4).

```bash
set -euo pipefail
# Sign the agent manifest and AI-BOM with keyless cosign (OIDC identity -> Rekor)
cosign sign-blob --yes manifests/refund-agent.yaml \
  --output-signature refund-agent.sig --output-certificate refund-agent.pem

# Attach an in-toto attestation asserting eval + provenance for the digest
cosign attest-blob --yes \
  --predicate eval/attestation.json \
  --type https://slsa.dev/provenance/v1 \
  --output-attestation refund-agent.att manifests/refund-agent.yaml

# Admission-time verification (in the deploy gate): fail closed on mismatch
cosign verify-blob manifests/refund-agent.yaml \
  --signature refund-agent.sig --certificate refund-agent.pem \
  --certificate-identity-regexp '^https://github.com/corp/agent-repo/.+' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

**SLSA** levels map onto agent builds with specific meaning:

| SLSA level | Generic meaning | Meaning for an agent artifact |
| :--- | :--- | :--- |
| **L1** | Provenance exists | Build emits signed provenance listing model, prompts, tools, AI-BOM |
| **L2** | Signed provenance, hosted build | Manifest+AI-BOM built and signed by a hosted CI service (not a laptop); tamper-evident |
| **L3** | Hardened, non-falsifiable provenance | Build runs in an isolated, ephemeral runner; provenance cannot be forged by the build itself; source and eval gates are enforced pre-signing |

For an agent, SLSA L3 concretely means: no human hand-edits a prompt into prod, the deploy admits only manifests whose provenance proves they came from the reviewed repo through the CI that ran the Ch. 20 adversarial gates, and the signature identity is pinned to that pipeline. The provenance predicate should embed the eval metrics (ASR, Resilience, Blast Radius) so that "passed security gates" is itself an attested, non-repudiable fact — not a Slack message.

Made concrete for the agent case, each **SLSA Build level** places distinct requirements on the pipeline that assembles the prompt bundle, tool manifest, policy bundle, and pinned model reference. **Build L1** requires only that the pipeline *produce* provenance: a machine-readable document that lists the exact prompt digests, tool-schema digests, policy digests, and the pinned model version/digest that went into this manifest. L1 gives you an inventory but does not stop someone forging it, so it is the floor — acceptable for internal experiments, not for a privileged production agent. **Build L2** adds that the provenance is **signed** and generated by a **hosted build service** rather than a developer workstation, so the artifact is tamper-evident in transit and you can attribute it to a build identity. For an agent this rules out the common anti-pattern of a prompt tweaked in a console and pushed by hand — at L2 the manifest that reaches prod must have flowed through the shared CI. **Build L3** requires that the build run on **isolated, ephemeral infrastructure** whose provenance the build steps themselves cannot forge, with source and eval gates enforced *before* signing. The L3 leap for an agent is non-falsifiability: even a compromised build script cannot mint provenance claiming it ran the adversarial suite when it did not, because the trusted control plane — not the userspace build — attests the steps.

The **in-toto attestation predicate** for an agent build should assert, at minimum: the source commit and repository the manifest was built from; the resolved digests of every prompt, tool schema, and policy in the bundle; the pinned model ID, version, and digest (so a later silent model swap is detectable, 21.3.3); the AI-BOM digest (21.2.1); the identity of the builder; and the **security-gate results** — the ASR, Resilience Ratio, and Blast Radius Score from Ch. 20.4.3 plus a pass flag for the regression corpus. A verifier at the deploy gate then rejects any manifest whose attestation is missing, whose digests do not match the artifact, or whose embedded metrics fall outside policy. This turns "we tested it" into a cryptographically verifiable precondition for admission, and it means an auditor can reconstruct, from signed metadata alone, exactly which artifacts and which safety evidence backed any deployed agent.

### 21.2.3 Third-Party MCP Server and Agent Vendor Assessment Criteria

Every third-party MCP server or agent vendor you integrate is an **external trust boundary** running with your agent's context and, often, your credentials — a classic **confused deputy** exposure if under-vetted. Because MCP's dynamic discovery and tool descriptions themselves enter the model's context, a malicious server can attempt **tool-description injection** (poisoning the agent via the tool metadata it advertises) and can silently change behavior between calls (a "rug pull" where a benign tool turns malicious after approval). Vendor assessment must therefore be a scored, repeatable rubric, not a trust-by-logo decision.

A scored assessment rubric (weight × score, gate on total and on any critical zero):

| Criterion | What to verify | Weight | Critical? |
| :--- | :--- | :--- | :--- |
| Authentication | OAuth 2.1 + PKCE, RFC 8707 Resource Indicators, no token passthrough | 3 | Yes |
| Transport security | TLS; Streamable HTTP with origin validation; no unauth stdio in prod | 2 | Yes |
| Tool-description integrity | Signed/pinned tool schemas; change-notified, not silently mutated | 3 | Yes |
| Least-privilege scoping | Server requests only needed scopes; supports fine-grained consent | 2 | No |
| Provenance & SBOM | Vendor provides SBOM/AI-BOM, signed releases, SLSA level | 2 | No |
| Isolation | Runs sandboxed (Ch. 15); egress-controlled; no host access | 2 | No |
| Incident/disclosure | Published security contact, SLA, coordinated disclosure (Ch. 20.4.4) | 1 | No |
| Data handling | Retention, residency, no training on your data without consent | 2 | No |

Operationalize it: score every candidate server before integration, **fail closed on any critical-criterion zero** (e.g. token passthrough, unsigned mutable tool descriptions), and record the score and the server's digest in the AI-BOM (21.2.1). Re-assess on version changes, and pin the server version so a silent update cannot swap capabilities underneath you. Where a server must be trusted but cannot be fully vetted, wrap it: run it sandboxed, treat all of its outputs as `UNTRUSTED_RESULT` (Ch. 19.1.2), and mediate its tool calls through your own policy gateway rather than granting direct credentials.

The rubric is only as good as the **evidence you demand behind each score**; a vendor's self-attestation is a starting point, not proof. For *provenance*, require signed releases, an SBOM/AI-BOM for the server itself, and a stated SLSA build level — ideally with a verifiable in-toto attestation you can check, not a PDF claim. For *tool-description stability*, demand a written guarantee that tool schemas and descriptions are versioned and change-notified, plus a technical mechanism to pin them (a schema digest you record and compare on every connection), because the tool metadata enters your model's context and a silent change is a live injection vector. For the *auth model*, require concrete evidence of OAuth 2.1 with PKCE and RFC 8707 Resource Indicators, confirmation that the server does **not** pass your tokens through to downstream services, and support for scoped, revocable credentials bound to a workload identity (Ch. 12). For *data handling*, obtain written commitments on retention windows, residency, sub-processors, and an explicit no-training-on-your-data clause; where regulated data flows through the server, this feeds your own EU AI Act / GDPR obligations (Ch. 22). For *incident response*, require a published security contact, a disclosure policy, and a breach-notification SLA with a committed time bound — vague "we'll let you know" language scores zero.

Assessment is not a one-time gate but a **cadence**. Establish a re-review schedule keyed to risk tier: critical, credential-holding servers re-assessed at least quarterly and on every version bump; lower-risk read-only servers annually. Trigger an out-of-cycle re-review whenever the server publishes a new version, changes its tool surface, changes ownership (an acquisition is a trust-boundary change), or is implicated in a disclosed incident. Track each vendor's score, evidence, and pinned digest over time so a *downward* trend — dropped SLA, silently mutated schemas, expanded scope requests — is visible and actionable. The table below summarizes the review triggers and their required response.

| Trigger | Risk signal | Required response |
| :--- | :--- | :--- |
| Scheduled cadence (quarterly/annual) | Routine drift | Full re-score against rubric |
| New server version / schema change | Capability or injection-surface change | Re-pin digests; re-score integrity criteria |
| Ownership / vendor change | Trust boundary shifted | Full re-assessment before continued use |
| Disclosed incident (vendor or peer) | Demonstrated weakness | Immediate re-review; consider sandboxing or removal |
| Expanded scope request | Privilege creep | Security review; justify against least privilege |

---

## 21.3 Safe Release and Operations

### 21.3.1 Progressive Delivery: Shadow Mode, Canary Autonomy, and Capability Ramping

Progressive delivery for stateless services ramps *traffic* — 1%, 10%, 100%. For agents that is insufficient and misleading, because the risk is not how many requests hit the new version but **how much autonomy the agent is permitted to exercise**. The key idea is to **ramp autonomy, not just traffic**: a new agent version should first observe, then propose, then act on low-severity tools, then act on crown-jewel tools — each stage gated on evidence from the prior one.

```
 Stage 0  SHADOW MODE            new agent runs on real inputs, actions are
   |                             logged/compared, NEVER executed
   v
 Stage 1  CANARY AUTONOMY        acts for a small % of sessions, low-severity
   |      (read + reversible)    tools only; HITL on everything else
   v
 Stage 2  CAPABILITY RAMP        write tools enabled progressively; crown-jewel
   |                             tools still HITL-gated
   v
 Stage 3  FULL AUTONOMY          approved capability set at target autonomy level
          (per manifest 21.1.1)  with standing monitoring (Ch.19.3)
```

**Shadow mode** is the highest-value stage: the new version processes real production inputs and produces a full trajectory, but its actions are diverted to a recorder and compared against the current production version's behavior — you measure trajectory drift (Ch. 20.4.2) and would-be blast radius *before any action executes*. **Canary autonomy** then lets the new version act, but only on a slice of sessions and only with reversible, low-severity tools, while high-severity actions stay behind HITL. **Capability ramping** progressively unlocks the write and privileged tools as each cohort accrues clean evidence (no new injections succeed, drift within envelope, resource metrics nominal). Promotion between stages is gated on the same metrics that gate CI (Ch. 20.4.3), now measured on live cohorts, and any regression halts the ramp.

The distinction between **ramping traffic** and **ramping autonomy** is the crux, and conflating them is a common and dangerous error. Traffic ramping controls *exposure* — the fraction of sessions routed to the new version — and bounds the number of users affected by a regression. Autonomy ramping controls *authority* — how consequential an action the version may take without a human — and bounds the *severity* per affected session. A version at 100% traffic but shadow autonomy is fully exposed yet cannot cause a single side effect; a version at 1% traffic but full autonomy can wire real money on that 1%. They are orthogonal axes, and safe delivery moves along both deliberately: widen traffic only after the metrics at the current autonomy stage are clean, and raise autonomy only after the current stage has accrued enough action volume to be statistically meaningful. The diagram below shows the two-dimensional promotion space.

```
   AUTONOMY
   (severity of action allowed)
      ^
 full |                         .  .  .  [Stage 3: full autonomy,
      |                      .           .  widen traffic to 100%]
 write|            [Stage 2: write tools on canary cohort]
      |         .
 read |   [Stage 1: reversible tools, small % sessions]
      |
shadow| [Stage 0: any traffic %, ZERO side effects]
      +-------------------------------------------------> TRAFFIC
        1%        10%        50%       100%   (exposure / % sessions)
   Promote UP only when metrics clean; promote RIGHT to widen exposure.
```

Each promotion step is gated on distinct signals. Shadow→canary requires that shadowed trajectories stay within the golden envelope (drift rate below threshold) and that no shadow action would have triggered a Blast Radius above policy. Canary read→write requires clean injection-regression and Resilience within tolerance on the live cohort, plus nominal resource telemetry (Ch. 19.3.2). Write→crown-jewel requires an additional soak period with zero confirmed exploits and explicit sign-off, since these tools are irreversible. What shadow mode **cannot** tell you is equally important: because its side-effecting actions never execute, it validates *decision-making* (did the agent choose the right tool and arguments?) but not *execution* (does the real tool succeed, is it idempotent under retry, does the downstream system behave as the sandbox did?). A tool that is mocked in shadow may fail, rate-limit, or double-execute in prod, and shadow will never surface it. Shadow mode also cannot exercise stateful, multi-session effects like memory writes that only matter across sessions (Ch. 20.3.2). Those risks are only retired by canary autonomy on real tools with a small, reversible blast radius — which is precisely why the autonomy ladder exists and why you cannot skip it by shadowing longer.

### 21.3.2 Feature Flags for Autonomy Levels and Emergency Capability Rollback

The ramp of 21.3.1 must be controllable at runtime without a redeploy, because a deploy is too slow when an agent is misbehaving in production. **Feature flags gate autonomy levels and individual capabilities**, evaluated by the runtime before every tool call, so an operator can instantly demote autonomy or disable a specific tool — an **emergency capability rollback** that is faster and more surgical than rolling back the whole artifact.

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class CapabilityFlags:
    max_autonomy: int              # runtime ceiling, can be lowered instantly
    disabled_tools: frozenset[str] # kill specific capabilities without redeploy
    force_hitl: frozenset[str]     # force human approval on named tools
    global_halt: bool              # master kill switch (ties to Ch.19.4.2)

def authorize_action(tool: str, manifest_autonomy: int,
                     flags: CapabilityFlags) -> str:
    """Runtime gate: flags override the manifest, always fail closed."""
    if flags.global_halt:
        return "DENY:halted"
    if flags.max_autonomy < manifest_autonomy:      # emergency autonomy demotion
        return "DENY:autonomy_capped"
    if tool in flags.disabled_tools:                # emergency capability rollback
        return "DENY:tool_disabled"
    if tool in flags.force_hitl:                    # emergency step-up
        return "HITL_REQUIRED"
    return "ALLOW"
```

Design constraints that make this a real control and not a footgun. Flags are read from a low-latency control plane that the agent's context cannot influence (an injected instruction must never be able to flip its own kill switch — this is the out-of-band property from Ch. 19.4.2). Flag changes are themselves **audited** through the hash-chained log (Ch. 19.2.2), because disabling a control is a security-relevant action. And the gate **fails closed**: if the flag service is unreachable, the runtime denies privileged tools rather than assuming full autonomy. This gives operations three graduated responses to an incident — demote autonomy, disable a specific tool, or global halt — each reversible and instant.

### 21.3.3 Drift Management: Model Version Upgrades and Safety Regression Detection

The most insidious agent change is the one you did not author: a **model version upgrade**. Because the model is a dependency (pinned in the manifest, 21.1.1), a vendor's minor update can silently alter reasoning, refusal behavior, and injection susceptibility — a control that held against a payload on version A may fail on version B with no change to your prompts or code. Silent, provider-side model swaps (detectable via `gen_ai.response.model`, Ch. 19.1.1) are the worst case: your attested artifact now runs on an unvetted model. Drift management makes every model change an explicit, gated event.

The discipline: pin the model by version and digest in the manifest; treat any upgrade as a change that must pass the full adversarial gate (Ch. 20.4) plus a dedicated **safety regression** comparison between the incumbent and candidate model, before it is allowed to ramp (21.3.1).

```python
def safety_regression_gate(incumbent: dict, candidate: dict,
                           tolerance: float = 0.0) -> dict:
    """Compare candidate model metrics vs. incumbent; block on any safety regression."""
    regressions = []
    # ASR must not rise; Resilience must not fall (Ch.20.4.3)
    if candidate["asr"] > incumbent["asr"] + tolerance:
        regressions.append(f"ASR up {incumbent['asr']:.3f}->{candidate['asr']:.3f}")
    if candidate["resilience"] < incumbent["resilience"] - tolerance:
        regressions.append(
            f"Resilience down {incumbent['resilience']:.3f}->{candidate['resilience']:.3f}")
    if candidate["blast_radius"] > incumbent["blast_radius"] + tolerance:
        regressions.append("Blast radius increased")
    # per-class injection corpus: no previously-blocked attack may reopen
    reopened = set(candidate["reopened_injections"]) - set(incumbent["reopened_injections"])
    if reopened:
        regressions.append(f"Reopened injections: {sorted(reopened)}")
    return {"promote": not regressions, "regressions": regressions}
```

Operationally, model upgrades run the same progressive-delivery ladder as any other change: shadow the candidate model against production traffic, compare trajectories and metrics, and promote only if the safety regression gate is clean and the canary cohorts stay within envelope. Maintain the ability to **pin back** — because the manifest pins the model digest, reverting to the prior model is a manifest rollback, and the feature-flag layer (21.3.2) lets you demote autonomy instantly if a regression surfaces only in production. The governing principle across this chapter holds here: an agent is an assembly of behavior-determining artifacts, and *every* change to that assembly — prompt, tool, policy, or model — must be versioned, reviewed against its capability delta, attested, and released by ramping autonomy under standing safety measurement.

---

## Technical Chapter Summary

- An agent is an **assembly** of behavior-determining artifacts — prompts, tool schemas, policies, graph definitions, and a pinned model — that must all live in version control, be content-addressable, and deploy by digest so that behavior is reproducible, rollback is exact, and forensics (Ch. 19.1.3) is meaningful.
- Review gates must fire on **capability diffs and threat-model diffs** computed mechanically from the manifest — any new write/delete tool, scope escalation, or autonomy-level raise forces security review — because a one-line prompt edit can be a privilege escalation that line-count review misses.
- **Environment parity** binds the *same manifest digest* to environment-specific, least-privilege tool bindings (mock in dev, faithful sandbox in staging, real API behind HITL in prod); promotion is digest promotion so staging predicts prod.
- An **AI-BOM** (CycloneDX) extends the SBOM to models, datasets, prompts, and MCP servers with digests and trust tiers; prefer **safetensors over pickle** to avoid deserialization RCE, and record MCP servers as external trust boundaries.
- Provenance uses **Sigstore/cosign** keyless signing and **in-toto** attestations, with **SLSA L1–L3** mapped onto agent builds — L3 meaning no hand-edited prompts reach prod and the deploy admits only manifests whose non-forgeable provenance proves they passed the Ch. 20 adversarial gates.
- Third-party MCP servers and agent vendors are scored against a weighted rubric that **fails closed on critical criteria** (token passthrough, unsigned mutable tool descriptions), guarding against confused-deputy, tool-description injection, and rug-pull risks.
- Safe release **ramps autonomy, not just traffic** — shadow mode, canary autonomy, then capability ramping — controlled at runtime by **feature flags** (autonomy ceiling, per-tool disable, global halt) that are out-of-band, fail closed, and audited.
- **Model version upgrades** are treated as gated changes: pin by digest, run the full adversarial gate plus a **safety regression** comparison (ASR, Resilience, Blast Radius, reopened injections), shadow before promoting, and pin back instantly via manifest rollback or autonomy demotion if regressions surface.
