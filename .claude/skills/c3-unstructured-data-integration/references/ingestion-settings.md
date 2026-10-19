# `ingestionSettings` field reference

Full detail behind the working subset in [`../SKILL.md`](../SKILL.md#2-configure-tags-or-extraction).
Read this when a spec needs a block the SKILL body doesn't cover, when extraction produced
nothing and you need to know why, or when the user asks what is tunable.

## Shape and parsing

- **Both key styles work.** `documentExtractor` and `document_extractor` are equivalent; keys
  are normalized before parsing. Use camelCase for consistency with the rest of the API.
- **Nested arrays survive the C3 boundary.** `pageRanges` can be sent literally as
  `[[0, 2], [-3, -1]]`; the pod repairs the object-ified form C3 produces for nested arrays.
- **Recognized top-level keys** are exactly `parser`, `chunker`, `documentExtractor`,
  `passageExtractor`, `embedder`, `hierarchy`. Anything else is logged
  (`ingestionSettings: ignoring unrecognized keys [...]`) and **ignored** — the run does not
  fail. This is the single most common cause of "I asked for tags and got none."
- **Values are validated.** A malformed value inside a recognized block raises and fails the
  run fast with a message, rather than running the wrong config silently.
- **Document preparation is not configurable** from `ingestionSettings` — the strategy sets it.

## Blocks

| Block               | Field                  | Meaning                                                            |
| ------------------- | ---------------------- | ------------------------------------------------------------------ |
| `parser`            | `pageRanges`           | Which pages to parse at all (see semantics below).                 |
| `parser`            | `userPrompt`           | Extra instruction to the VLM parser for this corpus.               |
| `chunker`           | `maxTokens`            | Target chunk size.                                                 |
| `chunker`           | `overlapTokens`        | Overlap between adjacent chunks.                                   |
| `documentExtractor` | `tagsToExtract`        | Whole-document tags → the row's `metadata.tags`.                   |
| `documentExtractor` | `entitiesToExtract`    | Whole-document entities → instances in the TARGET app.             |
| `documentExtractor` | `pageRanges`           | Which pages are rendered as images for the extraction call.        |
| `passageExtractor`  | `tagsToExtract`        | Per-chunk tags. Ignored by `document_level` (it makes no chunks).  |
| `passageExtractor`  | `entitiesToExtract`    | Per-chunk entities.                                                |
| `embedder`          | `dense` / `sparse`     | Which embeddings to produce.                                       |
| `embedder`          | `embedMetadata`        | Fold extracted metadata into the embedded text.                    |
| `hierarchy`         | `enabled`              | Build the section hierarchy.                                       |
| `hierarchy`         | `maxLevels`            | Depth cap.                                                         |
| `hierarchy`         | `injectIntoEmbedText`  | Prefix each chunk's embed text with its hierarchy path.            |

## `pageRanges` semantics

A list of **inclusive, 0-indexed** `(start, end)` pairs; omitted means all pages. Negatives
count from the end and resolve against the page count before clamping; overlapping ranges
merge.

| Spec         | Result                                                                  |
| ------------ | ------------------------------------------------------------------------ |
| `[0, 2]`     | first 3 pages                                                           |
| `[-3, -1]`   | last 3 pages                                                            |
| `[1, -1]`    | page 1 through the last page                                            |
| `[-1, -3]`   | **empty** — resolves reversed, and reversed ranges are not auto-fixed   |
| `[5, 2]`     | **empty** — same reason                                                 |

Always order a range `start <= end` after resolution. A reversed range yields no pages and no
error.

## The document-level page budget

Document-level extraction renders the selected pages to images and sends them in **one** LLM
call, bounded by three env-tunable limits (defaults shown):

| Limit                       | Default   | Effect                                        |
| --------------------------- | --------- | ----------------------------------------------- |
| `EXTRACT_MAX_DOC_PAGES`     | 20        | Hard cap on pages considered.                 |
| `EXTRACT_MAX_DOC_IMAGE_BYTES` | 4 500 000 | Cap on total encoded image bytes.            |
| `EXTRACT_RENDER_DPI`        | 150       | Render resolution — drives bytes per page.    |

Pages are appended in **ascending page order** and the loop **stops** at the first page that
would cross the byte ceiling. At 150 DPI a dense page is roughly 400–800 KB encoded, so the
effective count is often ~6–11 pages, not 20. The practical consequence: a head-and-tail
request such as `[[0, 9], [-10, -1]]` fills from the head and **never reaches the tail**.
Truncation is reported only as a pod log line — grep the run logs for
`used N of M requested pages`.

Two clarifications worth giving users directly:

- The cap limits what gets **indexed as metadata**, not what `document-search` can read from
  the document at query time.
- These limits are baked into the image today; the Helm chart does not expose them, so
  "raise the cap" is not a per-deployment setting.

## Tag specs

Each key under `tagsToExtract` is a small JSON-schema fragment. `description` is the strongest
lever — it is what the model actually reads, so a precise description beats a clever schema.

- `{"type": "string"}` — the default choice.
- `description` — say what the value is and give a shape hint (`"ISO 8601 date"`).
- `examples` — hints only; values outside them are still allowed.
- `enum` — **allowed values**, enforced by canonicalization: anything off-list is dropped. On
  low-signal text this has produced partial coverage (13 of 21 chunks tagged, the rest empty
  with no error). Prefer a described string unless the user truly needs a closed vocabulary.

Chunks under `EXTRACT_MIN_CHUNK_TOKENS` (default 5) are skipped for passage extraction by
design — tiny fragments made the model invent values.

## Entity specs

`entitiesToExtract` maps a **type name that must already exist in the TARGET app** to its field
spec. Three shapes are accepted:

```json
{ "Genai.Organization": { "name": { "type": "string", "required": true } } }
{ "Genai.Organization": ["name", "headquarters"] }
{ "Genai.Organization": { "fields": ["name"] } }
```

An empty list or dict means "all primitive fields" and leaves the object open. Type hints map
as follows; anything unrecognized becomes an **open property** so the model returns the value's
natural JSON type.

| Hint                                             | JSON type |
| ------------------------------------------------ | ----------- |
| `str`, `string`, `text`                          | string    |
| `int`, `integer`, `long`                         | integer   |
| `float`, `double`, `number`, `decimal`, `real`   | number    |
| `bool`, `boolean`                                | boolean   |

Do not "fix" an unhinted field by forcing `string` — that is deliberate. Forcing string made
the model stringify numbers (`"49.0097"`), which a typed target field then rejected at upsert,
silently dropping the entity.

Two ways a valid-looking entity spec returns nothing:

- **`required: true`** — an instance missing that field is dropped whole. Marking every field
  required means one imperfect instance yields zero entities. The pod logs
  `dropped N entity instance(s) missing a required field`; that line distinguishes "the mapper
  discarded real output" from "the model returned nothing."
- **Output cap** — extraction responses are capped at 2048 tokens. Truncated JSON is repaired
  to salvage partial results and logged as a warning, but an entity-heavy spec over a long
  document loses the tail. Keep specs tight.

## Failure modes

| Symptom                                   | Likely cause                                   | Check                                                          |
| ----------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| Run green, zero tags anywhere            | unrecognized top-level key (typo / wrong case) | run logs for `ignoring unrecognized keys`                      |
| Tags on some chunks only                  | `enum` canonicalization, or tiny chunks skipped | drop the `enum`, re-run one file                               |
| Doc-level tags only from the front        | byte budget stopped the page fill              | run logs for `used N of M requested pages`                     |
| Tags fine, entities zero                  | required-field drop, or model returned none    | run logs for `dropped N entity instance(s)`                    |
| Entities extracted but absent from target | type name not in the TARGET app                | `fetch` that type on the target                                |
| `document_level` persisted 0 passages     | expected — it is metadata-only                 | count `Genai.SourceFile` rows with `exists(metadata.tags)`     |

## Auditing what a past run actually sent

The submitted spec is stored per run on `DocumentAI.Run.input` as a JSON string alongside
`source` and `strategyName`. Two gotchas: the `Job` type has no `ingestionSettings` field (so
reading it there returns null and proves nothing), and `getRun` does **not** include `input` in
its projection. Fetch it directly:

```bash
c3-run "$DOCAI_APP" DocumentAI.Run fetch \
  '{"spec":{"filter":"id == \"<runId>\"","include":"id, input","limit":1}}'
```

This is the reliable way to answer "what did that job actually ask for?" after the fact —
including for runs submitted by another agent or session.

## Known service-side gaps

Not caused by the user's spec, and not fixable by changing it. Mention them rather than letting
a user re-tune a spec that was already correct:

- A failed extraction LLM call is caught and logged, but the file still reports `status: "ok"`
  with an empty `errors` list, so `results.json` looks clean. Trust tag counts on the target
  over run status.
- Page-fill truncation and output truncation are log-only, never surfaced in results.
- Entities have come back empty with a valid typed spec while tags extracted correctly.
- Files around 5 MB and up can fail dispatch (the file is sent inline in the request body),
  surfacing as a payload-too-large error rather than a pipeline failure.
