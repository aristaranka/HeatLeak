/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Client-side registry of sessions whose "awaiting input" nudge this BROWSER has locally
 * dismissed — the user either started typing an answer or clicked the pill's dismiss ×.
 *
 * Why a local override rather than the server flag: `Nexus.Agent.Session.awaitingInput` is
 * pod-authoritative and only clears when the user actually SUBMITS an answer (or the next
 * turn starts) — not when they merely begin composing one. Without this, the awaiting badge,
 * sidebar pill, and OS/in-app notification linger the whole time the user is typing their
 * reply, and there is no way to clear them by hand.
 *
 * Deliberately frontend-only and in-memory (no localStorage, no cross-tab sync): a dismissal
 * is a transient acknowledgement of *this view*, not durable state. It is pruned as soon as
 * the server flag flips false (answer submitted), so a genuinely NEW question re-surfaces the
 * nudge; and on reload — if the user closed without answering — the server flag is still true
 * and the nudge correctly returns.
 */

type DismissedMap = Record<string, true>;

const listeners = new Set<() => void>();

/** Cached snapshot so useSyncExternalStore sees a stable reference between changes. */
let snapshot: DismissedMap = {};

function write(next: DismissedMap): void {
  snapshot = next;
  listeners.forEach((cb) => cb());
}

/** Locally dismiss a session's awaiting-input nudge (user is answering / clicked dismiss). */
export function markAwaitingDismissed(sessionId: string): void {
  if (!sessionId || snapshot[sessionId]) return;
  write({ ...snapshot, [sessionId]: true });
}

/** Drop a session's dismissal so a later awaiting-input transition nudges again. Called when
 *  the server clears `awaitingInput` (the answer landed) — see useSessionAwaitingNotifications. */
export function clearAwaitingDismissed(sessionId: string): void {
  if (!sessionId || !snapshot[sessionId]) return;
  const next = { ...snapshot };
  delete next[sessionId];
  write(next);
}

/** useSyncExternalStore subscribe. */
export function subscribeAwaitingDismissed(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** useSyncExternalStore snapshot (stable reference between mutations). */
export function getAwaitingDismissedSnapshot(): DismissedMap {
  return snapshot;
}

/** Whether this browser has locally dismissed the awaiting-input nudge for a session. */
export function isAwaitingDismissed(snap: DismissedMap, sessionId: string): boolean {
  return snap[sessionId] === true;
}

/** Test hook — reset module state. */
export function _resetAwaitingDismissedForTest(): void {
  write({});
}
