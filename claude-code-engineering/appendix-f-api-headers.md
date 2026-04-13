# Appendix F: API Beta Headers Reference

## 17 Active Beta Headers

Every request Claude Code sends to the Anthropic Messages API includes a set of beta headers that unlock capabilities beyond the base API contract. These headers are not optional decorations -- without them, features like prompt caching, extended thinking, and streaming tool use silently degrade or fail entirely. The API returns a `400` if you send a beta header it does not recognize, so the client maintains a versioned registry of which headers are valid for which API versions.

As discussed in Chapter 10 (API client construction) and Chapter 14 (streaming), these headers are assembled dynamically based on the active feature flags, the selected model, and the request parameters. A request using extended thinking on Claude Opus 4 with prompt caching sends a different header set than a simple Haiku completion with no caching.

This appendix documents all 17 beta headers active in the current build.

---

### Header Reference

| # | Header Name | Value | Purpose | When Sent | Added |
|---|-------------|-------|---------|-----------|-------|
| 1 | `anthropic-beta` | `prompt-caching-2024-07-31` | Enables prompt caching. Allows `cache_control` breakpoints in messages so repeated system prompts, rules, and skill instructions are cached server-side. Reduces latency by 80%+ on cache hits and costs by 90% on cached tokens. | Every request when `PROMPT_CACHING` flag is on | v0.2.0 |
| 2 | `anthropic-beta` | `extended-thinking-2025-01-24` | Enables extended thinking (chain-of-thought budget). The model can use a thinking budget before producing its response, improving quality on complex reasoning tasks. Required for `thinking` parameter. | When `thinking.budget_tokens > 0` in request | v0.8.0 |
| 3 | `anthropic-beta` | `interleaved-thinking-2025-05-14` | Allows thinking blocks between tool results, not just at turn start. Without this, the model can only think once before its first tool call. With it, the model re-reasons after each tool result. | When `INTERLEAVED_THINKING` flag is on and thinking is enabled | v1.1.0 |
| 4 | `anthropic-beta` | `tool-use-2024-04-04` | Base tool use capability. Enables the `tools` parameter with input schema definitions. Without this header, tool definitions in the request are ignored. | Every request that includes tool definitions | v0.1.0 |
| 5 | `anthropic-beta` | `streaming-tool-use-2024-10-15` | Enables streaming of tool use input deltas. Without this, tool calls arrive as a single complete block after the model finishes generating the input. With it, partial tool input streams token-by-token. | Every streaming request with tools | v0.5.0 |
| 6 | `anthropic-beta` | `computer-use-2025-01-24` | Enables computer use tools (screenshot, mouse, keyboard). Unlocks the `computer_20241022` tool type in the API. Requires explicit opt-in due to safety implications. | When `COMPUTER_USE_TOOL` flag is on | v0.9.0 |
| 7 | `anthropic-beta` | `model-routing-2025-02-19` | Enables server-side model routing. The client sends a routing hint (e.g., `balanced`, `quality`, `speed`) and the API selects the optimal model variant. Used by the auto-routing classifier. | When `MODEL_ROUTING` flag is on and auto-routing is active | v0.10.0 |
| 8 | `anthropic-beta` | `output-budget-2025-03-01` | Enables the `max_tokens_output` parameter, which sets a hard ceiling on output tokens independent of the model's default max. Used to prevent runaway generation on expensive models. | When skill or agent config specifies `maxOutputTokens` | v1.0.0 |
| 9 | `anthropic-beta` | `token-counting-2025-02-10` | Enables the token counting endpoint for pre-flight token estimation. The client sends a partial request and receives an exact token count without running inference. Used by the context visualizer. | When `/ctx-viz` runs or auto-compaction estimates usage | v0.11.0 |
| 10 | `anthropic-beta` | `message-batches-2024-09-24` | Enables the Message Batches API for asynchronous bulk processing. Used by `/batch` to submit multiple independent requests in parallel at reduced cost. | When `/batch` command dispatches parallel work | v0.7.0 |
| 11 | `anthropic-beta` | `citations-2025-04-15` | Enables source citations in model responses. The model returns structured citation objects pointing to specific spans in the input context. Used for research and documentation workflows. | When skill config sets `citations: true` | v1.2.0 |
| 12 | `anthropic-beta` | `files-2025-03-19` | Enables file uploads as content blocks. PDF, image, and text files can be sent as typed file blocks rather than base64-encoded text. Enables native PDF understanding. | When the request includes file attachments or PDF content | v1.0.0 |
| 13 | `anthropic-beta` | `multi-turn-tool-use-2025-04-01` | Optimizes multi-turn conversations with tool use. Enables server-side caching of tool result processing and reduces overhead on long agentic loops. | Every multi-turn conversation with tool use | v1.1.0 |
| 14 | `anthropic-beta` | `token-efficient-tools-2025-02-19` | Reduces token overhead of tool definitions. The API uses a compressed tool schema representation that saves ~40% tokens on the tool definition block. Significant for 50+ tool registrations. | Every request when tool count exceeds 10 | v1.0.0 |
| 15 | `anthropic-beta` | `metadata-2025-01-15` | Enables the `metadata` parameter for attaching structured metadata to requests. Used for cost attribution (user ID, project, session) and audit logging. | Every request when `AUDIT_LOG` or `USAGE_TRACKING` is on | v0.9.0 |
| 16 | `anthropic-beta` | `system-prompt-caching-2025-03-05` | Extends prompt caching specifically for system prompts. Allows caching the system prompt separately from conversation messages, enabling cross-conversation cache hits for identical configurations. | Every request when system prompt exceeds 1,000 tokens | v1.0.0 |
| 17 | `anthropic-beta` | `pdfs-2024-09-25` | Enables native PDF document support as a content type. PDFs are processed server-side with layout-aware extraction rather than requiring client-side text extraction. | When request includes PDF content blocks | v0.7.0 |

---

### How Headers Are Assembled

The API client constructs the header set at request time, not at initialization. This matters because a single session may send requests with different header combinations depending on the operation:

```typescript
function buildBetaHeaders(request: MessageRequest): string[] {
  const headers: string[] = [];
  
  // Always-on headers (when their flag is active)
  if (feature('PROMPT_CACHING'))   headers.push('prompt-caching-2024-07-31');
  if (feature('STREAMING_TOOL_USE')) headers.push('streaming-tool-use-2024-10-15');
  
  // Conditional headers (based on request content)
  if (request.thinking?.budget_tokens > 0) {
    headers.push('extended-thinking-2025-01-24');
    if (feature('INTERLEAVED_THINKING')) {
      headers.push('interleaved-thinking-2025-05-14');
    }
  }
  
  if (request.tools?.length > 0) {
    headers.push('tool-use-2024-04-04');
    if (request.tools.length > 10) {
      headers.push('token-efficient-tools-2025-02-19');
    }
  }
  
  // ... remaining conditional logic
  
  return headers;
}
```

The final `anthropic-beta` header is sent as a comma-separated string:

```
anthropic-beta: prompt-caching-2024-07-31,extended-thinking-2025-01-24,tool-use-2024-04-04,streaming-tool-use-2024-10-15
```

### Version Pinning

Each beta header includes a date suffix (e.g., `2025-01-24`) that pins the behavior to a specific API version. When Anthropic releases a new version of a beta feature, the old header continues to work for a deprecation period (typically 6 months). The client updates to the new header version in a subsequent release.

### Header Validation

The client maintains a `KNOWN_BETA_HEADERS` set. Before sending, it validates that every assembled header exists in this set. This prevents typos from producing `400` errors in production. The set is updated as part of the release process when new API capabilities are adopted.

### Debugging Headers

With `DEBUG_LOGGING` enabled, every outbound request logs its complete header set:

```
[api] POST /v1/messages
[api] anthropic-beta: prompt-caching-2024-07-31,extended-thinking-2025-01-24,...
[api] anthropic-version: 2023-06-01
[api] content-type: application/json
[api] x-request-id: req_01H9...
```

This is invaluable when diagnosing why a feature is not working -- often the answer is that the required beta header was not sent because a feature flag was off or a request parameter was missing.
