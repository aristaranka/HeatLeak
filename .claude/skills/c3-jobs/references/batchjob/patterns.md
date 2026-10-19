# Common BatchJob Patterns

## Data Migration Pattern

**Use case:** Migrate data from one type to another, transforming fields as needed.

```c3typ
type DataMigrationJob extends BatchJob<DataMigrationJob, DataMigrationOptions, DataMigrationBatch> type key 'DATAMIG' {
  doStart: ~ js-server
  processBatch: ~ js-server
}

type DataMigrationOptions {
  batchSize: int = 100
  sourceFilter: string
  dryRun: boolean = false
}

type DataMigrationBatch {
  sourceRecords: [SourceType]
}
```

**Key characteristics:**

- Reads from source type, writes to target type
- Use `dryRun` flag for validation before actual migration
- Transform data in `processBatch`

---

## Bulk Update Pattern

**Use case:** Update many records with the same or computed values.

```c3typ
type BulkUpdateJob extends BatchJob<BulkUpdateJob, BulkUpdateOptions, BulkUpdateBatch> type key 'BULKUPD' {
  doStart: ~ js-server
  processBatch: ~ js-server
}

type BulkUpdateOptions {
  batchSize: int = 200
  targetFilter: string
  updateFields: json
}

type BulkUpdateBatch {
  records: [TargetType]
}
```

**Key characteristics:**

- Fetches filtered dataset in `doStart`
- Applies updates in `processBatch` using `mergeBatch()`
- Use `updateFields` json to make job reusable

---

## ETL Pipeline Pattern

**Use case:** Extract, transform, and load data with complex business logic.

```c3typ
type ETLJob extends BatchJob<ETLJob, ETLOptions, ETLBatch> type key 'ETL' {
  doStart: ~ js-server
  processBatch: ~ js-server
  allComplete: ~ js-server
}

type ETLOptions {
  batchSize: int = 100
  sourceType: string
  transformRules: json
  enableValidation: boolean = true
}

type ETLBatch {
  sourceData: [SourceEntity]
  metadata: json
}
```

**Key characteristics:**

- Extract in `doStart` with filtering/pagination
- Transform in `processBatch` with business rules
- Load/validate in `processBatch`, summarize in `allComplete`

---

## Cleanup/Archive Pattern

**Use case:** Remove or archive old records based on date/status criteria.

```c3typ
type CleanupJob extends BatchJob<CleanupJob, CleanupOptions, CleanupBatch> type key 'CLEANUP' {
  doStart: ~ js-server
  processBatch: ~ js-server
  allComplete: ~ js-server
}

type CleanupOptions {
  batchSize: int = 500
  olderThanDays: int = 90
  targetStatus: string
  softDelete: boolean = true
}

type CleanupBatch {
  records: [TargetEntity]
}
```

**Key characteristics:**

- Date-based filtering in `doStart`
- Soft delete (status update) or hard delete in `processBatch`
- Summary statistics in `allComplete`

---

## External Sync Pattern

**Use case:** Sync data with external systems in batches to respect rate limits.

```c3typ
type ExternalSyncJob extends BatchJob<ExternalSyncJob, SyncOptions, SyncBatch> type key 'EXTSYNC' {
  doStart: ~ js-server
  processBatch: ~ js-server
}

type SyncOptions {
  batchSize: int = 50  // Respect API rate limits
  syncDirection: string enum('INBOUND', 'OUTBOUND')
  externalSystemId: string
  retryOnFailure: boolean = true
}

type SyncBatch {
  records: [SyncableEntity]
  syncMetadata: json
}
```

**Key characteristics:**

- Smaller batch sizes to respect external API limits
- Error handling and retry logic in `processBatch`
- Track sync status/timestamps on each record

---

## Aggregation/Reporting Pattern

**Use case:** Calculate aggregates across large datasets and store results.

```c3typ
type AggregationJob extends BatchJob<AggregationJob, AggregationOptions, AggregationBatch> type key 'AGG' {
  doStart: ~ js-server
  processBatch: ~ js-server
  allComplete: ~ js-server
}

type AggregationOptions {
  batchSize: int = 1000
  groupByField: string
  aggregationFunctions: [string]
  targetDateRange: DateTimeRange
}

type AggregationBatch {
  records: [DataEntity]
  partialResults: json
}
```

**Key characteristics:**

- Compute partial aggregates in `processBatch`
- Combine partial results in `allComplete`
- Store final aggregates in summary entity

---

## Pattern Selection Guide

| Use Case                      | Pattern       | Batch Size | Key Method                     |
| ----------------------------- | ------------- | ---------- | ------------------------------ |
| Transform data between types  | Migration     | 100-500    | `processBatch`                 |
| Update many records           | Bulk Update   | 200-1000   | `processBatch`                 |
| Complex multi-step processing | ETL           | 100-500    | All three                      |
| Remove old records            | Cleanup       | 500-1000   | `processBatch` + `allComplete` |
| API integration               | External Sync | 10-100     | `processBatch` with retry      |
| Calculate metrics             | Aggregation   | 1000-5000  | `allComplete`                  |
