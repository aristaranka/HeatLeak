/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Derive a same-origin app mount / request base from the served page path, for the roots the client
 * talks to: the platform action root (`api/8`), the versioned REST root (`agent-api/v1`), the mount
 * discovery call, and the OAuth-callback redirect. Kept as one leaf module (no other internal deps)
 * so every caller shares ONE derivation and cannot drift — the logic previously lived as four
 * near-identical copies, and a fix to one silently left the others wrong (the bug this closes).
 *
 * The distinction is **where the page is served from**, NOT `import.meta.env.DEV`:
 *  - a bare local `npm run dev` binds a LOOPBACK host, serves the SPA at `/`, and proxies `/api` +
 *    `/agent-api` to the cluster — the path holds React routes, not `<env>/<app>`, so the caller
 *    uses a flat root-relative base;
 *  - every real deployment is served from a non-loopback host with the app mount `/<env>/<app>` in
 *    the path — a built/static deploy directly, and the C3 Code dev experience via the Vite dev
 *    server BEHIND the platform gateway.
 *
 * The C3 Code case is exactly why the decision cannot key off `import.meta.env.DEV`: it is
 * DEV === true yet gateway-served, so a DEV check collapses it to the flat root and mount discovery
 * 404s. Keying on the host resolves the mount correctly whether or not DEV is set.
 */

/** Hosts a bare `npm run dev` Vite server binds to. Anything else is gateway-served. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

/**
 * The app mount `/<env>/<app>` for a gateway-served page, or `''` when there is none — a
 * bare-localhost dev server, or a path with fewer than two leading segments. Callers append the
 * request root (`/api/8`, `/agent-api/v1`) or `/index.html`; an empty mount yields a flat,
 * root-relative path, which is what the Vite dev proxy expects.
 */
export function deriveGatewayMount(): string {
  if (LOOPBACK_HOSTS.has(window.location.hostname)) return '';
  const path = window.location.pathname.replace(/\/index\.html$/, '/');
  const parts = path.split('/').filter(Boolean);
  return parts.length >= 2 ? `/${parts[0]}/${parts[1]}` : '';
}

/**
 * Build a same-origin request base for `suffix` (`'api/8'` | `'agent-api/v1'`) from
 * `window.location`: `/<env>/<app>/<suffix>` for a gateway-served page, or the flat `/<suffix>` for
 * a bare-localhost dev server (see {@link deriveGatewayMount}). `suffix` must not carry a leading
 * slash — the return value is always `/<suffix>` or `/<env>/<app>/<suffix>`.
 */
export function deriveGatewayBase(suffix: string): string {
  return `${deriveGatewayMount()}/${suffix}`;
}
