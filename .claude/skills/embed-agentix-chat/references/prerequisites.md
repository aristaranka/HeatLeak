# Embed Agentix Chat — cluster prerequisites (admin, not this skill's job)

Everything here is **cluster-side admin setup** that must exist before the wired
chat works at runtime. It belongs to whoever administers Agentix and the cluster,
**not** to the embedding team — this skill does **not** perform it. Read it to
answer "why won't the deployed chat sign in?", and hand the fixes to an Agentix
administrator. ("Agentix" is the service; `Nexus*` config/API names keep their
spelling.)

Two cluster records decide whether the wired chat works for a user, plus one
same-cluster ground rule. Nothing writes them automatically.

## Ground rule: same cluster host

The **consuming app** and the **Agentix app** must be on the same cluster host —
same origin (no CORS), same env IdP so cross-app token signatures verify, and the
user must exist in both apps (automatic for OIDC). A different cluster or IdP is
out of scope: the cookie and signature trust break.

## Find the real Agentix mount first

Before publishing config or passing `nexusBase`, **open the Agentix app directly**
in a browser and read its URL: `https://<host>/<env>/<app>/...`. The `<env>` and
`<app>` segments are whatever the Agentix deployment actually uses — **not
literally `nexus`**, and not necessarily the consumer's env. Use those values when
constructing the `serviceAppId` (`<cluster>-<env>-<app>`) or a manual `nexusBase`
(`/<env>/<app>`). Guessing `nexus` is the most common cause of wrong-path failures.

## 1. Mount discovery — `serviceAppId`

`<NexusChatEmbed />` discovers the mount by reading `Microservice.Config` from the
**page's own app**, so a value has to be visible there. Publish **`serviceAppId`**
(recommended — it carries no host, so the `/<env>/<app>` mount is vanity-native
and stays same-origin; the legacy absolute `serviceAppUrl` is still handled, host
discarded). When both are published, `serviceAppId` wins.

**Default — one CLUSTER-scope publish when Agentix is deployed** (`ConfigOverride.CLUSTER`
needs cluster admin, which the deploying admin already has; one record serves
every consumer on the cluster):

```js
Microservice.Config.forName('Nexus').setConfigValue(
  'serviceAppId',
  '<cluster>-<env>-<app>', // the REAL Agentix app id — do NOT assume it is named "nexus" or shares the consumer's env
  ConfigOverride.CLUSTER
);
```

Nothing in the kit writes the CLUSTER record automatically, so where it was
skipped each consumer needs an **APP**-scope override instead — same
`setConfigValue` with `ConfigOverride.APP`, **run against the consuming app that
hosts the chat page, not against Agentix** (`NexusChatEmbed` reads the record from
the page's own app; an APP write on Agentix reports success while discovery still
fails). Or skip discovery entirely: `<NexusChatEmbed nexusBase="/<env>/<app>" />`.
Do **not** use ENV scope — v8 config stores are per-app even at ENV, so it buys
nothing a plain APP write doesn't.

**Multi-studio clusters** (`Microservice.Config.forName("Studio").appId` set):
discovery reads the studio id and tries `forName('Nexus.' + studioId)` before the
cluster-wide `'Nexus'`. Each Studio's operator publishes its own record; the
studio-scoped publish is an operator step (see the MNE deployment runbook).

## 2. Chat access — `Agentix.User` (legacy alias `Nexus.User`)

This is the **real authorization boundary**, and the first thing to check when a
user cannot open the chat. The cookie exchange needs no grant, so a user without
`Agentix.User` plants a cookie **successfully** — the integration looks wired —
and then 403s on the chat APIs. A role on the **consuming** app grants nothing here.

Cluster-once, the Agentix administrator maps the IdP default group to
`Agentix.User` on the **Agentix** app:

```
Nexus.Agent.ServiceApi.setOidcIdpConfigId('<idp-host>')
```

To see what the signed-in user holds, run this **against the Agentix app** (paste
as one line):

<!-- prettier-ignore -->
```js
var u = User.myUser(); JSON.stringify({ id: u.id, groups: (u.groups || []).map(function (g) { return g.id; }), roles: (u.roles || []).map(function (r) { return r.id; }) })
```

## 3. Consumer principal

The consumer app's users must resolve to a principal on the consumer app so the
cookie exchange has a caller. For OIDC, map the default group to any role — the
role needs **no permissions**; it exists only so the user exists:

```json
{ "id": "<YourApp>.User", "permissions": [] }
```

```bash
c3api -c <cluster> -e <env> -a <consumerApp> UserGroup/addIdpGroupForIdp \
  '{"this":{"id":"<YourApp>.User"},"idp":"OidcIdpConfig::<cluster>.c3ci.cloud","idpGroup":"dev.OidcDefaultGroup"}'
```

Nothing needs granting for the mint itself: `User.mySessionToken` is self-scoped
and already in the platform's unprivileged baseline (a zero-role user gets 200).
