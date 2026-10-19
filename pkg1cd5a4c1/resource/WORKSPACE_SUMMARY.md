# HeatLeak AI — Workspace Summary

Concise map of the app for agents working in this workspace. Keep it current; it is not a transcript.

## Package

- **`pkg1cd5a4c1`** (depends on `mcpServer 8.10`). Backend env for this workspace: `gs602427be` / app `liveapp`.
- UI: React 18 + Vite 6 + Tailwind v4 at `pkg1cd5a4c1/ui/react` (HashRouter). Build: `VITE_C3_PKG=pkg1cd5a4c1 npm run build` (lint → tsc → vite; the env var normally comes from Studio — never add a `.env`).
- Team plan (Oct 19 2026 build): four lanes on branches `feat/vision-engine` (B), `feat/scout-and-samples` (A), `feat/triage-queue` (D), `feat/next-steps-sim` (C). File ownership is strict; `lib/heatleak.ts` is add-only with one `/* ---- <letter> ---- */` block per person. Merge order B → A → D → C.

## Backend types (`src/`)

| Type | Notes |
| --- | --- |
| `Building` | name, buildingType, location, isDemo; inverse `inspections`. Seed: `data/Building/sampleBuildings.json` (4 fictional buildings). |
| `ThermalInspection` | building, buildingName/Type, inspectionDate, status (`Needs Review` / `Under Investigation` / `Verified` / `Resolved`), notes, temps, `originalImage` / `annotatedImage` (base64 data URLs), summary, priority, anomalyCount (kept findings only), analyzed, isDemo; `anomalies` inverse; member `analyze(regionsJson)` (Python, LLM). B adds `explanationSource` (`vision` / `text` / `template`). |
| `ThermalAnomaly` | inspection, anomalyIndex (contiguous display order: kept scout regions, vision additions, rejected), category (five fixed strings), polarity, bbox `xPct/yPct/wPct/hPct`, relativeIntensity, areaPct, locationLabel, four prose fields, priority. B adds `rejected`, `rejectionReason`, `source` (`cv` / `vision`). |
| `RepairScenario` / `RepairScenarioResult` | simulator rows; static `computeScenario(cost, kWh, price, factor)` (JS). `RepairScenario.inspection` exists (C wires it). |

Until B's types are provisioned, the client types the new fields as optional via `ui/react/src/types/heatleak-contract.d.ts` (module augmentation; delete or keep at merge).

## UI (`ui/react/src`)

| Route | Page | Data |
| --- | --- | --- |
| `/` | `pages/Overview` — hero, four metric cards, **Triage queue** table (buildings ranked High→Medium→Low, open findings, last inspected), status pie, priority bar, recent activity with `explanationSource` tag | `fetchInspectionsLight`, `fetchBuildings`, `fetchAnomaliesWithInspection` |
| `/inspections/new` | `pages/NewInspection` (A's lane) — upload → scout → `analyzeInspection` | |
| `/analysis`, `/analysis/:id` | `pages/Analysis` list (thumbnails + source tag); `AnalysisDetail` — viewer left, findings right, "Screening observations, not a diagnosis.", explanation badge, dismissed-by-model group | `fetchInspections`, `fetchInspection` |
| `/reports`, `/reports/:id` | `pages/Reports` list (source tag); `ReportDetail` — printable document, explanation sentence, kept findings only + "Dismissed by model" line, `<NextSteps>` (C's component; null stub until merge), `CautionNotice` stays here only | `fetchInspections`, `fetchInspection` |
| `/buildings` | `pages/Buildings` — untouched | |
| `/simulator` | `pages/Simulator` (C's lane; `?inspection=<id>` prefill) | |

Shared pieces: `lib/heatleak.ts` (typed `c3Action` wrappers, enums, formatters; D block adds light fetches, `explanationSourceLabel/Sentence`, `priorityRank`), `components/heatleak/ThermalImageViewer.tsx` (DOM boxes; `.hl-box-rejected` dashed grey × boxes, `.hl-box-vision` dashed, `showRejected` prop), `AnomalyViews.tsx` (kept rows + collapsible dismissed group; panel shows only the reason for a dismissed one), `styles/heatleak.css` (tokens, box styles, `.hl-tag`, print rules that un-clip the fixed-height shell), `lib/thermalAnalysis.ts` (pixel scout, A's lane), `lib/thermalDemo.ts` (synthetic demo loader — no longer referenced by the UI; left on disk by agreement).

## Data in this environment

- 4 seed buildings (`isDemo=true`).
- 3 synthetic **test** inspections (`test_insp_a1`, `test_insp_a2` on "Sample — Community Library"; `test_insp_b1` on "Sample — Downtown Office Block") with 7 anomalies, created via `runJsCode` for triage-queue verification. Safe to delete (`ThermalInspection`/`ThermalAnomaly` ids prefixed `test_insp_`).

## Verification notes

- The preview at `localhost:9000` is not reachable from the agent container here; a Vite on `[::1]:5173` lacks the `@` alias and API proxy. UI checks were done by serving the production bundle through Playwright `route.fulfill({ path })` with `/api/8/*` mocked to real-shaped records (`.playwright/d-pass-*.js`, gitignored), and FetchSpecs were replayed against the live backend with `runJsCode`.
- Lint is strict: no `any`, no unused vars, `import/export` rejects duplicate exported interface names (hence the `.d.ts` augmentation instead of re-opening interfaces in `heatleak.ts`).
