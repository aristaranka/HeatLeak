/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// Browser-side OAuth (PKCE) helpers for external MCP connections. PKCE is computed here with Web
// Crypto — the backend has no SHA-256 primitive, so the S256 challenge is generated client-side
// and handed to Nexus.Mcp.ConnectionApi.getOAuthUrl, while the verifier is stored server-side for
// the code exchange. The popup posts the redirect's `?code=` back to this window (see the
// callback handler wired in main.tsx).

import { getNexusBase } from './nexusBase';
import { deriveGatewayMount } from './gatewayBase';

function base64UrlEncode(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let str = '';
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type PkcePair = { codeVerifier: string; codeChallenge: string };

// Generate a PKCE verifier (random) + S256 challenge.
export async function generatePkce(): Promise<PkcePair> {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const codeVerifier = base64UrlEncode(random.buffer);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  return { codeVerifier, codeChallenge: base64UrlEncode(digest) };
}

// The redirect URI the OAuth provider sends the user back to — the app root, where main.tsx's
// pre-render handler posts the code back to the opener and closes the popup.
export function oauthRedirectUri(): string {
  // Redirect to the app's index.html FILE explicitly — NOT a deep /oauth-callback path, and not the
  // bare dir. C3 UiService can't serve a directory route carrying a query string: it 302s
  // `<dir>?code=…&state=…` to `…&state=…/index.html` (appending after the query), which loops
  // (ERR_TOO_MANY_REDIRECTS) — this happens for `/oauth-callback?…` AND the bare app root `…/?…`.
  // Targeting `index.html` (a real file) is served straight (HTTP 200) with the query intact;
  // main.tsx picks up `?code=` before the router mounts and posts it to the opener (c3agents pattern).
  // An embed configures the Nexus mount — send the popup back to the NEXUS index.html (whose
  // main.tsx posts the code to window.opener; same-origin, so the opener handshake still works)
  // instead of the consumer app's shell, which has no callback handler. Bonus: providers only
  // ever need the Nexus mount registered as a redirect URI, host and embeds alike.
  //
  // No configured mount → derive it from the served page path the same way the request bases do
  // (see deriveGatewayMount): the app mount `/<env>/<app>` for a gateway-served page (built deploy
  // OR C3 Code dev behind the gateway), or '' for a bare-localhost dev server whose index.html is
  // at the origin root. Keying on the host — not `import.meta.env.DEV` — is what makes the C3 Code
  // redirect land on the real mount instead of the domain-root index.html.
  const configured = getNexusBase();
  const base = configured || deriveGatewayMount();
  return `${window.location.origin}${base}/index.html`;
}

// Open a centered popup at `authUrl` and resolve with the authorization code + CSRF state once the
// callback posts them back. Rejects on user-close or timeout (5 min).
export function openOAuthPopup(authUrl: string, connectionKey: string): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const w = 600;
    const h = 720;
    const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
    const popup = window.open(authUrl, `oauth-${connectionKey}`, `width=${w},height=${h},left=${left},top=${top}`);
    if (!popup) {
      reject(new Error('Popup blocked — allow popups for this site and retry.'));
      return;
    }

    let settled = false;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
      clearTimeout(timer);
    };
    const onMessage = (ev: MessageEvent) => {
      // Same-origin AND from this popup specifically — otherwise any same-origin tab/frame could
      // inject a forged code. (The popup's window ref stays stable across the cross-origin OAuth hop.)
      if (ev.origin !== window.location.origin || ev.source !== popup) return;
      const data = ev.data as { type?: string; code?: string; error?: string; state?: string } | null;
      if (!data || data.type !== 'mcp_oauth_callback') return;
      settled = true;
      cleanup();
      try {
        popup.close();
      } catch {
        /* ignore */
      }
      if (data.code) resolve({ code: data.code, state: data.state || '' });
      else reject(new Error(data.error || 'OAuth was cancelled.'));
    };
    window.addEventListener('message', onMessage);

    const poll = setInterval(() => {
      if (popup.closed && !settled) {
        cleanup();
        reject(new Error('OAuth window closed before completing.'));
      }
    }, 500);

    const timer = setTimeout(
      () => {
        if (!settled) {
          cleanup();
          try {
            popup.close();
          } catch {
            /* ignore */
          }
          reject(new Error('OAuth timed out.'));
        }
      },
      5 * 60 * 1000
    );
  });
}
