# ML Model Deployment, Jobs, and Lifecycle

This reference covers deploying ML models by linking them to the application data model, running ML jobs (train and predict at scale), and managing deployment lifecycle (promote champion, retire old models). Pipeline authoring and direct train/process/score/interpret are in **references/ml-pipeline.md**.

> **The `MlModel` is the deliverable for a repeatable modeling task, not a bare `MlPipeline`.** An `MlModel` makes prediction reproducible and reliable: it captures exactly what data, in what format, is fed to the model to produce the right prediction — the same role the ingestion framework plays when a load "isn't a one-off." So even when you only want a single trained model (no jobs, no CHAMPION route), you still create an `MlProject` + `Feature.Set`s + `MlModel` (create-only) and call `model.train(...).result()`. A trained pipeline you `upsert()` and then call `MlPipeline.get(id).process(...)` on is **not** a Model-Deployment-Framework model — it has no `MlModel`/`Feature.Set` rows. See the End-to-End Recipe in `SKILL.md`.

**Source:** Repo tutorials `Model-Deployment.ipynb`, `ML-Model-Train-Job.ipynb`, `Model-Operation-Jobs.ipynb`; platform doc `ds-model-deployment-overview.c3doc.md`.

---

## 1. Deploy ML models (link to application data, make predictions for an ML task)

### Concepts

- **MlProject** — One business use case. Defines the “contract”: **subject type** (the entity predictions are for) and where outputs go. Central to MDF APIs.
- **MlSubject** — The entity that is the “input” to a model (e.g. a wind turbine, a transaction). Must be **Identified**. The project’s `subjectType` is the C3 Type of the subject. **The subject type must `mixes MlSubject` in its `.c3typ`, not just `FeatureEvaluatable`.** `MlSubject` extends `FeatureEvaluatable`, so you get everything from both. Using only `FeatureEvaluatable` will cause a validation error when creating an MlProject.
- **MlModel** — Deployable unit that wraps an **MlPipeline** with **Feature.Set**s so it can **train and predict without you passing data**. The model uses `xFeatures` and `yFeatures` (and optional context) to pull data per subject via the subject type (e.g. `WindTurbine.evalFeatureSetBatch(...)`).

### Create project and model

1. **MlProject** — Set `subjectType` to the application type that is the subject (e.g. `WindTurbine`). Optionally set a custom **router** (`MlModel.RelationRouter` default, or `MlModel.RuleRouter` for rule-based routing). For `MlModel.RelationRouter` you need a relation type extending `MlSubjectToModelRelation<YourSubject>` (often auto-created in Dev).

```py
project = c3.MlProject(
    id="my-predictive-maintenance",
    name="Predictive Maintenance",
    subjectType=c3.WindTurbine,
    router=c3.MlModel.RuleRouter(),  # or RelationRouter().create()
    targetTypes=[c3.MyPredictionType],  # **REQUIRED if using DbOutputHandler**
).upsert()
```

> **`targetTypes` is required** when using `MlModel.DbOutputHandler` to persist predictions. Omitting it causes `"<TargetType> not in target types of project"` at ProcessJob time. List every entity type that `DbOutputHandler` will write to.

2. **Feature.Set**s — Define (or fetch) `Feature.Set`s for inputs and target, keyed to the subject type. The model will evaluate these for each subject.

```py
X_features = c3.Feature.Set(id="WindTurbine#windTurbineFeatures_ml").get()
y_features = c3.Feature.Set(id="WindTurbine#labelFeatureSet").get()
```

3. **MlModel** — Wrap an **MlPipeline** with `xFeatures`, `yFeatures`, and assign to the **project**. Keys in `xFeatures`/`yFeatures` must match the pipeline’s `x`/`y` names. The model is immutable (pipeline and feature sets fixed after create).

> **MlModel is create-only.** Never use `.upsert()` or `.update()`. Use `.create()`. To recreate, `.remove()` the existing one first, then `.create()` the new one.

```py
# Remove pre-existing model if it exists (MlModel is create-only)
try:
    c3.MlModel.forId("my-model-v1").remove()
except Exception:
    pass

model = c3.MlModel(
    id="my-model-v1",
    name="My Model",
    pipeline=untrained_pipeline,
    project=project,
    xFeatures={'features': X_features},
    yFeatures={'target': y_features},
).create()
```

4. **Train the model** — Use subjects (or `subjectFilter`) and optional time range. The model evaluates the Feature.Set(s) for those subjects and passes data to the pipeline.

```py
operation_run = model.train(
    subjects=wind_turbines[:10],
    start="2022-01-01",
    end="2022-01-05"
)
trained_model = operation_run.result()  # or use subjectFilter=...
```

5. **Deploy** — Deploy the trained model to a **group of subjects** with a filter. Returns an **MlModel.Route** (status starts as **CANDIDATE**). Optionally pass **outputHandlers** (and **interpretHandlers**) to persist predictions (e.g. to DB or CSV).

```py
route = model.deploy(subjectFilter="location == 'FRA'")

# With persistence: DbOutputHandler writes pipeline output to a type
process_handler = c3.MlModel.DbOutputHandler(
    outputNames=["predictions"],
    targetType=c3.MyPredictionType,
    ...
)
route = model.deploy(
    subjectFilter="location == 'FRA'",
    outputHandlers=[process_handler],
)
```

- **Routing:** For a given subject, the project’s **router** selects which deployed model(s) to use. `subject.models(project=project)` returns the models currently deployed for that subject.

### Direct model operations (no job)

- `model.train(subjects=..., start=..., end=...)` , where `subjects` may be replaced by `subjectFilter` — train on data for those subjects.
- `model.process(subjects=..., start=..., end=...)` — run predictions for those subjects; the model pulls features and runs the pipeline.

---

## 2. Run ML jobs (train / predict at scale)

### Model training job — train many models

Use **MlModel.Train.Job** to train many models (e.g. one per region or product) in a distributed way.

- **MlModel.Train.Template** — Which model to train: `template = c3.MlModel.Train.Template(model=my_ml_model)`.
- **MlModel.Train.Strategy** — How to get training data and group subjects: `groupBy` (e.g. `"location"`), `start`, `end` for feature evaluation.
- **MlModel.Train.Group** — Pairs one template with one strategy: `c3.MlModel.Train.Group(template=lr_template, strategy=training_strategy_per_country)`.
- **MlModel.Train.Job** — Takes a list of groups; **.start()** returns an operation run; **.result()** gives the **MlModel.Train.JobRun**.

```py
training_strategy = c3.MlModel.Train.Strategy(
    groupBy="location",
    start="2022-01-01",
    end="2022-12-31",
)
lr_template = c3.MlModel.Train.Template(model=model_lr)
group = c3.MlModel.Train.Group(template=lr_template, strategy=training_strategy)

training_job = c3.MlModel.Train.Job(groups=[group])
training_job = training_job.upsert()  # **MUST persist before start()**
job_run = training_job.start().result()
```

> **Always `.upsert()` the Train.Job before `.start()`.** The resulting `JobRun` needs a back-reference to the persisted Job. Without this, you get `"Required field MlModel.Train.JobRun.trainJob not set"`.

- **job_run.summary()** — Summary of trained models (e.g. `.to_pandas()`). **job_run.errors()** — errors for failed runs (returns a Map; use `.count()` to get error count as a function call, not property). **job_run.get().summary(watch=True)** — monitor in-progress job. **start().cancel()** — cancel a running job.

### Subject process job — large-scale predictions

Use **MlSubject.ProcessJob** to run predictions for many subjects; the platform routes each subject to the right deployed model and can batch for parallelism.

- You specify **project**, **subjectFilter**, and time range (**start**, **end**). Optionally **batchSize**.
- No need to specify models — routing is by project and deployment.

```py
job_spec = c3.MlSubject.OperationJobSpec(
    project=project,  # **REQUIRED — must be set on the spec, not just the ProcessJob**
    subjectFilter="true",
    start="2022-01-01",
    end="2022-01-31",
    batchSize=10,
)
process_job_run = c3.MlSubject.ProcessJob(project=project).upsert().start(job_spec)
```

> **The `OperationJobSpec` must include `project`.** Even though the `ProcessJob` itself has a `project` field, the spec passed to `.start(jobSpec)` must also have it. Without this, you get `"MlSubject$OperationJobSpec.project() is null"`.

- **process_job_run.summary()** — progress/results. **process_job_run.errors()** — failures (returns a Map; use `.count()` to get error count). **process_job_run.visualize(static=True)** — execution view. Use **MlSubject.OperationJobSpec.numAutoRecoveryAttempts** for automatic retries.

### Subject interpret job

**MlSubject.InterpretJob** — Same pattern as ProcessJob but for running **interpret** at scale: `c3.MlSubject.InterpretJob(project=project).upsert().start(interpret_job_spec)` with an **MlSubject.OperationJobSpec**.

---

## 3. Manage deployment lifecycle (retire old, promote champion)

### Route status

**MlModel.Route** has a status with **label**: `CANDIDATE`, `CHALLENGER`, `CHAMPION`, `RETIRED`.

- **CANDIDATE** — Newly deployed; not yet used for “live” predictions.
- **CHAMPION** — Model used for production predictions (what the app should use).
- **CHALLENGER** — Competing model for comparison.
- **RETIRED** — No longer used for inference.

### Promote and retire

- **Promote a route to champion:** `route.updateStatus("CHAMPION")`.
- **Retire a route:** `route.updateStatus("RETIRED")` — route no longer used for inference.

Typical flow: deploy new model → route is CANDIDATE → validate → **updateStatus("CHAMPION")**; then **updateStatus("RETIRED")** on the old route.

### Query deployed models per subject

- **subject.models(project=project)** — Models currently deployed for that subject (all statuses).
- **subject.models(project=project, statusFilter="label == 'CHAMPION'")** — Only champion model(s).

### Audit

- **MlModel.Route.StatusHistory** — History of status changes per route (start, end, label). Fetch with `include='parent.model.id, parent.subjectFilter, parent.id, start, end, label'` (or similar).

---

## Quick reference

| Goal                | API / pattern                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Create project      | `MlProject(..., subjectType=SubjectType, router=..., targetTypes=[...]).upsert()`                         |
| Create model        | `MlModel(pipeline=..., project=..., xFeatures={...}, yFeatures={...}).create()` **create-only**           |
| Train model         | `model.train(subjects=..., start=..., end=...).result()` or `subjectFilter=...`                           |
| Deploy model        | `model.deploy(subjectFilter=..., outputHandlers=[...])` → MlModel.Route                                   |
| Train many models   | `MlModel.Train.Job(groups=[...]).upsert().start().result()` **upsert before start**                       |
| Predict at scale    | `MlSubject.ProcessJob(project=...).upsert().start(OperationJobSpec(project=...))` **project on spec too** |
| Interpret at scale  | `MlSubject.InterpretJob(project=...).upsert().start(spec)`                                                |
| Promote to champion | `route.updateStatus("CHAMPION")`                                                                          |
| Retire route        | `route.updateStatus("RETIRED")`                                                                           |
| Models for subject  | `subject.models(project=..., statusFilter="label == 'CHAMPION'")`                                         |

**Tutorial notebooks:** `platform/repo/server/tutorials/notebooks/Model-Deployment.ipynb`, `ML-Model-Train-Job.ipynb`, `Model-Operation-Jobs.ipynb`.
