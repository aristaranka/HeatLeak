# Testing C3 Instructions — Jasmine (JavaScript)

These guidelines apply to all Jasmine unit test files under a `test/js*` directory (for example `test/js-rhino/`, `test/js-client/`, `test/js-node/`). Use the folder your Type targets; the patterns below are the same across runtimes unless noted.

**C3 JavaScript in tests:** For C3 JS APIs—`make`, `forId`, `get`, `fetch`, `Filter`, collections, error handling, and worked examples—see the `c3-javascript` skill. This document focuses on **Jasmine structure**, **TestApi**, spies, and **test-specific** conventions; use that guide whenever you implement or review SDK calls inside specs (including CRUD and filtering details, which also point to `c3-persistable` from there).

## Quick Rules (CRITICAL)

These three rules cause the most test failures. Follow them every time.

### C3 Array Iteration

C3 methods returning `[Type]` return **C3 Arrays**, not native JavaScript arrays. C3 Arrays do **NOT** have `.forEach()`. Use `.each()` instead:

```js
// CORRECT — .each() works on C3 Arrays
result.each((turbine) => {
  expect(turbine.status)
    .withContext('Turbine ' + turbine.id)
    .toBe('Offline');
});

// WRONG — .forEach() does not exist on C3 Arrays (runtime error)
result.forEach((turbine) => {
  expect(turbine.status).toBe('Offline');
});
```

### One Assertion Per Spec

Exactly **one** top-level `expect(...)` per `it` block. Split different behaviors into separate `it` blocks.

**Loop exception:** When every element must satisfy the same check, use **one** `it` with one `expect` inside a `.each()` loop — that counts as one logical assertion. Always add `.withContext()` so failures identify which element failed.

**Pure assertion rule:** An `it` block should be a **pure assertion** — it should only read state and assert. **NEVER** create entities, call `waitForSetup`, call mutating methods, or use try/catch inside an `it` block. All setup (entity creation, method invocation, waiting) belongs in `beforeAll`. The `it` body should contain only: (1) a read-only call to the method under test (e.g. `Turbine.fetchOfflineTurbines()`), OR (2) a reference to a value stored in `this.*` by `beforeAll`, followed by one `expect`.

```js
// CORRECT — count in one spec, status check in another
it('returns the expected number of offline turbines', function () {
  var result = Turbine.fetchOfflineTurbines();
  expect(result.length).toBe(this.expectedOfflineCount);
});

it('only returns turbines with Offline status', function () {
  var result = Turbine.fetchOfflineTurbines();
  result.each((t) => {
    expect(t.status)
      .withContext('Turbine ' + t.id)
      .toBe('Offline');
  });
});

// WRONG — multiple unrelated assertions in one spec
it('returns offline turbines', function () {
  var result = Turbine.fetchOfflineTurbines();
  expect(result).toBeDefined();
  expect(result.length).toBe(5);
  result.each((t) => {
    expect(t.status).toBe('Offline');
  });
});

// WRONG — creating entities or calling mutating methods inside it
it('excludes operational turbines from results', function () {
  var operationalId = TestApi.createEntity(this.ctx, Turbine, {
    status: 'Operational',
  }).get().id;
  TestApi.waitForSetup(this.ctx); // NEVER do setup inside it
  var result = Turbine.fetchOfflineTurbines();
  expect(result.mapToStr((t) => t.id).contains(operationalId)).toBeFalse();
});

// CORRECT — exclusion data created in beforeAll, it only asserts
it('excludes operational turbines from results', function () {
  this.operationalIds.each((id) => {
    expect(this.results.contains(id))
      .withContext('Operational turbine ' + id + ' should be excluded')
      .toBeFalse();
  });
});
```

### No Redundant Presence Checks

Do **not** use `expect(x).toBeDefined()` or `expect(x).toBeTruthy()` when the same `it` already asserts on `x.length`, `x.field`, or any property — the property assertion already fails if `x` is missing.

```js
// WRONG — toBeDefined is redundant; .length already fails if result is missing
expect(result).toBeDefined();
expect(result.length).toBe(5);

// CORRECT — just assert what matters
expect(result.length).toBe(5);
```

## Running Tests

Use the following priority order when running tests:

### 1. App MCP `runTest` Tool (Preferred)

If an App MCP server (`C3AI-*`) is available, check for a **`runTest`** tool first. This is the preferred way to run tests because it handles execution and returns results in YAML format.

**Signature:** `runTest(testPath)`: accepts a glob pattern within the test folder.

```
MCP tool: runTest
Arguments: { "testPath": "**/test_MyType.js" }
```

The `testPath` argument is a glob pattern matching files in the `test/` folder. Examples:

| What to run                 | `testPath` value          |
| --------------------------- | ------------------------- |
| A specific JS test file     | `**/test_MyType.js`       |
| A specific Python test file | `**/test_my_feature.py`   |
| All tests in a directory    | `**/functional/test_*.js` |
| A single test by exact name | `test_MyService`          |

The tool returns the test result in **YAML format** with test suite details (pass/fail per spec, error messages). Under the hood it calls `TestRunner.make().withTestNameGlob(testPath).run()`.

If `runTest` is available, use it. If the tool isn't available or the call fails, fall back to option 2.

### 2. App MCP `runJsCode` + TestRunner (Fallback)

If `runTest` isn't available but the App MCP server exposes **`runJsCode`**, use it to execute TestRunner commands:

```
MCP tool: runJsCode
Arguments: { "code": "TestRunner.make().withTestNameGlob('test_MyType').run()" }
```

Common TestRunner patterns using `runJsCode`:

| Operation                       | Code                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Run all package tests           | `TestRunner.forPackage(false).run()`                                                                   |
| Run specific test by name       | `TestRunner.make().withTestNameGlob('test_name').run()`                                                |
| Run tests matching path pattern | `TestRunner.make().withTestPathGlob('test/js-rhino/functional/*').run()`                               |
| Run as specific user            | `TestRunner.asUser('testuser', function() { TestRunner.make().withTestNameGlob('test_name').run(); })` |
| Run as specific role            | `TestRunner.asRole('testrole', function() { TestRunner.make().withTestNameGlob('test_name').run(); })` |

### 3. Console (Last Resort)

If no App MCP server is available, instruct the user to run TestRunner commands directly in the C3 console:

```javascript
TestRunner.make().withTestNameGlob('test_MyType').run();
```

### Discovering Available MCP Tools

At the start of a testing Workflow, check which App MCP tools are available:

1. Look for an MCP server matching `C3AI-*` (for example `C3AI-drkjwsne-windturbinetest`).
2. If found, check if `runTest` tool exists and use it.
3. If `runTest` isn't available, check for `runJsCode` and use that with TestRunner.
4. If neither is available, fall back to console instructions.

## Required testtools Dependency

`TestApi` (used for test lifecycle, entity tracking, tear-down, and spying) is provided by the **`testtools`** package. Before writing any test that references `TestApi`, confirm that your application's `c3pkg.json` includes `testtools` in its `dependencies`:

```json
{
  "dependencies": {
    "testtools": "*"
  }
}
```

Without this dependency, `TestApi` won't be available at runtime and tests that call `TestApi.createContext`, `TestApi.teardown`, etc. will fail with a type-not-found error.

## Test Framework & File Structure

- Use **Jasmine** for tests (`describe`, `it`, `expect`, `beforeAll`, `afterAll`).
- Place test files under the appropriate `test/js*` tree (use `js-rhino` if you don't know) with names like `test_<TypeName>.js`. For inner types mirror the type name (e.g. `test_MyPackage.MyType.js`).

  ```js
  /**
   * Unit tests for MyPackage.MyType.
   */
  const filename = 'test_MyPackage.MyType';
  ```

## Describe layout

- Outer `describe(filename, …)` wraps the whole file.
- Prefer **nested** `describe` blocks that mirror structure: type under test → `#methodName` (or logical grouping) → optional scenario blocks (`when feature flag is true`, etc.).
- Put **top-level** `beforeAll` / `afterAll` immediately after the outer `describe` opens: `createContext`, entity creation (if any), `TestApi.waitForSetup(this.ctx)` when entities are created, then `afterAll` with `TestApi.teardown(this.ctx)` before nested suites.

## Function syntax: `function` vs arrow functions

- **Never** use arrow functions for **`describe`**, **`it`**, **`beforeAll`**, **`afterAll`**, **`beforeEach`**, or **`afterEach`**. Those hooks **must** use a classic **`function () { … }`** callback so Jasmine can bind **`this`** to the suite/spec context (`this.ctx`, `this.person`, etc.). Arrow callbacks do not get Jasmine's `this` and break fixture access.

- **Inner callbacks** (arguments to `.mapToStr`, `.each`, `.filter`, `expect(() => { … })`, etc.): **arrow functions are preferred** when the callback does not need its own dynamic `this` from the callee. They stay short, match the collection examples below, and still see the enclosing spec's `this` lexically.

- **Exception:** if a C3 or host API invokes your callback with a meaningful **`this`** you must read, use `function (…) { … }` for that callback (rare in tests).

## C3 Array Iteration

C3 methods that return `[Type]` (e.g., `Turbine.fetchOfflineTurbines(): [Turbine]`) return **C3 Arrays**, not native JavaScript arrays. C3 Arrays do **NOT** have `.forEach()`. Use `.each()` instead:

```js
// Correct — .each() works on C3 Arrays
result.each((turbine) => {
  expect(turbine.status).toBe('Offline');
});

// WRONG — .forEach() does not exist on C3 Arrays (runtime error)
result.forEach((turbine) => {
  expect(turbine.status).toBe('Offline');
});
```

Other C3 Array methods: `.map()`, `.mapToStr()`, `.filter()`, `.contains()`, `.length`, `.get(index)`.

## Context setup and teardown

Every `beforeAll` that creates entities must call `TestApi.waitForSetup(this.ctx)` after that creation. Do not skip — entity creation can trigger async work (calc fields, normalization); missing `waitForSetup` causes flaky tests. Other setup lines in the same hook may follow `waitForSetup` (e.g. caching counts or IDs).

- In the outer `beforeAll`:

  ```js
  beforeAll(function () {
    this.now = DateTime.now(); // optional, for time-based tests
    this.ctx = TestApi.createContext(filename);
    this.entityIds = TestApi.createBatchEntity(this.ctx, MyType, [
      /* ... */
    ]);
    TestApi.waitForSetup(this.ctx);
    this.expectedCount = this.entityIds.length;
  });
  ```

- In the outer `afterAll`:

  ```js
  afterAll(function () {
    TestApi.teardown(this.ctx);
  });
  ```

- Nested `beforeAll` blocks that call `createBatchEntity` or `createEntity` need their own `TestApi.waitForSetup(this.ctx)` after that block's creation.

## Creating test objects

- **Entity types**: pass the **type reference** (for example `Person`, `MyPackage.MyType`) to `TestApi.createEntity`, not a string literal. The API ultimately resolves a type name string; using the reference coerces to that name and **fails fast** if the type is missing, renamed, or not in scope—instead of a late, harder-to-diagnose error from a stale or mistyped string.

  ```js
  this.myEntity = TestApi.createEntity(this.ctx, MyPackage.MyType, {
    /* required fields */
  }).get();
  ```

- **Batch creation**: `TestApi.createBatchEntity(ctx, Type, [obj1, obj2, ...])` persists every object in the array (each is usually `Type.make({ ... })` or a plain field map, depending on what your runtime accepts). It returns an **array of created entity ids**, with **the same length** as the input array—use that return value for cleanup tracking and for **count assertions** so the expected number stays tied to the batch, not a magic integer.

  ```js
  beforeAll(function () {
    this.entityIds = TestApi.createBatchEntity(this.ctx, MyPackage.MyType, [
      MyPackage.MyType.make({ parent: this.parent /* fields */ }),
      MyPackage.MyType.make({ parent: this.parent /* fields */ }),
    ]);
    TestApi.waitForSetup(this.ctx);
    this.expectedCount = this.entityIds.length;
  });

  it('returns one row per created entity', function () {
    expect(MyPackage.MyType.fetchCount({ filter: Filter.eq('parent', this.parent.id) })).toEqual(this.expectedCount);
  });
  ```

  To load instances: `this.entities = this.entityIds.map((id) => MyPackage.MyType.forId(id) );` (or equivalent).

- **Filtered counts and scoped queries:** When you assert a **count or fetch** that applies a **filter** (e.g. by assignee, status, parent), add **extra persisted rows that must be excluded**—same or related type, same "neighborhood" (shared project, tenant, etc.) where plausible—so the test still fails if the implementation accidentally drops the filter and returns a global or parent-only count. Examples: tasks **without** the assignee field set, tasks assigned to **another** person, entities with a **different** status than the one under test.

- **Non-entity / value types**: use `.make()`

  ```js
  this.value = ValueType.make({ field: 1, name: 'A' });
  ```

- Use **`Str.randomSuffix()`** (and similar) for unique strings so tests do not collide.
- Ensure every field you pass exists on the type in `.c3typ`. Do not invent fields.
- Do **not** add a `meta` field; the platform adds it.
- Verify the `.c3typ` exists before creating instances.

### Test fixture fields (what to put in `createEntity` / `make` payloads)

Read the `.c3typ` and only supply what the scenario needs. Avoid decorative literals that do not affect the behavior under test.

1. **Optional field, not relevant to this spec:** omit it (do not pass the key). Rely on platform defaults. Do not fill optional fields "to look realistic" unless the code under test reads them.
2. **Required field, any valid value is fine:** use `Str.randomSuffix()` (or a stable pattern like `Str.randomSuffix() + '@test.example'` for emails) so instances are unique and collisions are unlikely.
3. **Required field with a real constraint:** set it deliberately—e.g. enum literals allowed by the type, foreign keys to entities you created in the same `beforeAll`, exact strings or numbers your `expect` asserts on, ordered values for sort tests, or flags like `status` when the method filters on them.

If you are unsure whether a field is optional, check the `.c3typ` (`!` means required; `= default` means you may omit).

**Concrete contrast (same type, different specs):** Suppose `Person` has required `email` and optional `firstName`, `lastName`, and `status`. Testing **`Person.getById`** only needs a row to exist—the method does not read name or status—so the payload should be minimal. Do **not** copy a "realistic" profile into every `createEntity` out of habit.

```js
// Good: #getById only needs a persisted id; omit optional fields the code under test never reads
this.person = TestApi.createEntity(this.ctx, Person, {
  email: Str.randomSuffix() + '@test.example',
}).get();

// Avoid: filling optional fields for decoration when this spec does not assert on them
this.person = TestApi.createEntity(this.ctx, Person, {
  email: Str.randomSuffix() + '@test.example',
  firstName: Str.randomSuffix(),
  lastName: Str.randomSuffix(),
  status: 'Active',
}).get();
```

For **`Person.getFullName`**, you **must** set `firstName` and/or `lastName` when those values drive the expected string—but you should still omit **unrelated** optional fields (for example `status`) if the member method does not use them.

### Dynamic variables (inputs and expectations)

When the code under test **derives** its output from field values (concatenation, formatting, mapping), use **variables for inputs** and **derive the expected value** from those variables instead of hardcoding the final string (or number) in the `it`.

- In `beforeAll`, set **`this.input*`** fields with `Str.randomSuffix()` or other generators when any string will do; pass them into `createEntity` / `make`.
- Assign **`this.expected*`** in the same `beforeAll` when helpful, computed from the same variables using the same rules as the implementation (e.g. `(this.firstName + ' ' + this.lastName).trim()`).
- In `it`, call the method under test **inline inside `expect(...)`** when a single spec only needs that return value once (e.g. `expect(Person.getById(this.person.id).id).toEqual(this.person.id)` or `expect(this.person.getFullName()).toEqual(this.expectedFullName)`).
- Avoid **magic literals** in `expect` when the value is fully determined by setup—prefer `this.expected*` (or `this.taskIds.length`, batch counts, etc.) over hardcoded numbers or strings.
- **Fixed contract** values (enum member, required error substring, implementation-defined fallback) may stay as literals; you may still assign them to `this.expected*` in `beforeAll` so the `it` stays free of string literals if you prefer.

### Where to store the method-under-test result (`this.actual*`, etc.)

- **Default:** Do **not** assign the return value of the code under test in `beforeAll` if **only one `it`** (or one assertion path) consumes it. Call the type or member method **inside the `it`**, inside `expect(...)`.
- **Use `beforeAll` for the result** when **multiple** `it` blocks need the **same** return value (e.g. one spec checks a field, another checks a spy side effect against the same invocation), when **several specs share one derived collection** (e.g. `Person.getActivePeople().mapToStr(...)` stored as `this.results` after fixtures are persisted—see **Shared derived collections** below), or when you must capture the result **before** subsequent setup mutates state.

```js
beforeAll(function () {
  this.firstName = Str.randomSuffix();
  this.lastName = Str.randomSuffix();
  this.person = TestApi.createEntity(this.ctx, Person, {
    email: Str.randomSuffix() + '@test.example',
    firstName: this.firstName,
    lastName: this.lastName,
  }).get();
  this.expectedFullName = (this.firstName + ' ' + this.lastName).trim();
});

it('returns first and last separated by a space', function () {
  expect(this.person.getFullName()).toEqual(this.expectedFullName);
});
```

### Testing methods with side effects (return value + state change)

When a method both **returns a value** and **mutates persistent state** (e.g. `scheduleInspection()` returns `true` and changes `status` to `'Maintenance'`), you want to assert on both outcomes. The correct pattern is:

1. **Call the method in `beforeAll`** and store the return value.
2. Write **separate `it` blocks** for the return value and the state change.

**NEVER** call a mutating method inside an `it` block — that makes the spec procedurally complex and couples assertion to execution.

```js
// CORRECT — call mutating method in beforeAll, assert separately
describe('when the turbine is Offline', function () {
  beforeAll(function () {
    this.turbine = TestApi.createEntity(this.ctx, Turbine, {
      status: 'Offline',
    }).get();
    TestApi.waitForSetup(this.ctx);
    this.result = this.turbine.scheduleInspection();
  });

  it('returns true', function () {
    expect(this.result).toBeTrue();
  });

  it('changes the turbine status to Maintenance', function () {
    var updated = Turbine.forId(this.turbine.id);
    expect(updated.status).toBe('Maintenance');
  });
});

// WRONG — calling the mutating method inside it
it('changes the turbine status to Maintenance', function () {
  var turbine = TestApi.createEntity(this.ctx, Turbine, {
    status: 'Offline',
  }).get();
  TestApi.waitForSetup(this.ctx);
  turbine.scheduleInspection();
  var updated = Turbine.forId(turbine.id);
  expect(updated.status).toBe('Maintenance');
});
```

For **error-throwing** methods, use `expect(() => { … }).toThrowError(...)` — the arrow function wrapping the call is the standard Jasmine pattern and counts as one assertion:

```js
// CORRECT — test that a non-Offline turbine throws
describe('when the turbine is Operational', function () {
  beforeAll(function () {
    this.turbine = TestApi.createEntity(this.ctx, Turbine, {
      status: 'Operational',
    }).get();
    TestApi.waitForSetup(this.ctx);
  });

  it('throws an error', function () {
    expect(() => {
      this.turbine.scheduleInspection();
    }).toThrowError(/Cannot schedule inspection for a turbine that is not Offline/);
  });
});
```

### Shared derived collections across multiple `it` blocks (`beforeAll` + `this.results`)

When **several** `it` blocks under the same `describe` all need the **same** derived value built the same way (for example `Person.getActivePeople().mapToStr((p) => p.id)` for membership and order checks), **do not** repeat that call chain in every spec. After **`beforeAll`** has created the persisted fixtures, **read once** in that same `beforeAll` (still using a classic **`function`** callback) and assign to **`this.results`** (or a more specific name such as `this.activePersonIds` when that reads clearer). Specs then only assert against `this.results`.

- **Why `beforeAll`:** When nothing in the suite mutates data between specs, a single read is enough and avoids duplicated setup in every `it`.
- **When `beforeEach` instead:** Use **`beforeEach`** only if a spec changes persisted state and later specs must see an updated query result.
- **Naming:** Prefer `this.results` when the suite is clearly about one returned or derived collection; use a longer `this.*` name when multiple derived values appear in the same `describe`.

```js
describe('#getActivePeople', function () {
  beforeAll(function () {
    /* persist fixtures: active A/B, inactive control, etc. */
    this.results = Person.getActivePeople().mapToStr((p) => {
      return p.id;
    });
  });

  it('includes both active scenario persons in getActivePeople results', function () {
    C3.Array.ofStr(this.personEarlier.id, this.personLater.id).each((id) => {
      expect(this.results.contains(id))
        .withContext('Missing active person ' + id)
        .toBeTrue();
    });
  });

  it('excludes inactive persons from getActivePeople results', function () {
    expect(this.results.contains(this.inactivePerson.id)).toBeFalse();
  });

  it('lists the scenario active persons in ascending lastName order', function () {
    expect(this.results.indexOf(this.personEarlier.id)).toBeLessThan(this.results.indexOf(this.personLater.id));
  });
});
```

- **DateTime** examples:

```js
var dt = DateTime.fromString('2024-01-01T12:00:00Z');
var dt = DateTime.fromMillis(1704124800000); // Represents 2024-01-01T12:00:00Z
var dt = DateTime.now().plusDays(7);
```

## Spying on functions

- Use `TestApi.spyOn(this.ctx, Type, 'methodName')`, then chain `.returnValue(...)`, `.callFake(...)`, or similar, and **`.register()`**. Pass the **type reference** for `Type` (same as with `createEntity`), not a string literal—so a missing, renamed, or out-of-scope type **fails fast** instead of producing a vague spy or runtime error later.

- **Real implementation vs mock:** After `spyOn`, choose how the spied method should run when invoked:

  - Use **`.callThrough()`** when you still want the **real implementation** to run (for example to assert the spy was called while letting side effects or return values come from production code).
  - Use **`.callFake(...)`** when you need to **replace behavior** (custom logic, arguments inspection, conditional branches, or throwing).
  - Use **`.returnValue(...)`** when you only need a **fixed return value** and do not need custom logic—simpler than `callFake` for constant stubs.

- **Unregister** in the suite's `afterAll` to avoid leaking stubs:

  ```js
  beforeAll(function () {
    this.spy = TestApi.spyOn(this.ctx, MyType, 'helperMethod')
      .callFake((_action, _input) => {
        /* no-op or canned response */
      })
      .register();
    MyType.entryPointUnderTest();
  });

  afterAll(function () {
    this.spy.unregister();
  });

  it('calls helperMethod', function () {
    expect(this.spy.toHaveBeenCalled()).toBeTrue();
  });
  ```

  Note the unique syntax of `expect(spy.toHaveBeenCalled())` instead of `expect(spy).toHaveBeenCalled()`.

## Fetching & Assertions

- To call methods on objects, e.g. member functions:

  ```js
  expect(this.myEntity.getRange()).toEqual(300);
  ```

- Prefer C3/Jasmine patterns that match the runtime: e.g. `expect(list.contains(x)).toBeTrue()`, `expect(fn).toThrowError(/pattern/)` for expected failures.
- **Collections:** Prefer **C3 collection / `C3.Array` APIs** (StdLib on fetch results, `C3.Array.ofStr(...)`, `.each`, `.mapToStr`, `.contains`, `.indexOf`, `.filter`, etc.) over **JavaScript `Array.prototype`** on untyped literals (`[a, b].forEach`, and so on). Values from `fetch(...).objs`, `.mapToStr`, and similar are C3 arrays—use their members rather than assuming a native JS array.

### Absent values: avoid `toBeNull` / `toBeUndefined` / `toBeDefined`

- **`expect(x).toBeNull()` and `expect(x).toBeUndefined()` are risky in C3 tests.** Return values and bridge code do not always use JavaScript `null` vs `undefined` consistently, so those matchers encode a brittle contract and can flake or disagree with how the platform surfaces "missing."
- **Prefer** `expect(x).toBeFalsy()` when the value should be absent (treats both `null` and `undefined` as failing the "present" check without pinning which one). **Prefer** `expect(x).toBeTruthy()` when a value must exist before you assert on fields (e.g. `id`, nested properties). In Jasmine the matcher name is **`toBeFalsy`**
- **Do not use `expect(x).toBeDefined()`** when the same `it` already asserts on `x.length`, `x.field`, or any other property. The property assertion already fails clearly if `x` is missing — the extra `toBeDefined` is noise and violates the one-assertion-per-spec rule.
- **Note:** `toBeTruthy()` / `toBeFalsy()` follow JavaScript truthiness (`''`, `0`, `false`, `NaN` are falsy). Use them only when those values are not valid successful results for the API under test; otherwise assert on specific fields or `toEqual` against the documented shape.

### Membership, exclusion, and sort order (required)

Use this subsection whenever the method under test returns a **collection of entities** (or you derive one from `fetch` / `.objs`) and you need to assert **presence**, **absence**, or **relative order**. Do not invent ad-hoc loops when a C3 collection already exposes `contains`, `indexOf`, `findAny`, `filter`, etc.

When **multiple** `it` blocks in the same `describe` share the **same** `.mapToStr` / pipeline into an id (or key) list, build that list **once** in **`beforeAll`** (after fixtures exist) and store it as **`this.results`** (see **Shared derived collections** above) instead of re-declaring a local `ids` in every `it`.

**Pick the tool by what you are proving**

| Goal                                                                     | Pattern                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A value **is** in the collection                                         | Build an id (or key) list with `.mapToStr(...)` (or use `this.results` from `beforeAll`), then `expect(ids.contains(x)).toBeTrue()`                                                                                                                                                                                                                                                                                                                     |
| A value **is not** in the collection                                     | Same id list, then `expect(ids.contains(x)).toBeFalse()`                                                                                                                                                                                                                                                                                                                                                                                                |
| **Both** entity **A** and entity **B** appear in the returned collection | **Separate `it`:** build id list with `.mapToStr` (or `this.results`), then `C3.Array.ofStr(aId, bId).each(...)` with **one** `expect(ids.contains(id)).toBeTrue()` per id (loop exception)                                                                                                                                                                                                                                                             |
| **A** appears **before** **B** in the returned order                     | **Separate `it`:** same id list, `expect(ids.indexOf(aId)).toBeLessThan(ids.indexOf(bId))`. Rely on the **existence** `it` above so missing ids are caught there; you do **not** need `>= 0` guards on this line. **Exception:** if presence and order are asserted in the **same** `it`, you **must** use `idxA >= 0 && idxB >= 0 && idxA < idxB` — bare `indexOf` comparison can pass when ids are missing (`-1 < any positive index` in JavaScript). |
| The **same** check must hold for a **fixed** set of ids                  | `C3.Array.ofStr(id1, id2, ...).each(...)` with **one** `expect` **inside** the loop per id (loop exception; see below)                                                                                                                                                                                                                                                                                                                                  |

**Anti-pattern (do not do this):** walking the collection with `.each` (or `forEach`) while incrementing a **manual index** (`var i = 0; … i++`) to compute positions, membership, or order. That bypasses `mapToStr`, `contains`, and `indexOf` and is harder to read and easy to get wrong. **Use `mapToStr` → `contains` / `indexOf` instead.**

**Good — exclusion**

```js
var ids = Person.getActivePeople().mapToStr((p) => {
  return p.id;
});
expect(ids.contains(this.inactivePerson.id)).toBeFalse();
```

**Good — both entities appear (dedicated `it`; run before or alongside the order spec)**

```js
it('includes both active scenario persons in getActivePeople results', function () {
  var ids = Person.getActivePeople().mapToStr((p) => {
    return p.id;
  });
  C3.Array.ofStr(this.personEarlier.id, this.personLater.id).each((id) => {
    expect(ids.contains(id)).withContext(`Missing active person ${id}`).toBeTrue();
  });
});
```

**Good — relative order (separate `it`; depends on the existence spec to catch missing ids)**

```js
it('lists the scenario active persons in ascending lastName order', function () {
  var ids = Person.getActivePeople().mapToStr((p) => {
    return p.id;
  });
  expect(ids.indexOf(this.personEarlier.id)).toBeLessThan(ids.indexOf(this.personLater.id));
});
```

When several specs in the same `describe` repeat the same `mapToStr` prelude, prefer **`beforeAll`** + **`this.results`** (see **Shared derived collections** above) instead of a local `ids` in each `it`.

**Bad — manual index with `.each` (forbidden)**

```js
// Wrong: hand-rolled counter + .each to implement ordering or membership
var idxEarlier = -1;
var i = 0;
Person.getActivePeople().each((p) => {
  if (p.id === this.personEarlier.id) {
    idxEarlier = i;
  }
  i = i + 1;
});
```

**Existence vs. order:** Proving **inclusion** and proving **sort order** are **different** behaviors—use **two** `it` blocks: one establishes both ids are present (`contains` via `C3.Array.ofStr(...).each`), the next compares `indexOf` directly. That yields clearer failures than folding both into one compound `expect`. Do **not** treat the existence `it` as redundant with the order `it`.

- **Exactly one `expect(...)` per `it`** at the **statement** level outside of loops: do not write several sequential top-level `expect` calls for unrelated checks in the same spec. Use nested `describe` / `beforeAll` to vary setup instead of unrelated behaviors in one spec.
- **Loop exception (same assertion for many values):** When the spec is "every one of these expected items satisfies the same check" (e.g. each id must appear in a collection), use **one** `it` and iterate—one `expect` **inside** the loop per item. Prefer `C3.Array.ofStr(id1, id2, ...).each(...)` (or another C3 collection you already have) over copy-pasted specs. Do not split into one `it` per item for that pattern.

  ```js
  it('includes all active persons created for this scenario', function () {
    C3.Array.ofStr(this.activeEarly.id, this.activeLate.id).each((id) => {
      expect(this.results.contains(id)).withContext(`Missing active person ${id}`).toBeTrue();
    });
  });
  ```

- **Do not split redundant checks across multiple `it` blocks.** If one expectation already implies another, keep a single `it` with the **strongest** matcher only.
  - **Redundant (avoid):** one `it` with `expect(result).toBeTruthy()` and another `it` with `expect(result.id).toEqual(expectedId)` for the same `result` from the same setup—the id check already fails clearly when `result` is missing (see **Absent values** above; avoid `toBeNull` / `toBeUndefined` for that).
  - **Not redundant:** separate `it`s when they assert different behaviors (e.g. return value vs. spy called vs. error thrown; **both entities appear** in a collection vs. **relative order** of those entities).

## Full example (structure sketch)

The sketch below uses **two** types on purpose: **`MyService`** is the type whose behavior you are testing (often a service with static methods). **`Widget`** is a stand-in **entity** you persist with `TestApi.createEntity` as test data—replace both names with your real types.

```js
/**
 * Unit tests for MyService.
 */
const filename = 'test_MyService';

describe(filename, function () {
  beforeAll(function () {
    this.ctx = TestApi.createContext(filename);
  });

  afterAll(function () {
    TestApi.teardown(this.ctx);
  });

  describe('MyService', function () {
    describe('#doThing', function () {
      beforeAll(function () {
        this.entity = TestApi.createEntity(this.ctx, Widget, {
          serialNumber: Str.randomSuffix(),
        }).get();
        this.processWidgetSpy = TestApi.spyOn(this.ctx, Widget, 'processWidget').callThrough().register();
        this.result = MyService.doThing(this.entity.id);
        this.expectedValue = 'expected';
      });

      afterAll(function () {
        this.processWidgetSpy.unregister();
      });

      it('returns expected value', function () {
        expect(this.result).toEqual(this.expectedValue);
      });

      it('calls Widget#processWidget', function () {
        expect(this.processWidgetSpy.toHaveBeenCalled()).toBeTrue();
      });

      it('throws when Widget does not exist', function () {
        expect(() => {
          MyService.doThing(Uuid.create());
        }).toThrow();
      });
    });
  });
});
```

- JavaScript tests do **not** use the `c3.` prefix; types are in scope by default.

## Testing Empty State (No Data)

When you need to verify a function returns empty results (e.g., "no active persons exist"), **test it BEFORE creating data** — not by deleting data with `removeAll()`.

The pattern: place the empty-state `describe` block **before** the block that creates the entities needed for positive tests. Since Jasmine runs `describe` blocks in order, the empty-state suite executes while the database has no matching records.

### Example: Test empty state before creating data

```javascript
const filename = 'test_Person';

describe(filename, function () {
  beforeAll(function () {
    this.ctx = TestApi.createContext(filename);

    // Create ONLY inactive persons in the top-level beforeAll.
    // This means getActivePeople() should return nothing at first.
    TestApi.createBatchEntity(this.ctx, Person, [
      Person.make({ email: Str.randomSuffix() + '@test.example', status: 'Inactive' }),
      Person.make({ email: Str.randomSuffix() + '@test.example', status: 'Inactive' }),
    ]);

    TestApi.waitForSetup(this.ctx);
  });

  afterAll(function () {
    TestApi.teardown(this.ctx);
  });

  describe('#getActivePeople', function () {
    // Empty-state test runs FIRST, before any active persons exist
    describe('when there are no active persons', function () {
      it('should return an empty array', function () {
        var result = Person.getActivePeople();
        expect(result.length).toBe(0);
      });
    });

    // Positive tests: create active persons in a nested beforeAll
    describe('when there are active persons', function () {
      beforeAll(function () {
        this.activeIds = TestApi.createBatchEntity(this.ctx, Person, [
          Person.make({ email: Str.randomSuffix() + '@test.example', status: 'Active' }),
          Person.make({ email: Str.randomSuffix() + '@test.example', status: 'Active' }),
          Person.make({ email: Str.randomSuffix() + '@test.example', status: 'Active' }),
        ]);
        this.expectedActiveCount = this.activeIds.length;
        TestApi.waitForSetup(this.ctx);
      });

      it('should return all active persons', function () {
        var result = Person.getActivePeople();
        expect(result.length).toBe(this.expectedActiveCount);
      });

      it('should respect the limit parameter', function () {
        var result = Person.getActivePeople(2);
        expect(result.length).toBe(2);
      });

      it('should respect the offset parameter', function () {
        var all = Person.getActivePeople();
        var result = Person.getActivePeople(2000, 1);
        expect(result.length).toBe(all.length - 1);
      });
    });
  });
});
```

**Key rules for empty-state testing:**

- It is valid to **defer** entity creation to a nested `beforeAll` when the purpose is to test empty state first.
- The top-level `beforeAll` does NOT need to create all data — it only needs `createContext` and optionally "noise" data (non-matching records that prove the filter works). If it creates entities, call `TestApi.waitForSetup(this.ctx)` after that creation.
- **NEVER** use `removeAll()` or `.remove()` to achieve empty state. Test it before data exists instead.

## Common Anti-Patterns

- **NEVER create entities or call mutating methods inside `it` blocks.** Entity creation (`TestApi.createEntity`, `TestApi.createBatchEntity`), `TestApi.waitForSetup`, mutating method calls (`.merge()`, `.scheduleInspection()`, etc.), and try/catch blocks all belong in `beforeAll`. An `it` block should only contain a read-only call and one `expect`. If you need a fresh entity for a specific assertion, wrap it in its own `describe` with a `beforeAll`.
- **Do not test a function by passing its declared default values explicitly.** If the `.c3typ` declares `fetchItems(limit: int = 2000, offset: int = 0)`, writing a test that calls `fetchItems(2000, 0)` and asserts the same result as `fetchItems()` is pointless — the platform enforces defaults from the type signature. Test with _different_ values (e.g., `limit = 2`, `offset = 1`) to prove the parameters are actually used.
- **NEVER call `removeAll()` or `.remove()` to test empty state.** Instead, structure the test so the empty-state suite runs before data is created (see the pattern above). Using `removeAll()` destroys data that sibling suites depend on and creates order-dependent failures.
- **Avoid creating entities in nested `beforeAll` blocks when they could interfere with sibling test suites.** If a nested block creates data that changes what other `describe` blocks see (e.g., adding entities that affect count assertions elsewhere), the tests become order-dependent. However, creating entities in nested `beforeAll` is valid when testing member functions that require a specific instance (e.g., creating a tailored entity to call a method on), when testing empty state first (see above), or when the nested suite is fully isolated from sibling suites. When a nested suite creates entities that could affect later sibling suites, use `afterAll` within that suite to call `TestApi.removeEntity(this.ctx, id)` or `remove` for each created entity so the data doesn't leak.
- **Prefer designing datasets that naturally produce empty results** rather than deleting data mid-test. For example, to test "no active persons," create a dataset with only Inactive persons and query for Active ones. This avoids accidental interference with other suites that expect the data to exist.
- **Avoid calling `TestApi.createBatchEntity` or `TestApi.waitForSetup` in nested `afterAll` hooks.** Cleanup is typically handled by the outermost `afterAll` calling `TestApi.teardown(this.ctx)`. Re-creating data in `afterAll` to "undo" a removal is a code smell that suggests the test structure should be rethought.

## Best Practices

Standard Jasmine lifecycle: `createContext` → create entities → `waitForSetup` → assertions → `teardown`.

```js
beforeAll(function () {
  this.ctx = TestApi.createContext(filename);
  TestApi.createBatchEntity(this.ctx, MyType, [
    /* ... */
  ]);
  TestApi.waitForSetup(this.ctx);
});

afterAll(function () {
  TestApi.teardown(this.ctx);
});
```

- Use `TestApi.createContext` / `TestApi.teardown` for test lifecycle to ensure cleanup.
- **Always** call `TestApi.waitForSetup(this.ctx)` after entity creation in each `beforeAll` that creates entities. Other setup in the same hook may follow.
- Use `TestApi.waitForJob` for long-running batch jobs, MapReduce, or Workflows.
- Use `TestApi.waitForFunction` for arbitrary conditions instead of polling manually.
- Use `TestApi#spyOn` to mock functions for isolation testing.
- Use `Uuid.create()` or `Str.randomSuffix()` for unique test IDs.
- Do **not** set `id` on entities in `TestApi.createBatchEntity` unless you need to look up a specific entity by ID later. The platform auto-generates IDs and `TestApi.teardown` handles cleanup regardless. When you do need to reference an entity by ID (e.g., `MyType.forId(id)`), use `Uuid.create()` to generate a unique ID.
- `createBatchEntity` returns an array of IDs. Use `.length` for count-based assertions. Chain `.map((t) => Type.make(t).get())` only when you need full persisted objects for field-level assertions on the created data.

## Completion Checklist

- [ ] File is at `test/js-{runtime}/{category}/test_{Type}.js` (runtime: `js-rhino`, `js-client`, or `js-node`)
- [ ] Test uses `TestApi.createContext(filename)` in `beforeAll`
- [ ] Every `beforeAll` that creates entities calls `TestApi.waitForSetup(this.ctx)` after that creation
- [ ] Test uses `TestApi.teardown(this.ctx)` in `afterAll`
- [ ] No `.forEach()` on C3 Array results — use `.each()` instead
- [ ] One top-level `expect` per `it` (loop exception: one `expect` inside `.each()` is allowed)
- [ ] No entity creation, `waitForSetup`, mutating method calls, or try/catch inside `it` blocks — all setup belongs in `beforeAll`
- [ ] No redundant `toBeDefined()`/`toBeTruthy()` before property assertions on the same value
- [ ] `.each()` loops use `.withContext()` so failures identify which element failed
