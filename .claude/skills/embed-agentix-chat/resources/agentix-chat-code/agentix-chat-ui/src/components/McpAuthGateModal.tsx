/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOptionalChatTransport } from '../chatTransportContext';
import { connectionsKeys } from '../hooks/queries/connectionsKeys';
import { useTransportMcpConnect } from '../hooks/useTransportMcpConnect';
import { getMyMcpConnectionStatus } from '../lib/chatApi';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';

interface McpAuthGateModalProps {
  /** The agent whose required MCP connections must be authenticated before chatting. */
  agentDefId: string;
  /** All required connections are connected — proceed to spin up the chat. */
  onReady: () => void;
  /** User backed out before connecting — abort the chat launch. */
  onCancel: () => void;
}

// Gate shown before a chat is spun up: if the chosen agent attaches MCP connections that need
// per-user auth (oauth / apiKey) and the caller hasn't connected them, force the connect step
// first. If nothing needs auth, proceeds immediately (no flash). Reusable from any "start chat"
// entry point.
const McpAuthGateModal: React.FC<McpAuthGateModalProps> = ({ agentDefId, onReady, onCancel }) => {
  const { t } = useTranslation('connect');
  const qc = useQueryClient();
  const transport = useOptionalChatTransport();
  // Prefer transport-provided proxies; fall back to host cookie ConnectionApi (InClusterTransport).
  // staleTime 0 + refetchOnMount 'always' mirror the host useMyMcpConnectionStatus hook: the gate
  // must decide on a fresh fetch, never a stale cached list (see the settled-fetch guard below).
  const statusQuery = useQuery({
    queryKey: connectionsKeys.mcpStatus(agentDefId),
    queryFn: () =>
      transport?.getMyMcpConnectionStatus
        ? transport.getMyMcpConnectionStatus(agentDefId)
        : getMyMcpConnectionStatus(agentDefId),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const [apiKeyFor, setApiKeyFor] = useState<string | null>(null);
  const [apiKeyVal, setApiKeyVal] = useState('');
  const autoProceeded = useRef(false);

  // The connect flow stays imperative (OAuth popup / DCR); on success we invalidate the status
  // query so React Query refetches the auth state.
  const { busyKey, error, connectOAuth, setKey, disconnect } = useTransportMcpConnect(() => {
    void qc.invalidateQueries({ queryKey: connectionsKeys.mcpStatus(agentDefId) });
  });

  // Decide only once the mount's own fetch has settled (`isFetchedAfterMount`) — never on a stale
  // cache hit, so the first chat opened right after a connection is added shows the gate instead of
  // auto-proceeding on the pre-add list. Unlike an `isFetching` guard, this stays true across later
  // background refetches, so React Query's retained `data` keeps the OPEN modal from collapsing when
  // the user connects one of several pending connections (connect → onChanged → mcpStatus refetch).
  // Fails open: a rejected fetch must not block the chat launch.
  const ready = statusQuery.isFetchedAfterMount || statusQuery.isError;
  // Defensive: never `.filter` a C3 map-shaped "array" — that throws and blank-screens ChatPage.
  const statusRows = Array.isArray(statusQuery.data) ? statusQuery.data : [];
  const items = !ready ? null : statusQuery.isError ? [] : statusRows.filter((c) => c.requiresAuth);
  const pending = (items ?? []).filter((c) => c.status !== 'connected');

  // First resolution with nothing left to connect → proceed without showing the modal.
  useEffect(() => {
    if (items !== null && pending.length === 0 && !autoProceeded.current) {
      autoProceeded.current = true;
      onReady();
    }
  }, [items, pending.length, onReady]);

  // Still checking, or auto-proceeding — render nothing.
  if (items === null || (pending.length === 0 && autoProceeded.current)) return null;

  return (
    <Dialog open onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('mcp.gate.title')}</DialogTitle>
          <DialogDescription>{t('mcp.gate.subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {(items ?? []).map((c) => {
            const connected = c.status === 'connected';
            const busy = busyKey === c.connectionKey;
            return (
              <div
                key={c.connectionKey}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{c.name || c.connectionKey}</span>
                  <span className="text-xs text-muted-foreground">
                    {connected ? t('mcp.gate.connected') : t('mcp.gate.needsConnect')}
                  </span>
                </div>
                {connected ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => disconnect(c.connectionKey)}
                    disabled={busy}
                  >
                    {t('mcp.gate.disconnect')}
                  </Button>
                ) : apiKeyFor === c.connectionKey ? (
                  <span className="flex items-center gap-2">
                    <Input
                      type="password"
                      className="h-8 w-40"
                      value={apiKeyVal}
                      placeholder={t('mcp.gate.apiKeyPlaceholder')}
                      onChange={(e) => setApiKeyVal(e.target.value)}
                      autoFocus
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setKey(c.connectionKey, apiKeyVal.trim());
                        setApiKeyFor(null);
                        setApiKeyVal('');
                      }}
                      disabled={busy || !apiKeyVal.trim()}
                    >
                      {t('mcp.gate.save')}
                    </Button>
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      c.authKind === 'oauth' ? connectOAuth(c.connectionKey) : setApiKeyFor(c.connectionKey)
                    }
                    disabled={busy}
                  >
                    {busy ? t('mcp.gate.connecting') : t('mcp.gate.connect')}
                  </Button>
                )}
              </div>
            );
          })}
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('mcp.gate.cancel')}
          </Button>
          <Button type="button" onClick={onReady} disabled={pending.length > 0}>
            {t('mcp.gate.continue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default McpAuthGateModal;
