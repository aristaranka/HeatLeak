/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Chat-surface React Query keys owned by this package — the subset the shared chat UI reads or
 * invalidates. Kept in-package so the chat UI does not borrow the host's full `queryKeys` map
 * (which enumerates host-only surfaces the embed never touches).
 *
 * The string VALUES must stay identical to any key the host also uses, because host and embed can
 * share one `QueryClient`: React Query matches keys structurally (by value, not reference), so a
 * host invalidation of `['agentDefinitions', …]` still reaches these queries as long as the leading
 * literal matches. Change a value here only in lockstep with the host.
 */
export const chatQueryKeys = {
  agentDefinitions: ['agentDefinitions'] as const,
  myAutoSkills: ['myAutoSkills'] as const,
} as const;
