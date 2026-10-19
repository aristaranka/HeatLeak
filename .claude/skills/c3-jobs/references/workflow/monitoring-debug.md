# Monitoring and Debugging

## Key Types

- `Workflow.Run`: a single execution of a workflow.
- `Workflow.Run.Vertex`: execution state of a single vertex.
- `Workflow.Status`: run status with error details.

## Core Monitorable APIs

- `visualize(...)`: render the workflow graph.
- `summary(spec)`: tabular execution summary.
- `errors()`: map of step name to errors.
- `magnify(stepName)`: drill into a specific vertex run.
- `flamegraph()`: profiling view of action execution.

## Basic Monitoring Example (Python)

```python
run = workflow.lastAsyncRun()
# Workflow.Status object; check run.runStatus.status for state
run.runStatus
run.summary(
    c3.Workflow.Monitorable.SummarySpec(
        watch=True,
        watchInterval=2,
        watchTimeout=300,
    )
)

if run.hasErrors():
    errors = run.errors()
```

## Drill-Down Example (Python)

```python
vertex_run = run.magnify("myVertexName")
vertex_run.summary()
vertex_run.flamegraph()
```

## Vertex-Level Inspection (Python)

```python
vertex_runs = run.vertexRunsByName()
action_run = vertex_runs.get("myVertexName")
action_run.runStatus
action_run.runResult
```

## Visualization Example (Python)

```python
workflow.visualize(static=True)
workflow_run = workflow.lastAsyncRun()
workflow_run.visualize(static=True)
```

## Common Workflow Run Flow

1. Start workflow and get run.
2. Call `run.summary(c3.Workflow.Monitorable.SummarySpec(watch=True))` for live monitoring. `run.summary()` for post run viewing.
3. If errors exist, inspect `run.errors()` and then `run.magnify(vertexName)`.
4. Use `flamegraph()` for performance bottlenecks.
