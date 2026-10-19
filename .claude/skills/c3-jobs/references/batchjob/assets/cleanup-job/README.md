# Cleanup Job Example

This is a complete working example of a BatchJob that cleans up old records based on date criteria.

## Files

- **CleanupJob.c3typ.txt** - BatchJob type definition
- **CleanupJobOptions.c3typ.txt** - Configuration options type
- **CleanupJobBatch.c3typ.txt** - Batch type definition
- **CleanupJob.js** - Implementation of doStart, processBatch, and allComplete
- **OldRecord.c3typ.txt** - Sample entity type (replace with your actual entity)
- **CleanupJobSummary.c3typ.txt** - Entity to track job results

> **Note:** Example files use the `.c3typ.txt` extension to prevent the compiler from picking them up. Rename to `.c3typ` when copying to your `src/` directory.

## Usage

1. Copy all `.c3typ.txt` files to your `src/` directory, renaming them to `.c3typ`
2. Copy `CleanupJob.js` to your `src/` directory
3. Modify `OldRecord` to match your actual entity type
4. Run the job:

```javascript
var options = CleanupJobOptions.make({
  batchSize: 500,
  olderThanDays: 90,
  softDelete: true,
});

var job = CleanupJob.make({}).create();
job.start(options);
```

## Customization

### Change the Entity Type

Replace `OldRecord` with your actual entity type:

1. In `CleanupJobBatch.c3typ`, change `records: [OldRecord]` to `records: [YourEntity]`
2. In `CleanupJob.js`, replace all `OldRecord` references with `YourEntity`

### Add Custom Filtering

Use the `additionalFilter` option:

```javascript
var options = CleanupJobOptions.make({
  batchSize: 500,
  olderThanDays: 90,
  additionalFilter: "status == 'INACTIVE'",
});
```

### Change Date Field

By default, the job uses `meta.created`. To use a different date field:

In `CleanupJob.js`, change:

```javascript
var filter = Filter.lt('meta.created', cutoffDate);
```

to:

```javascript
var filter = Filter.lt('yourDateField', cutoffDate);
```

## Monitoring

Check job status:

```javascript
var job = CleanupJob.forId(jobId).get('this, run.status.status');
if (job.run) {
  console.log('Status: ' + job.run.status.status);
}
```

View summary after completion:

```javascript
var summary = CleanupJobSummary.fetch({
  filter: Filter.eq('jobId', jobId),
  limit: 1,
}).objs[0];
```
