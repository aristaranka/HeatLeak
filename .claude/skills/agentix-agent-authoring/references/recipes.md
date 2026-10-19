# Recipes — agentix-agent-authoring

Each recipe is an args file for `c3auth_rest_call.js` (SKILL.md §3); `rootUrl` is
omitted throughout. Substitute your real `<nexusAppId>` in the `c3-js-exec`
call. Everything except "Discover / list" mutates — confirm first, and obey the
three governing rules in SKILL.md (recon-then-confirm, publish-offer-last,
UI-footer-every-turn).

**"→ Publish offer"** below is shorthand for rule 2: ask the user whether to
publish to the app they're developing (§6.8 below) — as the **last** line of your
reply, with the UI footer (rule 3) above it, not below.

Wire rules (snake_case except `/publish`, PATCH-merge on definition arrays,
full-replace on capability `files`, error envelope) are in SKILL.md §5. Read the
live OpenAPI spec (SKILL.md §4) before any authoring call.

---

## Reporting an agent's capabilities

When asked "what can this agent have attached", gather the data in one call with
`capability_report.js` (`c3-js-exec <nexusAppId> ./scripts/capability_report.js
'{"agentName":"<name>"}'`) — it returns the definition, the skills / MCP /
plugins registries (a plugin 404 comes back as `{gated:true}`, a fact to report,
not a failure to hide), and the agent's publish history. Then answer in this
shape:

1. **Skills** — attachable ones by scope (bundled / global / user), with counts.
2. **MCP connections** — available or not (the door may not exist in this build
   — check, don't assume); if available, what's registered.
3. **Plugins** — gated or not; state the `nexus-plugins` flag plainly.
4. **Settings needing no attach** — `model`, `effort`, `read_only`,
   `write_action_allowlist`/`denylist`, `instructions`, `app_ids`, with current
   values.
5. **Publish status** — has the bundle shipped to the app the user is
   developing? From `publishHistory` (§6.8): last `publishedAt` + `sha`, or
   "never published here". Keep this distinct from `app_ids`. If it hasn't
   shipped, offer to publish.
6. **A concrete recommendation** for the stated purpose — 2–3 options, not a
   raw inventory dump.
7. **The UI footer** (rule 3) — then, if the bundle hasn't shipped, the publish
   ask as the closing line.

---

## 6.1 Create an agent

Gather, asking one at a time if missing: **name** (matching `^[\w.-]+$`),
**description**, **instructions**, **app_ids** (or `[]`), plus any
already-existing capabilities to attach.

> **If the name isn't slug-legal, propose — don't silently rename.** Spaces and
> most punctuation are rejected. Offer the slug in one line and proceed unless
> they object: _"`My Agent` has a space, which the API rejects — I'll create it
> as `My-Agent` and keep 'My Agent' as the description. Sound good?"_ Say it
> **before** the write, not in the summary after: the slug is what the update
> path and every reference use, so a name the user didn't choose is one they
> can't find later.

```json
{
  "apiBase": "/agent-api/v1",
  "method": "POST",
  "path": "/definitions/create",
  "body": {
    "name": "my-analyst",
    "description": "Reads and charts app data.",
    "instructions": "You are My Analyst. ...",
    "app_ids": ["<cluster>-<env>-<app>"],
    "skill_names": ["quarterly-report"]
  }
}
```

```bash
c3-js-exec <nexusAppId> ./scripts/c3auth_rest_call.js tmp/create-agent-args.json
```

> **If the agent reads or queries app data, you MUST add the bundled
> `c3-interacting-with-application` skill to `skill_names`** (e.g.
> `["c3-interacting-with-application", "quarterly-report"]`). It teaches the agent
> to discover and call the app's types/methods; without it a data agent answers
> from nothing. Bundled — no `/skills/create`, just name it.
>
> **Anti-pattern (observed):** authoring a prose skill that merely _describes_ the
> schema and tells the agent to "use your code tool to query the data live" is
> **not** a substitute — prose grants no capability, so the agent has instructions
> to query but no query tool. Attach `c3-interacting-with-application` for the
> capability; a domain-schema prose skill is an optional add-on, not a replacement.
>
> **And connect the app — set `app_ids`.** A data agent's `app_ids` MUST include the
> app whose data it queries. The skill grants the query _capability_; `app_ids` is
> what _connects_ the agent to that app's data. **Anti-pattern (observed):** creating
> the agent with `skill_names: ["c3-interacting-with-application"]` but no `app_ids`
> (relying on the later `/publish` `appIds` instead) ships an agent with the tool but
> **zero connected apps** — publishing writes the bundle into the app, it does not
> populate the definition's `app_ids`. For an app-embedded data agent, `app_ids` and
> the publish `appIds` are usually the same one app, but you must set **both**.

`201` returns the new definition — but **not** its `id`. The REST view (the
create response and `GET /definitions` alike) deliberately omits `id`, so you
cannot read it back from this call. Retrieve it separately (next paragraph): the
`id` is the stable UUID the `/publish` call needs (`defs` takes ids, not names)
and the `agentDefId` the **embed-agentix-chat** skill requires to wire the chat
component.

> **Get the `id` for any agent (new or created earlier):** call the facade
> `Nexus.Agent.DefinitionApi.list` and read the row's `id` (§6.8 step 1); the
> `publishHistory` call (§6.8 → Publication history) also carries it. Do **not**
> reach for the raw `Nexus.Agent.Definition.fetch` entity — raw type access is
> ACL-blocked even for an AgentAdmin; the `DefinitionApi.list` facade is the
> call that returns `id` under the admin role.

→ **Publish offer** (§6.8).

## 6.2 Create + attach a skill

Compose `SKILL.md` (frontmatter `name` + single-line `description`, then body).
Use `agentix-skill-creator` for the craft of writing nontrivial content.

```json
{
  "apiBase": "/agent-skills-api/v1",
  "method": "POST",
  "path": "/skills/create",
  "body": { "name": "<skill-name>", "files": { "SKILL.md": "<full SKILL.md text>" } }
}
```

Writes are always `scope=global`. The slug must be unused across **all**
scopes — a bundled, global, _or_ user-scope collision returns `409`, so list
first (§6.9). Only bundled and global skills can hang on a definition;
user-scope ones cannot.

→ Attach (§6.5), then **publish offer** (§6.8).

> **If `Skill.description` reads back empty:** the write body has no
> `description` field — the platform parses it out of your `SKILL.md`
> frontmatter, which the spec requires to be **closed** (`name` + `description`
> between `---` fences). An empty read-back therefore points at the frontmatter,
> not at the API. Check the fences once; if it still comes back empty, note it
> and move on rather than cycling through frontmatter variants.

## 6.2a Give the agent a tool

Native custom tools (`custom_tool_names`) are bundled in-repo with no REST door,
so a tool requested over chat is authored as a **skill** (§6.2) — same
`/skills/create` call, a tool-shaped body. The `SKILL.md` body tells the agent
_how_ to do the job in one of two ways; pick by where the work runs:

**A — call an API in the user's app.** The agent already talks to the app it's
attached to; the skill just names the exact type/method and argument shape, so the
agent invokes it directly. Body sketch:

```md
---
name: refund-lookup
description: Look up a refund's status by order id.
---

To look up a refund, call `Sales.Order.refundStatus` on the app with
`{"orderId": "<id>"}`. Return the `state` and `amount` fields to the user.
```

**B — ship a script the agent runs with its `c3-js-exec` tool.** For a
deterministic transform or a multi-step call, put the logic in a script and have
the skill instruct the agent to run it. Store the script alongside the skill body
(same `files` map) and reference it by name:

```json
{
  "apiBase": "/agent-skills-api/v1",
  "method": "POST",
  "path": "/skills/create",
  "body": {
    "name": "<tool-name>",
    "files": {
      "SKILL.md": "---\nname: <tool-name>\ndescription: <one line>\n---\n\nRun `scripts/<tool>.js` with the agent's c3-js-exec tool, passing `{...}`. Report the returned JSON.",
      "scripts/<tool>.js": "<script source>"
    }
  }
}
```

Keep it minimal: prefer pattern A when a single app API already does the job —
only reach for a script (B) when there's real logic to encode. Author the body
with `agentix-skill-creator` for anything nontrivial.

→ Attach (§6.5), then **publish offer** (§6.8).

## 6.3 Create + attach an MCP connection

Ask for **connection_key** (slug), **name**, **endpoint** (public http(s) —
internal/metadata hosts are rejected), **transport** / **auth_kind**, and any
secret. **Never have the user paste a secret into chat** — they put it directly
into the body file on disk.

At the time of writing the live spec gives `transport: ["http","sse"]` (default
`http`) and `scope: ["global","user"]` (default `global`). Confirm against
SKILL.md §4 rather than trusting these — `auth_kind`'s values in particular vary
by build.

```json
{
  "apiBase": "/agent-mcp-api/v1",
  "method": "POST",
  "path": "/mcp-connections/create",
  "body": {
    "connection_key": "acme",
    "name": "Acme",
    "transport": "<enum>",
    "endpoint": "https://mcp.acme.example",
    "auth_kind": "<enum>"
  }
}
```

→ Attach (§6.5), then **publish offer** (§6.8).

## 6.4 Create + attach a plugin

**Check the gate first** — every plugin method 404s `feature_disabled` while
`nexus-plugins` is off cluster-side. There is no client-side workaround.

```json
{ "apiBase": "/agent-plugins-api/v1", "method": "POST", "path": "/plugins/list", "body": {} }
```

If that 404s: **stop and report** — an operator must enable the flag. Don't
retry with a different body shape. If it succeeds:

```json
{
  "apiBase": "/agent-plugins-api/v1",
  "method": "POST",
  "path": "/plugins/create",
  "body": {
    "name": "audit-hook",
    "harness": "<from spec description>",
    "plugin_version": "1.0.0",
    "files": { "index.js": "..." }
  }
}
```

`harness` has **no** `enum` in the spec — its valid value lives in the property
_description_ (v1: `opencode`). Read the description, not the enum (SKILL.md §4).

→ Attach (§6.5), then **publish offer** (§6.8).

## 6.5 Attach a capability to an existing agent

**Prefer `attach_capability.js`** — it does the read → merge → send safely and
**defaults to a dry run**, so you can show the user the merged arrays and get
approval (rule 1) before applying:

```bash
# dry run — shows current vs would-be arrays, writes nothing:
c3-js-exec <nexusAppId> ./scripts/attach_capability.js '{"agentName":"my-analyst","skill_names":["quarterly-report"]}'
# apply after approval:
c3-js-exec <nexusAppId> ./scripts/attach_capability.js '{"agentName":"my-analyst","skill_names":["quarterly-report"],"dryRun":false}'
```

`mode` is `add` (default, union), `remove`, or `set`. To do it by hand instead:

**Never send just the new name** — update replaces the whole array, so a naive
single-name update silently wipes every other attachment. Always read → merge →
send:

```json
{ "apiBase": "/agent-api/v1", "method": "GET", "path": "/definitions" }
```

Find the agent's row, note its current `skill_names` /
`mcp_connection_keys` / `plugin_names` / `custom_tool_names`, then send the
**merged** array:

```json
{
  "apiBase": "/agent-api/v1",
  "method": "POST",
  "path": "/definitions/<agentName>/update",
  "body": { "skill_names": ["<existing-1>", "<existing-2>", "<new-one>"] }
}
```

One array per call, or several in one `body` — PATCH-merge leaves omitted
arrays untouched.

An attachment is inert in the user's app until the bundle ships.
→ **Publish offer** (§6.8).

## 6.6 Modify an existing agent

Same read → merge → send discipline as §6.5. Scalars overwrite directly; only
**arrays** need the merge step.

```json
{
  "apiBase": "/agent-api/v1",
  "method": "POST",
  "path": "/definitions/<agentName>/update",
  "body": {
    "description": "Updated summary.",
    "model": "anthropic/claude-sonnet-5",
    "effort": "high",
    "app_ids": ["<cluster>-<env>-<app1>"]
  }
}
```

→ **Publish offer** (§6.8) — including when the change only touched
`app_ids`, which grants permission but ships nothing.

## 6.7 Update a capability body (skill / MCP / plugin)

Editing what's _inside_ an attached capability, as opposed to which capabilities
are attached (§6.5). The definition is untouched, so **nothing here shows up in
`GET /definitions`** — and that is exactly why it is easy to forget to
re-publish.

```json
{
  "apiBase": "/agent-skills-api/v1",
  "method": "POST",
  "path": "/skills/<skillName>/update",
  "body": { "files": { "SKILL.md": "<full new text>" } }
}
```

```json
{
  "apiBase": "/agent-mcp-api/v1",
  "method": "POST",
  "path": "/mcp-connections/<connectionKey>/update",
  "body": { "endpoint": "https://new.example" }
}
```

```json
{
  "apiBase": "/agent-plugins-api/v1",
  "method": "POST",
  "path": "/plugins/update/<pluginName>",
  "body": { "plugin_version": "1.1.0", "files": { "index.js": "..." } }
}
```

**`files` is a full replace, not a merge** — send the complete map including an
unchanged `SKILL.md`, or you will drop files. (Definition arrays PATCH-merge;
capability file maps do not. Different contract, same call shape.) A bundled or
user-scope skill name returns `409`; unknown returns `404`.

**Then find every agent that carries it** — one body can be attached to several
— and re-publish each. `skill_names` on the definitions list (§6.9) tells you
who's affected; `publishHistory` (§6.8) tells you which apps each one shipped to.

→ **Publish offer** (§6.8) for every affected agent, not just the one you were
discussing.

## 6.8 Publish an agent to the app being developed

**Prefer `publish_agent.js`** — it runs the whole sequence below (resolve id →
preflight every target → publish → per-row status) and **defaults to a dry run**,
refusing to publish if any preflight is non-`ok`:

```bash
# dry run — resolves ids + preflights, publishes nothing:
c3-js-exec <nexusAppId> ./scripts/publish_agent.js '{"agentNames":["my-analyst"],"appIds":["<cluster>-<env>-<app>"]}'
# publish after approval + a clean preflight:
c3-js-exec <nexusAppId> ./scripts/publish_agent.js '{"agentNames":["my-analyst"],"appIds":["<cluster>-<env>-<app>"],"dryRun":false}'
```

The manual, step-by-step form (useful for one-off debugging or without the
helper) follows.

**What it does.** Builds the agent's config bundle — the definition plus its
dependency closure (global skill bodies, MCP connection config; secrets by
reference only, never values) — and writes it into each target app's package
store at
`meta://<targetRootPkg>/resource/agent-bundles/<sanitized-agent-name>/bundle.yaml`.
This is the step that makes an authored agent real _in the app being built_.

**Which app.** The one the user is developing — in practice the app your
session is already connected to (the `<thisAppId>` of SKILL.md §2). Reuse it;
ask only if genuinely ambiguous (nothing connected, several candidates, or the
user names a different app).

> **Don't offer a publish you can't name a target for.** If you genuinely don't
> know which app they're developing, ask for it **as part of** the offer rather
> than making them volunteer it: _"Want me to publish this to your app? Which
> app id should it go to?"_ An offer that can't be acted on costs a whole
> round-trip.

> **Typed `Nexus.*` reads must target the Agentix appId — never the consumer
> app.** `Nexus.Agent.Definition`, `Nexus.Agent.ConfigBundleApi`, and every
> other `Nexus.*` type only exist in the `nexus` package. Running them against the
> consumer app returns `Unknown type` / `404`. Always use `<nexusAppId>` as the
> execution target, even when the _subject_ of the call is the consumer app
> (e.g. `checkTargetApp("<consumerAppId>")`).

**Step 1 — get the definition `id`, not the name.** `defs` takes ids, and the
REST view **does not expose `id`** (SKILL.md §1). Read it from the facade
`Nexus.Agent.DefinitionApi.list`, which returns each row's `id` — note this and
step 2 are **typed method calls, not REST doors**, so they use `c3-run` rather
than the args-file script (no `c3-run`? see the callout at the top of SKILL.md).
Use the facade, **not** the raw `Nexus.Agent.Definition` entity: raw type access
is ACL-blocked even for an AgentAdmin, while the `DefinitionApi.list` facade
returns `id` under the admin role:

```bash
c3-run <nexusAppId> Nexus.Agent.DefinitionApi list \
  '{"spec":{"include":"id,name,appIds","limit":200}}'
```

**Step 2 — preflight the target.** The server gates strictly on `AppMode.DEV`;
a `test` or `prod` target is refused. Check _before_ promising a publish:

```bash
c3-run <nexusAppId> Nexus.Agent.ConfigBundleApi checkTargetApp \
  '{"appId":"<cluster>-<env>-<app>"}'
```

| `code`         | Meaning                                                                         | What to do                                                            |
| -------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `ok`           | DEV mode, publishable                                                           | Proceed to step 3.                                                    |
| `not_dev_mode` | Reachable, wrong mode (e.g. `{"ok":false,"code":"not_dev_mode","mode":"test"}`) | **Stop.** Report the mode — only a DEV app is a valid target.         |
| `invalid`      | Malformed app id                                                                | **Stop.** Fix the id with the user.                                   |
| `unreachable`  | No such app, or caller not authorized                                           | **Stop.** Report it; the real reason is masked client-side by design. |

Never retry or work around a non-`ok` code — it is an environment fact.

**Step 3 — publish.** This door is **camelCase** (`defs`, `appIds`) — the one
exception to SKILL.md §5:

```json
{
  "apiBase": "/agent-config-bundle-api/v1",
  "method": "POST",
  "path": "/publish",
  "body": { "defs": ["<definitionId>"], "appIds": ["<cluster>-<env>-<thisApp>"] }
}
```

```bash
c3-js-exec <nexusAppId> ./scripts/c3auth_rest_call.js tmp/publish-agent-args.json
```

**Step 4 — read every result row. `200` does not mean success.** The response
is `{ ok, results, warnings }`, one row per (agent, app) pair:

| Field                   | Meaning                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `agentId` / `agentName` | Which definition this row covers                                   |
| `appId`                 | Which target app this row covers                                   |
| `status`                | `succeeded` or `failed` — **the per-row verdict**                  |
| `error`                 | Failure reason; null on success                                    |
| `sha`                   | Content hash of the published bundle; empty when no write happened |
| `writtenUrl`            | Serialized `Pkg.Path` on success; null on failure                  |

`ok: true` says only that the call ran — rows can still be `failed` (a failed
preflight lands here too). **Check `status`/`error` per row and report failures
explicitly**; never summarize a mixed result as done. Identical config yields
an identical `sha`, so re-publishing is safe and idempotent.

**Then confirm plainly:** _"Published `<agentName>` to `<appId>` (sha `<sha>`)
— your app picks it up on next load."_ A completed publish leaves no question
pending, so the UI footer (rule 3) closes that reply normally.

**Publication history** — what shipped where, newest first, without
re-publishing:

```bash
c3-run <nexusAppId> Nexus.Agent.ConfigBundleApi publishHistory \
  '{"agentId":"<definitionId>","limit":50,"status":"succeeded"}'
```

Returns `{ rows: [{agentId, appId, publishedAt, publishedBy, sha, status,
error}] }`. Omit `status` to include failed attempts. This is the read behind
the reporting recipe's publish-status line, and the fastest answer to "why
aren't my changes showing up?"

## 6.9 Discover / list (read-only, no admin role needed)

```json
{ "apiBase": "/agent-api/v1", "method": "GET", "path": "/definitions" }
```

```json
{ "apiBase": "/agent-skills-api/v1", "method": "POST", "path": "/skills/list", "body": {} }
```

```json
{ "apiBase": "/agent-mcp-api/v1", "method": "GET", "path": "/mcp-connections/list?scope=global" }
```

```json
{ "apiBase": "/agent-plugins-api/v1", "method": "POST", "path": "/plugins/list", "body": {} }
```

The last 404s `feature_disabled` when gated off — expected, not an error.

## 6.10 Delete

> **Irreversible, and there is no undo door.** These calls remove the row
> outright — no soft-delete, no restore endpoint. Before running one: name the
> exact row, confirm the user means _that_ one, and warn that deleting a skill
> or connection **still attached** to another agent breaks that agent's next
> session. Deleting is also **not** an unpublish: a bundle already published
> into a target app stays there (§6.8), so say so rather than implying the
> delete cleaned it up.

```json
{ "apiBase": "/agent-api/v1", "method": "DELETE", "path": "/definitions/delete/<agentName>" }
```

```json
{ "apiBase": "/agent-skills-api/v1", "method": "DELETE", "path": "/skills/delete/<skillName>" }
```

```json
{ "apiBase": "/agent-mcp-api/v1", "method": "DELETE", "path": "/mcp-connections/delete/<connectionKey>?scope=global" }
```

```json
{ "apiBase": "/agent-plugins-api/v1", "method": "DELETE", "path": "/plugins/delete/<pluginName>" }
```

`is_protected: true` rows (e.g. the built-in "C3 Agent") refuse deletion, as do
`kind=system` and downloaded shared-origin definitions (`409`).

**No publish offer here** — the agent is gone, so there's nothing to ship.
