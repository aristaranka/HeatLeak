---
name: c3-dependency-resolution
description: |
  Diagnose and fix C3 package dependency resolution errors. Use when:
  (1) metadata errors mention "Dependency Resolution Errors", DEPENDENCY_RESOLUTION_ERROR,
      "Locked version mismatch", or "Missing Pkg.Decl"
  (2) pkg issues show incompatible packages, circular dependencies, or version conflicts
  (3) PkgStoreMcp.issuesForPkg or readPkgIssues reports dependency resolution failures
  (4) the Fix-with-AI overlay injects package metadata errors about locks or dependency chains
  Do NOT use for bumping dependency versions to latest — use c3-code-pkg-upgrade instead.
metadata:
  group:
    - common
  dependencies:
    - c3-code-pkg-upgrade
---

# C3 Package Dependency Resolution

End-to-end workflow for **fixing** dependency resolution failures — not for routine version upgrades.

## Related skills

| Situation | Use instead |
| --------- | ----------- |
| User wants to bump deps to latest / ArtifactHub upgrade | `c3-code-pkg-upgrade` |
| Seed or type errors after dependencies are clean | `c3-backend`, seed guidance |
| Remix breakage after resolution succeeds | `c3-code-pkg-upgrade` Phase 4 |

## Prerequisites

- **CodeMCP `PkgStoreMcp` tools** are required for verification.
- Obtain `workspaceId` from the `WORKSPACE_ID` environment variable.
- **Never declare "fix complete" until Phase 4 verification passes.**

### Lock file semantics (read before changing anything)

Writable lock: `<pkg>/<pkg>.c3pkg.lock.json`. It has two dependency maps:

| Field | Role |
| ----- | ---- |
| `declaredDependencies` | Snapshot of `.c3pkg.json` dependencies when the lock was generated |
| `resolvedDependencies` | Exact pinned versions fed into resolution as `preResolvedVersions` |

Platform behavior (from `Pkg_Store_Methods` / `Pkg_Store_DependencyResolver_Methods`):

- **Manifest changed:** If `.c3pkg.json` dependencies differ from the lock's `declaredDependencies`, the platform **automatically ignores the lock** (`didDeclDepsChange`) and regenerates it on the next resolution. Do **not** manually delete the lock just because declared deps changed — editing the manifest is enough.
- **Locked version mismatch:** Occurs when a **`resolvedDependencies` pin** cannot satisfy a dependency requirement in the chain — not when manifest and `declaredDependencies` disagree.
- **Writable lock contents:** Only non-Java/non-Db Zip dependencies appear in the writable lock; transitive Java/Db resolution lives in Pkg.Store config/cache. Empty `resolvedDependencies` after a successful fix can be correct.
- **Do not manually edit** pins in `resolvedDependencies`. Delete all `*.c3pkg.lock.json` files and let the platform regenerate them.
- **Resolution is workspace-wide:** Dependency resolution runs for all writable packages together. Any stale pin in any lock can block resolution — delete **all** lock files, not just the one named in the error.
- **CI mode:** `Pkg.Store.Config#doNotIgnoreLocksUponResolutionError` (typically CI) prevents auto-recovery from bad locks. C3 Code dev environments use the default (locks can be bypassed on resolution failure).

### Missing Pkg.Decl

**Ignore as a separate problem.** `Missing Pkg.Decl` almost always means dependency resolution failed — the store cannot find a dependency at the declared version because resolution did not complete successfully. Do **not** branch to store-config repair or treat it as a distinct root cause. Fix the underlying resolution failure (Phase 2A/2B/2C); the `Missing Pkg.Decl` issues should clear once resolution succeeds.

### UI vs MCP

- The Fix-with-AI overlay reads polled pkg issues, not the lock file directly.
- If `issuesForPkg` is clean but the overlay still shows the same error, **trust MCP over the overlay** and continue polling — the UI may be stale.

---

## Quick reference — error signatures

| Section in error text | Likely cause | Jump to |
| --------------------- | ------------ | ------- |
| 🔒 Locked version mismatches | Stale or invalid `resolvedDependencies` pin | Phase 2A |
| ⚠️ Incompatible packages detected | Conflicting version requirements in chain | Phase 2B |
| Circular dependency hint | Cycle in dependency graph | Phase 2C |
| Missing Pkg.Decl | Symptom of failed resolution — not a separate root cause | Phase 2A (default) or matching 2B/2C |
| Resolution attempt limit | `maxDependencyResolutionAttempts` exhausted | Phase 3 |

Example (locked version mismatch — bad **resolved pin**, not bad declared dep):

```
Locked version mismatch on genaiPlatform
locked: 8.10.0-dev.74+...
chain: shipbuilding@1.0.0 -> mcpServer@8.10 -> genaiPlatform requires genaiPlatform@8.10
```

Here `.c3pkg.json` and `declaredDependencies` may both correctly say `8.10`; the pin in `resolvedDependencies` is what fails.

---

## Phase 1 — Triage (read before changing anything)

1. **Read the full error** — package name, locked pin, required version, dependency chain.
2. **Read manifest** — `<pkg>/<pkg>.c3pkg.json` for each writable package in the chain.
3. **Read lock file** — `<pkg>/<pkg>.c3pkg.lock.json` if present; inspect `declaredDependencies` vs manifest and `resolvedDependencies` pins.
4. **Classify** using the signature table above. If the only signal is `Missing Pkg.Decl`, treat as resolution failure and go to Phase 2A.

```
Error received
  ├─ 🔒 Locked version mismatch?                          → Phase 2A
  ├─ Missing Pkg.Decl only (no other resolution detail)?   → Phase 2A (symptom, not separate root cause)
  ├─ Declared dep wrong for the chain in .c3pkg.json?      → fix manifest OR c3-code-pkg-upgrade
  └─ Incompatible packages / cycle?                        → Phase 2B or 2C
```

**Do not edit `.c3pkg.json`** when the error is a resolved-pin mismatch and declared deps in the chain are already correct.

---

## Phase 2A — Locked version mismatch (default resolution fix)

**When:** Error shows 🔒, **`Missing Pkg.Decl` with no clearer signature**, or a `resolvedDependencies` pin cannot satisfy the required major.minor in the chain. Declared deps in `.c3pkg.json` are already correct.

**Steps:**

1. Use the error chain / `resolvedDependencies` to confirm this is a resolved-pin mismatch (not a declared-dep problem). If the error is only `Missing Pkg.Decl`, skip to step 2.
2. Delete **all** `*.c3pkg.lock.json` files in the repo:

   ```bash
   find . -name "*.c3pkg.lock.json" -delete
   ```

3. **Do not** manually edit `resolvedDependencies`.
4. **Do not** change `.c3pkg.json` declared deps unless Phase 1 showed they are wrong for the chain.
5. Proceed to **Phase 4 — Verify** (mandatory).

**Expected outcome:** Locks are regenerated on the next resolution. Empty `resolvedDependencies` in a writable lock is acceptable. `Missing Pkg.Decl` issues clear once resolution succeeds.

**Anti-pattern:** Declaring success immediately after delete without `issuesForPkg`.

---

## Phase 2B — Incompatible packages / version conflict

**When:** Multiple required versions for the same package appear in the dependency chain.

**Steps:**

1. Trace paths from the error output.
2. Identify which **declared** dependency in the chain forces the conflict.
3. Fix by aligning `.c3pkg.json` to a single compatible major.minor, or by changing/removing the conflicting direct dependency.
4. If a full version bump is needed, use **`c3-code-pkg-upgrade`** for manifest updates, then return here for Phase 4.

Manifest edits automatically invalidate stale locks via `didDeclDepsChange`; no separate lock delete is required for declared-dep changes.

---

## Phase 2C — Circular dependency

**When:** Error mentions a cycle or incompatible package with a single version and no paths.

**Steps:**

1. Map the cycle from error paths.
2. Break the cycle by restructuring dependencies (remove an edge, extract a shared package, etc.).
3. Proceed to Phase 4.

---

## Phase 3 — Resolution limit / escalation

**When:** Error mentions maximum dependency resolution attempts exceeded.

1. Summarize the dependency chain and conflicting requirements for the user.
2. Do not loop blindly on lock delete.
3. Escalate with the full error text and manifest/lock state.

---

## Phase 4 — Verify (NON-OPTIONAL)

**Rule:** Never say "fix complete" until verification passes.

### Read-only verification

Use **`PkgStoreMcp.issuesForPkg(workspaceId, <rootPkgName>)`** only.

**Pass criteria:**

- No issues with code `DEPENDENCY_RESOLUTION_ERROR`
- No ERROR-severity issues matching the original reported problem (including `Missing Pkg.Decl`)

**Do NOT call during verification:**

- `validatePkgs` — triggers revalidation and can mask or recreate issues
- `clearCaches` — side-effect repair; not a read-only check

Optional secondary read-only check: `readPkgIssues` (AppMCP).

**Do NOT manually delete `gen/cache/Pkg.Issue/`** — issues are platform-managed; verify via `issuesForPkg`.

### Timing

Dependency resolution after lock delete is **asynchronous** and often takes **1–2 minutes**.

1. Wait **5 seconds** after applying the fix.
2. Call `issuesForPkg`.
3. If not clear, wait **5 seconds** and call `issuesForPkg` again.
4. Repeat for up to **120 seconds** total (~24 polls).
5. If still failing after 120s, report: fix applied, verification timed out, include latest `issuesForPkg` output. **Do not claim success.**

If `issuesForPkg` is clean but the UI overlay still shows the error, trust MCP and report success with a note about possible UI staleness.

---

## Phase 5 — Report to user

Include:

- **Root cause** — bad resolved pin vs declared-dep conflict vs cycle
- **Changes made** — files deleted or edited
- **Verification** — `issuesForPkg` result (or timeout status)
- **Remaining warnings** — if any, distinguish from the original ERROR

---

## Anti-patterns

| Don't | Do instead |
| ----- | ---------- |
| Treat `Missing Pkg.Decl` as a store-config or Zip-store problem | Fix resolution failure (Phase 2A/2B/2C) |
| Compare `.c3pkg.json` to lock and delete lock when `declaredDependencies` differs | Trust auto-ignore; fix manifest if needed |
| Treat locked version mismatch as manifest vs lock declared-deps mismatch | Delete all `*.c3pkg.lock.json` files |
| Use `c3-code-pkg-upgrade` for resolved-pin mismatches without verify | Use this skill |
| Delete lock and declare done | Delete all locks → Phase 4 poll |
| Edit lock pins by hand | Delete all `*.c3pkg.lock.json` files |
| Assume empty `resolvedDependencies` means failure | Verify via `issuesForPkg` |
| Call `validatePkgs` during verify | Poll `issuesForPkg` only |
| Trust Fix-with-AI overlay alone | Trust `issuesForPkg` over overlay |
| Delete only the lock named in the error | Delete all `*.c3pkg.lock.json` files |
| Manually delete `gen/cache/Pkg.Issue/` | Poll `issuesForPkg` |
