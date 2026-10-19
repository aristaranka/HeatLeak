# Embed Agentix Chat — migration & upgrade

Two one-off paths behind SKILL.md. Read the section you need. ("Agentix" is the
service; `Nexus*` type / package / prop names keep their spelling.)

## Migrating an app off the C3 Code (`nexusPkg`) template

An app wired before this design embeds the chat through the **C3 Code /
`nexusPkg` template**: a server-side proxy type (`NexusApiClient`) re-emitting
chat traffic through the consumer's own `/api/8`, usually alongside an auth gate
(`NexusAuth` / `NexusAuthGate`) in front of the chat — some apps on that template
carry the proxy only, with no OAuth redirect, so check rather than hunt for one.
**None of it is required** — it is strictly more code on the per-turn path, and
it drifted from host behavior feature by feature. Refactor onto the direct
connection; delete rather than keep in parallel (skip what this app does not
have):

| Delete                                                             | Why it is now dead                                                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| The server-side proxy types + every `c3Action` chat path they back | The browser drives the Agentix mount's REST surface directly — the same one the host UI uses. No proxy on either side  |
| The auth gate / `isAuthenticated` checks, where present            | `NexusChatEmbed` authenticates itself: the silent cookie bootstrap runs on mount and renders its own unavailable state |
| Any custom token-minting facade (e.g. `NexusEmbedAuth.myToken`)    | The mint is the platform's self-scoped `User.mySessionToken` — nothing to grant, nothing to deploy                     |
| The OAuth redirect / second sign-in, **if this app has one**       | The chat runs as the already signed-in user, on that user's own session                                                |
| The C3 package dependency added for the proxy                      | `nexusClient` ships no C3 types (step 1)                                                                               |

Then wire it exactly as a fresh install (steps 0–4). A stale bundle still calling
the old facade or probing a role-gated endpoint is the top post-migration symptom
— see [`troubleshooting.md`](./troubleshooting.md).

## Upgrading the library

An app **already on the direct connection** but built against an earlier starter
kit needs more than a reinstall if it predates the package rename:
`@c3/nexus-client-ui` → `@c3/agentix-client-ui`. This section applies **only** to
an app that already depends on the old name — now a rare case, since the package
has never been published to a registry, so the only apps carrying the old name
are ones wired by hand from a pre-rename kit. Check for `@c3/nexus-client-ui`
first: if it appears nowhere, there is nothing to rename. Where it does apply,
the old name survives in four places outside the vendored directory, and a stale
one fails at build/resolve time rather than loudly:

| Rename surface                                                                  | Note                                                                                                                                      |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| The npm **dependency key** in the consumer's `package.json`                     | Only the key is renamed — the value still points at the vendored `agentix-chat-ui/` directory, which npm resolves by path                 |
| Every `import … from '@c3/…'` **specifier**                                     | Including the bare-package import of `NexusChatEmbed` (step 2)                                                                            |
| The Tailwind entry's `@import '<pkg>/tailwind-sources.css'` line                | Step 4 — the one chat-specific CSS line; a stale name means chat utilities silently vanish from the built CSS                             |
| The `@c3/…` **alias patterns** in the consumer's Vite config + `tsconfig` paths | Both are anchored on the package name (Vite alias regexes, `paths` entries), so a stale one resolves nothing rather than erroring clearly |

Then re-do the parts a new kit can change:

1. Replace the vendored `agentix-chat-ui/` directory with the one from the new
   ZIP and reinstall.
2. Re-check the shared single-copy packages and the **two** `@/` resolution
   roots (consumer `src/` first, then the library) against the template's
   `vite.config.mts` — it is the reference config (step 4).
3. **Re-read SKILL.md** for contract changes instead of assuming the previous
   wiring still holds; the kit is built from the same commit as the Agentix app
   that served it, so the two move together.
4. Standing rules are unchanged: don't restyle the chat, fork its components, or
   copy files out of the package.

Only the **npm package name** changed — the C3 packages are still
`c3/nexusClient` / `c3/nexusClientTest` and the vendored directory is still
`agentix-chat-ui/`, so a sweep that renames those has gone too far.
