# Embed Agentix Chat — stall preventers

Small rules that each map to a real time sink. Do them up front. ("Agentix" is
the service; `Nexus*` / `nexusBase` names keep their spelling.)

## Never edit the vendored library

Every provider the chat needs — `TooltipProvider`, `Toaster`, `QueryClientProvider`,
`initTheme` — lives in the consumer's `main.tsx` (already present in the
template's). You should have **zero** hand-patches inside `agentix-chat-ui/`.
Patches to `NexusChatEmbed.tsx`, `appServerDetection.ts`, or `chatApi.ts` are all
avoidable and become unavoidable only when you skip delta B (so the library gets
type-checked) or move providers out of the host. A fork of any library file
freezes at that commit and silently diverges from the mount it talks to.

## `.gitignore` guard

The repo-root Python `lib/` ignore rule silently drops the vendored library's
`src/lib/`, producing the classic **green-locally / red-in-CI** surprise: local
builds pass, CI fails with `Rollup failed to resolve "@/lib/theme"`. The
negation that prevents it has two sharp edges (both verified with
`git check-ignore -v`):

- **Order matters** — last match wins, so the negations must appear AFTER the
  `lib/` rule (append them at the END of the root `.gitignore`; a negation above
  the `lib/` line is dead).
- **The directory needs its own negation** — git cannot re-include files under
  an excluded directory, so un-ignore the directory first, then its contents:

  ```gitignore
  !**/ui/agentix-chat-ui/src/lib/
  !**/ui/agentix-chat-ui/src/lib/**
  ```

Also check the VENDORED library's own `.gitignore`: its home-repo rule ignoring
`src/styles/embed.css` ("build output, regenerated every build") is wrong in a
consumer — `NexusChatEmbed.tsx` imports that file and the vendored copy ships no
`scripts/` to regenerate it, so it must be committed or fresh clones fail with
`failed to resolve "./styles/embed.css"`. The current kit ships that line as a
negation (`!src/styles/embed.css`); if your copy predates this, flip it yourself.
`scripts/verify_embed.sh` checks both edges (`git status --ignored` must show no
`!!` lines under the vendored subtree).

## Clear the Vite optimizer cache after `npm install` (escalation ladder)

After `npm install` — especially across a React major (18 → 19) — a stale Vite
pre-bundle causes recurring `useOptimistic` errors or phantom `ENOENT` crashes
(stale scan metadata referencing deleted files, not real missing imports).
Follow this **escalation ladder in order**:

1. **Clear caches:** `rm -rf node_modules/.vite node_modules/.vite-temp .vite .vite-temp`
2. **Restart the UI dev service** (do NOT kill `npm` manually — let the service
   restart itself so the optimizer cache repopulates cleanly).
3. **Poll until running:** wait for the Vite `ready in Xms` line before loading
   the page.
4. **Load the page** — if the error persists after steps 1–3,
   `rm -rf node_modules && npm install`, then repeat from step 1.

In **C3 Code**, the UI dev service is platform-managed and cannot be restarted by
hand — `touch vite.config.mts` makes Vite restart itself via its config watcher.
Error overlays and surfaced logs may keep replaying output from the
**pre-restart** process: compare log timestamps before concluding a fix didn't
land (three identical-looking failures sharing one stale timestamp are one old
failure, not three new ones).

Phantom `ENOENT`s on files that clearly exist are usually stale scan metadata,
not real import errors — the cache clear in step 1 resolves them most of the
time. Do not chase the named file.

**Exit condition — when it is NOT staleness.** If the identical `ENOENT`
re-appears immediately after a clean cache clear (step 1) with a fresh dep-scan,
it is not stale metadata — stop escalating and check whether the referenced
package has an `"exports"` field (`cat node_modules/<pkg>/package.json`). A
singleton with no `"exports"` map (only `"main"`/`"module"`) makes Vite's
optimizer **guess** the ESM entry filename from the CJS path when handed a bare
directory alias, and the guess is wrong whenever the real ESM file uses a
different extension (e.g. `.mjs` instead of `.js`). `lucide-react` hit exactly
this after a major bump: the error read `ENOENT ... dist/esm/lucide-react.js`
even though the file was `dist/esm/lucide-react.mjs`. `makePinSingletons` in the
current `viteShared.ts` fixes this at the source — it delegates every pin through
`this.resolve()` (real Rollup/Vite resolution) instead of a bare joined path — so
keeping that file **copied, not re-derived** is what prevents the bug.

The **mirror-image case** also exists: a package with ONLY an `exports` map (no
`main`/`module` — `react-router` v8, with its `module-sync` conditions, is the
canonical one) breaks the optimizer the same way, reading as
`ENOENT ... react-router/dist/index.js` while "updating dependencies". esbuild's
dep-optimizer scan does not run the Vite plugin pipeline, so `makePinSingletons`
cannot rescue it there and no cache clear helps; the fix is `optimizeDeps.exclude`,
which the template sets to `['react-router', 'sonner']` (`sonner` because its
dist inlines the entire stylesheet as one string esbuild's pre-bundler fails to
parse — "Unterminated string literal"). Do **not** blanket-exclude the other
singletons: `react`/`react-dom` are CJS and need pre-bundling. Dev serving and
`vite build` resolve the _excluded package itself_ through Vite's own
exports-aware resolver — but excluding `react-router` also stops its
**transitive** deps from being pre-bundled, and two of them (`cookie`,
`set-cookie-parser`) are CommonJS with **no** ESM named exports. Served raw,
react-router's `import { parse } from "cookie"` crashes the dev server and blanks
the whole app (`does not provide an export named 'parse'`). So the exclude is only
half the fix: pair it with
`optimizeDeps.include: ['react-router > cookie', 'react-router > set-cookie-parser']`
to give those nested CJS deps CJS→ESM interop (the template's `vite.config.mts`
ships both). The prod `vite build` never surfaces this, so a green build alone
won't catch it — **verify the dev render**.

**Brownfield caveat — the include can optimize the wrong copy.** `react-router >
cookie` targets whichever `cookie` won the npm hoist. If another consumer dep
pulls a top-level `cookie` (e.g. `express` via `@modelcontextprotocol/sdk`), it
out-hoists react-router@7's required `cookie@1.x` and npm **nests** react-router's
own copy at `react-router/node_modules/cookie`. The include then interops the
top-level copy while react-router's raw import still hits the un-interop'd nested
one — the app blanks with the identical `'parse'` error even though the include is
present. Fix: alias the **bare** `cookie` specifier to react-router's own nested
copy and force-optimize bare `cookie` (not the `react-router > cookie` form).
`verify_embed.sh` check 8 detects the nested copy and flags a missing bare-cookie
alias.

## Keep kit ↔ library in lockstep

The library at `resources/agentix-chat-code/agentix-chat-ui/` ships with this
skill and should match the Agentix app version you deploy against. **Behavioral
staleness test: does `NexusChatEmbed` accept a `nexusBase` prop?**
`scripts/verify_embed.sh` checks this (or grep the vendored source / `.d.ts`
yourself). If `nexusBase` is absent, the library predates the current contract —
update it from a current skill release rather than working around the gap. Do not
test staleness by grepping for internal implementation details like
`deriveGatewayBase` in specific file paths — those are private and move across
refactors.
