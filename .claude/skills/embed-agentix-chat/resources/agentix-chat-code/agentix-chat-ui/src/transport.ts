/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Live-pod backend contract for the shared {@link ChatPage}.
 *
 * The host Nexus SPA injects {@link InClusterTransport}, which delegates to the host chat API
 * (cookie auth + NDJSON stream). Same-host embeds inject the SAME transport constructed with
 * `{ baseUrl: '/<env>/<nexusApp>' }`. Chat chrome (sidebar, workspace) reaches the backend only
 * through this contract.
 */

// Concrete signatures are reused from the package chat API (`lib/chatApi`) via `typeof`, so this
// contract cannot drift from the functions InClusterTransport delegates to. The chat API is
// in-package (self-contained) — there is no host reach here.
import type * as ChatApi from './lib/chatApi';

/**
 * Backend contract the host {@link ChatPage} is coded against — injected as
 * `<ChatPage transport={...} />`. {@link InClusterTransport} implements it by delegating to the
 * host's live-pod chat API. ChatPage and its chrome never import `@/lib/api` chat/workspace
 * functions for behavior — they talk only to this injected transport.
 */
/** One page of agent definitions for the chat New-chat / AgentPicker lists. */
export type AgentDefinitionsPage = {
  rows: Array<{
    id: string;
    name: string;
    description?: string | null;
    instructions?: string | null;
    llmModel?: string | null;
    llmEffort?: string | null;
    icon?: string | null;
    isProtected?: boolean;
    skillNames?: string[];
    mcpConnectionKeys?: string[];
    appIds?: string[];
    meta?: { createdBy?: string; created?: string; updated?: string };
  }>;
  hasMore: boolean;
};

/** One MCP connection status row (host {@code McpConnectionStatus} shape). */
export type McpConnectionStatusRow = {
  connectionKey: string;
  name: string;
  authKind: 'none' | 'bearer' | 'apiKey' | 'oauth';
  requiresAuth: boolean;
  status: 'connected' | 'disconnected' | 'shared';
};

export interface NexusChatTransport {
  /**
   * When false, ChatPage skips the MCP pre-chat gate and the in-composer {@code McpConnectionsMenu}.
   * A transport that supplies its own MCP proxies sets this; host InClusterTransport leaves
   * this undefined/true and uses host cookie APIs.
   */
  supportsMcpAuthGate?: boolean;
  /** Mint a per-chat MCP JWT (UI MCP Apps bridge); optional transport override of the host endpoint. */
  generateMcpToken?: (sessionId: string) => Promise<string>;
  /** Pre-chat / in-composer MCP connection status. */
  getMyMcpConnectionStatus?: (agentDefId?: string) => Promise<McpConnectionStatusRow[]>;
  getMcpOAuthUrl?: (
    connectionKey: string,
    redirectUri: string,
    codeChallenge: string,
    codeVerifier: string
  ) => Promise<string>;
  connectMcp?: (connectionKey: string, authCode: string, state: string) => Promise<{ connected?: boolean }>;
  setMcpApiKey?: (connectionKey: string, apiKey: string) => Promise<{ connected?: boolean }>;
  disconnectMcp?: (connectionKey: string) => Promise<boolean>;
  appInfo: typeof ChatApi.appInfo;
  addSession: typeof ChatApi.addSession;
  generateSessionTitle: typeof ChatApi.generateSessionTitle;
  getSession: typeof ChatApi.getSession;
  /** Optional while older external hosts adopt realtime skill-learning UX. */
  setSessionSkillImprovementOptOut?: typeof ChatApi.setSessionSkillImprovementOptOut;
  /** Optional while older external hosts adopt realtime skill-learning UX. */
  listMyAutoSkills?: typeof ChatApi.listMyAutoSkills;
  updateSessionModel: typeof ChatApi.updateSessionModel;
  updateSessionTitle: typeof ChatApi.updateSessionTitle;
  listModels: typeof ChatApi.listModels;
  listSessionsForService: typeof ChatApi.listSessionsForService;
  /** Soft-delete a chat session (sidebar delete). */
  removeChat: typeof ChatApi.removeChat;
  fetchSessionMessages: typeof ChatApi.fetchSessionMessages;
  /**
   * Paginated agent-definition list for New-chat / AgentPicker. Host uses DefinitionApi via
   * cookie; a transport may substitute its own source.
   */
  listAgentDefinitions: (offset?: number, limit?: number, search?: string) => Promise<AgentDefinitionsPage>;
  streamQuery: typeof ChatApi.streamQuery;
  streamRespond: typeof ChatApi.streamRespond;
  streamReconnect: typeof ChatApi.streamReconnect;
  mergeFrame: typeof ChatApi.mergeFrame;
  respondPermission: typeof ChatApi.respondPermission;
  resumeService: typeof ChatApi.resumeService;
  recoverService: typeof ChatApi.recoverService;
  sendKeepalive: typeof ChatApi.sendKeepalive;
  listConnectedApps: typeof ChatApi.listConnectedApps;
  revokeApp: typeof ChatApi.revokeApp;
  configureApp: typeof ChatApi.configureApp;
  // Per-user cross-cluster OAuth connect (mirrors the MCP OAuth trio). Routed through the transport
  // so the flow works under both InClusterTransport and an embed/BFF transport.
  probeRemote: typeof ChatApi.probeRemote;
  getRemoteOAuthUrl: typeof ChatApi.getRemoteOAuthUrl;
  connectRemoteUser: typeof ChatApi.connectRemoteUser;
  // Revoke the caller's own per-user token for a remote app (no-op if none). Wired into the
  // app-remove flow so removing a cross-cluster app also clears its stored OAuth credential.
  disconnectRemoteUser: typeof ChatApi.disconnectRemoteUser;
  submitFeedback: typeof ChatApi.submitFeedback;
  stopQuery: typeof ChatApi.stopQuery;
  workspaceFileUrl: typeof ChatApi.workspaceFileUrl;
  fetchWorkspaceTree: typeof ChatApi.fetchWorkspaceTree;
  fetchWorkspaceView: typeof ChatApi.fetchWorkspaceView;
  fetchWorkspacePreview: typeof ChatApi.fetchWorkspacePreview;
  fetchWorkspacePdfObjectUrl: typeof ChatApi.fetchWorkspacePdfObjectUrl;
  downloadWorkspaceFile: typeof ChatApi.downloadWorkspaceFile;
  downloadWorkspaceZip: typeof ChatApi.downloadWorkspaceZip;
  moveWorkspacePath: typeof ChatApi.moveWorkspacePath;
}
