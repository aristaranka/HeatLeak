/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useQuery } from '@tanstack/react-query';
import { getMyMcpConnectionStatus, type McpConnectionStatus } from '../../lib/chatApi';
import { connectionsKeys } from './connectionsKeys';

/** The current user's MCP connection status for a given agent definition — drives the chat MCP gate
 *  (which servers need OAuth/token before the session can use them) and the expired-auth banner.
 *  Always-fresh (staleTime 0, refetch on mount) so a just-completed connect reflects immediately. */
export function useMyMcpConnectionStatus(agentDefId: string, enabled = true) {
  return useQuery<McpConnectionStatus[]>({
    queryKey: connectionsKeys.mcpStatus(agentDefId),
    queryFn: () => getMyMcpConnectionStatus(agentDefId),
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
