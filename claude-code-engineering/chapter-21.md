# Chapter 21: The Configuration System

Every complex application eventually faces the same question: how do you let users, teams, and organizations each have a say in how the tool behaves — without those layers conflicting in unpredictable ways? Claude Code's configuration system answers this with a multi-layered architecture spanning seven priority tiers, a schema-driven validation engine, enterprise policy enforcement with cryptographic verification, and a feature flag registry managing 55+ runtime gates. At roughly 6,652 lines across six core files, it is one of the most carefully designed subsystems in the entire codebase — because configuration errors are among the hardest bugs to diagnose.

In this chapter, we'll build a configuration system capable of handling everything from a solo developer's personal preferences to an enterprise organization's locked-down security policies. We'll see how merge semantics differ by field type, why two separate settings systems coexist, and how to implement hot-reload without race conditions.

---

## 21.1 Architecture Overview

The configuration system is split into three distinct layers, each serving a different audience and use case:

```
          Org Policy (managed.rs)         ← HMAC-signed, locked fields
              │
              ▼
    Deep Settings (deep_settings.rs)      ← Schema, migration, watch, diff
              │
              ▼
    Project Settings (settings/mod.rs)    ← Permissions, hooks, env, merge
              │
              ▼
    Layered Config (config/layered.rs)    ← 5-layer precedence via Figment
              │
              ▼
    CLI Config (config/mod.rs)            ← Unified final config + source tracking
              │
              ▼
    Feature Flags (feature_flags.rs)      ← Runtime feature gates
```

Each layer has a well-defined responsibility. Project settings handle the JSON files that teams commit to repositories. Deep settings add schema validation, version migration, and change detection. Managed settings enforce organization-level policies that individual users cannot override. Layered config provides the final resolution using a priority cascade. And feature flags gate experimental or progressive-rollout functionality at runtime.

### The Seven-Tier Priority Cascade

When the same setting appears at multiple levels, the resolution order determines which value wins:

| Priority | Source | Example Path |
|----------|--------|-------------|
| 1 (highest) | Org Policy (managed) | Remote endpoint, HMAC-verified |
| 2 | Environment variables (`CLAUDE_*`) | `CLAUDE_MODEL=opus` |
| 3 | Local settings (gitignored) | `.claude/settings.local.json` |
| 4 | Project settings (shared) | `.claude/settings.json` |
| 5 | User global settings | `~/.config/claude/settings.json` |
| 6 | Legacy TOML config | `~/.config/claude/config.toml` |
| 7 (lowest) | Built-in defaults | Hardcoded in source |

This ordering follows a principle you'll encounter in many production systems: **specificity wins**. An organization's security policy overrides everything because it represents compliance requirements. Environment variables come next because they represent the current execution context. Local settings beat project settings because personal preferences shouldn't require modifying shared files. And built-in defaults are the fallback of last resort.

---

## 21.2 Project-Level Settings

The foundation of the configuration system is the project settings file — the JSON that teams commit to their repository.

### The Settings Data Model

```typescript
interface ProjectSettings {
  permissions: ProjectPermissions;
  hooks: Record<string, HookConfig[]>;
  env: Record<string, string>;
  contextTokens?: number;
  model?: string;
  effortLevel?: string;
  mcpServers: McpServerEntry[];
  toolConfig: Record<string, unknown>;
  features: Record<string, boolean>;
}

interface ProjectPermissions {
  allow: string[];  // e.g., ["Bash(git diff *)", "Read(**)"]
  deny: string[];   // e.g., ["Read(./.env)", "Bash(rm -rf *)"]
}

interface HookConfig {
  type: string;        // "command" | "script" | "function"
  command: string;
  timeout: number;     // default: 5000ms
  matcher?: string;    // tool-name filter, e.g., "Bash"
}

interface McpServerEntry {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;    // default: true
}
```

Every field uses a default value, ensuring partial JSON files deserialize without error. This is a critical design decision: a settings file with just `{ "model": "opus" }` is perfectly valid. Missing keys get their type's default (empty array, empty object, `undefined` for optionals).

### Known Constants and Forward Compatibility

```typescript
const KNOWN_MODELS = [
  "sonnet", "opus", "haiku",
  "claude-3-opus", "claude-3-sonnet", "claude-3-haiku",
  "claude-3.5-sonnet", "claude-3.5-haiku",
  "claude-4-sonnet", "claude-4-opus",
  "gpt-4", "gpt-4o", "gpt-4o-mini", "gpt-4-turbo",
];

const KNOWN_HOOK_EVENTS = [
  "PreToolUse", "PostToolUse", "SessionStart", "SessionEnd",
  "Setup", "PreToolUseFailure", "PostToolUseFailure",
  "PermissionRequest", "PermissionDenied",
];
```

Unknown values generate warnings, not errors. This preserves forward compatibility — if a newer version of the tool introduces a new hook event, older versions don't reject the settings file. They simply warn and continue. This is the same principle HTTP uses with unknown headers: ignore what you don't understand.

### Effort Level Aliases

The effort level configuration accepts multiple aliases for developer convenience:

| Input | Maps to |
|-------|---------|
| `"low"`, `"lo"`, `"min"` | Low |
| `"medium"`, `"med"`, `"mid"`, `"default"` | Medium |
| `"high"`, `"hi"`, `"max"` | High |

Case-insensitive matching via `toLowerCase()`. This is a small touch, but it matters: developers shouldn't need to look up the exact string when `"hi"` clearly means high effort.

### The Two-File Strategy

Settings are loaded from two files:

```typescript
function loadProjectSettings(projectRoot: string): ProjectSettings {
  const settingsPath = path.join(projectRoot, ".claude", "settings.json");
  const localPath = path.join(projectRoot, ".claude", "settings.local.json");

  // Load shared settings (committed to git)
  let settings = fs.existsSync(settingsPath)
    ? parseOrDefault(settingsPath)
    : defaultSettings();

  // Merge local overrides (gitignored)
  if (fs.existsSync(localPath)) {
    const local = parseOrDefault(localPath);
    settings = mergeLocal(settings, local);
  }

  return settings;
}
```

The shared file (`.claude/settings.json`) captures team conventions. The local file (`.claude/settings.local.json`) captures personal preferences. The local file is `.gitignore`d so developers can have permissive settings locally without affecting the team.

---

## 21.3 The Merge System

Merge semantics vary by field type — and getting this wrong creates the subtlest configuration bugs imaginable.

### Local Merge (Local Overrides Shared)

```typescript
function mergeLocal(base: ProjectSettings, local: ProjectSettings): ProjectSettings {
  return {
    permissions: {
      // Permissions: EXTENDED (local appended to shared)
      allow: [...base.permissions.allow, ...local.permissions.allow],
      deny: [...base.permissions.deny, ...local.permissions.deny],
    },
    // Hooks: REPLACED per event key
    hooks: { ...base.hooks, ...local.hooks },
    // Env: EXTENDED (local wins on key collision)
    env: { ...base.env, ...local.env },
    // Scalars: overridden only when local has a value
    model: local.model ?? base.model,
    effortLevel: local.effortLevel ?? base.effortLevel,
    contextTokens: local.contextTokens ?? base.contextTokens,
    // Collections: additive merge
    mcpServers: [...base.mcpServers, ...local.mcpServers],
    toolConfig: { ...base.toolConfig, ...local.toolConfig },
    features: { ...base.features, ...local.features },
  };
}
```

The merge strategies per field type:

| Field Type | Strategy | Rationale |
|-----------|----------|-----------|
| `permissions.allow/deny` | Extend (append) | Local can add permissions but never remove shared ones |
| `hooks` | Replace per event key | A local hook completely replaces the shared hook for that event |
| `env` | Extend (local wins on collision) | Local environment overrides team defaults |
| Scalar `Option<T>` | Override only when present | Missing local values don't clear shared settings |
| `mcpServers` | Append (no dedup) | Local can add servers; removing requires editing shared file |
| `toolConfig`, `features` | Extend (local wins) | Local feature overrides team defaults |

### User Merge (User Settings Are Lower Priority)

When merging user-global settings into project settings, the direction reverses:

```typescript
function mergeFromUser(project: ProjectSettings, user: UserSettings): ProjectSettings {
  // User permissions are PREPENDED (lower priority)
  const combinedAllow = [...user.permissions.allow, ...project.permissions.allow];
  const combinedDeny = [...user.permissions.deny, ...project.permissions.deny];

  // User env fills gaps — project wins on collision
  const env = { ...user.env, ...project.env };

  // Scalar: project wins
  const model = project.model ?? user.model;
  const effortLevel = project.effortLevel ?? user.effortLevel;

  return { ...project, permissions: { allow: combinedAllow, deny: combinedDeny }, env, model, effortLevel };
}
```

The key insight is **prepending** user permissions rather than appending them. Since the permission system evaluates deny rules first in array order (as discussed in Chapter 15), project-level deny rules need to appear after user-level ones to take evaluation priority. By prepending user permissions, project rules always win during the deny-first scan.

---

## 21.4 Permission Checking in Settings

The permission check function is called on every tool invocation — it's the hottest path in the entire configuration system.

```typescript
function checkPermission(
  settings: ProjectSettings,
  toolName: string,
  inputSummary: string
): boolean | undefined {
  const callStr = `${toolName}(${inputSummary})`;

  // Deny takes priority
  for (const pattern of settings.permissions.deny) {
    if (globMatch(pattern, callStr)) return false;
  }

  // Then allow
  for (const pattern of settings.permissions.allow) {
    if (globMatch(pattern, callStr)) return true;
  }

  // No match — fall through to default logic
  return undefined;
}
```

Three-valued return: `true` means allow, `false` means deny, `undefined` means no rule matched. The caller (typically the permission system from Chapter 15) decides the default behavior when no rule matches — usually "ask the user."

### The Custom Glob Matcher

Permission patterns aren't file paths — they're tool call signatures like `Bash(git diff *)`. The standard `glob` library expects filesystem paths with separators. So the configuration system implements its own 64-line recursive-descent glob matcher:

```typescript
function globMatch(pattern: string, text: string): boolean {
  let pi = 0;  // pattern index
  let ti = 0;  // text index
  let starPi = -1;   // position after last *
  let starTi = -1;   // text position when * was hit
  let dstarPi = -1;  // position after last **
  let dstarTi = -1;  // text position when ** was hit

  while (ti < text.length) {
    if (pi < pattern.length - 1 
        && pattern[pi] === '*' && pattern[pi + 1] === '*') {
      // ** matches zero or more chars INCLUDING /
      dstarPi = pi + 2;
      dstarTi = ti;
      pi += 2;
    } else if (pi < pattern.length && pattern[pi] === '*') {
      // * matches zero or more chars EXCEPT /
      starPi = pi + 1;
      starTi = ti;
      pi++;
    } else if (pi < pattern.length 
               && (pattern[pi] === text[ti] || pattern[pi] === '?')) {
      // Exact match or ? wildcard
      pi++;
      ti++;
    } else if (starPi !== -1 && text[ti] !== '/') {
      // Backtrack to * (cannot cross /)
      pi = starPi;
      ti = ++starTi;
    } else if (dstarPi !== -1) {
      // Backtrack to ** (crosses anything)
      pi = dstarPi;
      ti = ++dstarTi;
    } else {
      return false;
    }
  }

  // Consume trailing wildcards
  while (pi < pattern.length && pattern[pi] === '*') pi++;
  return pi === pattern.length;
}
```

The wildcard semantics:

| Pattern | Matches | Example |
|---------|---------|---------|
| `*` | Zero or more chars except `/` | `Bash(git *)` matches `Bash(git diff)` but not `Bash(git log/foo)` |
| `**` | Zero or more chars including `/` | `Read(**)` matches `Read(src/foo/bar.ts)` |
| `?` | Exactly one character | `Read(?.ts)` matches `Read(a.ts)` but not `Read(ab.ts)` |

This avoids a crate dependency for a performance-critical path. Permission checking happens on every single tool call — potentially dozens per conversation turn.

---

## 21.5 Settings Validation

The validation system performs 12 checks across 5 categories, all non-blocking:

```typescript
function validateSettings(settings: ProjectSettings): SettingsWarning[] {
  const warnings: SettingsWarning[] = [];

  // Permission validation
  for (const pattern of [...settings.permissions.allow, ...settings.permissions.deny]) {
    if (pattern.trim() === '') {
      warnings.push({ code: 'empty_pattern', message: 'Empty permission pattern' });
    }
    if ((pattern.match(/\(/g) || []).length !== (pattern.match(/\)/g) || []).length) {
      warnings.push({ code: 'unbalanced_parens', pattern });
    }
  }

  // Model validation
  if (settings.model && !KNOWN_MODELS.includes(settings.model)) {
    warnings.push({ code: 'unknown_model', model: settings.model });
  }

  // Effort level validation
  if (settings.effortLevel) {
    try { parseEffortLevel(settings.effortLevel); }
    catch { warnings.push({ code: 'invalid_effort_level', value: settings.effortLevel }); }
  }

  // Context token validation
  if (settings.contextTokens !== undefined) {
    if (settings.contextTokens === 0) warnings.push({ code: 'zero_context_tokens' });
    if (settings.contextTokens > 2_000_000) warnings.push({ code: 'excessive_context_tokens' });
  }

  // Hook validation
  for (const [event, hooks] of Object.entries(settings.hooks)) {
    if (!KNOWN_HOOK_EVENTS.includes(event)) {
      warnings.push({ code: 'unknown_hook_event', event });
    }
    for (const hook of hooks) {
      if (!hook.command) warnings.push({ code: 'empty_hook_command', event });
      if (hook.timeout === 0) warnings.push({ code: 'zero_hook_timeout', event });
      if (!['command', 'script', 'function'].includes(hook.type)) {
        warnings.push({ code: 'unknown_hook_type', type: hook.type });
      }
    }
  }

  // MCP validation
  for (const server of settings.mcpServers) {
    if (!server.name) warnings.push({ code: 'empty_mcp_server_name' });
    if (!server.command) warnings.push({ code: 'empty_mcp_server_command' });
  }

  return warnings;
}
```

Validation is deliberately non-blocking. All issues are warnings, not errors. The application continues with potentially problematic settings because a partially correct configuration is vastly better than a tool that refuses to start. Consider the developer experience: you're in the middle of debugging a production incident and your CLI tool won't launch because someone added an extra comma to settings.json. That's unacceptable.

---

## 21.6 The Deep Settings Engine

Above the basic JSON settings sits a more sophisticated engine that adds schema-driven validation, version migration, conflict resolution, and file watching.

### Schema Definition

Every setting is defined by a schema entry with 11 fields:

```typescript
interface FieldSchema {
  key: string;                    // Dot-notation path: "model.default_model"
  section: SettingsSection;       // One of 8 sections
  fieldType: FieldType;           // String | Integer | Float | Boolean | StringArray | Object | Enum
  defaultValue: unknown;
  description: string;
  minValue?: number;
  maxValue?: number;
  required: boolean;
  deprecated: boolean;
  deprecatedMessage?: string;
  sinceVersion: number;           // Which settings version introduced this field
}

type FieldType =
  | { type: 'string' }
  | { type: 'integer' }
  | { type: 'float' }
  | { type: 'boolean' }
  | { type: 'stringArray' }
  | { type: 'object' }
  | { type: 'enum'; values: string[] };

type SettingsSection =
  | 'model' | 'permissions' | 'appearance' | 'keybindings'
  | 'plugins' | 'mcp' | 'tools' | 'behavior';
```

The schema registry defines 39+ fields across all 8 sections. Here's a representative sample:

**Model section (7 fields):**

| Key | Type | Default | Range |
|-----|------|---------|-------|
| `model.default_model` | String | `"sonnet"` | — |
| `model.max_tokens` | Integer | 200,000 | 1–1,000,000 |
| `model.temperature` | Float | 0.7 | 0.0–2.0 |
| `model.top_p` | Float | 0.95 | 0.0–1.0 |
| `model.reasoning_effort` | Enum(low/medium/high) | `"high"` | — |
| `model.stream` | Boolean | `true` | — |
| `model.fallback_models` | StringArray | `["haiku"]` | — |

**Behavior section (7 fields):**

| Key | Type | Default | Range |
|-----|------|---------|-------|
| `behavior.auto_commit` | Boolean | `false` | — |
| `behavior.auto_lint` | Boolean | `true` | — |
| `behavior.auto_test` | Boolean | `false` | — |
| `behavior.dream_enabled` | Boolean | `false` | — |
| `behavior.context_window_strategy` | Enum(truncate/summarize/sliding) | `"summarize"` | — |
| `behavior.max_turns` | Integer | 100 | 1–10,000 |
| `behavior.verbose_logging` | Boolean | `false` | — |

### Dot-Notation Access

Settings are accessed and mutated through dot-notation paths, with auto-creation of intermediate objects:

```typescript
class Settings {
  version: number;
  source?: string;
  data: Record<string, unknown>;
  loadedAt: Date;

  get(key: string): unknown | undefined {
    const parts = key.split('.');
    if (parts.length === 1) return this.data[key];

    let current: unknown = this.data[parts[0]];
    for (const part of parts.slice(1)) {
      if (current === undefined || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  set(key: string, value: unknown): void {
    const parts = key.split('.');
    let current = this.data;
    for (const part of parts.slice(0, -1)) {
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
  }
}
```

The `set()` method auto-creates intermediate objects. Setting `"model.fallback.primary"` creates `{ "model": { "fallback": { "primary": value } } }` even if neither `model` nor `fallback` previously existed. This eliminates an entire class of "undefined is not an object" errors when deeply nested settings are modified.

### Version Migration

Settings files carry a version number. When the tool loads a file with an older version, it runs a migration pipeline:

```typescript
const CURRENT_SETTINGS_VERSION = 3;

function migrateSettings(settings: Settings, fromVersion: number): void {
  if (fromVersion >= CURRENT_SETTINGS_VERSION) return;
  let version = fromVersion;

  // v1 → v2: Rename ai.model → model.default_model; add MCP defaults
  if (version === 1) {
    const oldModel = settings.remove('ai.model');
    if (oldModel !== undefined) {
      settings.set('model.default_model', oldModel);
    }
    if (settings.get('mcp.auto_connect') === undefined) {
      settings.set('mcp.auto_connect', true);
    }
    version = 2;
  }

  // v2 → v3: Rename behavior.auto_dream → behavior.dream_enabled
  if (version === 2) {
    const oldDream = settings.remove('behavior.auto_dream');
    if (oldDream !== undefined) {
      settings.set('behavior.dream_enabled', oldDream);
    }
    version = 3;
  }

  settings.version = CURRENT_SETTINGS_VERSION;
}
```

Migrations are idempotent: `remove()` returns `undefined` if the old key doesn't exist, and `set()` only fires when `get()` returns `undefined`. Running the migration pipeline twice produces the same result as running it once.

### Conflict Resolution

When merging settings from multiple sources, conflicts are resolved by strategy:

```typescript
type ConflictStrategy = 'lastWriteWins' | 'firstWriteWins' | 'error';

function resolveConflicts(
  base: Settings,
  overlay: Settings,
  strategy: ConflictStrategy = 'lastWriteWins'
): Settings {
  const merged = base.clone();

  for (const [key, newVal] of overlay.flatten()) {
    const existing = base.get(key);
    if (existing !== undefined && existing !== newVal) {
      switch (strategy) {
        case 'lastWriteWins':
          merged.set(key, newVal);
          break;
        case 'firstWriteWins':
          // Keep existing
          break;
        case 'error':
          throw new MergeConflictError(key);
      }
    } else {
      merged.set(key, newVal);
    }
  }

  return merged;
}
```

The default strategy is `lastWriteWins`, meaning later files in the cascade override earlier ones. This matches developer intuition: the more specific setting wins.

### File Watching and Hot-Reload

The settings engine watches for file changes and notifies consumers:

```typescript
function watchSettingsFile(
  filePath: string,
  callback: (event: SettingsChanged) => void
): void {
  const DEBOUNCE_MS = 500;
  let debounceTimer: NodeJS.Timer | null = null;
  let lastContent = fs.readFileSync(filePath, 'utf-8');

  fs.watch(filePath, () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const newContent = fs.readFileSync(filePath, 'utf-8');
      if (newContent === lastContent) return;

      const oldSettings = parseSettings(lastContent);
      const newSettings = parseSettings(newContent);
      const changedKeys = diffSettings(oldSettings, newSettings);

      lastContent = newContent;
      callback({
        path: filePath,
        changedKeys: changedKeys.map(d => d.key),
        timestamp: new Date(),
      });
    }, DEBOUNCE_MS);
  });
}
```

Changes are debounced at 500ms to prevent rapid re-reads. When a change is detected, the old and new contents are diffed, and a `SettingsChanged` event with the specific changed keys is emitted. Consumers can then selectively react — for example, a model change triggers reconnection, while a theme change triggers a re-render, but neither needs to restart the full application.

---

## 21.7 Enterprise Policy Enforcement

For organizations deploying Claude Code across teams, the managed settings engine provides cryptographically verified policies that individual developers cannot override.

### The Policy Data Model

```typescript
interface ManagedPolicy {
  orgId: string;
  policyVersion: string;
  lockedFields: string[];              // Fields users cannot change
  requiredFields: string[];            // Fields that must have values
  modelAllowlist: string[];            // Only these models can be used
  featureFlags: Record<string, boolean>;
  maxTokenBudget: number;              // Default: 1,000,000
  signature: string;                   // HMAC-SHA256 hex digest
  schema?: SettingsSchema;             // Optional custom schema
  fetchedAt: Date;
}

const POLICY_CACHE_FILENAME = 'managed_policy.json';
const POLICY_MAX_AGE_SECS = 86_400;   // 24 hours
const DEFAULT_MAX_TOKEN_BUDGET = 1_000_000;
```

### Override Priority

```typescript
enum OverrideSource {
  OrgPolicy = 0,       // Highest priority
  TeamPolicy = 1,
  ProjectConfig = 2,
  UserPreference = 3,  // Lowest priority
}
```

### Policy Enforcement

The managed settings engine provides 12 methods that form a complete policy lifecycle:

**Locked field enforcement:**

```typescript
function checkLocked(policy: ManagedPolicy, field: string): void {
  // Check explicit locked_fields list
  if (policy.lockedFields.includes(field)) {
    throw new OverrideNotAllowedError(field);
  }
  // Check schema-level locked flag
  if (policy.schema) {
    const fieldSchema = policy.schema.getField(field);
    if (fieldSchema?.locked) {
      throw new OverrideNotAllowedError(field);
    }
  }
}
```

**Model allowlist enforcement:**

```typescript
function enforceModelAllowlist(
  policy: ManagedPolicy,
  settings: Settings
): void {
  if (policy.modelAllowlist.length === 0) return;

  const currentModel = settings.get('model.default_model') as string;
  if (currentModel && !policy.modelAllowlist.includes(currentModel)) {
    // Force the first allowed model
    settings.set('model.default_model', policy.modelAllowlist[0]);
  }
}
```

**Override application with priority sorting:**

```typescript
interface SettingsOverride {
  field: string;
  value: unknown;
  source: OverrideSource;
}

function applyOverrides(
  policy: ManagedPolicy,
  base: Settings,
  overrides: SettingsOverride[]
): SettingsWarning[] {
  const warnings: SettingsWarning[] = [];

  // Sort by priority (org first, user last)
  const sorted = [...overrides].sort((a, b) => a.source - b.source);

  for (const override of sorted) {
    // Only org policy can set locked fields
    if (override.source !== OverrideSource.OrgPolicy) {
      try {
        checkLocked(policy, override.field);
      } catch (e) {
        warnings.push({ type: 'locked_override_rejected', field: override.field });
        continue;
      }
    }
    base.set(override.field, override.value);
  }

  return warnings;
}
```

### Cryptographic Verification

Policies are signed with HMAC-SHA256 to prevent tampering:

```typescript
function verifyPolicySignature(
  policy: ManagedPolicy,
  signingKey: Buffer
): void {
  // Build canonical payload (strips signature and fetchedAt)
  const canonical = buildCanonicalPayload(policy);

  const mac = createHmac('sha256', signingKey);
  mac.update(canonical);
  const expectedHex = mac.digest('hex');

  if (expectedHex !== policy.signature) {
    throw new SignatureInvalidError(expectedHex, policy.signature);
  }
}

function buildCanonicalPayload(policy: ManagedPolicy): string {
  // Remove transport-dependent fields before signing
  const { signature, fetchedAt, ...rest } = policy;
  // Deterministic JSON serialization (sorted keys)
  return JSON.stringify(rest, Object.keys(rest).sort());
}
```

HMAC-SHA256 was chosen over RSA/ECDSA because both the policy server and the client installation share the same key (provisioned during organization enrollment). This avoids the complexity of distributing and rotating public keys. The canonical payload strips `signature` and `fetchedAt` because these are transport metadata — the signature shouldn't depend on when the policy was fetched.

### Policy Caching and Expiry

Policies are cached locally with a 24-hour TTL:

```typescript
async function loadPolicy(
  orgId: string,
  cacheDir: string
): Promise<ManagedPolicy> {
  const cachePath = path.join(cacheDir, POLICY_CACHE_FILENAME);

  // Try cache first
  if (fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    const ageSecs = (Date.now() - new Date(cached.fetchedAt).getTime()) / 1000;

    if (ageSecs <= POLICY_MAX_AGE_SECS) {
      return cached;
    }
    // Cache expired — fetch fresh
  }

  // Fetch from endpoint
  const response = await fetch(`${POLICY_ENDPOINT}/${orgId}`);
  const policy: ManagedPolicy = await response.json();

  // Cache for next time
  fs.writeFileSync(cachePath, JSON.stringify(policy));
  return policy;
}
```

### Compliance Reporting

The managed engine can generate compliance reports showing how user settings align with organizational policy:

```typescript
interface ComplianceReport {
  orgId: string;
  policyVersion: string;
  generatedAt: Date;
  totalFields: number;
  compliant: number;
  nonCompliant: number;
  missing: number;
  entries: ComplianceEntry[];
}

interface ComplianceEntry {
  field: string;
  status: 'compliant' | 'non_compliant' | 'missing' | 'overridden';
  expectedValue?: unknown;
  actualValue?: unknown;
}
```

This is invaluable for enterprise security teams doing audits — they can verify that every developer's installation meets policy requirements without accessing individual machines.

---

## 21.8 The Feature Flag System

The feature flag registry manages 55+ runtime gates across 15 categories, enabling progressive rollout and A/B testing.

### Gate Types

```typescript
type FlagGate =
  | { type: 'alwaysOn' }
  | { type: 'alwaysOff' }
  | { type: 'envVar'; variable: string }
  | { type: 'userType'; expected: string }
  | { type: 'percentage'; threshold: number }
  | { type: 'custom'; predicate: () => boolean };
```

Six gate types cover every rollout scenario:

- **AlwaysOn/AlwaysOff**: Feature is universally enabled or disabled
- **EnvVar**: Enabled when a specific environment variable is non-empty
- **UserType**: Enabled for specific user categories (e.g., "internal", "beta")
- **Percentage**: Probabilistic rollout (e.g., 50% of users)
- **Custom**: Arbitrary runtime predicate via closure

### Evaluation Precedence

```typescript
class FeatureFlagRegistry {
  private flags: Map<string, FeatureFlag>;
  private overrides: Map<string, boolean>;
  private userType?: string;

  feature(name: string): boolean {
    // 1. Runtime override (highest priority)
    const override = this.overrides.get(name);
    if (override !== undefined) return override;

    // 2. Gate evaluation
    const flag = this.flags.get(name);
    if (!flag) {
      console.warn(`Unknown feature flag queried: ${name}`);
      return false;
    }

    const gateResult = this.evaluateGate(flag.gate, this.userType);

    // For AlwaysOn/AlwaysOff, use gate result directly
    if (flag.gate.type === 'alwaysOn' || flag.gate.type === 'alwaysOff') {
      return gateResult;
    }

    // For other gates: gate OR default (default=true means on unless gate disables)
    return gateResult || flag.defaultValue;
  }
}
```

The evaluation order is: **override > gate > default**. For `AlwaysOn`/`AlwaysOff`, the gate result is authoritative. For other gates, the gate result is OR'd with the default value — meaning a flag with `defaultValue: true` stays on unless the gate explicitly returns false. Unknown flags return false with a warning, following the principle of least surprise for disabled-by-default behavior.

### Environment-Based Flag Overrides

Developers can override flags via the `CLAUDE_FLAGS` environment variable:

```typescript
function loadFlagsFromEnv(): Map<string, boolean> {
  const raw = process.env.CLAUDE_FLAGS ?? '';
  const overrides = new Map<string, boolean>();

  for (const token of raw.split(',').filter(Boolean)) {
    if (token.startsWith('!')) {
      overrides.set(token.slice(1), false);  // !flag disables
    } else {
      overrides.set(token, true);             // flag enables
    }
  }

  return overrides;
}

// Usage: CLAUDE_FLAGS="voice_mode,!telemetry,experimental_search"
```

The `!` prefix disables a flag. This provides a quick escape hatch for debugging without modifying settings files.

### Flag Categories

55+ flags organized into 15 categories:

| Category | Count | Notable Flags |
|----------|-------|--------------|
| Core Agent Modes | 7 | `kairos`=ON, `daemon`=OFF, `coordinator_mode`=OFF, `voice_mode`=OFF |
| Planning & Execution | 3 | `ultraplan`=ON, `fork_subagent`=OFF |
| Proactive Features | 4 | `auto_dream`=ON, `auto_memory`=ON, `skill_improvement`=ON |
| Search & Retrieval | 3 | `treesitter_indexing`=ON, `vector_search`=OFF |
| UI & Display | 5 | `tui_mode`=ON, `syntax_highlighting`=ON, `diff_preview`=ON |
| Security | 3 | `permission_system`=ON, `sandbox_mode`=OFF, `secret_scanning`=ON |
| LLM & Inference | 4 | `prompt_cache`=ON, `streaming`=ON, `local_model`=OFF |
| Integrations | 4 | `git_integration`=ON, `mcp_support`=ON |
| Experimental | 4 | `a_b_test_new_planner`=50% (percentage rollout) |
| Memory & Knowledge | 4 | `memory_indexing`=ON, `knowledge_graph`=ON |
| Agent Capabilities | 4 | `agent_reflection`=ON, `agent_delegation`=OFF |

### Global Singleton

The registry is accessed through a thread-safe global singleton:

```typescript
const globalRegistry = new FeatureFlagRegistry();

// Initialize with default flags on first import
globalRegistry.registerDefaults();
globalRegistry.loadFromEnv();

// Convenience functions
export function feature(name: string): boolean {
  return globalRegistry.feature(name);
}

export function setFlag(name: string, value: boolean): void {
  globalRegistry.setOverride(name, value);
}
```

The `LazyLock` pattern (or equivalent in TypeScript, a module-level singleton) ensures the registry is initialized exactly once across the entire application, regardless of import order.

---

## 21.9 The Layered Config Engine

Alongside project settings, a second configuration system provides multi-format support with a five-layer priority cascade. This system uses the Figment pattern — a layered configuration combinator that merges values from multiple providers.

### The Unified Config

```typescript
interface LayeredConfig {
  model?: string;
  apiBaseUrl?: string;
  token?: string;
  maxOutputTokens: number;          // default: 16,384
  thinkingBudget: number;           // default: 10,000
  contextWindowTokens: number;      // default: 180,000
  effortLevel?: string;
  autoCompact: boolean;
  attribution?: AttributionConfig;
  logging: LoggingConfig;
  mcp: McpConfig;
  models: ModelConfig;
  context: ContextConfig;
  permissions: PermissionConfig;
}

interface ContextConfig {
  windowSize: number;               // default: 180,000
  compactionThreshold: number;      // default: 0.8
  compactionKeepTail: number;       // default: 4 turns
}

interface PermissionConfig {
  mode?: string;                    // "allow-all" | "default" | "deny-all"
  allowedTools: string[];
  deniedTools: string[];
  bashAllowPatterns: string[];
  bashDenyPatterns: string[];
}
```

The five layers merge in priority order:

```typescript
function buildLayeredConfig(projectRoot: string): LayeredConfig {
  const providers = [
    // Layer 5: Built-in defaults (lowest)
    defaultConfig(),
    // Layer 4: User config (~/.config/claude/config.toml)
    loadUserConfig(),
    // Layer 3: Project config (.claude/config.toml)
    loadProjectConfig(projectRoot),
    // Layer 2: Local config (.claude/config.local.toml, gitignored)
    loadLocalConfig(projectRoot),
    // Layer 1: Environment variables (highest)
    loadEnvConfig(),
  ];

  return mergeProviders(providers);
}
```

Each provider returns a partial config. The merge function overlays them in order, with later providers winning on conflict. Environment variables use a `CLAUDE_` prefix and underscore-separated paths: `CLAUDE_MODEL=opus`, `CLAUDE_MAX_OUTPUT_TOKENS=32768`.

### Settings Diff

The diff engine compares two settings instances using flattened key-value pairs:

```typescript
interface SettingsDiff {
  key: string;
  type: 'added' | 'removed' | 'modified';
  oldValue?: unknown;
  newValue?: unknown;
}

function diffSettings(a: Settings, b: Settings): SettingsDiff[] {
  const flatA = new Map(a.flatten());
  const flatB = new Map(b.flatten());
  const diffs: SettingsDiff[] = [];

  // Keys in B but not A → Added
  for (const [key, val] of flatB) {
    if (!flatA.has(key)) {
      diffs.push({ key, type: 'added', newValue: val });
    }
  }

  // Keys in A but not B → Removed
  for (const [key, val] of flatA) {
    if (!flatB.has(key)) {
      diffs.push({ key, type: 'removed', oldValue: val });
    }
  }

  // Keys in both with different values → Modified
  for (const [key, newVal] of flatB) {
    const oldVal = flatA.get(key);
    if (oldVal !== undefined && JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diffs.push({ key, type: 'modified', oldValue: oldVal, newValue: newVal });
    }
  }

  return diffs.sort((a, b) => a.key.localeCompare(b.key));
}
```

This powers the hot-reload mechanism: when a settings file changes, only the specific changed keys are emitted, allowing consumers to react precisely rather than reloading everything.

---

## 21.10 Cross-Module Integration

The configuration system touches every major subsystem:

| Consumer | Configuration Source |
|----------|---------------------|
| Permission system (Ch. 15) | `ProjectSettings.permissions` + glob matcher |
| Hook execution (Ch. 18-19) | `ProjectSettings.hooks` + HookConfig |
| Model selection (Ch. 5) | LayeredConfig.models + ProjectSettings.model + feature flags |
| Skill loading (Ch. 20) | Feature flag `skill_improvement` gates auto-improvement |
| Sub-agent spawning (Ch. 13) | Feature flag `fork_subagent` |
| Context compaction (Ch. 6) | ContextConfig.compaction_threshold + window_size |
| MCP server startup (Ch. 15) | McpServerEntry from both settings and layered config |
| Compliance reporting | ManagedSettingsEngine + org policy |

---

## 21.11 Architecture Decisions

### Why Two Separate Settings Systems?

The project settings (simple JSON) and layered config (multi-format) coexist for historical and practical reasons:

1. **History**: The project started with JSON settings; TOML/YAML support was added later for richer configuration
2. **Different audiences**: JSON settings are for per-project overrides (committed to git); the layered config is for user preferences (personal)
3. **Different merge semantics**: JSON uses custom merge logic with field-type-specific strategies; the layered config uses a standard priority cascade

Merging them would require either dropping one format or implementing a complex adapter layer — neither simplifies the system.

### Why Custom Glob Matching?

The 64-line glob matcher avoids the `glob` library because permission patterns aren't file paths. `Bash(git diff *)` isn't a path — it's a tool call signature. The standard glob library assumes path separators and directory structure. The custom matcher correctly handles `*` vs `**` semantics for both path-style and command-style patterns while running in the hot path of every tool invocation.

### Why HMAC-SHA256 for Policy Signing?

- **RSA/ECDSA** would require distributing public keys to every installation and implementing key rotation
- **JWTs** add overhead for what is essentially a single signed JSON blob
- **No signing** would allow local modification of org policies, defeating the purpose

HMAC is symmetric — both the policy server and the installation share the same key, provisioned during organization enrollment. The tradeoff is that the shared key means any installation can forge policies for the same org, but the threat model assumes installations are trusted (they run on developer machines that already have access to source code).

---

## 21.12 Key Takeaways

1. **Layer by specificity**: The seven-tier cascade ensures that the most specific configuration always wins — org policy at the top, built-in defaults at the bottom.

2. **Merge semantics must vary by field type**: Permissions are extended (appended), hooks are replaced per event, scalars are overridden only when present. Getting merge semantics wrong creates the subtlest configuration bugs.

3. **Validation should be non-blocking**: Warnings, not errors. A partially correct configuration that lets the tool start is infinitely better than a tool that refuses to launch during a production incident.

4. **Migration must be idempotent**: Running the migration pipeline twice produces the same result as running it once. Use remove-then-set patterns that gracefully handle missing keys.

5. **Hot-reload needs debouncing**: File watchers fire multiple events for a single save. Debounce at 500ms and diff the before/after to emit meaningful change events.

6. **Enterprise policy needs cryptographic verification**: HMAC-SHA256 with a shared key prevents local tampering while avoiding the complexity of public-key infrastructure.

7. **Feature flags enable progressive rollout**: The six gate types (always on/off, env var, user type, percentage, custom predicate) cover every rollout scenario from hard-coded to A/B testing.

8. **Unknown values should warn, not error**: Forward compatibility means older versions of the tool must accept settings they don't recognize. The HTTP model — ignore what you don't understand — applies to configuration files too.

In the next chapter, we'll explore the command system that provides 70+ slash commands, each routing through the configuration system to determine available functionality and behavior.
