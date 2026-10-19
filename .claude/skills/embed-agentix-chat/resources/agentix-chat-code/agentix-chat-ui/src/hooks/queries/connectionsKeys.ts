/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * React-Query key registry for the connections domain (secrets, cross-cluster apps, MCP list/detail/
 * status, OpenHands key). Package-owned so both the chat surface (the MCP status/gate reads) and the
 * host admin hooks share one key namespace and invalidate each other's caches consistently.
 */
export const connectionsKeys = {
  secrets: ['connections', 'secrets'] as const,
  remoteApps: ['connections', 'remoteApps'] as const,
  mcpList: ['connections', 'mcp', 'list'] as const,
  mcpDetail: (connectionKey: string) => ['connections', 'mcp', 'detail', connectionKey] as const,
  mcpStatus: (agentDefId: string) => ['connections', 'mcp', 'status', agentDefId] as const,
  openHandsKey: ['connections', 'openhands', 'key'] as const,
};
