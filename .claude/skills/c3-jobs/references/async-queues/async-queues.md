# C3 AI Async Queue System

InvalidationQueue is the core abstraction for all asynchronous processing in C3 AI. It provides reliable, prioritized, distributed task processing with monitoring, recovery, and retry capabilities.

## Quick Reference

| Operation           | Code                                                                       |
| ------------------- | -------------------------------------------------------------------------- |
| Submit async action | `ActionQueue.submitAction(typeRef, action, context, autoCommit, nodePool)` |
| Queue report        | `queue.report()`                                                           |
| Queue stats         | `queue.count()`                                                            |
| Queue errors        | `queue.errors()`                                                           |
| Pause queue         | `queue.pause()`                                                            |
| Resume queue        | `queue.resume()`                                                           |
| Recover failed      | `queue.recoverFailed()`                                                    |
| Recover stuck       | `queue.recoverStuck()`                                                     |
| Find entries        | `queue.find(spec)`                                                         |
| Wait for compute    | `queue.waitForCompute(spec)`                                               |
| Clear queue         | `queue.clear()`                                                            |
| Cancel entries      | `queue.cancel([entry])`                                                    |

## Queue Types

| Queue                | Purpose                   | Entry Type                |
| -------------------- | ------------------------- | ------------------------- |
| `ActionQueue`        | Async action dispatch     | `ActionQueueEntry`        |
| `BatchQueue`         | Batch job processing      | `BatchQueueEntry`         |
| `CacheQueue`         | Cache invalidation        | `CacheQueueEntry`         |
| `NormalizationQueue` | Timeseries normalization  | `NormalizationQueueEntry` |
| `MetricsQueue`       | Metric invalidation       | `MetricsQueueEntry`       |
| `MapReduceQueue`     | MapReduce jobs            | `MapReduceQueueEntry`     |
| `WorkflowQueue`      | Workflow execution        | `WorkflowQueueEntry`      |
| `HierDenormQueue`    | Hierarchy denormalization | `HierDenormQueueEntry`    |
| `SourceQueue`        | Data source processing    | `SourceQueueEntry`        |

## Entry Lifecycle

```
initial → pending → computing → completed
                  ↘ failed (→ recoverFailed → pending)
```

### QueueStatusEnum

| Status      | Description               |
| ----------- | ------------------------- |
| `initial`   | Just submitted            |
| `pending`   | Ready for processing      |
| `disabled`  | Temporarily disabled      |
| `computing` | Currently being processed |
| `failed`    | Processing failed         |

## ActionQueue

The most commonly used queue for dispatching async actions:

### Submit an Action

```javascript
ActionQueue.submitAction(
  MyType, // typeRef: !Type
  'processData', // action: !string
  ActionQueueContext.make({ arguments: myData }), // context: ActionQueueContext
  true, // autoCommit: boolean
  'default' // nodePool: string
);
```

### AsyncActionSpec Fields

| Field              | Type    | Description               |
| ------------------ | ------- | ------------------------- |
| `typeName`         | string  | Target type name          |
| `action`           | string  | Action/method name        |
| `args`             | map     | Action arguments          |
| `nodePool`         | string  | Target node pool          |
| `runOnlyOnce`      | boolean | Deduplicate               |
| `actionId`         | string  | Custom action ID          |
| `cleanupOnSuccess` | boolean | Auto-remove on completion |
| `timeoutMinutes`   | int     | Execution timeout         |

### Monitor ActionQueue

```javascript
// Convenience methods
ActionQueue.pending(type, action);
ActionQueue.computing(type, action);
ActionQueue.errors(type, action);
ActionQueue.entries(type, action, status);

// General report
ActionQueue.report();
```

## AsyncAction

Fire-and-forget async action entity with result tracking:

```javascript
// Submit
var asyncAction = AsyncAction.submit(
  AsyncActionSpec.make({
    typeName: 'MyType',
    action: 'heavyComputation',
    args: { input: data },
  })
);

// Check status later
asyncAction = asyncAction.get();
asyncAction.completed; // boolean - true if finished
asyncAction.error; // error if failed

// Re-submit failed
asyncAction.reSubmit();

// Check completion (member function, no args)
asyncAction.hasCompleted();

// Get all failed
AsyncAction.allFailed();
```

## Queue Configuration

```c3typ
@invalidationQueueOptions(
  grouping='targetTypeId',
  priority=200,
  maxConcurrency=4
)
```

### InvalidationQueueConfig

Global configuration (mixes `Config`):

| Field                  | Default | Description                    |
| ---------------------- | ------- | ------------------------------ |
| `initialScheduleDelay` | -       | Delay before first processing  |
| `idleSleep`            | -       | Sleep time when queue is empty |
| `retryCount`           | -       | Max retry attempts             |
| `depthLimit`           | -       | Max invalidation depth         |

### Per-Queue Config

Each queue type can have its own child config within `InvalidationQueueConfig`.

### Entry Priority

Lower number = higher priority. Default: 300.

```javascript
// Submit with high priority
queue.invalidate(
  InvalidationSpec.make({
    ids: ['obj-1'],
    priority: 100,
  })
);

// Change priority (takes a FindSpec filter, not an entryId)
queue.setPriority(InvalidationQueue.FindSpec.make({ targetTypeId: MyType.meta().typeId(), status: 'pending' }), 50);
```

## Monitoring and Debugging

### Queue Report

```javascript
// Full report
queue.report();

// Console shortcuts
c3QReport(ActionQueue);
c3QErrs(ActionQueue);
```

### Queue Stats

```javascript
var stats = queue.count();
stats.initial;
stats.pending;
stats.computing;
stats.failed;
stats.computingActions;
stats.pendingActions;
stats.awaitingCompute;
```

### Find Entries

```javascript
var entries = queue.find(
  InvalidationQueue.FindSpec.make({
    status: 'pending',
    targetTypeId: MyType.meta().typeId(),
    limit: 10,
  })
);
```

### Wait for Completion

```javascript
queue.waitForCompute(
  InvalidationQueueWaitSpec.make({
    failOnError: true,
    sleepTimeSec: 2,
    totalWaitTimeMin: 10,
  })
);
```

## Recovery

### Recover Failed Entries

```javascript
// Recover all failed
queue.recoverFailed();

// Recover specific type
queue.recoverFailed(
  InvalidationQueue.FindSpec.make({
    targetTypeId: MyType.meta().typeId(),
  })
);
```

### Recover Stuck Entries

```javascript
// Entries stuck in 'computing' for too long
queue.recoverStuck();
```

### Pause/Resume

```javascript
// Pause processing
queue.pause();

// Resume
queue.resume();
```

## Promise

C3 provides a generic Promise type for async coordination:

```javascript
var promise = Promise.make(function (fulfill, reject) {
  try {
    var result = heavyComputation();
    fulfill(result);
  } catch (e) {
    reject(e);
  }
});

promise
  .then(function (result) {
    return transform(result);
  })
  .catch(function (error) {
    Logger.error(error);
  })
  .finally(function () {
    cleanup();
  });

// Await completion (blocking) - returns boolean, requires timeout Duration
var completed = promise.await(Duration.fromMinutes(5));
```

## Best Practices

- Use `ActionQueue` for one-off async operations
- Use `BatchQueue` + `BatchJob` for large dataset processing
- Set appropriate priorities (lower = more urgent)
- Monitor queue depth and error rates regularly
- Use `recoverFailed()` in a cron job for automatic recovery
- Set `timeoutMinutes` on AsyncActionSpec to prevent stuck actions
- Use `waitForCompute()` in tests, never `Thread.sleep()`
- Use `pause()`/`resume()` in tests for deterministic assertions

## Common Anti-Patterns

1. **Thread.sleep() for queue waits** - use `waitForCompute()` or `assertEventual*`
2. **No error monitoring** - check `queue.errors()` regularly
3. **Default priority for everything** - differentiate critical vs background work
4. **Not recovering failed** - set up a cron job for `recoverFailed()`
5. **Ignoring stuck entries** - monitor computing duration, use `recoverStuck()`

## Detailed Reference

- For queue internals and processor details, see [internals.md](internals.md)
