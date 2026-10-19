/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// Per-browser provisional chat label: the clipped first user message, shown in the
// sidebar the instant a chat is created so it never reads "New chat" while the
// LLM-generated (smart) title is still pending. We deliberately do NOT persist this
// on the Session row — the persisted `title` stays empty until the smart title
// lands, which keeps "empty title" the single durable signal for "no smart title
// yet" (relied on by the title-gen trigger and the on-mount backfill). localStorage
// is per-browser, same trade as sessionRecency: another device shows "New chat"
// until the smart title is persisted. Cleared once the smart title exists.

const LS_KEY_PREFIX = 'nexus.firstMessage.';
/** Cap stored length — this is a sidebar label, not the title-gen prompt. */
const MAX_LABEL_LEN = 80;

export function getSessionFirstMessage(sessionId: string): string {
  try {
    return window.localStorage.getItem(LS_KEY_PREFIX + sessionId) || '';
  } catch {
    return '';
  }
}

export function setSessionFirstMessage(sessionId: string, text: string): void {
  const label = (text || '').trim().slice(0, MAX_LABEL_LEN);
  if (!label) return;
  try {
    window.localStorage.setItem(LS_KEY_PREFIX + sessionId, label);
  } catch {
    /* private mode / quota exceeded — sidebar falls back to "New chat" */
  }
}

export function clearSessionFirstMessage(sessionId: string): void {
  try {
    window.localStorage.removeItem(LS_KEY_PREFIX + sessionId);
  } catch {
    /* ignore */
  }
}
