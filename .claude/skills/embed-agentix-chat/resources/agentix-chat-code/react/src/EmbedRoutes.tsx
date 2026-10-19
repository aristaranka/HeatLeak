/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { Navigate, Route, Routes } from 'react-router';
import { NexusChatEmbed } from '@c3/agentix-client-ui';

/**
 * The whole consumer-side embed story: one component, page auth rides through, no BFF.
 *
 * Router-agnostic on purpose — it renders `Routes` but not a `Router`, so the entry wraps it in
 * `HashRouter` (DEPLOY ADAPTATION vs the demo's `BrowserRouter` — see `main.tsx`) while a test could
 * wrap it in `MemoryRouter` and drive an entry path. That split is the only reason this is a
 * component rather than inline JSX in the entry.
 *
 * `/chat` is load-bearing, not cosmetic: ChatPage's internal navigation targets `/chat#<sessionId>`,
 * so mounting the embed at any other path silently breaks session switching. Both other routes
 * redirect there so a bare app URL and an unknown deep link both land on a usable page. Under
 * HashRouter this `/`→`/chat` bounce happens entirely inside the URL fragment (`#/`→`#/chat`), so it
 * is invisible to the Genesis gateway and the Studio iframe wrapper — no real pathname changes.
 */
// DEPLOY ADAPTATION vs the demo: NO `nexusBase`. The library's `resolveNexusMount.ts` now derives
// this page's own control-plane base from the SERVED PATH (`deriveGatewayBase`) rather than a DEV
// `/api/8` shortcut, so under the C3 Code gateway (page served at `/<env>/<app>/…`) the discovery
// POST targets `/<env>/<app>/api/8` and resolves on its own — no override needed. (The demo passes
// `nexusBase={VITE_NEXUS_BASE}` only to feed its local dev-server proxy; that var is unset in built
// bundles and this deploy has no such proxy.) See SETUP.md for the one cluster-side prerequisite:
// publish `serviceAppUrl` on the app's Nexus Microservice.Config.

export function EmbedRoutes() {
  return (
    // Viewport lock so ChatPage's flex children resolve to a real height. Wrapper classes mirror the
    // demo's `EmbedDemoRoutes` exactly.
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route
            path="/chat"
            element={
              // ALL optional embed surfaces ON — same as the demo — so the deployed consumer
              // exercises the full ChatPage feature set (agent switcher, workspace panel,
              // connect-apps, cross-cluster per-user OAuth, model/effort pickers, session sidebar,
              // in-chat MCP apps). The package defaults are deliberately conservative (several off);
              // this template opts into every one.
              <NexusChatEmbed
                agentDefId="C3Agent"
                allowAgentSwitch
                workspaceEnabled
                connectAppsEnabled
                crossClusterOAuthEnabled
                modelControlsEnabled
                sessionSidebarEnabled
                mcpAppsEnabled
              />
            }
          />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </div>
    </div>
  );
}
