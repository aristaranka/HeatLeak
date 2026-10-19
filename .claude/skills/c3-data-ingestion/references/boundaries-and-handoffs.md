# Boundaries and Handoffs

Single owner for: what C3 DI does not guarantee, mutation safety, adjacent owners, and lifecycle requests that are planning/analysis rather than executable procedures. Other files link here rather than repeating this.

## <a id="guarantees-c3-di-does-not-provide"></a>Guarantees C3 DI does NOT provide

Do not infer any of these from nearby fields, status objects, config flags, or APIs. When a request depends on one, say what the platform *does* establish, what evidence/contract is missing, and what a safe design would require — **never invent a runbook**.

- **Exactly-once effects** — a file arriving affects the target exactly once.
- **Duplicate-safe / idempotent retry** — reprocessing won't double-write. (`DbTargetCollection.Config` does expose an `idempotent` boolean via its `UpsertSpec` mixin, but do not treat setting it as a guarantee of exactly-once/dedup effects across a reprocess — verify its behavior for the concrete write path rather than assuming.)
- **Selective replay** — replay just missing records/pages.
- **Generic rollback** — undo a completed run; status/provenance fields do not create one.
- **Safe cancellation** with bounded partial writes.
- **Checkpoint reconstruction** after corruption.
- **Deletion propagation** — SQL CDC is an insert/update watermark; deletes are invisible.
- **Atomic publication** — consumers never see a partial load.
- **Record quarantine/replay** — isolate bad records while valid ones proceed.
- **No-gap / no-duplicate source cutover** — switching sources without loss or overlap.

These correspond to many "lifecycle" asks below: treat them as design/analysis, not execution.

## Lifecycle & evolution requests (analysis, not runbooks)

Backfill-while-live, history→incremental cutover, source replacement, bad-data correction/rollback, productionization/release-readiness, retirement/disaster-recovery, multi-source identity/authority reconciliation. For each: recognize the goal, assemble a decision packet (current vs desired authoritative source; identity semantics; checkpoint/watermark compatibility; history boundaries; active/overlapping work; persistence mode & conflict precedence; consumer/owner inventory; rollback/containment plan; expected gap/duplicate/loss/downtime bounds; verification & approval owners), then deliver an evidence-based plan citing which component steps ([execute-and-schedule](execute-and-schedule.md), [diagnose-and-recover](diagnose-and-recover.md)) are individually supported. Do not present a generic mutation recipe, and stop at any step that needs an [unsupported guarantee](#guarantees-c3-di-does-not-provide).

## Mutation safety

Before any planned mutation verify: authorization; environment/app; source, target, and run identities; bounded scope; persistence & identity semantics; overlapping work; stop conditions; and observable terminal verification. For recovery, diagnose first ([diagnose-and-recover](diagnose-and-recover.md)). If a workflow is only partially supported, don't allow its aggregate mutation — you may run a separately supported component only when its scope and verification stay independent. Never perform a destructive reset merely to make statuses or queues look healthy.

## Credentials

Users enter secrets in Studio → Data Fusion (the primary path, and the only one that needs no console) or, where they have a way to run C3 code themselves (Static Console, Jupyter, or server-side code), run a credential snippet themselves; never request, print, or execute credentials in chat, code, package files, logs, or agent-run calls. In an environment with no console (e.g. c3 code / Genesis), use the Studio path — do not fall back to a "run this in your console" snippet that the user cannot run. Separate credential governance from connection verification. A successful ping proves reachability only — not schema, data permissions, or future validity. See [connect-and-configure](connect-and-configure.md#credentials).

## <a id="handoffs"></a>Handoffs

Every handoff names: (1) the owning skill/role, (2) the input DI supplies, (3) the expected returned artifact/state, and (4) where DI work resumes. Be actionable — not "ask another team."

| Outcome | Owner |
| --- | --- |
| Fetching/rendering an ingested or external type in app/UI code (`c3Action`, React, FetchSpec) | `c3-frontend` |
| Domain/entity model & semantics | backend / type owner |
| Deleting/correcting already-loaded target rows (target-entity CRUD, e.g. `removeBatch`) | backend / type owner |
| Credential acquisition/rotation/revocation | security / administrator |
| Environment promotion, platform upgrade, disaster recovery | app/platform lifecycle |
| Privacy, retention, erasure, access audit | privacy/security owner |
| Capacity / infrastructure changes | platform administration |
| Outbound synchronization | outbound integration owner |
| Unstructured document parsing/indexing/search | `c3-unstructured-data-integration` |
| Entity file association | `c3-filesystem` / access-control |

**Common follow-on:** after connecting an external source (Snowflake, Jira, HubSpot, …), "now show it in the app" is frontend work — this skill discovers the collection and its real field names ([inspect-and-transform](inspect-and-transform.md#preview-source-data)), then hands the paginated `c3Action` fetch + field mapping to `c3-frontend`. Do not guess the generated/external type's field names; read them from live data first.
