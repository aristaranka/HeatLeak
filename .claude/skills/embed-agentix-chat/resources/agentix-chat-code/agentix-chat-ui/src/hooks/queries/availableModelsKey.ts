/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * React-Query key for the app-global available-models read (`Nexus.Agent.DefinitionApi.
 * listAvailableModels`), used by the chat model picker's `useAvailableChatModels`.
 *
 * Value-matched — NOT import-shared — with the host's `agentDetailKeys.models` in
 * `nexus/react/src/hooks/queries/useAgentDetail.ts`. This package is self-contained (it borrows
 * nothing from the host tree), and React Query matches keys by value, so the chat picker, the host
 * agent-detail picker, and `LlmServiceTab`'s post-Sync / enable-disable `invalidateQueries` all
 * address one cache entry despite two separate definitions. Keep this array identical to that host
 * constant so the shared cache and event-driven invalidation stay wired.
 */
export const availableModelsQueryKey = ['agentDetail', 'availableModels'] as const;
