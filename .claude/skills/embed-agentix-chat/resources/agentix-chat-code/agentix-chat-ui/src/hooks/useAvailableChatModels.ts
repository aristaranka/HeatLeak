/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchAvailableModels, type AvailableModelsResult } from '../lib/agentDefsApi';
import { availableModelsQueryKey } from './queries/availableModelsKey';

/**
 * App-global available-models query for the chat model picker.
 *
 * The available-model set (`Nexus.Agent.DefinitionApi.listAvailableModels`) is registry-backed and
 * effectively static within a session — it changes only when an admin edits the LLM model registry.
 * ChatPage used to call `fetchAvailableModels()` directly inside its session-scoped catalog effect,
 * so it re-fetched (uncached) on every session switch and `session.status` transition. Routing it
 * through React Query under the shared available-models key (`availableModelsQueryKey`, value-matched
 * to the host agent-detail picker's `agentDetailKeys.models`) dedupes the fetch across the chat page,
 * the agent-detail page, and the admin chat-defaults panel. A short finite freshness window keeps
 * session/status churn deduplicated while allowing policy changes made in another browser or by a
 * controller to become visible without requiring the picker to have been opened first.
 *
 * Local admin writes still invalidate this key immediately. Window-focus refresh is the bounded
 * cross-tab/back-end recovery path; previous data remains visible during that refresh so the
 * composer does not jump or flash empty.
 */
export function useAvailableChatModels() {
  return useQuery<AvailableModelsResult>({
    queryKey: availableModelsQueryKey,
    queryFn: fetchAvailableModels,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    placeholderData: (previous) => previous,
  });
}
