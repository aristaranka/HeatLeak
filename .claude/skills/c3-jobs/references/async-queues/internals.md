# InvalidationQueue Internals

## Processor Architecture

Each queue type has a `InvalidationQueue.Processor` that manages the processing loop:

```
InvalidationQueue.Processor
  └─ Scheduler (weighted priority scheduling)
       └─ Compute Actions (one per entry being processed)
```

### Processing Flow

1. Processor polls the queue store for pending entries
2. Scheduler determines which entries to process based on priority
3. For each selected entry:
   a. Lock the entry (prevents duplicate processing)
   b. Call `compute(entry)` on the queue implementation
   c. On success: `commit(entry)` - mark completed, remove from queue
   d. On failure: `abort(entry)` - mark failed, increment retry count
4. If retry count < `retryCount` config, entry goes back to pending

### Locking

```javascript
// View lock status
queue.lockSummary();
```

Entries are locked by `lockHashKey` to prevent concurrent processing of related entries (e.g., same target object).

## InvalidationQueue Store

Abstract storage interface (`InvalidationQueueStore`) with operations:

| Method                | Description                  |
| --------------------- | ---------------------------- |
| `clear(spec)`         | Remove entries matching spec |
| `invalidate(entries)` | Add new entries              |
| `commit(entries)`     | Mark entries as completed    |
| `abort(entries)`      | Mark entries as failed       |
| `find(spec)`          | Query entries                |
| `lock(entries)`       | Acquire processing locks     |
| `unlock(entries)`     | Release processing locks     |
| `completed(entries)`  | Post-completion callback     |

Two implementations exist:

- **SQL store** - backed by database (reliable, persistent)
- **In-memory** - for testing

## Mergeable Queues

`MergeableInvalidationQueue` supports merging duplicate entries to reduce processing:

- `CacheQueue` - merges cache invalidation for same key
- `NormalizationQueue` - merges normalization for same timeseries
- `MetricsQueue` - merges metric recalculation for same metric

When a new entry arrives for an already-pending target, the contexts are merged instead of creating a duplicate entry.

## Cancelable Queues

`CancelableInvalidationQueue` adds cancel capability:

- `ActionQueue`
- `BatchQueue`
- `MapReduceQueue`

```javascript
// Cancel entries via queue (takes array of entry objects)
queue.cancel([entry]);
```

## Queue Entry Fields

### InvalidationQueueEntry

| Field          | Type              | Description                                 |
| -------------- | ----------------- | ------------------------------------------- |
| `id`           | string            | Entry identifier                            |
| `targetTypeId` | int               | Target type ID (use `Type.meta().typeId()`) |
| `targetObjId`  | string            | Target object ID                            |
| `lockHashKey`  | string            | Lock grouping key                           |
| `context`      | any               | Processing context data                     |
| `entryType`    | string            | Entry subtype                               |
| `priority`     | int (default 300) | Processing priority                         |
| `nodePool`     | string            | Target node pool                            |
| `status`       | QueueStatusEnum   | Current status                              |
| `srcActionId`  | string            | Source action ID                            |
| `depth`        | int               | Invalidation depth                          |
| `userToRunAs`  | string            | User context for execution                  |

## Error Handling

### InvalidationQueueError

| Field          | Type                         | Description        |
| -------------- | ---------------------------- | ------------------ |
| `queueTypeId`  | string                       | Queue type         |
| `targetTypeId` | string                       | Target type        |
| `errorCode`    | string                       | Error code         |
| `detail`       | InvalidationQueueErrorDetail | Error details      |
| `review`       | InvalidationQueueErrorReview | Review information |

### Error Recovery Strategy

```javascript
// 1. Check errors
var errors = queue.errors();

// 2. Analyze
errors.each(function (err) {
  console.log(err.targetTypeId + ': ' + err.detail);
});

// 3. Recover
queue.recoverFailed();

// 4. For persistent errors, clear and re-invalidate
queue.clear(
  InvalidationQueueFilterSpec.make({
    status: 'failed',
    targetTypeId: ProblematicType.meta().typeId(),
  })
);
```

## Invalidation Depth

Invalidation can cascade: processing one entry may trigger invalidation of dependent entries. The `depthLimit` config prevents infinite cascading.

```
Entry A (depth 0) → triggers B (depth 1) → triggers C (depth 2) → ...
```

If depth exceeds `depthLimit`, the entry is dropped with a warning.
