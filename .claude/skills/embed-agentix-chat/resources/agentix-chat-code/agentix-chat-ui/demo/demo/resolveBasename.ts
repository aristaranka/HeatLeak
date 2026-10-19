/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { computeBasename } from './basename';

/**
 * Router basename for the gateway-served bundle, plus the one side effect the pure
 * {@link computeBasename} deliberately leaves to its caller: normalizing an `/index.html` address
 * bar in place so a reload lands on the clean path (the gateway serves `/index.html` for a
 * directory hit, and React Router would otherwise treat it as a route segment).
 *
 * Lives beside the entry rather than inside it so it is reachable without importing `main.tsx` —
 * importing that would run `createRoot` against a DOM node no test has. `isDev` and `loc` are
 * injected for the same reason: `import.meta.env.DEV` is fixed per bundle, and jsdom's
 * `window.location` cannot be reassigned.
 */
export function resolveBasename(
  isDev: boolean = import.meta.env.DEV,
  loc: {
    pathname: string;
    search: string;
    hash: string;
    replaceState: (path: string) => void;
  } = {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    replaceState: (path: string) => window.history.replaceState(null, '', path),
  }
): string {
  // Local Vite serves at root, so the path holds React routes rather than `/<env>/<app>`.
  if (isDev) return '/';
  const path = loc.pathname.replace(/\/index\.html$/, '/');
  if (path !== loc.pathname) {
    loc.replaceState(path + loc.search + loc.hash);
  }
  return computeBasename(path);
}
