# ML Coordination (Workflow.Coordinatable)

## When to Use

Use `Workflow.Coordinatable` when you need batch coordination with concurrency control and monitoring across many runs. ML job types frequently use this pattern.

## Type Signature

`Workflow.Coordinatable<RT: WithUniqueName>` where `RT` is the result type for each coordinated task.

## Required Abstract Methods (Summary)

| Method                | Signature (key fields)                     | Purpose                        |
| --------------------- | ------------------------------------------ | ------------------------------ |
| `generateNextResults` | `member (completed: stream<RT>): int`      | Create the next batch of tasks |
| `startResult`         | `member (result: RT): RT`                  | Launch a single task           |
| `completeResult`      | `member (result: RT): RT`                  | Finalize a task                |
| `runFromResult`       | `member (result: RT): WorkflowExecutorRun` | Link result to its run         |
| `pendingResults`      | `member (spec): stream<RT>`                | Query pending tasks            |
| `runningResults`      | `member (spec): stream<RT>`                | Query running tasks            |
| `completedResults`    | `member (spec): stream<RT>`                | Query completed tasks          |
| `canceledResults`     | `member (spec): stream<RT>`                | Query canceled tasks           |
| `erroredResults`      | `member (spec): stream<RT>`                | Query errored tasks            |
| `allResults`          | `member (spec): stream<RT>`                | Query all tasks                |
| `recover`             | `member (jobOptions): any`                 | Recover failed/canceled tasks  |

## Provided Methods (Common)

- `updateRunningResults`, `isCoordinationComplete`, `afterStart`, `afterComplete`, `afterCoordinationComplete`
- Monitoring: `summary`, `summaryForResults`, `errors`, `visualize`, `flamegraph`
- Recovery: `cancel`, `autoRecover`

## Core Lifecycle

1. `updateRunningResults` checks running results and completes finished ones.
2. `generateNextResults` produces new pending results.
3. `startResult` launches each result.
4. `completeResult` finalizes results.
5. Loop until `isCoordinationComplete` returns true.

## Coordinator Loop (Condensed)

```
start coordination
repeat until coordination completes:
  updateRunningResults()
  generateNextResults()
  for each pending result (within concurrency limit):
    startResult()
    runFromResult()
  evaluate isCoordinationComplete()
afterCoordinationComplete()
```

## Coordinatable Skeleton (C3 type)

```c3typ
entity type MyBatchCoordinator extends Workflow.Coordinatable<MyResult> {
  generateNextResults: ~ py
  startResult:         ~ py
  completeResult:      ~ py
  runFromResult:       ~ py
  pendingResults:      ~ py
  runningResults:      ~ py
  completedResults:    ~ py
  canceledResults:     ~ py
  erroredResults:      ~ py
  allResults:          ~ py
  recover:             ~ py
}
```

## ML Specialization

`MlWorkflowCoordinatable` extends `Workflow.Coordinatable` and provides:

- `jobOptions` for execution (including concurrency).
- Helper methods for summary and result queries.
- A default coordinator workflow that wires `Workflow.Coordinator`.

| Job Type                     | Job Run (Coordinatable)          | Result Type                         |
| ---------------------------- | -------------------------------- | ----------------------------------- |
| `MlModel.Train.Job`          | `MlModel.Train.JobRun`           | `MlModel.Train.Result`              |
| `MlModel.Route.OperationJob` | `MlModel.Route.OperationJob.Run` | `MlModel.Route.OperationJob.Result` |
| `MlSubject.OperationJob`     | `MlSubject.OperationJob.Run`     | `MlSubject.OperationJob.Result`     |
| `MlModel.Evaluation.Job`     | `MlModel.Evaluation.Run`         | `MlModel.Evaluation.Result`         |

## Result Type Fields (MlWorkflowCoordinatableResult)

Key fields to understand:

- `statusForCoordinatable`: `pending` / `running` / `completed`
- `run`: `WorkflowExecutorRun` for the result
- `errorCount`: quick filter for failed results
- `durationSeconds`: run duration for the latest execution
- `canceledCount`, `attemptedRecoveryCount`: recovery history

## Recovery and Cancellation

- `cancel()` transitions pending/running results to completed and cancels their runs.
- `recover(jobOptions)` re-executes failed or canceled results.
- `autoRecover()` retries errored results up to configured limits.

## Monitoring Example (Python)

```python
coord.summary(c3.Workflow.Monitorable.SummarySpec(watch=True))
errors = coord.errors()
coord.pendingResultsCount()
coord.runningResultsCount()
coord.completedResultsCount()
coord.erroredResultsCount()
result = coord.magnify("result-name")
```

## Error Check Example (Python)

```python
if coord.erroredResultsCount() > 0:
    # route to error handling or alerting
    pass
```
