# Embed Agentix Chat — mandatory self-review

Run this after wiring, before presenting. If weaknesses are found, fix them
first. Much of it is checked mechanically by `scripts/verify_embed.sh` (items 5,
6, 9, 16). ("Agentix" is the service; `Nexus*` names keep their spelling.)

1. Is `serviceAppId` (recommended) — or the legacy `serviceAppUrl` — discoverable from the consuming app — the **CLUSTER**-scope publish made when Agentix was deployed, or a deliberate **APP**-scope override on this consumer (missing cluster record, or a different Agentix)?
2. Is the mint the platform's `User/mySessionToken` (not a custom facade), reading `.signedToken`?
3. Is the component mounted at route path `/chat`?
4. Is the required `agentDefId` passed, and are the chat-surface toggles (`allowAgentSwitch`, `workspaceEnabled`, `connectAppsEnabled`, `modelControlsEnabled`, `sessionSidebarEnabled`) set to match the embed's intent (all default-on except `allowAgentSwitch` / `connectAppsEnabled`)?
5. Does the consumer's Vite config resolve `@/` in the correct order — consumer `src/` first, then `nexusClient/react/src/` (**two** legs; there is no host leg, the package borrows nothing from the host tree)?
6. Are singleton libraries pinned to one copy?
7. Has cluster-once Agentix setup been run (IdP default group → `Agentix.User` on the Agentix app) — and if a user still cannot open the chat, has the self-scoped `User.myUser()` groups/roles read been run **against Agentix** before anything else is changed?
8. Is `c3ShipUiContent: true` set on the **consumer** package (not nexusClient)?
9. Does the consumer's Tailwind entry import `@c3/agentix-client-ui/tailwind-sources.css` (the package registers itself) and `@source`-register only its own files — with **no** import of and no `@source` into the host tree — and does the consumer supply its own semantic tokens and `dark:` variant?
10. Verified with a **plain user**, not just an admin — and did the reply arrive as incremental NDJSON rather than one buffered blob (step 6)?
11. Migrating an existing app: are the old proxy types, `c3Action` chat paths, auth gate, token-minting facade, OAuth redirect (where the app had one), and the C3 package dependency **deleted** — not left running beside the direct connection?
12. Upgrading an app that already depended on the older build (skip entirely if `@c3/nexus-client-ui` appears nowhere): has the package rename been applied to **all four** surfaces (dependency key, every import specifier, the Tailwind `tailwind-sources.css` import, the `@c3/…` Vite alias + `tsconfig` paths), the vendored `agentix-chat-ui/` replaced and reinstalled, and SKILL.md re-read for contract changes?
13. Did I **copy** the template (`vite.config.mts`, `viteShared.ts`, `tsconfig.json`, `main.tsx`, `i18n.ts`, `globals.css`) rather than re-derive `makePinSingletons`, dedupe, alias order, or `tsconfig` paths by hand?
14. Did I set a single, self-consistent React major (reference: `react`/`react-dom` `^18.2` + `react-router` `^7.5.2`; on React 19 instead: `^19` + `react-router` `^8.3.0`), keep `i18next` `^26` / `react-i18next` `^17`, and pin `@types/react` / `@types/react-dom` to the matching tilde line (**`~18.3.0` on React 18, `~19.0.0` on React 19 — tilde, not caret, never `19.3.x`**)?
15. Did I apply **all four** deploy deltas — `HashRouter` (no basename, delete `basename.ts`/`resolveBasename.ts`), the `tsconfig` ambient-stub library exclusion, **no** dev/discovery proxy, and `npm install` only in the consumer (never in `agentix-chat-ui/`)?
16. Did I leave the vendored library unpatched, keep the `.gitignore` negation for `ui/agentix-chat-ui/src/lib/**`, clear the Vite optimizer cache after the React major, and verify the library is current by checking that `NexusChatEmbed` accepts a `nexusBase` prop (not by grepping internal paths)?
17. **Speed vs. correctness:** did I copy the shared wiring verbatim (Vite resolution, `tsconfig` paths, provider tree) rather than re-derive it, spend care only on the small consumer-specific surface (deploy deltas + `agentDefId`/theme/i18n/toggles), and run the one-line built-CSS grep (`scripts/verify_embed.sh`) to prove the presentation layer landed?
18. **Preview stop rule:** if I verified on plain HTTP (`localhost`), did I recognize `myUser` 404 / "Agentix is unavailable" as the **expected** terminal state (Secure cookies cannot complete over HTTP) and stop there — without adding a proxy or rewriting cookies? Did I run the verification ladder (build green + CSS grep + component mounts + discovery resolves) to confirm wiring correctness?
