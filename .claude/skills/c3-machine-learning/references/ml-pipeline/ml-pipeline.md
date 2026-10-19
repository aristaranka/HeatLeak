# MlPipeline Authoring, Training, Scoring, Interpretation, Hyperparameters, HPO & Freeze/Unfreeze

## 1. Authoring an ML Pipeline

### Entry point and placeholders

- **Entry point:** `MlPipeline.Authoring` (typically `mla = c3.MlPipeline.Authoring` in Python SDK).
- **Placeholder variables:** Use `mla.var()` for pipeline inputs. Wire these through pipes to define the DAG.
- **Building blocks:** Pipes are either **atomic** (`MlAtomicPipe`) or **pipelines** (`MlPipeline`). Compose them into a single pipeline via the authoring API.

### Converting native Python objects to MlPipes

- Use **`mla.convert(model, spec=...)`** or **`c3.MlPipe.convert(model, spec=...)`** to turn native models into `MlPipe`s. **Libraries supported by `convert()`** (see `platform/.../ml/pipe/MlPipe.py`): sklearn, xgboost, lightgbm, catboost, and keras (keras only on Python 3.9). For other frameworks use **MlLambdaPipe** or **MlDynamicPipe**.
- For **sklearn-like** pipes use **`SklearnLikeConvertSpec`**:
  - `processFunc`: function name used for **process** (e.g. `'predict'`, `'transform'`). Set explicitly when the default is wrong.
  - `keepInputColumnIndices`: optional, for column handling.
- Hyperparameters are set on the **native** model before `convert`.

```py
mla = c3.MlPipeline.Authoring

ss = StandardScaler()
ss_pipe = mla.convert(ss, spec=c3.SklearnLikeConvertSpec(keepInputColumnIndices=True, name=PIPE_NAME))  # optional PIPE_NAME used for MlPipeline vertex naming later

clf = RandomForestClassifier(random_state=0, max_depth=5, n_estimators=20)
clf_pipe = mla.convert(clf, spec=c3.SklearnLikeConvertSpec(processFunc='predict'))
```

### Custom pipes in Python

- **MlLambdaPipe:** custom logic via lambdas/functions; good for simple, stateless transforms.
- **MlDynamicPipe:** full control over train/process and types; use when you need dynamic behavior or non-standard I/O.
- See tutorials: ML-Lambda-Pipe, ML-Dynamic-Pipe (and ML-Template-Pipe for template-based pipelines).

### Assembling the pipeline (DAG)

- Connect placeholders by **calling pipes as functions** on `mla.var()` outputs and passing outputs to the next pipe. Then call **`mla.pipeline(...)`** to build the `MlPipeline`.
- **`mla.pipeline()`** key arguments:
  - **`x`:** dict of name → placeholder (or single placeholder) for features.
  - **`y`:** optional; dict or placeholder for labels (training).
  - **`out`:** dict of output name → last pipe output (predictions/transform).
  - **`scores`:** optional; dict of score name → scoring metric output (e.g. `MlAccuracyMetric(y_true, y_pred, ...)`).
  - **`interpretations`:** optional; dict of name → interpreter output (e.g. `shap_interpreter(pipe=..., x=...)`).
  - **`context`:** optional; dict for extra inputs (e.g. sample weights) used by metrics or other nodes.

```py
X_input, y_input = mla.var(), mla.var()
accuracy_metric = c3.MlAccuracyMetric()
ss_out = ss_pipe(X_input)
y_output = clf_pipe(ss_out, y_input)
accuracy_out = accuracy_metric(y_input, y_output)

pipeline = mla.pipeline(
    x={'Features': X_input},
    y={'Label': y_input},
    out={'Predictions': y_output},
    scores={"Scores": accuracy_out}
)
```

- Input/output **keys** (e.g. `'Features'`, `'Predictions'`, `'Scores'`) are used when calling **train**, **process**, and **score** with dicts of `Data`.
- **Visualize:** `pipeline.visualize()` to inspect the DAG.

---

## 2. Training

- **API:** `pipeline.train(x=..., y=..., ...)`.
- **Data:** Pass `Data` instances; keys must match the names given in `mla.pipeline(x=..., y=...)` (e.g. `x={'Features': X_train}`, `y={'Label': y_train}`).
- **Async:** Training runs asynchronously server-side by default. The call returns an **`MlOperationRun`**; use **`.result()`** to block and get the trained pipeline.

```py
pipeline_trained = pipeline.train(
    x={'Features': X_train},
    y={'Label': y_train}
).result()
```

- **Cancel:** `run.run.cancel()` on the `MlOperationRun` if needed.

---

## 3. Process (predictions / inference)

- **API:** `trained_pipeline.process(x=..., ...)`.
- **Data:** Pass `Data` for features; keys match pipeline `x` (e.g. `x={'Features': X_test}`).
- **Async:** Returns **`MlOperationRun`**; use **`.result()`** to get the result.
- **Output:** Result is a dict of output name → `Data`; use the same keys as in `out` (e.g. `'Predictions'`).

```py
predictions = pipeline_trained.process(x={'Features': X_test}).result()
predictions['Predictions']   # c3.Data of predictions
```

---

## 4. Score

- **Requirement:** Pipeline must have been authored with **`scores=...`** in `mla.pipeline()` (e.g. `MlAccuracyMetric`).
- **API:** `trained_pipeline.score(x=..., y=..., ...)`.
- **Data:** Pass `x` and `y` (and optional `context`) with keys matching the pipeline. Same key names as used in train.
- **Async:** Returns **`MlOperationRun`**; use **`.result()`** to get the result. Access score by the key used in `scores` (e.g. `'Scores'`).

```py
score_output = pipeline_trained.score(
    x={'Features': X_train},
    y={'Label': y_train}
).result()
score_output['Scores']   # e.g. scalar accuracy
```

- **Context (e.g. sample weights):** If the pipeline was authored with `context={'sampleWeights': mla.var()}`, pass it in score: e.g. `score(..., context={'sampleWeights': weights})`.

---

## 5. Interpret

- **Concept:** An **interpreter** (e.g. `ShapInterpreter`) is tied to a specific **`MlAtomicPipe`** in the pipeline and explains how features influence that pipe's predictions.
- **Authoring:** Create the interpreter (e.g. `c3.ShapInterpreter312.fromExplainer(explainer=shap.TreeExplainer, spec=c3.MlInterpretSpec(...))` in Python), then in the DAG call it with **`interpreter(pipe=<train_var>, x=<data>)`** where `pipe` is the pipe to interpret (often from `pipe.train_var(x=..., y=...)` and `process_var` for process). Pass this into **`mla.pipeline(..., interpretations={'name': interpreter_out})`**.
- **Execution:** On a **trained** pipeline, call **`.interpret(x=...).result()`**. Only `x` is required (same key semantics as process). The platform runs the interpreter for the linked pipe and returns artifacts.

```py
# Authoring: attach interpreter to a pipe in the DAG
tree_shap_out = tree_shap(pipe=rf_trained, x=mm_out)
sample_pipeline = mla.pipeline(..., interpretations={'tree_shap_output': tree_shap_out}, ...)

# After training
trained_pipeline = sample_pipeline.train(X_train, y_train).result()
interpret_out = trained_pipeline.interpret(x=c3.Data.Persisted.from_pandas(X_test.to_pandas()[:5])).result()
```

- **ShapInterpreter:** Use `MlInterpretSpec(initKwargs=..., callKwargs=...)` for explainer constructor and call options. Can associate background data via the spec for some explainers.

---

## 6. Hyperparameters

- **`pipe.hyperparams()`** returns the current hyperparameters of an `MlPipe` (or `MlAtomicPipe`) as a dict-like object.
- **`pipe.withHyperparams(params)`** returns a **new** pipe with the given hyperparameters applied (pipes are immutable — see §8 Conventions).
- Hyperparameters can be inspected and changed **before or after** training. Changing them on a trained pipeline and retraining is a common workflow for manual tuning.

```py
# Inspect current hyperparameters
params = clf_pipe.hyperparams()

# Create a new pipe with updated hyperparameters
tuned_pipe = clf_pipe.withHyperparams({'max_depth': 10, 'n_estimators': 50})

# Re-author pipeline with the tuned pipe and retrain
tuned_out = tuned_pipe(ss_out, y_input)
tuned_pipeline = mla.pipeline(
    x={'Features': X_input},
    y={'Label': y_input},
    out={'Predictions': tuned_out}
)
tuned_trained = tuned_pipeline.train(
    x={'Features': X_train},
    y={'Label': y_train}
).result()
```

- **Tip:** You can also set hyperparameters on the **native** estimator before `mla.convert(...)`. Use `withHyperparams()` when you want to adjust parameters on an already-converted `MlPipe`.

---

## 6.5 Hyperparameter Optimization (HPO)

Manual `withHyperparams()` (above) sets a **single** fixed combination. To **search** a space and let the platform pick the best, use the native HPO framework — full walkthrough (procedure, search spaces, `Hpo.Spec`, inspecting the experiment, and gotchas) in **`references/ml-pipeline/hpo.md`**.

---

## 7. Freeze and Unfreeze

- **`pipe.freeze()`** marks a **trained** pipe so it is **skipped during retraining**. Its learned weights are kept as-is. This is a **member** method (called on an instance, no arguments).
- **`pipe.unfreeze()`** reverses a freeze, allowing the pipe to be retrained. Also a **member** method with no arguments.
- On an `MlPipeline`, you can freeze/unfreeze **specific pipes by name** using a list of pipe name strings.

### Use cases

- **Transfer learning:** Freeze a pretrained feature extractor and only retrain the final classifier.
- **Incremental updates:** Freeze stable parts of a pipeline and retrain only the pipe that needs updating.
- **Faster iteration:** Skip expensive pipe retraining when only tuning downstream components.

```py
# Freeze a single pipe (member method, no args)
trained_pipe.freeze()

# Unfreeze it later
trained_pipe.unfreeze()
```

```py
trained_pipeline.pipePaths()    # used to find PIPE_PATH for addressing individual pipes in the pipeline
```

If you named the pipe using PIPE_NAME earlier, you can easily identify the relevant PIPE_PATH for use below.

```py
# Freeze / unfreeze specific pipes inside a trained pipeline by path
trained_pipeline.freeze(['PIPE_PATH'])       # pipe at path won't retrain
trained_pipeline.unfreeze(['PIPE_PATH'])     # pipe at path will retrain again

# Retrain pipeline — frozen pipes keep their weights, others retrain
retrained = trained_pipeline.train(
    x={'Features': X_train_new},
    y={'Label': y_train_new}
).result()
```

- **Visualize:** After freezing, call `pipeline.visualize()` to confirm which pipes are frozen in the DAG.

---

## 8. Conventions and gotchas

- **Keys:** The keys used in `x`, `y`, `out`, `scores`, and `context` at **authoring** time must match the keys used when calling **train**, **process**, **score**, and **interpret** with dicts.
- **Data types:** Use **`Data`** (e.g. `c3.Data.Persisted.from_pandas(df)` in Python) for train/process/score/interpret inputs and outputs.
- **Async:** **train**, **process**, **score**, and **interpret** return an **`MlOperationRun`**; always use **`.result()`** to obtain the final pipeline or result dict, unless you intentionally want to handle the run asynchronously.
- **Single input/output:** Some pipelines use a single placeholder (e.g. `x=mla.var()`) instead of a dict; then call train/process with that single `Data` (e.g. `train(x=X_train, y=y_train)`).
- **Nested pipelines:** Pipelines can contain sub-pipelines as pipes; train/process/score/interpret apply to the top-level pipeline; interpretation is per atomic pipe.

### **Runtime action claims for sklearn/xgboost methods**

ML type methods import non-standard libraries (`sklearn`, `scipy`, `xgboost`, ...), so they need a matching **runtime action claim** rather than the default `py`. In short: methods importing `sklearn`/`scipy` use **`py-sklearn_312`**; other libraries (`xgboost`, `lightgbm`, `catboost`, `shap`) use the runtime that contains them; the wrong claim fails with `ModuleNotFoundError` at runtime.

> This is a general C3 backend rule (it applies to any type importing non-standard libraries, ML or not). See **`c3-backend-code` → `references/python/python.md` § Runtime Action Claims** for the full suffix-selection table and the **shared-module trap** (a module-level heavy import breaks *every* method on the type, so all methods on that type then need the claim).

---

## 9. Quick reference

| Action          | API (after authoring)                              | Get result                                   |
| --------------- | -------------------------------------------------- | -------------------------------------------- |
| Train           | `pipeline.train(x=..., y=...)`                     | `.result()` → trained `MlPipeline`           |
| Process         | `trained.process(x=...)`                           | `.result()` → dict of output name → `Data`   |
| Score           | `trained.score(x=..., y=..., ...)`                 | `.result()` → dict of score name → value     |
| Interpret       | `trained.interpret(x=...)`                         | `.result()` → interpretation artifacts       |
| Hyperparams     | `pipe.hyperparams()`                               | dict of current hyperparameters              |
| Set Hyperparams | `pipe.withHyperparams({...})`                      | new `MlPipe` with updated params (immutable) |
| HPO search space | `pipe.withHyperparamSpaces({'p': Hp.ParamSpace.Categorical.fromValues([...])})` | new `MlPipe` carrying a search space         |
| HPO run         | `pipeline.train(x, y, spec=MlOperationSpec(hpoSpec=Hpo.Spec(...).withDefaults()))` | `.result()` → pipeline refit with best params |
| HPO inspect     | `trained.experiment.bestTrial()`, `trained.experiment.trialSummary()` | winning params / all trial scores           |
| Freeze          | `pipe.freeze()` or `pipeline.freeze(['name'])`     | pipe skipped on retrain                      |
| Unfreeze        | `pipe.unfreeze()` or `pipeline.unfreeze(['name'])` | pipe included on retrain again               |

**Authoring:** `mla = c3.MlPipeline.Authoring` → `mla.var()` → pipes from `mla.convert(...)` or custom MlLambdaPipe/MlDynamicPipe → connect in DAG → `mla.pipeline(x=..., y=..., out=..., scores=..., interpretations=...)`.

**Doc references (platform):** `doc/ds-model-dev-workflow.c3doc.md`, `doc/ds-ml-pipes.c3doc.md`.
**Tutorial notebooks:** `platform/.../ml/pipe/tutorial/ML-Pipeline.ipynb`, `ML-Interpreter.ipynb`, `ML-Lambda-Pipe.ipynb`, `ML-Dynamic-Pipe.ipynb`, `ML-Template-Pipe.ipynb`.
