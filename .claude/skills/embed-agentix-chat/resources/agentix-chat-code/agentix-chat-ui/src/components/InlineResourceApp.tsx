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
import { Maximize2, Minimize2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { observeHostLanguage, observeHostTheme, useAppBridge } from '../hooks/useAppBridge';
import { injectMcpBridge } from '../lib/mcpAppBridge';
import { injectStorageShim } from '../lib/mcpAppHtml';
import { cn } from '../lib/utils';
import type { ResourceAppInfo } from '../lib/resourceAppDetection';
import type { ChatMessage } from '../lib/types';
import type {
  McpUiDisplayMode,
  McpUiMessageRequest,
  McpUiMessageResult,
  McpUiRequestDisplayModeRequest,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface InlineResourceAppProps {
  agentBaseUrl: string;
  sessionId: string;
  mcpToken: string | null;
  resourceApp: ResourceAppInfo;
  /** Live chat messages — used to push tool input/result to the bridge as they arrive. */
  messages?: ChatMessage[];
  /** Callback invoked when the iframe sends a ui/message (injects a user prompt). */
  onSendMessage?: (text: string) => void;
  /** Callback invoked when the app requests a display mode change. */
  onRequestDisplayMode?: (params: McpUiRequestDisplayModeRequest['params']) => { mode: McpUiDisplayMode };
  /** Current display mode for this app instance. */
  displayMode?: McpUiDisplayMode;
  /** Display modes supported by the host. */
  availableDisplayModes?: McpUiDisplayMode[];
  /** Host-owned panels provide the outer chrome and dimensions. */
  presentation?: 'inline' | 'panel';
  /** Removes this app instance when its MCP resource or originating pod is unavailable. */
  onUnavailable?: () => void;
  className?: string;
}

/**
 * Renders a ui:// resource app inside a sandboxed iframe. The HTML is fetched
 * via MCP resources/read using a standalone Client. The host bridge connects
 * to the blank iframe before srcdoc activates the app, so the app cannot send
 * its initialization request before the host is listening.
 *
 * Flow: mount → fetch resource HTML → connect host bridge → set srcdoc →
 * bridge oninitialized → push toolInput + toolResult.
 *
 * Live tool streaming: when new TOOL_CALL messages arrive in the chat stream
 * (via the `messages` prop), completed tool results are forwarded to the iframe
 * via sendToolInput/sendToolResult so the app can react to agent activity.
 *
 * ui/message: when the iframe sends a ui/message request, the onSendMessage
 * callback injects it into the conversation as a new user turn.
 */
export const InlineResourceApp: React.FC<InlineResourceAppProps> = ({
  agentBaseUrl,
  sessionId,
  mcpToken,
  resourceApp,
  messages,
  onSendMessage,
  onRequestDisplayMode,
  displayMode,
  availableDisplayModes,
  presentation = 'inline',
  onUnavailable,
  className,
}) => {
  const { t } = useTranslation('chat');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const pushedToolIdsRef = useRef<Set<string>>(new Set());
  const isPanel = presentation === 'panel';

  const handleMessage = useCallback(
    async (params: McpUiMessageRequest['params']): Promise<McpUiMessageResult> => {
      if (!onSendMessage) return { isError: true };
      const textBlock = params.content?.find(
        (block: { type: string; text?: string }) => block.type === 'text' && block.text
      ) as { type: string; text: string } | undefined;
      if (textBlock?.text) {
        onSendMessage(textBlock.text);
        return {};
      }
      return { isError: true };
    },
    [onSendMessage]
  );

  const handleIframeEscape = useCallback(() => {
    if (displayMode !== 'fullscreen' || !onRequestDisplayMode) return;
    onRequestDisplayMode({ mode: isPanel ? 'pip' : 'inline' });
  }, [displayMode, isPanel, onRequestDisplayMode]);

  const { status, initializationCount, sendToolInput, sendToolResult, sendToolCancelled } = useAppBridge({
    agentBaseUrl,
    sessionId,
    mcpToken,
    iframeRef,
    enabled: html !== null,
    onMessage: handleMessage,
    onRequestDisplayMode,
    onEscape: handleIframeEscape,
    displayMode,
    availableDisplayModes,
  });

  const postHostContext = useCallback((params: Record<string, unknown>) => {
    // srcDoc iframes have an opaque origin, so '*' is required. This standard notification contains
    // presentation metadata only; authentication and MCP data continue through the AppBridge.
    // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration
    iframeRef.current?.contentWindow?.postMessage(
      { jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params },
      '*'
    );
  }, []);

  // Presentation state must remain live even while the MCP transport is reconnecting. This mirrors
  // the server-app fallback and avoids reloading the srcDoc iframe (and losing app-owned state).
  useEffect(() => observeHostTheme((theme) => postHostContext({ theme })), [postHostContext]);
  useEffect(() => observeHostLanguage((locale) => postHostContext({ locale })), [postHostContext]);

  useEffect(() => {
    if (fetchError || status === 'dead-pod') onUnavailable?.();
  }, [fetchError, onUnavailable, status]);

  // Inject the platform-owned MCP bridge (window.mcp) so the app never hand-rolls the
  // postMessage handshake — the top cause of "bridge did not respond" timeouts in
  // agent-generated apps. See lib/mcpAppBridge.ts.
  // injectStorageShim is applied LAST so its script is the FIRST in <head> (both injectors insert
  // right after <head>, so whichever runs last lands first). The storage polyfill must precede every
  // other script — including any compatibility bridge and the app's ES modules — so no dependency reads
  // window.localStorage (which throws in the opaque-origin sandbox) before it's patched.
  const srcDoc = useMemo(
    () => (html != null ? injectStorageShim(resourceApp.compatibilityBridge ? injectMcpBridge(html) : html) : null),
    [html, resourceApp.compatibilityBridge]
  );

  // Per-app height resize: a fixed 480px cramps wide/tall apps (dashboards, tables).
  // A drag handle below the iframe lets each app claim the height it needs. Pointer
  // capture keeps the drag off the iframe, which would otherwise swallow the events.
  const [appHeight, setAppHeight] = useState(480);
  const resizeStartRef = useRef<{ y: number; h: number } | null>(null);
  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      resizeStartRef.current = { y: e.clientY, h: appHeight };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [appHeight]
  );
  const onResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (!start) return;
    const max = Math.round(window.innerHeight * 0.9);
    setAppHeight(Math.min(Math.max(start.h + (e.clientY - start.y), 240), max));
  }, []);
  const onResizePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    resizeStartRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }, []);

  // Pip panel width resize (horizontal). Same pointer-capture pattern as height.
  const [pipWidth, setPipWidth] = useState(380);
  const pipResizeStartRef = useRef<{ x: number; w: number } | null>(null);
  const onPipResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      pipResizeStartRef.current = { x: e.clientX, w: pipWidth };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [pipWidth]
  );
  const onPipResizePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const start = pipResizeStartRef.current;
    if (!start) return;
    const newWidth = Math.min(Math.max(start.w - (e.clientX - start.x), 280), 600);
    setPipWidth(newWidth);
  }, []);
  const onPipResizePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    pipResizeStartRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  // Expand-to-modal. Toggling this only restyles the SAME container (inline block <-> fixed
  // overlay) — the iframe node is never re-parented or remounted, so the app keeps its live
  // state (loaded data, inputs, scroll) across expand/collapse. Escape collapses.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  // Display-mode visual state. Like `expanded`, fullscreen uses CSS repositioning (position:fixed)
  // so the iframe DOM node is never remounted — the app keeps all live state across the toggle.
  // Pip mode also uses CSS repositioning (fixed right-side panel) for the same reason.
  const effectiveMode = displayMode ?? 'inline';
  const isFullscreen = effectiveMode === 'fullscreen';
  const isPip = effectiveMode === 'pip';
  useEffect(() => {
    // The shared panel owns Escape while a resource app is panel-hosted. Installing this
    // handler there as well would dispatch both "exit fullscreen" and "return inline",
    // closing the tab instead of returning it to the panel.
    if (!isFullscreen || isPanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onRequestDisplayMode) {
        onRequestDisplayMode({ mode: 'inline' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen, isPanel, onRequestDisplayMode]);

  useEffect(() => {
    if (!mcpToken || !agentBaseUrl || !resourceApp.uri) return;

    let cancelled = false;
    let client: Client | null = null;

    async function fetchHtml() {
      try {
        const mcpUrl = `${agentBaseUrl.replace(/\/$/, '')}/mcp/${sessionId}/sse`;
        const transport = new StreamableHTTPClientTransport(new URL(mcpUrl, window.location.origin), {
          requestInit: { headers: { Authorization: `Bearer ${mcpToken}` } },
        });

        client = new Client({ name: 'NexusResourceFetch', version: '1.0.0' });
        await client.connect(transport);

        const response = await client.readResource({ uri: resourceApp.uri });
        const content = response.contents?.[0];
        const text = content && 'text' in content ? (content.text as string) : null;

        if (cancelled) return;
        if (text) {
          // Raw HTML here; the storage shim + mcp bridge are injected in the `srcDoc` memo (ordered
          // so the shim is the first script). See lib/mcpAppHtml / lib/mcpAppBridge.
          setHtml(text);
        } else {
          setFetchError(true);
        }
      } catch {
        if (!cancelled) setFetchError(true);
      } finally {
        client?.close().catch(() => {});
      }
    }

    fetchHtml();
    return () => {
      cancelled = true;
    };
  }, [mcpToken, agentBaseUrl, resourceApp.uri, sessionId]);

  useEffect(() => {
    if (status !== 'connected' || initializationCount === 0) return;

    if (resourceApp.toolArguments != null && typeof resourceApp.toolArguments === 'object') {
      sendToolInput({ arguments: resourceApp.toolArguments as Record<string, unknown> });
    }
    if (resourceApp.toolResult != null) {
      sendToolResult(resourceApp.toolResult as CallToolResult);
    }
  }, [status, initializationCount, resourceApp.toolArguments, resourceApp.toolResult, sendToolInput, sendToolResult]);

  // Live tool-result streaming: whenever a new TOOL_CALL message reaches COMPLETED
  // or CANCELLED state in the chat stream, push it to the iframe so the app stays
  // aware of agent activity without out-of-band workarounds.
  useEffect(() => {
    if (status !== 'connected' || !messages) return;

    for (const msg of messages) {
      if (msg.kind !== 'TOOL_CALL' || !msg.id) continue;
      if (pushedToolIdsRef.current.has(msg.id)) continue;

      if (msg.toolState === 'COMPLETED' && msg.data?.output) {
        pushedToolIdsRef.current.add(msg.id);
        const input = msg.data.input as Record<string, unknown> | undefined;
        if (input) {
          sendToolInput({ arguments: input });
        }
        try {
          const parsed = JSON.parse(msg.data.output);
          sendToolResult({ content: [{ type: 'text', text: JSON.stringify(parsed) }] });
        } catch {
          sendToolResult({ content: [{ type: 'text', text: msg.data.output }] });
        }
      } else if (msg.toolState === 'CANCELLED') {
        pushedToolIdsRef.current.add(msg.id);
        sendToolCancelled(msg.data?.reason || 'Tool execution cancelled');
      }
    }
  }, [status, messages, sendToolInput, sendToolResult, sendToolCancelled]);

  if (fetchError || status === 'dead-pod') {
    return null;
  }

  if (!html) {
    return (
      <div className={cn('inline-resource-app relative overflow-hidden rounded-lg border border-border', className)}>
        <div className="flex h-[200px] items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <>
      {expanded && !isPanel && (
        <div
          key="backdrop"
          className="fixed inset-0 z-40 bg-black/60"
          onClick={() => setExpanded(false)}
          data-testid="inline-resource-app-backdrop"
        />
      )}
      {isFullscreen && !isPanel && (
        <div
          key="fullscreen-backdrop"
          className="fixed inset-0 z-40 bg-black/60"
          data-testid="inline-resource-app-fullscreen-backdrop"
        />
      )}
      {/* Single container whose CSS toggles inline <-> modal <-> fullscreen <-> pip. The
          iframe below stays at a stable position in this subtree across toggles, so
          React never remounts it and the app keeps its state. */}
      <div
        key="app"
        className={cn(
          'inline-resource-app overflow-hidden rounded-lg border border-border bg-background',
          isPanel ? 'flex h-full min-h-0 flex-1 flex-col rounded-none border-0' : '',
          expanded && !isPanel ? 'fixed inset-4 z-50 flex flex-col shadow-2xl md:inset-10' : '',
          isFullscreen && !isPanel ? 'fixed inset-0 z-50 flex flex-col rounded-none shadow-2xl' : '',
          isPip && !isPanel ? 'fixed right-0 top-0 z-40 flex h-full flex-col rounded-none border-l shadow-xl' : '',
          !isPanel && !expanded && !isFullscreen && !isPip ? 'relative' : '',
          className
        )}
        style={isPip && !isPanel ? { width: pipWidth } : undefined}
        data-testid={isFullscreen ? 'fullscreen-overlay' : isPip ? 'pip-panel' : undefined}
        {...(isFullscreen
          ? { role: 'dialog', 'aria-modal': true, 'aria-label': t('appServer.exitFullscreen', 'Exit fullscreen') }
          : {})}
      >
        {/* Fullscreen header with exit */}
        {isFullscreen && !isPanel && (
          <div className="flex items-center justify-end border-b border-border px-3 py-1.5">
            {onRequestDisplayMode && (
              <button
                type="button"
                onClick={() => onRequestDisplayMode({ mode: 'inline' })}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t('appServer.exitFullscreen', 'Exit fullscreen')}
                title={t('appServer.exitFullscreen', 'Exit fullscreen')}
                data-testid="fullscreen-overlay-exit"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        {/* Pip header with resize handle + dismiss */}
        {isPip && !isPanel && (
          <>
            <button
              type="button"
              className="absolute bottom-0 left-0 top-0 z-[5] w-1.5 cursor-col-resize border-0 bg-transparent p-0 transition-colors hover:bg-primary focus-visible:bg-primary focus-visible:outline-none"
              aria-label={t('panelResize')}
              title={t('panelResize')}
              onPointerDown={onPipResizePointerDown}
              onPointerMove={onPipResizePointerMove}
              onPointerUp={onPipResizePointerUp}
            />
            <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t('appServer.pipPanel', 'App Panel')}</span>
              {onRequestDisplayMode && (
                <button
                  type="button"
                  onClick={() => onRequestDisplayMode({ mode: 'inline' })}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t('appServer.collapse')}
                  title={t('appServer.collapse')}
                  data-testid="pip-panel-dismiss"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </>
        )}
        {/* Inline/expanded expand-collapse button */}
        {!isPanel && !isFullscreen && !isPip && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={t(expanded ? 'appServer.collapse' : 'appServer.expand')}
            title={t(expanded ? 'appServer.collapse' : 'appServer.expand')}
            className="absolute right-1.5 top-1.5 z-10 rounded-md bg-background/70 p-1 text-muted-foreground backdrop-blur hover:bg-muted hover:text-foreground"
            data-testid="inline-resource-app-expand"
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        )}
        <iframe
          key="resource-app-frame"
          ref={iframeRef}
          srcDoc={status === 'ready' || status === 'connected' ? (srcDoc ?? undefined) : undefined}
          className={cn(
            'w-full border-none bg-white dark:bg-zinc-900',
            (isPanel || expanded || isFullscreen || isPip) && 'min-h-0 flex-1'
          )}
          style={isPanel || expanded || isFullscreen || isPip ? undefined : { height: appHeight }}
          title="Resource app"
          sandbox="allow-scripts allow-downloads allow-forms allow-modals"
          data-testid="inline-resource-app-iframe"
        />
        {!isPanel && !expanded && !isFullscreen && !isPip && (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={t('appServer.resizeHandle')}
            title={t('appServer.resizeHandle')}
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            className="flex h-2.5 w-full cursor-row-resize touch-none items-center justify-center bg-muted/40 hover:bg-muted"
            data-testid="inline-resource-app-resize"
          >
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>
        )}
      </div>
    </>
  );
};
