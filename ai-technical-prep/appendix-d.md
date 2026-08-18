# Appendix D: Secure API design and test automation

> **Part:** Appendices
> **Market evidence:** API design (4.4%), Testing & automation (2.8%); 496-posting aggregate; 95 securing-AI roles, 2026-08-18
> **Reader status:** GAP (Establishing automated validation frameworks for AI and microservice APIs)
> **Why this appendix exists:** Modern software architectures are built on APIs. For artificial intelligence and machine learning platforms, APIs act as the bridge between model-serving engines, vector databases, and user-facing clients. A failure in API-level authentication, schema validation, or output enforcement can render the strongest LLM guardrails entirely useless. This appendix teaches security engineers how to design secure API boundaries (covering REST, GraphQL, gRPC/Protobuf, and OpenAPI schemas) and establish robust automated testing. Crucially, it demonstrates how to mock non-deterministic LLM systems in test suites and build custom JSON Schema fuzzers to actively verify input validation boundaries.

---

## 1. Core Principles of Secure API Design

Securing microservice interfaces requires a zero-trust architecture where every request is authenticated, authorized, and validated.

### 1.1 REST Security Patterns
REST APIs rely heavily on HTTPS and token-based authentication (e.g., OAuth2 with JWTs). At a systems level, you must defend against:
-   **Broken Object Level Authorization (BOLA/IDOR):** Occurs when an API endpoint exposes an identifier (e.g., `/api/v1/user/1001/history`) without verifying if the requesting token possesses rights to read user `1001`. Fix this by enforcing context-based lookup (e.g., pulling the user ID directly from the authenticated JWT claims rather than trust URL parameters).
-   **Broken Function Level Authorization (BFLA):** Occurs when administrative functions are exposed on public routes (e.g., `/api/v1/users` is accessible to users who are not administrators). Enforce strict Role-Based Access Control (RBAC) middleware on all routes.

### 1.2 GraphQL Security Challenges
GraphQL changes the security landscape by replacing separate endpoint structures with a single endpoint (`/graphql`) that accepts highly dynamic client-defined queries.
-   **Query Depth & Complexity Attacks:** Attackers can send nested circular queries (e.g., a node querying its parent, which queries the child recursively) to trigger CPU and memory exhaustion. Implement maximum query depth and complexity analysis middlewares to block queries before execution.
-   **Introspection Abuse:** Introspection allows users to query the schema design directly. Disable introspection in production environments to prevent attackers from mapping your complete database structure.

### 1.3 gRPC and Protocol Buffers Security Design
gRPC uses Protocol Buffers (Protobuf) as its interface definition language and serialization format over HTTP/2. While gRPC is naturally immune to classic text-based SQL injections or simple XSS payloads due to binary serialization, it exposes other systems risks:
-   **Field Exhaustion and Deserialization Loops:** Protobuf deserializers construct objects in memory. A malformed binary stream containing recursive unknown fields can trigger allocation loops, exhausting CPU and heap memory.
-   **Unsigned Integer Overflows:** Many Protobuf decoders translate varints into standard programming integers. A mismatched type specification can trigger sign-extension vulnerabilities, leading to buffer overruns in native gRPC-wrapping applications.
-   **Mitigation:** Enforce strict payload limits at the API Gateway layer (e.g., max message size to 4MB) and validate that the gRPC compiler outputs safe, bound-checked parsing logic.

### 1.4 Strict OpenAPI Schema Enforcement and Validation Criteria
The OpenAPI (formerly Swagger) specification allows developers to write machine-readable descriptions of their REST APIs. Modern secure gateways (like Kong, Apigee, or custom Express/FastAPI middlewares) can ingest these schemas to automatically block requests that contain malformed parameters, unexpected fields, or invalid types.

To enforce maximum security, ensure that OpenAPI schemas adopt the following strict validation criteria:
1.  **Disable `additionalProperties`:** Explicitly set `additionalProperties: false` in object definitions. This blocks request parameter pollution and prevents attackers from smuggling unrecognized fields to backend database controllers.
2.  **Strict Sizing Constraints:** Every string parameter must declare `minLength` and `maxLength` properties, and every integer parameter must declare `minimum` and `maximum` boundaries to neutralize memory allocation exhaustion attempts.
3.  **Explicit Format and Pattern Matching:** Validate values against strict regular expressions using the `pattern` property, and enforce standard identifiers using format properties such as `format: uuid` or `format: email`.

---

## 2. Automating API Security Testing

Dynamic application security testing (DAST) can be automated in CI/CD pipelines to detect regressions. You must write automated verification scripts that test for:
-   **Token Expiry & Signature Violations:** Ensure the API gateway rejects expired tokens, malformed headers, or tokens signed with the insecure `alg: "none"` algorithm.
-   **Rate-Limit Enforcement:** Programmatically trigger burst request spikes to verify that the gateway returns HTTP `429 Too Many Requests` when limits are breached.
-   **Input Boundaries:** Attempt to pass SQL injection payloads (`UNION SELECT`), Cross-Site Scripting tags, and system directory traversals (`../../etc/passwd`) to verify that the validation filters reject them natively.
-   **GraphQL Schema Evasion:** Write automated scripts to run introspection-guided queries that systematically crawl every object field looking for missing authorization guards on administrative mutations.

---

## 3. Mocking Non-Deterministic Systems in Automated Test Suites

Testing generative AI applications presents a major challenge: **non-determinism**. An LLM may generate a different response for the exact same prompt across successive test runs. If your unit tests rely on live connections to live OpenAI, Anthropic, or local vLLM endpoints:
1.  **Tests become flaky:** Minor semantic changes in the model's output will break parsing assertions.
2.  **Unnecessary costs are accrued:** Running live inference across hundreds of pipeline builds is highly expensive.
3.  **CI/CD pipelines become sluggish:** Waiting for model tokens over the network slows down deployments.

### 3.1 Intercepting Network Requests with Mocking
To build reliable test suites, you must intercept calls to LLM SDKs or HTTP endpoints using mocking libraries (e.g., `unittest.mock` or `pytest-mock` in Python). This allows you to simulate structured LLM outputs, system timeouts, rate-limiting errors, and malicious injection payloads deterministically.

```python
from unittest.mock import patch
import pytest

# Example of mocking an OpenAI client call deterministically
@patch("openai.resources.chat.Completions.create")
def test_agent_parsing_logic(mock_chat_create):
    # Set up a deterministic mock return payload
    mock_chat_create.return_value = {
        "choices": [{
            "message": {
                "content": '{"action": "grant_access", "role": "admin"}'
            }
        }]
    }
    
    # Run the target function that processes the LLM output
    result = execute_agent_decision("User: grant admin status")
    assert result["authorized"] is True
```

---

## 4. API Fuzzing: Verifying Schema and Sanitization Boundaries

Fuzzing is the process of inputting invalid, unexpected, or random data to a system to locate crashes, memory leaks, or validation bypasses. When securing REST APIs, you must perform **JSON Schema Boundary Fuzzing**. 

By analyzing the API's OpenAPI specification or target schema, a custom fuzzing engine can systematically alter request payloads:
-   **Type Mutation:** Passing a string where an integer is expected.
-   **Boundary Violation:** Passing an integer exceeding the `maximum` constraint or a string longer than `maxLength`.
-   **Null Injection:** Omitting required fields or injecting explicit `null` and `undefined` properties.
-   **Array Expansion:** Sending extremely large arrays to test for buffer memory exhaustion.

---

## 5. Production Reference: Automated JSON Schema Fuzzer (`api_fuzzer_test.py`)

Below is the complete, self-contained, typed, and fully executable Python script implementing an automated security validation suite. This tool:
1.  **Mocks an LLM Response Stream:** Simulates non-deterministic API interactions with OpenAI ChatCompletion.
2.  **Fuzzes JSON Input Schema Boundaries:** Uses systematic type mutations, boundary injections, and schema omissions to locate validation flaws.
3.  **Verifies Rate-Limit Headers:** Automates request spikes and interprets backoff indicators.

```python
#!/usr/bin/env python3
"""
api_fuzzer_test.py

A complete, automated API security validation and fuzzing utility.
Features:
1. Mocking framework for non-deterministic OpenAI chat inference.
2. Highly-configurable JSON Schema boundary and mutation fuzzer.
3. Automatic rate-limiting and backoff verifier.
4. Robust, typed assert-driven security validation test suite.
"""

import sys
import os
import json
import time
import logging
from unittest.mock import patch, MagicMock
from typing import Dict, List, Any, Generator, Tuple

# Configure structured standard output logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (%(filename)s:%(lineno)d) - %(message)s"
)
logger = logging.getLogger("ApiFuzzer")


# ============================================================================
# PART 1: The Target API to Test
# ============================================================================

class DeploymentValidationAPI:
    """Simulated API interface representing an AI model provisioning gatekeeper."""

    # Simple JSON Schema defining expected deployment configuration payload
    CONFIG_SCHEMA = {
        "type": "object",
        "properties": {
            "model_name": {"type": "string", "minLength": 3, "maxLength": 64},
            "replica_count": {"type": "integer", "minimum": 1, "maximum": 10},
            "environment": {"type": "string", "enum": ["development", "staging", "production"]},
            "enable_debug_logging": {"type": "boolean"}
        },
        "required": ["model_name", "replica_count", "environment"]
    }

    def __init__(self):
        self.request_count = 0
        self.max_requests_per_window = 100
        self.window_reset_time = time.time() + 60

    def process_deployment_request(self, payload_str: str) -> Tuple[int, Dict[str, Any]]:
        """
        Validates, parses, and processes model deployment configurations.
        Implements strict schema validation and rate limiting.
        """
        # 1. Evaluate rate-limits first to prevent computational resource exhaustion
        current_time = time.time()
        if current_time > self.window_reset_time:
            self.request_count = 0
            self.window_reset_time = current_time + 60

        self.request_count += 1
        if self.request_count > self.max_requests_per_window:
            return 429, {"error": "Rate limit exceeded", "retry_after": 5}

        # 2. Parse request payload safely
        try:
            data = json.loads(payload_str)
        except json.JSONDecodeError:
            return 400, {"error": "Invalid JSON format"}

        # 3. Enforce strict JSON Schema Validation manually
        if not isinstance(data, dict):
            return 400, {"error": "Request body must be a JSON object"}

        # Check for unexpected fields (strict schema enforcement)
        allowed_properties = self.CONFIG_SCHEMA["properties"].keys()
        for key in data.keys():
            if key not in allowed_properties:
                return 400, {"error": f"Unexpected property '{key}' is not allowed"}

        # Check required fields
        for req in self.CONFIG_SCHEMA["required"]:
            if req not in data:
                return 400, {"error": f"Missing required property: {req}"}

        # Validate types and values
        model_name = data["model_name"]
        if not isinstance(model_name, str) or len(model_name) < 3 or len(model_name) > 64:
            return 400, {"error": "Invalid type or bounds for 'model_name'"}

        replica_count = data["replica_count"]
        # Intentionally vulnerable or strict? Let's make it strict.
        if not isinstance(replica_count, int) or isinstance(replica_count, bool):
            return 400, {"error": "Invalid type for 'replica_count'. Must be an integer."}
        if replica_count < 1 or replica_count > 10:
            return 400, {"error": "Out of bounds error for 'replica_count'. Value must be between 1 and 10."}

        environment = data["environment"]
        if environment not in self.CONFIG_SCHEMA["properties"]["environment"]["enum"]:
            return 400, {"error": "Invalid enumeration value for 'environment'"}

        if "enable_debug_logging" in data:
            if not isinstance(data["enable_debug_logging"], bool):
                return 400, {"error": "Invalid type for 'enable_debug_logging'. Must be boolean."}

        # Success case
        return 200, {"status": "Provisioning successful", "model": model_name, "replicas": replica_count}


# ============================================================================
# PART 2: The Security Boundary Fuzzer Engine
# ============================================================================

class SchemaBoundaryFuzzer:
    """Systematically mutates base payloads to audit API input boundaries."""

    def __init__(self, base_payload: Dict[str, Any]):
        self.base_payload = base_payload

    def generate_fuzz_mutations(self) -> Generator[Tuple[str, str], None, None]:
        """
        Generates structurally corrupted or edge-case payloads based on the input schema.
        Yields:
            Tuple of (mutation_description, serialized_json_payload)
        """
        # Mutation 1: Pass raw malformed JSON structure
        yield "Malformed JSON Syntax", "{\"model_name\": 'unquoted_values'"

        # Mutation 2: Type Mutation (Pass integer as string)
        mutated = self.base_payload.copy()
        mutated["replica_count"] = "5" # Expected: integer
        yield "Type Mutation (Int as String)", json.dumps(mutated)

        # Mutation 3: Type Mutation (Pass integer as Boolean)
        mutated = self.base_payload.copy()
        mutated["replica_count"] = True # Booleans inherit from Int in Python, common bypass!
        yield "Type Mutation (Int as Boolean)", json.dumps(mutated)

        # Mutation 4: Boundary Overflow (replica_count exceeding maximum)
        mutated = self.base_payload.copy()
        mutated["replica_count"] = 99
        yield "Boundary Overflow (Int above max)", json.dumps(mutated)

        # Mutation 5: Boundary Underflow (replica_count below minimum)
        mutated = self.base_payload.copy()
        mutated["replica_count"] = 0
        yield "Boundary Underflow (Int below min)", json.dumps(mutated)

        # Mutation 6: Length Constraint Overflow (model_name > 64 chars)
        mutated = self.base_payload.copy()
        mutated["model_name"] = "A" * 70
        yield "Length Constraint Overflow (String > max)", json.dumps(mutated)

        # Mutation 7: Length Constraint Underflow (model_name < 3 chars)
        mutated = self.base_payload.copy()
        mutated["model_name"] = "LL"
        yield "Length Constraint Underflow (String < min)", json.dumps(mutated)

        # Mutation 8: Invalid Enum Enumeration
        mutated = self.base_payload.copy()
        mutated["environment"] = "local_developer"
        yield "Invalid Enum Enumeration Value", json.dumps(mutated)

        # Mutation 9: Unexpected Property Injection
        mutated = self.base_payload.copy()
        mutated["malicious_sql_injection"] = "UNION SELECT * FROM users"
        yield "Unexpected Property Injection", json.dumps(mutated)

        # Mutation 10: Missing Required Key Omission
        mutated = self.base_payload.copy()
        del mutated["model_name"]
        yield "Missing Required Field Omission", json.dumps(mutated)


# ============================================================================
# PART 3: Unit Validation and Automated Test Harness
# ============================================================================

class TestSecurityAPI:
    """Orchestrates automated security test runs validating both APIs and LLM Mocks."""

    def __init__(self):
        self.api = DeploymentValidationAPI()
        self.valid_payload = {
            "model_name": "llama3-70b-instruct",
            "replica_count": 3,
            "environment": "production",
            "enable_debug_logging": False
        }

    def execute_api_fuzz_tests(self) -> int:
        """Runs the complete fuzzing matrix against the API. Returns failed assertion count."""
        fuzzer = SchemaBoundaryFuzzer(self.valid_payload)
        failed_checks = 0

        logger.info("Starting JSON Schema Boundary Fuzzing Campaign...")
        for desc, payload in fuzzer.generate_fuzz_mutations():
            status, response = self.api.process_deployment_request(payload)
            
            # Assertive Validation: The API must reject (400 Client Error) all mutated payloads
            if status != 400:
                logger.error(f"Fuzz test failure: {desc} bypassed validation! HTTP Status: {status}. Response: {response}")
                failed_checks += 1
            else:
                logger.info(f"Fuzz test pass: {desc} was successfully rejected with HTTP 400. Reason: {response.get('error')}")

        return failed_checks

    def verify_rate_limiting(self) -> bool:
        """Verifies that the API enforces rate limits under spike loads."""
        logger.info("Validating API Rate Limiting protection...")
        limit_api = DeploymentValidationAPI()
        limit_api.max_requests_per_window = 5 # Set threshold low for testing
        
        payload_str = json.dumps(self.valid_payload)
        
        # Fire 6 consecutive requests in parallel/sequence
        for i in range(1, 7):
            status, response = limit_api.process_deployment_request(payload_str)
            if i <= 5:
                if status != 200:
                    logger.error(f"Rate limiting pre-check failed: Request {i} failed unexpectedly with Status {status}")
                    return False
            else:
                # 6th request must trigger a 429
                if status == 429:
                    logger.info("Rate limit verified successfully. HTTP 429 triggered with backoff metrics.")
                    return True
                else:
                    logger.error(f"Rate limiting failure! 6th request bypassed limit thresholds. HTTP Status: {status}")
                    return False
        return False


# --- Mocking Demonstration Section ---
class LLMAgentOrchestrationService:
    """Interacts with external API targets to query structural decisions."""
    
    @staticmethod
    def get_secure_model_guidance(prompt: str) -> Dict[str, Any]:
        """Interacts with OpenAI APIs. Must be mocked during automated runs."""
        import openai # Simulated or standard import
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}]
        )
        return json.loads(response.choices[0].message.content)


def test_llm_mocking_integration():
    """Validates secure agent handling of intercepted, mocked model responses."""
    logger.info("Executing mock validation of non-deterministic LLM endpoint...")
    
    # We patch the entire 'openai.ChatCompletion.create' dependency
    with patch("openai.ChatCompletion.create") as mock_openai_call:
        # Create a mock object that mimics OpenAI's response structure
        mock_response = MagicMock()
        mock_choice = MagicMock()
        mock_message = MagicMock()
        
        # Inject deterministic JSON payload
        mock_message.content = '{"model_name": "phi-3", "replica_count": 2, "environment": "staging"}'
        mock_choice.message = mock_message
        mock_response.choices = [mock_choice]
        
        mock_openai_call.return_value = mock_response

        # Execute our orchestration using the mocked boundary
        agent_output = LLMAgentOrchestrationService.get_secure_model_guidance("Provision a small developer model")
        
        assert agent_output["model_name"] == "phi-3"
        assert agent_output["replica_count"] == 2
        logger.info("Success: Non-deterministic LLM response successfully mocked and validated.")


# --- Verification & Main Entry Point ---
if __name__ == "__main__":
    logger.info("Initializing API and Fuzz Test validation suite...")

    suite = TestSecurityAPI()
    
    # Execute Fuzz Matrix
    failures = suite.execute_api_fuzz_tests()
    
    # Execute Rate Limit Validation
    rate_limit_ok = suite.verify_rate_limiting()

    # Execute Mock Verification
    test_llm_mocking_integration()

    # Final summary check
    if failures == 0 and rate_limit_ok:
        logger.info("Final Report: All security validations PASSED.")
        sys.exit(0)
    else:
        logger.error(f"Final Report: Security boundary validation FAILED. Fuzz Failures: {failures}, Rate limit verified: {rate_limit_ok}")
        sys.exit(1)
```
