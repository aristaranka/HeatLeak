/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { TriangleAlert, X } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useMyMcpConnectionStatus } from '../hooks/queries/useMcpConnectionStatus';
import { useMcpConnect } from '../lib/useMcpConnect';
import { Button } from './ui/button';

interface McpAuthExpiredBannerProps {
  /** connectionKeys with a live mid-session auth-expiry frame, oldest-first. Empty renders nothing. */
  connectionKeys: string[];
  /** The chat's bound agent — scopes the display-name lookup to the same connection set the
   *  composer's MCP menu already queries. Null/undefined skips the lookup (raw key is shown). */
  agentDefId?: string | null;
  /** Clears one connectionKey's banner — called both on the dismiss (X) click and after a
   *  successful reconnect (the next tool call pulls the fresh token through the proxy
   *  automatically; no new chat, no reload). */
  onDismiss: (connectionKey: string) => void;
}

/**
 * Inline, dismissible "reconnect" banner for a mid-session external-MCP OAuth expiry. One row
 * per expired connectionKey (deduped by the caller) — each row owns its own {@link useMcpConnect}
 * instance so a row's own Reconnect success dismisses only that row, never the others.
 */
const McpAuthExpiredBanner: React.FC<McpAuthExpiredBannerProps> = ({ connectionKeys, agentDefId, onDismiss }) => {
  // staleTime:0/refetchOnMount:'always' on this hook means every mount refetches — fine here since
  // it's enabled only while there's something to name, and the same query the MCP menu already runs.
  const statusQuery = useMyMcpConnectionStatus(agentDefId || '', connectionKeys.length > 0 && !!agentDefId);

  if (connectionKeys.length === 0) return null;

  const statuses = statusQuery.data;
  const statusByKey = new Map((statuses ?? []).map((c) => [c.connectionKey, c]));

  // Reconcile against live connection status: a key whose connection is now usable
  // (`connected`/`shared`) is stale — e.g. a persisted expiry frame replayed on reload AFTER the
  // user already reconnected. Suppress those rows. Fail open while status is still loading (no data
  // yet) so a genuine expiry isn't hidden by a slow query. Unknown keys (no status row) also show.
  const visibleKeys = statuses
    ? connectionKeys.filter((key) => {
        const s = statusByKey.get(key);
        return !s || s.status === 'disconnected';
      })
    : connectionKeys;

  if (visibleKeys.length === 0) return null;

  // One polite live region for the whole banner set — announced once, not N assertive regions
  // clobbering each other (and re-announcing on every per-row error change).
  return (
    <div
      className="chat-page__mcp-auth-expired flex flex-col gap-1.5 px-4 pt-2"
      data-testid="mcp-auth-expired-list"
      role="status"
      aria-live="polite"
    >
      {visibleKeys.map((key) => (
        <McpAuthExpiredRow
          key={key}
          connectionKey={key}
          name={statusByKey.get(key)?.name || key}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
};

const McpAuthExpiredRow: React.FC<{
  connectionKey: string;
  name: string;
  onDismiss: (connectionKey: string) => void;
}> = ({ connectionKey, name, onDismiss }) => {
  const { t } = useTranslation('chat');
  // Same OAuth popup flow McpConnectionsMenu / McpAuthGateModal use (getOAuthUrl → popup →
  // connect). A dedicated hook instance per row means only THIS row's connect completing fires
  // onChanged, so the banner for a different expired connection isn't dismissed by mistake.
  const { busyKey, error, connectOAuth } = useMcpConnect(() => onDismiss(connectionKey));
  const busy = busyKey === connectionKey;

  return (
    <div
      data-testid="mcp-auth-expired-banner"
      data-connection-key={connectionKey}
      className="flex items-start justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-[13px]"
    >
      <div className="flex min-w-0 items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0">
          <p className="m-0 text-foreground">{t('mcpAuthExpired.message', { name })}</p>
          {/* useMcpConnect surfaces a raw, hardcoded-English error string; show a localized generic
              instead of leaking untranslated/technical text into this otherwise-localized banner. */}
          {error && <p className="m-0 mt-1 text-destructive">{t('mcpAuthExpired.reconnectError')}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button type="button" size="xs" variant="outline" onClick={() => connectOAuth(connectionKey)} disabled={busy}>
          {busy ? t('mcpAuthExpired.reconnecting') : t('mcpAuthExpired.reconnect')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t('mcpAuthExpired.dismissAriaLabel', { name })}
          title={t('dismiss')}
          onClick={() => onDismiss(connectionKey)}
        >
          <X aria-hidden />
        </Button>
      </div>
    </div>
  );
};

export default McpAuthExpiredBanner;
