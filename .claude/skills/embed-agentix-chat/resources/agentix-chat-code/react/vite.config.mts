/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";
import * as fs from "fs";
import tailwindcss from "@tailwindcss/vite";
import { makeAtAliasFallback, makeForeignBareDepResolver, makePinSingletons, SINGLETON_LIBS } from "./viteShared";

// This consumer app mounts `@c3/agentix-client-ui` from the sibling vendored library at
// `../agentix-chat-ui`. The resolution model mirrors the ZIP demo's `vite.demo.config.ts`:
//   - `@/…` resolves in order [this app's own src, then the chat library's src]
//   - `SINGLETON_LIBS` are pinned to this app's single physical copy (context-bearing libs must
//     resolve once, or the consumer's Provider and the chat UI's `useContext` read different
//     instances and context comes back empty at runtime)
//   - library-tree files import bare deps that get re-resolved through this app's install
// The C3-specific build integration (outDir into ../content/<pkg>, asset naming, base, and the
// VITE_C3_PKG requirement) is preserved. There is NO server-side proxy: the embed signs in via a
// silent same-origin cookie exchange, so the old /api|/remote|/thirdparty|/typesys dev proxies are
// gone.
const APP_SRC = path.resolve(__dirname, "./src");
const CLIENT_SRC = path.resolve(__dirname, "../agentix-chat-ui/src");

const PKG_NM = path.resolve(__dirname, "node_modules");
const CLIENT_NM = path.resolve(__dirname, "../agentix-chat-ui/node_modules");

// Brownfield cookie-hoist auto-guard. react-router@7 requires cookie@1.x. If another top-level
// dep (e.g. express, pulled transitively by @modelcontextprotocol/sdk) out-hoists a different
// `cookie` to the tree root, npm NESTS react-router's own copy at
// react-router/node_modules/cookie. The `react-router > cookie` optimize-include below then
// pre-bundles the WRONG (root) copy while react-router's raw ESM import still resolves the
// un-interop'd nested one → the dev server blanks the app ("does not provide an export named
// 'parse'"). This is a resolved-tree outcome, so it can only be detected after `npm install` —
// which is exactly when this config is evaluated. When the nested copy exists, alias the bare
// `cookie` specifier onto react-router's own copy and force-optimize bare `cookie` instead of the
// sub-dependency form. No-op in the greenfield/single-copy case. Assumes the npm/yarn-classic
// nested layout (not pnpm's symlinked store); verify_embed.sh check 8 is the backstop.
const RR_NESTED_COOKIE = path.resolve(PKG_NM, "react-router/node_modules/cookie");
const cookieHoistCollision = fs.existsSync(RR_NESTED_COOKIE);

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const port = parseInt(env.VITE_DEV_SERVER_PORT || '9000', 10);
  const pkgName = env.VITE_C3_PKG;
  const base = command === 'serve' ? `/${env.VITE_C3_ENV}/${env.VITE_C3_APP}/uiservice/` : './';

  if (!pkgName) {
    throw new Error('VITE_C3_PKG is not set');
  }

  return {
    plugins: [
      makeAtAliasFallback('nexuspkg-at-alias-fallback', [APP_SRC, CLIENT_SRC]),
      makePinSingletons('nexuspkg-pin-singletons', PKG_NM, [CLIENT_NM]),
      makeForeignBareDepResolver('nexuspkg-foreign-bare-deps', [CLIENT_SRC], [path.join(APP_SRC, 'main.tsx')]),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: [
        { find: /^@c3\/agentix-client-ui$/, replacement: path.join(CLIENT_SRC, 'index.ts') },
        { find: /^@c3\/agentix-client-ui\/(.*)$/, replacement: `${CLIENT_SRC}/$1` },
        // Brownfield hoist collision only: force react-router's raw `cookie` import onto its own
        // nested (v1.x) copy instead of the mis-hoisted root one (see cookieHoistCollision above).
        ...(cookieHoistCollision ? [{ find: /^cookie$/, replacement: RR_NESTED_COOKIE }] : []),
        ...SINGLETON_LIBS.map((lib) => ({ find: lib, replacement: path.join(PKG_NM, lib) })),
      ],
      dedupe: SINGLETON_LIBS,
    },
    // Three dep-optimizer escapes, all hit integrating this template in the field:
    //  - react-router (v7/v8) ships ONLY an "exports" map (no main/module; `module-sync`
    //    conditions). The singleton directory alias above bypasses exports resolution inside
    //    esbuild's dep-optimizer scan, which then guesses a nonexistent `dist/index.js` →
    //    `ENOENT ... react-router/dist/index.js` while "updating dependencies". Vite's own
    //    (exports-aware) resolver serves and builds it fine, so react-router is EXCLUDED.
    //  - BUT excluding react-router also stops its own transitive deps from being pre-bundled,
    //    and two of them — `cookie` and `set-cookie-parser` — are CommonJS with no ESM named
    //    exports. Served raw, react-router's `import { parse } from "cookie"` resolves into
    //    un-transformed CJS and the dev server blanks the whole app ("does not provide an export
    //    named 'parse'"). Force-optimize just those two nested deps via the `parent > child`
    //    sub-dependency syntax so they get CJS→ESM interop, while react-router itself stays
    //    excluded. (The prod `vite build` never surfaces this — which is exactly why a green
    //    build is necessary but NOT sufficient: verify the dev render too.)
    //  - sonner's dist inlines its entire stylesheet as one giant string that esbuild's
    //    pre-bundler fails to parse ("Unterminated string literal") through the same alias.
    // Do NOT blanket-exclude the other singletons: react/react-dom are CJS and need pre-bundling.
    optimizeDeps: {
      exclude: ['react-router', 'sonner'],
      // Greenfield: force-optimize the two nested deps via the `parent > child` sub-dependency
      // form. Brownfield hoist collision (see cookieHoistCollision): the sub-dependency form would
      // optimize the mis-hoisted root `cookie`, so optimize the bare specifier — which the alias
      // above now points at react-router's own copy — instead.
      include: cookieHoistCollision
        ? ['cookie', 'react-router > set-cookie-parser']
        : ['react-router > cookie', 'react-router > set-cookie-parser'],
    },
    server: {
      host: true,
      allowedHosts: true,
      port: port,
      strictPort: true,
      fs: {
        // The vendored library is a SIBLING of this Vite root, so its dev-served assets (the
        // Geist @font-face files under src/styles/fonts/, and the library source itself) fall
        // outside the default fs.allow workspace root and 403 with "outside of Vite serving
        // allow list".
        allow: ['.', path.resolve(__dirname, '../agentix-chat-ui')],
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
          /*
           * Split the heavy, rarely-changing vendor groups out of the single ~1.7 MB entry chunk.
           * This is a pure grouping of already-deduped modules (it never duplicates a singleton —
           * each library still resolves to the one physical copy pinned above), so it is safe for
           * the context-bearing libs. The win: the browser fetches these chunks in parallel with
           * the app chunk and caches them across deploys where only app code changed, and it clears
           * the >1000 kB single-chunk warning. Grouping is by import path so a library upgrade needs
           * no edit here. Only cycle-free leaf groups are split out (react, the tiptap/prosemirror
           * editor, ace); everything else stays in one `vendor` chunk because finer splits (radix,
           * markdown) create circular chunks with the shared pool.
           */
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id)) {
              return "vendor-react";
            }
            if (/[\\/]node_modules[\\/](@tiptap|prosemirror-|prosemirror)[\\/]?/.test(id)) {
              return "vendor-editor";
            }
            if (/[\\/]node_modules[\\/](ace-builds|react-ace)[\\/]/.test(id)) {
              return "vendor-ace";
            }
            return "vendor";
          },
        },
        onwarn: (warning, warn) => {
          if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
          warn(warning);
        },
      },
    },
  };
});
