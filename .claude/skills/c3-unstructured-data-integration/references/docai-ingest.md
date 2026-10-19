# DocAI document ingestion

DocAI (Document AI) is the engine for ingesting unstructured documents (PDF, DOCX, PPTX, images,
Markdown, …) into a target app's retriever as searchable vector passages. It is a stateless
microservice that parses, chunks, embeds, and persists passages. In a C3 app you drive it through the
in-app `Genai.DocAiPipeline` attached to a `Genai.SourceCollection` — you do **not** call the
microservice by hand for the normal flow.

On this platform (**8.11**) DocAI is **assumed to be configured** on the cluster, and the DocAI types
are **always backported** into the target package first (next section). Do not add config checks or an
in-app fallback — every ingest path here is DocAI.

## Setup on 8.11 — backport the DocAI pipeline types + seed

`Genai.DocAiPipeline` and the `docAiPipeline` reference on `Genai.SourceCollection` do not exist
natively on **8.11**, so you must **always backport the DocAI types + seed** into the target package
first (no version check, no branching) — for both agent-driven ingest and the Documents page UI. The
verbatim source is vendored under [`docai-backport/`](./docai-backport/) and
[`docai-seed/`](./docai-seed/); copy it into the target package:

- Types → `<pkg>/src/backport812/` (removed on 8.12 upgrade per GEN-21401 — DocAI is native in 8.12;
  see the header banner in [`docai-backport/collection/Genai.SourceCollection.c3typ`](./docai-backport/collection/Genai.SourceCollection.c3typ)):
  - [`pipeline/docAi/`](./docai-backport/pipeline/docAi/) — `Genai.DocAiPipeline` (`.c3typ` + `.js`),
    `Genai.DocAiPipeline.Api`, `.Config`, `.ExecuteSpec`, `Genai.DocAiStrategy` (+ `.Card`).
  - [`collection/Genai.SourceCollection.c3typ`](./docai-backport/collection/Genai.SourceCollection.c3typ)
    — the remix that adds `docAiPipeline: Genai.DocAiPipeline` to `Genai.SourceCollection`.
  - [`file/Genai.SourceFile.c3typ` + `.js`](./docai-backport/file/) — the remix that makes
    `Genai.SourceFile.processWithPipeline` **DocAI-aware** (see the note below). This is the bridge that
    connects the UI/agent dispatch entry point to `docAiPipeline.run`. **Copy it too — without it, files
    transition to `Processing` but the DocAI pod is never called and they never index.**
- Seed → `<pkg>/seed/`:
  - [`docai-seed/Genai.DocAiPipeline/default-docai-pipeline.json`](./docai-seed/Genai.DocAiPipeline/default-docai-pipeline.json)
    — a `passage_level` pipeline persisting into retriever `default-pg`.
  - [`docai-seed/Genai.SourceCollection/default-app-collection.json`](./docai-seed/Genai.SourceCollection/default-app-collection.json)
    — a default collection wired to `docAiPipeline: default-docai-pipeline`.

After copying, provision the seed (`upsertSeedData`) and confirm the types compile
(`readPkgIssues` / `gen/cache/Pkg.Issue/`).

### Configure the retriever's embedder (embedding model) — REQUIRED, NOT OPTIONAL

> ### 🛑 STOP — this step is MANDATORY. Do NOT skip it, do NOT treat it as optional, do NOT defer it.
>
> Pinning the retriever's `embedderSpec` is a **required, non-negotiable part of ingestion setup** — it is
> **as mandatory as the backport itself.** It is *not* a "nice to have," a tuning knob, or an optimization
> you can come back to later. **Every ingestion setup MUST do this before indexing any documents**, on
> every environment, with no version check or branching. Leaving the embedder unset (relying on an implicit
> cluster default) is a **setup failure**, not a shortcut: the default is **not guaranteed to exist or be
> correct** on the target cluster, and if it is wrong or absent, passages embed with the wrong model/
> dimensions (or fail), and Agentix search silently returns garbage or nothing. If you find yourself about
> to skip this because "it probably has a default" — **stop and set it explicitly.**

**Required setup — do this before indexing any documents.** The pipeline persists passages into the
retriever named by its `retrieverId` (the seed uses `default-pg`). That retriever — not the pipeline —
owns the **embedding model** used to embed passages at index time and queries at search time. You **must**
pin its `embedderSpec` explicitly: leaving it empty (`{}`) relies on an implicit platform/cluster default
that is not guaranteed to be present or correct on the target cluster, so ingestion and Agentix search
must not depend on it. Set it once with `runJsCode` on the target app:

```javascript
// Pin default-pg to Cohere embed-v4 via Bedrock (1024-dim, normalized). Adjust model/auth to your cluster.
Genai.Retriever.PgVector.forId('default-pg').withEmbedderSpec({
    "type": "Genai.Embedder.Spec",
    "embedderType": "GenaiCore.Embedder.Llm",
    "authName": "bedrock",
    "hfEmbedder": { "initKwargs": { "prompts": { "query": "query: ", "passage": "passage: " } } },
    "encodeKwargs": { "normalize_embeddings": true, "dimensions": 1024, "output_dimensionality": 1024, "input_type": "search_query"},
    "encodingBatchSize": 96,
    "providerType": "GenaiCore.Llm.Bedrock",
    "embedderModelName": "global.cohere.embed-v4:0"
}).merge();
```

> **Set this BEFORE indexing any documents.** The embedder's output dimensionality is baked into the
> pgvector column: changing it after passages exist requires **re-embedding every already-indexed file**
> (dispatch them through `Genai.SourceFile.processWithPipeline(files)` again — reprocessing re-writes each
> file's passages). Mixing vectors from two different embedders/dimensions breaks similarity search. Verify
> after indexing that a stored passage's vector has the expected dimension:
> `JSON.parse(String(Genai.Vector.SourcePassage.fetch({include:'emb', limit:1}).objs.at(0).emb)).length`.
>
> `authName` (`bedrock`) must resolve to a configured LLM auth on the cluster; `embedderModelName` must be a
> model that auth can serve. This is a **runtime** config (`.merge()`), so it is not captured in package
> seed — if you need it reproducible across environments, also encode it in the retriever's seed/data.

## How ingestion runs (pipeline flow)

Once a collection is wired to a `docAiPipeline`, ingestion is the standard SourceFile flow — the same
API the Documents UI uses (see [app-ui](#ui-reference-docai-documents-ui)). The UI and the agent both
call `Genai.SourceFile.processWithPipeline(files)` as the single dispatch entry point; that method groups
files by collection and calls the collection's pipeline `run(...)`.

> #### ⚠️ 8.11: `processWithPipeline` must be made DocAI-aware (the `file/` remix)
>
> The **platform** `Genai.SourceFile.processWithPipeline` on 8.11 *"groups files by their collection's
> `unstructuredPipeline` and calls that pipeline's run method"* — it knows nothing about the backported
> `docAiPipeline` field, and `Genai.DocAiPipeline` (`mixes SeedData, WithName`) is **not** a
> `Genai.UnstructuredPipeline`, so it can never populate `unstructuredPipeline`. For a DocAI collection
> `unstructuredPipeline` is `null`, so the stock method **dispatches nothing to the pod** — files reach
> `Processing` (the transition still runs) but never index. Only a manual
> `Genai.DocAiPipeline.forId(...).run(files)` would reach the microservice.
>
> The [`file/Genai.SourceFile.c3typ` + `.js`](./docai-backport/file/) remix closes this gap: it overrides
> `processWithPipeline` to group files by collection and route each group to
> `collection.docAiPipeline.run(files)` (falling back to `unstructuredPipeline.run` for non-DocAI
> collections, preserving platform behavior). It is a thin **router** — `Genai.DocAiPipeline.run` is
> untouched. Because `processWithPipeline` is the one choke point the upload auto-index
> (`addSourceFilesToIndex`), the grid "Process" button, and `Genai.SourceCollection` sync all funnel
> through, this single override fixes every dispatch path. Remove it on the 8.12 upgrade (GEN-21401) with the rest of
> the backport — 8.12's native `processWithPipeline` is already DocAI-aware.
>
> **The removal side has the identical blind spot — the same remix must also override
> `unprocessWithPipeline`.** The platform `unprocessWithPipeline` likewise *"groups files by their
> collection's `unstructuredPipeline` and unindexes them"*, so clicking **Unprocess** on a DocAI file
> transitions it to `Removing` (the UI does this first) and then dispatches nothing — the file is stuck in
> `Removing` forever. Removal is pipeline-agnostic (it only needs the target **retriever**), so the remix's
> `unprocessWithPipeline` override skips pipeline grouping entirely: it groups files by the retriever their
> collection targets (`docAiPipeline.retrieverId`, default `default-pg`), unindexes each group via the
> low-level `Genai.SourceFile.unprocess(files, retriever, shouldTransitionToDeleted)`, and — when **not**
> deleting — finishes the terminal transition back to `Not Indexed` via
> `Genai.SourceFile.handleTransitionToNotIndexed` (the low-level `unprocess` only moves the status itself
> when `shouldTransitionToDeleted` is true → `Deleted`). The **delete** action is fine as-is — it uses
> `unprocessAndTransitionToDeleted`, which resolves the retriever itself and does not depend on
> `unstructuredPipeline`.

The pipeline's `run(files,
executeSpec)` (see [`docai-backport/pipeline/docAi/Genai.DocAiPipeline.js`](./docai-backport/pipeline/docAi/Genai.DocAiPipeline.js)):

1. Loads the `Genai.SourceFile`s and collects their `originalFile.url`s.
2. Resolves the strategy from `strategyRef` — either a `Genai.DocAiStrategy` row (custom Python
   source or `ootbName`) or a bare built-in strategy name (e.g. `passage_level`).
3. Optionally mints presigned URLs (when `Genai.DocAiPipeline.Config.usePresignedUrls` is on) so the
   pod streams large files directly from storage instead of receiving base64 bytes inline.
4. Forwards user-curated MANUAL tags (AUTOMATIC tags are produced by the pod itself).
5. Calls `Genai.DocAiPipeline.Api.initialize()` then `Api.process(...)`, passing `sourceApp =
   C3.app().id` so the microservice reads the files and **persists results back into this app**.
6. Transitions accepted files to `PROCESSING`; the microservice later transitions each to `Indexed`
   or `Failed`. If DocAI is unconfigured/unreachable, `run()` catches the error and marks the files
   `Failed` (with the endpoint in the message) rather than stranding them in `PROCESSING`.

### Ingest a file the user provides in chat (agent-driven upload — full flow)

For "here's a file, ingest it" in the agent, you own the whole chain: **get the bytes into the
collection as `Genai.SourceFile` records, then process.** Do NOT assume the files already exist (the UI
flow below starts *after* upload). Run this with `runJsCode` on the target app:

```javascript
// 0) (8.11 only) the docAiPipeline backport + a DocAI-wired collection must already be in place.
var collection = Genai.SourceCollection.get('default-app-collection'); // or the target collection id

// 1) Turn the provided file into a C3.File. Either reference an existing FileSystem url,
//    or write bytes to a path (any url works — upload() copies it into the collection's rootUrl):
var file = C3.File.make('<some>/contract.pdf').writeString(bytes); // or C3.File.make(existingUrl)

// 2) Create the Genai.SourceFile records. collection.upload() copies each File into the
//    collection rootUrl and runs Genai.SourceFile.fromFilesBatch(...), returning the rows:
var sourceFiles = collection.upload([file]);   // → [Genai.SourceFile] (status "Not Indexed")

// 3) Process through the collection's pipeline (docAiPipeline when DocAI is configured):
Genai.SourceFile.processWithPipeline(sourceFiles); // transitions to Processing → DocAI → Indexed
```

`collection.upload([File])` is the single entry point that both **copies the bytes into the collection**
and **creates the `Genai.SourceFile` records** — don't hand-build `Genai.SourceFile`s. After step 3 the
files flow through `run(...)` exactly as below. (`Genai.SourceCollection.Utils.upload(map, transition,
tags)` is the batched variant the UI calls; the member `upload([File])` above is simplest for the agent.)

> #### ⚠️ Getting a local/workspace file's bytes into the collection (this is the actual hard part)
>
> Step 1 above glosses over the real obstacle: **the app usually can't read your local/agent workspace
> path, and the collection's `rootUrl` is remote blob storage (Azure/GCS/S3) with no shared local
> mount.** So `C3.File.make('<workspace path>')` from inside `runJsCode` will **not** see the file — you
> must push the bytes into the app first. Don't rediscover this the hard way (chunked base64 through
> `runJsCode`, `split`, Read-size limits — all dead ends that waste many round-trips and tokens).
>
> **Recommended: POST the bytes straight to the app's File REST API from the shell, so they never pass
> through the agent's context.** The workspace typically has ambient auth to the app at
> `http://localhost:9000` (or the app base url).
>
> 1. Base64-encode the file locally and POST to `File.writeEncoded` (action on `File`), e.g.
>    `POST {appBaseUrl}/api/8/File/writeEncoded` with `{ "this": { "url": "<rootUrl>/<name>" },
>    "encodedContent": "<base64>" }` (build the JSON with a script; do not paste bytes into chat).
> 2. **Request-body limit is ~1 MB**, so split the raw file into ~500 KB parts, `writeEncoded` each to a
>    `part-N` url, then **concatenate server-side** in `runJsCode`/`runPyCode` into the final file.
> 3. Verify the landed file: correct byte length and a valid magic header (e.g. `504b0304` = PK/zip for
>    PPTX/DOCX, `25504446` = `%PDF`).
>
> Then run steps 2–3 above (`collection.upload([landedFile])` → `processWithPipeline`). API gotchas seen
> in practice: `readEncoded()` returns a Java ArrayBuffer (not a C3 `Bin` — use `Bin.fromBase64(...)` /
> byte arrays to reassemble); `File.make(...)` in `runPyCode` takes a dict, not kwargs.
>
> **Simpler alternatives — prefer these when available:** if the file already lives in a bucket/source
> the app can read, point the collection's `rootUrl` there (or reference that url directly) and skip the
> byte transfer entirely; or use the **Documents Page UI** (Option 2) so the user uploads through the
> browser instead of streaming through the agent. Only do the REST-upload dance when the agent must
> ingest a purely local file itself.

### Process files that are already in the collection (UI / re-index flow)

Drive it from the app the same way the UI does:

```javascript
// Files already uploaded into the collection (status Not Indexed):
Genai.SourceFile.transitionFilesToStatus(files, 'Processing');
Genai.SourceFile.processWithPipeline(files);   // dispatches to the collection's docAiPipeline.run(...)
```

Per-run extraction overrides (tags/entities) go through `executeSpec.ingestionSettings`; the full
settings contract (parser/chunker/extractors, `pageRanges`, entity specs, failure modes) is in
[ingestion-settings](ingestion-settings.md).

## Verify

Files reach `status.value == 'Indexed'` when their vectors land. For a plain ingest that is the whole
check. If you requested tags/entities, `Indexed` does **not** guarantee they landed (extraction is
best-effort) — confirm on the target:

```javascript
Genai.SourceFile.fetch({ spec: { filter: "exists(metadata.tags)", limit: -1, include: "id" } });
```

## Debugging via the microservice REST API (advanced)

For triage you can call the DocAI microservice's `DocumentAi.Api` directly (job/run state, logs).
This is a diagnostic escape hatch, not the normal flow. Full runbook — resolving/connecting the DocAI
app, `process` / `getJob` / `getRun` / `getJobLogs` semantics, polling cadence, and OpenSearch
fallback — is in [docai-microservice-api](docai-microservice-api.md).

## UI reference: DocAI Documents UI

When the user asks for a UI to upload and process documents, **add the bundled DocAI Documents UI
directly — do NOT build a Documents page or its components from scratch.** It is a **self-contained,
drop-in React library**: the host mounts a single exported `DocumentsPage` component (which already
wires its own banner / navigation / role providers) and gets the full upload → process → grid-with-
status/tags/filters experience. Keep it as simple as possible — mount the page, don't reassemble it.

**Simplest path — copy the folder, then paste 5 blocks. Each is copy-correct; only the paths/route
name are yours to adjust.**

**Step 1 — Copy the library (mechanical).** Copy the whole [`app-ui/react/src/`](./app-ui/react/src/)
folder into the target app's `ui/react/src/docAiDocumentsUi/` **as-is** (do not cherry-pick or rewrite
internals; do not copy the `_test/` files). This includes
[`c3-baseTokens.css`](./app-ui/react/src/c3-baseTokens.css) — the raw `--c3-style-*` design tokens the
UI's colors/shadows/overlays resolve to; **omit it and token-driven surfaces (the upload modal's
backdrop and card) render fully transparent** (see the token troubleshooting note below).

**Step 2 — `main.tsx` (or the app's entry): pull in CSS + init i18n once.**

```tsx
import './docAiDocumentsUi/globals.css';
import { initDocAiI18n } from './docAiDocumentsUi';
initDocAiI18n();
```

**Step 3 — `App.tsx` (or the router): mount the page on a route.**

```tsx
import { DocumentsPage } from './docAiDocumentsUi';
// …inside your <Routes>:
<Route path="/documents" element={<DocumentsPage />} />
```

**Step 4 — `navigation.ts` (or the nav config): add one nav entry** pointing at `/documents`
(label "Documents"), following the app's existing nav-item shape.

**Step 5 — Exclude the vendored folder from linting (boilerplate, but required — skip it and the Vite
dev server throws an HMR overlay that blocks the page).** It's third-party source copied verbatim, so
lint the app but not this folder — mirroring the repo convention for `src/components/ui/**`. Add
`**/docAiDocumentsUi/**` in **both**:

`eslint.config.js` — add to the top-level `ignores` (so `npm run lint` and the build pass):

```js
ignores: ['node_modules/**', 'dist/**', 'build/**', '**/docAiDocumentsUi/**'],
```

`vite.config.mts` — add to the `eslint({ exclude: [...] })` list (so the dev server starts):

```mts
exclude: ['node_modules/**', 'src/**/__tests__/**', '**/docAiDocumentsUi/**'],
```

**Verify:** `npm run build` (lint + tsc + vite bundle) is green, and the `/documents` route renders the
grid with real `Genai.SourceFile` rows.

> #### Dependency baseline (matters when coexisting with another vendored UI library)
>
> The vendored DocAI Documents UI assumes a specific baseline. On its own in a stock template it just
> works; the friction appears when you drop it into an app that **also** vendors another library pinning
> different versions of the same singletons. What the Documents UI assumes:
>
> - **Router:** `react-router-dom` v6. It consumes the host's router context (`useLocation`/`useNavigate`),
>   so there must be **exactly one** router package/copy in the tree. If another library requires
>   `react-router` v7, converge the whole app onto one version (v7 merged the DOM exports) — two router
>   packages mean two `Router` contexts and the page's navigation silently reads the wrong provider.
> - **i18n:** `i18next` 25 / `react-i18next` 15, and it runs its **own** i18n instance via `initDocAiI18n()`
>   (it does not assume ownership of the app's instance). `i18next`/`react-i18next` must each resolve to a
>   **single hoisted copy** — if a coexisting library pins a different major, dedupe to one (mismatched
>   copies return empty translation context). The DocAI UI only relies on the stable `initReactI18next` API,
>   so a coordinated major bump is low-risk.
> - **Data fetching:** all backend calls go through `c3Action`, which needs the C3 dev proxy. When merging
>   Vite configs, **keep the C3 `/api` proxy** (see the 404 note below) — do not let another template's embed
>   config replace it. Merge singleton-pinning/`@source` registration on top; don't drop the proxy.
> - **Type-check vs lint:** the folder is **type-checked** (`tsconfig.build.json`) but **not linted** (Step 5).
>   Keep it that way — excluding it from `tsc` too would silence real breakage in the vendored source.
>
> General rule: the Documents UI is a well-behaved peer (it owns its own i18n instance, reads the host
> router, and namespaces its styles), but **singletons must stay single** — react-router and i18next each
> need one shared copy across the app and any coexisting library.

Only touch the individual files below if the user asks to **customize** something specific (rename,
retheme, compose a subset). `DocumentsPage` already wires its own providers/banner/nav — mounting it is
the whole task; do not reassemble it from `UploadModal`/grid pieces, and do not reintroduce the old
genAiSearch search UI. This UI covers **upload + processing/status** only — searching and asking
questions over the ingested documents is done in Agentix (via the `orchestrating-rag` skill), not here.

**Wire host routing/nav with `c3-frontend`.** Steps 3–4 depend on the host app's router/nav conventions
— invoke the `c3-frontend` skill for the exact route/nav shape and C3 Design System integration.

> #### Troubleshooting: grid/upload calls 404 (nginx HTML, not C3 JSON)
>
> If the grid won't load and uploads fail, and the failing requests hit **bare `/api/8/Genai.SourceFile`
> (no `/<env>/<app>/` prefix)** returning an **nginx HTML `404 Not Found`** (not a C3 JSON error), the
> backend is fine — the request never reached the app because the URL had no env/app prefix. Diagnostic
> distinction: a missing type returns a **C3 JSON** error (`"Type not found"`) *from the app*; an
> **nginx HTML 404** means no route matched. Compare against calls that succeed in the same panel — they
> carry a prefix (`/dev/studio/api/8/...`, `/<env>/<app>/...`).
>
> Cause: `getAppBaseUrl()` (in [`c3Action.ts`](./app-ui/react/src/c3Action.ts), feeding
> [`shared/api.ts`](./app-ui/react/src/shared/api.ts)) reconstructs the `<origin>/<env>/<app>` prefix
> that C3's server-side `C3.app()` provides. **The root-cause trap: do NOT gate on
> `import.meta.env.DEV`.** The deployed liveapp is served by the *same* Vite server (so
> `import.meta.env.DEV` is `true` there too), but nginx exposes it *without* the `^/api` dev proxy — so
> a `DEV`-gated `return ''` fires in the deployed app and emits a bare `origin/api/8/...` URL → nginx
> HTML 404. **Gate on the runtime hostname instead**: only a genuine localhost (`localhost` /
> `127.0.0.1` / `[::1]`) returns `''` to trust the local Vite proxy; every deployed host derives the
> real prefix. On a deployed host the env/app come, in order, from: the `c3AppUrlPrefix` cookie, or
> `c3env`+`c3app` (blank/whitespace cookies treated as absent — the liveapp sets an empty
> `c3AppUrlPrefix=`), else `deriveEnvAppPrefixFromPath(window.location.pathname)` (the first two path
> segments before a known C3 service segment). The vendored copy already does all of this; if you
> re-vendor from upstream and see this symptom, restore the **hostname gate** and the path-derivation
> fallback — nothing is hardcoded and no `VITE_C3_*` env vars are required for the deployed app to work.

> #### Troubleshooting: upload modal (or overlays) render transparent / unstyled
>
> If the page and grid look styled but the **Upload modal has no dim backdrop and no white card** — you
> see the grid straight through it, text colliding — the layout is fine but the **color/shadow tokens are
> resolving to empty**. Symptom check: in devtools the backdrop has `position: fixed; inset: 0` applied
> correctly, but its computed `background-color` is `rgba(0,0,0,0)` and `box-shadow` is `none`; every
> `--c3-style-*` variable resolves to empty string.
>
> Cause: the theme layer is split. [`tailwind/c3TailwindTheme.css`](./app-ui/react/src/tailwind/c3TailwindTheme.css)
> only **maps** Tailwind utilities onto the tokens (`--color-primary-bg: var(--c3-style-colorBgPrimary)`);
> it does **not** define the raw `--c3-style-*` values. Those live in
> [`c3-baseTokens.css`](./app-ui/react/src/c3-baseTokens.css), which `globals.css` imports **first**. If
> that file is missing (e.g. only part of `src/` was copied) or `globals.css` isn't imported, the whole
> color/shadow layer bottoms out at nothing. The grid mostly survives on plain layout, but the modal —
> which relies entirely on `bg-overlay` / `bg-primary` / `shadow-menu` for its container — becomes
> invisible. **Fix: copy `c3-baseTokens.css` and keep its `@import` at the top of `globals.css`.** Do not
> try to bridge into the host app's own token vocabulary (`--c3-style-basic-*` / `--theme-*`) — that's a
> different token set and won't match; the vendored library self-supplies its tokens.

> #### Troubleshooting: clicking a file name opens a blank page / a new chat instead of the document
>
> If clicking an uploaded file's name in the grid **navigates inside the app** (lands on the default
> route / a new chat) or opens a **blank tab** instead of showing the PDF, the file link is being built
> wrong. Files are stored as C3 cloud-storage URLs (`s3://…`, `azure://…`, `gs://…`) that a browser
> **cannot open directly**, and `Genai.SourceFile.displayUrl` from the backend is a **relative,
> unencoded** `file/s3://…` path. Rendered as an `<a href>` it resolves against the SPA document URL, so
> the browser routes *inside* the single-page app.
>
> Fix: view files through the C3 **file servlet** — `GET <appBaseUrl>/file/{url-encoded-storage-path}`,
> an authenticating proxy that fetches the blob from cloud storage and streams it back over HTTPS (the
> browser never touches S3/Azure/GCS). [`shared/fileServletUrl.ts`](./app-ui/react/src/shared/fileServletUrl.ts)
> provides `buildViewSourceFileHref(rawUrl)` → `` `${getAppBaseUrl()}/file/${encodeURIComponent(rawUrl)}` ``.
> **URL-encoding the storage path is the essential detail** — left raw, the `s3://` scheme sits inside
> the servlet path and yields an un-openable link (`…/file/s3://bucket/…`); encoded it becomes
> `…/file/s3%3A%2F%2Fbucket%2F…`, which the servlet decodes and resolves. `transformSourceFile.ts` builds
> each row's `displayUrl` from `originalFile.url` via this helper, and the grid keeps a plain
> `<a href={doc.displayUrl} target="_blank">` (synchronous, right-clickable — no pre-signed round-trip,
> no popup-blocker/`window.open` pitfalls).
>
> Because the base is derived at runtime from `getAppBaseUrl()` (`<origin>/<env>/<app>`, from the
> `c3AppUrlPrefix`/`c3env`+`c3app` cookies or the path) and the servlet is co-located with the app, the
> link is **portable across MNE and SNE** with nothing hardcoded. Do **not** substitute a pre-signed
> cloud-storage URL (e.g. `File.generatePresignedUrl`): those are region-specific and time-limited, so
> they couple the UI to a single environment and expire.

Files inside the library (only relevant if customizing — otherwise just mount `DocumentsPage`):

| File | Role |
| --- | --- |
| [`shared/api.ts`](./app-ui/react/src/shared/api.ts) | The whole backend contract: `uploadToSourceCollection`, `processWithPipeline`, `fetchSourceFiles`, `transitionFilesToStatus`, tag/filter helpers. Pipeline-agnostic — routes to DocAI or the legacy pipeline based on the collection. |
| [`c3Action.ts`](./app-ui/react/src/c3Action.ts) | Thin `c3Action` / `getAppBaseUrl` wrapper over the C3 REST API. |
| [`shared/fileServletUrl.ts`](./app-ui/react/src/shared/fileServletUrl.ts) | `buildViewSourceFileHref(rawUrl)` — builds the HTTPS C3 file-servlet link (`<appBaseUrl>/file/{url-encoded-storage-path}`) used to view/open an uploaded file. See the blank-page/new-chat troubleshooting note above. |
| [`globals.css`](./app-ui/react/src/globals.css) / [`c3-baseTokens.css`](./app-ui/react/src/c3-baseTokens.css) | Style entry point. `globals.css` imports `c3-baseTokens.css` (raw `--c3-style-*` design tokens), then the Tailwind theme/utility mappings. Both are required — see the transparent-modal note above. |
| [`pages/DataPage.tsx`](./app-ui/react/src/pages/DataPage.tsx) | The Documents page: header + upload trigger + grid. |
| [`pages/components/upload/`](./app-ui/react/src/pages/components/upload/) | Upload modal, file validation (`uploadUtils.ts`), tags section. |
| [`pages/components/`](./app-ui/react/src/pages/components/) | Grid, filters, status cells, tag pills, details/delete modals, warning banner. |
| [`constants/genAiRoles.ts`](./app-ui/react/src/constants/genAiRoles.ts), [`contexts/GenAiRoleContext.tsx`](./app-ui/react/src/contexts/GenAiRoleContext.tsx) | Permission model. **Role gating is disabled by default** — `computeGenAiRoleFlags` returns all-true so every user sees the full UI (upload/manage/banner). The `GenAiSearch.Role.*` ids here are **only** role identifiers (not the old search feature); restore the role checks in `computeGenAiRoleFlags` to re-gate. |

> **Upload button visibility.** The upload / manage / bulk-index controls are driven by
> `computeGenAiRoleFlags(...).isAtLeastDocAdmin` (in [`constants/genAiRoles.ts`](./app-ui/react/src/constants/genAiRoles.ts)).
> In this bundle that function is set to return **all-true**, so **every user sees the upload button** and
> full document-management actions — no role assignment needed. If a deployment wants to restrict who can
> upload/manage, re-enable the role-id checks in `computeGenAiRoleFlags` (the `GENAI_ROLE_IDS_*` constants
> are kept for exactly that) and assign users a doc-admin/admin role (e.g. `Genai.AdminUser` or
> `GenAiSearch.Role.DocumentAdmin`).

The UI is pipeline-agnostic: it uploads files into a `Genai.SourceCollection` and calls
`processWithPipeline`, which dispatches to whichever pipeline (`docAiPipeline` when configured) the
collection carries. So the same UI works for DocAI and, if you must fall back, the legacy pipeline.

Use `c3-frontend` only for host-app wiring (route, nav entry, C3 Design System). Do not copy the tests.
