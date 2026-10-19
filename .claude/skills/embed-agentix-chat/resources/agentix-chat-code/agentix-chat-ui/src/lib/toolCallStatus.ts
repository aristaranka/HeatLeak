/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import type { ChatMessage } from './types';

/** A tool call is terminal when it can no longer change state on its own. */
export function isTerminalToolState(state: string): boolean {
  return state === 'COMPLETED' || state === 'ERROR' || state === 'CANCELLED';
}

/** True when the transcript still carries a permission awaiting the user's decision. */
export function hasPendingPermission(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.kind === 'PERMISSION' && (m.data?.state ?? 'PENDING') === 'PENDING');
}

/**
 * Max reconnect-drop → recover → re-hydrate cycles to attempt for one still-pending
 * permission before giving up on the auto-recovery (the next send's stale-recovery then
 * covers it). Bounds a persistently-unreachable pod from spinning recoverService forever.
 */
export const RECONNECT_REHYDRATE_CAP = 3;

/**
 * Decide whether a reconnect-stream drop should trigger a recover→re-hydrate to re-surface a
 * live permission. Only when the turn is actually blocked on a human (`hasPending`) AND we're
 * under the per-recovery attempt cap. Takes the flag rather than the message list so the caller
 * can source it from a closure-local it maintains across the hydrate + live-frame path (avoiding
 * a stale-ref read), and so this (novel, low-trust) Gap-A gate is unit-testable without React
 * weight. Pair with {@link hasPendingPermission} to seed the flag.
 */
export function shouldRehydrateForPendingPermission(hasPending: boolean, attempts: number): boolean {
  return hasPending && attempts < RECONNECT_REHYDRATE_CAP;
}

/** Options for {@link finalizeOrphanedFrames}. */
export interface FinalizeOptions {
  /**
   * Also flip a still-PENDING PERMISSION to RESOLVED. Default `false`.
   *
   * A pending permission is server-authoritative: the pod holds it in
   * `session.messages` and re-dumps it verbatim on `/reconnect`, so a stream
   * merely dropping (network blip, opencode idle, reconnect close, pod
   * reschedule) does NOT mean the human's approval is gone — the turn is still
   * blocked on it and it re-surfaces when the stream re-attaches. Resolving it
   * client-side on any stream end silently and permanently discards a live,
   * still-answerable approval (the block unmounts and never returns without a
   * reload). So the flip fires ONLY when the user themselves abandoned the turn
   * via Stop — pass `true` from that path alone.
   */
  finalizePermissions?: boolean;
}

/**
 * Return a new message list where every TOOL_CALL still in a non-terminal
 * state (PENDING / RUNNING) is flipped to CANCELLED — reflecting that the
 * stream ended without a real terminal arriving from the server — and, when
 * `finalizePermissions` is set, every PERMISSION still PENDING is flipped to
 * RESOLVED. Returns the same array reference when nothing changed.
 *
 * Called from the stream-consumer loops in ChatPage when the for-await exits
 * (Stop click, opencode idle, network error, reconnect close). Any in-flight
 * tool call at that point is — by definition — orphaned and cancelled. A
 * pending PERMISSION is only orphaned on a user Stop (see {@link FinalizeOptions});
 * on every other stream end it stays PENDING so the pod's reconnect replay can
 * re-surface it. Without the Stop-path flip a Stop-during-prompt would leave a
 * clickable Allow/Deny on a dead opencode session.
 *
 * Note that `text` is cleared on TOOL_CALL flips — live RUNNING frames carry
 * `text: <toolName>` and MessageBlock's outputStr fallback would otherwise
 * render the tool name AS the tool's output on the cancelled bubble.
 */
export function finalizeOrphanedFrames(messages: ChatMessage[], opts: FinalizeOptions = {}): ChatMessage[] {
  const { finalizePermissions = false } = opts;
  let changed = false;
  const next: ChatMessage[] = [];
  for (const m of messages) {
    if (m.kind === 'TOOL_CALL') {
      const state = m.toolState || m.data?.state || '';
      if (!state || isTerminalToolState(state)) {
        next.push(m);
      } else {
        changed = true;
        next.push({ ...m, toolState: 'CANCELLED' as const, text: undefined });
      }
      continue;
    }
    if (m.kind === 'PERMISSION') {
      // PermissionBlock renders only when data.state === 'PENDING'; flipping to
      // RESOLVED makes the bubble inert (hides Allow/Deny). response stays null
      // since the user neither accepted nor explicitly rejected — they Stop'd.
      // Only a user Stop finalizes it; any other stream end leaves it PENDING so
      // the pod's /reconnect replay can re-surface the still-live approval.
      const state = m.data?.state ?? 'PENDING';
      if (!finalizePermissions || state !== 'PENDING') {
        next.push(m);
      } else {
        changed = true;
        next.push({ ...m, data: { ...m.data, state: 'RESOLVED' as const } });
      }
      continue;
    }
    if (m.kind === 'COMPACTION' && (m.data?.state ?? 'PENDING') === 'PENDING') {
      // In-progress compaction notice that never got a COMPLETED — the stream
      // ended (Stop / idle / error / reconnect close) before compaction finished.
      // Drop it: leaving a spinner would hang forever, and claiming "summarized"
      // would be false since it didn't complete. The COMPLETED divider (persisted)
      // survives because its state isn't PENDING.
      changed = true;
      continue;
    }
    if (m.kind === 'RETRY') {
      changed = true;
      continue;
    }
    next.push(m);
  }
  return changed ? next : messages;
}

/**
 * @deprecated kept for backward compatibility with tests; use finalizeOrphanedFrames.
 * COMPAT(toolcall-status-deprecated-alias): no product callers — removable as soon as the suite is
 * renamed. Registry: docs/compat/active/toolcall-status-deprecated-alias.md
 */
export const markRunningToolCallsCancelled = finalizeOrphanedFrames;
