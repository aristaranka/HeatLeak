/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/*
 * Build config for the deployable embed DEMO bundle (`demo/`), the runnable host SPA this template
 * ships alongside the `@c3/agentix-client-ui` library. Kept separate from the package's own
 * `vite.config.ts` (the vitest config) so the package's `npm run build` stays a type-check + pack
 * isolation and never produces `ui/content/` by accident. Only `npm run build:demo` /
 * `make sync-embed-demo` use this file.
 *
 * The demo stands in for a real consumer app: it resolves `@c3/agentix-client-ui` from source, so a
 * broken embed surface fails this build. Nothing here reaches into the Nexus host tree — `@/…`
 * resolves against the demo's own files and then the package's, and that is the whole resolution
 * story. The demo owns the pieces a consumer owns (i18next bootstrap in `demo/i18n.ts`, Tailwind
 * entry in `demo/demo.css`), which is why this config needs no host leg to build.
 */

import { defineConfig } from 'vite';
import type { ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import * as path from 'path';
import { makeAtAliasFallback, makeForeignBareDepResolver, makePinSingletons, SINGLETON_LIBS } from './viteShared';

// Dev-server ONLY (never in the built bundle). Mirrors the host `c3/nexus/react/vite.config.ts`
// proxy so `npm run dev:demo` can render the live embed against a real cluster with HMR: forward the
// SPA-relative platform/REST prefixes to the target Nexus app, injecting the dev `c3auth` cookie from
// C3_NEXUS_TOKEN (so a loopback dev page is authed exactly like a signed-in browser). The embed talks
// to the NEXUS app it discovers, so C3_APP defaults to `nexus` here. Coords come from direnv
// (C3_CLUSTER / C3_ENV / C3_APP) with self-contained fallbacks.
const PROXY_ENV = process.env.C3_ENV || 'dev';
const PROXY_APP = process.env.C3_APP || 'nexus';
function c3Proxy(prefix: string, prependEnvApp = true): ProxyOptions {
  const opts: ProxyOptions = {
    target: `https://${process.env.C3_CLUSTER || 'plat'}.c3ci.cloud`,
    changeOrigin: true,
    secure: false,
    configure: (proxy) => {
      const token = process.env.C3_NEXUS_TOKEN;
      if (!token) return;
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.setHeader('Cookie', `c3auth=${token}`);
      });
    },
  };
  if (prependEnvApp) opts.rewrite = (p) => p.replace(new RegExp(`^${prefix}`), `/${PROXY_ENV}/${PROXY_APP}${prefix}`);
  return opts;
}

const DEMO_SRC = path.resolve(__dirname, './demo');
// Two relative bases are the ONLY things the embed-bundle assembly rewrites, each on its own exact
// line (keep them lone `'..'` literals so the rewrite matches):
//   - CLIENT_PKG: where @c3/agentix-client-ui lives. In-repo it is one dir up (the demo lives at
//     c3/nexusClient/react/demo/, the client at c3/nexusClient/react/); the bundle rewrites it to
//     the vendored sibling `../agentix-chat-ui` so the extracted demo resolves the client beside it.
//   - PKG_NM_BASE: which install this build resolves react/singletons from. In-repo the demo shares
//     the client package's node_modules (one dir up — the tree Jarvis `npm ci`s), so there is no
//     separate demo install; the bundle rewrites it to `.` so the extracted standalone demo uses its
//     OWN node_modules (`npm install` in the demo dir).
const CLIENT_PKG = '..';
const PKG_NM_BASE = '..';
const CLIENT_SRC = path.resolve(__dirname, CLIENT_PKG, 'src');

const PKG_NM = path.resolve(__dirname, PKG_NM_BASE, 'node_modules');
const CLIENT_NM = path.resolve(__dirname, CLIENT_PKG, 'node_modules');

/*
 * `@/…` resolves in the order [demo, product package]: the demo's own files win first (a
 * consumer-provided module), then the nexusClient chat cluster (which owns the whole chat surface).
 * Client-tree files pulled in that way import bare deps, which the foreign-bare-dep resolver
 * re-resolves through the demo entry so this package's install is used.
 */

export default defineConfig({
  // `demo/` is the Vite root so `index.html` sits beside its entry; outputs still land under
  // the package react dir (see build.outDir) for postBuild.cjs to copy into ui/content.
  root: DEMO_SRC,
  plugins: [
    makeAtAliasFallback('embed-demo-at-alias-fallback', [DEMO_SRC, CLIENT_SRC]),
    makePinSingletons('embed-demo-pin-singletons', PKG_NM, [CLIENT_NM]),
    makeForeignBareDepResolver('embed-demo-foreign-bare-deps', [CLIENT_SRC], [path.join(DEMO_SRC, 'main.tsx')]),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: [
      { find: /^@c3\/agentix-client-ui$/, replacement: path.join(CLIENT_SRC, 'index.ts') },
      { find: /^@c3\/agentix-client-ui\/(.*)$/, replacement: `${CLIENT_SRC}/$1` },
      ...SINGLETON_LIBS.map((lib) => ({ find: lib, replacement: path.join(PKG_NM, lib) })),
    ],
    dedupe: SINGLETON_LIBS,
  },
  base: './',
  // Dev-server proxy (HMR against a live cluster). Not part of the built demo bundle.
  server: {
    proxy: {
      '/api': c3Proxy('/api'),
      '/agent-api': c3Proxy('/agent-api'),
      // Mounted Nexus app base: the embed discovers/receives a mount like `/<env>/nexus` and issues
      // ALL its calls (cookie bootstrap, control-plane, REST, cloud-agent) under it. Forward the whole
      // mount to the cluster as-is (it already carries /<env>/<app>), injecting the dev c3auth cookie.
      [`/${PROXY_ENV}/${PROXY_APP}`]: c3Proxy(`/${PROXY_ENV}/${PROXY_APP}`, false),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: path.join(DEMO_SRC, 'index.html'),
      output: {
        assetFileNames: 'assets/[name][extname]',
        chunkFileNames: 'assets/[name].js',
        entryFileNames: 'assets/[name].js',
      },
    },
  },
});
