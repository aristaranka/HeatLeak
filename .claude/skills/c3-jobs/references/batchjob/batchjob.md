# C3 AI BatchJob Development

## Core Concept

BatchJobs enable parallel processing of large datasets by:

1. Splitting work into batches in `doStart`
2. Processing each batch independently in `processBatch`
3. Optionally aggregating results in `allComplete`

The C3 platform handles scheduling, parallelism, retries, and monitoring.

## File Organization

**IMPORTANT:** Before creating BatchJob files, ask the user:

> "Would you like to organize the BatchJob files in a `src/jobs/` directory? This is the recommended practice for keeping BatchJob code organized."

**CRITICAL: Each type must be in its own separate file.**

If yes, create these **separate files** in `src/jobs/`:

- `src/jobs/MyBatchJob.c3typ` - the BatchJob type
- `src/jobs/MyBatchJob.js` (or `.py`) - implementation
- `src/jobs/MyJobOptions.c3typ` - options type
- `src/jobs/MyJobBatch.c3typ` - batch type

If no, create **separate files** directly in `src/`:

- `src/MyBatchJob.c3typ`
- `src/MyBatchJob.js` (or `.py`)
- `src/MyJobOptions.c3typ`
- `src/MyJobBatch.c3typ`

**Never put multiple types in one file.** If unsure about C3 type patterns, use the `/c3-type-documentation` skill.

## Quick Start

### 1. Define Three Types

```c3typ
// The BatchJob itself
type MyBatchJob extends BatchJob<MyBatchJob, MyJobOptions, MyJobBatch> type key 'MYJOB' {
  doStart: ~ js-server
  processBatch: ~ js-server
  allComplete: ~ js-server  // Optional
}

// Configuration
type MyJobOptions {
  batchSize: int = 100
  customFlag: boolean = true
}

// Work unit
type MyJobBatch {
  records: [MyEntity]
}
```

### 2. Implement Three Methods

**doStart** - Split dataset and schedule batches:

```javascript
function doStart(job, options) {
  var builder = MyEntity.arrayBuilder();
  var stream = MyEntity.fetchObjStream({ filter: '...' });

  while (stream.hasNext()) {
    builder.push(stream.next());

    if (builder.size() >= options.batchSize || !stream.hasNext()) {
      job.scheduleBatch(MyJobBatch.make({ records: builder.build() }));
      builder.clear();
    }
  }
}
```

**processBatch** - Process one batch:

```javascript
function processBatch(batch, _job, options) {
  var updated = batch.records.map((record) => record.withField('processed', true));
  MyEntity.mergeBatch(updated);
}
```

**allComplete** - Optional summary (keep lightweight):

```javascript
function allComplete(job, options) {
  // Store summary or trigger notifications
  JobSummary.make({
    jobId: job.id,
    completedAt: DateTime.now(),
  }).create();
}
```

### 3. Run the Job

```javascript
var options = MyJobOptions.make({ batchSize: 200 });
var job = MyBatchJob.make({}).create();
job.start(options);
```

## Implementation Patterns

For common patterns (migration, bulk update, ETL, cleanup, external sync, aggregation), see [patterns.md](patterns.md).

## Complete Examples

Working examples in [assets/](assets/):

- **[cleanup-job/](assets/cleanup-job/)** - Date-based filtering with soft/hard delete
- **[simple-migration/](assets/simple-migration/)** - Basic data transformation between types

Copy and customize these templates for your use case.

## Key Methods

### doStart(job, options)

**Purpose:** Split dataset into batches and schedule them.

**Pattern:**

1. Use `fetchObjStream()` to avoid loading all data into memory
2. Build batches using `EntityType.arrayBuilder()`
3. Schedule with `job.scheduleBatch(batchSpec)`
4. Reset builder with `builder.clear()` after each batch

**Critical:** Always reset the builder after scheduling to avoid memory accumulation.

### processBatch(batch, job, options)

**Purpose:** Process one batch of work.

**Best practices:**

- Use batch operations (`mergeBatch`, `createBatch`) instead of individual calls
- Handle errors gracefully - log and continue processing other records
- Keep memory usage low - process incrementally, don't accumulate large arrays
- Add timing logs to track performance

**Anti-pattern:** Don't fetch additional data in loops (N+1 queries). Fetch all related data in one query.

### allComplete(job, options)

**Purpose:** Optional post-processing after all batches finish.

**Use for:**

- Summary statistics
- Aggregating partial results
- Creating final reports

**Keep lightweight:** Don't reprocess the entire dataset here - that defeats the purpose of distributed batching.

## Monitoring & Debugging

For monitoring job status, debugging failures, logging patterns, and testing strategies, see [monitoring.md](monitoring.md).

Key monitoring commands:

```javascript
// Check job status
var job = MyBatchJob.forId(jobId).get('this, run.status.status, run.status.errors');
if (job.run) {
  console.log('Status: ' + job.run.status.status);
  // Status values: 'CREATED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'
}

// Check for errors
if (job.run && job.run.status.errors && job.run.status.errors.length > 0) {
  console.log('Errors found: ' + job.run.status.errors.length);
}
```

## Performance Optimization

For batch size selection, memory optimization, parallel execution, and common anti-patterns, see [performance.md](performance.md).

Key guidelines:

| Dataset Size | Batch Size  | Rationale                           |
| ------------ | ----------- | ----------------------------------- |
| < 1K         | 100-200     | Overhead may not be worth it        |
| 1K-10K       | 200-500     | Balance of parallelism and overhead |
| 10K-100K     | 500-1,000   | Maximize throughput                 |
| 100K+        | 1,000-5,000 | Large batches for efficiency        |

**Critical optimization:** Always use `fetchObjStream()` in doStart, never `fetch({limit: -1})`.

## Logging Best Practices

**CRITICAL:** Never use `console.log`, `console.error`, or `Console.info` in BatchJob implementation code.

**Logging is optional** - omit it entirely for clearer examples. When needed:

**✅ Use C3 Logger:**

```javascript
var logger = Logger.for('MyBatchJob');
logger.info('Processed ' + batch.values.length + ' records');
```

**❌ Never use console/Console:**

```javascript
console.log('...'); // ❌ Wrong
Console.info('...'); // ❌ Wrong - doesn't exist
```

## Development Checklist

- [ ] BatchJob type extends `BatchJob<JobType, OptionsType, BatchType>`
- [ ] Options type created with sensible defaults
- [ ] Batch type contains work unit structure
- [ ] `doStart` uses `fetchObjStream()` and resets builder after each batch
- [ ] `processBatch` uses batch operations (`mergeBatch`, etc.)
- [ ] Error handling added to `processBatch`
- [ ] If logging needed, use `Logger.for()` (never console.log or Console.info)
- [ ] Tested with small dataset first
- [ ] `allComplete` kept lightweight (if used)

## Common Anti-Patterns to Avoid

1. **Single huge batch** - Use reasonable batch sizes (100-5,000) for parallelism
2. **Unbounded memory** - Reset builder after scheduling each batch
3. **Hard-coded parameters** - Use Options type for configuration
4. **Heavy allComplete** - Keep it lightweight, don't reprocess entire dataset
5. **Silent failures** - Log errors and propagate failures appropriately
6. **N+1 queries** - Fetch related data in one query, not in loops
7. **Individual operations** - Use batch operations (`mergeBatch`, not individual `merge()`)
8. **Console logging** - Never use `console.log`, `console.error`, or `Console.info` in implementation code

## Language Selection

- **JavaScript** - Simpler syntax, sufficient for most BatchJobs
- **Python** - Use for complex transformations, ML operations, or heavy data science

Both languages support the same BatchJob patterns. Choose based on your team's preference and the complexity of your business logic.
