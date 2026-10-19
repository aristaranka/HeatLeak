# Execute and Schedule a Load

Use only after source, mapping, target persistence, and authorization are known. **File** collection processing is evidence-backed on all supported versions; **SQL** DataInteg processing (and **DataLake**) are **8.11+** — on 8.8 there is no SQL `process()` path at all (SQL is read-only; see the [SQL version gate](#sql-ingestion-full-load-and-incremental-cdc)), and DataLake does not exist before 8.11. API and broker execution need connector-specific verification.

## Execute one prepared load

**Inspection gate — do this before creating any pipeline or running any load/upsert.** Do not build a SourceCollection, author a Transform, or call `process`/`upsert` until you have (a) inspected the actual source data or workspace files, (b) reviewed the target/Source type definitions that already exist, and (c) confirmed the mapping is semantically aligned (right target, right identity). If the workspace already contains the file or type, inspect it directly — do not ask the user for information you can read. Skipping straight to pipeline construction is a defect.

Preflight: exact environment/app; SourceCollection, Source type, transforms, targets, and persistence mode all present; verified concrete runtime type; non-null `source`; reachable SourceSystem; input available; no conflicting active run; recorded status/target/checkpoint baselines; explicit stop conditions.

Run exactly the one named collection through its supported `process(DataIntegSpec)` path:

```javascript
SourceCollection.forName('COLLECTION_NAME').process(DataIntegSpec.make({ process: true }));
// process(spec) requires a DataIntegSpec — pass one, don't call process() bare. NEVER substitute processAll() or syncAll(null, …) to run one collection.
```

Then observe — submission/queue acceptance is **not** completion, and a green top-level status does not by itself prove target correctness:

- `SourceStatus` → child `SourceChunkStatus` → `TransformStatus` → `TargetStatus`: states, counts, `firstError`.
- Expected target IDs / counts / material field values.
- Checkpoint movement for incremental runs.

Per-file `SourceStatus` id is `<Collection>_<fileName>` (e.g. `CustomersFeed_Customers.csv`):

```javascript
SourceStatus.fetch({ filter: "startsWith(id, 'CustomersFeed_')",
  include: 'id, state, count, successful, failed, skipped, firstError', limit: 5 }).objs
```

`state` is the `SourcesState` enum; `count`/`successful`/`failed`/`skipped` are the row tallies; `firstError` is the first failure.

When reading target values back to verify them, C3 `DateTime` fields render as `{}` under JS `JSON.stringify` — inspect them by reading the field directly or with `runPyCode`, not by stringifying the object.

Stop on: missing/changed config, unexpected target, run overlap, failure/rejection, lost run identity, timeout, or status-vs-target disagreement.

### Re-run a file

DI processes each file once and re-detects it from its stored metadata: a file whose content changes (new etag) is marked changed and re-processed, and landing it under a new name gives a fresh `SourceStatus` too. (The change check excludes `lastModified` to smooth over cloud-provider differences, so re-processing follows content/etag rather than a bare timestamp touch.) Read results from the target type itself (`<Target>.fetchCount()` or a bounded `fetch`) as the source of truth; a `SourceStatus` / `TargetStatus` count can belong to an earlier run of a pipeline that has since changed or been rebuilt.

## Schedule recurring execution

Recurring execution reuses the collection's **existing `process`**; how it is triggered depends on the collection type. `processSchedule` is a `CronSchedule` — a **6-field Quartz** expression, e.g. `0 0 0 * * ?` for daily at midnight UTC (a 5-field cron like `0 0 * * *` is rejected).

### SQL / CDC collections → `startOnScheduleMode()`

Set `processMode = ON_SCHEDULE` + `processSchedule`, then call `SqlSourceCollection.forName(name).startOnScheduleMode()` and the platform creates the cron. It applies to CDC collections: it requires `cdcOrder` **or** `fullSync=true` (plus staging per version — see the [SQL version gate](#sql-ingestion-full-load-and-incremental-cdc)).

### File collections → seed a CronJob that calls `process`

Schedule recurring batch processing by seeding a `CronJob` whose action targets the collection's `process`, bound to the collection via `inputs.this` — the shape the platform's built-in `processCron` uses:

```json
// seed/CronJob/orders-feed-daily.json — targets the collection's process member
{
  "id": "cron_ordersfilesystem_ordersfeed",
  "name": "OrdersFeed nightly ingestion",
  "action":   { "typeName": "FileSourceCollection", "actionName": "process" },
  "inputs":   { "this": { "type": "FileSourceCollection", "id": "OrdersFeed" }, "spec": { "process": true } },
  "scheduleDef": { "cronExpression": "0 0 0 * * ?" }
}
```

`inputs.this` binds the job to that collection, so each fire runs `process(DataIntegSpec{process: true})` against it. (No-code alternative: set the schedule on the collection in Studio → Data Fusion.) An **API** collection uses this same pattern when it is polled on a cadence.

### CloudMessage / streaming brokers → process on arrival

A `CloudMessageSourceCollection` consumes messages as they arrive: `register()` it with its broker and start on-arrival processing with `startOnArrivalMode()` / `stopOnArrivalMode()` (processMode `ON_ARRIVAL`). For a broker that consumes messages on read (e.g. GCP Pub/Sub), enable staging (`stage`) with a staging `FileSourceCollection` so messages are captured as they're read; most other brokers checkpoint by an internal sequence number against the stream instead.

After setting up the trigger, verify its identity, active state, and effective schedule — or, for a stream, that the collection is `registered()` — then observe a later run separately. Scheduling or registration is not an immediate load, and does not establish catch-up, overlap prevention, or exactly-once recurrence.

## <a id="sql-ingestion-full-load-and-incremental-cdc"></a>SQL ingestion — full load and incremental (CDC)

Prerequisite: the source type is `entity type … mixes External, NoSystemCols, Source` (see [Ingest a SQL table](connect-and-configure.md#ingest-a-sql-table-databricks-snowflake-postgres) — a plain `type` throws the `method.overloads()` NPE).

> **Version gate — read first.** SQL ingestion/CDC behavior differs sharply by platform version:
> - **8.8: there is NO SQL DataInteg ingestion and NO CDC at all.** `SqlSourceCollection` has no `process()` implementation, no `cdcOrder`/`fullSync`/`cdcCheckpoint`, no staging, and `startOnScheduleMode` does not exist. SQL is **read-only** on 8.8 — define the `External` source type and read it (`fetch()` / `readObjs()` / `SqlSourceSystem.previewTable()`); to land rows in an entity, upsert them app-side. **Skip this section's `process`/CDC/`fullSync`/staging guidance entirely.**
> - **8.9–8.10:** SQL CDC exists but runs **only in staged mode** — `stage=true` **and** a staging `FileSourceCollection`, `cdcOrder` always required (**no `fullSync`**); a `stage=false` SQL collection is **rejected** (`process()` / `startOnScheduleMode()` throw *"…is not configured for staging"*).
> - **8.11+:** direct-stream default (`stage=false`, no staging collection), `cdcOrder` **or** `fullSync`. This is what the rest of this section assumes.
>
> Confirm the environment version before choosing a path.

**`process()` on a SqlSourceCollection needs one of `cdcOrder` or `fullSync=true`** — it is not optional (8.11+; on 8.9–8.10 `cdcOrder` is always required and there is no `fullSync`). Pick by intent:

- **One-time / full reload, or no reliable ordering column** → `fullSync=true`. Reads all rows every run, ignoring any checkpoint. Gated by `maxFullSyncRowCount` (default 100000) and **revalidated on every run** via `SELECT COUNT(*)` — a table that grows past the cap starts failing, so raise `maxFullSyncRowCount` deliberately or switch to incremental.
- **Incremental** → set `cdcOrder` to a monotonically increasing column list with a deterministic tie-breaker, e.g. `"updatedAt, id"`. Captures inserts+updates as a watermark (`Filter.gt/lt` vs the checkpoint). **Delete propagation is not supported** — removed rows are invisible; do not claim deletes flow through.

**Staging is OFF by default on 8.11+** (`stage=false` → direct-stream path, which needs only `cdcOrder`). There, only set `stage=true` — and then also a `stageFileSourceCollection` — if you specifically need raw captured data staged for replay/audit/reuse, and don't build a staging FileSourceCollection you don't need. **On 8.9–8.10 the opposite holds: staging is required** (`stage=true` + a `stageFileSourceCollection`) for any SQL CDC — see the version gate above.

Steps:
1. Record target and (for incremental) checkpoint/status baselines.
2. Set `fullSync` or `cdcOrder` (see above). Config on the collection: `SqlSourceCollection.forName(name).config().setConfigValue('fullSync', true, ConfigOverride.APP)`, or `cdcOrder` in the collection metadata.
3. Run one `SqlSourceCollection.forName(name).process(DataIntegSpec.make({ process: true }))`.
4. Observe the full status tree and target changes.
5. For incremental, compare `cdcCheckpoint()` before/after; confirm a no-change run leaves checkpoint and target stable.

To report the current checkpoint, read `SqlSourceCollection.forName(name).cdcCheckpoint().value` (a property — no parens; `.value()` errors in JS) — a map keyed by every `cdcOrder` field (surface all of them, e.g. both `timestamp` and `id`). If the checkpoint or its `value` is null, the answer is "no checkpoint persisted yet" (never-run or `fullSync`). Do **not** reconstruct a checkpoint by decoding an ingested record's `id` or reading the last-loaded row — that is not the checkpoint and will mislead.

Never call the private CDC methods (`doStageCdc`, `doDirectStreamCdc`, `generateCdcCheckpoint`). In staged mode, checkpoint advancement proves acquisition/staging progress, **not** target persistence — confirm targets separately.

### SQL setup gotchas
- **`method.overloads()` NPE** → the source type is a plain `type`; make it `entity type … mixes External, NoSystemCols, Source`.
- **Generated SQL uses `MANUFACTURER_S` / `POWER_I` / an `ID` column** → the type is missing `NoSystemCols` (or a field lacks `schema name`); the platform is emitting managed column names. Add `NoSystemCols` and a `schema name` per field.
- **Special/digit-prefixed column** (e.g. `1asset`) → hand-authored `schema name` is used **verbatim**; you must quote it yourself for the datastore — Databricks uses backticks: `` schema name '`1asset`' ``. (Only auto-inference quotes for you.)
- **`tableName()` resolves to the wrong table** → precedence is `source` type's `schema name` > `declaredSchemaName` > collection `name`; set the table via the source type's `schema name` (e.g. `'default.asset'`).
- **`upsert()` wiped my metadata file** → calling `.upsert()` on a metadata-authored collection rewrites/strips the JSON. Set runtime config with `config().setConfigValue(field, value, ConfigOverride.APP)` instead of `upsert()`.
- **Just want to see the data?** The External source type reads live without any of the above: `SourceOrder.fetch({ limit: 10 })`.

## Recurring-source onboarding (composite)

Compose independently verified results — do not hide an unsupported branch inside an otherwise-supported flow:

1. reachability → 2. configured SourceCollection → 3. validated Transform → 4. explicit target persistence semantics → 5. non-mutating draft validation → 6. one verified bounded load → 7. registered recurrence + one observed scheduled run.

Stop at the first blocked or unsupported component and report it.

## Target persistence semantics

`DbTargetCollection.Config` controls write behavior (see [platform-reference](platform-reference.md#target-persistence)): `createOnly`, `updateMode` (`merge` | `replace`), `stageUpdates`. These do **not** imply deduplication, idempotent retry, exactly-once effects, rollback, or atomic publication — see [boundaries-and-handoffs](boundaries-and-handoffs.md#guarantees-c3-di-does-not-provide).
