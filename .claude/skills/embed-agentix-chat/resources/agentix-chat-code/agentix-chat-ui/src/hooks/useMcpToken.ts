/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useOptionalChatTransport } from '../chatTransportContext';
import { apiBase } from '../lib/apiCore';

const RETRY_INTERVAL_MS = 3000;
const MAX_RETRIES = 10;

/**
 * Fetches an MCP JWT for the given session, enabling the iframe MCP Apps bridge
 * to relay tool calls to the pod's proxy MCP server. Prefers the injected transport's
 * {@code generateMcpToken} when one is provided; falls back to the host
 * {@code Nexus.Mcp/generateMcpToken} endpoint under InClusterTransport.
 *
 * Silently retries on failure (session may not be provisioned yet).
 * Returns null while loading or if the session has no active service.
 */
export function useMcpToken(sessionId: string | null): string | null {
  const [token, setToken] = useState<string | null>(null);
  const retriesRef = useRef(0);
  const transport = useOptionalChatTransport();

  const mint = useCallback(
    async (id: string): Promise<string | null> => {
      try {
        if (transport?.generateMcpToken) {
          const value = await transport.generateMcpToken(id);
          return typeof value === 'string' && value ? value : null;
        }
        const res = await fetch(`${apiBase()}/Nexus.Mcp/generateMcpToken`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: id }),
          credentials: 'include',
        });
        if (!res.ok) {
          return null;
        }
        const json = await res.json();
        const value = json.value !== undefined ? json.value : json;
        return typeof value === 'string' ? value : null;
      } catch {
        return null;
      }
    },
    [transport]
  );

  useEffect(() => {
    if (!sessionId) {
      setToken(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    retriesRef.current = 0;

    async function attempt() {
      if (cancelled) return;
      const result = await mint(sessionId!);
      if (cancelled) return;
      if (result) {
        setToken(result);
        return;
      }
      retriesRef.current += 1;
      if (retriesRef.current < MAX_RETRIES) {
        timer = setTimeout(attempt, RETRY_INTERVAL_MS);
      }
    }
    attempt();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sessionId, mint]);

  return token;
}
