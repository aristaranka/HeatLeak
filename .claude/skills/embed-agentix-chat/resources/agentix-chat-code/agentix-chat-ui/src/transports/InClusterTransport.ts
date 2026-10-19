/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { listDefinitions } from '../lib/agentDefsApi';
import * as chatApi from '../lib/chatApi';
import { configureNexusBase, configureSourceApp, configureFilterHistoryByOrigin } from '../lib/nexusBase';
import { resolveOwnAppId } from '../lib/resolveNexusMount';
import type { NexusChatTransport } from '../transport';

/**
 * The one {@link NexusChatTransport}: cookie auth + NDJSON via the in-package chat API helper
 * (`lib/chatApi`). Behavior — including live streaming and per-request mocking (the chat tests
 * mock it via `vi.mock('@/lib/chatApi')`, where `@/` is the test package's own alias to this
 * package's `src`) — is unchanged; only the Nexus mount the helper targets differs by constructor
 * opts.
 *
 * **"In-cluster", not "localhost".** Every caller — Nexus host SPA and sibling-app embed alike —
 * runs inside the same C3 cluster as the Nexus mount it talks to; only how the mount's base path
 * is derived differs. The default (`local: false`) is the EMBED path: zero-arg leaves the
 * configured base alone so a caller ({@link NexusChatEmbed}) can set `baseUrl` after resolving a
 * sibling Nexus app's mount from `Microservice.Config` (`serviceAppId`, recommended,
 * or the legacy `serviceAppUrl`). On multi-studio clusters (`Microservice.Config.forName("Studio").appId` set),
 * the studio-scoped `'Nexus.<studioId>'` record is tried before the cluster-wide `'Nexus'`.
 * That is why the name is not `LocalTransport`: the out-of-the-box target
 * is another app's mount elsewhere in the cluster, not this app.
 *
 * `{ local: true }` is the explicit opt-out, used only by the Nexus HOST SPA: derive
 * `/<env>/<app>` from `window.location` instead of discovering.
 * ```tsx
 * <ChatPage transport={useMemo(() => new InClusterTransport({ local: true }), [])} />
 * ```
 *
 * A sibling app names the Nexus mount explicitly (or after discovery):
 * ```tsx
 * <ChatPage transport={useMemo(() => new InClusterTransport({ baseUrl: '/myenv/nexus' }), [])} />
 * ```
 */
export class InClusterTransport implements NexusChatTransport {
  constructor(opts?: { local?: boolean; baseUrl?: string; filterHistoryByOrigin?: boolean }) {
    if (opts?.baseUrl) {
      // Embed: target the discovered Nexus mount, and resolve this app's own canonical id (from its
      // own origin) so a chat opened here is attributed `embedded` in the admin Agent Services table.
      configureNexusBase(opts.baseUrl);
      configureSourceApp(resolveOwnAppId);
      configureFilterHistoryByOrigin(opts.filterHistoryByOrigin === true);
    } else if (opts?.local) {
      // Host SPA: derive the mount from location, and name no source app — chats opened here are
      // `direct` by default (the server stamps the Nexus's own id).
      configureNexusBase(null);
      configureSourceApp(null);
      configureFilterHistoryByOrigin(false);
    }
  }

  appInfo = chatApi.appInfo;
  addSession = chatApi.addSession;
  generateSessionTitle = chatApi.generateSessionTitle;
  getSession = chatApi.getSession;
  setSessionSkillImprovementOptOut = chatApi.setSessionSkillImprovementOptOut;
  listMyAutoSkills = chatApi.listMyAutoSkills;
  updateSessionModel = chatApi.updateSessionModel;
  updateSessionTitle = chatApi.updateSessionTitle;
  listModels = chatApi.listModels;
  listSessionsForService = chatApi.listSessionsForService;
  removeChat = chatApi.removeChat;
  fetchSessionMessages = chatApi.fetchSessionMessages;
  listAgentDefinitions: NexusChatTransport['listAgentDefinitions'] = (offset, limit, search) =>
    listDefinitions(offset ?? 0, limit ?? 20, search);
  streamQuery = chatApi.streamQuery;
  streamRespond = chatApi.streamRespond;
  streamReconnect = chatApi.streamReconnect;
  mergeFrame = chatApi.mergeFrame;
  respondPermission = chatApi.respondPermission;
  resumeService = chatApi.resumeService;
  recoverService = chatApi.recoverService;
  sendKeepalive = chatApi.sendKeepalive;
  listConnectedApps = chatApi.listConnectedApps;
  revokeApp = chatApi.revokeApp;
  configureApp = chatApi.configureApp;
  probeRemote = chatApi.probeRemote;
  getRemoteOAuthUrl = chatApi.getRemoteOAuthUrl;
  connectRemoteUser = chatApi.connectRemoteUser;
  disconnectRemoteUser = chatApi.disconnectRemoteUser;
  submitFeedback = chatApi.submitFeedback;
  stopQuery = chatApi.stopQuery;
  workspaceFileUrl = chatApi.workspaceFileUrl;
  fetchWorkspaceTree = chatApi.fetchWorkspaceTree;
  fetchWorkspaceView = chatApi.fetchWorkspaceView;
  fetchWorkspacePreview = chatApi.fetchWorkspacePreview;
  fetchWorkspacePdfObjectUrl = chatApi.fetchWorkspacePdfObjectUrl;
  downloadWorkspaceFile = chatApi.downloadWorkspaceFile;
  downloadWorkspaceZip = chatApi.downloadWorkspaceZip;
  moveWorkspacePath = chatApi.moveWorkspacePath;
}
