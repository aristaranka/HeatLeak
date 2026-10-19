# DocAI microservice REST API (advanced / diagnostics)

For the normal flow, ingest through the in-app `Genai.DocAiPipeline` — see
[docai-ingest](docai-ingest.md). Use the microservice's `DocumentAi.Api` directly only to **triage**
(inspect job/run state, read pipeline logs) or to submit a one-off job outside the app pipeline.

All DocAI interactions use the `DocumentAi.Api` REST surface only. Never call internal types
(`DocumentAi.Run`, `DocumentAi.Job`) directly. Two apps are involved: `DOCAI_APP` (the central,
cluster-wide DocAI service) and `TARGET_APP` (owns the documents + retriever).

## Resolve & connect to the DocAI app

DocAI is a central, cluster-wide service. Resolve its endpoint from the consumer app's config, then
connect — **never ask the user "which DocAI"**:

1. An already-connected app with `"pkg": "docai"` → use it.
2. Otherwise read the Ops-published endpoint and connect the app it points at:

   ```javascript
   // On TARGET_APP:
   Microservice.Config.forName('DocAi').serviceAppUrl
   // Expected: "https://<cluster-host>/docai/docai/" → connect that app id
   // (conventionally <cluster>-docai-docai for the standard shared-cluster deploy).
   ```

3. If `serviceAppUrl` is unset, DocAI is not available for this environment — an admin must publish it.
   There is no hardcoded `docai/docai` fallback. Ignore a connected `<cluster>-dociq-dociq` (the retired
   pre-rename service; it exposes `DocumentIntelligence.Api` and 404s every call here).

## Submit a job directly (escape hatch)

`process` must include `sourceApp` = the target app id, or persistence fails with
`Missing TypeMeta Genai.SourceFile in pkg docai`.

```bash
c3-run "$DOCAI_APP" DocumentAi.Api process @args.json
# args.json:
# { "body": { "source": { "files": ["azure://.../doc.pdf"] }, "strategyName": "passage_level",
#             "retrieverId": "default-pg", "sourceApp": "<target-app-id>", "ingestionSettings": null } }
```

Read the output: `jobId`, `runs` (one per file with `runId`), `rejected` (over-size files). Surface
`jobId` + `runId`s immediately. `source.files` must be absolute storage URLs (`azure://`, `s3://`) —
never `c3fs:///` (app-relative; unreadable from the DocAI app). Files over ~350 MB need
`source.presignedUrls` (mint on the TARGET app via `File.generatePresignedUrl`). Extraction settings:
[ingestion-settings](ingestion-settings.md).

## Monitor

```bash
c3-run "$DOCAI_APP" DocumentAi.Api getRun '{"runId": "<runId>"}'   # one run
c3-run "$DOCAI_APP" DocumentAi.Api getJob '{"jobId": "<jobId>"}'   # whole job: progress + per-run
```

Run statuses: `PENDING → DISPATCHED → PROCESSING → COMPLETED → PERSISTED` (terminal), or `FAILED`
(read `errorMessage`). Poll `sleep 2, 2, 5, 5, 10, 10, 15…`; single-file jobs often finish in 15–30s.
`progress.failed > 0` is not a clean success — surface failed files + `errorMessage`s.
`c3-run` writes the result to a file and prints its path — read it with `cat`; do not pipe to `jq`
(there is no `.result` wrapper).

## Persist manually (only when needed)

With `retrieverId` on the job, persistence is automatic. Manual persist is for a job submitted without
a `retrieverId`, or a retry on a `COMPLETED` run:

```bash
c3-run "$DOCAI_APP" DocumentAi.Api persist '{"body":{"runId":"<runId>","retrieverId":"default-pg"}}'
```

Idempotent per source+retriever (stale vectors replaced).

## Debugging — stuck, failed, or missing runs

| Step | Question | Call |
| ---- | -------- | ---- |
| 1 | What state are runs/jobs in? | `getJob` progress + `listJobs` |
| 2 | What does the run error say? | `getRun` → `errorMessage` |
| 3 | What did the pipeline log? | `getJobLogs` / `getRunLogs` |

Common `errorMessage` causes: file not readable (wrong URL scheme), strategy not found (typo in
`strategyName`), pod timeout (file too large / under load).

**Tags or entities missing on a green run?** Extraction failures are logged, not raised. Pull run logs
and grep for `ignoring unrecognized keys` (spec typo), `used N of M requested pages` (page-budget
truncation), or `dropped N entity instance(s)` (a `required` field). Symptom-to-cause table:
[ingestion-settings → failure modes](ingestion-settings.md#failure-modes).

```bash
c3-run "$DOCAI_APP" DocumentAi.Api getJobLogs '{"jobId": "<jobId>"}'
c3-run "$DOCAI_APP" DocumentAi.Api getRunLogs @runlogs.json   # { "body": { "runIds": ["<runId>"] } }
```

Each entry is `{ timestamp, level, message }`; stages appear as `parse start:`, `chunk start:`,
`embed start:`, `extract_from_document start:`, etc. **Fallback:** if the API log endpoints are empty,
query OpenSearch directly (`openSearchLogs`, `index: "c3server"`, `match_phrase` on the job/run id). If
no logs appear for a run stuck in `PENDING`/`DISPATCHED`, the pod may be down — an admin should check
the DocAI CloudService pod.
