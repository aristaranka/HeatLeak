/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Optional override for where the chat API slice points its Nexus bases.
 *
 * When null (host / `InClusterTransport({ local: true })`), the slice derives `/<env>/<app>` from
 * `window.location`. Embeds set a configured base via Microservice discovery
 * (`resolveNexusMountPath`) or an explicit `InClusterTransport({ baseUrl })` / `nexusBase` prop so
 * every control-plane call (`<base>/api/8/...`, `<base>/agent-api/v1/...`) targets Nexus.
 * Pod-plane URLs (`agentBaseUrl`) are already root-relative to the Nexus mount.
 *
 * Same-origin paths only: the value is a root-relative path on the current host, authenticated by
 * the browser's Nexus-path `c3auth` cookie (see the cookie bootstrap helper in the client package).
 *
 * **One mount per document.** This base is a single module-global, written by every
 * `InClusterTransport` constructor and read lazily at call time by the API slice, so it is a
 * document-wide setting rather than per-transport state. Mounting two live transports with
 * different bases in one document (two embeds, or a host chat plus an embed) is unsupported: the
 * last constructor to run wins and BOTH surfaces' control-plane, REST, and MCP-mint calls then
 * target that one mount. Making the base per-instance means threading it through every API call
 * site — deferred to the client-package extraction work, not worked around here. What IS here is
 * a tripwire: {@link configureNexusBase} warns when one non-null base is replaced by a DIFFERENT
 * one, so the unsupported two-mount case announces itself instead of silently retargeting.
 */

let configuredBase: string | null = null;

/** Point the chat API slice at a Nexus app mount, e.g. `/plat-env/nexus`. Trailing slash
 *  ignored. Pass null to clear (host derivation applies again — used by tests). */
export function configureNexusBase(base: string | null): void {
  const next = base === null ? null : base.replace(/\/+$/, '');
  // Tripwire for the unsupported case: two live mounts naming DIFFERENT bases. Re-configuring the
  // same value is expected and silent (React legitimately re-runs a `useMemo` constructor), and so
  // is a transition to/from null, which is the documented clear/host-derivation switch.
  if (configuredBase !== null && next !== null && next !== configuredBase) {
    console.warn(
      `[nexusBase] Nexus mount reconfigured from ${configuredBase} to ${next}. This base is ` +
        'document-wide, so every chat surface in this document now targets the new mount — one ' +
        'mount per document is what is supported.'
    );
  }
  configuredBase = next;
}

/** The configured Nexus mount, or null when running as the host app (derive from location). */
export function getNexusBase(): string | null {
  return configuredBase;
}

/**
 * Source-app identity for admin session-origin attribution (paired with the mount above).
 *
 * An **embed** ({@link InClusterTransport} `{ baseUrl }`) registers a resolver that reads the
 * embedding app's own canonical `<cluster>-<env>-<app>` from its own origin (`App.inst().id`), so
 * the create-session call can tell Nexus the chat was opened from a connected app — Nexus stamps
 * `originKind = embedded` + that id. The **host** (`{ local: true }`) clears it, so the create call
 * names no source app and the chat is stamped `direct`.
 *
 * The resolver is async (an own-origin fetch), so we cache the in-flight promise at configure time
 * and `addSession` awaits it lazily at call time — one fetch per mount, resolved well before the
 * user opens a chat. Like {@link configureNexusBase} this is a single document-wide module-global
 * (one mount per document). A failed/absent resolver yields null → no attribution → `direct`.
 */
let sourceAppPromise: Promise<string | null> | null = null;

/** Register (embed) or clear (host / tests) the async source-app resolver. Called once at mount;
 *  the resolver runs immediately and its (cached) result is awaited later by `addSession`. */
export function configureSourceApp(resolver: (() => Promise<string | null>) | null): void {
  sourceAppPromise = resolver
    ? Promise.resolve()
        .then(resolver)
        .catch(() => null)
    : null;
}

/** The resolved source-app id, or null when host / unresolved (no embed attribution to send). */
export function getSourceApp(): Promise<string | null> {
  return sourceAppPromise ?? Promise.resolve(null);
}

// The embed's endpoint identifier (`routeKey`). Unlike `sourceApp` (resolved from the embedding
// app's own origin), this is a static value the embedding app DECLARES via the NexusChatEmbed
// `routeKey` prop — it names WHICH chat surface this is (e.g. "support", "sales") so the server can
// resolve an admin-configured (appId, routeKey) -> agent route at chat creation. Null on the host
// and on an embed that names no surface (no routing → client agent). Like `configuredBase` above,
// this is a single DOCUMENT-WIDE global: the embed is one-mount-per-document (see NexusChatEmbed's
// routeKey doc), so it is not meant to carry two different keys for two simultaneous mounts.
let embedRouteKey: string | null = null;

/**
 * Register (embed) or clear (host / tests) the endpoint route key for this mount. Trims; empty /
 * whitespace / null all clear to null (no routing). Warns on a conflicting-key overwrite — the
 * unsupported two-surfaces-on-one-mount case where the base tripwire ({@link configureNexusBase})
 * can't fire because the base is identical; a same-value re-register (React re-running an effect)
 * and a transition to/from null are expected and silent.
 */
export function setEmbedRouteKey(routeKey: string | null): void {
  const trimmed = (routeKey || '').trim();
  const next = trimmed || null;
  if (embedRouteKey !== null && next !== null && next !== embedRouteKey) {
    console.warn(
      `[nexusBase] Embed routeKey reconfigured from "${embedRouteKey}" to "${next}". This key is ` +
        'document-wide, so a chat created in this document now resolves the new route — mounting two ' +
        'NexusChatEmbeds with different routeKeys on one page is not supported (render distinct ' +
        'surfaces on separate pages/routes).'
    );
  }
  embedRouteKey = next;
}

/** The declared endpoint route key, or null when none — appended to createSession by addSession. */
export function getEmbedRouteKey(): string | null {
  return embedRouteKey;
}

/**
 * Dev-time opt-in: restrict the embedded chat's session sidebar to only sessions whose
 * {@link Nexus.Agent.Session#originAppId} matches the current embedding app. Off by default —
 * today's unfiltered (but still self-owned-only) behavior is unchanged unless an embedding app's
 * developer sets `filterHistoryByOrigin` on the {@link NexusChatEmbed} mount or
 * {@link InClusterTransport} constructor.
 *
 * This is a fixed mount-time setting (not a per-call or user-facing toggle): the embedding app
 * decides once at integration time whether its widget shows only its own app's chat history. Like
 * {@link configureNexusBase} and {@link configureSourceApp}, this is a single document-wide
 * module-global (one mount per document).
 */
let filterHistoryByOrigin = false;

/** Set (embed) or clear (host / tests) the per-app history filter flag. Called once at mount. */
export function configureFilterHistoryByOrigin(enabled: boolean): void {
  filterHistoryByOrigin = enabled;
}

/** Whether listSessionsForService should restrict results to the current embedding app's sessions. */
export function isFilterHistoryByOriginEnabled(): boolean {
  return filterHistoryByOrigin;
}
