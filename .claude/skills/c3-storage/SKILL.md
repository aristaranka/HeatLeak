---
name: c3-storage
description: |
  Work with C3 AI storage systems: KV stores, DataLake (Iceberg) tables, and cross-app data sharing. Use when the user mentions KvStore, @db(datastore='kv'), Partitionable, partition keys, CCK, Cassandra Composite Keys, hot/cold buckets, compaction, fillBuckets, time-series data storage, DataLake, Iceberg tables, DataLake.Table, DataLake.Catalog, CSV import/export, MergeActions, table snapshots, time-travel, Db.Domain, cross-app data sharing, allowAccess, callAppInLocalJvm, or ModelRegistry. Covers defining KV-backed entity types, configuring KV backends (Cassandra, SqlKvStore, FileSystem, DynamoDB, Bigtable), low-level KV operations, partition inspection, compaction workflows, creating and managing DataLake tables, reading/writing data, merge/upsert operations, table maintenance, catalog configuration, cross-app data sharing via Db.Domain, authorization, and ML model sharing across clusters.
core: true
category: platform
version: 8.9.0
minimumVersion: 8.7.0
---

# C3 AI Storage

This skill covers the three core storage and data-sharing subsystems of the C3 AI Platform:

1. **KV Store** — High-throughput key-value persistence for time-series and write-heavy workloads
2. **DataLake (Iceberg)** — Analytics-oriented tabular storage with schema evolution, snapshots, and ACID merges
3. **Data Sharing** — Cross-application data access via `Db.Domain`

## Reference Dispatch

| Task                                                  | Reference File                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Define KV-backed entity types (`@db(datastore='kv')`) | [references/kvstore/kvstore.md](references/kvstore/kvstore.md)                     |
| Configure partitioning, CCK, hot/cold buckets         | [references/kvstore/kvstore.md](references/kvstore/kvstore.md)                     |
| Low-level KV operations (put, get, scan, batch)       | [references/kvstore/kvstore.md](references/kvstore/kvstore.md)                     |
| Fill buckets, compaction, partition inspection        | [references/kvstore/kvstore.md](references/kvstore/kvstore.md)                     |
| KV store configuration and backends                   | [references/kvstore/kvstore.md](references/kvstore/kvstore.md)                     |
| Create or manage DataLake (Iceberg) tables            | [references/datalake/datalake.md](references/datalake/datalake.md)                 |
| Import/export CSV to DataLake tables                  | [references/datalake/datalake.md](references/datalake/datalake.md)                 |
| Read data (Arrow, pandas, tuples) from DataLake       | [references/datalake/datalake.md](references/datalake/datalake.md)                 |
| Merge/upsert operations with MergeActions             | [references/datalake/datalake.md](references/datalake/datalake.md)                 |
| Table maintenance (snapshots, compact, orphans)       | [references/datalake/datalake.md](references/datalake/datalake.md)                 |
| Catalog configuration (JDBC, Hadoop)                  | [references/datalake/datalake.md](references/datalake/datalake.md)                 |
| Cross-app data sharing via Db.Domain                  | [references/data-sharing/data-sharing.md](references/data-sharing/data-sharing.md) |
| Configure producer/consumer apps                      | [references/data-sharing/data-sharing.md](references/data-sharing/data-sharing.md) |
| Grant access with allowAccess and roles               | [references/data-sharing/data-sharing.md](references/data-sharing/data-sharing.md) |
| callAppInLocalJvm performance optimization            | [references/data-sharing/data-sharing.md](references/data-sharing/data-sharing.md) |
| Cross-cluster ML model sharing (ModelRegistry)        | [references/data-sharing/data-sharing.md](references/data-sharing/data-sharing.md) |

## Quick Decision Table

| You want to…                                          | Use                              |
| ----------------------------------------------------- | -------------------------------- |
| Store high-volume time-series or write-heavy data     | KV Store (`@db(datastore='kv')`) |
| Run analytics queries on large tabular datasets       | DataLake (Iceberg) tables        |
| Import/export CSV or Parquet data for analysis        | DataLake tables                  |
| Share entity data between C3 apps on the same cluster | Db.Domain (Data Sharing)         |
| Share ML models across clusters                       | ModelRegistry (Data Sharing)     |
| Persist standard relational entities                  | Default SQL (not covered here)   |
