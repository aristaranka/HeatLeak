/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { observeHostTheme, useAppBridge } from '../hooks/useAppBridge';
import { cn } from '../lib/utils';
import { downloadSessionFile, uploadSessionFiles } from '../lib/workspaceFilesApi';
import type {
  McpUiDisplayMode,
  McpUiMessageRequest,
  McpUiMessageResult,
  McpUiRequestDisplayModeRequest,
} from '@modelcontextprotocol/ext-apps/app-bridge';

export interface InlineAppServerProps {
  agentBaseUrl: string;
  sessionId: string;
  port: number;
  mcpToken: string | null;
  /** Callback invoked when the iframe sends a ui/message (injects a user prompt). */
  onSendMessage?: (text: string) => void;
  /** Callback invoked when the app requests a display mode change. */
  onRequestDisplayMode?: (params: McpUiRequestDisplayModeRequest['params']) => { mode: McpUiDisplayMode };
  /** Current display mode for this app instance. */
  displayMode?: McpUiDisplayMode;
  /** Display modes supported by the host. */
  availableDisplayModes?: McpUiDisplayMode[];
  /** Host-owned panels supply their own border, radius, and dimensions. */
  presentation?: 'card' | 'panel';
  /** Sanitized query parameters forwarded to the live app. */
  queryString?: string;
  /** App IDs already connected to this chat. No credentials or URLs are forwarded. */
  connectedAppIds?: string[];
  /** Remove this server-backed app when its backing process is no longer reachable. */
  onUnavailable?: () => void;
  className?: string;
}

/**
 * Renders a live in-pod server inside an iframe, with the MCP Apps
 * bridge attached (via useAppBridge postMessage handler). The iframe
 * loads through the rproxy app-port route. Tool calls from the app are relayed
 * to the pod's proxy MCP server using Streamable HTTP with the MCP JWT.
 *
 * Security: sandbox="allow-scripts" only — scripts run but the iframe gets an
 * opaque origin, blocking access to parent cookies, DOM, and APIs. postMessage
 * with targetOrigin '*' still works across opaque origins.
 */
export const InlineAppServer: React.FC<InlineAppServerProps> = ({
  agentBaseUrl,
  sessionId,
  port,
  mcpToken,
  onSendMessage,
  onRequestDisplayMode,
  displayMode,
  availableDisplayModes,
  presentation = 'card',
  queryString = '',
  connectedAppIds = [],
  onUnavailable,
  className,
}) => {
  const { t, i18n } = useTranslation('chat');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const src = useMemo(
    () => `${agentBaseUrl.replace(/\/$/, '')}/app-port/${port}/${queryString ? `?${queryString}` : ''}`,
    [agentBaseUrl, port, queryString]
  );
  const bridgeToken = useMemo(
    () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    [src]
  );
  const initialTheme = useMemo(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'), [src]);
  const locale = i18n.resolvedLanguage || i18n.language || 'en';
  // Bootstrap only the locale active when this document is created. Later language changes travel
  // through host-context notifications so the mounted app updates without an iframe reload.
  const initialLocale = useMemo(() => locale, [src]);
  const normalizedConnectedAppIds = useMemo(
    () => [...new Set(connectedAppIds.filter(Boolean))].sort(),
    [connectedAppIds]
  );
  // Keep bootstrap state tied to this iframe document. Live registry changes use postMessage;
  // putting them into the current src would reload the mounted app and discard draft edits.
  const initialConnectedAppIds = useMemo(() => normalizedConnectedAppIds, [src]);
  const hostBootstrap = useMemo(() => {
    const [environment = '', app = ''] = window.location.pathname.split('/').filter(Boolean);
    const cluster = window.location.hostname.split('.')[0] || '';
    const appRoot = `/${environment}/${app}`;
    return {
      appId: [cluster, environment, app].filter(Boolean).join('-'),
      uiKitJs: `${appRoot}/mcp-ui-kit/v1/nexus-mcp-ui.js`,
      uiKitCss: `${appRoot}/mcp-ui-kit/v1/nexus-mcp-ui.css`,
    };
  }, [src]);
  const iframeSrc = `${src}#${new URLSearchParams({
    'nexus-app-bridge': bridgeToken,
    'nexus-theme': initialTheme,
    'nexus-locale': initialLocale,
    'nexus-chat-session': sessionId,
    'nexus-app-id': hostBootstrap.appId,
    'nexus-ui-kit-js': hostBootstrap.uiKitJs,
    'nexus-ui-kit-css': hostBootstrap.uiKitCss,
    'nexus-connected-apps': JSON.stringify(initialConnectedAppIds),
  }).toString()}`;
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

  const { status, connectBridge } = useAppBridge({
    agentBaseUrl,
    sessionId,
    mcpToken,
    iframeRef,
    onMessage: handleMessage,
    onRequestDisplayMode,
    onEscape: handleIframeEscape,
    displayMode,
    availableDisplayModes,
    locale,
  });

  const availabilityCheck = useRef<AbortController | null>(null);
  useEffect(() => () => availabilityCheck.current?.abort(), [src, sessionId]);

  const handleIframeLoad = useCallback(() => {
    connectBridge();
    availabilityCheck.current?.abort();
    if (!onUnavailable) return;
    const controller = new AbortController();
    availabilityCheck.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    // Error documents also fire load. Confirm gateway failure through the authenticated host;
    // obsolete checks must never dismiss a replacement iframe or a reopened app.
    void (async () => {
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const response = await fetch(src, {
            method: 'HEAD',
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          });
          if (controller.signal.aborted || ![502, 503, 504].includes(response.status)) return;
        }
        onUnavailable();
      } catch {
        // Network loss or timeout alone does not establish that the app process ended.
      } finally {
        window.clearTimeout(timeout);
      }
    })();
  }, [connectBridge, onUnavailable, src]);

  useEffect(() => {
    if (status === 'dead-pod') onUnavailable?.();
  }, [onUnavailable, status]);

  // Theme is presentation state, so it must not depend on the MCP transport being healthy. A
  // server-backed app can keep serving its UI while bridge authentication is temporarily down.
  // Send the standard host-context notification directly as a non-sensitive fallback; connected
  // bridges may send the same notification again, which is intentionally idempotent.
  useEffect(
    () =>
      observeHostTheme((theme) => {
        // The iframe is sandboxed without allow-same-origin (see the file header), so its origin is
        // opaque and cannot be named as a concrete targetOrigin; '*' is the only value that reaches
        // an opaque-origin child. The payload is a non-sensitive theme notification.
        // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration
        iframeRef.current?.contentWindow?.postMessage(
          {
            jsonrpc: '2.0',
            method: 'ui/notifications/host-context-changed',
            params: { theme, locale },
          },
          '*'
        );
      }),
    [bridgeToken, locale]
  );

  useEffect(() => {
    // The sandboxed iframe has an opaque origin; bridgeToken authenticates this non-sensitive update.
    // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'nexus-connected-apps-changed',
        bridgeToken,
        connectedAppIds: normalizedConnectedAppIds,
      },
      '*'
    );
  }, [bridgeToken, normalizedConnectedAppIds]);

  // A live-server iframe has an opaque sandbox origin by design. Its own subresource/API requests
  // therefore cannot present the host's C3 cookie to the authenticated app-port proxy. Relay only
  // same-app-port requests from the iframe through the parent, which keeps credentials out of the
  // child while preserving separate server assets and API routes.
  useEffect(() => {
    const iframeWindow = iframeRef.current?.contentWindow;
    if (!iframeWindow) return;
    const appRoot = new URL(src, window.location.origin);
    const appPathPrefix = appRoot.pathname.endsWith('/') ? appRoot.pathname : `${appRoot.pathname}/`;
    const uiKitPathPrefix = new URL(hostBootstrap.uiKitJs, window.location.origin).pathname.replace(
      /nexus-mcp-ui\.js$/,
      ''
    );
    const allowedMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    const maxRequestBytes = 1024 * 1024;
    const maxResponseBytes = 5 * 1024 * 1024;
    const pending = new Map<string | number, AbortController>();

    const reply = (
      type: 'nexus-app-fetch-response' | 'nexus-app-upload-response' | 'nexus-app-download-response',
      requestId: string | number,
      result?: unknown,
      error?: { message: string }
    ) => {
      // Same opaque-origin constraint as above: the sandboxed iframe has no nameable origin, so '*'
      // is required to deliver the reply. The child still authenticates each request/response by the
      // per-session bridgeToken, so a wildcard target does not widen trust.
      // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration
      iframeWindow.postMessage({ type, bridgeToken, requestId, ...(error ? { error } : { result }) }, '*');
    };

    const onWindowMessage = async (event: MessageEvent) => {
      if (event.source !== iframeWindow) return;
      const request = event.data as {
        type?: string;
        bridgeToken?: string;
        requestId?: string | number;
        params?: {
          path?: string;
          method?: string;
          headers?: Record<string, string>;
          body?: string;
          files?: File[];
        };
      };
      // This is intentionally not JSON-RPC: useAppBridge owns that namespace and must never
      // interpret the authenticated transport as an MCP Apps method.
      if (request?.bridgeToken !== bridgeToken || request.requestId == null) return;
      if (request.type === 'nexus-app-fetch-cancel' || request.type === 'nexus-app-upload-cancel') {
        pending.get(request.requestId)?.abort();
        pending.delete(request.requestId);
        return;
      }
      if (
        request.type !== 'nexus-app-fetch' &&
        request.type !== 'nexus-app-upload' &&
        request.type !== 'nexus-app-download'
      )
        return;

      // The child retries its initial GETs until this listener is mounted. Once one copy reaches
      // us, ignore duplicates with the same request id instead of starting a thundering herd of
      // identical app-port fetches while the pod or proxy is warming up.
      if (pending.has(request.requestId)) return;

      const controller = new AbortController();
      pending.set(request.requestId, controller);
      if (request.type === 'nexus-app-download') {
        try {
          const path = request.params?.path;
          if (
            typeof path !== 'string' ||
            !path.startsWith('agent-eval-exports/') ||
            path.includes('\\') ||
            path.split('/').includes('..')
          ) {
            throw new Error('The requested export path is invalid.');
          }
          await downloadSessionFile(agentBaseUrl, sessionId, `sessions/${sessionId}/${path}`);
          reply('nexus-app-download-response', request.requestId, { downloaded: true });
        } catch (err) {
          reply('nexus-app-download-response', request.requestId, undefined, {
            message: err instanceof Error ? err.message : String(err),
          });
        } finally {
          pending.delete(request.requestId);
        }
        return;
      }
      if (request.type === 'nexus-app-upload') {
        try {
          const files = request.params?.files;
          if (!Array.isArray(files) || files.length === 0) throw new Error('Choose at least one file to upload.');
          if (files.length > 8) throw new Error('A case can have at most 8 input files.');
          if (files.some((file) => !(file instanceof File))) throw new Error('The upload contained an invalid file.');
          const oversized = files.find((file) => file.size > 25 * 1024 * 1024);
          if (oversized) throw new Error(`${oversized.name} exceeds the 25 MB file limit.`);
          const result = await uploadSessionFiles(agentBaseUrl, sessionId, files, {
            signal: controller.signal,
            onUploadProgress: ({ loaded, total }) => {
              // The sandboxed iframe has an opaque origin; bridgeToken authenticates this progress event.
              // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration
              iframeWindow.postMessage(
                {
                  type: 'nexus-app-upload-progress',
                  bridgeToken,
                  requestId: request.requestId,
                  loaded,
                  total,
                },
                '*'
              );
            },
          });
          reply('nexus-app-upload-response', request.requestId, result);
        } catch (err) {
          reply('nexus-app-upload-response', request.requestId, undefined, {
            message: err instanceof Error ? err.message : String(err),
          });
        } finally {
          pending.delete(request.requestId);
        }
        return;
      }
      let timeout: number | undefined;
      let relayTimedOut = false;
      let relayTimeoutSeconds = 0;
      try {
        const rawPath = request.params?.path;
        if (typeof rawPath !== 'string' || !rawPath) throw new Error('path is required');
        const target = rawPath.startsWith(uiKitPathPrefix)
          ? new URL(rawPath, window.location.origin)
          : new URL(rawPath.startsWith('/') ? rawPath.slice(1) : rawPath, appRoot);
        const targetsAppServer = target.origin === appRoot.origin && target.pathname.startsWith(appPathPrefix);
        const targetsUiKit = target.origin === window.location.origin && target.pathname.startsWith(uiKitPathPrefix);
        if (!targetsAppServer && !targetsUiKit) {
          throw new Error('request must stay within this app-port server');
        }
        const method = (request.params?.method || 'GET').toUpperCase();
        if (!allowedMethods.has(method)) throw new Error(`method ${method} is not allowed`);
        // Hindsight-backed reads are bounded at 15s in the app server; approved C3 writes at 30s.
        // The relay must outlive those authoritative bounds or it reports a false connection
        // failure while the server is still doing valid work.
        relayTimeoutSeconds = method === 'GET' ? 20 : 35;
        timeout = window.setTimeout(() => {
          relayTimedOut = true;
          controller.abort();
        }, relayTimeoutSeconds * 1000);
        const body = request.params?.body;
        if (body != null && typeof body !== 'string') throw new Error('body must be a string');
        if (body && new TextEncoder().encode(body).byteLength > maxRequestBytes) {
          throw new Error('request body exceeds 1 MB');
        }
        const requestedHeaders = request.params?.headers || {};
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(requestedHeaders)) {
          const lower = name.toLowerCase();
          if ((lower === 'content-type' || lower === 'accept') && typeof value === 'string') headers[name] = value;
        }
        const response = await fetch(target, {
          method,
          headers,
          body: method === 'GET' ? undefined : body,
          credentials: 'include',
          signal: controller.signal,
        });
        const declaredLength = Number(response.headers?.get?.('content-length') || 0);
        if (declaredLength > maxResponseBytes) {
          throw new Error('response body exceeds 5 MB');
        }
        let responseBody = '';
        if (response.body?.getReader) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let received = 0;
          let chunk = await reader.read();
          while (!chunk.done) {
            const value = chunk.value;
            received += value.byteLength;
            if (received > maxResponseBytes) {
              await reader.cancel();
              throw new Error('response body exceeds 5 MB');
            }
            responseBody += decoder.decode(value, { stream: true });
            chunk = await reader.read();
          }
          responseBody += decoder.decode();
        } else {
          responseBody = await response.text();
          if (new TextEncoder().encode(responseBody).byteLength > maxResponseBytes) {
            throw new Error('response body exceeds 5 MB');
          }
        }
        reply('nexus-app-fetch-response', request.requestId, {
          ok: response.ok,
          status: response.status,
          headers: response.headers?.entries ? Object.fromEntries(response.headers.entries()) : {},
          body: responseBody,
        });
      } catch (err) {
        reply('nexus-app-fetch-response', request.requestId, undefined, {
          message: relayTimedOut
            ? `The app server did not respond within ${relayTimeoutSeconds} seconds. Try again.`
            : err instanceof Error
              ? err.message
              : String(err),
        });
      } finally {
        if (timeout !== undefined) window.clearTimeout(timeout);
        pending.delete(request.requestId);
      }
    };

    window.addEventListener('message', onWindowMessage);
    return () => {
      window.removeEventListener('message', onWindowMessage);
      pending.forEach((controller) => controller.abort());
      pending.clear();
    };
  }, [agentBaseUrl, bridgeToken, hostBootstrap.uiKitJs, sessionId, src]);

  // The parent removes the stale app from its registry in the effect above. Render nothing in the
  // meantime so a dead session never leaves an empty card or a non-interactive placeholder behind.
  if (status === 'dead-pod') return null;

  return (
    <div
      className={cn(
        'inline-app-server relative overflow-hidden',
        isPanel ? 'flex min-h-0 flex-1 flex-col bg-background' : 'rounded-lg border border-border',
        className
      )}
      data-presentation={presentation}
    >
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        className={cn(
          'w-full border-none bg-white dark:bg-zinc-900',
          isPanel ? 'min-h-0 flex-1 self-stretch' : 'h-[480px]'
        )}
        title={t('appServer.iframeTitle', { port })}
        sandbox="allow-scripts allow-downloads allow-forms allow-modals"
        onLoad={handleIframeLoad}
        data-testid="inline-app-server-iframe"
      />
    </div>
  );
};
