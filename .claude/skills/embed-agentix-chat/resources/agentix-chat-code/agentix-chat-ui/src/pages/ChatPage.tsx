/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { QueryClient, QueryClientContext, QueryClientProvider, useQuery } from '@tanstack/react-query';
import React, {
  lazy,
  Suspense,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  useReducer,
} from 'react';
// Error classes only — used for `instanceof` narrowing in catch blocks. All chat API *behavior*
// is reached through the injected `transport` (NexusChatTransport), never imported directly.
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ChatTransportProvider } from '../chatTransportContext';
import { CloseIcon } from '../components/AgentIcons';
import AgentPicker from '../components/AgentPicker';
import AgentSpinUpWithStatus from '../components/AgentSpinUpWithStatus';
import ChatColumn, { bindToolDescriptions, chunkMessages, type ChatColumnProps } from '../components/ChatColumn';
import { DEFAULT_EFFORT, DEFAULT_EFFORT_LEVELS, clampToScale } from '../components/EffortControl';
const FilePreviewModal = lazy(() => import('../components/FilePreviewModal'));
const McpAppPanel = lazy(() => import('../components/McpAppPanel').then((m) => ({ default: m.McpAppPanel })));
import McpAuthGateModal from '../components/McpAuthGateModal';
import { MovableResourceApp, ResourceAppAnchor } from '../components/MovableResourceApp';
import { MovableServerApp, ServerAppAnchor } from '../components/MovableServerApp';
import OverlayFade from '../components/OverlayFade';
import SessionSidebar from '../components/SessionSidebar';
import SubagentTranscript from '../components/SubagentTranscript';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';
import { Skeleton } from '../components/ui/skeleton';

const WorkspaceFileViewer = lazy(() => import('../components/WorkspaceFileViewer'));
const WorkspaceSidePanel = lazy(() => import('../components/WorkspaceSidePanel'));

const preloadWorkspaceSidePanel = () => import('../components/WorkspaceSidePanel');
import { CHAT_ATTACHMENT_CONFIG, splitFilesBySize } from '../config/chatAttachments.config';
import { useServiceHealth } from '../hooks/queries/useServiceHealth';
import { useAvailableChatModels } from '../hooks/useAvailableChatModels';
import { useDisplayModeManager } from '../hooks/useDisplayMode';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useMcpToken } from '../hooks/useMcpToken';
import { useNonRecoverableStatus } from '../hooks/useNonRecoverableStatus';
import { useServerToolUiMap } from '../hooks/useServerToolUiMap';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { findActivePermissionId } from '../lib/activePermission';
import {
  clampAppPanelWidth,
  getAppPanelMaxWidth,
  persistAppPanelWidth,
  readAppPanelWidth,
} from '../lib/appPanelSizing';
import { findServerAppEvents } from '../lib/appServerDetection';
import {
  AgentHttpError,
  routingQueryErrorKey,
  SessionMessagesHttpError,
  ServiceDeadError,
  WorkspaceTreeHttpError,
  type ModelAvailability,
  type ModelAvailabilityReason,
} from '../lib/chatApi';
import { chatRequestErrorKey, isContextLengthError } from '../lib/chatErrors';
import {
  isCrossClusterAuthFrame,
  isCrossClusterAuthKind,
  upsertPendingAppId,
  makeCrossClusterAuthDedup,
  resetCrossClusterAuthDedup,
  recordCrossClusterAuthFrame,
  markAppIdDismissed,
  type CrossClusterAuthDedup,
} from '../lib/crossClusterAuthFrames';
import { getDraft, setDraft, clearDraft, consumeNewSessionDraftFor } from '../lib/draftStorage';
import { LAST_AGENT_BASE_URL_KEY, LAST_SERVICE_ID_KEY } from '../lib/envApp';
import { formatSize } from '../lib/formatSize';
import { reconcileHydratedTranscript } from '../lib/hydrationReconcile';
import { selectSessionLearningProposals } from '../lib/learningProposal';
import {
  llmBlockReason as deriveLlmBlockReason,
  isLlmBlocked,
  DEFAULT_LONG_WAIT_THRESHOLD_MS,
} from '../lib/llmBlockReason';
import { appPanelReducer, EMPTY_APP_PANEL_STATE, serverDescriptor } from '../lib/mcpAppRegistry';
import {
  isMcpAuthExpiredFrame,
  upsertExpiredKey,
  makeAuthExpiredDedup,
  resetAuthExpiredDedup,
  recordExpiredFrame,
  markKeyDismissed,
  type AuthExpiredDedup,
} from '../lib/mcpAuthExpiredFrames';
import { olderCursor, prependOlder } from '../lib/messagePaging';
import { buildModelOptions, resolveAutoAvailability } from '../lib/modelOptions';
import { chatQueryKeys } from '../lib/queryKeys';
import { getQueued, putQueued, dropQueued } from '../lib/queuedMessageStore';
import { connectRemoteApp, extractAppId, isUrlInput } from '../lib/remoteConnect';
import { findResourceApps, findResourceAppsFromToolUi, type ResourceAppInfo } from '../lib/resourceAppDetection';
import { clearResumeAttempts, getResumeAttempts, recordResumeAttempt } from '../lib/resumeAttempts';
import { clearTurnRunning, markTurnRunning } from '../lib/runningTurns';
import { isSessionExpired } from '../lib/sessionExpiry';
import { setSessionFirstMessage, clearSessionFirstMessage } from '../lib/sessionFirstMessage';
import { useSession, type ProvisionStatus } from '../lib/sessionProvisioning';
import { setSessionLastUsed, pickMostRecentSession } from '../lib/sessionRecency';
import { deriveActiveTurnStartMs } from '../lib/thinkingElapsed';
import { decideTitleAction, buildTitlePrompt } from '../lib/titleTrigger';
import { estimateConversationTokens } from '../lib/tokenEstimate';
import {
  finalizeOrphanedFrames,
  hasPendingPermission,
  shouldRehydrateForPendingPermission,
} from '../lib/toolCallStatus';
import { isWorkspacePathExportable } from '../lib/workspaceExportPolicy';
import {
  WORKSPACE_TREE_ROOT_ROW_ID,
  expandedPathsForWorkspaceFile,
  findWorkspaceFileByDisplayName,
  resolveChatAttachmentWorkspacePath,
} from '../lib/workspaceTreeUtils';
import { InClusterTransport } from '../transports/InClusterTransport';
import type { ModelInfo, ModelsResponse, UploadProgress } from '../lib/chatApi';
import type { McpAppDescriptor } from '../lib/mcpAppRegistry';
import type {
  ChatMessage,
  FeedbackRating,
  PermissionResponse,
  QueuedMessage,
  Session,
  SkillRow,
  TargetAppInfo,
} from '../lib/types';
import type { NexusChatTransport } from '../transport';

/** Both catalog spellings identify proxy routes; startup-direct checks must agree on either. */
function isDirectModelRoute(model: Pick<ModelInfo, 'id' | 'providerID'>): boolean {
  return model.providerID !== 'litellm' && !model.id.startsWith('litellm/');
}

/** SessionProvider statuses where ChatPage must not fire a parallel recover/resume. */
function isProviderBusy(status: ProvisionStatus): boolean {
  return status === 'unknown' || status === 'provisioning' || status === 'unhealthy';
}

/** Cloud agent route gone / gateway can't reach pod — recover the session. 504 (gateway timeout)
 *  and a killed pod behind the rproxy read as these; a pod being rescheduled after a kill surfaces
 *  here (never as 410), so it must be treated as recoverable, not a bare error. */
const STALE_QUERY_HTTP_STATUSES = [404, 502, 503, 504];

/** Auto-resume retry cap. First attempt covers the transient case (pod
 *  stopped, wakes cleanly). Second covers a stop racing client
 *  wake-up. Beyond that we stop hammering the server (pod likely TERMINATED
 *  or the user lost network); the overlay clears and an error banner asks the
 *  user to start fresh from the agent registry. */
const MAX_AUTO_RESUME_ATTEMPTS = 2;

/** Bubble text stamped on an attachments-only turn (no typed prompt). Used both when composing the
 *  turn and by retry, which must not resend this placeholder as if it were a real prompt. */
const ATTACHED_FILES_PLACEHOLDER = '(Attached files)';

/** Delay before the blocking overlay is shown. A warm pod resumes in well under this, so a fast
 *  resume never flashes the "Resuming…" overlay on initial navigation; a genuine cold boot still
 *  exceeds it and shows the loader. */
const PROVISION_OVERLAY_SHOW_DELAY_MS = 250;
/** Delay before the blocking overlay is hidden. Bridges brief gaps between consecutive blocking
 *  phases (provisioning → landing → ready) so the chat underneath never peeks through mid-handoff,
 *  and so the step-stream clock is not reset between phases. Long recover/hydrate stretches stay
 *  covered by awaitingProviderReady (pageBlockedRaw stays true) — this delay is only for short
 *  inter-phase blips, not round-trips. */
const PROVISION_OVERLAY_HIDE_DELAY_MS = 100;

/** One published resource instance. A later message can intentionally republish the same URI. */
function resourceAppInstanceKey(app: ResourceAppInfo): string {
  return `${app.uri}:${app.sourceMessageId || app.uri}`;
}

/** How often the client pings the server to keep an open, in-use chat tab's pod out of idle-stop.
 *  Comfortably below the server-side idle timeout (default 60 min) so several pings land inside one
 *  window even if a couple are missed. Exported so the vitest + Playwright keepalive tests advance
 *  their virtual clocks by the real value (no hardcoded copy that silently drifts when this is
 *  tuned). At 15 min → 4 pings per 60-min window (3 spare if one is missed) and ~4 single-row
 *  writes/hour per actively-used tab. */
export const KEEPALIVE_INTERVAL_MS = 15 * 60 * 1000;
/** How long after the user's last real interaction the tab still counts as "in use" for keepalive.
 *  A tab left visible but untouched past this stops pinging, so an unattended session is still
 *  idle-stopped and its pod reclaimed — the keepalive protects active use, not an abandoned tab.
 *  Exported alongside KEEPALIVE_INTERVAL_MS for the same single-source-of-truth reason. */
export const KEEPALIVE_USER_IDLE_CUTOFF_MS = 15 * 60 * 1000;
/** Real user-input events that count as presence for the keepalive activity gate. */
const KEEPALIVE_ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;
/** Throttle window for recording user activity — one timestamp write per this interval at most, so a
 *  burst of mousemove/scroll events costs a single cheap assignment. */
const KEEPALIVE_ACTIVITY_THROTTLE_MS = 30 * 1000;

/**
 * A 404 on a session's messages means the pod/PVC is gone. We resume the service and
 * reload once to re-hydrate. But the in-memory `autoResumeAttemptsRef` cap resets on a
 * full page reload, so a genuinely unrecoverable session would re-detect the 404 and
 * reload forever (the "page keeps refreshing" bug). This sessionStorage flag, keyed by
 * sessionId, survives reloads: we reload at most once per session, then hand off to the
 * provisioning controller instead of looping. Cleared whenever a session's history
 * loads successfully, so a later legitimate close→resume can reload once again.
 */
const RESUME_RELOAD_GUARD_PREFIX = 'nexus.sessionResumeReloaded.';
function hasResumeReloaded(sid: string): boolean {
  try {
    return sessionStorage.getItem(RESUME_RELOAD_GUARD_PREFIX + sid) === '1';
  } catch {
    return false;
  }
}
function markResumeReloaded(sid: string): void {
  try {
    sessionStorage.setItem(RESUME_RELOAD_GUARD_PREFIX + sid, '1');
  } catch {
    /* sessionStorage unavailable (private mode) — fall through to reload */
  }
}
function clearResumeReloaded(sid: string): void {
  try {
    sessionStorage.removeItem(RESUME_RELOAD_GUARD_PREFIX + sid);
  } catch {
    /* ignore */
  }
}

/**
 * Sessions whose pod/PVC is gone and could not be recovered (still 404 after a
 * resume + one reload). Blacklisting them is what actually breaks the refresh
 * loop: when we hand off to the provisioning controller it picks the MOST RECENT
 * session and navigates back to its hash — which, for a just-failed session, is
 * the same dead one, bouncing us straight back into the 404 → resume → reload
 * cycle. The landing/adoption lookup filters these out so a dead session is never
 * re-adopted. Cleared (per session) the moment its history loads successfully.
 */
const DEAD_SESSION_PREFIX = 'nexus.deadSession.';
function isSessionDead(sid: string): boolean {
  try {
    return sessionStorage.getItem(DEAD_SESSION_PREFIX + sid) === '1';
  } catch {
    return false;
  }
}
function markSessionDead(sid: string): void {
  try {
    sessionStorage.setItem(DEAD_SESSION_PREFIX + sid, '1');
  } catch {
    /* ignore */
  }
}
function clearSessionDead(sid: string): void {
  try {
    sessionStorage.removeItem(DEAD_SESSION_PREFIX + sid);
  } catch {
    /* ignore */
  }
}

/**
 * `Nexus.Agent.Service.resume` requires STOPPED; another tab or timing can leave the session ACTIVE.
 * In that case we still refresh session info and resend — no user-visible resume error.
 */
function isResumeNoOpAlreadyActive(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('Session is not stopped') && msg.includes('ACTIVE');
}

function isStaleQueryStreamError(err: unknown): boolean {
  // Routing readiness is an application-level convergence state, not evidence that the pod is
  // stale or dead. Recovering the service here would churn a healthy agent and preserve neither
  // the user's selected model nor the routing generation that rejected it.
  if (routingQueryErrorKey(err)) return false;
  if (err instanceof AgentHttpError) {
    if (err.status === 0) return true;
    return STALE_QUERY_HTTP_STATUSES.includes(err.status);
  }
  const msg = err instanceof Error ? err.message : String(err);
  // A transport/network failure (AgentHttpError(0) → "streamQuery failed: network error") means the
  // pod was unreachable — a killed pod mid-reschedule reads this, not an HTTP status. Recover, don't
  // surface a bare error banner.
  if (/streamQuery failed: network error/.test(msg)) return true;
  // Matches both legacy `streamQuery failed: 404` and api.ts throwIfBadResponse `streamQuery failed: HTTP 404 …`
  const m = msg.match(/streamQuery failed: (?:HTTP )?(\d+)/);
  return m ? STALE_QUERY_HTTP_STATUSES.includes(Number(m[1])) : false;
}

/**
 * A 410 Gone from `/query` means the pod is truly dead — not hibernated (404, which the
 * stale path resumes). These funnel to the provisioning controller (loading screen +
 * re-provision) rather than the resume modal, so a dead service is never silently
 * surfaced as a bare error banner mid-send.
 */
function isDeadQueryStreamError(err: unknown): boolean {
  if (err instanceof AgentHttpError) return !routingQueryErrorKey(err) && err.status === 410;
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/streamQuery failed: (?:HTTP )?(\d+)/);
  return m ? Number(m[1]) === 410 : false;
}

function commitThoughtDuration(
  queryStartedAtRef: React.MutableRefObject<number | null>,
  streamingTurnKeyRef: React.MutableRefObject<string | null>,
  messagesSnapshot: ChatMessage[],
  setThoughtDurationByTurnKey: React.Dispatch<React.SetStateAction<Record<string, number>>>
): void {
  if (queryStartedAtRef.current == null) return;
  const elapsed = Math.max(0, Math.floor((Date.now() - queryStartedAtRef.current) / 1000));
  let key = streamingTurnKeyRef.current;
  if (!key && messagesSnapshot.length > 0) {
    const last = messagesSnapshot[messagesSnapshot.length - 1];
    key = last?.turnId || last?.id;
  }
  if (key) {
    setThoughtDurationByTurnKey((d) => ({ ...d, [key]: elapsed }));
  }
  queryStartedAtRef.current = null;
}

/** Best-effort recovery of the pod's recorded terminal error after a stream request threw with no
 *  in-band ERROR frame (a silent turn death — see the agent's incomplete-turn guard). The agent
 *  persists a terminal ERROR frame (from `session.error` or the guard) as the trailing transcript
 *  entry, so the newest ERROR message here is this turn's cause. `turnStartMs` (this turn's client
 *  start, `Date.now()`) gates recency: a frame older than the turn start (minus a clock-skew margin
 *  for the pod's wall clock) is stale prior-turn residue and is NOT surfaced, so a transient failure
 *  on a later turn can't show an old error as this turn's cause. Returns the text, or null when the
 *  pod is unreachable, nothing was recorded, or the newest error predates this turn. */
async function recoverTerminalErrorText(
  agentBaseUrl: string,
  sessionId: string,
  turnStartMs: number | null,
  fetchSessionMessages: NexusChatTransport['fetchSessionMessages']
): Promise<string | null> {
  try {
    // Bound the recovery so an unresponsive pod can't stall the chat's error-state cleanup (the
    // `finally` that clears the streaming spinner). fetchSessionMessages' own budget is ~50s (25s ×
    // 2 attempts) — too long to block an error path on. Race a short timeout; the fetch's rejection
    // is swallowed so a post-timeout reject isn't unhandled. Best-effort: null → generic fallback.
    const fetched = fetchSessionMessages(agentBaseUrl, sessionId, { limit: 10 }).then(
      (r) => r.messages,
      () => null
    );
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
    const messages = await Promise.race([fetched, timeout]);
    if (!messages) return null;
    // 60s tolerance for pod-vs-client clock skew: only discard frames clearly older than this turn,
    // never a fresh error whose pod timestamp lags the client's turn-start clock.
    const staleBefore = turnStartMs == null ? null : turnStartMs - 60_000;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.kind !== 'ERROR' || typeof m.text !== 'string' || !m.text.trim()) continue;
      // Newest ERROR frame. If it predates this turn, there's no current-turn error to surface.
      if (staleBefore != null && m.timestamp && Date.parse(m.timestamp) < staleBefore) return null;
      return m.text;
    }
  } catch {
    /* best-effort — pod may be gone; caller falls back to the generic message */
  }
  return null;
}

/** Resolve the user-facing message for a thrown chat-stream error, shared by the send and retry
 *  paths. A typed transport/HTTP error keeps its specific key; a generic failure (the `queryFailed`
 *  fallback) best-effort recovers the pod's recorded terminal error (see recoverTerminalErrorText)
 *  and maps a context-window overflow to the friendly key, else surfaces the recovered text, else
 *  the generic message. */
async function resolveStreamErrorMsg(
  err: unknown,
  agentBaseUrl: string,
  sessionId: string,
  turnStartMs: number | null,
  t: (key: string) => string,
  fetchSessionMessages: NexusChatTransport['fetchSessionMessages']
): Promise<string> {
  const routingKey = routingQueryErrorKey(err);
  if (routingKey) return t(routingKey);
  const baseKey = chatRequestErrorKey(err, 'error.queryFailed');
  if (baseKey !== 'error.queryFailed') return t(baseKey);
  const recovered = await recoverTerminalErrorText(agentBaseUrl, sessionId, turnStartMs, fetchSessionMessages);
  if (recovered && isContextLengthError(recovered)) return t('error.conversationTooLarge');
  if (recovered) return recovered;
  return t(baseKey);
}

// The left chat sidebar and the right workspace panel are independently drag-resizable and share one
// width range. They open at the max width and can be dragged down to the min.
const PANEL_MIN_WIDTH = 260;
const PANEL_MAX_WIDTH = 420;
const PANEL_DEFAULT_WIDTH = PANEL_MAX_WIDTH;

const clampPanelWidth = (px: number): number => Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, px));

const readPanelWidth = (key: string): number => {
  const saved = Number(localStorage.getItem(key));
  return saved >= PANEL_MIN_WIDTH && saved <= PANEL_MAX_WIDTH ? saved : PANEL_DEFAULT_WIDTH;
};

/** Props for {@link ChatPage}. */
export interface ChatPageProps {
  /**
   * The backend the chat UI talks to. Defaults to a {@link InClusterTransport} (the host live-pod
   * chat API); an external embed passes its own {@link NexusChatTransport}. ChatPage never calls
   * `@/lib/api` chat functions directly — only this transport.
   */
  transport?: NexusChatTransport;
  /**
   * When true (default), show host-only CTAs that navigate to `/agents`. Same-cluster embeds have
   * no Agents registry route — pass false so those buttons become Retry / dismiss instead.
   */
  showHostNavLinks?: boolean;
  /**
   * When true, the session sidebar shows Learning / Excluded chips. Host computes this from
   * skill-improvement settings so nexusClient does not import host-only hooks.
   */
  skillImprovementLearningEnabled?: boolean;
  /**
   * Enables the in-chat MCP apps surface (inline app server + tool-UI resolution). Host computes
   * this from the `nexus-mcp-apps` PostHog flag and passes it down so nexusClient does not import
   * the host-only analytics singleton. Defaults false — embeds opt in explicitly.
   */
  mcpAppsEnabled?: boolean;
  /**
   * Agent definition id new chats are started with. **Required** — the consumer configures which
   * agent to chat with; the package no longer carries a hardcoded default. A router
   * `location.state.agentDefId` deep-link still overrides this initial selection when present.
   */
  agentDefId: string;
  /**
   * When true, render the in-chat agent switcher (header {@link AgentPicker} + sidebar new-chat
   * agent menu) so users can start chats with a different agent. Defaults false: no switcher, and
   * every new chat is pinned to `agentDefId`.
   */
  allowAgentSwitch?: boolean;
  /**
   * When true (default), show the workspace surface: the header workspace toggle and the right-hand
   * workspace side panel. The host keeps this on; an embed may pass false to drop the workspace
   * entirely (no toggle, no panel).
   */
  workspaceEnabled?: boolean;
  /**
   * When true, expose the add/connect-apps UI (the AppsPicker connect-by-id input + the
   * "add from studio" list). Defaults false — the connect affordance is forced off by making
   * `onConnectApp` undefined, which AppsPicker already reads to hide its connect/studio UI. The
   * host passes true to preserve its historical connect-apps behavior; the embed leaves it off.
   */
  connectAppsEnabled?: boolean;
  /**
   * Enables the cross-cluster per-user OAuth connect path (the AppsPicker URL/cross-cluster
   * escalation and the mid-task Connect banner). Host computes this from the
   * `nexus-cross-cluster-user-oauth` PostHog flag and passes it down so nexusClient does not import
   * the host-only analytics singleton. Defaults false (fail closed). Independent of
   * {@link connectAppsEnabled}: same-cluster connect stays available when this is off — only the
   * OAuth redirect is gated.
   */
  crossClusterOAuthEnabled?: boolean;
  /**
   * When true (default), show the composer model controls: the reasoning-effort picker
   * ({@link EffortControl}) and the LLM model select ({@link ModelSelect}). An embed may pass false
   * to hide both so the conversation runs on the agent's configured defaults with no user override.
   */
  modelControlsEnabled?: boolean;
  /**
   * When true (default), render the left chat-sessions sidebar ({@link SessionSidebar}) and its
   * resizer. When false neither is rendered at all (not merely collapsed) and the main column
   * reflows to fill the width. The host keeps the sidebar; an embed may drop it.
   */
  sessionSidebarEnabled?: boolean;
  /**
   * The configured agent backend (e.g. 'opencode', 'bedrock-agent'). Host computes this from
   * appInfo() so nexusClient does not import the host-only useAppInfo hook. Forwarded to
   * SessionSidebar to gate its AgentCore-specific "Expired" badge.
   */
  agentBackend?: string;
  /**
   * AgentCore's `lifecycleConfiguration.idleRuntimeSessionTimeout` (seconds), from the same
   * appInfo() source as {@link agentBackend}. Forwarded to SessionSidebar.
   */
  bedrockIdleRuntimeSessionTimeoutSeconds?: number;
  /**
   * Enables the subagent sessions sub-tree in the sidebar and the read-only
   * {@link SubagentTranscript} viewer. Host computes this from the `agentix-subagents` PostHog flag.
   * Defaults false (fail closed).
   */
  subagentsEnabled?: boolean;
}

// Lazy default so importing the package barrel (e.g. host admin pages that only need
// EffortControl) does not construct InClusterTransport — and therefore does not
// require a complete `@/lib/api` mock — at module evaluation time. Once created, the instance is
// stable across remounts (same as the previous module-level singleton).
let defaultTransport: NexusChatTransport | undefined;
function getDefaultTransport(): NexusChatTransport {
  // Host-like default: derive mount from window.location. Embeds always inject a transport
  // after Microservice discovery / nexusBase — never rely on this zero-config path.
  if (!defaultTransport) defaultTransport = new InClusterTransport({ local: true });
  return defaultTransport;
}

/**
 * Minimal client-only {@link TargetAppInfo} for a target staged before the session exists. Only
 * `appId` is known pre-reserve (the picker reads `appId`, and `appUrl` only for the row link,
 * hidden when blank). The real, fully-populated info arrives when the staged-apply effect binds it
 * via `configureApp` once the pod is ready.
 */
function stagedTargetInfo(appId: string): TargetAppInfo {
  return { appId, appUrl: '', internalUrl: '', pkg: '', pkgVersion: '', isSne: false, mode: '', serverVersion: '' };
}

const ChatPage: React.FC<ChatPageProps> = ({
  transport: transportProp,
  showHostNavLinks = true,
  skillImprovementLearningEnabled = false,
  mcpAppsEnabled = false,
  agentDefId,
  allowAgentSwitch = false,
  workspaceEnabled = true,
  connectAppsEnabled = false,
  crossClusterOAuthEnabled = false,
  modelControlsEnabled = true,
  sessionSidebarEnabled = true,
  agentBackend,
  bedrockIdleRuntimeSessionTimeoutSeconds,
  subagentsEnabled = false,
}) => {
  const transport = transportProp ?? getDefaultTransport();
  const inheritedQueryClient = React.useContext(QueryClientContext);
  const [fallbackQueryClient] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  const page = (
    <ChatTransportProvider transport={transport}>
      <ChatPageContent
        transport={transport}
        showHostNavLinks={showHostNavLinks}
        skillImprovementLearningEnabled={skillImprovementLearningEnabled}
        mcpAppsEnabled={mcpAppsEnabled}
        agentDefId={agentDefId}
        allowAgentSwitch={allowAgentSwitch}
        workspaceEnabled={workspaceEnabled}
        connectAppsEnabled={connectAppsEnabled}
        crossClusterOAuthEnabled={crossClusterOAuthEnabled}
        modelControlsEnabled={modelControlsEnabled}
        sessionSidebarEnabled={sessionSidebarEnabled}
        agentBackend={agentBackend}
        bedrockIdleRuntimeSessionTimeoutSeconds={bedrockIdleRuntimeSessionTimeoutSeconds}
        subagentsEnabled={subagentsEnabled}
      />
    </ChatTransportProvider>
  );
  return inheritedQueryClient ? page : <QueryClientProvider client={fallbackQueryClient}>{page}</QueryClientProvider>;
};

const ChatPageContent: React.FC<{
  transport: NexusChatTransport;
  showHostNavLinks: boolean;
  skillImprovementLearningEnabled: boolean;
  mcpAppsEnabled: boolean;
  agentDefId: string;
  allowAgentSwitch: boolean;
  workspaceEnabled: boolean;
  connectAppsEnabled: boolean;
  crossClusterOAuthEnabled: boolean;
  modelControlsEnabled: boolean;
  sessionSidebarEnabled: boolean;
  agentBackend?: string;
  bedrockIdleRuntimeSessionTimeoutSeconds?: number;
  subagentsEnabled: boolean;
}> = ({
  transport,
  showHostNavLinks,
  skillImprovementLearningEnabled,
  mcpAppsEnabled,
  agentDefId,
  allowAgentSwitch,
  workspaceEnabled,
  connectAppsEnabled,
  crossClusterOAuthEnabled,
  modelControlsEnabled,
  sessionSidebarEnabled,
  agentBackend,
  bedrockIdleRuntimeSessionTimeoutSeconds,
  subagentsEnabled,
}) => {
  const { t } = useTranslation('chat');
  const tRef = useRef(t);
  tRef.current = t;
  useDocumentTitle(t('pageTitle'));
  // useLocation (not window.location) so URL-hash changes re-render this component —
  // pending-mode requires the routing effect to re-run when /chat (no hash) flips
  // to /chat#<newSessionId> after addSession resolves.
  const location = useLocation();
  // "+ New chat" routes to /chat#new — a hash sentinel (never a real session id) that
  // opens the empty new-chat screen; hashless /chat WITHOUT it resumes the most-recent
  // chat. Hash (not a query string) so a refresh doesn't hit the UiService redirect loop.
  const rawHash = location.hash.replace('#', '');
  // A subagent transcript route embeds the child session id after the parent's own hash:
  // `#<parentSessionId>/subagents/<subagentSessionId>`. The parent session id still drives every
  // existing provisioning/streaming effect below (the parent chat stays live underneath); only the
  // rendered body swaps to the read-only SubagentTranscript.
  const subagentRouteMatch = rawHash.match(/^(.+)\/subagents\/([^/]+)$/);
  // Gated here (not just at the sidebar that constructs this hash) so a bookmarked or hand-typed
  // `#parent/subagents/child` URL can't reach the read-only viewer while the flag is off.
  const viewingSubagentSessionId = subagentsEnabled && subagentRouteMatch ? subagentRouteMatch[2] : undefined;
  const hashSessionPart = subagentRouteMatch ? subagentRouteMatch[1] : rawHash;
  const isNewChatIntent = hashSessionPart === 'new';
  const sessionId = !isNewChatIntent && hashSessionPart ? hashSessionPart : undefined;
  const navigate = useNavigate();
  // App-internal Markdown links (e.g. `[Automations → Schedules](/automations)`) SPA-navigate via
  // `navigate()`; basename-resolved `<a href>` for hover / new-tab is built in MessageBlock via
  // `useHref` (same pattern as `useDetailHref`).
  const handleInternalLinkClick = useCallback((path: string) => navigate(path), [navigate]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Composer text is mirrored to localStorage (PLAT-148653) so drafts survive
  // navigating away and reloads. Per-session key for committed sessions, plus
  // a "__new__" slot for pending mode that transfers to the first session the
  // user lands on. Lazy init keeps the very first render in sync with storage.
  const [input, setInput] = useState(() => {
    const initialHash = window.location.hash.replace('#', '');
    const initialSid = initialHash && initialHash !== 'new' ? initialHash : undefined;
    return initialSid ? consumeNewSessionDraftFor(initialSid) : getDraft(undefined);
  });
  const [isStreaming, setIsStreaming] = useState(false);
  /** Single-slot queue for a message the user composed mid-stream (PLAT-148695).
   *  V1 limit is 1; a second enqueue replaces this slot. Auto-fires when the
   *  active stream ends (drain useEffect, step 3), or is restored to the textarea
   *  on Stop / non-Abort error / chip × cancel. */
  const [queuedMessage, setQueuedMessage] = useState<QueuedMessage | null>(null);
  const [agentBaseUrl, _setAgentBaseUrl] = useState(() => localStorage.getItem(LAST_AGENT_BASE_URL_KEY) || '');
  const setAgentBaseUrl = useCallback((url: string) => {
    _setAgentBaseUrl(url);
    if (url) {
      localStorage.setItem(LAST_AGENT_BASE_URL_KEY, url);
    }
  }, []);
  const [remoteConversationUrl, setRemoteConversationUrl] = useState('');
  const [error, setError] = useState('');
  const [sessionStatus, setSessionStatus] = useState('loading');
  const [connectedApps, setConnectedApps] = useState<Record<string, TargetAppInfo>>({});
  // Latest connectedApps snapshot, readable synchronously inside the cross-cluster-auth frame handler
  // (which keeps empty deps to stay stable across the stream loops). Kept in sync just below.
  const connectedAppsRef = useRef<Record<string, TargetAppInfo>>({});
  useEffect(() => {
    connectedAppsRef.current = connectedApps;
  }, [connectedApps]);
  // Target apps chosen on a brand-new chat, before any session/pod exists. A pod is the cost of
  // committing to a conversation, not of configuring one — so same-cluster targets are staged in
  // client state here (no reserve) and bound atomically once the first message reserves the pod
  // (see the staged-apply effect). Cross-cluster per-user OAuth still needs a live pod to bind
  // against, so it stays deferred until the chat starts.
  const [stagedAppIds, setStagedAppIds] = useState<string[]>([]);
  // Mirror of stagedAppIds for sendMessage's closure, so capturing them at promotion time doesn't
  // widen that callback's dep array (and re-create the hot send path on every stage/unstage).
  const stagedAppIdsRef = useRef<string[]>([]);
  useEffect(() => {
    stagedAppIdsRef.current = stagedAppIds;
  }, [stagedAppIds]);
  // Captured at pending→committed promotion: the just-created sessionId plus the targets to bind.
  // A self-contained effect consumes this once the pod is ready — the reserve path itself is left
  // untouched (it only stamps this ref alongside the existing pendingPromotionSidRef).
  const stagedApplyRef = useRef<{ sid: string; appIds: string[] } | null>(null);
  // Stamps which sessionId the connectedApps map was loaded for. The render
  // path treats the map as empty whenever this doesn't match the current
  // sessionId, so a chat switch never shows the previous chat's apps —
  // useEffect-based clears can race the next paint, derived state can't.
  const [loadedAppsSessionId, setLoadedAppsSessionId] = useState<string>('');
  // Stamps which sessionId the transcript has finished hydrating. Derived `hydrating` below keys
  // off it so the message area shows a loading skeleton (not the new-chat empty state) while a
  // chat switch's session+transcript fetches are in flight. Set in the hydrate effect's `finally`
  // (a stale closure stamps the OLD sid, so it can never falsely mark a newer session loaded).
  const [loadedTranscriptSid, setLoadedTranscriptSid] = useState<string>('');
  // Bumped to re-run the hash-path hydrate effect IN PLACE (no page reload). The 404-recovery
  // path used to `window.location.reload()` to re-hydrate after resume, which wiped React state —
  // including a message the user had just sent while the pod was restarting. Re-hydrating via this
  // nonce keeps the UI mounted and preserves the optimistic bubble + in-flight send/retry.
  const [hydrateNonce, setHydrateNonce] = useState(0);
  // Bounds the reconnect-drop → recover → re-hydrate cycle (see the reconnect effect's
  // failure branch) so a persistently-unreachable pod can't spin recoverService forever.
  // Refunded to 0 on any clean reconnect attach (per drop-incident budget) and on a genuine
  // session switch.
  const reconnectRehydrateAttemptsRef = useRef(0);
  // useMemo keeps the empty-fallback object's identity stable across renders
  // — downstream deps (AppsPicker) don't re-render on every chat switch.
  const visibleConnectedApps = useMemo(() => {
    // Pre-session (brand-new chat): show the client-staged targets so the picker is live and
    // reflects the user's picks before any pod exists. They bind for real on first message.
    if (!sessionId) return Object.fromEntries(stagedAppIds.map((id) => [id, stagedTargetInfo(id)]));
    return loadedAppsSessionId === sessionId ? connectedApps : {};
  }, [loadedAppsSessionId, sessionId, connectedApps, stagedAppIds]);
  const visibleConnectedAppIds = useMemo(() => Object.keys(visibleConnectedApps).sort(), [visibleConnectedApps]);
  const [modal, setModal] = useState<'resumeStaleAgent' | 'sessionClosedMessages404' | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  // Raw pod opencode catalog (session-scoped); merged with the app-global available-models set into
  // `models` by the derivation effect below. Held as its own state so a later-arriving available-set
  // (or an admin invalidation) recomputes the picker without re-hitting the pod.
  const [podModels, setPodModels] = useState<ModelsResponse | null>(null);
  // Catalog responses are only authoritative for the session/service that fetched them. This
  // scope stamp makes a hash switch fail closed during the render before effect cleanup runs, and
  // prevents an aborted/non-compliant transport response from repopulating the next chat with the
  // previous pod's models.
  const [podModelsScope, setPodModelsScope] = useState('');
  // Bumped to re-read the pod catalog on demand (opening the model picker while an option is
  // still converging). Deliberately NOT hydrateNonce, which session recovery owns.
  const [modelRefreshNonce, setModelRefreshNonce] = useState(0);
  const policyConvergenceRefetchRef = useRef('');
  const policyConvergencePollAttemptRef = useRef(0);
  // Catalog failures share one rendered error bar with turn/session failures, but retain their own
  // state so a later successful /models read clears only the catalog source. Message equality is
  // not provenance: retries may classify differently, and an unrelated failure can have identical
  // copy.
  const [modelCatalogError, setModelCatalogError] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  // App-global available-models set (registry-backed, effectively static within a session), fetched
  // once and shared via React Query — see useAvailableChatModels. Deliberately NOT part of the
  // session-scoped catalog effect below, so switching sessions / status transitions never re-fetch it.
  const availableModelsQuery = useAvailableChatModels();
  const refreshRoutingAuthorities = useCallback(() => {
    policyConvergenceRefetchRef.current = '';
    policyConvergencePollAttemptRef.current = 0;
    setModelRefreshNonce((n) => n + 1);
    void availableModelsQuery.refetch();
  }, [availableModelsQuery.refetch]);
  const [selectedModel, setSelectedModel] = useState('');
  // Inherited app/pod defaults may recover to Auto if their concrete route disappears. An explicit
  // picker choice is sticky and must instead surface an unavailable error—never silently substitute.
  const modelSelectionIntentRef = useRef<'inherited' | 'explicit'>('inherited');
  const handleSelectModel = useCallback((model: React.SetStateAction<string>) => {
    modelSelectionIntentRef.current = 'explicit';
    setSelectedModel(model);
  }, []);
  // The session's PERSISTED model (Session.llmModel: 'auto' | id | null), restored on hydrate. It is
  // the authoritative seed source — ahead of the pod's currentModel/defaultModel — so a chat opens on
  // the model the session actually froze (e.g. 'auto' from an Auto agent). Kept as its own signal (not
  // folded into a direct setSelectedModel in hydrate) so the seed effect can't race it: without this,
  // the models effect's concrete `currentModel` could win under `prev ||` before hydrate's 'auto' set.
  const [sessionModel, setSessionModel] = useState<string | null>(null);
  // Once a hydrate (fresh or same-session soft re-hydrate) has resolved for the open session, it is
  // the authoritative source for selectedModel (it either restores the session's own override, or
  // -- via lastKnownLlmModelRef below -- explicitly clears a genuine reset-to-default). The seed
  // effect below is only for bridging the gap before that first hydrate resolves; once it has, the
  // seed effect must stop re-deriving from currentModel/appDefaultModel, or a stale pod currentModel
  // can silently refill selectedModel right after an explicit reset-to-default clear.
  const [modelHydrated, setModelHydrated] = useState(false);
  // The last SERVER llmModel seen for the currently open session (distinct from `sessionModel`,
  // which resetPerSessionState clears to null on every switch). Lets the hydrate block tell a
  // genuine reset-to-default (server value flips truthy -> falsy on a same-session re-hydrate) apart
  // from a brand-new chat that never had an override -- only the former should clear the user's live
  // selectedModel pick; the latter must preserve it (see resetPerSessionState's "+ New chat" note).
  const lastKnownLlmModelRef = useRef<string | null>(null);
  // Reasoning effort as pinned|inherit (no one-shot seed → no race with model loading). null =
  // inherit: the effective effort is DERIVED below from the current model + the admin app-default.
  // A concrete level (or 'auto') = a user pin. Restored from the persisted Session.llmEffort on reload.
  const [pinnedEffort, setPinnedEffort] = useState<string | null>(null);
  // App-wide admin default effort (D1). Fetched directly (not via React Query) — best-effort; a
  // failure leaves it null and the derivation uses DEFAULT_EFFORT.
  const [appDefaultEffort, setAppDefaultEffort] = useState<string | null>(null);
  // App-wide admin default model (D5). Seeds a new chat's model ahead of the pod concrete default;
  // raw preference ('auto' / id / blank). Same best-effort fetch as the effort default.
  const [appDefaultModel, setAppDefaultModel] = useState<string | null>(null);
  // The host app serving this chat (id `<cluster>-<env>-<app>` + name), from appInfo(). Offered by
  // AppsPicker as the pinned "This app" one-click connect row so any user — not just admins who can
  // browse the Studio list — can connect the agent to the app they're in. Null until appInfo resolves.
  const [currentApp, setCurrentApp] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const info = await transport.appInfo();
        if (!cancelled) {
          setAppDefaultEffort((info?.defaultLlmEffort as string) || DEFAULT_EFFORT);
          setAppDefaultModel((info?.defaultLlmModel as string) || '');
          const cluster = (info?.clusterId as string) || '';
          const env = (info?.envName as string) || '';
          const app = (info?.appName as string) || '';
          // Compose the host app's `<cluster>-<env>-<app>` id (the shape configureApp / the manual
          // input expect) so AppsPicker can offer "This app" without the admin-gated listEnvApps.
          if (cluster && env && app) setCurrentApp({ id: `${cluster}-${env}-${app}`, name: app });
        }
      } catch {
        if (!cancelled) {
          setAppDefaultEffort(DEFAULT_EFFORT);
          setAppDefaultModel('');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // Seed selectedModel once both signals are ready: the app-wide default resolved (appDefaultModel
  // != null, incl. '') AND the catalog loaded (defaultModel set). Split from the catalog effect so
  // the app-default-vs-pod-default choice can't race the appInfo fetch. `prev ||` keeps any pick the
  // user or session row already made. Precedence: session/user → chat current → app default (incl.
  // 'auto') → pod default.
  // Scope note: the app default seeds the FIRST model selection in this tab; `resetPerSessionState`
  // intentionally does NOT clear `selectedModel`, so a later "+ New chat" keeps the user's last pick
  // rather than snapping back to the org default (a mid-session reset would fight the user). The org
  // default therefore governs the initial state, not every new chat — by design.
  useEffect(() => {
    // Once the session's own hydrate has resolved, it already set the authoritative value directly
    // (restored override, or an explicit clear on a genuine reset-to-default) — stop re-deriving here,
    // or a stale pod `currentModel` could silently refill selectedModel right after that clear.
    if (modelHydrated) return;
    if (appDefaultModel === null) return; // app default still pending
    if (!defaultModel && !currentModel && !sessionModel) return; // no signal yet
    // Precedence: user's live pick (prev) → the session's own frozen model (incl. 'auto', so an
    // Auto-agent chat opens on Auto — authoritative, not raced by the pod's currentModel) → the
    // pod's last-used concrete model → the app-wide admin default → the pod default.
    setSelectedModel((prev) => prev || sessionModel || currentModel || appDefaultModel || defaultModel || '');
  }, [appDefaultModel, currentModel, defaultModel, sessionModel, modelHydrated]);
  // Effective effort = the pinned value, else inherit: 'auto' on the auto model (let auto mode pick),
  // else the admin default — CLAMPED to the selected model's real variant set (e.g. Haiku high/max).
  // Derived every render from current state, so switching model re-derives with no race / stale seed.
  const _effortScale = (() => {
    const v = models.find((m) => m.id === selectedModel)?.variants;
    return v && v.length ? v : [...DEFAULT_EFFORT_LEVELS];
  })();
  // Empty string means "inherit" too (some callers clear via ''), coalesced to null.
  const _pin = pinnedEffort || null;
  const _rawEffort = _pin ?? (selectedModel === 'auto' ? 'auto' : (appDefaultEffort ?? DEFAULT_EFFORT));
  const effectiveEffort = _rawEffort === 'auto' ? 'auto' : clampToScale(_rawEffort, _effortScale);
  // What rides the /query body: the pinned/effective value, or 'auto' for an unpinned auto chat;
  // omitted (agent falls back to the pod default) for an unpinned concrete-model chat.
  const effortToSend = _pin != null ? effectiveEffort : selectedModel === 'auto' ? 'auto' : '';
  // Pin a user-chosen level (or 'auto'); '' clears the pin back to inherit.
  const handlePinEffort = useCallback((v: string) => setPinnedEffort(v || null), []);
  const [pendingFiles, setPendingFiles] = useState<{ id: string; file: File }[]>([]);
  // Attachment upload progress for the in-flight send. `null` = no upload running;
  // a snapshot drives the composer's progress indicator (total === 0 → indeterminate).
  // Cleared once the agent's first response frame lands or the turn ends/errors.
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  // Agent preselected by the agent-detail "Chat with agent" entry. A def id arriving via
  // router location state (see initBlankChat) overrides this initial value; it isn't leaked
  // into the address bar/history/logs. Seeds only the initial pending-chat selection; the
  // in-chat AgentPicker (when allowAgentSwitch is on) can still change it.
  const [selectedAgentDefId, setSelectedAgentDefId] = useState<string | null>(agentDefId);
  // `undefined` = locked label not yet known (session info still loading). `null` =
  // known to be the default agent. String = the bound agent's name at create time.
  // Tri-state avoids the "C3 Agent" flicker between session navigations / reload.
  const [lockedAgentName, setLockedAgentName] = useState<string | null | undefined>(undefined);
  // Frozen read-only verdict for the loaded chat (from getSession). Drives the header badge; the
  // actual enforcement is independent (token proxy). Only meaningful once a chat exists.
  const [lockedReadOnly, setLockedReadOnly] = useState(false);
  // Committed chat's agent definition id, derived from the session's agentRef (`<defId>-<version>`)
  // by stripping the trailing version. Used to scope the composer's MCP menu to this chat's agent.
  const [lockedAgentDefId, setLockedAgentDefId] = useState<string | null>(null);
  // Display name for the pinned agent shown in the header when switching is off and no chat is
  // loaded. The header picker is `locked` in that case (static label, no fetch of its own), so
  // resolve the real name here. `null` = not yet resolved → the render falls back to the id string
  // (never a skeleton). Only fetched in exactly the pinned-new-chat case.
  const [pinnedAgentName, setPinnedAgentName] = useState<string | null>(null);
  // Fail closed until getSession returns both per-chat learning gates. This keeps the contextual
  // receipt behind the exact same admin/user/agent/session cascade as capture and review creation.
  const [lockedLearningAgentEnabled, setLockedLearningAgentEnabled] = useState(false);
  const [lockedLearningOptOut, setLockedLearningOptOut] = useState(true);
  const [learningReceiptPollUntilMs, setLearningReceiptPollUntilMs] = useState(0);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  const learningReceiptEnabled =
    showHostNavLinks &&
    skillImprovementLearningEnabled &&
    lockedLearningAgentEnabled &&
    !lockedLearningOptOut &&
    typeof transport.listMyAutoSkills === 'function' &&
    !!sessionId;
  const noteLearningReviewQueued = useCallback((msg: ChatMessage) => {
    if (msg.kind !== 'STEP_FINISH' || msg.data?.learningReviewQueued !== true) return;
    const until = Date.now() + 10 * 60 * 1000;
    setLearningReceiptPollUntilMs((current) => Math.max(current, until));
  }, []);
  const autoSkillsQuery = useQuery<SkillRow[]>({
    queryKey: chatQueryKeys.myAutoSkills,
    queryFn: () => transport.listMyAutoSkills?.() || Promise.resolve([]),
    // Keep eligibility stable. Toggling `enabled` for ordinary streams or tab visibility can
    // make TanStack refetch stale data even when no learning signal opened a polling window.
    enabled: learningReceiptEnabled,
    refetchInterval: (query) => {
      const remainingMs = learningReceiptPollUntilMs - Date.now();
      if (!learningReceiptEnabled || !pageVisible || isStreaming || remainingMs <= 30_000) {
        return false;
      }
      if (selectSessionLearningProposals(query.state.data || [], sessionId || '').length > 0) return false;
      return 30_000;
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 5_000,
  });
  const learningProposals = useMemo(() => {
    if (!sessionId || !learningReceiptEnabled) return [];
    return selectSessionLearningProposals(autoSkillsQuery.data || [], sessionId);
  }, [autoSkillsQuery.data, learningReceiptEnabled, sessionId]);
  const learningProposal = learningProposals[0] || null;
  const [agentPickerRefreshKey, setAgentPickerRefreshKey] = useState(0);
  // null = not yet resolved (picker still loading / locked). true/false once the
  // unlocked agent list loads. Gates the composer when no Definition exists.
  const [agentsAvailable, setAgentsAvailable] = useState<boolean | null>(null);
  /** Turn currently receiving NDJSON chunks */
  const [activeStreamTurnId, setActiveStreamTurnId] = useState<string | null>(null);
  /** Most recently ingested stream message id — only that tail step stays auto-expanded while streaming */
  const [lastStreamMessageId, setLastStreamMessageId] = useState<string | null>(null);
  const pendingRetryPromptRef = useRef<string | null>(null);
  /** Files to resend after stale-query resume (same turn). */
  const pendingRetryFilesRef = useRef<File[] | null>(null);
  /** Retry payload per ERROR message id: the prompt + in-memory files that produced the failed
   *  turn, so the message-error Retry control can resend the exact same message. Keyed by the
   *  (stable) error id, not the user-message id, which mergeFrame re-keys on server echo. */
  const retryPayloadRef = useRef<Map<string, { prompt: string; files?: File[] }>>(new Map());
  // MCP auth-expired banner dedup (see mcpAuthExpiredFrames): tracks, per session, which companion
  // frames the user dismissed/reconnected so their replay (reconnect re-read / re-hydrate) stays
  // suppressed while a genuinely new expiry still surfaces. A ref, not state — mutated in the
  // handler, never itself drives a render (the visible-key state does).
  const authExpiredDedupRef = useRef<AuthExpiredDedup>(makeAuthExpiredDedup());
  // Same discipline for the cross-cluster Connect banner: dedup by companion-frame id so a
  // dismissed/connected prompt's replay stays suppressed while a genuinely new one surfaces.
  const crossClusterAuthDedupRef = useRef<CrossClusterAuthDedup>(makeCrossClusterAuthDedup());
  // appIds whose Connect banner came from a HISTORY replay (not a live frame). Only these are eligible
  // for the bound-valid reconcile below: reopening a chat re-plays a resolved auth frame with a fresh
  // dedup, so it must be suppressed once the app is bound — but a LIVE mid-task 401 must always surface
  // (the registry snapshot may still list the app as bound with a now-expired token).
  const hydratedAuthAppIdsRef = useRef<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Set by ChatColumn: focus() refocuses the live composer (plain textarea or rich editor) and
  // richMode reports whether the current draft is being composed in rich mode. Lets the page
  // refocus after a send regardless of composer view, and tag rich-composed messages for markdown
  // rendering — without lifting the composer-view state out of ChatColumn.
  const composerBridgeRef = useRef<{ focus: () => void; richMode: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Imperative handle for scrollTop writes + a state mirror so the listener effect
  // re-binds when ChatColumn mounts late (hashless /chat landing → redirect to #id
  // never remounts ChatPage, so a mount-only [] effect would keep a null ref forever).
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null);
  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setScrollNode(node);
  }, []);
  /** Tracks last observed scrollTop so direction detection stays correct after
   *  programmatic snaps that don't always fire a 'scroll' event. */
  const scrollLastTopRef = useRef(0);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const loadingOlderRef = useRef(false);
  const prependPrevHeightRef = useRef<number | null>(null);
  const userScrolledRef = useRef(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  // Wall-clock anchor for the provisioning loader's deterministic step stream. Anchored here (not
  // in AgentSpinUp) so progress keeps advancing across the brief overlay swaps below instead of
  // resetting to step 0 each time a different loader branch renders. Reset to 0 once no loader shows.
  const provisionStartRef = useRef(0);
  /** Names to merge onto the next streamed USER bubble (UI-only attachments). */
  const pendingUserAttachmentsRef = useRef<string[][]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<ChatMessage | null>(null);
  const [previewFile, setPreviewFile] = useState<{ path: string; url: string } | null>(null);

  const speech = useSpeechRecognition();
  const { isListening: speechIsListening, stop: speechStop } = speech;

  const voiceAccumulatorRef = useRef('');

  useEffect(() => {
    if (speechIsListening) {
      voiceAccumulatorRef.current = '';
    }
  }, [speechIsListening]);

  useEffect(() => {
    if (speech.finalTranscript) {
      voiceAccumulatorRef.current = voiceAccumulatorRef.current
        ? `${voiceAccumulatorRef.current} ${speech.finalTranscript}`
        : speech.finalTranscript;
      setInput(voiceAccumulatorRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.finalCount]);

  // ── Multi-session state (PLAT-146578) ─────────────────────────────────────
  // The URL hash is now the chat-session id; the service (Service.id) is a separate
  // field on the row. Lifecycle ops (stop/terminate/resume) act on the service, so we
  // keep serviceId in state and pull it from transport.getSession().serviceId. Pending mode
  // (/chat with no hash) reuses serviceId from the previous session so the next
  // send can attach to the same service via addSession.
  const [serviceId, setServiceId] = useState(() => localStorage.getItem(LAST_SERVICE_ID_KEY) || '');
  // A committed chat must not pair its new session id with the previous chat's base URL during the
  // render before hydrate effects clear old state. The session stamp turns that intermediate state
  // into a closed catalog gate instead of issuing a cross-session model request.
  const [loadedSessionInfoSid, setLoadedSessionInfoSid] = useState('');
  const activeModelScope = sessionId || serviceId;
  const scopedPodModels = podModelsScope === activeModelScope ? podModels : null;
  // Unlike the mount read, post-turn catalog reads cannot be aborted. Update this ref during render
  // so an old session's late response can be rejected before it mutates any page-wide catalog state.
  const activeModelScopeRef = useRef('');
  const modelCatalogRequestEpochRef = useRef(0);
  if (activeModelScopeRef.current !== activeModelScope) {
    activeModelScopeRef.current = activeModelScope;
    // Invalidate an outstanding response even if navigation later returns to the same chat before
    // that response settles (A -> B -> A). Scope equality alone cannot distinguish that case.
    modelCatalogRequestEpochRef.current += 1;
  }
  const beginPodCatalogRequest = useCallback(() => {
    modelCatalogRequestEpochRef.current += 1;
    return modelCatalogRequestEpochRef.current;
  }, []);
  // Every successful pod-catalog read has the same ownership semantics: it replaces this session's
  // pod truth and resolves only the catalog-owned error source. Keep that transition centralized so
  // mount, question-response, and ordinary-turn refreshes cannot leave different recovery state.
  // The epoch makes the newest-started read authoritative during an in-place routing cutover: a
  // slow startup-direct response cannot overwrite a newer strict LiteLLM catalog.
  const applyPodCatalog = useCallback((info: ModelsResponse, scope: string, requestEpoch: number) => {
    if (!scope || scope !== activeModelScopeRef.current || requestEpoch !== modelCatalogRequestEpochRef.current) {
      return;
    }
    setModelCatalogError('');
    setPodModels(info);
    setPodModelsScope(scope);
    setDefaultModel(info.defaultModel);
    setCurrentModel(info.currentModel);
  }, []);
  const applyPodCatalogError = useCallback((message: string, scope: string, requestEpoch: number) => {
    if (!scope || scope !== activeModelScopeRef.current || requestEpoch !== modelCatalogRequestEpochRef.current) {
      return;
    }
    setModelCatalogError(message);
  }, []);
  // App-level provisioning controller: owns the loading screen + reserve-on-load. ChatPage
  // adopts the pod it provisions for pending mode (no hash, no prior serviceId).
  const session = useSession();
  // Poll for a non-recoverable startup failure ONLY while the spinner is up (provisioning /
  // unhealthy) — never from the terminal "Couldn't start your agent" screen. Lifted to the page so
  // the reference id captured while the pod is still failing (e.g. image-pull) survives into the
  // terminal screen, where the failing pod is already gone and can no longer be re-read.
  const [waitingForModels, setWaitingForModels] = useState(false);
  const nonRecoverableStatus = useNonRecoverableStatus(
    (session.status === 'provisioning' || session.status === 'unhealthy') && !session.failed,
    session.provisionEpoch,
    undefined,
    undefined,
    setWaitingForModels
  );
  // Polled service-health → cause-honest composer LLM guard
  // (`starting` / `unavailable` / `empty` vs fail-open). Provisioning precheck uses the same
  // `llmBlockReason` helper so predicates cannot drift.
  const { data: serviceHealthData } = useServiceHealth();
  const llmBlockReason = deriveLlmBlockReason(serviceHealthData);
  const llmBlocked = isLlmBlocked(llmBlockReason);
  // A startup-direct pod is its own routing authority until the LiteLLM cutover handshake
  // completes. GET /models is filtered through the pod's live transport admission policy, so a
  // non-LiteLLM row from a catalog with no proxy state is positive evidence that at least one
  // direct route is usable. Keep the model controls available in that degraded window; Auto and
  // every unproven fixed route remain independently fenced below.
  const startupDirectModelsAvailable = !!(
    scopedPodModels &&
    !scopedPodModels.catalog &&
    scopedPodModels.models.some(isDirectModelRoute)
  );
  const effectiveLlmBlockReason = startupDirectModelsAvailable ? 'none' : llmBlockReason;
  // Soften starting copy after the same long-wait threshold as AgentSpinUp (~p90 cold-start).
  const [llmStartingLongWait, setLlmStartingLongWait] = useState(false);
  useEffect(() => {
    if (llmBlockReason !== 'starting') {
      setLlmStartingLongWait(false);
      return;
    }
    setLlmStartingLongWait(false);
    const id = window.setTimeout(() => setLlmStartingLongWait(true), DEFAULT_LONG_WAIT_THRESHOLD_MS);
    return () => window.clearTimeout(id);
  }, [llmBlockReason]);
  const [sessionTitle, setSessionTitle] = useState('');
  /** True once the /chat landing redirect has confirmed there are no chats to
   *  resume — flips the render from the landing loader to the blank new-chat UI.
   *  Reset whenever we're on a committed chat so a later hashless /chat re-resolves. */
  const [landingResolvedEmpty, setLandingResolvedEmpty] = useState(false);
  /** True while ChatPage deferred a STOPPED/messages-404 (or stale-agent) recovery to
   *  SessionProvider. Stays true through provider-ready → re-hydrate so the overlay does not
   *  uncover an empty chat mid-handoff. Mutate ONLY via clearDeferredAwait / beginDeferredAwait
   *  so every exit path clears the overlay gate (stuck-spinner inverse of the flip bug). */
  const [awaitingProviderReady, setAwaitingProviderReady] = useState(false);
  /** Which deferred recovery to finish once the provider is ready. */
  const deferredResumeKindRef = useRef<'messages404' | 'stale' | null>(null);
  /** Guards the deferred finish effect so ready→recover→hydrate runs once per await cycle. */
  const deferredHydrateKickedRef = useRef(false);
  /** Session id the defer was raised for — finish effect must not hydrate a different chat after
   *  a sidebar switch mid-wait. */
  const deferredForSessionIdRef = useRef<string | null>(null);
  /** Sole owner for dropping the deferred-await gate + companion refs. */
  const clearDeferredAwait = useCallback(() => {
    setAwaitingProviderReady(false);
    deferredResumeKindRef.current = null;
    deferredHydrateKickedRef.current = false;
    deferredForSessionIdRef.current = null;
  }, []);
  /** Raise the deferred-await gate for a session. `hydrateKicked` skips the finish effect's
   *  recover step (caller already recovered and only needs hydrateNonce). */
  const beginDeferredAwait = useCallback(
    (kind: 'messages404' | 'stale', forSessionId: string, opts?: { hydrateKicked?: boolean }) => {
      deferredResumeKindRef.current = kind;
      deferredHydrateKickedRef.current = opts?.hydrateKicked ?? false;
      deferredForSessionIdRef.current = forSessionId;
      setAwaitingProviderReady(true);
    },
    []
  );
  /** Last sessionId the hash-path hydrate effect ran for. Same-session re-runs (hydrateNonce after
   *  recover) must soft-reset — full resetPerSessionState would clear awaitingProviderReady and
   *  drop the overlay before history lands. Cleared when leaving committed chat (no hash). */
  const lastHashHydrateSidRef = useRef<string | null>(null);
  /** Latches the last non-null provisionMode while the blocking overlay is up so the title does
   *  not flip "Spinning up" → "Resuming" when the provider clears mode on ready. */
  const [stickyProvisionMode, setStickyProvisionMode] = useState<'resuming' | 'starting' | null>(null);
  const blankChatInitedRef = useRef(false);
  const autoSentRef = useRef(false);
  // Last (sessionId:model) pair persisted via updateSessionModel — avoids re-persisting
  // the same choice on every turn.
  const modelPersistedRef = useRef<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('nexus.sidebarCollapsed') === '1';
  });
  // Collapsed → tree + any open file viewer hide and chat reclaims the width.
  // The file path stays in state so re-expanding restores it.
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(() => {
    // Default to collapsed; only stay expanded if the user explicitly opened it before.
    return localStorage.getItem('nexus.workspaceCollapsed') !== '0';
  });
  // Defer the workspace chunk until first open, then keep it mounted across collapse/expand so
  // panel-local scope, tree, and drag state survive while the panel is hidden.
  const [workspaceHasOpened, setWorkspaceHasOpened] = useState(() => !workspaceCollapsed);
  const [sidebarWidth, setSidebarWidth] = useState(() => readPanelWidth('nexus.sidebarWidth'));
  const [workspaceWidth, setWorkspaceWidth] = useState(() => readPanelWidth('nexus.workspaceWidth'));
  const [appPanelRequestedWidth, setAppPanelRequestedWidth] = useState(readAppPanelWidth);
  const [appPanelAvailableWidth, setAppPanelAvailableWidth] = useState(Number.POSITIVE_INFINITY);
  const appPanelRef = useRef<HTMLDivElement>(null);
  const appPanelWidth = clampAppPanelWidth(appPanelRequestedWidth, appPanelAvailableWidth);
  // True only while a panel splitter is being dragged — suppresses the width transition and text
  // selection so the drag tracks the cursor instead of lagging/animating.
  const [panelResizing, setPanelResizing] = useState(false);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  /** Optimistic sidebar row for the just-created session — rendered the instant
   *  addSession resolves so the user sees the new chat before the next
   *  listSessionsForService poll lands. Cleared on a short timeout. */
  const [optimisticSidebarSession, setOptimisticSidebarSession] = useState<{
    id: string;
    createdAt: string;
  } | null>(null);
  /** Mirror of serviceId for the routing effect — reading serviceId state in deps would
   *  tear down the hydration effect on every serviceId change. Initialized from the
   *  same localStorage breadcrumb as serviceId so /chat (no hash) on a fresh tab
   *  lands in pending mode instead of bouncing before the ref-sync effect runs. */
  const serviceIdRef = useRef(localStorage.getItem(LAST_SERVICE_ID_KEY) || '');
  /** True only once `adoptCreatedSession` has actually re-homed this chat onto a
   *  Definition-selected profile. Distinguishes that case from serviceIdRef merely
   *  holding its initial localStorage seed, which the pending-mode effect below must
   *  still be allowed to override when the provider reserves a fresh pod (reaped-pod
   *  recovery) — see the guard using this flag. */
  const reHomedRef = useRef(false);
  // Adopt the pod the SessionProvider owns. In pending mode (no chat hash) the provider is
  // authoritative: it has already reconciled liveness via myService()/reserve(), so we adopt
  // its serviceId + agentBaseUrl together — including overriding a STALE localStorage breadcrumb
  // that points at a reaped pod (which would otherwise make the first send fail with
  // "Service not found", or listModels against a dead base and bounce re-provision). A committed
  // chat owns its pod via getSession, but if the provider silently reprovisions the SAME
  // serviceId (reportUnhealthy bounce), resync agentBaseUrl so listModels/sends don't keep
  // hitting the dead base until the next failed request.
  useEffect(() => {
    if (!session.serviceId) return;
    if (sessionId) {
      if (serviceIdRef.current === session.serviceId && session.agentBaseUrl && session.agentBaseUrl !== agentBaseUrl) {
        setAgentBaseUrl(session.agentBaseUrl);
      }
      return;
    }
    // Pending mode: the provider is the default source of truth, but createSession can
    // re-home this chat onto a different profile. Once adoptCreatedSession has actually
    // re-homed this chat, do not copy the stale default-profile pod back over it. Gate on
    // reHomedRef rather than a raw ref comparison — serviceIdRef can also just hold its
    // initial localStorage seed (never adopted), and a reaped-pod recovery needs that seed
    // overridden with the provider's freshly reserved serviceId.
    if (reHomedRef.current && serviceIdRef.current !== session.serviceId) return;
    const sameId = serviceIdRef.current === session.serviceId;
    const sameBase = !session.agentBaseUrl || agentBaseUrl === session.agentBaseUrl;
    if (sameId && sameBase) return;
    serviceIdRef.current = session.serviceId;
    setServiceId(session.serviceId);
    if (session.agentBaseUrl) setAgentBaseUrl(session.agentBaseUrl);
  }, [session.serviceId, session.agentBaseUrl, sessionId, agentBaseUrl, setAgentBaseUrl]);
  /** Edge detector for "stream just ended" used by the title-gen trigger effect. */
  const wasStreamingRef = useRef(false);
  /** Synchronous re-entrance guard for sendMessage. State-based isStreaming guard
   *  doesn't catch a fast double-Enter during the addSession await in
   *  pending mode — refs are read/written synchronously and short-circuit it. */
  const sendInFlightRef = useRef(false);
  /** Auto-resume effect retry counter — capped at MAX_AUTO_RESUME_ATTEMPTS to
   *  prevent a tight loop against an unrecoverable service (e.g. TERMINATED).
   *  Reset to 0 whenever `modal` returns to null. */
  const autoResumeAttemptsRef = useRef(0);
  /** Title-gen: in-flight guard + assistant-turn marker for retitle interval. */
  const titleGenInFlightRef = useRef(false);
  const lastTitleAtTurnRef = useRef(0);
  /** The `Nexus.Agent.Session` id that sendMessage just promoted pending → committed.
   *  The routing effect reads it to recognize the promotion's hash change as "the
   *  session we're mid-send on" (keep optimistic bubble + in-flight stream) rather
   *  than a navigation INTO a different session (which resets per-session state). */
  const pendingPromotionSidRef = useRef<string | null>(null);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('nexus.sidebarCollapsed', next ? '1' : '0');
      return next;
    });
  }, []);

  const toggleWorkspace = useCallback(() => {
    setWorkspaceCollapsed((prev) => {
      const next = !prev;
      if (!next) setWorkspaceHasOpened(true);
      localStorage.setItem('nexus.workspaceCollapsed', next ? '1' : '0');
      return next;
    });
  }, []);

  const startSidebarResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setPanelResizing(true);
      const startX = e.clientX;
      const startW = sidebarWidth;
      let latest = startW;
      const onMove = (ev: MouseEvent) => {
        // Drag right → wider sidebar.
        latest = clampPanelWidth(startW + (ev.clientX - startX));
        setSidebarWidth(latest);
      };
      const onUp = () => {
        setPanelResizing(false);
        localStorage.setItem('nexus.sidebarWidth', String(latest));
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [sidebarWidth]
  );

  const startWorkspaceResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setPanelResizing(true);
      const startX = e.clientX;
      const startW = workspaceWidth;
      let latest = startW;
      const onMove = (ev: MouseEvent) => {
        // Workspace is on the right — drag left (clientX decreasing) → wider.
        latest = clampPanelWidth(startW + (startX - ev.clientX));
        setWorkspaceWidth(latest);
      };
      const onUp = () => {
        setPanelResizing(false);
        localStorage.setItem('nexus.workspaceWidth', String(latest));
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [workspaceWidth]
  );

  const startAppPanelResize = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setPanelResizing(true);
      const startX = e.clientX;
      const startW = appPanelWidth;
      let latest = startW;
      const onMove = (ev: PointerEvent) => {
        // App panel is on the right — drag left (clientX decreasing) → wider.
        latest = clampAppPanelWidth(startW + (startX - ev.clientX), appPanelAvailableWidth);
        setAppPanelRequestedWidth(latest);
      };
      const onUp = () => {
        setPanelResizing(false);
        persistAppPanelWidth(latest);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [appPanelAvailableWidth, appPanelWidth]
  );

  const resizeAppPanelWithKeyboard = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      let next: number | null = null;
      if (e.key === 'ArrowLeft') next = appPanelWidth + 32;
      if (e.key === 'ArrowRight') next = appPanelWidth - 32;
      if (e.key === 'Home') next = 320;
      if (e.key === 'End') next = Number.isFinite(appPanelAvailableWidth) ? Number.POSITIVE_INFINITY : appPanelWidth;
      if (next === null) return;
      e.preventDefault();
      const width = clampAppPanelWidth(next, appPanelAvailableWidth);
      setAppPanelRequestedWidth(width);
      persistAppPanelWidth(width);
    },
    [appPanelAvailableWidth, appPanelWidth]
  );

  const estimatedConversationTokens = useMemo(() => estimateConversationTokens(messages), [messages]);
  const messageChunks = useMemo(() => chunkMessages(bindToolDescriptions(messages)), [messages]);
  // MCP Apps rendering (live app-server + ui:// resource apps) is gated by the `mcpAppsEnabled`
  // prop — the host derives it from the `nexus-mcp-apps` PostHog flag (Client-side eval, fail
  // closed) and passes it in, so this package never imports the analytics singleton. When false,
  // neither InlineAppServer nor InlineResourceApp mounts and no MCP token is fetched. HTML artifact
  // rendering is a separate path and is unaffected.
  const serverAppEvents = useMemo(
    () => (mcpAppsEnabled ? findServerAppEvents(messages) : []),
    [messages, mcpAppsEnabled]
  );
  const serverApps = useMemo(() => {
    const latest = new Map<string, (typeof serverAppEvents)[number]>();
    serverAppEvents.forEach((event) => latest.set(event.instanceId, event));
    return [...latest.values()];
  }, [serverAppEvents]);
  const [openApps, dispatchOpenApps] = useReducer(appPanelReducer, EMPTY_APP_PANEL_STATE);
  const [resourceInlineAnchors, setResourceInlineAnchors] = useState<Record<string, HTMLDivElement | null>>({});
  const [resourcePanelAnchors, setResourcePanelAnchors] = useState<Record<string, HTMLDivElement | null>>({});
  const [serverInlineAnchors, setServerInlineAnchors] = useState<Record<string, HTMLDivElement | null>>({});
  const [serverPanelAnchors, setServerPanelAnchors] = useState<Record<string, HTMLDivElement | null>>({});
  const [dismissedServerAppIds, setDismissedServerAppIds] = useState<Set<string>>(() => new Set());
  const [dismissedResourceAppKeys, setDismissedResourceAppKeys] = useState<Set<string>>(() => new Set());
  const processedAppEventsRef = useRef(new Set<string>());
  const processedResourcePresentationsRef = useRef(new Set<string>());

  useLayoutEffect(() => {
    processedAppEventsRef.current.clear();
    processedResourcePresentationsRef.current.clear();
    setDismissedServerAppIds(new Set());
    setDismissedResourceAppKeys(new Set());
    dispatchOpenApps({ type: 'reset' });
  }, [sessionId, mcpAppsEnabled]);

  useLayoutEffect(() => {
    if (!mcpAppsEnabled) return;
    serverAppEvents.forEach((event) => {
      const eventKey = `${event.sourceMessageId}:${event.instanceId}:${event.port}:${event.queryString}:${event.requestedDisplayMode || ''}`;
      if (processedAppEventsRef.current.has(eventKey)) return;
      processedAppEventsRef.current.add(eventKey);
      setDismissedServerAppIds((current) => {
        if (!current.has(event.instanceId)) return current;
        const next = new Set(current);
        next.delete(event.instanceId);
        return next;
      });
      if (event.requestedDisplayMode === 'inline') {
        dispatchOpenApps({ type: 'close', instanceId: event.instanceId });
      } else {
        dispatchOpenApps({ type: 'register', app: serverDescriptor(event) });
      }
    });
  }, [mcpAppsEnabled, serverAppEvents]);

  const hasOpenApps = openApps.tabOrder.length > 0;
  useLayoutEffect(() => {
    const panel = appPanelRef.current;
    if (!hasOpenApps || !panel) return;
    const measure = () => {
      const chat = panel.previousElementSibling;
      const available = panel.getBoundingClientRect().width + (chat?.getBoundingClientRect().width ?? 0);
      if (available > 0) setAppPanelAvailableWidth(available);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    if (panel.parentElement) observer.observe(panel.parentElement);
    const chat = panel.previousElementSibling;
    if (chat) observer.observe(chat);
    return () => observer.disconnect();
  }, [hasOpenApps]);
  // Fetch the MCP token whenever the feature is on (not only once an app is detected): the
  // declaration-based detection below needs it to read the aggregated tools/list *before* it can
  // know a UI-bearing external tool was called.
  const mcpToken = useMcpToken(mcpAppsEnabled && sessionId ? sessionId : null);
  // Map of toolName → declared ui:// resource for external MCP-App tools (standard servers declare
  // their UI on the tool, not in the result — see useServerToolUiMap / findResourceAppFromToolUi).
  const serverToolUiMap = useServerToolUiMap(agentBaseUrl, sessionId, mcpToken, mcpAppsEnabled);
  const resourceApps = useMemo(() => {
    if (!mcpAppsEnabled) return [];
    const merged = new Map<string, ResourceAppInfo>();
    findResourceApps(messages).forEach((app) => merged.set(app.uri, app));
    findResourceAppsFromToolUi(messages, serverToolUiMap).forEach((app) => merged.set(app.uri, app));
    return [...merged.values()];
  }, [messages, mcpAppsEnabled, serverToolUiMap]);

  const setResourceAnchor = useCallback((location: 'inline' | 'panel', uri: string, node: HTMLDivElement | null) => {
    const setter = location === 'inline' ? setResourceInlineAnchors : setResourcePanelAnchors;
    setter((current) => (current[uri] === node ? current : { ...current, [uri]: node }));
  }, []);

  const setServerAnchor = useCallback(
    (location: 'inline' | 'panel', instanceId: string, node: HTMLDivElement | null) => {
      const setter = location === 'inline' ? setServerInlineAnchors : setServerPanelAnchors;
      setter((current) => (current[instanceId] === node ? current : { ...current, [instanceId]: node }));
    },
    []
  );

  const resourceTitle = useCallback((uri: string) => {
    const encoded = uri.replace(/^ui:\/\//, '').split(/[/?#]/)[0] || 'App';
    let value = encoded;
    try {
      value = decodeURIComponent(encoded);
    } catch {
      // A resource URI is tool-controlled input. Keep malformed percent sequences readable rather
      // than letting decodeURIComponent throw during render and take down the whole chat page.
    }
    return value
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }, []);

  const resourceDescriptor = useCallback(
    (app: ResourceAppInfo): McpAppDescriptor => ({
      instanceId: `resource:${app.uri}`,
      title: resourceTitle(app.uri),
      kind: 'resource',
      sourceMessageId: app.sourceMessageId || app.uri,
      resourceUri: app.uri,
    }),
    [resourceTitle]
  );

  useLayoutEffect(() => {
    if (!mcpAppsEnabled) return;
    resourceApps.forEach((app) => {
      if (!app.requestedDisplayMode) return;
      const eventKey = `${app.sourceMessageId || ''}:${app.uri}:${app.requestedDisplayMode}`;
      if (processedResourcePresentationsRef.current.has(eventKey)) return;
      processedResourcePresentationsRef.current.add(eventKey);
      if (app.requestedDisplayMode === 'pip') {
        dispatchOpenApps({ type: 'register', app: resourceDescriptor(app) });
      } else {
        dispatchOpenApps({ type: 'close', instanceId: resourceDescriptor(app).instanceId });
      }
    });
  }, [mcpAppsEnabled, resourceApps, resourceDescriptor]);

  // Display-mode state for MCP Apps: tracks which app is inline/fullscreen/pip and arbitrates
  // contention (single pip slot, exclusive fullscreen).
  const displayModeManager = useDisplayModeManager();
  const closeMcpApp = useCallback(
    (instanceId: string) => {
      const app = openApps.apps.get(instanceId);
      if (app?.kind === 'resource' && app.resourceUri) {
        displayModeManager.requestDisplayMode(app.resourceUri, 'inline');
        displayModeManager.removeApp(app.resourceUri);
      } else {
        displayModeManager.removeApp(instanceId);
        setDismissedServerAppIds((current) => new Set(current).add(instanceId));
      }
      dispatchOpenApps({ type: 'close', instanceId });
    },
    [displayModeManager, openApps.apps]
  );
  const removeUnavailableResourceApp = useCallback(
    (app: ResourceAppInfo) => {
      const descriptor = resourceDescriptor(app);
      displayModeManager.removeApp(app.uri);
      setDismissedResourceAppKeys((current) => new Set(current).add(resourceAppInstanceKey(app)));
      dispatchOpenApps({ type: 'close', instanceId: descriptor.instanceId });
    },
    [displayModeManager, resourceDescriptor]
  );
  const visibleResourceApps = resourceApps.filter((app) => !dismissedResourceAppKeys.has(resourceAppInstanceKey(app)));
  const resourceAppNodes = visibleResourceApps.map((app) => ({
    sourceMessageId: app.sourceMessageId,
    node: (
      <ResourceAppAnchor
        key={`resource-anchor:${app.uri}`}
        uri={app.uri}
        location="inline"
        active={!openApps.apps.has(resourceDescriptor(app).instanceId)}
        onMount={setResourceAnchor}
      />
    ),
  }));
  const serverAppNodes = serverApps
    .filter((app) => !dismissedServerAppIds.has(app.instanceId))
    .map((app) => ({
      sourceMessageId: app.sourceMessageId,
      node: (
        <ServerAppAnchor
          key={`server-anchor:${app.instanceId}`}
          instanceId={app.instanceId}
          location="inline"
          active={!openApps.apps.has(app.instanceId)}
          onMount={setServerAnchor}
        />
      ),
    }));
  const mountedInlineAppKeys = [
    ...visibleResourceApps
      .filter((app) => resourceInlineAnchors[app.uri] && !openApps.apps.has(resourceDescriptor(app).instanceId))
      .map((app) => `resource:${app.uri}`),
    ...serverApps
      .filter(
        (app) =>
          !dismissedServerAppIds.has(app.instanceId) &&
          serverInlineAnchors[app.instanceId] &&
          !openApps.apps.has(app.instanceId)
      )
      .map((app) => `server:${app.instanceId}`),
  ].join('|');
  // Composer context gauge: the newest turn-end ctxTok/ctxMax stamp wins (turn-end
  // facts only ride live frames, so this is null after reload until the next turn).
  const contextUsage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.ctxTok && m.ctxMax) return { used: m.ctxTok, max: m.ctxMax };
    }
    return null;
  }, [messages]);

  const handleAttachmentClick = useCallback(
    (fileName: string) => {
      if (!sessionId?.trim()) return;
      setFileViewerPath(null);
      const path = resolveChatAttachmentWorkspacePath(workspaceRootsRef.current, sessionId, fileName);
      setWorkspaceExpandedPaths(expandedPathsForWorkspaceFile(path));
      setWorkspaceSelectedPath(path);
      setWorkspaceTreeRefreshSeq((n) => n + 1);
    },
    [sessionId]
  );

  /** Map a `/data/workspace/...` path to its served file URL, or null if it can't be resolved. */
  const resolveWorkspaceFileUrl = useCallback(
    (path: string, options?: { inline?: boolean }): string | null => {
      if (!agentBaseUrl || !sessionId?.trim()) return null;
      let rel = path.replace(/^\/data\/workspace\//, '');
      if (/\.\.[\\/]/.test(rel)) return null;
      // Bare filename (no directory) — try resolving via the workspace file tree.
      if (!rel.includes('/') && workspaceRootsRef.current) {
        const found = findWorkspaceFileByDisplayName(workspaceRootsRef.current, rel);
        if (found) rel = found;
      }
      return transport.workspaceFileUrl(agentBaseUrl, sessionId, rel, options);
    },
    [agentBaseUrl, sessionId]
  );

  const handleFileClick = useCallback(
    (path: string) => {
      if (!isWorkspacePathExportable(path)) return;
      const inline = /\.(html?|pdf)$/i.test(path);
      const url = resolveWorkspaceFileUrl(path, inline ? { inline: true } : undefined);
      if (!url) return;
      if (/\.(docx?|pptx?|xlsx?)$/i.test(path)) {
        window.open(url, '_blank');
      } else {
        setPreviewFile({ path, url });
      }
    },
    [resolveWorkspaceFileUrl]
  );

  /** Wall-clock duration of the last completed assistant stream, keyed by OpenCode turn id */
  const [thoughtDurationByTurnKey, setThoughtDurationByTurnKey] = useState<Record<string, number>>({});
  /** Same instant as queryStartedAtRef — drives live "Thinking for …" without resetting on child remount */
  const [liveQueryStartedAt, setLiveQueryStartedAt] = useState<number | null>(null);
  /** After a stale `/query`, show static copy while `resumeSession` / session refresh runs (not counted as thinking time). */
  const [isResumingSession, setIsResumingSession] = useState(false);
  // Prefer the provider's serviceId in pending mode so landingResolving turns true in the same
  // render that status flips to ready (avoids a one-frame gap where pageBlocked drops and the
  // hide timer starts before the adopt effect lands).
  const effectiveServiceId = sessionId ? serviceId : session.serviceId || serviceId;
  // Hashless /chat with a known service: the routing effect is deciding whether to resume the
  // most-recent chat (then redirects to /chat#<id>).
  const landingResolving = !sessionId && !!effectiveServiceId && !isNewChatIntent && !landingResolvedEmpty;
  // Single continuous "page not interactive yet" gate. Phase changes inside this set must not
  // uncover the chat (provisioning → landing → modal resume are one blocked stretch).
  // `unknown` is intentionally omitted: a warm ACTIVE myService that takes >250ms must not flash
  // the cold-start overlay; once status becomes provisioning/unhealthy the gate engages.
  const pageBlockedRaw =
    session.status === 'provisioning' ||
    session.status === 'unhealthy' ||
    landingResolving ||
    awaitingProviderReady ||
    modal === 'resumeStaleAgent' ||
    modal === 'sessionClosedMessages404' ||
    (isResumingSession && !sessionId);
  const [showBlockingOverlay, setShowBlockingOverlay] = useState(false);
  /** Wall-clock when pageBlockedRaw first became true this stretch — show-delay is measured from
   *  here so status flips inside the blocked window (e.g. unknown→provisioning) do not restart
   *  the 250ms clock and stretch the blank pre-spinner window. */
  const blockedSinceRef = useRef(0);
  useEffect(() => {
    if (pageBlockedRaw) {
      if (blockedSinceRef.current === 0) blockedSinceRef.current = Date.now();
      // Cancel a pending hide so a brief unblocked gap between phases never clears the overlay
      // or resets the step clock. (Cleanup of the previous effect run clears any hide timer.)
      const immediate =
        session.status === 'unhealthy' ||
        awaitingProviderReady ||
        modal === 'resumeStaleAgent' ||
        modal === 'sessionClosedMessages404' ||
        (isResumingSession && !sessionId);
      if (immediate) {
        if (provisionStartRef.current === 0) provisionStartRef.current = Date.now();
        setShowBlockingOverlay(true);
        return undefined;
      }
      // Already visible — nothing to schedule.
      if (showBlockingOverlay) return undefined;
      const remaining = Math.max(0, PROVISION_OVERLAY_SHOW_DELAY_MS - (Date.now() - blockedSinceRef.current));
      const id = window.setTimeout(() => {
        if (provisionStartRef.current === 0) provisionStartRef.current = Date.now();
        setShowBlockingOverlay(true);
      }, remaining);
      return () => clearTimeout(id);
    }
    blockedSinceRef.current = 0;
    const id = window.setTimeout(() => {
      setShowBlockingOverlay(false);
      provisionStartRef.current = 0;
    }, PROVISION_OVERLAY_HIDE_DELAY_MS);
    return () => clearTimeout(id);
  }, [pageBlockedRaw, session.status, awaitingProviderReady, modal, isResumingSession, sessionId, showBlockingOverlay]);
  // Latch provisionMode off the overlay lifetime (effect, not render) so the title stays stable
  // when the provider clears mode on ready while we are still blocked.
  useEffect(() => {
    if (pageBlockedRaw || showBlockingOverlay) {
      if (session.provisionMode != null) setStickyProvisionMode(session.provisionMode);
      return;
    }
    setStickyProvisionMode(null);
  }, [pageBlockedRaw, showBlockingOverlay, session.provisionMode]);
  const [fileViewerPath, setFileViewerPath] = useState<string | null>(null);
  const [workspaceSelectedPath, setWorkspaceSelectedPath] = useState<string | null>(null);
  /** Which workspace dirs are expanded — lifted so chevron state survives side panel unmount (main file viewer). */
  const [workspaceExpandedPaths, setWorkspaceExpandedPaths] = useState<Set<string>>(
    () => new Set([WORKSPACE_TREE_ROOT_ROW_ID, 'results', 'user-uploads'])
  );
  /** Bumped when an assistant stream finishes so the workspace tree can refetch without resetting expanded dirs. */
  const [workspaceTreeRefreshSeq, setWorkspaceTreeRefreshSeq] = useState(0);
  const prevIsStreamingRef = useRef(false);
  const queryStartedAtRef = useRef<number | null>(null);
  const streamingTurnKeyRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const workspaceRootsRef = useRef<import('../lib/chatApi').WorkspaceTreeNode[] | null>(null);
  const handleWorkspaceRootsChange = useCallback((roots: import('../lib/chatApi').WorkspaceTreeNode[] | null) => {
    // Preserve a successful collapsed-panel prefetch while the lazy panel performs
    // its initial load; its first local roots value is null.
    if (roots !== null || workspaceRootsRef.current === null) {
      workspaceRootsRef.current = roots;
    }
  }, []);
  useEffect(() => {
    // Never resolve a new session's attachment against roots from the previous session.
    workspaceRootsRef.current = null;
  }, [sessionId]);
  // Keep attachment/file path resolution accurate while the collapsed workspace UI chunk remains
  useEffect(() => {
    if (workspaceEnabled) preloadWorkspaceSidePanel();
  }, [workspaceEnabled]);

  // deferred. WorkspaceSidePanel takes over this ref through onRootsChange after its first mount.
  useEffect(() => {
    if (!workspaceEnabled) {
      workspaceRootsRef.current = null;
      return;
    }
    if (workspaceHasOpened) return;
    const workspaceAgentBaseUrl = remoteConversationUrl ? '' : agentBaseUrl;
    if (!workspaceAgentBaseUrl.trim() || !sessionId?.trim()) {
      workspaceRootsRef.current = null;
      return;
    }
    const ac = new AbortController();
    void (async () => {
      for (let attempt = 0; attempt <= 4 && !ac.signal.aborted; attempt += 1) {
        try {
          const data = await transport.fetchWorkspaceTree(workspaceAgentBaseUrl, ac.signal, sessionId, 'session');
          if (!ac.signal.aborted) workspaceRootsRef.current = data.roots;
          return;
        } catch (err) {
          if ((err as Error).name === 'AbortError' || ac.signal.aborted) return;
          // A resumed pod can answer before its files-tree route is rebound. Match the panel's
          // short 404 grace window so collapsed and expanded workspace behavior stay consistent.
          if (!(err instanceof WorkspaceTreeHttpError) || err.status !== 404 || attempt === 4) return;
          await new Promise<void>((resolve) => {
            const onAbort = () => {
              window.clearTimeout(timer);
              resolve();
            };
            const timer = window.setTimeout(() => {
              ac.signal.removeEventListener('abort', onAbort);
              resolve();
            }, 750);
            ac.signal.addEventListener('abort', onAbort, { once: true });
          });
        }
      }
    })();
    return () => ac.abort();
  }, [
    agentBaseUrl,
    remoteConversationUrl,
    sessionId,
    transport,
    workspaceEnabled,
    workspaceHasOpened,
    workspaceTreeRefreshSeq,
  ]);
  // Tracks the latest sessionId so an in-flight /apps fetch can self-cancel
  // its commit when the user has already moved to a different chat by the
  // time the response arrives.
  const latestSessionIdRef = useRef<string | undefined>(sessionId);
  useEffect(() => {
    latestSessionIdRef.current = sessionId;
  }, [sessionId]);

  const refreshConnectedApps = useCallback(async () => {
    // Both backends expose the chat-scoped registry at `${agentBaseUrl}/apps`: the in-pod agent
    // serves it for opencode/openhands, and the rproxy serves it directly for openhands-cloud
    // (no agent container). c3-connect writes the same registry in every case, so the dropdown
    // must query it for remote sessions too — not short-circuit on remoteConversationUrl.
    if (!agentBaseUrl) return;
    if (!sessionId) {
      // Pending "+ New chat" state — no Session row exists yet, so no
      // chat-scoped registry to read. Showing the service-wide registry here
      // (the landing app from reserve()) would mislead the user into
      // thinking their new chat already has apps configured.
      setConnectedApps({});
      setLoadedAppsSessionId('');
      return;
    }
    const fetchedFor = sessionId;
    try {
      const apps = await transport.listConnectedApps(agentBaseUrl, sessionId);
      // Drop late responses for a chat the user has already moved away from.
      // Without this guard, chat A's slow fetch resolving AFTER chat B's would
      // stamp loadedAppsSessionId='A' while the user is on B, making the B
      // dropdown render as empty (stamp mismatch) until an unrelated dep
      // change kicks another refresh.
      if (latestSessionIdRef.current !== fetchedFor) return;
      setConnectedApps(apps);
      setLoadedAppsSessionId(fetchedFor);
    } catch (err) {
      console.warn('[chat] failed to refresh connected apps', err);
    }
  }, [agentBaseUrl, sessionId]);

  const handleRemoveApp = useCallback(
    async (appId: string) => {
      if (!sessionId) return;
      // Optimistic: drop the row from the dropdown immediately so the UI reflects the
      // user's click even if the round-trip is slow, then reconcile with the server.
      setConnectedApps((prev) => {
        if (!(appId in prev)) return prev;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [appId]: _removed, ...rest } = prev;
        return rest;
      });
      try {
        await transport.revokeApp(sessionId, appId);
        // Also revoke any per-user cross-cluster OAuth token the caller holds for this app, so
        // removing it from the chat clears the stored credential too (no-op when there is none).
        // Best-effort: a revoke failure must not undo the removal the user asked for.
        try {
          await transport.disconnectRemoteUser(appId);
        } catch (revokeErr) {
          // eslint-disable-next-line no-console
          console.warn('per-user token revoke failed (app still removed):', revokeErr);
        }
        await refreshConnectedApps();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(t('error.removeApp', { message: msg }));
        // Revoke failed server-side — re-sync so the optimistic removal doesn't lie.
        await refreshConnectedApps();
      }
    },
    [sessionId, refreshConnectedApps]
  );

  // Connect a target app to this chat. Accepts a `<cluster>-<env>-<app>` id OR an `https://` app
  // URL (the cross-cluster per-user path). The orchestrator resolves the input: a same-cluster /
  // admin-configured app binds straight through `configureApp` (authorization is checked
  // server-side — the rproxy probes with the caller's token and throws if unauthorized), while a
  // per-user cross-cluster app runs the OAuth redirect (probe → popup → connect) then binds. We
  // rethrow so AppsPicker can surface the reason inline; on success we re-sync the registry snapshot.
  const handleConnectApp = useCallback(
    async (appIdOrUrl: string) => {
      if (!sessionId) throw new Error(t('error.noSession'));
      const outcome = await connectRemoteApp(
        appIdOrUrl,
        {
          probeRemote: transport.probeRemote,
          getRemoteOAuthUrl: transport.getRemoteOAuthUrl,
          connectRemoteUser: transport.connectRemoteUser,
          configureApp: (appId) => transport.configureApp(sessionId, appId),
        },
        { crossClusterOAuthEnabled }
      );
      await refreshConnectedApps();
      // Success feedback keyed on how it bound — every path gets a visible toast (the picker
      // previously connected with no feedback at all; a plain direct bind now gets the generic
      // toastConnected, while the two cross-cluster shapes get their own wording).
      const appName = outcome.info?.appId || appIdOrUrl;
      if (outcome.status === 'connected') {
        toast.success(t('appsPicker.toastConnectedAsYou', { app: appName }));
      } else if (outcome.info?.via === 'service') {
        toast.success(t('appsPicker.toastConnectedByAdmin', { app: appName }));
      } else {
        toast.success(t('appsPicker.toastConnected', { app: appName }));
      }
    },
    [sessionId, transport, refreshConnectedApps, crossClusterOAuthEnabled, t]
  );

  // Pre-session picker "connect": stage an appId in client state (no pod). Accepts a bare
  // `<cluster>-<env>-<app>` id OR a Studio console URL (`…/apps/<appId>`) — both resolve to an
  // id we can stage and bind on send, mirroring connectRemoteApp's extract-first routing. Only a
  // bare app-ROOT URL has no id to extract; its per-user OAuth bind needs a live pod, so we reject
  // it with a "start the chat first" message rather than silently dropping it.
  const handleStageApp = useCallback(
    async (appIdOrUrl: string) => {
      const trimmed = appIdOrUrl.trim();
      const appId = extractAppId(trimmed);
      if (!appId && isUrlInput(trimmed)) throw new Error(t('appsPicker.connectErrorNeedsSession'));
      const toStage = appId || trimmed;
      setStagedAppIds((prev) => (prev.includes(toStage) ? prev : [...prev, toStage]));
    },
    [t]
  );

  // Pre-session picker "remove": drop a staged target (mirror of handleRemoveApp for the no-pod case).
  const handleUnstageApp = useCallback((appId: string) => {
    setStagedAppIds((prev) => prev.filter((id) => id !== appId));
  }, []);

  // Bind the staged targets once the first message has reserved the pod. Consumes the ref stamped
  // at pending→committed promotion, and only for the session that promotion created (sid match) —
  // so navigating to an existing chat never inherits another chat's staged picks. Best-effort per
  // app; a bind failure is logged and surfaced as a toast, not fatal. The reserve path itself is
  // unchanged.
  useEffect(() => {
    const pendingApply = stagedApplyRef.current;
    if (!pendingApply || pendingApply.sid !== sessionId) return;
    // Same precondition as refreshConnectedApps / handleConnectApp: a reachable pod base. No status
    // gate — the composer's own connect doesn't gate on 'ready' either, and each bind is best-effort.
    if (!agentBaseUrl) return;
    stagedApplyRef.current = null;
    void (async () => {
      for (const appId of pendingApply.appIds) {
        try {
          const info = await transport.configureApp(sessionId, appId);
          // A cross-cluster app resolves to `needs-remote-auth` here rather than throwing. This
          // post-send bind runs as automation (no OAuth popup), so it can't complete a per-user
          // sign-in — the app would otherwise stay silently unbound. Tell the user to connect it
          // from the picker now that the chat is live.
          if (info?.via === 'needs-remote-auth') {
            toast.error(t('appsPicker.toastStagedNeedsConnect', { app: appId }));
          } else {
            // Confirm the bind the same way the committed-session connect (handleConnectApp) does —
            // otherwise a staged pick binds on the first message with no positive feedback.
            toast.success(t('appsPicker.toastConnected', { app: appId }));
          }
        } catch (bindErr) {
          console.warn('[chat] staged target bind failed:', appId, bindErr);
          toast.error(t('appsPicker.toastStagedBindFailed', { app: appId }));
        }
      }
      setStagedAppIds([]);
      await refreshConnectedApps();
    })();
  }, [sessionId, agentBaseUrl, transport, refreshConnectedApps, t]);

  // `startedAtMs` lets the reconnect path anchor the thinking clock to the
  // in-flight turn's real start instead of the reconnect moment; fresh sends
  // omit it and start from now.
  const beginStreaming = useCallback((startedAtMs?: number) => {
    const t = startedAtMs ?? Date.now();
    queryStartedAtRef.current = t;
    streamingTurnKeyRef.current = null;
    setLiveQueryStartedAt(t);
    setIsStreaming(true);
  }, []);

  /** Reset wall-clock anchor for thought duration / live timer without toggling streaming (e.g. before retry `/query` after resume). */
  const restartThinkingClock = useCallback(() => {
    const t = Date.now();
    queryStartedAtRef.current = t;
    setLiveQueryStartedAt(t);
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    serviceIdRef.current = serviceId;
  }, [serviceId]);

  // Re-hydrate the composer when the routed session changes. Pending → existing
  // transitions go through consumeNewSessionDraftFor, which moves a "__new__"
  // draft into the target session's slot only if that target had nothing of
  // its own (so we never clobber a draft typed directly into the session).
  useEffect(() => {
    setInput(sessionId ? consumeNewSessionDraftFor(sessionId) : getDraft(undefined));
  }, [sessionId]);

  // Write-through: every keystroke persists. Cheap (sync localStorage write,
  // textarea is not a high-frequency input) and means the draft always matches
  // what's on screen, including after voice-transcription updates to `input`.
  useEffect(() => {
    setDraft(sessionId, input);
  }, [sessionId, input]);

  // Clear the resolved-empty landing flag whenever we're on a committed chat, so a
  // later return to hashless /chat re-runs the resume decision instead of flashing
  // the blank new-chat UI from a stale flag.
  useEffect(() => {
    if (sessionId) setLandingResolvedEmpty(false);
  }, [sessionId]);

  useEffect(() => {
    if (!isStreaming) {
      setLiveQueryStartedAt(null);
      setIsResumingSession(false);
    }
  }, [isStreaming]);

  // Title-gen trigger callback — held in a ref so sendMessage and the
  // isStreaming-edge effect can call it without taking the function as a
  // closure dep (it's fire-and-forget side effect). The pure decision logic
  // lives in lib/titleTrigger.ts and is unit-tested there.
  const triggerTitleGenRef = useRef<
    | ((args: {
        action: 'initial' | 'retitle';
        sid: string;
        baseUrl: string;
        atTurn: number;
        /** Transcript to summarize. Defaults to messagesRef; the on-mount backfill
         *  passes freshly-hydrated messages because messagesRef hasn't synced yet. */
        messages?: ChatMessage[];
      }) => void)
    | null
  >(null);
  triggerTitleGenRef.current = ({ action, sid, baseUrl, atTurn, messages: msgs }) => {
    if (titleGenInFlightRef.current) return;
    titleGenInFlightRef.current = true;
    const prompt = buildTitlePrompt(action, msgs ?? messagesRef.current, sessionTitle);
    if (!prompt) {
      titleGenInFlightRef.current = false;
      return;
    }
    transport
      .generateSessionTitle(baseUrl, prompt)
      .then((title) => {
        const cleaned = (title || '').trim();
        if (!cleaned) return;
        setSessionTitle(cleaned);
        lastTitleAtTurnRef.current = atTurn;
        return transport.updateSessionTitle(sid, cleaned).then(() => {
          // Smart title persisted — drop the provisional first-message stash now
          // (not before persist, so a failed save keeps the label). The sidebar
          // prefers title over the stash anyway; this just avoids a localStorage leak.
          clearSessionFirstMessage(sid);
          setSidebarRefreshKey((k) => k + 1);
        });
      })
      .catch((err) => {
        console.warn('[chat] generate-title failed', err);
      })
      .finally(() => {
        titleGenInFlightRef.current = false;
      });
  };

  // Title-gen trigger: latches on the isStreaming true→false edge so we run
  // decideTitleAction the moment an assistant response finishes streaming.
  // Conditions are checked inside, not in deps, so this effect runs on every
  // isStreaming change without thrashing.
  useEffect(() => {
    const justEnded = wasStreamingRef.current && !isStreaming;
    wasStreamingRef.current = isStreaming;
    if (!justEnded) return;
    if (!sessionId || !agentBaseUrl || remoteConversationUrl) return;
    const assistantTurns = messagesRef.current.filter((m) => m.kind === 'TEXT' && m.role === 'ASSISTANT').length;
    const action = decideTitleAction({
      assistantTurns,
      currentTitle: sessionTitle,
      lastTitleAtTurn: lastTitleAtTurnRef.current,
      inFlight: titleGenInFlightRef.current,
    });
    if (action === 'none') return;
    triggerTitleGenRef.current?.({
      action,
      sid: sessionId,
      baseUrl: agentBaseUrl,
      atTurn: assistantTurns,
    });
  }, [isStreaming, sessionId, agentBaseUrl, sessionTitle, remoteConversationUrl]);

  // Load connected apps on mount and when agentBaseUrl becomes available
  useEffect(() => {
    if (agentBaseUrl) {
      refreshConnectedApps();
    }
  }, [agentBaseUrl, refreshConnectedApps]);

  // A completed turn may have registered new target apps via c3-connect — pull the
  // latest registry snapshot so the header dropdown count/rows reconcile with the service.
  useEffect(() => {
    if (!agentBaseUrl || isStreaming) return;
    refreshConnectedApps();
  }, [isStreaming, agentBaseUrl, refreshConnectedApps]);

  useEffect(() => {
    if (!isStreaming) return;
    const last = messages[messages.length - 1];
    if (last?.turnId) streamingTurnKeyRef.current = last.turnId;
  }, [isStreaming, messages]);

  useEffect(() => {
    if (prevIsStreamingRef.current && !isStreaming) {
      setWorkspaceTreeRefreshSeq((n) => n + 1);
    }
    prevIsStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Sidebar status pills (running / awaiting input) read server flags the pod writes at
  // turn and permission edges. The sidebar's own poll picks those up within POLL_MS; this
  // effect shortcuts the wait for edges THIS tab caused: when the stream starts/stops or a
  // permission request appears/resolves, refetch page 1 shortly after — delayed just long
  // enough for the pod's flag write to land. Other tabs still ride the poll.
  const hasActivePermission = useMemo(() => findActivePermissionId(messages) !== null, [messages]);
  const pillEdgeInitRef = useRef(false);
  useEffect(() => {
    if (!pillEdgeInitRef.current) {
      pillEdgeInitRef.current = true;
      return;
    }
    const id = window.setTimeout(() => setSidebarRefreshKey((k) => k + 1), 1_500);
    return () => window.clearTimeout(id);
  }, [isStreaming, hasActivePermission]);

  const resetPerSessionState = useCallback(() => {
    // Every switch away from the chat that set it starts a fresh adoption decision for
    // whatever pending/committed session comes next — otherwise a re-home from chat #1
    // permanently blocks the pending-mode guard from adopting a later reaped-pod recovery.
    reHomedRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setRemoteConversationUrl('');
    setPendingQuestion(null);
    setSessionTitle('');
    setError('');
    setPendingFiles([]);
    setSelectedAgentDefId(null);
    setLockedAgentName(undefined);
    setLockedReadOnly(false);
    setLockedAgentDefId(null);
    setLockedLearningAgentEnabled(false);
    setLockedLearningOptOut(true);
    setLearningReceiptPollUntilMs(0);
    setActiveStreamTurnId(null);
    setLastStreamMessageId(null);
    setIsStreaming(false);
    // Drop any targets staged on an abandoned new chat so they don't leak into the next one. The
    // promoted-session case is stamped into stagedApplyRef before this reset (and skipped by the
    // pendingPromotion guard), so clearing the state here can't strip a chat of its just-staged apps.
    setStagedAppIds([]);
    // Clear the prior chat's persisted-model signal so a switch to a chat with no stored model (or a
    // blank "+ New chat") re-seeds from app/pod defaults, not the previous chat's frozen model.
    // selectedModel is intentionally NOT reset here (preserves a user's live pick across "+ New chat").
    setSessionModel(null);
    // Reset the hydrate-authority tracking for the new session: its own hydrate (below) must run and
    // decide the model afresh, and it has no server llmModel history of its own yet.
    setModelHydrated(false);
    lastKnownLlmModelRef.current = null;
    // Refresh app defaults on session switch so a new chat picks up any admin changes
    // (e.g., if admin disabled the previous chat's default model)
    void (async () => {
      try {
        const info = await transport.appInfo();
        setAppDefaultEffort((info?.defaultLlmEffort as string) || DEFAULT_EFFORT);
        setAppDefaultModel((info?.defaultLlmModel as string) || '');
      } catch {
        // silent — keep existing values if fetch fails
      }
    })();
    // Drop any queued message on session switch (Resolved decision §2 in PLAT-148695).
    setQueuedMessage(null);
    setIsResumingSession(false);
    setLiveQueryStartedAt(null);
    setFileViewerPath(null);
    setWorkspaceSelectedPath(null);
    // A connection's expiry banner is per-session context — a switch to a different chat drops it
    // (the new session hasn't seen that frame; the old chat still has it if revisited and re-hit).
    setExpiredMcpKeys([]);
    resetAuthExpiredDedup(authExpiredDedupRef.current);
    setPendingAuthAppIds([]);
    resetCrossClusterAuthDedup(crossClusterAuthDedupRef.current);
    hydratedAuthAppIdsRef.current.clear();
    pendingUserAttachmentsRef.current = [];
    retryPayloadRef.current.clear();
    pendingRetryPromptRef.current = null;
    pendingRetryFilesRef.current = null;
    titleGenInFlightRef.current = false;
    lastTitleAtTurnRef.current = 0;
    wasStreamingRef.current = false;
    setHasMoreOlder(false);
    setLoadingOlder(false);
    loadingOlderRef.current = false;
    prependPrevHeightRef.current = null;
    // Drop any in-flight deferred recovery for the previous chat — otherwise the overlay stays
    // up on the newly opened session and the finish effect would hydrateNonce the wrong sid.
    clearDeferredAwait();
    setModal(null);
    setModalLoading(false);
  }, [clearDeferredAwait]);

  // MCP auth gate, mounted once and shared by every "start a chat with this agent" entry
  // point (header agent picker, sidebar "+ New chat", agent-detail "Chat with agent"). The
  // gate itself lives in McpAuthGateModal; here we adapt it to a promise so callers can
  // `await` it inline. Resolves true once the agent's required connections are authorized,
  // false if the user backs out. If nothing needs auth the modal auto-proceeds without ever
  // showing (no flash). Centralizing here — rather than at one caller — is what makes MCP
  // verification identical no matter where the chat was launched from.
  const [gateAgentDefId, setGateAgentDefId] = useState<string | null>(null);
  const gateResolveRef = useRef<((authorized: boolean) => void) | null>(null);
  const ensureMcpAuthorized = useCallback(
    (agentDefId: string): Promise<boolean> => {
      // Some embeds have no Nexus.Mcp.ConnectionApi — the host gate 404s, React Query
      // retries, and a double-select race can resolve the pick as "cancelled" (popover closes,
      // no session). Skip the gate entirely when the transport says so.
      if (transport.supportsMcpAuthGate === false) {
        return Promise.resolve(true);
      }
      return new Promise<boolean>((resolve) => {
        // Supersede any gate still in flight (a second start-chat action fired before the
        // first resolved — possible during the status fetch, before the modal's overlay is
        // up): resolve the earlier one as "not authorized" so its awaiter unblocks instead of
        // hanging, then take over the slot.
        gateResolveRef.current?.(false);
        gateResolveRef.current = resolve;
        setGateAgentDefId(agentDefId);
      });
    },
    [transport]
  );
  const settleGate = useCallback((authorized: boolean) => {
    setGateAgentDefId(null);
    const resolve = gateResolveRef.current;
    gateResolveRef.current = null;
    resolve?.(authorized);
  }, []);

  const adoptCreatedSession = useCallback(
    async (newId: string): Promise<{ serviceId?: string; agentBaseUrl?: string } | null> => {
      // createSession may re-home this chat onto the Definition's profile. The normal
      // getSession response is authoritative for both the new service id and its data-plane URL.
      // Keep compatibility with older mounts that return no row from this immediate read; the
      // hash-hydrate effect will reconcile it on the next render.
      try {
        const info = await transport.getSession(newId);
        if (!info) return null;
        if (info.serviceId) {
          serviceIdRef.current = info.serviceId;
          reHomedRef.current = true;
          setServiceId(info.serviceId);
          localStorage.setItem(LAST_SERVICE_ID_KEY, info.serviceId);
        }
        if (info.agentBaseUrl) setAgentBaseUrl(info.agentBaseUrl);
        return { serviceId: info.serviceId, agentBaseUrl: info.agentBaseUrl };
      } catch {
        /* creation succeeded; hydrate will retry the authoritative session read */
        return null;
      }
    },
    [setAgentBaseUrl, transport]
  );

  // Create a committed Session on the current pod for `agentDefId`, then navigate to its
  // /chat#<id>. Used by the "+ New chat" agent-confirm modal and the agent-detail
  // "Chat with agent" entry so a new chat opens already agent-bound (the normal hash-hydrate
  // effect then does the full reset + getSession). Unlike sendMessage's pending→committed
  // promotion, this does NOT set pendingPromotionSidRef: there's no optimistic user bubble to
  // preserve, so the full hydrate (which sets agentBaseUrl/status) must run. The optimistic
  // sidebar row mirrors that path so the new chat shows instantly. Throws on failure.
  const createCommittedSession = useCallback(
    async (svcId: string, agentDefId: string, opts?: { replace?: boolean }): Promise<string> => {
      const rawId = await transport.addSession(svcId, agentDefId);
      const newId = typeof rawId === 'string' ? rawId : String(rawId ?? '');
      const adopted = await adoptCreatedSession(newId);
      if (!adopted?.serviceId && !serviceIdRef.current) {
        throw new Error(t('sidebar.error.createFailed', { defaultValue: 'Failed to create chat session.' }));
      }
      if (!newId || newId === '[object Object]') {
        throw new Error(t('sidebar.error.createFailed', { defaultValue: 'Failed to create chat session.' }));
      }
      setOptimisticSidebarSession({ id: newId, createdAt: new Date().toISOString() });
      setSidebarRefreshKey((k) => k + 1);
      window.setTimeout(() => setOptimisticSidebarSession(null), 3000);
      navigate({ pathname: '/chat', hash: newId }, opts?.replace ? { replace: true } : undefined);
      return newId;
    },
    [adoptCreatedSession, navigate, transport, t]
  );

  // "+ New chat" pick handler (passed to SessionSidebar's NewChatAgentMenu popover): create the
  // committed Session for the chosen agent, then navigate (createCommittedSession does both). The
  // popover closes itself on success; errors propagate so it stays open and surfaces them inline.
  const handleConfirmNewChat = useCallback(
    async (agentDefId: string): Promise<void> => {
      const svcId = serviceIdRef.current || session.serviceId;
      if (!svcId) throw new Error(t('sidebar.noPodError'));
      // Verify MCP (no-op when transport.supportsMcpAuthGate === false). A cancel
      // returns normally so the picker menu just closes — only a genuine create failure rejects.
      if (!(await ensureMcpAuthorized(agentDefId))) return;
      await createCommittedSession(svcId, agentDefId);
    },
    [createCommittedSession, ensureMcpAuthorized, session.serviceId, t]
  );

  // Mid-session MCP OAuth expiry (proxy hit a reauth-required 401 mid-turn): every stream
  // consumer (reconnect / query / respond) routes an in-band `mcp-auth-expired` frame here
  // instead of appending it to the transcript — it's an ambient signal, not a chat bubble.
  // Keyed by connectionKey so a repeated frame for the same connection updates in place rather
  // than stacking a second banner; order is oldest-expired-first. The chat/session stays live —
  // Reconnect (in McpAuthExpiredBanner) re-runs the same OAuth popup flow the MCP menu uses, and
  // the next tool call pulls the fresh token through the proxy automatically.
  const [expiredMcpKeys, setExpiredMcpKeys] = useState<string[]>([]);
  const handleMcpAuthExpiredFrame = useCallback((msg: ChatMessage): boolean => {
    if (!isMcpAuthExpiredFrame(msg)) return false;
    // Consume the frame either way (it must never become a chat bubble); only surface the banner
    // when it isn't the replay of one the user already dismissed/reconnected this session.
    if (recordExpiredFrame(authExpiredDedupRef.current, msg)) {
      setExpiredMcpKeys((prev) => upsertExpiredKey(prev, msg.connectionKey));
    }
    return true;
  }, []);
  const dismissMcpAuthExpired = useCallback((connectionKey: string) => {
    // Fires on both the X click and a successful reconnect (McpAuthExpiredBanner calls onDismiss on
    // connect success). Marking the driving frames dismissed keeps their in-session replay suppressed.
    markKeyDismissed(authExpiredDedupRef.current, connectionKey);
    setExpiredMcpKeys((prev) => prev.filter((k) => k !== connectionKey));
  }, []);

  // Cross-cluster per-user OAuth prompt: the in-pod agent can't start the browser redirect, so a
  // c3-connect / c3-run that resolved needs-remote-auth (needsAdmin=false) arrives as an in-band
  // `cross-cluster-auth` frame. Every stream consumer routes it here instead of the transcript —
  // ambient signal, not a chat bubble. Keyed by appId (oldest-first). The Connect button
  // (CrossClusterAuthBanner) runs the same connectRemoteApp OAuth flow the AppsPicker uses; on
  // success ChatPage binds the app and auto-resumes the agent (handleCrossClusterAuthConnect below).
  const [pendingAuthAppIds, setPendingAuthAppIds] = useState<string[]>([]);
  const handleCrossClusterAuthFrame = useCallback(
    (msg: ChatMessage, fromHydrate = false): boolean => {
      // Consume EVERY cross-cluster-auth frame (it must never become a chat bubble). Only a well-formed
      // frame with a usable appId goes on to surface a banner — a malformed one is swallowed here.
      if (!isCrossClusterAuthKind(msg)) return false;
      // Feature-gated: when the cross-cluster OAuth path is off, still consume the frame (never a
      // bubble) but never surface the Connect banner — the backend stays unflagged and keeps emitting
      // the sentinel, so this FE gate is what actually hides the affordance.
      if (!crossClusterOAuthEnabled) return true;
      if (!isCrossClusterAuthFrame(msg)) return true;
      if (fromHydrate) {
        hydratedAuthAppIdsRef.current.add(msg.appId);
        // A history replay for an app already bound (connected earlier this chat) is consumed but not
        // re-surfaced — otherwise reopening the chat shows a stale banner whose Connect fires a
        // spurious resume. Live frames skip this: a mid-task 401 may carry a still-bound snapshot.
        const info = connectedAppsRef.current[msg.appId];
        if (info && info.via !== 'needs-remote-auth') return true;
      }
      if (recordCrossClusterAuthFrame(crossClusterAuthDedupRef.current, msg)) {
        setPendingAuthAppIds((prev) => upsertPendingAppId(prev, msg.appId));
      }
      return true;
    },
    [crossClusterOAuthEnabled]
  );
  // Backstop for the hydrate ↔ connectedApps load race: if the registry snapshot lands AFTER a
  // history-replayed banner surfaced, prune any hydrated-origin appId that is now bound-valid. Scoped
  // to hydrated-origin appIds so a live mid-task 401 banner is never pruned by a stale snapshot.
  useEffect(() => {
    setPendingAuthAppIds((prev) => {
      const next = prev.filter((appId) => {
        if (!hydratedAuthAppIdsRef.current.has(appId)) return true;
        const info = connectedApps[appId];
        if (info && info.via !== 'needs-remote-auth') {
          markAppIdDismissed(crossClusterAuthDedupRef.current, appId);
          return false;
        }
        return true;
      });
      return next.length === prev.length ? prev : next;
    });
  }, [connectedApps]);
  const dismissCrossClusterAuth = useCallback((appId: string) => {
    markAppIdDismissed(crossClusterAuthDedupRef.current, appId);
    setPendingAuthAppIds((prev) => prev.filter((a) => a !== appId));
  }, []);

  // Hashless-/chat landing — the single owner of "what to show when there's no chat hash".
  // Two layers compose here:
  //   • SessionProvider owns the POD: liveness on load, reserve/resume, the provisioning
  //     overlay. Until it yields a serviceId we stay put and the overlay covers the page.
  //   • This effect owns the SESSION: once a pod is ready, resume the most-recent chat
  //     (NXS-24) — except "+ New chat" (#new), which opens a blank chat. While the
  //     most-recent lookup runs, the landing loader (see render) is shown; `landingResolvedEmpty`
  //     flips true only when we settle on a blank chat (nothing to resume), so the loader
  //     doesn't hang.
  useEffect(() => {
    if (sessionId) return;
    if (session.failed) {
      // Terminal provisioning failure: stay on /chat and let the render show an in-place error
      // (Retry / Go to Agents) instead of yanking the user off to the registry — the overlay
      // already covers the recoverable waits, so only a hard failure surfaces here.
      return;
    }
    // Pod not ready yet — reserve/resume still in flight. Stay on /chat so the provisioning
    // overlay shows instead of bouncing the user off the page (NXS-425 objective 1).
    const svcId = serviceIdRef.current || session.serviceId;
    if (!svcId) {
      return;
    }

    let cancelled = false;

    // Initialize the blank new-chat UI on the live pod. Pending mode never calls getSession
    // (no Session row exists yet), so the pod's agentBaseUrl is only as fresh as the
    // localStorage breadcrumb; recover it from service info when absent so the composer +
    // model list are usable before the first send (the pod serviceId is a valid
    // getSessionInfo key).
    const initBlankChat = () => {
      if (cancelled) return;
      // Already initialized this blank chat? Skip the destructive reset — a re-fire (e.g.
      // serviceId settling) must not nuke the agent the user just picked. Cleared once we
      // reach a committed session (see hydrate effect below).
      if (blankChatInitedRef.current) return;
      blankChatInitedRef.current = true;
      setLandingResolvedEmpty(true);
      resetPerSessionState();
      // Re-apply the agent preselect that resetPerSessionState() just cleared. The def id
      // arrives via router location state from the agent-detail "Chat with agent" entry
      // (kept out of the URL); without this re-seed the blank chat falls back to the default
      // agent in the header/picker.
      const agentDefId = (location.state as { agentDefId?: string } | null)?.agentDefId;
      if (agentDefId) setSelectedAgentDefId(agentDefId);
      setInput('');
      setSessionStatus('ready');
      // agentBaseUrl comes from the SessionProvider breadcrumb (set from myService), so no
      // recovery fetch here — getSessionInfo can't resolve it in pending mode anyway (it keys
      // on a Session id, and no Session row exists yet).
    };

    // Explicit "+ New chat" (#new): blank chat, never resume.
    if (isNewChatIntent) {
      // Agent already chosen (agent-detail "Chat with agent" seeds it via router state):
      // create the committed Session up front so the chat opens agent-bound — connect-app
      // and other chat-scoped affordances work without a first message. The sidebar's
      // "+ New chat" button takes the modal path instead and never reaches here with no
      // agent; a bare #new (no preselect) still falls back to the pending blank chat.
      const preselectedAgentDefId = (location.state as { agentDefId?: string } | null)?.agentDefId;
      const autoSendNewChat = (location.state as { autoSend?: boolean } | null)?.autoSend === true;
      // autoSend handoff (New-job builder): stay in pending mode so the auto-send fires the first
      // message, which is what creates the session. initBlankChat still pins the preselected agent.
      if (preselectedAgentDefId && !autoSendNewChat) {
        // Reuse the blank-chat guard: a re-fire (e.g. serviceId settling) must not create a
        // second Session. The hash-hydrate effect clears it once we reach the committed chat.
        if (blankChatInitedRef.current) {
          return () => {
            cancelled = true;
          };
        }
        blankChatInitedRef.current = true;
        void (async () => {
          try {
            // Same MCP gate the other entry points use. The agent-detail "Chat" button no
            // longer gates before navigating here, so this is where Path A's verification
            // happens. A cancel drops the new-chat intent and falls back to the landing.
            if (!(await ensureMcpAuthorized(preselectedAgentDefId))) {
              blankChatInitedRef.current = false;
              navigate('/chat', { replace: true });
              return;
            }
            await createCommittedSession(svcId, preselectedAgentDefId, { replace: true });
          } catch {
            // Creation failed. Release the guard and route to the normal landing (resume the
            // most-recent chat, else a blank one). Using navigate rather than initBlankChat()
            // is deliberate: it doesn't depend on this (possibly cancelled) effect closure, so
            // the loader can't hang if the effect re-fired mid-create. The re-fire lands on the
            // no-`new` branch below with the guard cleared.
            blankChatInitedRef.current = false;
            navigate('/chat', { replace: true });
          }
        })();
        return () => {
          cancelled = true;
        };
      }
      initBlankChat();
      return () => {
        cancelled = true;
      };
    }

    // Default landing: resume the most-recent chat on this pod (NXS-24). The landing loader
    // covers this lookup; on navigate the hash-path hydrate effect takes over.
    void (async () => {
      try {
        const list = (await transport.listSessionsForService()) as Session[];
        if (cancelled) return;
        // Skip dead sessions (pod/PVC gone, unrecoverable) so we don't re-adopt the very
        // session that just failed and bounce back into the resume→reload loop.
        const newest = pickMostRecentSession(list.filter((s) => !s.removedAt && !isSessionDead(s.id)));
        if (newest) {
          navigate(`/chat#${newest.id}`, { replace: true });
          return;
        }
        initBlankChat();
      } catch (err) {
        // Couldn't list sessions — fall back to a blank chat rather than hang the loader.
        initBlankChat();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sessionId,
    isNewChatIntent,
    session.failed,
    session.serviceId,
    navigate,
    resetPerSessionState,
    createCommittedSession,
    ensureMcpAuthorized,
  ]);

  useEffect(() => {
    // Hash-path hydrate: /chat#<sessionId> → committed chat, fetch session +
    // hydrate transcript. The no-hash (pending) case is owned by the effect above.
    if (!sessionId) {
      lastHashHydrateSidRef.current = null;
      return;
    }
    // Pending → committed promotion: sendMessage arms the title timer for the
    // freshly-created sessionId before navigating, so when this effect re-fires
    // with the new hash we're still looking at the SAME chat the user is mid-send
    // on. Resetting per-session state here would erase the optimistic user bubble
    // sendMessage just appended. Skip the reset in that case; the in-flight stream
    // continues into the live transcript.
    if (pendingPromotionSidRef.current === sessionId) {
      pendingPromotionSidRef.current = null;
      lastHashHydrateSidRef.current = sessionId;
      // Committed now → clear the blank-chat guard so the next "+ New chat" re-runs the reset
      // (otherwise it'd skip it and leave this transcript on screen). The guard already did its
      // job for the pending→committed transition.
      blankChatInitedRef.current = false;
      // Promoted chat keeps its optimistic transcript — it's already "loaded", so stamp it so the
      // derived `hydrating` flag stays false and no skeleton flashes over the live bubble.
      setLoadedTranscriptSid(sessionId);
      setLoadedSessionInfoSid(sessionId);
      // Skip the full hydrate (it'd wipe the optimistic bubble + in-flight stream), but still
      // resolve the locked picker's name: lockedAgentName stays `undefined` (a skeleton) for a
      // default-agent chat the user never picked. null = default agent → picker shows "C3 Agent".
      void (async () => {
        try {
          const info = await transport.getSession(sessionId);
          // Only apply if still on the promoted session's URL, so we don't clobber another chat.
          if (info && window.location.hash === `#${sessionId}`) {
            setLockedAgentName(info.agentName ?? null);
            setLockedReadOnly(info.readOnly === true);
            setLockedAgentDefId(info.agentRef ? info.agentRef.replace(/-\d+$/, '') : null);
            setLockedLearningAgentEnabled(info.skillImprovementAgentEnabled === true);
            setLockedLearningOptOut(info.skillImprovementOptOut === true);
          }
        } catch {
          /* Leave as-is; a later navigation/refresh resolves the name. */
        }
      })();
      return;
    }
    // Same-session re-hydrate (hydrateNonce after recover / deferred finish): soft reset only.
    // Full resetPerSessionState clears awaitingProviderReady and drops the overlay while
    // recoverService + fetchSessionMessages are still in flight — the exact flip this gate
    // exists to prevent.
    const isSessionSwitch = lastHashHydrateSidRef.current !== sessionId;
    lastHashHydrateSidRef.current = sessionId;
    if (isSessionSwitch) {
      // Model picks persist across an explicit "+ New chat", but never across two committed chats.
      // A destination row with no llmModel inherits current policy; retaining the prior chat's
      // explicit intent would turn that inheritance into an accidental pin and defeat safe Auto
      // recovery when the old route disappears.
      modelSelectionIntentRef.current = 'inherited';
      modelPersistedRef.current = null;
      setSelectedModel('');
      setCurrentModel(null);
      setSessionModel(null);
      setPodModels(null);
      setPodModelsScope('');
      setModelCatalogError('');
      setModels([]);
      setDefaultModel('');
      setAgentBaseUrl('');
      setServiceId('');
      setLoadedSessionInfoSid('');
      policyConvergenceRefetchRef.current = '';
      policyConvergencePollAttemptRef.current = 0;
      resetPerSessionState();
      blankChatInitedRef.current = false;
      reconnectRehydrateAttemptsRef.current = 0;
    } else {
      abortRef.current?.abort();
      abortRef.current = null;
      setMessages([]);
      setError('');
      setPendingQuestion(null);
      setHasMoreOlder(false);
      setLoadingOlder(false);
      loadingOlderRef.current = false;
      prependPrevHeightRef.current = null;
      // Keep awaitingProviderReady / deferred refs / loadedTranscriptSid — overlay stays up
      // over the empty transcript until history success (or a new 404 modal) clears the gate.
    }
    // Mount lifecycle owns this AbortController so a fast unmount/remount
    // cancels any in-flight reconnect stream cleanly. Captured by the IIFE
    // below and tied to cleanup.
    const reconnectAbort = new AbortController();
    // Stop also aborts the stream, but only effect cleanup relinquishes hydration ownership.
    let disposed = false;
    (async () => {
      try {
        // Named chatSession (not `session`) so it never shadows useSession()'s context —
        // both expose agentBaseUrl and a future edit inside this block must not grab the wrong one.
        const chatSession = await transport.getSession(sessionId);
        if (!chatSession) {
          setSessionStatus('invalid');
          return;
        }
        setSessionStatus(chatSession.serviceStatus);
        setSessionTitle(chatSession.title || '');
        setServiceId(chatSession.serviceId || '');
        setLockedAgentName(chatSession.agentName ?? null);
        setLockedReadOnly(chatSession.readOnly === true);
        setLockedAgentDefId(chatSession.agentRef ? chatSession.agentRef.replace(/-\d+$/, '') : null);
        setLockedLearningAgentEnabled(chatSession.skillImprovementAgentEnabled === true);
        setLockedLearningOptOut(chatSession.skillImprovementOptOut === true);
        // Restore the persisted per-chat model choice — notably 'auto', which the models effect
        // cannot re-derive (it only sees the last CONCRETE model). Set BOTH:
        //  - selectedModel directly, so switching INTO an existing chat adopts its frozen model now
        //    (this is a fresh hydrate — resetPerSessionState ran just above);
        //  - sessionModel, which the seed effect uses as the authoritative first source, so the
        //    models effect's concrete `currentModel` can't win the `prev ||` race and clobber 'auto'
        //    before/after this set (the bug: an Auto-agent chat opening on a concrete model).
        // Only mark modelHydrated when this hydrate actually determined an authoritative value —
        // either branch below ran. A brand-new/never-overridden chat (llmModel falsy AND no prior
        // known model) hits neither branch and must NOT set modelHydrated: the seed effect below is
        // still the one source that derives selectedModel from the live /models catalog for that
        // case, and it early-returns once modelHydrated is true. Locking it out unconditionally here
        // (regardless of whether either branch actually ran) left every no-override chat's
        // selectedModel stuck at its initial blank value forever, since the /models fetch always
        // resolves after this hydrate.
        let hydratedAuthoritatively = false;
        if (chatSession.llmModel) {
          // New rows carry provenance. Any provenance-less legacy concrete value remains explicit:
          // it may be a deliberate pin that happened to equal the then-current default, and later
          // authorities cannot reconstruct that historical intent safely.
          const storedIntent = chatSession.llmModelSelectionIntent;
          modelSelectionIntentRef.current = storedIntent === 'inherited' ? 'inherited' : 'explicit';
          setSelectedModel(chatSession.llmModel);
          setSessionModel(chatSession.llmModel);
          hydratedAuthoritatively = true;
        } else if (lastKnownLlmModelRef.current) {
          // Genuine reset-to-default: this session previously had an override and the server has
          // since cleared it (e.g. via setModel(sessionId, '', ...)) — clear the client's stale pick
          // too. Without this, a same-session soft re-hydrate (hydrateNonce, no resetPerSessionState)
          // leaves the old concrete selectedModel in place, and the very next turn immediately
          // re-persists it, silently reverting the reset. A brand-new chat that never had an override
          // (lastKnownLlmModelRef.current is null) is NOT touched here — that must keep the user's
          // live pick across "+ New chat" (see resetPerSessionState).
          modelSelectionIntentRef.current = 'inherited';
          setSelectedModel('');
          setSessionModel(null);
          hydratedAuthoritatively = true;
        }
        lastKnownLlmModelRef.current = chatSession.llmModel || null;
        if (hydratedAuthoritatively) setModelHydrated(true);
        // Restore the persisted per-chat effort pin; null → inherit (derive from model + app default).
        setPinnedEffort(chatSession.llmEffort || null);
        // Seed the persist ref with the restored (model, effort) pair so a later
        // revert to the default still persists — otherwise default-model + default-
        // effort looks like the untouched initial state and the clearing write is
        // skipped, leaving a stale non-default value to reappear on the next reload.
        {
          const restoredEffortArg = chatSession.llmEffort || '';
          modelPersistedRef.current = `${chatSession.sessionId}:${chatSession.llmModel || ''}:${
            modelSelectionIntentRef.current
          }:${restoredEffortArg}`;
        }
        if (chatSession.remoteConversationUrl) setRemoteConversationUrl(chatSession.remoteConversationUrl);
        if (chatSession.serviceId) {
          localStorage.setItem(LAST_SERVICE_ID_KEY, chatSession.serviceId);
        }

        if (!chatSession.agentBaseUrl) {
          return;
        }
        setAgentBaseUrl(chatSession.agentBaseUrl);
        setLoadedSessionInfoSid(sessionId);
        const isAgentBackendRemote = !!chatSession.remoteConversationUrl;

        // Stale chat page whose backing service was idle-stopped (pod reaped by the ensure() loop,
        // PVC + chats preserved): the pod is gone, so hydrating history or reconnecting would only
        // fail. Detect the stopped service up front and route into the shared cold-start wait page,
        // which auto-resumes the service and re-hydrates once it is back — the same overlay + recovery
        // a messages-404 triggers, but fired deterministically on entry instead of after a doomed
        // fetch. Remote backends have no pod to resume, so they fall through to the normal hydrate.
        if (!isAgentBackendRemote && chatSession.serviceStatus === 'STOPPED') {
          // Hand off to the resume modal; if we were waiting on the provider, clear that flag so
          // the auto-resume effect owns the next step (defer or recoverService).
          clearDeferredAwait();
          setModal('sessionClosedMessages404');
          return;
        }

        // 1) Hydrate from persisted history (PVC) of the agent service. One session per
        // agent service, sessionId == Nexus.Agent.Service id, so no merging
        // needed — just seed the chat. Failures here are non-fatal.
        let isActive = false;
        let hydratedMessages: ChatMessage[] = [];
        try {
          // Retry logic for the persisted-store-lag race: a reload landing just after a turn
          // ends can hit a window where isActive=false (no /reconnect) but OpenCode's PVC
          // hasn't flushed yet, so the server returns empty messages. The server's
          // mergeLiveFrames backfill narrows but doesn't fully close this gap. Retry up to
          // HYDRATE_EMPTY_RETRIES times with HYDRATE_EMPTY_RETRY_DELAY_MS between attempts
          // when we get isActive=false + zero messages — the store usually flushes within
          // a few hundred ms. REL-1.1 surfaced this as intermittent "zero assistant blocks
          // after reload" failures on the PSR reliability suite.
          const HYDRATE_EMPTY_RETRIES = 5;
          const HYDRATE_EMPTY_RETRY_DELAY_MS = 500;
          // A 404 here means the pod is not serving this session yet. When a resume is already in
          // flight (awaitingProviderReady) the pod is mid restore-bounce — the snapshot restored but
          // opencode is still respawning + rebuilding its session map — so that 404 is TRANSIENT, not
          // a dead session. Poll across the bounce window (the overlay stays up the whole time, so the
          // chat/error never flashes) instead of short-circuiting to the give-up path, which is what
          // surfaced the false "this chat's history is no longer available" during a slow-but-successful
          // resume. A healthy pod answers on the first try and exits immediately; a genuinely dead pod
          // (restore failed / TERMINATED) still exhausts the window and falls through to the existing
          // 404 recovery/dead-session handling below. First-detection 404s (no resume in flight yet)
          // are NOT retried — they must throw so the resume gets kicked off.
          const HYDRATE_RESUME_404_RETRIES = 16;
          const HYDRATE_RESUME_404_RETRY_DELAY_MS = 500;
          const resumeInFlight = awaitingProviderReady && !isAgentBackendRemote;
          const fetchHydration = async () => {
            for (let attempt = 0; ; attempt++) {
              try {
                return await transport.fetchSessionMessages(chatSession.agentBaseUrl, sessionId);
              } catch (e) {
                const transient404 =
                  e instanceof SessionMessagesHttpError &&
                  e.status === 404 &&
                  resumeInFlight &&
                  attempt < HYDRATE_RESUME_404_RETRIES &&
                  !reconnectAbort.signal.aborted;
                if (!transient404) throw e;
                await new Promise((r) => setTimeout(r, HYDRATE_RESUME_404_RETRY_DELAY_MS));
                if (reconnectAbort.signal.aborted) throw e;
              }
            }
          };
          let result = await fetchHydration();
          for (
            let attempt = 0;
            attempt < HYDRATE_EMPTY_RETRIES &&
            !reconnectAbort.signal.aborted &&
            !result.isActive &&
            result.messages.length === 0;
            attempt++
          ) {
            await new Promise((r) => setTimeout(r, HYDRATE_EMPTY_RETRY_DELAY_MS));
            if (reconnectAbort.signal.aborted) break;
            result = await transport.fetchSessionMessages(chatSession.agentBaseUrl, sessionId);
          }
          // Abort fired mid-retry (session switch / unmount) — bail without touching state.
          if (reconnectAbort.signal.aborted) return;
          // History loaded — this session is healthy again; reset the resume-reload
          // guard and dead-session marker so it's eligible for re-adoption and a
          // future close→resume can reload once if needed.
          clearResumeReloaded(sessionId);
          clearSessionDead(sessionId);
          // Deferred recovery (or recover→rehydrate) finished successfully — drop the await
          // gate so the blocking overlay can hide.
          clearDeferredAwait();
          // Route any persisted `mcp-auth-expired` companion frames to the reconnect banner (the
          // pod replays them on reload) and strip them from the rendered transcript — otherwise a
          // mid-chat expiry that completed before a reload would surface as neither a banner nor a
          // bubble (an unknown-kind frame renders as null). `handleMcpAuthExpiredFrame` applies the
          // same frame-id dedup as the live path, so a frame already dismissed this session stays
          // gone and the connection-status reconcile in the banner hides a since-reconnected key.
          result.messages.forEach((m) => {
            if (isMcpAuthExpiredFrame(m)) handleMcpAuthExpiredFrame(m);
            if (isCrossClusterAuthKind(m)) handleCrossClusterAuthFrame(m, true);
          });
          const renderableMessages = result.messages.filter(
            (m) => !isMcpAuthExpiredFrame(m) && !isCrossClusterAuthKind(m)
          );
          // Merge, don't clobber: a slow history fetch can land after the user
          // already sent a turn, whose optimistic/error bubbles live only in
          // client state. Replacing wholesale would unmount them mid-interaction.
          setMessages((prev) => reconcileHydratedTranscript(renderableMessages, prev));
          setHasMoreOlder(result.hasMore);
          loadingOlderRef.current = false;
          setLoadingOlder(false);
          hydratedMessages = renderableMessages;
          const lastQuestion = [...result.messages].reverse().find((m) => m.kind === 'QUESTION');
          if (lastQuestion) {
            const afterQuestion = result.messages.slice(result.messages.indexOf(lastQuestion) + 1);
            const userAnsweredAlready = afterQuestion.some((m) => m.kind === 'TEXT' && m.role === 'USER');
            if (!userAnsweredAlready) {
              setPendingQuestion(lastQuestion);
            }
          }
          isActive = result.isActive;
          // Hydrated successfully → this session is recoverable; forget any prior
          // 404-resume attempts so a later legitimate stop gets a fresh retry budget.
          clearResumeAttempts(sessionId);
        } catch (err) {
          if (err instanceof SessionMessagesHttpError && err.status === 404) {
            // For pod-based sessions 404 means the pod/PVC is gone — show resume modal.
            // For remote sessions it means no history yet (no shared rproxy) — continue.
            if (!isAgentBackendRemote) {
              if (isSessionDead(sessionId)) {
                // Known-unrecoverable session (already failed a resume+reload, which already
                // signaled the provisioning controller). Don't re-enter the resume modal, and
                // don't silently bounce the user to a new chat either — tell them why this one
                // came up empty (most commonly: the underlying AgentCore/pod session was reaped
                // and its history never persisted anywhere on the C3 side). They stay on this
                // chat and can navigate away themselves.
                clearDeferredAwait();
                setError(tRef.current('error.chatHistoryExpired'));
                return;
              }
              clearDeferredAwait();
              setModal('sessionClosedMessages404');
              return;
            }
          } else {
            console.warn('[chat] failed to load history', err);
          }
        }

        // 2) If the agent reports a turn still in flight (user reloaded mid-
        // turn, or another tab kicked off generation), reattach to the live
        // stream via /reconnect. Frames are merged by id — duplicates with
        // the hydrated history collapse, new frames append.
        if (!isActive) {
          // Navigate-away durability: the user may have left before the client
          // title-gen ran, leaving the persisted title empty though the first
          // response already completed. Generate the smart title now — same
          // fire-and-forget path as the streaming-edge trigger. Empty persisted
          // title is the durable "no smart title yet" guard; titleGenInFlightRef
          // dedupes against any concurrent gen. Skip remote backends (no pod
          // /generate-title), matching the streaming-edge trigger.
          const assistantTurns = hydratedMessages.filter((m) => m.kind === 'TEXT' && m.role === 'ASSISTANT').length;
          if (!isAgentBackendRemote && !chatSession.title?.trim() && assistantTurns >= 1) {
            triggerTitleGenRef.current?.({
              action: 'initial',
              sid: sessionId,
              baseUrl: chatSession.agentBaseUrl,
              atTurn: assistantTurns,
              messages: hydratedMessages, // messagesRef hasn't synced from setMessages yet
            });
          }
          // Turn already finished while we were away — drop any running mark this browser
          // left for it (a mark survives navigation on purpose; the revisit is where a
          // finished turn becomes observable), and restore any message the user had queued
          // for this session so the drain effect fires it now. Guard on the live hash so a
          // fast re-switch can't restore it into a different session.
          clearTurnRunning(sessionId);
          if (window.location.hash === `#${sessionId}`) {
            setQueuedMessage(getQueued(sessionId));
          }
          return;
        }
        // Reattaching to a live turn: anchor the thinking clock to the turn's
        // real start so "Thinking for …" shows true elapsed, not a reset-to-0.
        beginStreaming(deriveActiveTurnStartMs(hydratedMessages) ?? undefined);
        abortRef.current = reconnectAbort;
        // The pod confirmed a live turn — (re)mark it for the sidebar pill, covering turns
        // this browser didn't start (another device) or lost track of (cleared storage).
        markTurnRunning(sessionId);
        // Restore the queued message AFTER beginStreaming flips isStreaming true,
        // so the drain effect waits for this live stream to end rather than
        // firing the queued message into the in-flight turn.
        if (window.location.hash === `#${sessionId}`) {
          setQueuedMessage(getQueued(sessionId));
        }
        // Track whether this live turn is blocked on a human across BOTH the hydrated transcript
        // (the /reconnect re-dump lands the PENDING permission here) and any live permission frame.
        // A closure-local, not messagesRef, so the drop-recovery decision below can't read a
        // pre-commit-stale ref. See shouldRehydrateForPendingPermission.
        let sawPendingPermission = hasPendingPermission(hydratedMessages);
        try {
          for await (const msg of transport.streamReconnect(
            chatSession.agentBaseUrl,
            sessionId,
            reconnectAbort.signal
          )) {
            noteLearningReviewQueued(msg);
            if (handleMcpAuthExpiredFrame(msg)) continue;
            if (handleCrossClusterAuthFrame(msg)) continue;
            if (msg.turnId) setActiveStreamTurnId(msg.turnId);
            if (msg.id) setLastStreamMessageId(msg.id);
            if (msg.kind === 'PERMISSION') sawPendingPermission = (msg.data?.state ?? 'PENDING') === 'PENDING';
            if (msg.kind === 'QUESTION') {
              setMessages((prev) => transport.mergeFrame(prev, msg));
              setPendingQuestion(msg);
              // QUESTION arrives before the server finishes aborting its paused turn.
              // Drain through EOF so answering cannot race the server's admission guard.
              continue;
            }
            setMessages((prev) => transport.mergeFrame(prev, msg));
          }
          // Reconnect attached and drained cleanly — the pod is reachable again, so refund the
          // re-hydrate budget. Keeps the cap per drop-incident rather than per session lifetime
          // (a later permission turn's transient drop still gets its own attempts).
          reconnectRehydrateAttemptsRef.current = 0;
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            // A reconnect stream dying against a killed/restarting pod used to be swallowed here,
            // leaving the session silently bound to a dead pod until the user noticed. Proactively
            // recover: recoverService probes the pod and stop+resumes a truly dead one (a no-op when
            // it's healthy), updating the base so the user's next turn lands on a live pod.
            // Best-effort — if it fails, the send-path's own stale-recovery still covers the next
            // message.
            console.warn('[chat] reconnect stream failed', err);
            const recoverSvcId = serviceIdRef.current || chatSession.serviceId;
            if (recoverSvcId) {
              void transport
                .recoverService(recoverSvcId)
                .then((info) => {
                  if (info.agentBaseUrl) setAgentBaseUrl(info.agentBaseUrl);
                  // A successful pod recovery invalidates both routing authorities even when the
                  // service/session/base identifiers are unchanged. Refresh explicitly instead of
                  // waiting for a picker-open gesture or the next convergence backoff tick.
                  refreshRoutingAuthorities();
                  // Re-hydrate against the recovered base so the reconnect stream re-attaches
                  // and the pod re-dumps a still-PENDING permission (which we deliberately did
                  // NOT orphan below) — otherwise a transient drop mid-approval would hide the
                  // block until a manual reload. Scoped to the turn-blocked-on-a-human case and
                  // capped so a persistently-dead pod can't spin recover→re-hydrate forever;
                  // outside that case the next send's own stale-recovery still covers it.
                  if (
                    shouldRehydrateForPendingPermission(sawPendingPermission, reconnectRehydrateAttemptsRef.current)
                  ) {
                    reconnectRehydrateAttemptsRef.current += 1;
                    setHydrateNonce((n) => n + 1);
                  }
                })
                .catch(() => {
                  /* next send retries via the stale-recovery path */
                });
            }
          }
        } finally {
          // Stream ended (Stop click, opencode idle, network error). Any tool
          // still RUNNING/PENDING is orphaned — flip to terminal so the badges
          // stop spinning. A still-PENDING permission is left as-is (not
          // orphaned): it's server-authoritative and the recover→re-hydrate
          // above re-surfaces it; only a user Stop finalizes it (onStop).
          // Guarded against a session-switch race: if a newer effect has
          // replaced our AbortController in abortRef, the messages map belongs
          // to the new session and we must NOT touch it. PLAT-149034.
          if (!disposed && abortRef.current === reconnectAbort) {
            commitThoughtDuration(
              queryStartedAtRef,
              streamingTurnKeyRef,
              messagesRef.current,
              setThoughtDurationByTurnKey
            );
            setMessages((prev) => finalizeOrphanedFrames(prev));
            abortRef.current = null;
            setIsStreaming(false);
          }
          // Same rule as executeQuery: reconnect stream over without a client-side abort
          // (session switch / unmount) → the turn itself ended → drop the running mark.
          if (!reconnectAbort.signal.aborted) clearTurnRunning(sessionId);
        }
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : tRef.current('error.loadAgentService'));
        }
      } finally {
        // Only the current hydrate owns completion. An aborted run can share this sessionId
        // with its replacement, so the session stamp alone cannot keep its skeleton visible.
        if (!disposed) setLoadedTranscriptSid(sessionId);
      }
    })();
    return () => {
      disposed = true;
      reconnectAbort.abort();
    };
  }, [
    sessionId,
    isNewChatIntent,
    navigate,
    beginStreaming,
    resetPerSessionState,
    clearDeferredAwait,
    hydrateNonce,
    handleMcpAuthExpiredFrame,
    handleCrossClusterAuthFrame,
    noteLearningReviewQueued,
    refreshRoutingAuthorities,
  ]);

  // Stale-tab detection. A chat left open while its pod was live can have the service idle-stopped
  // underneath it (the ensure() reaper removes the pod, keeps the PVC), which the hydrate effect —
  // it only re-runs on a session switch or explicit re-hydrate — never sees, so `sessionStatus`
  // stays whatever it was at load and the composer looks usable while the next send would hit a dead
  // pod. When the tab regains focus (the user "re-entering" the chat), re-check the service and, if
  // it was stopped, route into the shared cold-start wait page + auto-resume — the same recovery the
  // send path does reactively, but before the user hits a confusing failed send. Best-effort and
  // read-only: it never fires while a stream, resume, or wait page is already in progress.
  useEffect(() => {
    if (!sessionId) return undefined;
    // Cancelled on teardown (session switch / unmount) so an in-flight status read can't apply a
    // stopped verdict to a chat the user already navigated away from.
    let cancelled = false;
    const checkOnFocus = () => {
      if (document.visibilityState !== 'visible') return;
      // Don't interrupt an active stream, an in-flight resume, an already-showing wait page/modal,
      // or an app-level (re)provision — each already owns the recovery/loader.
      if (isStreaming || isResumingSession || modal !== null || session.status !== 'ready') return;
      // Already known stopped (e.g. set by a prior check or the hydrate path) → straight to the
      // wait page without another round-trip.
      if (sessionStatus === 'STOPPED') {
        setModal('sessionClosedMessages404');
        return;
      }
      void (async () => {
        try {
          const info = await transport.getSession(sessionId);
          if (cancelled) return;
          if (info?.serviceStatus === 'STOPPED') {
            setSessionStatus('STOPPED');
            setModal('sessionClosedMessages404');
          }
        } catch {
          /* best-effort — the send path's own stale-recovery still covers a missed check */
        }
      })();
    };
    document.addEventListener('visibilitychange', checkOnFocus);
    window.addEventListener('focus', checkOnFocus);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', checkOnFocus);
      window.removeEventListener('focus', checkOnFocus);
    };
  }, [sessionId, isStreaming, isResumingSession, modal, session.status, sessionStatus]);

  // Client presence keepalive. The server idle-stops a pod purely on backend activity (last
  // assistant frame / reservation time), so a user sitting on an open chat with no in-flight turn
  // has their pod reclaimed underneath them — the reported hibernation-while-open bug. This effect
  // stamps server-side presence on an interval so an open, in-use tab counts as activity and the
  // pod stays up. Two gates keep it from pinning an ABANDONED tab up forever: (1) it only pings
  // while the tab is visible, and (2) only if the user actually interacted within
  // KEEPALIVE_USER_IDLE_CUTOFF_MS — a tab left visible but untouched stops pinging and is idle-stopped
  // as before. Best-effort: a failed ping is swallowed (a truly dead pod is caught reactively by the
  // send-path / stale-tab recovery). The server no-ops the ping on any non-ACTIVE status.
  useEffect(() => {
    let lastActivityAt = Date.now();
    let lastRecordedAt = 0;
    const recordActivity = () => {
      const now = Date.now();
      // Throttle: a burst of mousemove/scroll events collapses to one timestamp write per window.
      if (now - lastRecordedAt < KEEPALIVE_ACTIVITY_THROTTLE_MS) return;
      lastRecordedAt = now;
      lastActivityAt = now;
    };
    KEEPALIVE_ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, recordActivity, { passive: true }));
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastActivityAt >= KEEPALIVE_USER_IDLE_CUTOFF_MS) return;
      const svcId = serviceIdRef.current || serviceId;
      if (!svcId) return;
      // Only a live pod has an idle clock to advance. A committed chat carries the pod's own status
      // (`ACTIVE`); a freshly-provisioned pending chat reads `ready`. A STOPPED / loading / invalid
      // row is handled by the resume / stale-tab paths, not by pinging, and the server no-ops a ping
      // on any non-ACTIVE row regardless — this gate just avoids the needless round-trip.
      if (sessionStatus !== 'ACTIVE' && sessionStatus !== 'ready') return;
      void transport.sendKeepalive(svcId).catch(() => {
        /* best-effort — reactive recovery covers a genuinely dead pod */
      });
    };
    const interval = window.setInterval(tick, KEEPALIVE_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      KEEPALIVE_ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, recordActivity));
    };
  }, [serviceId, sessionStatus, transport]);

  useEffect(() => {
    // While globally blocked, immediately drop the rendered catalog so ModelSelect cannot disagree
    // with the composer guard. Still re-read the pod below: a startup-direct response can safely
    // repopulate fixed routes, while proxy-backed responses remain hidden until health recovers.
    if (llmBlocked && !startupDirectModelsAvailable) setModels([]);
    // Pending mode: ChatPage's agentBaseUrl may still be a stale localStorage breadcrumb until
    // the adopt effect runs after the provider is ready — hitting listModels earlier 410s a
    // reaped route and bounce-reprovisions. Committed chats own their URL via getSession and
    // must not wait on app-level SessionProvider status (unrelated bounce would stall the catalog).
    if (!sessionId && session.status !== 'ready') return;
    const sid = sessionId || serviceId;
    if (!sid || !agentBaseUrl) return;
    if (sessionId && loadedSessionInfoSid !== sessionId) return;
    const ac = new AbortController();
    const requestEpoch = beginPodCatalogRequest();
    // listModels rides fetchAgentWithRetry, which retries the warm-up window
    // (transient 502/503/504 before the pod is in Service rotation) internally —
    // so this effect is a plain fetch-once. The agent readinessProbe (/ready)
    // means a 200 implies opencode is serving, so the catalog is non-empty.
    // Only the pod's opencode catalog is fetched here — it is genuinely session/pod-scoped. The
    // app-global available-models set rides the shared React Query (availableModelsQuery) instead of
    // this effect, so a session switch / status transition no longer re-fetches it. The two are
    // merged into `models` by the derivation effect below.
    // Re-runs when `llmBlocked` changes so the picker repopulates after proxy recovery. A blocked
    // global proxy does not suppress this read: a newly claimed pod may still advertise a
    // transport-filtered startup-direct catalog that can safely carry the chat until cutover.
    (async () => {
      try {
        const info = await transport.listModels(agentBaseUrl, sid, ac.signal);
        if (ac.signal.aborted) return;
        applyPodCatalog(info, sid, requestEpoch);
        // Seeding selectedModel is handled by a dedicated effect below — it waits for the app-wide
        // default (appInfo) to resolve so the app-default-vs-pod-default choice never races the
        // catalog load. Do NOT seed here (a null appDefaultModel would let the pod default win
        // permanently under `prev ||`).
      } catch (err) {
        // A superseded request may reject with an ordinary transport error even after abort. It no
        // longer owns this session's catalog surface, so ignore it just like a native AbortError.
        if (ac.signal.aborted || (err as Error).name === 'AbortError') return;
        // Session-dead (404/410 after grace retries): the SessionProvider is already
        // bouncing to the loading screen and re-provisioning — a sticky banner here
        // would just dead-end the user on a screen that's about to be replaced.
        if (err instanceof ServiceDeadError) return;
        const catalogError = t(chatRequestErrorKey(err, 'error.loadModelCatalog'));
        applyPodCatalogError(catalogError, sid, requestEpoch);
      }
    })();
    return () => ac.abort();
    // `hydrateNonce` covers the recovery this page drives itself: a row still reading ACTIVE over a
    // dead pod is recovered by recoverService + a nonce-bumped re-hydrate, during which the app-level
    // provider never leaves 'ready' and the relanded session/base/service ids are all identical. With
    // no dep changing, the catalog fetch that failed against the dead pod was never retried and the
    // picker stayed hidden until a manual reload — the swallowed-ServiceDeadError dead end above
    // assumes a provider bounce that this path does not produce.
    // `llmBlocked` clears the cache while out and re-fetches when health returns to `none`.
    // `modelRefreshNonce` is the on-demand re-read: the pod scrapes LiteLLM on its own timer, so
    // opening the picker cannot make it scrape — but it can surface a scrape that already
    // happened, which is what turns a `pending` option into an available (or definitively
    // unavailable) one without waiting for the next turn.
  }, [
    sessionId,
    agentBaseUrl,
    applyPodCatalog,
    applyPodCatalogError,
    beginPodCatalogRequest,
    serviceId,
    session.status,
    hydrateNonce,
    modelRefreshNonce,
    llmBlocked,
    loadedSessionInfoSid,
    startupDirectModelsAvailable,
    t,
    transport,
  ]);

  // Merge the pod catalog with the app-global available-models set into the picker options. Runs
  // whenever either input changes — a session switch (new podModels) or an admin registry change
  // that invalidated the shared available-models query (new query data). The C3 backend's `source`
  // decides the merge (see buildModelOptions):
  //   - 'static'  → the pod catalog is the option set; the C3 list overlays admin display names by id.
  //   - 'litellm' → the C3 list is the option set; the pod catalog is joined by id for capabilities.
  // A missing/failed available-set falls back to an empty static result — identical to the old
  // inline `.catch(() => ({ source: 'static', models: [] }))`, so the pod catalog still renders.
  // Wait for the available query to SETTLE (success or error) before the first merge: in 'litellm'
  // mode the available list IS the option set, so merging against a still-loading (empty) set would
  // briefly blank the picker. The old effect awaited both together, so it never flashed empty — this
  // guard preserves that. On error, isPending clears and the static fallback renders the pod catalog.
  useEffect(() => {
    // Strict/legacy proxy catalogs stay hidden behind the global outage gate. A startup-direct
    // catalog is different: the pod has just filtered it through the same transport admission rule
    // as /query, so expose those fixed choices while Auto remains independently unavailable.
    if (llmBlocked && !startupDirectModelsAvailable) return;
    if (!scopedPodModels || availableModelsQuery.isPending) return;
    const available = availableModelsQuery.data ?? { source: 'static' as const, models: [] };
    // How stale this registry snapshot is, on THIS clock — the only thing buildModelOptions needs
    // to tell a pod that is still converging on a just-registered model from one that has already
    // asked and does not carry it. Compared against the pod's self-reported refresh age, so the
    // two never cross clocks. 0 when the query has no timestamp yet (a snapshot just taken).
    const registryAgeMs = availableModelsQuery.dataUpdatedAt
      ? Math.max(0, Date.now() - availableModelsQuery.dataUpdatedAt)
      : 0;
    const mergedModels = buildModelOptions(scopedPodModels, available, registryAgeMs);
    setModels(llmBlocked && startupDirectModelsAvailable ? mergedModels.filter(isDirectModelRoute) : mergedModels);
  }, [
    scopedPodModels,
    availableModelsQuery.data,
    availableModelsQuery.dataUpdatedAt,
    availableModelsQuery.isPending,
    llmBlocked,
    startupDirectModelsAvailable,
  ]);

  const strictPublishedPolicy =
    availableModelsQuery.data?.source === 'litellm' && !!availableModelsQuery.data.policyGeneration;
  const strictPodCatalog = scopedPodModels?.catalog?.routingContractVersion ? scopedPodModels.catalog : null;
  const autoRoutingState = useMemo(
    () => resolveAutoAvailability(availableModelsQuery.data, scopedPodModels),
    [availableModelsQuery.data, scopedPodModels]
  );

  // Either authority can advance first. On a generation mismatch, re-read both once so a newer app
  // policy can reach the pod and a newer pod policy can replace a stale React Query snapshot.
  useEffect(() => {
    const podGeneration = strictPodCatalog?.policyGeneration;
    const appGeneration = availableModelsQuery.data?.policyGeneration;
    if (!podGeneration || !appGeneration || podGeneration === appGeneration) {
      policyConvergenceRefetchRef.current = '';
      return;
    }
    const mismatchKey = `${appGeneration}:${podGeneration}`;
    if (policyConvergenceRefetchRef.current === mismatchKey) return;
    policyConvergenceRefetchRef.current = mismatchKey;
    setModelRefreshNonce((n) => n + 1);
    const rearmAfterFailure = () => {
      if (policyConvergenceRefetchRef.current === mismatchKey) policyConvergenceRefetchRef.current = '';
    };
    void Promise.resolve(availableModelsQuery.refetch()).then((result) => {
      if ((result as { isError?: boolean } | undefined)?.isError) rearmAfterFailure();
    }, rearmAfterFailure);
  }, [availableModelsQuery.data?.policyGeneration, availableModelsQuery.refetch, strictPodCatalog?.policyGeneration]);

  // An inherited default is a preference, not a user pin. If a concrete route disappears, recover
  // visibly to viable Auto; if Auto itself becomes nonviable, recover to the best available fixed
  // default. Explicit selections remain sticky and blocked. The server repeats the same admission
  // rule, so a stale tab that has not refetched still gets the identical safe fallback.
  useEffect(() => {
    if (modelSelectionIntentRef.current !== 'inherited' || !scopedPodModels) return;
    // Initial selection belongs to the seed effect; only an authoritative reset resolves an
    // empty inherited preference here. Two seed owners would race appInfo and currentModel.
    if (!selectedModel && (!modelHydrated || appDefaultModel === null)) return;
    if (strictPodCatalog?.applyPending) return;
    if (
      strictPodCatalog &&
      strictPublishedPolicy &&
      strictPodCatalog.policyGeneration !== availableModelsQuery.data?.policyGeneration
    )
      return;
    if (selectedModel === 'auto') {
      if (autoRoutingState.availability !== 'unavailable') return;
    } else if (selectedModel) {
      const unavailable = !scopedPodModels.models.some((model) => model.id === selectedModel);
      if (!unavailable) return;
      if (autoRoutingState.availability === 'available') {
        setSelectedModel('auto');
        return;
      }
    }

    // An empty inherited value means the current default, not explicit Auto and not the pod's
    // last-used pin. Resolve its visible choice without changing inherited persistence intent.
    const preferredIds = !selectedModel
      ? [appDefaultModel, availableModelsQuery.data?.defaultModel, defaultModel]
      : [availableModelsQuery.data?.defaultModel, appDefaultModel, defaultModel];
    if (!selectedModel && preferredIds.find(Boolean) === 'auto' && autoRoutingState.availability === 'available') {
      setSelectedModel('auto');
      return;
    }
    const fallback =
      preferredIds
        .map((id) => models.find((model) => model.id === id && (model.availability ?? 'available') === 'available'))
        .find(Boolean) || models.find((model) => (model.availability ?? 'available') === 'available');
    if (fallback && fallback.id !== selectedModel) setSelectedModel(fallback.id);
  }, [
    appDefaultModel,
    autoRoutingState.availability,
    availableModelsQuery.data?.defaultModel,
    defaultModel,
    models,
    scopedPodModels?.models,
    modelHydrated,
    selectedModel,
    strictPodCatalog,
    strictPublishedPolicy,
    availableModelsQuery.data?.policyGeneration,
  ]);

  const selectedRouteState: { availability: ModelAvailability; reason?: ModelAvailabilityReason } = (() => {
    if (!scopedPodModels) return { availability: 'pending', reason: 'syncing' };
    if (!selectedModel || selectedModel === 'auto') return autoRoutingState;
    if (strictPodCatalog) {
      if (strictPodCatalog.applyPending || !strictPodCatalog.policyGeneration) {
        return { availability: 'pending', reason: 'syncing' };
      }
      if (strictPublishedPolicy && strictPodCatalog.policyGeneration !== availableModelsQuery.data?.policyGeneration) {
        return { availability: 'pending', reason: 'syncing' };
      }
      return scopedPodModels?.models.some((model) => model.id === selectedModel)
        ? { availability: 'available' }
        : { availability: 'unavailable', reason: 'notServed' };
    }
    // A non-strict pod is still authoritative about its own selectable rows: GET /models has
    // already filtered this list through the live /query transport policy. Do not let an app-policy
    // loading state resurrect a stale pin that this pod omitted.
    return scopedPodModels.models.some((model) => model.id === selectedModel)
      ? { availability: 'available' }
      : { availability: 'unavailable', reason: 'notServed' };
  })();
  const explicitModelSelected = !!selectedModel && selectedModel !== 'auto';
  const selectedPodModel = scopedPodModels?.models.find((model) => model.id === selectedModel);
  const startupDirectRouteSelected = !!(
    startupDirectModelsAvailable &&
    explicitModelSelected &&
    selectedPodModel &&
    isDirectModelRoute(selectedPodModel)
  );
  // On a healthy service, preserve the pre-contract behavior for a restored explicit pin while its
  // first pod read is in flight; the server remains the admission authority. Never extend that
  // optimistic window to Auto, which cannot run without a positively verified proxy-backed tier.
  const optimisticHealthyExplicitRoute = !scopedPodModels && explicitModelSelected && llmBlockReason === 'none';
  const degradedStartupDirectMode = llmBlocked && startupDirectModelsAvailable;
  // Clearing the global health block only exposes the picker. In degraded startup-direct mode,
  // the exact selected row must itself be a transport-filtered direct route; another direct row
  // cannot make a stale pin, a LiteLLM row, or Auto sendable.
  const selectedRouteSendAllowed = degradedStartupDirectMode
    ? startupDirectRouteSelected
    : selectedRouteState.availability === 'available' || startupDirectRouteSelected || optimisticHealthyExplicitRoute;
  // Do not label an intentionally usable compatibility route as "syncing" while its background
  // verification continues. Recovery polling still keys off selectedRouteState below.
  const selectedRouteDisplayState = degradedStartupDirectMode
    ? startupDirectRouteSelected
      ? { availability: 'available' as const }
      : !selectedModel || selectedModel === 'auto'
        ? selectedRouteState
        : { availability: 'unavailable' as const, reason: 'notServed' as const }
    : selectedRouteSendAllowed && selectedRouteState.availability === 'pending'
      ? { availability: 'available' as const }
      : selectedRouteState;

  // The app policy can become visible before the pod's convergence loop applies it, and a proxy
  // can recover without changing either generation. Keep re-reading both authorities with bounded
  // exponential backoff while the selected route is not sendable. Recovery therefore does not
  // depend on opening the picker, and a prolonged outage never creates a tight polling loop.
  useEffect(() => {
    const podGeneration = strictPodCatalog?.policyGeneration;
    const appGeneration = availableModelsQuery.data?.policyGeneration;
    const generationMismatch = !!podGeneration && !!appGeneration && podGeneration !== appGeneration;
    // A failed first /models read is itself a recovery condition. Do not require the app-wide
    // LiteLLM policy query to have succeeded: startup-direct pods, old backends, and transient
    // policy-query failures still need to re-read their pod catalog without a picker open/reload.
    const catalogReadEligible =
      !!agentBaseUrl &&
      !!(sessionId || serviceId) &&
      (!sessionId ? session.status === 'ready' : loadedSessionInfoSid === sessionId);
    const initialCatalogReadPending = catalogReadEligible && !scopedPodModels;
    const cutoverEvidence = strictPublishedPolicy || serviceHealthData?.llmProxy?.ready === true;
    const podCanConverge = !!strictPodCatalog || !!(scopedPodModels?.routingActivationSupported && cutoverEvidence);
    const routeRecoveryPending =
      catalogReadEligible && podCanConverge && selectedRouteState.availability !== 'available';
    // A startup-direct response is transitional only when the pod explicitly advertises the
    // in-place activation machinery and the app has published a strict policy or the proxy is
    // ready. Old and standalone pods omit/deny the capability, so they never poll for an impossible
    // cutover; a capable pod keeps recovering across proxy restarts without requiring picker-open.
    const startupDirectCutoverPending =
      catalogReadEligible &&
      startupDirectModelsAvailable &&
      scopedPodModels?.routingActivationSupported === true &&
      cutoverEvidence;
    const convergencePending =
      strictPodCatalog?.applyPending === true ||
      generationMismatch ||
      initialCatalogReadPending ||
      routeRecoveryPending ||
      startupDirectCutoverPending;
    if (!convergencePending) {
      policyConvergencePollAttemptRef.current = 0;
      return;
    }
    const attempt = policyConvergencePollAttemptRef.current;
    const podRefreshCadence = Math.max(250, strictPodCatalog?.refreshIntervalMs || 30_000);
    const delayMs = Math.min(podRefreshCadence, 1_000 * 2 ** Math.min(attempt, 5));
    const timer = window.setTimeout(() => {
      policyConvergencePollAttemptRef.current = Math.min(attempt + 1, 5);
      setModelRefreshNonce((n) => n + 1);
      // The production query always exposes refetch; the runtime guard also keeps older embedded
      // clients/test adapters from turning pod-catalog recovery into an exception.
      if (typeof availableModelsQuery.refetch === 'function') void availableModelsQuery.refetch();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [
    availableModelsQuery.data?.policyGeneration,
    availableModelsQuery.refetch,
    agentBaseUrl,
    loadedSessionInfoSid,
    modelRefreshNonce,
    scopedPodModels,
    serviceId,
    serviceHealthData?.llmProxy?.ready,
    session.status,
    sessionId,
    selectedRouteState.availability,
    startupDirectModelsAvailable,
    strictPodCatalog?.applyPending,
    strictPodCatalog?.policyGeneration,
    strictPodCatalog?.refreshIntervalMs,
  ]);

  // Opening the picker while any route is pending or unavailable is an explicit recovery gesture:
  // re-read both authorities so a repaired proxy/catalog can make the composer usable again.
  const handleModelSelectOpen = useCallback(() => {
    if (
      autoRoutingState.availability === 'available' &&
      selectedRouteState.availability === 'available' &&
      !models.some((m) => m.availability && m.availability !== 'available')
    ) {
      return;
    }
    refreshRoutingAuthorities();
  }, [autoRoutingState.availability, models, refreshRoutingAuthorities, selectedRouteState.availability]);

  // Fetch the next older page (keyset cursor = oldest held frame) and prepend it.
  // Re-entrancy guarded by loadingOlderRef so a burst of sentinel intersections
  // can't fire overlapping fetches. prependPrevHeightRef captures the pre-prepend
  // scrollHeight so the layout effect can re-anchor the viewport after the DOM grows.
  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreOlder || !agentBaseUrl || !sessionId) return;
    const cursor = olderCursor(messagesRef.current);
    if (!cursor) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    prependPrevHeightRef.current = scrollRef.current ? scrollRef.current.scrollHeight : null;
    try {
      // No `limit` here on purpose — older pages use the pod's default page size.
      const result = await transport.fetchSessionMessages(agentBaseUrl, sessionId, {
        beforeTs: cursor.beforeTs,
        beforeId: cursor.beforeId,
      });
      setMessages((prev) => prependOlder(prev, result.messages));
      setHasMoreOlder(result.hasMore);
    } catch {
      prependPrevHeightRef.current = null;
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [hasMoreOlder, agentBaseUrl, sessionId]);

  const scrollToBottom = useCallback(() => {
    // Auto-follow only while pinned. Once the user scrolls away (tracked below)
    // we leave their position alone until they scroll back to the bottom.
    if (userScrolledRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    // Clamp to 0: when the transcript is shorter than the viewport the raw value
    // is negative, which would never actually move scrollTop. Instant (not
    // smooth): a smooth animation spans several frames and would fight the next
    // streamed chunk; we only scroll here while already pinned anyway.
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    scrollLastTopRef.current = el.scrollTop;
  }, []);

  const handleScrollToBottom = useCallback(() => {
    userScrolledRef.current = false;
    setShowScrollToBottom(false);
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      scrollLastTopRef.current = el.scrollTop;
    }
  }, []);

  const lastLearningReceiptRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = learningProposal?.id || null;
    if (!id || id === lastLearningReceiptRef.current) return;
    lastLearningReceiptRef.current = id;
    // Respect a user reading earlier messages. If they are pinned, reveal the receipt in the same
    // pre-paint path used for streamed transcript growth; otherwise the existing jump affordance
    // remains their explicit way back down.
    scrollToBottom();
  }, [learningProposal?.id, scrollToBottom]);

  // Re-anchor the viewport after an older page is prepended so the content the user
  // was reading stays put (the transcript grew above the fold). Runs BEFORE the
  // scrollToBottom effect below so the anchor delta is applied before any auto-follow.
  useLayoutEffect(() => {
    const prevHeight = prependPrevHeightRef.current;
    if (prevHeight == null) return;
    prependPrevHeightRef.current = null;
    const el = scrollRef.current;
    if (!el) return;
    const delta = el.scrollHeight - prevHeight;
    if (delta > 0) {
      el.scrollTop += delta;
    }
  }, [messages]);

  // useLayoutEffect (not useEffect): snap to the bottom synchronously, before the
  // browser paints the just-grown transcript — otherwise each streamed chunk
  // paints one frame at the old offset and then jumps, which reads as jitter.
  useLayoutEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Inline app anchors register one layout pass after their transcript message. Follow that
  // second growth only when the reader is already pinned; otherwise the app can appear behind
  // the composer with the jump control floating over its content.
  useLayoutEffect(() => {
    if (mountedInlineAppKeys) scrollToBottom();
  }, [mountedInlineAppKeys, scrollToBottom]);

  // An inline app can grow again after its anchor mounts (for example when its iframe finishes
  // sizing). Follow that late layout change while pinned; scrollToBottom preserves readers who
  // intentionally moved up.
  useLayoutEffect(() => {
    const content = scrollNode?.firstElementChild;
    if (!content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(scrollToBottom);
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollNode, scrollToBottom]);

  const removePendingAt = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const onPickFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (!list?.length) return;
      // Materialize the FileList into a plain array BEFORE resetting the input —
      // `list` is a live reference to `e.target.files`, so clearing the value
      // first would empty it and drop every pick. Reset afterward so picking the
      // same (e.g. rejected) file again still fires onChange.
      const picked = Array.from(list);
      e.target.value = '';
      const max = CHAT_ATTACHMENT_CONFIG.maxPendingFiles;
      const { withinLimit, oversize } = splitFilesBySize(picked, CHAT_ATTACHMENT_CONFIG.maxFileBytes);
      // Reject oversize files up front with a clear message — never queue or
      // send them (the agent server refuses them anyway, slowly).
      if (oversize.length) {
        setError(
          t('error.fileTooLarge', {
            count: oversize.length,
            names: oversize.map((f) => f.name).join(', '),
            limit: formatSize(CHAT_ATTACHMENT_CONFIG.maxFileBytes),
          })
        );
      }
      if (!withinLimit.length) return;
      setPendingFiles((prev) => {
        const next = [...prev];
        for (const file of withinLimit) {
          if (next.length >= max) break;
          next.push({ id: `${file.name}-${Date.now()}-${next.length}`, file });
        }
        return next;
      });
    },
    [t]
  );

  // Re-bind whenever the scroll node mounts/unmounts. A []-only effect misses the
  // common landing path: hashless /chat renders without ChatColumn, then redirects
  // to /chat#<id> without remounting ChatPage — listeners would never attach and
  // streaming would keep yanking the viewport.
  useEffect(() => {
    const el = scrollNode;
    if (!el) return;

    const atBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight <= 2;
    scrollLastTopRef.current = el.scrollTop;
    const setAway = (away: boolean) => {
      userScrolledRef.current = away;
      setShowScrollToBottom(away);
    };
    // Track by DIRECTION, not a slack zone. Any upward movement away from the
    // bottom stops auto-follow — so even a slow, one-line-at-a-time scroll escapes.
    const onScroll = () => {
      const top = el.scrollTop;
      const delta = top - scrollLastTopRef.current;
      scrollLastTopRef.current = top;
      if (delta < -1 && !atBottom()) setAway(true);
      else if (delta > 1 && atBottom()) setAway(false);
    };
    const onScrollUpIntent = () => setAway(true);
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) onScrollUpIntent();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchmove', onScrollUpIntent, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchmove', onScrollUpIntent);
    };
  }, [scrollNode]);

  // Auto-load older pages when the top sentinel scrolls into view. Only attached
  // while there's more history (the sentinel only renders under that same gate),
  // and loadOlder is itself re-entrancy guarded.
  useEffect(() => {
    const el = topSentinelRef.current;
    if (!el || !hasMoreOlder) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadOlder();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreOlder, loadOlder]);

  const executeQuery = useCallback(
    async (
      prompt: string,
      baseUrl: string,
      activeSessionId: string,
      files?: File[]
    ): Promise<'ok' | 'stale' | 'dead' | 'question'> => {
      // activeSessionId is the caller's source of truth — it may be a freshly-
      // created id that hasn't flushed to React state yet (pending → committed
      // transition). The closure's `sessionId` would be stale-undefined.
      setSessionLastUsed(activeSessionId);

      const abort = new AbortController();
      abortRef.current = abort;
      let sawQuestion = false;
      // Sidebar running pill: this browser now believes a turn is in flight for this chat.
      markTurnRunning(activeSessionId);

      // Whatever happens — Stop click (AbortError), opencode idle (clean exit),
      // network error, thrown stale error — any tool still RUNNING/PENDING at
      // function exit is orphaned. Flip to CANCELLED. No-op on normal turn end
      // (tools are already terminal). See PLAT-149034.
      const finalizeStream = () => setMessages((prev) => finalizeOrphanedFrames(prev));
      try {
        const applyFrame = (msg: ChatMessage) => {
          noteLearningReviewQueued(msg);
          if (handleMcpAuthExpiredFrame(msg)) return;
          if (handleCrossClusterAuthFrame(msg)) return;
          if (msg.turnId) {
            setActiveStreamTurnId(msg.turnId);
          }
          if (msg.id) {
            setLastStreamMessageId(msg.id);
          }
          if (msg.kind === 'QUESTION') {
            setPendingQuestion(msg);
            sawQuestion = true;
          }
          // In-band ERROR frame (agent/tool failure mid-turn): record what to resend so the
          // Retry control on this error bubble can re-send the same prompt + attachments.
          if (msg.kind === 'ERROR' && msg.id) {
            retryPayloadRef.current.set(msg.id, { prompt, files });
          }
          setMessages((prev) => {
            let next = transport.mergeFrame(prev, msg);
            if (msg.kind === 'TEXT' && msg.role === 'USER' && pendingUserAttachmentsRef.current.length > 0) {
              const batch = pendingUserAttachmentsRef.current.shift();
              const idx = next.findIndex((m) => m.id === msg.id);
              if (batch?.length && idx >= 0) {
                next = [...next];
                next[idx] = { ...next[idx], attachments: batch };
              } else if (batch?.length) {
                pendingUserAttachmentsRef.current.unshift(batch);
              }
            }
            return next;
          });
        };

        // Persist only an explicit model choice. An inherited app/pod default is a preference, not
        // a pin: writing it to Session.llmModel would make a later hydrate indistinguishable from a
        // user selection and prevent safe recovery to Auto if that route disappears. When the
        // send-time persistence guards below permit a write, '' requests clearing an inherited
        // value on a best-effort basis; hydration alone does not clear it. Effort keeps its existing
        // pin semantics. Fire-and-forget: never blocks a turn.
        const effortArg = pinnedEffort || '';
        const selectionIntent = modelSelectionIntentRef.current === 'inherited' ? 'inherited' : 'explicit';
        const persistedModel = selectionIntent === 'explicit' ? selectedModel : '';
        const persistKey = `${activeSessionId}:${persistedModel}:${selectionIntent}:${effortArg}`;
        const needsPersist = !!persistedModel || effortArg !== '' || modelPersistedRef.current !== null;
        if (activeSessionId && needsPersist && modelPersistedRef.current !== persistKey) {
          modelPersistedRef.current = persistKey;
          void transport.updateSessionModel(activeSessionId, persistedModel, effortArg, selectionIntent).catch(() => {
            /* non-fatal — retried next turn via the ref reset below */
            modelPersistedRef.current = null;
          });
        }
        const conversationId = remoteConversationUrl
          ? remoteConversationUrl.replace(/\/$/, '').split('/').pop()
          : undefined;

        // Attachment upload progress: seed an indeterminate indicator before the
        // multipart POST; the callback fills in byte counts, cleared once the first
        // response frame lands or the turn ends. Only the file-bearing path reports it.
        if (files?.length) setUploadProgress({ loaded: 0, total: 0 });
        try {
          for await (const msg of transport.streamQuery(
            baseUrl,
            prompt,
            activeSessionId,
            abort.signal,
            selectedModel || undefined,
            files,
            conversationId,
            effortToSend || undefined,
            files?.length ? (p) => setUploadProgress(p) : undefined,
            selectionIntent
          )) {
            // First response frame = upload done, agent replying — hand off to the
            // streaming indicator (React dedupes the repeated null set).
            setUploadProgress(null);
            applyFrame(msg);
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            throw err;
          }
          if (routingQueryErrorKey(err)) {
            refreshRoutingAuthorities();
            throw err;
          }
          if (isDeadQueryStreamError(err)) {
            return 'dead';
          }
          if (isStaleQueryStreamError(err)) {
            return 'stale';
          }
          throw err;
        } finally {
          setUploadProgress(null);
        }
        return sawQuestion ? 'question' : 'ok';
      } finally {
        finalizeStream();
        // Stream over without a client-side abort → the turn itself ended (completion,
        // question pause, idle, error) → drop the running mark. An abort means either
        // Stop (onStop clears explicitly, plus stopQuery ends the turn) or a session
        // switch/unmount — there the pod keeps executing, so the mark must survive.
        if (!abort.signal.aborted) clearTurnRunning(activeSessionId);
      }
    },
    [
      serviceId,
      selectedModel,
      pinnedEffort,
      effortToSend,
      remoteConversationUrl,
      handleMcpAuthExpiredFrame,
      handleCrossClusterAuthFrame,
      noteLearningReviewQueued,
      refreshRoutingAuthorities,
    ]
  );

  // Recover the pod and re-read the session so the caller can retry against the (possibly new)
  // base. Shared by the send-path stale/dead recovery and the resume-stale modal confirm. Uses
  // transport.recoverService (NOT resumeService): the row may still read ACTIVE — which resume no-ops on —
  // because myService trusts the DB status; recover probes the pod and stop+resumes only a truly
  // unreachable one. Returns the agentBaseUrl to retry against.
  const recoverAndReattach = useCallback(
    async (svcId: string, sid: string): Promise<string> => {
      await transport.recoverService(svcId);
      refreshRoutingAuthorities();
      const info = await transport.getSession(sid);
      if (info?.agentBaseUrl) setAgentBaseUrl(info.agentBaseUrl);
      if (info?.serviceStatus) setSessionStatus(info.serviceStatus);
      return info?.agentBaseUrl || agentBaseUrl;
    },
    [agentBaseUrl, refreshRoutingAuthorities, transport]
  );

  const respondToQuestion = useCallback(
    async (answer: string) => {
      if (!sessionId || !agentBaseUrl || !pendingQuestion || isStreaming) return;
      const answeredQuestion = pendingQuestion;
      setPendingQuestion(null);
      setActiveStreamTurnId(null);
      setLastStreamMessageId(null);
      beginStreaming();
      setError('');
      userScrolledRef.current = false;

      const optimisticUserId = `user-local-${Date.now()}`;
      setMessages((prev) => [...prev, { id: optimisticUserId, kind: 'TEXT', role: 'USER', text: answer }]);

      const abort = new AbortController();
      abortRef.current = abort;
      // Answering the question resumes the paused turn — mark it running again.
      markTurnRunning(sessionId);

      try {
        for await (const msg of transport.streamRespond(agentBaseUrl, answer, sessionId, abort.signal)) {
          noteLearningReviewQueued(msg);
          if (handleMcpAuthExpiredFrame(msg)) continue;
          if (handleCrossClusterAuthFrame(msg)) continue;
          if (msg.turnId) setActiveStreamTurnId(msg.turnId);
          if (msg.id) setLastStreamMessageId(msg.id);
          if (msg.kind === 'QUESTION') {
            setMessages((prev) => transport.mergeFrame(prev, msg));
            setPendingQuestion(msg);
            // The question is ready to display, but the previous turn still owns admission
            // until the server closes this stream after its asynchronous cleanup.
            continue;
          }
          setMessages((prev) => transport.mergeFrame(prev, msg));
        }
        try {
          const requestEpoch = beginPodCatalogRequest();
          const info = await transport.listModels(agentBaseUrl, sessionId);
          // The same response already carries the pod's catalog and its convergence state, so keep
          // the picker's pod half current from it rather than leaving it frozen at mount.
          applyPodCatalog(info, sessionId, requestEpoch);
        } catch {
          /* non-fatal */
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          const routingErrorKey = routingQueryErrorKey(err);
          if (routingErrorKey) {
            refreshRoutingAuthorities();
            // Routing rejected before the paused turn resumed. Restore the exact question and
            // answer draft, and remove the optimistic bubble so the user can retry safely.
            setPendingQuestion(answeredQuestion);
            setInput(answer);
            setMessages((prev) => prev.filter((message) => message.id !== optimisticUserId));
          }
          const msg = t(routingErrorKey || chatRequestErrorKey(err, 'error.responseFailed'));
          const errId = `err-${Date.now()}`;
          if (routingErrorKey) retryPayloadRef.current.set(errId, { prompt: answer });
          setError(msg);
          setMessages((prev) => [...prev, { id: errId, kind: 'ERROR', text: msg }]);
          // PLAT-148695 Resolved decision §3: treat non-Abort stream error like
          // Stop — restore queued text to the textarea so the user decides
          // whether to retry. Reading queuedMessage via the setter callback
          // avoids forcing it into respondToQuestion's deps.
          if (!routingErrorKey) {
            setQueuedMessage((qm) => {
              if (qm != null) setInput(qm.text);
              return null;
            });
            dropQueued(sessionId);
          }
        }
      } finally {
        commitThoughtDuration(queryStartedAtRef, streamingTurnKeyRef, messagesRef.current, setThoughtDurationByTurnKey);
        // Flip any orphaned RUNNING/PENDING tool calls to CANCELLED — see
        // executeQuery's finalizeStream comment. PLAT-149034.
        setMessages((prev) => finalizeOrphanedFrames(prev));
        setActiveStreamTurnId(null);
        setLastStreamMessageId(null);
        setIsStreaming(false);
        abortRef.current = null;
        // Same rule as executeQuery: non-aborted stream end = turn over → drop the mark.
        if (!abort.signal.aborted) clearTurnRunning(sessionId);
        composerBridgeRef.current?.focus ? composerBridgeRef.current.focus() : inputRef.current?.focus();
      }
    },
    [
      sessionId,
      agentBaseUrl,
      applyPodCatalog,
      beginPodCatalogRequest,
      pendingQuestion,
      isStreaming,
      beginStreaming,
      handleMcpAuthExpiredFrame,
      handleCrossClusterAuthFrame,
      noteLearningReviewQueued,
      refreshRoutingAuthorities,
    ]
  );

  const onPermissionRespond = useCallback(
    async (permissionId: string, response: PermissionResponse) => {
      if (!sessionId || !agentBaseUrl) return;
      try {
        await transport.respondPermission(agentBaseUrl, sessionId, permissionId, response);
      } catch (err) {
        setError(t(chatRequestErrorKey(err, 'error.permissionFailed')));
        throw err;
      }
    },
    [sessionId, agentBaseUrl]
  );

  const handleFeedback = useCallback(
    (turnId: string, rating: FeedbackRating, categories: string[], comment: string) => {
      if (!sessionId || !agentBaseUrl) return;
      void transport.submitFeedback(agentBaseUrl, sessionId, turnId, rating, categories, comment);
    },
    [sessionId, agentBaseUrl]
  );

  // The optional `override` argument lets the drain useEffect (PLAT-148695) fire
  // a queued message without touching the composer's `input` / `pendingFiles` —
  // the user may have typed something new during the active stream that we
  // mustn't clobber. When `override` is set, gather and clearing both route off
  // the override instead of state.
  const sendMessage = useCallback(
    async (override?: { text: string; files?: File[] }) => {
      if (speechIsListening) speechStop();
      const prompt = (override?.text ?? input).trim();
      if (pendingQuestion && prompt) {
        if (!override) setInput('');
        respondToQuestion(prompt);
        return;
      }
      const staged: File[] = override?.files ?? pendingFiles.map((p) => p.file);
      const stagedNames = staged.map((f) => f.name);
      const hasStaged = stagedNames.length > 0;
      // Pending mode: no Session row exists yet (user clicked "+ New chat" and is
      // sending their first message). We need a serviceId to attach to, and agentBaseUrl
      // to stream against — both are carried over from the previous session in state.
      if ((!prompt && !hasStaged) || isStreaming || !agentBaseUrl || (!sessionId && !serviceId)) return;
      // Keep mutable locals for the duration of this send. Creating a pending chat can re-home it
      // to a different profile/service, and the rest of this callback must stream through the
      // authoritative service/base URL before React renders the adopted state.
      let activeServiceId = serviceId;
      let activeAgentBaseUrl = agentBaseUrl;
      // Agent service idle-stopped underneath this page (PLAT-148086 origin). Don't silently
      // swallow the send: surface the shared cold-start wait page and auto-resume the service
      // (recoverService + re-hydrate). The composer text is left intact (cleared only past this
      // point) so the turn can be sent once the pod is back — matching the fresh cold-start flow.
      if (sessionStatus === 'STOPPED') {
        setModal('sessionClosedMessages404');
        return;
      }

      // Synchronous re-entrance guard. Without this, a fast double-Enter during the
      // `addSession` await in pending mode would race past the (still-false)
      // isStreaming check and create a second Session for the same user prompt.
      if (sendInFlightRef.current) return;
      sendInFlightRef.current = true;

      // Show the user's message + streaming indicator immediately, before the
      // addSession round-trip below. On an existing session this is a no-op
      // reordering (addSession is skipped entirely), but on a brand-new chat
      // addSession is a real server round-trip (session row + pod instructions
      // delivery + default-app binding) that used to leave the UI showing nothing
      // at all for the duration. Rolled back via rollbackOptimisticSend() in every
      // addSession failure branch below.
      const queryText = prompt || ATTACHED_FILES_PLACEHOLDER;
      setActiveStreamTurnId(null);
      setLastStreamMessageId(null);
      const optimisticUserId = `user-local-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: optimisticUserId,
          kind: 'TEXT',
          role: 'USER',
          text: queryText,
          ...(hasStaged ? { attachments: stagedNames } : {}),
          // Only messages composed in rich mode render as markdown in their bubble; plain-typed
          // text stays verbatim (whitespace-pre-wrap) so dev content like `run make_x` or `1. foo`
          // isn't mangled by markdown parsing. See MessageBlock's user-bubble branch.
          ...(composerBridgeRef.current?.richMode ? { composedRich: true } : {}),
        },
      ]);
      beginStreaming();
      setError('');
      userScrolledRef.current = false;

      // Clear the composer immediately too — leaving it gated behind the addSession
      // await meant the just-sent text sat in the box for however long session
      // creation took, even though the message had already appeared above. For
      // pending mode `sessionId` is still undefined here (closure value pre-navigate),
      // so this clears the `__new__` draft slot before the re-hydrate effect can fire
      // on the new session id and re-import the just-sent text. Skipped on the
      // queued-drain path (override) — the user may have typed something new during
      // the active stream that we mustn't clobber; enqueueMessage already cleared the
      // slot. Restored by rollbackOptimisticSend on failure so a failed send doesn't
      // lose the draft.
      const clearedInput = !override;
      if (clearedInput) {
        clearDraft(sessionId);
        setInput('');
        setPendingFiles([]);
      }
      const rollbackOptimisticSend = () => {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUserId));
        setIsStreaming(false);
        if (clearedInput) {
          setDraft(sessionId, prompt);
          setInput(prompt);
          setPendingFiles(pendingFiles);
        }
      };

      // Promote pending → committed by creating the Session row on the existing service,
      // then flip the URL to /chat#<newSessionId> via `replace` so back-button still
      // lands on whatever the user was on before "+ New chat". From this point on
      // everything in this function uses activeSessionId; React state catches up on
      // the next render.
      let activeSessionId = sessionId;
      if (!activeSessionId) {
        const effectiveDefId = selectedAgentDefId || agentDefId;
        try {
          activeSessionId = await transport.addSession(activeServiceId, effectiveDefId);
          const adopted = await adoptCreatedSession(activeSessionId);
          if (!adopted?.agentBaseUrl && !activeAgentBaseUrl) {
            throw new Error('createSession returned no agentBaseUrl');
          }
          activeServiceId = serviceIdRef.current || adopted?.serviceId || activeServiceId;
          activeAgentBaseUrl = adopted?.agentBaseUrl || activeAgentBaseUrl;
          pendingPromotionSidRef.current = activeSessionId;
          // Carry any client-staged targets into this freshly-created session; the staged-apply
          // effect binds them once the pod is ready (see stagedApplyRef).
          if (stagedAppIdsRef.current.length) {
            stagedApplyRef.current = { sid: activeSessionId, appIds: stagedAppIdsRef.current.slice() };
          }
          navigate(`/chat#${activeSessionId}`, { replace: true });
          // Two-stage sidebar update so the new row appears the instant the user
          // hits send, not after the next listSessionsForService poll:
          //   1. Optimistic row (rendered immediately from the id we just got).
          //   2. refreshKey bump triggers a server refetch; once that lands, the
          //      real row replaces the optimistic one via id-dedup in the sidebar.
          setOptimisticSidebarSession({ id: activeSessionId, createdAt: new Date().toISOString() });
          setSidebarRefreshKey((k) => k + 1);
          window.setTimeout(() => setOptimisticSidebarSession(null), 3000);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // Selected agent Definition was deleted between picker render and send.
          // Clear the stale selection and refresh the picker so the next attempt
          // either uses the default agent or shows the current inventory.
          if (/Agent definition .+ not found/.test(msg)) {
            setSelectedAgentDefId(null);
            setLockedAgentName(null);
            setAgentPickerRefreshKey((k) => k + 1);
            setError(msg);
            rollbackOptimisticSend();
            sendInFlightRef.current = false;
            return;
          }
          // Tombstoned pod — the Service row is gone (reaped/terminated). Three shapes:
          //  - the HTTP status stamped on the thrown error: createSession goes through apiCore's
          //    `c3call`, which stamps `.status`, and it now 404s on a missing Service row — the
          //    authoritative signal, checked first so classification never depends on prose
          //    surviving the wire. (Only `c3call` stamps `.status`; a `restCall` throw carries
          //    none — the message arms below still catch that case.)
          //  - the same code appearing in the message (a status-less throw, or apiCore's
          //    `<type>/<method> failed: <status>` fallback body), or
          //  - the platform "Service not found: <id>" message text.
          // Hand off to the provisioning controller: it clears the breadcrumb and reserves a
          // fresh pod behind the loading overlay, so the user stays on /chat instead of
          // hitting a dead-end error banner. The send is dropped; the user retries once ready.
          const errStatus = (err as Error & { status?: number }).status;
          if (errStatus === 404 || errStatus === 410 || /\b(404|410)\b/.test(msg) || /Service not found/i.test(msg)) {
            session.reportUnhealthy();
            rollbackOptimisticSend();
            sendInFlightRef.current = false;
            return;
          }
          // Stopped service — server refuses createSession on a STOPPED service.
          // Auto-resume + retry once.
          const isStoppedError =
            msg.includes('is in status STOPPED') || msg.includes('resume the service before') || /\b409\b/.test(msg);
          if (isStoppedError) {
            setIsResumingSession(true);
            try {
              try {
                await transport.resumeService(activeServiceId);
              } catch (resumeErr) {
                if (!isResumeNoOpAlreadyActive(resumeErr)) {
                  throw resumeErr;
                }
              }
              activeSessionId = await transport.addSession(activeServiceId, effectiveDefId);
              const adopted = await adoptCreatedSession(activeSessionId);
              if (!adopted?.agentBaseUrl && !activeAgentBaseUrl) {
                throw new Error('createSession returned no agentBaseUrl');
              }
              activeServiceId = serviceIdRef.current || adopted?.serviceId || activeServiceId;
              activeAgentBaseUrl = adopted?.agentBaseUrl || activeAgentBaseUrl;
              pendingPromotionSidRef.current = activeSessionId;
              if (stagedAppIdsRef.current.length) {
                stagedApplyRef.current = { sid: activeSessionId, appIds: stagedAppIdsRef.current.slice() };
              }
              navigate(`/chat#${activeSessionId}`, { replace: true });
              setOptimisticSidebarSession({ id: activeSessionId, createdAt: new Date().toISOString() });
              setSidebarRefreshKey((k) => k + 1);
              window.setTimeout(() => setOptimisticSidebarSession(null), 3000);
              setIsResumingSession(false);
              // fall through to the rest of sendMessage (queryText prep, executeQuery)
            } catch (resumeErr) {
              setIsResumingSession(false);
              const resumeMsg = resumeErr instanceof Error ? resumeErr.message : String(resumeErr);
              if (/Agent definition .+ not found/.test(resumeMsg)) {
                setSelectedAgentDefId(null);
                setLockedAgentName(null);
                setAgentPickerRefreshKey((k) => k + 1);
              }
              setError(resumeMsg || t('error.resumeAgent'));
              rollbackOptimisticSend();
              sendInFlightRef.current = false;
              return;
            }
          } else {
            setError(err instanceof Error ? err.message : t('error.createChat'));
            rollbackOptimisticSend();
            sendInFlightRef.current = false;
            return;
          }
        }
      }

      let queuedAttachments = false;
      if (hasStaged) {
        pendingUserAttachmentsRef.current.push(stagedNames);
        queuedAttachments = true;
      }

      // Record per-session recency in the browser (drives sidebar "most recent at top"
      // ordering — local-only so we don't write to the DB on every user turn).
      setSessionLastUsed(activeSessionId);

      // Provisional sidebar label: on a brand-new chat's first message, stash the
      // clipped first user message so the sidebar reads its topic immediately
      // instead of "New chat" while the smart (LLM) title is generated. Display-only
      // (localStorage) — the persisted title stays empty, which is the durable
      // "no smart title yet" signal for the title-gen trigger + on-mount backfill.
      // The smart title itself fires off the isStreaming edge once the first
      // response lands (decideTitleAction at assistantTurns >= 1). Read messagesRef,
      // not the closure, to keep `messages` out of sendMessage's deps.
      const priorUserTurns = messagesRef.current.filter((m) => m.kind === 'TEXT' && m.role === 'USER').length;
      if (priorUserTurns === 0) {
        setSessionFirstMessage(activeSessionId, prompt);
        setSidebarRefreshKey((k) => k + 1); // re-render the sidebar with the new label
      }

      try {
        const outcome = await executeQuery(
          queryText,
          activeAgentBaseUrl,
          activeSessionId,
          hasStaged ? staged : undefined
        );
        if (outcome === 'question') {
          return;
        }
        if (outcome === 'dead' || outcome === 'stale') {
          // Pod unreachable mid-send — a killed pod being rescheduled (it can surface as 410 'dead'
          // OR 502/503/504/network 'stale' depending on how far the rproxy got). Recover IN PLACE
          // and retry the same turn — NEVER navigate away, which drops the message the user just
          // sent and jumps them to a blank chat. Only a genuinely gone pod/PVC (recoverService
          // throws, or the retry stays dead/stale) falls through to the resume-stale modal, whose
          // auto-resume caps its attempts before any last-resort re-provision.
          pendingRetryPromptRef.current = queryText;
          pendingRetryFilesRef.current = hasStaged ? staged : null;
          // SessionProvider already owns pod resume/reserve — a parallel recoverService here is
          // the same dual-resume race as the STOPPED reload path. Hand off to the resume-stale
          // modal (auto-resume defers until the provider is ready).
          if (isProviderBusy(session.status)) {
            setModal('resumeStaleAgent');
          } else {
            let recovered = false;
            setIsResumingSession(true);
            try {
              const base = await recoverAndReattach(activeServiceId, activeSessionId);
              restartThinkingClock();
              setIsResumingSession(false);
              const retryFiles = pendingRetryFilesRef.current;
              const outcomeAfterResume = await executeQuery(
                queryText,
                base,
                activeSessionId,
                retryFiles && retryFiles.length ? retryFiles : undefined
              );
              if (outcomeAfterResume === 'ok' || outcomeAfterResume === 'question') {
                pendingRetryPromptRef.current = null;
                pendingRetryFilesRef.current = null;
                recovered = true;
              }
            } catch {
              setIsResumingSession(false);
              /* Fall through to the resume-stale modal (auto-resume retries, then re-provisions). */
            }
            if (!recovered) {
              setModal('resumeStaleAgent');
            }
          }
        } else {
          pendingRetryPromptRef.current = null;
          pendingRetryFilesRef.current = null;
        }
        // Pull currentModel from server truth rather than optimistically
        // copying `selectedModel` — the stream may have been aborted or the
        // server may have rejected the override. Tolerate a failed refresh.
        try {
          const requestEpoch = beginPodCatalogRequest();
          const info = await transport.listModels(activeAgentBaseUrl, activeSessionId);
          // Free catalog refresh — same response, already fetched (see the sibling call above).
          applyPodCatalog(info, activeSessionId, requestEpoch);
        } catch {
          /* non-fatal — currentModel will refresh next time */
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          // Session-expiry mid-send: the draft was cleared optimistically at send (above) and the
          // reauth redirect will full-reload the tab, wiping the optimistic bubble too. Put the
          // typed prompt back into its draft slot (inverse of that clear) so it rehydrates in the
          // composer on the reauth return leg. Same closure `sessionId` as the clear → pending mode
          // restores `__new__`, which consumeNewSessionDraftFor bridges into the promoted session.
          // `!override` mirrors the clear at send: on the queued-drain path the user may have typed
          // new composer text during the stream, which we must not clobber (and the clear was
          // skipped there too, so there's nothing to restore).
          if (!override && isSessionExpired() && prompt && prompt !== ATTACHED_FILES_PLACEHOLDER) {
            setDraft(sessionId, prompt);
            setInput(prompt);
          }
          if (queuedAttachments && pendingUserAttachmentsRef.current.length > 0) {
            pendingUserAttachmentsRef.current.pop();
          }
          const msg = await resolveStreamErrorMsg(
            err,
            activeAgentBaseUrl,
            activeSessionId,
            queryStartedAtRef.current,
            t,
            transport.fetchSessionMessages
          );
          setError(msg);
          // Keep the failed prompt visible (the optimistic user bubble is left in place) and
          // record what to resend, keyed by this error's stable id, so the Retry control can
          // re-send the exact prompt + attachments.
          const errId = `err-${Date.now()}`;
          retryPayloadRef.current.set(errId, { prompt: queryText, files: hasStaged ? staged : undefined });
          setMessages((prev) => [...prev, { id: errId, kind: 'ERROR', text: msg }]);
          // PLAT-148695 Resolved decision §3: treat non-Abort stream error like
          // Stop — restore queued text to the textarea. Setter callback avoids
          // adding queuedMessage to sendMessage's already-long dep list.
          setQueuedMessage((qm) => {
            if (qm != null) setInput(qm.text);
            return null;
          });
          dropQueued(sessionId);
        }
      } finally {
        commitThoughtDuration(queryStartedAtRef, streamingTurnKeyRef, messagesRef.current, setThoughtDurationByTurnKey);
        setActiveStreamTurnId(null);
        setLastStreamMessageId(null);
        setIsStreaming(false);
        abortRef.current = null;
        sendInFlightRef.current = false;
        composerBridgeRef.current?.focus ? composerBridgeRef.current.focus() : inputRef.current?.focus();
      }
    },
    [
      input,
      pendingFiles,
      isStreaming,
      sessionId,
      serviceId,
      agentBaseUrl,
      applyPodCatalog,
      beginPodCatalogRequest,
      sessionStatus,
      remoteConversationUrl,
      executeQuery,
      recoverAndReattach,
      beginStreaming,
      restartThinkingClock,
      pendingQuestion,
      respondToQuestion,
      adoptCreatedSession,
      selectedAgentDefId,
      agentDefId,
      speechIsListening,
      speechStop,
      navigate,
      session,
    ]
  );

  // Connect button on the cross-cluster auth banner. Runs the same per-user OAuth + bind flow the
  // AppsPicker uses (handleConnectApp resolves the appId → probe → popup → connect → configureApp),
  // then — the locked "auto-resume" behavior — clears the banner and sends a short follow-up turn so
  // the agent retries the tool call that was blocked on the missing per-user token. Rejects propagate
  // to the banner row (surfaces its retry). Defined after sendMessage so the auto-resume send can
  // reference it without a use-before-declaration.
  const handleCrossClusterAuthConnect = useCallback(
    async (appId: string) => {
      await handleConnectApp(appId);
      // Bind succeeded — drop this appId's banner and nudge the agent to continue. The resume turn
      // is a normal user message; sendMessage's own guards (not streaming, has base + session) apply.
      dismissCrossClusterAuth(appId);
      void sendMessage({ text: t('crossClusterAuth.resumePrompt', { app: appId }) });
    },
    [handleConnectApp, dismissCrossClusterAuth, sendMessage, t]
  );

  // Retry the message behind an errored turn. Resolves the exact prompt + attachments to resend:
  // first from retryPayloadRef (same-session errors, keyed by the stable error id), else falling
  // back to the nearest preceding USER text in the transcript (a reloaded/historical error, whose
  // in-memory File objects are gone — text-only). Streaming re-entrancy is handled by sendMessage's
  // own guards + the disabled Retry button, so no (stale-closure-prone) isStreaming check here.
  const handleRetry = useCallback(
    (errorMsg: ChatMessage) => {
      const stored = retryPayloadRef.current.get(errorMsg.id);
      let prompt = stored?.prompt;
      const files = stored?.files;
      if (prompt == null) {
        const msgs = messagesRef.current;
        const errIdx = msgs.findIndex((m) => m.id === errorMsg.id);
        const scanFrom = errIdx === -1 ? msgs.length - 1 : errIdx - 1;
        for (let i = scanFrom; i >= 0; i--) {
          if (msgs[i].kind === 'TEXT' && msgs[i].role === 'USER') {
            prompt = msgs[i].text ?? '';
            break;
          }
        }
      }
      const hasFiles = !!(files && files.length);
      const trimmed = prompt?.trim() ?? '';
      // Nothing meaningful to resend: empty, or an attachments-only turn whose in-memory files are
      // gone on reload so only the "(Attached files)" placeholder text survives — resending that
      // literal as a prompt would feed the agent nonsense. Both cases no-op.
      if (!hasFiles && (trimmed === '' || trimmed === ATTACHED_FILES_PLACEHOLDER)) return;
      // Release the retained payload (incl. File blobs) once consumed so it can't pin memory for
      // the session; a later click on the same errored bubble falls back to the transcript scan.
      retryPayloadRef.current.delete(errorMsg.id);
      void sendMessage({ text: prompt ?? '', files });
    },
    [sendMessage]
  );

  // New-job handoff auto-send. The modal opens a pending ?new=1 chat (agent pinned, composer seeded
  // from the draft) with `autoSend` in router state. Once that pending chat is genuinely ready to
  // send — sendMessage's own preconditions: serviceId + agentBaseUrl present, not streaming — we
  // fire the SAME sendMessage() the Enter key fires, which creates the session (addSession) and
  // renders the normal user bubble + streaming. Keyed on those signals so a cold start waits
  // through provisioning and fires when ready. Gated so it can't misfire: only a ?new=1 chat
  // carrying the autoSend state, only while still pending (no sessionId yet), only with the seed in
  // the composer, then a single-fire ref. Navigating to any existing chat drops isNewChatIntent and
  // the router state, so the seed can never fire into another session.
  const autoSendNewChat = (location.state as { autoSend?: boolean } | null)?.autoSend === true;
  useEffect(() => {
    if (autoSentRef.current) return;
    if (!isNewChatIntent || !autoSendNewChat || sessionId) return;
    if (!serviceId || !agentBaseUrl || isStreaming) return;
    if (!input.trim()) return;
    autoSentRef.current = true;
    void sendMessage();
  }, [
    isNewChatIntent,
    autoSendNewChat,
    sessionId,
    serviceId,
    agentBaseUrl,
    isStreaming,
    input,
    sendMessage,
    location.state,
  ]);

  // PLAT-148695 drain effect. Fires when `isStreaming` flips false with a
  // non-null queue slot — captures the slot, clears it, dispatches via the
  // sendMessage override path. CRITICAL invariant: this effect is correct only
  // because `isStreaming` flips false exactly once per turn, at outer
  // boundaries (ChatPage.tsx:342 / :880 / :1152). Gemini CLI shipped a bug
  // where their equivalent flag flickered false between a tool execution and
  // the next model turn, causing queued prompts to interleave
  // (https://github.com/google-gemini/gemini-cli/issues/17282). If anyone
  // refactors `isStreaming` into a finer-grained tool-call lifecycle, this
  // effect will mis-fire — guard or rework accordingly.
  useEffect(() => {
    if (isStreaming || queuedMessage == null || pendingQuestion != null) return;
    const captured = queuedMessage;
    setQueuedMessage(null);
    dropQueued(sessionId);
    void sendMessage({ text: captured.text, files: captured.files });
  }, [isStreaming, pendingQuestion, queuedMessage, sendMessage, sessionId]);

  const handleResumeStaleConfirm = useCallback(async () => {
    if (!sessionId) return;

    setError('');
    setModalLoading(true);
    try {
      // Same dual-resume hazard as messages-404: if SessionProvider is already bouncing the
      // pod, a parallel recoverService flips the overlay. Defer and re-enter this modal once
      // the provider is ready (pending retry refs stay set for the retry below).
      if (isProviderBusy(session.status)) {
        beginDeferredAwait('stale', sessionId);
        setModal(null);
        setModalLoading(false);
        return;
      }
      const base = await recoverAndReattach(serviceIdRef.current, sessionId);

      const retry = pendingRetryPromptRef.current;
      const retryFiles = pendingRetryFilesRef.current;
      pendingRetryPromptRef.current = null;
      pendingRetryFilesRef.current = null;
      setModal(null);

      if (retry && base && sessionId) {
        setActiveStreamTurnId(null);
        setLastStreamMessageId(null);
        beginStreaming();
        setError('');
        userScrolledRef.current = false;
        try {
          const outcome = await executeQuery(
            retry,
            base,
            sessionId,
            retryFiles && retryFiles.length ? retryFiles : undefined
          );
          if (outcome === 'stale') {
            pendingRetryPromptRef.current = retry;
            pendingRetryFilesRef.current = retryFiles;
            setModal('resumeStaleAgent');
          } else {
            setInput('');
          }
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            const msg = await resolveStreamErrorMsg(
              err,
              base,
              sessionId,
              queryStartedAtRef.current,
              t,
              transport.fetchSessionMessages
            );
            setError(msg);
            setMessages((prev) => [...prev, { id: `err-${Date.now()}`, kind: 'ERROR', text: msg }]);
          }
        } finally {
          commitThoughtDuration(
            queryStartedAtRef,
            streamingTurnKeyRef,
            messagesRef.current,
            setThoughtDurationByTurnKey
          );
          setActiveStreamTurnId(null);
          setLastStreamMessageId(null);
          setIsStreaming(false);
          abortRef.current = null;
          composerBridgeRef.current?.focus ? composerBridgeRef.current.focus() : inputRef.current?.focus();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.resumeFailed'));
    } finally {
      setModalLoading(false);
    }
  }, [
    sessionId,
    session.status,
    agentBaseUrl,
    executeQuery,
    recoverAndReattach,
    beginStreaming,
    beginDeferredAwait,
    t,
  ]);

  const handleSessionClosedMessages404Resume = useCallback(async () => {
    if (!sessionId) return;
    setModalLoading(true);
    setError('');
    try {
      // The reload below resets any in-memory retry counter every cycle, so a session
      // whose pod is gone for good (reaped / PVC wiped) would reload forever. Bound the
      // retries with a per-session count that survives reloads: once it hits the cap the
      // session is unrecoverable — clear the stale breadcrumb + dead hash and drop to a
      // blank /chat (a fresh pod) instead of looping.
      if (getResumeAttempts(sessionId) >= MAX_AUTO_RESUME_ATTEMPTS) {
        clearResumeAttempts(sessionId);
        setModal(null);
        clearDeferredAwait();
        // Unlike the reload path below (which wipes all state), this branch navigates
        // client-side and keeps the same ChatPage instance — so clear the loading flag
        // ourselves. Leaving it set would wedge the auto-resume effect's `if (modalLoading)
        // return` guard for the freshly-provisioned blank session.
        setModalLoading(false);
        session.reportUnhealthy();
        navigate('/chat', { replace: true });
        return;
      }
      // SessionProvider already owns pod resume/reserve (mount provision or an in-flight
      // bounce). A parallel recoverService here is the dual-resume race that flips the
      // overlay on reload of a STOPPED chat — defer and re-hydrate once the provider is ready.
      if (isProviderBusy(session.status)) {
        recordResumeAttempt(sessionId);
        beginDeferredAwait('messages404', sessionId);
        setModal(null);
        setModalLoading(false);
        return;
      }
      recordResumeAttempt(sessionId);
      // Provider thinks the pod is live, but this session's history 404'd — the row may still
      // read ACTIVE on a dead pod, which resume no-ops on. recoverService probes and
      // stop+resumes a truly dead one so the re-hydrate below runs against a live pod.
      await transport.recoverService(serviceIdRef.current);
      refreshRoutingAuthorities();
      if (hasResumeReloaded(sessionId)) {
        // We already recovered + re-hydrated once for this session and its messages still 404 →
        // it is unrecoverable. Mark it dead so the provisioning controller won't re-adopt it
        // (which would bounce us right back here), then hand off to reserve a fresh pod instead of
        // looping forever. The dead marker is cleared only on a successful history load.
        markSessionDead(sessionId);
        setModal(null);
        clearDeferredAwait();
        session.reportUnhealthy();
        navigate('/chat', { replace: true });
        return;
      }
      // Re-hydrate IN PLACE — NOT window.location.reload(). A full reload wipes React state,
      // including a message the user just sent while the pod was restarting. Bumping the hydrate
      // nonce re-runs the transcript effect against the recovered pod with the component still
      // mounted (optimistic bubble + any in-flight send/retry survive); a successful load clears
      // the modal and the attempt/reload guards. markResumeReloaded records this one in-place
      // attempt so a persistent 404 falls through to the dead-session handoff above, not a loop.
      // Keep awaitingProviderReady through the re-hydrate so the overlay does not uncover the
      // empty chat; history success (or a new 404 modal) clears it.
      markResumeReloaded(sessionId);
      beginDeferredAwait('messages404', sessionId, { hydrateKicked: true });
      setModal(null);
      setModalLoading(false);
      setHydrateNonce((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.resumeFailed'));
      setModalLoading(false);
    }
  }, [
    sessionId,
    session.status,
    session.reportUnhealthy,
    navigate,
    clearDeferredAwait,
    beginDeferredAwait,
    refreshRoutingAuthorities,
    t,
    transport,
  ]);

  // Finish a deferred recovery once SessionProvider lands a live pod.
  // For messages-404: recoverService AFTER the provider is ready (no dual-resume race), then
  // markResumeReloaded + re-hydrate. recoverService covers ACTIVE-but-dead rows that myService
  // still reports ACTIVE (resume no-ops). Keep awaitingProviderReady until history succeeds.
  useEffect(() => {
    if (!awaitingProviderReady) return;
    if (session.failed) {
      clearDeferredAwait();
      setError((prev) => prev || t('error.resumeFailed'));
      return;
    }
    if (session.status !== 'ready') return;
    if (!sessionId || deferredForSessionIdRef.current !== sessionId) {
      clearDeferredAwait();
      return;
    }
    if (deferredResumeKindRef.current === 'stale') {
      // Re-enter the stale modal now that the provider owns a live pod — auto-resume will
      // call recoverAndReattach without racing an in-flight provision.
      clearDeferredAwait();
      setModal('resumeStaleAgent');
      return;
    }
    if (deferredHydrateKickedRef.current) return;
    deferredHydrateKickedRef.current = true;
    const sid = sessionId;
    // Prefer live provider/context serviceId over the ref — the ref sync effect can lag a
    // provider reprovision that landed in the same ready transition that unblocks this finish.
    const svcId = session.serviceId || serviceId || serviceIdRef.current;
    if (svcId) serviceIdRef.current = svcId;
    let cancelled = false;
    void (async () => {
      try {
        // recoverService stop+resumes a dead row and returns the recovered pod's MyServiceInfo —
        // the pod may be a NEW serviceId/base than the stopped one. Adopt its agentBaseUrl NOW so
        // the re-hydrate (and every agentBaseUrl-closured poll: connected-apps, models, session
        // reads) repoints to the live pod immediately, instead of spinning 404s against the dead
        // OLD base until a later getSession happens to observe the new row. Same repoint precedent
        // as the reconnect-failure path above.
        const info = await transport.recoverService(svcId);
        if (cancelled || deferredForSessionIdRef.current !== sid) return;
        if (info?.agentBaseUrl) setAgentBaseUrl(info.agentBaseUrl);
        refreshRoutingAuthorities();
        markResumeReloaded(sid);
        setHydrateNonce((n) => n + 1);
      } catch (err) {
        if (cancelled || deferredForSessionIdRef.current !== sid) return;
        clearDeferredAwait();
        setError((prev) => prev || (err instanceof Error ? err.message : t('error.resumeFailed')));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    awaitingProviderReady,
    session.status,
    session.failed,
    session.serviceId,
    sessionId,
    serviceId,
    clearDeferredAwait,
    refreshRoutingAuthorities,
    t,
    transport,
  ]);

  // Auto-resume — clicking a chat on a stopped service, or sending a message
  // mid-stop, sets `modal` to one of these values. We skip the consent
  // prompt and fire the resume immediately. `modalLoading` guards re-entry
  // while the handler is running; `autoResumeAttemptsRef` caps the loop when
  // resume keeps failing (e.g. service TERMINATED) so we don't spam the server.
  useEffect(() => {
    if (modalLoading) return;
    if (modal === null) {
      // Defer clears the modal on purpose while awaitingProviderReady — do not refund
      // the attempt counter or a flap can burn past MAX_AUTO_RESUME_ATTEMPTS.
      if (!awaitingProviderReady) {
        autoResumeAttemptsRef.current = 0;
      }
      return;
    }
    if (modal !== 'resumeStaleAgent' && modal !== 'sessionClosedMessages404') return;
    if (autoResumeAttemptsRef.current >= MAX_AUTO_RESUME_ATTEMPTS) {
      // Resume kept failing → the service is unrecoverable (TERMINATED can never resume;
      // it 500s every attempt, or its history is genuinely gone — e.g. an AgentCore session
      // reaped past its lifetime). Stop hammering and tell the user why, rather than silently
      // bouncing them to a fresh chat.
      setModal(null);
      autoResumeAttemptsRef.current = 0;
      session.reportUnhealthy();
      setError(t('error.chatHistoryExpired'));
      return;
    }
    autoResumeAttemptsRef.current += 1;
    if (modal === 'resumeStaleAgent') {
      void handleResumeStaleConfirm();
    } else {
      void handleSessionClosedMessages404Resume();
    }
  }, [
    modal,
    modalLoading,
    awaitingProviderReady,
    handleResumeStaleConfirm,
    handleSessionClosedMessages404Resume,
    session.reportUnhealthy,
    t,
  ]);

  const buildChatMarkdown = useCallback(
    (msgs: ChatMessage[], sid: string): string => {
      const lines: string[] = [`${t('export.heading', { sessionId: sid || '' })}\n`];
      lines.push(`${t('export.date', { date: new Date().toISOString() })}\n\n---\n`);

      for (const msg of msgs) {
        if (msg.kind === 'TEXT' && msg.role === 'USER') {
          lines.push(`${t('export.user')}\n\n`);
          if (msg.attachments?.length) {
            lines.push(`${t('export.attachments', { files: msg.attachments.join(', ') })}\n\n`);
          }
          lines.push(`${msg.text || ''}\n`);
        } else if (msg.kind === 'TEXT') {
          lines.push(`${t('export.assistant')}\n\n${msg.text || ''}\n`);
        } else if (msg.kind === 'REASONING') {
          lines.push(`> *${msg.text || ''}*\n`);
        } else if (msg.kind === 'TOOL_CALL') {
          const name = msg.toolName || msg.data?.name || 'Tool';
          const state = msg.toolState || msg.data?.state || '';
          const inputData = msg.data?.input;
          const output = msg.data?.output;
          const isToolId = name.startsWith('toolu_');
          lines.push(`### ${isToolId ? 'Tool' : name} (${state})\n`);
          if (inputData) {
            const s = typeof inputData === 'string' ? inputData : JSON.stringify(inputData, null, 2);
            lines.push(`\`\`\`\n${s}\n\`\`\`\n`);
          }
          if (output) lines.push(`\`\`\`\n${output}\n\`\`\`\n`);
        } else if (msg.kind === 'ERROR') {
          lines.push(`${t('export.error', { text: msg.text || '' })}\n`);
        } else if (msg.kind === 'STEP_FINISH') {
          lines.push(`---\n`);
        }
      }
      return lines.join('\n');
    },
    [t]
  );

  const triggerMarkdownDownload = useCallback((markdown: string, sid: string) => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-service-${sid || 'chat'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const exportAsMarkdown = useCallback(() => {
    triggerMarkdownDownload(buildChatMarkdown(messages, sessionId || ''), sessionId || '');
  }, [messages, sessionId, buildChatMarkdown, triggerMarkdownDownload]);

  // Download any session from the sidebar ellipses. The open session uses in-memory messages;
  // others are fetched from the shared pod. Gated on a live pod via the onDownload wiring below
  // (a brand-new chat with no agentBaseUrl never gets the menu item).
  const downloadSession = useCallback(
    async (sid: string) => {
      try {
        if (sid === sessionId) {
          exportAsMarkdown();
          return;
        }
        const { messages: fetched } = await transport.fetchSessionMessages(agentBaseUrl, sid);
        triggerMarkdownDownload(buildChatMarkdown(fetched, sid), sid);
      } catch (err) {
        console.warn('[chat] sidebar download failed', err);
      }
    },
    [sessionId, agentBaseUrl, exportAsMarkdown, buildChatMarkdown, triggerMarkdownDownload]
  );

  // PLAT-148695 shared helper used by Stop, chip × cancel, and the non-Abort
  // error catches. Uses the setter callback so we always read the latest
  // queuedMessage without forcing it into other useCallbacks' dep arrays.
  const restoreQueueToInput = useCallback(() => {
    setQueuedMessage((qm) => {
      if (qm != null) setInput(qm.text);
      return null;
    });
    dropQueued(sessionId);
  }, [sessionId]);

  // PLAT-148695: mid-stream enqueue. Snapshots the current input + staged files
  // into a single-slot queue. The drain useEffect (step 3) fires it when the
  // active stream ends. V1 limit = 1; a second enqueue overwrites slot 1.
  const enqueueMessage = useCallback(() => {
    const text = input.trim();
    const staged = pendingFiles.map((p) => p.file);
    const hasStaged = staged.length > 0;
    // Match the Send-button disable rule for the Enter-key path.
    if (!text && !hasStaged) return;
    // respondToQuestion / sendMessage's pendingQuestion branch is text-only —
    // queueing files into that path would silently drop them on drain. Surface
    // the conflict via the existing error bar instead.
    if (hasStaged && pendingQuestion != null) {
      setError(t('error.filesCannotBeQueued'));
      return;
    }
    const queued = { text, files: hasStaged ? staged : undefined };
    setQueuedMessage(queued);
    // Mirror to the per-session store so the slot survives a session switch.
    // No-op in pending mode (no sessionId); the promotion-skip path keeps the
    // React slot there.
    putQueued(sessionId, queued);
    setInput('');
    clearDraft(sessionId);
    setPendingFiles([]);
  }, [input, pendingFiles, pendingQuestion, sessionId]);

  // Chip × cancel: restore queued text to the textarea, clear the slot. Does
  // NOT abort the active stream — that's Stop's job.
  const onCancelQueue = useCallback(() => {
    restoreQueueToInput();
  }, [restoreQueueToInput]);

  // PLAT-148695: Stop button click. Restore queue first (no-op if empty), then
  // run the same abort + stopQuery the Stop button used to inline. Restoring
  // *before* abort means the AbortError catches in sendMessage /
  // respondToQuestion / executeQuery never see queuedMessage as non-null on a
  // user-initiated stop, so they don't need to know about the queue at all.
  // The reconnect path's cleanup abort at ChatPage.tsx ~642 does NOT route
  // through onStop, so session-switch teardowns can't accidentally restore.
  const onStop = useCallback(() => {
    restoreQueueToInput();
    abortRef.current?.abort();
    // Stop is the ONLY stream end that finalizes a still-pending permission: the user
    // chose to abandon the turn, so the Allow/Deny goes inert. Every other stream end
    // (network blip, idle, reconnect close, pod reschedule) leaves it PENDING for the
    // pod's reconnect replay to re-surface — see finalizeOrphanedFrames / FinalizeOptions.
    setMessages((prev) => finalizeOrphanedFrames(prev, { finalizePermissions: true }));
    if (sessionId && agentBaseUrl) {
      // Stop ends the turn on the pod too — clear the running mark explicitly, since the
      // stream finallys skip clearing on aborted signals (they can't tell Stop from a
      // session switch, where the turn keeps going).
      clearTurnRunning(sessionId);
      transport.stopQuery(agentBaseUrl, sessionId).catch(() => {
        /* non-fatal — client stream already torn down */
      });
    }
  }, [restoreQueueToInput, sessionId, agentBaseUrl]);

  // Single dispatcher used by both the Send button (via the `sendMessage` prop
  // ChatColumn receives) and `handleKeyDown`'s Enter branch. While streaming →
  // enqueue; otherwise → normal send.
  const dispatchSendOrEnqueue = useCallback(() => {
    if (isStreaming) {
      enqueueMessage();
    } else {
      sendMessage();
    }
  }, [isStreaming, sendMessage, enqueueMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Esc dequeues the pending message (same as the chip ×) — only when the slot
    // is non-empty, so an empty composer keeps Esc's default (closing popovers).
    // Must stay before the Enter branch.
    if (e.key === 'Escape' && queuedMessage != null) {
      e.preventDefault();
      onCancelQueue();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      dispatchSendOrEnqueue();
    }
  };

  // Resolve the pinned agent's display name for the locked header label (switching off, no chat
  // loaded). One targeted read via the transport, best-effort: on any failure the render falls back
  // to the id string. Skipped entirely when switching is on or a chat is loaded (the header isn't
  // the pinned label then). Search by the pinned id so the match isn't missed when more than one
  // page of agent definitions exists (a plain first-page read would silently not resolve past the
  // page size).
  const pinnedNewChat = !sessionId && !allowAgentSwitch;
  useEffect(() => {
    if (!pinnedNewChat) return;
    let cancelled = false;
    void (async () => {
      try {
        const page = await transport.listAgentDefinitions(0, 20, agentDefId);
        const match = page.rows.find((r) => r.id === agentDefId);
        if (!cancelled && match) setPinnedAgentName(match.name);
      } catch (err) {
        // Leave null → the render falls back to the id string.
        console.warn('Failed to resolve pinned agent name; falling back to the id', agentDefId, err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pinnedNewChat, agentDefId, transport, agentPickerRefreshKey]);

  // Scopes the composer's MCP menu: picked agent in new-chat mode, else the committed chat's agent.
  const composerAgentDefId = selectedAgentDefId ?? lockedAgentDefId;

  const chatColumnProps: Omit<ChatColumnProps, 'columnClassName'> = {
    scrollRef: setScrollRef,
    messagesEndRef,
    learningProposal,
    learningProposalCount: learningProposals.length,
    onReviewLearningProposal: learningProposal
      ? () =>
          navigate(
            learningProposals.length > 1 ? '/skills' : `/skill-detail#${encodeURIComponent(learningProposal.name)}`
          )
      : undefined,
    showScrollToBottom,
    onScrollToBottom: handleScrollToBottom,
    inputRef,
    composerBridgeRef,
    fileInputRef,
    agentDefId: composerAgentDefId,
    messages,
    messageChunks,
    isStreaming,
    // Existing chat whose transcript hasn't finished hydrating → show the loading skeleton.
    hydrating: !!sessionId && loadedTranscriptSid !== sessionId,
    liveQueryStartedAt,
    isResumingSession,
    thoughtDurationByTurnKey,
    activeStreamTurnId,
    lastStreamMessageId,
    respondToQuestion,
    pendingQuestion,
    onPermissionRespond,
    onRetry: handleRetry,
    error: error || modelCatalogError,
    setError: (message) => {
      // ChatColumn currently uses this callback only to dismiss the visible error. Preserve the
      // normal setter contract for any future non-empty child error instead of misclassifying it as
      // a catalog failure.
      if (message) setError(message);
      // Dismiss only the displayed source; a hidden catalog error must remain actionable.
      else if (error) setError('');
      else setModelCatalogError('');
    },
    // The chat's own session id is a durable, admin-traceable reference to hand support when a
    // resume/operational error surfaces. Undefined for a brand-new chat that has no session yet.
    errorReferenceId: sessionId,
    agentBaseUrl,
    sessionId,
    subagentsEnabled,
    mcpToken,
    resourceApp: null,
    inlineAppNodes: [...resourceAppNodes, ...serverAppNodes],
    pendingFiles,
    uploadProgress,
    onPickFiles,
    removePendingAt,
    input,
    setInput,
    handleKeyDown,
    sendMessage: dispatchSendOrEnqueue,
    queuedMessage,
    onCancelQueue,
    onStop,
    models,
    selectedModel,
    setSelectedModel: handleSelectModel,
    autoAvailability: autoRoutingState.availability,
    autoAvailabilityReason: autoRoutingState.reason,
    modelRouteAvailable: selectedRouteSendAllowed,
    modelRouteAvailability: selectedRouteDisplayState.availability,
    modelRouteAvailabilityReason: selectedRouteDisplayState.reason,
    onModelSelectOpen: handleModelSelectOpen,
    selectedEffort: effectiveEffort,
    setSelectedEffort: handlePinEffort,
    modelControlsEnabled,
    connectAppsEnabled,
    crossClusterOAuthEnabled,
    defaultModel,
    currentModel,
    estimatedConversationTokens,
    contextUsage,
    onFileClick: handleFileClick,
    resolveFileUrl: resolveWorkspaceFileUrl,
    onInternalLinkClick: handleInternalLinkClick,
    onAttachmentClick: handleAttachmentClick,
    onFeedback: handleFeedback,
    speechSupported: speech.isSupported,
    speechIsListening,
    onSpeechStart: speech.start,
    onSpeechStop: speechStop,
    connectedApps: visibleConnectedApps,
    // Committed session → bind/remove on the pod; brand-new chat → stage/unstage in client state
    // so the picker is live before reserve (staged targets bind on the first message).
    onRemoveApp: sessionId ? handleRemoveApp : handleUnstageApp,
    // When connect-apps is disabled (embed) there is no connect UI at all (undefined hides it);
    // otherwise a committed session binds on the pod (handleConnectApp) and a brand-new chat stages
    // in client state (handleStageApp) so the picker is live before reserve().
    onConnectApp: !connectAppsEnabled ? undefined : sessionId ? handleConnectApp : handleStageApp,
    // The host app as AppsPicker's pinned "This app" row; hidden when connect UI is off (mirrors onConnectApp).
    currentApp: !connectAppsEnabled ? undefined : (currentApp ?? undefined),
    // Only gate a NEW chat — a committed session already has a bound agent.
    noAgentsAvailable: !sessionId && agentsAvailable === false,
    // Cause-honest LLM guard: `starting` (proxy coming up) vs `empty` (ready, zero models).
    llmBlockReason: effectiveLlmBlockReason,
    llmStartingLongWait,
    topSentinelRef,
    hasMoreOlder,
    loadingOlder,
    mcpAuthExpiredKeys: expiredMcpKeys,
    onDismissMcpAuthExpired: dismissMcpAuthExpired,
    crossClusterAuthAppIds: pendingAuthAppIds,
    onConnectCrossClusterAuth: handleCrossClusterAuthConnect,
    onDismissCrossClusterAuth: dismissCrossClusterAuth,
  };

  // The MCP auth gate must be mountable from every render branch, not just the fully-loaded
  // chat: the agent-detail "Chat with agent" hand-off lands here while the pod is still
  // provisioning, so the gate has to be able to appear over the landing/spin-up overlays.
  // Keyed on the agent id so switching agents remounts it (resets the modal's auto-proceed
  // guard). Radix Dialog portals to <body>, so its position in each branch doesn't affect layout.
  const mcpGate =
    gateAgentDefId !== null ? (
      <McpAuthGateModal
        key={gateAgentDefId}
        agentDefId={gateAgentDefId}
        onReady={() => settleGate(true)}
        onCancel={() => settleGate(false)}
      />
    ) : null;

  if (sessionStatus === 'invalid') {
    return (
      <div className="chat-page__invalid relative flex min-h-screen items-center justify-center">
        {mcpGate}
        <div className="chat-page__invalid-inner text-center">
          <p className="chat-page__invalid-title mb-2 text-lg text-destructive">{t('serviceUnavailable.title')}</p>
          <p className="chat-page__invalid-text mb-5 text-sm text-muted-foreground">
            {t('serviceUnavailable.text', { sessionId })}
          </p>
          {showHostNavLinks ? (
            <Link to="/agents" className="nexus-btn-primary chat-page__invalid-home px-6 py-2.5 text-sm">
              {t('goToAgents')}
            </Link>
          ) : (
            <Button type="button" onClick={() => navigate('/chat')}>
              {t('provisionError.retry')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Terminal provisioning failure: the controller exhausted its retries (or a step timed out).
  // Stay here with an actionable error instead of auto-redirecting to /agents — the user keeps
  // their place and can retry without losing context.
  if (session.failed) {
    // Cause-specific messaging: a non-functional LLM path (zero usable models) gets an actionable
    // "contact your administrator" error rather than the generic correlation-id one — the failure is
    // a backend degradation the user can't self-serve, and there is no corr id for it (design §5.3).
    const noModels = session.failureReason === 'no-models';
    return (
      <div className="chat-page relative flex min-h-0 flex-1 flex-row">
        {mcpGate}
        <AgentSpinUpWithStatus
          overlay
          variant="error"
          title={noModels ? t('error.noModelsTitle') : t('provisionError.title')}
          // noModels keeps its own contact-admin subtitle (no reference id) and does not surface the
          // non-recoverable copy-id path. Every other terminal failure is fatal: the wrapper swaps in
          // the "reach out to the administrator" message + a copy affordance (id kept off-screen),
          // seeding the copy id from the failed session's corr id until polling produces one.
          subtitle={noModels ? t('error.noModelsContactAdmin') : undefined}
          forceFatal={!noModels}
          nonRecoverableStatus={noModels ? null : nonRecoverableStatus}
          fallbackReferenceId={session.failureCorrId}
          actions={
            <>
              <Button type="button" onClick={() => session.retry()}>
                {t('provisionError.retry')}
              </Button>
              {showHostNavLinks ? (
                <Button type="button" variant="secondary" onClick={() => navigate('/agents')}>
                  {t('provisionError.goToAgents')}
                </Button>
              ) : null}
            </>
          }
        />
      </div>
    );
  }

  // Single blocking overlay: showBlockingOverlay is debounced (show delayed / hide delayed) so
  // consecutive blocking phases share one continuous cover + one step-stream clock. The start
  // time is owned by the overlay effect above — never reset here on a phase swap.
  const provisionStart = provisionStartRef.current || Date.now();
  const spinUpAgentName = lockedAgentName || t('loading.agentFallback');
  // Keep the title tied to the current provisioning attempt; routing progress only changes the subtitle.
  const spinUpTitle =
    (stickyProvisionMode ?? session.provisionMode) === 'starting'
      ? t('loading.spinningUp', { name: spinUpAgentName })
      : t('loading.resumingNamed', { name: spinUpAgentName });
  const renderSpinUp = (title: string) => (
    // While provisioning, poll for a non-recoverable failure; if one lands, the wrapper swaps this
    // whole spinner (incl. the "taking longer than usual" long-wait line) for the terminal message.
    <AgentSpinUpWithStatus
      overlay
      title={title}
      subtitle={t(waitingForModels ? 'loading.connectingModels' : 'loading.usuallySeconds')}
      steps={[
        t('loading.step.agentReady'),
        t('loading.step.files'),
        t('loading.step.enabling'),
        t('loading.step.ready'),
      ]}
      stepStartTime={provisionStart}
      nonRecoverableStatus={nonRecoverableStatus}
      actions={
        showHostNavLinks ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="agent-spin-up__cancel text-muted-foreground"
            onClick={() => navigate('/agents')}
          >
            <CloseIcon />
            {t('loading.cancel')}
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="agent-spin-up__cancel text-muted-foreground"
            onClick={() => navigate('/chat#new')}
          >
            <CloseIcon />
            {t('loading.cancel')}
          </Button>
        )
      }
    />
  );

  // Landing on hashless /chat (not "+ New chat") with a known service: the routing effect is
  // deciding whether to resume the most-recent chat. Render the empty .chat-page wrapper (no
  // composer) rather than flashing the new-chat composer before the redirect. The shared
  // blocking overlay covers slow resolves; a warm resolve finishes inside the show-delay so
  // neither composer nor spinner flashes. For a COMMITTED session we keep the chat mounted
  // under the overlay below — unmounting on each transient status flip would refetch every
  // per-session resource and create a flicker + request storm.
  if (landingResolving) {
    return (
      <div className="chat-page relative flex min-h-0 flex-1 flex-row bg-background">
        {mcpGate}
        <OverlayFade show={showBlockingOverlay}>{renderSpinUp(spinUpTitle)}</OverlayFade>
      </div>
    );
  }

  return (
    <div
      className={`chat-page relative flex min-h-0 flex-1 flex-row${
        panelResizing ? ' chat-page--resizing cursor-col-resize select-none' : ''
      }`}
    >
      {/* Transparent capture layer during a drag so the cursor's mousemove isn't swallowed by an
          iframe/embed (e.g. a PDF in the workspace) mid-resize. */}
      {panelResizing && (
        <div className="chat-page__resize-overlay fixed inset-0 z-[1000] cursor-col-resize" aria-hidden="true" />
      )}
      {sessionSidebarEnabled && (
        <>
          <SessionSidebar
            currentSessionId={sessionId}
            serviceId={serviceId}
            collapsed={sidebarCollapsed}
            onToggle={toggleSidebar}
            refreshKey={sidebarRefreshKey}
            optimisticSession={optimisticSidebarSession}
            pendingNewChat={isNewChatIntent && !sessionId}
            width={sidebarWidth}
            onDownload={agentBaseUrl ? downloadSession : undefined}
            onPickAgent={handleConfirmNewChat}
            allowAgentSwitch={allowAgentSwitch}
            newChatAgentDefId={agentDefId}
            // Same terminal condition the provisioning precheck hard-fails on (design §5.3): zero
            // usable models on a ready proxy. `starting`/`unavailable` are transient and must not
            // block starting a new chat — they may resolve, and the composer already soft-blocks
            // sending while they hold.
            noModelsAvailable={llmBlockReason === 'empty'}
            skillImprovementLearningEnabled={skillImprovementLearningEnabled}
            onSkillImprovementOptOutChange={(sid, optOut) => {
              if (sid === sessionId) setLockedLearningOptOut(optOut);
            }}
            agentBackend={agentBackend}
            bedrockIdleRuntimeSessionTimeoutSeconds={bedrockIdleRuntimeSessionTimeoutSeconds}
            subagentsEnabled={subagentsEnabled}
            viewingSubagentSessionId={viewingSubagentSessionId}
          />
          {!sidebarCollapsed && (
            <button
              type="button"
              className="chat-page__panel-resizer chat-page__panel-resizer--sidebar w-1 flex-[0_0_4px] cursor-col-resize border-0 bg-background p-0 transition-colors hover:bg-primary focus-visible:bg-primary focus-visible:outline-none"
              aria-label={t('panelResize')}
              title={t('panelResize')}
              onMouseDown={startSidebarResize}
            />
          )}
        </>
      )}
      <div className="chat-page__main flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <div className="chat-page__header flex min-h-[49px] flex-shrink-0 items-center gap-3 border-b border-border bg-background px-4 py-2.5">
          <AgentPicker
            bare
            selectedDefId={selectedAgentDefId}
            preferredDefId={agentDefId}
            // A loaded chat is always locked (static bound-agent label, no fetch). With no chat
            // loaded: the switcher renders only when the consumer opted into agent switching;
            // otherwise the picker stays locked, showing the pinned agent's resolved name.
            locked={!!sessionId || !allowAgentSwitch}
            agentName={pinnedNewChat ? (pinnedAgentName ?? agentDefId) : lockedAgentName}
            onSelect={(defId, name) => {
              // Clearing back to the default agent — nothing to verify.
              if (defId === null) {
                setSelectedAgentDefId(null);
                setLockedAgentName(name);
                return;
              }
              // Verify MCP before pinning (transports may skip the host ConnectionApi gate).
              void ensureMcpAuthorized(defId).then((authorized) => {
                if (!authorized) return;
                setSelectedAgentDefId(defId);
                setLockedAgentName(name);
              });
            }}
            refreshKey={agentPickerRefreshKey}
            onAvailabilityChange={setAgentsAvailable}
          />
          {lockedReadOnly && (
            <Badge
              variant="secondary"
              className="chat-page__readonly-badge shrink-0 font-normal"
              title={t('header.readOnlyHelp')}
              data-testid="chat-readonly-badge"
            >
              {t('header.readOnly')}
            </Badge>
          )}
          <div className="chat-page__header-spacer flex-1" />
          {workspaceEnabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleWorkspace}
              data-testid="chat-workspace-toggle"
              className={`chat-page__workspace-toggle ${
                workspaceCollapsed
                  ? 'text-muted-foreground'
                  : 'chat-page__workspace-toggle--active bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
              }`}
              title={workspaceCollapsed ? t('header.showWorkspace') : t('header.hideWorkspace')}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 4.5A1.5 1.5 0 013.5 3H6l1.5 1.5h5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5z" />
              </svg>
              <span className="chat-page__workspace-toggle-label whitespace-nowrap">{t('workspace')}</span>
            </Button>
          )}
          {remoteConversationUrl && (
            <a
              href={remoteConversationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="nexus-btn-icon chat-page__header-btn rounded-md px-2 py-1.5"
              title={t('header.openRemoteAgent')}
              aria-label={t('header.openRemoteAgent')}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3M10 2h4m0 0v4m0-4L7 9" />
              </svg>
            </a>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={exportAsMarkdown}
            className="chat-page__header-download text-muted-foreground"
            data-testid="chat-download-btn"
            title={t('header.downloadChat')}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3M8 2v8M5 7l3 3 3-3" />
            </svg>
            <span>{t('header.download')}</span>
          </Button>
        </div>

        <div
          className={`chat-page__body flex min-h-0 flex-1 flex-row${fileViewerPath && !workspaceCollapsed ? ' chat-page__body--file-viewer' : ''}`}
        >
          {viewingSubagentSessionId ? (
            <SubagentTranscript
              subagentSessionId={viewingSubagentSessionId}
              onBack={() =>
                navigate(sessionId ? `${location.pathname}#${sessionId}` : location.pathname, { replace: true })
              }
            />
          ) : (
            <>
              <ChatColumn
                columnClassName="chat-page__main-column flex min-h-0 min-w-0 flex-1 flex-col"
                {...chatColumnProps}
              />
              {serverApps
                .filter((app) => !dismissedServerAppIds.has(app.instanceId))
                .map((app) => {
                  const descriptor = serverDescriptor(app);
                  const inPanel = openApps.apps.has(descriptor.instanceId);
                  const isFullscreen = openApps.fullscreenId === descriptor.instanceId;
                  return (
                    <MovableServerApp
                      key={app.instanceId}
                      agentBaseUrl={agentBaseUrl || ''}
                      sessionId={sessionId || ''}
                      port={app.port}
                      mcpToken={mcpToken}
                      inlineTarget={serverInlineAnchors[app.instanceId] ?? null}
                      panelTarget={serverPanelAnchors[app.instanceId] ?? null}
                      inPanel={inPanel}
                      onSendMessage={(text) => sendMessage({ text })}
                      onRequestDisplayMode={(params) => {
                        if (params.mode === 'inline') {
                          dispatchOpenApps({ type: 'fullscreen', instanceId: null });
                          dispatchOpenApps({ type: 'close', instanceId: descriptor.instanceId });
                          return { mode: 'inline' };
                        }
                        dispatchOpenApps({ type: 'register', app: descriptor });
                        dispatchOpenApps({
                          type: 'fullscreen',
                          instanceId: params.mode === 'fullscreen' ? descriptor.instanceId : null,
                        });
                        return { mode: params.mode === 'fullscreen' ? 'fullscreen' : 'pip' };
                      }}
                      displayMode={isFullscreen ? 'fullscreen' : inPanel ? 'pip' : 'inline'}
                      availableDisplayModes={displayModeManager.supportedModes}
                      queryString={app.queryString}
                      connectedAppIds={visibleConnectedAppIds}
                      onUnavailable={() => closeMcpApp(descriptor.instanceId)}
                    />
                  );
                })}
              {visibleResourceApps.map((app) => {
                const descriptor = resourceDescriptor(app);
                const inPanel = openApps.apps.has(descriptor.instanceId);
                const isFullscreen = openApps.fullscreenId === descriptor.instanceId;
                return (
                  <MovableResourceApp
                    key={app.uri}
                    agentBaseUrl={agentBaseUrl || ''}
                    sessionId={sessionId || ''}
                    mcpToken={mcpToken}
                    resourceApp={app}
                    messages={messages}
                    inlineTarget={resourceInlineAnchors[app.uri] ?? null}
                    panelTarget={resourcePanelAnchors[app.uri] ?? null}
                    inPanel={inPanel}
                    onSendMessage={(text) => sendMessage({ text })}
                    onRequestDisplayMode={(params) => {
                      if (params.mode === 'pip') {
                        dispatchOpenApps({ type: 'register', app: descriptor });
                        dispatchOpenApps({ type: 'fullscreen', instanceId: null });
                        displayModeManager.requestDisplayMode(app.uri, 'pip');
                        return { mode: 'pip' };
                      }
                      if (params.mode === 'fullscreen' && inPanel) {
                        dispatchOpenApps({ type: 'select', instanceId: descriptor.instanceId });
                        dispatchOpenApps({ type: 'fullscreen', instanceId: descriptor.instanceId });
                        displayModeManager.requestDisplayMode(app.uri, 'fullscreen');
                        return { mode: 'fullscreen' };
                      }
                      if (params.mode === 'inline') {
                        dispatchOpenApps({ type: 'close', instanceId: descriptor.instanceId });
                        dispatchOpenApps({ type: 'fullscreen', instanceId: null });
                      }
                      const mode = displayModeManager.requestDisplayMode(
                        app.uri,
                        params.mode as 'inline' | 'fullscreen' | 'pip'
                      );
                      return { mode };
                    }}
                    displayMode={
                      isFullscreen ? 'fullscreen' : inPanel ? 'pip' : displayModeManager.getDisplayMode(app.uri)
                    }
                    availableDisplayModes={displayModeManager.supportedModes}
                    onUnavailable={() => removeUnavailableResourceApp(app)}
                  />
                );
              })}
              {hasOpenApps && agentBaseUrl && sessionId && (
                <div
                  ref={appPanelRef}
                  className="chat-page__app-panel relative flex min-h-0 flex-shrink-0 flex-col border-l border-border"
                  style={{ flex: `0 0 ${appPanelWidth}px`, maxWidth: 'none' }}
                >
                  <button
                    type="button"
                    className="chat-page__panel-resizer chat-page__panel-resizer--app group absolute bottom-0 left-0 top-0 z-50 w-2 touch-none cursor-col-resize border-0 bg-transparent p-0 focus-visible:outline-none"
                    aria-label={t('panelResize')}
                    title={t('panelResize')}
                    role="separator"
                    aria-orientation="vertical"
                    aria-valuemin={320}
                    aria-valuemax={
                      Number.isFinite(appPanelAvailableWidth) ? getAppPanelMaxWidth(appPanelAvailableWidth) : undefined
                    }
                    aria-valuenow={appPanelWidth}
                    onPointerDown={startAppPanelResize}
                    onKeyDown={resizeAppPanelWithKeyboard}
                  >
                    <span className="absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
                  </button>
                  <Suspense fallback={null}>
                    <McpAppPanel
                      state={openApps}
                      onSelect={(instanceId) => dispatchOpenApps({ type: 'select', instanceId })}
                      onClose={closeMcpApp}
                      onExitFullscreen={() => dispatchOpenApps({ type: 'fullscreen', instanceId: null })}
                      renderApp={(app) => {
                        if (app.kind === 'resource' && app.resourceUri) {
                          return (
                            <ResourceAppAnchor uri={app.resourceUri} location="panel" onMount={setResourceAnchor} />
                          );
                        }
                        return (
                          <ServerAppAnchor instanceId={app.instanceId} location="panel" onMount={setServerAnchor} />
                        );
                      }}
                    />
                  </Suspense>
                </div>
              )}
              {/* ui:// resource apps now render inline in the message thread (see ChatColumn),
                  anchored at the turn that published them — no longer a side column. */}
              {workspaceEnabled && (
                <div
                  className={`chat-page__side-panel-wrap relative flex min-h-0 flex-shrink-0 flex-col overflow-hidden transition-[flex-basis,max-width] duration-200 ease-out ${
                    workspaceCollapsed
                      ? 'chat-page__side-panel-wrap--collapsed max-w-0 flex-[0_0_0px] border-l-0'
                      : 'max-w-[420px] border-l border-border'
                  }`}
                  style={workspaceCollapsed ? undefined : { flex: `0 0 ${workspaceWidth}px`, maxWidth: 'none' }}
                >
                  {!workspaceCollapsed && (
                    <button
                      type="button"
                      className="chat-page__panel-resizer chat-page__panel-resizer--workspace absolute bottom-0 left-0 top-0 z-[5] w-1.5 cursor-col-resize border-0 bg-transparent p-0 transition-colors hover:bg-primary focus-visible:bg-primary focus-visible:outline-none"
                      aria-label={t('panelResize')}
                      title={t('panelResize')}
                      onMouseDown={startWorkspaceResize}
                    />
                  )}
                  <div
                    className={`chat-page__side-panel-inner flex min-h-0 w-full flex-1 flex-col transition-opacity duration-200 ease-out ${
                      workspaceCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
                    }`}
                  >
                    {workspaceHasOpened && (
                      <Suspense
                        fallback={
                          <div className="workspace-side-panel flex h-full min-h-0 flex-col bg-background">
                            <div className="flex shrink-0 items-center border-b border-border px-3 py-2.5">
                              <Skeleton className="h-4 w-24" />
                            </div>
                            <div className="flex flex-col gap-0.5 p-2">
                              {([65, 80, 55, 72, 60] as const).map((w, i) => (
                                <Skeleton
                                  key={i}
                                  className="h-[26px] rounded-sm"
                                  style={{ width: `${w}%`, '--shimmer-delay': `${i * 60}ms` } as React.CSSProperties}
                                />
                              ))}
                            </div>
                          </div>
                        }
                      >
                        <WorkspaceSidePanel
                          agentBaseUrl={remoteConversationUrl ? '' : agentBaseUrl}
                          sessionId={sessionId}
                          selectedPath={workspaceSelectedPath}
                          onSelectedPathChange={setWorkspaceSelectedPath}
                          expandedPaths={workspaceExpandedPaths}
                          onExpandedPathsChange={setWorkspaceExpandedPaths}
                          treeRefreshSeq={workspaceTreeRefreshSeq}
                          onRootsChange={handleWorkspaceRootsChange}
                          onWorkspaceTreeMutation={() => setWorkspaceTreeRefreshSeq((n) => n + 1)}
                          onOpenExternalViewer={(p) => {
                            setWorkspaceSelectedPath(p);
                            setFileViewerPath(p);
                          }}
                          onCollapse={toggleWorkspace}
                        />
                      </Suspense>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`chat-page__workspace-handle absolute inset-0 flex cursor-pointer items-center justify-center border-0 bg-secondary p-0 text-muted-foreground transition-[opacity,background,color] duration-200 ease-out hover:bg-accent hover:text-foreground ${
                      workspaceCollapsed ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                    }`}
                    onClick={toggleWorkspace}
                    aria-label={t('header.showWorkspace')}
                    aria-hidden={!workspaceCollapsed}
                    tabIndex={workspaceCollapsed ? 0 : -1}
                  >
                    <span className="chat-page__workspace-handle-text text-2xs font-semibold uppercase tracking-wider [writing-mode:vertical-rl] [transform:rotate(180deg)]">
                      {t('workspace')}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* One overlay for every blocking phase (provision / landing / modal resume / deferred
            provider wait). Title keys off provisionMode; hide/show debounce lives above so phase
            swaps never uncover the chat or restart the stepper. OverlayFade dissolves it out on
            hide instead of cutting hard. */}
        <OverlayFade show={showBlockingOverlay}>{renderSpinUp(spinUpTitle)}</OverlayFade>

        {previewFile && (
          <Suspense fallback={null}>
            <FilePreviewModal
              open
              fileUrl={previewFile.url || ''}
              fileName={previewFile.path.replace(/^\/data\/workspace\//, '') || ''}
              onClose={() => setPreviewFile(null)}
            />
          </Suspense>
        )}

        {mcpGate}

        {/* Expanded file view — a large modal (was a 60/40 split pane). WorkspaceFileViewer
            keeps its own scrollable body + download; its close button + Esc/backdrop dismiss. */}
        <Dialog
          open={!!fileViewerPath}
          onOpenChange={(o) => {
            if (!o) {
              if (fileViewerPath) setWorkspaceSelectedPath(fileViewerPath);
              setFileViewerPath(null);
            }
          }}
        >
          <DialogContent
            showCloseButton={false}
            // sm:max-w-6xl overrides DialogContent's baked-in sm:max-w-lg (same breakpoint,
            // so it actually wins) — without the sm: prefix it stayed clamped to 512px.
            className="flex h-[85vh] w-[92vw] max-w-[92vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
          >
            <DialogTitle className="sr-only">{fileViewerPath ?? ''}</DialogTitle>
            {fileViewerPath ? (
              <Suspense fallback={null}>
                <WorkspaceFileViewer
                  path={fileViewerPath}
                  agentBaseUrl={agentBaseUrl}
                  sessionId={sessionId ?? ''}
                  onClose={() => {
                    if (fileViewerPath) setWorkspaceSelectedPath(fileViewerPath);
                    setFileViewerPath(null);
                  }}
                />
              </Suspense>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ChatPage;
