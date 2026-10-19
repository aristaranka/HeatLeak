# C3 Runtime Creation

Create custom Python and JavaScript runtimes with specific libraries and dependencies.

## Prerequisites (MUST VERIFY FIRST)

**CRITICAL: Verify ALL prerequisites before proceeding. If ANY are missing, STOP IMMEDIATELY and ask the user to remediate. Do NOT attempt to fix or work around missing prerequisites yourself.**

### Required Prerequisites

1. **Single Node Environment (SNE)**: Runtime creation only works in Single Node Environments where the package store is writable (runtimes are C3 Metadata)
2. **MCP Server**: An MCP server must be enabled for your application
   - Server name format: `C3Ai-<envname>-<appname>` (e.g., `C3Ai-dev-myapp`)
3. **Required MCP Tools**: Both tools must be available:
   - `runPyCode` - Execute Python code on the server
   - `runJsCode` - Execute JavaScript code on the server

### Verification Steps

Use `tool_search_tool_regex` to search for `mcp.*runPyCode|mcp.*runJsCode` to verify the tools are available.

### If Prerequisites Are NOT Met

**STOP IMMEDIATELY. Do NOT:**

- Try to use `c3-mcp-cli` as a workaround
- Suggest the user manually run code on the server
- Create notebooks or scripts for manual execution
- Attempt any other remediation

**Instead, inform the user:**

- If running in a Multi-node environment: They must switch to a Single Node Environment
- If MCP server is missing: They must configure the C3 MCP server for their application
- If `runPyCode`/`runJsCode` tools are missing: They must enable these tools in their MCP server configuration

**Only proceed with the workflow below once all prerequisites are confirmed.**

## Quick Decision

| Need | Action |
| --- | --- |
| Add Python Conda or pip library for C3 Python Actions | Check existing -> Create if needed -> Install |
| Add JavaScript NPM library for C3 JavaScript Actions in Node.js | Check existing -> Create if needed -> Install |
| Add NPM package for SDL UI | Extend `js-webpack_c3` -> Upsert -> Generate bundles |
| Check if runtime exists | `c3.ImplLanguage.Runtime.fetch({"filter": "contains(name, 'xyz')"})` |

## Python Runtime Workflow

1. **Check existing by library**: `c3.Py.Runtime.fetch({"filter": "contains(name, '<library>')"})`
2. **Check name not taken**: `c3.ImplLanguage.Runtime.forName('py-myruntime')` - returns `None` if available
3. **Select parent**: Use `py-data_312` (8.9+) or `py-data` (8.8 and earlier)
4. **Define runtime**:
   ```python
   runtime = c3.ImplLanguage.Runtime.fromJson({
       "name": "py-myruntime",
       "languageVersion": "3.12",
       "libraries": ["conda mypackage"],  # Prefer conda over pip
       "repositories": ["conda-forge", "defaults"],
       "parents": ["py-data_312"]
   })
   ```
5. **Upsert**: `result = c3.Py.upsertRuntime(runtime)`. Note that this could take several minutes!
6. **Check errors**: `result["errors"]` - Empty dict means success
7. **Install**: Use the installation workflow in the parent SKILL.md

**Note:** `upsertRuntime` will **overwrite** an existing runtime with the same name. Always verify the name is available or intentionally updating.

## JavaScript Runtime Workflow (server-side actions)

You can create JS runtimes for when you want to run logic that relies on libraries from the NPM ecosystem.

1. **Check existing by library**: `Js.Runtime.fetch({"filter": "contains(name, '<library>')"})`
2. **Check name not taken**: `ImplLanguage.Runtime.forName('js-myruntime')` - returns `None` if available
3. **Define runtime**:

```js
var runtime = ImplLanguage.Runtime.fromJson({
  name: 'js-myruntime',
  libraries: ['npm lodash@4.17'],
});
```

4. **Upsert**:

```js
var result = Js.upsertRuntime(runtime, 'client');
```

5. **Check errors**: `result["errors"]` - Empty dict means success
6. **Install**: Use the installation workflow in the parent SKILL.md

**Note:** `upsertRuntime` will **overwrite** an existing runtime with the same name. Always verify the name is available or intentionally updating.

## UI SDL Workflow

When using UI SDL for front-end development, you can extend the `js-webpack_c3` runtime to install libraries from the NPM ecosystem so you can leverage them when developing the front-end of the application. For SDL (unlike NPM actions), we prefer to update `js-webpack_c3` over creating a new runtime.

1. **Check existing**: Review `js-webpack_c3` libraries first - `ImplLanguage.Runtime.forName('js-webpack_c3').toJson()`
2. **Add packages**:
   ```js
   var runtime = ImplLanguage.Runtime.fromJson({
     name: 'js-webpack_c3',
     libraries: ['npm @mui/material@7.1.0'],
   });
   var result = Js.upsertRuntime(runtime, 'client');
   ```
3. **Check errors**: `result.errors` - Empty object means success
4. **Generate bundles**: `UiBundler.generateBundles()`

**Note:** For JavaScript in SDL, you typically extend `js-webpack_c3` (same name), so upsert adds to the existing runtime.

## Handling Dependency Conflicts

Both `upsertRuntime` methods return `{seededRuntimes: {}, errors: {}}`.

**Check for errors:**

```python
result = c3.Py.upsertRuntime(runtime)
if result["errors"]:
    print(result["errors"])  # Shows conda/pip conflict details
```

**Resolution strategies:**

1. Check for existing compatible runtimes
2. Use compatible version combinations
3. Remove conflicting version constraints
