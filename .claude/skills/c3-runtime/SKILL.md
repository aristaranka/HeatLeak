---
name: c3-runtime
description: |
  Install, create, and manage runtimes for C3 AI applications. Use when working with application code that requires specific runtime dependencies, adding new libraries/packages to runtimes, defining runtime dependencies, resolving version conflicts, or setting up custom execution environments. Covers async runtime installation, status polling, verification, checking existing runtimes, parent selection, upsertRuntime workflow, and dependency conflict resolution.
core: true
category: platform
version: 8.9.0
minimumVersion: 8.7.0
---

# C3 AI Runtime Management

Runtimes provide the execution environment (Python libraries, JavaScript packages) for C3 application code. This skill covers creating, installing, and managing runtimes.

## Reference Dispatch

| Task | Reference File |
| --- | --- |
| **Creating** custom Python/JS runtimes — prerequisites, upsertRuntime, dependency conflicts | Load `references/creation/creation.md` |
| **Python** runtime details — naming conventions, parent runtimes, library formats, troubleshooting | Load `references/python/python.md` |
| **JavaScript** runtime details — creating JS runtimes, verifying packages, troubleshooting | Load `references/javascript/javascript.md` |
| **Installing** runtimes — async workflow, polling, verification | Continue reading below |

## Quick Decision

| Need | Action |
| --- | --- |
| Install an existing runtime for code execution | Use the installation workflow below |
| Add Python Conda or pip library for C3 Python Actions | Load `references/creation/creation.md` |
| Add JavaScript NPM library for C3 JS Actions in Node.js | Load `references/creation/creation.md` |
| Add NPM package for SDL UI | Load `references/creation/creation.md` (UI SDL section) |
| Check if runtime exists | `c3.ImplLanguage.Runtime.fetch({"filter": "contains(name, 'xyz')"})` |

---

## Runtime Installation

Before executing any application code on the C3 platform, the required runtime must be installed. Runtime installation is an **async operation** that can take 2-15 minutes.

| Parameter | Description |
| --- | --- |
| `RUNTIME_NAME` | The `Action.Requirement` name to install. For server-side Python runtimes this is the runtime name with `-server-py4j` appended (e.g. `py-data-server-py4j`). |

**Example Action.Requirement names:**

- `py-timeseriesanalysis-server-py4j`
- `py-huggingface_312-server-py4j`

**Note:** The runtime will only become usable when `isInstalled` returns `True` and async action reports `hasCompleted()`.

### Agent Workflow

**CRITICAL**: When starting work on a C3 AI application:

| Step | Action | Details |
| --- | --- | --- |
| 1 | Check if runtime is installed | If `True`, skip to Step 5 |
| 2 | Submit async installation | Save the `action_id` for polling |
| 3 | Continue non-blocking tasks | Work on tasks that don't require execution |
| 4 | Poll every 60 seconds | Check `hasCompleted()` and errors |
| 5 | Execute runtime-dependent code | Only after successful installation |

### Non-Blocking Tasks (Step 3)

While runtime installs, work on:

- Writing React components and pages
- Creating C3 type definitions (.c3typ files)
- Writing implementation files (.py, .js)
- Creating seed data JSON files
- Planning ML workflows and architecture
- Setting up test file structure

### After Installation (Step 5)

- Run code on the application that requires a runtime
- Run fetch calls, upsert data (these don't require a runtime)
- Do NOT run functions requiring runtime before installation completes

### Code Reference

#### 1. Check if Installed

```python
RUNTIME_NAME = "<RUNTIME_NAME>"  # Action.Requirement name, e.g. "py-data-server-py4j"

runtime = c3.Py.Runtime.forName(RUNTIME_NAME)
is_installed = c3.Py.libraryManager().isInstalled(runtime)
print(f"Runtime installed: {is_installed}")
```

#### 2. Submit Async Installation

```python
RUNTIME_NAME = "<RUNTIME_NAME>"  # Action.Requirement name, e.g. "py-data-server-py4j"

spec = c3.AsyncActionSpec(
    typeName="CondaLibraryManager",
    action="installRuntime",
    args={"runtime": c3.Py.Runtime.forName(RUNTIME_NAME)}
)
action = c3.AsyncAction.submit(spec)
action_id = action.id  # SAVE THIS - needed for polling
print(f"Runtime install started. Action ID: {action_id}")
```

#### 3. Poll Status & Check Errors

```python
# Poll using saved action_id (run every ~60 seconds)
action = c3.AsyncAction.forId(action_id).get()

if action.hasCompleted():
    if hasattr(action, 'statusMessage') and action.statusMessage:
        print(f"Status: {action.statusMessage}")
    if hasattr(action, 'error') and action.error:
        print(f"ERROR: {action.error}")
    if hasattr(action, 'errorMessage') and action.errorMessage:
        print(f"ERROR: {action.errorMessage}")

    runtime = c3.Py.Runtime.forName(RUNTIME_NAME)
    if c3.Py.libraryManager().isInstalled(runtime):
        print("SUCCESS: Runtime installed")
    else:
        print("FAILED: Action completed but runtime not installed")
        print(action)
else:
    print("Still installing... poll again in 60 seconds")
```

#### 4. List All Installed Runtimes (JS)

```javascript
var installed = Py.Runtime.fetch().objs.filter(function (t) {
  return Py.libraryManager().isInstalled(Py.Runtime.forName(t.name));
});
console.log(installed);
```
