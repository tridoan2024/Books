# Appendix B: All Hook Events (27 Events)

This appendix catalogs every lifecycle event that can trigger hooks, the data each event receives, and whether hooks can block the operation.

---

## Hook Event Summary

| # | Event | When It Fires | Can Block? | Data Available |
|---|-------|---------------|-----------|----------------|
| 1 | **SessionStart** | Session begins | No | session_id, cwd, model |
| 2 | **SessionStop** | Session ends | No | session_id, duration, turns |
| 3 | **UserPromptSubmit** | User sends a message | Yes | user_message, turn_number |
| 4 | **PreToolUse** | Before any tool executes | **Yes** | tool_name, tool_input |
| 5 | **PostToolUse** | After tool succeeds | No | tool_name, tool_input, tool_output |
| 6 | **PreApiCall** | Before API request sent | Yes | model, messages, tools |
| 7 | **PostApiCall** | After API response received | No | model, status, tokens, duration |
| 8 | **PreCompaction** | Before context compression | Yes | reason, current_tokens, target |
| 9 | **PostCompaction** | After context compressed | No | removed_tokens, remaining_tokens |
| 10 | **PrePermissionCheck** | Before permission evaluated | No | tool_name, tool_input |
| 11 | **PostPermissionCheck** | After permission decided | No | tool_name, decision, rule |
| 12 | **Notification** | Alert/notification raised | No | title, message, severity |
| 13 | **Stop** | Agent finishes response | Yes | response, tool_calls, tokens |
| 14 | **SubagentStart** | Subagent spawned | No | agent_type, prompt, model |
| 15 | **SubagentStop** | Subagent completes | Yes | agent_type, result, duration |
| 16 | **FileChanged** | File system change detected | No | file_path, change_type |
| 17 | **TaskCompleted** | Background task finishes | No | task_id, task_type, result |
| 18 | **ErrorOccurred** | Error during execution | No | error_type, message, context |
| 19 | **RateLimited** | API returns 429 | No | retry_after, limit_type |
| 20 | **ContextWarning** | Context usage > threshold | No | usage_pct, total_tokens |
| 21 | **ModelSwitch** | Model changed mid-session | No | from_model, to_model, reason |
| 22 | **McpConnect** | MCP server connected | No | server_name, transport |
| 23 | **McpDisconnect** | MCP server disconnected | No | server_name, reason |
| 24 | **MemoryAccess** | Memory file read/written | No | memory_file, access_type |
| 25 | **HookError** | A hook itself failed | No | hook_command, exit_code, stderr |
| 26 | **WorktreeCreate** | Git worktree created | No | worktree_path, branch |
| 27 | **WorktreeRemove** | Git worktree removed | No | worktree_path, had_changes |

---

## Hook Types

| Type | Description | Configuration |
|------|-------------|---------------|
| **command** | Shell command executed | `{ "type": "command", "command": "./script.sh" }` |
| **http** | HTTP webhook called | `{ "type": "http", "url": "https://..." }` |
| **prompt** | Injects text into agent context | `{ "type": "prompt", "content": "..." }` |
| **agent** | Spawns a subagent | `{ "type": "agent", "prompt": "..." }` |
| **callback** | Internal function call | `{ "type": "callback", "handler": "funcName" }` |

---

## Exit Code Protocol

| Exit Code | Meaning | Behavior |
|-----------|---------|----------|
| **0** | Allow / Success | Operation proceeds normally |
| **2** | Block / Deny | Operation is blocked; stderr message shown to agent |
| **Other** | Non-blocking error | Logged as warning, operation continues |

---

## Hook Configuration Format

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/check-bash.sh",
            "timeout": 5000,
            "statusMessage": "Checking command safety..."
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/auto-lint.sh",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

---

## Event Data Schemas

### PreToolUse / PostToolUse

```json
{
  "tool_name": "Bash",
  "tool_input": {
    "command": "git status",
    "timeout": 30000
  },
  "session_id": "abc-123",
  "turn_number": 5
}
```

PostToolUse adds:
```json
{
  "tool_output": "On branch main\nnothing to commit",
  "duration_ms": 234,
  "exit_code": 0
}
```

### SessionStart

```json
{
  "session_id": "abc-123",
  "cwd": "/Users/user/project",
  "model": "claude-sonnet-4-6",
  "permission_mode": "default",
  "git_branch": "main"
}
```

### Notification

```json
{
  "title": "Task Complete",
  "message": "Background agent finished writing chapter-25.md",
  "severity": "info",
  "source": "agent"
}
```

---

## Advanced Hook Features

### updatedInput — Modify Tool Arguments

A `PreToolUse` hook can return modified arguments:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "updatedInput": {
      "command": "git status --porcelain"
    }
  }
}
```

### updatedMCPToolOutput — Modify Tool Results

A `PostToolUse` hook can transform MCP tool output:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "updatedMCPToolOutput": "filtered and sanitized output"
  }
}
```

### initialUserMessage — Auto-Submit on Session Start

A `SessionStart` hook can inject an initial prompt:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "initialUserMessage": "Review the latest changes on this branch"
  }
}
```

### watchPaths — File Watcher Registration

```json
{
  "hookSpecificOutput": {
    "watchPaths": ["src/**/*.ts", "tests/**/*.test.ts"]
  }
}
```

### Conditional Execution

```json
{
  "matcher": "Bash",
  "if": "Bash(git *)",
  "hooks": [{ "type": "command", "command": "./check-git.sh" }]
}
```

### Once-Only Hooks

```json
{
  "once": true,
  "hooks": [{ "type": "command", "command": "./setup-once.sh" }]
}
```

---

## Hook Sources (Priority Order)

| Priority | Source | Scope |
|----------|--------|-------|
| 1 (highest) | Policy (MDM/enterprise) | Organization-wide |
| 2 | Managed settings | Remote-managed |
| 3 | User settings | `~/.claude/settings.json` |
| 4 | Project settings | `.claude/settings.json` |
| 5 | Local settings | `.claude/settings.local.json` |
| 6 | Plugin hooks | Installed plugins |
| 7 (lowest) | Built-in defaults | Hardcoded |

Hooks from all sources are merged per event. Within the same source, hooks execute in declaration order. A higher-priority source's block decision overrides a lower-priority source's allow.
