/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// Global c3-session-expiry signal. Framework-agnostic (callable from the plain-TS fetch layer in
// api.ts / agentPodFetch.ts, mirroring the onServiceUnhealthy reporter pattern) so a failing call
// can raise one app-wide reauth prompt. The React binding lives in useSessionExpiry.ts.

/** Thrown by the fetch wrappers when a request is 302-redirected to the IdP — the expired-cookie
 *  signal. Detection uses `redirect:'manual'` → `response.type === 'opaqueredirect'`. Distinct from
 *  a genuine network blip (a TypeError → AgentHttpError(0)/connectionLost) so the UI can prompt a
 *  reauth instead of showing "connection interrupted". */
export class SessionExpiredError extends Error {
  readonly returnUrl: string;
  constructor(returnUrl?: string) {
    super('c3 session expired');
    this.name = 'SessionExpiredError';
    this.returnUrl = returnUrl ?? (typeof window !== 'undefined' ? window.location.href : '');
  }
}

let expired = false;
let sessionVersion = 0; // Increments on clearSessionExpired() so components can refetch
type Listener = () => void;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* a listener throwing must not block the others */
    }
  }
}

/** First-wins latch: the first failing call flips the flag and notifies; concurrent failures (and
 *  React Query's per-query retry) are absorbed so exactly one prompt shows. Nothing is persisted —
 *  reauth runs in a popup that never reloads the tab, so all in-progress state stays in memory (see
 *  reauthState.ts). */
export function notifySessionExpired(): void {
  if (expired) return;
  expired = true;
  emit();
}

/** Release the latch after a successful popup reauth — the cookie is fresh, so the app is usable
 *  again with no reload. Re-arms so a later expiry re-trips, and re-renders the banner away. No-op if
 *  not currently latched. Increments sessionVersion so manual-fetch components can refetch. */
export function clearSessionExpired(): void {
  if (!expired) return;
  expired = false;
  sessionVersion++;
  emit();
}

export function isSessionExpired(): boolean {
  return expired;
}

/** Returns a version number that increments each time the session is restored after expiry.
 *  Manual-fetch components can include this in their effect deps to trigger refetch on reauth. */
export function getSessionVersion(): number {
  return sessionVersion;
}

export function subscribeSessionExpiry(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: reset the module latch + listeners between cases. */
export function __resetSessionExpiryForTests(): void {
  expired = false;
  sessionVersion = 0;
  listeners.clear();
}

/** `fetch` with `redirect:'manual'` so a gateway 302→IdP surfaces as an opaqueredirect rather than
 *  a followed cross-origin request that rejects as an indistinguishable TypeError. Two outcomes mean
 *  the c3 session has expired and are handled identically — fire the latch (so the global banner
 *  shows even if the caller swallows the throw) and throw {@link SessionExpiredError}:
 *    1. `opaqueredirect` — a full-document navigation gets the gateway 302→IdP.
 *    2. a bare `401` — a same-origin XHR/fetch to an auth-bearing endpoint gets 401 (not a redirect)
 *       when the cookie has expired. Without this the caller turned it into a generic 401→"You don't
 *       have permission to do that." error inside the chat, contradicting the reauth banner.
 *  A `403` (authenticated but genuinely forbidden) is NOT expiry — it passes through unchanged for
 *  the caller to surface as an access-denied error. Every other outcome (2xx/other-4xx/5xx, a real
 *  TypeError) is unchanged — none of the auth-bearing endpoints legitimately 3xx on success. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(input, { ...init, redirect: 'manual' });
  if (res.type === 'opaqueredirect' || res.status === 401) {
    notifySessionExpired();
    throw new SessionExpiredError();
  }
  return res;
}
