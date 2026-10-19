/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useChatTransport } from '../chatTransportContext';
import { useSessionAwaitingNotifications } from '../hooks/useSessionAwaitingNotifications';
import {
  getAwaitingDismissedSnapshot,
  isAwaitingDismissed,
  markAwaitingDismissed,
  subscribeAwaitingDismissed,
} from '../lib/awaitingDismissed';
import {
  listOtherSessionsForUser,
  listSubagentsForSession,
  resumeSession,
  SessionMessagesHttpError,
} from '../lib/chatApi';
import { clearDraft } from '../lib/draftStorage';
import { clearTurnRunning, getRunningTurnsSnapshot, isTurnRunning, subscribeRunningTurns } from '../lib/runningTurns';
import { getSessionFirstMessage, clearSessionFirstMessage } from '../lib/sessionFirstMessage';
import {
  bucketLabel,
  bucketFor,
  clearSessionLastUsed,
  sessionRecency,
  type RecencyBucket,
} from '../lib/sessionRecency';
import { sidebarLoadErrorKey } from '../lib/sidebarErrors';
import { cn } from '../lib/utils';
import ConfirmModal from './ConfirmModal';
import NewChatAgentMenu from './NewChatAgentMenu';
import { Button } from './ui/button';
import { StatusPill } from './ui/status-pill';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import type { Session, SubagentSummary } from '../lib/types';

const POLL_MS = 10_000;
/** Server page size for session paging. The sidebar walks older pages via the
 *  createdAt cursor as infinite scroll reaches the end of what's loaded. */
const SESSION_PAGE_SIZE = 100;
/** Typewriter speed (ms per char) when a session's title changes after-the-fact. */
const TITLE_TYPE_MS = 25;
/**
 * Sentinel id for the synthetic "New chat" row shown while the user is on a fresh
 * "+ New chat" screen but hasn't sent the first message yet — so no real Session row
 * exists. Lets the active indicator appear the instant the chat is started, not only
 * after the first message creates the backing session. Never reaches the server.
 */
const PENDING_NEW_CHAT_ID = '__pending_new_chat__';

/** Resume attempts before giving up on opening a chat whose service isn't the current one —
 *  mirrors ChatPage's own MAX_AUTO_RESUME_ATTEMPTS so a transient pod-provisioning hiccup
 *  doesn't surface as a permanent failure on the first try. */
const RESUME_ATTEMPTS = 2;
const RESUME_RETRY_DELAY_MS = 800;

function isTerminalResumeError(message: string): boolean {
  return /already.*active session/i.test(message) || /no longer be reopened/i.test(message);
}

/**
 * Renders a session label with a typewriter effect *only* when the label changes
 * after first render — e.g. "New chat" → an LLM-generated title. Initial mount
 * shows the full label immediately, so existing chats don't all retype on load.
 */
function TitleText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState(text);
  const prevRef = useRef(text);
  useEffect(() => {
    if (prevRef.current === text) return;
    prevRef.current = text;
    setDisplayed('');
    let i = 0;
    let timer: number | null = null;
    const tick = () => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i < text.length) timer = window.setTimeout(tick, TITLE_TYPE_MS);
    };
    timer = window.setTimeout(tick, TITLE_TYPE_MS);
    return () => {
      if (timer != null) window.clearTimeout(timer);
    };
  }, [text]);
  return <>{displayed}</>;
}

interface Props {
  currentSessionId?: string;
  /** Active pod id. Listing is caller-scoped across every owned pod; this is not a list filter. */
  serviceId?: string;
  collapsed: boolean;
  onToggle: () => void;
  /** Bumping this number forces an immediate refresh (e.g. after the parent renames a session). */
  refreshKey?: number;
  /** Optimistic row: shown in the sidebar before the server poll picks it up, so a
   *  freshly-created session appears the instant addSession resolves. The
   *  parent clears it once the real row lands. Deduped by id against the fetched
   *  list so we don't show the row twice during the brief overlap window. */
  optimisticSession?: { id: string; createdAt: string } | null;
  /** True while the user is on a fresh "+ New chat" screen (pending mode) with no
   *  session created yet. Shows a synthetic, active "New chat" row at the top so the
   *  active indicator appears on chat creation, not only after the first message. */
  pendingNewChat?: boolean;
  /** User-resized width in px. Applied only when expanded; collapsed falls back to the CSS rail width. */
  width?: number;
  /** Download a chat session as Markdown. Omitted (no menu item) when no live pod is available. */
  onDownload?: (sessionId: string) => void;
  /** Renders "+ New chat" as an inplace agent-selection popover (NewChatAgentMenu). Picking an
   *  agent creates the committed Session immediately (no confirm step) via this handler; the
   *  parent then navigates and the popover dismisses itself. When agent switching is disabled the
   *  same handler is invoked directly with {@link newChatAgentDefId} and no popover renders. */
  onPickAgent: (agentDefId: string) => Promise<void>;
  /** When true, "+ New chat" opens the {@link NewChatAgentMenu} agent picker. When false (default),
   *  it is a plain button that starts a chat with {@link newChatAgentDefId} — no agent switcher. */
  allowAgentSwitch?: boolean;
  /** Pinned agent def id a new chat starts with when {@link allowAgentSwitch} is false. */
  newChatAgentDefId?: string;
  /** True when the LLM path has zero usable models right now (`llmBlockReason(health) ===
   *  'empty'` — the same terminal condition the provisioning precheck hard-fails on). Any chat
   *  started while this holds cannot serve a turn, so "+ New chat" is disabled with an
   *  explanatory tooltip instead of letting the user walk into a guaranteed failure. Transient
   *  states (`starting` / `unavailable`) do not set this — they may resolve before the user
   *  finishes, and the composer already soft-blocks sending for those. */
  noModelsAvailable?: boolean;
  /**
   * When true, show Learning / Excluded chips and the per-chat opt-out menu. Host-owned:
   * the nexusClient package must not import the host skill-improvement settings hook. Omit /
   * false when learning is off or the host has not wired the setting (chip stays hidden).
   */
  skillImprovementLearningEnabled?: boolean;
  /** Keeps the active chat's contextual receipt gate in sync with the optimistic sidebar toggle. */
  onSkillImprovementOptOutChange?: (sessionId: string, optOut: boolean) => void;
  /**
   * The configured agent backend (e.g. 'opencode', 'bedrock-agent'). Host computes this from
   * appInfo() so nexusClient does not import the host-only useAppInfo hook. Used only to gate the
   * "Expired" badge below (AgentCore-specific) — absent/other values simply suppress it.
   */
  agentBackend?: string;
  /**
   * AgentCore's `lifecycleConfiguration.idleRuntimeSessionTimeout` (seconds), from the same
   * appInfo() source as {@link agentBackend}. Only meaningful when agentBackend ===
   * 'bedrock-agent'; idle timeout equals max lifetime today, so session age alone (no
   * per-session activity timestamp needed) tells us for certain whether AWS has reaped it.
   */
  bedrockIdleRuntimeSessionTimeoutSeconds?: number;
  /** Feature-flag gate (agentix-subagents) — host resolves it so this package stays flag-agnostic.
   *  When false/omitted, the subagent tree is never fetched or rendered. */
  subagentsEnabled?: boolean;
  /** Subagent session currently being viewed read-only (hash `#parent/subagents/child`), so its
   *  nested row can show the active indicator instead of the parent row. */
  viewingSubagentSessionId?: string;
}

export default function SessionSidebar({
  currentSessionId,
  serviceId,
  collapsed,
  onToggle,
  refreshKey,
  optimisticSession,
  pendingNewChat,
  width,
  onDownload,
  onPickAgent,
  allowAgentSwitch = false,
  newChatAgentDefId,
  noModelsAvailable = false,
  skillImprovementLearningEnabled = false,
  onSkillImprovementOptOutChange,
  agentBackend,
  bedrockIdleRuntimeSessionTimeoutSeconds,
  subagentsEnabled = false,
  viewingSubagentSessionId,
}: Props) {
  const { t } = useTranslation('chat');
  const navigate = useNavigate();
  const transport = useChatTransport();
  const [sessions, setSessions] = useState<Session[]>([]);

  // AgentCore's idle-reap timeout now equals its max-lifetime cap (see
  // Nexus.Agent.CloudConfig.bedrockIdleRuntimeSessionTimeoutSeconds), so a session's age alone —
  // no per-session activity timestamp needed — determines for certain whether AWS has reaped it.
  // Only meaningful for the bedrock-agent backend; opencode sessions have their own STOPPED/PVC
  // lifecycle surfaced elsewhere.
  const isBedrockBackend = agentBackend === 'bedrock-agent';
  const bedrockMaxLifetimeMs = (bedrockIdleRuntimeSessionTimeoutSeconds ?? 28800) * 1000;

  // Out-of-tab "a chat needs you" notifier: tab-title/favicon badge (Layer 1, always
  // on) + opt-in OS notification (Layer 2). Fed by this sidebar's existing session
  // poll and the server `awaitingInput` flag — no separate data path.
  const openSession = useCallback((id: string) => navigate(`/chat#${id}`), [navigate]);
  const {
    isSupported: notifySupported,
    permission: notifyPermission,
    requestPermission: requestNotifyPermission,
    muted: notifyMuted,
    toggleMuted: toggleNotifyMuted,
  } = useSessionAwaitingNotifications({ sessions, onOpenSession: openSession });
  // Bell renders "on" only once permission is granted AND the user hasn't muted it.
  const notifyActive = notifyPermission === 'granted' && !notifyMuted;
  // Client-side "turn in flight" registry (this browser's tabs) — drives the running pill.
  // Re-renders on same-tab marks (send/stop) and other-tab writes (storage event); staleness
  // expiry needs no push because the POLL_MS refresh re-renders the list anyway.
  const runningTurns = useSyncExternalStore(subscribeRunningTurns, getRunningTurnsSnapshot);
  // Sessions whose awaiting-input nudge this browser has locally dismissed (user started
  // typing a reply or clicked the pill ×). The server `awaitingInput` flag stays true until
  // submit, so the pill honors the dismissal too — mirrors the notification hook's logic.
  const awaitingDismissed = useSyncExternalStore(subscribeAwaitingDismissed, getAwaitingDismissedSnapshot);

  // Reconcile marked BACKGROUND chats against their pod: the registry alone can't observe a
  // turn finish once the user navigates away (the stream detaches but the pod keeps going),
  // which would leave the pill stuck until revisit or staleness. The pod already answers
  // "turn in flight?" via fetchSessionMessages(...).isActive (the reconnect path's source),
  // so on the poll cadence, ask it — for marked rows only (bounded: usually 0–2 requests,
  // NOT the rejected all-sessions pod fan-out). The open chat is skipped (ChatPage owns its
  // live stream), and marks younger than a grace window are skipped too (the turn's first
  // POST may not have reached the pod yet — reading isActive=false then would be a lie).
  const podBaseUrlRef = useRef<Record<string, string>>({});
  const reconcileInFlightRef = useRef(false);
  useEffect(() => {
    const RECONCILE_GRACE_MS = 10_000;
    const reconcile = async () => {
      if (reconcileInFlightRef.current) return;
      const marked = Object.entries(runningTurns).filter(
        ([id, at]) => id !== currentSessionId && Date.now() - at > RECONCILE_GRACE_MS
      );
      if (marked.length === 0) return;
      reconcileInFlightRef.current = true;
      try {
        await Promise.all(
          marked.map(async ([id]) => {
            try {
              let baseUrl = podBaseUrlRef.current[id];
              if (!baseUrl) {
                const info = await transport.getSession(id);
                if (!info) {
                  clearTurnRunning(id); // session gone — nothing can be running
                  return;
                }
                baseUrl = info.agentBaseUrl;
                podBaseUrlRef.current[id] = baseUrl;
              }
              const res = await transport.fetchSessionMessages(baseUrl, id, { limit: 1 });
              if (!res.isActive) clearTurnRunning(id);
            } catch (err) {
              // Pod/PVC gone (404) ⇒ no turn can be running there — clear. Anything
              // else (transient network/5xx) leaves the mark; the next tick or the
              // staleness window resolves it. Also drop a possibly-stale cached base
              // so the next attempt re-resolves the pod.
              delete podBaseUrlRef.current[id];
              if (err instanceof SessionMessagesHttpError && err.status === 404) clearTurnRunning(id);
            }
          })
        );
      } finally {
        reconcileInFlightRef.current = false;
      }
    };
    void reconcile();
    const timer = window.setInterval(reconcile, POLL_MS);
    return () => window.clearInterval(timer);
  }, [runningTurns, currentSessionId, transport]);
  // Undecided → ask permission (auto-fires a confirmation on grant); granted → toggle mute
  // (the actual on/off switch — permission itself has no "off" once granted); denied →
  // nothing the app can do (browser-level block, only the user's browser settings lift it).
  const onBellClick = useCallback(
    () => (notifyPermission === 'granted' ? toggleNotifyMuted() : requestNotifyPermission()),
    [notifyPermission, toggleNotifyMuted, requestNotifyPermission]
  );
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [serverHasMore, setServerHasMore] = useState(true);
  const [error, setError] = useState('');
  // The caller's own chats stranded on a non-current (stopped/terminated) service.
  // Merged into the same list below so nothing in the UI distinguishes them from a chat that
  // was already on the current pod — opening one just resumes its service first.
  const [otherSessions, setOtherSessions] = useState<Session[]>([]);
  // True only for the very first fetch per service — a small, easy-to-miss indicator so a user
  // who opens the sidebar before this (async, non-blocking) merge lands sees something rather
  // than the list quietly growing a moment later. Periodic re-fetches stay silent.
  const [otherSessionsLoading, setOtherSessionsLoading] = useState(false);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  // Guards the plain "+ New chat" button (used when agent switching is disabled) so a fast
  // double-click can't create two sessions before the first navigation lands.
  const [startingNewChat, setStartingNewChat] = useState(false);
  const startingNewChatRef = useRef(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null);
  const [deleting, setDeleting] = useState(false);
  // True while a deep-page fetch is in a post-error backoff — pauses auto-paging (but not
  // permanently: a timer clears it for a capped, exponentially-backed-off retry).
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  // Composite (createdAt, id) cursor — the oldest row we hold. id breaks createdAt ties so
  // same-timestamp rows past a page edge aren't skipped.
  const cursorRef = useRef<string | null>(null);
  const cursorIdRef = useRef<string | null>(null);
  // Consecutive deep-page failures + the pending backoff timer (cleared on reset/unmount).
  const failCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  // Synchronous in-flight guard so the scroll observer can't double-fire a page fetch.
  const loadingRef = useRef(false);
  // Separate guard for the periodic poll so a slow deep-page fetch doesn't suppress it
  // (the poll only refreshes page 1 — it never touches the cursor / serverHasMore — so it
  // can safely run alongside a page fetch; both merge by id).
  const pollingRef = useRef(false);
  // Aborts in-flight fetches on unmount so a late-resolving page can't merge after teardown.
  const abortRef = useRef<AbortController | null>(null);
  // The scrollable list container + a bottom sentinel that triggers the next page.
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Merge a fetched page into the accumulated set: dedup by id (the page row wins, so
  // title / recency updates land) and re-sort by recency. Sorting here keeps the
  // grouped-bucket memo's sequential header logic correct. Recency comes from
  // localStorage (per-browser, updated on every send); falls back to createdAt so
  // brand-new chats with no localStorage entry yet still order sensibly.
  const mergeSessions = useCallback((prev: Session[], page: Session[]): Session[] => {
    const byId = new Map(prev.map((s) => [s.id, s]));
    for (const s of page) byId.set(s.id, s);
    return [...byId.values()].sort((a, b) => sessionRecency(b) - sessionRecency(a));
  }, []);

  // Reconcile a fresh page-1 (poll) fetch into the accumulated set. Page 1 is authoritative
  // for the newest window it covers, so unlike a plain merge this DROPS held rows inside that
  // window that the fresh page no longer returns (deleted server-side / in another tab) —
  // while preserving deeper pages strictly past the composite (createdAt, id) boundary. When
  // page 1 is short (< PAGE_SIZE) it is the complete set, so replace wholesale (self-heals).
  const reconcileFirstPage = useCallback((prev: Session[], page1: Session[]): Session[] => {
    const sortRecency = (arr: Session[]) => [...arr].sort((a, b) => sessionRecency(b) - sessionRecency(a));
    if (page1.length < SESSION_PAGE_SIZE) return sortRecency(page1);
    const page1Ids = new Set(page1.map((s) => s.id));
    const tail = page1[page1.length - 1]; // oldest in page 1 = window boundary
    const kept = prev.filter((s) => {
      if (page1Ids.has(s.id)) return false; // superseded by the fresh copy
      if (!s.createdAt || !tail.createdAt) return false;
      // keep only rows strictly past the composite boundary (genuine deeper pages); a held
      // row inside page 1's window but absent from the fresh page was deleted → drop it.
      if (s.createdAt < tail.createdAt) return true;
      return s.createdAt === tail.createdAt && s.id < tail.id;
    });
    return sortRecency([...page1, ...kept]);
  }, []);

  // Fetch the next older page (or the first page when nothing is loaded yet), keyed off
  // the oldest createdAt we currently hold. A short page (< PAGE_SIZE) means the end.
  const loadMoreFromServer = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const signal = abortRef.current?.signal;
    const isInitial = cursorRef.current === null;
    if (isInitial) setLoading(true);
    else setLoadingMore(true);
    try {
      const page = (await transport.listSessionsForService(undefined, {
        limit: SESSION_PAGE_SIZE,
        cursor: cursorRef.current ?? undefined,
        cursorId: cursorIdRef.current ?? undefined,
        signal,
      })) as Session[];
      // Fetch aborted (unmount / refreshKey reset) — drop the result so stale rows don't merge in.
      if (signal?.aborted) return;
      setServerHasMore(page.length === SESSION_PAGE_SIZE);
      if (page.length > 0) {
        // Server order is (createdAt desc, id desc): the last raw-page row is the oldest →
        // its (createdAt, id) is the composite cursor for the next page.
        const tail = page[page.length - 1];
        if (tail.createdAt) {
          cursorRef.current = tail.createdAt;
          cursorIdRef.current = tail.id;
        } else {
          // No createdAt to page past (shouldn't happen — set once on create): stop rather
          // than re-fetch page 1 forever on a full page that can't advance the cursor.
          setServerHasMore(false);
        }
        setSessions((prev) => mergeSessions(prev, page));
      }
      setError('');
      // Recovered — clear any pending error backoff.
      failCountRef.current = 0;
      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setLoadMoreFailed(false);
    } catch (err) {
      if (signal?.aborted) return; // aborted by a service switch — not a real error
      setError(t(sidebarLoadErrorKey(err)));
      // Pause auto-paging (don't permanently disable serverHasMore): a tight overflow-effect
      // retry loop would hammer a failing endpoint, but a single transient 500 shouldn't kill
      // paging for the session. Re-enable after an exponential backoff (capped 30s) for a
      // bounded retry; a manual scroll also retries once the pause clears.
      failCountRef.current += 1;
      setLoadMoreFailed(true);
      const backoffMs = Math.min(30_000, 1000 * 2 ** (failCountRef.current - 1));
      if (retryTimerRef.current != null) window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        setLoadMoreFailed(false);
      }, backoffMs);
    } finally {
      // Only the current generation clears the guards; an aborted (superseded) fetch
      // leaves them for the new service's load, which the reset effect already kicked off.
      if (!signal?.aborted) {
        loadingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [mergeSessions, t, transport]);

  // Poll refresh: re-fetch only the newest page and merge by id so new sessions + title
  // changes appear without discarding pages already scrolled in. Leaves the cursor and
  // serverHasMore untouched (those track the deep end, not page 1).
  const refreshFirstPage = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    const signal = abortRef.current?.signal;
    try {
      const page = (await transport.listSessionsForService(undefined, {
        limit: SESSION_PAGE_SIZE,
        signal,
      })) as Session[];
      if (signal?.aborted) return; // aborted mid-poll — don't merge stale rows
      // Reconcile (not just merge) so a session deleted server-side / in another tab is
      // purged from page 1's window rather than lingering until reload.
      setSessions((prev) => reconcileFirstPage(prev, page));
    } catch {
      /* poll errors are non-fatal — keep the current list */
    } finally {
      pollingRef.current = false;
    }
  }, [reconcileFirstPage, transport]);

  // Load page 1 on mount. Listing is caller-scoped across every owned pod, so switching the
  // active OpenCode / OpenHands service must NOT wipe the sidebar.
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    loadingRef.current = false;
    cursorRef.current = null;
    cursorIdRef.current = null;
    failCountRef.current = 0;
    if (retryTimerRef.current != null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setLoadMoreFailed(false);
    setSessions([]);
    setServerHasMore(true);
    setLoadingMore(false);
    setLoading(false);
    setError('');
    loadMoreFromServer();
    return () => {
      controller.abort();
      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
    // loadMoreFromServer is stable; re-running on its identity would double-fire the initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic page-1 refresh. Initial + deep-page loads come from the scroll effect below.
  useEffect(() => {
    const id = window.setInterval(refreshFirstPage, POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshFirstPage]);

  // Subagents dispatched by the current session, shown as nested rows beneath it. Only ever
  // fetched for currentSessionId — a subagent's own subagents (if any) aren't surfaced here;
  // the read-only transcript view is a dead end, not another nested tree.
  const [subagents, setSubagents] = useState<SubagentSummary[]>([]);
  useEffect(() => {
    if (!subagentsEnabled || !currentSessionId) {
      setSubagents([]);
      return;
    }
    // Clear the previous chat's rows immediately on switch — otherwise a slow/failed fetch for
    // the new session leaves the old session's subagent rows rendered under it until this
    // interval's next tick, mis-pairing deep links (`/chat#<new>/subagents/<old-child>`).
    setSubagents([]);
    let cancelled = false;
    const refresh = async () => {
      try {
        const list = await listSubagentsForSession(currentSessionId);
        if (!cancelled) setSubagents(list);
      } catch {
        // Non-fatal — the parent chat is still usable without the subagent tree.
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [subagentsEnabled, currentSessionId]);

  // Bounded, single-page fetch of the caller's own chats on OTHER services (never a rabbit
  // hole — server-side limit mirrors the adopt walk-back). No further paging here: this is
  // the caller's own overflow, not a browsable history. Re-fetched on the same cadence as the
  // main poll so a chat that just got reserved into a warm-pool restore drops out promptly.
  useEffect(() => {
    if (!serviceId) {
      setOtherSessions([]);
      setOtherSessionsLoading(false);
      return;
    }
    let cancelled = false;
    let isFirstFetch = true;
    const fetchOther = async () => {
      if (isFirstFetch) setOtherSessionsLoading(true);
      try {
        const raw = await listOtherSessionsForUser(serviceId);
        if (cancelled) return;
        setOtherSessions(
          (raw as Record<string, unknown>[]).map((r) => ({
            id: String(r.id),
            serviceId: typeof r.serviceId === 'string' ? r.serviceId : '',
            title: typeof r.title === 'string' ? r.title : undefined,
            createdAt: typeof r.createdAt === 'string' ? r.createdAt : undefined,
          }))
        );
      } catch (e) {
        // Best-effort — leave whatever was last loaded (or empty) rather than surfacing an
        // error banner for a purely informational, non-blocking part of the sidebar. Still log
        // so a persistent failure is visible/alertable rather than silently invisible.
        console.error('[SessionSidebar] failed to fetch other-service sessions', e);
      } finally {
        if (isFirstFetch && !cancelled) setOtherSessionsLoading(false);
        isFirstFetch = false;
      }
    };
    void fetchOther();
    const id = window.setInterval(fetchOther, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [serviceId]);

  // Reopen a chat that lives on a non-current service: resume its service first (routes
  // warm-pool restore / cold remount / a clear "already active" or "can no longer be
  // reopened" error), then navigate exactly like any other row. Retries transient failures —
  // mirrors ChatPage's own auto-resume budget for a chat that's already on the current pod.
  const openOtherSession = useCallback(
    async (session: Session) => {
      setResumingId(session.id);
      let lastMessage = '';
      for (let attempt = 1; attempt <= RESUME_ATTEMPTS; attempt++) {
        try {
          await resumeSession(session.id);
          navigate(`/chat#${session.id}`);
          setResumingId(null);
          return;
        } catch (e) {
          lastMessage = e instanceof Error ? e.message : '';
          if (isTerminalResumeError(lastMessage)) break;
          if (attempt < RESUME_ATTEMPTS) await new Promise((r) => setTimeout(r, RESUME_RETRY_DELAY_MS));
        }
      }
      setResumingId(null);
      if (/already.*active session/i.test(lastMessage)) {
        setError(t('sidebar.error.resumeActiveElsewhere'));
      } else if (/no longer be reopened/i.test(lastMessage)) {
        setError(t('sidebar.error.resumeGone'));
      } else {
        setError(t('error.resumeAgent'));
      }
    },
    [navigate, t]
  );

  // refreshKey bumps force an immediate page-1 refresh (e.g. parent renamed a session).
  // Skip the mount run so it doesn't race the scroll effect's initial load.
  const refreshFirstPageRef = useRef(refreshFirstPage);
  refreshFirstPageRef.current = refreshFirstPage;
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    refreshFirstPageRef.current();
  }, [refreshKey]);

  // Click anywhere outside an open menu closes it.
  useEffect(() => {
    if (!menuOpenFor) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest('.session-sidebar__row')) setMenuOpenFor(null);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menuOpenFor]);

  // Auto-focus rename input when entering rename mode.
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const startRename = useCallback((s: Session) => {
    setMenuOpenFor(null);
    setRenameDraft((s.title && s.title.trim()) || '');
    setRenamingId(s.id);
  }, []);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameDraft('');
    setRenameSaving(false);
  }, []);

  const submitRename = useCallback(async () => {
    if (!renamingId) return;
    const next = renameDraft.trim();
    if (!next) {
      cancelRename();
      return;
    }
    try {
      setRenameSaving(true);
      await transport.updateSessionTitle(renamingId, next);
      // Optimistic local update so the UI doesn't flicker the placeholder while
      // the next dashboard poll lands.
      setSessions((prev) => prev.map((s) => (s.id === renamingId ? { ...s, title: next } : s)));
      cancelRename();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.error.renameFailed'));
      setRenameSaving(false);
    }
  }, [renamingId, renameDraft, cancelRename, transport, t]);

  // Per-chat mining exclusion. Only offered when the host says learning is on for this user —
  // under `off` there is nothing to exclude the chat from. Mode comes from the host (prop), not
  // a host-only React Query hook, so this package stays extractable.
  const canOptOutChats =
    skillImprovementLearningEnabled === true && typeof transport.setSessionSkillImprovementOptOut === 'function';

  const toggleOptOut = useCallback(
    async (session: Session) => {
      const next = !session.skillImprovementOptOut;
      setMenuOpenFor(null);
      // Optimistic: the sidebar re-polls on its own schedule, and a checkmark that waits for the
      // next poll reads as a click that did nothing.
      setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, skillImprovementOptOut: next } : s)));
      onSkillImprovementOptOutChange?.(session.id, next);
      try {
        await transport.setSessionSkillImprovementOptOut?.(session.id, next);
      } catch (err) {
        setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, skillImprovementOptOut: !next } : s)));
        onSkillImprovementOptOutChange?.(session.id, !next);
        setError(err instanceof Error ? err.message : t('sidebar.error.optOutFailed'));
      }
    },
    [onSkillImprovementOptOutChange, t, transport]
  );

  // Plain "+ New chat" (agent switching disabled): create the pinned-agent chat directly, no
  // agent-selection popover. onPickAgent creates the committed session + navigates; on failure
  // surface the error inline. The sync ref guards a double-click racing two creates.
  const startPinnedNewChat = useCallback(
    async (agentDefId: string) => {
      if (startingNewChatRef.current) return;
      startingNewChatRef.current = true;
      setStartingNewChat(true);
      setError('');
      try {
        await onPickAgent(agentDefId);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('newChatMenu.error'));
      } finally {
        startingNewChatRef.current = false;
        setStartingNewChat(false);
      }
    },
    [onPickAgent, t]
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    // Sibling lookup only matters when the deleted chat is the one currently open (see the
    // navigate-to-sibling branch below) — that's always a current-service chat, so searching
    // `sessions` (current-service only, not the other-service merge) is correct even though the
    // sidebar can also show and delete a chat that lives on a different service.
    const sibling = sessions.find((s) => s.id !== id);
    try {
      setDeleting(true);
      await transport.removeChat(id);
      clearSessionLastUsed(id);
      clearSessionFirstMessage(id);
      clearDraft(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setPendingDelete(null);
      setDeleting(false);
      if (id === currentSessionId && sibling) {
        navigate(`/chat#${sibling.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.error.deleteFailed'));
      setDeleting(false);
    }
  }, [pendingDelete, currentSessionId, navigate, sessions, transport, t]);

  // Stable timestamp for the synthetic pending row, captured once at mount (the
  // ref keeps its first value). Minting it inside the memo would hand back a
  // fresh createdAt — and a new array identity — on every invalidation; the row
  // is prepended at the top regardless, so this only feeds its recency-bucket
  // label and should not change between renders.
  const pendingRowCreatedAt = useRef(new Date().toISOString());

  // Merge in the caller's stranded-elsewhere chats (otherSessions) so they render as ordinary
  // rows, sorted into the same recency order — nothing distinguishes them visually from a chat
  // that was already on the current pod.
  const allSessions = useMemo(() => {
    if (otherSessions.length === 0) return sessions;
    const byId = new Map(sessions.map((s) => [s.id, s]));
    for (const s of otherSessions) if (!byId.has(s.id)) byId.set(s.id, s);
    return [...byId.values()].sort((a, b) => sessionRecency(b) - sessionRecency(a));
  }, [sessions, otherSessions]);

  const displayedSessions = useMemo(() => {
    const withOptimistic =
      optimisticSession && !allSessions.some((s) => s.id === optimisticSession.id)
        ? [{ id: optimisticSession.id, serviceId: '', createdAt: optimisticSession.createdAt }, ...allSessions]
        : allSessions;
    // While on a fresh "+ New chat" screen (no session created yet), prepend a
    // synthetic active row so the blue active indicator shows on chat creation.
    // The optimistic row (keyed by the real id) supersedes this the moment the
    // first message creates the session and pendingNewChat flips false.
    if (pendingNewChat) {
      return [{ id: PENDING_NEW_CHAT_ID, serviceId: '', createdAt: pendingRowCreatedAt.current }, ...withOptimistic];
    }
    return withOptimistic;
  }, [allSessions, optimisticSession, pendingNewChat]);

  const groupedSessions = useMemo(() => {
    let lastBucket: RecencyBucket | null = null;
    return displayedSessions.map((s) => {
      const ts = sessionRecency(s);
      const bucket = bucketFor(ts);
      const showHeader = bucket !== lastBucket;
      lastBucket = bucket;
      return { session: s, bucket, showHeader };
    });
  }, [displayedSessions]);

  // All loaded rows render (chat rows are light); the bottom sentinel drives server
  // paging. Watching the sentinel against the scroll container loads the next page as
  // it nears the bottom.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadMoreFailed) loadMoreFromServer();
      },
      { root: listRef.current, rootMargin: '200px' }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [loadMoreFromServer, serverHasMore, loadMoreFailed]);

  // IntersectionObserver only fires on transitions, so a page that doesn't overflow the
  // list (sentinel stays visible) wouldn't re-trigger. Keep paging while the list isn't
  // scrollable and the server has more — covers tall viewports / few-row first pages.
  useEffect(() => {
    const el = listRef.current;
    if (!el || !serverHasMore || loading || loadingMore || loadMoreFailed) return;
    if (el.scrollHeight <= el.clientHeight) loadMoreFromServer();
  }, [sessions.length, serverHasMore, loading, loadingMore, loadMoreFailed, loadMoreFromServer]);

  // Single render path — collapsed/expanded both go through the same DOM so
  // the width + opacity transitions can animate smoothly. The `--collapsed`
  // modifier class drives all the visual differences via CSS (see .scss).
  // The inner content tracks the aside's animating width rather than holding a fixed
  // expanded width: every label is `whitespace-nowrap` + ellipsis, so the content shrinks
  // with the rail (and fades out) without reflowing — and its rounded children are never
  // sliced by the aside's `overflow-hidden` clip edge. `width` drives the aside only when
  // expanded so the collapsed rail keeps its CSS width.
  const sidebarStyle = width && !collapsed ? ({ width } as CSSProperties) : undefined;
  return (
    <aside
      className={cn(
        'session-sidebar flex w-[260px] flex-shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out',
        collapsed && 'session-sidebar--collapsed w-10'
      )}
      style={sidebarStyle}
    >
      <div
        className={cn(
          'session-sidebar__header flex min-h-[49px] flex-shrink-0 items-center justify-between px-3 py-2.5 transition-[padding] duration-200 ease-out',
          collapsed && 'justify-center px-1.5'
        )}
      >
        <span
          className={cn(
            'session-sidebar__title overflow-hidden whitespace-nowrap text-[13px] font-semibold text-foreground transition-[opacity,max-width] duration-200 ease-out',
            collapsed ? 'max-w-0 opacity-0' : 'max-w-[200px] opacity-100'
          )}
        >
          {t('sidebar.title')}
        </span>
        <div className="session-sidebar__controls flex items-center gap-0.5">
          {!collapsed && notifySupported && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    'session-sidebar__notify flex-shrink-0',
                    notifyActive ? 'text-primary' : 'text-muted-foreground'
                  )}
                  // Undecided → prompt; granted → toggle mute (the real on/off switch,
                  // since permission itself has no "off" once granted); denied is inert
                  // (can only be re-enabled from the browser's own settings) but stays
                  // hoverable so the tooltip can still explain the current state.
                  onClick={onBellClick}
                  aria-label={t('notifications.ariaLabel')}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    aria-hidden
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  >
                    <path
                      d="M8 1.75a3.5 3.5 0 0 0-3.5 3.5c0 3-1.25 4-1.25 4h9.5s-1.25-1-1.25-4A3.5 3.5 0 0 0 8 1.75Z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill={notifyActive ? 'currentColor' : 'none'}
                    />
                    <path d="M6.75 12.5a1.25 1.25 0 0 0 2.5 0" strokeLinecap="round" strokeLinejoin="round" />
                    {notifyPermission === 'denied' && <path d="M2.5 2.5l11 11" strokeLinecap="round" />}
                    {notifyPermission === 'granted' && notifyMuted && (
                      <path d="M2.5 2.5l11 11" strokeLinecap="round" strokeDasharray="2 1.5" />
                    )}
                  </svg>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {notifyPermission === 'granted'
                  ? notifyMuted
                    ? t('notifications.mutedTooltip')
                    : t('notifications.enabledTooltip')
                  : notifyPermission === 'denied'
                    ? t('notifications.blockedTooltip')
                    : t('notifications.enableTooltip')}
              </TooltipContent>
            </Tooltip>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="session-sidebar__toggle flex-shrink-0 text-muted-foreground"
            onClick={onToggle}
            title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            aria-expanded={!collapsed}
          >
            <svg
              className={cn(
                'session-sidebar__toggle-icon transition-transform duration-200 ease-out',
                collapsed && 'rotate-180'
              )}
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M12 3l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'session-sidebar__content flex min-h-0 flex-1 flex-col transition-opacity duration-200 ease-out',
          collapsed && 'pointer-events-none opacity-0'
        )}
        aria-hidden={collapsed}
      >
        {allowAgentSwitch ? (
          <NewChatAgentMenu
            onPickAgent={onPickAgent}
            disabled={!serviceId || noModelsAvailable}
            disabledTooltip={noModelsAvailable ? t('error.noModelsContactAdmin') : undefined}
            className="session-sidebar__new mx-3 my-2.5 flex-shrink-0"
          />
        ) : noModelsAvailable ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="session-sidebar__new mx-3 my-2.5 inline-flex flex-shrink-0" tabIndex={0}>
                <Button
                  type="button"
                  className="w-full overflow-hidden whitespace-nowrap"
                  disabled
                  aria-disabled="true"
                  title={t('error.noModelsContactAdmin')}
                  data-testid="new-chat-button"
                >
                  {t('sidebar.newChat')}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent data-testid="new-chat-button-tooltip">{t('error.noModelsContactAdmin')}</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            type="button"
            className="session-sidebar__new mx-3 my-2.5 flex-shrink-0 overflow-hidden whitespace-nowrap"
            disabled={!serviceId || startingNewChat || !newChatAgentDefId}
            data-testid="new-chat-button"
            onClick={() => {
              if (!newChatAgentDefId) return;
              void startPinnedNewChat(newChatAgentDefId);
            }}
          >
            {t('sidebar.newChat')}
          </Button>
        )}

        {error && (
          <div className="session-sidebar__error mx-3 mb-2 flex items-baseline gap-2 rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            {error}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="session-sidebar__error-dismiss ml-auto flex-shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label={t('dismiss')}
              onClick={() => setError('')}
            >
              ✕
            </Button>
          </div>
        )}

        <div className="session-sidebar__list flex-1 overflow-y-auto px-3 pb-3 pt-1" role="list" ref={listRef}>
          {displayedSessions.length === 0 && !loading && (
            <div className="session-sidebar__empty px-3 py-2 text-xs italic text-muted-foreground">
              {t('sidebar.empty')}
            </div>
          )}
          {groupedSessions.map(({ session: s, bucket, showHeader }) => {
            // The synthetic pending row has no real session and is always the active
            // one (it only exists on the fresh new-chat screen).
            const isPending = s.id === PENDING_NEW_CHAT_ID;
            // While viewing a subagent's transcript, the active indicator belongs on its nested
            // row (see viewingSubagentSessionId below) — not on the parent row too.
            const isActive = isPending || (s.id === currentSessionId && !viewingSubagentSessionId);
            // Persisted smart title wins; until it lands, show the per-browser
            // provisional label (clipped first user message); else "New chat".
            // The synthetic pending row has no stored first message — skip the lookup.
            const label = isPending
              ? t('sidebar.newChatLabel')
              : (s.title && s.title.trim()) || getSessionFirstMessage(s.id) || t('sidebar.newChatLabel');
            const isRenaming = renamingId === s.id;
            const isMenuOpen = menuOpenFor === s.id;
            // Learning is controllable for THIS chat only when every tier is on: the app-wide +
            // user cascade (canOptOutChats, from effectiveMode) AND this chat's own agent, whose
            // participation was frozen onto the session at creation. An agent-off (or pre-field)
            // chat is never mined, so it shows no learning affordance at all — matching the mining
            // gate exactly, so the sidebar never implies a chat could be learned from when it can't.
            const chatLearnable = canOptOutChats && s.skillImprovementAgentEnabled === true;
            // A chat whose service isn't the current one needs its service resumed before it can
            // be opened (it may be STOPPED or TERMINATED-with-a-blob-snapshot) — everything else
            // about the row (label, grouping, menu) is identical to a same-service chat.
            const isOtherService = !isPending && !!s.serviceId && s.serviceId !== serviceId;
            const isResumingThis = resumingId === s.id;
            return (
              <Fragment key={s.id}>
                {showHeader && (
                  <div
                    className="session-sidebar__group-header select-none px-3 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wider text-muted-foreground first:pt-1"
                    role="presentation"
                  >
                    {bucketLabel(bucket, t)}
                  </div>
                )}
                {/* This wrapper (not the row div below) carries role="listitem": when the row has
                    nested subagent rows, ARIA requires the nested role="list" to sit inside the
                    listitem it belongs to, not as its sibling — otherwise it becomes an invalid
                    direct child of the outer role="list" and some screen readers skip it or
                    misreport the item count. */}
                <div role="listitem">
                  <div
                    className={cn(
                      'session-sidebar__row group relative mb-0.5 flex items-center gap-1 rounded-md py-1 pl-2.5 pr-1.5',
                      isActive
                        ? 'session-sidebar__row--active bg-primary/10 font-medium text-primary'
                        : 'hover:bg-accent'
                    )}
                  >
                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        className="session-sidebar__rename-input min-w-0 flex-1 rounded-md border border-primary bg-background px-1.5 py-1 text-[13px] text-foreground outline-none"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            submitRename();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelRename();
                          }
                        }}
                        onBlur={submitRename}
                        disabled={renameSaving}
                        maxLength={80}
                        aria-label={t('sidebar.renameLabel')}
                      />
                    ) : (
                      <Link
                        to={isPending ? '/chat#new' : `/chat#${s.id}`}
                        className="session-sidebar__link flex min-w-0 flex-1 items-center gap-1.5 py-1 text-[13px] text-inherit no-underline hover:no-underline"
                        title={label}
                        aria-disabled={isOtherService && resumingId !== null}
                        onClick={(e) => {
                          // Only a plain left-click is intercepted — a modified click (new tab /
                          // window) keeps the real href so the browser's own handling still works.
                          if (!isOtherService) return;
                          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                          e.preventDefault();
                          if (resumingId !== null) return; // one resume in flight at a time
                          void openOtherSession(s);
                        }}
                      >
                        <span className="session-sidebar__item-label flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                          {isResumingThis ? t('sidebar.resumingChat') : <TitleText text={label} />}
                        </span>
                      </Link>
                    )}
                    {/* Callout for a chat that has spawned subagents, shown on every row in the tree
                      (not only the open one) so it's visible before the user ever clicks in. */}
                    {!isRenaming && !isPending && subagentsEnabled && s.hasSubagents && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="session-sidebar__has-subagents inline-flex flex-shrink-0 items-center text-muted-foreground"
                            data-testid={`session-has-subagents-${s.id}`}
                            tabIndex={0}
                            aria-label={t('sidebar.hasSubagentsTooltip')}
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                              <circle cx="3" cy="1.6" r="1.3" fill="currentColor" />
                              <circle cx="9" cy="1.6" r="1.3" fill="currentColor" />
                              <circle cx="6" cy="10.4" r="1.3" fill="currentColor" />
                              <path
                                d="M3 2.9v2.4a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V2.9M6 6.3v3"
                                stroke="currentColor"
                                strokeWidth="1.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{t('sidebar.hasSubagentsTooltip')}</TooltipContent>
                      </Tooltip>
                    )}
                    {/* Passive status only for the exception (this chat is excluded from mining); the
                      toggle itself lives in the ⋯ menu. Participating chats show nothing, so the
                      common case stays uncluttered while an excluded chat still reads at a glance. */}
                    {!isRenaming && !isPending && chatLearnable && s.skillImprovementOptOut && (
                      <StatusPill
                        tone="neutral"
                        className="shrink-0"
                        title={t('sidebar.includeInLearning')}
                        data-testid={`session-learning-excluded-${s.id}`}
                      >
                        {t('sidebar.learningOff')}
                      </StatusPill>
                    )}
                    {/* Shown on the open chat too: with the running pill occupying this slot
                      whenever a turn is in flight, an empty slot during a permission pause
                      read as "status missing". The awaiting nudge (pill + tab badge + toast)
                      shows for every awaiting chat, the open one included */}
                    {!isRenaming && s.awaitingInput && !isAwaitingDismissed(awaitingDismissed, s.id) && (
                      <StatusPill tone="warning" dot pulse className="session-sidebar__awaiting flex-shrink-0">
                        {t('sidebar.awaitingInput')}
                        {/* Dismiss the nudge without answering (clears badge + pill for this chat).
                          Stop propagation so it doesn't also open the session row. */}
                        <button
                          type="button"
                          className="-ml-3 -mr-3 inline-flex size-3.5 items-center justify-center rounded-full opacity-70 transition-opacity hover:bg-warning/20 hover:opacity-100"
                          aria-label={t('sidebar.dismissAwaitingAriaLabel')}
                          title={t('sidebar.dismissAwaiting')}
                          data-testid={`session-awaiting-dismiss-${s.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            markAwaitingDismissed(s.id);
                          }}
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                          </svg>
                        </button>
                      </StatusPill>
                    )}
                    {/* "Running" pill: this browser started (or reattached to) an agent turn
                      for this chat that it hasn't seen finish — client-side registry in
                      lib/runningTurns (localStorage, staleness-guarded), no server flag.
                      The awaiting pill wins — a chat blocked on the user is not "working".
                      Shown on the open chat too (status, not a nag — mirrors the in-chat
                      activity line). */}
                    {!isRenaming && !s.awaitingInput && isTurnRunning(runningTurns, s.id) && (
                      <StatusPill tone="info" dot pulse className="session-sidebar__running flex-shrink-0">
                        {t('sidebar.running')}
                      </StatusPill>
                    )}
                    {!isRenaming &&
                      isBedrockBackend &&
                      s.createdAt &&
                      Date.now() - new Date(s.createdAt).getTime() > bedrockMaxLifetimeMs && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-help">
                              <StatusPill tone="neutral" className="session-sidebar__expired flex-shrink-0">
                                {t('sidebar.expired')}
                              </StatusPill>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{t('sidebar.expiredTooltip')}</TooltipContent>
                        </Tooltip>
                      )}
                    {!isRenaming && !isPending && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className={cn(
                          'session-sidebar__more flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100',
                          isActive && 'text-inherit opacity-100'
                        )}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenuOpenFor(isMenuOpen ? null : s.id);
                        }}
                        title={t('sidebar.moreActions')}
                        aria-label={t('sidebar.moreActions')}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                          <circle cx="3" cy="8" r="1.4" />
                          <circle cx="8" cy="8" r="1.4" />
                          <circle cx="13" cy="8" r="1.4" />
                        </svg>
                      </Button>
                    )}
                    {isMenuOpen && !isRenaming && (
                      <div
                        className="session-sidebar__menu absolute right-1.5 top-full z-20 min-w-[140px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                        role="menu"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="session-sidebar__menu-item block w-full cursor-pointer rounded-sm px-3 py-1.5 text-left text-[13px] text-foreground hover:bg-accent"
                          onClick={() => startRename(s)}
                        >
                          {t('sidebar.rename')}
                        </button>
                        {onDownload && !isOtherService ? (
                          <button
                            type="button"
                            role="menuitem"
                            className="session-sidebar__menu-item block w-full cursor-pointer rounded-sm px-3 py-1.5 text-left text-[13px] text-foreground hover:bg-accent"
                            onClick={() => {
                              setMenuOpenFor(null);
                              onDownload(s.id);
                            }}
                          >
                            {t('sidebar.download')}
                          </button>
                        ) : null}
                        {chatLearnable && (
                          <button
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={s.skillImprovementOptOut === true}
                            className="session-sidebar__menu-item block w-full cursor-pointer rounded-sm px-3 py-1.5 text-left text-[13px] text-foreground hover:bg-accent"
                            onClick={() => void toggleOptOut(s)}
                            data-testid={`session-optout-${s.id}`}
                          >
                            {s.skillImprovementOptOut
                              ? t('sidebar.includeInLearning')
                              : t('sidebar.excludeFromLearning')}
                          </button>
                        )}
                        {sessions.length > 1 ? (
                          <button
                            type="button"
                            role="menuitem"
                            className="session-sidebar__menu-item session-sidebar__menu-item--danger block w-full cursor-pointer rounded-sm px-3 py-1.5 text-left text-[13px] text-destructive hover:bg-accent"
                            onClick={() => {
                              setMenuOpenFor(null);
                              setPendingDelete(s);
                            }}
                          >
                            {t('sidebar.deleteChat')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            role="menuitem"
                            className="session-sidebar__menu-item session-sidebar__menu-item--disabled block w-full cursor-not-allowed rounded-sm px-3 py-1.5 text-left text-[13px] text-muted-foreground"
                            disabled
                            title={t('sidebar.lastChatTitle')}
                          >
                            {t('sidebar.deleteChat')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {subagentsEnabled && s.id === currentSessionId && subagents.length > 0 && (
                    <div className="session-sidebar__subagents" role="list">
                      {subagents
                        .filter((sub): sub is SubagentSummary & { subagentSessionId: string } =>
                          Boolean(sub.subagentSessionId)
                        )
                        .map((sub) => {
                          const subActive = sub.subagentSessionId === viewingSubagentSessionId;
                          return (
                            <div key={sub.subagentSessionId} role="listitem">
                              <Link
                                to={`/chat#${s.id}/subagents/${sub.subagentSessionId}`}
                                className={cn(
                                  'session-sidebar__subagent-row flex items-center gap-1.5 rounded-md py-1 pl-6 pr-1.5 text-[13px] text-inherit no-underline hover:no-underline',
                                  subActive ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-accent'
                                )}
                                data-testid={`subagent-row-${sub.subagentSessionId}`}
                              >
                                <span className="flex min-w-0 flex-1 flex-col overflow-hidden">
                                  <span className="session-sidebar__subagent-label overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">
                                    {sub.title || t('subagent.sidebarSectionLabel')}
                                  </span>
                                  {sub.agentName && (
                                    // Two subagents can share the same placeholder title before either
                                    // finishes generating one — the bound agent's name (denormalized
                                    // onto the session at create time) tells them apart in the meantime.
                                    <span className="session-sidebar__subagent-agent-name overflow-hidden text-ellipsis whitespace-nowrap text-2xs text-muted-foreground/70">
                                      {sub.agentName}
                                    </span>
                                  )}
                                </span>
                                {sub.status === 'TERMINATED' && (
                                  <StatusPill tone="neutral" className="shrink-0">
                                    {t('subagent.terminatedStatus')}
                                  </StatusPill>
                                )}
                              </Link>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </Fragment>
            );
          })}
          {serverHasMore && (
            <div ref={sentinelRef} className="session-sidebar__sentinel h-px flex-shrink-0" aria-hidden />
          )}
          {loadingMore && (
            <div
              className="session-sidebar__loading-more px-3 py-2 text-center text-xs italic text-muted-foreground"
              role="status"
            >
              {t('sidebar.loadingMore')}
            </div>
          )}
        </div>
        {/* Rendered as a sibling of the role="list" container, not inside it — a role="status"
            node is not a valid direct child of role="list" per aria-required-children (only
            role="listitem" is), so this must sit outside. Small, easy-to-miss indicator for the
            async merge above — only while the caller's other-service chats are still being
            fetched for the first time on this service, so a user who opens the sidebar right
            away sees something rather than the list quietly growing a moment later. Not shown
            once the merge has resolved once (even to empty). */}
        {otherSessionsLoading && !loading && (
          <div
            className="session-sidebar__other-loading flex items-center gap-1.5 px-3 py-1 text-2xs italic text-muted-foreground"
            role="status"
          >
            <svg className="h-2.5 w-2.5 flex-shrink-0 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
              <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {t('sidebar.loadingMore')}
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!pendingDelete}
        title={t('sidebar.deleteModal.title')}
        message={
          pendingDelete
            ? t('sidebar.deleteModal.message', {
                title: (pendingDelete.title && pendingDelete.title.trim()) || t('sidebar.newChatLabel'),
              })
            : ''
        }
        confirmLabel={t('sidebar.deleteModal.confirm', 'Delete')}
        loadingLabel={t('sidebar.deleteModal.loading', 'Deleting')}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
        loading={deleting}
      />
    </aside>
  );
}
