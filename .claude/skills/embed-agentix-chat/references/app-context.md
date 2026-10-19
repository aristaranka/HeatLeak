# Embed Agentix Chat — Worked Example (embed template + Reliability)

Concrete values the first consuming apps filled in when applying the embed skill.
Use as a template for per-app values — substitute your own app name, URLs, and versions.

## nxembed (live whiteglove consumer)

**Live:** `https://<host>/<env>/nxembed/chat/` (whitegloved on `plat/rambandi0718`)

| Key                | Value                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| App name           | `nxembed`                                                                                                                                         |
| rootPkg            | `nexusClient`                                                                                                                                     |
| Package path       | `c3/nexusClient/`                                                                                                                                 |
| Package name       | `nexusClient`                                                                                                                                     |
| c3pkg.json dep     | none beyond platform/baseToolkit — `nexusClient` ships no C3 types; the template host SPA + role live in-package alongside the UI lib             |
| SPA entry          | `resources/agentix-chat-code/react/main.tsx` (providers + `<EmbedRoutes />` — nothing else)                                                       |
| User role          | `c3/nexusClient/metadata/Role/NexusClient.User.json` — **empty permissions**; only the OIDC mapping target                                        |
| Transport          | Internal to `NexusChatEmbed` — `InClusterTransport({ baseUrl })` from Microservice discovery                                                      |
| Vite resolve order | template `react/` → client `src/` (`react/vite.config.mts`, client is the template's parent package) — no host leg at all                         |
| Tailwind           | `react/globals.css` imports stock Tailwind + the package's `tailwind-sources.css`, then `@source`-registers its own `react/` files — no host tree |
| i18n               | `react/i18n.ts` — consumer-owned i18next with `common`/`chat`/`connect` registered EMPTY (keys render as placeholders)                            |
| Routing            | BrowserRouter → `/chat` → `<EmbedRoutes />` — **no host NavShell** (ChatPage only, host nav hidden)                                               |
| Singleton pinning  | `react`, `react-dom`, `@tanstack/react-query`, `react-router` (v8 — **not** `react-router-dom`), `i18next`, etc.                                  |
| Deploy             | `make sync-embed-demo` (builds + syncs SPA + metadata → maps OIDC group → publishes an APP-scope `serviceAppUrl` override)                        |

The template lives at `resources/agentix-chat-code/react/`, the consumer template app beside the
`@c3/agentix-client-ui` library it embeds. `cd react && npm install && npm run build` is a build
check — it proves the kit is self-contained and compiles. The standalone demo at
`agentix-chat-ui/demo/` has its own suites (run by the parent package's vitest).

### Tailwind trap: every styled thing the chat renders must be IN the package

A consumer's Tailwind entry registers **its own files** plus the chat package — and **not** the
Agentix host tree:

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import '@c3/agentix-client-ui/tailwind-sources.css'; /* the package registers itself */
@plugin '@tailwindcss/typography'; /* `prose` classes for the chat's Markdown */
@source './**/*.tsx'; /* the consumer's own files */
```

Nothing here reaches into the Agentix host tree. The host's `globals.css` carries the ShadCN **token**
bridge (`bg-background`, `text-foreground`, the `dark:` variant), which the package deliberately does
not ship — a consumer defines those against its own design system, and the embed demo does not define
them at all, so it is a structurally correct example rather than a pixel match.

Why this works: Tailwind emits a utility only when it sees the class **string** in a registered
`@source` root, and it skips symlinked package dirs by default. The chat package therefore ships
its own `tailwind-sources.css` (`@source './**/*.tsx'`, paths relative to that file) and owns the
whole presentation layer it renders — the `ui/*` primitives it uses, shared chrome, and the `cn`
helper. So one registration covers everything styled.

**What this replaced, and why it matters.** While those primitives lived in the host tree, a
consumer had to `@source '<path-to>/nexus/react/src/**/*.tsx'` — permanent host-tree knowledge in
every consumer's build config. Omitting it was a **silent, misleading** failure: most chat utilities
also appear in the consumer's own files, so the page rendered fine; only host-**exclusive**
utilities vanished. The MCP consent `Dialog` was built entirely from them, so it portalled into
`<body>` with no overlay, no width clamp and no open-state transform — mounted, hit-testable,
invisible. It presented as _"I can't start a chat with an OAuth agent"_ against a perfectly healthy
backend (status endpoint, `getOAuthUrl` and `sessions/create` all 200/202): the user simply never
saw the consent dialog.

**No jsdom test catches a missing utility** (stylesheets are ignored), so it is guarded two ways:

- **Structurally** — `c3/nexusClientTest/react/src/packageBoundary.test.ts` fails if the package
  imports any host-resolved module containing a class string.
- **Against the built bundle** — after `npm run build:demo`, grep the emitted CSS for tokens that
  only the primitives produce:

  ```bash
  cd c3/nexusClient/react && npm run build:demo
  grep -c -e 'max-w-lg' -e 'state=open' -e 'animate-in' ../ui/content/assets/index.css
  ```

  All present ⇒ the package is self-contained. Any missing ⇒ something styled leaked back to the
  host tree (or the package's `tailwind-sources.css` no longer covers it).

### Bootstrap sequence (internal to NexusChatEmbed)

```
mount → silentNexusCookieBootstrap('/<env>/nexus')
  ├─ probe POST /<env>/nexus/api/8/User/myUser → ok? ready (cookie already present)
  └─ denied → POST /<env>/nxembed/api/8/User/mySessionToken (own-app cookie) → .signedToken
       └─ POST /<env>/nexus/api/8/User/myUser + Authorization: c3auth <token>
            └─ Set-Cookie (Path=/<env>/nexus) → re-probe → ready
session expiry → same exchange re-runs silently; latch released on success
```

Session provisioning (pod cold-start, resume, polling) is ChatPage's own host logic — the embed
adds nothing on top.

## Reliability (external team consumer)

| Key              | Value                                     |
| ---------------- | ----------------------------------------- |
| App repo         | `c3-e/c3reliability`                      |
| Package name     | `reliabilityNexus`                        |
| Package path     | `base/reliabilityNexus/`                  |
| Platform version | 8.10                                      |
| App version      | 24.0.0                                    |
| Cluster          | same cluster host as the Agentix app      |
| Auth             | signed-in user's `c3auth` session         |
| Agentix mount    | derived from page URL (same-host sibling) |

### External-team conventions

- Package name convention: `<appName>Nexus` (e.g. `reliabilityNexus`).
- Everything under `base/<appName>Nexus/` installs `@c3/agentix-client-ui` via npm and mounts
  `<NexusChatEmbed />` at route `/chat`. No C3 package dependency and no role grant are needed —
  the cookie exchange mints via the platform's self-scoped `User.mySessionToken`.
- Consumer and Agentix must share the same cluster host and user id (one IdP per cluster
  host). No separate Agentix login.

## RootPkg caveat

Once a C3 app has been started with a `rootPkg`, that binding is **immutable** — you cannot
change the rootPkg on a running app. To switch packages:

1. `terminateApp` the existing app.
2. Remove the app record.
3. Recreate with the new rootPkg.

Or simply use a different app name for the new package.

**Whiteglove lesson:** rootPkg binding is **permanent** — an app started with the wrong rootPkg can
never be flipped, only recreated under a new name. An earlier app `restbff` was bound to `nexusClient`
back when that package was library-only (no SPA), so it served no page and became dead weight; the fix
was a fresh app `nxembed` bound to whichever package carries the demo SPA. As of this consolidation
that IS `nexusClient` again (its `react/demo/` now builds the demo `ui/content`), so `nxembed` →
rootPkg `nexusClient` is now correct and canonical — pick the rootPkg deliberately the first time.

**It bites on every demo move.** Each time the demo changed packages (`restbff` → `nexusClientTest` →
`nexusClient`), an `nxembed` app on an older env stayed bound to the demo's PREVIOUS rootPkg, so `make
sync-embed-demo` (which now uploads `nexusClient`) 500s on every write against that env — the app can
never serve a package it isn't rooted at. Diagnose before deploying, with a single read:

```bash
c3api -c <cluster> -e <env> -a c3 exec \
  "var a=App.forId('plat-<env>-<app>'); a? ('rootPkg='+a.rootPkg) : 'ABSENT'"
```

`ABSENT` means the name is free and you may bind it correctly; a rootPkg naming the demo's OLD package
(`nexusClientTest`, or the older `restbff`) means that env's `nxembed` predates this move and must be
deleted + recreated (or given a different app name on that env). Do **not** retarget the Makefile's
`C3_APP` to the workaround name — that bakes one env's accident into the repo. `nxembed` + rootPkg
`nexusClient` stays canonical; a polluted env gets a local override instead.

## Ordering trap: upload the package BEFORE startApp

`startApp` on a package whose content is not yet in the Pkg.Store leaves the app **permanently
401** — every subsequent request is unauthorized, and re-running `startApp` does not repair it
(the remedy is delete + redeploy, which for a fresh app name means burning that name). Sequence:

1. Upload the package content **first**, through the store-owner app (`-a c3`), not the new app.
2. `startApp` with the correct `rootPkg`.
3. Seed the user / OIDC group mapping, then publish the APP-scope `serviceAppUrl` override on the
   new app (the demo carries its own so it stands up on a cluster without the CLUSTER record).

The scoped sync in `make sync-embed-demo` (`--scope ui --scope metadata`) is what satisfies step 1
for the demo; it targets the `c3` app deliberately for exactly this reason.
