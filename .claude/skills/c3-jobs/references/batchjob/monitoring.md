# Monitoring and Debugging BatchJobs

## Running a BatchJob

### Basic Execution

```javascript
// Create and start a batch job
var options = MyJobOptions.make({
  batchSize: 100,
  enableFeatureX: true,
});

var job = MyBatchJob.make({}).create();
job.start(options);
```

### Python Execution

```python
# Create and start a batch job
options = c3.MyJobOptions.make({
    "batchSize": 100,
    "enableFeatureX": True
})

job = c3.MyBatchJob.make({}).create()
job.start(options)
```

---

## Monitoring Job Progress

### Check Job Status

```javascript
// Get job by ID with current run
var job = MyBatchJob.forId(jobId).get('this, run.status.status, run.status.errors');

// Check status
if (job.run) {
  console.log('Job status: ' + job.run.status.status);

  // Check for errors
  if (job.run.status.errors && job.run.status.errors.length > 0) {
    console.log('Errors found: ' + job.run.status.errors.length);
  }
}
```

### Monitor Active Jobs

```javascript
// Get recent jobs
var recentJobs = MyBatchJob.fetch({
  filter: Filter.ge('meta.created', DateTime.now().minusDays(1)),
  order: 'descending(meta.created)',
  limit: 10,
  include: 'this, run.status.status',
}).objs;

// Check each job's status
recentJobs.each((job) => {
  if (job.run) {
    console.log('Job ' + job.id + ': ' + job.run.status.status);
  }
});
```

---

## Debugging Failed Jobs

### Check Job Status for Errors

```javascript
// Get job and check status
var job = MyBatchJob.forId(jobId).get('this, run.status.status, run.status.errors');

if (job.run) {
  console.log('Job status: ' + job.run.status.status);

  // If job failed, investigate errors
  if (job.run.status.status === 'FAILED') {
    console.log('Job failed - check batch processing logs for details');

    if (job.run.status.errors && job.run.status.errors.length > 0) {
      console.log('Error details:');
      job.run.status.errors.each((error) => {
        console.log('  - ' + error);
      });
    }
  }
}
```

### Common Failure Patterns

1. **Timeout Errors**

   - Batch processing takes too long
   - Solution: Reduce `batchSize` in options

2. **Memory Errors**

   - Loading too much data in processBatch
   - Solution: Process records one at a time, don't accumulate in arrays

3. **External API Failures**

   - Rate limits or connection issues
   - Solution: Add retry logic and smaller batches

4. **Data Validation Errors**
   - Invalid data causing merge/create failures
   - Solution: Add validation in processBatch before persisting

---

## Logging Best Practices

### Using Logger in BatchJob Methods

Use the C3 `Logger` type for proper server-side logging:

```javascript
function doStart(job, options) {
  var logger = Logger.for('MyBatchJob');
  var totalRecords = 0;
  var batchCount = 0;

  logger.info('Starting job with batchSize: ' + options.batchSize);

  // ... batch creation logic ...

  logger.info('Scheduled ' + batchCount + ' batches for ' + totalRecords + ' records');
}

function processBatch(batch, _job, options) {
  var logger = Logger.for('MyBatchJob');

  try {
    logger.debug('Processing batch with ' + batch.values.length + ' records');

    // ... processing logic ...

    logger.debug('Successfully processed batch');
  } catch (e) {
    logger.error('Batch processing failed: ' + e.message);
    throw e; // Re-throw to mark batch as failed
  }
}
```

### Python Logging

Python uses the C3 Logger with `for_()` method:

```python
def doStart(cls, job, options):
    logger = c3.Logger.for_('MyBatchJob')
    total_records = 0
    batch_count = 0

    logger.info(f"Starting job with batchSize: {options.batchSize}")

    # ... batch creation logic ...

    logger.info(f"Scheduled {batch_count} batches for {total_records} records")

def processBatch(cls, batch, job, options):
    logger = c3.Logger.for_('MyBatchJob')

    try:
        logger.debug(f"Processing batch with {len(batch.values)} records")

        # ... processing logic ...

        logger.debug("Successfully processed batch")
    except Exception as e:
        logger.error(f"Batch processing failed: {str(e)}")
        raise  # Re-raise to mark batch as failed
```

---

## Performance Monitoring

### Measure Batch Processing Time

```javascript
function processBatch(batch, _job, options) {
  var startTime = DateTime.now();

  // ... processing logic ...

  var duration = DateTime.now().toMillis() - startTime.toMillis();
  // Track duration in custom metrics if needed
  // Avoid console.log - processBatch runs on server
}
```

### Track Completion Status

```javascript
function allComplete(job, options) {
  var jobWithRun = job.getMissing('run.status.status');
  // Store completion metrics or trigger notifications
  // Avoid console.log - allComplete runs on server
}
```

---

## Canceling Jobs

### Cancel Running Job

```javascript
// Cancel a running job
var job = MyBatchJob.forId(jobId).get();
job.cancel();

// Check if cancellation was successful
job = MyBatchJob.forId(jobId).get('this, run.status.status');
if (job.run) {
  console.log('Job status: ' + job.run.status.status); // Should be 'CANCELLED'
}
```

**Note:** Canceling stops scheduling new batches but doesn't stop in-progress batches.

---

## Testing BatchJobs

### Test with Small Dataset

```javascript
// Create test data
var testRecords = [MyEntity.make({ name: 'Test1', data: 'value1' }), MyEntity.make({ name: 'Test2', data: 'value2' })];
MyEntity.createBatch(testRecords);

// Run job with small batch size
var options = MyJobOptions.make({ batchSize: 1 });
var job = MyBatchJob.make({}).create();
job.start(options);

// Wait and verify
// ... check results ...
```

### Dry Run Pattern

```javascript
// Add dryRun option to your Options type
type MyJobOptions {
  batchSize: int = 100
  dryRun: boolean = false
}

// In processBatch, check dryRun flag
function processBatch(batch, _job, options) {
  // Compute all changes first
  var updates = batch.values.map((entity) =>
    entity.withField("processed", true)
  );

  if (!options.dryRun) {
    MyEntity.mergeBatch(updates);  // Only persist if not dry run
  }
  // In dryRun mode, simply skip persistence
  // Errors/status tracked through BatchJob framework
}
```

---

## Dashboard Query Examples

### Get Job Summary Statistics

```javascript
// Get all jobs for analysis
var allJobs = MyBatchJob.fetch({
  filter: Filter.ge('meta.created', DateTime.now().minusDays(7)),
  include: 'this, run.status.status',
}).objs;

// Analyze job statuses
var statusCounts = {};
allJobs.each((job) => {
  if (job.run) {
    var status = job.run.status.status;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }
});

console.log('Job counts by status:', statusCounts);
```

### Find Long-Running Jobs

```javascript
var longRunning = MyBatchJob.fetch({
  filter: Filter.lt('meta.created', DateTime.now().minusHours(1)),
  include: 'this, run.status.status',
}).objs;

// Check which are still running
longRunning.each((job) => {
  if (job.run && job.run.status.status === 'RUNNING') {
    console.log('Long-running job: ' + job.id);
  }
});
```
