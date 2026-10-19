# Hyperparameter Optimization (HPO)

Native HPO for `MlPipeline`: **search** a hyperparameter space and let the platform pick the best, instead of setting a single fixed combination with `withHyperparams()` (see ml-pipeline.md §6). HPO runs **implicitly inside `MlPipeline.train(...)`**: you attach a search space to the pipe, pass an `Hpo.Spec` to `train`, the platform runs trials, and `.result()` returns the pipeline **refit on the full training data with the winning hyperparameters**.

> **Author the pipeline first.** HPO optimizes one of the pipeline's `scores={...}` keys, so author the pipeline **with a scoring metric** before tuning (see ml-pipeline.md §1/§4).

## Procedure

1. Author the pipeline **with a scoring metric** (`scores={...}`) — HPO optimizes one of these score keys.
2. Attach a search space to the pipe(s) you want to tune via **`pipe.withHyperparamSpaces({...})`**.
3. Choose a **search algorithm** (`Hpo.OptunaSearch`) and **validation technique** (`MlSplit.*`).
4. Assemble an **`Hpo.Spec`** and pass it to `train` as `spec=c3.MlOperationSpec(hpoSpec=...)`.
5. Inspect results via the trained pipeline's **`experiment`** field.

## Search spaces (`Hp.ParamSpace`)

```py
# Categorical grid (explicit candidate values) — common for a small max_depth grid
spaces = {'max_depth': c3.Hp.ParamSpace.Categorical.fromValues([2, 3, 4, 5, 6])}
# Integer range is also available:  c3.Hp.ParamSpace.IntegerRange(...)
clf_pipe = clf_pipe.withHyperparamSpaces(spaces)
clf_pipe.hyperparamSpaces(['max_depth'])   # verify the space was attached
```

## Search algorithm & validation technique

```py
algo = c3.Hpo.OptunaSearch(algorithm='Grid')     # 'Grid' | 'Random' | 'TPE'
val  = c3.MlSplit.RandomHoldout(validationSize=0.2)   # or c3.MlSplit.KFold(...)
```

- `MlSplit.RandomHoldout(validationSize=...)` — one train/validation split per trial.
- `MlSplit.KFold(...)` — k runs per trial (k-fold CV).

## Build the `Hpo.Spec` and train

```py
exp_name = 'my_unique_hpo'
prior = c3.Hpo.Experiment.fetch(spec=c3.FetchSpec(filter=c3.Filter.fieldEq('name', exp_name))).objs
if prior:
    c3.Hpo.Experiment.removeBatch(prior)   # experiment names must be unique

hpo_spec = c3.Hpo.Spec(
    validationTechnique=val,
    algorithm=algo,
    maxTrials=5,               # cap candidates (early-termination knob)
    maxConcurrentTrials=2,     # parallel trials
    hpoMetric='Accuracy',      # MUST match a key in scores={...} on the pipeline
    experimentName=exp_name,
).withDefaults()

train_run = pipeline.train(
    x={'Features': X_train}, y={'Label': y_train},
    spec=c3.MlOperationSpec(hpoSpec=hpo_spec),   # canonical form
)
trained_pipeline = train_run.result()   # refit on all training data with best params
```

> The HPO tutorial also shows the shorthand `pipeline.train(x, y, hpoSpec=hpo_spec)`. Prefer the `spec=c3.MlOperationSpec(hpoSpec=...)` form shown in the model-dev-workflow doc.

## Inspect the search

```py
experiment = trained_pipeline.experiment
best = experiment.bestTrial()
print(best.name, best.statusForCoordinatable)
print(best.generatedParams.hyperparam)     # winning hyperparameters (e.g. tuned max_depth)
experiment.trialSummary()                   # all trials, sorted by validation score
experiment.runSummary(trialName='my_unique_hpo -> Trial-0')  # per-split runs of a trial
```

## HPO gotchas

- **`hpoMetric` must equal a `scores={...}` key** — otherwise there is nothing to optimize.
- **Unique `experimentName`** — clear any prior experiment with the same name (`fetch` + `removeBatch`) before training.
- **Tune on the training split only.** Never let the held-out test set participate in the search; evaluate on it once after `.result()`.
- **Errors don't fail the status.** As with jobs, check `train_run.errors()` / `experiment.errors()` even when status is "completed".
- **`maxSearchTime`/`maxTrials`** — for large searches (>~30 min) raise `Hpo.ExecutionConstraint#maxSearchTime` and `maxTrials` via the spec.
- **Runtime:** methods importing xgboost/sklearn need the matching action claim (see ml-pipeline.md §8 "Runtime action claims"), not the default `py`.
