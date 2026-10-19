/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Chat surface of the Nexus client: the API functions the chat UI calls (streaming query/respond,
 * session CRUD, messages, permissions, feedback, workspace files, model listing, MCP connect) plus
 * the types they exchange. Built on the shared transport core ({@link ./apiCore}) and the moved
 * pod-fetch / workspace-file helpers, so the package owns its own request path with no reach back
 * into the host tree. The host admin surface keeps its host-only functions in `nexus/react/src/
 * lib/api.ts` and imports any shared chat types from here.
 */

import {
  fetchAgentWithRetry,
  fetchStreamWithWarmupRetry,
  AGENT_SEND_RETRY_STATUSES,
  ServiceDeadError,
} from './agentPodFetch';
import { apiBase, c3call, restCall, sanitizeErrorMessage, unwrapCollection, _parse } from './apiCore';
import { getSourceApp, getEmbedRouteKey, isFilterHistoryByOriginEnabled } from './nexusBase';
import { authFetch, SessionExpiredError } from './sessionExpiry';
import {
  downloadSessionFile,
  downloadSessionZip,
  fetchSessionFilePreview,
  fetchSessionFileView,
  fetchSessionFilesTree,
  fetchSessionPdfObjectUrl,
  moveSessionFile,
  sessionFileDownloadUrl,
  uploadSessionFiles,
  workspaceFilesUserMessage,
  WorkspaceTreeHttpError,
  type UploadedFileRef,
  type MoveWorkspacePathResult,
  type WorkspacePreviewBinary,
  type WorkspacePreviewImage,
  type WorkspacePreviewResponse,
  type WorkspacePreviewText,
  type WorkspaceTreeNode,
  type WorkspaceTreeResponse,
  type WorkspaceTreeScope,
  type WorkspaceViewBinary,
  type WorkspaceViewImage,
  type WorkspaceViewResponse,
  type WorkspaceViewText,
} from './workspaceFilesApi';
import type { SkillRow } from './types';
import type { ChatMessage, FeedbackRating, PermissionResponse, SubagentSummary, TargetAppInfo } from './types';

// Re-export the transport / workspace surface chat consumers import from this module.
export { apiBase, c3call, restCall, sanitizeErrorMessage };
export { ServiceDeadError, WorkspaceTreeHttpError, workspaceFilesUserMessage };
export type {
  UploadedFileRef,
  MoveWorkspacePathResult,
  WorkspacePreviewBinary,
  WorkspacePreviewImage,
  WorkspacePreviewResponse,
  WorkspacePreviewText,
  WorkspaceTreeNode,
  WorkspaceTreeResponse,
  WorkspaceTreeScope,
  WorkspaceViewBinary,
  WorkspaceViewImage,
  WorkspaceViewResponse,
  WorkspaceViewText,
};

export async function appInfo(): Promise<{
  clusterId: string;
  envName: string;
  appName: string;
  userId: string;
  firstName: string;
  isAdmin: boolean;
  isAgentAdmin?: boolean;
  canViewMonitor?: boolean;
  isSne?: boolean;
  agentBackend?: string;
  /** AgentCore `lifecycleConfiguration.idleRuntimeSessionTimeout` (seconds), only meaningful when
   *  agentBackend === 'bedrock-agent'. Used to flag sidebar sessions that have certainly exceeded
   *  the runtime's lifetime (idle timeout == max lifetime today, so this doubles as the absolute cap). */
  bedrockIdleRuntimeSessionTimeoutSeconds?: number;
  hasDocAI?: boolean;
  /** App-wide default reasoning effort for new chats (low/medium/high). The composer
   *  seeds a new chat's effort from this; a preference, clamped per-model at use. */
  defaultLlmEffort?: string;
  /** App-wide default model for new chats ('auto' / 'provider/model' / blank). The composer
   *  seeds a new chat's model from this ahead of the pod concrete default; a raw preference,
   *  degrades via closest-match at seed. */
  defaultLlmModel?: string;
  /** App-wide default LLM judge model (proxy catalog id / blank for built-in). */
  defaultJudgeModel?: string;
  /** The pending scheduled upgrade (or null/absent when none) — the universal pickup channel for the
   *  pre-upgrade banner shown to every user. */
  pendingUpgrade?: PendingUpgrade | null;
}> {
  const raw = await c3call('Nexus.Agent.ServiceApi', 'appInfo');
  return typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);
}

export type ClusterAppOption = { id: string; name: string; env: string };

export async function listEnvApps(): Promise<ClusterAppOption[]> {
  try {
    const raw = await c3call('Nexus.Agent.DefinitionApi', 'listEnvApps');
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? (arr as ClusterAppOption[]) : [];
  } catch (err) {
    // The studio-app list is admin-only server-side (listEnvApps denies non-admins). A regular chat
    // user is not an agent-admin, so their call 403s — that means "not authorized to browse studio
    // apps", NOT a fetch failure. Degrade to an empty list so the picker hides the studio section
    // (they still get the manual connect-by-id input) instead of surfacing an un-retryable
    // "Couldn't load apps" error. Any other error (transient 5xx / network / timeout) still throws,
    // so the error + Retry surface stays meaningful for admins who can retry into a success.
    if ((err as { status?: number } | null)?.status === 403) return [];
    throw err;
  }
}

/** Aggregate service-health for the any-user chat send/provision guards (backend:
 *  `Nexus.Agent.ServiceApi.serviceHealth`, a facade over the admin-owned `Nexus.App.serviceHealth`);
 *  the admin degradation banner uses `deploymentHealth()` below instead. Separate from `appInfo()`
 *  because it runs the proxy/Laminar readiness probes. `modelCount` is the resolved usable-model
 *  count and is tri-state: `> 0` = N usable models; `0` = KNOWN non-functional (no chat turn can
 *  succeed, regardless of what the picker displays) → blocks chat + fires the banner; `-1` = the
 *  backend could not read the count (transient blip) → treated as unknown and fails OPEN, so it
 *  never blocks chat. Every consumer gates on strict `=== 0` so only a definite zero is
 *  load-bearing. */
export type ServiceHealth = {
  llmProxy: { enabled: boolean; ready: boolean };
  laminar: { enabled: boolean; ready: boolean };
  modelCount: number;
};

/** Liveness of the caller's own ACTIVE pod, used on load to decide whether the
 *  provisioning/loading screen is needed. Returns null when no live pod is owned. */
export interface MyServiceInfo {
  serviceId: string;
  status: string;
  /** The service's agentBaseUrl, so a pending-mode chat can attach without a getSessionInfo
   *  round-trip (which keys on a Session id, not a service id). */
  agentBaseUrl?: string;
}

/** Machine-readable startup phase of an agent pod (mirrors NexusBase.CloudService.Status).
 *  `referenceId` is set only on error phases — the UI shows a copy affordance only when present. */
export interface AgentStatus {
  phase: string;
  referenceId: string | null;
  /** True only for a non-recoverable terminal failure — the UI surfaces its error message then. */
  final: boolean;
}

function toAgentStatus(raw: unknown): AgentStatus {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    phase: String(o.phase ?? 'unknown-error'),
    referenceId: o.referenceId ? String(o.referenceId) : null,
    final: o.final === true,
  };
}

/** The caller's own pod status — polled once a provision runs long. `'not-deployed'` when the
 *  caller owns no pod yet (waiting on the warm pool → fall back to {@link poolStatuses}). */
export async function myStatus(): Promise<AgentStatus> {
  return toAgentStatus(await c3call('Nexus.Agent.ServiceApi', 'myStatus'));
}

/** One status per unassigned warm-pool pod, so a resuming user with no pod of their own can watch
 *  the pool provision — one row each. */
export async function poolStatuses(): Promise<AgentStatus[]> {
  const raw = await c3call('Nexus.Agent.ServiceApi', 'poolStatuses');
  return unwrapCollection<unknown>(raw).map(toAgentStatus);
}

/**
 * Register an extra target app on the agent service (`Nexus.Agent.Service` row).
 * `serviceId` must be {@link getSession}'s `serviceId` — not the chat {@link Nexus.Agent.Session} id from {@link reserve}.
 * Same contract as rproxy `POST /c3/connect/:appId`.
 *
 * Routes through Nexus.Agent.ServiceApi so the Nexus.User role (which only
 * grants ServiceApi::*, not the underlying Nexus.Agent.Service) can execute.
 */
export async function configureApp(sessionId: string, appId: string): Promise<TargetAppInfo> {
  // Returns the bound Nexus.TargetAppInfo, incl. the non-secret `via` ('service' | 'user' |
  // 'same-cluster' | 'needs-remote-auth') + `needsAdmin` the cross-cluster connect flow branches on.
  const raw = await c3call('Nexus.Agent.ServiceApi', 'configureApp', { sessionId, appId });
  return _parse<TargetAppInfo>(raw);
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  await c3call('Nexus.Agent.ServiceApi', 'setTitle', { sessionId, title });
}

// Persist the per-chat model choice ('auto', 'provider/model', or '' to clear) and
// reasoning effort ('low'/'medium'/'high', or '' to clear) so they survive reloads —
// notably 'auto', which cannot be re-derived from the last turn's concrete model.
export async function updateSessionModel(
  sessionId: string,
  model: string,
  effort = '',
  selectionIntent: 'inherited' | 'explicit' = 'inherited'
): Promise<void> {
  // Keep the rolling-upgrade fallback from weakening the newer provenance contract if an
  // untyped caller supplies an invalid value at runtime.
  if (selectionIntent !== 'inherited' && selectionIntent !== 'explicit') {
    throw new AgentHttpError(400, `Invalid model selection intent: ${String(selectionIntent)}`);
  }
  try {
    await c3call('Nexus.Agent.ServiceApi', 'setModelWithIntent', { sessionId, model, effort, selectionIntent });
  } catch (error) {
    const status = (error as Error & { status?: number })?.status;
    if (status !== 400 && status !== 404) throw error;
    // Rolling-upgrade compatibility without coupling to platform error prose: a missing action and
    // a rejected request can both be reported as 400/404 across platform versions. Prove the chat
    // still exists through the legacy read action before replaying the write. If that probe fails or
    // the chat is gone, preserve the original error. Transport, auth, and 5xx failures never replay
    // a possibly committed write.
    let existingSession: SessionInfo | null;
    try {
      existingSession = await getSession(sessionId);
    } catch {
      throw error;
    }
    if (!existingSession) throw error;
    await c3call('Nexus.Agent.ServiceApi', 'setModel', { sessionId, model, effort });
  }
}

// Add a new chat session to an existing agent service (the "+ New chat" flow).
// Does NOT spawn a new service — that's reserve()'s job. Returns the new Session.id.
// `agentDefId` is the Definition.id that determines which skills the session carries.
// The caller (ChatPage) always provides this — the AgentPicker propagates the default
// selection on mount so a null/undefined value here indicates a caller bug.
export async function addSession(serviceId: string, agentDefId: string): Promise<string> {
  const args: Record<string, unknown> = { serviceId, agentDefId };
  // Embed only: name this app as the chat's source so the admin table attributes it `embedded`.
  // Host (no configured source app) omits it and the server stamps `direct`. Optional trailing arg —
  // backwards-compatible with a Nexus mount that predates the origin-surfacing change.
  const sourceApp = await getSourceApp();
  if (sourceApp) args.sourceApp = sourceApp;
  // Embed only: the declared endpoint identifier for this chat surface. When paired with sourceApp
  // and a matching admin route, the server binds the route's agent instead of agentDefId (fail-open
  // — no route, no key, or no match keeps agentDefId). See Nexus.Agent.Route#resolve. Optional
  // trailing arg — backwards-compatible with a Nexus mount that predates route resolution.
  const routeKey = getEmbedRouteKey();
  if (routeKey) args.routeKey = routeKey;
  const raw = await c3call('Nexus.Agent.ServiceApi', 'createSession', args);
  if (raw && typeof raw === 'object' && 'id' in (raw as Record<string, unknown>)) {
    return String((raw as { id: unknown }).id);
  }
  return typeof raw === 'string' ? raw : String(raw ?? '');
}

export async function listSessionsForService(
  serviceId?: string,
  opts?: { signal?: AbortSignal; limit?: number; cursor?: string; cursorId?: string }
): Promise<unknown[]> {
  const endpoint = `${apiBase()}/Nexus.Agent.ServiceApi/listSessions`;
  // One page; the sidebar pages through the full set via the composite (createdAt, id)
  // cursor of the oldest row it holds. Omitting cursor fetches the newest page.
  // Omitting serviceId lists the caller's interactive chats across every owned pod so
  // OpenCode and OpenHands conversations coexist in one sidebar.
  const payload: Record<string, unknown> = {};
  if (serviceId) payload.serviceId = serviceId;
  if (opts?.limit != null) payload.limit = opts.limit;
  if (opts?.cursor != null) payload.cursor = opts.cursor;
  if (opts?.cursorId != null) payload.cursorId = opts.cursorId;
  // When the dev-time per-app history filter is enabled, resolve the embedding app's id and
  // restrict the listing to sessions created from this app. Fail closed: if resolution fails
  // (null), return an empty list rather than falling back to unfiltered — never leak cross-app
  // history on a misconfigured embed.
  if (isFilterHistoryByOriginEnabled()) {
    const appId = await getSourceApp();
    if (!appId) return [];
    payload.originAppId = appId;
  }
  const res = await authFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
    signal: opts?.signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ListSessionsHttpError(
      res.status,
      sanitizeErrorMessage((body as { message?: string }).message) || undefined
    );
  }
  const text = await res.text();
  if (!text.trim()) return [];
  const json = JSON.parse(text);
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object' && Object.keys(json).length === 0) return [];
  return Object.values(json);
}

// List the live subagents spawned from a parent chat session, for the sidebar's nested
// subagent rows. Routed through the C3 server (Nexus.Agent.ServiceApi), not the pod directly —
// unlike the parent's own transport, the client never attaches to a subagent's pod.
export async function listSubagentsForSession(parentSessionId: string): Promise<SubagentSummary[]> {
  const raw = await c3call('Nexus.Agent.ServiceApi', 'listSubagentsForSession', { parentSessionId });
  return unwrapCollection(raw) as SubagentSummary[];
}

/** Page of a subagent's chat transcript — same shape {@link fetchSessionMessages} returns for an
 *  ordinary session, since the pod's message-page format is shared. */
export interface SubagentMessagePage {
  messages: ChatMessage[];
  isActive: boolean;
  hasMore: boolean;
}

// Read one page of a subagent's chat transcript for the read-only subagent transcript view.
// Routed through the C3 server (Nexus.Agent.ServiceApi), which proxies to the subagent's own
// pod as the owning user — same reason as listSubagentsForSession above.
export async function fetchSubagentMessages(
  subagentSessionId: string,
  opts?: { limit?: number; beforeTs?: string; beforeId?: string }
): Promise<SubagentMessagePage> {
  const body = (await c3call('Nexus.Agent.ServiceApi', 'readSubagentMessagesForSession', {
    subagentSessionId,
    limit: opts?.limit ?? 0,
    beforeTs: opts?.beforeTs ?? '',
    beforeId: opts?.beforeId ?? '',
  })) as { messages?: ChatMessage[]; isActive?: boolean; hasMore?: boolean } | null;
  const rawMessages: ChatMessage[] = Array.isArray(body?.messages) ? (body.messages as ChatMessage[]) : [];
  const messages = rawMessages.map((m) => {
    if (m.kind !== 'TEXT' || typeof m.text !== 'string') return m;
    return { ...m, text: stripEscalateSentinel(m.text) ?? '' };
  });
  return { messages, isActive: !!body?.isActive, hasMore: !!body?.hasMore };
}

// The caller's OWN chats that live on a non-current pod — read-only, informational only.
// Never restores or merges anything on its own; a returned chat is only reachable by
// calling resumeSession(chatId) below. Mirrors listSessionsForService's REST shape/pagination.
export async function listOtherSessionsForUser(
  excludeServiceId: string,
  opts?: { signal?: AbortSignal; limit?: number; cursor?: string; cursorId?: string }
): Promise<unknown[]> {
  const endpoint = `${apiBase()}/Nexus.Agent.ServiceApi/listOtherSessionsForUser`;
  const payload: Record<string, unknown> = { excludeServiceId };
  if (opts?.limit != null) payload.limit = opts.limit;
  if (opts?.cursor != null) payload.cursor = opts.cursor;
  if (opts?.cursorId != null) payload.cursorId = opts.cursorId;
  const res = await authFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
    signal: opts?.signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ListSessionsHttpError(
      res.status,
      sanitizeErrorMessage((body as { message?: string }).message) || undefined
    );
  }
  const text = await res.text();
  if (!text.trim()) return [];
  const json = JSON.parse(text);
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object' && Object.keys(json).length === 0) return [];
  return Object.values(json);
}

// Reopen a specific chat, transparently to the user: the backend routes warm-pool restore / cold
// remount / a clear "already have an active session" or "can no longer be reopened" error — see
// Nexus.Agent.SessionApi#resumeSession. Used by the "earlier conversations" list above; the returned
// shape mirrors getSession's SessionInfo (serviceId/agentBaseUrl) for navigation.
export async function resumeSession(chatId: string): Promise<SessionInfo | null> {
  const raw = await c3call('Nexus.Agent.SessionApi', 'resumeSession', { sessionId: chatId });
  if (!raw) return null;
  return typeof raw === 'string' ? (JSON.parse(raw) as SessionInfo) : (raw as unknown as SessionInfo);
}

// Spawns a throwaway OpenCode session in the agent service that proposes a 4-6 word title
// based on the seed prompt. Does NOT touch the user's actual chat session — the
// throwaway is deleted immediately after, so nothing leaks into the real session's
// message history or model context.
export async function generateSessionTitle(agentBaseUrl: string, prompt: string): Promise<string> {
  const res = await authFetch(`${agentBaseUrl}/generate-title`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`generate-title failed: HTTP ${res.status}`);
  const body = await res.json();
  return (body?.title || '').toString();
}

export interface SessionInfo {
  sessionId: string;
  /** Parent service id. Matches Session.serviceId on the c3typ. */
  serviceId: string;
  serviceStatus: string;
  cloudServiceId: string;
  title?: string;
  agentBaseUrl: string;
  name?: string;
  /** Definition id this session was bound to at creation; null for legacy sessions. */
  agentRef?: string | null;
  /** Persisted per-chat model choice ('auto' or 'provider/model'); null = pod default. */
  llmModel?: string | null;
  /** Model provenance. Null/absent identifies a session written by an older client. */
  llmModelSelectionIntent?: 'inherited' | 'explicit' | null;
  /** Persisted per-chat reasoning effort ('low'/'medium'/'high'); null = pod default. */
  llmEffort?: string | null;
  /** Denormalized Definition.name at session-creation time; null for legacy sessions. */
  agentName?: string | null;
  /** Frozen read-only verdict for this chat (resolved at creation from the app-wide + per-agent
   *  switches). When true the chat can read connected apps but not modify them. Display-only —
   *  enforcement lives in the token proxy. */
  readOnly?: boolean;
  /** Frozen per-agent participation plus the current chat override. Both must allow learning
   *  before the chat surface polls for a contextual proposal receipt. */
  skillImprovementAgentEnabled?: boolean;
  skillImprovementOptOut?: boolean;
  /** Set when the backend is a remote agent service; full URL to view the conversation directly. */
  remoteConversationUrl?: string;
  failureReason?: string;
}

export async function getSession(sessionId: string): Promise<SessionInfo | null> {
  const raw = await c3call('Nexus.Agent.ServiceApi', 'getSessionInfo', { sessionId });
  if (!raw) return null;
  const base = typeof raw === 'string' ? (JSON.parse(raw) as SessionInfo) : (raw as unknown as SessionInfo);
  return base;
}

// Session-level: removes one chat via the REST surface (`DELETE /sessions/delete/:sessionId`).
// Refused server-side if it would leave the service with zero usable chats — use terminateService
// for that (that refusal comes back as a real error and surfaces). A 410 Gone means the chat is
// already removed, so treat it as an idempotent success. UI helper keeps the friendly "removeChat"
// name (user-facing concept).
export async function removeChat(sessionId: string): Promise<void> {
  await restCall('DELETE', `/sessions/delete/${encodeURIComponent(sessionId)}`, { okStatuses: [410] });
}

/** Exclude (or re-include) one chat from skill-improvement mining. Session-scoped: it never
 *  changes the user's own mode, and no other chat is affected. */
export async function setSessionSkillImprovementOptOut(sessionId: string, optOut: boolean): Promise<boolean> {
  const raw = await c3call('Nexus.Agent.ServiceApi', 'setSessionSkillImprovementOptOut', { sessionId, optOut });
  return typeof raw === 'boolean' ? raw : optOut;
}

/** Bounded generated-skill set for the current user. Shared with the Skills review queue through
 *  the structural `['myAutoSkills']` React Query key, so decisions reconcile both surfaces. */
export async function listMyAutoSkills(): Promise<SkillRow[]> {
  const raw = await c3call('Nexus.Agent.Skill.Manager', 'listMyAutoSkills', {});
  if (!raw) return [];
  const parsed = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
  const row = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  return Array.isArray(row.rows) ? (row.rows as SkillRow[]) : [];
}

export async function resumeService(serviceId: string): Promise<void> {
  await c3call('Nexus.Agent.ServiceApi', 'resumeService', { serviceId });
}

/** Client presence ping — keep the caller's ACTIVE pod out of idle-stop while the chat tab is open
 *  and in use. Cookie-authenticated (rate-limit exempt at the rproxy) and cheap (one row stamp);
 *  the server no-ops on any non-ACTIVE status. Best-effort: a failed ping must never disrupt the
 *  chat, so callers swallow the rejection (the pod is caught reactively by the health handling if
 *  it truly died). */
export async function sendKeepalive(serviceId: string, signal?: AbortSignal): Promise<void> {
  await c3call('Nexus.Agent.ServiceApi', 'ping', { serviceId }, { signal });
}

/** Recover the caller's session back to a healthy ACTIVE pod after a dead-or-restarting pod is hit
 *  (a 502/503/504/network failure on a still-ACTIVE row). Unlike {@link resumeService} — which
 *  no-ops on an ACTIVE row — the server probes the pod and, when it is confirmed unreachable, stops
 *  then resumes it (redeploy + re-seed from the retained PVC); a pod that already came back on its
 *  own is returned as-is. Returns the recovered pod's {@link MyServiceInfo} so the caller reattaches
 *  to the (possibly new) agentBaseUrl. */
export async function recoverService(serviceId: string): Promise<MyServiceInfo> {
  const raw = await c3call('Nexus.Agent.ServiceApi', 'recoverService', { serviceId });
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    serviceId: obj.serviceId ? String(obj.serviceId) : serviceId,
    status: String(obj.status ?? 'ACTIVE'),
    agentBaseUrl: obj.agentBaseUrl ? String(obj.agentBaseUrl) : undefined,
  };
}

/** Per-subsystem readiness of the caller's pod (LLM proxy / observability / model count). Drives the
 *  provisioning gate (a session can't chat until the LLM proxy is ready with usable models). */
export async function serviceHealth(): Promise<ServiceHealth> {
  const raw = await c3call('Nexus.Agent.ServiceApi', 'serviceHealth');
  return typeof raw === 'string' ? JSON.parse(raw) : (raw as ServiceHealth);
}

/** Reserve-only result: the pod's Service id + its deterministic rproxy base URL. No chat is
 *  created — the first chat is created lazily on the user's first message via {@link addSession}. */
export interface ReserveResult {
  serviceId: string;
  agentBaseUrl: string;
}

/** Allocate (or reuse) the caller's pod via the reserve-only control-plane path; the server seeds
 *  credentials. Returns the pod's serviceId + agentBaseUrl directly (no chat row, no getSession
 *  round-trip); the client lands in pending mode and creates the first chat on first message via
 *  {@link addSession}. Target-app binding happens per-chat in {@link addSession}, not here. */
export async function reserve(agentDefId?: string): Promise<ReserveResult> {
  const args = agentDefId ? { agentDefId } : {};
  const raw = (await c3call('Nexus.Agent.ServiceApi', 'reserve', args)) as Partial<ReserveResult>;
  return {
    serviceId: typeof raw?.serviceId === 'string' ? raw.serviceId : String(raw?.serviceId ?? ''),
    agentBaseUrl: typeof raw?.agentBaseUrl === 'string' ? raw.agentBaseUrl : String(raw?.agentBaseUrl ?? ''),
  };
}

/** The caller's current pod ({@link MyServiceInfo}), or null when none is reserved yet. */
export async function myService(agentDefId?: string): Promise<MyServiceInfo | null> {
  const raw = await c3call('Nexus.Agent.ServiceApi', 'myService', agentDefId ? { agentDefId } : {});
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!obj.serviceId) return null;
  return {
    serviceId: String(obj.serviceId),
    status: String(obj.status ?? ''),
    agentBaseUrl: obj.agentBaseUrl ? String(obj.agentBaseUrl) : undefined,
  };
}

export async function revokeApp(sessionId: string, appId: string): Promise<void> {
  await c3call('Nexus.Agent.ServiceApi', 'revokeApp', { sessionId, appId });
}

export async function listConnectedApps(
  agentBaseUrl: string,
  chatSessionId: string
): Promise<Record<string, TargetAppInfo>> {
  // The agent's /apps proxies to rproxy's chat-scoped registry
  // (/internal/session/<sid>/app) so the dropdown matches what the proxy MCP
  // layer enforces for `c3-list-apps` / `c3-run`.
  const query = `?chatSessionId=${encodeURIComponent(chatSessionId)}&_=${Date.now()}`;
  const res = await fetchAgentWithRetry(agentBaseUrl, `/apps${query}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error('[SA] listConnectedApps FAILED', { agentBaseUrl, query, status: res.status, error: body });
    throw new Error(`Failed to fetch connected apps: ${res.status}`);
  }
  const body = await res.json();
  return (body?.apps || {}) as Record<string, TargetAppInfo>;
}

/**
 * Whether a picker option can actually be sent to this pod right now.
 *
 * `available` — the pod declares it; selectable.
 * `pending`   — the registry has it, the pod does not YET, and the pod still owes a catalog
 *               scrape covering it. Expected to resolve on its own; not selectable meanwhile.
 * `unavailable` — the registry has it and the pod has already asked without getting it (or has
 *               stopped asking). Needs an admin, not patience.
 *
 * Absent means `available`: the field is only ever stamped for a model the pod is missing, so
 * every pre-existing consumer and every static-source option keeps its old meaning.
 */
export type ModelAvailability = 'available' | 'pending' | 'unavailable';

/** Why a non-`available` option is not selectable — the i18n key suffix for its explanation. */
export type ModelAvailabilityReason =
  /** pending: a scrape is owed and should pick it up. */
  | 'syncing'
  /** unavailable: the pod's last scrape did not return — it cannot reach the model proxy. */
  | 'proxyUnreachable'
  /** unavailable: refresh is switched off on this pod; its catalog is frozen at boot. */
  | 'frozen'
  /** unavailable: the pod asked and the proxy does not serve this model. */
  | 'notServed'
  /** unavailable: the backend publishes the strict contract but this older pod cannot prove it. */
  | 'podUpgradeRequired'
  /** unavailable: this pod has no confirmed proxy-backed route for Auto. */
  | 'noAutoRoute';

export type ModelInfo = {
  id: string;
  providerID: string;
  modelID: string;
  label: string;
  providerName?: string;
  /** Reasoning-effort variant names this model supports, ordered Faster→Smarter
   *  (e.g. ['low','medium','high','xhigh','max']). From OpenCode's v2 catalog;
   *  absent/empty for non-reasoning models → UI falls back to low/medium/high. */
  variants?: string[];
  /** Set by buildModelOptions for a registry model the pod does not declare; absent = available. */
  availability?: ModelAvailability;
  availabilityReason?: ModelAvailabilityReason;
};

const SERVICE_DEAD_STATUSES = new Set([404, 410]);

/**
 * The pod's own account of how current its declared LiteLLM catalog is. Absent on a pod with no
 * litellm provider (and on any pod predating the field), which reads as "cannot say" — see
 * buildModelOptions, which then offers every registry model as it always did.
 *
 * `lastRefreshAgeMs` is a DURATION measured on the pod's clock, deliberately not an instant: the
 * only comparison it feeds is against the age of the client's registry snapshot, and two ages are
 * comparable across machines where two wall-clock timestamps are not. Null until the pod's first
 * in-process scrape — the boot catalog is materialized by the entrypoint, which this process did
 * not observe. `refreshIntervalMs` is 0 when the refresh is switched off.
 */
export type PodCatalogState = {
  generation: number;
  lastRefreshAgeMs: number | null;
  lastRefreshOk: boolean | null;
  refreshIntervalMs: number;
  /** Additive strict-routing contract. Absent on older/legacy pods. */
  routingContractVersion?: number;
  bootGeneration?: string;
  bootTupleValid?: boolean;
  policyGeneration?: string;
  applyPending?: boolean;
  autoViable?: boolean;
};

export type ModelsResponse = {
  models: ModelInfo[];
  defaultModel: string;
  currentModel: string | null;
  catalog?: PodCatalogState;
  /** True only when this pod can activate strict LiteLLM routing without being recycled.
   *  Absent on older pods; false on standalone backends that cannot perform the cutover. */
  routingActivationSupported?: boolean;
};

/**
 * Lists the agent workspace via REST v1 `files-tree`. Pass `scope: 'workspace'` for full pod workspace.
 */
export async function fetchWorkspaceTree(
  agentBaseUrl: string,
  signal?: AbortSignal,
  sessionId?: string,
  scope?: WorkspaceTreeScope
): Promise<WorkspaceTreeResponse> {
  if (!sessionId?.trim()) throw new WorkspaceTreeHttpError(400);
  return fetchSessionFilesTree(agentBaseUrl, sessionId, {
    scope: scope ?? 'session',
    signal,
  });
}

/** Full file text for viewer (capped on agent — see WORKSPACE_VIEW_MAX_BYTES). */
export async function fetchWorkspaceView(
  agentBaseUrl: string,
  sessionId: string,
  path: string,
  options?: { signal?: AbortSignal }
): Promise<WorkspaceViewResponse> {
  return fetchSessionFileView(agentBaseUrl, sessionId, path, options);
}

/** True when the workspace-relative path basename ends with `.pdf` (case-insensitive). */
export function isWorkspacePdfPath(path: string): boolean {
  const base = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  return /\.pdf$/i.test(base);
}

/** GET URL for full workspace file bytes (PDF embed, download). */
export function workspaceFileUrl(
  agentBaseUrl: string,
  sessionId: string,
  path: string,
  options?: { inline?: boolean }
): string {
  return sessionFileDownloadUrl(agentBaseUrl, sessionId, path, options);
}

export async function fetchWorkspacePdfObjectUrl(
  agentBaseUrl: string,
  sessionId: string,
  path: string,
  options?: { signal?: AbortSignal }
): Promise<string> {
  return fetchSessionPdfObjectUrl(agentBaseUrl, sessionId, path, options);
}

export function workspacePdfEmbedSrc(objectUrl: string): string {
  const params = 'toolbar=0&navpanes=0';
  return objectUrl.includes('#') ? `${objectUrl}&${params}` : `${objectUrl}#${params}`;
}

/** Text preview of a workspace file, truncated by the agent only past its byte cap. */
export async function fetchWorkspacePreview(
  agentBaseUrl: string,
  sessionId: string,
  path: string,
  options?: { signal?: AbortSignal }
): Promise<WorkspacePreviewResponse> {
  return fetchSessionFilePreview(agentBaseUrl, sessionId, path, options);
}

export async function downloadWorkspaceFile(agentBaseUrl: string, sessionId: string, path: string): Promise<void> {
  return downloadSessionFile(agentBaseUrl, sessionId, path);
}

export async function downloadWorkspaceZip(agentBaseUrl: string, sessionId: string): Promise<void> {
  return downloadSessionZip(agentBaseUrl, sessionId);
}

export async function moveWorkspacePath(
  agentBaseUrl: string,
  sessionId: string,
  from: string,
  to: string,
  options?: { overwrite?: boolean; signal?: AbortSignal }
): Promise<MoveWorkspacePathResult> {
  return moveSessionFile(agentBaseUrl, sessionId, from, to, options);
}

export async function listModels(
  agentBaseUrl: string,
  sessionId: string,
  signal?: AbortSignal
): Promise<ModelsResponse> {
  const res = await fetchAgentWithRetry(
    agentBaseUrl,
    `/models?sessionId=${encodeURIComponent(sessionId)}`,
    { method: 'GET' },
    signal
  ).catch((e) => asAgentTransportError(e, 'listModels'));
  if (!res.ok) {
    // 404/410 = session-dead: the provider has been signalled to re-provision (see
    // reportServiceDeadIf) — throw the typed error so call sites skip their own banner.
    if (SERVICE_DEAD_STATUSES.has(res.status)) {
      throw new ServiceDeadError(`listModels failed: HTTP ${res.status}`);
    }
    throw new AgentHttpError(res.status, `listModels failed: HTTP ${res.status}`);
  }
  return (await res.json()) as ModelsResponse;
}

/** Thrown by the bespoke agent-pod request helpers (streaming, models, permission) when the
 *  response is not ok. status 0 = network / transport failure. The chat error bar maps the
 *  status to a friendly message via chatRequestErrorKey. */
export class AgentHttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly serverMessage?: string;

  constructor(status: number, message?: string, code?: string, serverMessage?: string) {
    super(message ?? `agent request failed: ${status}`);
    this.name = 'AgentHttpError';
    this.status = status;
    this.code = code;
    this.serverMessage = serverMessage;
  }
}

// One recognition table for expected routing rejections: error-bar copy and transport logging
// must agree, otherwise ordinary cutover/selection states look like broken streams in diagnostics.
const ROUTING_QUERY_ERROR_KEYS: Record<string, string> = {
  ROUTING_CATALOG_NOT_READY: 'error.routingCatalogNotReady',
  MODEL_ROUTING_UNAVAILABLE: 'error.routingCatalogNotReady',
  SERVICE_DRAINING: 'error.routingCatalogNotReady',
  AUTO_REQUIRES_LITELLM: 'error.routingCatalogNotReady',
  STARTUP_DIRECT_UNAVAILABLE: 'error.routingCatalogNotReady',
  PAUSED_TURN_MODEL_NOT_RECOVERED: 'error.pausedTurnModelNotRecovered',
  MODEL_NOT_DISPATCHABLE: 'error.modelNotDispatchable',
  DIRECT_DISABLED_AFTER_CUTOVER: 'error.modelNotDispatchable',
  AUTO_ROUTING_DISABLED: 'error.autoRoutingDisabled',
};

export function routingQueryErrorKey(err: unknown): string | null {
  return err instanceof AgentHttpError && err.code && Object.hasOwn(ROUTING_QUERY_ERROR_KEYS, err.code)
    ? ROUTING_QUERY_ERROR_KEYS[err.code]
    : null;
}

/** Network/transport failures reject `fetch` with a plain TypeError (e.g. "Failed to fetch") —
 *  never an HTTP status. Wrap them as AgentHttpError(0) so the chat error bar maps them to the
 *  connection-lost message. Rethrow AbortError unchanged so the catches' abort guards still work. */
function asAgentTransportError(e: unknown, label: string): never {
  if ((e as { name?: string } | null)?.name === 'AbortError') throw e;
  // An auth 302→IdP is not a transport blip — let it surface as-is so the reauth prompt (already
  // raised by the latch inside authFetch) is what the chat error bar reflects, not connectionLost.
  if (e instanceof SessionExpiredError) throw e;
  throw new AgentHttpError(0, `${label} failed: network error`);
}

/** Thrown by {@link listSessionsForService} when the HTTP response is not ok. Carries the
 *  status so the sidebar can map it to a friendly, status-aware message. */
export class ListSessionsHttpError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? `listSessions failed: ${status}`);
    this.name = 'ListSessionsHttpError';
    this.status = status;
  }
}

/** Thrown by {@link fetchSessionMessages} when the HTTP response is not ok */
export class SessionMessagesHttpError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? `Failed to load history: ${status}`);
    this.name = 'SessionMessagesHttpError';
    this.status = status;
  }
}

export async function fetchSessionMessages(
  agentBaseUrl: string,
  sessionId: string,
  opts?: { limit?: number; beforeTs?: string; beforeId?: string; signal?: AbortSignal }
): Promise<{ messages: ChatMessage[]; isActive: boolean; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  if (opts?.beforeTs) params.set('beforeTs', opts.beforeTs);
  if (opts?.beforeId) params.set('beforeId', opts.beforeId);
  const qs = params.toString();
  const path = `/session/${encodeURIComponent(sessionId)}/messages${qs ? `?${qs}` : ''}`;
  const res = await fetchAgentWithRetry(agentBaseUrl, path, { method: 'GET' }, opts?.signal);
  if (!res.ok) {
    console.error('[SA] fetchSessionMessages FAILED', { agentBaseUrl, sessionId, status: res.status });
    throw new SessionMessagesHttpError(res.status);
  }
  const body = await res.json();
  const rawMessages: ChatMessage[] = Array.isArray(body?.messages) ? (body.messages as ChatMessage[]) : [];
  // Same strip as mergeFrame — covers the history-hydration path where messages skip mergeFrame.
  const messages = rawMessages.map((m) => {
    return m.kind === 'TEXT' && typeof m.text === 'string' ? { ...m, text: stripEscalateSentinel(m.text) ?? '' } : m;
  });
  return {
    messages,
    isActive: !!body?.isActive,
    hasMore: !!body?.hasMore,
  };
}

// Consume an NDJSON response body (application/x-ndjson). Shared by JSON POST
// and multipart /query. Malformed lines are skipped silently.
async function* ndjsonFromResponse<T>(res: Response, label: string): AsyncGenerator<T> {
  if (!res.ok) {
    let code: string | undefined;
    let serverMessage: string | undefined;
    if (typeof res.json === 'function') {
      try {
        const payload = (await res.json()) as { error?: unknown; message?: unknown };
        if (typeof payload?.error === 'string') code = payload.error;
        if (typeof payload?.message === 'string') serverMessage = payload.message;
      } catch {
        /* a legacy/plain-text error still carries the HTTP status */
      }
    }
    const error = new AgentHttpError(
      res.status,
      `${label} failed: ${res.status}${serverMessage ? `: ${serverMessage}` : ''}`,
      code,
      serverMessage
    );
    if (!routingQueryErrorKey(error)) console.error('[SA] stream FAILED', { label, status: res.status, code });
    throw error;
  }
  if (!res.body) {
    console.error('[SA] stream FAILED', { label, status: res.status });
    throw new AgentHttpError(res.status, `${label} failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let done = false;
  while (!done) {
    const result = await reader.read();
    done = result.done;
    if (done) break;
    buffer += decoder.decode(result.value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        yield JSON.parse(trimmed) as T;
      } catch (_) {
        /* skip malformed line */
      }
    }
  }

  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer.trim()) as T;
    } catch (_) {
      /* skip */
    }
  }
}

// POST JSON + consume an NDJSON stream from the agent. The initial POST goes through
// fetchStreamWithWarmupRetry so a transient gateway 5xx on a live send/reconnect/respond (pod
// rescheduling) is retried BEFORE any frame is read, instead of surfacing to the user — the same
// resilience the pod GET paths already have. Retry is bounded + abort-aware and stops the moment the
// stream body starts; a network error still surfaces via asAgentTransportError.
//
// `retryStatuses` scopes which statuses retry. The non-idempotent send paths (/query, /respond) pass
// AGENT_SEND_RETRY_STATUSES (502/503 only — a retry there provably never reached the pod, so it can't
// double-execute a turn); the idempotent /reconnect resume uses the default full 502/503/504 set.
async function* postNdjsonStream<T>(
  url: string,
  body: unknown,
  label: string,
  signal?: AbortSignal,
  retryStatuses?: ReadonlySet<number>
): AsyncGenerator<T> {
  const res = await fetchStreamWithWarmupRetry(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    },
    signal,
    retryStatuses
  ).catch((e) => asAgentTransportError(e, label));
  yield* ndjsonFromResponse<T>(res, label);
}

// Resume a live turn that's still running server-side. Yields the snapshot
// of every part already emitted plus future frames as they arrive, until
// the turn finishes (server closes the stream). Used by ChatPage after
// history hydration when fetchSessionMessages reports isActive=true.
export function streamReconnect(
  agentBaseUrl: string,
  sessionId: string,
  signal?: AbortSignal
): AsyncGenerator<ChatMessage> {
  return postNdjsonStream<ChatMessage>(`${agentBaseUrl}/reconnect`, { sessionId }, 'streamReconnect', signal);
}

/** Upload-progress snapshot. `total === 0` means indeterminate (browser has no length yet). */
export interface UploadProgress {
  loaded: number;
  total: number;
}

// Start a new turn — submit a prompt and stream the agent's response live.
// With `files`, uploads via REST v1 first (XHR progress), then POST /query JSON
// with `uploadedFiles` refs and streams the NDJSON reply.
export function streamQuery(
  agentBaseUrl: string,
  prompt: string,
  sessionId: string,
  signal?: AbortSignal,
  model?: string,
  files?: File[],
  conversationId?: string,
  effort?: string,
  onUploadProgress?: (p: UploadProgress) => void,
  selectionIntent?: 'inherited' | 'explicit'
): AsyncGenerator<ChatMessage> {
  return (async function* () {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (files?.length) {
      const { uploaded } = await uploadSessionFiles(agentBaseUrl, sessionId, files, {
        signal,
        onUploadProgress,
      });
      const uploadedFiles: UploadedFileRef[] = uploaded.map((entry, i) => ({
        path: entry.path,
        name: entry.name,
        mime: files[i]?.type || undefined,
      }));
      const body: Record<string, unknown> = { prompt, sessionId, uploadedFiles };
      if (model) body.model = model;
      if (timezone) body.timezone = timezone;
      if (conversationId) body.conversationId = conversationId;
      if (effort) body.effort = effort;
      if (selectionIntent) body.selectionIntent = selectionIntent;
      yield* postNdjsonStream<ChatMessage>(
        `${agentBaseUrl}/query`,
        body,
        'streamQuery',
        signal,
        AGENT_SEND_RETRY_STATUSES
      );
      return;
    }
    const body: Record<string, unknown> = { prompt, sessionId };
    if (model) body.model = model;
    if (timezone) body.timezone = timezone;
    if (conversationId) body.conversationId = conversationId;
    if (effort) body.effort = effort;
    if (selectionIntent) body.selectionIntent = selectionIntent;
    yield* postNdjsonStream<ChatMessage>(
      `${agentBaseUrl}/query`,
      body,
      'streamQuery',
      signal,
      AGENT_SEND_RETRY_STATUSES
    );
  })();
}

/** Continue after a QUESTION frame — POST /respond (NDJSON). */
export function streamRespond(
  agentBaseUrl: string,
  answer: string,
  sessionId: string,
  signal?: AbortSignal
): AsyncGenerator<ChatMessage> {
  return postNdjsonStream<ChatMessage>(
    `${agentBaseUrl}/respond`,
    { answer, sessionId },
    'streamRespond',
    signal,
    AGENT_SEND_RETRY_STATUSES
  );
}

/** Approve or deny a pending HITL permission. Idempotent on the agent side. */
export async function respondPermission(
  agentBaseUrl: string,
  sessionId: string,
  permissionId: string,
  response: PermissionResponse
): Promise<void> {
  const res = await authFetch(`${agentBaseUrl}/permissions/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, permissionId, response }),
  }).catch((e) => asAgentTransportError(e, 'respondPermission'));
  if (!res.ok) throw new AgentHttpError(res.status, `respondPermission failed: HTTP ${res.status}`);
}

export async function submitFeedback(
  agentBaseUrl: string,
  sessionId: string,
  turnId: string,
  rating: FeedbackRating,
  categories: string[],
  comment: string
): Promise<void> {
  try {
    await authFetch(`${agentBaseUrl}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, turnId, rating, categories, comment }),
    });
  } catch {
    // noop
  }
}

/** Abort the in-flight agent turn for this session (POST /stop). */
export async function stopQuery(agentBaseUrl: string, sessionId: string): Promise<void> {
  const res = await authFetch(`${agentBaseUrl}/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) {
    console.error('[SA] stopQuery FAILED', { agentBaseUrl, sessionId, status: res.status });
    throw new Error(`stopQuery failed: ${res.status}`);
  }
}

// Merge a live frame into a message list: replace by id if it exists,
// append if new. Same partId arriving with a new state (e.g. tool pending
// → running → completed) updates the existing bubble in place. Used by
// every consumer of streamQuery / streamReconnect.
/** Auto-mode triage sentinel (U+27E6 ESCALATE U+27E7). Suppressed server-side; this
    is a defensive strip of a stray leading occurrence so it never renders.

    The `[Session workspace: ...]` preamble is NOT stripped here (or anywhere) any
    more: the agent sends the user's own words, read from the stored part's metadata,
    so the model-facing scaffolding never reaches a frame. See USER_TEXT_KEY in

    docker/agent/src/frameBuilder.js. */
const ESCALATE_SENTINEL_RE = /^\s*⟦ESCALATE⟧[ \t]*\n*/;

function stripEscalateSentinel(text: string | undefined | null): string | undefined | null {
  if (!text || typeof text !== 'string') return text;
  return text.replace(ESCALATE_SENTINEL_RE, '');
}

export function mergeFrame(prev: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  if (msg.kind === 'TEXT' && typeof msg.text === 'string') {
    const cleaned = stripEscalateSentinel(msg.text);
    if (cleaned !== msg.text) msg = { ...msg, text: cleaned ?? '' };
  }
  const idx = prev.findIndex((m) => m.id === msg.id);
  if (idx >= 0) {
    const updated = [...prev];
    updated[idx] = msg;
    return updated;
  }
  // Client optimistic USER bubble (ChatPage sendMessage) is replaced by the
  // server-echoed USER frame so we don't show duplicates after resume/stream start.
  //
  // The optimistic bubble is not always the tail: the server can emit a
  // preamble frame (REASONING placeholder, STEP_START, a tool_call skeleton,
  // or an assistant text token) before echoing the USER turn. Restricting the
  // twin lookup to `prev[last]` missed that case and produced two identical
  // user bubbles. Scan backward past non-USER frames instead — the first USER
  // bubble we hit is the twin candidate; stop there (a still-earlier
  // `user-local-*` belongs to a prior, unrelated send).
  if (msg.kind === 'TEXT' && msg.role === 'USER' && prev.length > 0) {
    const incomingText = (msg.text ?? '').trim();
    for (let i = prev.length - 1; i >= 0; i--) {
      const candidate = prev[i];
      if (candidate.kind !== 'TEXT' || candidate.role !== 'USER') continue;
      const isOptimistic = typeof candidate.id === 'string' && candidate.id.startsWith('user-local-');
      if (isOptimistic && (candidate.text ?? '').trim() === incomingText) {
        const next = prev.slice();
        next.splice(i, 1, msg);
        return next;
      }
      // Nearest USER bubble is either a persisted server row or a different
      // optimistic send — stop; don't reach past it to steal a farther twin.
      break;
    }
  }
  return [...prev, msg];
}

// ── External MCP connections (Nexus.Mcp.ConnectionApi) ──

export type McpAuthKind = 'none' | 'bearer' | 'apiKey' | 'oauth';

export type McpTransport = 'http' | 'sse';

export type McpConnectionStatus = {
  connectionKey: string;
  name: string;
  authKind: McpAuthKind;
  requiresAuth: boolean;
  status: 'connected' | 'disconnected' | 'shared';
};

export async function discoverMcpOAuthMetadata(endpoint: string): Promise<{
  oauthAuthUrl?: string;
  oauthTokenUrl?: string;
  oauthRegistrationUrl?: string;
  oauthScopes?: string;
  oauthUsePkce?: boolean;
}> {
  const raw = await c3call('Nexus.Mcp.ConnectionApi', 'discoverOAuthMetadata', { endpoint });
  return _parse(raw);
}

export async function getMyMcpConnectionStatus(agentDefId?: string): Promise<McpConnectionStatus[]> {
  const raw = await c3call('Nexus.Mcp.ConnectionApi', 'getMyConnectionStatus', { agentDefId: agentDefId || '' });
  const arr = _parse<unknown>(raw);
  return Array.isArray(arr) ? (arr as McpConnectionStatus[]) : [];
}

export async function getMcpOAuthUrl(
  connectionKey: string,
  redirectUri: string,
  codeChallenge: string,
  codeVerifier: string
): Promise<string> {
  const raw = await c3call('Nexus.Mcp.ConnectionApi', 'getOAuthUrl', {
    connectionKey,
    redirectUri,
    codeChallenge,
    codeVerifier,
  });
  // getOAuthUrl returns a bare URL string (c3call already unwraps `.value`). Do NOT run it through
  // _parse — JSON.parse("https://…") throws "Unexpected token 'h'". Return the string as-is.
  return typeof raw === 'string' ? raw : String(raw);
}

export async function connectMcp(
  connectionKey: string,
  authCode: string,
  state: string
): Promise<{ connected: boolean }> {
  const raw = await c3call('Nexus.Mcp.ConnectionApi', 'connect', { connectionKey, authCode, state });
  return _parse(raw);
}

export async function setMcpApiKey(connectionKey: string, apiKey: string): Promise<{ connected: boolean }> {
  const raw = await c3call('Nexus.Mcp.ConnectionApi', 'setApiKey', { connectionKey, apiKey });
  return _parse(raw);
}

export async function disconnectMcp(connectionKey: string): Promise<boolean> {
  const raw = await c3call('Nexus.Mcp.ConnectionApi', 'disconnect', { connectionKey });
  return _parse<boolean>(raw) === true;
}

// ── Per-user cross-cluster OAuth (Nexus.RemoteCluster) ──
// The individual chat user connects a remote C3 app AS THEMSELVES via authorization_code + PKCE,
// mirroring the MCP OAuth flow above. Returns strip any token; the token is injected server-side by
// the in-pod proxy and never reaches the browser.

/** Verdict from the compatibility probe (remote OAuth-capable + a Nexus client registered here).
 *  Never carries a secret. `reason` is a stable machine code the UI maps to a message. */
export type RemoteProbeResult = {
  compatible: boolean;
  appUrl: string;
  authorizeUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  needsAdmin: boolean;
  reason:
    | 'compatible'
    | 'needs-admin-client'
    | 'oauth-missing-features'
    | 'discovery-not-found'
    | 'discovery-blocked'
    | 'incompatible-server'
    | 'unreachable'
    | 'invalid-url';
  message: string;
};

/** Non-secret view of a per-user remote connection (never the token). */
export type RemoteUserApp = { appId: string; appUrl: string; connected: boolean; tokenExpiry: string | null };

export async function probeRemote(rawUrl: string): Promise<RemoteProbeResult> {
  const raw = await c3call('Nexus.RemoteCluster', 'probeRemote', { rawUrl });
  return _parse<RemoteProbeResult>(raw);
}

export async function getRemoteOAuthUrl(rawUrl: string, codeChallenge: string, codeVerifier: string): Promise<string> {
  // No redirectUri argument: the server defaults it from the callback the admin registered this
  // client with, so the browser can't rebind the OAuth callback.
  const raw = await c3call('Nexus.RemoteCluster', 'getRemoteOAuthUrl', {
    rawUrl,
    codeChallenge,
    codeVerifier,
  });
  // Bare URL string (c3call already unwrapped `.value`). Do NOT _parse — JSON.parse("https://…")
  // throws. Same gotcha as getMcpOAuthUrl above.
  return typeof raw === 'string' ? raw : String(raw);
}

export async function connectRemoteUser(rawUrl: string, code: string, state: string): Promise<RemoteUserApp> {
  const raw = await c3call('Nexus.RemoteCluster', 'connectRemoteUser', { rawUrl, code, state });
  return _parse<RemoteUserApp>(raw);
}

export async function disconnectRemoteUser(appId: string): Promise<boolean> {
  const raw = await c3call('Nexus.RemoteCluster', 'disconnectRemoteUser', { appId });
  return _parse<boolean>(raw) === true;
}

/** A scheduled upgrade pending behind the pre-upgrade banner. `scheduledAt` is an ISO-8601 UTC
 *  instant (the real upgrade time); `leadMs` is the lead window. `source` is `'auto'` (pre-announced
 *  ahead of a scheduled auto-update — no user Cancel) or `'manual'` ("Upgrade now → notify users
 *  first" — cancellable). */
export type PendingUpgrade = {
  targetVersion: string;
  scheduledAt: string;
  leadMs: number;
  source: 'auto' | 'manual';
};
