/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { authFetch, SessionExpiredError } from './sessionExpiry';

/** Agent-pod warm-up retry budget — see api.ts module comment for rationale. */
const AGENT_WARMUP_MAX_RETRIES = 6;
const AGENT_WARMUP_RETRY_DELAY_MS = 2000;
const AGENT_WARMUP_RETRY_STATUSES = new Set([502, 503, 504]);

/**
 * Retry statuses for the NON-idempotent send paths (`/query`, `/respond`): 502/503 only.
 *
 * A 502/503 from the gateway means it reached no healthy upstream, so the POST provably never hit
 * the pod — a retry cannot double-execute. A 504 (gateway timeout) is AMBIGUOUS: the pod may have
 * received the POST and already begun the turn, so retrying it risks a duplicate agent turn (double
 * LLM cost + duplicate tool side-effects). We therefore exclude 504 from sends and let it surface,
 * exactly as it did before send-path retry existed. Idempotent reads (`/reconnect`, and the pod GETs
 * via {@link fetchAgentWithRetry}) still retry the full 502/503/504 set.
 */
export const AGENT_SEND_RETRY_STATUSES: ReadonlySet<number> = new Set([502, 503]);

function warmupSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

type ServiceHealthReporter = (failedAgentBaseUrl?: string) => void;
let serviceHealthReporter: ServiceHealthReporter | null = null;

export function onServiceUnhealthy(reporter: ServiceHealthReporter | null): void {
  serviceHealthReporter = reporter;
}

const SERVICE_DEAD_STATUSES = new Set([404, 410]);
const LIVENESS_DEAD_MAX_RETRIES = 4;

/** The single pod-liveness probe. `/models` is the catalog the chat needs and rides the pod's
 *  rproxy route, so a transient 404 there is the route-binding window worth a grace retry (and a
 *  persistent 410 is genuine pod death that bounces to re-provision). */
function isLivenessPath(path: string): boolean {
  return path.startsWith('/models');
}

/** `/apps` is the session-scoped connected-apps registry. A 404 there is NOT the empty case — an
 *  empty registry answers `200 {apps:{}}` — it is a transient registry-binding flap: the session
 *  briefly absent from the rproxy per-chat registry just after boot (the route was live for the
 *  boot gate, then 404s for a beat). Grace-retry that 404 so the apps picker never renders a
 *  spurious "0 apps", but NEVER bounce: re-provisioning a reachable pod just 404s straight back
 *  (the same ready↔unhealthy flap the liveness path guards against), so reportServiceDeadIf stays
 *  liveness-only. A 410 here is genuine session-gone → surface empty immediately, don't stall. */
function isSessionRegistryPath(path: string): boolean {
  return path.startsWith('/apps');
}

// Re-provisioning recovers a MISSING pod — it cannot fix a 404 from a REACHABLE one. So only a
// `410 Gone` (pod/PVC truly gone, matching the 410-is-dead vs 404-is-hibernated convention) bounces
// to the provider. A `404` on a session-liveness read means the pod is reachable but the session
// id isn't bound there yet (orphaned/pending serviceId, or route-binding lag); bouncing it would
// re-provision straight back to the same ACTIVE pod and 404 again — an infinite ready↔unhealthy
// flap (overlay flicker + request storm). 404 still gets the grace retries above and still surfaces
// ServiceDeadError to the caller; it just must not trigger re-provision.
function reportServiceDeadIf(status: number, path: string, agentBaseUrl?: string): void {
  if (serviceHealthReporter && status === 410 && isLivenessPath(path)) {
    serviceHealthReporter(agentBaseUrl);
  }
}

export class ServiceDeadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceDeadError';
  }
}

/**
 * Obtain a fresh {@link Response} for a streaming POST (chat send / reconnect / respond) with the
 * same warm-up resilience the pod GET paths get from {@link fetchAgentWithRetry}: a gateway
 * 502/503/504 (pod rescheduling / not-yet-routable) is retried, bounded and abort-aware, BEFORE the
 * NDJSON body is consumed. Retry is only possible pre-stream — once the caller starts reading frames
 * it cannot rewind — so this covers exactly the connect window. Distinct from `fetchAgentWithRetry`:
 * it takes a full URL (the send paths build their own), skips the liveness/registry dead-status
 * logic (send has no such flap), and does NOT retry a thrown network error — that propagates to the
 * caller's `asAgentTransportError` handling unchanged, so an ambiguous mid-connect failure is
 * surfaced rather than silently re-POSTed. `SessionExpiredError` / `AbortError` from `authFetch`
 * propagate immediately (never retried), same as the GET path.
 *
 * `retryStatuses` scopes which statuses are retried; it defaults to the full warm-up set
 * (502/503/504) for idempotent callers (e.g. `/reconnect`). Non-idempotent send callers pass
 * {@link AGENT_SEND_RETRY_STATUSES} (502/503, no 504) — see that constant for why.
 */
export async function fetchStreamWithWarmupRetry(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
  retryStatuses: ReadonlySet<number> = AGENT_WARMUP_RETRY_STATUSES
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const lastAttempt = attempt >= AGENT_WARMUP_MAX_RETRIES;
    // A thrown SessionExpiredError / AbortError / network error is intentionally NOT caught here:
    // it propagates to the caller (postNdjsonStream's asAgentTransportError), matching prior
    // behavior for those cases. Only a retryable HTTP status is retried.
    const res = await authFetch(url, { ...init, signal });
    if (res.ok || lastAttempt || !retryStatuses.has(res.status)) {
      return res;
    }
    await warmupSleep(AGENT_WARMUP_RETRY_DELAY_MS, signal);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  }
}

/** GET (or other) an agent-pod endpoint with warm-up resilience. */
export async function fetchAgentWithRetry(
  agentBaseUrl: string,
  path: string,
  init: RequestInit,
  signal?: AbortSignal
): Promise<Response> {
  const url = `${agentBaseUrl.replace(/\/$/, '')}${path}`;
  for (let attempt = 0; ; attempt++) {
    const lastAttempt = attempt >= AGENT_WARMUP_MAX_RETRIES;
    try {
      // authFetch surfaces a gateway 302→IdP as a thrown SessionExpiredError (auth, not pod
      // health) — see the catch below, which short-circuits it before any warm-up retry.
      const res = await authFetch(url, { ...init, signal });
      // Grace-retry a transient dead status on the paths known to flap during session
      // route-binding: `/models` (liveness) retries both 404 and 410; `/apps` (session registry)
      // retries ONLY the 404 flap (an empty registry answers 200, and a 410 there is genuine
      // session-gone → render empty, don't stall). Neither `/apps` case bounces —
      // reportServiceDeadIf stays liveness-only.
      const retryableDead =
        attempt < LIVENESS_DEAD_MAX_RETRIES &&
        ((isLivenessPath(path) && SERVICE_DEAD_STATUSES.has(res.status)) ||
          (isSessionRegistryPath(path) && res.status === 404));
      if (res.ok || lastAttempt || (!AGENT_WARMUP_RETRY_STATUSES.has(res.status) && !retryableDead)) {
        if (!res.ok && !signal?.aborted) reportServiceDeadIf(res.status, path, agentBaseUrl);
        return res;
      }
    } catch (err) {
      // An expired session is not a transient pod-warmup failure: don't retry, don't treat it as
      // ServiceDeadError. The latch (fired inside authFetch) already raised the reauth prompt.
      if (err instanceof SessionExpiredError) throw err;
      if ((err as Error).name === 'AbortError' || signal?.aborted || lastAttempt) throw err;
    }
    await warmupSleep(AGENT_WARMUP_RETRY_DELAY_MS, signal);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  }
}
