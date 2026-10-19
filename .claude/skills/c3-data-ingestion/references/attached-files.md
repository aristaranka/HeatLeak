# Load Attached Files

The user attached one or more files (or says they did) and wants them in the app. Always run this orchestration in order — inspect → decide placement → decide entity → choose mechanism. Do **not** jump to creating a FileSourceCollection, an entity type, a `seed/` file, or a direct load before completing the semantic decision below; that inspect-first routing is the point of this workflow, not optional preamble.

## 1. Inspect safely (mandatory first step)

Inspect the attachment before choosing anything. If the file is present, confirm format, size, schema, and whether the content is structured records or documents. Inspect by format: read a bounded sample for text (`.csv`, `.json`); for a binary/columnar format you can't read as text (`.xlsx` Excel, Parquet, Avro), the columns come from `inferSourceType()` at load time (step 4 / [connect-and-configure](connect-and-configure.md#load-a-local-file)) — note the format and move on to the placement/identity decision rather than blocking on a raw read. If the prompt says a file was attached but you cannot see its contents, say what you can and cannot see and ask for the sample/columns — but still frame the next steps as the semantic identity/placement decision, not a generic "re-upload and I'll load it." Ask whether more files of this kind are expected. Persist nothing during inspection.

## 2. Placement: package artifact vs operational data

| Destination | Use when |
| --- | --- |
| `seed/<Type>/` | **Only** for a type that `mixes SeedData` — user-modifiable defaults with upgrade-preservation. If the records are not SeedData, do not use `seed/`. |
| `data/<Type>/` | Regular Persistable entity records shipped **with the application** (deployment-owned provisioning data) — for a one-time snapshot whose rows map to the target as-is. If a field is derived, or more files will arrive, choose a pipeline in step 4. |
| `test/seed` · `test/data` · `test/metadata` · `test/config` | Test fixtures — pick by category |
| `resource/` | Raw sample/tutorial/static asset that should NOT become database rows |
| Entity attachment | File belongs to an existing entity → hand association/authorization to `c3-filesystem` / access-control |
| Unstructured documents | Parsing/indexing/search → hand to `c3-unstructured-data-integration` |
| Operational structured data | Choose a loading mechanism in step 4 |

## 3. Does this need an entity type?

Reuse an existing entity only when the records represent the same **domain concept, identity, ownership, relationships, and lifecycle** — matching columns are not enough. A close-but-different schema usually means a Source-type/mapping change against the **same** target, not a new type.

Create a new domain entity only when persistent application records are required and no existing type is semantically correct. No new entity is needed for raw retention, Data Lake querying, entity attachment, or unstructured indexing. Unsettled target-model design is a backend/type-owner decision ([boundaries-and-handoffs](boundaries-and-handoffs.md#handoffs)).

## 4. Loading mechanism

**Fit picks the mechanism; format is a detail within it.** Use a **`FileSourceCollection`** whenever the records need a Transform to reach the target — any field that is renamed, concatenated, aggregated, computed, or type-converted rather than a straight header→field copy — or when more files of this kind will arrive, or you need provenance, status, scheduling, or replay. Author a Source type from the file's columns and a Transform to the target. Place records in **`data/<Type>/`** only for a one-time snapshot whose rows land in the target as-is (headers already match the fields; values map straight across) — drop the file in unchanged (CSV or JSON both load; name fields/`@ser` to the headers).

Format then follows the mechanism: within a pipeline, CSV/JSON/Avro/Parquet parse natively and a spreadsheet (`.xlsx`) converts to CSV first; `data/` loads text, so a binary file takes the pipeline. When the request leaves it open whether more files will arrive and the single file maps as-is, `data/` is a fine default — state it, and note a pipeline is the path if similar files will recur.

**Direct persistence** (`.create()`/`.upsert()` of target objects) is allowed only when ALL hold: the user confirms a one-time load; every record is already normalized and validated; an existing target is semantically correct; every record has stable identity; create/update behavior is explicit; the bounded batch fits verified environment limits; and no transforms, provenance, hierarchical status, replay, quarantine, scheduling, or later-file policy is needed.

**Otherwise use a FileSourceCollection** (parsing, transforms, nontrivial volume, future files, provenance, status, repeatable operation) → set it up end to end — **author the Source type from the file's columns** — via [connect-and-configure → load a local file](connect-and-configure.md#load-a-local-file), then load via [execute-and-schedule](execute-and-schedule.md). **Use Data Lake** when table storage/query is the primary outcome (`@beta`, **8.11+ — not available on 8.8**; file sources only — see [platform-reference](platform-reference.md#data-lake)).

A FileSourceCollection does not itself guarantee exactly-once effects, safe retry, selective replay, quarantine, rollback, or atomic publication ([boundaries-and-handoffs](boundaries-and-handoffs.md#guarantees-c3-di-does-not-provide)).

## 5. Later files

Reuse the same path only when later files stay compatible with **both** the semantic feed/target and the parser/Source contract. If target semantics hold but headers/encoding change, revise/version the Source mapping (use a separate collection when parser contracts can't coexist). If a one-time direct load becomes recurring, establish a managed pipeline before continuing repeated direct writes.

## Output

Return: (1) file classification, (2) chosen placement/loading mechanism, (3) target/type decision + rationale, (4) validation and mutation boundary, (5) future-file policy, (6) required handoffs and verification.
