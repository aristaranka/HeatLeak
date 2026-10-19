# MapReduce Troubleshooting Guide

## Checking Job Status and Errors

Always start by examining the job status when issues occur:

```javascript
var job = JobName.get(jobId);
var status = job.status();

// Check if job completed
console.log('Status: ' + status.status); // Values: completed, running, failed, cancelled

// Check status using methods
if (status.isCompleted()) {
  console.log('Job completed successfully');
} else if (status.isFailed()) {
  console.log('Job failed');
}

// Check for errors
if (status.errors && status.errors.length > 0) {
  status.errors.each((error) => {
    console.log('Error: ' + error);
  });
}
```

## Common Errors and Solutions

### Error: "Required field not included"

**Symptom:** Job fails immediately after starting.

**Cause:** The `include` parameter doesn't specify all fields needed by map/reduce functions.

**Solution:**

```javascript
// ❌ Wrong - missing required fields
var job = JobName.make({
  targetType: EntityName,
  include: 'id', // Not enough
  batchSize: 10,
}).upsert();

// ✅ Correct - include all fields used in map function
var job = JobName.make({
  targetType: EntityName,
  include: 'id, attribute1, attribute2', // All fields referenced
  batchSize: 10,
}).upsert();
```

### Error: "Map function returned undefined"

**Symptom:** Job completes but produces no results.

**Cause:** Map function doesn't return a proper object/map.

**Solution:**

```javascript
// ❌ Wrong - forgot to return
function map(batch, objs, job, subBatch) {
  var resultMap = {};
  objs.each((obj) => {
    resultMap[obj.key] = obj.value;
  });
  // Missing return!
}

// ✅ Correct - always return resultMap
function map(batch, objs, job, subBatch) {
  var resultMap = {};
  objs.each((obj) => {
    resultMap[obj.key] = obj.value;
  });
  return resultMap; // Must return
}
```

### Error: "Reduce function returned wrong type"

**Symptom:** Job fails during reduce stage.

**Cause:** Reduce function returns wrong type or doesn't return an array.

**Solution:**

```javascript
// ❌ Wrong - returns single value
function reduce(key, values, job) {
  var sum = 0;
  values.each((v) => {
    sum += v;
  });
  return sum; // Wrong - should be array
}

// ✅ Correct - returns array of final values
function reduce(key, values, job) {
  var sum = 0;
  values.each((v) => {
    sum += v;
  });
  return [sum]; // Must be array
}
```

### Error: "Out of memory" or Job Hangs

**Symptom:** Job runs very slowly or fails with memory errors.

**Cause:** Batch size too large or accumulating too much data in resultMap.

**Solution:**

```javascript
// ❌ Wrong - batch size too large
var job = JobName.make({
  targetType: EntityName,
  include: 'data',
  batchSize: 10000, // Too large!
}).upsert();

// ✅ Correct - use smaller batches
var job = JobName.make({
  targetType: EntityName,
  include: 'data',
  batchSize: 100, // More manageable
}).upsert();
```

Also check for data accumulation in map:

```javascript
// ❌ Wrong - building large arrays in map
function map(batch, objs, job, subBatch) {
  var resultMap = {};
  objs.each((obj) => {
    if (!resultMap[obj.category]) {
      resultMap[obj.category] = [];
    }
    resultMap[obj.category].push(obj); // Accumulating objects!
  });
  return resultMap;
}

// ✅ Correct - aggregate instead of accumulate
function map(batch, objs, job, subBatch) {
  var resultMap = {};
  objs.each((obj) => {
    resultMap[obj.category] = (resultMap[obj.category] || 0) + 1; // Just count
  });
  return resultMap;
}
```

### Error: "No data to process"

**Symptom:** Job completes immediately with 0 batches.

**Cause:** Filter excludes all entities or targetType is empty.

**Solution:**

```javascript
// Check if data exists
var count = EntityName.fetchCount();
console.log('Entity count: ' + count);

// Check filter
var job = JobName.make({
  targetType: EntityName,
  include: 'attribute1',
  filter: "attribute1 == 'someValue'", // Verify this matches data
  batchSize: 10,
}).upsert();

// Or remove filter temporarily to test
var job = JobName.make({
  targetType: EntityName,
  include: 'attribute1',
  // No filter - process all
  batchSize: 10,
}).upsert();
```

### Error: "Type mismatch in reduce"

**Symptom:** Reduce function fails with type errors.

**Cause:** Map produces different type than reduce expects (IntermediateValueType mismatch).

**Solution:**

```
// Verify type signature matches implementation
// MapReduce<EntityType, KeyType, IntermediateValueType, FinalValueType>
type JobType extends MapReduce<Entity, string, int, int> type key 'JOB_TYPE' {
  map: ~ js server
  reduce: ~ js server
}
```

```javascript
// Map MUST return int values (matching IntermediateValueType)
function map(batch, objs, job, subBatch) {
  var resultMap = {};
  objs.each((obj) => {
    resultMap[obj.key] = 1; // int value
  });
  return resultMap;
}

// Reduce receives int[] (array of IntermediateValueType)
// and returns int[] (array of FinalValueType)
function reduce(key, values, job) {
  var sum = 0;
  values.each((v) => {
    sum += v;
  });
  return [sum]; // int[] matching FinalValueType
}
```

### Error: "Job stuck in RUNNING state"

**Symptom:** Job doesn't progress and batches don't complete.

**Cause:** Exception in map/reduce function not being caught, or infinite loop.

**Solution:**

```javascript
// Add defensive error handling
function map(batch, objs, job, subBatch) {
  var resultMap = {};

  objs.each((obj) => {
    try {
      // Process object
      var processed = processData(obj);
      resultMap[processed.key] = processed.value;
    } catch (e) {
      // Handle error but don't fail entire batch
    }
  });

  return resultMap;
}

// Cancel stuck job and investigate
var job = JobName.get(jobId);
job.cancel(false); // Don't delete results
```

## Performance Issues

### Slow Job Execution

**Check batch size:**

```javascript
// Too small - too many batches, high overhead
var job = JobName.make({ batchSize: 1 }).upsert(); // ❌

// Too large - memory issues, long batch times
var job = JobName.make({ batchSize: 10000 }).upsert(); // ❌

// Optimal (50 - 200) - balance between overhead and memory
var job = JobName.make({ batchSize: 100 }).upsert(); // ✅
```

**Check include clause:**

```javascript
// ❌ Wrong - fetching unnecessary data
var job = JobName.make({
  targetType: EntityName,
  include: 'this', // Fetches everything!
  batchSize: 100,
}).upsert();

// ✅ Correct - only fetch needed fields
var job = JobName.make({
  targetType: EntityName,
  include: 'id, attribute1, attribute2', // Only what map needs
  batchSize: 100,
}).upsert();
```

**Check for expensive operations in map:**

```javascript
// ❌ Wrong - external calls in map
function map(batch, objs, job, subBatch) {
  var resultMap = {};
  objs.each((obj) => {
    var enriched = ExternalAPI.fetch(obj.id); // Don't do this!
    resultMap[obj.id] = enriched.value;
  });
  return resultMap;
}

// ✅ Correct - precompute or batch external calls
function map(batch, objs, job, subBatch) {
  var resultMap = {};
  objs.each((obj) => {
    resultMap[obj.id] = obj.value; // Use existing data
  });
  return resultMap;
}
```

### High Memory Usage

**Symptom:** Job uses excessive memory or causes system issues.

**Solutions:**

1. Reduce batch size
2. Avoid accumulating objects in resultMap
3. Use aggregations instead of collections
4. Check for memory leaks in helper functions

```javascript
// ❌ Wrong - accumulating objects
function map(batch, objs, job, subBatch) {
  var resultMap = {};
  objs.each((obj) => {
    if (!resultMap['all']) resultMap['all'] = [];
    resultMap['all'].push(obj); // Memory grows indefinitely!
  });
  return resultMap;
}

// ✅ Correct - aggregate metrics instead
function map(batch, objs, job, subBatch) {
  var resultMap = {
    all: { count: 0, sum: 0 },
  };
  objs.each((obj) => {
    resultMap['all'].count++;
    resultMap['all'].sum += obj.value;
  });
  return resultMap;
}
```

## Job Recovery Strategies

### Manual Recovery After Failure

```javascript
var job = JobType.forId(jobId);

// Check status
var status = job.status();
if (status.isFailed()) {
  console.log('Job failed - attempting recovery');

  // Attempt recovery
  job.recover();

  // Monitor recovery
  setTimeout(() => {
    var newStatus = job.status();
    console.log('Status after recovery: ' + newStatus.status);
  }, 5000);
}
```

### Automatic Recovery Configuration

```javascript
// Set up automatic retry on failure
var job = JobType.make({
  targetType: EntityName,
  include: 'data',
  batchSize: 100,
  numAutoRecoveryAttempts: 3, // Retry up to 3 times
}).upsert();

job.start();
```

### Incremental Processing Pattern

For very large datasets, process incrementally:

```javascript
// Process data in date ranges
var ranges = C3.Array.ofAny(
  { start: '2024-01-01', end: '2024-02-01' },
  { start: '2024-02-01', end: '2024-03-01' },
  { start: '2024-03-01', end: '2024-04-01' }
);

ranges.each((range) => {
  var job = JobType.make({
    targetType: EntityType,
    include: 'timestamp, data',
    filter: "timestamp >= '" + range.start + "' && timestamp < '" + range.end + "'",
    batchSize: 100,
  }).upsert();

  job.start();
  console.log('Started job for range: ' + range.start + ' to ' + range.end);
});
```

## Debugging Techniques

### Test Map/Reduce Functions Directly

```javascript
// Test map with sample data
var sampleObjs = EntityType.fetch({ limit: 5, include: 'this' }).objs;
var testResult = JobType.map(0, sampleObjs, {}, 0);
console.log('Map test result: ' + JSON.stringify(testResult));

// Test reduce with sample data
var sampleValues = [1, 2, 3];
var reduceResult = JobType.reduce('testKey', sampleValues, {});
console.log('Reduce test result: ' + JSON.stringify(reduceResult));
```

### Inspect Results Incrementally

```javascript
var job = JobType.forId(jobId);

// Get first few results
var firstResults = job.results(10);
console.log('First 10 results:');
firstResults.each((entry) => {
  console.log('Key: ' + entry.key + ', Value: ' + JSON.stringify(entry.value));
});
// Check for unexpected keys or values
var allKeys = job.results(1000);
var keyTypes = {};
allKeys.each((entry) => {
  var valueType = typeof entry.value;
  keyTypes[valueType] = (keyTypes[valueType] || 0) + 1;
});
console.log('Value types: ' + JSON.stringify(keyTypes));
```

## Getting Additional Help

Use C3 documentation search for detailed information:

```javascript
// Search for MapReduce documentation
// Use MCP tool: search_c3_documentation() with query "Implement MapReduce Jobs"
// Then expand_c3_document() on relevant results
```
