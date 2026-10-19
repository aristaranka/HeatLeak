/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// Per-browser unsent-composer drafts (PLAT-148653). Keyed by sessionId; the
// "new session" view (no sessionId yet) has its own slot that transfers to
// whichever existing session the user lands on first.

const PREFIX = 'nexus.draft.';
const NEW_SESSION_KEY = `${PREFIX}__new__`;

function keyFor(sessionId: string | undefined): string {
  return sessionId ? PREFIX + sessionId : NEW_SESSION_KEY;
}

export function getDraft(sessionId: string | undefined): string {
  try {
    return window.localStorage.getItem(keyFor(sessionId)) ?? '';
  } catch {
    return '';
  }
}

export function setDraft(sessionId: string | undefined, value: string): void {
  try {
    const key = keyFor(sessionId);
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* private mode / quota — drafts just don't persist */
  }
}

export function clearDraft(sessionId: string | undefined): void {
  setDraft(sessionId, '');
}

// Move the new-session draft into a session slot, but only if that session
// has no draft yet — we don't clobber a draft the user typed directly into
// the existing session.
export function consumeNewSessionDraftFor(sessionId: string): string {
  try {
    const ls = window.localStorage;
    const existing = ls.getItem(PREFIX + sessionId);
    if (existing) return existing;
    const pending = ls.getItem(NEW_SESSION_KEY);
    if (!pending) return '';
    ls.setItem(PREFIX + sessionId, pending);
    ls.removeItem(NEW_SESSION_KEY);
    return pending;
  } catch {
    return '';
  }
}

// Drop drafts for every session on a service that's being terminated. Called
// from the terminate handler before the service (and all its sessions) are gone.
export function clearDraftsForSessions(sessionIds: Iterable<string>): void {
  for (const id of sessionIds) clearDraft(id);
}
