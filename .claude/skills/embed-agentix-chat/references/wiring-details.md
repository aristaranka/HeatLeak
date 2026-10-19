# Embed Agentix Chat — wiring details

Depth behind SKILL.md steps 1 and 4. The spine tells you _what_ to do; this file
carries the dependency-graph and Vite-resolution detail you copy from the
template rather than re-derive. ("Agentix" is the service; `Nexus*` component,
prop, package, and type names keep their spelling.)

## React 18 or 19 — adopt the reference `package.json`; the reference is React 18 + react-router v7

The library's peer deps accept **React 18 or 19** (`react`/`react-dom`
`^18.2 || ^19`), and `react-router` is a **consumer-provided peer** — **v7 with
React 18, v8 with React 19** (both expose the four hooks the chat uses —
`Link`/`useNavigate`/`useLocation`/`useHref` — identically). So there is **no
forced major upgrade**: the reference itself is **React 18**, and an existing
React-18 app embeds the chat without touching its React version.

**Greenfield / React-18 app:** adopt the reference below in one shot (React 18 +
react-router v7) — do **not** hand-migrate. **On React 19 instead:** the same
wiring works — set `react`/`react-dom` to `^19`, `react-router` to `^8.3.0`, and
`@types/react` / `@types/react-dom` to the `~19.0.0` tilde line (never `19.3.x`).

| Dependency                          | Version (reference / React 18)                                 | Note                                                                          |
| ----------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `react` / `react-dom`               | `^18.2.0` (or `^19` on 19)                                     | either major; the library peer is `^18.2 \|\| ^19`                            |
| `react-router`                      | `^7.5.2` (v8 `^8.3.0` on React 19)                             | the package is `react-router` (**not** `react-router-dom`); peer `^7 \|\| ^8` |
| `i18next`                           | `^26`                                                          |                                                                               |
| `react-i18next`                     | `^17`                                                          |                                                                               |
| `@types/react` / `@types/react-dom` | **`~18.3.0`** (tilde) (`~19.0.0`, never `19.3.x`, on React 19) | see below                                                                     |

**Pin `@types/react` / `@types/react-dom` with a `tilde`, not a caret** —
`~18.3.0` on the React-18 reference, `~19.0.0` on React 19. A caret pins nothing
(`^19.0.0` still lets npm resolve `19.3.x`; a fresh install has resolved straight
to `19.3.0`); the tilde locks the patch line (`18.3.x` / `19.0.x`). This matters
most on React 19: the `19.3` types line is far stricter and floods the vendored
library with type errors, so **never** let `@types/react` drift to `19.3.x`.
Combined with deploy delta B (exclude the library from `tsc`), the strictness
error class disappears entirely.

## Two tracks — pick the one that matches your starting point

**Greenfield (fresh template or empty shell):** run `install_embed.sh` (SKILL.md
step 1) for the copy, then take the files it hands off (`vite.config.mts`,
`tsconfig*.json`, `main.tsx`, `src/` app source) from the template verbatim. The
reference versions are correct; nothing else to migrate.

One caveat for a **C3 Code blank-template** workspace: the blank template ships
React-18-era extras the kit does not use — `resources/examples/**` (imports
`react-router-dom`), `components.json`, `tsconfig.node.json`, `eslint.config.js`
(the kit uses `.cjs`), the jest configs, and ~2.5 MB of unused `public/` fonts.
Delete them: they keep stale React-18 / `react-router-dom` references in the
tree, and the old fonts otherwise ride into every build as dead bytes.

**Brownfield (large existing app with its own dependencies):** keep the existing
app shell; **merge** the defined dependency list from the template's
`react/package.json` rather than wholesale-replacing `package.json`.

**Order matters — resolve the dependency graph before touching Vite/tsconfig.**
Merge `package.json` → run `npm install` and fully resolve any ERESOLVE conflicts
(collision point 3 below) → only THEN edit `vite.config.mts` / `tsconfig.json`.
Editing the build config first means redoing that work once the real dependency
conflicts surface.

### Five collision points to resolve

1. **`@/` alias precedence** — if both the consumer app and `agentix-chat-ui`
   define `@/components/ui/*`, the consumer's `@/` must win (leg 1 in the Vite
   resolve order); the library's `@/` is leg 2. Swapping them silently breaks
   the consumer's own UI. The library's internal imports are package-relative
   (no `@/`), so no conflict arises unless you copy library files into the
   consumer's `src/`.
2. **Tailwind token-layer double-definition** — if the consumer already defines
   semantic tokens (`bg-background`, `text-foreground`, `dark:` variant), do
   **not** also import the kit's `globals.css` token definitions. Only add
   `@import '@c3/agentix-client-ui/tailwind-sources.css'` and
   `@plugin '@tailwindcss/typography'`. Duplicate `@theme` blocks produce silent
   specificity races.
3. **`package.json` singleton conflicts** — `react`/`react-dom` (18 or 19),
   react-router (v7 on React 18, v8 on React 19; the package is `react-router`,
   **not** `react-router-dom`), and `@tanstack/react-query` v5 are peer deps the
   consumer supplies. An existing React 18 app does **not** need to upgrade —
   keep React 18 and use react-router v7 — but whichever majors you pick, react
   and react-router must each resolve to a **single** physical copy (or the
   library's JSX runtime / router context mismatches). Pin `@types/react` /
   `@types/react-dom` to the matching tilde line (`~19.0.0` on React 19,
   `~18.3.0` on React 18; tilde, not caret — never `19.3.x`). Pin exactly one
   version per singleton to avoid dual-bundle singletons.

   > **Brownfield app already on `react-router-dom` v6 → move it onto the single
   > `react-router` (v7 on React 18) copy the library shares.** This is the one
   > router change the integration forces, and it is easy to misread as "we were
   > told not to touch the app's router." Two _different_ router packages
   > (`react-router-dom` v6 in the app, `react-router` v7 in the library) mean two
   > separate `Router` contexts: the embed's `useLocation`/`useNavigate` read a
   > different provider than the app's `<HashRouter>`, so the chat's in-app
   > navigation silently breaks. Resolve it **mechanically, topology unchanged** —
   > keep the same `HashRouter` at the root and the same `Routes`/`Route` tree,
   > add the chat only as a new `/chat` route; do **not** add a second Router, a
   > `basename`, or re-wrap providers. The only edit is the **import specifier**:
   > `grep` the app for `react-router-dom` and rewrite each site to `react-router`
   > (v7 merged the DOM exports into `react-router`; `HashRouter` / `Link` /
   > `useLocation` / `useNavigate` are identical across the move). Leaving any one
   > site on `react-router-dom` re-splits the singleton. (In v7 `react-router-dom`
   > still re-exports `react-router`, so bumping the app to `react-router-dom` v7
   > and deduping both names to one core is a theoretical alternative — but the
   > single-package rewrite is cleaner and matches the reference `package.json`.)

4. **Pre-existing React-18-only dependencies elsewhere in the app** — an app
   that predates this integration may already depend on packages with their own
   React-18-only peer deps unrelated to the chat library (e.g. `react-leaflet`,
   `mui-chips-input` and its `@emotion`/`@mui` peers) — these block `npm install`
   with ERESOLVE errors that read like a chat-library problem but aren't. Before
   reaching for `--legacy-peer-deps` or `--force` (which silently accepts a
   broken resolution), `grep` the app's `src/` for actual usage of each flagged
   package. If it's dead weight, drop it — the conflict disappears because the
   incompatible package is gone, not papered over.
5. **Providers to add vs. reuse** — `QueryClientProvider` (the consumer likely
   has one — **reuse it**, do not add a second), `TooltipProvider` + `Toaster`
   (add if absent), i18n `I18nextProvider` (if the consumer already uses i18next,
   merge the `chat`/`common`/`connect` namespaces into the existing instance
   rather than mounting a second provider; empty resources are fine — step 4).

## Vite resolve order — copy it, don't author it

`viteShared.ts` + `vite.config.mts` already encode the correct `@/` alias order,
the `makePinSingletons` + `makeForeignBareDepResolver` plugins, and the `dedupe`
list. The two legs below are _what they already do_; documented so you can
verify the copy, not re-derive it.

The chat package is **self-contained** — its own vite/tsconfig have no host `@/`
fallback, and `c3/nexusClientTest/react/src/packageBoundary.test.ts` locks the
borrowing allowlist at **empty**. So a consumer SPA `vite.config.ts` needs only
two `@/` resolution legs:

1. **Consumer `src/`** — theme, local overrides win.
2. **`nexusClient/react/src/`** — NexusChatEmbed, ChatPage cluster, transport,
   hooks, the data/state layer, **and** the whole presentation layer the chat
   renders (`ui/*` primitives, shared chrome, the `cn` helper). The package
   borrows nothing from the host tree — no host `@/` leg is required.

**i18n is the one thing the chat does not ship.** It reads the `chat`, `common`,
and `connect` namespaces from a **consumer-provided** i18next context, exactly as
it reads the QueryClient and theme from consumer providers. Registering them with
**empty** resources is a valid start — i18next returns the key for a missing
string, so the chat renders readable placeholders instead of crashing (the
template's `react/i18n.ts` does exactly that; only the Agentix host SPA ships real
locale packs).

The consumer's Tailwind entry imports the package's own styling source and
registers **its own files** — `@source`-registering the host tree is not
required, and no part of it is imported:

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import '@c3/agentix-client-ui/tailwind-sources.css'; /* registers the whole chat cluster */
@plugin '@tailwindcss/typography'; /* the `prose` classes the chat's Markdown needs */
@source './**/*.tsx'; /* the consumer's own files */
```

That `@import` is the only chat-specific line, and it is load-bearing: paths
inside `tailwind-sources.css` resolve relative to that file, so it registers the
package through the `node_modules` symlink Tailwind would otherwise skip. The
consumer supplies its own semantic tokens (`bg-background`, `text-foreground`,
the `dark:` variant); the chat ships no token layer, so without them those
utilities fall back to stock Tailwind values. Getting this wrong is a silent,
jsdom-invisible failure — full worked detail (why the MCP consent Dialog vanishes)
is in [`app-context.md`](./app-context.md); the built-CSS grep that catches it is
in `scripts/verify_embed.sh`.

**Singleton libraries** (`react`, `react-dom`, `@tanstack/react-query`,
`react-router`, i18next) must pin to one physical copy (the consumer's
`node_modules`) — two copies of a provider library mean the consumer's Provider
and the chat UI's `useContext` read different instances, so context reads come
back empty at runtime. The same applies to the package's **own** modules: resolve
it by real path, not through the `node_modules` symlink, so a file reached as
`@/components/ui/button` and as `@c3/agentix-client-ui/components/ui/button` is
one module (a second copy holding module-level state — e.g. `nexusBase`'s
configured base — breaks the embed silently). Use `makePinSingletons` +
`makeForeignBareDepResolver` from `resources/agentix-chat-code/react/vite.config.mts`
as template. The package name is `react-router` (v8), not the v6-era
`react-router-dom` — pinning the old name silently pins nothing.
