---
name: c3-code-pkg-upgrade
description: |
  Upgrade C3 AI package dependencies to their latest available versions. Use when:
  (1) updating .c3pkg.json dependency versions
  (2) bumping the version of packages in the repo from x to y
  (3) finding latest versions of C3 packages via ArtifactHub MCP
  (4) the user mentions "upgrade dependencies", "update packages", "bump versions", or "bump version to x.y" in this project
core: false
category: platform
version: 8.9.0
minimumVersion: 8.7.0
metadata:
  group:
    - common
  dependencies:
    - c3-dependency-resolution
---

# C3 Package Dependency Upgrade

This skill covers the end-to-end workflow for bumping in-repo package versions and upgrading external dependency versions in `.c3pkg.json` manifests.

## Related skills

| Situation | Use instead |
| --------- | ----------- |
| `Missing Pkg.Decl` or other dependency resolution errors after upgrade | `c3-dependency-resolution` (complete full workflow before store repair) |

## Prerequisites

**The CodeMCP `PkgStoreMcp` tools are required.** Before proceeding, verify that the `PkgStoreMcp.getJavaStorePkgs` tool is available. If it is not, **stop and inform the user** — dependency upgrades cannot be performed without it because Java Store package resolution depends on live platform queries.

All `PkgStoreMcp` tools require `workspaceId` as the first argument. Obtain it from the environment variable `WORKSPACE_ID`.

## Bumping In-Repo Package Versions (x → y)

When the user asks to bump the version of packages from `x` to `y` (e.g., "bump everything to 7.0"):

1. **Find all in-repo packages:**

   ```bash
   find . -name "*.c3pkg.json"
   ```

2. **Update each package's own `"version"` field** to the new target version (use `major.minor.patch`, e.g. `"7.0.0"`, matching whatever convention is already used in the file).

3. **Update cross-references between in-repo packages.** For each `*.c3pkg.json`, check its `"dependencies"` — if a dependency name matches another in-repo package, update its version to the new `major.minor` (e.g., `"7.0"`).

   Example: if `relpro` depends on `processOptimization` and both are in the repo, bumping to `7.0` means:

   - `processOptimization.c3pkg.json` → `"version": "7.0.0"`
   - `relpro.c3pkg.json` → `"dependencies": { "processOptimization": "7.0", ... }`

4. **Do not change external dependency versions** unless the user explicitly asks — only in-repo package references are updated in this step.

## Upgrading External Dependencies

### Phase 1 — Resolve Latest Dependency Versions

**First, identify which packages live in this repo** by scanning for `*.c3pkg.json` files:

```bash
find . -name "*.c3pkg.json" | xargs grep -l '"name"'
```

For **in-repo packages**, read their `"version"` field directly from their `*.c3pkg.json` and use that `major.minor` — do **not** query ArtifactHub for these. The repo version is authoritative.

#### 1a — Identify Java Store packages and the current platform version

**This step is mandatory and must be done before querying ArtifactHub.** Some packages ship with platform (Java Store packages) and their version must match the running platform version — NOT the latest version on ArtifactHub. Common examples include `baseToolkit`, `uiComponentLibraryReact`, `uiInfrastructure`, `uiBundler`, `cssLibrary`, `jarvis`, `testtools`, `units`, `hierarchy`, etc.

1. **Get all Java Store packages and the platform version** using `PkgStoreMcp.getJavaStorePkgs` (pass the current `workspaceId`).

   The response contains:

   - `version` — the full platform version (e.g. `"8.10.3"`). Extract the `major.minor` (e.g. `"8.10"`).
   - `pkgs` — the full list of package names that ship with platform.

2. For each dependency in a `.c3pkg.json` that matches a package name in the `pkgs` list, set its version to the extracted `major.minor`.

#### 1b — Resolve remaining external dependencies via ArtifactHub

For every dependency that is **not** a Java Store package and **not** an in-repo package, use `C3AI-CodeMCP_fetchArtifacts` to find the latest version. Extract the **major.minor** prefix from `semanticVersion` (e.g., `15.0.2-stable.21+...` → `15.0`).

Fetch external packages in parallel:

```
C3AI-CodeMCP_fetchArtifacts(
  filter: "name == '<pkgName>'",
  order: "descending(sortableSemanticVersion)",
  limit: 3
)
```

Extract the major.minor from `semanticVersion` of the top LEGACY_PKG or ROOT_SOURCE result.

### Phase 2 — Update .c3pkg.json Files

**First, delete all `*.c3pkg.lock.json` files in the repo.** These lock files will be regenerated automatically and must not contain stale dependency versions:

```bash
find . -name "*.c3pkg.lock.json" -delete
```

Update the `"dependencies"` in every `*.c3pkg.json` found in the repo using the versions resolved in Phase 1. Dependency versions use **major.minor** strings (e.g. `"15.0"`, `"22.0"`, `"8.10"`).

### Phase 3 — Verify and Resolve Package Issues

After updating all `.c3pkg.json` files, use the CodeMCP Pkg.Store tools to verify the store is healthy.

1. **Verify Pkg.Store config is intact** using `PkgStoreMcp.pkgStoreConfig` (pass `workspaceId`).

   A healthy config has:

   - One `Pkg.Store.Local` entry (the writable store for in-repo packages).
   - Multiple `Pkg.Store.Zip` entries (one per resolved external dependency from ArtifactHub).
   - One `Pkg.Store.Java` entry at the end.

   If in-repo packages have non-Java-Store external dependencies but the config has **no** `Pkg.Store.Zip` entries (only `Local` and `Java`), note this for triage — but still follow step 3 via **`c3-dependency-resolution`** first. Store reconfiguration (step 3 last resort) applies only after that skill's workflow is complete. If all dependencies are Java Store packages (or there are no external dependencies), an empty `Zip` list is expected.

   **Never manually edit the Pkg.Store config.** Use MCP tools only; store repair steps are in step 3 last resort.

2. **Check for package issues** for each writable (in-repo) package using `PkgStoreMcp.issuesForPkg` (pass `workspaceId` and the package name).

3. **If critical issues appear** — including `Missing Pkg.Decl`, `DEPENDENCY_RESOLUTION_ERROR`, locked version mismatch, incompatible packages, or circular dependency errors:

   **Do not treat `Missing Pkg.Decl` as a store-config problem first.** It almost always means dependency resolution failed. Follow the **`c3-dependency-resolution`** skill in full:

   1. Load and apply **`c3-dependency-resolution`**.
   2. Complete **all applicable phases** in that skill (triage → 2A / 2B / 2C → verify → report).
   3. Do **not** skip verification (`issuesForPkg` polling) in the resolution skill.
   4. Return here only when resolution-skill verification passes **or** you have exhausted every phase in that skill without success.

   **Note:** Phase 2 of this upgrade skill already deletes all `*.c3pkg.lock.json` files. Do not delete locks again unless the resolution skill identifies new stale pins after further changes.

   **Last resort only** — if and only if `issuesForPkg` still reports `Missing Pkg.Decl` (or related resolution errors) **after** the full `c3-dependency-resolution` workflow:

   a. **Verify Pkg.Store config** again with `PkgStoreMcp.pkgStoreConfig(workspaceId)`.
      - Writable packages with non-Java external deps should have `Pkg.Store.Zip` entries.
      - If Zip entries are missing and external deps exist, the store may never have loaded artifacts for the new manifest versions.

   b. **Clear all Pkg.Store caches** — `PkgStoreMcp.clearCaches(workspaceId)`.

   c. **Re-resolve from ArtifactHub** — `PkgStoreMcp.configureFromArtifactHub(workspaceId, force: true)`.
      - Do **not** pass `ignoreLocks: true`.
      - If locks may still be stale, delete all `*.c3pkg.lock.json` again before this step.

   d. **Re-check issues** — `PkgStoreMcp.issuesForPkg` for each affected writable package.

   e. If still failing, inform the user with full error text, manifest/lock state, and `pkgStoreConfig` summary. Do **not** loop blindly on store repair.

4. **If a type remixes a platform (Java Store) type** — the issue will indicate that remixing this type is not allowed. Platform types cannot be remixed. To fix:

   a. **Remove the `remix` keyword** from the type declaration and replace it with `extends` or `mixes` as appropriate.

   b. **Rename the type.** A remix reuses the base type's name; without `remix`, the in-repo type must have its own unique name (e.g., if remixing `Foo`, rename to `MyFoo`, `CustomFoo`, or a domain-appropriate name).

   c. **Update all references** to the old type name across the entire codebase — `.c3typ` files, `.js` implementations, `.py` implementations, seed data, config, metadata, and tests — to use the new name.

5. If issues still persist after step 3 (including resolution skill **and** last-resort store repair) and step 4 (remix fixes), inform the user and list remaining unresolved issues.

6. **Final consistency checks:**
   - Confirm all `.c3pkg.json` files have consistent, updated versions.
   - Cross-check that in-repo package cross-references match the new version.
   - Confirm no external dependency was left at a stale version.

### Phase 4 — Migrate In-Repo Remix Types to Match New Dependency APIs

This phase applies exclusively to in-repo types that use the `remix` keyword on a dependency type. These types override fields/methods on a base type and are most likely to break when that dependency is upgraded. Package issues should already be resolved in Phase 3.

Types that only use `mix` or `extend` (without `remix`) do **not** need migration and should be skipped entirely.

> **CRITICAL: How to read dependency type content**
>
> Dependency packages (Pkg.Store.Zip, Pkg.Store.Java) are **NOT** on the filesystem. They are served in-memory by the platform. You **cannot** read them with `cat`, `find`, `ls`, or any filesystem command. You **cannot** read them from `.vs-cache` (that cache may be stale after an upgrade). You **must not** try to use `curl`, the C3 HTTP API, or the C3AI-AppMCP console to read them.
>
> The **only** way to read dependency type content is `PkgStoreMcp.readContentString`. This tool queries the live Pkg.Store and returns the actual file content after the upgrade. Use it for every base type you need to inspect.

#### 4a — Build the migration worklist

1. **Find in-repo types that use `remix`.** Search for `.c3typ` files containing the `remix` keyword:

   ```bash
   find . -name "*.c3typ" -not -path "*/gen/*" -not -path "*/.vs-cache/*" | xargs grep -l '\bremix\b'
   ```

2. For each match, extract the base type name from the `remix` clause. This is your migration worklist: `(in-repo file, base type name)`.

#### 4b — Process each type systematically

For **every** entry in the worklist, perform these steps in order. Do not skip any type.

**Step 1: Read the new base type definition**

Use `PkgStoreMcp.readContentString` to fetch the current version of a base type from the live Pkg.Store. The tool accepts a path prefix or glob and returns a map of matching paths to their content. You don't need to know which package a type lives in.

> **Note:** A type name can appear in multiple packages. When `readContentString` returns multiple results for the same type name, examine **all** of them.

> **Note:** The first call to `readContentString` is slow because it must scan and cache all package files. The tool call will likely **timeout** on this initial invocation. When this happens, **wait ~30 seconds and retry** — subsequent calls will be fast once the cache is warm.

```
PkgStoreMcp.readContentString(
  workspaceId: "<WORKSPACE_ID>",
  pathPrefixOrGlob: "/*/src/**/<BaseType>.c3typ"
)
```

This searches across all packages (including dependencies) and returns `{ "meta://somePkg/src/folder/BaseType.c3typ": "<file content>", ... }`.

To also read the `.js` and `.py` implementations, make additional calls:

```
PkgStoreMcp.readContentString(workspaceId: "...", pathPrefixOrGlob: "/*/src/**/<BaseType>.js")
PkgStoreMcp.readContentString(workspaceId: "...", pathPrefixOrGlob: "/*/src/**/<BaseType>.py")
```

**Step 2: Compare the base type with the in-repo type**

Go through the base type definition field by field and method by method. Look for renamed or removed fields, new required fields, changed field types, renamed or removed methods, changed method signatures, new abstract methods, changed annotations, and new or removed mixin requirements. Update the in-repo type and its implementations to match.

> **Remix contract rules:** A remix must preserve the base type's method signatures exactly — parameter types, parameter order, and return types cannot change. Adding extra annotations on fields or methods is allowed, and adding new fields is fine, but method signatures are dictated by the base type. If the base type changed a method signature in the new version, the remix must update to match it exactly.

**Step 3: Read and compare the base `.js` implementation (if applicable)**

If the base type has a JavaScript implementation, fetch it using the glob search from Step 1 (you should have already retrieved it). If not, call:

```
PkgStoreMcp.readContentString(
  workspaceId: "<WORKSPACE_ID>",
  pathPrefixOrGlob: "/*/src/**/<BaseType>.js"
)
```

Read the new base `.js` implementation and compare it function by function with the in-repo `.js` file. Identify what changed in the base — renamed or removed functions, altered parameters, changed return structures, or new internal logic. Then adjust the in-repo implementation to align with those changes.

> **Preserve custom logic markers.** Some repos annotate their customizations with comments (e.g., `// CUSTOM:`, `// MODIFIED:`, `// <repo-name> change`). Look for these in the in-repo file before making changes — they indicate intentional deviations from the base. Preserve the intent of those customizations while adapting them to the new base API.

**Step 4: Read and compare the base `.py` implementation (if applicable)**

Same approach as Step 3, but for Python:

```
PkgStoreMcp.readContentString(
  workspaceId: "<WORKSPACE_ID>",
  pathPrefixOrGlob: "/*/src/**/<BaseType>.py"
)
```

Read the new base `.py` implementation and compare it method by method with the in-repo `.py` file. Identify what changed and adjust accordingly. As with `.js`, look for comments in the in-repo file that mark intentional customizations and preserve their intent while adapting to the new base API.

**Step 5: Validate after each type**

After updating each in-repo type and its implementations, run:

```
PkgStoreMcp.issuesForPkg(workspaceId: "<WORKSPACE_ID>", pkgName: "<inRepoPkg>")
```

Fix any reported issues before moving to the next type. Common issues:

- `Invalid override`: your method signature doesn't match the base. Read the base type again and fix.
- `Missing`: a referenced type or field no longer exists. Read the dependency type to find the replacement.
- `Type mismatch`: a field or return type changed. Update to match.

#### 4c — Final validation

After processing all types:

1. Run `PkgStoreMcp.issuesForPkg` for every in-repo package. There should be zero issues related to the upgrade.
2. Run `PkgStoreMcp.validatePkgs` with `synchronous: true` for a full validation pass.
3. If any issues remain, repeat Steps 1–4 of section 4b for the affected types.
4. **Run related tests.** Search the `test/` directory for JS or Python test files related to the migrated remix types. Run them using the `runTest` tool. If any tests fail, review the errors, fix the in-repo code, and re-run until they pass.
