# C3 AI Data Sharing

The C3 AI Platform shares data across applications and environments within the same cluster using `Db.Domain`. By default, each app's data is isolated. `Db.Domain` lets you create a logical grouping of types whose data is owned by one application and consumed by others.

## Clarifying Questions

Before setting up data sharing, gather the following information from the user:

1. **Producer app**: Which app will produce/own the data?
2. **Consumer app**: Which app(s) will consume the shared data?
3. **Types to share**: Should all entity types in the package be shared, or only specific types? Ask the user to name them.
4. **Domain name**: What should the domain be called? (Often matches the producer package name)
5. **Same environment?**: Are both apps in the same environment, or cross-environment?
6. **Local JVM execution?**: Will `callAppInLocalJvm` be used? If yes, confirm the consumer app has `allowOtherAppsPkgsLocally` enabled in its config. Without this, the target app's packages will not be loadable by the consumer and operations on the domain will fail. Note: `callAppInLocalJvm` supports same-environment and cross-environment sharing within the same cluster; cross-cluster sharing is not supported.

Use these answers to populate the configuration files in the steps below. Do NOT attempt to discover types programmatically—ask the user directly.

## Quick Reference

| Operation             | Runtime Command                                                             | File-Based                                                                                                          |
| --------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Define a domain       | `Db.Domain.make({name: "<domain>"}).upsert()`                               | `<pkg>/metadata/Db.Domain/<name>.json`                                                                              |
| Assign type to domain | N/A (file-based only)                                                       | `@db(domain='<domain>')` on type, or `"dbDomain"` in `c3pkg.json`. See file path at `<Type>.meta().declaredPkgPath` |
| Create role           | `Role.make({id: "<id>", roleInherits: [...], permissions: [...]}).upsert()` | `<pkg>/metadata/Role/<name>.json`                                                                                   |
| Configure consumer    | `Db.Domain.Config.make({name: "<domain>", app: "<app>"}).setConfig()`       | `<pkg>/config/Db.Domain.Config/<name>.json`                                                                         |
| Grant access          | `C3.app().allowAccess("<consumer_app_id>", [roles])`                        | N/A (runtime only)                                                                                                  |
| Local JVM execution   | Use `<Db.Domain.Config>.setConfigValue("callAppInLocalJvm", true)`          | Add `"callAppInLocalJvm": true` to config JSON                                                                      |
| Enable pkg loading    | Set `allowOtherAppsPkgsLocally: true` on consumer app config                | Required for `callAppInLocalJvm` in multi-node environments                                                         |

## Core Types

### Db.Domain

Metadata type defining a named logical data domain. Mixes `Metadata`, `Named`, and `Configurable<Db.Domain.Config>`.

```c3typ
type Db.Domain mixes Metadata, Named, Configurable<Db.Domain.Config> {
  name: !~
}
```

Retrieved via `Db.Domain.forName('<domain>')`.

### Db.Domain.Config

Configuration for consumer apps referencing a domain. Mixes `ConfigNamed` (which mixes `Config` and `Named`).

```c3typ
type Db.Domain.Config mixes ConfigNamed {
  name: !~
  datastores: map<string enum Datastore.Kind, string>
  app: string serialized AppId
  @beta
  callAppInLocalJvm: boolean
}
```

| Field               | Type                          | Description                                                                     |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| `name`              | `!string`                     | Domain name (must match `Db.Domain` metadata)                                   |
| `datastores`        | `map<Datastore.Kind, string>` | Optional datastore mapping (kind `SQL` is supported; `KV` is not yet supported) |
| `app`               | `string serialized AppId`     | App hosting the domain. Same-env: app name. Cross-env: `<cluster>-<env>-<app>`  |
| `callAppInLocalJvm` | `boolean`                     | Beta. Execute calls locally instead of remoting (avoids network latency)        |

## Setup Guide

After gathering the clarifying questions, offer to run the steps automatically in the app using runtime commands, or create the configuration files for deployment.

### Step 1: Define the Domain (Producer App)

**Option A: Run in producer app** (immediate, no deploy required):

```javascript
Db.Domain.make({ name: '<domain-name>' }).upsert();
```

**Option B: Create file** `<producer-pkg>/metadata/Db.Domain/<domain-name>.json`:

```json
{
  "name": "<domain-name>"
}
```

### Step 2: Annotate Types with the Domain

**Option A: Annotate specific types** — Add `@db(domain='<domain-name>')` to each entity type you want to share.

Get the file path for a type:

```javascript
<TypeName>.meta().declaredPkgPath
```

Then edit the `.c3typ` file to add the annotation:

```c3typ
@db(domain='<domain-name>')
entity type <TypeName> {
  // fields...
}
```

**Option B: Annotate entire package** — Set the domain for all entity types in `c3pkg.json`:

```json
{
  "name": "<package-name>",
  "version": "1.0.0",
  "dbDomain": "<domain-name>"
}
```

When `dbDomain` is set at the package level, all entity types in that package belong to the domain without needing `@db(domain='...')` on each type.

> **Note**: Step 2 requires file changes and a redeploy. There is no runtime-only option for annotating types.

### Step 3: Create a Read-Only Role (Producer App)

**Option A: Run in producer app** (immediate, no deploy required):

```javascript
Role.make({
  id: '<DomainName>.ReadOnly.Role',
  roleInherits: ['DataSharing.ReadOnly.Role'],
  permissions: ['allow:<TypeName1>:read:', 'allow:<TypeName2>:read:'],
}).upsert();
```

Add a `"allow:<TypeName>:read:"` permission for each type being shared.

**Option B: Create file** `<producer-pkg>/metadata/Role/<DomainName>.ReadOnly.Role.json`:

```json
{
  "id": "<DomainName>.ReadOnly.Role",
  "roleInherits": ["DataSharing.ReadOnly.Role"],
  "permissions": ["allow:<TypeName1>:read:", "allow:<TypeName2>:read:"]
}
```

> Note: The `DataSharing` role is pending creation (PLAT-142145).

> See the permissions/ACL skill for detailed RBAC configuration.

Platform permissions for KvStore backends (e.g., `Cassandra`, `SqlKvStore`, `KvFs`) and platform types (`Db.Domain`, `Env`) are provided by the inherited `DataSharing.ReadOnly.Role` — you only need to grant access to your domain-specific types.

### Step 4: Configure the Consumer App

**Option A: Run in consumer app** (immediate, no deploy required):

**Same environment** — use just the app name:

```javascript
Db.Domain.Config.make({
  name: '<domain-name>',
  app: '<producer-app-name>',
  callAppInLocalJvm: true,
}).setConfig();
```

**Cross-environment** — use the fully qualified app ID:

```javascript
Db.Domain.Config.make({
  name: '<domain-name>',
  app: '<cluster>-<env>-<producer-app-name>',
  callAppInLocalJvm: false,
}).setConfig();
```

**Option B: Create files**

Add a package dependency on the producer package in `<consumer-pkg>/c3pkg.json`:

```json
{
  "name": "<consumer-package>",
  "version": "1.0.0",
  "dependencies": {
    "<producer-package>": "1.0.0"
  }
}
```

Create `<consumer-pkg>/config/Db.Domain.Config/<domain-name>.json`:

**Same environment**:

```json
{
  "name": "<domain-name>",
  "app": "<producer-app-name>",
  "callAppInLocalJvm": true
}
```

**Cross-environment**:

```json
{
  "name": "<domain-name>",
  "app": "<cluster>-<env>-<producer-app-name>"
}
```

> **Note**: The app name depends on how the producer is deployed and may differ from the package name.

### Step 5: Enable Package Loading for Local JVM (Consumer App — Multi-Node Only)

When using `callAppInLocalJvm: true` in a multi-node environment, you must enable `allowOtherAppsPkgsLocally` on the consumer app's config. Without this, the target app's packages will not be loadable by the consumer, and operations on the domain will fail.

> **Note**: This step applies when using `callAppInLocalJvm` in a multi-node environment. Cross-env sharing within the same cluster is supported; cross-cluster sharing is not supported.

**Run in consumer app** (must be app admin):

```javascript
App.setConfigValue('allowOtherAppsPkgsLocally', true);
```

**Or set in the consumer app's config file**:

```json
{
  "allowOtherAppsPkgsLocally": true
}
```

### Step 6: Grant Access (Producer App)

**Run in producer app** (must be app admin):

**Same environment** — use just the app name:

```javascript
C3.app().allowAccess('<consumer-app-name>', ['<DomainName>.ReadOnly.Role']);
```

**Cross-environment** — use the fully qualified app ID:

```javascript
C3.app().allowAccess('<cluster>-<env>-<consumer-app-name>', ['<DomainName>.ReadOnly.Role']);
```

The `allowAccess` method on `App`:

```c3typ
allowAccess: member function(
  callerAppId: !string serialized AppId,
  roles: [string],
  overwrite: boolean
): Pair<boolean, string>
```

There is also a cross-cluster overload that accepts a public key:

```c3typ
allowAccess: member function(
  callerAppId: !string serialized AppId,
  callerAppPublicKey: !string,
  roles: ![string],
  overwrite: boolean
)
```

## Runtime Configuration

Change the target app at runtime without redeploying:

```javascript
Db.Domain.forName('<domain-name>').config().setConfigValue('app', '<cluster>-<env>-<app-name>');
```

## Local JVM Execution (Beta)

When consumer and producer share a cluster and database, avoid network overhead by adding `"callAppInLocalJvm": true` to the `Db.Domain.Config`:

```json
{
  "name": "<domain-name>",
  "app": "<producer-app-name>",
  "callAppInLocalJvm": true
}
```

When enabled:

- Calls use `C3.callInLocalJvmApp` instead of network remoting
- Results are still serialized/deserialized for data isolation
- Original context is restored after the call

> **Known limitation**: `callAppInLocalJvm` only works correctly with a single producer per consumer. If multiple producers are configured with `callAppInLocalJvm: true` for the same consumer, only the last-configured producer will use local JVM calls — the others will fall back to `callJson` remoting.

**Limitations**: metadata of target and consumer may differ; no guards against conflicting metadata.

## Package Structure

### Producer Package

```
<producer-package>/
├── config/
│   └── Db.Domain.Config/
│       └── <domain-name>.json        # {"name": "<domain-name>", "app": "<producer-app-name>"}
├── metadata/
│   ├── Db.Domain/
│   │   └── <domain-name>.json        # {"name": "<domain-name>"}
│   └── Role/
│       └── <DomainName>.ReadOnly.Role.json
├── src/
│   ├── <Type1>.c3typ                 # @db(domain='<domain-name>')
│   └── <Type2>.c3typ                 # @db(domain='<domain-name>')
└── <producer-package>.c3pkg.json     # or use "dbDomain": "<domain-name>" here
```

### Consumer Package

```
<consumer-package>/
├── config/
│   └── Db.Domain.Config/
│       └── <domain-name>.json        # {"name": "<domain-name>", "app": "<producer-app-name>"}
├── src/
│   └── <ConsumerType>.c3typ          # references shared types via FK
└── <consumer-package>.c3pkg.json     # dependencies: {"<producer-package>": "1.0.0"}
```

## Cross-Cluster Model Sharing

ML models can be shared across clusters via the Model Registry Service:

### Option 1: Remote Connection

```javascript
// In connecting app — get public key and app ID
var pk = C3.app().publicKeyContent;
var appId = C3.app().id;

// In Model Registry Service app — grant access (inherited from Microservice.Service)
ModelRegistryService.allowAccess('<connecting_app_id>', pk);

// In connecting app — configure connection (inherited from Microservice.Proxy)
ModelRegistry.setServiceAppId('<registry_app_id>', '<registry_app_url>');

// Verify
ModelRegistry.list();
```

### Option 2: Export/Import (Air-Gapped)

```javascript
// Export from source
var uris = ['ModelRegistry-cluster-env-app/rel/manufacturer/demo/2'];
var modelDep = ModelRegistry.ModelDependency.make({ uris: uris });
var url = ModelRegistryService.exportModels(modelDep);

// Import into target (positional args: location, deleteAfterImport)
ModelRegistryService.importModels(['gcs://bucket/path/to/export.zip']);
```

## Best Practices

- Assign **read-only** roles to consuming applications
- Do not remix data-shared types in other packages — expand the shared data model instead
- Partition join queries: fetch shared data first, then use results to query non-shared data
- Develop with data sharing enabled in non-production to load data once
- Use application-specific roles scoped narrowly to required data and operations

## Limitations

- **No SQL joins** between shared and non-shared tables
- **No joins** across `Db.Domain` boundaries
- Filtering on non-shared types with shared domain data is not supported
- Both apps must be on the **same cluster**; cross-env within the same cluster is supported, cross-cluster is not (unless using Model Registry for ML models)
- Not recommended when the data model is actively changing across multiple developers
- `callAppInLocalJvm` is `@beta` — use with caution in production
