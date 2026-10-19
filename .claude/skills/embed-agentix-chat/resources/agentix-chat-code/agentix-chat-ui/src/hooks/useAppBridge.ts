/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  McpUiDisplayMode,
  McpUiHostCapabilities,
  McpUiHostContext,
  McpUiMessageRequest,
  McpUiMessageResult,
  McpUiRequestDisplayModeRequest,
  McpUiRequestDisplayModeResult,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

export interface AppBridgeOptions {
  agentBaseUrl: string;
  sessionId: string;
  mcpToken: string | null;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  enabled?: boolean;
  /** Callback invoked when the iframe sends a ui/message (user prompt injection). */
  onMessage?: (params: McpUiMessageRequest['params']) => Promise<McpUiMessageResult>;
  /** Callback invoked when the iframe requests a display mode change via ui/request-display-mode. */
  onRequestDisplayMode?: (params: McpUiRequestDisplayModeRequest['params']) => McpUiRequestDisplayModeResult;
  /** Callback invoked when a focused iframe forwards Escape to its host. */
  onEscape?: () => void;
  /** Current display mode for this app instance (passed to the app in hostContext). */
  displayMode?: McpUiDisplayMode;
  /** Display modes the host supports (passed to the app in hostContext). */
  availableDisplayModes?: McpUiDisplayMode[];
  /** Active BCP-47 locale supplied to the mounted app. */
  locale?: string;
}

export type BridgeStatus = 'idle' | 'ready' | 'connected' | 'error' | 'dead-pod';

function isDeadPodConnectionError(message: string): boolean {
  // The proxy deliberately reports upstream Nexus validation failures as a 401 with a
  // `validateHttp_*` reason. Those are transient infrastructure failures (for example, a
  // stale seeded C3 cookie), not evidence that the app server or pod ended. Keeping the
  // distinction here matters for server-backed apps: their own API can remain healthy and
  // editable even while the optional MCP bridge is temporarily unavailable.
  if (
    message.includes('validateHttp_') ||
    message.includes('validateNetworkError') ||
    message.includes('nexusNotSeeded')
  ) {
    return false;
  }
  return /\b(?:401|403)\b/.test(message);
}

export function observeHostTheme(onChange: (theme: 'light' | 'dark') => void): () => void {
  const push = () => onChange(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  push();
  const observer = new MutationObserver(push);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

// lib/i18n.ts keeps <html lang> in sync with the active i18next language (on init and on every
// languageChanged), so observing that attribute — same pattern as observeHostTheme above — is
// enough to mirror the host's locale into hostContext without a direct i18next dependency here.
// hostContext.locale is the McpUiHostContext spec field (BCP 47); <html lang> only ever carries
// the language subtag (no region — see i18n.ts's applyDocumentLang), which is still valid BCP 47.
export function observeHostLanguage(onChange: (locale: string) => void): () => void {
  const push = () => onChange(document.documentElement.lang || 'en');
  push();
  const observer = new MutationObserver(push);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  return () => observer.disconnect();
}

/**
 * Bridges MCP Apps protocol between an iframe and the agent pod's proxy MCP server
 * using the official @modelcontextprotocol/ext-apps SDK.
 *
 * Architecture: iframe (App) ↔ PostMessageTransport ↔ AppBridge ↔ Client ↔ StreamableHTTP ↔ Pod MCP Server
 *
 * The AppBridge acts as the host, automatically forwarding tool/resource requests
 * from the iframe to the remote MCP server via the SDK Client.
 */
export function useAppBridge({
  agentBaseUrl,
  sessionId,
  mcpToken,
  iframeRef,
  enabled = true,
  onMessage,
  onRequestDisplayMode,
  onEscape,
  displayMode,
  availableDisplayModes,
  locale,
}: AppBridgeOptions) {
  const [status, setStatus] = useState<BridgeStatus>('idle');
  const [initializationCount, setInitializationCount] = useState(0);
  const [serverTools, setServerTools] = useState<Tool[]>([]);
  const bridgeRef = useRef<AppBridge | null>(null);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const clientRef = useRef<Client | null>(null);
  const transportRef = useRef<PostMessageTransport | null>(null);
  const compatListenerRef = useRef<((event: MessageEvent) => void) | null>(null);
  // Guards the effect-vs-onLoad race: both trigger connectBridge, and its async
  // cleanup-then-add isn't atomic, so without this two live compatListeners can attach —
  // and every app tools/call / ui/message would then execute twice. A connect already in
  // flight makes a concurrent second call a no-op (a later reconnect still proceeds).
  const connectingRef = useRef(false);
  // Effect cleanup can run while an async connect is still awaiting the pod (notably React
  // StrictMode's setup -> cleanup -> setup probe). Epochs let the stale attempt close itself
  // instead of installing a second bridge after its owning effect has been disposed.
  const lifecycleEpochRef = useRef(0);
  const connectingEpochRef = useRef(-1);
  // The contentWindow the in-flight connect is binding to. An iframe reload (onBridgeReady /
  // tool-completion auto-reload) swaps contentWindow and fires onLoad mid-connect; the guard
  // above would no-op that call and leave the bridge bound to the destroyed window with no
  // reconnect (effect deps unchanged). Tracking the target window lets a stale-window call
  // flag a reconnect instead of silently dropping it.
  const connectingWindowRef = useRef<Window | null>(null);
  const reconnectPendingRef = useRef(false);
  // Latest connectBridge, so the finally can re-run it without a self-reference in its own
  // useCallback initializer.
  const connectBridgeRef = useRef<(() => void) | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onRequestDisplayModeRef = useRef(onRequestDisplayMode);
  onRequestDisplayModeRef.current = onRequestDisplayMode;
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  const connectBridge = useCallback(async () => {
    const iframe = iframeRef.current;
    console.log('[AppBridge] connectBridge called', {
      hasIframe: !!iframe?.contentWindow,
      hasMcpToken: !!mcpToken,
      hasAgentBaseUrl: !!agentBaseUrl,
    });
    if (!iframe?.contentWindow || !mcpToken || !agentBaseUrl) return;
    const targetWindow = iframe.contentWindow;
    const lifecycleEpoch = lifecycleEpochRef.current;
    if (connectingRef.current) {
      // A connect is already in flight. If the iframe has since reloaded to a NEW
      // contentWindow, the running connect is binding to the stale one — request a
      // reconnect to run against the current window once it settles. Same window means
      // the in-flight connect already covers this call, so it stays a no-op.
      if (connectingWindowRef.current !== targetWindow || connectingEpochRef.current !== lifecycleEpoch) {
        reconnectPendingRef.current = true;
      }
      return;
    }
    connectingRef.current = true;
    connectingWindowRef.current = targetWindow;
    connectingEpochRef.current = lifecycleEpoch;

    // Clean up previous bridge (e.g. after iframe reload triggered by onBridgeReady
    // or tool-completion auto-reload) so we reconnect to the new contentWindow.
    if (bridgeRef.current) {
      bridgeRef.current.close().catch(() => {});
      bridgeRef.current = null;
    }
    if (clientRef.current) {
      clientRef.current.close().catch(() => {});
      clientRef.current = null;
    }
    if (transportRef.current) {
      transportRef.current.close().catch(() => {});
      transportRef.current = null;
    }
    if (compatListenerRef.current) {
      window.removeEventListener('message', compatListenerRef.current);
      compatListenerRef.current = null;
    }

    try {
      const mcpUrl = `${agentBaseUrl.replace(/\/$/, '')}/mcp/${sessionId}/sse`;
      console.log('[AppBridge] connecting to MCP server at', mcpUrl);

      const serverTransport = new StreamableHTTPClientTransport(new URL(mcpUrl, window.location.origin), {
        requestInit: {
          headers: { Authorization: `Bearer ${mcpToken}` },
        },
      });

      const client = new Client({ name: 'Nexus', version: '1.0.0' });
      await client.connect(serverTransport);
      if (lifecycleEpochRef.current !== lifecycleEpoch) {
        await client.close().catch(() => {});
        return;
      }
      console.log('[AppBridge] MCP client connected');

      // Fetch available server tools so the bridge can advertise them to the iframe
      // during the ui/initialize handshake (serverTools capability).
      let toolsList: Tool[] = [];
      try {
        const toolsResult = await client.listTools();
        toolsList = toolsResult.tools ?? [];
        console.log('[AppBridge] fetched', toolsList.length, 'server tools');
      } catch (err) {
        console.log('[AppBridge] failed to fetch tools list:', err);
      }
      if (lifecycleEpochRef.current !== lifecycleEpoch) {
        await client.close().catch(() => {});
        return;
      }
      setServerTools(toolsList);

      // Build serverTools capability map from the fetched tools.
      // The spec expects { serverTools: {} } to indicate support; the SDK auto-forwards
      // tools/call and relays the tools list when this capability is present.
      // Also advertise `message: {}` so the iframe can send ui/message requests.
      const capabilities: McpUiHostCapabilities = { serverTools: {}, message: {} };

      const hostContext: McpUiHostContext = {
        displayMode: displayMode ?? 'inline',
        availableDisplayModes: availableDisplayModes ?? ['inline', 'fullscreen', 'pip'],
        theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
        locale: localeRef.current || document.documentElement.lang || 'en',
        platform: 'web',
      };

      const bridge = new AppBridge(client, { name: 'Nexus', version: '1.0.0' }, capabilities, { hostContext });

      bridge.oninitialized = () => {
        if (lifecycleEpochRef.current !== lifecycleEpoch) return;
        console.log('[AppBridge] bridge initialized (iframe handshake complete)');
        setStatus('connected');
        setInitializationCount((count) => count + 1);
      };

      // AppBridge auto-forwards tools/call but not tools/list.
      // Register a handler so the iframe can discover available tools.
      bridge.setRequestHandler(ListToolsRequestSchema, async (req) => {
        return client.listTools(req.params);
      });

      // Wire ui/message: the iframe can inject a message into the conversation.
      bridge.onmessage = async (params) => {
        console.log('[AppBridge] ui/message received from iframe:', params);
        if (onMessageRef.current) {
          try {
            const result = await onMessageRef.current(params);
            console.log('[AppBridge] ui/message handler returned:', result);
            return result;
          } catch (err) {
            console.log('[AppBridge] ui/message handler threw:', err);
            return { isError: true };
          }
        }
        console.log('[AppBridge] ui/message: no onMessage callback, returning empty');
        return {};
      };

      // Wire ui/request-display-mode: the iframe can request inline/fullscreen/pip.
      bridge.onrequestdisplaymode = async (params) => {
        console.log('[AppBridge] ui/request-display-mode received:', params);
        if (onRequestDisplayModeRef.current) {
          const result = onRequestDisplayModeRef.current(params);
          console.log('[AppBridge] display mode set to:', result.mode);
          return result;
        }
        return { mode: 'inline' };
      };

      // Debug: log all events the bridge emits
      bridge.addEventListener('initialized', () => {
        console.log('[AppBridge] EVENT: initialized');
      });

      // Debug: log size changes
      bridge.onsizechange = (params) => {
        console.log('[AppBridge] sizechange:', params);
      };

      // Filter by the exact contentWindow. Opaque sandbox origins still preserve event.source;
      // without this filter, every mounted app bridge consumes every other app's JSON-RPC and
      // hidden apps answer ui/initialize requests that were meant for the selected iframe.
      const iframeTransport = new PostMessageTransport(targetWindow, targetWindow);

      // Universal compatibility adapter. The host SDK (PostMessageTransport) only speaks
      // JSON-RPC, but agent-generated apps frequently INVENT their own postMessage envelope
      // instead of using window.mcp or the standard shape — e.g. {type:'mcp_request', id,
      // method, params} expecting {type:'mcp_response', id, result}, often with no
      // ui/initialize handshake at all. The SDK silently ignores those, so the app hangs.
      // This listener meets the app where it is: any NON-JSON-RPC message carrying an id +
      // method is forwarded to the MCP client and answered in the request's MIRROR envelope
      // (mcp_request -> mcp_response, …). JSON-RPC is left to the SDK to avoid double-responses.
      const compatListener = (event: MessageEvent) => {
        if (event.source !== targetWindow) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        if (data.type === 'nexus-mcp-app-keydown' && data.key === 'Escape') {
          onEscapeRef.current?.();
          return;
        }

        // Log raw messages for diagnostics
        const method = data?.method || `(response id=${data?.id})`;
        console.log('[AppBridge] raw message from iframe:', method, JSON.stringify(data).slice(0, 200));

        // Only requests (id + method) get a reply; responses / method-less notifications are ignored.
        if (data.id == null || typeof data.method !== 'string') return;

        const m: string = data.method;
        const params = data.params || {};

        // Reply in the envelope the app is listening for: mirror jsonrpc, else the request's `type`
        // tag (mcp_request -> mcp_response, mcp-request -> mcp-response), else a bare {id,...}.
        const reqType: string | null = typeof data.type === 'string' ? data.type : null;
        const respType = reqType
          ? reqType.replace(/req(uest)?/i, (mm) => (/^req$/i.test(mm) ? 'resp' : 'response'))
          : null;
        const reply = (payload: Record<string, unknown>) => {
          try {
            const envelope = data.jsonrpc ? { jsonrpc: '2.0' } : respType ? { type: respType } : {};
            // Target origin must be '*': the sandboxed iframe has an opaque origin no explicit
            // targetOrigin can match; the reply is posted to a specific contentWindow, so no data
            // is disclosed to a third party.
            // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration
            targetWindow.postMessage({ ...envelope, id: data.id, ...payload }, '*');
          } catch {
            /* iframe went away between check and post */
          }
        };

        // Legacy shape: ui/message wrapped as a tools/call with name:'ui/message'. Handle it
        // regardless of envelope (even JSON-RPC) — the SDK would otherwise mis-route it to a
        // nonexistent 'ui/message' tool. Short-circuit (no ack) when there is no handler.
        if (m === 'tools/call' && params && params.name === 'ui/message') {
          if (!onMessageRef.current) return;
          const args = params.arguments || {};
          let content = args.content;
          if (typeof content === 'string') content = [{ type: 'text', text: content }];
          else if (!Array.isArray(content)) content = [{ type: 'text', text: JSON.stringify(args) }];
          reply({ result: {} });
          onMessageRef.current({ role: 'user', content } as McpUiMessageRequest['params']).catch(() => {});
          return;
        }

        // Everything else that is JSON-RPC is the SDK's job — don't double-handle.
        if (data.jsonrpc) return;

        if (m.startsWith('notifications/')) return; // fire-and-forget, no reply expected

        void (async () => {
          try {
            if (m === 'ui/initialize') {
              reply({
                result: {
                  protocolVersion: params.protocolVersion || '2026-01-26',
                  hostInfo: { name: 'Nexus', version: '1.0.0' },
                  hostCapabilities: { serverTools: {}, message: {} },
                  hostContext: {
                    displayMode: displayMode ?? 'inline',
                    availableDisplayModes: availableDisplayModes ?? ['inline', 'fullscreen', 'pip'],
                    theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
                    locale: localeRef.current || document.documentElement.lang || 'en',
                    platform: 'web',
                  },
                },
              });
            } else if (m === 'ui/request-display-mode') {
              if (onRequestDisplayModeRef.current) {
                const result = onRequestDisplayModeRef.current(params as McpUiRequestDisplayModeRequest['params']);
                reply({ result });
              } else {
                reply({ result: { mode: 'inline' } });
              }
            } else if (m === 'tools/list') {
              reply({ result: await client.listTools() });
            } else if (m === 'tools/call') {
              reply({ result: await client.callTool(params) });
            } else if (m === 'ui/message') {
              // Ack immediately — a re-render can remount the iframe before the async handler resolves.
              reply({ result: {} });
              onMessageRef
                .current?.((data.params ?? { role: 'user', content: [] }) as McpUiMessageRequest['params'])
                .catch(() => {});
            } else {
              reply({ error: { code: -32601, message: `Method not found: ${m}` } });
            }
          } catch (err) {
            reply({ error: { code: -32000, message: (err as Error)?.message || String(err) } });
          }
        })();
      };
      window.addEventListener('message', compatListener);
      compatListenerRef.current = compatListener;

      await bridge.connect(iframeTransport);
      if (lifecycleEpochRef.current !== lifecycleEpoch) {
        window.removeEventListener('message', compatListener);
        if (compatListenerRef.current === compatListener) compatListenerRef.current = null;
        await bridge.close().catch(() => {});
        await client.close().catch(() => {});
        return;
      }
      console.log('[AppBridge] bridge connected to iframe transport');

      clientRef.current = client;
      bridgeRef.current = bridge;
      transportRef.current = iframeTransport;
      setStatus((current) => (current === 'connected' ? current : 'ready'));
    } catch (err) {
      if (lifecycleEpochRef.current !== lifecycleEpoch) return;
      console.log('[AppBridge] ERROR:', (err as Error).message || err);
      const message = (err as Error).message || '';
      if (isDeadPodConnectionError(message)) {
        setStatus('dead-pod');
      } else {
        setStatus('error');
      }
    } finally {
      connectingRef.current = false;
      connectingWindowRef.current = null;
      connectingEpochRef.current = -1;
      // An iframe reload that arrived mid-connect (targeting a new contentWindow) asked for
      // a reconnect; run it now that the guard is clear so the bridge rebinds to the live
      // window instead of the stale one this connect just wired up.
      if (reconnectPendingRef.current) {
        reconnectPendingRef.current = false;
        connectBridgeRef.current?.();
      }
    }
  }, [iframeRef, mcpToken, agentBaseUrl, sessionId]);

  connectBridgeRef.current = connectBridge;

  useEffect(() => {
    lifecycleEpochRef.current += 1;
    if (!enabled) {
      setStatus('idle');
      return;
    }

    if (mcpToken && agentBaseUrl && iframeRef.current?.contentWindow && !bridgeRef.current) {
      connectBridge();
    }

    return () => {
      lifecycleEpochRef.current += 1;
      reconnectPendingRef.current = false;
      if (bridgeRef.current) {
        bridgeRef.current.close().catch(() => {});
        bridgeRef.current = null;
      }
      if (clientRef.current) {
        clientRef.current.close().catch(() => {});
        clientRef.current = null;
      }
      if (transportRef.current) {
        transportRef.current.close().catch(() => {});
        transportRef.current = null;
      }
      if (compatListenerRef.current) {
        window.removeEventListener('message', compatListenerRef.current);
        compatListenerRef.current = null;
      }
      setStatus('idle');
    };
  }, [enabled, sessionId, mcpToken, agentBaseUrl, connectBridge]);

  const sendToolInput = useCallback((input: { arguments?: Record<string, unknown> }) => {
    bridgeRef.current?.sendToolInput(input);
  }, []);

  const sendToolResult = useCallback((result: CallToolResult) => {
    bridgeRef.current?.sendToolResult(result);
  }, []);

  const sendToolCancelled = useCallback((reason: string) => {
    bridgeRef.current?.sendToolCancelled({ reason });
  }, []);

  const readResource = useCallback(async (uri: string): Promise<string | null> => {
    const client = clientRef.current;
    if (!client) return null;
    const response = await client.readResource({ uri });
    const content = response.contents?.[0];
    if (!content) return null;
    if ('text' in content) return content.text as string;
    return null;
  }, []);

  // Push display mode and live host-theme updates after the bridge is connected. Nexus stores the
  // active theme on the root element, so observing that attribute keeps a long-lived/PIP app in
  // sync without reloading its iframe.
  useEffect(() => {
    if (status !== 'connected') return;
    return observeHostTheme((theme) => {
      bridgeRef.current?.setHostContext({
        displayMode: displayMode ?? 'inline',
        availableDisplayModes: availableDisplayModes ?? ['inline', 'fullscreen', 'pip'],
        theme,
        locale: locale || document.documentElement.lang || 'en',
      });
    });
  }, [displayMode, availableDisplayModes, locale, status]);

  // Same live-sync approach as theme, but as its own effect/observer: language changes
  // independently of theme and displayMode, and McpUiHostContext updates only the fields present
  // in the payload, so there's no need to re-send the other two here.
  useEffect(() => {
    if (status !== 'connected') return;
    return observeHostLanguage((locale) => {
      bridgeRef.current?.setHostContext({ locale });
    });
  }, [status]);

  return {
    status,
    initializationCount,
    serverTools,
    connectBridge,
    sendToolInput,
    sendToolResult,
    sendToolCancelled,
    readResource,
  };
}
