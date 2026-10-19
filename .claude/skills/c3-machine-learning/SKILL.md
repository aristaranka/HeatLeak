---
name: c3-machine-learning
description: |
  Build, train, evaluate, deploy, and operate Machine Learning in C3 AI Platform. Use when:
  (1) Authoring ML pipelines (MlPipe/MlPipeline) and running train/process/score/interpret
  (2) Converting native models to MlPipes or custom pipes
  (3) Deploying ML models (MlModel, MlProject) and linking to application data for predictions
  (4) Running ML jobs (train job, process job, interpret job) at scale
  (5) Managing deployment lifecycle (promote champion, retire models)
  (6) Creating and evaluating Feature Sets using C3 AI Feature Store (for ML training **or** non-ML use cases such as analytics, reporting, and timeseries materialization)
  (7) Lambda Feature Sets with custom Python computation
  (8) Metric Feature Sets from existing Metrics
  (9) Feature materialization and snapshots for reproducible training or cached derived signals
  (10) evalFeatureSetBatch operations
  (11) Hyperparameter optimization (HPO) / tuning — searching a grid or space of hyperparameters (e.g. tree depth, learning rate) to select the best, via the native C3 HPO framework
  ALSO use this skill whenever a request describes a MODELING / PREDICTIVE task in plain language — even if it never names MlPipeline/MlModel/Feature.Set — e.g. "predict / forecast / estimate / classify / score / rank / recommend / detect anomalies in a value or category from other fields/columns", "train a model on this data", "regression/classification", "predict Y from X". This is especially the right approach when the user wants the model as **repeatable, reliable infrastructure** (retrainable, deployable, reused for ongoing predictions) rather than a throwaway one-off: build it with the native C3 Model Deployment Framework (Feature.Set -> MlPipeline -> MlModel), which captures exactly what data in what format feeds the model so predictions are reproducible. Prefer this over hand-rolling a pickled/serialized blob or a custom scoring function on a plain entity, which doesn't give you a repeatable, deployable model.
  See `references/ml-pipeline/ml-pipeline.md`, `references/ml-pipeline/ml-model.md`, and `references/feature-store/feature-store.md`.
core: true
category: platform
version: 8.9.0
minimumVersion: 8.7.0
---

# C3 AI Machine Learning

**Pipelines:** DAG-based `MlPipe`/`MlPipeline` — author in Python, then train, process, score, interpret. **Deployment:** `MlModel` wraps a pipeline with Feature.Set(s) and is deployed per subject group; jobs run train/predict at scale; route status (CANDIDATE → CHAMPION / RETIRED) controls which model serves predictions. **Feature Store:** `Feature.Set` provides Lambda or Metric-based feature computation, materialization, and snapshots. Feature Sets are **not ML-exclusive** — they're equally useful for analytics, reporting, and caching timeseries-derived signals. For timeseries-specific usage, see the `c3-timeseries` skill.

## Reference Dispatch

| Task                                                                                                                                                                        | Reference File                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Pipeline lifecycle: authoring, convert/custom pipes, train, process, score, interpret, hyperparams, freeze/unfreeze                                                          | `references/ml-pipeline/ml-pipeline.md`              |
| **HPO (hyperparameter search / tuning)**: search spaces, `Hpo.Spec`, inspecting the experiment                                                                              | `references/ml-pipeline/hpo.md`                      |
| Deploy models (MlProject, MlModel, deploy), ML jobs (Train.Job, ProcessJob, InterpretJob), lifecycle (promote champion, retire)                                             | `references/ml-pipeline/ml-model.md`                 |
| Feature Store: Lambda Feature Sets, Metric Feature Sets, materialization, snapshots, evalFeatureSetBatch, Feature.Set APIs                                                  | `references/feature-store/feature-store.md`          |
| Feature Store API reference: detailed Feature.Set fields, Feature.Store methods, Lambda creation, column types, validation rules                                            | `references/feature-store/feature-store-api.md`      |
| Feature Store examples: Lambda patterns (simple, fetch/transform, aggregate, timeseries, boolean), Metric Feature Set examples, Snapshot examples, Materialization examples | `references/feature-store/feature-store-examples.md` |

## Quick Reference

**Pipeline (see ml-pipeline.md):**

| Operation            | Code                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Train pipeline       | `pipeline.train(x=..., y=...).result()`                                                                                     |
| Process pipeline     | `trained.process(x=...).result()`                                                                                           |
| Score / Interpret    | `trained.score(...)` / `trained.interpret(...)`                                                                             |
| Hyperparams / Freeze | `pipe.hyperparams()`, `pipe.withHyperparams({...})`, `pipe.freeze()` / `pipeline.freeze([...])`, `pipeline.unfreeze([...])` |
| HPO (tune / search)  | `pipe.withHyperparamSpaces({...})` → `Hpo.Spec(...).withDefaults()` → `pipeline.train(x, y, spec=c3.MlOperationSpec(hpoSpec=spec))` → `trained.experiment.bestTrial()` |

**Model deployment & jobs (see ml-model.md):**

| Operation         | Code                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Create model      | `MlModel(...).create()` **create-only, never upsert**                                                     |
| Deploy model      | `model.deploy(subjectFilter=..., outputHandlers=[...])`                                                   |
| Train many models | `MlModel.Train.Job(groups=[...]).upsert().start().result()` **upsert before start**                       |
| Predict at scale  | `MlSubject.ProcessJob(project=...).upsert().start(OperationJobSpec(project=...))` **project on spec too** |
| Promote / Retire  | `route.updateStatus("CHAMPION")`, `route.updateStatus("RETIRED")`                                         |

**Feature Store (see feature-store.md):**

| Operation                 | Code                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Create Lambda Feature Set | `c3.Feature.Set.make({'id': 'Subject#name', 'subjectType': c3.Subject, 'columns': {...}, 'srcBatch': c3.Lambda.fromPySrc(code)}).upsert()` |
| Create Metric Feature Set | `c3.Feature.fromMetric(subjectType=..., metric=..., name=...).upsert()` then `Feature.Set({'features': [...]}).upsert()`                   |
| Evaluate features         | `c3.Subject.evalFeatureSetBatch(filter='true', featureSet=fs, skipMaterialized=True)`                                                      |
| Materialize               | `fs.materialize(spec=c3.Feature.MaterializationSpec(filter='true', start=..., end=..., sync=True))`                                        |
| Snapshot                  | `fs.createSnapshot(spec=c3.CreateSnapshotSpec(snapshotId='v1', subjectFilter='true', ...))`                                                |

## Key Types

| Type                    | Purpose                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `MlPipe` / `MlPipeline` | Pipeline DAG; train, process, score, interpret                       |
| `MlModel`               | Deployable unit: pipeline + Feature.Set(s); train/process by subject |
| `MlProject`             | Use case: subject type, router; groups models and routes             |
| `MlModel.Route`         | Deployed model on a subject group; status CANDIDATE/CHAMPION/RETIRED |
| `Feature.Set`           | ML feature definition (Lambda or Metric); supports materialization   |
| `Feature.Store`         | Singleton storage engine for feature data                            |
| `Feature.Set.Snapshot`  | Immutable copy of feature data for reproducible training             |

## Architecture Overview

```
MlPipeline (DAG of pipes)
  ├─ MlAtomicPipe (e.g. Sklearn, XGBoost, Keras via convert)
  ├─ MlAtomicPipe (feature transform)
  └─ MlAtomicPipe (post-processing)

Feature.Set (ML feature computation)
  ├─ Lambda Feature Sets: srcBatch lambda for custom Python computation
  ├─ Metric Feature Sets: features array referencing Feature names
  ├─ Materialization: cost-effective storage with high throughput
  └─ Snapshots: immutable data for reproducible training
```

## Quick Start

See `references/ml-pipeline/ml-pipeline.md` for the full lifecycle. Minimal authoring example:

```python
from sklearn import linear_model

lr = c3.MlPipe.convert(linear_model.LinearRegression())
mla = c3.MlPipeline.Authoring

x = mla.var()
y = mla.var()
y_pred = lr(x, y)

pipeline = mla.pipeline(
    x={'features': x},
    y={'target': y},
    out={'prediction': y_pred}
)

# Train, then process/score/interpret
trained = pipeline.train(x={'features': X_train}, y={'target': y_train}).result()
trained.process(x={'features': X_test}).result()
```

## End-to-End Recipe: Predict a Tabular Value/Category from Entity Fields

Use this linear recipe whenever the task is "predict / forecast / classify some value from other fields on an entity" (regression or classification on tabular data). It produces a **native, deployable** model — never a pickled blob or a hand-written scoring function. Do every step; **train synchronously (call `.result()`) as part of building the app so a trained `MlModel` exists immediately** — never leave training to a button/async job the user must trigger later.

> **A trained `MlPipeline` alone is NOT the finish line.** The deliverable is an **`MlModel`** (wrapping the pipeline + `Feature.Set`s) on an **`MlProject`**. It is a common and incorrect shortcut to author + `train()` + `upsert()` a bare `MlPipeline`, persist its id, and call `MlPipeline.get(id).process(...)` for inference — skipping steps 2 and 6. That produces **zero `MlModel` and zero `Feature.Set` rows** and is not a Model-Deployment-Framework app. You MUST create `Feature.Set`(s) (step 2) and an `MlModel` via `MlModel(...).create()` (step 6); inference then goes through the model/pipeline, not a hand-rolled path.

1. **Subject type** — the entity you predict about must `mixes MlSubject` in its `.c3typ` (e.g. `entity type Student mixes MlSubject { sat: int, gpa: double, ... }`). `MlSubject` extends `FeatureEvaluatable`.
2. **Feature Sets (REQUIRED — do not substitute a pandas frame)** — define an input (x) and target (y) `Feature.Set` on the subject via Lambda feature sets that read plain entity fields (one row per subject; id column named `subject`). Encode categoricals numerically here (e.g. `genderMale = 1.0/0.0`). Building features by fetching rows into a pandas DataFrame in Python and feeding that straight to the pipeline is the anti-pattern — the `MlModel` needs real `Feature.Set`s to know how to materialize x/y for a subject. See `references/feature-store/feature-store-examples.md`.
3. **Deterministic train/test split** — if the split is defined by stable ids (e.g. `s1..s160` train, `s161..s200` test), add a computed/stored `split` field or filter by id when evaluating feature sets / selecting the training subjects. Split BEFORE any tuning and tune on the training set only. There is no random seed needed — the id rule is fully reproducible.
4. **Author the pipeline** — convert a native estimator (e.g. `xgboost.XGBRegressor`) to an `MlPipe` and author an `MlPipeline` with a scoring metric (see §1/§4 of ml-pipeline.md). Attach a hyperparameter search space for tuning (see the HPO recipe below).
5. **Tune with native HPO** — run the grid/space search on the **training data only** to select the best hyperparameters (e.g. `max_depth`); the trained pipeline is automatically refit on the full training set with the winning params (see HPO recipe).
6. **MlProject + MlModel (REQUIRED — this is the deliverable, not the bare pipeline)** — create an `MlProject` (subjectType = your subject) and an `MlModel` wrapping the tuned pipeline + the x/y `Feature.Set`s, then `model.train(subjectFilter=<training subjects>).result()`. `MlModel` is **create-only** (`MlModel(...).create()`; remove the existing one first to recreate — never `.upsert()`/`.update()`). Do **not** stop after `MlPipeline.train().upsert()` — without the `MlModel`, the app has no deployable model artifact and fails a Model-Deployment-Framework check. Persist the resulting model id (e.g. on your result entity) so the UI/inference path can reference it.
7. **Held-out evaluation** — score once on the untouched test subjects (via the trained `MlModel`/pipeline) and report the out-of-sample metric (e.g. R²/RMSE). Persist predictions/metrics for the dashboard.

This is the whole "production ML infrastructure" path: `MlSubject` → `Feature.Set`(x/y) → `MlPipeline` (native estimator + HPO) → `MlProject`/`MlModel` → train → held-out eval. **Done means all of these exist:** ≥1 `Feature.Set`, ≥1 `MlPipeline`, and ≥1 `MlModel` (on an `MlProject`). You do **not** need to deploy the model or set up a CHAMPION/challenger route unless the user asks — a **trained `MlModel`** (not merely a trained pipeline) is sufficient.

## Hyperparameter Optimization (HPO)

HPO runs **implicitly inside** `MlPipeline.train(...)`: you attach a search space to the pipe, pass an `Hpo.Spec` to train, and the platform searches, then **refits the pipeline on the full training data with the best params**. Inspect results via `trained.experiment`. (Full walkthrough: `references/ml-pipeline/hpo.md`.)

```python
import xgboost

# 1. Attach a search space to the estimator pipe (grid over max_depth).
reg = xgboost.XGBRegressor(n_estimators=200, random_state=0)
reg_pipe = c3.MlPipe.convert(reg, spec=c3.SklearnLikeConvertSpec(name='XGB', processFunc='predict'))
reg_pipe = reg_pipe.withHyperparamSpaces(
    {'max_depth': c3.Hp.ParamSpace.Categorical.fromValues([2, 3, 4, 5, 6])}
)   # Hp.ParamSpace.IntegerRange(...) also available

# 2. Author the pipeline WITH a scoring metric; hpoMetric must match a scores key.
mla = c3.MlPipeline.Authoring
x_in, y_in = mla.var(), mla.var()
y_pred = reg_pipe(x_in, y_in)
mse = c3.MlMeanSquaredErrorMetric()(y_in, y_pred)
pipeline = mla.pipeline(
    x={'features': x_in}, y={'target': y_in},
    out={'prediction': y_pred}, scores={'mse': mse}
)

# 3. Build the Hpo.Spec (validation technique + search algo + the score to optimize).
exp_name = 'gpa_hpo_maxdepth'
prior = c3.Hpo.Experiment.fetch(spec=c3.FetchSpec(filter=c3.Filter.fieldEq('name', exp_name))).objs
if prior:
    c3.Hpo.Experiment.removeBatch(prior)   # experiment names must be unique — clear old runs
hpo_spec = c3.Hpo.Spec(
    validationTechnique=c3.MlSplit.RandomHoldout(validationSize=0.2),  # or MlSplit.KFold(...)
    algorithm=c3.Hpo.OptunaSearch(algorithm='Grid'),                    # 'Grid' | 'Random' | 'TPE'
    maxTrials=5,
    hpoMetric='mse',            # must equal a key in scores={...} above
    experimentName=exp_name,
).withDefaults()

# 4. Train on the TRAINING data only. HPO happens inside train; .result() is the
#    pipeline refit on all training data with the best hyperparameters.
train_run = pipeline.train(
    x={'features': X_train}, y={'target': y_train},
    spec=c3.MlOperationSpec(hpoSpec=hpo_spec),   # canonical form
)
trained_pipeline = train_run.result()

# 5. Inspect the winning hyperparameters / all trials.
experiment = trained_pipeline.experiment
best = experiment.bestTrial()
best_params = best.generatedParams.hyperparam        # contains the tuned max_depth
all_trials = experiment.trialSummary().to_pandas()   # per-trial validation scores
```

**HPO notes:**

- `hpoMetric` **must** match a key you put in `scores={...}` when authoring the pipeline, or the search has nothing to optimize.
- Experiment names must be unique — fetch + `removeBatch` any prior experiment with the same name before training (as above).
- The train call also accepts the shorthand `pipeline.train(x, y, hpoSpec=hpo_spec)`; the `spec=c3.MlOperationSpec(hpoSpec=...)` form is the documented canonical one — prefer it.
- Tune on the **training split only**. After `.result()`, the returned pipeline is already refit with the best params on the full training data — evaluate it once on the held-out test set for the out-of-sample number.
- Methods importing `xgboost`/`sklearn` need the matching runtime action claim (see Gotcha #1), not the default `py`.

## Critical Gotchas

These are the most common causes of hard-to-debug failures. **Read before writing any ML code.**

| #   | Gotcha                                                 | What goes wrong                                                              | Fix                                                                                                                                                                                         |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Runtime action claims / shared-module trap**         | `ModuleNotFoundError: No module named 'sklearn'` (or `'xgboost'`) at runtime — sometimes even from a plain getter that never imports it | Methods importing `sklearn`/`xgboost`/etc. need the matching runtime action claim (`py-sklearn_312`, `py-xgboost_312`, ...) in the `.c3typ`, not the default `py` (which maps to `py-data_312`, pandas/numpy only). Because all methods on a type share one `.py` module, a **module-level** heavy import forces the claim on **every** method (including plain getters). Full rule + suffix table + shared-module trap: **`c3-backend-code` → `references/python/python.md` § Runtime Action Claims**. |
| 2   | **MlModel is create-only**                             | `Cannot update object for create only type 'MlModel'`                        | Never use `.upsert()` or `.update()` on MlModel. Use `.create()`. To recreate, `.remove()` the existing one first.                                                                          |
| 3   | **Subject must mix MlSubject**                         | `Validation error: Change the type definition to include "mixes MlSubject"`  | The subject type in your `.c3typ` must `mixes MlSubject`, not just `FeatureEvaluatable`. `MlSubject` extends `FeatureEvaluatable`.                                                          |
| 4   | **MlProject.targetTypes required for DbOutputHandler** | `RouteRiskPrediction not in target types of project` when running ProcessJob | When using `MlModel.DbOutputHandler`, the MlProject must declare `targetTypes=[YourTargetType]`.                                                                                            |
| 5   | **Train.Job must be persisted before start()**         | `Required field MlModel.Train.JobRun.trainJob not set`                       | Always `.upsert()` the `MlModel.Train.Job` before calling `.start()`. The resulting JobRun needs a back-reference.                                                                          |
| 6   | **OperationJobSpec needs project**                     | `MlSubject$OperationJobSpec.project() is null`                               | The `OperationJobSpec` passed to `ProcessJob.start(jobSpec)` must include a `project` field, even though the ProcessJob itself has a project.                                               |
| 7   | **JobRun.errors() returns a Map**                      | Comparing `errors.count` (a function) to a number silently passes            | Use `errors.count()` (call as function), not `errors.count` (property access).                                                                                                              |
| 8   | **Lambda.fromPyFunc fails in runPyCode**               | `"Could not get the source code"` error                                      | Use `Lambda.fromPySrc(code_string)` instead of `Lambda.fromPyFunc(func)`.                                                                                                                   |
| 9   | **Feature.Set ID format**                              | Feature Set not found or duplicate                                           | ID must be `subjectType#name` format (e.g. `'WindTurbine#myFeatures'`).                                                                                                                     |

## Best Practices

- Start simple with `MlAtomicPipe`, compose into `MlPipeline` as complexity grows
- **Build predictive/statistical tasks with the native framework** (`Feature.Set` → `MlPipeline` → `MlModel`), even when the user describes the task in plain language and never names those types. Do not fall back to a pickled/serialized model on a plain entity or a hand-written scoring function.
- **When the app should show results immediately, train synchronously as part of building it** (call `.result()` on train), so a trained `MlModel` and its predictions exist on hand-over — do not defer training to a user-triggered button or a fire-and-forget async job.
- Tune hyperparameters with the native **HPO** framework (search space + `Hpo.Spec`) rather than a hand-rolled Python CV loop; tune on the training split only.
- Use `freeze()`/`unfreeze()` to control which pipes retrain
- Always score the pipeline before relying on outputs for downstream use
- **ML lifecycle tests are slow** (~30-60s for training). Split into separate test files: one for data/features, one for training+deployment. Avoid combining ProcessJob and Train.Job in the same test file.
- Use `srcBatch` (not `src`) for batch-mode materialization — more efficient
- Always set `timeHorizon` on Feature Sets to limit materialization scope
- Use `asOfFeature` for point-in-time joins in ML training to prevent data leakage
- Create snapshots before training models for reproducibility
- Test with `skipMaterialized=True` before materializing to production

## Common Anti-Patterns

1. **Hand-rolling a model as a pickled/serialized blob on a plain entity, or writing a custom scoring function** — a predictive task must be built with the native framework (`Feature.Set` → `MlPipeline` → `MlModel`); the trained pipeline/model is what produces predictions. Storing a pickled estimator on an entity field or computing predictions in ad-hoc Python is not a C3 model.
2. **Stopping at a bare trained `MlPipeline` (no `MlModel`, no `Feature.Set`)** — authoring + `train()` + `upsert()`-ing a pipeline and then calling `MlPipeline.get(id).process(...)` for inference skips the deployment layer. The deliverable is an `MlModel` (via `MlModel(...).create()`) wrapping the pipeline + `Feature.Set`s on an `MlProject`. Build features as real `Feature.Set`s, not a pandas frame fed straight into the pipeline.
3. **Deferring training to later (async job / UI button) when results are needed now** — train synchronously with `.result()` so a trained `MlModel` exists on hand-over.
4. **Hand-rolling hyperparameter search in a Python loop** — use the native HPO framework (search spaces + `Hpo.Spec`) so trials and the best model are tracked as platform artifacts.
5. **Training without scoring** — evaluate the pipeline before using it
6. **Not freezing stable pipes** — unnecessary retraining of data transformations
7. **Using `.upsert()` on MlModel** — it is create-only; use `.create()` with pre-cleanup
8. **Wrong runtime action claim for methods importing sklearn/xgboost (or a getter sharing that `.py`)** — see Gotcha #1 above; full rule in `c3-backend-code` → `references/python/python.md` § Runtime Action Claims.
9. **Omitting `targetTypes` from MlProject** — required for DbOutputHandler to persist predictions
10. **Forgetting to persist Train.Job before start()** — `.upsert()` before `.start()`
11. **Using `Lambda.fromPyFunc()` in runPyCode** — always use `Lambda.fromPySrc(code_string)`
12. **Skipping `doNotMaterialize` during development** — use it for testing, remove for production
