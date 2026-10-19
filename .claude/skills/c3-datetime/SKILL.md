---
name: c3-datetime
description: |
  Work with the C3 AI Platform DateTime type in type definitions. Use when:
  (1) Defining datetime fields in .c3typ files
  (2) Creating or manipulating DateTime values in Python or JS
  (3) Filtering/querying records by date range using DateTime
  (4) Performing datetime arithmetic
  (5) Comparing datetimes
  (6) Formatting or converting datetimes
  (7) Parsing datetime strings from meta fields, seed data or external sources
  (8) Timestamping records or tracking created/updated times
  (9) Scheduling or expiry logic based on dates
  (10) Defining datetime calc fields and dateTime() expression functions
  (11) DateTime in seed data
  (12) DateTime in calc fields
core: true
category: platform
version: 8.9.0
minimumVersion: 8.7.0
metadata:
  dependencies:
    - c3-calc-fields
---

# C3 DateTime

C3 AI's `DateTime` type wraps ISO 8601 timestamps with a rich API available in both JavaScript and Python.
Make sure to use the C3 MCP tools, especially the `search_c3_documentation` tool, for any DateTime use cases not covered here.

## Quick Rules

- Seed data: always use ISO 8601 strings (e.g., `"2024-01-01T00:00:00Z"`)
- In **calc fields**, use `now()` and `dateTime()` — NOT `DateTime.now()` or `DateTime.fromString()`
- **To switch btw Python and JS**: replace `c3.DateTime` with `DateTime` but keep method names the same

---

## ❌ Critical Anti-Pattern:

1. **Do NOT Call JS `Date` or Python `datetime` Native Date Methods on C3 DateTime** This is the #1 source of DateTime bugs in C3 agent-generated code.

- C3 `DateTime` is a C3 type — it is **NOT** a JS `Date` object or Python `datetime` object.
- Calling native methods on it will crash at runtime with a `TypeError` or `AttributeError`.

2. **Do NOT Add Datetime Fields for Auto-Managed Meta Fields** Datetime fields **never** need to be added for the auto-managed `meta.created` and `meta.updated` system fields.

---

## 1. Type Definitions

```c3typ
entity type Event {
  startTime: !datetime       // required
  endTime: datetime          // optional
}
```

**Indexing datetime fields for query performance**: Add `@db(index=["field1, datetimeField"])` above the type to create a composite index.

```c3typ
@db(index=["smartBulb, timestamp"])         // single composite index
entity type SmartBulbPrediction {
  smartBulb: SmartBulb
  timestamp: !datetime
}
```

Index fields that appear together in `filter` conditions or that you sort by. A composite index on `[foreignKey, datetimeField]` is a common pattern for time-series-style queries.

### DateTimeType Field Modifiers

C3 datetime fields support optional modifiers that control precision and timezone behavior. Append them directly after `datetime` in the field declaration:

```c3typ
entity type Measurement {
  recordedAt: !datetime          // default: seconds precision, arbitrary timezone
  recordedAtMs: !datetime with millis // millisecond precision
  recordedAtUs: !datetime with micros // microsecond precision
  logicalDate: !datetime no tz   // timezone-free logical time (e.g. "2024-01-01T00:00:00")
  startDatetime: !utc datetime   // always store in UTC, ignore any timezone info on input
  startDate: date             // date only, time component is ignored
}
```

| Modifier | Effect                                                                                |
| -------- | ------------------------------------------------------------------------------------- |
| `millis` | Stores millisecond precision (default is seconds)                                     |
| `micros` | Stores microsecond precision                                                          |
| `no tz`  | Stores a timezone-free logical time — represents a date/time without any zone context |
| `utc`    | Always store in UTC, ignore any timezone info on input                                |
| `date`   | Stores only the date component                                                        |

---

## 2. Creating DateTime Values

### JavaScript

```js
var now = DateTime.now();
var specific = DateTime.fromString('2024-01-01T12:00:00Z');
var fromDateStr = DateTime.fromString(dateStr + 'T00:00:00Z');
```

---

## 3. Arithmetic Operations

### JavaScript

```js
DateTime.now().plusDays(1);
DateTime.now().minusDays(7);
DateTime.now().plusMonths(1);
DateTime.now().plusHours(2);
DateTime.deltaSeconds(startTime, endTime); // time diff in seconds
```

Eg:

```python
if c3.DateTime.fromString(post["updated_at"]).plusDays(180).isBefore(c3.DateTime.now()):
# post["updated_at"] is string, must parse before calling plusDays() or isBefore()
```

See [references/api-reference.md](references/api-reference.md) for all arithmetic methods (plusWeeks, plusYears, minusMillis, etc.).
See [references/common-patterns.md](references/common-patterns.md) for extended real-codebase examples.
For further datetime questions use the C3 MCP tools, specifically the `search_c3_documentation` tool.

---

## 4. Comparison

### Python

```python
# now, deadline, created, cutoff are c3 DateTime objects
if now.isAfter(deadline):
    ...
if created.isBefore(cutoff):
    ...
```

---

## 5. Formatting & Conversion

### JavaScript

```js
var formatted = now.format('yyyy-MM-dd HH:mm:ss');
var isoString = DateTime.now().toString(); // ISO 8601 string
```

---

## 6. Filtering by Date Range (Fetch)

### String filter (simple)

```js
var start = DateTime.fromString(startDateStr + 'T00:00:00');
var end = DateTime.fromString(endDateStr + 'T00:00:00').plusDays(1);
MyType.fetch({
  filter: "startTime >= '" + start.toString() + "' && startTime < '" + end.toString() + "'",
  include: 'this',
});
```

### Filter API

```js
MyType.fetch({
  filter: Filter.gt('startTime', start).and().lt('endTime', end),
  include: 'this',
});
```

for more information on filtering, see the `c3-crud` skill.

See [references/common-patterns.md](references/common-patterns.md) for Python filter examples and more patterns.

---

## 7. Timestamping Records (Upsert)

```js
EntityType.upsert({ id: 'record_1', timestamp: DateTime.now() });
```

## given that `timestamp` is a datetime field on EntityType, this will store the current time. See [references/common-patterns.md](references/common-patterns.md) for more upsert examples with DateTime.

## 8. Scheduling & Expiry Logic

```js
// Cleanup records older than N days
var cutoff = DateTime.now().minusDays(options.olderThanDays);
MyRecord.fetch({
  filter: "createdAt < '" + cutoff.toString() + "'",
  include: 'this',
});
```

```python
# Check if something expired
expiry = c3.DateTime.fromString(record.expiresAt)
if expiry.isBefore(c3.DateTime.now()):
    # expired
```

---

## 9. Tracking Time Elapsed

```js
var startTime = DateTime.now();
// ... do work ...
var elapsed = DateTime.deltaSeconds(startTime, DateTime.now());
```

---

## 10. Parsing from Meta Fields

Meta fields (`meta.created`, `meta.updated`) are `DateTime` objects when fetched, so you can call DateTime methods on them directly.

> **When you do need `fromString`**: if you receive a meta timestamp as a raw ISO string (e.g. from a JSON payload, an external API response, or a field stored as `string`), then parse it first: `DateTime.fromString(rawString)`.

---

## 11. Seed Data

Always use ISO 8601 strings:

```json
[
  {
    "id": "event_1",
    "startTime": "2024-01-01T08:00:00Z",
    "endTime": "2024-01-01T10:00:00Z",
    "createdAt": "2024-01-01T00:00:00Z"
  }
]
```

---

## 12. DateTime in Calc Fields

**Critical distinction**: In calc field expressions, use **Expression Engine functions** `now()` and `dateTime()` — do not use c3 `DateTime.*` methods. These are **not** `DateTime.now()` or `DateTime.fromString()`. The `DateTime.*` API is only for imperative JS/Python code.
for more on calc fields, see `c3-calc-fields` skills directory.

---

## Summary Table

> **Prefix reminder**: JS uses `DateTime.method()`, Python uses `c3.DateTime.method()` for static methods.

| Operation     | Method                                  |
| ------------- | --------------------------------------- |
| Now           | `.now()`                                |
| From string   | `.fromString("...")`                    |
| Add days      | `.plusDays(n)`                          |
| Subtract days | `.minusDays(n)`                         |
| Add months    | `.plusMonths(n)`                        |
| Add hours     | `.plusHours(n)`                         |
| Is after      | `.isAfter(other)`                       |
| Is before     | `.isBefore(other)`                      |
| Is after now  | `.isAfterNow()`                         |
| Seconds diff  | `.deltaSeconds(a, b)`                   |
| Days diff     | `.deltaSeconds(a, b) / 86400`           |
| To string     | `.toString()` (JS) / `str(dt)` (Python) |
| Format        | `.format("yyyy-MM-dd")`                 |
| Get epoch ms  | `.millis`                               |

---

## References

- **Full API method signatures** → [references/api-reference.md](references/api-reference.md)
- **Extended code patterns & real codebase examples** → [references/common-patterns.md](references/common-patterns.md)
