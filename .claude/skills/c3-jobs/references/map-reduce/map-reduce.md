# C3 MapReduce Development

MapReduce enables parallel processing of large datasets through two stages: **map** (process data subsets) and **reduce** (aggregate results).

## Quick Start

### 1. Define Entity Type

Create the entity type containing data to process:

```c3typ
entity type WordDocument {
  title: string
  content: string
}
```

### 2. Define MapReduce Job Type

Specify entity type, key type, intermediate type, and final type:

```c3typ
type WordCount extends MapReduce<WordDocument, string, int, int> type key 'WORDCOUNT' {
  map: ~ js-rhino
  reduce: ~ js-rhino
}
```

**Type parameters:**

- `WordDocument` - Entity type to process
- `string` - Key type (e.g., word)
- `int` - Intermediate value type (map output)
- `int` - Final value type (reduce output)

### 3. Implement Map and Reduce

**Map function signature:**

```javascript
function map(batch, objs, job, subBatch)
```

- `batch` (int) - Batch number
- `objs` (EntityType[]) - Objects in this batch
- `job` (MapReduce) - Job instance
- `subBatch` (int) - Subbatch number
- **Returns:** Object/Map with keys → intermediate values

**Reduce function signature:**

```javascript
function reduce(outKey, interValues, job)
```

- `outKey` (KeyType) - Key being processed
- `interValues` (IntermediateValueType[]) - All intermediate values for this key
- `job` (MapReduce) - Job instance
- **Returns:** Array of final values `[FinalValueType]`

**Implementation:**

```javascript
function map(batch, objs, job, subBatch) {
  var resultMap = {};

  objs.each((doc) => {
    if (doc.content) {
      var words = doc.content.toLowerCase().split(/\s+/);
      words.each((word) => {
        word = word.replace(/[^\w]/g, '');
        if (word.length > 0) {
          resultMap[word] = (resultMap[word] || 0) + 1;
        }
      });
    }
  });

  return resultMap;
}

function reduce(word, counts, job) {
  var total = 0;
  counts.each((count) => {
    total += count;
  });
  return [total];
}
```

### 4. Run Job

```javascript
// Create sample data
WordDocument.createBatch([
  { title: 'Doc1', content: 'hello world hello' },
  { title: 'Doc2', content: 'world of data' },
]);

// Create and start job
var job = WordCount.make({
  targetType: WordDocument,
  include: 'content', // Only fetch fields needed by map
  batchSize: 100,
}).upsert();

job.start();

// Check status
job.status();

// Get results
var results = job.results(100);
results.each((entry) => {
  console.log(entry.key + ': ' + entry.value);
});
```

## File Organization

Organize MapReduce jobs in the jobs directory:

```text
{package}/src/
  WordDocument.c3typ       # Entity type

{package}/src/jobs/
  WordCount.c3typ          # MapReduce job type
  WordCount.js             # Map/reduce implementation
```

## MapReduce Job Configuration

### Essential Parameters

```javascript
var job = JobType.make({
  targetType: EntityType, // Required: entity type to process
  include: 'field1, field2', // Required: fields for map function
  batchSize: 100, // Required: objects per batch
}).upsert();
```

### Optional Parameters

```javascript
var job = JobType.make({
  targetType: EntityType,
  include: 'field1, field2',
  batchSize: 100,
  filter: "field1 == 'value'", // C3 filter expression
  order: 'ascending(timestamp)', // Sort order
  numAutoRecoveryAttempts: 3, // Auto-retry failures
}).upsert();
```

### Adding Custom Job Properties

Add configuration fields to job type:

```c3typ
type CustomJob extends MapReduce<Entity, string, int, int> type key 'CUSTOMJOB' {
  minThreshold: double      // Custom parameter
  targetRegion: string      // Another parameter

  map: ~ js-rhino
  reduce: ~ js-rhino
}
```

Access in map/reduce:

```javascript
function map(batch, objs, job, subBatch) {
  var threshold = job.minThreshold || 0;
  var region = job.targetRegion;

  var resultMap = {};
  objs.each((obj) => {
    if (obj.value >= threshold && obj.region == region) {
      resultMap[obj.key] = obj.value;
    }
  });
  return resultMap;
}
```

## Common Patterns

### Aggregation with Complex Values

Use value types for structured intermediate results.

**Metrics.c3typ:**

```c3typ
type Metrics {
  sum: double
  count: int
  min: double
  max: double
}
```

**MetricsJob.c3typ:**

```c3typ
type MetricsJob extends MapReduce<Entity, string, Metrics, Metrics> type key 'METRICSJOB' {
  map: ~ js-rhino
  reduce: ~ js-rhino
}
```

**MetricsJob.js:**

```javascript
function map(batch, objs, job, subBatch) {
  var resultMap = {};

  objs.each((obj) => {
    if (!resultMap[obj.category]) {
      resultMap[obj.category] = Metrics.make({
        sum: 0,
        count: 0,
        min: obj.value,
        max: obj.value,
      });
    }

    var m = resultMap[obj.category];
    resultMap[obj.category] = m
      .withSum(m.sum + obj.value)
      .withCount(m.count + 1)
      .withMin(Math.min(m.min, obj.value))
      .withMax(Math.max(m.max, obj.value));
  });

  return resultMap;
}

function reduce(category, metricsArray, job) {
  var aggregated = Metrics.make({
    sum: 0,
    count: 0,
    min: Number.MAX_VALUE,
    max: Number.MIN_VALUE,
  });

  metricsArray.each((m) => {
    aggregated = aggregated
      .withSum(aggregated.sum + m.sum)
      .withCount(aggregated.count + m.count)
      .withMin(Math.min(aggregated.min, m.min))
      .withMax(Math.max(aggregated.max, m.max));
  });

  return [aggregated];
}
```

### Composite Keys

Use delimited strings for multi-part keys:

```javascript
function map(batch, objs, job, subBatch) {
  var resultMap = {};

  objs.each((obj) => {
    var key = obj.region + '|' + obj.product; // Composite key
    resultMap[key] = (resultMap[key] || 0) + obj.amount;
  });

  return resultMap;
}
```

Parse composite keys:

```javascript
var results = job.results(1000);
results.each((entry) => {
  var parts = entry.key.split('|');
  var region = parts[0];
  var product = parts[1];
  console.log(region + ' - ' + product + ': ' + entry.value);
});
```

### Filtering in Map

Apply filters before processing:

```javascript
function map(batch, objs, job, subBatch) {
  var resultMap = {};
  var threshold = job.minValue || 0;

  objs.each((obj) => {
    // Filter: only process qualifying records
    if (obj.value >= threshold && obj.status == 'Active') {
      resultMap[obj.category] = (resultMap[obj.category] || 0) + 1;
    }
  });

  return resultMap;
}
```

### Processing JSON Fields

Extract and process JSON data:

```javascript
function map(batch, objs, job, subBatch) {
  var resultMap = {};

  objs.each((obj) => {
    if (obj.eventData && obj.eventData.eventType) {
      var eventType = obj.eventData.eventType;
      var value = obj.eventData.value || 0;
      resultMap[eventType] = (resultMap[eventType] || 0) + value;
    }
  });

  return resultMap;
}
```

### Time-Based Grouping

Group by time windows:

```javascript
function map(batch, objs, job, subBatch) {
  var resultMap = {};

  objs.each((obj) => {
    // Round to hour
    var hourMs = 1000 * 60 * 60;
    var hour = Math.floor(obj.timestamp.millis() / hourMs);
    var key = obj.sensorId + '|' + hour;

    resultMap[key] = (resultMap[key] || 0) + obj.value;
  });

  return resultMap;
}
```

## Job Management

### Monitor Job Progress

```javascript
var job = JobType.forId(jobId).get();
var status = job.status();

console.log('Status: ' + status.status); // Values: completed, running, failed, cancelled

// Check status using methods
if (status.isCompleted()) {
  console.log('Job completed successfully');
} else if (status.isFailed()) {
  console.log('Job failed');
}

// Check for errors
if (status.errors && status.errors.length > 0) {
  console.log('Errors: ' + status.errors);
}
```

### Job Lifecycle Operations

```javascript
var job = JobType.forId(jobId).get();

// Cancel job (keeps results)
job.cancel(false);

// Cancel and delete results
job.cancel(true);

// Retry failed batches
job.recover();

// Change priority
job.setPriority(200);
```

### Retrieve Results

```javascript
// Get first N results
var results = job.results(100);

results.each((entry) => {
  console.log('Key: ' + entry.key);
  console.log('Value: ' + entry.value);
});

// Get all results (use carefully)
var allResults = job.results(-1);
```

## Best Practices

### Performance

- **Batch size:** Use 50-200 for balanced performance. Too small = high overhead, too large = memory issues
- **Include clause:** Only fetch fields needed by map function. Avoid `include: 'this'`
- **Filter early:** Use job filter parameter to reduce data volume
- **Avoid accumulation:** Don't build large arrays in resultMap. Aggregate metrics instead
- **No external calls:** Don't fetch data from external systems inside map - pre-load if needed

### Correctness

- **Always return:** Map must return resultMap, reduce must return array
- **Type matching:** Ensure map output type matches IntermediateValueType
- **Immutability:** Use `.with*()` methods for C3 value types, don't mutate directly
- **Null handling:** Check for null/undefined before accessing fields
- **Error handling:** Wrap risky operations in try-catch to prevent batch failures

### Debugging

- **Check status first:** Always inspect `job.status().errors` when issues occur
- **Test functions:** Call map/reduce directly with sample data before running full job
- **Start small:** Test with small batch size and limited data first
- **Inspect results:** Check first few results to verify correctness before processing all

## Advanced Features

### Optional Lifecycle Hooks

**IMPORTANT:** These methods are optional and should only be implemented when explicitly requested by the user. Do not add them proactively.

MapReduce jobs support optional lifecycle hooks for post-processing:

**mapCompleted** - Called after all map operations finish, before reduce starts:

```c3typ
type CustomJob extends MapReduce<Entity, string, int, int> type key 'CUSTOMJOB' {
  /**
   * Optional: Called after map phase completes
   */
  mapCompleted: ~ js-rhino

  map: ~ js-rhino
  reduce: ~ js-rhino
}
```

```javascript
function mapCompleted(job) {
  // Use case: Log completion or trigger notification
  // Only implement if there's a specific need for map-phase completion handling
}
```

**completed** - Called when entire job (map + reduce) finishes successfully:

```c3typ
type CustomJob extends MapReduce<Entity, string, int, int> type key 'CUSTOMJOB' {
  /**
   * Optional: Called when job completes successfully
   */
  completed: ~ js-rhino

  map: ~ js-rhino
  reduce: ~ js-rhino
}
```

```javascript
function completed(job) {
  // Use case: Post-processing, notifications, cleanup
  // Only implement if there's a specific need for success handling
}
```

**failed** - Called when job fails:

```c3typ
type CustomJob extends MapReduce<Entity, string, int, int> type key 'CUSTOMJOB' {
  /**
   * Optional: Called when job fails
   */
  failed: ~ js-rhino

  map: ~ js-rhino
  reduce: ~ js-rhino
}
```

```javascript
function failed(job) {
  // Use case: Error notifications, cleanup, logging
  // Only implement if there's a specific need for failure handling
}
```

**When to use lifecycle hooks:**

- User explicitly requests post-processing logic
- Need to trigger external notifications or workflows
- Require custom cleanup or error handling

**When NOT to use:**

- Do not add these methods by default
- Do not implement them "just in case"
- Do not use for core job logic (belongs in map/reduce)

### Incremental Processing

Process large datasets in chunks:

```javascript
var dateRanges = [
  { start: '2024-01-01', end: '2024-02-01' },
  { start: '2024-02-01', end: '2024-03-01' },
];

dateRanges.each((range) => {
  var job = JobType.make({
    targetType: EntityType,
    include: 'timestamp, data',
    filter: "timestamp >= '" + range.start + "' && timestamp < '" + range.end + "'",
    batchSize: 100,
  }).upsert();
  job.start();
});
```

### Chaining Jobs

Use output of one job as input to another:

```javascript
// Job 1: Aggregate by category
var job1 = CategoryAggregator.make({...}).upsert();
job1.start();

// Wait for completion, then start job 2
// Job 2: Process aggregated results
var results1 = job1.results(-1);
// Store results as entities for job 2 to process
```

### Defensive Error Handling

```javascript
function map(batch, objs, job, subBatch) {
  var resultMap = {};

  objs.each((obj) => {
    try {
      // Process object
      var processed = processData(obj);
      resultMap[processed.key] = processed.value;
    } catch (e) {
      // Error handling - batch continues processing remaining objects
    }
  });

  return resultMap;
}
```

## Examples and Troubleshooting

- **Complete working examples:** See [examples.md](examples.md) for word count, aggregation, JSON processing, time-series, and more
- **Common errors and solutions:** See [troubleshooting.md](troubleshooting.md) for debugging techniques and error resolution

## Additional Resources

For detailed MapReduce documentation, use the C3 MCP tool:

```javascript
search_c3_documentation() with search_query = "Implement MapReduce Jobs"
expand_c3_document() on relevant results
```
