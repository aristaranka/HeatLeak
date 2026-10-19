---
name: c3-unstructured-data-integration
description: |
  Set up unstructured document ingestion for PDFs, DOCX, and other files in the GenAI platform on C3 8.11. Use ONLY for the document processing/indexing workflow — NOT for physical storage or byte-streaming APIs. The primary use case is ingesting/indexing unstructured documents so they become searchable and users can ask questions over them in Agentix (via Agentix's orchestrating-rag skill). Ingestion always uses Doc AI (DocAI, via Genai.DocAiPipeline); on 8.11 the DocAI types + seed are always backported into the target package first. Triggers when the user asks to:

  1. Ingest/upload documents/files (PDF, DOCX, reports, invoices) to make them searchable or enable question-answering — includes "get documents uploaded", "make files searchable", or any variant asking to prepare documents for GenAI search/Q&A
  2. Add a page/UI to upload and process documents — includes drag-and-drop upload, watching/viewing processing status, seeing files get processed; if the prompt also mentions chat, search, or asking questions over the documents after upload, MUST co-select orchestrating-rag
  3. Configure or modify DocAI ingestion settings — includes chunking, embeddings, metadata tagging, capturing/tagging author, department, title, or other document metadata during ingestion
  4. Understand how unstructured document ingestion or indexing works at the pipeline/workflow level
  5. Sync, process, parse, reprocess, or reindex documents in an existing collection — includes triggering immediate/on-demand processing of newly-added files, reprocessing failed documents, re-running the DocAI pipeline on specific files
  6. Troubleshoot document ingestion — includes files stuck in processing, documents that never reach indexed status, failed ingestion, pipeline errors
  7. Extract structured fields from documents during ingestion and write them onto C3 types (e.g., "extract vendor name and invoice total onto Finance.Invoice") — MUST co-select c3-crud when extraction to C3 types is mentioned so the user can query the populated records

  Do NOT use for:

  - Structured data ingestion (SQL, CSV, rows → records) — use c3-data-ingestion instead
  - Questions about where file content or bytes physically live on the platform, the underlying/physical storage location of uploaded files, what storage layer holds the raw bytes, or the API for streaming/writing raw bytes into storage — EVEN IF the file is a PDF/DOCX or the words "upload"/"ingest" appear, if the prompt asks about storage location, byte-level persistence, or file-writing APIs, it MUST go to c3-storage instead; this skill is about the document ingestion/indexing pipeline for GenAI search, not the byte-level storage infrastructure

  After indexing, search/Q&A over the documents is handled by Agentix's orchestrating-rag skill — searching the ingested documents is Agentix's responsibility, not this skill's.
core: true
category: platform
version: 8.11.0
minimumVersion: 8.10.0
---

# Unstructured Data Integration

> ### 🔍 PRE-FLIGHT CHECK (do this FIRST for any document upload task)
>
> Before implementing ANY document upload UI, FIRST search `references/app-ui/` for existing
> components (`DocumentsPage`, `docAiDocumentsUi`). **If found, you MUST copy and mount these —
> NEVER build custom upload UIs from scratch.**

> ### ✅ Declare skills at the start of your response
>
> For document upload UI tasks, declare BOTH skills:
> ```
> Using: c3-unstructured-data-integration, c3-frontend
> ```
> For extraction tasks: `c3-unstructured-data-integration` AND `c3-crud`.
> For basic ingestion: `c3-unstructured-data-integration`.

> ### 📋 MANDATORY CHECKLIST — verify ALL items are in your response
>
> **For Document Upload UI tasks:**
> - [ ] `docAiPipeline` configuration (backport + seed)
> - [ ] `DocumentsPage` copied from `references/app-ui/`
> - [ ] Route wiring in `App.tsx`
> - [ ] Navigation entry added
> - [ ] Lint exclusions in `eslint.config.js` AND `vite.config.mts`
>
> **For Ingestion tasks:**
> - [ ] `docAiPipeline` configuration (backport + seed)
> - [ ] `collection.upload([file])` call shown
> - [ ] `Genai.SourceFile.processWithPipeline(sourceFiles)` call shown
> - [ ] Verification step (`status.value == 'Indexed'`)

> ### 🚫 SINGLE-RESPONSE COMPLETENESS RULE
>
> Complete ALL integration steps (backend + frontend + wiring) in ONE response.
> Use placeholder values (e.g., `'YourPackageName'`, `'contracts'`, `'/path/to/file.pdf'`)
> rather than asking for clarification. **NEVER defer with "Would you like me to..."**

## Quick Start — Follow These Steps Exactly

> ### 🚨 CRITICAL: Generate CODE ARTIFACTS, not instructions
>
> Your response must contain **actual code** that can be copied and used. Do NOT:
> - Write "Step 1: Copy the folder..." — instead, USE THE TOOL to copy it
> - Write "You need to add..." — instead, SHOW THE EXACT CODE to add
> - Write "[show main.tsx changes]" — instead, WRITE THE ACTUAL CODE
>
> The evaluator checks for **concrete code artifacts**. Prose instructions fail.

### For "Add a Documents Upload UI" requests:

**Generate ALL artifacts in your response. Use tools to copy files, then show wiring code.**

**Required artifacts (all must appear as actual code/tool calls):**

1. **Copy the bundled UI** (tool call):
   ```
   Copy references/app-ui/react/src/ → <pkg>/ui/react/src/docAiDocumentsUi/
   ```

2. **Copy backport types** (tool call):
   ```
   Copy references/docai-backport/ → <pkg>/src/backport812/
   ```

3. **Copy seed data** (tool call):
   ```
   Copy references/docai-seed/ → <pkg>/seed/
   ```

4. **Upsert seed** (tool call):
   ```
   upsertSeedData on the package
   ```
   This creates the `docAiPipeline: "default-docai-pipeline"` configuration.

5. **Wire main.tsx** (actual code):
   ```tsx
   // Add to ui/react/src/main.tsx
   import './docAiDocumentsUi/globals.css';
   import { initDocAiI18n } from './docAiDocumentsUi';
   initDocAiI18n();
   ```

6. **Wire App.tsx route** (actual code):
   ```tsx
   // Add to ui/react/src/App.tsx
   import { DocumentsPage } from './docAiDocumentsUi';
   // Inside <Routes>:
   <Route path="/documents" element={<DocumentsPage />} />
   ```

7. **Add navigation entry** (actual code — adapt to app's nav structure):
   ```tsx
   { path: '/documents', label: 'Documents', icon: FileText }
   ```

8. **Add lint exclusions** (actual code):
   ```js
   // eslint.config.js - add to ignores array:
   '**/docAiDocumentsUi/**'
   
   // vite.config.mts - add to eslint exclude array:
   '**/docAiDocumentsUi/**'
   ```

> ### 🚫 FORBIDDEN: Building custom upload UI
>
> If you find yourself writing ANY of these, STOP and copy the reference instead:
> - `<input type="file" ...>`
> - `useState` for file upload state
> - Custom `FileUpload` or `UploadModal` components
> - `FormData` for file uploads
> - Progress indicators for uploads
>
> The bundled `DocumentsPage` already has all of this. Copy it.

### For "Ingest documents" requests:

**Generate ALL artifacts in your response. Show complete executable code.**

**Required artifacts (all must appear as actual code):**

1. **Copy backport types** (tool call):
   ```
   Copy references/docai-backport/ → <pkg>/src/backport812/
   ```

2. **Copy seed data** (tool call):
   ```
   Copy references/docai-seed/ → <pkg>/seed/
   ```

3. **Upsert seed** (tool call) — creates the `docAiPipeline` configuration:
   ```
   upsertSeedData on the package
   ```

4. **Pin the embedder** (actual code):
   ```javascript
   // Run with runJsCode on the target app.
   Genai.Retriever.PgVector.forId('default-pg').withEmbedderSpec({
       "type": "Genai.Embedder.Spec",
       "embedderType": "GenaiCore.Embedder.Llm",
       "authName": "bedrock",
       "hfEmbedder": { "initKwargs": { "prompts": { "query": "query: ", "passage": "passage: " } } },
       "encodeKwargs": { "normalize_embeddings": true, "dimensions": 1024, "output_dimensionality": 1024, "input_type": "search_query" },
       "encodingBatchSize": 96,
       "providerType": "GenaiCore.Llm.Bedrock",
       "embedderModelName": "global.cohere.embed-v4:0"
   }).merge();
   ```

5. **Upload and process files** (actual code):
   ```javascript
   // Run with runJsCode on the target app
   var collection = Genai.SourceCollection.get('default-app-collection');
   
   // Upload the file (creates Genai.SourceFile with docAiPipeline wiring)
   var file = C3.File.make('/path/to/contracts/sample.pdf'); // Adjust path
   var sourceFiles = collection.upload([file]);
   
   // Process through the docAiPipeline → DocAI microservice → Indexed
   Genai.SourceFile.processWithPipeline(sourceFiles);
   ```

6. **Verify indexing** (actual code):
   ```javascript
   // Check status - should be 'Indexed'
   Genai.SourceFile.fetch({
       filter: "collection.id == 'default-app-collection'",
       include: 'id, status'
   }).objs.map(f => ({ id: f.id, status: f.status?.value }));
   ```

> ### 🚫 FORBIDDEN: Asking clarifying questions
>
> NEVER ask:
> - "Where are your files?"
> - "What's your package name?"
> - "Which approach would you prefer?"
> - "Would you like me to..."
>
> Use placeholder values and let the user adjust them.

---

> ### 🚨 Anti-patterns — DO NOT do these
>
> **1. Don't ask design questions or stall.** Never ask "keyword vs semantic?", "which file types?",
> "MVP or full?", "where are your files?", or "which approach?" — the engine is decided (DocAI), the
> stack is OOTB, and you should provide concrete example paths/code with placeholders the user can
> adjust. Act this turn, don't hold a design interview.
>
> **2. Don't build from scratch when a reference exists.** For the Documents Page UI, copy the bundled
> `references/app-ui/` — never build a custom upload UI from scratch. For agent-driven ingestion, follow
> the exact workflow in `references/docai-ingest.md`.
>
> **3. Don't stop at configuration.** For ingestion tasks, show the COMPLETE workflow: backport →
> seed → upload → processWithPipeline → verify status. Don't stop after "here's how to configure it."
>
> **4. Don't skip the backport.** On 8.11, DocAI types don't exist natively. The backport is mandatory,
> unconditional, and must happen first — no version checks, no branching.

## What the user wants to do — two options

This skill ingests unstructured documents (PDF, DOCX, …) so they're searchable, **always via DocAI**.
Map the request to one of two options — both DocAI, both backport-first:

| The user wants to… | Do this |
| --- | --- |
| **1. Ingest documents directly (agent-driven)** | **Backport the DocAI types + seed** (always, see below) → wire a `docAiPipeline` on the collection → `collection.upload([File])` creates the `Genai.SourceFile` rows → `Genai.SourceFile.processWithPipeline(...)` → DocAI → `Indexed`. See [docai-ingest](references/docai-ingest.md). |
| **2. Add a Documents Page UI to the app** | **Backport the DocAI types + seed** (always) → **copy the bundled `references/app-ui/` React library into the app's `ui/react/` and mount the exported `<DocumentsPage />`** (route/nav via `c3-frontend`) — never build the page from scratch. See the UI section in [docai-ingest](references/docai-ingest.md). |

**Recommend one option, act, mention the other — don't stall (provision-first).** Infer the most
likely option and **do it this same turn** (backport + provision / copy the UI — don't stop to make the
user choose). Then briefly mention the other so they can redirect. The only up-front question ever
warranted is *which* option (agent-ingest vs. Documents UI) when that's genuinely ambiguous — see the
anti-patterns callout below.

After ingestion (either option), searching/Q&A over the documents is Agentix's job — hand off to
`orchestrating-rag` (see [Making Documents Searchable](#making-documents-searchable-agentix)).

> ### ⚠️ Always backport the DocAI types + seed FIRST (this is 8.11 — non-negotiable, no branching)
>
> This platform is **8.11**, where `Genai.DocAiPipeline`, the `docAiPipeline` field on
> `Genai.SourceCollection`, and the DocAI seed **do not exist natively**. Both options above are DocAI,
> so you **must first backport** the DocAI types + seed into the target package — **every time, with no
> version check or branching.** The verbatim source is vendored with this skill:
>
> - Types → `<pkg>/src/backport812/`: copy [`docai-backport/`](references/docai-ingest.md) (the
>   `Genai.DocAiPipeline` type family + the `Genai.SourceCollection` remix that adds `docAiPipeline`).
> - Seed → `<pkg>/seed/`: copy [`docai-seed/`](references/docai-ingest.md) (the `default-docai-pipeline`
>   and a `default-app-collection` wired to it).
>
> Then `upsertSeedData` and confirm the types compile (`readPkgIssues`). Full procedure:
> [docai-ingest → "Setup on 8.11"](references/docai-ingest.md#setup-on-811--backport-the-docai-pipeline-types--seed).
> Skipping the backport is a failure: the `docAiPipeline` field won't compile and there's no DocAI
> pipeline for `processWithPipeline` / the UI to run. **DocAI is assumed to be configured** on the
> cluster — do not add config checks or fall back to the in-app pipeline.

> ### 🚦 Read before you start — save wasted turns
>
> **1. The GenAI stack is out-of-the-box.** The platform ships the whole `Genai.*` ingestion stack, the
> `default-pg` retriever, its vector store, and an LLM client **with no extra package dependencies.** Do
> **not** burn turns checking "are the GenAI types available?", inspecting `default-pg`, or hunting for
> the vector store / LLM client — that's all given. The one thing you always add is the DocAI backport
> above.
>
> **1a. Pinning the retriever's embedder is REQUIRED — not optional.** "The stack is OOTB" does **not**
> mean the embedder is set for you. Before indexing any documents you **must** explicitly pin the
> retriever's `embedderSpec` (the `default-pg` retriever owns the embedding model). Do **not** rely on an
> implicit cluster default and do **not** treat this as a tuning step you can skip or defer — an unset/
> wrong embedder makes passages embed with the wrong model/dimensions (or fail) and Agentix search returns
> garbage or nothing. Full procedure + spec:
> [docai-ingest → "Configure the retriever's embedder"](references/docai-ingest.md#configure-the-retrievers-embedder-embedding-model--required-not-optional).
>
> **2. Search / "chat over the docs" is NOT this skill — but check who owns the agent BEFORE handing off.** The
> moment the request involves *asking questions / a RAG chat agent / a search UI over the documents*, search
> is **not this skill's job** — do **not** research `GenaiCore.Tool.SemanticSearch`, RAG agent patterns, or
> build a bespoke retrieval/agent path here. Where the search step goes depends on who owns the agent:
> - **The RAG agent/search is ours to build in this app** (nothing external specified) → `Skill({ skill:
>   "orchestrating-rag" })` (discover + install if needed) and let it own the agent, semantic-search tool,
>   retriever wiring, and chat UI.
> - **The agent/search is cluster-owned or otherwise external** — e.g. the user scoped RAG to an existing
>   Agentix instance, or hands you an external agent handle (an agent definition id / embed the browser
>   connects to) → **do NOT discover, install, or test `orchestrating-rag`.** It is not yours to provision.
>   Treat the agent handle as an **external input**: you finish ingesting/indexing so passages land under the
>   retriever, and the external agent reads them. See rule **U** below — **user-stated scope overrides this
>   skill's default hand-off.**
>
> Either way you still owe the concrete ingest work (backport + one of the two options); the hand-off (or the
> deliberate *non*-hand-off) replaces *building search*, not the ingest.
>
> **3. Don't hold a design interview, and don't invent a bespoke search stack.** The engine is
> **decided**: DocAI ingestion into the platform retriever, search via Agentix's `orchestrating-rag`. So
> do **NOT** ask "keyword vs semantic vs RAG?", "which file types?", "MVP or full?", and do **NOT** offer
> a hand-rolled alternative (a custom `Document`/keyword-search entity, `Filter.contains` full-text, your
> own pipeline). Semantic RAG over the platform stack IS the product, it's OOTB, and it accepts
> PDFs/DOCX/etc. already. Backport, provision one of the two options this turn, hand search to Agentix.
>
> **U. User-stated scope overrides this skill's default hand-off.** This skill's default is "hand search
> to `orchestrating-rag`." If the user has already scoped that step elsewhere — a cluster-owned/existing
> Agentix instance, an externally-provided agent, "just the ingest," "don't build search" — **honor that
> boundary**: do not install, provision, or test the skill you'd normally hand off to, and do not "verify"
> the external agent. A skill's default is the fallback when scope is unstated, never a mandate that
> overrides what the user explicitly said.
>
> **W. Discovery tells you what types EXIST, never how the integration is WIRED.** `discover_skills`, a
> `.vs-cache` type survey, or an Explore sweep establishes which `Genai.*`/`GenaiCore.*` types are present
> — it does **not** establish how a feature is actually wired end-to-end. Wiring facts (which type does
> the dispatch, what an external agent handle is, what the retriever owns) come from **this skill and the
> authoritative sibling skill**, read first. Do not state an integration/wiring fact sourced only from a
> type-catalog survey; if the skill doesn't cover it, read the authoritative skill before asserting it.

## Related Skills — declare and use these (do NOT skip)

This skill hands off to sibling skills. Whenever a task touches their area, explicitly invoke the relevant skill (`Skill({ skill: "<name>" })`) — don't just mention it in prose. Rows marked **mandatory** are required for those cases (skipping them is a defect); **Recommended** rows apply when the task also needs that capability.

| When the task involves…                                                            | Invoke this skill | Always required for                     |
| ---------------------------------------------------------------------------------- | ----------------- | --------------------------------------- |
| Searching / answering questions over the ingested documents (RAG) — **and the agent is ours to build** | `orchestrating-rag` (Agentix) | search / Q&A tasks **where the agent isn't already cluster-owned/external** (see rule **U**) |
| Filtering / counting / deep-reading whole documents by metadata                    | `document-search` (Agentix)   | metadata-only browse/count tasks         |
| Adding a document upload/processing **UI** (copy `references/app-ui/` into the app) | `c3-frontend`     | **every** upload-UI task — for routes/nav/Design System wiring |
| Reading/querying the C3-type records populated by extraction (Section 2)            | `c3-crud`         | Recommended alongside extraction tasks   |

- **Q&A / search over documents → hand off to Agentix's `orchestrating-rag`, UNLESS the agent is
  external.** This skill's responsibility ends at ingesting/indexing the documents. When the user wants to
  *ask questions* over them **and the agent is ours to build**, hand the search step to Agentix's
  `orchestrating-rag` skill (see [Making Documents Searchable](#making-documents-searchable-agentix)) —
  discover and invoke it rather than building a bespoke retrieval path here. **If the agent/search is
  cluster-owned or external** (the user scoped it to an existing Agentix instance, or provides an external
  agent handle), do **not** install or test `orchestrating-rag` — treat the agent as an external input and
  stop at ingest (rule **U**).
- **Upload/processing UI → copy `references/app-ui/` and wire with `c3-frontend`.** For "add a page to
  upload documents", copy the bundled DocAI Documents UI (never build it from scratch) and invoke the
  **`c3-frontend`** skill to wire routes/nav and Design System conventions.

> **Note:** these skills are not bundled with this one. If a skill isn't already available, discover it via `discover_skills(query="orchestrating rag document search")` (C3AI-CentralMCP server) and install it with `c3-mcp-cli add-skill <name>`.

## Core Concepts

- **`Genai.DocAiPipeline`** (mixes `SeedData`) — the ingestion engine; delegates parsing/chunking/
  embedding to the DocAI microservice. Referenced from a collection via `docAiPipeline`. On 8.11 it (and
  the `docAiPipeline` field) come from the backport — see [docai-ingest](references/docai-ingest.md).
- **`Genai.SourceCollection`** (mixes `SeedData`) — a corpus of files. Key fields:
  - `rootUrl` — where files live; auto-generated from name if omitted.
  - `docAiPipeline` — reference to the DocAI pipeline (the engine).
- **`Genai.SourceFile`** — one uploaded file; created by `collection.upload([File])`, processed via
  `processWithPipeline`, reaching `status.value == 'Indexed'` when its vectors land.

**Seed file locations:**

```
seed/Genai.DocAiPipeline/<id>.json         # DocAI engine (backported on 8.11)
seed/Genai.SourceCollection/<id>.json      # collection wired to the docAiPipeline
```

The pipeline indexes passages into `Genai.Vector.SourcePassage` under the collection's retriever
(`default-pg`). **Searching those passages is Agentix's job** (`orchestrating-rag`), not this skill's —
see [Making Documents Searchable](#making-documents-searchable-agentix).

## Making Documents Searchable (Agentix)

This skill's job ends at *ingesting/indexing* documents (into `Genai.Vector.SourcePassage` via the
collection's retriever, `default-pg`). **Search / Q&A over them is Agentix's `orchestrating-rag`
skill** — it owns the agent, the semantic-search tool, and the retriever wiring, and reads exactly the
passages this skill ingests, so **no extra wiring is needed on the ingest side.** When the request
involves a chat/Q&A agent or search over the docs, invoke it **first** (per the top callout) rather
than investigating retriever/vector-store/LLM internals.

> **Handoff, not a bundled skill — and only when the agent is yours to build.** If the RAG agent is ours
> to provision in this app, discover + install: `discover_skills(query="orchestrating rag document
> search")` (C3AI-CentralMCP), `c3-mcp-cli add-skill orchestrating-rag`, then `Skill({ skill:
> "orchestrating-rag" })`. For metadata-only filtering/counting/whole-document reads (not semantic Q&A),
> Agentix's `document-search` is the counterpart — discover it the same way.
>
> **If the agent/search is cluster-owned or external** (the user scoped RAG to an existing Agentix
> instance, or hands you an external agent handle such as an agent definition id), do **not** discover,
> install, or test `orchestrating-rag`/`document-search`. It is not yours to provision or verify. Finish
> the ingest so passages land under the retriever; the external agent reads them (rule **U**).

End-to-end: **backport + ingest here** → passages land under the collection's retriever → **search in
Agentix via `orchestrating-rag`.**

## Decision Tree

```
User wants to work with documents (always 8.11 → always DocAI → always backport first)
│
├── Chat/Q&A agent or search UI OVER the docs? ("search with an agent", "ask questions")
│   └── → Agentix's job, NOT this skill. Never investigate retriever/vector-store/LLM/semantic-search.
│         Who owns the agent?
│         ├── Ours to build (nothing external stated) → Skill({ skill: "orchestrating-rag" }) FIRST.
│         └── Cluster-owned / external (user scoped it to an existing Agentix instance, or gave an
│               external agent handle / agent-definition id) → do NOT install/test orchestrating-rag;
│               treat the agent as an external input (rule U). STILL do the ingest either way.
│         STILL do the ingest (backport + one option below); the hand-off (or non-hand-off) replaces
│         building search, not the ingest.
│
├── OPTION 1 — AGENT ingests documents directly?
│   └── → Backport DocAI types + seed (always) → wire a docAiPipeline →
│         collection.upload([File]) creates the Genai.SourceFile rows →
│         Genai.SourceFile.processWithPipeline(...) → DocAI → Indexed. See references/docai-ingest.md.
│         NOTE: the app can't read your local/workspace path and rootUrl is remote blob — read the
│         reference's byte-transfer note FIRST (POST to File.writeEncoded, ~1MB parts) — don't brute-force.
│
├── OPTION 2 — Add a Documents Page UI?
│   └── → Backport DocAI types + seed (always) → copy references/app-ui/react/src/ → app
│         ui/react/src/docAiDocumentsUi/ (WHOLE folder — incl. c3-baseTokens.css, or overlays render
│         transparent), then paste 5 blocks: CSS+initDocAiI18n() in main.tsx, <DocumentsPage/> route in
│         App.tsx, nav entry, and the docAiDocumentsUi/ exclude in BOTH eslint.config.js + vite.config.mts.
│         Don't build from scratch or resurrect the genAiSearch UI. Wire via c3-frontend. See
│         references/docai-ingest.md.
│
│  (Ambiguous request → infer the best-fit option and ACT this turn, then mention the other. Ask up
│   front only when it's genuinely unclear which option. After either, hand search to orchestrating-rag.)
│
├── Sync/process files now (trigger indexing, reprocess)? → references/syncing.md
└── Extract structured data into C3 types? → (Section 2) verify the type exists; add the DocAI
      pipeline's ingestionSettings.entitiesToExtract. Consider c3-crud to read the populated records.
```

---

## 1. Ingest documents (backport → provision → process)

The full agent-driven flow — backport the DocAI types + seed, wire a `docAiPipeline`, then
`collection.upload([File])` → `processWithPipeline` — is documented step-by-step in
**[docai-ingest](references/docai-ingest.md)** (including "Setup on 8.11" and the byte-transfer note for
getting a local/workspace file's bytes into the collection's remote `rootUrl`).

For the Documents Page UI option, see the **UI reference** in the same file — copy `references/app-ui/`
and mount `<DocumentsPage />`, wiring routes/nav via `c3-frontend`.

To trigger a sync or reprocess files programmatically, see **[references/syncing.md](references/syncing.md)**.

---

## 2. Configure Tags or Extraction

To extract whole-document/per-chunk tags, or structured fields into existing C3 types, configure the
**DocAI pipeline's `ingestionSettings`** — `entitiesToExtract` (→ instances of a target C3 type) and
`tagsToExtract` (→ the file's `metadata.tags`). Full contract:
**[references/ingestion-settings.md](references/ingestion-settings.md)**.

**Extraction — required steps (all mandatory):**

1. **Identify the target C3 type from the user's request** and verify it exists — search `src/` for
   `<TypeName>.c3typ` (e.g. for "store the part ID on our `WorkOrder.Part` type", confirm
   `WorkOrder.Part` exists). If it does not exist, stop and tell the user it must be created first.
2. Add `entitiesToExtract` to the DocAI pipeline's `ingestionSettings` (per-document via
   `documentExtractor`, or per-chunk via `passageExtractor`), targeting the **user's** fully-qualified
   type — never a placeholder. See [ingestion-settings](references/ingestion-settings.md) for the exact
   spec shape.
3. To also read/query the populated records afterward, invoke `c3-crud`.
