/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import type { ServiceHealth } from './chatApi';

/**
 * Cause of a chat LLM send/provision block derived from `serviceHealth()`.
 *
 * - `starting` — LiteLLM enabled but not ready (recoverable; soft-block composer).
 * - `unavailable` — proxy status probe failed (`enabled:false, ready:false` with known-zero
 *   modelCount); covers mid-session CloudService termination. Soft-block with outage copy.
 * - `empty` — proxy ready but zero usable models (hard-block; contact admin to configure).
 * - `none` — fail-open: healthy, still loading, or count unknown (`-1`).
 */
export type LlmBlockReason = 'none' | 'starting' | 'unavailable' | 'empty';

/**
 * Shared ~p90 cold-start threshold: after this long in `starting`, soften composer copy.
 * Same value AgentSpinUp uses for provision long-wait reassurance (keep in sync by sharing).
 */
export const DEFAULT_LONG_WAIT_THRESHOLD_MS = 60_000;

/** True when the composer must not send / must hide model+effort controls. */
export function isLlmBlocked(reason: LlmBlockReason): boolean {
  return reason === 'starting' || reason === 'unavailable' || reason === 'empty';
}

/**
 * Single source of truth for chat + provision precheck so predicates cannot drift.
 * Accepts partial/undefined health (loading) and fails open to `none`.
 */
export function llmBlockReason(health: ServiceHealth | null | undefined): LlmBlockReason {
  if (!health || typeof health.modelCount !== 'number') return 'none';
  // Unknown count must never block — a transient read failure is not a known outage.
  if (health.modelCount === -1) return 'none';
  const proxy = health.llmProxy;
  if (proxy?.enabled === true && proxy.ready === false) return 'starting';
  if (proxy?.ready === true && health.modelCount === 0) return 'empty';
  // Probe-fail shape: status catch returns enabled:false/ready:false and forces modelCount 0.
  // Inference always routes through the proxy, so this is an outage, not fail-open.
  if (proxy?.enabled === false && proxy.ready === false && health.modelCount === 0) {
    return 'unavailable';
  }
  return 'none';
}
