/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Discover the Nexus app mount for same-origin embeds via the consumer app's
 * `Microservice.Config.forName('Nexus')`.
 *
 * The mount is always a **root-relative pathname on the CURRENT origin**: we keep only the path
 * segments of the published value and resolve them against `window.location`, never against a
 * canonical Nexus host. That is what makes a vanity host work — the customer serves the consumer
 * app (and its Nexus mount) on their own domain, so the mount lands same-origin (no CORS, and the
 * browser's `c3auth` cookie is preserved because every call stays on the page's own origin).
 *
 * The **recommended** published value is `serviceAppId` (`<cluster>-<env>-<app>`): host-free, so
 * it is vanity-native by construction — its `/<env>/<app>` segments become the mount. `serviceAppUrl`
 * (an absolute canonical URL) is still handled for existing publishers: its host is discarded and
 * never trusted, only its pathname is kept. `serviceAppId` wins when both are present.
 *
 * **Multi-studio clusters:** when `Microservice.Config.forName("Studio").appId` resolves to a
 * studio app id, discovery tries `Microservice.Config.forName("Nexus.<studioId>")` BEFORE the
 * cluster-wide `"Nexus"` record. This lets each Studio on a shared cluster publish its own Nexus
 * mount without interfering with others. The cluster-wide `"Nexus"` record is the fallback when
 * no studio config is present or the studio-scoped config is empty.
 *
 * Discovery reads the EFFECTIVE `Microservice.Config` for the consumer app, so the publish scope
 * matters only on the write side. The default is a single `ConfigOverride.CLUSTER` publish made when
 * Nexus is deployed — cluster admin writes it once, and every consumer app on the cluster then reads
 * it with no per-app setup. A consumer publishes its own `ConfigOverride.APP` value (or passes
 * `nexusBase`) only to override: when the cluster record is missing or points at a different Nexus.
 * ENV scope is not a shortcut (v8 config stores are per-app even at ENV). See the embed-agentix-chat
 * skill.
 */

import { deriveGatewayBase } from './gatewayBase';

/**
 * This page's own control-plane base — never the configured Nexus mount. Discovery runs BEFORE any
 * mount is configured, so it derives the base from the served page path (see {@link deriveGatewayBase}):
 * a gateway-served page (built deploy or C3 Code dev behind the gateway) yields `/<env>/<app>/api/8`;
 * only a bare-localhost dev server yields the flat proxied `/api/8`.
 */
export function ownApiBase(): string {
  return deriveGatewayBase('api/8');
}

/** Canonical C3 app id shape `<cluster>-<env>-<app>` — three `-`-joined segments, none of which may
 *  themselves contain a `-` (the platform forbids it, else the id would be ambiguous). Mirrors the
 *  server's `NexusBase.Utils.isAppId` regex so we only ever forward an already-canonical id. */
const APP_ID_RE = /^[a-zA-Z0-9.]+-[a-zA-Z0-9.]+-[a-zA-Z0-9.]+$/;

/**
 * This embedding app's authoritative canonical `<cluster>-<env>-<app>` id, read from ITS OWN origin
 * via `App.inst().id` — the same ground truth the server uses (`GET /api/8/App?action=inst`). Sent
 * on session-create so Nexus can attribute a chat opened here as `embedded`.
 *
 * Read from the app's own control-plane, NOT parsed from `window.location`: a vanity host serves the
 * consumer app at root (no `/<env>/<app>/` prefix) so path-parsing would yield a wrong/empty id,
 * whereas the own-origin API answers correctly on any host shape (the consumer app is always served
 * on its own origin — only the Nexus mount may be missing). Returns null on dev or any failure
 * (unreachable, non-200, malformed id) — the caller then sends no source app and the chat is
 * stamped `direct` (fail-closed: a wrong label is worse than the safe default).
 */
export async function resolveOwnAppId(): Promise<string | null> {
  if (import.meta.env.DEV) return null;
  try {
    const res = await fetch(`${ownApiBase()}/App?action=inst`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const payload: unknown = await res.json().catch(() => null);
    const id = payload && typeof payload === 'object' ? (payload as { id?: unknown }).id : null;
    return typeof id === 'string' && APP_ID_RE.test(id.trim()) ? id.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Turn a published `serviceAppUrl` into a same-origin mount pathname (`/<env>/<app>`).
 *
 * Only the PATHNAME is kept — a host in the published value is discarded, not matched against the
 * page host. The mount always resolves against the current `window.location` origin, so a
 * canonical-host `serviceAppUrl` published for a vanity deployment still yields a same-origin
 * mount. This is safe because we never construct a cross-origin URL from the value: the c3auth
 * exchange and every control-plane call stay on the page's own origin regardless of what host the
 * published URL names. Returns null when empty or unparseable, or when the value reduces to the
 * bare origin root (no mount to plant a cookie on).
 *
 * A leading `//` is NOT a root-relative path — `new URL()` reads it as a scheme-relative authority.
 * Only a SINGLE leading slash takes the path shortcut; a scheme-relative value falls through to the
 * parse below, where it fails to parse without a base and is rejected. No legitimate publisher
 * emits one (the deploy recipe writes an absolute URL, a host prop writes a single-slash path), so
 * failing closed on it costs nothing.
 */
export function pathnameFromServiceAppUrl(serviceAppUrl: string): string | null {
  const trimmed = (serviceAppUrl ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    const path = trimmed.replace(/\/+$/, '');
    return path || null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  return pathname || null;
}

/**
 * Derive a same-origin mount pathname (`/<env>/<app>`) from a canonical `<cluster>-<env>-<app>`
 * app id. The cluster segment is dropped: like {@link pathnameFromServiceAppUrl}, the mount is
 * resolved against the current origin, so only the env/app path segments matter. Returns null for
 * a non-canonical id (guarded by {@link APP_ID_RE}, which forbids a `-` inside any segment, so the
 * `-`-split yields exactly three parts).
 */
export function pathnameFromServiceAppId(serviceAppId: string): string | null {
  const trimmed = (serviceAppId ?? '').trim();
  if (!APP_ID_RE.test(trimmed)) return null;
  const [, env, app] = trimmed.split('-');
  return `/${env}/${app}`;
}

function readServiceAppUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = (payload as { serviceAppUrl?: unknown }).serviceAppUrl;
  return typeof raw === 'string' ? raw : null;
}

function readServiceAppId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = (payload as { serviceAppId?: unknown }).serviceAppId;
  return typeof raw === 'string' ? raw : null;
}

/**
 * Resolve the studio id via `Microservice.Config.forName("Studio").appId`.
 * Returns null on any failure (missing config, non-200, non-JSON, fetch error) — the caller
 * falls back to the cluster-wide `"Nexus"` config.
 */
export async function resolveStudioId(): Promise<string | null> {
  try {
    const res = await fetch(`${ownApiBase()}/Microservice.Config/forName`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Studio' }),
    });
    if (!res.ok) return null;
    const payload: unknown = await res.json().catch(() => null);
    if (!payload || typeof payload !== 'object') return null;
    const appId = (payload as { appId?: unknown }).appId;
    return typeof appId === 'string' && appId.trim() ? appId.trim() : null;
  } catch {
    return null;
  }
}

/** Try reading a Nexus mount from the config record named `configName`. Returns null on any failure. */
async function tryConfigForName(configName: string): Promise<string | null> {
  const endpoint = `${ownApiBase()}/Microservice.Config/forName`;
  const res = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: configName }),
  });
  if (!res.ok) return null;
  const payload: unknown = await res.json().catch(() => null);
  const serviceAppId = readServiceAppId(payload);
  const serviceAppUrl = readServiceAppUrl(payload);
  if (!serviceAppId && !serviceAppUrl) return null;
  return (
    (serviceAppId && pathnameFromServiceAppId(serviceAppId)) ||
    (serviceAppUrl && pathnameFromServiceAppUrl(serviceAppUrl)) ||
    null
  );
}

/**
 * Resolve the Nexus mount pathname from the consumer app's Microservice.Config.
 *
 * Resolution chain (first non-null wins):
 *   1. `Microservice.Config("Nexus.<studioId>")` — studio-scoped, when `Microservice.Config("Studio").appId` resolves
 *   2. `Microservice.Config("Nexus")` — cluster-wide fallback
 *
 * Returns null (with a console warning) when the config is missing, unreadable, or wrong-origin.
 */
export async function resolveNexusMountPath(): Promise<string | null> {
  try {
    // Studio-scoped resolution: try Nexus.<studioId> first when a studio tag is present.
    const studioId = await resolveStudioId();
    if (studioId) {
      const studioMount = await tryConfigForName(`Nexus.${studioId}`);
      if (studioMount) return studioMount;
    }

    // Cluster-wide fallback.
    const clusterMount = await tryConfigForName('Nexus');
    if (clusterMount) return clusterMount;

    console.warn(
      '[resolveNexusMount] no Nexus mount discovered — ' +
        'publish Nexus serviceAppId in Microservice.Config (a CLUSTER-scope record at deploy, or an APP override on this app), or pass nexusBase'
    );
    return null;
  } catch (err) {
    console.warn('[resolveNexusMount] discovery request failed', err);
    return null;
  }
}
