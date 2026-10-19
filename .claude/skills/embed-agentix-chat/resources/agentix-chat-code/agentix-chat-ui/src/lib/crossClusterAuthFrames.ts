/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import type { ChatMessage } from './types';

/** A live `cross-cluster-auth` frame, narrowed to guarantee `appId` is a non-empty string. */
export type CrossClusterAuthFrame = ChatMessage & { kind: 'cross-cluster-auth'; appId: string };

/**
 * True for ANY `cross-cluster-auth` companion frame, regardless of whether it carries a usable
 * appId. This is the INTERCEPTION/FILTER predicate: every stream consumer (and the hydrate filter)
 * uses it to keep the frame out of the transcript — even a malformed, appId-less frame must be
 * swallowed, never merged as a (null-rendering) bubble that still pollutes `messages`/paging.
 * Banner SURFACING is gated separately on `isCrossClusterAuthFrame` (non-empty appId).
 */
export function isCrossClusterAuthKind(msg: ChatMessage): boolean {
  return msg.kind === 'cross-cluster-auth';
}

/**
 * True when `msg` is a well-formed cross-cluster per-user OAuth-required signal frame with a usable
 * appId — the gate for SURFACING a Connect banner (the appId names the row). Narrower than
 * `isCrossClusterAuthKind`. Mirrors isMcpAuthExpiredFrame.
 */
export function isCrossClusterAuthFrame(msg: ChatMessage): msg is CrossClusterAuthFrame {
  return msg.kind === 'cross-cluster-auth' && typeof msg.appId === 'string' && msg.appId.length > 0;
}

/**
 * Insert `appId` into `prev` if it isn't already present, preserving insertion order (oldest
 * pending app first). A repeated frame for an app already showing a banner is a no-op — the same
 * array reference is returned so callers can skip a re-render.
 */
export function upsertPendingAppId(prev: string[], appId: string): string[] {
  return prev.includes(appId) ? prev : [...prev, appId];
}

/**
 * Session-scoped dedup for the Connect banner. A `cross-cluster-auth` companion frame carries a
 * stable id (`<toolCallId>-cross-cluster-auth`) that is identical whether it arrives on the live
 * stream, on a reconnect-stream re-read, or on a re-hydrate — while a *different* failed connect /
 * call yields a *different* id. Tracking dismissals by frame id therefore suppresses the replay of
 * a banner the user already dismissed/connected, yet still surfaces a genuinely new auth prompt.
 */
export interface CrossClusterAuthDedup {
  /** Frame ids the user has dismissed (X) or resolved (connect success). */
  dismissedFrameIds: Set<string>;
  /** appId → the frame ids that have driven its banner, so a dismiss can mark them all. */
  appIdToFrameIds: Map<string, Set<string>>;
}

export function makeCrossClusterAuthDedup(): CrossClusterAuthDedup {
  return { dismissedFrameIds: new Set(), appIdToFrameIds: new Map() };
}

export function resetCrossClusterAuthDedup(d: CrossClusterAuthDedup): void {
  d.dismissedFrameIds.clear();
  d.appIdToFrameIds.clear();
}

/**
 * Record an incoming auth-required frame. Returns `true` when the frame should surface a banner,
 * `false` when it is the replay of an already-dismissed frame (the caller still consumes it — it
 * must never become a chat bubble — but must not re-add the appId to the visible set).
 */
export function recordCrossClusterAuthFrame(d: CrossClusterAuthDedup, frame: CrossClusterAuthFrame): boolean {
  if (d.dismissedFrameIds.has(frame.id)) return false;
  const seen = d.appIdToFrameIds.get(frame.appId) ?? new Set<string>();
  seen.add(frame.id);
  d.appIdToFrameIds.set(frame.appId, seen);
  return true;
}

/** Mark every frame id seen for `appId` as dismissed, so their later replay stays suppressed. */
export function markAppIdDismissed(d: CrossClusterAuthDedup, appId: string): void {
  const seen = d.appIdToFrameIds.get(appId);
  if (seen) seen.forEach((id) => d.dismissedFrameIds.add(id));
}
