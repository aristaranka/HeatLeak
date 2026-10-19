/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Client-side registry of sessions this BROWSER believes have an agent turn in flight —
 * the data source for the sidebar "running" pill. Deliberately frontend-only (no server
 * flag, no extra polling): ChatPage marks a session when it starts or reattaches to a
 * stream, and clears it when that stream ends for a reason that means the turn is over
 * (normal completion, Stop, error) or when a revisit finds the turn already finished.
 * A client-side abort that does NOT end the turn (navigating away, closing the tab's
 * chat) leaves the mark in place — the pod keeps executing.
 *
 * Persistence is localStorage, so the marks survive reloads and are shared across tabs
 * of the same browser ('storage' events give cross-tab reactivity for free). The
 * inherent limits of frontend-only tracking, accepted by design:
 *  - a turn started on another browser/device shows nothing here;
 *  - after leaving a running chat, this browser cannot see the turn finish — the mark
 *    clears on the next visit to that chat, or via the staleness window below.
 */

const STORAGE_KEY = 'nexus.runningTurns';

/** How long a mark stays trusted. A tab that closes mid-turn (or a pod that dies) never
 *  clears its mark, so past this window the row stops showing the pill rather than
 *  spinning forever. Generous — genuine long agent turns exist. */
export const RUNNING_TURN_STALE_MS = 30 * 60_000;

type RunningMap = Record<string, number>;

const listeners = new Set<() => void>();

/** Cached snapshot so useSyncExternalStore sees a stable reference between changes. */
let snapshot: RunningMap = readStorage();

function readStorage(): RunningMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: RunningMap = {};
    const cutoff = Date.now() - RUNNING_TURN_STALE_MS;
    for (const [id, at] of Object.entries(parsed)) {
      // Prune expired marks on read so abandoned entries don't accumulate forever.
      if (typeof at === 'number' && at > cutoff) out[id] = at;
    }
    return out;
  } catch {
    return {}; // private mode / quota / parse error — feature degrades to nothing, never throws
  }
}

function writeStorage(next: RunningMap): void {
  snapshot = next;
  try {
    if (Object.keys(next).length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* in-memory snapshot still updated — same-tab behavior intact */
  }
  listeners.forEach((cb) => cb());
}

// Cross-tab reactivity: another tab's write fires 'storage' here. Re-read and notify.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key !== STORAGE_KEY) return;
    snapshot = readStorage();
    listeners.forEach((cb) => cb());
  });
}

/** Mark a session as having a turn in flight. Keeps the original start time on repeated
 *  marks while fresh, so the staleness window measures from the true turn start — but an
 *  expired leftover mark (earlier tab crashed mid-turn) is replaced, not kept: this call
 *  announces a live turn, and keeping the dead stamp would suppress its pill. */
export function markTurnRunning(sessionId: string): void {
  if (!sessionId) return;
  const at = snapshot[sessionId];
  if (at !== undefined && Date.now() - at < RUNNING_TURN_STALE_MS) return;
  writeStorage({ ...snapshot, [sessionId]: Date.now() });
}

/** Clear a session's mark (turn completed / stopped / found finished on revisit). */
export function clearTurnRunning(sessionId: string): void {
  if (!sessionId || snapshot[sessionId] === undefined) return;
  const next = { ...snapshot };
  delete next[sessionId];
  writeStorage(next);
}

/** useSyncExternalStore subscribe. */
export function subscribeRunningTurns(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** useSyncExternalStore snapshot (stable reference between mutations). */
export function getRunningTurnsSnapshot(): RunningMap {
  return snapshot;
}

/** Whether a session should show the "running" pill: marked, and the mark is fresh. */
export function isTurnRunning(snap: RunningMap, sessionId: string): boolean {
  const at = snap[sessionId];
  return at !== undefined && Date.now() - at < RUNNING_TURN_STALE_MS;
}

/** Test hook — reset module state and storage. */
export function _resetRunningTurnsForTest(): void {
  writeStorage({});
}
