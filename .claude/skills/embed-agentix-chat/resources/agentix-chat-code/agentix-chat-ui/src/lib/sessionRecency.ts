/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// Per-browser "last used" timestamp for sidebar ordering. We deliberately do NOT
// store this on the Session row in C3 — a per-turn DB write for what is purely
// a local UI hint isn't worth it. localStorage is per-browser (sort order resets
// if the user switches devices), which is the same UX trade other multi-session
// tools (Slack unread marks, browser history) make.

import type { TFunction } from 'i18next';

const LS_KEY_PREFIX = 'nexus.lastUsed.';

export function getSessionLastUsed(sessionId: string): number {
  try {
    const v = window.localStorage.getItem(LS_KEY_PREFIX + sessionId);
    return v ? Number(v) || 0 : 0;
  } catch {
    return 0;
  }
}

export function setSessionLastUsed(sessionId: string, ts: number = Date.now()): void {
  try {
    window.localStorage.setItem(LS_KEY_PREFIX + sessionId, String(ts));
  } catch {
    /* private mode / quota exceeded — sidebar falls back to createdAt ordering */
  }
}

export function clearSessionLastUsed(sessionId: string): void {
  try {
    window.localStorage.removeItem(LS_KEY_PREFIX + sessionId);
  } catch {
    /* ignore */
  }
}

/** Recency rank for a session: per-browser localStorage "last used" hint when
 *  present, otherwise its `createdAt`. */
export function sessionRecency(session: { id: string; createdAt?: string }): number {
  const lu = getSessionLastUsed(session.id);
  if (lu > 0) return lu;
  return session.createdAt ? Date.parse(session.createdAt) || 0 : 0;
}

export function pickMostRecentSession<T extends { id: string; createdAt?: string }>(sessions: T[]): T | null {
  if (!sessions || sessions.length === 0) return null;
  return sessions.reduce((acc, s) => (sessionRecency(s) > sessionRecency(acc) ? s : acc), sessions[0]);
}

export type RecencyBucket = 'today' | 'thisWeek' | 'earlier';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Group sessions by last-used time for sidebar headers. "Today" is the local
 *  calendar day, "thisWeek" is the last 7 days excluding today, "earlier" is
 *  everything older. `now` is injectable for tests. */
export function bucketFor(ts: number, now: number = Date.now()): RecencyBucket {
  if (!ts) return 'earlier';
  const t = new Date(ts);
  const n = new Date(now);
  if (t.getFullYear() === n.getFullYear() && t.getMonth() === n.getMonth() && t.getDate() === n.getDate()) {
    return 'today';
  }
  if (now - ts < 7 * DAY_MS) return 'thisWeek';
  return 'earlier';
}

/** Display label for a recency bucket. Takes the caller's `t` (namespace-prefixed key) so this
 *  module has no dependency on the host i18n singleton and stays self-contained in the package. */
export function bucketLabel(bucket: RecencyBucket, t: TFunction): string {
  return t(`common:recency.${bucket}`);
}
