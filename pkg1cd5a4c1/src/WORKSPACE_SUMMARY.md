# Workspace Summary

> Work-to-date map of this workspace. Keep it concise — a map, not a transcript. See
> `src/TEMPLATE_SUMMARY.md` for the template's initial state (structure, `c3Action` API, routing).

## Current state

**HeatLeak AI — Intelligent Thermal Building Diagnostics** is built end-to-end: an AI-assisted
building-energy inspection app. Core flow: **upload thermal image → detect suspicious thermal
patterns (real client-side pixel analysis) → highlight anomalies → generate AI inspection report
(backend LLM) → compare repair scenarios.** Tagline: "See the energy you cannot see." Dark
navy/charcoal theme with teal/cyan accents. No university references; works with any building's
thermal images.

Honest AI pipeline: real pixel-level computer vision runs **client-side** (`thermalAnalysis.ts`)
to find candidate regions from the actual uploaded image; those regions are sent to the backend,
where an LLM (`GenaiCore.Llm.Completion.Client` "default-completions") writes per-finding
explanations. Scientific caveats are shown throughout (warm colors ≠ heat loss, palettes differ,
reflections/emissivity, no radiometric metadata ⇒ no absolute temperatures, anomaly ≠ confirmed
defect). `npm run build` (eslint --quiet + tsc + vite) passes clean.

Runtime state: 4 fictional **sample** buildings seeded (`isDemo=true`); 0 inspections/anomalies/
scenarios (demo-ready — demo data is generated on demand from the Overview "Load demo data" button,
which runs the real analysis pipeline over synthetic thermal images).

## Additions (tejal-main)

- **Detection** (`thermalAnalysis.ts`): local-contrast scoring (cell vs. its neighborhood, not the
  whole-image mean) so sky/ice/large uniform surfaces are not flagged; rejects camera scale bars,
  whole-surface regions (>20% of frame), and step edges (rooflines) via a side-contrast check.
  Palette-aware warmth scoring (`ThermalPalette`: auto/iron/rainbow/white-hot/black-hot) chosen on
  the upload form and stored on `ThermalInspection.palette`. Uploads always stored as JPEG ≤960px.
- **Manual regions**: Analysis page "Draw region" → `measureRegion` (box vs. surrounding ring) →
  member `interpretRegion(regionJson)` (LLM, `source='manual'`, optional `inspectorNote`).
- **Edit/remove findings**: `ThermalAnomaly` merge for text/category/priority edits; member
  `removeAnomaly(anomalyId)` renumbers remaining findings. Annotated image is re-rendered client-side
  and saved after add/remove.
- **Simulate a repair**: finding panel links to `/simulator?intervention=…&name=…` (category →
  intervention via `interventionForCategory`), simulator prefills with a caution banner.
- `c3Action` now always throws `Error` with the server message; New Inspection reports which step failed.
- `analyze` persists new anomalies with `upsertBatch` (was `mergeBatch`, which only updates existing).

## Packages

- `pkg1cd5a4c1` (main) — depends on `mcpServer` 8.10 (provides `genaiPlatform` → LLM client).

## Backend types (`src/`)

- **Building.c3typ** — entity; name, buildingType, location, isDemo; `inspections` (inverse of
  ThermalInspection.building).
- **ThermalInspection.c3typ** (+ **.py**) — entity; building ref, buildingName/Type,
  inspectionDate, status (Needs Review/Under Investigation/Verified/Resolved), indoor/outdoorTempC,
  notes, originalImage/annotatedImage (data URLs), imageWidth/Height, analyzed, anomalyCount,
  priority, summary, isDemo; `anomalies` (inverse). **Member method `analyze(regionsJson: string)`**
  (`py`): takes client-detected regions, calls the LLM to author observation/possibleCauses/
  alternativeExplanations/verificationStep/category/priority per region, creates ThermalAnomaly
  records, sets summary + overall priority + anomalyCount, marks analyzed. Invoke from UI via
  `c3MemberAction('ThermalInspection','analyze',{id},[regionsJson])`; from runtime via an instance
  (`ThermalInspection.make({id}).analyze(json)`) — NOT a static `Type.analyze({id}, json)` call.
- **ThermalAnomaly.c3typ** — entity; inspection ref, anomalyIndex, polarity (hot/cold), category,
  xPct/yPct/wPct/hPct (normalized box), areaPct, relativeIntensity, locationLabel, observation,
  possibleCauses, alternativeExplanations, verificationStep, priority.
- **RepairScenario.c3typ** (+ **.js**) — entity; name, interventionType, repairCost,
  annualEnergySavingsKwh, electricityPricePerKwh, emissionsFactorKgPerKwh. **Static method
  `computeScenario(cost, savingsKwh, price, emissionFactor): RepairScenarioResult`** (`js`):
  annualCostSavings = savingsKwh×price; simplePaybackYears = cost÷annualCostSavings (null when
  savings ≤ 0); annualEmissionsReductionKg = savingsKwh×emissionFactor.
- **RepairScenarioResult.c3typ** — value type: annualCostSavings, simplePaybackYears (nullable),
  annualEmissionsReductionKg.

## UI pages / routes (`ui/react/src/`)

App chrome: `App.tsx` — `TopNav title="HeatLeak AI"` + HeatLeakLogo SVG; HashRouter.
Nav (`config/navigation.ts`, 6 items): Overview `/`, New Inspection `/inspections/new`,
Thermal Analysis `/analysis`, Inspection Reports `/reports`, Buildings `/buildings`,
Impact Simulator `/simulator`.

- **Overview** (`/`) — hero, New-inspection + Load-demo-data buttons (progress), 4 metric cards
  (computed from records), status PieChart, anomaly-priority BarChart, recent activity,
  CautionNotice; empty state.
- **NewInspection** (`/inspections/new`) — drag/drop JPG/PNG upload, real preview, building/type/
  temps/notes form → `analyzeThermalImage` → `ensureBuilding` → `createInspection` →
  `analyzeInspection` → redirect to `/analysis/:id`.
- **Analysis** (`/analysis`) list + **AnalysisDetail** (`/analysis/:id`) — interactive
  ThermalImageViewer (DOM boxes + before/after slider), AnomalyList + AnomalyPanel (shared
  activeIndex), status Combobox, link to report.
- **Reports** (`/reports`) list + **ReportDetail** (`/reports/:id`) — structured printable report
  (metadata, images, summary, caveats, detailed findings, disclaimer), status/Reopen controls,
  Print/PDF (`window.print()`, `hl-no-print`/`hl-print-full`).
- **Buildings** (`/buildings`) — building cards (inspection + unresolved counts), add-building
  Modal, delete (non-demo only), "Fictional" badge for samples.
- **Simulator** (`/simulator`) — scenario form, Compare (local) + Save (persisted), comparison
  BarChart, results table (cost/savings/payback/CO₂), hypothetical disclaimers.
- `*` → not-found.

Shared: `lib/heatleak.ts` (all c3Action wiring, types, formatters, constants),
`lib/thermalAnalysis.ts` (client-side CV: thermal score, grid z-score, connected components,
annotated-canvas render), `lib/thermalDemo.ts` (3 synthetic demo scenarios run through the real
pipeline), components `heatleak/ThermalImageViewer`, `AnomalyViews` (List+Panel), `CautionNotice`,
`DemoBadge`; `styles/heatleak.css` (hl-* tokens/classes), dark theme default.

## Seed / data

- `data/Building/sampleBuildings.json` — 4 fictional sample buildings (`isDemo=true`), e.g.
  `seed_building_maple_residence`. Loaded via `upsertSeedData`.
- No seeded inspections/anomalies/scenarios — demo inspections are generated on demand by
  `thermalDemo.ts` (real analysis over synthetic images), flagged `isDemo=true`.

## Key decisions

- **Honest pipeline:** real pixel CV client-side; LLM only writes prose explanations for
  already-detected regions. No fabricated boxes; no claimed absolute temperatures.
- **LLM:** `GenaiCore.Llm.Completion.Client.forConfigKey('default-completions')`, `returnJson`,
  no temperature override (model supports temp=1 only).
- `analyze` is a **member** method — call via instance / `c3MemberAction`, never statically.
- Lint-strict build: no unused/any, escaped JSX, real buttons, `htmlFor` labels, and
  jsx-a11y/img-redundant-alt (alt text avoids "image"/"photo"/"picture" → "thermal scan").
- `VITE_C3_PKG` is supplied by C3 Code at build time; never create/modify `.env`.
