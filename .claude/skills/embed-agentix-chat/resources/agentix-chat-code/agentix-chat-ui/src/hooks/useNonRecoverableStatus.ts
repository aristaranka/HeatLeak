/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useEffect, useRef, useState } from 'react';
import { myStatus, poolStatuses, type AgentStatus } from '../lib/chatApi';

export const DEFAULT_POLL_INTERVAL_MS = 30000;
/** Wait before the first status read so a fast cold-start that recovers on its own never flashes an
 *  error. After this, poll on the interval. */
export const DEFAULT_INITIAL_DELAY_MS = 15000;

/**
 * The one non-recoverable status to surface, or null while nothing has failed terminally.
 * Without progress reporting, `poolProbe` runs the expensive pool fallback once per attempt.
 * Progress callers refresh it on the existing cadence until they own a pod.
 */
async function pollFinalStatus(poolProbe: { done: boolean }, includeProgress: boolean): Promise<AgentStatus | null> {
  const own = await myStatus();
  if (own.final) return own;
  // Without an owned pod, sample the pool for terminal failures and optional routing progress.
  if (own.phase === 'not-deployed' && (!poolProbe.done || includeProgress)) {
    poolProbe.done = true;
    const pool = await poolStatuses();
    // A failed sibling must not mask usable pool capacity. Progress describes the current sample,
    // not the pod this user will necessarily claim, so prefer readiness over a waiting sibling.
    if (pool.some((s) => s.phase === 'ready' && !s.final)) return null;
    if (includeProgress && pool.some((s) => s.phase === 'waiting-for-models' && !s.final)) {
      return { phase: 'waiting-for-models', final: false, referenceId: null };
    }
    return pool.find((s) => s.final) ?? null;
  }
  return includeProgress ? own : null;
}

/**
 * Polls the agent startup status while `enabled`, returning the latest non-recoverable (`final`)
 * status (or null when none). First read after `initialDelayMs`, then every `pollIntervalMs` — it
 * keeps refreshing (it does NOT stop after the first hit) so the message stays current until the
 * caller disables it (the flow reached the terminal "Couldn't start your agent" screen, or the pod
 * came up). Without progress reporting the warm-pool fallback runs once per attempt; progress
 * callers refresh it until they own a pod. Callers gate `enabled` to the spinner so a healthy chat never polls (and never surfaces
 * another pool pod's failure). The last value is retained when `enabled` flips false, so the
 * reference id captured on the spinner carries into the terminal screen. A `resetKey` change (a
 * fresh provision pass — mount / Retry / reactive re-provision) clears the cached value so a Retry
 * never shows the prior attempt's error.
 */
export function useNonRecoverableStatus(
  enabled: boolean,
  resetKey?: unknown,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  onWaitingForModels?: (waiting: boolean) => void
): AgentStatus | null {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  // Keep the legacy one-shot probe across renders, but reset it with each reservation attempt.
  // The poll effect also restarts on resetKey so stale completions cannot update the new attempt.
  const poolProbe = useRef({ done: false });

  // Drop a cached failure AND re-arm the pool probe whenever the caller starts a fresh cycle
  // (resetKey changes), so a Retry doesn't flash the previous attempt's error and can re-probe.
  useEffect(() => {
    setStatus(null);
    poolProbe.current = { done: false };
    onWaitingForModels?.(false);
  }, [resetKey, onWaitingForModels]);

  useEffect(() => {
    if (!enabled) {
      onWaitingForModels?.(false);
      return undefined;
    }
    let cancelled = false;
    let pulling = false;
    let intervalId = 0;
    const pull = async () => {
      if (pulling) return;
      pulling = true;
      try {
        const next = await pollFinalStatus(poolProbe.current, !!onWaitingForModels);
        // Only swap in a fresh final status — never blank an already-shown message on a transient
        // (non-final) poll, which would flash the overlay off then back on. The message clears only
        // when the flow leaves the spinner (enabled → false), where the last value is retained.
        if (!cancelled) {
          if (next?.final) setStatus(next);
          onWaitingForModels?.(next?.phase === 'waiting-for-models' && !next.final);
        }
      } catch {
        // Unknown is not evidence of a model blocker. Keep a terminal failure latched, but don't
        // retain a specific progress explanation after its confirming read has failed.
        if (!cancelled) onWaitingForModels?.(false);
      } finally {
        pulling = false;
      }
    };
    // First read after initialDelayMs, then every pollIntervalMs.
    const startId = window.setTimeout(() => {
      void pull();
      intervalId = window.setInterval(pull, pollIntervalMs);
    }, initialDelayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(startId);
      window.clearInterval(intervalId);
    };
  }, [enabled, resetKey, pollIntervalMs, initialDelayMs, onWaitingForModels]);

  return status;
}
