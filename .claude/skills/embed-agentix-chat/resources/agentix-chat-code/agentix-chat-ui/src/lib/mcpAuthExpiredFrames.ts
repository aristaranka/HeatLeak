/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import type { ChatMessage } from './types';

/** A live `mcp-auth-expired` frame, narrowed to guarantee `connectionKey` is a non-empty string. */
export type McpAuthExpiredFrame = ChatMessage & { kind: 'mcp-auth-expired'; connectionKey: string };

/**
 * True when `msg` is a mid-session MCP OAuth-expiry signal frame, not a transcript-worthy
 * message. Every NDJSON stream consumer (reconnect / query / respond) checks this FIRST and, on
 * a match, routes the connectionKey to the reconnect-banner state instead of calling
 * `mergeFrame` — the frame never becomes a chat bubble.
 */
export function isMcpAuthExpiredFrame(msg: ChatMessage): msg is McpAuthExpiredFrame {
  return msg.kind === 'mcp-auth-expired' && typeof msg.connectionKey === 'string' && msg.connectionKey.length > 0;
}

/**
 * Insert `key` into `prev` if it isn't already present, preserving insertion order (oldest
 * expired connection first). A repeated frame for a connection already showing a banner is a
 * no-op — the same array reference is returned so callers can skip a re-render.
 */
export function upsertExpiredKey(prev: string[], key: string): string[] {
  return prev.includes(key) ? prev : [...prev, key];
}

/**
 * Session-scoped dedup for the reconnect banner. An `mcp-auth-expired` companion frame carries a
 * stable id (`<toolCallId>-mcp-auth-expired`) that is identical whether it arrives on the live
 * stream, on a reconnect-stream re-read, or on a re-hydrate — while a *different* failed tool call
 * yields a *different* id. Tracking dismissals by frame id therefore suppresses the replay of a
 * banner the user already dismissed/reconnected, yet still surfaces a genuinely new expiry.
 */
export interface AuthExpiredDedup {
  /** Frame ids the user has dismissed (X) or resolved (reconnect success). */
  dismissedFrameIds: Set<string>;
  /** connectionKey → the frame ids that have driven its banner, so a dismiss can mark them all. */
  keyToFrameIds: Map<string, Set<string>>;
}

export function makeAuthExpiredDedup(): AuthExpiredDedup {
  return { dismissedFrameIds: new Set(), keyToFrameIds: new Map() };
}

export function resetAuthExpiredDedup(d: AuthExpiredDedup): void {
  d.dismissedFrameIds.clear();
  d.keyToFrameIds.clear();
}

/**
 * Record an incoming expiry frame. Returns `true` when the frame should surface a banner, `false`
 * when it is the replay of an already-dismissed frame (the caller still consumes it — it must never
 * become a chat bubble — but must not re-add the key to the visible set).
 */
export function recordExpiredFrame(d: AuthExpiredDedup, frame: McpAuthExpiredFrame): boolean {
  if (d.dismissedFrameIds.has(frame.id)) return false;
  const seen = d.keyToFrameIds.get(frame.connectionKey) ?? new Set<string>();
  seen.add(frame.id);
  d.keyToFrameIds.set(frame.connectionKey, seen);
  return true;
}

/** Mark every frame id seen for `connectionKey` as dismissed, so their later replay stays suppressed. */
export function markKeyDismissed(d: AuthExpiredDedup, connectionKey: string): void {
  const seen = d.keyToFrameIds.get(connectionKey);
  if (seen) seen.forEach((id) => d.dismissedFrameIds.add(id));
}
