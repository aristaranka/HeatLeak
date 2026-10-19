# C3 AI Key-Value Store

The C3 AI KvStore is the persistence layer that stores data in key-value format. It is one of the two primary data stores (the other is JDBC). KvStore provides high-throughput storage optimized for time-series and write-heavy workloads and should be treated as **append-only**.

Entity types annotated with `@db(datastore='kv')` are persisted in KV storage instead of the relational database. Data is stored across **partitions** (groups of rows). Each partition is made of one or more `KvRow`s; each `KvRow` contains multiple `KvCol`s. Partitions also store objects in **buckets** (hot/cold for packing).

**Storage formats:**

- **Single-Row:** All data in a partition is stored in a single `KvRow`.
- **Multi-Row (Cassandra Composite Keys, CCK):** Data in a partition is spread across multiple `KvRow`s (parent row + `nr` rows for unpacked data, `bin` rows for packed data).

## Quick Reference

| Operation                      | How                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Define KV-backed entity        | `@db(datastore='kv') entity type MyData { ... }`                                                              |
| Use partitioning               | `@db(datastore='kv', partitionKeyField='parent') entity type MyData mixes Partitionable<string> { ... }`      |
| Get default KV store           | `KvStore.inst()` (inherited from `DefaultInstance`)                                                           |
| Create in-memory store         | `KvStore.inMemory(caps)` (returns `!InMemoryKvStore`)                                                         |
| Create from config             | `KvStore.fromConfig(config)`                                                                                  |
| Low-level put                  | `kvStore.put(tableName, id, updatedColumns, removedColumns, spec)`                                            |
| Low-level get                  | `kvStore.get(tableName, id, spec)`                                                                            |
| Low-level scan                 | `kvStore.scan(tableName, scanSpec)`                                                                           |
| Store binary content           | `kvStore.getContent(tableName, id, colName)`                                                                  |
| Fill buckets (pack)            | `Partitionable.fillBucketsFromInst(instance)`                                                                 |
| Compaction (hot→cold)          | `Partitionable.compactFromInst(instance)`                                                                     |
| Compaction cron                | PartitionableCompactor MapReduce; runs 1st of each month per KV partitionable type when cron queue is enabled |
| Query rule                     | When `partitionKeyField` is set, filter by partition key first                                                |
| Inspect partition / compaction | `kvStore.get(tableName, id)`; check `nc_` vs `z_` cols (non-CCK) or NR vs bin rows (CCK)                      |
| Bucket metadata                | `kvStore.deserialize(instance, "c__state")` → `buckets` (non-CCK) or `bins` (CCK)                             |
| Cold storage file count        | `FileSystem.countFiles(Type.coldDataEndpoint(partitionId))`                                                   |

## @db Annotation for KV Types

When defining entity types for KV storage, use `@db` annotation fields:

| Annotation Field           | Type      | Description                                                                                                                                                                                                                                                                                                      |
| -------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `datastore`                | `string`  | Set to `'kv'` for KV-backed types. **Defaults:** Single-node (SNE) → SQL KV store (H2 or Postgres); shared env or shared DB → Cassandra. Other options: `'fs'` (file-system KV, blob storage), or backend-specific (DynamoDB, Bigtable).                                                                         |
| `partitionKeyField`        | `string`  | Field name used as partition key. All data with the same value are in the same partition. If omitted, partitioning is ID-based (one partition per ID).                                                                                                                                                           |
| `partitionKeyBin`          | `Expr`    | Expression for splitting data within a partition into multiple KvRows (Cassandra Composite Keys). Objects with the same `partitionKeyBin` value in a partition go to the same bin.                                                                                                                               |
| `persistenceOrder`         | `string`  | Sort order within partition (e.g., `'start'`).                                                                                                                                                                                                                                                                   |
| `defaultPartitionStrategy` | `object`  | Options for buckets and compaction. Only one of `maxHotSortKey` or `numHotBuckets` should be used. Fields: `maxHotSortKey` (expr: when data moves to cold, e.g. `"start < (now() - period(6, 'MONTH'))"`), `numHotBuckets` (max hot buckets; excess moved to cold), `numObjsPerHotBucket`, `sizeMbPerHotBucket`. |
| `persistDuplicates`        | `boolean` | Keep duplicate rows                                                                                                                                                                                                                                                                                              |
| `compactType`              | `boolean` | Omit `meta` field from persistence (smaller storage)                                                                                                                                                                                                                                                             |
| `systemType`               | `boolean` | Owned by server framework                                                                                                                                                                                                                                                                                        |
| `writeOnce`                | `boolean` | Immutable after first write                                                                                                                                                                                                                                                                                      |
| `createOnly`               | `boolean` | No updates, only create and remove                                                                                                                                                                                                                                                                               |

## Defining KV-Backed Entity Types

### Simple KV Entity

```c3typ
@db(datastore='kv')
entity type MyKvData {
  key: !string
  value: any
  timestamp: datetime
}
```

### Partitioned KV Entity

```c3typ
@db(datastore='kv', partitionKeyField='parent', persistenceOrder='start')
entity type SensorReading mixes Partitionable<string> {
  parent: !string
  start: !datetime
  value: double
}
```

### Compact Timeseries Storage

```c3typ
@db(datastore='kv', compactType=true, partitionKeyField='parent',
    persistenceOrder='start', persistDuplicates=false)
entity type NormalizedData mixes Partitionable<string> {
  parent: !string
  start: !datetime
  end: datetime
  value: double
}
```

### Compaction (hot/cold buckets)

Use `defaultPartitionStrategy` to move older data to cold storage (e.g. blob). Prefer `maxHotSortKey`:

```c3typ
@db(datastore='kv', partitionKeyField='pk', persistenceOrder='start',
    defaultPartitionStrategy={ numObjsPerHotBucket: 10000, maxHotSortKey: "start < (now() - period(6, 'MONTH'))" })
entity type MyTypeWithCompaction {
  pk: string
  start: datetime
}
```

Alternatively, limit by number of hot buckets: `defaultPartitionStrategy={ numObjsPerHotBucket: 10000, numHotBuckets: 10 }`.

### ParentPartitionable (Convenience Mixin)

For the common pattern where `parent` is the partition key:

```c3typ
@db(datastore='kv')
entity type MyChildData mixes ParentPartitionable<MyParentType> {
  // parent: !MyParentType is auto-provided by ParentPartitionable
  childField: string
}
```

`ParentPartitionable<P>` provides `parent: !P` field and is annotated with `@db(partitionKeyField='parent')`.

## Core Types

### KvStore

Key member methods:

| Method                                                     | Returns         | Description                                                                                                                                                                 |
| ---------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get(tableName, id, spec)`                                 | `KvRow`         | Read a row (spec is `KvStoreGetSpec`)                                                                                                                                       |
| `deserialize(instance, columnId?)`                         | `KvRow`         | Deserialize partition/bin row for a type instance; optional column id (e.g. `"c__state"`) to read a specific column. Used for inspecting buckets/bins and compaction state. |
| `getBatch(tableName, ids, spec)`                           | `stream<KvRow>` | Batch read (ids is `![string]`)                                                                                                                                             |
| `scan(tableName, spec)`                                    | `stream<KvRow>` | Scan rows (spec is `KvStoreScanSpec`)                                                                                                                                       |
| `put(tableName, id, updatedColumns, removedColumns, spec)` | `!boolean`      | Write columns (`updatedColumns` is `map<string, any>`, `removedColumns` is `set<string>`)                                                                                   |
| `put(tableName, row, spec)`                                | `!boolean`      | Write a KvRow (overload)                                                                                                                                                    |
| `putBatch(tableName, batch, removedRows, spec)`            | `!boolean`      | Batch write (`batch` is `[KvStorePut]`, `removedRows` is `set<string>`)                                                                                                     |
| `remove(tableName, id)`                                    |                 | Delete a row                                                                                                                                                                |
| `removeBatch(tableName, ids)`                              |                 | Batch delete (`ids` is `![string]`)                                                                                                                                         |
| `removeColumns(table, id, columns)`                        | `!boolean`      | Remove specific columns                                                                                                                                                     |
| `getContent(tableName, id, columnName)`                    | `KvContent`     | Get binary content handle                                                                                                                                                   |
| `copyRow(srcTableId, destTableId)`                         | `!boolean`      | Copy row (both are `!Pair<string, string>` of tableName+rowId)                                                                                                              |
| `tableName(typeRef)`                                       | `!string`       | Get KV table name for a C3 type (`typeRef` is `!Type`)                                                                                                                      |
| `deleteCollection(tableName, confirm)`                     |                 | Drop entire table (`confirm` is `!boolean`)                                                                                                                                 |
| `upsertCollection(tableName)`                              |                 | Synchronize schema                                                                                                                                                          |
| `clearCollection(tableName)`                               |                 | Remove all entries                                                                                                                                                          |

Key static functions:

| Method                       | Returns            | Description                                              |
| ---------------------------- | ------------------ | -------------------------------------------------------- |
| `KvStore.inst()`             | `KvStore`          | Get default KV store (from `DefaultInstance` mixin)      |
| `KvStore.inMemory(caps)`     | `!InMemoryKvStore` | Create in-memory store (`caps` is `KvStoreCapabilities`) |
| `KvStore.fromConfig(config)` | `KvStore`          | Create from config                                       |

### KvRow (mixes KvRowMeta)

| Field / Method | Type               | Description                                 |
| -------------- | ------------------ | ------------------------------------------- |
| `id`           | `!string`          | Row identifier                              |
| `cols`         | `[KvCol]`          | Column name/value pairs (field, not method) |
| `col(name)`    | `any`              | Get column value by name (inline member)    |
| `colsByName()` | `map<string, any>` | All columns as map (inline member)          |

Inherited from `KvRowMeta`: `tableName: !string`, `rowId: !string`, `store: !KvStore`.

Static factory: `KvRow.fromIdAndColsByName(id, colsByName)`.

### KvCol

| Field   | Type      | Description  |
| ------- | --------- | ------------ |
| `name`  | `!string` | Column name  |
| `value` | `any`     | Column value |

### KvContent (abstract, mixes KvRowMeta, Content)

Binary content stored in KV. Access via `kvStore.getContent(tableName, id, colName)`. Methods inherited from `Content` mixin for reading/writing binary data.

Key fields: `colName: !string`, plus inherited `Content` methods for binary I/O.

### KvStoreScanSpec (mixes KvStoreGetSpec)

| Field       | Type  | Default | Description                            |
| ----------- | ----- | ------- | -------------------------------------- |
| `offset`    | `int` | 0       | Offset for paged reads                 |
| `limit`     | `int` | -1      | Max elements to scan (-1 for no limit) |
| `batchSize` |       | 10      | Batch size (overridden from parent)    |

Inherited from `KvStoreGetSpec`: `include`, `filter`, `explain`.

### KvStorePut (mixes KvStorePutSpec)

| Field            | Type               | Description                            |
| ---------------- | ------------------ | -------------------------------------- |
| `id`             | `!string`          | Row id                                 |
| `updatedColumns` | `map<string, any>` | Columns to write (columnName -> value) |
| `removedColumns` | `set<string>`      | Columns to remove                      |

## Low-Level KV Operations

### Put and Get

```javascript
var kvStore = KvStore.inst();
var tableName = kvStore.tableName(MyKvType);

// Put with column map
kvStore.put(tableName, 'row-1', { name: 'Sensor A', reading: 42.5 }, null, null);

// Get
var row = kvStore.get(tableName, 'row-1', null);
var name = row.col('name');
var allCols = row.colsByName();
```

### Batch Operations

```javascript
var puts = [
  KvStorePut.make({ id: 'row-1', updatedColumns: { val: 1 } }),
  KvStorePut.make({ id: 'row-2', updatedColumns: { val: 2 } }),
];
kvStore.putBatch(tableName, puts, null, null);

var rows = kvStore.getBatch(tableName, ['row-1', 'row-2'], null);
```

### Scan

```javascript
var rowStream = kvStore.scan(
  tableName,
  KvStoreScanSpec.make({
    offset: 0,
    limit: 1000,
  })
);
```

### Binary Content

```javascript
var content = kvStore.getContent(tableName, 'row-1', KvStore.DEFAULT_COL_NAME);
// Use Content mixin methods for binary I/O
```

## High-Level Entity Operations

Most applications use the standard C3 entity API — the platform handles KV persistence automatically:

```javascript
// Create/upsert (persisted to KV)
SensorReading.make({
  parent: 'sensor-001',
  start: DateTime.now(),
  value: 42.5,
}).upsert();

// Fetch with filter (uses KV partition key)
var readings = SensorReading.fetch({
  filter: Filter.eq('parent', 'sensor-001'),
  limit: 100,
});

// Batch operations
SensorReading.upsertBatch(readings);

// Remove
SensorReading.removeAll(
  RemoveAllSpec.make({
    filter: Filter.eq('parent', 'sensor-001'),
  }),
  true
);
```

### Query and filter rules

When `partitionKeyField` is specified, **queries must filter by the partition key first**. Additional filters are allowed only if a partition-key filter is present. Querying by other fields (e.g. only by `start`) without the partition key is not supported and will fail. When partitioning is ID-based (no `partitionKeyField`), filtering by partition key is not required.

## C3 AI Packing (fill buckets and compaction)

Packing deduplicates data, sorts it into storage buckets, and can migrate data to blob storage (compaction).

- **Fill buckets:** New inserts go into columns marked `c__nc`. The packing process moves data into a `z` column that is sorted and deduplicated. Packed data improves read performance by reducing deduplication and sorting at read time. Call `Partitionable.fillBucketsFromInst(instance)` to run fill buckets for that partition.
- **Compaction:** Moves hot buckets (in the DB) to cold storage (e.g. S3). Use either:
  - **`maxHotSortKey`** (preferred): Expression for when data moves to cold (e.g. `"start < (now() - period(6, 'MONTH'))"`). Can combine with `numObjsPerHotBucket` to limit hot bucket size.
  - **`numHotBuckets`:** Maximum number of hot buckets; older ones are moved to cold.
- **Trigger:** `Partitionable.compactFromInst(instance)` runs fill buckets (if needed) and then compaction for that partition.

### Compaction cron job

A **PartitionableCompactor** MapReduce job runs automatically to perform C3 compaction across all partitions of KV partitionable types. A cron job entry is created automatically for every such type.

- **Schedule:** The compaction cron runs on the **first day of every month**.
- **Behavior:** When the cron queue is enabled, the job triggers a partitionable map-reduce that processes each partition and runs compaction using the **partitioning strategy defined on the type** (e.g. `defaultPartitionStrategy` with `maxHotSortKey` or `numHotBuckets`). No manual call to `Partitionable.compactFromInst` is required for routine monthly compaction if the cron is enabled.
- **Requirement:** The cron queue must be **enabled** for this automatic compaction to run.

## Inspecting partitions and buckets

Use the KvStore and type APIs to inspect what is stored in a partition, whether it is compacted, and how many buckets are hot vs cold. For child (measurement) types, the partition id is typically the parent entity id.

### Get the partition row and store

- **Store:** `kvStore = KvStore.inst()` (or `KvStore.forName("kv")`). In Python: `cass = c3.KvStore.inst()`.
- **Table name:** `kvStore.tableName(MyChildType)`.
- **Partition id:** For a partitioned type, the row id for the (single) partition row in non-CCK is the partition key value (e.g. parent id). Get an example id with e.g. `ParentType.fetch({ limit: 1 }).objs[0].id` or the equivalent in Python.

### Check if compacted

**Single-row (non-CCK):** Compaction moves data from `nc_` columns to `z_` columns. Get the partition row and list column names:

- `row = kvStore.get(tableName, partitionId, null)` then column names from `row.cols` (e.g. `row.cols.mapToStr(lambda x: x.name)` in Python).
- Count columns whose name contains `"nc_"`: if **> 0**, not all data is compacted yet.
- Count columns whose name contains `"z_"`: if **> 0**, there is compacted (packed) data.

**CCK (multi-row):** Compaction moves data from NR rows to bin rows. Check the **parent** row (row id `{partitionId}__internalbin__parent`):

- `row = kvStore.get(tableName, partitionId + "__internalbin__parent", null)` and get column names.
- Filter names containing `"nr"` (NR rows). For each NR row name, check whether that row has data (e.g. column count or size). If any NR row has count **> 0**, the partition is not fully packed.

### Cold storage file count

Cold (blob) storage is used when compaction is enabled (e.g. `maxHotSortKey`). Number of files in cold for a partition:

- **`Type.coldDataEndpoint(partitionId)`** — returns the endpoint/path for that partition’s cold data.
- **`FileSystem.countFiles(endpoint)`** — number of files in cold storage (e.g. `c3.FileSystem.countFiles(msmnt_type.coldDataEndpoint(id))` in Python).

### Inspect buckets (single-row, non-CCK)

The **`c__state`** column holds metadata for all buckets in the partition.

- **Deserialize state:** `state = kvStore.deserialize(instance, "c__state")` where `instance` is a partition key instance (e.g. `MyChildType.make({ parent: { id: partitionId } })`). In Python: `state = cass.deserialize(msmnt_type.make({"parent":{"id": id}}), "c__state")`.
- **Bucket list:** `buckets = state.cols[0].value[0].buckets`. Length = number of buckets.
- **Per bucket:** Each bucket has `id`, `count`, and `contentLocation`. If `contentLocation != null`, the bucket is in **cold** storage; otherwise **hot**. To get the packed data for that bucket, deserialize the column named by the bucket’s `id`: `kvStore.deserialize(instance, bucket.id).cols[0].value[0]` — same `count` and `contentLocation`.
- **Totals:** Sum `bucket.count` over state for “total according to state”; sum from each `z_` column’s bucket for “total according to bins”. Compare hot vs cold by counting buckets where `contentLocation` is null vs non-null.

### Inspect a single bucket (non-CCK)

To inspect one packed bucket by id (e.g. `z__2022-01-01T00:45:16Z__<uuid>`):

- `z_bucket = kvStore.deserialize(instance, bucketId).cols[0].value[0]` where `instance` is keyed by the partition (e.g. `MyChildType.make({ parent: { id: rowId } })`). The result has `id`, `count`, `contentLocation`.

### Inspect bins and buckets (CCK)

With CCK, the partition has a **parent** row and multiple **bin** rows. State is on the parent row and uses **bins** (not buckets).

- **State (parent row):** `state = kvStore.deserialize(MyChildType.make({ parent: { id: partitionId + "__internalbin__parent" } }), "c__state")`. Then `bins = state.cols[0].value[0].bins` — map of bin row id → list of bucket metadata.
- **Number of bin rows:** `bins.keys().size` (or `len(bins.keys().collect())` in Python).
- **Per bin row:** For each `rowId` in `bins.keys()`, `state_buckets = bins[rowId]` (list of buckets in state). Deserialize the bin row: `bin = kvStore.deserialize(MyChildType.make({ parent: { id: rowId } }))`. Column names in `bin.cols` correspond to bucket ids. For each bucket in state: `contentLocation != null` → cold; else hot. For each column in `bin.cols`, each value in `col.value` is a bucket with `id`, `count`, `contentLocation`.
- **Inspect a single bin row:** Pick a `rowId` (e.g. `partitionId__internalbin__2022-3-21`). Get `state_buckets = bins[rowId]` and `bin = kvStore.deserialize(MyChildType.make({ parent: { id: rowId } }))`. Compare column names in `bin.cols` with state bucket ids. Per-bucket counts: from state (`bucket.count`) or from `bin.cols[].value[].count`.

### Total object count (expensive)

To get the total number of persisted objects in a partition (e.g. to verify state/bucket counts): use the entity API with a partition-key filter, e.g. `MyChildType.fetchCount({ filter: Filter.eq("parent.id", partitionId) })`. On very large partitions (e.g. >100M objects) this can take 10–30 minutes.

## KV Store Configuration

### Default KV Store

Config seed file: `<pkg>/config/KvStoreConfig/default.json`:

```json
{
  "name": "kv",
  "kvstore": "Cassandra"
}
```

### InMemory (Testing)

```javascript
var store = KvStore.inMemory(KvStoreCapabilities.make({ singleNode: true }));
```

### KvStoreConfig (ClusterAdmin)

For advanced tuning, `KvStoreConfig` (on the KvStore subtype, e.g. `Cassandra.Config`) supports:

| Field                                      | Description                                                                | Default        |
| ------------------------------------------ | -------------------------------------------------------------------------- | -------------- |
| `fillBucketsProbabilityOnRead`             | Percentage of reads that trigger fill buckets (0–100)                      | 25             |
| `fillBucketsProbabilityOnWrite`            | Percentage of writes that trigger fill buckets (0–100)                     | 0.1            |
| `fillBucketsPartitionKeyPercentageOnWrite` | Percentage of partitions that get fill buckets on write (0–100)            | 100            |
| `rangeDeleteTimeDriftInSec`                | Time drift used in range deletes to limit Cassandra tombstones             | 300            |
| `multiBinningWriteTimeInterval`            | Interval for creating new object rows when using CCK (e.g. `Interval.DAY`) | `Interval.DAY` |

Access config per backend, e.g. `Cassandra.inst().config()`. Most applications do not need to change these.

## Partitioning

Partitioning groups data by a key field. All data with the same partition key is stored together, enabling efficient range scans.

### Partition Bucketing (Cassandra Composite Keys, CCK)

For very large partitions, data can be split into multiple KV rows using `partitionKeyBin`. With CCK:

- One **parent row** holds partition metadata.
- **`nr` rows** hold unpacked new data (one per time interval by default; see `multiBinningWriteTimeInterval`, e.g. `Interval.DAY`).
- **`bin` rows** hold packed data; all objects with the same `partitionKeyBin` value in a partition go to the same bin row (e.g. one bin per month).

Example with a separate bin per month:

```c3typ
@db(datastore='kv', partitionKeyField='parent',
    persistenceOrder='start',
    partitionKeyBin='concat(year(start), "-", month(start))')
entity type LargeTimeseries mixes Partitionable<string> {
  parent: !string
  start: !datetime
  value: double
}
```

Row IDs for bin rows follow the pattern `{partitionKey}__internalbin__{binValue}` (e.g. `pk2__internalbin__2023-4`). Use `KvStore.deserialize(instance)` to inspect raw columns (`nc`, `z`, etc.) and row layout.

## Best Practices

- Treat KvStore as **append-only**; design for high-throughput writes and time-series access patterns.
- Use `@db(datastore='kv')` for write-heavy, timeseries, or high-volume data that doesn't need relational queries.
- Use `partitionKeyField` to group related data — queries on the partition key are efficient; **always include a partition-key filter first** when querying partitioned types.
- Use `persistenceOrder` to define sort order within a partition for range scans.
- Use `defaultPartitionStrategy` with `maxHotSortKey` or `numHotBuckets` when you need compaction to blob storage; run `Partitionable.fillBucketsFromInst` / `Partitionable.compactFromInst` as needed (or rely on config-driven probabilities).
- Use `compactType=true` for high-volume data to reduce storage overhead.
- Use `ParentPartitionable<T>` when the parent entity is the natural partition key.
- Use the high-level entity API (fetch, upsert, remove) rather than low-level KV operations.
- Use `KvStore.inMemory()` for unit testing KV-backed types.
- Partition key design is critical — too few partitions create hot spots, too many create scatter.
- `put` uses `map<string, any>` for columns, not `[KvCol]` — KvCol is for read results.
- `getBatch` and `scan` return `stream<KvRow>`, not arrays.
- Supported backends: Cassandra (production), DynamoDB, BigTable, SqlKvStore, FileSystem (`datastore='fs'`), InMemory.

## Limitations

- KV-backed types do not support arbitrary SQL-style joins — use partition key for efficient queries
- Partition bucketing (`partitionKeyBin`) adds complexity — only use for very large partitions
- `copyRow` takes `Pair<string, string>` (tableName, rowId) — not individual string parameters
