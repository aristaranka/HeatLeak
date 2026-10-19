---
name: c3-app-lifecycle
description: |
  Manage C3 AI application deployment lifecycle. Deploy apps from specific packages and versions, upgrade running apps, resolve server and package versions, configure node pools, wait for readiness, and check seed data and schema status.
core: true
category: platform
version: 8.9.0
minimumVersion: 8.7.0
metadata:
  dependencies:
    - c3-schema-migration
---

# C3 AI App Lifecycle

This skill covers the deployment lifecycle of C3 apps — from creating environments and deploying packages to upgrading, version resolution, and post-deployment health checks.

> **Related skills:** `c3-cluster-admin` covers basic cluster/env/app administration. `c3-artifact-hub` covers artifact management. `c3-schema-migration` covers schema upgrades.

## Quick Reference

| Operation              | Code                                                           |
| ---------------------- | -------------------------------------------------------------- |
| Start environment      | `Cluster.inst().startEnv(spec)`                                |
| Start app              | `env.startApp(spec)`                                           |
| Upgrade app            | `env.upgradeAppById(appId, spec)`                              |
| Stop app               | `env.stopAppById(appId)`                                       |
| Resume app             | `env.resumeAppById(appId)`                                     |
| Terminate app          | `env.terminateAppById(appId, true)`                            |
| Wait for ready         | `app.waitForReady(waitSpec)`                                   |
| Check health           | `app.isReady()`                                                |
| Schema status          | `app.schemaUpgradeStatus()`                                    |
| Seed issues            | `app.criticalSeedIssues()`                                     |
| Resolve server version | `App.resolveServerVersion(envId, rootPkg, version, requested)` |
| Package artifact       | `Pkg.inst().zipArtifact(path, withDeps)`                       |

Note: Lifecycle operations on an app/env must always be run from its parent, ie, env/cluster respectively.

## App Modes

| Mode    | Code Updatable | Test Data | Data Integration | Use Case                    |
| ------- | -------------- | --------- | ---------------- | --------------------------- |
| `PROD`  | No             | No        | ON               | Production workloads        |
| `DEV`   | Yes            | Available | ON               | Development                 |
| `TEST`  | No             | Available | ON               | Testing with read-only code |
| `TRIAL` | Yes            | No        | OFF              | Sandboxed evaluation        |

```javascript
// Check mode
App.inst().mode;
AppMode.includesTestOverlay(App.inst().mode); // true for DEV and TEST
AppMode.requiresUpdatablePkg(App.inst().mode); // true for DEV and TRIAL

// Change mode
App.inst().setMode('DEV');
```

## Starting Environments

```javascript
Cluster.inst().startEnv(
  Cluster.StartEnvSpec.make({
    name: 'staging',
    label: 'Staging Environment',
    singleNode: false,
    defaultAppMode: 'PROD',
    serverVersion: '8.9.0',
    waitForReady: true,
    nodePoolConfig: [
      App.NodePool.Config.make({
        roles: ['leader'],
        targetNodeCount: 1,
        hardwareProfile: HardwareProfile.make({ cpu: 4, memoryMb: 16384 }),
      }),
      App.NodePool.Config.make({
        roles: ['task'],
        targetNodeCount: 3,
        minNodeCount: 1,
        maxNodeCount: 10,
        autoScale: App.NodePool.AutoScaleSpec.make({}),
      }),
    ],
  })
);
```

### StartEnvSpec Key Fields

| Field            | Type                    | Default | Description                       |
| ---------------- | ----------------------- | ------- | --------------------------------- |
| `name`           | `!string`               | —       | Environment name                  |
| `singleNode`     | `boolean`               | —       | Single-node mode for all apps     |
| `minimalInfra`   | `boolean`               | —       | Start with minimal infrastructure |
| `defaultAppMode` | `AppMode`               | —       | Default mode for apps             |
| `serverVersion`  | `SemanticVersion`       | —       | Platform server version           |
| `waitForReady`   | `boolean`               | —       | Block until env is ready          |
| `nodePoolConfig` | `[App.NodePool.Config]` | —       | Node pool overrides               |
| `sharedDb`       | `boolean`               | —       | Use shared DB                     |
| `internalOnly`   | `boolean`               | —       | No ingress, internal access only  |
| `startedBy`      | `User`                  | —       | Who started the env               |

## Starting Apps

```javascript
var env = Cluster.inst().env('staging');

env.startApp(
  Env.StartAppSpec.make({
    name: 'my-app',
    rootPkg: 'MyPackage',
    rootPkgVersion: '2.1.0',
    mode: 'PROD',
    serverVersion: '8.9.0',
    waitForReady: true,
    autoScale: true,
    leaderNodeCount: 1,
    taskNodeCount: 2,
    nodePoolConfig: [
      App.NodePool.Config.make({
        roles: ['leader'],
        hardwareProfile: HardwareProfile.make({ cpu: 8, memoryMb: 32768 }),
      }),
    ],
  })
);
```

### StartAppSpec Key Fields

| Field                | Type                    | Default | Description                              |
| -------------------- | ----------------------- | ------- | ---------------------------------------- |
| `name`               | `string`                | —       | App name (defaults to sanitized rootPkg) |
| `rootPkg`            | `string`                | —       | C3 package to deploy                     |
| `rootPkgVersion`     | `SemanticVersion`       | —       | Package version                          |
| `mode`               | `AppMode`               | —       | App mode                                 |
| `serverVersion`      | `SemanticVersion`       | —       | Platform version                         |
| `waitForReady`       | `boolean`               | —       | Block until app is ready                 |
| `autoScale`          | `boolean`               | `true`  | Enable task node autoscaling             |
| `leaderNodeCount`    | `int32`                 | `1`     | Number of leader nodes                   |
| `taskNodeCount`      | `int32`                 | `0`     | Number of task nodes                     |
| `nodePoolConfig`     | `[App.NodePool.Config]` | —       | Node pool config overrides               |
| `doNotThrowOnIssues` | `boolean`               | —       | Suppress seed data issue errors          |
| `startedBy`          | `User`                  | —       | Who started the app                      |

## Upgrading Apps

Upgrade changes the server version, root package, or both:

```javascript
env.upgradeAppById(
  'cluster-staging-myapp',
  Env.UpgradeAppSpec.make({
    serverVersion: '8.10.0',
    rootPkg: 'MyPackage',
    rootPkgVersion: '2.2.0',
    autoResume: true,
  })
);
```

### UpgradeAppSpec Fields

| Field            | Type              | Description                   |
| ---------------- | ----------------- | ----------------------------- |
| `serverVersion`  | `SemanticVersion` | New platform version          |
| `rootPkg`        | `string`          | New root package              |
| `rootPkgVersion` | `SemanticVersion` | New package version           |
| `autoResume`     | `boolean`         | Auto-resume app after upgrade |

**Upgrade flow:** Scale nodepool to 1 leader node -> Perform upgradeApp from parent app (env for app, and cluster for env) → Scale back nodepools

## Server Version Resolution

The platform resolves the server version using a precedence chain:

```
Requested version > rootPkg platform dependency > Env fallback
```

```javascript
// Resolve what server version will be used
var version = App.resolveServerVersion(
  envId,
  'MyPackage',
  '2.1.0', // rootPkgVersion
  null // requestedServerVersion (null = auto-resolve)
);

// Resolve package version
var pkgVersion = App.resolveRootPkgVersion(envId, 'MyPackage', null);
```

## Post-Deployment Health

### Readiness Checks

```javascript
// Wait for app to be fully ready (API accessible + seed data loaded)
app.waitForReady(
  WaitSpec.make({
    maxTotalMillis: 600000, // 10 minutes
    maxSleepMillis: 10000, // poll every 10s
  })
);

// Individual checks
app.isRegistered(); // stored in cluster config
app.isHealthy(); // responding to health checks
app.isReady(); // registered + healthy + seed data current
```

### Schema & Seed Status

```javascript
// Check schema migration status
var status = app.schemaUpgradeStatus();
status.isCompleted; // true when all migrations done
status.errors; // any migration errors
status.migrations; // per-type migration status

// Check for seed data issues
var issues = app.criticalSeedIssues();
```

### Wait for Termination

```javascript
// After stopping, wait for full teardown
app.waitForTermination(
  WaitSpec.make({
    maxTotalMillis: 300000,
  })
);
```

## Full Deployment Flow

A typical end-to-end deployment:

```javascript
// 1. Package is built by Jarvis and registered in ArtifactHub
// (done by CI/CD pipeline)

// 2. Start environment (or use existing)
var env = Cluster.inst().env('staging');

// 3. Deploy app with specific package version
var app = env.startApp(
  Env.StartAppSpec.make({
    rootPkg: 'MyPackage',
    rootPkgVersion: '2.1.0',
    mode: 'PROD',
    waitForReady: true,
  })
);

// 4. Verify deployment
var status = app.schemaUpgradeStatus();
if (!status.isCompleted) {
  // Handle migration issues
  status.errors.each((e) => console.log(e));
}

var issues = app.criticalSeedIssues();
if (issues.length > 0) {
  // Handle seed data issues
}

// 5. Later: upgrade to new version
env.upgradeAppById(
  app.id,
  Env.UpgradeAppSpec.make({
    rootPkgVersion: '2.2.0',
    autoResume: true,
  })
);
```

## WaitSpec Configuration

| Field                | Type      | Default   | Description                    |
| -------------------- | --------- | --------- | ------------------------------ |
| `maxRetries`         | `int`     | `-1`      | Max retries (-1 = unlimited)   |
| `initialSleepMillis` | `int`     | `20`      | First retry sleep (ms)         |
| `exponent`           | `double`  | `2`       | Exponential backoff multiplier |
| `maxSleepMillis`     | `int`     | `20000`   | Max per-retry wait (20s)       |
| `maxTotalMillis`     | `int`     | `1800000` | Max total wait (30min)         |
| `doNotFailOnTimeout` | `boolean` | —         | Don't throw on timeout         |

## Best Practices

- Always use `waitForReady: true` in `StartAppSpec` / `StartEnvSpec` for synchronous deployment
- Check `schemaUpgradeStatus()` and `criticalSeedIssues()` after every deployment
- Use `autoResume: true` in `UpgradeAppSpec` to avoid manual resume after upgrades
- Set explicit `serverVersion` when deploying to ensure deterministic versions
- Use `Env.UpgradeAppSpec` instead of stop + reconfigure + resume for atomic upgrades
- Use `App.resolveServerVersion()` to preview what version will be selected before deploying

## Common Anti-Patterns

1. **Not waiting for readiness** — accessing the app before schema migrations complete
2. **Ignoring seed data issues** — `criticalSeedIssues()` may indicate broken config
3. **Manual stop/start instead of upgrade** — use `upgradeAppById` for atomic version changes
4. **Not specifying server version** — auto-resolution may pick unexpected versions
5. **Using deprecated `stopApp(app)` / `resumeApp(app)`** — use `stopAppById` / `resumeAppById`
6. **Starting apps without checking existing** — duplicate apps cause conflicts
7. **Executing lifecycle functions for an app within the app itself** - must instead execute from parent of the app
