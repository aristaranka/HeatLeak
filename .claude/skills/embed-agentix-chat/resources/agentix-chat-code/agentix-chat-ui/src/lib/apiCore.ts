/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Transport core for the Nexus chat client: request-base derivation + the low-level `c3call` /
 * `restCall` plumbing every higher-level API function is built on. It reads the configured mount
 * through {@link getNexusBase} (the single embed seam) and issues cookie-authenticated fetches via
 * {@link authFetch}. Kept as its own package-owned module so both the chat surface (this package)
 * and the host admin surface (`nexus/react/src/lib/api.ts`) depend on ONE copy — the host imports
 * these back from here, so there is a single request path and a single configured-mount realm.
 */

import { getNexusBase } from './nexusBase';
import { authFetch } from './sessionExpiry';
import { deriveGatewayBase } from './gatewayBase';

function computeApiBase(): string {
  // An embedding app configures the Nexus mount explicitly — honor it before any derivation.
  const configured = getNexusBase();
  if (configured) return `${configured}/api/8`;
  // Otherwise derive from the served page path (see deriveGatewayBase): gateway-served pages
  // (built deploy or C3 Code dev behind the gateway) → `/<env>/<app>/api/8`; a bare-localhost dev
  // server → the flat proxied `/api/8`.
  return deriveGatewayBase('api/8');
}

/** Control-plane base (`/<env>/<app>/api/8`), honoring a configured Nexus mount at call time. */
export function apiBase(): string {
  return computeApiBase();
}

/**
 * Strip server stack traces / internal source locations from an error message
 * before it can reach the DOM. The C3 server can return messages that trail a JS
 * stack or embed file references like `…/Nexus.Agent.Service.js#2921` — leaking
 * internal paths into the browser. We keep the first line (the human-readable
 * reason the server intended) and drop `*.js#NN` / `*.js:NN` location tokens.
 * Message PROSE is preserved so callers that classify on it (e.g. ChatPage's
 * "Session is not stopped" check) keep working. Full detail still goes to the
 * console for developers.
 */
export function sanitizeErrorMessage(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return '';
  let s = raw.split('\n')[0].trim();
  // Unwrap the C3 server invocation envelope so the human-readable reason surfaces instead of
  // the whole "Error calling /api/8/<Type>/<method> with {…huge args, incl. tokens…}, error
  // Error invoking JavaScript method <Type>#<method> executing in runtime <rt> on server:
  // Error: <reason>" string. Keep only <reason>.
  if (/^Error calling \/api\//.test(s) || /Error invoking (?:JavaScript|Java) method/.test(s)) {
    const marker = ' on server: ';
    const idx = s.lastIndexOf(marker);
    if (idx >= 0) {
      s = s.slice(idx + marker.length);
    } else {
      const e = s.indexOf(', error ');
      if (e >= 0) s = s.slice(e + ', error '.length);
    }
    // Drop a leading "Error: " and a trailing wrapper quote.
    s = s
      .replace(/^Error:\s*/, '')
      .replace(/["']\s*$/, '')
      .trim();
  }
  return s
    .replace(/\(?[^\s()]*\.js[#:]\d+\)?/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Args can carry live credentials (apiKey, staticToken, authCode, codeVerifier, …). c3call logs
// args on failure, so redact secret-bearing keys first — a failed setApiKey/upsert/connect must
// never write a usable credential to the browser console (or any client log-capture).
const _SECRET_KEY_RE = /(apikey|token|secret|password|authcode|codeverifier|code_verifier)/i;
function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = _SECRET_KEY_RE.test(k) && v != null && v !== '' ? '[redacted]' : v;
  }
  return out;
}

/**
 * Generic C3 type/method POST. Exported so domain-specific API modules
 * (e.g. skillsApi.ts) can reuse the same auth + error-handling path.
 */
export async function c3call(
  type: string,
  method: string,
  args: Record<string, unknown> = {},
  opts: { signal?: AbortSignal } = {}
): Promise<unknown> {
  const endpoint = `${apiBase()}/${type}/${method}`;
  const res = await authFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    credentials: 'include',
    signal: opts.signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error('[SA] action FAILED', {
      type,
      method,
      endpoint,
      args: redactArgs(args),
      status: res.status,
      error: body.message,
      cause: body.cause,
      full: body,
    });
    const err = new Error(sanitizeErrorMessage(body.message) || `${type}/${method} failed: ${res.status}`);
    // Carry the HTTP status so callers can branch on it (e.g. 403 → non-retryable auth failure)
    // instead of string-matching the sanitized message.
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const text = await res.text();
  if (!text) return undefined;
  const json = JSON.parse(text);
  return json.value !== undefined ? json.value : json;
}

/**
 * Bound a single read to `timeoutMs` and retry it `retries` more times when an attempt exceeds that.
 * Each attempt gets its own AbortController: on timeout the in-flight request is cancelled (so a hung
 * server-side call — e.g. a slow registry fetch behind an action — is not left dangling) and a fresh
 * one is issued. Only a timeout is retryable; a real rejection (HTTP 403/500, parse error) surfaces
 * immediately with no retry, so genuine failures are not masked. `fn` must forward the signal to its
 * underlying fetch for the cancel to take effect. Defaults: 25s per attempt, one retry.
 */
export async function withTimeoutRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts: { timeoutMs?: number; retries?: number } = {}
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 25_000;
  const retries = opts.retries ?? 1;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      return await fn(controller.signal);
    } catch (err) {
      // A non-timeout error (real 403/500, parse failure) is not retryable — surface it at once.
      if (!timedOut) throw err;
      lastErr = new Error(`request timed out after ${timeoutMs}ms`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** Base for the versioned REST surface (`Nexus.Agent.SessionApi`, mounted at `/agent-api/v1`).
 *  Mirrors {@link computeApiBase} but swaps the platform `api/8` action root for the `agent-api/v1`
 *  REST root on the same app gateway origin (so the C3 cookie still authenticates the request). */
function computeRestBase(): string {
  const configured = getNexusBase();
  if (configured) return `${configured}/agent-api/v1`;
  // Same derivation as computeApiBase, swapping the REST root for the action root (see
  // deriveGatewayBase): gateway-served → `/<env>/<app>/agent-api/v1`; bare-localhost → flat.
  return deriveGatewayBase('agent-api/v1');
}

/** REST base, honoring a configured Nexus mount at call time (see {@link apiBase}). */
function restBase(): string {
  return computeRestBase();
}

/**
 * Call the versioned REST surface (`/agent-api/v1/...`). Differs from {@link c3call} in two ways
 * the REST contract requires: responses are plain JSON (no `{value: ...}` boxing to unwrap), and
 * status codes carry meaning (`202` on create, `410 Gone` on a removed session). Returns the
 * parsed body plus the status so a caller can opt a specific code out of the throw via
 * `okStatuses` (e.g. treat `410` as an idempotent no-op). Same `credentials: 'include'` cookie
 * auth as {@link c3call}; path params must be pre-encoded by the caller.
 */
export async function restCall(
  method: 'GET' | 'POST' | 'DELETE',
  subpath: string,
  opts: { body?: unknown; okStatuses?: number[] } = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  const endpoint = `${restBase()}${subpath}`;
  const init: RequestInit = { method, credentials: 'include' };
  if (opts.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(opts.body);
  }
  const res = await authFetch(endpoint, init);
  const text = await res.text();
  let body: Record<string, unknown> = {};
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
    } catch {
      /* non-JSON body (e.g. an HTML error page) — leave body empty, fall to the status message */
    }
  }
  if (!res.ok && !opts.okStatuses?.includes(res.status)) {
    console.error('[SA] REST FAILED', { method, subpath, endpoint, status: res.status, body });
    throw new Error(sanitizeErrorMessage(body.message) || `${subpath} failed: ${res.status}`);
  }
  return { status: res.status, body };
}

/** Parse a value that the C3 Rhino boundary may hand back as a JSON string or an already-parsed
 *  object. Shared by both the chat surface and the host admin surface. */
export function _parse<T>(raw: unknown): T {
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as T;
}

/** Normalize a C3 collection return (array, or an index-keyed object `{0:…,1:…}`) to a real array. */
export function coerceArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (!v || typeof v !== 'object') return [];
  const keys = Object.keys(v as Record<string, unknown>).filter((k) => /^\d+$/.test(k));
  if (keys.length === 0) return [];
  keys.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  return keys.map((k) => (v as Record<string, unknown>)[k] as T);
}

/** Unwrap a C3 `{objs:[…]}` collection envelope, falling back to {@link coerceArray}. */
export function unwrapCollection<T>(raw: unknown): T[] {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const objs = (raw as { objs?: unknown }).objs;
    if (Array.isArray(objs)) return objs as T[];
  }
  return coerceArray<T>(raw);
}
