/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useCallback, useState } from 'react';
import { getMcpOAuthUrl, connectMcp, setMcpApiKey, disconnectMcp } from './chatApi';
import { generatePkce, oauthRedirectUri, openOAuthPopup } from './oauthPopup';

// Shared per-user MCP connect/disconnect actions, used by both the MCP grid and the detail page.
// Tracks which connection is mid-action (busyKey) and the last error.
export function useMcpConnect(onChanged: () => void) {
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
        const url = await getMcpOAuthUrl(key, oauthRedirectUri(), pkce.codeChallenge, pkce.codeVerifier);
        const { code, state } = await openOAuthPopup(url, key);
        await connectMcp(key, code, state);
      }),
    [run]
  );

  const setKey = useCallback((key: string, apiKey: string) => run(key, () => setMcpApiKey(key, apiKey)), [run]);
  const disconnect = useCallback((key: string) => run(key, () => disconnectMcp(key)), [run]);

  return { busyKey, error, connectOAuth, setKey, disconnect };
}
