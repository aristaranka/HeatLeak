/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Per-session auto-resume attempt counter, persisted in localStorage.
 *
 * The chat's 404-recovery path reloads the page after asking the pod to resume.
 * A full reload resets any in-memory counter, so a session whose pod is gone for
 * good would reload forever. Persisting the count per session id lets the caller
 * cap retries across reloads and fall back to a blank chat once the cap is hit.
 * Cleared on a successful hydrate (recoverable) and when the cap fires (give up).
 */
const KEY_PREFIX = 'nexus.resumeAttempts.';

function key(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

/** Recorded auto-resume attempts for a session (0 if none / unreadable / garbage). */
export function getResumeAttempts(sessionId: string): number {
  try {
    const raw = localStorage.getItem(key(sessionId));
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Increment and persist the attempt count for a session; returns the new count. */
export function recordResumeAttempt(sessionId: string): number {
  const next = getResumeAttempts(sessionId) + 1;
  try {
    localStorage.setItem(key(sessionId), String(next));
  } catch {
    /* localStorage unavailable (private mode / quota) — caller still gets `next`. */
  }
  return next;
}

/** Forget a session's attempt count (recovered, or gave up). */
export function clearResumeAttempts(sessionId: string): void {
  try {
    localStorage.removeItem(key(sessionId));
  } catch {
    /* ignore */
  }
}
