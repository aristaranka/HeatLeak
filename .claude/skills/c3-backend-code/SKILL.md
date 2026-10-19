---
name: c3-backend-code
description: |
  Author C3 AI backend types and their implementations. Use when writing, creating, or editing
  C3 types / entity types (`.c3typ`) — fields, enums, relationships (fkey), mixins, method signatures —
  or implementing their methods in Python (`.py`) or JavaScript (`.js`). Covers type definitions,
  language selection, seeding data (`seed/` vs `data/`, `SeedData`), and immutability/object-lifecycle
  conventions.
core: true
category: platform
version: 8.9.0
minimumVersion: 8.7.0
---

# C3 AI Implementation Guide

This consolidated skill covers all aspects of implementing backend methods in C3 AI applications — Python, JavaScript, and shared backend patterns.

**Related skills:**

- For CRUD operations and Filter API: see `c3-crud`
- For data transforms and canonicals: see `c3-data-ingestion`

## Reference Dispatch

| Task                                                                            | Reference File                                              |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Python method implementation (c3 namespace, `cls`/`this`, typing, immutability) | `references/python/python.md`                               |
| JavaScript method implementation (global namespace, `var`, `.with*`, streaming) | `references/javascript/javascript.md`                       |
| Backend patterns (type definitions, service layers, mixins, seeding, MCP tools) | `references/backend/backend.md`                             |
| Language selection (JS vs Python decision)                                      | `references/backend/backend.md` § Language Selection Guidelines |
| Advanced type definitions (relationships, extensions, stream functions)         | `references/backend/backend.md` § Advanced Type Definitions |
| Lifecycle hooks (`beforeCreate`, `afterCreate`, etc.)                           | `references/javascript/javascript.md` § Advanced Patterns   |
| CRUD operations in Python                                                       | `references/python/python.md` § CRUD Essentials             |
| CRUD operations in JavaScript                                                   | `references/javascript/javascript.md` § CRUD Operations     |
| Fetch & Filter in Python                                                        | `references/python/python.md` § Fetch & Filter              |
| Fetch & Filter in JavaScript                                                    | `references/javascript/javascript.md` § Fetch & Filter Data |
| Runtime action claims (methods importing sklearn/xgboost/boto3 & other non-standard libs) | `references/python/python.md` § Runtime Action Claims |

## Quick Language Selection

| Scenario                                 | Language      | Reason                                          |
| ---------------------------------------- | ------------- | ----------------------------------------------- |
| User explicitly requests Python or JS    | Use requested | User preference takes precedence                |
| Simple CRUD / data transformations       | JavaScript    | Faster execution, simpler syntax                |
| Complex computations / ML / data science | Python        | Rich library ecosystem (pandas, numpy, sklearn) |
| Lifecycle hooks (`beforeCreate`, etc.)   | JavaScript    | Platform convention                             |
| Stream functions with `py-agents`        | Python        | Agent runtime requirement                       |

## Key Differences at a Glance

| Aspect                    | Python               | JavaScript                  |
| ------------------------- | -------------------- | --------------------------- |
| Type access               | `c3.TypeName`        | `TypeName` (global)         |
| Static method first param | `cls`                | _(none)_                    |
| Member method first param | `this`               | `this` (implicit)           |
| Filter chaining           | `.and_()`            | `.and()`                    |
| Variable declaration      | Standard Python      | `var`                       |
| Object creation           | `c3.Type.make({...})`| `Type.make({ field: val })` |
| Immutable update          | `.with<Field>(val)`  | `.with<Field>(val)`         |

## Common Rules (Both Languages)

1. **Do NOT create classes** — define top-level functions matching `.c3typ` signatures.
2. **Always declare a language claim** on every `.c3typ` method (`py`, `js`, `js-server`, `py-agents`, …). Never omit it — omission yields `Method … is not implemented!`.
3. **Python static methods take `cls` first** — default methods are static (not `member function`); write `def myMethod(cls, ...):`, not bare `def myMethod(...):`.
4. **Immutability** — C3 objects are immutable; use `.with*` methods to create modified copies.
5. **Fetch includes** — Always specify `include: "this, refField.this"` to fetch referenced objects.
6. **Batch over loops** — Use `mergeBatch` / `createBatch` instead of looping single operations.
7. **No console logging** — Keep implementations focused on business logic.
8. **No `meta` fields** — They are auto-populated by the platform.

## Smoke-Test Methods You Write

After implementing each custom method, if `C3AI-AppMCP` is available, use `runJsCode` (or `runPyCode`) to run it against real seed data and confirm it returns the expected shape and doesn't throw. This is a **smoke test** — run it as many times as you need while getting the method working, but there's no need to formally re-run it after every unrelated change, especially for methods that are expensive to run (real LLM calls, AsyncAction polling). Built-in CRUD (`fetch`/`create`/`upsert`) doesn't need this; only methods you wrote.

```javascript
// JavaScript — runJsCode (preferred)
Car.getAvailableFleet('2025-02-01')
```

```python
# Python — runPyCode
c3.Car.getAvailableFleet('2025-02-01')
```

Built-in CRUD (`fetch` / `create` / `upsert`) does NOT need this; smoke-test only methods you wrote.
