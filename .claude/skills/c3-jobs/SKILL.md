---
name: c3-jobs
description: |
  Develop and manage background jobs in C3 AI Platform including BatchJob (parallel batch processing), MapReduce (distributed map-reduce computation), Workflow (DAG orchestration), AsyncQueues (fire-and-forget async processing via InvalidationQueues), and CronJob (scheduled recurring jobs). Use when the agent needs to:
  (1) Process large datasets in parallel batches
  (2) Implement map-reduce patterns for distributed aggregation
  (3) Orchestrate multi-step DAG workflows with branching and fan-out/fan-in
  (4) Submit async actions or monitor queue status
  (5) Schedule recurring jobs with cron expressions
  (6) Choose between job types for a processing task
  (7) Monitor, recover, or debug any background job
core: true
category: platform
version: 8.9.0
minimumVersion: 8.7.0
---

# C3 AI Jobs & Background Processing

## Which Job Type to Use?

| Need                                                                    | Use             | Why                                                                         |
| ----------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------- |
| Process large dataset in parallel batches (split → process → aggregate) | **BatchJob**    | Built-in batching, parallelism, retry, monitoring                           |
| Distributed aggregation with explicit map and reduce stages             | **MapReduce**   | Two-phase computation with key-value semantics                              |
| Multi-step pipeline with branching, fan-out/fan-in, or mixed job types  | **Workflow**    | DAG orchestration with control/data flow                                    |
| Fire-and-forget async action or queue-based processing                  | **AsyncQueues** | ActionQueue, BatchQueue, and other InvalidationQueues                       |
| Recurring scheduled execution (hourly, daily, weekly, etc.)             | **CronJob**     | Quartz-backed cron expressions; define `action` (ActionRef) + `scheduleDef` |

## Reference Dispatch

Load the relevant reference file based on your task:

| Task                                                                  | Reference File                                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Create or modify a BatchJob (doStart/processBatch/allComplete)        | [references/batchjob/batchjob.md](references/batchjob/batchjob.md)                             |
| BatchJob common patterns (migration, ETL, cleanup, sync, aggregation) | [references/batchjob/patterns.md](references/batchjob/patterns.md)                             |
| BatchJob performance tuning and batch size selection                  | [references/batchjob/performance.md](references/batchjob/performance.md)                       |
| BatchJob monitoring, debugging, and testing                           | [references/batchjob/monitoring.md](references/batchjob/monitoring.md)                         |
| BatchJob working example assets                                       | [references/batchjob/assets/](references/batchjob/assets/)                                     |
| Create or modify a MapReduce job (map/reduce functions)               | [references/map-reduce/map-reduce.md](references/map-reduce/map-reduce.md)                     |
| MapReduce complete examples (word count, aggregation, timeseries)     | [references/map-reduce/examples.md](references/map-reduce/examples.md)                         |
| MapReduce troubleshooting and error resolution                        | [references/map-reduce/troubleshooting.md](references/map-reduce/troubleshooting.md)           |
| Design or build a Workflow (DAG orchestration)                        | [references/workflow/workflow.md](references/workflow/workflow.md)                             |
| Workflow vertex types and port semantics                              | [references/workflow/vertex-types.md](references/workflow/vertex-types.md)                     |
| Workflow end-to-end code examples                                     | [references/workflow/examples.md](references/workflow/examples.md)                             |
| Workflow options, specs, and scheduling fields                        | [references/workflow/options-and-scheduling.md](references/workflow/options-and-scheduling.md) |
| Workflow async execution behavior and executors                       | [references/workflow/execution-queues.md](references/workflow/execution-queues.md)             |
| Workflow monitoring and debugging (visualize, summary, flamegraph)    | [references/workflow/monitoring-debug.md](references/workflow/monitoring-debug.md)             |
| Workflow recovery, finallyVertex, TTL/cleanup                         | [references/workflow/recovery-and-ops.md](references/workflow/recovery-and-ops.md)             |
| Workflow ML coordination (Workflow.Coordinatable)                     | [references/workflow/ml-coordination.md](references/workflow/ml-coordination.md)               |
| AsyncQueues (ActionQueue, BatchQueue, queue monitoring, recovery)     | [references/async-queues/async-queues.md](references/async-queues/async-queues.md)             |
| AsyncQueues internals (processor architecture, store, merging)        | [references/async-queues/internals.md](references/async-queues/internals.md)                   |
| CronJob scheduling and management                                     | [references/cron/cron.md](references/cron/cron.md)                                             |

## Quick Decision Checklist

1. **Is this a one-time large dataset operation?**

   - Yes, with simple per-record processing → **BatchJob**
   - Yes, with key-value aggregation → **MapReduce**

2. **Does it require multiple steps or conditional branching?**

   - Yes → **Workflow**

3. **Is it a single async action I just want to fire off?**

   - Yes → **AsyncQueues** (ActionQueue.submitAction)

4. **Does it need to run on a schedule?**

   - Yes → **CronJob** (define `action` via ActionRef + `scheduleDef` with a Quartz cron expression)

5. **Does it orchestrate multiple BatchJobs/MapReduce jobs?**
   - Yes → **Workflow** with Batch/MapReduce vertices

## CronJob Quick Start

```javascript
CronJob.make({
  id: 'my-scheduled-job',
  action: ActionRef.make({ typeName: 'MyType', actionName: 'myMethod' }),
  scheduleDef: CronSchedule.make({ cronExpression: '0 0 2 * * ?', timeZone: 'UTC' }),
}).create();
```

Key fields: `action` (ActionRef — what to run), `scheduleDef` (CronSchedule — when to run).
Cron format: `second minute hour day-of-month month day-of-week` (Quartz 6-field).
