---
name: c3-config-framework
description: |
  C3 AI Configuration Framework. Define and use configuration types (Config with Singleton, Nameable/Identifiable, or UserSingleton), read/write/clear config and secret values, and apply override levels.
core: true
category: platform
version: 8.9.0
minimumVersion: 8.7.0
---

# C3 AI Config Framework

Define and use configuration in the C3 AI Platform: type definitions, lookup patterns, override hierarchy, secrets vs non-secrets, and read/write APIs. Use this skill to implement or troubleshoot config.

## When to Use This Skill

- Defining a new config type (`.c3typ` mixing `Config`) or choosing keying (Singleton, Nameable/Identifiable, or UserSingleton)
- Reading or writing config/secret values in `.py` or `.js`
- Setting or clearing values at a specific override (APP, ENV, CLUSTER, ROOT, USER)
- Using nested config (ConfigChild) or seeded config from package metadata
- Debugging: value not reflected, wrong instance, permission errors, or secret not updating

---

## 1. Type Definitions (.c3typ)

### Config and keying

Config is the base for all configuration. Mix **Config** with **one** of **Singleton**, **Named**, **Identifiable**, or **UserSingleton** to determine how instances are keyed. Do **not** mix two of these on the same type (e.g. both Named and Identifiable).

- **Singleton** — one instance per context (app/env). Config key is the type name.
- **UserSingleton** — one instance per user per context. Only that user can see or edit it.
- **Identifiable** — keyed by `id`. Use when one config per entity (e.g. per App, per Server). Types usually mix **Identified** to get **forId**.
- **Nameable** — keyed by `name`. Use when one config per name (e.g. per datastore name). Types usually mix **Named** to get **forName**.

The platform also provides duck types (e.g. ConfigSingleton, ConfigIdentifiable, ConfigNamed). Other patterns (e.g. per-subtype config, custom keying); see C3 docs or `search_c3_documentation` for those.

```c3typ
// Singleton: one instance per context (app/env)
type MyAppConfig mixes Config, Singleton {
  baseUrl: string = "https://api.example.com"
  timeout: int = 30
  @config(secret=true)
  apiKey: string
}

// Nameable: mixin provides name and forName; add your own fields
type ExampleNamedConfig mixes Config, Named {
  endpoint: string
  @config(secret=true)
  token: string
}

// Identifiable: mixin provides id and forId; add your own fields
type ExampleIdentifiableConfig mixes Config, Identifiable {
  displayName: string
}
```

### Secret fields

Mark secret fields with `@config(secret=true)`. Use **only** secret read/write APIs for those fields; non-secret write APIs do not write secret paths.

### `@config` annotation options

Beyond `secret=true`, these options are commonly used:

- `minOverride` / `maxOverride` — constrain where a field/type can be written (for example, ENV+ only).
- `doNotDefaultIfMissing` — return missing/null behavior instead of synthesized defaults.
- `folder` / `subFolder` — customize seed/config folder layout.

### Nested config (ConfigChild)

Child types must mix `ConfigChild<ParentConfigType>`. Access by path: `parentField.childProp`.

```c3typ
type ParentConfig mixes Config, Singleton {
  child1: ChildConfig1
  child2: ChildConfig2
}
type ChildConfig1 mixes ConfigChild<ParentConfig> {
  value: string
}
```

---

## 2. Lookup: Getting the config instance

Use the lookup that matches how the config is keyed. Using the wrong one returns the wrong instance or fails.

- **Types mixing `Configurable<C>`** — Prefer the owning object's accessor (`obj.config()`) and then call config APIs on that result.
- **Singleton / UserSingleton** — Use `inst()` (e.g. `MyConfig.inst()` in JS, `c3.MyConfig.inst()` in Python). Config key is the type name or per-user.
- **Keyed by id** — The type mixes **Identifiable** (and usually **Identified**, which declares **forId**). Use `forId(id)` to get the instance (e.g. `MyConfig.forId(id)` in JS, `c3.MyConfig.forId(id)` in Python).
- **Keyed by name** — The type mixes **Nameable** (and usually **Named**, which declares **forName**). Use `forName(name)` to get the instance (e.g. `MyConfig.forName(name)` in JS, `c3.MyConfig.forName(name)` in Python).

Obtain the instance, then call configValue, setConfigValue, secretValue, setSecretValue, clearConfigValue, clearSecretValue on it. Do not use inst() when the config is keyed by id or name; do not use forId/forName for Singleton or UserSingleton.

---

## 3. Override hierarchy

Merged order (least → most specific): **ROOT** → **CLUSTER** → **ENV** → **APP** → **USER**. A value at a more specific level overrides the same path at a less specific level.

When calling set/clear APIs that take an **override** parameter, pass the level (e.g. `ConfigOverride.APP`, `ConfigOverride.ENV`). Permissions: APP = app-level write; ENV = Env Admin; CLUSTER = Cluster Admin.

### Seed defaults and `_.json`

Seeded config provides baseline defaults before runtime overrides. Common seed layout:

- `<pkg>/config/<ConfigFolder>/<configKey>.json`
- `<pkg>/config/<ConfigFolder>/_.json` as shared base

Keyed files merge on top of `_.json` where present.

---

## 4. Reading values

- **Non-secret:** call `configValue(path)` or `configValue(path, true)` to require the value (fail if missing).
- **Secret:** call `secretValue(path)` or `secretValue(path, true)` on the config instance.

Obtain the config instance first via inst(), forId(id), or forName(name), then call these on it.

### JavaScript

```javascript
var config = MyAppConfig.inst();
var url = config.configValue('baseUrl');
var key = config.secretValue('apiKey');

var conn = ExampleNamedConfig.forName('my-connector');
var ep = conn.configValue('endpoint');
```

### Python

```python
config = c3.MyAppConfig.inst()
url = config.configValue('baseUrl')
key = config.secretValue('apiKey')

conn = c3.ExampleNamedConfig.forName('my-connector')
ep = conn.configValue('endpoint')
```

---

## 5. Writing values

When the API accepts an **override** parameter, pass it so the write goes to the intended level.

- **Non-secret:** use the set APIs that take path, value, and override (e.g. setConfigValue). Single-path updates are preferred; whole-object replace can wipe other keys.
- **Secret:** use **only** secret set APIs (e.g. setSecretValue) for fields marked `@config(secret=true)`. Non-secret set APIs do not write secret fields.

### Clear by path

- `clearConfigValue(path, override)` for non-secret at that path.
- `clearSecretValue(path, override)` for secret at that path.

Clearing an entire override level (all keys at one level) is a platform-level operation. Use path-level clear for application code. If a specific type or privileged action exposes a clear-level API, use it per its documentation.

---

## 6. API quick reference

| Operation                         | Non-secret (path)                                                                                | Secret (path)                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------- |
| Read                              | `configValue(path, failIfMissing)`                                                               | `secretValue(path, failIfMissing)`      |
| Set                               | `setConfigValue(path, value, override, embeddedFileName)`                                        | `setSecretValue(path, value, override)` |
| Clear (path)                      | `clearConfigValue(path, override)`                                                               | `clearSecretValue(path, override)`      |
| Batch set                         | `setConfigValues(from, override)`                                                                | `setSecretValues(from, override)`       |
| Clear (all overrides, privileged) | `clearConfigValueAllOverrides(path)`                                                             | `clearSecretValueAllOverrides(path)`    |
| Inspect overrides                 | `allConfigValueOverrides(path)`, `allConfigOverrides()`, `isApp/Env/Cluster/Root/UserOverride()` | n/a                                     |

Override enum: `ConfigOverride.ROOT`, `ConfigOverride.CLUSTER`, `ConfigOverride.ENV`, `ConfigOverride.APP`, `ConfigOverride.USER`.

---

## 7. Best practices

- Use **one** keying mixin per Config type (Singleton, UserSingleton, or Identifiable/Nameable via Identified or Named).
- Use the **correct lookup**: inst() for Singleton/UserSingleton; forId(id) for Identifiable (forId is on Identified); forName(name) for Nameable (forName is on Named).
- When a set/clear API accepts an **override** parameter, pass the intended level.
- For **secret fields**: use only secret read/write APIs; never use non-secret write for secret paths.
- Prefer **single-path** (or bounded) updates; use whole-object replace only when intentionally replacing the full blob.
- For types that mix Configurable, config is often accessed via the object's config accessor (e.g. obj.config()); see the type's documentation.
- Keep seed defaults in package config and use `_.json` for shared base defaults when multiple keys need the same baseline.
- Use advanced collection/map/inspection APIs only when simpler path-level APIs cannot express the update safely.

---

## 8. Console snippets

Use these in the C3 console (JavaScript) or in Python for quick checks and updates.

### JavaScript (C3 Console)

```javascript
// Read Singleton config
var config = MyAppConfig.inst();
config.configValue('baseUrl');
config.secretValue('apiKey');

// Set non-secret at APP
MyAppConfig.inst().setConfigValue('timeout', 60, ConfigOverride.APP);

// Set secret at APP
MyAppConfig.inst().setSecretValue('apiKey', 'new-key', ConfigOverride.APP);

// Named config
var conn = ExampleNamedConfig.forName('my-name');
conn.configValue('endpoint');

// Clear one path at APP
MyAppConfig.inst().clearConfigValue('timeout', ConfigOverride.APP);
```

### Python

```python
# Read Singleton config
config = c3.MyAppConfig.inst()
config.configValue('baseUrl')
config.secretValue('apiKey')

# Set non-secret at APP
c3.MyAppConfig.inst().setConfigValue('timeout', 60, c3.ConfigOverride.APP)

# Set secret at APP
c3.MyAppConfig.inst().setSecretValue('apiKey', 'new-key', c3.ConfigOverride.APP)

# Named config
conn = c3.ExampleNamedConfig.forName('my-name')
conn.configValue('endpoint')

# Clear one path at APP
c3.MyAppConfig.inst().clearConfigValue('timeout', c3.ConfigOverride.APP)
```

---

## 9. Common pitfalls and fixes

| Problem                                        | Cause                                                            | Fix                                                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Value not reflected after set                  | More specific override already set, or stale cache in multi-node | Check override levels (e.g. loadConfigOverride); in multi-node use cache broadcast and App.emptyAllCaches() |
| Secret not updating                            | Using non-secret write API for secret field                      | Use setSecretValue / secret APIs only for secret fields                                                     |
| Wrong or null instance (Nameable/Identifiable) | Wrong lookup or wrong key                                        | Use forName(name) or forId(id) with exact key; do not use inst() for Nameable/Identifiable keying           |
| Cannot set at ENV or CLUSTER                   | Insufficient permissions                                         | Use Env Admin for ENV, Cluster Admin for CLUSTER; or set at APP                                             |
| Seeded config not showing                      | Override takes precedence or wrong package/path                  | Check repo/package/config/folder/key; check each override level                                             |

---

## 10. What Is Allowed

- Mixing **Config** with one of: Singleton, UserSingleton, or Identifiable/Nameable (e.g. via Identified or Named, depending on how you want instances keyed).
- **Nested config** when each child type mixes **ConfigChild** parameterized with the parent config type. The parent config type then has fields whose types are these child types; access is by path (e.g. `childField.childProp`).
- **Seeded config** in package metadata. The path is repo, package, then config, then a folder (default is the config type name, overridable via annotation), then a config key. For Singleton the config key is the type name; for Identifiable it is the id; for Nameable it is the name. A reserved key `_` is used as a base that is merged with the specific config key when both exist. File content is treated as a JSON template with variable binding.
- **Restricting override levels** with annotations: you can set a minimum and maximum override level (e.g. forbid USER, or cap at ENV) so that values cannot be set outside that range.
- When a set or clear API accepts an **override** parameter, passing it so the write or clear applies to the intended level. Use the APIs intended for secrets for any field marked as secret.

---

## 11. What Is Not Allowed

- **Mixing two keying mixins** on the same Config type (e.g. both Named and Identified, or Singleton and Named). Use one of Singleton, UserSingleton, or Identifiable/Nameable (typically via Identified or Named) per type.
- Using **non-secret write APIs** to set a secret field. Secret fields must be written with the APIs intended for secrets; the framework ignores non-secret writes for secret paths.
- Using **inst()** for Identifiable or Nameable config — use **forId(id)** for Identifiable (forId is on Identified) and **forName(name)** for Nameable (forName is on Named). Using forId or forName for Singleton or UserSingleton is also wrong.
- Using **whole-object replace** APIs when you only mean to update a single field — this can wipe other keys at that override level. Prefer single-path updates.

---

## 12. Common Patterns (in words)

**Singleton config with defaults and a secret.** Define a type that mixes Config and Singleton. Give non-secret fields default values if you want seed-like behavior; mark secret fields with the secret annotation. There is one instance per context. Override values at APP, ENV, or CLUSTER at runtime. Always use the secret read/write APIs for the secret fields; never use non-secret write APIs for them.

**Nested config with ConfigChild.** Define a parent config type (e.g. Singleton) with fields whose types are other config types. Each of those child types must mix ConfigChild parameterized with the parent type. You then read and write nested values by path (e.g. the path for a child's property is `parentField.childProp`). The framework only accepts as nested config types that mix ConfigChild with the correct parent.

**Reading and setting values.** Obtain the config instance using the appropriate lookup (inst(), forId(id), or forName(name) depending on how the config is keyed), then use the read, set, and clear APIs on that instance. When a set or clear API accepts an override parameter, pass the intended level. For secret fields use only the APIs intended for secrets.

---

## 13. Best Practices Checklist

- [ ] One keying mixin per Config type when using Singleton, Nameable/Identifiable, or UserSingleton; do not mix two.
- [ ] Prefer single-path (or bounded) updates when changing one or a few fields; avoid whole-object replace unless you intend to replace the full blob.
- [ ] When a set or clear API accepts an override parameter, pass the intended level.
- [ ] Mark secrets with the secret annotation and use only the APIs intended for secrets for those fields.
- [ ] Use the lookup that matches how the config is keyed: inst() for Singleton and UserSingleton; forId(id) for Identifiable; forName(name) for Nameable.

---

## 14. More context

- **C3 MCP:** Use `search_c3_documentation` for config framework related c3types and apis.
- **Related skills:** the `c3-backend-code` skill (backend types and patterns), the `c3-crud` skill (CRUD and record patterns).
- **C3 docs:** [Config Framework](https://docs.c3.ai/docs/platform/latest/topic/config-framework), [FAQ Config](https://docs.c3.ai/docs/platform/latest/topic/faq-config), [User Singleton](https://docs.c3.ai/docs/platform/latest/topic/security-user-singleton)
