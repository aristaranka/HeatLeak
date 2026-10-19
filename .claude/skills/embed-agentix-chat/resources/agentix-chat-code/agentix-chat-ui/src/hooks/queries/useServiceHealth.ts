/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useQuery } from '@tanstack/react-query';
import { serviceHealth } from '../../lib/chatApi';
import { isLlmBlocked, llmBlockReason } from '../../lib/llmBlockReason';

/** React-Query key for the aggregate service-health poll. Self-contained (only this hook reads or
 *  invalidates it), so the package owns it rather than the host admin key registry. */
export const serviceHealthKey = ['serviceHealth'] as const;

// Shared 30s cadence for the readiness-probe-backed poll: the read runs a real proxy/Laminar
// readiness probe so keep it modest; React Query pauses the interval while the tab is hidden.
const SERVICE_HEALTH_POLL_MS = 30 * 1000;
/** Faster cadence while chat LLM is blocked (`starting` / `unavailable` / `empty`) so unlock tracks recovery. */
const SERVICE_HEALTH_BLOCKED_POLL_MS = 5 * 1000;

/** Aggregate service-health read — drives the any-user chat send/provision guards (the admin
 *  degradation banner uses `useDeploymentHealth`). Polled so the guards track live
 *  degradation/recovery. While chat is soft/hard blocked (`starting` / `unavailable` / `empty`),
 *  poll every 5s and refetch on focus so unlock tracks LiteLLM recovery without waiting a full
 *  30s cadence. */
export function useServiceHealth() {
  return useQuery({
    queryKey: serviceHealthKey,
    queryFn: serviceHealth,
    refetchInterval: (query) => {
      return isLlmBlocked(llmBlockReason(query.state.data)) ? SERVICE_HEALTH_BLOCKED_POLL_MS : SERVICE_HEALTH_POLL_MS;
    },
    refetchOnWindowFocus: (query) => isLlmBlocked(llmBlockReason(query.state.data)),
  });
}
