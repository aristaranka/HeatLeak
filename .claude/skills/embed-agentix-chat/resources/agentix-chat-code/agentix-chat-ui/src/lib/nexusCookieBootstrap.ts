/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Nexus-path cookie bootstrap for same-host embeds.
 *
 * `c3auth` cookies are path-scoped per app, so a sibling app's page holds no credential for
 * `/<env>/<nexusApp>/...` even though the user is already signed in.
 * {@link silentNexusCookieBootstrap} plants one with zero user interaction: the page is
 * cookie-authed to its OWN app, so it asks its own API for the caller's signed session token
 * and presents it once to the Nexus mount in an `Authorization` header; Nexus answers with
 * `Set-Cookie` for its own path and the browser keeps it. A failed exchange means the page's
 * own session is dead — that's the host app's normal reauth problem, not the embed's; callers
 * just render an unavailable state.
 *
 * Both the mint (`User/mySessionToken`) and the probes (`User/myUser`) are self-scoped platform
 * defaults — the endpoints any authenticated principal can call on any C3 app with no role grant.
 * That is deliberate: anything role-gated (`Echo`, an app-specific facade) would read "denied" as
 * "no cookie" for plain users and make the embed silently admin-only.
 */

import { deriveGatewayMount } from './gatewayBase';

/** Probe whether the browser holds a working Nexus-path cookie (no redirect follow, no throw). */
export async function hasNexusCookie(nexusBase: string): Promise<boolean> {
  try {
    const res = await fetch(`${nexusBase.replace(/\/+$/, '')}/api/8/User/myUser`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Silent bootstrap: exchange this app's own session for a Nexus-path cookie.
 *
 * The mint is the platform's own `User.mySessionToken` — self-scoped (it only ever returns the
 * CALLER's token, never an arbitrary user's) and therefore in the unprivileged baseline every
 * authenticated principal has on every app, needing no role grant and no package dependency.
 * That is what makes an embed's server-side integration zero: publish the Nexus URL, mount the
 * component. Do not reach for `User#sessionToken` instead — it takes a user argument, so it is
 * admin-gated to prevent impersonation.
 *
 * Any app on the cluster accepts any sibling app's c3auth, and an `Authorization`-authed response
 * re-issues the token as a `Set-Cookie` scoped to the answering app's path — so one same-origin
 * call to the Nexus mount plants the cookie and everything after is plain cookie auth. The signed
 * token lives only in this function's scope.
 *
 * Resolves true when the Nexus cookie is usable; false means the page's own session is dead —
 * callers render an unavailable state and leave session recovery to the host app.
 */
export async function silentNexusCookieBootstrap(nexusBase: string): Promise<boolean> {
  const base = nexusBase.replace(/\/+$/, '');
  if (await hasNexusCookie(base)) return true;
  // This page's own app mount (`/<env>/<app>`) — the path the browser already holds a cookie for.
  // Shares the one gateway-mount derivation every other client caller uses (loopback → flat base,
  // `/index.html` stripped), so a bare dev server opened at a deep client route can't mint the
  // session token against a wrong `/<seg>/<seg>` path; an empty mount bails via the guard below.
  const own = deriveGatewayMount();
  if (!own || own === base) return false;
  try {
    const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(url, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    const tokRes = await post(`${own}/api/8/User/mySessionToken`, {});
    if (!tokRes.ok) return false;
    const payload: unknown = await tokRes.json().catch(() => null);
    const signed = ((payload ?? {}) as { signedToken?: unknown }).signedToken;
    if (typeof signed !== 'string' || !signed) return false;
    await post(`${base}/api/8/User/myUser`, {}, { Authorization: `c3auth ${signed}` });
    return hasNexusCookie(base);
  } catch {
    return false;
  }
}
