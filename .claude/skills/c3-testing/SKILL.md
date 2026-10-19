---
name: c3-testing
description: |
  Write and run tests on the C3 AI Platform. Use when the agent needs to:
  (1) Write Jasmine (JavaScript) tests with TestApi
  (2) Write pytest (Python) tests
  (3) Write poly tests (.c3poly.md) for cross-runtime validation
  (4) Run tests via TestRunner from the console
  (5) Set up test data with TestApi lifecycle
  (6) Mock functions with TestApi.spyOn
  (7) Write notebook tests
  (8) Jasmine test structure and conventions
  (9) pytest file conventions and fixtures
core: true
category: platform
version: 8.9.0
minimumVersion: 8.7.0
metadata:
  dependencies:
    - c3-backend-code
---

# C3 AI Testing Framework

> **When to use this skill:** This skill covers **formal automated tests** (Jasmine/pytest suites). Writing formal tests is **opt-in** — use it when the user asks for tests, or when hardening a working app at the user's request. It is **not** a default step of every app build: while building, lightweight smoke checks (a `runJsCode` shape check per custom method, type-check, lint, a quick "does the page render / does fetch return data" check) are sufficient and do not require this skill. When you do write formal tests, focus on **non-trivial business logic**, not trivial glue or purely presentational components.

The C3 AI Platform supports Jasmine (JavaScript), pytest (Python), poly tests (cross-runtime), and notebook tests. Tests run within an application context and are executed using `TestRunner`.

## Reference Dispatch

| Task                                                                                        | Reference File                  |
| ------------------------------------------------------------------------------------------- | ------------------------------- |
| Writing **Jasmine (JavaScript)** tests — structure, TestApi, spies, assertions, conventions | Load `references/js-testing.md` |
| Writing **pytest (Python)** tests — file conventions, fixtures, assertions, mocking         | Load `references/py-testing.md` |
| Running tests, poly tests, notebook tests, TestRunner configuration                         | Continue reading below          |

## MANDATORY: testtools Dependency

**MANDATORY FIRST STEP**: You MUST read the project's `c3pkg.json` file and verify that `testtools` is listed in `dependencies` BEFORE writing any test. If it is missing, you MUST add it. Do NOT skip this check — tests will fail without it.

`TestApi` (used for test lifecycle, entity tracking, tear-down, and spying) is provided by the **`testtools`** package. The dependency entry must look like:

```json
{
  "dependencies": {
    "testtools": "*"
  }
}
```

Without this dependency, `TestApi` won't be available at runtime and tests that call `TestApi.createContext`, `TestApi.teardown`, etc. will fail with a type-not-found error.

## Quick Reference

All static functions on `TestRunner`. In JS call directly; in Python prefix with `c3.`, use Python booleans, and pass lambdas instead of functions (e.g. `c3.TestRunner.forPackage(False).run()`, `c3.TestRunner.asUser('user', lambda: ...)`).

| Operation                  | Example                                                                  |
| -------------------------- | ------------------------------------------------------------------------ |
| Run all package tests      | `TestRunner.forPackage(false).run()`                                     |
| Run specific test by name  | `TestRunner.make().withTestNameGlob('test_name').run()`                  |
| Run tests matching pattern | `TestRunner.make().withTestPathGlob('test/js-rhino/functional/*').run()` |
| Run as specific user       | `TestRunner.asUser('username', function() { /* ... */ })`                |
| Run as specific role       | `TestRunner.asRole('rolename', function() { /* ... */ })`                |

## Test File Locations

| Language             | Location                        | Naming             |
| -------------------- | ------------------------------- | ------------------ |
| JavaScript (Jasmine) | `test/js-{runtime}/{category}/` | `test_{Type}.js`   |
| Python (pytest)      | `test/{action-requirement}/`    | `test_<name>.py`   |
| Poly tests           | `test/poly/<path>/`             | `<Name>.c3poly.md` |

JS runtimes: `js-rhino` (default), `js-client`, `js-node`. Categories: `unit`, `functional`, `integration`, `performance`, `reliability`, `scalability`, `security`.

## Running Tests

Use this priority order:

1. **App MCP `runTest`** (preferred) — pass a glob pattern like `**/test_MyType.js`.
2. **App MCP `runJsCode`** (fallback) — execute `TestRunner.make().withTestNameGlob('test_MyType').run()`.
3. **Console** (last resort) — instruct the user to run TestRunner commands directly.

For full examples and MCP tool signatures, see `references/js-testing.md` § Running Tests.

## TestApi Reference

All static functions. In JS call directly (e.g. `TestApi.createContext(...)`); in Python prefix with `c3.` (e.g. `c3.TestApi.createContext(...)`).

| Method                                                                    | Description                                   |
| ------------------------------------------------------------------------- | --------------------------------------------- |
| `TestApi.createContext(filename, parent, queueBlacklist)`                 | Create test execution context                 |
| `TestApi.createBatchEntity(ctx, Type, objs, spec)`                        | Create tracked entities; returns array of IDs |
| `TestApi.createEntity(ctx, Type, obj)`                                    | Create a single tracked entity                |
| `TestApi.upsertEntity(ctx, Type, obj, spec)`                              | Upsert tracked entity                         |
| `TestApi.waitForSetup(ctx, queues, checkInterval, timeout)`               | Wait for async actions to complete            |
| `TestApi.waitForJob(ctx, job, checkInterval, timeout)`                    | Wait for batch/MR/Workflow job                |
| `TestApi.waitForFunction(callable, errorMessage, checkInterval, timeout)` | Wait for arbitrary condition                  |
| `TestApi.teardown(ctx, timeLimit, queues)`                                | Remove all tracked entities                   |
| `TestApi.spyOn(ctx, Type, actionName)`                                    | Mock any function using Action.Spy            |
| `TestApi.spyOnFetch(ctx, Type, ...)`                                      | Mock fetch calls                              |
| `TestApi.removeEntity(ctx, id)`                                           | Remove a single tracked entity                |

### `waitForSetup`

**Rule:** every `beforeAll` that calls `createBatchEntity` or `createEntity` must call `TestApi.waitForSetup(this.ctx)` after that creation.

1. **Always call it** after entity creation — do not skip because the type looks simple. Creation can trigger async work (calc fields, normalization, queues). Missing `waitForSetup` causes flaky tests; calling it when queues are idle is low cost.
2. **Place it right after creation** — call it once all `createBatchEntity` / `createEntity` calls in that `beforeAll` are done. Other setup in the same hook may follow (e.g. `this.expectedCount = this.ids.length`).
3. **Nested `beforeAll` blocks** that create their own entities need their own `waitForSetup` after that block's creation.

```javascript
beforeAll(function () {
  this.ctx = TestApi.createContext(filename);
  this.offlineIds = TestApi.createBatchEntity(this.ctx, MyType, [
    /* ... */
  ]);
  TestApi.waitForSetup(this.ctx);
  this.expectedCount = this.offlineIds.length;
});
```

## Impersonation (all static functions on TestRunner)

```javascript
TestRunner.asUser('testuser', function () {
  /* run as user */
});
TestRunner.asRole('testrole', function () {
  /* run as role */
});
TestRunner.asWorker(function () {
  /* run as worker */
});
```

## Poly Tests (.c3poly.md)

> **Note:** Poly tests are primarily used for platform development to ensure core APIs behave consistently across all runtimes. They aren't typically needed for application development.

Cross-runtime tests that validate APIs work consistently across Java, JavaScript (Rhino, Node, Browser), and Python.

File location: `<pkg>/test/poly/<path>/<Name>.c3poly.md`

### Format

```markdown
# MyType

## basicOperation

### make and access field

\`\`\`
obj = MyType.make({field: 'value'})
obj.field === 'value'
\`\`\`

### null handling

\`\`\`
obj = MyType.make()
obj.field == null
\`\`\`

### error case

\`\`\`
MyType.make({field: -1}).validate() // throws
\`\`\`
```

### Syntax

| Syntax                  | Meaning                                                 |
| ----------------------- | ------------------------------------------------------- |
| `===`                   | Strict equality assertion                               |
| `==`                    | Value equality assertion                                |
| `// throws`             | Expression should throw an error                        |
| ` ```x: py PLAT-12345 ` | Ignore this test block for Python (with JIRA reference) |

### Generating and Running

```bash
./v8 poly-gen
```

Produces 5 test variants in `<pkg>/test/java/c3/<pkg>/poly/<path>/gen/`.

## Notebook Tests

Jupyter notebooks can be published as tests. Cell-level configuration controls:

- Whether a cell always executes
- Timeout per cell
- Output checking (exact match or regex)

Tests run in a separate kernel session.

## TestRunner Configuration

### TestRunnerConfig

| Field               | Type         | Default | Description                |
| ------------------- | ------------ | ------- | -------------------------- |
| `tests`             | `[Pkg.File]` |         | Specific tests to run      |
| `excludedTests`     | `[Pkg.File]` |         | Tests to exclude           |
| `includePatterns`   | `[string]`   |         | Regex patterns to include  |
| `includeCategories` | `[string]`   |         | Test categories to include |
| `excludeCategories` | `[string]`   |         | Test categories to exclude |
| `stopOnFailure`     | boolean      | false   | Stop on first failure      |
| `batchSize`         | int          | 500     | Number of tests per batch  |

### TestResult

`TestResult` tracks test execution outcomes including total tests, errors, failures, warnings, skipped, passed counts, and pass percentage. Use `printErrorsAndFailures()` to display failures and `anyErrorsOrFailures()` to check programmatically.

## Best Practices

- Place test files in the correct directory for the chosen language (see **Test File Locations** table).
- Unit tests cover basic method behavior; integration tests cover end-to-end flows.
- Use `TestRunner.asUser()` / `asRole()` for security-related tests.
- Always run `./v8 poly-gen` after editing `.c3poly.md` files.
- Use random/unique values for test IDs and unique fields to avoid false positives from leftover data.

For language-specific best practices, see the corresponding reference file:

- **Jasmine (JavaScript):** `references/js-testing.md` § Best Practices
- **pytest (Python):** `references/py-testing.md` § Best Practices

## Completion Checklist

Before finishing, verify you have completed ALL of the following:

- [ ] Read `c3pkg.json` and confirmed `"testtools"` is listed in `"dependencies"` — if missing, you MUST add `"testtools": "*"` to the dependencies object
- [ ] Test file placed in the correct directory for the chosen language (see **Test File Locations** table above)
- [ ] (Jasmine) Every `beforeAll` that creates entities calls `TestApi.waitForSetup(this.ctx)` after that creation
- [ ] Test assertions verify the method under test behaves correctly
- [ ] Test data is cleaned up after execution (no leftover entities)

For language-specific checklist items, see the corresponding reference file:

- **Jasmine (JavaScript):** `references/js-testing.md` § Completion Checklist
- **pytest (Python):** `references/py-testing.md` § Completion Checklist
