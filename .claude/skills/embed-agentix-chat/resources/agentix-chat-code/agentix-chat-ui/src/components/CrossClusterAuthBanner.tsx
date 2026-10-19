/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { TriangleAlert, X } from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';

interface CrossClusterAuthBannerProps {
  /** appIds with a live cross-cluster-auth frame this session, oldest-first. Empty renders nothing. */
  appIds: string[];
  /** Runs the per-user OAuth for one appId (probe → popup → connect → bind) and, on success,
   *  auto-resumes the agent's task. Rejects when the popup is cancelled / the connect fails, so the
   *  row can surface a retry. Owned by ChatPage (reuses the AppsPicker connectRemoteApp flow). */
  onConnect: (appId: string) => Promise<void>;
  /** Clears one appId's banner — called on the dismiss (X) click. A successful connect clears it via
   *  ChatPage (which removes the appId from `appIds`, unmounting the row). */
  onDismiss: (appId: string) => void;
}

/**
 * Inline, dismissible "connect" banner for a cross-cluster app whose per-user OAuth the in-pod
 * agent can't start. One row per appId (deduped by the caller). The button runs the same browser
 * OAuth popup flow the AppsPicker uses, then ChatPage auto-resumes the agent — mirrors
 * McpAuthExpiredBanner, minus the connection-status reconciliation (the app isn't a registered MCP
 * connection, so there is no status query to name it — the appId IS the identity).
 */
const CrossClusterAuthBanner: React.FC<CrossClusterAuthBannerProps> = ({ appIds, onConnect, onDismiss }) => {
  if (appIds.length === 0) return null;

  // One polite live region for the whole banner set — announced once, not N assertive regions.
  return (
    <div
      className="chat-page__cross-cluster-auth flex flex-col gap-1.5 px-4 pt-2"
      data-testid="cross-cluster-auth-list"
      role="status"
      aria-live="polite"
    >
      {appIds.map((appId) => (
        <CrossClusterAuthRow key={appId} appId={appId} onConnect={onConnect} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const CrossClusterAuthRow: React.FC<{
  appId: string;
  onConnect: (appId: string) => Promise<void>;
  onDismiss: (appId: string) => void;
}> = ({ appId, onConnect, onDismiss }) => {
  const { t } = useTranslation('chat');
  // Local per-row busy/error: only THIS row shows "Connecting…" while its popup is open, and a
  // failure here never touches a sibling row. On success ChatPage removes the appId (unmounts us).
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const connect = async () => {
    setFailed(false);
    setBusy(true);
    try {
      await onConnect(appId);
    } catch {
      // connectRemoteApp surfaces a raw/technical reason (or a popup-cancelled abort); show a
      // localized generic rather than leak untranslated text into this otherwise-localized banner.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="cross-cluster-auth-banner"
      data-app-id={appId}
      className="flex items-start justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-[13px]"
    >
      <div className="flex min-w-0 items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0">
          <p className="m-0 text-foreground">{t('crossClusterAuth.message', { app: appId })}</p>
          {failed && <p className="m-0 mt-1 text-destructive">{t('crossClusterAuth.connectError')}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button type="button" size="xs" variant="outline" onClick={connect} disabled={busy}>
          {busy ? t('crossClusterAuth.connecting') : t('crossClusterAuth.connect')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t('crossClusterAuth.dismissAriaLabel', { app: appId })}
          title={t('dismiss')}
          onClick={() => onDismiss(appId)}
        >
          <X aria-hidden />
        </Button>
      </div>
    </div>
  );
};

export default CrossClusterAuthBanner;
