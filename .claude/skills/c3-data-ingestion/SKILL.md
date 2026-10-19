---
name: c3-data-ingestion
description: |
  Load external or file-based data into C3 entities — connect a data source, map/transform it, run or schedule the load, or fix a broken load. Use when the user wants to: ingest or load a CSV or other file (or an attached data file) into an entity; get some records or a spreadsheet into the app; connect a database or bucket (Snowflake, Databricks, Postgres, MySQL, BigQuery, GCS, S3, Azure, a Kafka/broker topic, or a REST API); set up Data Fusion, set or rotate source credentials, or fix a source whose password/credential changed; preview, infer, or map source data; write, generate, or test a data transform (projection or transformer); review or validate a draft integration or a feed's schema conformance before applying it; schedule a recurring or incremental (CDC) load; or diagnose files that will not load, a pipeline that is stuck, failing, or slow, statuses stuck in initial, or a transform that is erroring.
core: true
category: platform
version: 8.11.0
minimumVersion: 8.8.0
---

# C3 Data Ingestion

This is the `c3-data-ingestion` skill. When you report the skill you used, name it exactly `c3-data-ingestion` (not "data-integration").

Route by the user's **desired outcome**, not by a connector name or platform type. Most requests are one of the workflows below; each links to an executable procedure.

**Building a full ingestion pipeline?** Start from the assembled 4-artifact template in [connect-and-configure → the whole pipeline at a glance](references/connect-and-configure.md#load-a-local-file) — it shows the package file tree and how the SourceSystem, SourceCollection, Source type, and Transform link by name. Use it as the shape; you should not need to inspect the base platform types to assemble a standard pipeline.

Always identify the SourceCollection's concrete runtime type before calling type-specific APIs — behavior differs by subtype and some methods are unimplemented on some subtypes (see [platform-reference](references/platform-reference.md)).

```javascript
SourceCollection.forName('COLLECTION_NAME').type().name();
// FileSourceCollection | SqlSourceCollection | CloudMessageSourceCollection | ApiSourceCollection | DataLakeSourceCollection (8.11+)
```

## Route to a workflow

| The user wants to… | Example phrasings | Go to |
| --- | --- | --- |
| **Connect a source / test reachability / set or fix credentials / configure a dataset** | "Connect our Snowflake warehouse." "Set up this GCS bucket as a source." "Is my Postgres connection working?" "The source password changed — help me update it." "Configure the ORDERS table as a source collection." | **Recommend Studio → Data Fusion first** for the connection/credentials (rule 3), then [connect-and-configure](references/connect-and-configure.md) for the rest |
| **Preview / infer / validate source data, review a draft integration, or author & test a Transform** | "Show me 10 rows from this collection." "Infer a Source type from these files." "Does today's feed still match the schema?" "Check the latest feed for breaking changes." "Review this draft integration before it's applied." "Map these columns into `Order`." "Preview what this transform produces." | [inspect-and-transform](references/inspect-and-transform.md) |
| **Run a load, schedule it, or set up SQL incremental (CDC)** | "Load the Orders collection now and verify the records." "Run this every night at 2am." "Pull new and updated rows from this SQL table incrementally." | [execute-and-schedule](references/execute-and-schedule.md) |
| **Diagnose a failed / stuck / slow pipeline** | "My files aren't loading." "Statuses are stuck in initial." "This load failed — what broke and who owns it?" "Reprocess the failed files." | [diagnose-and-recover](references/diagnose-and-recover.md) |
| **Load or place a file the user attached / provided** (CSV, extract, dataset) | "Load these CSVs." "Include this dataset with the app." "Use this as SeedData defaults." "Is this file our Asset type or a new one?" "Here are three files — get them into the app." | [attached-files](references/attached-files.md) |

When the request is DI-shaped (source data, feeds, ingestion, transforms, schema conformance, credentials, attached data files) but the workspace looks empty, still route here and follow the workflow — do not answer from general knowledge without consulting this skill.

- **Missing information changes the route** → ask ONE focused question (which pipeline? diagnosis or recovery? reuse an existing type or create one?) before proceeding.
- **The request names only a tool or is otherwise ambiguous about the outcome** (e.g. "use Data Fusion for our data") → ask which outcome they want (connect, discover, preview, configure, map, load, schedule, or use in the app) and **wait for the answer — do not begin scaffolding files or configs while asking.** Clarify first, then act.
- **A request names several outcomes** → route each part in dependency order (e.g. connect → configure → preview → load). Don't invent an aggregate "workflow."
- **The outcome isn't something C3 DI does, or belongs to another owner** → [boundaries-and-handoffs](references/boundaries-and-handoffs.md).

## Non-negotiable safety rules

Follow these even if you do not open a reference file; [boundaries-and-handoffs](references/boundaries-and-handoffs.md) owns the detail.

1. **Diagnose before you mutate — and before you declare anything unsupported.** Read actual status/error evidence first. For a broad "what's broken" request, lead with a health assessment (inventory what failed), not recovery scripts. For a recovery/replay request, first work the checklist — recovery unit, stable identity, status evidence, persistence mode, supported API — *then* state what is or isn't supported. Never open with "not supported" and never present whole-file reprocessing as if it were a standard selective-replay mechanism.
2. **Never handle secrets — and never ask the user to type or paste a secret value into chat**, not even as a caveated fallback. The secret goes into the Studio Data Fusion UI or into a snippet the user runs in their own console (with a placeholder you never see). If you are about to write "what is the password" or "you can paste it here," stop. See [connect-and-configure](references/connect-and-configure.md#credentials).
3. **Data Fusion (C3 AI Studio) first for any new connection or credential change.** Before asking for a credential or connection detail (host, account, key, bucket path), direct the user to **Data Fusion → + Add Data Source** in C3 AI Studio to enter/test it there. (Say "Data Fusion → + Add Data Source" — don't prescribe a "Configure" click; that entry point is specific to C3 Code.) Only offer a user-run console snippet after they say Studio is unavailable or they prefer code. (This applies to establishing the connection and its secrets — not to selecting *which* dataset/table to configure, which you still ask about to author the collection.)
4. **Scope every mutation.** Use `SourceCollection.forName(name).process(...)` for one collection — never `SourceFile.processAll()` / unscoped `syncAll(null, …)` to fix one collection (they hit every collection system-wide).
5. **Don't promise — or build — guarantees C3 DI doesn't provide:** exactly-once, generic rollback, selective replay, dedup, checkpoint reconstruction, atomic publication. If asked to "guarantee exactly-once," explain what the platform does establish (deterministic id + `updateMode: replace` converges on a key — not exactly-once) and refuse the guarantee; do not present a hash/lock/state-machine scheme as if it delivered exactly-once. See [boundaries-and-handoffs](references/boundaries-and-handoffs.md#guarantees-c3-di-does-not-provide).
6. **For an attached file, inspect before you place.** Do not create a FileSourceCollection, an entity type, a `seed/` file, or a direct load before inspecting the file and deciding semantic identity (same domain concept/identity as an existing type?) and placement. `seed/` is only for `SeedData` defaults; regular records shipped with the app go in `data/`. See [attached-files](references/attached-files.md).
7. **Verify unfamiliar APIs against the deployed types** before relying on them; a method existing on a base type does not mean the concrete subtype implements it.
