/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useEffect, useMemo, useState } from 'react';
import { ensureNexusChatI18nDefaults } from './lib/i18nDefaults';
import { setEmbedRouteKey } from './lib/nexusBase';
import { silentNexusCookieBootstrap, hasNexusCookie } from './lib/nexusCookieBootstrap';
import { pathnameFromServiceAppUrl, resolveNexusMountPath } from './lib/resolveNexusMount';
import { clearSessionExpired, isSessionExpired, subscribeSessionExpiry } from './lib/sessionExpiry';
import { SessionProvider } from './lib/sessionProvisioning';
// Relative imports: host Vite `@/` resolves host-first and has no ChatPage / InClusterTransport.
import ChatPage from './pages/ChatPage';
// Self-contained, precompiled stylesheet (generated from styles/embed.source.css). Gives the embed
// the host's exact look — Geist fonts, semantic tokens, dark mode, every utility the chat subtree
// uses — with zero Tailwind setup in the consumer. Preflight is omitted and the page-level resets are
// scoped under `.nexus-chat-embed` (the wrapper below), so importing it never restyles the host page.
import './styles/embed.css';
import { InClusterTransport } from './transports/InClusterTransport';

/**
 * Why the embed is unavailable, shown as a one-line hint under the "Agentix is unavailable." message
 * so an integrator isn't left guessing (the full technical detail still goes to `console.warn`).
 * User-facing copy uses the product brand "Agentix"; the internal codename "Nexus" stays only in
 * code identifiers (`nexusBase`, `serviceAppId`, `Microservice.Config`). `no-mount`: discovery found
 * no serviceAppId/serviceAppUrl. `bad-base`: the `nexusBase` prop did not reduce to a same-origin
 * path. `auth-failed`: the mount resolved but the silent c3auth exchange did not complete.
 */
type UnavailableReason = 'no-mount' | 'bad-base' | 'auth-failed';

const UNAVAILABLE_REASON_TEXT: Record<UnavailableReason, string> = {
  'no-mount':
    'No Agentix mount is configured for this app — publish serviceAppId in its Microservice.Config, or pass nexusBase.',
  'bad-base': 'The nexusBase value could not be reduced to a same-origin mount path.',
  'auth-failed': 'Could not establish an Agentix session on this origin — the page session may have expired.',
};

/**
 * Drop-in Nexus chat for any same-host app page — use it like any other component; it rides the
 * page's existing sign-in. The one-time Nexus-path cookie exchange happens silently inside
 * (see `lib/nexusCookieBootstrap.ts`), so consumers never see or handle auth. Renders the same
 * ChatPage cluster the Nexus host uses, driven by an InClusterTransport pointed at the Nexus mount.
 *
 * ```tsx
 * <NexusChatEmbed agentDefId="C3Agent" />                            // discover via Microservice.Config serviceAppId
 * <NexusChatEmbed agentDefId="C3Agent" nexusBase="/myenv/nexus" />   // or named explicitly
 * ```
 *
 * Host-page requirements (normal app chrome, not auth): a react-router Router and a
 * `QueryClientProvider` above this component — every C3 React app shell already has both.
 * Mount it at route path `/chat`: ChatPage's internal navigation targets `/chat#<sessionId>`,
 * so any other route path breaks session switching. There is **no server-side integration**: the
 * silent cookie exchange mints via the platform's self-scoped `User.mySessionToken`, so the
 * consumer needs no C3 package dependency, no custom type, and no role grant. The Nexus mount is
 * discovered from `Microservice.Config` — on multi-studio clusters (`Env.tags.c3__studio` set),
 * the studio-scoped `'Nexus.<studioId>'` record is tried before the cluster-wide `'Nexus'`;
 * normally one CLUSTER-scope record published when Nexus is deployed serves every consumer app
 * on the cluster; a consumer sets its own APP-scope value (or passes `nexusBase`) only to
 * override. See the embed-agentix-chat skill.
 */
export interface NexusChatEmbedProps {
  /**
   * Nexus mount path (`/<env>/<nexusApp>`) on the CURRENT origin. When omitted, discovered via
   * Microservice.Config (studio-scoped `'Nexus.<studioId>'` first, then cluster-wide `'Nexus'`).
   * Reduced exactly like a discovered value: only the pathname is kept and
   * resolved same-origin (any host in an absolute value is discarded, never trusted), so the
   * minted-token exchange always stays on the page's own origin. A scheme-relative `//host/path`
   * or an otherwise unparseable value renders unavailable.
   *
   * This is a **path selector, not a host selector**: an absolute value's host is discarded, so you
   * cannot point the embed at a different origin with it — `https://other.example/myenv/nexus` calls
   * `/myenv/nexus` on THIS page's origin, never `other.example`. Reaching a Nexus on a different host
   * is a cross-origin concern this same-origin embed does not handle.
   */
  nexusBase?: string;
  /**
   * Agent definition id new chats are started with. **Required** — the embedding app configures
   * which agent to chat with; the package carries no default.
   */
  agentDefId: string;
  /**
   * When true, render the in-chat agent switcher so users can start chats with a different agent.
   * Defaults false: every new chat is pinned to {@link agentDefId} and no switcher renders.
   */
  allowAgentSwitch?: boolean;
  /**
   * When true (default), show the workspace surface (header toggle + side panel). Optional
   * pass-through so a future embed can drop it; defaults to ChatPage's default (on).
   */
  workspaceEnabled?: boolean;
  /**
   * When true, expose the add/connect-apps UI. Defaults false — the embed hides the connect
   * affordance. Optional pass-through so a future embed can flip it on.
   */
  connectAppsEnabled?: boolean;
  /**
   * When true, enable the cross-cluster per-user OAuth connect path. Defaults false — the embed has
   * no PostHog, so it fails closed unless a host explicitly opts in. Optional pass-through.
   */
  crossClusterOAuthEnabled?: boolean;
  /**
   * When true (default), show the composer effort + model pickers. Optional pass-through so a
   * future embed can hide them; defaults to ChatPage's default (on).
   */
  modelControlsEnabled?: boolean;
  /**
   * When true (default), render the left chat-sessions sidebar. Optional pass-through so a future
   * embed can drop it; defaults to ChatPage's default (on).
   */
  sessionSidebarEnabled?: boolean;
  /**
   * When true, render in-chat MCP app surfaces (live app-server + `ui://` resource apps). Defaults
   * false — the Nexus host gates this on the `nexus-mcp-apps` flag; an embed has no flag path, so it
   * opts in explicitly. Pass-through to ChatPage's own `mcpAppsEnabled`.
   */
  mcpAppsEnabled?: boolean;
  /**
   * The endpoint identifier for THIS chat surface (e.g. `"support"`, `"sales"`). Paired with the
   * embedding app's own id, it lets an Agentix admin route this surface to a chosen agent (an
   * `(appId, routeKey) -> agent` route resolved at chat creation) without the app changing code.
   * Omitted → no routing (new chats use {@link agentDefId}). Fail-open: an unmatched key just falls
   * back to {@link agentDefId}. See the Routes management page and `Nexus.Agent.Route#resolve`.
   *
   * **One mount per document.** Like {@link nexusBase} (see `lib/nexusBase.ts` — the Nexus mount is a
   * single document-wide global with a conflicting-base tripwire), `routeKey` is registered
   * document-wide, so mounting two `NexusChatEmbed`s with DIFFERENT keys on the same page is not
   * supported — the embed targets exactly one Nexus mount per document. A host that needs multiple
   * distinct chat surfaces should render them on separate pages/routes (each its own document-scoped
   * mount), not side by side.
   */
  routeKey?: string;
  /**
   * When true, restrict the session sidebar to only show chat sessions whose
   * {@link Nexus.Agent.Session#originAppId} matches this embedding app's canonical id. Off by
   * default — today's unfiltered (but still self-owned-only) behavior is unchanged. This is a
   * dev-time integration setting, not a runtime feature: set it once when mounting NexusChatEmbed
   * and there is no end-user UI control. Sessions created before origin stamping (AGX-2131) and
   * sessions from other apps or the direct Nexus UI are excluded when enabled.
   */
  filterHistoryByOrigin?: boolean;
}

export default function NexusChatEmbed({
  nexusBase,
  agentDefId,
  allowAgentSwitch,
  // Embed defaults, made explicit so the embed's surface is clear at a glance: workspace on,
  // connect-apps off, model controls on, session sidebar on. Each stays an optional pass-through
  // so a future embed can flip any of them.
  workspaceEnabled = true,
  connectAppsEnabled = false,
  crossClusterOAuthEnabled = false,
  modelControlsEnabled = true,
  sessionSidebarEnabled = true,
  mcpAppsEnabled = false,
  routeKey,
  filterHistoryByOrigin = false,
}: NexusChatEmbedProps) {
  // Register the bundled English defaults once, at mount (before the first ChatPage paint), so the
  // embed shows real text even if the host app wired no i18n or left these namespaces empty. Runs
  // after the consumer's own i18n init, so any string they provide still wins.
  useState(() => {
    void ensureNexusChatI18nDefaults();
    return null;
  });
  // Register this mount's endpoint route key so addSession appends it to createSession (mirrors how
  // the transport registers sourceApp). Runs on mount before any user-triggered chat creation;
  // cleared on unmount so a later host mount doesn't inherit it.
  useEffect(() => {
    setEmbedRouteKey(routeKey ?? null);
    return () => setEmbedRouteKey(null);
  }, [routeKey]);
  // Same pathname reduction as the discovery path: a caller-supplied value is reduced to its
  // path on the current origin, so the minted `c3auth` token is always POSTed same-origin.
  const requestedBase = useMemo(
    () => (nexusBase === undefined ? undefined : pathnameFromServiceAppUrl(nexusBase)),
    [nexusBase]
  );
  const [base, setBase] = useState<string | null>(requestedBase ?? null);
  const transport = useMemo(
    () => (base ? new InClusterTransport({ baseUrl: base, filterHistoryByOrigin }) : null),
    [base, filterHistoryByOrigin]
  );
  const [state, setState] = useState<'connecting' | 'ready' | 'unavailable'>('connecting');
  const [reason, setReason] = useState<UnavailableReason | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState('connecting');
    setReason(null);
    (async () => {
      const mount = nexusBase === undefined ? await resolveNexusMountPath() : requestedBase;
      if (cancelled) return;
      if (!mount) {
        setBase(null);
        // Omitted prop → discovery came back empty; supplied prop → it did not reduce to a path.
        setReason(nexusBase === undefined ? 'no-mount' : 'bad-base');
        setState('unavailable');
        return;
      }
      setBase(mount);
      const ok = await silentNexusCookieBootstrap(mount);
      if (cancelled) return;
      setReason(ok ? null : 'auth-failed');
      setState(ok ? 'ready' : 'unavailable');
    })();
    return () => {
      cancelled = true;
    };
  }, [nexusBase, requestedBase]);

  useEffect(() => {
    // The bootstrapped Nexus-path cookie can expire mid-session. The host shell would show its
    // reauth banner; the embed instead re-runs the silent exchange (it rides the page's own
    // session) and releases the expiry latch so chat calls flow again. If the page's own session
    // is dead too, the re-mint fails and the host app's normal reauth takes over.
    //
    // The latch is a document-wide signal, so the embed must not clear one it did not trip: when
    // the Nexus-path cookie is still good the expiry belongs to the page's own session, and
    // clearing would hide the host's reauth banner while every host call keeps 401ing. A live
    // Nexus cookie is therefore the "not mine" test — and it is also why the re-mint cannot be
    // read as proof: `silentNexusCookieBootstrap` short-circuits true on exactly that cookie.
    if (!base) return;
    return subscribeSessionExpiry(() => {
      if (!isSessionExpired()) return;
      hasNexusCookie(base).then((mine) => {
        if (mine) return;
        silentNexusCookieBootstrap(base).then((ok) => {
          if (ok) clearSessionExpired();
        });
      });
    });
  }, [base]);

  // `.nexus-chat-embed` is the scope the bundled stylesheet's page-level resets and surface styling
  // (font, background, foreground) key off — wrap BOTH the fallback and the live chat so either state
  // renders in the host's look. Utility classes and tokens are global, so children style regardless;
  // the wrapper only carries what the compiled CSS deliberately kept off the consumer's own page.
  //
  // The wrapper must be a `flex-col` box, not a plain block: `ChatPage`'s root is `flex-1`, and the
  // host mounts it inside a `flex min-h-0 flex-col` `<main>` so that `flex-1` resolves to the full
  // viewport height (composer pinned to the bottom, empty state centered). A plain-block wrapper gives
  // that `flex-1` no flex context, so the chat collapses to content height and the composer floats up
  // with dead space below it. Mirror the host's mount container so the embed fills its slot identically.
  const content =
    state !== 'ready' || !transport ? (
      // Discovery / exchange failure — the host app's normal reauth still owns sign-in UX; we only add
      // a quiet one-line reason under the message so an integrator can tell the states apart.
      // `data-testid` / `data-state` are the hooks the cross-app embed integration tests assert on.
      <div
        data-testid="nexus-embed-status"
        data-state={state}
        className="flex h-full w-full flex-col items-center justify-center gap-1 px-4 text-center text-sm text-muted-foreground"
      >
        <span>{state === 'connecting' ? 'Connecting to Agentix…' : 'Agentix is unavailable.'}</span>
        {state === 'unavailable' && reason ? (
          <span data-testid="nexus-embed-reason" className="max-w-sm text-xs text-muted-foreground">
            {UNAVAILABLE_REASON_TEXT[reason]}
          </span>
        ) : null}
      </div>
    ) : (
      <SessionProvider agentDefId={agentDefId}>
        <ChatPage
          transport={transport}
          showHostNavLinks={false}
          agentDefId={agentDefId}
          allowAgentSwitch={allowAgentSwitch}
          workspaceEnabled={workspaceEnabled}
          connectAppsEnabled={connectAppsEnabled}
          crossClusterOAuthEnabled={crossClusterOAuthEnabled}
          modelControlsEnabled={modelControlsEnabled}
          sessionSidebarEnabled={sessionSidebarEnabled}
          mcpAppsEnabled={mcpAppsEnabled}
        />
      </SessionProvider>
    );
  return <div className="nexus-chat-embed flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden">{content}</div>;
}
