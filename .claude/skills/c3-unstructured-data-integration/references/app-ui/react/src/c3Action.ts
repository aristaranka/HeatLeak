/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import axios from 'axios';

interface AxiosResponse {
  data: any;
}

/*
 * Forces application/json on every POST below. Most callers pass a pre-stringified JSON string;
 * c3MemberActionKwargs passes a plain object (which axios serializes to JSON itself). For a *string*
 * body axios otherwise defaults to application/x-www-form-urlencoded, which c3server tolerates for
 * most payloads but silently returns 204 No Content for some (e.g. long text passed to
 * replaceSourceCitations), yielding blank UI. Object bodies already default to JSON, so the header is
 * a consistency no-op there.
 */
const JSON_POST_CONFIG = { headers: { 'Content-Type': 'application/json' } };

export function getCookieValue(cookieName: string): string | undefined {
  const cookie = document?.cookie
    ?.split(';')
    ?.map((c) => c.trim())
    .find((c) => c.startsWith(cookieName + '='));
  if (!cookie) {
    return undefined;
  }
  // Treat blank/whitespace-only cookie values as absent (the deployed liveapp sets an empty
  // `c3AppUrlPrefix=`), so callers fall through to the next derivation source instead of building a
  // `<origin>//api/...` URL.
  const value = cookie.slice(cookie.indexOf('=') + 1).trim();
  return value === '' ? undefined : value;
}

export function getAppBaseUrl(): string {
  /*
   * Reconstruct the client-side equivalent of the server's `C3.app()` prefix
   * (`<origin>/<env>/<app>`), fully derived — nothing hardcoded.
   *
   * Gate on the runtime HOSTNAME, not `import.meta.env.DEV`. This is the root-cause fix: the
   * deployed liveapp is served by the same Vite server (so `import.meta.env.DEV` is ALSO `true`
   * there), but it is exposed through nginx WITHOUT the `^/api` dev proxy. A `DEV`-gated
   * `return ''` therefore fired in the deployed app and produced a bare `origin/api/8/...` URL
   * with no env/app route → nginx HTML 404. Keying off the hostname instead means only a genuine
   * localhost dev server (which has the Vite proxy) returns '' to trust that proxy; every deployed
   * host derives the real `/<env>/<app>` prefix.
   */
  const host = window.location.hostname;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  if (isLocalhost) {
    // Local Vite dev server: return '' so requests start with /api and the dev proxy forwards them.
    return '';
  }

  // Deployed (liveapp / studio preview): <origin>/<env>/<app>, env/app derived below.
  const c3AppUrlPrefix = getCookieValue('c3AppUrlPrefix');
  const c3env = getCookieValue('c3env');
  const c3app = getCookieValue('c3app');

  let baseUrl = window.location.origin;
  if (c3AppUrlPrefix) {
    // Non-blank prefix cookie wins. (The deployed liveapp sets an EMPTY `c3AppUrlPrefix=`, which is
    // falsy here and correctly falls through to cookie/path derivation below.)
    baseUrl = `${baseUrl}/${c3AppUrlPrefix}`;
  } else if (c3env && c3app) {
    baseUrl = `${baseUrl}/${c3env}/${c3app}`;
  } else {
    /*
     * Cookie-less fallback (robustness): when neither c3AppUrlPrefix nor c3env/c3app cookies are
     * present, `window.location.origin` alone yields a bare `/api/8/...` URL with no env/app route —
     * nginx returns an HTML 404 (the request never reaches the app). The app is served under
     * `/<env>/<app>/...`, so recover that prefix from the current path.
     */
    const prefix = deriveEnvAppPrefixFromPath(window.location.pathname);
    if (prefix) {
      baseUrl = `${baseUrl}${prefix}`;
    }
  }

  return baseUrl.replace(/\/$/, '');
}

/**
 * Recover the `/<env>/<app>` URL prefix from the current path when the c3env/c3app cookies are
 * unavailable. C3 serves the app under `/<env>/<app>/<service>/...` (e.g.
 * `/gs7f46550a/liveapp/uiservice/...` or `/dev/studio/...`), so the first two path segments before a
 * known C3 service segment are the env and app. Returns `''` if a prefix can't be determined.
 */
export function deriveEnvAppPrefixFromPath(pathname: string): string {
  const C3_SERVICE_SEGMENTS = ['uiservice', 'static', 'api', 'apps'];
  const segments = pathname.split('/').filter(Boolean);
  const serviceIdx = segments.findIndex((s) => C3_SERVICE_SEGMENTS.includes(s));
  // Need at least `<env>/<app>` before the service segment.
  if (serviceIdx >= 2) {
    return `/${segments[serviceIdx - 2]}/${segments[serviceIdx - 1]}`;
  }
  return '';
}

/**
 * The function that allows communication with c3server APIs.
 * For calling APIs with arguments, action needs to be the function name and spec needs to be a list of arguments.
 * For fetching data, action needs to be `fetch` and spec needs to be an object that contains the Filter spec.
 * @param typeName The c3type to call
 * @param actionName The function to invoke
 * @param spec The arguments to the function
 * @returns The response from c3server
 */
export async function c3Action(typeName: string, actionName: string, spec?: any): Promise<any> {
  const appBaseUrl = getAppBaseUrl();
  const url = `${appBaseUrl}/api/8/${typeName}/${actionName}`;
  const payload = spec
    ? Array.isArray(spec)
      ? JSON.stringify([typeName, ...spec])
      : JSON.stringify([typeName, spec])
    : undefined;

  const response: AxiosResponse = await axios.post(url, payload, JSON_POST_CONFIG);
  return response.data;
}

export async function c3GetAction(typeName: string, id: string, include: string = 'id'): Promise<any> {
  return await c3MemberAction(typeName, 'get', { id }, include);
}

/**
 * The function that allows communication with c3server APIs using functions like create().
 * For calling APIs with arguments, action needs to be the function name and spec needs to be a list of arguments.
 * @param typeName The c3type to call
 * @param actionName The function to invoke
 * @param spec The arguments to the function
 * @returns The response from c3server
 */
export async function c3CreateAction(typeName: string, actionName: string, spec: any): Promise<any> {
  const appBaseUrl = getAppBaseUrl();
  const url = `${appBaseUrl}/api/8/${typeName}/${actionName}`;
  const payload = JSON.stringify([spec]);
  const response: AxiosResponse = await axios.post(url, payload, JSON_POST_CONFIG);
  return response.data;
}

/**
 * The function that allows communication with c3server APIs using member functions.
 * For calling APIs with arguments, action needs to be the member function name and spec needs
 * to be a list of arguments.
 * @param typeName The c3type to call
 * @param actionName The member function to invoke
 * @param instance The c3type instance to call
 * @param spec The arguments to the function
 * @returns The response from c3server
 */
export async function c3MemberAction(typeName: string, actionName: string, instance: any, spec?: any): Promise<any> {
  const appBaseUrl = getAppBaseUrl();
  const url = `${appBaseUrl}/api/8/${typeName}/${actionName}`;
  const payload = spec
    ? Array.isArray(spec)
      ? JSON.stringify([instance, ...spec])
      : JSON.stringify([instance, spec])
    : JSON.stringify([instance]);

  const response: AxiosResponse = await axios.post(url, payload, JSON_POST_CONFIG);
  return response.data;
}

/**
 * Call a c3server member function using keyword arguments instead of positional.
 * The instance is sent as "this" and additional kwargs are spread into the payload object.
 */
export async function c3MemberActionKwargs(
  typeName: string,
  actionName: string,
  instance: any,
  kwargs: Record<string, any> = {}
): Promise<any> {
  const appBaseUrl = getAppBaseUrl();
  const url = `${appBaseUrl}/api/8/${typeName}/${actionName}`;
  const payload = { this: instance, ...kwargs };

  const response: AxiosResponse = await axios.post(url, payload, JSON_POST_CONFIG);
  return response.data;
}

export default c3Action;
