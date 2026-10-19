---
name: c3-schema-migration
description: |
  Write and manage C3 AI schema migrations for database evolution. Covers SchemaUpgrade, SchemaMigrationCommon DDL utilities, migration naming conventions, versioning, and app rebuild.
core: true
category: platform
version: 8.9.0
minimumVersion: 8.7.0
---

# C3 AI Schema Migration

Schema migrations evolve the database schema as types change. C3 provides two migration mechanisms:

- **SchemaUpgrade** -- app-level migrations, run at end of app deployment
- **PlatformSchemaMigration** -- platform-level migrations, run per-app after platform schema update

Both share utilities from `SchemaMigrationCommon`.

## Quick Reference

| Operation                 | Code                                                      |
| ------------------------- | --------------------------------------------------------- |
| Check migration status    | `app.schemaUpgradeStatus()`                               |
| Current migration version | `SchemaUpgrade.currentVersion()`                          |
| Reset migration version   | `SchemaUpgrade.resetVersion(version)`                     |
| Check table exists        | `SchemaMigrationCommon.tableExists(tableName)`            |
| Check column exists       | `SchemaMigrationCommon.columnExists(tableName, colName)`  |
| Trigger app rebuild       | `App.rebuild(AppRebuildSpec.make({ storedCalcs: true }))` |

## Writing Migrations

### Naming Convention

Migration functions must follow the pattern `somethingMeaningful_N` where `N` starts at 1 and increments without gaps:

```c3typ
type MySchemaUpgrade mixes SchemaUpgrade {
  addUserEmailColumn_1: function() js-server
  migrateUserNames_2: function() js-server
  addIndexOnEmail_3: function() js-server
}
```

```javascript
// MySchemaUpgrade.js
function addUserEmailColumn_1() {
  SchemaMigrationCommon.addVarcharColumn('c3_myapp_user', 'email', 255);
}

function migrateUserNames_2() {
  SchemaMigrationCommon.mergeColumn('c3_myapp_user', 'first_name_l', 'full_name_l');
}

function addIndexOnEmail_3() {
  if (!SchemaMigrationCommon.columnExists('c3_myapp_user', 'email')) return;
  // index creation logic
}
```

**Critical rules:**

- All migration functions **MUST be idempotent** -- they may run multiple times
- Numbers must be sequential starting from 1, no gaps
- Private functions are ignored for version counting
- Functions execute in order of suffix number

### Platform Migrations

For platform-internal schema changes (applied to every app):

```javascript
// PlatformSchemaMigration.js
function mailContentFieldLongStringToClob_1() {
  SchemaMigrationCommon.mergeColumn('c3_2_email_mail', 'content_l', 'content_c');
}
```

## DDL Utilities (SchemaMigrationCommon)

### Schema Inspection

```javascript
SchemaMigrationCommon.tableExists('c3_myapp_user');
SchemaMigrationCommon.columnExists('c3_myapp_user', 'email');
```

### Add Columns

```javascript
SchemaMigrationCommon.addVarcharColumn(tableName, colName, length);
// Also accepts: onlyIfMissing (boolean, default false)
SchemaMigrationCommon.addClobColumn(tableName, colName, onlyIfMissing);
SchemaMigrationCommon.addNumericColumn(tableName, colName, scale, precision, onlyIfMissing);
// scale is required; precision defaults to 0; onlyIfMissing defaults to false
SchemaMigrationCommon.addTimestampColumn(tableName, colName, onlyIfMissing);
SchemaMigrationCommon.addXmlColumn(tableName, colName, onlyIfMissing);
```

### Modify Columns

```javascript
// Convert varchar to CLOB
SchemaMigrationCommon.convertColumnToClob(tableName, colName);

// Rename column
SchemaMigrationCommon.renameColumn(tableName, colName, newColName);

// Merge column data (copy colName -> newColName, drop colName)
SchemaMigrationCommon.mergeColumn(tableName, colName, newColName);

// Drop column
SchemaMigrationCommon.dropColumn(tableName, colName);
```

### Data Operations

```javascript
// Delete rows matching SQL condition
SchemaMigrationCommon.deleteTableRows(tableName, sqlCondition);
```

> **WARNING — `resetSchema` excluded:** `SchemaMigrationCommon.resetSchema(typeName)` exists but is intentionally omitted from these instructions. It performs a DROP and recreate which **permanently destroys all data** for the type, does not support a `confirm` flag, and should only be used by experienced engineers who fully understand the consequences. Never call it in automated or agent-driven workflows.

### Type Hierarchy Migrations

When types move between hierarchies:

```javascript
// Insert a new base type into an extension hierarchy
SchemaMigrationCommon.insertNewBaseType(
  oldBaseTypeName, // current base type name
  oldRootTableName, // root DB table name for old base
  oldTypeKey, // type key of the old base
  newBaseTypeName, // new base type to insert
  removeOldData // whether to remove old data
);

// Copy data when a type moves hierarchies
SchemaMigrationCommon.copyFromOldSchemaToExtendableType(
  oldRootSchemaName, // old root schema/table name
  type, // Type being migrated
  oldRootTypeKey, // type key under old schema (nullable)
  spec // CopyFromOldSchemaToExtendableTypeSpec
);

// Update typeIdent after hierarchy move
SchemaMigrationCommon.moveExtendedType(movedType, oldBaseType);
```

### Field Type Migrations

```javascript
SchemaMigrationCommon.migrateDurationFields(type);
SchemaMigrationCommon.migrateDurationField(type, fieldPath);
SchemaMigrationCommon.migrateVectorFields(type);
```

### Reference Updates

```javascript
// Update references after renaming IDs
SchemaMigrationCommon.updateReferences(type, valueMapping);
SchemaMigrationCommon.updateIds(type, valueMapping, ignoreIfAlreadyExists);

// Batch IDs for large-scale processing
SchemaMigrationCommon.batchIds(tableName, suggestedNumBatches, batchSize, filter);
```

### Job Scheduling (during provisioning)

```javascript
SchemaMigrationCommon.scheduleBatchJob(job, options);
SchemaMigrationCommon.scheduleMapReduce(job, options);
SchemaMigrationCommon.scheduleWorkflow(workflow, options);
```

## Migration Version Tracking

The `SchemaMigrationVersion` entity (private) tracks which migrations have been applied:

```javascript
SchemaUpgrade.currentVersion();
SchemaUpgrade.resetVersion(version); // DANGER -- recovery only
```

## Checking Migration Status

```javascript
var status = app.schemaUpgradeStatus();
status.isCompleted; // true when all migrations done
status.errors; // any migration errors
status.migrations; // per-type migration status
// Each migration: { typeName, nextMigration, numRemaining, error }
```

## SchemaUpgrade.Config

| Config                 | Type      | Default | Description                                 |
| ---------------------- | --------- | ------- | ------------------------------------------- |
| `dbLockTimeoutMinutes` | `int`     | `20`    | Timeout for DB lock during upgrade          |
| `disabled`             | `boolean` | `false` | EMERGENCY ONLY: disable all schema upgrades |

## App Rebuild

After schema changes, apps may need a rebuild to recompute derived data:

```javascript
var status = App.rebuild(
  AppRebuildSpec.make({
    storedCalcs: true,
    hierarchies: true,
    acls: true,
  })
);

App.rebuildStatus(true); // detailed=true
App.cancelRebuild();
```

### AppRebuildSpec Flags

| Flag                      | Description                                |
| ------------------------- | ------------------------------------------ |
| `createdOrUpdated`        | Replay creation/update callbacks           |
| `storedCalcs`             | Recompute stored calc fields               |
| `hierarchies`             | Rebuild hierarchy denormalization          |
| `acls`                    | Rebuild access control lists               |
| `partitionableCompaction` | Compact partitionable data                 |
| `normalizedTimeseries`    | Renormalize timeseries                     |
| `metricDeps`              | Rebuild metric dependencies                |
| `analytics`               | Rebuild analytics                          |
| `metrics`                 | Rebuild metrics                            |
| `initialLoad`             | Remove all MetricDependency before rebuild |
| `dontAllowDataIssues`     | Fail on issues instead of logging          |

Each flag has corresponding `*BatchSize` and `*SubBatchSize` parameters for tuning.

### Rebuild Status Values

`AppRebuildStatusValues` enum: `pending`, `running`, `completed`, `skipped`, `canceled`, `failed`

## Best Practices

- **Always make migrations idempotent** -- check `tableExists`/`columnExists` before DDL
- **Never skip migration numbers** -- `_1`, `_2`, `_3` must be sequential
- **Use `mergeColumn`** instead of manual column copy + drop
- **Test migrations locally** before deploying -- failed migrations block app startup
- **Avoid `resetSchema`** -- it permanently destroys ALL data for that type with no confirmation; see the WARNING above under Data Operations
- Set `dontAllowDataIssues: true` in rebuild spec during development
- App rebuild requires at least 2 compute threads

## Common Anti-Patterns

1. **Non-idempotent migrations** -- adding a column without checking `columnExists` first
2. **Gaps in numbering** -- `_1`, `_3` (skipping `_2`) will fail
3. **Large data migrations in DDL** -- use `scheduleBatchJob` for heavy operations
4. **Disabling SchemaUpgrade in production** -- `disabled: true` is for emergencies only
5. **Not checking `schemaUpgradeStatus`** after deployment -- errors may be silent
