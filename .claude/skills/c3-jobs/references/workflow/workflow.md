# C3 Workflow

## Decision Guide

Use Workflow when you need a DAG that orchestrates multiple steps, branching, fan-out/fan-in, or mixed job types.

Prefer alternatives when simpler:

- Use a single `Action` for a one-step synchronous task.
- Use `BatchJob` or `MapReduce` directly when a single job type is sufficient.
- Use ML job APIs (train/eval/operation jobs) when they already wrap the workflow pattern.

## Minimal Build-and-Run Recipe

1. Define inputs/outputs and pick vertex types (Input/Const/Action/Output, plus Conditional/Join/Make/Field as needed).
2. Build vertices with `from*` constructors.
3. Connect edges:
   - Data: `out` to input args or `Workflow.Output.in`
   - Control: `$success` to `$start` to enforce ordering
4. Start async:
   - `workflow.start(inputs, c3.WorkflowExecutionSpec(executor="asynchronous"))`
5. Fetch the run (async):
   - `workflow.lastAsyncRun()`
6. Monitor and finish:
   - `run.summary(...)`, `run.errors()`, `run.outputs()`
   - `run.cancel()` or `Workflow.Run.recoverStuck()` if needed

## Quick Reference

- Start: `workflow.start(inputs, spec)`
- Async run: `workflow.lastAsyncRun()`
- Status: `run.runStatus` (check `run.runStatus.status`)
- Outputs: `run.outputs()`
- Summary: `run.summary(c3.Workflow.Monitorable.SummarySpec(...))`
- Errors: `run.errors()`
- Cancel: `run.cancel()`
- Recover stuck: `c3.Workflow.Run.recoverStuck()`
- Wait for finally: `run.waitForFinallyCompletion(...)`

## References (load only when needed)

- `vertex-types.md` for ports and vertex catalog
- `examples.md` for end-to-end code examples (placeholder types used)
- `options-and-scheduling.md` for options/spec fields and queue scheduling (node pool, priority, concurrency)
- `execution-queues.md` for async execution behavior and executors
- `monitoring-debug.md` for visualize/magnify/flamegraph patterns
- `recovery-and-ops.md` for workflow recovery, finallyVertex, TTL/cleanup
- `ml-coordination.md` for ML coordinatable specifics (used in machine learning operations)
