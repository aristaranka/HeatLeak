# C3 Feature Store

Create ML features using Lambda Feature Sets (custom Python computation) or Metric Feature Sets (from existing Metrics).

## Why Feature Store?

The Feature Store provides a centralized repository for ML features that:

- **Native ML Integration**: Feature.Set(s) are natively supported by ML Models and ML Pipelines
- **Eval Integration**: Integrates with `eval()` on Evaluatable types to retrieve feature data
- **Cost-Effective Storage**: Materialization stores data in optimized storage with high throughput and low-medium latency
- **Reproducibility**: Snapshots enable reproducible ML training with immutable data

## Architecture Overview

```
FeatureEvaluatable / MLSubject (mixin on subject types, e.g., WindTurbine)
  └── evalFeature(), evalFeatureSet(), evalFeatureSetBatch()

Feature (entity) - created via Feature.fromMetric()
  └── Stores metric definitions (SimpleMetric, CompoundMetric) in DB
  └── Does NOT support materialization
  └── ONLY used to define features for Metric Feature Sets

Feature.Set (entity, mixes FeatureBase)
  ├── Lambda Feature Sets: srcBatch lambda for custom computation
  ├── Metric Feature Sets: features array referencing Feature names
  ├── Supports materialization for cost-effective storage
  └── Feature.Set.Snapshot: immutable data for reproducible training

Feature.Store (Singleton)
  └── Storage engine: read/write/materialize feature data
```

---

## MUST-KNOW: Critical Requirements & Common Pitfalls

### Feature.Set is the ONLY Standard

**`Feature.Set` is the only supported way to create ML features.** Do NOT use `Feature` directly.

- **Lambda Feature Sets**: Use `srcBatch` lambda for custom feature computation
- **Metric Feature Sets**: Use `Feature.fromMetric()` to create features from existing Metrics, then add to Feature.Set via `features` field

### Subject Type Requirement

Your subject type **must** mix either `FeatureEvaluatable` or `MLSubject`:

```c3typ
entity type WindTurbine mixes FeatureEvaluatable { turbineId: string }
// OR
entity type WindTurbine mixes MLSubject { turbineId: string }
```

### Feature.Set ID Requirement

**CRITICAL**: The `id` field is `subjectType#name`. You **must** set it when calling `upsert()`:

```python
fs = c3.Feature.Set.make({
    'id': 'MySubject#myFeatures',      # REQUIRED: subjectType#name
    'name': 'myFeatures',
    'subjectType': c3.MySubject,
    ...
})
fs.upsert()
```

### Lambda Creation via MCP: Use Lambda.fromPySrc when running with runPyCode MCP tool

**You MUST use `Lambda.fromPySrc` (and NOT `fromPyFunc`) if the code is to be executed via runPyCode:**

```python
# CORRECT
lambda_code = '''lambda subjects, spec, fs: c3.Feature.CustomMaterializationResult(...)'''
src_batch = c3.Lambda.fromPySrc(lambda_code)

# WRONG - fails with "Could not get the source code" error
src_batch = c3.Lambda.fromPyFunc(my_func)  # ERROR!
```

### doNotMaterialize Flag

Set `doNotMaterialize: True` **ONLY when you are absolutely sure you will NEVER want to materialize**. This is a permanent decision to skip cost-effective storage and always compute on-the-fly. Use sparingly for ad-hoc or experimental features only.

### Feature Constants

Use `Feature.SUBJECT` (`'subject'`) and `Feature.TIMESTAMP` (`'timestamp'`) to refer to reserved column names:

- `subject` column: Identifies which subject each row belongs to (REQUIRED)
- `timestamp` column: Present when Feature.Set contains timeseries data

### Column Types

| Python/Pandas | C3 ValueType |
| ------------- | ------------ |
| str, object   | string       |
| float64       | double       |
| int64         | int          |
| bool          | boolean      |
| datetime64    | datetime     |

### Validation Rules

1. **Must have `subject` column** - String IDs of evaluated entities
2. **Column order must match** - Same order as `columns` definition
3. **Subjects must be subset** - Only return data for requested subjects
4. **Timeseries must be sorted** - Ascending by timestamp per subject

### Common Errors

| Error                           | Cause                    | Fix                                |
| ------------------------------- | ------------------------ | ---------------------------------- |
| "Could not get source code"     | Using `fromPyFunc()`     | Use `fromPySrc(code)`              |
| "Subject has additional values" | Returning extra subjects | Filter to requested IDs            |
| "Columns follow order of keys"  | Wrong column order       | Match `columns` dict order         |
| "Data is not sorted"            | Timeseries not sorted    | Sort by `['subject', 'timestamp']` |

---

## Lambda Feature Sets

Lambda Feature Sets use Python lambdas to compute custom features for batches of subjects.

### Core Workflow: Iterate → Test → Deploy

1. **Define lambda** with `srcBatch` that receives subjects, spec, and feature set
2. **Test immediately** using `evalFeatureSetBatch(skipMaterialized=True)`
3. **Iterate** until the lambda produces correct results
4. **Materialize** for production using `Feature.Set.materialize()`

### Lambda Parameters

| Parameter  | Type                   | Description                                               |
| ---------- | ---------------------- | --------------------------------------------------------- |
| `subjects` | `[FeatureEvaluatable]` | List of subject instances (pre-fetched with 'this')       |
| `spec`     | `EvalFeatureSpec`      | Contains `start`, `end`, `skipMaterialized`, `snapshotId` |
| `fs`       | `Feature.Set`          | The Feature.Set being evaluated                           |

**Returns**: `Feature.CustomMaterializationResult` with `data` (DataFrame) and optional `timeRangeIgnored` (bool)

### Quick Start Example

```python
# Step 1: Define lambda
lambda_code = '''lambda subjects, spec, fs: (
    lambda ids: c3.Feature.CustomMaterializationResult(
        data=__import__('pandas').DataFrame([
            {'subject': obj.id, 'value_doubled': obj.value * 2 if obj.value else 0.0}
            for obj in c3.MySubject.fetch({'filter': c3.Filter.intersects('id', ids), 'include': 'this'}).objs
        ])
    )
)([s.id for s in subjects])'''

# Step 2: Create Lambda
src_batch = c3.Lambda.fromPySrc(lambda_code)

# Step 3: Define columns (order matters!)
columns = {'subject': 'string', 'value_doubled': 'double'}

# Step 4: Create Feature Set
fs = c3.Feature.Set.make({
    'id': 'MySubject#myFeatures',      # REQUIRED: subjectType#name
    'name': 'myFeatures',
    'subjectType': c3.MySubject,
    'columns': columns,
    'srcBatch': src_batch
})
fs.upsert()

# Step 5: Test with skipMaterialized=True
fs = c3.Feature.Set.forName(subjectType=c3.MySubject, name='myFeatures', include='this, srcBatch, columns', failIfMissing=True)
result = c3.MySubject.evalFeatureSetBatch(filter='true', featureSet=fs, skipMaterialized=True)
str(result.to_pandas())
```

See [Lambda Patterns & Examples](feature-store-examples.md) for more patterns (timeseries, aggregations, boolean features, etc.)

---

## Metric Feature Sets

Metric Feature Sets create features from existing C3 Metrics (SimpleMetric, CompoundMetric, etc.). For defining SimpleMetric/CompoundMetric, the expression grammar used in metric bodies, and evaluation APIs like `evalMetrics` / `tsEval`, see the **`c3-timeseries`** skill (`references/metrics/`).

**IMPORTANT**: `Feature` does NOT support materialization. Its only purpose is to store metric definitions for use in Metric Feature Sets. Always work with `Feature.Set`.

### Recommended Workflow

1. **Create Feature instances** from metric definitions using `Feature.fromMetric()`
2. **Create a Feature.Set** using `features`, `interval + agg`, `maskFeature`, and `asOfFeature` as applicable
3. **Test with `evalFeatureSetBatch`** using `skipMaterialized=True` to verify output

### Step 1: Create Features from Metrics

`Feature.fromMetric()` is the **only API** to create a Feature from a Metric:

```python
avg_power = c3.Feature.fromMetric(
    subjectType=c3.WindTurbine,
    metric=c3.SimpleMetric.forName('WindTurbine_AvgPower'),
    name='avgPower'
)
avg_power.upsert()
```

### Step 2: Create Metric Feature Set

Use `interval`, `agg`, `maskFeature`, and `asOfFeature` to control timeseries merging:

```python
fs = c3.Feature.Set.make({
    'id': 'WindTurbine#turbineMetrics',  # REQUIRED: subjectType#name
    'name': 'turbineMetrics',
    'subjectType': c3.WindTurbine,
    'features': ['avgPower', 'efficiency'],
    'interval': 'HOUR',                   # Resample interval
    'agg': 'AVG',                         # Aggregation function
    'asOfFeature': 'eventTimestamp'       # Point-in-time alignment (prevents data leakage in ML)
})
fs.upsert()
```

| Field         | Description                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interval`    | Time interval for resampling (`'HOUR'`, `'DAY'`, etc.)                                                                                                    |
| `agg`         | Aggregation function (`'AVG'`, `'SUM'`, `'MIN'`, `'MAX'`)                                                                                                 |
| `maskFeature` | Feature name to filter rows (boolean mask)                                                                                                                |
| `asOfFeature` | Timestamp feature for point-in-time alignment. Ensures only data with timestamp <= `asOf` time is included, preventing future data leakage in ML training |

### Step 3: Test with skipMaterialized=True

```python
fs = c3.Feature.Set.forName(subjectType=c3.WindTurbine, name='turbineMetrics', include='this, features', failIfMissing=True)
result = c3.WindTurbine.evalFeatureSetBatch(filter='true', featureSet=fs, skipMaterialized=True)
```

See [Metric Feature Set Examples](feature-store-examples.md#metric-feature-set-examples) for more patterns.

---

## Materialization API

Materialization stores computed feature data in cost-effective storage with **high throughput** and **low-medium latency**. Once materialized, you avoid recomputing features on every request.

**IMPORTANT**: Materialization is only supported for `Feature.Set`, NOT `Feature`.

### When to Materialize

- **Development/Testing**: Use `skipMaterialized=True` to compute on-the-fly
- **Production**: Materialize for fast reads via `evalFeatureSetBatch()` without `skipMaterialized`

### Feature.Set.materialize()

```python
# Materialize all subjects (sync)
job = fs.materialize(spec=c3.Feature.MaterializationSpec(
    filter='true', start='2024-01-01', end='2024-12-31', sync=True
))

# Materialize async
job = fs.materialize(spec=c3.Feature.MaterializationSpec(
    filter='true', start='2024-01-01', end='2024-12-31', sync=False
))
job.status()
```

### Feature.MaterializationSpec Fields

| Field    | Type     | Required | Description                                           |
| -------- | -------- | -------- | ----------------------------------------------------- |
| `filter` | string   | No       | Subject filter. If missing, materializes all subjects |
| `start`  | datetime | No       | Start of time range                                   |
| `end`    | datetime | No       | End of time range                                     |
| `sync`   | boolean  | No       | If true, wait for completion. Default: false          |

### Check Materialization Status

```python
# Check what data is materialized
Feature.Set.availableMaterializedData(spec)

# Check what data is missing
Feature.Set.missingMaterializedData(spec)
```

### Reading Materialized Data

Once materialized, use `FeatureEvaluatable` APIs (no `skipMaterialized`):

```python
# Batch read from store
result = c3.MySubject.evalFeatureSetBatch(filter='true', featureSet=fs)

# Single subject
result = c3.MySubject.evalFeatureSet(id='subject-123', featureSet=fs)

# Single feature
result = c3.MySubject.evalFeature(id='subject-123', feature='avgPower', featureSet=fs)
```

See [Materialization Examples](feature-store-examples.md#materialization-examples) for more patterns.

---

## Snapshots (Immutable Data)

Create immutable snapshots for reproducible ML training.

### Create Snapshot

```python
job = fs.createSnapshot(spec=c3.CreateSnapshotSpec(
    snapshotId='training_v1',
    subjectFilter='true',
    start='2024-01-01',
    end='2024-06-01',
    description='Training data for model v1'
))
job.waitForCompletion()
```

### Evaluate from Snapshot

```python
result = c3.MySubject.evalFeatureSetBatch(filter='true', featureSet=fs, snapshotId='training_v1')
```

### Manage Snapshots

```python
# List snapshots
for snapshot in fs.snapshots():
    print(snapshot.id, snapshot.description)

# Delete snapshot
fs.deleteSnapshot(snapshotId='training_v1', confirm=True)
```

### Feature.Set.Snapshot APIs

| Method/Property                            | Description                                      |
| ------------------------------------------ | ------------------------------------------------ |
| `snapshot.fetchSubjects()`                 | Retrieve subjects included in the snapshot       |
| `snapshot.export(destinationUrl, options)` | Export to external storage (e.g., GCS)           |
| `snapshot.deleteDataAndSubject(confirm)`   | Delete snapshot data and metadata                |
| `snapshot.models`                          | `[MlModel]` - ML models trained on this snapshot |

See [Snapshot Examples](feature-store-examples.md#snapshot-examples) for more patterns.

---

## Feature.Set APIs

| Method/Property                                                  | Returns            | Description                                 |
| ---------------------------------------------------------------- | ------------------ | ------------------------------------------- |
| `Feature.Set.forName(subjectType, name, include, failIfMissing)` | `Feature.Set`      | Lookup by name                              |
| `fs.featureDecls`                                                | `[Feature]`        | Full Feature objects for metric-backed sets |
| `fs.numberOfFeatures()`                                          | `int`              | Count of features in the set                |
| `fs.kind`                                                        | `Feature.Set.Kind` | `METRIC` or `LAMBDA`                        |
| `Feature.Set.availableMaterializedData(spec)`                    | `Data`             | Check what data is materialized             |
| `Feature.Set.missingMaterializedData(spec)`                      | `Data`             | Check what data is missing                  |

## Feature.Store Configuration

| Config Field         | Default      | Description                    |
| -------------------- | ------------ | ------------------------------ |
| `defaultTimeHorizon` | `now() - 5y` | Default time range for queries |

---

## Additional Resources

- [Lambda Patterns & Examples](feature-store-examples.md) - Lambda patterns, Metric Feature Set examples, Snapshot examples, Materialization examples
- [API Reference](feature-store-api.md) - Detailed API documentation for Feature.Set, Feature.Store, Snapshots, and evaluation methods

## Best Practices

- Use `srcBatch` (not `src`) for batch-mode materialization - more efficient
- Always set `timeHorizon` on Feature Sets to limit materialization scope
- Use `asOfFeature` for point-in-time joins in ML training to prevent data leakage
- Create snapshots before training models for reproducibility
- Use `srcSubjectProjection` to pre-fetch only needed subject fields
- Test with `skipMaterialized=True` before materializing to production

## Limitations

- Materialization runs as MapReduce — large datasets may take time
- Feature Store uses KV storage (file system by default) — not SQL queryable
- `Lambda.fromPyFunc()` does not work in runPyCode — always use `Lambda.fromPySrc()`
