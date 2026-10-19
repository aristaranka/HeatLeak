# Options, Specs, and Scheduling Fields

Use this reference when you need to control execution behavior, invalidation queue routing, or runtime placement.

## 1) WorkflowExecutionSpec (top-level workflow execution)

`WorkflowExecutionSpec` controls how `workflow.start(...)` executes.

| Field                            | Common values                                         | What it controls                                     |
| -------------------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| `executor`                       | `asynchronous`, `synchronous`, `synchronous-parallel` | Execution mode                                       |
| `runAsUser`                      | `True` / `False`                                      | Execute vertices as submitter vs worker/root context |
| `stayInRuntime`                  | `True` / `False`                                      | For sync runs, prefer the current runtime            |
| `synchronousExecutorRequirement` | serialized `Action.Requirement` string                | Runtime requirement for sync modes                   |

Example:

```python
spec = c3.WorkflowExecutionSpec(executor="asynchronous", runAsUser=True)
exec_run = workflow.start({"inputA": valueA}, spec)
```

## 2) Workflow.Action scheduling fields

`Workflow.Action` is the most explicit async scheduling vertex:

- `nodePool` (via `App.NodePoolAware`, typically `withNodePool(...)`)
- `hardwareConstraint`
- `requirementOverride` (serialized `Action.Requirement`)

Example:

```python
action = c3.Workflow.Action.fromActionRef(
    c3.ActionRef(typeName="MyType", actionName="heavyAction")
)

action = (
    action.withNodePool("task")
    .withHardwareConstraint(c3.HardwareConstraint(cpu=4, memoryMb=8192))
    .withRequirementOverride("cpu")
)
```

Notes:

- If node pool is not set, runtime can derive one from hardware constraints.
- If both are set, node pool must satisfy the hardware constraint.

## 3) JobOptions-backed vertices

These vertices accept options that flow into job start behavior and invalidation queue settings.

### Workflow.MapReduce

`Workflow.MapReduce#options` is `MapReduceOptions`, which mixes `JobOptions`.
So `nodePool`, `priority`, `maxConcurrency`, etc. can be set here.

```python
mapr_options = c3.MapReduceOptions(
    nodePool="task",
    priority=50,
    maxConcurrency=20,
    runAsUser=True,
)

mapr_vertex = c3.Workflow.MapReduce.fromJob(
    my_map_reduce_job,
    mapr_options,
    "runMapReduce",
    None,
)
```

### Workflow.Batch

`Workflow.Batch#options` is `Obj`. In practice, pass your batch job options object (which can include JobOptions fields, including node pool).

```python
batch_options = c3.BatchJobOptions(nodePool="task", priority=50, maxConcurrency=10)

batch_vertex = c3.Workflow.Batch.fromJob(
    my_batch_job,
    batch_options,
    "runBatch",
    None,
)
```

### Workflow.Coordinator

`Workflow.Coordinator` takes `JobOptions` directly in `fromCoordType(...)`.

```python
coord_options = c3.JobOptions(nodePool="task", maxConcurrency=10, runAsUser=True)

coord = c3.Workflow.Coordinator.fromCoordType(
    c3.MyBatchCoordinator.type(),
    "coord",
    coord_options,
    c3.Duration.fromMinutes(120),
)
```

## 4) Workflow.Nested and Workflow.Nested.Action

### Workflow.Nested

- `options` is a free-form `map<string, any>` passed to nested workflow start.
- There is no dedicated `nodePool` field on the `Workflow.Nested` vertex itself.
- Node-pool control is usually done inside the nested workflow (Action vertices, job options, coordinator options).

```python
nested = c3.Workflow.Nested.fromWorkflow(
    child_workflow,
    {"childInput": "x"},
    "child",
)
```

### Workflow.Nested.Action

- No direct `nodePool` field on this vertex type.
- Scheduling depends on the underlying async action and what workflow/job it launches.

## 5) JobOptions fields worth setting for queue behavior

Common queue/scheduling fields (from `JobOptions`) used across MapReduce/Batch/Coordinator:

- `nodePool`
- `priority`
- `maxConcurrency`
- `maxConcurrencyPerNode`
- `runAsUser`
- `skipIfRunning`
- `numAutoRecoveryAttempts`

Use these when you need explicit invalidation queue behavior.
