# Execution Behavior

## Async Execution Flow (High Level)

1. `workflow.start(inputs, spec)` creates `Workflow.Run`.
2. The platform scheduler begins processing the run asynchronously.
3. Ready vertices are executed.
4. As vertices complete, run state is refreshed until terminal status.

### Async Start Example (Python)

```python
exec_spec = c3.WorkflowExecutionSpec(executor="asynchronous")
exec_run = workflow.start({"inputA": valueA}, exec_spec)
run = workflow.lastAsyncRun()
```

## Async Action Behavior

`Workflow.Action` executes asynchronously through the platform scheduler:

1. The run starts eligible action vertices.
2. The platform executes actions and records vertex outcomes.
3. Parent run status is refreshed as action vertices finish.

Use this to reason about delays, retries, and queue contention.

## Completion Model (High Level)

- Some vertices complete via callback/event-driven status updates.
- Others are checked by scheduler polling.
- Mixed graphs can involve both mechanisms.

### Common event-driven async vertices

- `Workflow.Action`
- `Workflow.Batch`
- `Workflow.MapReduce`
- `Workflow.Coordinator`
- `Workflow.Nested`
- `Workflow.Nested.Action`

### Common scheduler-polled vertices

- `Workflow.Input`
- `Workflow.Output`
- `Workflow.Const`
- `Workflow.Make`
- `Workflow.Field`
- `Workflow.Conditional`
- `Workflow.Join`
- Other custom `Workflow.Vertex` subtypes depending on implementation

## Executor Modes

- `asynchronous` (default): uses queues.
- `synchronous`: executes in caller runtime.
- `synchronous-parallel`: parallel sync execution using Python threading

If you need a specific runtime for synchronous modes, set
`synchronousExecutorRequirement` in `WorkflowExecutionSpec`.

## WorkflowExecutionSpec (Key Fields)

| Field                            | Values                                                | Purpose                               |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------- |
| `executor`                       | `asynchronous`, `synchronous`, `synchronous-parallel` | Execution mode                        |
| `synchronousExecutorRequirement` | string (Action.Requirement)                           | Force runtime for synchronous modes   |
| `runAsUser`                      | boolean                                               | Execute vertices as submitting user   |
| `stayInRuntime`                  | boolean                                               | Prefer current runtime for sync modes |

### Synchronous Example (Python)

```python
exec_spec = c3.WorkflowExecutionSpec(
    executor="synchronous",
    synchronousExecutorRequirement="py-foo",
)
exec_run = workflow.start({"inputA": valueA}, exec_spec)
```

## Execution Context Flags

- `runAsUser`: execute vertices as the submitting user.
- `stayInRuntime`: for synchronous modes, prefer current runtime.
