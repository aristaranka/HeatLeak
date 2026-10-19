# App-Agnostic Workflow Examples

These examples use only Workflow and platform APIs. `ActionRef(typeName="YourType", actionName="yourAction")` and similar are placeholders. Replace `YourType`, `yourAction`, and port names (e.g. `inputVal`, `constVal`) with your application type, action, and argument names. All code is Python.

---

## Example 1: Input, Const, Action, Output (data flow)

Vertices: dynamic input, constant value, one action, one output. Edges are data flow only (output port to input port).

```python
inp = c3.Workflow.Input.fromName("inputKey")
const_val = c3.Workflow.Const.fromConst(42)
action = c3.Workflow.Action.fromActionRef(
    c3.ActionRef(typeName="YourType", actionName="yourAction")
)
out = c3.Workflow.Output.fromName("outputKey")

wf = c3.Workflow(
    vertices=[inp, const_val, action, out],
    edges=[
        c3.Workflow.makeEdge(inp.port("out"), action.port("inputVal")),
        c3.Workflow.makeEdge(const_val.port("out"), action.port("constVal")),
        c3.Workflow.makeEdge(action.port("out"), out.port("in")),
    ],
).create()

exec_spec = c3.WorkflowExecutionSpec(executor="asynchronous")
run = wf.start({"inputKey": "value"}, exec_spec)
status = run.status()
```

Use port names that match your action’s argument names (e.g. `inputVal`, `constVal`).

---

## Example 2: Sequential chain of Nested workflows

Two minimal sub-workflows are built, then used as vertices in a top-level workflow. Control flow links them: `$success` of the first Nested to `$start` of the second.

```python
# Sub-workflow 1: Input -> Action -> Output
inp1 = c3.Workflow.Input.fromName("x")
act1 = c3.Workflow.Action.fromActionRef(
    c3.ActionRef(typeName="YourType", actionName="stepOne")
)
out1 = c3.Workflow.Output.fromName("step1Out")
sub1 = c3.Workflow(
    vertices=[inp1, act1, out1],
    edges=[
        c3.Workflow.makeEdge(inp1.port("out"), act1.port("inputVal")),
        c3.Workflow.makeEdge(act1.port("out"), out1.port("in")),
    ],
).create()

# Sub-workflow 2: Input -> Action -> Output
inp2 = c3.Workflow.Input.fromName("y")
act2 = c3.Workflow.Action.fromActionRef(
    c3.ActionRef(typeName="YourType", actionName="stepTwo")
)
out2 = c3.Workflow.Output.fromName("step2Out")
sub2 = c3.Workflow(
    vertices=[inp2, act2, out2],
    edges=[
        c3.Workflow.makeEdge(inp2.port("out"), act2.port("inputVal")),
        c3.Workflow.makeEdge(act2.port("out"), out2.port("in")),
    ],
).create()

# Top-level: sequential Nested vertices
v1 = c3.Workflow.Nested.fromWorkflow(workflow=sub1, name="Step1")
v2 = c3.Workflow.Nested.fromWorkflow(workflow=sub2, name="Step2")
edges = [
    c3.Workflow.makeEdge(v1.port("$success"), v2.port("$start")),
]
top = c3.Workflow(vertices=[v1, v2], edges=edges).create()

exec_spec = c3.WorkflowExecutionSpec(executor="asynchronous")
run = top.start({"Step1": {"x": "a"}, "Step2": {"y": "b"}}, exec_spec)
status = run.status()
```

---

## Example 3: Parallel branches and Join

Two Nested vertices run in parallel; a Join waits for both, then execution continues. Each Nested wraps a minimal sub-workflow.

```python
# Minimal sub-workflows for each branch
def make_sub(name, action_name):
    inp = c3.Workflow.Input.fromName("z")
    act = c3.Workflow.Action.fromActionRef(
        c3.ActionRef(typeName="YourType", actionName=action_name)
    )
    out = c3.Workflow.Output.fromName("out")
    w = c3.Workflow(
        vertices=[inp, act, out],
        edges=[
            c3.Workflow.makeEdge(inp.port("out"), act.port("inputVal")),
            c3.Workflow.makeEdge(act.port("out"), out.port("in")),
        ],
    ).create()
    return c3.Workflow.Nested.fromWorkflow(workflow=w, name=name)

n1 = make_sub("BranchA", "branchA")
n2 = make_sub("BranchB", "branchB")
join = c3.Workflow.Join.fromNumInputs(2, "fanIn")

edges = [
    c3.Workflow.makeEdge(n1.port("$success"), join.port("$in1")),
    c3.Workflow.makeEdge(n2.port("$success"), join.port("$in2")),
]
wf = c3.Workflow(vertices=[n1, n2, join], edges=edges).create()

exec_spec = c3.WorkflowExecutionSpec(executor="asynchronous")
run = wf.start({"BranchA": {"z": 1}, "BranchB": {"z": 2}}, exec_spec)
status = run.status()
```

---

## Example 4: Conditional branch

A Conditional vertex branches on a condition; `$true` and `$false` connect to different actions. Wire an Input (or other data source) to the Conditional's input port so the condition receives the value; the port name matches the name in `c3.Array.ofStr(...)`. Use placeholder types for the actions.

```python
inp = c3.Workflow.Input.fromName("score")

cond = c3.Workflow.Conditional.fromCondition(
    lambda args: (args.get("score") or 0) > 0.9,
    None,
    c3.Array.ofStr("score"),
    "scoreGate",
    False,
    None,
)

approve = c3.Workflow.Action.fromActionRef(
    c3.ActionRef(typeName="YourType", actionName="approve")
)
reject = c3.Workflow.Action.fromActionRef(
    c3.ActionRef(typeName="YourType", actionName="reject")
)

wf = c3.Workflow(
    vertices=[inp, cond, approve, reject],
    edges=[
        c3.Workflow.makeEdge(inp.port("out"), cond.port("score")),
        c3.Workflow.makeEdge(cond.port("$true"), approve.port("$start")),
        c3.Workflow.makeEdge(cond.port("$false"), reject.port("$start")),
    ],
).create()

exec_spec = c3.WorkflowExecutionSpec(executor="asynchronous")
run = wf.start({"score": 0.95}, exec_spec)
status = run.status()
```

---

## Example 5: Error port

When an action fails, its `error` output port carries the error. Connect it to an error-handler action and optionally to an output for the error path.

```python
inp = c3.Workflow.Input.fromName("inputKey")
action = c3.Workflow.Action.fromActionRef(
    c3.ActionRef(typeName="YourType", actionName="mayFail")
)
out_ok = c3.Workflow.Output.fromName("result")
error_handler = c3.Workflow.Action.fromActionRef(
    c3.ActionRef(typeName="YourType", actionName="handleError")
)
out_err = c3.Workflow.Output.fromName("errorResult")

wf = c3.Workflow(
    vertices=[inp, action, out_ok, error_handler, out_err],
    edges=[
        c3.Workflow.makeEdge(inp.port("out"), action.port("inputVal")),
        c3.Workflow.makeEdge(action.port("out"), out_ok.port("in")),
        c3.Workflow.makeEdge(action.port("error"), error_handler.port("error")),
        c3.Workflow.makeEdge(error_handler.port("out"), out_err.port("in")),
    ],
).create()

exec_spec = c3.WorkflowExecutionSpec(executor="asynchronous")
run = wf.start({"inputKey": "value"}, exec_spec)
status = run.status()
```

Use argument names that match your actions (e.g. `error` for the handler’s input).

---

## Example 6: finallyVertex

A cleanup action runs after the workflow finishes (success, failure, or cancel). It must accept `run: Workflow.Run` so it can inspect the run. Set it via `finallyVertex` on the Workflow.

```python
inp = c3.Workflow.Input.fromName("inputKey")
action = c3.Workflow.Action.fromActionRef(
    c3.ActionRef(typeName="YourType", actionName="mainAction")
)
out = c3.Workflow.Output.fromName("outputKey")

cleanup_action = c3.Workflow.Action.fromActionRef(
    c3.ActionRef(typeName="YourCleanupType", actionName="cleanupRun")
)

wf = c3.Workflow(
    vertices=[inp, action, out],
    edges=[
        c3.Workflow.makeEdge(inp.port("out"), action.port("inputVal")),
        c3.Workflow.makeEdge(action.port("out"), out.port("in")),
    ],
    finallyVertex=cleanup_action,
).create()

exec_spec = c3.WorkflowExecutionSpec(executor="asynchronous")
run = wf.start({"inputKey": "value"}, exec_spec)
status = run.status()
# Optional: wait for main and finally to complete
# status = run.waitForFinallyCompletion(timeoutMinutes=20, displayStatus=True, spec=c3.WaitSpec().withDefaults())
```

Your cleanup type must define an action with signature `(run: Workflow.Run)` (and optionally return value).

---

## Example 7: Action with nodePool (scheduling)

Attach a node pool to an action vertex with `.withNodePool(...)` so execution is scheduled on that pool. Start the workflow with `WorkflowExecutionSpec(executor="asynchronous")`.

```python
inp = c3.Workflow.Input.fromName("inputKey")
action = c3.Workflow.Action.fromActionRef(
    c3.ActionRef(typeName="YourType", actionName="heavyAction")
).withNodePool("task")
out = c3.Workflow.Output.fromName("outputKey")

wf = c3.Workflow(
    vertices=[inp, action, out],
    edges=[
        c3.Workflow.makeEdge(inp.port("out"), action.port("inputVal")),
        c3.Workflow.makeEdge(action.port("out"), out.port("in")),
    ],
).create()

exec_spec = c3.WorkflowExecutionSpec(executor="asynchronous")
run = wf.start({"inputKey": "value"}, exec_spec)
status = run.status()
```

Replace `"task"` with your app’s node pool name. For `Workflow.Coordinator` or `Workflow.MapReduce`/`Workflow.Batch`, you need an application-provided Coordinatable or Job type; the pattern is the same (options carry node pool / job options).

---

## Example 8: BatchJob vertex

A `Workflow.Batch` vertex runs a BatchJob. You need an instance of your application's BatchJob type (e.g. from a get or create); the example uses a placeholder `your_batch_job`. Options can be passed at build time via `BatchJobOptions` (platform type) or wired from an Input/Const to the vertex's `options` port. The Batch vertex has an `out` port for the job result.

```python
# Replace with an instance of your app's BatchJob type (e.g. YourBatchJob.get("id"))
your_batch_job = None  # placeholder

batch_options = c3.BatchJobOptions(
    nodePool="task",
    priority=50,
    maxConcurrency=10,
)

batch_vertex = c3.Workflow.Batch.fromJob(
    your_batch_job,
    batch_options,
    "runBatch",
    None,
)
out = c3.Workflow.Output.fromName("result")

wf = c3.Workflow(
    vertices=[batch_vertex, out],
    edges=[
        c3.Workflow.makeEdge(batch_vertex.port("out"), out.port("in")),
    ],
).create()

exec_spec = c3.WorkflowExecutionSpec(executor="asynchronous")
run = wf.start({}, exec_spec)
status = run.status()
```

Replace `your_batch_job` with a real BatchJob instance from your application. You can optionally feed `options` at runtime by adding an Input (or Const) and an edge to `batch_vertex.port("options")`.
