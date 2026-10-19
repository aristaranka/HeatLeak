# Diagnose and Recover a Pipeline

**Diagnose before you recover.** Read actual status and error evidence before any reprocess, sync, or write. A queue or status API does not by itself make a mutation safe.

## Start broad (when no specific run is named)

For a broad "everything is broken / what failed and who fixes it" request, the first deliverable is a **health assessment only** — inventory what failed and where, *then* diagnose the specific stage and owner. Do **not** open with recovery scripts, reprocess loops, or ownership tables before the assessment establishes what is actually broken; recovery output is a later, separate step gated on diagnosis.

1. Confirm environment/app and a bounded time window.
2. Find failures across all three error locations (run all three — failures surface in different places):

```javascript
// Graceful / application errors — captured in status objects
var failed = DataIntegStatus.fetch({ filter: 'totalErrorCount > 0' }).objs;
var diErrors = failed.pluck('firstError').unique();

// Syncing-phase framework errors (file discovery/metadata)
var batchErrors = BatchQueue.errors(null, null, 100).filter(e => e.detail.errorMsg.includes('FileSystemBatchJob'));

// Processing-phase framework errors (chunk/transform/persist)
var sourceQueueErrors = SourceQueue.errors();

[diErrors.length, batchErrors.length, sourceQueueErrors.length];
```

3. Recover paths: `BatchQueue.recoverFailed()` for syncing errors, `SourceQueue.recoverFailed()` for processing errors — **only after** the root cause is understood.
4. Select one unambiguous run, verify its concrete type (`sc.type().name()`), then drill in.

The three queues (`SourceQueue`, `BatchQueue`, `SourceStatusQueue`) are independent. Investigate syncing before processing because processing consumes synced files — but a `BatchQueue` error does **not** universally prove `SourceQueue` is blocked; correlate to the actual run. An empty queue doesn't prove target success; a non-empty queue doesn't prove a stall.

## Files in inbox but no statuses (missing Source type — check FIRST)

The most common "files not loading" cause: `source` is null, so no `SourceStatus` is created. **Do not** call `syncAll`/`processAll` with a null source type — it fails with a null reference.

```javascript
var fsc = FileSourceCollection.forName('COLLECTION_NAME');
fsc.source;   // null == root cause
```

Repair:

```javascript
fsc.inferSourceType();                                    // infer schema from files in inbox
// → create src/source/SourceMyEntity.c3typ from the output, deploy, then link the source type.
// upsert merges by name, so this sets `source` without disturbing the existing sourceSystem/inbox:
FileSourceCollection.make({ name: 'COLLECTION_NAME', source: 'SourceMyEntity' }).upsert();
FileSourceCollection.forName('COLLECTION_NAME').process(DataIntegSpec.make({ process: true }));
```

(A brand-new collection also needs its `sourceSystem` set — see [connect-and-configure](connect-and-configure.md#load-a-local-file). Here the collection already exists with an inbox, so only `source` is missing.)

## Statuses stuck in 'initial'

Cause: sync ran without processing.

```javascript
var stuck = SourceStatus.fetch({ filter: "state == 'initial'" }).objs;
var files = SourceFile.fetch({ filter: Filter.make().intersects('id', stuck.mapToStr(s => s.id)) }).objs;
files.each(sf => sf.process(DataIntegSpec.make({ process: true })));  // process() requires a DataIntegSpec; processes ONLY the stuck files
```

Prevention: run sync+process together via `SourceCollection.forName(name).process(DataIntegSpec.make({ process: true }))`.

## Diagnose a failed / rejected run

1. Read the root status and related `SourceStatus`, `SourceChunkStatus`, `TransformStatus`, `TargetStatus`.
2. Find the most specific child with its own error — an aggregate parent failure may not be the origin. Classify the failing stage:
   - **SourceStatus** → source acquisition / config
   - **SourceChunkStatus** → chunk parsing/processing
   - **TransformStatus** → transform logic
   - **TargetStatus** → persistence
3. Record status IDs, states, timestamps, counters, transform name, target type; read a bounded error range.
4. Correlate `BatchQueue`/`SourceQueue` errors only through time and context/action identifiers.
5. Bound impact from successful/failed/skipped counts; assign the next owner from direct evidence.

Extract the source file from any status:

```javascript
var ss = SourceStatus.forId(DataIntegStatus.forId(statusId).rootSourceStatus.id);
var fileName = ss.id.substring(ss.id.indexOf('_') + 1);
var fscName  = ss.id.substring(0, ss.id.indexOf('_'));
```

Diagnosis output must include: run identity, failing stage, sanitized error evidence, observed impact, owner, unknowns, and `Recovery: not performed`. **Do not** call recovery/process/sync/write APIs during diagnosis.

## Reprocess failed files (scoped)

Fix the root cause first, then reprocess only what failed:

```javascript
var failed = SourceStatus.fetch({ filter: "state == 'failed'" }).objs;
var files = SourceFile.fetch({ filter: Filter.make().intersects('id', failed.mapToStr(s => s.id)) }).objs;
files.each(sf => sf.process(DataIntegSpec.make({ process: true })));  // process(spec) — the DataIntegSpec is required
```

Check archiving first — if archiving is on, failed files may sit in the archive rather than the inbox:

```javascript
var archiving = !fsc.config().doNotArchiveSources && !fsc.isExternal();
```

`SourceFile.processAll()` hits **every** collection system-wide — require explicit user confirmation and prefer `SourceCollection.forName(name).process(DataIntegSpec.make({ process: true }))`.

## Credential / connection failures

Ping (see [connect-and-configure](connect-and-configure.md#test-reachability)); if unreachable, the user updates credentials themselves ([provider snippets](connect-and-configure.md#provider-credential-snippets)), then `BatchQueue.recoverFailed()` to retry synced work.

**Anticipate the common failure prerequisites for a filesystem/cloud source — do not just hand over listing/read code.** Accessing a bucket (GCS, S3, ADLS) requires BOTH a configured mount AND valid credentials on the source system, so a read that "does nothing" or 403s usually means one of these is missing. Proactively check and call out:

- **Mount exists** for the target URL (`FileSystem.<provider>().mounts()`); if not, it must be created (name it, point it at the bucket).
- **Source system + credentials** are set and current — expired/rotated keys, wrong tenant/account, or an unregistered source system are the usual causes. Verify with `ping()` before anything else.
- **Path/registration**: the inbox URL resolves and (for cloud message) the collection is `registered()`.

State these prerequisites and how to check each, rather than assuming the connection is healthy.

## Performance regression

Compare like-for-like runs; localize to source, queue/chunk, transform, or target persistence before recommending remediation. Input size alone is not proof of equivalent workload — verify with repeated representative runs against an explicit runtime target. Capacity/infra changes belong to platform administration ([boundaries-and-handoffs](boundaries-and-handoffs.md#handoffs)).

## Correcting already-loaded bad data (there is no rollback)

"Roll back last night's run" has no API — status/provenance records don't compose one, and `recoverFailed()` only retries *failed* work, not successfully-written bad rows. Deliver this instead of a refusal:

1. **Diagnose + bound** (above): identify the run, its target type, and the row count/ids it wrote.
2. **Prevent recurrence going forward** — the durable fix is deterministic target identity + explicit write mode, so a corrected re-run overwrites instead of duplicating: give the Transform a deterministic `id` from the natural key (`projection: { id: orderId }`) and set `DbTargetCollection.Config.updateMode` to `replace` (or `merge`). This is *not* an exactly-once guarantee ([boundaries](boundaries-and-handoffs.md#guarantees-c3-di-does-not-provide)); it converges writes on a stable key.
3. **Repair the existing rows** by category:
   - Rows a corrected file will re-produce → fix the source/Transform and re-run with `updateMode: replace`; same ids get replaced in place.
   - Rows that should not exist at all → scoped deletion of those target rows is **target-entity CRUD (`removeBatch`), owned by the backend/type owner** ([handoff](boundaries-and-handoffs.md#handoffs)) — run only with explicit confirmation and a stable way to attribute rows to the run. Never a blind "delete everything from last night and reload."

Attributing rows to a run is the crux: without a deterministic key, `meta.created` time-windowing is fragile and can catch legitimate rows — so step 2 is also what makes step 3 safe.

## Recovery boundary

For any recovery request — including selective/partial replay of specific rows — your **opening move is to fill in the checklist below, explicitly and from real evidence, before proposing any fix or stating what is or isn't supported.** Do not open with "not supported," and do not present a confident "scoped reprocessing" solution as if the platform provides a standard mechanism. Establish, in order:

1. **Recovery unit** — is it a queue entry, a file, specific records/rows, a checkpoint, a run, or a dataset?
2. **Stable identity** — is there a deterministic key that distinguishes the successful from the missing/bad records? (Without one, per-row replay cannot be scoped safely.)
3. **Status evidence** — what do the actual `SourceStatus`/`SourceChunkStatus`/`TransformStatus`/`TargetStatus` records show succeeded vs failed?
4. **Persistence behavior** — the target's `updateMode`/`createOnly` and whether re-writing a key overwrites or duplicates.
5. **Supported mutation API** — the concrete call that would perform the recovery, and its scope/authorization/stop conditions/terminal verification.

**Only after** working items 1–5 do you state the boundary: a generic, duplicate-safe selective row-replay is **not** an established platform guarantee without stable source/status identity ([boundaries-and-handoffs](boundaries-and-handoffs.md#guarantees-c3-di-does-not-provide)). If identity + status evidence exist, the supported path is a scoped re-run with a deterministic `id` and `updateMode: replace` (converges on the key — not exactly-once). If they don't, deliver the diagnosis + the missing evidence — never a blanket whole-file reprocess and never a claimed exactly-once/dedup guarantee.
