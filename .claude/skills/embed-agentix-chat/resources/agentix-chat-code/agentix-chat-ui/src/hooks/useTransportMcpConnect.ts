/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useCallback, useState } from 'react';
import { useOptionalChatTransport } from '../chatTransportContext';
import {
  connectMcp as hostConnectMcp,
  disconnectMcp as hostDisconnectMcp,
  getMcpOAuthUrl as hostGetMcpOAuthUrl,
  setMcpApiKey as hostSetMcpApiKey,
} from '../lib/chatApi';
import { generatePkce, oauthRedirectUri, openOAuthPopup } from '../lib/oauthPopup';

/**
 * MCP connect/disconnect actions for ChatPage chrome. Prefer the injected transport's BFF
 * proxies when the transport provides them; fall back to host {@code @/lib/api} cookie calls.
 */
export function useTransportMcpConnect(onChanged: () => void) {
  const transport = useOptionalChatTransport();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      setError('');
      setBusyKey(key);
      try {
        await fn();
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed.');
      } finally {
        setBusyKey(null);
      }
    },
    [onChanged]
  );

  const connectOAuth = useCallback(
    (key: string) =>
      run(key, async () => {
        const pkce = await generatePkce();
        const getUrl = transport?.getMcpOAuthUrl ?? hostGetMcpOAuthUrl;
        const connect = transport?.connectMcp ?? hostConnectMcp;
        const url = await getUrl(key, oauthRedirectUri(), pkce.codeChallenge, pkce.codeVerifier);
        const { code, state } = await openOAuthPopup(url, key);
        await connect(key, code, state);
      }),
    [run, transport]
  );

  const setKey = useCallback(
    (key: string, apiKey: string) => run(key, () => (transport?.setMcpApiKey ?? hostSetMcpApiKey)(key, apiKey)),
    [run, transport]
  );

  const disconnect = useCallback(
    (key: string) => run(key, () => (transport?.disconnectMcp ?? hostDisconnectMcp)(key)),
    [run, transport]
  );

  return { busyKey, error, connectOAuth, setKey, disconnect };
}
