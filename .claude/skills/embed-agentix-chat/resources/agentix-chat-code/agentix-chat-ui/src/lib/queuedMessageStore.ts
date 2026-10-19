/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import type { QueuedMessage } from './types';

// Per-session retention of a mid-stream queued message so it survives switching
// between sessions. Unlike composer drafts (draftStorage.ts, localStorage), a
// QueuedMessage can carry File objects, which don't serialize — so this store is
// module-level memory: it survives in-app session switches but not a full page
// reload (accepted for V1). Keyed by committed sessionId; pending mode (no
// sessionId) is a no-op, since the pending→committed promotion keeps the React
// slot without a reset.

const store = new Map<string, QueuedMessage>();

export function getQueued(sessionId: string | undefined): QueuedMessage | null {
  if (!sessionId) return null;
  return store.get(sessionId) ?? null;
}

export function putQueued(sessionId: string | undefined, queued: QueuedMessage): void {
  if (!sessionId) return;
  store.set(sessionId, queued);
}

export function dropQueued(sessionId: string | undefined): void {
  if (!sessionId) return;
  store.delete(sessionId);
}
