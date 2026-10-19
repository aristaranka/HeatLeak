# agentixChatPkg UI — Nexus Chat embed

This is the consumer SPA that embeds the Nexus Agent chat via the zero-BFF `<NexusChatEmbed>`
drop-in. It mounts the chat library vendored alongside it at `../agentix-chat-ui`
(`@c3/agentix-client-ui`, wired as `file:../agentix-chat-ui`).

## Layout

```
ui/
  agentix-chat-ui/     ← vendored chat library (@c3/agentix-client-ui, "c3ShipUiContent": false)
                          ships its OWN look (styles/embed.css + Geist fonts) and en i18n
                          packs (locales/en/*.json + lib/i18nDefaults.ts) — applied automatically
  react/
    src/
      main.tsx         ← providers + HashRouter + initTheme() (default LIGHT); mirrors demo/main.tsx
      i18n.ts          ← consumer i18next bootstrap (mirrors demo/i18n.ts; empty NS, library fills them)
      EmbedRoutes.tsx  ← <NexusChatEmbed agentDefId="C3Agent" + ALL 7 surface props ON/> at /chat
                          (no nexusBase); wrapper classes mirror demo/EmbedDemoRoutes
      globals.css      ← VERBATIM copy of the ZIP demo's demo/demo.css: @import 'tailwindcss' +
                          'tw-animate-css' + '@c3/agentix-client-ui/tailwind-sources.css' +
                          @plugin '@tailwindcss/typography' + @source + '@c3/agentix-client-ui/
                          styles/theme.css' (LAST) + a page-level @layer base block. The consumer
                          resolves the library FROM SOURCE (same as the demo), so this single
                          coherent Tailwind pass scans the library + this app's own files and the
                          tokens/fonts come from the library's theme.css — identical to the demo.
      assets/c3Logo.png ← favicon (the only consumer-owned asset)
    build-types/       ← build-only ambient stubs for the vendored library (see Scripts)
    viteShared.ts      ← resolution helpers (@/ fallback, singleton pinning)
    vite.config.mts    ← C3 build integration + embed resolution model
```

The consumer is a **faithful mirror of the shipped ZIP demo consumer** (`demo/`), which is the
known-good reference that renders the chat correctly. It differs only in the required deploy
adaptations (HashRouter, the C3 vite build config, the `tsconfig.build.json` stub, the consumer
`index.html`, and `package.json` deps). Its CSS entry, i18n bootstrap, provider tree, and wrapper
classes are copied from the demo verbatim.

## Setup

Use **Node.js 20.18+** (LTS) and **npm ≥ 10**. Install **only** this app — the vendored library needs
no `node_modules` of its own (mimicking C3 Studio, which never installs there); its runtime deps
resolve from this app's install:

```sh
npm install
```

Create a `.env` in this folder for local dev / build:

```
VITE_C3_PKG=<pkg_name>     # required — build output goes to ../content/<pkg_name>
VITE_C3_ENV=<env_name>     # used to compute the dev server base
VITE_C3_APP=<app_name>
```

## Scripts

### `npm run build` / `npm run build:ui`

Lints `src`, type-checks (`tsc -p tsconfig.build.json`), then runs `vite build`, producing the
shipped bundle at `../content/<VITE_C3_PKG>`.

> **Scope of the type-check.** `tsconfig.build.json` type-checks only the **consumer's own
> `src/**`** — the vendored library (`../agentix-chat-ui/src/**`) is deliberately excluded from
> `tsc`. It ships pre-type-checked from its own repo, and in the deploy layout it has no
> `node_modules`, so its bare imports (react-i18next, lucide-react, …) can't resolve. The build
> config drops the `paths` legs that resolve into library source and points library imports at the
> build-only ambient stubs in `build-types/`, so the library is treated as an opaque external
> dependency. `tsconfig.json` (the editor/IDE config) is unchanged and still resolves the real
> library types for IntelliSense.

> The chat **cannot run standalone** on a laptop — it signs in via a same-origin cookie exchange that
> only exists on the deployed cluster host (see the package `SETUP.md`). A clean type-check plus a
> successful `vite build` is the success criterion locally.

### `npm run dev`

Runs Vite for local iteration. The chat will render but never sign in off-cluster.

## Resolution model

- `@/…` resolves `[./src, ../agentix-chat-ui/src]` — consumer files win, then the library.
- `@c3/agentix-client-ui` aliases to `../agentix-chat-ui/src`.
- The libraries in `singletonLibs.ts` (React, react-router, react-i18next, radix-ui, tiptap, etc.)
  are pinned to this app's single copy and deduped — context-bearing libs must resolve exactly once
  or the chat renders with empty context. `viteShared.ts` (verbatim from the ZIP demo) imports that
  list straight from `../agentix-chat-ui/singletonLibs`, so it stays in sync with the library.
- This `package.json` lists `@c3/agentix-client-ui` (the vendored library) **plus every runtime dep
  the library imports** (marked, dompurify, the tiptap extensions, the MCP SDK, i18next, …). They are
  all listed here because the deploy pipeline runs `npm install` ONLY in this app — the vendored
  library has no `node_modules` of its own — so a single install here must be self-sufficient. The
  singletons among them are additionally pinned in `vite.config.mts`. Note the library declares
  `i18next` / `react-i18next` / `react` / `react-dom` as **peerDependencies**, so this app provides
  them (it already does).

## Styling & i18n — mirror the ZIP demo

This consumer's styling and i18n are a **verbatim mirror of the shipped demo** (`demo/demo.css`,
`demo/i18n.ts`, `demo/main.tsx`, `demo/EmbedDemoRoutes.tsx`). The demo is the known-good reference:
it renders the chat correctly, and this consumer resolves `@c3/agentix-client-ui` **from source** the
exact same way the demo does (`vite.config.mts` aliases `@c3/agentix-client-ui` → `../agentix-chat-ui/src`,
matching the demo's `vite.demo.config.ts`). So it must build styling the same way.

`globals.css` is copied VERBATIM from `demo/demo.css`:

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import '@c3/agentix-client-ui/tailwind-sources.css';
@source inline("… layout-critical arbitrary-value utilities …");
@plugin '@tailwindcss/typography';
@source './**/*.tsx';
@source './**/*.ts';
@import '@c3/agentix-client-ui/styles/theme.css';   /* design system LAST */
@layer base { /* page-level surface: box-sizing, html/body/#root height+font, a/input/button/pre/code */ }
```

One coherent Tailwind pass scans the library source (via `tailwind-sources.css`) plus this app's own
files — this is what emits every chat utility AND the layout utilities this app's wrapper uses
(`h-screen`, `flex`, `min-h-0`, …). The chat's **tokens/fonts/base** (Geist `@font-face`, the color
token layer light+dark, the host type scale, the `@theme inline` ShadCN bridge, the `dark:` variant)
come from the library's `styles/theme.css`, imported LAST so its `@layer base` lands in order — the
SAME single package-exported source the Nexus host imports, so it can never drift from the host. The
trailing `@layer base` block ports the host's page-level surface rules (the ones `theme.css`
deliberately omits so importing it never restyles a consumer page) for this full-page consumer.
**This is byte-for-byte what the demo does.** The English `common`/`chat`/`connect` text also ships in
the library (`locales/en/*.json` + `lib/i18nDefaults.ts`) and is registered at mount into the
react-i18next instance this consumer bootstraps in `i18n.ts` (empty namespaces, so the library's packs
fill them).

> **Built-CSS parity proof (AGX-2553).** A fresh build of the shipped demo and of this consumer emit a
> **341 kB** `index.css` with an **identical single coherent `@layer` order** —
> `properties, theme, base, components, utilities` (`utilities` LAST, Preflight present exactly once,
> `components` NOT outranking `utilities`). The ONLY rule-level difference is a single extra
> `.invisible{visibility:hidden}` in this consumer (from its all-props-on `NexusChatEmbed` surface);
> every other rule is byte-identical. The divider is `bg-transparent` at rest (no non-hover
> `bg-primary` rule), Geist `@font-face` is present (4 faces, woff2), `--accent:#2266f0` (light) /
> `#93c5fd` (dark), `--border:#d8dce8` (light), `--radius:8px`, `--text-base:1rem` /
> `--text-base--line-height:1.5`. (This supersedes the earlier "no second Tailwind build / doubled
> layer order" theory — building the demo disproved it: the demo resolves the library from source, so
> there is only ONE Tailwind build, and mirroring the demo's exact CSS entry is the fix.)

### All surface props ON + deploy adaptations

`EmbedRoutes.tsx` mounts `<NexusChatEmbed>` with **every** surface prop enabled — matching the ZIP
demo's `EmbedDemoRoutes`, which turns them all on:

```tsx
<NexusChatEmbed
  agentDefId="C3Agent"
  allowAgentSwitch
  workspaceEnabled
  connectAppsEnabled
  crossClusterOAuthEnabled   /* new in this library drop — forwarded through to ChatPage */
  modelControlsEnabled
  sessionSidebarEnabled
  mcpAppsEnabled             /* the new library forwards this (earlier drops did NOT) */
/>
```

The new library's `NexusChatEmbedProps` gained `crossClusterOAuthEnabled` and now forwards
`mcpAppsEnabled` straight through to `ChatPage`, so all seven optional surfaces can be enabled with no
library edit. This template opts into every one for full Nexus-host parity.

The **deploy adaptations** vs the verbatim demo consumer are:

- **HashRouter, not BrowserRouter** (`main.tsx`) — served under the Genesis gateway inside the Studio
  iframe; hash routing is opaque to the gateway and needs no basename. Consequently the demo's
  `resolveBasename.ts` / `basename.ts` are **not** vendored (a basename is meaningless under
  HashRouter — routing lives in the fragment).
- **No `nexusBase`** (`EmbedRoutes.tsx`) — the library's `resolveNexusMount.ts` derives the discovery
  base from the served path (`deriveGatewayBase`), so mount discovery resolves on its own behind the
  gateway. (The demo passes `nexusBase={VITE_NEXUS_BASE}` only to feed its local dev-server proxy;
  that var is unset in built bundles and this deploy has no such proxy.)
- **`index.html`** — keeps the FOUC theme script, the `c3Logo.png` favicon, and the `./src/main.tsx`
  entry (the demo has none of these and points at `/main.tsx`); root element/classes match the demo.
- **`globals.css`** filename (the demo's is `demo.css`) — contents are byte-identical.
- **`vite.config.mts`** — the C3 build integration (`outDir ../content/<VITE_C3_PKG>`, asset naming,
  `serve` base, `manualChunks`) plus the `tsconfig.build.json` stub; the embed **resolution model**
  (library-from-source aliases, singleton pinning, `@/` legs, `viteShared.ts`, Tailwind `@source`) is
  copied from the demo's `vite.demo.config.ts`.
- **`package.json`** — the C3 lint/build scripts + eslint devDeps; runtime deps reconciled to the
  union of the new library's `dependencies` + `peerDependencies` (a superset match already).

### Full-height layout + base surface come from the library + the demo's globals

There are **no** hand-authored consumer style rules for layout or density — they come from the
demo-mirrored `globals.css`. The `@layer base` block ported from `demo/demo.css` supplies the
page-level surface (`box-sizing`, `html,body,#root { height:100%; font-family:var(--font-sans);
background:var(--bg-primary); … }`, the bare-element `input`/`button`/`pre`/`code` styling), and the
`EmbedRoutes` wrapper (mirroring `demo/EmbedDemoRoutes`) supplies the viewport height: `flex h-screen
w-full overflow-hidden bg-background` outer + `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden`
inner. Those `h-screen`/`flex`/`min-h-0` utilities are emitted by the consumer's own Tailwind pass
(`@source './**/*.{ts,tsx}'`). This is identical to the demo, which renders at full height with
correct density.

## Upgrading the embedded chat library

A newer `agentix-chat-ui/` drops in cleanly:

1. `rm -rf ../agentix-chat-ui` and copy the new `agentix-chat-ui/` from the ZIP in its place — never
   edit anything inside it.
2. `npm install && VITE_C3_PKG=<pkg> npm run build:ui`. The vendored library needs no `node_modules`
   of its own; reconcile this `package.json` dep list first if the new library added runtime deps.

Automatic: the library's look (`styles/embed.css` + fonts) and i18n text (`locales/en/*.json`) travel
with it — nothing to re-fetch. Also the singleton list (`viteShared.ts` re-reads `singletonLibs.ts`).
**Not** automatic — reconcile this `package.json` dep list against the union of the new library
`package.json` `dependencies` + `peerDependencies` (and mirror any singleton add/remove/rename). See
the package `CLAUDE.md` for the full upgrade contract.

> The build type-check (`tsconfig.build.json`) covers **only the consumer `src/**`**; the vendored
> library is excluded from `tsc` (see *Scripts* above). An upgrade normally needs no change here — the
> ambient stubs in `build-types/` cover `@c3/agentix-client-ui` and the `@/` library imports
> generically. Only revisit `tsconfig.build.json` / `build-types/` if the upgrade renames the
> `@c3/agentix-client-ui` package specifier (see the rename contract in `CLAUDE.md`).

See the package-level `CLAUDE.md` for the full contract.
