/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { NexusChatEmbed } from '@c3/agentix-client-ui';
import { Navigate, Route, Routes } from 'react-router';

/**
 * The whole consumer-side embed story: one component, page auth rides through, no BFF.
 *
 * Router-agnostic on purpose — it renders `Routes` but not a `Router`, so the demo entry can
 * wrap it in `BrowserRouter` while a test wraps it in `MemoryRouter` and drives an entry path.
 * That split is the only reason this is a component rather than inline JSX in the entry.
 *
 * `/chat` is load-bearing, not cosmetic: ChatPage's internal navigation targets `/chat#<sessionId>`,
 * so mounting the embed at any other path silently breaks session switching. Both other routes
 * redirect there so a bare app URL and an unknown deep link both land on a usable page.
 */
// In the DEPLOYED demo, `NexusChatEmbed` discovers its Nexus mount from the host app's
// `Microservice.Config` (serviceAppUrl) — no base is passed. That discovery can't run on a LOCAL
// dev page (`npm run dev:demo`): a loopback origin has no mounted Nexus app to read config from. So
// for local dev only, an explicit mount can be supplied via `VITE_NEXUS_BASE` (e.g.
// `/rambandi0720/nexus`), paired with the dev-server proxy in `vite.demo.config.ts` that forwards
// that base to a real cluster with the c3auth cookie. The var is unset in the built bundle, so
// discovery owns the mount in every real consumer deployment.
const devNexusBase = (import.meta.env.VITE_NEXUS_BASE as string | undefined) || undefined;

export function EmbedDemoRoutes() {
  return (
    // Viewport lock so ChatPage's flex children resolve to a real height.
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route
            path="/chat"
            element={
              // Demo turns EVERY optional embed surface ON so the stand-in exercises the full
              // ChatPage feature set (agent switcher, workspace panel, connect-apps, cross-cluster
              // per-user OAuth, model/effort pickers, session sidebar, in-chat MCP apps). The
              // package defaults are deliberately conservative (several off); a real consumer opts
              // in per surface. Here we opt into all of them.
              <NexusChatEmbed
                agentDefId="C3Agent"
                nexusBase={devNexusBase}
                routeKey="support"
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
