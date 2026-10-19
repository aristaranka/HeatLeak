/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOptionalChatTransport } from '../chatTransportContext';
import { useDismissablePopover } from '../hooks/useDismissablePopover';
import {
  getMyMcpConnectionStatus,
  getMcpOAuthUrl,
  connectMcp,
  setMcpApiKey,
  disconnectMcp,
  type McpConnectionStatus,
} from '../lib/chatApi';
import { generatePkce, oauthRedirectUri, openOAuthPopup } from '../lib/oauthPopup';
import { cn } from '../lib/utils';
import { ChevronDownIcon } from './AgentIcons';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface McpConnectionsMenuProps {
  /** Scope the menu to the chat's bound agent — only that agent's MCP connections are shown. */
  agentDefId?: string | null;
}

// In-chat per-user menu for authenticating external MCP connections (oauth / apiKey). Self-fetches
// the caller's connection status scoped to the chat's agent; `none` / `bearer` / shared connections
// need no per-user action and are omitted. Sibling to AppsPicker in the composer.
export default function McpConnectionsMenu({ agentDefId }: McpConnectionsMenuProps) {
  const { t } = useTranslation('connect');
  const transport = useOptionalChatTransport();
  // Tests may set supportsMcpAuthGate=false to skip; transports with their own MCP proxies enable it.
  const mcpUi = transport?.supportsMcpAuthGate !== false;
  const [items, setItems] = useState<McpConnectionStatus[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [apiKeyFor, setApiKeyFor] = useState<string | null>(null);
  const [apiKeyVal, setApiKeyVal] = useState('');
  const [error, setError] = useState('');
  const { open, setOpen, wrapRef, triggerRef } = useDismissablePopover();

  const refresh = useCallback(async () => {
    if (!mcpUi) {
      setItems([]);
      return;
    }
    try {
      // Show ALL of the agent's connections — shared/no-auth ones appear as non-actionable
      // "Active" rows; only requiresAuth connections get the connect/disconnect flow.
      const all = transport?.getMyMcpConnectionStatus
        ? await transport.getMyMcpConnectionStatus(agentDefId || undefined)
        : await getMyMcpConnectionStatus(agentDefId || undefined);
      setItems(Array.isArray(all) ? (all as McpConnectionStatus[]) : []);
    } catch {
      // best-effort: an empty menu is fine when the API is unavailable
      setItems([]);
    }
  }, [agentDefId, mcpUi, transport]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onConnectOauth = async (c: McpConnectionStatus) => {
    setError('');
    setBusyKey(c.connectionKey);
    try {
      const pkce = await generatePkce();
      const getUrl = transport?.getMcpOAuthUrl ?? getMcpOAuthUrl;
      const connect = transport?.connectMcp ?? connectMcp;
      const url = await getUrl(c.connectionKey, oauthRedirectUri(), pkce.codeChallenge, pkce.codeVerifier);
      const { code, state } = await openOAuthPopup(url, c.connectionKey);
      await connect(c.connectionKey, code, state);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mcp.menu.connectError'));
    } finally {
      setBusyKey(null);
    }
  };

  const onSaveApiKey = async (c: McpConnectionStatus) => {
    setError('');
    setBusyKey(c.connectionKey);
    try {
      const setKey = transport?.setMcpApiKey ?? setMcpApiKey;
      await setKey(c.connectionKey, apiKeyVal.trim());
      setApiKeyFor(null);
      setApiKeyVal('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mcp.menu.connectError'));
    } finally {
      setBusyKey(null);
    }
  };

  const onDisconnect = async (c: McpConnectionStatus) => {
    setError('');
    setBusyKey(c.connectionKey);
    try {
      const disconnect = transport?.disconnectMcp ?? disconnectMcp;
      await disconnect(c.connectionKey);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mcp.menu.disconnectError'));
    } finally {
      setBusyKey(null);
    }
  };

  // Hidden when MCP UI disabled or the agent has no MCP connections at all.
  if (!mcpUi || items.length === 0) return null;

  // "Ready" = usable in the chat now: connected (per-user authed) or shared (no per-user step).
  const connectedCount = items.filter((c) => c.status === 'connected' || c.status === 'shared').length;

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          'inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
          open && 'bg-accent text-foreground'
        )}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        title={t('mcp.menu.title')}
      >
        <span>{t('mcp.menu.count', { connected: connectedCount, total: items.length })}</span>
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="absolute bottom-[calc(100%+6px)] left-0 z-50 max-w-[360px] min-w-[280px] rounded-md border border-border bg-popover p-1.5 text-popover-foreground shadow-lg">
          <ul className="m-0 list-none p-0" aria-label={t('mcp.menu.title')}>
            {items.map((c) => (
              <li
                key={c.connectionKey}
                className="flex items-center gap-2 px-1 py-1.5 [&+li]:border-t [&+li]:border-border"
              >
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    c.status === 'connected' || c.status === 'shared' ? 'bg-success' : 'bg-muted-foreground'
                  )}
                  aria-hidden
                />
                <span className="flex-1 truncate text-[13px] text-foreground">{c.name}</span>
                {!c.requiresAuth ? (
                  // Shared / no-auth: usable by everyone, nothing for the user to authenticate.
                  <span className="text-xs text-muted-foreground">{t('mcp.statusActive')}</span>
                ) : apiKeyFor === c.connectionKey ? (
                  <span className="flex items-center gap-1">
                    <Input
                      type="password"
                      className="h-7 w-[140px] text-xs"
                      autoComplete="new-password"
                      placeholder={t('mcp.menu.apiKeyPlaceholder')}
                      value={apiKeyVal}
                      onChange={(e) => setApiKeyVal(e.target.value)}
                      aria-label={t('mcp.menu.apiKeyPlaceholder')}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      disabled={busyKey === c.connectionKey || !apiKeyVal.trim()}
                      onClick={() => onSaveApiKey(c)}
                    >
                      {t('mcp.menu.save')}
                    </Button>
                  </span>
                ) : c.status === 'connected' ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="xs"
                    disabled={busyKey === c.connectionKey}
                    onClick={() => onDisconnect(c)}
                  >
                    {busyKey === c.connectionKey && <Loader2 className="size-3 animate-spin" aria-hidden />}
                    {busyKey === c.connectionKey ? t('mcp.menu.disconnecting') : t('mcp.menu.disconnect')}
                  </Button>
                ) : c.authKind === 'oauth' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    disabled={busyKey === c.connectionKey}
                    onClick={() => onConnectOauth(c)}
                  >
                    {busyKey === c.connectionKey && <Loader2 className="size-3 animate-spin" aria-hidden />}
                    {busyKey === c.connectionKey ? t('mcp.menu.connecting') : t('mcp.menu.connect')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    disabled={busyKey === c.connectionKey}
                    onClick={() => {
                      setApiKeyVal('');
                      setApiKeyFor(c.connectionKey);
                    }}
                  >
                    {t('mcp.menu.setKey')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {error && <div className="mt-1.5 px-1.5 py-1 text-xs text-destructive">{error}</div>}
        </div>
      )}
    </div>
  );
}
