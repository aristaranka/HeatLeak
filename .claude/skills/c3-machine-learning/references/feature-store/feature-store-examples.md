# Lambda Feature Set Examples

Common patterns for creating `srcBatch` lambdas in C3 Feature Store.

**IMPORTANT**: All examples below should be executed using the `runPyCode` MCP tool. Feature Sets are created at runtime, NOT by creating static `.c3typ` or `.py` files.

## Lambda Feature Set Patterns

### Pattern 1: Simple Computed Features

Compute features directly from subject data without additional fetches.

```python
lambda_code = '''lambda subjects, spec, fs: c3.Feature.CustomMaterializationResult(
    data=__import__('pandas').DataFrame([
        {
            'subject': s.id,
            'id_length': len(s.id),
            'has_name': 1 if s.name else 0
        }
        for s in subjects
    ])
)'''

src_batch = c3.Lambda.fromPySrc(lambda_code)
```

### Pattern 2: Fetch and Transform

Fetch full subject data and transform to features.

```python
lambda_code = '''lambda subjects, spec, fs: (
    lambda ids: c3.Feature.CustomMaterializationResult(
        data=__import__('pandas').DataFrame([
            {
                'subject': obj.id,
                'value_squared': obj.value ** 2 if obj.value else 0.0,
                'category_encoded': 1 if obj.category == 'A' else 0,
                'is_active': obj.status == 'active'
            }
            for obj in c3.MySubject.fetch({
                'filter': c3.Filter.intersects('id', ids),
                'include': 'this'
            }).objs
        ])
    )
)([s.id for s in subjects])'''

src_batch = c3.Lambda.fromPySrc(lambda_code)
```

### Pattern 3: Aggregate Related Data

Aggregate data from related entities.

```python
lambda_code = '''lambda subjects, spec, fs: (
    lambda ids, pd: c3.Feature.CustomMaterializationResult(
        data=pd.DataFrame([
            (lambda related: {
                'subject': subject_id,
                'related_count': len(related),
                'related_sum': sum([r.value for r in related if r.value]) if related else 0,
                'related_avg': (sum([r.value for r in related if r.value]) / len(related)) if related else 0
            })(c3.RelatedType.fetch({
                'filter': f"parent.id == '{subject_id}'",
                'include': 'value'
            }).objs)
            for subject_id in ids
        ])
    )
)([s.id for s in subjects], __import__('pandas'))'''

src_batch = c3.Lambda.fromPySrc(lambda_code)
```

### Pattern 4: Timeseries Features (Daily Granularity)

Generate time-indexed features with daily granularity. This pattern is useful for creating daily metrics like avgPower, avgTemp, avgRotation.

**Use `runPyCode` MCP tool to execute:**

```python
# Step 1: Define lambda that generates daily timeseries data
lambda_code = '''lambda subjects, spec, fs: (
    lambda ids, pd, dt: c3.Feature.CustomMaterializationResult(
        data=pd.DataFrame([
            {
                'subject': subject_id,
                'timestamp': dt.datetime(2024, 1, 1) + dt.timedelta(days=i),
                'avgPower': float(100 + i * 5),      # Simulated daily power
                'avgTemp': float(20 + i * 0.5),     # Simulated daily temp
                'avgRotation': float(1000 + i * 10) # Simulated daily rotation
            }
            for subject_id in ids
            for i in range(7)  # 7 days of data
        ]).sort_values(['subject', 'timestamp'])
    )
)([s.id for s in subjects], __import__('pandas'), __import__('datetime'))'''

# Step 2: Create lambda from code string
src_batch = c3.Lambda.fromPySrc(lambda_code)

# Step 3: Define columns (order must match DataFrame)
columns = {
    'subject': 'string',
    'timestamp': 'datetime',
    'avgPower': 'double',
    'avgTemp': 'double',
    'avgRotation': 'double'
}

# Step 4: Create and persist Feature Set
fs = c3.Feature.Set.make({
    'id': 'WindTurbine#dailyMetricsFeatures',  # REQUIRED: subjectType#name
    'name': 'dailyMetricsFeatures',
    'subjectType': c3.WindTurbine,
    'columns': columns,
    'srcBatch': src_batch,
    'doNotMaterialize': True
})
fs.upsert()

# Step 5: Test with skipMaterialized=True
fs = c3.Feature.Set.forName(
    subjectType=c3.WindTurbine,
    name='dailyMetricsFeatures',
    include='this, srcBatch, columns',
    failIfMissing=True
)
result = c3.WindTurbine.evalFeatureSetBatch(
    filter='true',
    featureSet=fs,
    skipMaterialized=True
)
str(result.to_pandas())
```

**Key Points:**

- `timestamp` column is REQUIRED for timeseries data
- Data MUST be sorted by `['subject', 'timestamp']`
- Use `doNotMaterialize=True` for testing
- Use `skipMaterialized=True` when evaluating to compute on-the-fly

### Pattern 5: Using EvalFeatureSpec Parameters

Access time range from the spec parameter.

```python
lambda_code = '''lambda subjects, spec, fs: (
    lambda ids, pd: c3.Feature.CustomMaterializationResult(
        data=pd.DataFrame([
            {
                'subject': subject_id,
                'start_date': str(spec.start) if spec and spec.start else 'N/A',
                'end_date': str(spec.end) if spec and spec.end else 'N/A',
                'has_time_range': 1 if (spec and spec.start and spec.end) else 0
            }
            for subject_id in ids
        ])
    )
)([s.id for s in subjects], __import__('pandas'))'''

src_batch = c3.Lambda.fromPySrc(lambda_code)
```

### Pattern 6: Boolean Features

Create boolean indicator features.

```python
lambda_code = '''lambda subjects, spec, fs: (
    lambda ids: c3.Feature.CustomMaterializationResult(
        data=__import__('pandas').DataFrame([
            {
                'subject': obj.id,
                'is_category_a': obj.category == 'A',
                'is_active': obj.status == 'active',
                'has_high_value': obj.value > 50 if obj.value else False,
                'is_complete': bool(obj.category and obj.status and obj.value)
            }
            for obj in c3.MySubject.fetch({
                'filter': c3.Filter.intersects('id', ids),
                'include': 'this'
            }).objs
        ])
    )
)([s.id for s in subjects])'''

columns = {
    'subject': 'string',
    'is_category_a': 'boolean',
    'is_active': 'boolean',
    'has_high_value': 'boolean',
    'is_complete': 'boolean'
}

src_batch = c3.Lambda.fromPySrc(lambda_code)
```

---

## Metric Feature Set Examples

### Basic Metric Feature Set

Create features from existing SimpleMetrics and CompoundMetrics.

```python
# Step 1: Create Features from Metrics
avg_power = c3.Feature.fromMetric(
    subjectType=c3.WindTurbine,
    metric=c3.SimpleMetric.forName('WindTurbine_AvgPower'),
    name='avgPower'
)
avg_power.upsert()

efficiency = c3.Feature.fromMetric(
    subjectType=c3.WindTurbine,
    metric=c3.CompoundMetric.forName('WindTurbine_Efficiency'),
    name='efficiency'
)
efficiency.upsert()

# Step 2: Create Feature Set
fs = c3.Feature.Set.make({
    'id': 'WindTurbine#turbineMetrics',
    'name': 'turbineMetrics',
    'subjectType': c3.WindTurbine,
    'features': ['avgPower', 'efficiency'],
    'doNotMaterialize': True
})
fs.upsert()

# Step 3: Test
result = c3.WindTurbine.evalFeatureSetBatch(
    filter='true', featureSet=fs, skipMaterialized=True
)
```

### Metric Feature Set with Time Alignment

Use `interval` and `agg` to align timeseries data from different metrics.

```python
fs = c3.Feature.Set.make({
    'id': 'WindTurbine#hourlyMetrics',
    'name': 'hourlyMetrics',
    'subjectType': c3.WindTurbine,
    'features': ['avgPower', 'efficiency', 'temperature'],
    'interval': 'HOUR',      # Resample to hourly
    'agg': 'AVG',            # Average when resampling
    'doNotMaterialize': True
})
fs.upsert()
```

### Metric Feature Set with Point-in-Time Alignment

Use `asOfFeature` for ML training to prevent data leakage.

```python
# Create timestamp feature
event_ts = c3.Feature.fromMetric(
    subjectType=c3.WindTurbine,
    metric=c3.SimpleMetric.forName('WindTurbine_EventTimestamp'),
    name='eventTimestamp'
)
event_ts.upsert()

# Create Feature Set with asOfFeature
fs = c3.Feature.Set.make({
    'id': 'WindTurbine#mlFeatures',
    'name': 'mlFeatures',
    'subjectType': c3.WindTurbine,
    'features': ['avgPower', 'efficiency', 'eventTimestamp'],
    'asOfFeature': 'eventTimestamp',  # Point-in-time alignment
    'interval': 'DAY',
    'agg': 'AVG'
})
fs.upsert()
```

### Metric Feature Set with Mask Feature

Use `maskFeature` to filter rows based on a boolean feature.

```python
# Create mask feature (e.g., data quality flag)
quality_flag = c3.Feature.fromMetric(
    subjectType=c3.WindTurbine,
    metric=c3.SimpleMetric.forName('WindTurbine_DataQuality'),
    name='isValidData'
)
quality_flag.upsert()

fs = c3.Feature.Set.make({
    'id': 'WindTurbine#qualityFilteredMetrics',
    'name': 'qualityFilteredMetrics',
    'subjectType': c3.WindTurbine,
    'features': ['avgPower', 'efficiency', 'isValidData'],
    'maskFeature': 'isValidData',  # Only include rows where isValidData=True
    'interval': 'HOUR',
    'agg': 'AVG'
})
fs.upsert()
```

---

## Snapshot Examples

### Create and Use Snapshots

```python
# Create snapshot for training
job = fs.createSnapshot(spec=c3.CreateSnapshotSpec(
    snapshotId='training_2024_q1',
    subjectFilter='true',
    start='2024-01-01',
    end='2024-04-01',
    description='Q1 2024 training data'
))
job.waitForCompletion()

# Evaluate from snapshot
result = c3.WindTurbine.evalFeatureSetBatch(
    filter='true', featureSet=fs, snapshotId='training_2024_q1'
)

# Export snapshot to GCS
snapshot = fs.snapshots()[0]
snapshot.export('gcs://my-bucket/snapshots/', options={})

# List all snapshots
for s in fs.snapshots():
    print(f"{s.id}: {s.description}")

# Delete snapshot
fs.deleteSnapshot(snapshotId='training_2024_q1', confirm=True)
```

### Create Subset Snapshot

```python
# Create a smaller snapshot from an existing one
job = fs.createSnapshot(spec=c3.CreateSnapshotSpec(
    snapshotId='training_2024_jan',
    subjectFilter='true',
    start='2024-01-01',
    end='2024-02-01',
    sourceSnapshotId='training_2024_q1'  # Subset from larger snapshot
))
```

---

## Materialization Examples

### Basic Materialization

```python
# Materialize all subjects
job = fs.materialize(spec=c3.Feature.MaterializationSpec(
    filter='true',
    start='2024-01-01',
    end='2024-12-31',
    sync=True
))

# Check materialization status
print(Feature.Set.availableMaterializedData(spec))
print(Feature.Set.missingMaterializedData(spec))
```

### Incremental Materialization

```python
# Materialize only new data
job = fs.materialize(spec=c3.Feature.MaterializationSpec(
    filter='true',
    start='2024-12-01',  # Only recent data
    end='2024-12-31',
    sync=False
))
job.status()
```

---

## Complete Lambda Feature Set Template

**Use `runPyCode` MCP tool to execute this complete template:**

```python
# 1. Define your lambda as a CODE STRING
lambda_code = '''lambda subjects, spec, fs: (
    lambda ids: c3.Feature.CustomMaterializationResult(
        data=__import__('pandas').DataFrame([
            {
                'subject': obj.id,
                'feature1': ...,
                'feature2': ...
            }
            for obj in c3.YourSubjectType.fetch({
                'filter': c3.Filter.intersects('id', ids),
                'include': 'this'
            }).objs
        ])
    )
)([s.id for s in subjects])'''

# 2. Create lambda from code string (NOT fromPyFunc!)
src_batch = c3.Lambda.fromPySrc(lambda_code)

# 3. Define columns (order must match DataFrame)
columns = {
    'subject': 'string',
    'feature1': 'double',
    'feature2': 'int'
}

# 4. Create and upsert Feature Set
fs = c3.Feature.Set.make({
    'id': 'YourSubjectType#myFeatureSet',  # REQUIRED: subjectType#name
    'name': 'myFeatureSet',
    'subjectType': c3.YourSubjectType,
    'columns': columns,
    'srcBatch': src_batch,
    'doNotMaterialize': True  # For testing
})
fs.upsert()

# 5. Test with skipMaterialized=True
fs = c3.Feature.Set.forName(
    subjectType=c3.YourSubjectType,
    name='myFeatureSet',
    include='this, srcBatch, columns',
    failIfMissing=True
)

result = c3.YourSubjectType.evalFeatureSetBatch(
    filter='true',
    featureSet=fs,
    skipMaterialized=True
)

str(result.to_pandas())
```

**REMEMBER:**

- Use `runPyCode` MCP tool to execute this code
- Do NOT create `.c3typ` or `.py` files for Feature Sets
- Feature Sets are created at runtime via the API
