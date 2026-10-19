/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { useEffect, useRef, useState } from 'react';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/** Read a tool's declared MCP Apps UI resource from its `_meta` (nested or deprecated-flat form). */
function extractToolUi(tool: Tool): string | null {
  const meta = (tool as { _meta?: unknown })._meta;
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  if (m.ui && typeof m.ui === 'object') {
    const uri = (m.ui as Record<string, unknown>).resourceUri;
    if (typeof uri === 'string' && uri) return uri;
  }
  const flat = m['ui/resourceUri'];
  if (typeof flat === 'string' && flat) return flat;
  return null;
}

/**
 * Fetches the session's aggregated `tools/list` from the pod proxy MCP server and returns a map of
 * `toolName → ui:// resource` for every tool that declares an MCP Apps UI (`_meta.ui.resourceUri`).
 * This is what lets the host detect that a called external MCP-App tool (e.g. excalidraw's
 * `create_view`) should render its `ui://` app, since a standard server declares the UI on the tool
 * rather than echoing it in the tool result. Returns {} until loaded / when disabled.
 */
export function useServerToolUiMap(
  agentBaseUrl: string,
  sessionId: string | null | undefined,
  mcpToken: string | null,
  enabled: boolean
): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  // Preserve identity across renders when the contents don't change, so downstream memos are stable.
  const lastKeyRef = useRef('');

  useEffect(() => {
    if (!enabled || !mcpToken || !agentBaseUrl || !sessionId) {
      if (lastKeyRef.current !== '') {
        lastKeyRef.current = '';
        setMap({});
      }
      return;
    }

    let cancelled = false;
    let client: Client | null = null;

    (async () => {
      try {
        const mcpUrl = `${agentBaseUrl.replace(/\/$/, '')}/mcp/${sessionId}/sse`;
        const transport = new StreamableHTTPClientTransport(new URL(mcpUrl, window.location.origin), {
          requestInit: { headers: { Authorization: `Bearer ${mcpToken}` } },
        });
        client = new Client({ name: 'NexusToolUiMap', version: '1.0.0' });
        await client.connect(transport);
        const result = await client.listTools();
        if (cancelled) return;

        const next: Record<string, string> = {};
        for (const tool of result.tools ?? []) {
          const uri = extractToolUi(tool);
          if (uri) next[tool.name] = uri;
        }
        const key = JSON.stringify(next);
        if (key !== lastKeyRef.current) {
          lastKeyRef.current = key;
          setMap(next);
        }
      } catch {
        // Best-effort — no UI-bearing tools discovered means no declaration-based app to render.
      } finally {
        client?.close().catch(() => {});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agentBaseUrl, sessionId, mcpToken, enabled]);

  return map;
}
