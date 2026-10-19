# C3 AI DataLake

The C3 AI DataLake provides an Iceberg-based analytics data layer for working with large-scale tabular data. Tables are managed through catalogs, support schema evolution, time-travel via snapshots, and ACID merge operations.

## Quick Reference

| Operation               | How                                                                  |
| ----------------------- | -------------------------------------------------------------------- |
| List catalogs           | `DataLake.listCatalogs()`                                            |
| Get catalog by name     | `DataLake.getCatalog('default')`                                     |
| Get default catalog     | `DataLake.Catalog.inst()`                                            |
| Create catalog          | `DataLake.createCatalog(name, kind, customProperties)`               |
| Create table            | `catalog.createTable(createTableSpec)`                               |
| List tables             | `catalog.tables(tableSpec)`                                          |
| Get table by name       | `catalog.table(name)`                                                |
| Get table directly      | `DataLake.getTable(catalog, namespace, tableName, includeSnapshots)` |
| Import CSV              | `table.importCsv(fileUrl, mode, csvParsingSpec)`                     |
| Export CSV              | `table.exportCsv(exportCsvSpec)`                                     |
| Read as Arrow           | `table.readArrowIterator(filter, projections, batchSize)`            |
| Upsert objects          | `table.upsertBatch(objStream, mode)`                                 |
| Delete table            | `catalog.deleteTable(name, namespace, confirm)`                      |
| Expire snapshots        | `table.expireSnapshots(spec)`                                        |
| Write from source files | `DataLake.Operations.writeToDataLake(sources, table, spec)`          |
| Compact files           | `DataLake.Operations.rewriteDataFiles(table, spec)`                  |

## Architecture

```
DataLake (static utility type)
  listCatalogs(), getCatalog(), createCatalog(), deleteCatalog(), getTable()

DataLake.Catalog<T, C> (abstract, mixes Configurable<C>, Named, DefaultInstance)
  └── DataLake.Catalog.Iceberg
      ├── DataLake.Catalog.Iceberg.Jdbc (JDBC-backed catalog)
      └── DataLake.Catalog.Iceberg.Hadoop (Hadoop-backed catalog)

DataLake.Table (value type with abstract member functions)
  └── DataLake.Table.Managed<S> (abstract extendable entity, mixes AclEnabled)
      └── DataLake.Table.Managed.Iceberg (concrete entity, type key 'IBG')

DataLake.Table.Snapshot (abstract)
  └── DataLake.Table.Snapshot.Iceberg
```

## Core Types

### DataLake (Static Utility)

Top-level static functions for catalog management:

| Method                                                               | Returns              | Description                                            |
| -------------------------------------------------------------------- | -------------------- | ------------------------------------------------------ |
| `DataLake.listCatalogs()`                                            | `[DataLake.Catalog]` | List all registered catalogs                           |
| `DataLake.getCatalog(name)`                                          | `DataLake.Catalog`   | Get catalog by name                                    |
| `DataLake.createCatalog(name, kind, customProperties)`               | `DataLake.Catalog`   | Create new catalog (`kind` is `DataLake.Catalog.Kind`) |
| `DataLake.deleteCatalog(name)`                                       |                      | Delete a catalog                                       |
| `DataLake.getTable(catalog, namespace, tableName, includeSnapshots)` | `DataLake.Table`     | Get table directly                                     |

### DataLake.Catalog

Abstract catalog for managing tables. Use `DataLake.Catalog.inst()` for the default catalog.

Key member methods:

| Method                                                 | Returns                    | Description                                         |
| ------------------------------------------------------ | -------------------------- | --------------------------------------------------- |
| `catalog.createTable(spec)`                            | `DataLake.Table.Managed`   | Create a new table                                  |
| `catalog.deleteTable(name, namespace, confirm)`        |                            | Delete a table                                      |
| `catalog.table(name, spec, failIfMissing)`             | `DataLake.Table.Managed`   | Lookup table (spec is `DataLake.Catalog.TableSpec`) |
| `catalog.tables(spec)`                                 | `[DataLake.Table.Managed]` | List tables                                         |
| `catalog.transferTableOwnership(name, newOwner, spec)` | `DataLake.Table.Managed`   | Transfer ownership                                  |

Catalog kinds: `JDBC` (production, persistent metadata), `HADOOP` (file-based metadata).

### DataLake.Table (value type)

Base table type with core data operations. Key fields:

| Field             | Type                        | Description           |
| ----------------- | --------------------------- | --------------------- |
| `catalog`         | `!string`                   | Catalog name          |
| `namespace`       | `!string`                   | Table namespace       |
| `name`            | `!string`                   | Table name            |
| `description`     | `string`                    | Table description     |
| `dataSchema`      | `!TupleType`                | Table schema          |
| `partitionSpec`   | `[string serialized Expr]`  | Partition expressions |
| `snapshots`       | `[DataLake.Table.Snapshot]` | Table versions        |
| `currentSnapshot` | `DataLake.Table.Snapshot`   | Latest version        |

Key member methods:

| Method                                              | Returns                           | Description                                                                                  |
| --------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| `readArrowIterator(filter, projections, batchSize)` | `ArrowIterator`                   | Read data as Arrow batches (`batchSize` is `!int32`)                                         |
| `readPartitions(filter, projections, batchSize)`    | `ArrowIterator`                   | Read partition data                                                                          |
| `readAsTuples(limit, snapshot)`                     | `stream<Tuple>`                   | Read as tuples for UI                                                                        |
| `importCsv(file, mode, spec)`                       |                                   | Import CSV (`file` is `!FileUrl`, `mode` defaults to `APPEND`, `spec` is `CsvParsingSpec`)   |
| `importCsvJob(file, mode, spec)`                    | `DataLake.Table.ImportJob`        | Async CSV import                                                                             |
| `exportCsv(spec)`                                   | `!FileUrl`                        | Export CSV (spec is `DataLake.Table.ExportCsvSpec`)                                          |
| `upsertBatch(objs, mode)`                           |                                   | Write objects/tuples (`objs` is `stream<Obj> or stream<Tuple>`, `mode` defaults to `APPEND`) |
| `dataFiles()`                                       | `stream<DataLake.Table.DataFile>` | List data files                                                                              |
| `baseUrl()`                                         | `!Url`                            | Table data location                                                                          |
| `expireSnapshots(spec)`                             |                                   | Expire old snapshots                                                                         |
| `moveToCatalog(targetCatalog, confirm)`             |                                   | Move to another catalog                                                                      |

### DataLake.Table.Managed.Iceberg (entity)

Concrete managed Iceberg table. Adds `tableName: !string` and `read_pandas(): native` (Python).

### DataLake.Table.ImportMode (enum)

| Value       | Description                   |
| ----------- | ----------------------------- |
| `APPEND`    | Add new rows (default)        |
| `OVERWRITE` | Replace all rows              |
| `MERGE`     | Upsert based on match columns |

### DataLake.Table.WriteSpec

| Field  | Type                        | Default  | Description                        |
| ------ | --------------------------- | -------- | ---------------------------------- |
| `mode` | `DataLake.Table.ImportMode` | `APPEND` | Write mode                         |
| `on`   | `[string]`                  |          | Match columns (required for MERGE) |
| `how`  | `MergeActions`              |          | Merge behavior                     |

### DataLake.CreateTableSpec

| Field                  | Type                       | Description           |
| ---------------------- | -------------------------- | --------------------- |
| `name`                 | `!string`                  | Table name            |
| `schema`               | `!TupleType`               | Table schema          |
| `partitionExpressions` | `[string serialized Expr]` | Partition expressions |
| `namespace`            | `string`                   | Table namespace       |
| `metaFields`           | `map<string, string>`      | Metadata fields       |

Static factory: `DataLake.CreateTableSpec.fromSource(typeName)` — infer schema from a type name string.

### DataLake.Table.Snapshot

Base snapshot type. Key fields: `snapshotId: !string`, `created: datetime`, `dataSchema`, `rowCount`, `dataSize`.

`DataLake.Table.Snapshot.Iceberg` adds `parent: string`.

## MergeActions (Upsert/CDC Pattern)

For complex merge operations, use `MergeActions` with `MERGE` mode in `WriteSpec`:

```javascript
var mergeActions = MergeActions.inst().whenMatched().updateAll().whenNotMatched().insertAll();
```

### Conditional Merge

```javascript
var mergeActions = MergeActions.inst()
  .whenMatched('s.updated_at > t.updated_at')
  .update({ name: 's.name', value: 's.value' })
  .whenMatched()
  .delete()
  .whenNotMatched()
  .insertAll()
  .whenNotMatchedBySource()
  .delete();
```

Note: In merge conditions, source table rows are aliased as `s` and target table rows as `t` (e.g., `s.updated_at > t.updated_at`).

### MergeActions API

| Method                              | Available on                            | Description                                                    |
| ----------------------------------- | --------------------------------------- | -------------------------------------------------------------- |
| `MergeActions.inst()`               | `MergeActions`                          | Get default instance (static)                                  |
| `whenMatched(condition)`            | `MergeActions`                          | Returns `WhenMatched` (member, condition defaults to `'true'`) |
| `whenNotMatched(condition)`         | `MergeActions`                          | Returns `WhenNotMatched` (member)                              |
| `whenNotMatchedBySource(condition)` | `MergeActions`                          | Returns `WhenNotMatchedBySource` (member)                      |
| `updateAll()`                       | `WhenMatched`                           | Update all columns, returns `MergeActions` (member)            |
| `update(data)`                      | `WhenMatched`, `WhenNotMatchedBySource` | Update specific columns, returns `MergeActions` (member)       |
| `delete()`                          | `WhenMatched`, `WhenNotMatchedBySource` | Delete matched rows, returns `MergeActions` (member)           |
| `insertAll()`                       | `WhenNotMatched`                        | Insert all columns, returns `MergeActions` (member)            |
| `insert(data)`                      | `WhenNotMatched`                        | Insert specific columns, returns `MergeActions` (member)       |

## Working with Tables

### Creating Tables

```javascript
var catalog = DataLake.Catalog.inst();

var table = catalog.createTable(
  DataLake.CreateTableSpec.make({
    name: 'my_analytics_table',
    schema: TupleType.fromFieldDefs([
      { fieldName: 'id', fieldType: ValueType.STRING },
      { fieldName: 'timestamp', fieldType: ValueType.DATETIME },
      { fieldName: 'value', fieldType: ValueType.DOUBLE },
    ]),
    partitionExpressions: ['month(timestamp)'],
  })
);
```

### Importing CSV

```javascript
table.importCsv(
  'gcs://my-bucket/data.csv',
  DataLake.Table.ImportMode.APPEND,
  CsvParsingSpec.make({ delimiter: ',', header: true })
);

// Async import (returns job)
var job = table.importCsvJob('gcs://my-bucket/data.csv', DataLake.Table.ImportMode.APPEND);
```

### Exporting CSV

```javascript
var fileUrl = table.exportCsv(
  DataLake.Table.ExportCsvSpec.make({
    delimiter: ',',
    header: true,
  })
);
```

### Reading Data

```javascript
// Read with filter, column projection, and batch size
var iterator = table.readArrowIterator('value > 100', ['id', 'value'], 10000);

// Read as pandas DataFrame (Python)
var df = table.read_pandas();

// List data files
var files = table.dataFiles();
```

### Writing C3 Objects

```javascript
table.upsertBatch(myObjectStream, DataLake.Table.ImportMode.APPEND);
```

## Table Maintenance

### Expire Old Snapshots

```javascript
table.expireSnapshots(
  DataLake.Table.ExpireSnapshotSpec.make({
    retentionWindow: '30d',
    minimumSnapshots: 3,
  })
);
```

### Write from SourceFiles

```javascript
var snapshot = DataLake.Operations.writeToDataLake(
  sourceFiles,
  table,
  DataLake.Table.WriteSpec.make({ mode: DataLake.Table.ImportMode.APPEND })
);
```

### Compact Data Files

```javascript
var result = DataLake.Operations.rewriteDataFiles(
  table,
  DataLake.RewriteDataFilesSpec.make({
    strategy: DataLake.RewriteStrategy.BINPACK,
  })
);
```

Rewrite strategies: `BINPACK` (combine small files — cheapest), `SORT` (sort by columns), `ZORDER` (Z-order clustering).

### Delete Orphaned Files

```javascript
var result = DataLake.Operations.deleteOrphanedFiles(
  table,
  DataLake.DeleteOrphanedFilesSpec.make({
    olderThan: DateTime.now().adjustDay(-2),
  })
);
```

## Catalog Configuration

### JDBC Catalog (Production)

Config seed file: `<pkg>/config/DataLake.Catalog.Config.Iceberg.Jdbc/<name>.json`:

```json
{
  "name": "default",
  "warehouse": "gcs://my-bucket/warehouse",
  "uri": "jdbc:postgresql://host:5432/iceberg_catalog"
}
```

### Hadoop Catalog

Config seed file: `<pkg>/config/DataLake.Catalog.Config.Iceberg.Hadoop/<name>.json`:

```json
{
  "name": "hadoop-catalog",
  "warehouse": "/data/iceberg/warehouse"
}
```

## Best Practices

- Use `JDBC` catalog in production for reliable metadata persistence
- Use `partitionExpressions` (e.g., `['month(timestamp)']`) for large tables to improve query performance
- Use `MergeActions` with `MERGE` mode for upsert/CDC patterns instead of OVERWRITE
- Run `expireSnapshots` periodically to clean up old metadata (defaults: `minimumSnapshots=1`, `retentionWindow='5d'`)
- Run `rewriteDataFiles` with `BINPACK` strategy to compact small files
- Use `readArrowIterator` with column projection for efficient reads
- Use `importCsvJob` for large CSV imports (async, returns a job)
- Most DataLake types are `@beta` — APIs may evolve

## Limitations

- Most types are annotated `@beta`
- DataLake uses Apache Iceberg underneath — Iceberg-specific constraints apply
- `DeleteOrphanedFilesSpec.olderThan` must be at least 24 hours in the past
- Merge operations require specifying `on` columns for row matching
- Arrow iterator returns native objects — use Python/Java for processing
- `snapshotId` is a string (not numeric) in the C3 type system
