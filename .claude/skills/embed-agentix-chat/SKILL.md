---
name: embed-agentix-chat
description: >
  Embed an Agentix Agent chat UI into an existing C3 app on the same cluster. Copy
  the starter template, wire it into the app, deploy — the browser talks to the
  Agentix mount directly, no backend proxy and no second login. Also covers
  migrating an app off the older embed template and upgrading the chat library.
triggers:
  - add an agent chat to my app
  - add a chat interface to my app
  - put an AI agent in my app
  - embed a chat UI
  - add agentix chat
  - migrate off the old embed template
  - upgrade the embedded chat library
  - /embed-agentix-chat
antiTriggers:
  - deploy the app
  - sync package
  - run Playwright tests
  - cross-cluster embed
  - author an agent definition
core: false
category: agentix
version: 6.0.0
---

# Embed Agentix Chat into a C3 App

Add an **Agentix Agent chat UI** to an existing C3 application on the **same
cluster host** as Agentix. You copy a self-contained starter template into the
app, wire it in, and deploy. There is nothing to build on the server: the browser
drives the Agentix app mount (`/<env>/<app>`) directly with plain cookie auth — no
proxy, no second login, no OAuth, no C3 package dependency. How that direct
connection works (the silent cookie exchange, the layer map) is background in
[`references/how-it-works.md`](./references/how-it-works.md); you do not need it to
wire the chat.

> **ZERO C3 backend wiring — do NOT connect the chat to a `GenaiCore.Agent.*` type.**
> The embed wires only via **`agentDefId`** (a Nexus agent _definition_ UUID — Step 0);
> no `GenaiCore.Agent.Deployment` / `LangChain` / `InClusterTransport` / server-side
> deployment type is involved, and authoring the agent + its RAG is the cluster Agentix
> instance's job, not yours. A code-space survey (`.c3typ` under `.vs-cache`, an Explore
> pass) tells you what types _exist_, never how _this_ integration is wired — if it hands
> you an "author a `GenaiCore.Agent.*` → deploy → chat connects to it" story, discard the
> wiring claims and trust this skill.

## Prerequisites — do not prompt or block on these

Runtime sign-in depends on one-time **cluster-side admin setup** — the Agentix
mount published for discovery, and the IdP group mapped to `Agentix.User`. This
skill **does not perform it, and must not stop to ask the user about it**: assume
it is handled, wire the chat, and note the dependency **once** in your closing
summary — never as a gating question up front. Revisit it only if the deployed
chat actually renders **"Agentix is unavailable."** or 403s after sign-in — then
it is the first thing to check, and it is an Agentix admin's job, not yours.
Details, console snippets, and diagnosis:
[`references/prerequisites.md`](./references/prerequisites.md).

## Steps

The code ships inline at `resources/agentix-chat-code/` — a consumer template app
(`react/`) built against the vendored library (`agentix-chat-ui/`). No download or
extraction; it is already beside this skill. Kit contents and what to expect:
[`references/starter-kit.md`](./references/starter-kit.md).

> **Step 0 — resolve `agentDefId` FIRST.** Step 3 needs the agent definition
> **UUID**. If the agent is custom, create it via
> [`agentix-agent-authoring`](../agentix-agent-authoring/SKILL.md) before wiring;
> else read its `id`. Wiring a placeholder costs a second edit + rebuild.

### 1. Run `install_embed.sh` — do NOT hand-copy the template

Run the installer to do the structure-independent copy. **Do not reproduce it by
hand** (`cp -R`, manual dep-merge) — re-deriving this wiring is the single biggest
time sink and the most common source of subtle, silent breakage:

```bash
install_embed.sh --kit <kit-dir> --ui <ui-dir> --agent-def-id <uuid> [--nexus-base <url>]
```

You provide the source kit root (this skill's `resources/agentix-chat-code`,
wherever it lives in your workspace) and the destination `ui/` dir — nothing is
hardcoded; it is idempotent. It vendors the library, copies `viteShared.ts` + the
build-types stub, creates `i18n.ts` + `Chat.tsx`, merges the library's missing
deps into `package.json`, and appends the `.gitignore` negations. It deliberately
does **not** touch `vite.config.mts`, `main.tsx`, the router, routes, or nav — it
prints those as a hand-off checklist. Do that per-app work by hand (deltas A–D
below), then run `verify_embed.sh`. Deep wiring detail (React 18/19,
greenfield/brownfield tracks, the five collision points, the full Vite resolve
order) is in [`references/wiring-details.md`](./references/wiring-details.md).

**Deploy deltas.** The template is authored to run standalone at the web root; a
real consumer is served from its **app mount** at `/<env>/<app>`, often inside an
iframe. Four deltas bridge that gap; nothing else in the copied files needs
touching:

| #   | Delta             | Do this                                                                                                                                                                                                                                                                                                                       | Why the template is wrong for a deployed mount                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **Router**        | Use `HashRouter`, **no** `basename`. Delete `basename.ts` + `resolveBasename.ts`.                                                                                                                                                                                                                                             | The template's `BrowserRouter basename` math never matches a real mount, and the `/`→`/chat` redirect rewrites a pathname a hosting iframe cannot reload. `HashRouter` sidesteps both.                                                                                                                                                                                                                                                                  |
| B   | **tsconfig**      | 1. Create `build-types/vendored-library.d.ts` with the stub `export declare const NexusChatEmbed: React.FC<{ agentDefId: string; nexusBase?: string; [key: string]: unknown }>;` + `declare module '@c3/agentix-client-ui';` 2. Add `tsconfig.build.json` dropping the `@/*` library leg. 3. `"moduleResolution": "Bundler"`. | Cleaner than the template's `skipLibCheck`: excludes the library from `tsc` at the root, killing the whole `@types/react`-strictness error class. The library ships pre-checked.                                                                                                                                                                                                                                                                        |
| C   | **No dev proxy**  | Do **not** add a discovery proxy for a deployed mount.                                                                                                                                                                                                                                                                        | A current library accepts a `nexusBase` prop and derives the mount internally. **Staleness test: does `NexusChatEmbed` accept `nexusBase`?** If not, your copy is stale (`verify_embed.sh`).                                                                                                                                                                                                                                                            |
| D   | **Install model** | Copy **every** `dependencies` entry from the vendored `agentix-chat-ui/package.json` into the consumer `ui/react/package.json` in the **same edit** as the library `file:` dep — then `npm install` **only** in `ui/react/`. **Never** inside the vendored `agentix-chat-ui/`.                                                | npm treats the `file:` dep as a **symlink** and does **not** install the library's transitive deps (tiptap, sonner, marked, dompurify, cmdk, next-themes, …), so a first install that lists only the library leaves the build missing them — a diagnose-and-reinstall round-trip. Front-load them all so the first install is complete. (A sidecar install inside the library pulls a large tree for nothing and can shadow the consumer's singletons.) |

> **Providers come from `@/components/ui/*`, never from `@c3/agentix-client-ui/…`
> subpaths — copy `main.tsx`'s import block verbatim.** The template's `main.tsx`
> imports `TooltipProvider` from `@/components/ui/tooltip` and `Toaster` from
> `@/components/ui/sonner` (the `@/` form) — **never** the package subpath
> `@c3/agentix-client-ui/components/ui/tooltip`. This is deliberate: delta B's
> `tsconfig.build.json` maps the whole `@c3/agentix-client-ui` package to one
> module-declaration `.d.ts` stub, and TypeScript rejects a **subpath** import of
> a stubbed module as "not a module". Re-deriving these imports as package
> subpaths sends you into a build-config rabbit hole — per-subpath stubs, dropped
> path legs, repeated `npm run build` — whose exit is exactly the `@/` form the
> template already ships. Trust the template's provider block; do not re-verify
> how the library resolves internally or invent subpath imports for it. (The
> library uses **zero** internal `@/` imports, so the consumer's own
> `@/components/ui/*` never shadows it — no collision to design around.)

> **Brownfield `vite.config.mts` merge keeps four escapes** (greenfield: copy the
> kit's `vite.config.mts` + `viteShared.ts` verbatim). Each missing one is a
> documented dev-server break — `makePinSingletons` not a directory alias, the
> `optimizeDeps` exclude of react-router/sonner, its include of the cookie /
> set-cookie-parser pair, and `fs.allow` for the sibling lib. `verify_embed.sh`
> checks 4–6 gate them; run it after the merge.

### 2. Package dependency

**None.** The consumer needs no C3 `c3pkg.json` dependency — `nexusClient` ships
no C3 types. The React library comes in via npm:

```json
{ "dependencies": { "@c3/agentix-client-ui": "file:../agentix-chat-ui" } }
```

(The library sits beside the template at `resources/agentix-chat-code/agentix-chat-ui/`.
Once published, install from the real registry instead.) **Do not** set
`c3ShipUiContent: true` on nexusClient itself — it stays a library; the consumer
ships its own SPA with `c3ShipUiContent: true`.

**The library supports React 18 or 19** (peer `react`/`react-dom` `^18.2 || ^19`;
`react-router` is a consumer-provided peer — v7 with React 18, v8 with React 19),
so a React-18 app needs **no** forced major upgrade. The reference `package.json`
is **React 18 + react-router v7** — adopt it in one shot; on React 19 instead, set
`react`/`react-dom` `^19` and `react-router` `^8.3.0`. Either way pin
`@types/react` / `@types/react-dom` to the matching tilde line (`~18.3.0` on 18,
`~19.0.0` on 19 — tilde, not caret, never `19.3.x`). Versions, the
greenfield/brownfield split, and the five install-time collision points are in
[`references/wiring-details.md`](./references/wiring-details.md).

### 3. Mount and configure

```tsx
import { NexusChatEmbed } from '@c3/agentix-client-ui';

<Route path="/chat" element={<NexusChatEmbed agentDefId="<definition-uuid>" />} />;
```

That's the whole integration. `NexusChatEmbed` discovers the mount via
`Microservice.Config.forName('Nexus').serviceAppId` (reduced to a same-origin
pathname; override with `nexusBase="/myenv/othernexus"`), runs the silent cookie
bootstrap, wires its own `SessionProvider`, and renders the same `ChatPage`
cluster the Agentix host uses. Host-page requirements are ordinary app chrome, not
auth: a react-router Router, a `QueryClientProvider`, and the consumer's own theme
provider — every C3 React app shell already has all three. Mount at route path
`/chat` specifically: ChatPage's internal navigation targets `/chat#<sessionId>`;
with `HashRouter` (delta A) the URL becomes `#/chat#<sessionId>` — the double-hash
is expected. **Keep the consuming app's routing, providers, theme and tokens as
they are** — the chat renders against them. Don't restyle the chat, fork its
components, or copy files out of the package (a fork freezes and silently diverges,
and the presentation layer it needs is inside the package by design — step 4).

> **Mirror the host theme into `data-theme` — the chat does NOT read the host's
> dark toggle.** The embed themes off `<html data-theme='dark'>` only. If the host
> toggles dark by any other means (a `.dark` class, its own theme state), you must
> set `document.documentElement.dataset.theme` to match the host and keep it synced
> on every toggle. The kit's `initTheme()` is for the STANDALONE chat that owns its
> own toggle — in an embed it pins the chat to its own light default and ignores
> the host, so do not rely on it: drive `data-theme` from the host theme instead.
> Symptom if skipped: opaque surfaces (the session sidebar) render light in the
> host's dark mode while transparent regions look fine. (`troubleshooting.md`.)

**Configuring the chat surface (consumer props).** `agentDefId` is **required**
(agent selection is the consumer's config). The rest is all-on by default; an embed
disables the pieces it doesn't want. The same props exist on `ChatPage`;
`NexusChatEmbed` forwards them.

| Prop                    | Type      | Default      | Effect                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | --------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentDefId`            | `string`  | **required** | Agent definition **UUID** new chats start with — **not** the display name: the embed provisions via `Nexus.Agent.ServiceApi.reserve`, which resolves `id` only. Get it from `agentix-agent-authoring` (`Nexus.Agent.DefinitionApi.list`), not the create response. A `location.state.agentDefId` deep-link still overrides the initial selection. |
| `allowAgentSwitch`      | `boolean` | `false`      | In-chat agent switcher. Off → every new chat is pinned to `agentDefId`.                                                                                                                                                                                                                                                                           |
| `workspaceEnabled`      | `boolean` | `true`       | Workspace section (header toggle + right-hand file panel).                                                                                                                                                                                                                                                                                        |
| `connectAppsEnabled`    | `boolean` | `false`      | The add/connect-apps UI. Off → users cannot attach apps to the chat.                                                                                                                                                                                                                                                                              |
| `modelControlsEnabled`  | `boolean` | `true`       | Effort-level + LLM model pickers in the composer.                                                                                                                                                                                                                                                                                                 |
| `sessionSidebarEnabled` | `boolean` | `true`       | Left chat-sessions sidebar. Off → not rendered (chat column reflows to full width).                                                                                                                                                                                                                                                               |

```tsx
// Single-agent kiosk: pinned agent, no switcher, no workspace or session list:
<NexusChatEmbed agentDefId="<definition-uuid>" workspaceEnabled={false} sessionSidebarEnabled={false} />
```

`mcpAppsEnabled` (in-chat MCP _apps rendering_) is a separate `ChatPage` prop,
also default-off for embeds; distinct from `connectAppsEnabled`.

### 4. Vite resolve order

**Copy this from the template — do not author it.** `viteShared.ts` +
`vite.config.mts` already encode the correct `@/` alias order, the
`makePinSingletons` + `makeForeignBareDepResolver` plugins, and the `dedupe` list.
The chat package is self-contained: a consumer SPA needs only **two** `@/`
resolution legs — consumer `src/` first, then `nexusClient/react/src/` — with **no**
host leg. Singleton libraries (`react`, `react-dom`, `@tanstack/react-query`,
`react-router`, i18next) must pin to one physical copy. The Tailwind entry imports
the package's own styling source and registers only its own files:

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import '@c3/agentix-client-ui/tailwind-sources.css'; /* the package registers itself */
@plugin '@tailwindcss/typography';
@source './**/*.tsx'; /* the consumer's own files */
```

Getting the styling registration wrong is a silent, jsdom-invisible failure (a
package-owned Dialog portals into `<body>` with no overlay — mounted but
invisible, reading as "chat won't start" while the backend is healthy). The full
resolve-order rationale is in
[`references/wiring-details.md`](./references/wiring-details.md); the worked
styling-failure story is in [`references/app-context.md`](./references/app-context.md);
`scripts/verify_embed.sh` greps the built CSS to catch it.

### 5. Sync and deploy

```bash
# sync-embed-demo builds + syncs the demo app, maps the OIDC group, and publishes
# an APP-scope Agentix serviceAppId + serviceAppUrl. No dependency sync needed.
make sync-embed-demo C3_CLUSTER=<cluster> C3_ENV=<env>
```

### 6. Verify

1. Log in as a **plain (non-admin) user** — no second sign-in anywhere.
2. Open the chat route → brief "Connecting to Agentix…" → chat renders.
3. DevTools Network: one `myUser` probe (302/401), one `mySessionToken` (200), one
   Authorization'd `myUser` (200 + `Set-Cookie` for the Agentix path), then chat traffic.
4. Send a message → reply streams live (incremental NDJSON, not one buffered blob).
5. Run `scripts/verify_embed.sh <consumer-ui-dir>` — library freshness, `.gitignore`
   guard, and the built-CSS presence grep, in one command.
6. curl repro of the whole exchange (no browser needed):

   ```bash
   TOK=$(curl -s -u '<user>:<pass>' -X POST https://<host>/<consumer-env>/<consumer-app>/api/8/User/mySessionToken \
     -H 'Content-Type: application/json' -d '{}' | jq -r '.signedToken')
   curl -s -D - -o /dev/null -X POST https://<host>/<agentix-env>/<agentix-app>/api/8/User/myUser \
     -H "Authorization: c3auth $TOK" -H 'Content-Type: application/json' -d '{}' | grep -i set-cookie
   ```

### Preview stop rule (plain-HTTP / localhost)

**In a plain-HTTP preview (`localhost`), expect `myUser` 404 and "Agentix is
unavailable." That is success for wiring purposes** — `Secure` cookies cannot
complete over HTTP, so the silent cookie bootstrap always fails on `localhost`. Do
**not** add a proxy, rewrite cookies, or work around it. The verification ladder:
(1) build green, (2) CSS grep present (`verify_embed.sh`), (3) `<NexusChatEmbed />`
mounts its loading/unavailable state with no React errors, (4) if `nexusBase`/
`serviceAppId` is configured, the `myUser` probe fires (visible in Network). All
four green ⇒ wiring is correct; the real chat activates only on the deployed HTTPS
mount. Build-env gaps (`VITE_C3_PKG is not set`) and the C3 Code build path are in
[`references/troubleshooting.md`](./references/troubleshooting.md).

> **"Agentix is unavailable." proves the mount, not the full chat.** It renders
> before auth; the real `ChatPage` (tooltips, toasts) renders only after auth,
> which never happens on localhost — so a missing `TooltipProvider`/`Toaster` is
> invisible here yet blanks the deployed HTTPS chat. Localhost can't observe this;
> guarantee it structurally — keep the full provider tree when adapting, create
> `components/ui/sonner.tsx` if absent (`verify_embed.sh` check 7 gates it).

> **A blank page is NOT the "unavailable" success state — never declare done on
> one.** Success is the app's own chrome _plus_ a mounted embed reading "Agentix is
> unavailable." — visible content, not an empty page. A truly blank render (React
> root empty / `rootChildCount === 0`, or a `504 Outdated Optimize Dep`) means
> **nothing mounted** — the stale-optimizer wedge above (run the managed-restart
> ladder) or a real bug — never the expected localhost state. Confirm the root has
> rendered content (screenshot or `document.getElementById('root').childElementCount
>
> > 0`) before finishing; a 504/blank at declare-done time means you are **not**
> > done, no matter how green the build was.

**Green build is necessary but not sufficient — do one dev render check, then
stop.** A green production build (`npm run build` — lint + `tsc` + `vite build`)
is the primary gate, but it does **not** exercise the dev-server module graph, so
a class of real breakage passes a green build and still blanks the app (e.g. the
react-router CJS `cookie` blank-page — see
[`references/stall-preventers.md`](./references/stall-preventers.md)). When a
browser is available, load the app once and read the **dev-server log/overlay**
(not just the browser console) **before** declaring done — optimizer/import errors
and the host's UI-preview forwarder surface there, not in the console. **Before
trusting or chasing a dev-server error, compare its timestamp to your last
cache-clear/restart** — an error stamped earlier is replayed pre-fix output, not a
live failure (stall-preventers). Don't leave the user to discover a blank page,
and don't reopen a fixed one.

When the dev server misbehaves after `npm install`, tell the two cases apart:

- **Stale-optimizer symptoms** — a `504 Outdated Optimize Dep`, a phantom
  `ENOENT` on a file that plainly exists, a locked/undriveable browser — are
  **not** integration failures and must not become an open-ended fix loop.
  (Adding a singleton the consumer lacked — e.g. `react-i18next` — reliably
  triggers the `504` on first load; a plain reload won't clear it, so go straight
  to the managed restart.) Run the **bounded** ladder in
  [`references/stall-preventers.md`](./references/stall-preventers.md) once (clear
  the Vite cache → let the managed UI service restart itself, `touch
vite.config.mts` in C3 Code → if the identical symptom repeats on a fresh scan,
  stop and rely on the build).
- **A real error that survives that ladder** — a module/export error, a component
  crash, a persistent blank render — **is** a genuine bug; fix it (the cookie
  case above is one). The ladder is the discriminator: a stale symptom clears on
  the first cache-clear; a real one does not.

> **The canonical "survives the ladder" bug is a hand-merged vite config.** A
> repeating `ENOENT … dist/esm/<pkg>.js` (often lucide-react) cascading into a
> react-router resolve error, unfixed by any cache clear, is **not** stale cache —
> the singletons were hand-aliased to directories instead of `makePinSingletons`,
> so the optimizer guesses the wrong ESM extension every re-optimize. Fix: re-copy
> the kit's vite wiring verbatim (step 1 trip-wire; `verify_embed.sh` check 4).

## Key constraints

| Constraint                                   | Detail                                                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Same cluster host only                       | Cross-cluster / different IdP / cross-origin is out of scope (cookie + signature trust break)                                                  |
| One mount per document                       | The Agentix base is a module-global written by each transport ctor — a second live transport with a different base wins for BOTH surfaces      |
| One pod per user (v1)                        | Pod keys on `userId` alone; embed shares pod + history with the Agentix host UI                                                                |
| Route path must be `/chat`                   | ChatPage navigation targets `/chat#<sessionId>`; with `HashRouter` (delta A) the URL shows `#/chat#<sessionId>` — this double-hash is expected |
| `c3ShipUiContent` stays false on nexusClient | Library, not a standalone app — consumer ships its own SPA                                                                                     |
| Mint + probe must stay self-scoped           | `mySessionToken` / `myUser` only. `User/sessionToken` is admin-gated; `Echo/echoStr` is role-gated                                             |

## Migrating & upgrading

- **Off the C3 Code (`nexusPkg`) template** (server-side proxy + auth gate) → delete
  it and wire as a fresh install: [`references/migration-and-upgrade.md`](./references/migration-and-upgrade.md).
- **Across the `@c3/nexus-client-ui` → `@c3/agentix-client-ui` rename** (rare;
  hand-wired pre-rename kits only) → same file.

## Stall preventers

Read [`references/stall-preventers.md`](./references/stall-preventers.md) before
editing files — four rules that each map to a real time sink: never edit the
vendored library, the `.gitignore` negation guard, the Vite optimizer-cache
escalation ladder, and keeping kit ↔ library in lockstep.

## Troubleshooting

Symptom → cause → fix table in
[`references/troubleshooting.md`](./references/troubleshooting.md).

## Agent authoring

Authoring the agent the chat points at (creating a definition, attaching skills /
MCP connections / plugins / tools over REST) is the **sibling skill**
[`agentix-agent-authoring`](../agentix-agent-authoring/SKILL.md). Its definition
`id` (read back via `Nexus.Agent.DefinitionApi.list`, since the create response
omits `id`) is the `agentDefId` you pass in step 3 — resolve it first (Step 0).

(In the downloadable embed `.tgz`, that skill is injected under
`references/agentix-agent-authoring/` so the download stays self-contained.)

## Reference

- Worked example (embed template): [`resources/agentix-chat-code/react/`](./resources/agentix-chat-code/react/) + `make sync-embed-demo`
- How the direct connection works: [`references/how-it-works.md`](./references/how-it-works.md)
- Cluster prerequisites (admin): [`references/prerequisites.md`](./references/prerequisites.md)
- Per-app template values + the styling-failure story: [`references/app-context.md`](./references/app-context.md)
- Kit contents + what to expect: [`references/starter-kit.md`](./references/starter-kit.md)
- Deep wiring detail: [`references/wiring-details.md`](./references/wiring-details.md)

## Mandatory self-review

Before presenting, run the checklist in
[`references/self-review.md`](./references/self-review.md) and fix what fails;
`scripts/verify_embed.sh` covers the mechanical items (Vite legs, singleton pins,
`.gitignore`, built-CSS). The steps most often skipped: mounting at `/chat`,
pinning `@types/react` to the matching tilde line (`~18.3.0` on the React-18
reference, `~19.0.0` on React 19), recognizing the localhost `myUser` 404 as
expected success rather than a bug, and — since a green build is necessary but not
sufficient — doing one dev-server render check before declaring done while **not**
chasing stale-optimizer symptoms (`504` / phantom `ENOENT` / locked browser) past
the bounded ladder (Preview stop rule).
