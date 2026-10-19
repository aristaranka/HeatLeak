/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// DEPLOY ADAPTATION: HashRouter, not the demo's BrowserRouter. The bundle is served under the
// Genesis gateway (`/<env>/<app>/uiservice/…`) inside the Studio iframe; BrowserRouter's basename
// math (`/<env>/<app>`) never matched the deeper served base and its `/`→`/chat` redirect rewrote
// the real pathname the iframe wrapper/gateway couldn't serve on reload. HashRouter keeps routing
// in the URL fragment, opaque to the gateway, so no basename (and no `resolveBasename`) is needed.
// Everything else below mirrors the demo entry (`demo/main.tsx`) verbatim.
import { HashRouter } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { initTheme } from '@/lib/theme';
// Consumer-owned i18next instance — the chat cluster reads its namespaces from this context:
import './i18n';
// Client styling entry + this consumer's own Tailwind scan roots:
import './globals.css';
import { EmbedRoutes } from './EmbedRoutes';

initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <HashRouter>
          <EmbedRoutes />
          <Toaster />
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>
);
