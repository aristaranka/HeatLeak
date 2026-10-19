# Recovery and Operations

## Recovery and Cancellation

- `run.cancel()` requests async cancellation for running vertices.
- `Workflow.Run#recoverStuck()` attempts to recover idle/stuck runs.
- `Workflow.Run#recover()` is available for failing/failed runs.

### Cancel and Recover Example (Python)

```python
run.cancel()
c3.Workflow.Run.recoverStuck()
```

### Debug Logging (Python)

```python
c3.Workflow.Run.setLogLevel("DEBUG", True)
```

## Waiting for Completion (Python)

`waitForFinallyCompletion(timeoutMinutes, displayStatus, spec)` waits for the main run and the finally vertex run.
If the main run failed, it still waits for the finally vertex and then raises with the main error.

```python
spec = c3.WaitSpec().withDefaults().withInitialSleepMillis(1000).withMaxTotalMillis(20 * 60 * 1000)
status = run.waitForFinallyCompletion(timeoutMinutes=20, displayStatus=True, spec=spec)
```

## finallyVertex

- `Workflow.finallyVertex` runs after completion/failure/cancel.
- It is async and may run more than once; make it idempotent.
- It receives `run: Workflow.Run` for cleanup and reporting.

### finallyVertex Example (C3 type)

```c3typ
entity type MyWorkflowOwner {
  cleanupRun: function(run: Workflow.Run)
}
```

```python
# When building the workflow
cleanup_action = c3.Workflow.Action.fromActionRef(
    c3.ActionRef(typeName="MyWorkflowOwner", actionName="cleanupRun")
)
workflow = workflow.withFinallyVertex(cleanup_action)
```

## Operational Guardrails

- Add timeouts for long-running vertices.
- Avoid queue contention:
  - Limit parallelism (e.g., coordinator `maxConcurrency`).
  - Avoid deep nesting (2-3 levels max).
  - Avoid starting workflows from async jobs (Batch/MapReduce) unless required.
- Avoid tight custom polling loops; prefer built-in run waiting/monitoring APIs.
- For custom vertices, prefer event-driven completion semantics when possible.

### Timeout Example (Python)

```python
action = c3.Workflow.Action.fromActionRef(
    c3.ActionRef(typeName="MyType", actionName="longTask")
)
action = action.withTimeout(c3.Duration.fromMinutes(30))
```

## Run Configuration (Debug/Retention)

`Workflow.Run.Config` includes:

- `keepCompletedVertexRuns` (debugging, higher storage cost)
- `disableVertexRunPersistenceInResult` (reduces stored run details)
- `timeToLiveMinutes` (cleanup TTL for runs and vertex runs)

## Best Practices

- Use `asynchronous` executor for production workflows.
- Use `synchronous` only for testing or simple sequential tasks.
- Always check `run.hasErrors()` after completion.
- Use `Workflow.Coordinatable` for fan-out/fan-in batch patterns.
- Use `finallyVertex` for cleanup actions that must run regardless of success/failure.
- Monitor long-running workflows with `summary(spec)` using `watch=True`.

## Common Anti-Patterns

1. Not handling errors (always check `hasErrors()` and inspect error map).
2. Using synchronous for production (blocks the caller).
3. Missing finally vertex for cleanup.
4. Not recovering stuck runs (use `Workflow.Run.recoverStuck()` periodically).
