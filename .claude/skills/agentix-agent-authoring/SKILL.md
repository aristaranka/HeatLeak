---
name: agentix-agent-authoring
description: >
  Create, configure, and publish Agentix agents over REST. Give an agent its
  capabilities — skills, tools, MCP connections, plugins — then publish it into
  the app you're building so the changes actually appear there (a change is live
  in Agentix but absent from the app until published). Reads the live API spec
  before each change so fields and enums come from the deployment, and offers to
  publish afterward. A requested "tool" is delivered as a skill that calls an app
  API or runs a script.
triggers:
  - create an agent
  - configure an agent
  - give my agent a skill
  - give my agent a tool
  - add a tool to my agent
  - connect my agent to an MCP server
  - publish my agent to my app
  - my agent changes aren't showing up
  - /agentix-agent-authoring
antiTriggers:
  - improve from my chats
  - learn a skill from this conversation
  - build me a dashboard
  - build me an app
core: false
category: agentix
version: 1.8.0
---

# agentix-agent-authoring — Author, Attach, Publish, and Modify Agents

An **agent** is one `Nexus.Agent.Definition` row, plus the capabilities it
names, plus the apps its bundle has been **published** to. This skill runs on a
**consumer app** rather than on Agentix, so the work is always one level
removed: find Agentix, then talk to it. ("Agentix" is the service whose app
hosts the `Nexus.*` types; the config key and script names below keep the older
`Nexus`/`nexus` spelling because they are API-level tokens.)

| Step | What                                                                | Where             |
| ---- | ------------------------------------------------------------------- | ----------------- |
| 1    | Find Agentix's `appId` — nothing works without it                   | §2                |
| 2    | **Read the live OpenAPI spec** — real doors, enums, required fields | §4                |
| 3    | Author the capability on its own door                               | recipes §6.2–§6.4 |
| 4    | Attach it to the agent by name                                      | recipes §6.5      |
| 5    | **Publish** the bundle to the app being developed                   | recipes §6.8      |

> **The recipes (§6.x) live in `references/recipes.md`** — copy-paste args files
> for create / attach / modify / publish / delete, plus the capability-report
> recipe. This document (SKILL.md) is the spine: concepts, doors, wire rules,
> auth, scripts, and the three governing rules. Open `references/recipes.md` for
> the exact call to run.

Everything goes through Agentix's REST doors, authed with the caller's own
`c3auth` session — no BFF, no separate service token.

## Scripts (run via c3-js-exec on the Agentix app)

Prefer a script over a hand-run sequence wherever one exists — each encodes a
verified call shape and removes a footgun. All run server-side and carry auth
the way `c3auth_rest_call.js` does.

| Script                  | Does                                                                        | Mutates?          |
| ----------------------- | --------------------------------------------------------------------------- | ----------------- |
| `discover_nexus_app.js` | Resolve Agentix's `appId` + base URL from the consumer app (§2)             | no                |
| `openapi_slice.js`      | Fetch a door's OpenAPI spec, return only one node (§4) — never inhale it    | no                |
| `capability_report.js`  | Gather definition + skills/MCP/plugins + publish history in one call        | no                |
| `c3auth_rest_call.js`   | Generic single REST call to any of the five doors (§3)                      | depends on ARGS   |
| `attach_capability.js`  | Safe read → merge → send attach (§6.5); **dry-run by default**              | on `dryRun:false` |
| `publish_agent.js`      | Resolve id → preflight → publish → per-row status (§6.8); **dry-run first** | on `dryRun:false` |
| `resolve_studio_id.js`  | Operator helper: studio-scoped config publish command (discovery ref)       | no                |

> **`c3-js-exec` and `c3-run` are tool names, not C3 APIs — substitute your
> own.** This skill writes `c3-js-exec <appId> <file.js> [args]` and
> `c3-run <appId> <Type> <method> <json>` because that is what this harness
> calls them. **If your environment has no tool by those names, nothing here is
> blocked** — both are thin wrappers over ordinary platform endpoints:
>
> - **`c3-js-exec <appId> <file.js>`** → `POST <appUrl>/api/8/Js/exec` with
>   `{"src": …}`. Two non-obvious encoding rules — read
>   `references/no-js-exec-fallback.md` before hand-rolling it.
> - **`c3-run <appId> <Type> <method>`** → call the method inside a `Js.exec`
>   script, or `POST <appUrl>/api/8/<Type>/<method>` with the args as the body.
>   Only §6.8's manual path uses `c3-run`; `publish_agent.js` needs neither.
>
> Both carry auth the same way your environment normally does (a `c3auth`
> cookie is the norm — §7). **On the typed `/api/8/<Type>/<method>` route, set
> `Content-Type: application/json; charset=UTF-8`** — omitting the charset 500s
> with `error UTF-8, application/json`, which looks like a body-shape problem
> but is not. **Pass args positionally** in JS (`checkTargetApp("<appId>")`); a
> named-arg object throws `Invalid value … for parameter`. (Both verified live.)

**Three rules that govern every turn in this skill:**

> **1. Recon, then confirm.** Read the spec before authoring (§4) — never guess
> a field, enum, or door. Then, because every recipe except §6.9 mutates,
> describe the operation and get approval before running it. The mutating
> scripts default to `dryRun:true` so the "show, then apply" split is built in.
>
> **2. Every write ends with a publish offer — and it goes LAST.** A change is
> live in Agentix only; the app the user is developing still runs whatever bundle
> was published there last. Ask unprompted, publish on a yes, never publish
> silently. §6.10 (delete) is the only exemption — there's no agent left to ship.
>
> **Body edits count too.** The bundle **inlines** skill bodies and MCP config,
> so editing a `SKILL.md`, repointing an endpoint, or bumping a plugin (§6.7)
> stales every published bundle _while the definition looks untouched_ — nothing
> in Agentix signals it. Re-publish to **every** app that agent shipped to
> (`publishHistory`, §6.8), not just the current one.
>
> **Put the ask last and make it stand out** — nothing may sit below it: not a
> footer, a state dump, or an explanation. Own line, bolded, naming the agent
> and the resolved app id:
>
> **Want me to publish `<agentName>` to `<appId>` now?** I'll preflight the
> target first — publishing requires the app to be in DEV mode.
>
> Caveats and explanation _above_, question _last_.

> **3. Point at the UI every turn.** Managing agents by clicking is easier than
> by chat for most people, and the Agentix UI does everything this skill does.
> Once you have Agentix's `appId` (§2) you have its URL, so include one line
> every turn — create, attach, publish, modify, delete, report, even an error:
> _"You can also manage your agents visually at `<appUrl>/agents` — it's usually
> easier than doing this over chat."_ A footer, not a paragraph.
>
> **Rule 2 outranks this one.** With a question pending, the footer goes
> **above** the ask so the ask stays last. With nothing pending, the footer
> closes the reply.

---

## 0. Routing — what does the user want?

**Step zero, always:** have Agentix's `appId` (§2). Reuse it if this session
already resolved it.

All recipe sections (§6.x) and the capability-report recipe live in
`references/recipes.md`.

| User says…                                           | Go to (in `references/recipes.md`)                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| "create an agent"                                    | §6.1                                                                 |
| "create a skill" (± attach)                          | §6.2                                                                 |
| "give the agent a tool" / "add a tool"               | §6.2a — a tool is authored as a skill (call an app API, or a script) |
| "create an MCP connection"                           | §6.3                                                                 |
| "create a plugin"                                    | §6.4                                                                 |
| "attach X to agent Y" (X exists)                     | §6.5 (`attach_capability.js`)                                        |
| "modify / update agent Y"                            | §6.6                                                                 |
| "edit the skill / connection / plugin itself"        | §6.7 — then re-publish                                               |
| "publish this agent" / "make it available in my app" | §6.8 (`publish_agent.js`)                                            |
| "my agent changes aren't showing up in my app"       | §6.8 — an unpublished bundle, or a body edited after publish (§6.7)  |
| "what skills / agents / connections exist"           | §6.9                                                                 |
| "what can this agent have" / "its capabilities"      | Reporting recipe (`capability_report.js`)                            |
| "remove / delete X"                                  | §6.10                                                                |

**Before any authoring call, do recon** (§4): read the live OpenAPI spec, then
list current rows. Never assume a name is free, and never let the user guess an
enum value — the spec has them.

---

## 1. The agent = the definition

One `Nexus.Agent.Definition` carries the agent's identity **and** every
attachment. Capability bodies live in their own registries, referenced here by
name.

| Field (entity)                                   | REST body                                                                        | What it holds                                                                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                             | — (assigned, immutable)                                                          | Stable identifier. **The REST view does not expose it**; read it from the `Nexus.Agent.DefinitionApi.list` facade, not the raw entity — see §6.8. |
| `name`                                           | `name` (create only; update targets `:name` in the path, resolves by id or name) | **Must match `^[\w.-]+$` — no spaces.** Human-friendly naming goes in `description`.                                                              |
| `description`                                    | `description`                                                                    | One-line summary for registry / picker cards.                                                                                                     |
| `instructions`                                   | `instructions`                                                                   | The agent's **system prompt** — injected into the base `AGENTS.md`.                                                                               |
| `skillNames`                                     | `skill_names`                                                                    | Attached **skills** — bundled slugs or global names.                                                                                              |
| `mcpConnectionKeys`                              | `mcp_connection_keys`                                                            | Attached **MCP connections** — by `connection_key`.                                                                                               |
| `pluginNames`                                    | `plugin_names`                                                                   | Attached **plugins** — gated behind `nexus-plugins`.                                                                                              |
| `customToolNames`                                | `custom_tool_names`                                                              | Attached **custom tools** — bundled slugs.                                                                                                        |
| `appIds`                                         | `app_ids`                                                                        | Apps the agent **may connect to**; `[]` = unrestricted. **Not publishing** — see the callout below.                                               |
| `llmModel` / `llmEffort`                         | `model` / `effort`                                                               | Model id + effort (`low`/`medium`/`high`/`xhigh`/`max`/`auto`).                                                                                   |
| `readOnly`                                       | `read_only`                                                                      | Forces read-only; only ever narrows app policy.                                                                                                   |
| `writeActionAllowlist` / `writeActionDenylist`   | `write_action_allowlist` / `write_action_denylist`                               | Narrow which write actions the agent may take.                                                                                                    |
| `isProtected`                                    | `is_protected`                                                                   | System-row marker; protected rows refuse deletion.                                                                                                |
| `llmTier`, `icon`, `isSubagent`, `subagentNames` | —                                                                                | Real entity fields the REST body neither accepts nor maps. Not settable here.                                                                     |

> **Attach by name; author the body first.** Create/update **rejects an unknown
> name (400)**. On update each array you send **replaces** the stored one, so
> attaching is always _read → merge → send the whole array_ — use
> `attach_capability.js` (§6.5), which does exactly that.

### Capability catalog

| Kind               | What it is                                                                                                                        | Author it (admin)                                                                                                 | Wire up by                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Skill**          | Prose instructions the model reads on demand                                                                                      | `POST /skills/create` — `{name, files}`, `files` must include `SKILL.md`; always **global**                       | `skill_names`                                                                                                    |
| **MCP connection** | Link to an external MCP server whose tools the model calls                                                                        | `POST /mcp-connections/create` — `{connection_key, transport, endpoint, auth_kind, …}`; `scope` defaults `global` | `mcp_connection_keys`                                                                                            |
| **Plugin**         | Runtime lifecycle hook; invisible to the model                                                                                    | `POST /plugins/create` — `{name, files, harness, plugin_version}`; **gated**                                      | `plugin_names`                                                                                                   |
| **Custom tool**    | Deterministic code tool the model invokes (zero LLM tokens)                                                                       | Bundled in-repo only — no REST authoring surface                                                                  | `custom_tool_names`                                                                                              |
| **Publish**        | Ships the agent's config **bundle** — definition **plus inlined skill bodies and MCP config** — into a target app's package store | `POST /publish` on `/agent-config-bundle-api/v1` — `{defs, appIds}`                                               | **not** a definition array — a separate call, after every change _including_ a capability-body edit (§6.7, §6.8) |

Pick by the work: judgment or multi-step → **skill**; external server → **MCP
connection**; cross-cutting runtime behavior → **plugin**; mechanical
parse/format/calculate → **custom tool**.

> **A "tool" requested over chat is authored as a skill.** Native custom tools
> (`custom_tool_names`) are bundled in-repo with no REST door, so when a user asks
> to "give the agent a tool" you deliver the capability as a **skill** (§6.2)
> whose body tells the agent how to do the job — either by calling a specific API
> in the user's app, or by running a script with the agent's `c3-js-exec` tool.

> **A data agent MUST attach the bundled `c3-interacting-with-application` skill.**
> If the agent answers questions about the app's own data (records, types, methods) —
> "chat about my inventory", "ask about my orders" — add
> `c3-interacting-with-application` to `skill_names`; it grants the discover-and-query
> capability. A hand-written prose skill that only _describes_ the schema and tells
> the agent to "query the data live" does **not** grant that capability — it is
> optional domain context layered on top, never a substitute. Omit the bundled skill
> and the data agent answers from nothing. (§6.1.)
> §6.2a has both patterns. This needs no new authoring surface — it is §6.2 with a
> tool-shaped body.
>
> **Attaching the skill is only half of it — a data agent MUST also connect the app
> via `app_ids`.** Set the create/update `app_ids` to include the app whose data it
> queries: `c3-interacting-with-application` grants the query _capability_, but
> `app_ids` is what _connects_ the agent to that app's data. Attach the skill and
> leave `app_ids: []` (or omit it) and you ship an agent that has the tool but **no
> connected app to point it at** — the empty-connected-apps failure. This is a
> separate list from publishing: the `/publish` call's `appIds` ships the config
> bundle into an app but does **not** populate the definition's `app_ids`, so an
> agent published to an app it isn't connected to still can't read that app's data.

> **`app_ids` is not publishing — the single most common confusion here.** > `app_ids` is a _permission_ list: which apps a session from this agent may
> connect to. **Publishing** (§6.8) writes the agent's config bundle into a
> target app's package store. Setting `app_ids` publishes nothing; publishing
> edits no `app_ids`. A working agent usually needs **both**.

---

## 2. Finding Agentix's `appId`

**Already know it?** If this session resolved it earlier, **reuse it — skip to
§3.** `Microservice.Config` is a cluster-wide (or studio-scoped) record that
doesn't change mid-session; re-querying wastes a call.

**Never guess** — don't assume Agentix shares this app's cluster/env, and never
hand-type a `<cluster>-<env>-nexus` guess.

Run the shipped script against **this** app (not Agentix — you don't know its id
yet, which is the point):

```bash
c3-js-exec <thisAppId> ./scripts/discover_nexus_app.js
```

| `resolved` | Meaning                              | What to do                                                                                         |
| ---------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `appId`    | Real id + live base URL              | Proceed to §3 — the path every recipe wants.                                                       |
| `urlOnly`  | Base URL but no id                   | **Usable.** Pass `baseUrl` as an explicit `rootUrl` (§3); only id-addressed _tooling_ is affected. |
| `none`     | Agentix never registered on this app | **Stop.** Relay the error verbatim — an operator must publish the config.                          |

Config names are **case-sensitive**: `forName("nexus")` ≠ `forName("Nexus")`.

**On `urlOnly`, keep going — just add one key.** Supply `rootUrl` explicitly and
pass the same URL wherever a recipe wants `<nexusAppId>`:

```json
{ "rootUrl": "https://<cluster>/<env>/nexus", "apiBase": "/agent-api/v1", "method": "GET", "path": "/definitions" }
```

Never treat `urlOnly` as a blocker or hunt for the id — it costs you
id-addressed _tooling_, not any REST call.

**Details** — resolution priority, the `serviceAppId` vs `serviceAppUrl`
tradeoff, and the `endpoint()` fallback for older platform builds:
`references/nexus-discovery.md`.

---

## 3. The REST script — `scripts/c3auth_rest_call.js`

**Prerequisite: Agentix's `appId` (§2).** Every call below runs _on Agentix_.

Executes server-side, makes a real HTTP call to Agentix's own door via
`HttpClient`, authed with `Cookie: c3auth=<token>` where the token is
`User.mySessionToken().signedToken` — the same mechanism real C3 server code
uses to call another app's REST surface as the logged-in user.

**Args file** — the raw REST payload goes straight into `body`, no
pre-wrapping:

```json
{
  "apiBase": "/agent-api/v1",
  "method": "POST",
  "path": "/definitions/create",
  "body": { "...": "..." }
}
```

```bash
c3-js-exec <nexusAppId> ./scripts/c3auth_rest_call.js <args-file>
```

**Returns** `{ statusCode: int, body: <json or null> }`. Omit `body` for a
bodyless request. **`rootUrl` auto-derives** from
`App.inst().externalUrl.endpoint(apiBase)` — Agentix finding its _own_ URL while
the script executes on it. Pass an explicit `rootUrl` only to deliberately
target a different app's door.

### The five doors

| `apiBase`                     | Backs                                                                                                                                    | Response envelope                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `/agent-api/v1`               | definitions — `/definitions`, `.../create`, `.../:name/update`, `.../delete/:name`                                                       | bare array (list) or bare object (create/update)     |
| `/agent-skills-api/v1`        | skills — `/skills/create`, `.../:name/update`, `.../list`, `.../get/:name`, `.../delete/:name`                                           | `{rows:[…]}` (list) or bare object                   |
| `/agent-mcp-api/v1`           | MCP connections — `/mcp-connections/list`, `.../create`, `.../:connectionKey/update`, `.../delete/:connectionKey`                        | `{rows:[…]}` (list) or bare object                   |
| `/agent-plugins-api/v1`       | plugins — `/plugins/create`, `.../update/:name`, `.../list`, `.../get/:name`, `.../delete/:name`; 404s `feature_disabled` when gated off | `{rows:[…]}` (list) or bare object                   |
| `/agent-config-bundle-api/v1` | **publish** — `/publish` (§6.8)                                                                                                          | `{ok, results, warnings}` — per-row `status`/`error` |

> **Engine quirks are already fixed inside the script — do not rediscover
> them** (numbered comments in the source): static-style `mySessionToken`,
> Rhino's array-as-object `json()`, auto-derived `rootUrl`, and the costliest
> one — **a JSON body must go through the 3-argument
> `client.request(method, path, entity)` form**. Never `withBody(jsonString,…)`
> (its first param is typed binary) or `sendSync(bodyObject)` (that param is
> retry options). No base64, no manual `Content-Type`. The four helper scripts
> reuse these same fixes.

**No `c3-js-exec`?** See the Scripts callout above — every recipe runs unchanged
over raw `POST /api/8/Js/exec` (`references/no-js-exec-fallback.md`).

---

## 4. Recon — read the live spec first

**Open every authoring task with recon**, but scope it. The spec is the
**canonical wire contract** — read it rather than trusting this document's field
lists, since your deployment may be a different Agentix version.

**Use `openapi_slice.js` — it returns only the node you ask for**, so you never
pull the whole document (~60 paths, ~75 schemas, tens of thousands of tokens)
into context:

```bash
c3-js-exec <nexusAppId> ./scripts/openapi_slice.js '{"apiBase":"/agent-mcp-api/v1","want":"schema","name":"McpConnectionWrite"}'
```

| `want`      | Returns                                                     |
| ----------- | ----------------------------------------------------------- |
| `paths`     | the door's path keys (names only)                           |
| `schema`    | one `components.schemas.<name>` (a create/update body)      |
| `required`  | that schema's `required` list                               |
| `operation` | `paths[<path>]` — incl. the `requestBody` schema for a call |

If you must read the spec by hand instead, pull only `components.schemas.<Name>Write`
for a body shape, `paths` keys for door existence, or a single property for an
enum — never inhale the whole document.

**Run recon in parallel.** The spec read and the list calls (§6.9) are
independent — issue them together.

**What the spec settles that you must not guess:**

| Question                    | Where in the spec      | Why it matters                                                                                                                                |
| --------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Which doors exist at all    | `paths` + `tags`       | A missing `/publish` or `/plugins` path means that feature isn't in this build — report it, don't retry.                                      |
| Exact enum values           | `components.schemas.*` | e.g. `McpConnectionWrite.transport` is `["http","sse"]`, `scope` is `["global","user"]`.                                                      |
| Enums that **aren't** enums | property `description` | `PluginWrite.harness` has **no** `enum` — the valid value lives in its description (v1: `opencode`). Read the description, not just the enum. |
| Which fields are required   | `schema.required`      | Sparser than you'd expect: `PluginWrite` requires only `files`.                                                                               |
| Exact body field names      | `requestBody` schema   | Catches the `/publish` camelCase exception (§5) before it 400s.                                                                               |

**Then check current state**, so you don't collide with an existing name or
clobber an attachment: the list calls in recipes §6.9. An unresolved `skill_names` /
`mcp_connection_keys` / `plugin_names` / `custom_tool_names` entry **400s** at
create/update, so author the capability body first. (Custom tools are bundled
in-repo, never authored over REST.)

**Two things the spec can't tell you** — both need a live call:

- **Definition `id`s** — deliberately absent from the REST view; both publishing
  (§6.8) and the embed-agentix-chat `agentDefId` need them. Read them from the
  `Nexus.Agent.DefinitionApi.list` facade (the raw `Definition` entity is
  ACL-blocked even for an AgentAdmin); `publish_agent.js` resolves them for you.
- **Whether a gated feature is switched on** — the `/plugins` paths are
  documented even when `nexus-plugins` is off; only calling `/plugins/list`
  reveals a `feature_disabled` 404 (§6.4).

**Reporting an agent's capabilities** ("what can this agent have attached") is
its own recipe — gather the data with `capability_report.js`; the answer shape
lives in `references/recipes.md` → Reporting.

---

## 5. Wire rules

- **Snake_case on the wire** — `skill_names`, `mcp_connection_keys`,
  `plugin_names`, `custom_tool_names`, `app_ids`,
  `write_action_allowlist`/`denylist`.
- **One camelCase exception: `/publish`** takes `defs` and `appIds` (§6.8).
  Sending `app_ids` there 400s.
- **PATCH-merge on update — definitions only.** Omitting a definition array
  leaves it unchanged, `[]` clears it; hence read → merge → send (§6.5,
  `attach_capability.js`). A capability's `files` map is the opposite: a **full
  replace** (§6.7). Same call shape, different contract.
- **Delete uses a unique path, not a bare verb** — `DELETE` +
  `/definitions/delete/<name>`, no body. The facade router does not dispatch on
  HTTP verb.
- **Secrets are write-only** — an MCP connection's `static_token` (and OAuth
  secrets) is accepted on write, never echoed back on read.
- **Publish is per-(agent, app) and non-atomic** — one row per pair; one
  target's failure never blocks the others. Read each row's `status`, not just
  the top-level `ok`.
- **Publishing requires a DEV-mode target** — `not_dev_mode` / `invalid` /
  `unreachable` are environment facts to report, not errors to retry.
- **Error envelope** — `403` not admin, `400` bad input or unknown name, `404`
  unknown row or disabled feature, `409` conflict or name taken.

---

## 6. Recipes

The full recipe set — copy-paste args files for `c3auth_rest_call.js` (§3), each
ending in a publish offer where it mutates — lives in **`references/recipes.md`**.
Read it for the exact call; the index below says which section to open, and
which helper script automates it.

| #    | Recipe                                                                                         | Mutates?             | Script                 |
| ---- | ---------------------------------------------------------------------------------------------- | -------------------- | ---------------------- |
| 6.1  | Create an agent                                                                                | yes → publish        | `c3auth_rest_call.js`  |
| 6.2  | Create + attach a skill                                                                        | yes → publish        | `c3auth_rest_call.js`  |
| 6.2a | Give the agent a tool (skill that calls an app API or runs a script)                           | yes → publish        | `c3auth_rest_call.js`  |
| 6.3  | Create + attach an MCP connection                                                              | yes → publish        | `c3auth_rest_call.js`  |
| 6.4  | Create + attach a plugin (gated on `nexus-plugins`)                                            | yes → publish        | `c3auth_rest_call.js`  |
| 6.5  | Attach a capability to an existing agent (read → merge → send)                                 | yes → publish        | `attach_capability.js` |
| 6.6  | Modify an existing agent                                                                       | yes → publish        | `c3auth_rest_call.js`  |
| 6.7  | Update a capability body (skill / MCP / plugin) — stales published bundles                     | yes → re-publish all | `c3auth_rest_call.js`  |
| 6.8  | Publish an agent to the app being developed (id + `checkTargetApp` preflight + per-row status) | —                    | `publish_agent.js`     |
| 6.9  | Discover / list (read-only, no admin role)                                                     | no                   | `c3auth_rest_call.js`  |
| 6.10 | Delete (irreversible; not an unpublish)                                                        | no publish           | `c3auth_rest_call.js`  |

The **Reporting** recipe (capability report for "what can this agent have") is in
the same file, gathered by `capability_report.js`.

---

## 7. Auth

Writes are **admin-gated** (`Agentix.AgentAdmin`, held **on Agentix itself** — a
role on the consuming app grants nothing); reads are open to any authenticated
user. Confirm the caller holds the admin role before a write rather than
retrying on `403`. The full role table, how `c3auth` is obtained
(`User.mySessionToken().signedToken`), and the cross-cluster token mechanism are
in **`references/auth.md`**.

---

## 8. Files and related skills

| Path                                | What it is                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `scripts/discover_nexus_app.js`     | Resolves Agentix's `appId` + base URL from the consumer app's `Microservice.Config` (§2). Read-only. |
| `scripts/openapi_slice.js`          | Returns one node of a door's OpenAPI spec (§4). Read-only.                                           |
| `scripts/capability_report.js`      | Gathers a full capability report in one call (Reporting). Read-only.                                 |
| `scripts/c3auth_rest_call.js`       | Generic REST client for all five doors, authed as the calling user (§3).                             |
| `scripts/attach_capability.js`      | Safe read → merge → send attach; dry-run by default (§6.5).                                          |
| `scripts/publish_agent.js`          | Resolve id → preflight → publish → per-row status; dry-run by default (§6.8).                        |
| `scripts/resolve_studio_id.js`      | Operator helper for the studio-scoped config publish command (discovery ref).                        |
| `references/recipes.md`             | The recipes (§6.1–§6.10) + the capability-report recipe — copy-paste args files.                     |
| `references/auth.md`                | Full auth detail — role table, `c3auth` token, cross-cluster mechanism (§7).                         |
| `references/self-review.md`         | The mandatory pre-present self-review checklist (§9).                                                |
| `references/nexus-discovery.md`     | Full discovery detail — resolution priority, `urlOnly`, `endpoint()` fallback.                       |
| `references/no-js-exec-fallback.md` | Running every recipe through raw `POST /api/8/Js/exec`.                                              |

- **`agentix-skill-creator`** — the craft of _writing_ a skill body (user-scope
  by default). Use it to compose the `SKILL.md`; use **this** skill to publish
  that skill globally over REST and attach it.
- **`mcp-apps`** — builds MCP **Apps** (interactive UIs). Distinct from an MCP
  **connection**, which is an external MCP server registered and attached here
  by `connection_key`.

---

## 9. Mandatory self-review

Before presenting, run the self-review checklist in
**`references/self-review.md`** (recon/setup, authoring correctness, publishing,
reporting) and fix what fails. The publish step — offering to publish after
every create/attach/modify, and re-publishing every affected agent after a
capability-body edit — is the one most often skipped.
