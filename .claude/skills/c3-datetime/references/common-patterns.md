# Common DateTime Patterns

Real-world C3 AI codebase examples demonstrating DateTime usage patterns.

## Table of Contents

- [Arithmetic + Comparison](#arithmetic--comparison)
- [Filtering Records by Date Range](#filtering-records-by-date-range)
- [Timestamping Records](#timestamping-records)
- [Parsing Meta Fields](#parsing-meta-fields)
- [Time Elapsed Tracking](#time-elapsed-tracking)
- [Scheduling & Cleanup](#scheduling--cleanup)
- [Date Range Construction](#date-range-construction)

---

## Arithmetic + Comparison

**Staleness check**:

```python
if c3.DateTime.fromString(post["updated_at"]).plusDays(180).isBefore(c3.DateTime.now()):
    # post has not been updated in 180 days — stale
```

**Scheduling next run**:

```js
lastRunTime: DateTime.fromString(lastRun.timestamp).plusDays(1);
```

**Compute elapsed seconds**:

```js
var elapsed = DateTime.deltaSeconds(runStartTime, DateTime.now());
```

---

## Filtering Records by Date Range

### String filter (simplest)

```python
start = c3.DateTime.fromString(f"{year}-{str(month).zfill(2)}-01")
end = c3.DateTime.fromString(f"{year}-{str(month).zfill(2)}-01").plusMonths(1)

c3.MyType.fetch({
    "filter": f"createdAt >= '{str(start)}' && createdAt < '{str(end)}'",
    "include": "this"
}).objs or []
```

### Filter API (chained, JS)

```js
var start = DateTime.fromString(startDateStr + 'T00:00:00');
var end = DateTime.fromString(endDateStr + 'T00:00:00').plusDays(1);

MyType.fetch({
  filter: Filter.gt('startTime', start).and().lt('endTime', end),
  include: 'this',
});
```

### Python chained filter (note `.and_()`)

```python
filter_start = c3.Filter.gt("startTime", start_dt)
filter_end = c3.Filter.lt("endTime", end_dt)
combined = filter_start.and_(filter_end)
```

### Date cutoff filter

```js
var cutoff = DateTime.nowWithMillis().minusMinutes(staleLockMinutes);
MyType.fetch({
  filter: Filter.lt('lockedAt', cutoff),
  include: 'this',
});
```

> **Performance tip**: Add `@db(index=["entityField, datetimeField"])` on your entity type to index datetime fields used in frequent filters.

---

## Timestamping Records

**JavaScript**:

```js
MyType.upsert({
  id: 'sync_' + runId,
  timestamp: DateTime.now(),
  lastSyncAt: DateTime.now(),
});
```

**Python**:

```python
c3.MyType.upsert({
    "id": record_id,
    "processedAt": c3.DateTime.now(),
    "updatedAt": c3.DateTime.now()
})
```

---

## Parsing Meta Fields

`meta.created` and `meta.updated` are declared as **`datetime`** — they are already DateTime objects when fetched. Call DateTime methods on them directly.

```js
// CORRECT — meta.created is a DateTime object
var dt = record.meta.created.plusDays(1);
```

**Real example**:

```python
last_error_time = last_error.meta.created if last_error else None
current_error_time = current_error.meta.created

if last_error_time and current_error_time.isAfter(last_error_time):
    # current error is more recent
```

**Sorting by `meta.updated`**

```js
records.sorted(function (a, b) {
  return a.meta.updated.isAfter(b.meta.updated) ? -1 : 1;
});
```

---

## Time Elapsed Tracking

```js
var runStart = DateTime.now();
// ... do work ...
var elapsedSeconds = DateTime.deltaSeconds(runStart, DateTime.now());
```

```python
days_elapsed = c3.DateTime.deltaSeconds(past_dt, c3.DateTime.now()) / 86400
```

---

## Scheduling & Cleanup

**Delete records older than N days**:

```js
var n = 2000;
var cutoff = DateTime.now().minusDays(n);
OldRecord.removeAll(
  {
    filter: Filter.lt('createdAt', cutoff),
  },
  true
);
```

**Expiry check** (Python):

```python
expiry = c3.DateTime.fromString(record.expires_at)
if expiry.isBefore(c3.DateTime.now()):
    # record is expired
```

---

## Date Range Construction

```python
# Monthly range — end is exclusive (first of the following month)
start = c3.DateTime.fromString(f"{start_year}-{str(start_month).zfill(2)}-01")
end = c3.DateTime.fromString(f"{end_year}-{str(end_month).zfill(2)}-01")
```
