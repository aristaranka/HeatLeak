---
name: c3-pkg-store-troubleshooting
description: |
  Diagnose and recover Pkg.Store, Pkg.Issue, dependency resolution, SeedData, and app-start failures
  in C3 Code / Genesis workspaces. Use when: stale or phantom Pkg.Issues, agent file changes not
  reflected on the server, missing package dependencies, Dependency Resolution Errors, zip store
  config loss, seed data upsert blocked, or app won't start due to pkg initialization errors.
core: false
category: platform
version: 8.9.0
minimumVersion: 8.9.0
metadata:
  dependencies:
    - c3-dependency-resolution
---

# C3 Pkg.Store Troubleshooting

Canonical runbook for C3 Code agents and support.

## Prerequisites

**The CodeMCP `PkgStoreMcp` tools are required** for MCP-based troubleshooting from the agent. Before proceeding, verify that `PkgStoreMcp.getJavaStorePkgs` (or another `PkgStoreMcp` tool) is available. If not, **stop and inform the user** — workspace Pkg.Store operations cannot be performed via MCP without it.

All `PkgStoreMcp` tools require `workspaceId` as the first argument. Obtain it from the environment variable `WORKSPACE_ID`.

Env-console calls (`Pkg.Store.inst()...`) run in the **workspace env** (env/c3), not the app console, unless noted otherwise.

## Quick Reference

| Situation | Where | Call |
| --------- | ----- | ---- |
| Validation finished? | env/c3 | `Pkg.Store.inst().isValidationComplete()` |
| Read pkg issues | env/c3 | `Pkg.Store.inst().issuesForPkg('myPkg')` |
| Force-validate paths (edits not reflected) | env/c3 | `Pkg.Store.inst().validatePaths([paths], true)` |
| Missing dependency / resolution errors | — | Load and follow **`c3-dependency-resolution`** |
| Seed data issues | app console | `App.State.get().seedDataIssues` |
| Upsert seed after fixes | app console | `C3.app().upsertAllSeed(true)` |
| Root pkg name | app console | `C3.app().rootPkg` |
| App won't start — test pkg init | env/c3 | `Pkg.Store.inst().pkg(rootPkg)` |
| Issues via MCP | CodeMCP | `PkgStoreMcp.issuesForPkg(workspaceId: "<WORKSPACE_ID>", pkgName: "myPkg")` |

## Golden rule: validation before issues

**Never read or act on Pkg.Issues until validation has finished.**

```javascript
// Workspace env console (or via Lambda in workspace)
var store = Pkg.Store.inst();
store.isValidationComplete(); // must be true
```

If `false`, poll until true (or check `store.pendingValidations()`). Reading issues mid-validation produces stale or transient false positives.

**MCP (Genesis workspace):** use `PkgStoreMcp.isValidationComplete` when available; otherwise call the API above in the workspace env.

---

## Decision flow

```
START: user reports pkg / sync / startup problem
│
├─ App won't start?
│  └─ YES → **app console:** rootPkg = C3.app().rootPkg
│     └─ **env/c3:** Pkg.Store.inst().pkg(rootPkg) — throws if pkg cannot initialize
│
├─ SeedData modal / upsert blocked?
│  └─ YES → App.State.get().seedDataIssues
│     └─ Fix issues → C3.app().upsertAllSeed(true)
│
├─ Missing dependency / "Dependency Resolution Errors" in Pkg.Issue?
│  └─ YES → load and follow **`c3-dependency-resolution`**
│     └─ Wait for isValidationComplete() → re-read issues
│
├─ Code changed but server behavior unchanged?
│  └─ YES → validatePaths(changedPaths, true)  // force sync validation
│     └─ Wait for isValidationComplete() → re-read issues
│
└─ Stale / phantom Pkg.Issues in UI or agent?
   └─ Wait for isValidationComplete() → issuesForPkg / readIssues
      └─ Server clean but Genesis modal stale → ask user to reload workspace tab
```

---

## Symptom → fix

### 1. Stale or phantom Pkg.Issues

**Wrong:** `clearCaches()` or reading issues immediately after a file edit.

**Right:**

1. Wait until `Pkg.Store.inst().isValidationComplete()` is **true**.
2. Read issues from the server:
   ```javascript
   Pkg.Store.inst().issuesForPkg('myPkg');
   // or
   Pkg.Store.inst().pkg('myPkg').readIssues();
   ```
3. If the Genesis Pkg.Issue modal still shows resolved issues after the server-side read is clean, **ask the user to reload the workspace browser tab**. The agent cannot refresh the Genesis UI — that modal is rendered by Genesis, not the app UI preview.

**MCP** (only after validation complete):

```
PkgStoreMcp.issuesForPkg(
  workspaceId: "<WORKSPACE_ID>",
  pkgName: "myPkg"
)
```

---

### 2. Agent / IDE changes not live on server

The file watcher normally triggers validation on save — **only force validation if edits are not reflected** on the server (e.g. listener missed events). Then validate the changed paths:

```javascript
var store = Pkg.Store.inst();
store.validatePaths([
  'meta://myPkg/src/MyType.c3typ',
  'meta://myPkg/src/MyType.js'
], true);  // true = synchronous
```

Then wait for `store.isValidationComplete()` and re-read issues.

**Whole package:**

```javascript
Pkg.Store.inst().validatePkg('myPkg');
// or
Pkg.Store.inst().validatePkgs(['myPkg'], true);
```

**MCP:**

```
PkgStoreMcp.validatePkgs(
  workspaceId: "<WORKSPACE_ID>",
  pkgNames: ["myPkg"],
  synchronous: true
)
```

Do **not** jump to **`c3-dependency-resolution`** for ordinary source edits.

---

### 3. Missing dependency / Dependency Resolution Errors

When Pkg.Issue reports missing packages or a **Dependency Resolution Errors** block, load and follow the **`c3-dependency-resolution`** skill.

After resolution, wait for `isValidationComplete()` and verify issues cleared.

---

### 4. Seed data issues (running app)

In the **app** console (not env/c3):

```javascript
App.State.get().seedDataIssues;
```

Fix reported `SeedData.Issue` entries, then:

```javascript
C3.app().upsertAllSeed(true);
```

---

### 5. App won't start

Pkg initialization failure can block startup before the app reaches RUNNING.

**Step 1 — app console:** get the root package name:

```javascript
C3.app().rootPkg;
```

**Step 2 — env/c3:** load that pkg in the store (throws if initialization fails):

```javascript
Pkg.Store.inst().pkg(rootPkg);
```

Inspect the error and fix underlying Pkg.Issues (types, dependencies, metadata). Re-check with the same env/c3 call before retrying start.

---

## PkgStoreMcp tools (Genesis workspace)

| Tool | Use when |
|------|----------|
| `issuesForPkg` | After validation complete — server-side issues map |
| `validatePkgs` | Force pkg validation when edits are not reflected |
| `pkgStoreConfig` | Verify zip nested stores exist |
| `readContentString` | Compare server file content vs local |
| `getJavaStorePkgs` | Platform-bundled pkg names + version |
| `clearCaches` | Last resort — proven cache corruption only |

All tools take `workspaceId: "<WORKSPACE_ID>"` as the first argument (from env var `WORKSPACE_ID`).

**Read issues** (after `isValidationComplete`):

```
PkgStoreMcp.issuesForPkg(
  workspaceId: "<WORKSPACE_ID>",
  pkgName: "myPkg"
)
```

**Force-validate packages:**

```
PkgStoreMcp.validatePkgs(
  workspaceId: "<WORKSPACE_ID>",
  pkgNames: ["myPkg"],
  synchronous: true
)
```

For missing dependencies and dependency resolution errors, see **`c3-dependency-resolution`**.

**Inspect store config** (healthy config has Local + Zip entries + Java):

```
PkgStoreMcp.pkgStoreConfig(
  workspaceId: "<WORKSPACE_ID>"
)
```

**Read server file content** (compare to local after edits):

```
PkgStoreMcp.readContentString(
  workspaceId: "<WORKSPACE_ID>",
  pathPrefixOrGlob: "meta://myPkg/src/MyType.c3typ",
  includeDeps: false
)
```

**Platform Java Store packages** (verify tool availability):

```
PkgStoreMcp.getJavaStorePkgs(
  workspaceId: "<WORKSPACE_ID>"
)
```

**Clear caches** (last resort only):

```
PkgStoreMcp.clearCaches(
  workspaceId: "<WORKSPACE_ID>"
)
```

`isValidationComplete` via MCP when available; otherwise use `Pkg.Store.inst().isValidationComplete()` in env/c3.

---

## Agent checklist

When you edit package files in a C3 Code workspace:

1. After edits, wait for the file watcher to validate (default). **Only if edits are not reflected**, call `validatePaths` (or `validatePkgs`) for the affected paths/packages.
2. Poll until `isValidationComplete()` is true.
3. Call `issuesForPkg` / `readIssues` — **do not** trust the modal alone.
4. If dependency resolution errors appear, load and follow **`c3-dependency-resolution`**.
5. For seed data blockers in a running app, check `App.State.get().seedDataIssues`.
6. If the app fails to start: get `C3.app().rootPkg` in the **app console**, then in **env/c3** run `Pkg.Store.inst().pkg(rootPkg)` to surface init errors.
7. Do not stop until issues are resolved or you have a concrete platform bug to file.
