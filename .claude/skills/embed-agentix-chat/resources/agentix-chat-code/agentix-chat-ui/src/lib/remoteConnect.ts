/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { generatePkce, openOAuthPopup } from './oauthPopup';
import type { RemoteProbeResult, RemoteUserApp } from './chatApi';
import type { TargetAppInfo } from './types';

/**
 * Connect a cross-cluster app to the chat session, resolving the dual-mode input (a `<cluster>-<env>-<app>`
 * id OR an `https://` app URL) into the right path. Mirrors the MCP per-user OAuth flow (useMcpConnect):
 * probe → getOAuthUrl → popup → connect, then bind via `configureApp`. Pure orchestration over the chat
 * API + the OAuth-popup helper so it unit-tests without a live cluster or a real popup.
 *
 *   - **appId** → try `configureApp` first. If the backend can reach it (admin service token, or a
 *     per-user token the user already holds) it binds immediately (`via` = service | user | same-cluster).
 *     If it comes back `needs-remote-auth`, run the per-user OAuth flow against its `appUrl` (unless
 *     `needsAdmin`, which the user cannot self-serve — surfaced as a coded error).
 *   - **URL** → always the per-user OAuth flow: probe for compatibility, run the redirect, then bind the
 *     appId the connect step resolved.
 *
 * Errors carry a `code` (`needs-admin` | `no-url` | a probe `reason`) so the caller can localize; the
 * default `message` is the server-provided (already human-readable) text, mirroring useMcpConnect.
 */

/**
 * The transport-provided calls this orchestrator drives. Injected (not imported from chatApi) so the
 * flow stays transport-agnostic — ChatPage passes the members off its `NexusChatTransport`, which
 * works under both InClusterTransport and an embed/BFF transport.
 */
export interface RemoteConnectDeps {
  probeRemote: (rawUrl: string) => Promise<RemoteProbeResult>;
  getRemoteOAuthUrl: (rawUrl: string, codeChallenge: string, codeVerifier: string) => Promise<string>;
  connectRemoteUser: (rawUrl: string, code: string, state: string) => Promise<RemoteUserApp>;
  configureApp: (appId: string) => Promise<TargetAppInfo>;
}

export type CodedError = Error & { code?: string };

export type ConnectOutcome =
  | { status: 'bound'; info: TargetAppInfo } // reached directly (service / user / same-cluster)
  | { status: 'connected'; info: TargetAppInfo }; // per-user OAuth redirect completed, then bound

const URL_RE = /^https?:\/\//i;
const APP_ID_RE = /^[a-zA-Z0-9.]+-[a-zA-Z0-9.]+-[a-zA-Z0-9.]+$/;

/** True when the input is an app URL rather than a `<cluster>-<env>-<app>` id. */
export function isUrlInput(input: string): boolean {
  return URL_RE.test(input.trim());
}

/**
 * Pull a `<cluster>-<env>-<app>` id out of raw picker input. Accepts, in order:
 *   - a bare id;
 *   - a Studio console URL (`https://<host>/<tenant>/studio/apps/<appId>`) — the segment right
 *     after `apps/`, else the last id-shaped path segment;
 *   - a canonical app-ROOT URL (`https://<cluster>.<domain>/<env>/<app>`) — reconstructed as
 *     `<host-first-label>-<env>-<app>`, so a user who pastes an app's address-bar URL gets the
 *     same id-driven, server-classified connect as a bare id, instead of the caller assuming
 *     cross-cluster and forcing an OAuth popup for what may be a same-cluster app.
 * Reconstruction is deliberately narrow — a dotted host with EXACTLY two path segments — so a
 * console base (`/…/studio/apps`, no trailing id) or an in-app deep link (3+ segments) still
 * yields '' and the caller probes it directly. A wrong reconstruction just fails the server probe
 * with the same masked error a typo'd id would, so it can never silently bind the wrong app.
 * Returns '' when nothing is extractable.
 */
export function extractAppId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (APP_ID_RE.test(trimmed)) return trimmed;
  if (URL_RE.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return '';
    }
    const segs = url.pathname.split('/').filter(Boolean);
    const appsIdx = segs.lastIndexOf('apps');
    if (appsIdx >= 0 && appsIdx + 1 < segs.length && APP_ID_RE.test(segs[appsIdx + 1])) {
      return segs[appsIdx + 1];
    }
    for (let i = segs.length - 1; i >= 0; i--) {
      if (APP_ID_RE.test(segs[i])) return segs[i];
    }
    // Last resort: a canonical app-ROOT url carries the whole id even with no id-shaped segment —
    // cluster is the host's first label, env/app are the two path segments. Narrow on purpose
    // (dotted host + exactly two segments) so console bases and deep links don't yield a bogus id.
    if (segs.length === 2 && url.hostname.includes('.')) {
      const candidate = `${url.hostname.split('.')[0]}-${segs[0]}-${segs[1]}`;
      if (APP_ID_RE.test(candidate)) return candidate;
    }
  }
  return '';
}

function coded(message: string, code: string): CodedError {
  const e = new Error(message) as CodedError;
  e.code = code;
  return e;
}

/** The subset of {@link RemoteConnectDeps} needed to MINT a per-user token (no session bind). */
export type UserConnectDeps = Pick<RemoteConnectDeps, 'probeRemote' | 'getRemoteOAuthUrl' | 'connectRemoteUser'>;

/**
 * Run the per-user authorization_code + PKCE redirect against `url` and store the resulting token
 * in the caller's per-user vault — WITHOUT binding it to any chat session. This is the
 * session-independent half of the flow: it establishes the user↔remote credential so a later chat
 * (allowUserToken=true) resolves `via: 'user'` with no further prompt. Used by the agent-detail
 * "Connect as me" affordance, where there is no session to bind against. Throws a {@link CodedError}
 * carrying the probe `reason` when the remote isn't self-serve-connectable.
 */
export async function connectRemoteUserApp(url: string, deps: UserConnectDeps): Promise<RemoteUserApp> {
  const probe = await deps.probeRemote(url);
  if (!probe.compatible) throw coded(probe.message, probe.reason);

  // The probe walk resolves the canonical app root even when `url` was a console / deep-link URL.
  // Thread that resolved root (not the raw input) into the redirect + exchange so both key the
  // OAuth client off the same root the admin registered — otherwise a good probe could be followed
  // by a "no client registered" failure on the deeper path.
  const target = probe.appUrl || url;
  const pkce = await generatePkce();
  const authUrl = await deps.getRemoteOAuthUrl(target, pkce.codeChallenge, pkce.codeVerifier);
  const { code, state } = await openOAuthPopup(authUrl, target);
  return deps.connectRemoteUser(target, code, state);
}

// Run the per-user redirect against `url`, then bind the resolved appId to the chat session.
async function connectViaOAuth(url: string, deps: RemoteConnectDeps): Promise<TargetAppInfo> {
  const connected = await connectRemoteUserApp(url, deps);
  // The user now holds a fresh token; bind the resolved appId so the chat can reach it.
  return deps.configureApp(connected.appId);
}

/** Options for {@link connectRemoteApp}. */
export interface ConnectRemoteAppOptions {
  /**
   * Gate for the cross-cluster per-user OAuth path (PostHog `nexus-cross-cluster-user-oauth`,
   * evaluated in the host and threaded in — this shared package cannot read the flag itself). When
   * false (the fail-closed default), a target that would require an OAuth redirect is refused with a
   * coded `oauth-disabled` error instead of opening a popup. Same-cluster and already-bound
   * (`service` / `user`) targets never reach the redirect, so they connect identically either way.
   */
  crossClusterOAuthEnabled?: boolean;
}

/** Message surfaced when a cross-cluster OAuth connect is attempted while the feature is gated off. */
const OAUTH_DISABLED_MSG = 'Cross-cluster connect is not available.';

export async function connectRemoteApp(
  input: string,
  deps: RemoteConnectDeps,
  opts: ConnectRemoteAppOptions = {}
): Promise<ConnectOutcome> {
  const oauthEnabled = opts.crossClusterOAuthEnabled === true;
  const trimmed = input.trim();
  if (!trimmed) throw coded('Enter an app id or URL.', 'empty-input');

  // A bare id, a Studio console URL (…/apps/<id>), or a canonical app-ROOT url (…/env/app) all
  // resolve to an id via extractAppId → the appId path, so the server classifies same- vs
  // cross-cluster and maps it to the real remote URL. Only a URL that yields NO id (an in-app deep
  // link, a bare host) has nothing to extract and is probed directly below.
  const extractedId = extractAppId(trimmed);
  if (!extractedId && isUrlInput(trimmed)) {
    // A raw URL with no extractable id can only be a cross-cluster OAuth target — gate it.
    if (!oauthEnabled) throw coded(OAUTH_DISABLED_MSG, 'oauth-disabled');
    return { status: 'connected', info: await connectViaOAuth(trimmed, deps) };
  }
  const appId = extractedId || trimmed;

  // appId path: try to bind directly first — an admin service token or an existing per-user token binds
  // with no redirect ("already configured → just work"), and admin precedence is preserved server-side.
  const info = await deps.configureApp(appId);
  if (info?.via === 'needs-remote-auth') {
    if (info.needsAdmin) {
      throw coded('This app needs a cross-cluster connection. Ask an administrator to configure it.', 'needs-admin');
    }
    if (!info.appUrl) {
      throw coded('This app needs a cross-cluster connection, but no URL is available to start it.', 'no-url');
    }
    // Self-serve OAuth would run here — gate it once the target-level checks above have passed, so a
    // genuine needs-admin / no-url still reports its specific reason regardless of the flag.
    if (!oauthEnabled) throw coded(OAUTH_DISABLED_MSG, 'oauth-disabled');
    return { status: 'connected', info: await connectViaOAuth(info.appUrl, deps) };
  }
  return { status: 'bound', info };
}
