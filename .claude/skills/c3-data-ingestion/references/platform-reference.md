# Platform Reference

Grounded against the 8.11 platform types this skill targets. Verify signatures against the live environment before relying on an unfamiliar API or an older version — a method on a base type does not mean the concrete subtype implements it.

## Core model

`SourceSystem → SourceCollection → Source objects → Transform → TargetCollection`, with `DataIntegStatus` recording every stage.

- **SourceSystem** — connection metadata, discovery, optional `ping()`, credentials.
- **SourceCollection** — logical dataset: parser/Source type, validation, scheduling, staging, CDC, processing.
- **Source** — transient raw-record contract (`mixes Source`).
- **Transform** — Source→target mapping metadata.
- **TargetCollection** (`DbTargetCollection`) — persistence behavior.

## Subtype capability matrix

Which concrete SourceCollection implements which read API (verified in 8.11 platform source; the **DataLake** column is 8.11+ — that subtype does not exist in 8.8. The read/preview/infer APIs shown for File/Sql/CloudMessage/Api are present and behaviorally identical back to 8.8):

| Method | File | Sql | CloudMessage | Api | DataLake | Content |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| `readObjs(ObjsOperSpec)` → `stream<Obj>` | ✅ | ✅ | ✅¹ | ✅ | ✅ | ❌ |
| `readTuples(...)` → `[Tuple]` | ✅ | ❌² | ✅ | ✅ | ✅ | ❌² |
| `inferSourceType2(InferTypeSpec)` | ✅ | ✅ | ⚠️ json/csv³ | ✅ | ✅ | ❌ |
| `validateSourceData(...)` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| collection-level `ping()` | via system | via system | ✅ own | — | via system | — |

¹ CloudMessage `readObjs`: pass a `limit` (no `.first(N)`); reading can consume messages; `CloudStreamObjsOperSpec.fromEnd` controls read position.
² `readTuples` on **SQL and Content throws `notImplemented`**. Use `readObjs` (or `previewTable` for SQL).
³ CloudMessage content type is not auto-detected — declare it with **`cmsc.config().withContentTypeOverride(ContentType.csv().mediaType())`** (or `.json()`, etc.). Support **varies by operation**: `inferSourceType2` currently accepts only JSON, CSV, and the JSON-array type (other types throw `unsupportedContentType`); the **read** path (`readObjs`) parses the broader `SourceContent` set — JSON, CSV, Avro, Parquet — per the declared content type. So a feed can be readable while its schema isn't yet inferrable — hand-author the Source type in that case.

## Inspection

- `readObjs(ObjsOperSpec.make({offset, limit}))` — common bounded read.
- `inferSourceType()` (JSON wrapper) / `inferSourceType2(InferTypeSpec)` (typed `TypeMeta`, canonical) — both valid.
- `validateSourceData(ValidateSourceDataSpec.make({persist, severity}))` — schema-drift detection vs the declared Source type.
- SQL: `SqlSourceSystem.connect()` → `Jdbc`, then `.listTableNames(spec?)` → `JdbcListTableNamesResult { names, qualifiedNames, namesBySchema, hasMore }` (spec `JdbcListTableNamesSpec{offset, limit=-1}` is optional) to **enumerate tables**; `SqlSourceCollection.connect()` → `SqlTable` (one table's schema/`columns`); `SqlSourceSystem.previewTable(name, limit)` → `PreviewTableResult` (`@beta`, one table's rows).

## Transform and persistence

- Transform: `source`, `target`, optional `condition`, `projection` **or** `transformer`, optional target collection. Prefer `projection`.
- `Source.transformSource(objs, SourceTransformSpec)` → `SourceTransformResult` with **`.objs`** (`[Obj]`), **`.objsByTargetType`**, **`.errors`** (`map<int, Error>` keyed by record index — not an array), `.stats`. Non-persisting.
- `Sources.process(...)` / `SourceCollection.process(DataIntegSpec)` persist through target collections.

## <a id="target-persistence"></a>Target persistence (`DbTargetCollection.Config`)

- `createOnly: boolean` — reject an existing identity instead of updating.
- `updateMode: enum` — **`merge`** (update provided fields) or **`replace`** (remove & recreate same id).
- `stageUpdates: boolean` — stage transformed objects for later batched writes.

`DbTargetCollection.Config` also carries an `idempotent` boolean (inherited from its `UpsertSpec` mixin), but none of these settings imply dedup, idempotent retry, exactly-once, rollback, or atomic publication across a reprocess — verify the concrete write path rather than assuming a guarantee ([boundaries-and-handoffs](boundaries-and-handoffs.md#guarantees-c3-di-does-not-provide)).

## Statuses and queues

Status hierarchy (all `extend DataIntegStatus`): `SourceStatus` → `SourceChunkStatus` (extends SourceStatus) ; `TransformStatus` ; `TargetStatus`. Key fields: `state`, `firstError`, `totalErrorCount`, `rootSourceStatus`, `parentStatus`, count/successful/skipped/failed.

Three independent queues (`InvalidationQueue` subtypes), each with `.errors(filter, include, limit)` and `.recoverFailed(filter)`:

- **SourceQueue** — source/chunk processing.
- **SourceStatusQueue** — status rollup.
- **BatchQueue** — BatchJob batches (file discovery/metadata).

Investigate syncing before processing, but a `BatchQueue` error does **not** universally prove `SourceQueue` is blocked — correlate to the specific run. Queue emptiness/non-emptiness proves nothing about target success on its own.

## SQL source type shape (required)

A SQL source type must be declared **`entity type <Name> mixes External, NoSystemCols, Source`** with per-field `schema name '<COLUMN>'`, and `schema name '<table>'` on the type for the external table. Grounded in the canonical example `platform/zoo/src/main/c3/testSqlCdcDirectStream/src/CdcDirectStreamSource.c3typ` and `SqlSourceCollection_Methods.java` (the read path does `Persistable.downcast(source())`, so the type must be Persistable/`entity`).

- `entity type` (Persistable) — required, or `process()`/read paths throw `NullPointerException: Cannot invoke "method.overloads()"`.
- `External` — type lives in the external DB; C3 does not create/manage its table and routes `fetch()` there (data virtualization: `SourceType.fetch()` reads live rows). The same External type is both the virtual-read surface and the pipeline source.
- `NoSystemCols` — suppresses C3 system/managed columns; without it the generated SQL uses managed names (`FIELD_S`, `FIELD_I`, an `ID` column) instead of your external columns.
- Hand-authored `schema name` is used **verbatim** in generated SQL — quote special/digit-prefixed columns yourself (Databricks backticks: `` schema name '`1asset`' ``); only auto-inference quotes for you.
- `tableName()` precedence: source type's `schema name` > `declaredSchemaName` > collection `name` (uppercased for JDBC metadata lookup only).

## SQL incremental state (CDC)

**Version gate:** SQL DataInteg ingestion (`process`) and **all** CDC (`cdcOrder`/`fullSync`/`cdcCheckpoint`/`SourceCollection.Cdc`/staging) are **absent in 8.8** — there `SqlSourceCollection` is read-only (connect / `readObjs` / `previewTable` / External-type virtualization only), with no incremental sync and no scheduled SQL ingestion. On **8.9–8.10** SQL CDC exists but requires **staged mode** (`stage=true` + a `stageFileSourceCollection`, `cdcOrder` always, **no** `fullSync`; a `stage=false` SQL collection is rejected). On **8.11+** direct-stream (`stage=false`) is the default and `fullSync` is available. The facts below describe **8.11+**.

`process()` requires **`cdcOrder` OR `fullSync=true`** (not optional; 8.11+). `cdcOrder` (ordered source fields + tie-breaker), staged vs direct paths (`stage=false` is the default → direct, needs only `cdcOrder`; `stage=true` needs a `stageFileSourceCollection`), `fullSync` (re-reads whole source every run, ignores checkpoint; SQL-only, 8.11+; revalidated each run against `maxFullSyncRowCount`, default 100000). CDC captures **inserts and updates only** (watermark via `Filter.gt/lt`); **no delete detection**. Staged checkpoint advancement can precede target persistence — check target status separately. Private (do not call): `doStageCdc`, `doDirectStreamCdc`, `generateCdcCheckpoint`. Setting runtime config via `.upsert()` on a metadata-authored collection rewrites its JSON file — use `config().setConfigValue(...)`.

**Reading the CDC checkpoint.** `SqlSourceCollection.forName(name).cdcCheckpoint()` returns a `SourceCollection.Cdc.Checkpoint`; read its `value` field (JS: `.cdcCheckpoint().value` — a property, no parens) — a **map keyed by every `cdcOrder` field**. For `cdcOrder "timestamp, id"`, `.value` is `{ timestamp: <max ts>, id: <max id> }` (each entry is the max, or min for `descending`, of that source field over processed rows). Surface **all** keys, not just one. `cdcCheckpoint()` behaves **identically for staged and direct** SQL collections (same persisted record, deterministic id) — it is null only before the first successful run or under `fullSync` (which clears it each run). If it is null, say "no checkpoint persisted yet" — **never** infer or decode a checkpoint from an ingested record's `id` or the last-loaded row; the watermark is computed from the source `cdcOrder` fields, not from target record ids.

## <a id="data-lake"></a>Data Lake

`DataLakeSourceCollection` / `DataLakeSourceSystem` are **`@beta` and 8.11+ — they do not exist before 8.11** (absent in 8.8; don't reference them on older versions). `syncToDataLake(sourceCollection, partitionExpressions)` → `Pair<DataInteg.Pipeline, CronJob>` and `pauseSyncToDataLake(sourceCollection)` exist and run asynchronously; currently **file source collections only**.

## File / package placement

`seed/` (SeedData initial records) · `data/` (regular Persistable package data) · `resource/` (raw/static asset) · attachment mount (entity file attachments) · data-load mount (customer ingestion files). Source/status/failed-source archival are independently configured (`doNotArchiveSources`, `doNotArchiveFailedSources`, …); archiving does not establish retention, replay, or erasure guarantees.

## Production / credential boundary

Lead developer-facing connector setup with Studio Data Fusion; keep secret entry in the UI. Production mode can suppress placeholders and restrict non-credential connector edits — verify the specific connector/environment; do not generalize to universal immutability or rollback.
