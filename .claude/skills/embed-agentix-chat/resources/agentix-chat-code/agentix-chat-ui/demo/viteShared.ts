/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/*
 * Resolution primitives for the embed demo's Vite build (`vite.demo.config.ts`). The demo stands in
 * for a consumer app mounting `@c3/agentix-client-ui`, so it must resolve `@/…` and pin singletons
 * the way a consumer's bundler would. The three resolve plugins differ only in a handful of
 * directory arguments, so they are parameterized factories here rather than inlined in the config.
 *
 * `SINGLETON_LIBS` is NOT defined here — it is re-exported from the product package
 * (`@c3/agentix-client-ui`), the single source both test configs and the host SPA import. That list
 * is correctness-critical and silent when wrong (two physical copies of a context-bearing library →
 * empty context at runtime, nothing failing at build time), so it lives in exactly one place rather
 * than in a per-config copy that could drift by one entry. See `singletonLibs.ts` in the package.
 */

import * as fs from 'fs';
import * as path from 'path';
// The client package's singletonLibs sits one directory up (c3/nexusClient/react/singletonLibs).
// The embed-bundle assembly rewrites this exact specifier to the vendored sibling for the extracted
// demo (../agentix-chat-ui/singletonLibs). Keep it a lone `'../singletonLibs'` literal.
import { SINGLETON_LIBS } from '../singletonLibs';
import type { Plugin } from 'vite';

export { SINGLETON_LIBS };

const EXTS = ['.tsx', '.ts', '.jsx', '.js', '.json', '.css'];

/** Resolve a extension-less `@/…` path the way Vite/tsconfig would: file, then `index.*`. */
export function resolveInDir(base: string): string | null {
  for (const e of EXTS) if (fs.existsSync(base + e)) return base + e;
  for (const e of EXTS) if (fs.existsSync(path.join(base, `index${e}`))) return path.join(base, `index${e}`);
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  return null;
}

/** True for a bare package specifier (not relative, absolute, `@/…`, or a Windows drive path). */
export function isBarePackageId(source: string): boolean {
  if (!source || source.startsWith('\0')) return false;
  if (source.startsWith('.') || source.startsWith('/') || source.startsWith('@/')) return false;
  if (path.isAbsolute(source)) return false;
  if (/^[A-Za-z]:/.test(source)) return false;
  return true;
}

/**
 * Resolve `@/…` against `dirs` in order (first hit wins) — a consumer-provided module shadowing the
 * package, then the package's own src, then any host tree the harness still legitimately reaches.
 * `dirs` IS the resolution policy: the vitest config uses [test, package, host]; the demo uses
 * [demo, package] and reaches no host tree at all, which is what makes it buildable outside this
 * checkout. The product package's own config, by contrast, has a single-dir fallback with no host
 * leg (its self-containment lock) and does not use this factory.
 */
export function makeAtAliasFallback(name: string, dirs: string[]): Plugin {
  return {
    name,
    enforce: 'pre',
    resolveId(source) {
      if (!source.startsWith('@/')) return null;
      const rel = source.slice(2);
      for (const dir of dirs) {
        const hit = resolveInDir(path.join(dir, rel));
        if (hit) return hit;
      }
      return null;
    },
  };
}

/**
 * Force every `SINGLETON_LIBS` import to `localNm`'s single physical copy — both a direct bare
 * import (`react`) and one already resolved into a `foreignNm` (the product / host tree's own
 * `node_modules`). Two copies of a context-bearing lib → the consumer's Provider and the chat UI's
 * `useContext` read different instances and context comes back empty at runtime.
 */
export function makePinSingletons(name: string, localNm: string, foreignNms: string[]): Plugin {
  return {
    name,
    enforce: 'pre',
    async resolveId(source, importer, options) {
      // Redirect to `localNm`, then delegate to the rest of the resolver so the returned id is a
      // FULLY-resolved file, not a bare join. A bare `path.join(localNm, 'react/jsx-runtime')` is an
      // unresolved id (no extension); vite/rollup use a plugin-returned id verbatim, so a production
      // `vite build` hands it straight to load-fallback and can't open it. `skipSelf` avoids
      // re-entering this hook; the fallback keeps the original behavior if nothing resolves.
      const pin = async (id: string): Promise<string> => {
        const resolved = await this.resolve(id, importer, { ...options, skipSelf: true });
        return resolved ? resolved.id : id;
      };
      for (const lib of SINGLETON_LIBS) {
        if (source === lib || source.startsWith(`${lib}/`)) {
          return pin(path.join(localNm, source));
        }
        for (const nm of foreignNms) {
          const root = path.join(nm, lib);
          if (source === root || source.startsWith(root + path.sep)) {
            return pin(path.join(localNm, lib, source.slice(root.length + 1)));
          }
        }
      }
      return null;
    },
  };
}

/**
 * Product / host-tree files (importers under `srcPrefixes`) import bare deps that must resolve from
 * THIS package's install, not the foreign tree's. Re-resolve each as if it were imported by one of
 * `bridges` (a file that lives in this package) so node_modules walking starts here. Singletons are
 * left to `makePinSingletons` — skip them.
 */
export function makeForeignBareDepResolver(name: string, srcPrefixes: string[], bridges: string[]): Plugin {
  return {
    name,
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer) return null;
      if (!srcPrefixes.some((p) => importer.startsWith(p))) return null;
      if (!isBarePackageId(source)) return null;
      for (const lib of SINGLETON_LIBS) {
        if (source === lib || source.startsWith(`${lib}/`)) return null;
      }
      for (const bridge of bridges) {
        const resolved = await this.resolve(source, bridge, { ...options, skipSelf: true });
        if (resolved) return resolved;
      }
      return null;
    },
  };
}
