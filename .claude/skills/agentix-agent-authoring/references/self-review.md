# Mandatory self-review — agentix-agent-authoring

Run through this before presenting, and fix what fails.

**Recon and setup**

1. Did I reuse Agentix's `appId` if this session already had it, and otherwise
   resolve it via `Microservice.Config` (SKILL.md §2) rather than guessing —
   stopping cleanly on `none`?
2. **Did I read the live OpenAPI spec before authoring** (SKILL.md §4) — taking
   doors, enums, and required fields from it rather than from this document or
   from memory? Did I check property **descriptions** for values that aren't
   declared as enums (e.g. `harness`)?
3. Did I check current rows (recipes §6.9) so I didn't collide with an existing
   name or clobber an attachment?
4. Did I confirm `Agentix.AgentAdmin` **on Agentix** before any write?

**Authoring correctness** 5. **Did I read the definition `id` from `Nexus.Agent.DefinitionApi.list`** (recipes §6.1 / §6.8)
— not the create response (it omits `id`), and not the ACL-blocked raw `Nexus.Agent.Definition` entity? The `id` is what `/publish` and the embed skill need. 6. **Did I target the Agentix appId for typed reads** (`Nexus.Agent.DefinitionApi`,
`Nexus.Agent.ConfigBundleApi`, etc.) — never the consumer app? These types
only exist in the `nexus` package; running them elsewhere returns `Unknown type`. 7. Did I author each capability body first, then attach it by name? 8. On attach/modify, did I read → merge → send the **full** array — never just
the new name (recipes §6.5)? 9. Snake_case bodies everywhere except `/publish`'s `defs`/`appIds`, and correct
`apiBase` per capability? 10. Is the agent `name` slug-safe (`^[\w.-]+$`), with human-friendly naming in
`description`? 11. For plugins, did I check the `nexus-plugins` gate first and stop cleanly on
`feature_disabled`? 12. Did I let `rootUrl` auto-derive (SKILL.md §3) instead of hardcoding a
domain?

**Publishing** — the step most often skipped 13. Did I **offer to publish after every create / attach / modify**
(recipes §6.1–§6.6), naming the app the user is developing, rather than
leaving the change live in Agentix but absent from their app? (Delete is
exempt.) 14. After editing a capability **body** (recipes §6.7), did I offer to
re-publish **every** agent carrying it, to **every** app it had shipped to —
remembering that the definition looks unchanged while the target app runs
the old body? 15. Did I resolve the definition **`id`** (not name) and **preflight** with
`checkTargetApp`, reporting `not_dev_mode` / `invalid` / `unreachable`
plainly instead of retrying? 16. After publishing, did I check **every row's `status`/`error`** — not just
the top-level `ok` — and report partial failures explicitly? 17. Did I keep `app_ids` (permission) and publishing (shipping the bundle)
distinct, never presenting one as doing the other's job?

**Reporting** 18. On a capability report (recipes → Reporting), did I cover skills, MCP,
plugins, settings, **publish status**, and a recommendation? 19. **Did I include the UI footer** (rule 3), and get the ordering right — a
pending publish offer **last**, bolded, naming agent and app id, with the
footer above it rather than burying the ask? 20. If `c3-js-exec` was unavailable, did I fall back to raw `Js.exec`
(`references/no-js-exec-fallback.md`) rather than declaring the task
impossible?
