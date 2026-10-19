# Resolving Agentix's `appId` — full detail

Long-form companion to `SKILL.md` §2. Read this only when discovery returns
something other than a clean `appId`, or when the platform API misbehaves.
("Agentix" is the service; the config record and script names keep the older
`Nexus`/`nexus` spelling because they are API-level tokens.)

## Why this step exists

This skill runs on a **consumer app**, not on Agentix. Every REST recipe targets
Agentix's own doors, so you need Agentix's `<cluster>-<env>-<app>` id (or at least
a usable base URL) before anything else works.

**Never guess it.** Agentix does not necessarily share the consumer app's
cluster or env, and a hand-typed `<cluster>-<env>-nexus` guess is wrong often
enough to be dangerous — it either 404s or, worse, hits a _different_
environment's Agentix and writes there.

## The config record

`Microservice.Config.forName('Nexus')` — published once by an operator at
cluster setup on any app that needs to reach Agentix. **This skill only reads
it; it never writes it.**

**Multi-studio clusters:** when `Microservice.Config.forName("Studio").appId` is
present (e.g. `"plat-nxs-studio"`), the script tries the studio-scoped record
`Microservice.Config.forName("Nexus.<studioId>")` **before** the cluster-wide
`"Nexus"` record. Each Studio's operator publishes its own record; the
cluster-wide one remains the fallback when no Studio config is present or no
studio-scoped Nexus config exists.

Config names are **case-sensitive**: `forName("nexus")` and `forName("Nexus")`
are different rows (confirmed empirically). Query whatever capitalization the
operator actually published under.

## Resolution priority

| Priority | Condition                                                      | What you get                                        |
| -------- | -------------------------------------------------------------- | --------------------------------------------------- |
| 1        | `Studio` config has `appId` + `Nexus.<studioId>` config exists | Studio-scoped id/URL                                |
| 2        | `serviceAppId` set (cluster-wide `Nexus`)                      | The real id **and** a live base URL derived from it |
| 3        | only `serviceAppUrl` set (cluster-wide `Nexus`)                | A fully usable base URL, but no id                  |
| 4        | neither set                                                    | Nothing — a genuine setup gap; stop                 |

### 1. `serviceAppId` is set (the good path)

Use the id directly, and derive the base URL **from the id itself**:

```js
App.forId(id, true).externalUrl.endpoint(apiBase);
```

Preferred over trusting `serviceAppUrl`, because it is derived fresh from the
app's actual current URL config rather than a second value an operator could
forget to update if Agentix's URL ever changes.

### 2. Only `serviceAppUrl` is set (usable — do not treat as blocked)

This is a **working** result, not a near-miss. Pass the URL straight through
as `c3auth_rest_call.js`'s explicit `rootUrl` (`SKILL.md` §3) and every REST
call behaves normally — confirmed live (`200`, correct data).

The **only** thing missing is the literal id string, which matters only if
your environment's _tooling_ addresses apps by id (e.g. this harness's
`c3-js-exec <appId> ...` command position). The REST calls themselves do not
need it.

Setting `serviceAppId` is a config write on Agentix itself — outside this
skill's scope. Report the gap if you specifically need the id; never attempt
the write yourself.

### 3. Neither is set (stop)

Agentix was never registered as a dependency of this app. Relay the error to the
user as-is and stop. An operator must publish `serviceAppId` once — easiest
done on the Agentix app itself, where `App.inst().id` always resolves correctly.
Do not fall back to a sibling-app guess.

## Publishing the studio-scoped config (operator convenience)

On a multi-studio cluster, each Studio's Agentix operator must publish a
studio-scoped `Microservice.Config` record once. Run `resolve_studio_id.js`
**on the Agentix app itself** — it reads `Microservice.Config.forName("Studio").appId`
and prints the ready-to-run publish command:

```bash
c3-js-exec <nexusAppId> ./scripts/resolve_studio_id.js
```

Example output:

```json
{
  "studioId": "plat-nxs-studio",
  "configName": "Nexus.plat-nxs-studio",
  "appId": "plat-myenv-nexus",
  "publishCommand": "Microservice.Config.forName('Nexus.plat-nxs-studio').setConfigValue('serviceAppId', 'plat-myenv-nexus', ConfigOverride.CLUSTER)"
}
```

Copy the `publishCommand` and run it in the Agentix app's JS console. On a
single-Agentix cluster (no Studio config), the script returns the cluster-wide
`forName('Nexus')` command instead.

## Running the discovery script

Run against **this** app (the consumer), not Agentix — you don't know Agentix's
id yet, which is the entire point:

```bash
c3-js-exec <thisAppId> ./scripts/discover_nexus_app.js
```

Optional args: `{"apiBase":"/agent-api/v1"}` — the door base path to build the
returned `baseUrl` against. Defaults to `""` (bare app root), still valid.

Return shapes:

```json
{ "resolved": "appId", "appId": "plat-myenv-nexus", "baseUrl": "https://plat.example.com/myenv/nexus/agent-api/v1" }
```

```json
{ "resolved": "urlOnly", "baseUrl": "https://...", "note": "Fully usable — pass baseUrl as rootUrl..." }
```

```json
{ "resolved": "none", "error": "Nexus is not registered as a Microservice dependency on this app..." }
```

(The `none` error text is emitted verbatim by the script — it names the
`forName('Nexus')` config record, so it keeps the `Nexus` spelling.)

## `endpoint()` unavailable on older platform builds

Reported on a different runtime as `Cannot find function endpoint` — not
reproduced in this environment, where it works as documented, but
platform/package versions vary.

Fallback ladder:

1. String-concatenate from the URL's own fields:
   `externalUrl.scheme + "://" + externalUrl.host + "/<env>/<app>" + apiBase`
2. Hardcode `rootUrl` explicitly in the args file.

Take the workaround rather than debugging the platform API further — it is a
one-line fix either way.
