/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { Loader2, Plus, RotateCw, X } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDismissablePopover } from '../hooks/useDismissablePopover';
import { isUrlInput, type CodedError } from '../lib/remoteConnect';
import { cn } from '../lib/utils';
import { AppsIcon, ChevronDownIcon } from './AgentIcons';
import { Input } from './ui/input';
import { Skeleton } from './ui/skeleton';
import type { ClusterAppOption } from '../lib/chatApi';
import type { TargetAppInfo } from '../lib/types';

// Mirror of the server-side `_APP_ID_RE` (Nexus.Agent.Session.js / Nexus.Agent.Service.js):
// a `<cluster>-<env>-<app>` triple of alphanumeric/dot segments joined by hyphens. Validated
// client-side only to catch obvious typos early — the authoritative check is the rproxy probe
// that runs server-side when `onConnectApp` calls `configureApp`.
const APP_ID_RE = /^[a-zA-Z0-9.]+-[a-zA-Z0-9.]+-[a-zA-Z0-9.]+$/;

// Cap how many rows either list renders at once. The scroll container bounds the *visual*
// height; this bounds the *DOM* so a very long env (hundreds+ apps) can't stall open/keystroke.
// Anything past the cap is reachable via the search box (which appears well below this count).
const MAX_VISIBLE_ROWS = 100;

// A connect that outruns this gets a "still working" reassurance — the cross-cluster probe +
// OAuth bind is the longest wait in the flow. This does NOT cancel the request (there is no
// AbortSignal plumbed through the orchestrator); it only reassures the user the app hasn't hung.
const SLOW_CONNECT_MS = 15_000;

// Map the orchestrator's `CodedError.code`s — both the client-side codes and the server probe
// `reason` codes — to chat i18n keys so these user-visible messages go through react-i18next
// instead of surfacing the backend's English literal. The backend has no i18n, so its probe
// `message` is English; the localized strings here intentionally drop the offending URL it
// interpolates (the user just typed it). An unmapped code still falls back to `err.message`.
const CONNECT_ERROR_KEYS: Record<string, string> = {
  'empty-input': 'appsPicker.connectErrorEmptyInput',
  'needs-admin': 'appsPicker.connectErrorNeedsAdmin',
  'no-url': 'appsPicker.connectErrorNoUrl',
  'invalid-url': 'appsPicker.connectErrorInvalidUrl',
  unreachable: 'appsPicker.connectErrorUnreachable',
  // A remote that answered as an OAuth server but lacks the required grant/PKCE — genuinely
  // incapable. (`incompatible-server` is the legacy code for the same case; kept as a fallback.)
  'oauth-missing-features': 'appsPicker.connectErrorIncompatibleServer',
  'incompatible-server': 'appsPicker.connectErrorIncompatibleServer',
  // No discovery doc found under the given URL — usually a console / deep-link URL, not the root.
  'discovery-not-found': 'appsPicker.connectErrorDiscoveryNotFound',
  // Discovery path was gated (login/403) — again, usually not the app root.
  'discovery-blocked': 'appsPicker.connectErrorDiscoveryBlocked',
  'needs-admin-client': 'appsPicker.connectErrorNeedsAdminClient',
};

export interface AppsPickerProps {
  connectedApps: Record<string, TargetAppInfo>;
  onRemoveApp?: (appId: string) => void;
  // Resolves on success, rejects with a user-facing Error on failure. When omitted,
  // the "Connect new app" affordance is hidden (e.g. before a session is reserved).
  onConnectApp?: (appId: string) => Promise<void>;
  // Apps registered in the C3 Studio (from `listEnvApps`), shown as a one-click
  // "add from studio" list. Admin-gated server-side, so this is empty for non-admins —
  // they still get the manual connect-by-id input below. Already-connected apps are
  // filtered out here. Only meaningful when `onConnectApp` is provided.
  studioApps?: ClusterAppOption[];
  // Studio fetch state, threaded from the parent's React-Query so the dropdown can show an
  // honest loading skeleton / error+retry instead of a silently-empty section while the fetch
  // is in flight or has failed. `studioLoading` = first-load pending (no data yet); `studioError`
  // = the fetch failed with no data to fall back to. Both are ignored once `studioApps` is
  // non-empty (freshest data wins). Only meaningful alongside `onConnectApp`.
  studioLoading?: boolean;
  studioError?: boolean;
  onRetryStudio?: () => void;
  // The Nexus host app (from `appInfo()`: id `${clusterId}-${envName}-${appName}` + its display name),
  // offered as a pinned one-click "This app" row so ANY user — not just admins who can browse the
  // admin-gated Studio list — can connect the agent to the app they're in. Sourced client-side, so it
  // needs no `listEnvApps`. Deduped against both the connected list and the Studio list so it never
  // shows twice. Only meaningful alongside `onConnectApp`.
  currentApp?: { id: string; name: string };
  // Gate for the cross-cluster per-user OAuth entry point — the "ADD EXTERNAL APP" free-text
  // id/URL input. Threaded from the host's `nexus-cross-cluster-user-oauth` flag. When false (the
  // fail-closed default) the input is not rendered at all; the connected-apps list, "This app", and
  // the admin Studio list are independent of it. Only meaningful alongside `onConnectApp`.
  crossClusterOAuthEnabled?: boolean;
}

export default function AppsPicker({
  connectedApps,
  onRemoveApp,
  onConnectApp,
  studioApps = [],
  studioLoading = false,
  studioError = false,
  onRetryStudio,
  currentApp,
  crossClusterOAuthEnabled = false,
}: AppsPickerProps) {
  const { t } = useTranslation('chat');
  const [search, setSearch] = useState('');
  // Filter box for the "add from studio" list (only rendered when the list is long).
  const [studioSearch, setStudioSearch] = useState('');
  // Deferred filter terms: filtering is a pure client-side pass, so `useDeferredValue` keeps the
  // input responsive on a long list (typing never blocks on the re-filter) — the idiomatic choice
  // over a network debounce, which exists to throttle requests we don't make here.
  const deferredSearch = useDeferredValue(search);
  const deferredStudioSearch = useDeferredValue(studioSearch);
  // Inline connect-an-app state (lives in the dropdown — no separate modal).
  const [connectId, setConnectId] = useState('');
  // The appId whose connect is in flight (manual entry or a studio row), or null when idle.
  // One tracker shared by both paths so we can disable everything and spin only the active row.
  const [connectingId, setConnectingId] = useState<string | null>(null);
  // Flipped true when an in-flight connect crosses SLOW_CONNECT_MS, to show a reassurance line.
  const [slowConnect, setSlowConnect] = useState(false);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The failed connect's appId + message, or null when idle. Tagging the error with its source
  // appId lets us render it in the right place: under the studio row that failed, or in the
  // external-app section for a manual entry.
  const [connectError, setConnectError] = useState<{ appId: string; message: string } | null>(null);
  // Open/close + outside-click + Escape (focus restored to trigger) live in the shared hook;
  // dismissing also clears the search boxes and any in-progress connect entry.
  const { open, setOpen, wrapRef, triggerRef } = useDismissablePopover(() => {
    setSearch('');
    setStudioSearch('');
    setConnectId('');
    setConnectError(null);
  });
  const searchRef = useRef<HTMLInputElement>(null);
  const studioListRef = useRef<HTMLUListElement>(null);

  const apps = useMemo(() => Object.values(connectedApps), [connectedApps]);
  const count = apps.length;

  // Focus the search input on open (only renders when count > 3).
  useEffect(() => {
    if (open && count > 3) searchRef.current?.focus();
  }, [open, count]);

  // Search input only renders when count > 3 — if removals drop us below that,
  // the input unmounts but `search` state would otherwise keep filtering the
  // remaining rows out with no UI to clear it.
  useEffect(() => {
    if (count <= 3) setSearch('');
  }, [count]);

  // Clear any pending slow-connect timer on unmount so it can't fire into a gone component.
  useEffect(() => {
    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, []);

  const handleRemove = useCallback(
    (appId: string) => {
      onRemoveApp?.(appId);
    },
    [onRemoveApp]
  );

  const orderedApps = useMemo(() => {
    return apps.slice().sort((a, b) => a.appId.localeCompare(b.appId));
  }, [apps]);

  const connectedAppIds = useMemo(() => apps.map((a) => a.appId), [apps]);
  // O(1) membership for the studio dedup filter below — a plain `.includes()` per studio app is
  // O(n·m) and becomes the dominant cost when both lists are long.
  const connectedIdSet = useMemo(() => new Set(connectedAppIds), [connectedAppIds]);
  const connecting = connectingId !== null;

  // Shared connect path for both the manual input and a studio-list click. On success the
  // parent refreshes `connectedApps` (the new row appears in the list above); we clear the
  // manual field if it was the source and keep the dropdown open. Errors surface inline.
  const connectApp = useCallback(
    async (appId: string) => {
      if (!onConnectApp || connectingId !== null) return;
      setConnectingId(appId);
      setConnectError(null);
      setSlowConnect(false);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      slowTimerRef.current = setTimeout(() => setSlowConnect(true), SLOW_CONNECT_MS);
      try {
        await onConnectApp(appId);
        setConnectId((cur) => (cur.trim() === appId ? '' : cur));
      } catch (err) {
        const code = (err as CodedError | undefined)?.code;
        const key = code ? CONNECT_ERROR_KEYS[code] : undefined;
        const message = key ? t(key) : err instanceof Error ? err.message : String(err);
        setConnectError({ appId, message });
      } finally {
        if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
        setSlowConnect(false);
        setConnectingId(null);
      }
    },
    [onConnectApp, connectingId, t]
  );

  // Inline connect: accept either a `<cluster>-<env>-<app>` id OR an `https://` app URL (the
  // cross-cluster per-user path — the orchestrator in `onConnectApp` probes the URL and runs the
  // OAuth redirect). Flag duplicates only for an appId (a URL isn't a known appId key). Submit on
  // Enter / the + button.
  const connectTrimmed = connectId.trim();
  const connectIsUrl = isUrlInput(connectTrimmed);
  const connectValid = connectIsUrl || APP_ID_RE.test(connectTrimmed);
  const connectDuplicate = connectValid && !connectIsUrl && connectedAppIds.includes(connectTrimmed);
  const canConnect = connectValid && !connectDuplicate && !connecting;

  const handleConnect = useCallback(() => {
    if (!connectValid || connectDuplicate) return;
    connectApp(connectTrimmed);
  }, [connectApp, connectValid, connectDuplicate, connectTrimmed]);

  // "Add from studio" list: studio apps not already connected, sorted, then filtered by the
  // studio search box. Selecting a row connects it via the same `connectApp` path.
  const availableStudioApps = useMemo(
    () =>
      studioApps
        // Drop already-connected apps AND the host app (it renders as the pinned "This app" row
        // below) so an admin whose Studio list contains the host app never sees it in both places.
        .filter((a) => !connectedIdSet.has(a.id) && a.id !== currentApp?.id)
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id)),
    [studioApps, connectedIdSet, currentApp?.id]
  );
  const studioSearchKey = deferredStudioSearch.trim().toLowerCase();
  const filteredStudioApps = useMemo(
    () =>
      studioSearchKey
        ? availableStudioApps.filter((a) => a.id.toLowerCase().includes(studioSearchKey))
        : availableStudioApps,
    [availableStudioApps, studioSearchKey]
  );
  // Show the section whenever it has (or is fetching, or failed to fetch) something to say — not
  // only when apps are already present. This is what turns the old silently-empty section into an
  // honest loading / error surface. Freshest data wins: a non-empty list renders even mid-refetch.
  const hasStudioApps = availableStudioApps.length > 0;
  const showStudioSection = !!onConnectApp && (hasStudioApps || studioLoading || studioError);

  // The pinned host-app row: shown when we know the host app, a connect handler exists, and it isn't
  // already connected/staged. (Dedup vs the Studio list happens in availableStudioApps above.)
  const showCurrentApp = !!onConnectApp && !!currentApp && !connectedIdSet.has(currentApp.id);
  const currentAppId = showCurrentApp && currentApp ? currentApp.id : null;

  // Route a failed connect to the row that triggered it. If the errored appId is a studio row,
  // its message renders under that row; otherwise (a manual entry) it stays in the external-app
  // section, alongside the duplicate-entry message.
  const studioErrorId =
    connectError && availableStudioApps.some((a) => a.id === connectError.appId) ? connectError.appId : null;
  const currentAppError =
    connectError && currentAppId !== null && connectError.appId === currentAppId ? connectError.message : null;
  const manualError = connectError && studioErrorId === null && currentAppError === null ? connectError.message : null;
  const connectMessage = manualError || (connectDuplicate ? t('appsPicker.alreadyConnected') : null);
  // Which section owns the in-flight "Connecting to X…" line — mirrors the error routing above.
  const studioConnectingId = connecting && availableStudioApps.some((a) => a.id === connectingId) ? connectingId : null;
  const currentAppConnecting =
    connecting && currentAppId !== null && connectingId === currentAppId ? currentAppId : null;
  const manualConnecting =
    connecting && studioConnectingId === null && currentAppConnecting === null ? connectingId : null;

  const searchKey = deferredSearch.trim().toLowerCase();
  const filtered = useMemo(
    () => (searchKey ? orderedApps.filter((a) => a.appId.toLowerCase().includes(searchKey)) : orderedApps),
    [orderedApps, searchKey]
  );

  // Cap the DOM node count on both lists; overflow is reachable by narrowing the search.
  const visibleConnected = filtered.slice(0, MAX_VISIBLE_ROWS);
  const connectedOverflow = filtered.length - visibleConnected.length;
  const visibleStudio = filteredStudioApps.slice(0, MAX_VISIBLE_ROWS);
  const studioOverflow = filteredStudioApps.length - visibleStudio.length;

  // Polite live-region text describing the studio section's async state, so a screen-reader user
  // hears the list arrive / fail rather than silence. Connect *success* is already announced by the
  // parent's sonner toast; connect *failures* announce via the role="alert" error nodes below.
  const studioStatus = !onConnectApp
    ? ''
    : hasStudioApps
      ? t('appsPicker.appsAvailable', { count: availableStudioApps.length })
      : studioLoading
        ? t('appsPicker.loadingApps')
        : studioError
          ? t('appsPicker.loadFailed')
          : '';

  // Arrow-key roving within the studio list (homogeneous native <button> rows — no listbox role,
  // per "native HTML before ARIA"). Up/Down move focus, Home/End jump to ends.
  const onStudioKeyDown = useCallback((e: React.KeyboardEvent<HTMLUListElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const list = studioListRef.current;
    if (!list) return;
    const buttons = Array.from(
      list.querySelectorAll<HTMLButtonElement>('button[data-testid="apps-picker-studio-item"]:not(:disabled)')
    );
    if (buttons.length === 0) return;
    e.preventDefault();
    const current = document.activeElement as HTMLElement | null;
    const idx = buttons.findIndex((b) => b === current);
    let next = 0;
    if (e.key === 'ArrowDown') next = idx < 0 ? 0 : Math.min(idx + 1, buttons.length - 1);
    else if (e.key === 'ArrowUp') next = idx < 0 ? buttons.length - 1 : Math.max(idx - 1, 0);
    else if (e.key === 'End') next = buttons.length - 1;
    buttons[next]?.focus();
  }, []);

  // Always render — show "0 apps" when none are connected so the user can open
  // the menu and connect apps (rather than hiding the affordance entirely).
  return (
    <div className="relative" ref={wrapRef} data-testid="apps-picker">
      <button
        ref={triggerRef}
        type="button"
        data-testid="apps-picker-trigger"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground transition-colors hover:border-muted-foreground',
          open && 'border-ring'
        )}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? 'apps-picker-menu' : undefined}
        title={t('appsPicker.connectedApps')}
      >
        <AppsIcon />
        <span className="whitespace-nowrap">{t('appsPicker.count', { count })}</span>
        <ChevronDownIcon />
      </button>

      {open && (
        <div
          id="apps-picker-menu"
          data-testid="apps-picker-dropdown"
          // max-h clamps the WHOLE popover to the viewport so it can never grow off the top of the
          // screen (it opens upward). Inner lists keep their own caps; on a tall viewport only they
          // scroll, on a short one this outer scroll is the safety net.
          className="absolute bottom-[calc(100%+6px)] left-0 z-50 flex max-h-[70vh] w-[340px] max-w-[90vw] flex-col overflow-x-hidden overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg [scrollbar-gutter:stable]"
        >
          <span className="sr-only" role="status" aria-live="polite">
            {studioStatus}
          </span>
          <div
            className="px-3 pt-2 pb-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase"
            data-testid="apps-picker-connected-title"
          >
            {t('appsPicker.connectedApps')}
          </div>
          {count > 3 && (
            <div className="border-b border-border p-2 pb-1">
              <Input
                ref={searchRef}
                type="text"
                data-testid="apps-picker-search"
                className="h-8 text-xs"
                placeholder={t('appsPicker.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={t('appsPicker.filterApps')}
              />
            </div>
          )}
          <ul
            className="m-0 max-h-[220px] list-none overflow-y-auto py-1 [overscroll-behavior:contain]"
            aria-label={t('appsPicker.connectedApps')}
          >
            {visibleConnected.map((app) => {
              return (
                <li
                  key={app.appId}
                  data-testid="apps-picker-item"
                  className="group flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-accent"
                >
                  <span className="size-2 shrink-0 rounded-full bg-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <span
                      data-testid="apps-picker-item-id"
                      className="block truncate text-foreground"
                      title={app.appId}
                    >
                      {app.appId}
                    </span>
                    {app.appUrl ? (
                      <a
                        data-testid="apps-picker-item-link"
                        className="block truncate text-2xs text-primary underline"
                        href={app.appUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t('appsPicker.openAppTab', { url: app.appUrl })}
                      >
                        {app.appUrl}
                      </a>
                    ) : (
                      // Staged pre-session target — the URL isn't known until it binds on send.
                      <span
                        className="block truncate text-2xs text-muted-foreground"
                        data-testid="apps-picker-item-pending"
                      >
                        {t('appsPicker.pendingBind')}
                      </span>
                    )}
                  </div>
                  {onRemoveApp && (
                    <button
                      type="button"
                      data-testid="apps-picker-item-remove"
                      className="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground opacity-0 transition hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                      onClick={() => handleRemove(app.appId)}
                      title={t('appsPicker.removeApp', { appId: app.appId })}
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
            {count === 0 && (
              <li className="p-3 text-center text-xs text-muted-foreground">
                {onConnectApp ? t('appsPicker.connectHint') : t('appsPicker.noneConnected')}
              </li>
            )}
            {count > 0 && filtered.length === 0 && searchKey && (
              <li className="p-3 text-center text-xs text-muted-foreground">{t('appsPicker.noResults')}</li>
            )}
            {connectedOverflow > 0 && (
              <li
                className="px-3 py-1.5 text-center text-2xs text-muted-foreground"
                data-testid="apps-picker-connected-overflow"
              >
                {t('appsPicker.showingCount', { shown: visibleConnected.length, total: filtered.length })}
              </li>
            )}
          </ul>
          {showCurrentApp && currentApp && (
            <div className="border-t border-border p-2 pt-1.5" data-testid="apps-picker-current-app">
              <div className="px-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                {t('appsPicker.thisApp')}
              </div>
              <div className="px-1 pb-1 text-2xs text-muted-foreground">{t('appsPicker.thisAppHint')}</div>
              <button
                type="button"
                data-testid="apps-picker-current-app-item"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => connectApp(currentApp.id)}
                disabled={connecting}
                title={t('appsPicker.connectThisApp', { app: currentApp.name })}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-foreground">{currentApp.name}</span>
                  <span className="block truncate text-2xs text-muted-foreground" title={currentApp.id}>
                    {currentApp.id}
                  </span>
                </span>
                {currentAppConnecting ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Plus className="size-3.5 shrink-0 text-primary" aria-hidden />
                )}
              </button>
              {currentAppConnecting && (
                <p
                  className="mt-0.5 px-2 text-2xs text-muted-foreground"
                  data-testid="apps-picker-current-app-connecting"
                >
                  {t('appsPicker.connectingTo', { app: currentApp.name })}
                  {slowConnect ? ` ${t('appsPicker.connectSlow')}` : ''}
                </p>
              )}
              {currentAppError && (
                <p
                  className="mt-0.5 px-2 text-2xs text-destructive"
                  data-testid="apps-picker-current-app-error"
                  role="alert"
                >
                  {currentAppError}
                </p>
              )}
            </div>
          )}
          {showStudioSection && (
            <div className="border-t border-border p-2 pt-1.5" data-testid="apps-picker-studio">
              <div className="px-1 pb-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                {t('appsPicker.addFromStudio')}
              </div>
              {hasStudioApps && availableStudioApps.length > 5 && (
                <Input
                  type="text"
                  data-testid="apps-picker-studio-search"
                  className="mb-1 h-8 text-xs"
                  placeholder={t('appsPicker.studioSearchPlaceholder')}
                  value={studioSearch}
                  onChange={(e) => setStudioSearch(e.target.value)}
                  aria-label={t('appsPicker.filterStudioApps')}
                />
              )}
              {/* Loading (no data yet): skeleton rows shaped like studio rows, in reserved height —
                  the swap to real rows doesn't resize the section. */}
              {!hasStudioApps && studioLoading && (
                <div className="py-0.5" data-testid="apps-picker-studio-loading" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                      <Skeleton className="h-3.5 flex-1" />
                      <Skeleton className="size-3.5 shrink-0 rounded-sm" />
                    </div>
                  ))}
                </div>
              )}
              {/* Error (no data to fall back to): distinct from empty — message + Retry. */}
              {!hasStudioApps && !studioLoading && studioError && (
                <div
                  className="flex items-center justify-between gap-2 px-2 py-1.5 text-2xs text-destructive"
                  data-testid="apps-picker-studio-load-error"
                  role="alert"
                >
                  <span>{t('appsPicker.loadFailed')}</span>
                  {onRetryStudio && (
                    <button
                      type="button"
                      data-testid="apps-picker-studio-retry"
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-input bg-background px-1.5 py-0.5 text-foreground transition-colors hover:bg-accent"
                      onClick={() => onRetryStudio()}
                      title={t('appsPicker.retry')}
                    >
                      <RotateCw className="size-3" aria-hidden />
                      {t('appsPicker.retry')}
                    </button>
                  )}
                </div>
              )}
              {hasStudioApps && (
                <ul
                  ref={studioListRef}
                  className="m-0 max-h-[160px] list-none overflow-y-auto py-0.5 [overscroll-behavior:contain]"
                  aria-label={t('appsPicker.addFromStudio')}
                  onKeyDown={onStudioKeyDown}
                >
                  {visibleStudio.map((app) => (
                    <li key={app.id}>
                      <button
                        type="button"
                        data-testid="apps-picker-studio-item"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => connectApp(app.id)}
                        disabled={connecting}
                        title={t('appsPicker.connectStudioApp', { appId: app.id })}
                      >
                        <span className="min-w-0 flex-1 truncate">{app.id}</span>
                        {connectingId === app.id ? (
                          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                        ) : (
                          <Plus className="size-3.5 shrink-0 text-primary" aria-hidden />
                        )}
                      </button>
                      {studioConnectingId === app.id && (
                        <p
                          className="mt-0.5 px-2 text-2xs text-muted-foreground"
                          data-testid="apps-picker-studio-connecting"
                        >
                          {t('appsPicker.connectingTo', { app: app.id })}
                          {slowConnect ? ` ${t('appsPicker.connectSlow')}` : ''}
                        </p>
                      )}
                      {studioErrorId === app.id && (
                        <p
                          className="mt-0.5 px-2 text-2xs text-destructive"
                          data-testid="apps-picker-studio-error"
                          role="alert"
                        >
                          {connectError?.message}
                        </p>
                      )}
                    </li>
                  ))}
                  {studioSearchKey && filteredStudioApps.length === 0 && (
                    <li className="p-2 text-center text-2xs text-muted-foreground">{t('appsPicker.noResults')}</li>
                  )}
                  {studioOverflow > 0 && (
                    <li
                      className="px-2 py-1 text-center text-2xs text-muted-foreground"
                      data-testid="apps-picker-studio-overflow"
                    >
                      {t('appsPicker.showingCount', { shown: visibleStudio.length, total: filteredStudioApps.length })}
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
          {onConnectApp && crossClusterOAuthEnabled && (
            <div className="border-t border-border p-2">
              <div className="px-1 pb-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                {t('appsPicker.addExternalApp')}
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  id="connect-app-input"
                  type="text"
                  data-testid="apps-picker-connect-input"
                  className="h-8 text-xs"
                  placeholder={t('appsPicker.appIdOrUrlPlaceholder')}
                  value={connectId}
                  spellCheck={false}
                  autoComplete="off"
                  disabled={connecting}
                  aria-label={t('appsPicker.connectNewApp')}
                  aria-invalid={!!connectMessage}
                  onChange={(e) => {
                    setConnectId(e.target.value);
                    if (connectError) setConnectError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConnect();
                  }}
                />
                <button
                  type="button"
                  data-testid="apps-picker-connect"
                  className="inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-background p-1.5 text-primary transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleConnect}
                  disabled={!canConnect}
                  title={t('appsPicker.connect')}
                  aria-label={t('appsPicker.connect')}
                >
                  {connectingId !== null && connectingId === connectTrimmed ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="size-3.5" aria-hidden />
                  )}
                </button>
              </div>
              {manualConnecting && (
                <p className="mt-1 px-0.5 text-2xs text-muted-foreground" data-testid="apps-picker-connecting">
                  {t('appsPicker.connectingTo', { app: manualConnecting })}
                  {slowConnect ? ` ${t('appsPicker.connectSlow')}` : ''}
                </p>
              )}
              {connectMessage && (
                <p
                  className="mt-1 px-0.5 text-2xs text-destructive"
                  data-testid="apps-picker-connect-error"
                  role="alert"
                >
                  {connectMessage}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
