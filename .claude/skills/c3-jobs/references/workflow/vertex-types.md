# Vertex Types and Ports

## Port Semantics

- Control ports are prefixed with `$` and carry `Workflow.Signal`.
  - `$start` starts a vertex.
  - `$success` signals successful completion.
- Data ports carry actual data.
  - `out` is the standard output.
  - `in` is the standard input.
  - Action input ports match action argument names.
  - `error` emits an `Error` payload on failure for custom error-handling flows.

## Control Flow vs Data Flow

- **Control flow**: only `$success` → `$start` signals determine execution order.
- **Data flow**: output data feeds input arguments on downstream vertices.
- `error` is a data output (typed `Error`), not a control-signal port.
- You can mix both between the same two vertices (control for ordering, data for inputs).

## Vertex Catalog (When to Use)

- **Workflow.Action**: Execute a synchronous `ActionRef`. Supports `hardwareConstraint` and optional requirement override.
- **Workflow.Nested.Action**: Execute an async action that returns a `Workflow.Run`. Use when actions spawn workflows and you need to extract results.
- **Workflow.Nested**: Execute a statically defined workflow as a vertex.
- **Workflow.Batch**: Execute a `BatchJob` with optional `options` input and optional `JobHandler`.
- **Workflow.MapReduce**: Execute a `MapReduce` job with optional `options` input and optional `JobHandler`.
- **Workflow.Input / Workflow.Output**: Define workflow inputs and outputs.
- **Workflow.Const**: Provide a static value.
- **Workflow.Conditional**: Branch using `$true` and `$false`. Use `waitForTrue` only with a `timeout`.
- **Workflow.Join**: Fan-in for control flow. Waits for multiple `$success` inputs.
- **Workflow.Make**: Merge multiple inputs into a single object or map.
- **Workflow.Field**: Split a map or object into multiple outputs.
- **Workflow.Coordinator**: Run a `Workflow.Coordinatable` for batch coordination and concurrency control.

## Action Example

```python
action = c3.Workflow.Action.fromActionRef(
    c3.ActionRef(typeName="Echo", actionName="echoStrWithSleep")
)
```

## Nested vs Nested.Action Example

```python
# Nested: statically defined workflow
nested = c3.Workflow.Nested.fromWorkflow(my_workflow, None, "subflow")

# Nested.Action: async action returns Workflow.Run (or MlOperationRun)
nested_action = c3.Workflow.Nested.Action.fromAction(
    c3.ActionRef(typeName="MlModel.Train.Job", actionName="start"),
    None,
    "trainJob",
    None,
    c3.Array.ofStr("out"),
)
```

## Conditional and Join Example

```python
cond = c3.Workflow.Conditional.fromCondition(
    lambda args: args["score"] > 0.8,
    None,
    c3.Array.ofStr("score"),
    "qualityCheck",
    False,
    None,
)

join = c3.Workflow.Join.fromNumInputs(2, "fanIn")
```

## Make and Field Example (Python)

```python
# Merge two outputs into a tuple/object
vertex_combine = c3.Workflow.Make.fromTargetType(
    targetType=c3.TupleType.fromString("{ a: int, b: string }"),
    inTypes={"a": c3.IntType(), "b": c3.StringType()}
)

# Split an object/map into multiple outputs
vertex_split = c3.Workflow.Field.fromInputType(
    inputType=c3.ValueType.fromString("native"),
    outTypes={"a": "int", "b": "string"},
    name="split"
)
```

## Nested vs Nested.Action

- Use `Workflow.Nested` for a known, static sub-workflow.
- Use `Workflow.Nested.Action` when an action dynamically generates a workflow and returns a run you must wait on.

## Common Patterns

Sequential control flow:

```
Action1.$success -> Action2.$start -> Action3.$start
```

Parallel fan-in with Join:

```
ActionA.$success -> Join.$in1
ActionB.$success -> Join.$in2
Join.$success -> Next.$start
```

Data merge/split:

```
ActionA.out -> Make.a
ActionB.out -> Make.b
Make.out -> ActionC.input

ActionC.out -> Field.in
Field.foo -> ActionD.input
Field.bar -> ActionE.input
```
