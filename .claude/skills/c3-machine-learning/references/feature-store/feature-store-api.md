# C3 Feature Store API Reference

Detailed API documentation for Lambda Feature Sets.

## Important: Feature.Set is the Standard

**`Feature.Set` is the only supported way to create ML features.** Do NOT use `Feature` directly.

- **Lambda Feature Sets**: Use `srcBatch` lambda for custom feature computation
- **Metric Feature Sets**: Use `Feature.fromMetric()` to create features from legacy metrics, then add to Feature.Set via `features` field (separate skill)

## Feature.Set Entity

### Fields

| Field                  | Type                | Required | Description                                                  |
| ---------------------- | ------------------- | -------- | ------------------------------------------------------------ |
| `name`                 | string              | Yes      | Unique name for the feature set                              |
| `subjectType`          | Type                | Yes      | Entity type that mixes `FeatureEvaluatable`                  |
| `columns`              | map<string, string> | Yes\*    | Schema mapping column names to C3 ValueTypes                 |
| `srcBatch`             | Lambda              | Yes\*    | Lambda function for batch computation                        |
| `src`                  | Lambda              | No       | Lambda for single-subject computation (use srcBatch instead) |
| `features`             | set<string>         | Yes\*\*  | Names of metric-backed Features (for Metric Feature Sets)    |
| `doNotMaterialize`     | boolean             | No       | If true, always compute fresh (default: false)               |
| `srcSubjectProjection` | string              | No       | Fields to pre-fetch on subjects (default: 'this')            |
| `interval`             | string              | No       | Time interval for timeseries features                        |
| `timeHorizon`          | Pair<Expr, Expr>    | No       | Max time range for data (default: 5 years)                   |
| `tags`                 | [string]            | No       | Tags for discovery                                           |
| `summary`              | string              | No       | Short description                                            |
| `description`          | string              | No       | Long description                                             |

\*Required for Lambda Feature Sets
\*\*Required for Metric Feature Sets

### Feature.Set Methods

#### `Feature.Set.make(spec)`

Create a Feature.Set instance without persisting.

```python
fs = c3.Feature.Set.make({
    'name': 'myFeatures',
    'subjectType': c3.MySubject,
    'columns': columns,
    'srcBatch': src_batch
})
```

#### `Feature.Set.forName(subjectType, name, include, failIfMissing)`

Retrieve a Feature.Set by name.

```python
fs = c3.Feature.Set.forName(
    subjectType=c3.MySubject,
    name='myFeatures',
    include='this, srcBatch, columns',
    failIfMissing=True
)
```

#### `fs.upsert()`

Create or update the Feature.Set.

```python
fs.upsert()
```

#### `fs.remove()`

Delete the Feature.Set.

```python
fs.remove()
```

#### `fs.numberOfFeatures()`

Get the count of features in the set.

```python
count = fs.numberOfFeatures()
```

#### `fs.inferredInterval()`

Get the computed time interval for the feature set.

```python
interval = fs.inferredInterval()  # e.g., 'DAY', 'HOUR'
```

---

## Materialization API

Materialization stores computed feature values for fast retrieval.

### `Feature.Set.materialize(spec)`

Materialize feature data for subjects within a time range.

```python
job = fs.materialize(
    spec=c3.Feature.MaterializationSpec(
        filter='true',                # Subject filter (optional - all if missing)
        start='2024-01-01',           # Time range start
        end='2024-12-31',             # Time range end
        sync=True                     # Wait for completion (default: false)
    )
)
```

**Returns**: `Feature.Store.MaterializationJob`

### Feature.MaterializationSpec

| Field    | Type     | Required | Description                                                               |
| -------- | -------- | -------- | ------------------------------------------------------------------------- |
| `filter` | string   | No       | Subject filter expression. If missing, materializes all subjects          |
| `start`  | datetime | No       | Start of time range                                                       |
| `end`    | datetime | No       | End of time range                                                         |
| `sync`   | boolean  | No       | If true, wait for completion and materialize in one batch. Default: false |

### Materialization Job Methods

```python
# Start the job (if not sync)
job.start()

# Check status
status = job.status()

# Get time range used
time_range = job.timeRange

# Check completion
is_done = job.completed()
```

### After Materialization

Once materialized, evaluate WITHOUT `skipMaterialized` to read from store:

```python
# Read from materialized store (fast)
result = c3.MySubject.evalFeatureSetBatch(
    filter='true',
    featureSet=fs
    # No skipMaterialized - reads from store
)
```

---

## Snapshot API

Snapshots create immutable copies of feature data for reproducible ML training.

### `Feature.Set.createSnapshot(spec)`

Create an immutable snapshot of feature data.

```python
job = fs.createSnapshot(
    spec=c3.CreateSnapshotSpec(
        snapshotId='training_v1',     # Unique snapshot ID (required)
        subjectFilter='true',         # Subject filter (or use 'subjects')
        subjects=None,                # List of subjects (max 10k, or use 'subjectFilter')
        start='2024-01-01',           # Time range start
        end='2024-06-01',             # Time range end
        description='Training data for model v1',
        skipMaterialized=False,       # Force computation from raw data
        sourceSnapshotId=None         # Create from existing snapshot
    )
)
job.waitForCompletion()
```

**Returns**: `Feature.Set.CreateSnapshotJob`

### CreateSnapshotSpec

| Field              | Type                 | Required | Description                          |
| ------------------ | -------------------- | -------- | ------------------------------------ |
| `snapshotId`       | string               | Yes      | Unique identifier for the snapshot   |
| `subjectFilter`    | string               | No\*     | Filter expression for subjects       |
| `subjects`         | [FeatureEvaluatable] | No\*     | List of subjects (max 10,000)        |
| `start`            | datetime             | No       | Start of time range                  |
| `end`              | datetime             | No       | End of time range                    |
| `description`      | string               | No       | Human-readable description           |
| `skipMaterialized` | boolean              | No       | Force computation from raw data      |
| `sourceSnapshotId` | string               | No       | Create subset from existing snapshot |

\*Either `subjectFilter` or `subjects` must be provided

### Snapshot Examples

```python
# Basic snapshot creation
job = fs.createSnapshot(
    spec=c3.CreateSnapshotSpec(
        snapshotId='supplyChainFs',
        subjectFilter='true'
    )
)

# Snapshot with specific time range
job = fs.createSnapshot(
    spec=c3.CreateSnapshotSpec(
        snapshotId='audit_2020_2022',
        subjectFilter='true',
        start='2020-01-01',
        end='2022-01-01'
    )
)

# Subset snapshot from larger one
job = fs.createSnapshot(
    spec=c3.CreateSnapshotSpec(
        snapshotId='audit_2020_2021',
        subjectFilter='true',
        start='2020-01-01',
        end='2021-01-01',
        sourceSnapshotId='audit_2020_2022'
    )
)

# Force computation from raw data
job = fs.createSnapshot(
    spec=c3.CreateSnapshotSpec(
        snapshotId='prediction_2023_01_01',
        subjectFilter='true',
        start='2023-01-01',
        end='2023-01-02',
        skipMaterialized=True
    )
)
```

### `Feature.Set.deleteSnapshot(snapshotId, confirm)`

Delete an existing snapshot.

```python
fs.deleteSnapshot(snapshotId='training_v1', confirm=True)
```

| Parameter    | Type    | Required | Description              |
| ------------ | ------- | -------- | ------------------------ |
| `snapshotId` | string  | Yes      | Snapshot ID to delete    |
| `confirm`    | boolean | Yes      | Safety confirmation flag |

### `Feature.Set.snapshots()`

List all snapshots for a feature set.

```python
for snapshot in fs.snapshots():
    print(snapshot.id, snapshot.description)
```

### Evaluate from Snapshot

```python
result = c3.MySubject.evalFeatureSetBatch(
    filter='true',
    featureSet=fs,
    snapshotId='training_v1'          # Read from snapshot
)
```

---

## Feature.Store API

The `Feature.Store` singleton provides low-level access to the feature store.

### Read Methods

#### `Feature.Store.readFeatureSet(subjects, features, spec)`

Read feature data for subjects from materialized store or compute at runtime.

```python
store = c3.Feature.Store.inst()
data = store.readFeatureSet(
    subjects=subjects,
    features=fs,
    spec=c3.EvalFeatureSpec(
        start='2024-01-01',
        end='2024-12-31'
    )
)
```

#### `Feature.Store.readFeatureSet(subjectFilter, features, spec)`

Read feature data using a subject filter.

```python
data = store.readFeatureSet(
    subjectFilter='true',
    features=fs,
    spec=c3.EvalFeatureSpec(
        start='2024-01-01',
        end='2024-12-31'
    )
)
```

### Lazy Evaluation Methods

For large datasets, use lazy evaluation to defer computation.

#### `Feature.Store.lazyEvalFeatureSet(subjects, features, spec)`

```python
lazy_data = store.lazyEvalFeatureSet(
    subjects=subjects,
    features=fs,
    spec=c3.EvalFeatureSpec(start='2024-01-01', end='2024-12-31')
)
# Data is computed when accessed
```

### Materialization Methods

#### `Feature.Store.materializeFeatureSet(featureSet, subjects, timeRange)`

Low-level materialization with subject collection.

```python
store.materializeFeatureSet(
    featureSet=fs,
    subjects=c3.MySubject.fetch({'limit': -1}),
    timeRange=c3.TimeRange(start='2024-01-01', end='2024-12-31')
)
```

#### `Feature.Store.materializeFeatureSet(featureSet, subjectFilter, timeRange)`

Low-level materialization with subject filter.

```python
store.materializeFeatureSet(
    featureSet=fs,
    subjectFilter='true',
    timeRange=c3.TimeRange(start='2024-01-01', end='2024-12-31')
)
```

### Utility Methods

#### `Feature.Store.materializedTableName(feature, snapshotId)`

Get the table name for a feature in the materialized store.

```python
table_name = store.materializedTableName(feature=feature, snapshotId=None)
```

#### `Feature.Store.materializedSnapshotTableName(featureSet, snapshotId)`

Get the table name for a feature set snapshot.

```python
table_name = store.materializedSnapshotTableName(featureSet=fs, snapshotId='training_v1')
```

---

## Lambda Creation

### `Lambda.fromPySrc(code, actionRequirement)`

Create a Lambda from Python source code string.

| Parameter           | Type   | Required | Description                                        |
| ------------------- | ------ | -------- | -------------------------------------------------- |
| `code`              | string | Yes      | Python lambda expression as string                 |
| `actionRequirement` | string | No       | Runtime requirement (e.g., `'py-data'`, `'py-ml'`) |

```python
# Basic usage (uses default Python runtime)
lambda_code = '''lambda subjects, spec, fs: c3.Feature.CustomMaterializationResult(
    data=__import__('pandas').DataFrame([...])
)'''
src_batch = c3.Lambda.fromPySrc(lambda_code)

# With specific runtime (when you need specific packages)
src_batch = c3.Lambda.fromPySrc(lambda_code, 'py-data')
```

**When to specify a runtime**: Use when your lambda requires packages from a specific runtime environment (e.g., `py-data` for data processing, `py-ml` for ML libraries).

---

## srcBatch Lambda Signature

```python
def srcBatch(
    subjects: list[FeatureEvaluatable],
    spec: EvalFeatureSpec,
    fs: Feature.Set
) -> Feature.CustomMaterializationResult
```

### Parameters

#### `subjects`

List of subject instances being evaluated.

- Pre-fetched with fields from `srcSubjectProjection` (default: 'this')
- Access via: `subjects[0].id`, `subjects[0].fieldName`
- Extract IDs: `[s.id for s in subjects]`

#### `spec` (EvalFeatureSpec)

Evaluation specification with time range and options.

| Field              | Type     | Description                       |
| ------------------ | -------- | --------------------------------- |
| `start`            | datetime | Start of time range (may be None) |
| `end`              | datetime | End of time range (may be None)   |
| `skipMaterialized` | boolean  | True when computing directly      |
| `snapshotId`       | string   | Snapshot ID if using snapshots    |

#### `fs` (Feature.Set)

The Feature.Set being evaluated.

| Field         | Type   | Description      |
| ------------- | ------ | ---------------- |
| `name`        | string | Feature set name |
| `columns`     | map    | Column schema    |
| `subjectType` | Type   | Subject type     |

### Return Value

`Feature.CustomMaterializationResult` with:

| Field              | Type           | Required | Description                        |
| ------------------ | -------------- | -------- | ---------------------------------- |
| `data`             | DataFrame/Data | Yes      | Feature data with 'subject' column |
| `timeRangeIgnored` | boolean        | No       | Set True if ignoring time range    |

---

## evalFeatureSetBatch Methods

### With Filter

```python
result = c3.MySubject.evalFeatureSetBatch(
    filter='true',  # or "category == 'A'"
    featureSet=fs,
    skipMaterialized=True,
    start='2024-01-01',  # optional
    end='2024-12-31'     # optional
)
```

| Parameter          | Type            | Required | Description                    |
| ------------------ | --------------- | -------- | ------------------------------ |
| `filter`           | string          | Yes      | Filter expression for subjects |
| `featureSet`       | Feature.Set     | Yes      | Feature set to evaluate        |
| `skipMaterialized` | boolean         | No       | Force lambda computation       |
| `start`            | datetime/string | No       | Start of time range            |
| `end`              | datetime/string | No       | End of time range              |
| `snapshotId`       | string          | No       | Snapshot to read from          |

### With Batch

```python
subjects = c3.MySubject.fetch({
    'filter': c3.Filter.intersects('id', ['ID-1', 'ID-2']),
    'include': 'this'
}).objs

result = c3.MySubject.evalFeatureSetBatch(
    batch=subjects,
    featureSet=fs,
    skipMaterialized=True
)
```

| Parameter          | Type                 | Required | Description               |
| ------------------ | -------------------- | -------- | ------------------------- |
| `batch`            | [FeatureEvaluatable] | Yes      | List of subject instances |
| `featureSet`       | Feature.Set          | Yes      | Feature set to evaluate   |
| `skipMaterialized` | boolean              | No       | Force lambda computation  |
| `start`            | datetime/string      | No       | Start of time range       |
| `end`              | datetime/string      | No       | End of time range         |

---

## Column Types

### Full Type Mapping

| Pandas Type    | Polars Type | Arrow Type | C3 ValueType |
| -------------- | ----------- | ---------- | ------------ |
| -              | binary      | binary     | binary       |
| bool           | boolean     | bool       | boolean      |
| boolean        | boolean     | bool       | ?boolean     |
| int8           | int8        | int8       | byte         |
| datetime64[ns] | datetime    | timestamp  | datetime     |
| decimal        | decimal     | decimal128 | decimal      |
| float64        | float64     | float64    | double       |
| float32        | float32     | float32    | float        |
| int64          | int64       | int64      | int          |
| int16          | int16       | int16      | int16        |
| int32          | int32       | int32      | int32        |
| object, string | utf8        | string     | string       |

### Common Mappings

| Use Case               | C3 ValueType |
| ---------------------- | ------------ |
| IDs, names, categories | string       |
| Numeric values         | double       |
| Counts, indices        | int          |
| Flags, indicators      | boolean      |
| Timestamps             | datetime     |

---

## Validation Rules

### Required Columns

| Column      | When Required   | Description                    |
| ----------- | --------------- | ------------------------------ |
| `subject`   | Always          | String ID of the entity        |
| `timestamp` | Timeseries only | Datetime for time-indexed data |

### Data Requirements

1. **Column Order**: Must match the order of keys in `columns` definition
2. **Subject Validation**: Data subjects must be subset of input subjects
3. **Grouping**: Data must be row-wise grouped by `subject` column
4. **Timestamp Sorting**: For timeseries, timestamps must be sorted ascending per subject
5. **Timestamp Range**: Timestamps must be within the provided time range (if specified)

---

## Error Reference

| Error Message                                | Cause                                    | Solution                                   |
| -------------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| "Could not get the source code for callable" | Using `fromPyFunc()` in runPyCode        | Use `fromPySrc(code)`                      |
| "Invalid action requirement"                 | Wrong runtime specified                  | Check available runtimes or omit parameter |
| "Subject column has additional values"       | Returning data for subjects not in input | Filter DataFrame to requested IDs          |
| "Data's columns follow the order of keys"    | Column order doesn't match schema        | Reorder DataFrame columns                  |
| "Data is not sorted by subject or timestamp" | Timeseries not properly sorted           | Sort by ['subject', 'timestamp']           |
| "'NoneType' object is not callable"          | Lambda not properly stored               | Verify fromPySrc syntax                    |
| "Feature set not found"                      | Wrong name or subjectType                | Check name and subjectType match           |
| "Required field features not set"            | Missing srcBatch for lambda feature set  | Add srcBatch lambda                        |

---

## FeatureEvaluatable Mixin

Types that can be subjects for Feature Sets must mix `FeatureEvaluatable`:

```c3typ
entity type MySubject mixes FeatureEvaluatable {
  category: string
  value: double
  status: string
}
```

### Inherited Methods

| Method                                                | Description                          |
| ----------------------------------------------------- | ------------------------------------ |
| `evalFeature(feature, spec)`                          | Evaluate single feature for instance |
| `evalFeatureSet(featureSet, spec)`                    | Evaluate feature set for instance    |
| `evalFeatureSetBatch(filter/batch, featureSet, spec)` | Evaluate for multiple subjects       |
| `features()`                                          | Stream of all features for type      |
