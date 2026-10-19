/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Per-browser preference: whether the "chat needs input" notification stack is muted.
 * Persisted via localStorage and kept live across tabs of the same browser the same way
 * lib/runningTurns and lib/awaitingDismissed are: a cached snapshot + listener set for
 * useSyncExternalStore, refreshed on a 'storage' event fired by another tab's write.
 */

export const CHAT_NOTIFICATIONS_MUTED_KEY = 'nexus.chatNotifications.muted';

const listeners = new Set<() => void>();

/** Cached snapshot so useSyncExternalStore sees a stable reference between changes. */
let snapshot: boolean = readStorage();

function readStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(CHAT_NOTIFICATIONS_MUTED_KEY) === '1';
  } catch {
    return false; // private mode / disabled storage — default unmuted, never throw
  }
}

function writeStorage(next: boolean): void {
  snapshot = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CHAT_NOTIFICATIONS_MUTED_KEY, next ? '1' : '0');
    } catch {
      /* in-memory snapshot still updated — same-tab behavior intact */
    }
  }
  listeners.forEach((cb) => cb());
}

// Cross-tab reactivity: another tab's write fires 'storage' here. Re-read and notify.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key !== CHAT_NOTIFICATIONS_MUTED_KEY) return;
    snapshot = readStorage();
    listeners.forEach((cb) => cb());
  });
}

/** Set the mute preference for this browser (persists + notifies other tabs/hooks). */
export function setChatNotificationsMuted(muted: boolean): void {
  writeStorage(muted);
}

/** useSyncExternalStore subscribe. */
export function subscribeChatNotificationsMuted(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** useSyncExternalStore snapshot (stable reference between mutations). */
export function getChatNotificationsMutedSnapshot(): boolean {
  return snapshot;
}

/** Test hook — reset module state and storage. */
export function _resetChatNotificationsMutedForTest(): void {
  writeStorage(false);
}
