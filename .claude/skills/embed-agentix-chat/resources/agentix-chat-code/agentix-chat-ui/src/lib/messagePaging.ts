/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import type { ChatMessage } from './types';

/** Keyset cursor for "load older": the oldest (first) held frame's (timestamp, id). */
export function olderCursor(messages: ChatMessage[]): { beforeTs?: string; beforeId: string } | null {
  if (messages.length === 0) return null;
  const oldest = messages[0];
  return { beforeTs: oldest.timestamp, beforeId: oldest.id };
}

/** Prepend an older page ahead of the current transcript, dropping any older
 *  frame whose id is already present (defensive dedup on cursor-boundary overlap). */
export function prependOlder(prev: ChatMessage[], older: ChatMessage[]): ChatMessage[] {
  if (older.length === 0) return prev;
  const seen = new Set(prev.map((m) => m.id));
  const fresh = older.filter((m) => !seen.has(m.id));
  return [...fresh, ...prev];
}

/** Merge a freshly-polled "latest page" into the current transcript: replace the tail the new
 *  page covers, but keep any earlier history the caller loaded via {@link prependOlder} that the
 *  latest-page fetch (bounded to the newest N frames) doesn't include. */
export function mergeNewest(prev: ChatMessage[], newest: ChatMessage[]): ChatMessage[] {
  if (newest.length === 0) return prev;
  const newestIds = new Set(newest.map((m) => m.id));
  const olderHistory = prev.filter((m) => !newestIds.has(m.id));
  return [...olderHistory, ...newest];
}
