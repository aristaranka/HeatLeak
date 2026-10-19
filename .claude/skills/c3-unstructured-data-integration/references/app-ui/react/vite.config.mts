/*
 * Copyright 2009-2025 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import eslint from "vite-plugin-eslint2";

// Helper to create proxy config with Authorization header (and optional WebSocket support)
function createProxyConfig(
  target: string,
  authToken?: string,
  options?: {
    ws?: boolean;
    secure?: boolean;
    originForWs?: string;
    rewrite?: (path: string) => string;
  }
) {
  return {
    target,
    changeOrigin: true,
    ...(options?.ws ? { ws: true } : {}),
    ...(options?.secure === false ? { secure: false } : {}),
    ...(options?.rewrite ? { rewrite: options.rewrite } : {}),
    configure: (proxy: any, _options: any) => {
      proxy.on("proxyReq", (proxyReq: any, _req: any, _res: any) => {
        if (authToken) {
          proxyReq.setHeader("Authorization", `c3auth=${authToken}`);
        }
      });
      if (options?.ws) {
        proxy.on("proxyReqWs", (proxyReq: any, _req: any, _socket: any) => {
          if (authToken) {
            proxyReq.setHeader("Authorization", `c3auth=${authToken}`);
          }
          if (options.originForWs) {
            proxyReq.setHeader("origin", options.originForWs);
          }
        });
      }
    },
  };
}

// ===== Vite Config =====
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const port = parseInt(env.VITE_DEV_SERVER_PORT || '9000', 10);
  const pkgName = env.VITE_C3_PKG || 'docaidocumentsui';
  const authAuth = env.VITE_C3_AUTH_TOKEN;
  const isLocal = env.VITE_LOCAL === 'true';
  const appUrl = `${env.VITE_C3_BASE_URL}/${env.VITE_C3_ENV}/${env.VITE_C3_APP}/`;
  const base = command === 'serve' ? `/${env.VITE_C3_ENV}/${env.VITE_C3_APP}/uiservice/` : './';

  return {
    plugins: [
      tailwindcss(),
      react(),
      // Single eslint2 instance with valid options
      eslint({
        // lintOnStart ignores `exclude` and lints all `include` files; that pulled in __tests__ and blocked dev.
        lintOnStart: false,
        cache: false,
        // Do not fail the dev server on ESLint errors; run `npm run lint` in CI / before commit.
        emitErrorAsWarning: command === "serve",
        include: ["src/**/*.{ts,tsx,js,jsx}"],
        exclude: [
          "node_modules/**",
          "dist/**",
          "build/**",
          "coverage/**",
          "assets/**",
          "src/**/__tests__/**",
          "src/**/*.test.{ts,tsx,js,jsx}",
        ],
      }),
    ],
    // No `@/*` alias: shipped `src/` is package-relative only, so it stays consumer-portable and a
    // reintroduced `@/` import fails to resolve here in-repo (mirrors tsconfig.json).
    server: {
      host: true,
      allowedHosts: true,
      port: port,
      proxy: {
        "^/api": createProxyConfig(appUrl, authAuth),
        "^/file": createProxyConfig(appUrl, authAuth),
        "^/remote": createProxyConfig(appUrl, authAuth),
        "^/thirdparty": createProxyConfig(appUrl, authAuth),
        "^/typesys": createProxyConfig(appUrl, authAuth),
        // Proxy file endpoints so auth header is injected — avoids CORS and auth redirects.
        // downloadFile() returns URLs of the form /{env}/{app}/file/... which match this pattern
        // and are forwarded to the C3 server with credentials.
        [`^/${env.VITE_C3_ENV}/${env.VITE_C3_APP}/file/`]: createProxyConfig(env.VITE_C3_BASE_URL, authAuth),
        ...(isLocal ? {
          "^/gs[a-z0-9]+/": createProxyConfig(env.VITE_C3_BASE_URL, authAuth, {
            ws: true,
            secure: false,
            originForWs: env.VITE_C3_BASE_URL,
            rewrite: (path: string) => path,
          }),
        } : {}),
      },
    },
    base: base,
    build: {
      outDir: `../content/${pkgName}`,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          assetFileNames: "assets/[name][extname]",
          chunkFileNames: "assets/[name].js",
          entryFileNames: "assets/[name].js",
        },
        onwarn: (warning, warn) => {
          if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
          warn(warning);
        },
      },
    },
  };
});
