/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

export type FeedbackRating = 'up' | 'down';

export interface FeedbackState {
  rating: FeedbackRating;
  categories: string[];
  comment: string;
  submitted: boolean;
}

export type MessageKind =
  | 'TEXT'
  | 'TOOL_CALL'
  | 'REASONING'
  | 'STEP_START'
  | 'STEP_FINISH'
  | 'ERROR'
  | 'QUESTION'
  | 'PERMISSION'
  | 'COMPACTION'
  | 'RETRY'
  /** A mid-session external-MCP OAuth credential expired (proxy hit a reauth-required 401 and
   *  re-mint failed). Carries `connectionKey`, not a transcript-worthy message — the stream
   *  consumer intercepts this kind and routes it to the reconnect banner instead of appending
   *  it to the message list. */
  | 'mcp-auth-expired'
  /** A cross-cluster target app needs the caller's per-user OAuth and the in-pod agent can't start
   *  the browser redirect (an explicit c3-connect that resolved needs-remote-auth, or a mid-task
   *  cross-cluster call whose per-user token expired). Carries `appId`, not a transcript-worthy
   *  message — the stream consumer intercepts this kind and routes it to the Connect banner. */
  | 'cross-cluster-auth';
/** 'PARENT_AGENT' relabels a subagent transcript's USER-role turns (the parent's dispatched
 *  instructions) so the read-only subagent view doesn't render them as if a human typed them. */
export type MessageRole = 'USER' | 'ASSISTANT' | 'PARENT_AGENT';

/** One row of {@link listSubagentsForSession} — a live subagent spawned from the current chat,
 *  for the sidebar's nested subagent rows. */
export interface SubagentSummary {
  subagentServiceId: string;
  subagentSessionId: string | null;
  status: string;
  title?: string | null;
  /** Name of the Nexus.Agent.Definition the subagent's session is bound to, if any — lets
   *  concurrently-running subagents be told apart by which agent they are, not only by title. */
  agentName?: string | null;
  createdAt?: string;
}

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionItem {
  question: string;
  header?: string;
  options: QuestionOption[];
  /** When true, the user may select more than one option (OpenCode's `multiple` flag).
   *  Absent/false ⇒ single choice. Multi-select answers are joined into one comma line. */
  multiple?: boolean;
  /**
   * When false, hide the inline free-text field (closed choice). Absent/true ⇒ show
   * "Type your own answer" (OpenCode's `custom` default). Non-empty free-text wins over
   * option selections for that question on submit.
   */
  custom?: boolean;
}

/** opencode permission reply: approve once, approve and remember, or decline. */
export type PermissionResponse = 'once' | 'always' | 'reject';

export interface ChatMessage {
  id: string;
  kind: MessageKind;
  role?: MessageRole;
  text?: string;
  /** Filenames shown on this user bubble (also uploaded when sending with attachments). */
  attachments?: string[];
  /** True when this user message was composed with the rich-text editor — its `text` is intentional
   *  markdown and the bubble renders it as such. Absent/false → the text is plain and renders
   *  verbatim (no markdown parsing), so plain dev content isn't mangled. Client-side only: the wire
   *  format is plain markdown text with no field to persist intent, so a message reloaded from the
   *  server (or reconciled from its persisted twin) renders plain — see hydrationReconcile. */
  composedRich?: boolean;
  turnId?: string;
  seqNum?: number;
  timestamp?: string;
  /** "provider/model" that produced this assistant turn — drives the auto-mode model badge. */
  modelId?: string;
  /** True when auto mode picked this turn's model (vs a user-pinned selection) — the badge
   *  then reads "Auto · <model>" so tier changes (escalation/downshift) are visible per turn. */
  autoRouted?: boolean;
  /** Reasoning-effort variant this turn ran at ('low'/'medium'/'high'); the badge appends
   *  it as "<model> · <effort>". Resolved per turn by the agent from the request + pod default. */
  effort?: string;
  /** True when auto mode chose this turn's effort (vs a user-pinned level) — the badge marks
   *  the effort auto-selected, parallel to autoRouted for the model. */
  autoEffort?: boolean;
  /** Provider-reported output-token count for this turn; the badge shows it as "· <N>K".
   *  Stamped on the turn's last text bubble at completion (only final then). Live turns only —
   *  not recoverable on history reload (same as effort). */
  outTok?: number;
  /** Turn wall-clock duration in ms; the badge shows it as "· 12s". Stamped with outTok. */
  elapsedMs?: number;
  /** Context occupancy after this turn (total tokens incl. cache) and the model's
   *  auto-compaction ceiling — the composer gauge renders ctxTok/ctxMax fill. Stamped with
   *  outTok; live turns only (same reload caveat). */
  ctxTok?: number;
  ctxMax?: number;
  toolName?: string;
  toolState?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'ERROR' | 'CANCELLED';
  /** Populated when kind === 'mcp-auth-expired' — the connection whose auth needs a reconnect. */
  connectionKey?: string;
  /** Populated when kind === 'cross-cluster-auth' — the `<cluster>-<env>-<app>` id whose per-user
   *  OAuth the Connect banner should run (via the existing connectRemoteApp dual-mode flow). */
  appId?: string;
  /** When set, the assistant TEXT that sourced this label is suppressed from the chat list. */
  description?: string;
  data?: {
    name?: string;
    input?: unknown;
    output?: string;
    state?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'ERROR' | 'RESOLVED' | 'CANCELLED';
    step?: string;
    reason?: string;
    /** Live-only STEP_FINISH hint: the pod admitted this turn for asynchronous skill review. */
    learningReviewQueued?: boolean;
    text?: string;
    detail?: string;
    questions?: QuestionItem[];
    // Populated when kind === 'PERMISSION'.
    permissionId?: string;
    permissionType?: string;
    pattern?: string | string[] | null;
    response?: PermissionResponse | null;
    // Populated when kind === 'RETRY' (LLM provider throttle backoff).
    attempt?: number;
    message?: string | null;
    nextMs?: number | null;
  };
}

/** Pod (Nexus.Agent.Service): the lifecycle unit. Stop/resume/terminate happen here. */
export interface Pod {
  /** Advisory live pool readiness; does not change the pod's durable lifecycle status. */
  routingPhase?: string;
  id: string;
  userId?: string;
  cloudServiceId?: string;
  status: string;
  createdAt?: string;
  reservedAt?: string;
  stoppedAt?: string;
  /** When the current resume() attempt began. While set within a short window on a STOPPED row,
   *  the pod is actively resuming (the dashboard derives a "Resuming" state from it). */
  resumeStartedAt?: string;
  terminatedAt?: string;
  lifecycleLog?: string;
  failureReason?: string;
  /** True for an async/scheduled job run rather than an interactive session. */
  isJobRun?: boolean;
  /** Set when this row is a subagent spawned by another service; unset for interactive/job rows. */
  parentServiceId?: string;
}

export interface TargetAppInfo {
  appId: string;
  appUrl: string;
  internalUrl: string;
  pkg: string;
  pkgVersion: string;
  /** Single-node environment */
  isSne: boolean;
  mode: string;
  serverVersion: string;
  /**
   * Which identity reached a cross-cluster target: `service` (admin shared token), `user` (the
   * caller's own per-user OAuth token), `same-cluster` (local cookie), or `needs-remote-auth` (a
   * known remote with no usable token — NOT bound). Absent on legacy/same-cluster responses that
   * predate the field. The picker keys its "connected as you" / "connected by admin" hint on
   * `service` vs `user`, and offers connect / ask-admin on `needs-remote-auth`.
   */
  via?: 'service' | 'user' | 'same-cluster' | 'needs-remote-auth';
  /**
   * Meaningful only when `via` is `needs-remote-auth`: true when the caller cannot self-serve the
   * connection (an automation run, or no Nexus OAuth client registered for the remote) — show
   * "ask an administrator" instead of a connect button.
   */
  needsAdmin?: boolean;
}

/** Chat session inside an agent service (Nexus.Agent.Session). Inherits lifecycle and
 *  ownership from its parent service. Per-session recency for sidebar ordering lives in the
 *  browser's localStorage, not on this row. */
export interface Session {
  id: string;
  /** FK to Nexus.Agent.Service.id. Named to match the c3typ field. */
  serviceId: string;
  title?: string;
  createdAt?: string;
  removedAt?: string;
  /** This one chat is excluded from skill-improvement mining. The narrowest of the settings
   *  tiers: it overrides nothing else and nothing else overrides it. */
  skillImprovementOptOut?: boolean;
  /** Frozen per-agent participation for this chat (from the agent definition at creation). When
   *  not true the chat is never mined regardless of the user/admin modes, so the sidebar hides the
   *  per-chat learning affordance entirely — the agent tier of the global→agent→user cascade. */
  skillImprovementAgentEnabled?: boolean;
  /** True while the chat is blocked awaiting the user's input (an unanswered QUESTION or a
   *  pending PERMISSION). Written server-authoritatively by the pod; surfaced by listSessions
   *  to drive the sidebar "awaiting input" indicator. */
  awaitingInput?: boolean;
  /** True while at least one live subagent has been dispatched from this chat. Written
   *  server-authoritatively at subagent start/terminate; surfaced by listSessions to drive the
   *  sidebar's "has subagents" row callout with no separate per-page fetch. */
  hasSubagents?: boolean;
  /** How this chat was opened, for admin attribution: `direct` (a Nexus UI) or `embedded` (a
   *  connected app that embeds the Nexus chat). Frozen at creation; unset on pre-existing rows
   *  (read as `direct` by the admin table). Paired with {@link originAppId}. */
  originKind?: string;
  /** Canonical `<cluster>-<env>-<app>` the chat's origin resolves to — the hosting Nexus's own id
   *  for `direct`, the embedding app's id for `embedded`. Frozen at creation. */
  originAppId?: string;
}

/** A message the user composed mid-stream and queued for auto-fire when the active
 *  stream completes. V1 holds at most one slot per session (see PLAT-148695). */
export interface QueuedMessage {
  text: string;
  files?: File[];
}

/** Custom skill row returned by Nexus.Agent.Skill.Manager.listSkills (user + global).
 *  AUTHOR column is rendered from `meta.createdBy`. APP / AGENTS columns are intentionally
 *  not part of this v1 (see SkillsPage.tsx). */
export interface SkillRow {
  id: string;
  /** 'user' | 'global'. Stored as a string enum on the entity. */
  scope: string;
  /** For scope='user' this is User.id; empty for scope='global'. */
  scopeId?: string;
  name: string;
  /** Short summary from the skill's SKILL.md frontmatter; shown under the name in the list. */
  description?: string;
  meta?: {
    createdBy?: string;
    created?: string;
    updated?: string;
    updatedBy?: string;
  };
  /** 'auto' marks a skill the improvement loop generated; absent on anything a person wrote. */
  category?: SkillCategory;
  /** Name of the base skill this one overlays in the owner's sessions; absent on a net-new skill. */
  supersedes?: string;
  /** Review lifecycle; only ever set on a `category==='auto'` skill. */
  approvalState?: SkillApprovalState;
  /** Whether the skill loads into the next session. Undefined from older rows means enabled. */
  enabled?: boolean;
  /** Populated by `listMyAutoSkills` only. The paginated `listSkills` deliberately omits it —
   *  rationale text and trace-id lists would multiply a 1000-row page for data read one skill at
   *  a time — so treat it as absent on any row that came from the grid. */
  provenance?: SkillProvenance;
}

/** Skills the loop generated carry `'auto'`; everything a person wrote has no category. */
export type SkillCategory = 'auto';

/** Where a generated skill sits in the approval flow. See Nexus.Agent.Skill#approvalState. */
export type SkillApprovalState = 'pending' | 'approved' | 'rejected';

/** The audit record behind a generated skill — Nexus.Agent.SkillProvenance. */
export interface SkillProvenance {
  origin?: string;
  generatedAtMs?: number;
  model?: string;
  effort?: string;
  sourceSessionIds?: string[];
  /** Turn ids inside the complete, server-accepted evidence snapshot for a realtime proposal. */
  sourceTurnIds?: string[];
  sourceTraceIds?: string[];
  /** Scheduled proposals come from Laminar; realtime proposals come from the in-pod callback. */
  captureLane?: 'scheduled' | 'realtime' | 'explicit';
  /** Server-computed hash of the target that must still match when the owner approves. */
  targetContentHash?: string;
  /** Source-grounded behavior the candidate is intended to improve. */
  acceptanceCriterion?: string;
  /** Distinct sessions the gap recurred across — the evidence that cleared min-support. */
  supportCount?: number;
  failureClasses?: string[];
  rationale?: string;
  smoke?: {
    passed?: boolean;
    failedTier?: string;
    detail?: string;
    tiers?: string[];
    scriptExecuted?: boolean;
    baseContractOk?: boolean;
  };
  version?: number;
}

/** True when the row is a generated skill still waiting on its owner's decision. */
export function isPendingAutoSkill(s: Pick<SkillRow, 'category' | 'approvalState'>): boolean {
  return s.category === 'auto' && s.approvalState === 'pending';
}

/** True when the row is a generated skill that is live in the owner's next session.
 *
 *  Both halves are load-bearing and mirror the server-side resolver: an overlay needs `enabled`
 *  AND `'approved'` to displace its base, so a flag flipped out of band on an unapproved draft
 *  must not read as active here either. */
export function isActiveAutoSkill(s: Pick<SkillRow, 'category' | 'approvalState' | 'enabled'>): boolean {
  return s.category === 'auto' && s.approvalState === 'approved' && s.enabled !== false;
}

/** Plugin row returned by Nexus.Agent.Plugin.Manager.listPlugins (user + global + bundled).
 *  Mirrors SkillRow plus the plugin-specific metadata supplied at upload: the target
 *  harness and the free-form version string. AUTHOR renders from
 *  `meta.createdBy`; `referenceFiles` lets the UI show the file set without a blob read. */
export interface PluginRow {
  id: string;
  /** Ownership/mutability scope stored as a string enum on the entity. */
  scope: 'user' | 'global' | 'bundled';
  /** For scope='user' this is User.id; empty for global/bundled. */
  scopeId?: string;
  name: string;
  /** Short summary supplied at upload; shown under the name in the list. */
  description?: string;
  /** Version string supplied at upload (e.g. "1.0.0"). Named to match the entity field
   *  (the platform `Named` mixin reserves `version`). */
  pluginVersion: string;
  /** Target agent harness this plugin is built for (e.g. "opencode"). */
  harness: string;
  /** Relative paths of the bundle's files (persisted on the row). */
  referenceFiles?: string[];
  /** Stable lineage on a global plugin promoted from a bundled source. */
  bundledSourceName?: string;
  meta?: {
    createdBy?: string;
    created?: string;
    updated?: string;
    updatedBy?: string;
  };
}
