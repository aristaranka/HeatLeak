/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onServiceUnhealthy } from './agentPodFetch';
import { reserve, myService, serviceHealth, resumeService } from './chatApi';
import { LAST_SERVICE_ID_KEY, LAST_AGENT_BASE_URL_KEY } from './envApp';
import { llmBlockReason } from './llmBlockReason';

/**
 * App-level pod provisioning controller.
 *
 * Owns the single source of truth for "does the user have a live agent pod, and if not, are
 * we getting one". Runs once on mount: a cheap `myService()` liveness check decides whether
 * to skip straight to `ready` (live pod) or kick off a background `reserve()`. The loading
 * screen is rendered by the route that cares (ChatPage) off `status`; other routes ignore it,
 * so provisioning proceeds silently there. Service-death detected reactively anywhere in the
 * app (via `onServiceUnhealthy`) routes back through here to re-provision.
 */
export type ProvisionStatus = 'unknown' | 'provisioning' | 'ready' | 'unhealthy';

interface SessionContextValue {
  status: ProvisionStatus;
  /** The live pod's Service id, or '' until known. Mirrors LAST_SERVICE_ID_KEY. */
  serviceId: string;
  /** The live pod's agent base URL, or '' until known. Mirrors LAST_AGENT_BASE_URL_KEY.
   *  ChatPage must adopt this (not a one-shot localStorage read) so pod fetches never race a
   *  stale URL after reserve/resume. */
  agentBaseUrl: string;
  /** True once re-provisioning has exhausted its retries. The chat surfaces an in-place error
   *  state (Retry / Go to Agents) rather than auto-redirecting. */
  failed: boolean;
  /** Report that the current pod is dead so the controller re-provisions. Safe to call repeatedly. */
  reportUnhealthy: () => void;
  /** Clear a failed state and re-provision from scratch — backs the error state's "Retry" action. */
  retry: () => void;
  /** What the current provisioning pass is doing, so the loader shows one of just two messages:
   *  'resuming' an existing service, or 'starting' a fresh one. null when not provisioning. */
  provisionMode: 'resuming' | 'starting' | null;
  /** Correlation id extracted from a PERMANENT provisioning failure, for the user to relay to an
   *  admin. '' for transient failures (timeout / pool-empty), whose internal messages must not
   *  surface. Only meaningful while `failed` is true; cleared on every fresh provision. */
  failureCorrId: string;
  /** Cause of a terminal failure, when it is a specific degraded condition the UI should message
   *  differently. `'no-models'` = the LLM path is non-functional (zero usable models), so the chat
   *  shows a "contact your administrator" terminal error instead of the generic correlation-id one.
   *  null for the generic provisioning failure. Only meaningful while `failed` is true. */
  failureReason: 'no-models' | null;
  /** Bumped at the start of every fresh provision pass (mount, Retry, reactive re-provision). A
   *  consumer that caches a prior attempt's failure (the startup-status poll) resets on the bump so
   *  a Retry never flashes the previous attempt's error message. */
  provisionEpoch: number;
}

/** Thrown by the provisioning precheck when the LLM path is non-functional (zero usable models).
 *  Short-circuits provisioning to a terminal "contact admin" state without a reserve/resume, so the
 *  user never enters the spinner for a system that cannot serve a turn (design §5.3). Fails fast —
 *  the retry loop does not re-attempt it. */
class NoUsableModelsError extends Error {
  constructor() {
    super('no usable LLM models available');
    this.name = 'NoUsableModelsError';
  }
}

/** The backend permanent-provisioning failure throws a user-facing sentence ending in
 *  "…provide correlation ID <id>." (the failed pod's TERMINATED Service row id, durable in the DB).
 *  Pull that id out so the overlay can show it. Transient failures (reserve timeout, "pool empty")
 *  carry no such marker and yield '' — keeping their internal messages off the user's screen.
 *  Load-bearing: this keys off the backend phrasing; if it changes the id silently stops showing
 *  (the overlay falls back to the generic message — no crash). The test fixture anchors the exact
 *  sentence. Tolerant of a trailing period and trailing whitespace. */
const CORRELATION_ID_RE = /correlation ID\s+(\S+?)\.?\s*$/i;
function extractCorrelationId(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const match = CORRELATION_ID_RE.exec(msg);
  return match ? match[1] : '';
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Cap re-provision attempts so an unrecoverable pod (e.g. TERMINATED) doesn't loop on the server. */
const MAX_PROVISION_ATTEMPTS = 2;
/** Delay between provision attempts so a failing pod isn't hammered twice back-to-back. */
const RETRY_BACKOFF_MS = 1500;
/** Per-step ceiling for the cheap provisioning calls (myService / serviceHealth). A hung
 *  backend call would otherwise leave the overlay spinning forever; this bounds it so the attempt
 *  fails, retries, and ultimately surfaces an actionable error state. */
const PROVISION_STEP_TIMEOUT_MS = 60_000;
/** The server reserves for nine minutes, plus one in-flight claim/seed operation. Do not abandon
 *  a normal cold start at 60s and dispatch a second reservation while the first still owns work. */
export const RESERVE_STEP_TIMEOUT_MS = 10 * 60_000;
class ReservationTimeoutError extends Error {}
/** Resume gets its own, larger ceiling: it is synchronous server-side and blocks through the pod
 *  cold-boot (image pull + scheduling + health), observed up to ~250s. 60s would time out on most
 *  cold resumes and — since we now refuse to reserve over a STOPPED session — strand the user on an
 *  error instead of waiting out a resume that would have succeeded. 300s covers the observed range
 *  without loosening the cheap steps. */
const RESUME_STEP_TIMEOUT_MS = 300_000;

/** Reject `promise` if it hasn't settled within `ms`. The timer is cleared on settle so a slow
 *  (but eventually-resolving) call doesn't leak. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const ErrorType = label === 'reserve' ? ReservationTimeoutError : Error;
      reject(new ErrorType(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export const SessionProvider: React.FC<{ children: React.ReactNode; agentDefId?: string }> = ({
  children,
  agentDefId,
}) => {
  const [status, setStatus] = useState<ProvisionStatus>('unknown');
  const [serviceId, setServiceId] = useState<string>(() => localStorage.getItem(LAST_SERVICE_ID_KEY) || '');
  const [agentBaseUrl, setAgentBaseUrl] = useState<string>(() => localStorage.getItem(LAST_AGENT_BASE_URL_KEY) || '');
  const [failed, setFailed] = useState(false);
  const [provisionMode, setProvisionMode] = useState<'resuming' | 'starting' | null>(null);
  const [failureCorrId, setFailureCorrId] = useState('');
  const [failureReason, setFailureReason] = useState<'no-models' | null>(null);
  const [provisionEpoch, setProvisionEpoch] = useState(0);

  // Synchronous guard: a single in-flight provision promise. StrictMode double-invokes the
  // mount effect, and reportUnhealthy can fire concurrently with the initial run — both reuse
  // this promise instead of firing a second reserve().
  const inFlightRef = useRef<Promise<void> | null>(null);

  const clearLiveService = useCallback(() => {
    localStorage.removeItem(LAST_SERVICE_ID_KEY);
    localStorage.removeItem(LAST_AGENT_BASE_URL_KEY);
    setServiceId('');
    setAgentBaseUrl('');
  }, []);

  const persistLiveService = useCallback((svcId: string, baseUrl?: string) => {
    if (svcId) localStorage.setItem(LAST_SERVICE_ID_KEY, svcId);
    if (baseUrl) {
      localStorage.setItem(LAST_AGENT_BASE_URL_KEY, baseUrl);
      setAgentBaseUrl(baseUrl);
    }
    setServiceId(svcId);
  }, []);

  // One liveness-check-then-(resume|reserve) cycle. Throws on failure so the retry loop reacts.
  const provisionOnce = useCallback(async (): Promise<void> => {
    // Do NOT blank provisionMode here: on a retry the overlay title reads off it, and nulling it
    // mid-flight flashes the fallback ("Resuming…") between two "Spinning up…" frames. Each branch
    // below sets it fresh; the ACTIVE fast-path exits before the overlay is shown, and provision()
    // clears it on the terminal ready/failed transition.
    const live = await withTimeout(myService(agentDefId), PROVISION_STEP_TIMEOUT_MS, 'myService');
    // 1. Live ACTIVE pod → skip the loading screen entirely. Persist its agentBaseUrl too so a
    //    fresh-mount pending chat (e.g. a "Chat with agent" deep-link) has a usable composer
    //    immediately, without a getSessionInfo round-trip.
    if (live?.status === 'ACTIVE') {
      persistLiveService(live.serviceId, live.agentBaseUrl);
      return;
    }
    // Precheck before any reserve/resume: only a known-empty catalog on a *ready* proxy is terminal
    // (`llmBlockReason` → `empty`). Proxy-not-ready (`starting`) and probe-fail outage
    // (`unavailable`) must NOT fail here — boot already lets the pool proceed while LiteLLM comes
    // up; the composer soft-blocks until ready. Health probe throw/timeout fails OPEN (proceed).
    // Only past ACTIVE fast-path — live pods use the composer guard alone.
    try {
      const health = await withTimeout(serviceHealth(), PROVISION_STEP_TIMEOUT_MS, 'serviceHealth');
      if (llmBlockReason(health) === 'empty') throw new NoUsableModelsError();
    } catch (err) {
      if (err instanceof NoUsableModelsError) throw err;
      console.warn('[session] serviceHealth precheck failed; proceeding to provision', err);
    }
    // 2. Resumable STOPPED pod (pod gone, PVC + chats preserved) → resume it. We NEVER fall through
    //    to reserve() from here: reserving a fresh pod abandons the user's PVC (chat history,
    //    attachments), which is unacceptable. resume() only ever re-creates THIS user's pod from
    //    THEIR PVC — the pod's baseUrl is deterministic across resume (derived from the stable
    //    cloudServiceId), so the existing breadcrumb stays valid; ChatPage recovers it via
    //    getSession if absent. The pod cold-boot can take minutes, so resume gets the larger
    //    RESUME_STEP_TIMEOUT_MS. If resume fails, the throw propagates to the retry loop; if it
    //    ultimately can't recover, the chat shows an in-place error (Retry / Go to Agents) — we
    //    surface a recoverable error rather than silently spin up an empty replacement pod.
    if (live?.status === 'STOPPED') {
      setProvisionMode('resuming');
      setStatus('provisioning');
      await withTimeout(resumeService(live.serviceId), RESUME_STEP_TIMEOUT_MS, 'resumeService');
      persistLiveService(live.serviceId, live.agentBaseUrl);
      return;
    }
    // 3. No pod owned at all (myService returned null — nothing to preserve) → reserve a fresh one.
    //    A STOPPED session is handled above and never reaches here, so this branch can't orphan a
    //    user's PVC. Drop any stale breadcrumb (it points at a reaped/dead pod) so nothing reads it
    //    during the reserve window, then reserve. Phase 3 threads the selected agent's appId; for
    //    now reserve against the backend-default (seeded) agent.
    clearLiveService();
    setProvisionMode('starting');
    setStatus('provisioning');
    // reserve() is pod-only now: it returns the pod's serviceId + agentBaseUrl directly and
    // creates NO chat. The app lands in pending mode (serviceId set, no sessionId); the first
    // chat is created lazily on the user's first message via addSession, bound to the chosen
    // agent. Fail loud if serviceId OR agentBaseUrl is missing — otherwise we'd flip to 'ready'
    // with a serviceId but no base (composer/listModels would hit a stale prior base, or none).
    const { serviceId: reservedId, agentBaseUrl: reservedBase } = await withTimeout(
      reserve(agentDefId),
      RESERVE_STEP_TIMEOUT_MS,
      'reserve'
    );
    if (!reservedId) {
      throw new Error('reserve() returned no pod serviceId');
    }
    if (!reservedBase) {
      throw new Error('reserve() returned no agentBaseUrl');
    }
    persistLiveService(reservedId, reservedBase);
  }, [persistLiveService, clearLiveService, agentDefId]);

  // Provision with a bounded retry loop. A single shared in-flight promise dedupes concurrent
  // callers (mount effect under StrictMode, reactive reportUnhealthy).
  const provision = useCallback((): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;
    // Fresh pass → bump the epoch so cached-failure consumers (startup-status poll) reset.
    setProvisionEpoch((n) => n + 1);
    const run = async () => {
      for (let attempt = 1; attempt <= MAX_PROVISION_ATTEMPTS; attempt++) {
        try {
          await provisionOnce();
          setFailed(false);
          setFailureCorrId('');
          setFailureReason(null);
          setStatus('ready');
          setProvisionMode(null);
          return;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[session] provision attempt failed', { attempt, max: MAX_PROVISION_ATTEMPTS }, err);
          // Zero usable models is a stable, cause-specific condition — retrying just delays the same
          // terminal error, so fail fast and let the chat render the "contact admin" message.
          const noModels = err instanceof NoUsableModelsError;
          // A browser deadline does not cancel server work. Stop automatic retries on our reserve
          // deadline; explicit Retry first reconciles myService() before requesting another pod.
          if (noModels || err instanceof ReservationTimeoutError || attempt >= MAX_PROVISION_ATTEMPTS) {
            setFailed(true);
            setFailureReason(noModels ? 'no-models' : null);
            // Surface the correlation id only when the failure is the permanent kind that carries
            // one; transient exhaustion and the no-models case leave it '' so no internal message
            // reaches the overlay.
            setFailureCorrId(noModels ? '' : extractCorrelationId(err));
            setStatus('unhealthy');
            throw err;
          }
          // Back off before retrying so we don't hammer the server twice instantly on an
          // unrecoverable pod (e.g. TERMINATED resume that 500s on every call).
          await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
        }
      }
    };
    const p = run().finally(() => {
      inFlightRef.current = null;
    });
    inFlightRef.current = p;
    return p;
  }, [provisionOnce]);

  // A liveness 404/410 report that arrives while a provision is in flight must not be
  // silently dropped: if the provision settles on the SAME pod (resume path), nothing would
  // ever bounce it and the user dead-ends. Park the failing base here and re-evaluate once
  // the provision settles (see the status effect below).
  const pendingDeadBaseRef = useRef<string | null>(null);

  const reportUnhealthy = useCallback(
    (failedAgentBaseUrl?: string) => {
      // A report about a base we already abandoned is stale — a bounce already happened
      // and a different pod is (or will be) live. Ignore it.
      const liveBase = localStorage.getItem(LAST_AGENT_BASE_URL_KEY);
      if (failedAgentBaseUrl && liveBase && failedAgentBaseUrl !== liveBase) return;
      // Already working on it — don't pile on; remember the report so a provision that
      // settles on this same base still gets bounced.
      if (inFlightRef.current || status === 'provisioning') {
        pendingDeadBaseRef.current = failedAgentBaseUrl || liveBase;
        return;
      }
      if (failed) return;
      clearLiveService();
      setFailureCorrId('');
      setFailureReason(null);
      setStatus('unhealthy');
      void provision().catch(() => {
        /* surfaced via `failed` / status */
      });
    },
    [status, failed, provision, clearLiveService]
  );

  // Replay a parked dead-pod report once provisioning settles: if the provision kept the
  // reported base (resume of the same pod), bounce it now; if it produced a new base, the
  // report was about the old pod and is moot.
  useEffect(() => {
    if (status !== 'ready') return;
    const pending = pendingDeadBaseRef.current;
    pendingDeadBaseRef.current = null;
    if (pending && pending === localStorage.getItem(LAST_AGENT_BASE_URL_KEY)) {
      reportUnhealthy(pending);
    }
  }, [status, reportUnhealthy]);

  // Manual recovery from a terminal failure (the chat error state's "Retry"). Unlike
  // reportUnhealthy, this deliberately runs even when `failed` is true — clearing it first so the
  // overlay flips back to the spinner — and drops the stale breadcrumbs so we re-resolve a pod.
  const retry = useCallback(() => {
    if (inFlightRef.current) return;
    clearLiveService();
    setFailed(false);
    setFailureCorrId('');
    setFailureReason(null);
    setStatus('provisioning');
    void provision().catch(() => {
      /* surfaced via `failed` / status */
    });
  }, [provision, clearLiveService]);

  // Register the reactive health reporter so pod-side 404/410s anywhere bounce here.
  useEffect(() => {
    onServiceUnhealthy(reportUnhealthy);
    return () => onServiceUnhealthy(null);
  }, [reportUnhealthy]);

  // Provision on mount, and again when a Chat-button Definition arrives after the
  // default-profile reserve. Existing chats on other profiles stay on their own pods;
  // this only claims/reuses a matching interactive pod for the requested Definition.
  const lastProvisionedDefRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const nextDef = agentDefId || undefined;
    if (lastProvisionedDefRef.current === nextDef && lastProvisionedDefRef.current !== undefined) return;
    lastProvisionedDefRef.current = nextDef;
    const pending = inFlightRef.current;
    const run = pending ? pending.catch(() => undefined).then(() => provision()) : provision();
    void run.catch(() => {
      /* surfaced via `failed` / status */
    });
  }, [agentDefId, provision]);

  const value: SessionContextValue = {
    status,
    serviceId,
    agentBaseUrl,
    failed,
    reportUnhealthy,
    retry,
    provisionMode,
    failureCorrId,
    failureReason,
    provisionEpoch,
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
