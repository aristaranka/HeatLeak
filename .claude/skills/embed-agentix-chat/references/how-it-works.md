# Embed Agentix Chat — how it works

Background behind SKILL.md. You do **not** need this to wire the chat — the Steps
are self-contained. Read it when something behaves unexpectedly, or when you want
to know why the integration needs no backend. ("Agentix" is the service;
`NexusChatEmbed` / `nexusBase` and the other `Nexus*` names keep their spelling.)

## The connection

The browser drives the Agentix app mount (`/<env>/<app>`) **directly** — the same
REST surface the Agentix host UI uses — with plain cookie auth. No server-side
proxy, no second login, no OAuth, no client credentials. The one-time silent
cookie exchange mints via the platform's own self-scoped `User.mySessionToken`, so
the consumer needs no C3 package dependency, no custom type, and no role grant.

```
browser ── cookie (own app path) ──► consumer /api/8/User/mySessionToken     (once, silent)
browser ── Authorization: c3auth ──► agentix /api/8/User/myUser → Set-Cookie  (once, silent)
browser ── cookie (agentix path) ──► agentix /api/8 + agent pod               (everything after)
```

| Layer     | Component                                            | Source                                                                                                                                  |
| --------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| UI        | `<NexusChatEmbed />` (ChatPage + InClusterTransport) | `@c3/agentix-client-ui` (`c3/nexusClient/react/`)                                                                                       |
| Cookie    | `silentNexusCookieBootstrap`                         | `c3/nexusClient/react/src/lib/nexusCookieBootstrap.ts`                                                                                  |
| Mint      | `User.mySessionToken` (platform, self-scoped)        | Platform baseline — no grant, nothing to deploy                                                                                         |
| Transport | `InClusterTransport({ baseUrl })`                    | _In-cluster_: `local: false` (default) targets a sibling app's discovered Agentix mount; opt out with `{ local: true }`                 |
| Discover  | `Microservice.Config.forName('Nexus').serviceAppId`  | Publish `serviceAppId` (`<cluster>-<env>-<app>`), host-free so the mount is vanity-native. Multi-studio + APP-override in prerequisites |

## Why a cookie exchange at all

`c3auth` cookies are **path-scoped per app** (`Path=/<env>/<app>; Secure;
HTTPOnly`). A consumer page holds no credential for the Agentix mount even though
the user is signed in. The bootstrap exchanges the page's own-app session for an
Agentix-path cookie with zero user interaction:

1. **Probe** `POST <nexusBase>/api/8/User/myUser` with `redirect: 'manual'`.
2. If denied: `POST <ownApp>/api/8/User/mySessionToken` (cookie-authed to the
   page's own app) returns the **caller's own** `SessionToken`; read `.signedToken`.
3. Present the token **once** to the Agentix mount in an
   `Authorization: c3auth <token>` header. Any app on the cluster accepts a
   sibling's signed token (same env IdP); the response re-issues it as
   `Set-Cookie` scoped to the Agentix path. The token lives only in function scope
   — never logged, never in a URL, never persisted.
4. Re-probe → cookie works → everything after is plain cookie auth.

**Both endpoints are self-scoped platform defaults** — `myUser` and
`mySessionToken` act only on the caller, so they sit in the unprivileged baseline
every authenticated principal has on every app, with no role grant (a **zero-role**
user gets 200 on both). That is what makes the integration zero-config, so don't
substitute alternatives: `User#sessionToken` takes a _user_ argument →
admin-gated (impersonation risk); a custom self-scoped facade drags in a package
dependency plus an `allow:` grant whose absence 403s plain users while admins pass
(an earlier `NexusEmbedAuth.myToken` did exactly that and was deleted — don't
reintroduce it); role-gated probes (`Echo`, app facades) read "denied" as "no
cookie" for plain users. A failed exchange means the page's own session is dead —
the host app's normal reauth problem; the component renders a quiet "Agentix is
unavailable."
