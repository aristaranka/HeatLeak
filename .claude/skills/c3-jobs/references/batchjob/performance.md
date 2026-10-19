# BatchJob Performance and Optimization

## Batch Size Selection

### General Guidelines

| Dataset Size    | Recommended Batch Size | Rationale                                |
| --------------- | ---------------------- | ---------------------------------------- |
| < 1,000 records | 100-200                | Overhead of batching may not be worth it |
| 1,000-10,000    | 200-500                | Good balance of parallelism and overhead |
| 10,000-100,000  | 500-1,000              | Maximize throughput                      |
| 100,000+        | 1,000-5,000            | Large batches for efficiency             |

### Factors Affecting Batch Size

1. **Processing Complexity**

   - Simple updates → Larger batches (1,000-5,000)
   - Complex transformations → Smaller batches (100-500)
   - External API calls → Very small batches (10-100)

2. **Memory Constraints**

   - Each batch loaded into memory
   - Reduce batch size if seeing OutOfMemory errors

3. **Transaction Limits**

   - Some operations have transaction size limits
   - Stay well below platform limits

4. **Failure Granularity**
   - Smaller batches = more precise failure isolation
   - Larger batches = fewer overhead but coarser failure tracking

---

## Optimizing doStart

### Use fetchObjStream for Large Datasets

```javascript
// ✅ GOOD: Stream results, don't load all at once
function doStart(job, options) {
  var builder = MyEntity.arrayBuilder();
  var stream = MyEntity.fetchObjStream({
    filter: 'processed == false',
  });

  while (stream.hasNext()) {
    builder.push(stream.next());

    if (builder.size() >= options.batchSize || !stream.hasNext()) {
      job.scheduleBatch(MyJobBatch.make({ values: builder.build() }));
      builder.clear();
    }
  }
}
```

```javascript
// ❌ BAD: Fetches all records into memory at once
function doStart(job, options) {
  var allRecords = MyEntity.fetch({ limit: -1 }).objs; // Dangerous!

  for (var i = 0; i < allRecords.length; i += options.batchSize) {
    var batch = allRecords.slice(i, i + options.batchSize);
    job.scheduleBatch(MyJobBatch.make({ values: batch }));
  }
}
```

### Python Streaming

```python
def doStart(cls, job, options):
    builder = []
    stream = c3.MyEntity.fetchObjStream({
        "filter": "processed == false"
    })

    while stream.hasNext():
        builder.append(stream.next())

        if len(builder) >= options.batchSize or not stream.hasNext():
            job.scheduleBatch(c3.MyJobBatch.make({"values": builder}))
            builder = []
```

### Optimize Filtering

```javascript
// ✅ GOOD: Filter at database level
var stream = MyEntity.fetchObjStream({
  filter: Filter.eq("status", "PENDING")
    .and().ge("meta.created", DateTime.now().minusDays(90))
});

// ❌ BAD: Fetch everything and filter in code
var stream = MyEntity.fetchObjStream();
while (stream.hasNext()) {
  var entity = stream.next();
  if (entity.status === "PENDING" && /* date check */) {
    // ...
  }
}
```

---

## Optimizing processBatch

### Use Batch Operations

```javascript
// ✅ GOOD: Single batch operation
function processBatch(batch, _job, options) {
  // Store timestamp once for all records
  var now = DateTime.now();

  var updated = batch.values.map((entity) => entity.withField('processed', true).withField('processedDate', now));

  MyEntity.mergeBatch(updated); // Single database call
}

// ❌ BAD: Individual merge calls
function processBatch(batch, _job, options) {
  batch.values.each((entity) => {
    entity.withField('processed', true).merge(); // N database calls!
  });
}
```

### Minimize Memory Accumulation

```javascript
// ✅ GOOD: Process and release
function processBatch(batch, _job, options) {
  var builder = MyEntity.arrayBuilder();

  batch.values.each((entity) => {
    var updated = entity.withField('processed', true);
    builder.push(updated);

    if (builder.size() >= 100) {
      MyEntity.mergeBatch(builder.build());
      builder.clear();
    }
  });

  if (builder.size() > 0) {
    MyEntity.mergeBatch(builder.build());
  }
}

// ❌ BAD: Accumulate all updates in memory
function processBatch(batch, _job, options) {
  var allUpdates = [];
  batch.values.each((entity) => {
    allUpdates.push(entity.withField('processed', true));
  });
  MyEntity.mergeBatch(allUpdates); // Large array in memory
}
```

---

## Parallel Execution

### C3 Platform Handles Parallelism

The BatchJob framework automatically:

- Schedules batches across available workers
- Executes batches in parallel
- Handles failures and retries

**You don't need to implement parallelism manually.**

### Control Parallelism with Batch Size

```javascript
// More batches = more parallelism opportunities
var options = MyJobOptions.make({
  batchSize: 100, // Creates more batches, more parallel execution
});

// Fewer batches = less parallelism
var options = MyJobOptions.make({
  batchSize: 5000, // Creates fewer batches, less parallel execution
});
```

**Trade-off:** More batches = more overhead, but better parallelism

---

## allComplete Optimization

### Keep It Lightweight

```javascript
// ✅ GOOD: Summary statistics only
function allComplete(job, options) {
  var totalProcessed = MyEntity.fetchCount({
    filter: 'processed == true',
  });

  // Store job summary
  JobSummary.make({
    jobId: job.id,
    recordsProcessed: totalProcessed,
    completedAt: DateTime.now(),
  }).create();
}

// ❌ BAD: Heavy processing in allComplete
function allComplete(job, options) {
  // Don't do this! Defeats purpose of distributed batches
  var allRecords = MyEntity.fetch({ limit: -1 }).objs;
  allRecords.each((record) => {
    // Expensive operation on every record
  });
}
```

### Use allComplete for Aggregation

```javascript
function allComplete(job, options) {
  // Aggregate results computed in processBatch
  var stats = MyEntity.eval({
    group: 'category',
    projection: 'category, count(), sum(value), avg(value)',
  });

  // Store aggregated results using batch operation
  var aggregateRecords = stats.map((stat) =>
    AggregateStats.make({
      category: stat.category,
      count: stat.count,
      totalValue: stat.sum,
      avgValue: stat.avg,
    })
  );

  AggregateStats.upsertBatch(aggregateRecords);
}
```

---

## Common Performance Anti-Patterns

### 1. Loading Entire Dataset into Memory

```javascript
// ❌ BAD
var allData = MyEntity.fetch({ limit: -1 }).objs; // OOM risk!
```

**Fix:** Use `fetchObjStream()` and process incrementally.

### 2. N+1 Database Queries

```javascript
// ❌ BAD: Fetch related objects one by one
batch.values.each((entity) => {
  var related = RelatedType.forId(entity.relatedId).get(); // N queries!
});
```

**Fix:** Fetch all related objects in one query:

```javascript
// ✅ GOOD
var relatedIds = batch.values.map((v) => v.relatedId);
var relatedMap = {};
var stream = RelatedType.fetchObjStream({
  filter: Filter.intersects('id', relatedIds),
});

while (stream.hasNext()) {
  var r = stream.next();
  relatedMap[r.id] = r;
}

batch.values.each((entity) => {
  var related = relatedMap[entity.relatedId]; // O(1) lookup
});
```

### 3. Single Huge Batch

```javascript
// ❌ BAD: Defeats parallelism
var options = MyJobOptions.make({ batchSize: 1000000 });
```

**Fix:** Use reasonable batch sizes (100-5,000) for parallelism.

### 4. Synchronous External API Calls

```javascript
// ❌ BAD: External API calls without timeout/retry
function processBatch(batch, _job, options) {
  batch.values.each((entity) => {
    var result = ExternalAPI.call(entity); // Blocks entire batch!
  });
}
```

**Fix:** Add timeouts, error handling, and consider smaller batches for external calls.

---

## Monitoring Performance

### Add Timing Logs

```javascript
function processBatch(batch, _job, options) {
  var logger = Logger.for('MyBatchJob');
  var startTime = DateTime.now();

  // ... processing logic ...

  var duration = DateTime.now().toMillis() - startTime.toMillis();
  var throughput = (batch.values.length / duration) * 1000;

  logger.info(
    'Processed ' + batch.values.length + ' records in ' + duration + 'ms (' + throughput.toFixed(2) + ' records/sec)'
  );
}
```

### Track Completion

```javascript
function allComplete(job, options) {
  // Store completion metrics in custom summary type
  JobMetrics.make({
    jobId: job.id,
    completedAt: DateTime.now(),
  }).create();
}
```
