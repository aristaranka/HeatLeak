/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Platform-owned MCP Apps bridge, injected into every ui:// resource app before its
 * own scripts run. It removes the single most common failure in agent-generated apps:
 * hand-rolling the postMessage/JSON-RPC handshake with a slightly-wrong envelope (e.g.
 * `{type:'ui/initialize'}` instead of `{jsonrpc,id,method,params}`), which the host
 * AppBridge ignores → the app retries forever and shows a false "bridge did not respond"
 * timeout. By owning the handshake here, correctness no longer depends on the model
 * reproducing the exact protocol.
 *
 * The script speaks the exact protocol the host AppBridge (useAppBridge.ts) expects and
 * exposes a stable global the app uses instead of any hand-rolled bridge:
 *
 *   window.mcp.ready                 // Promise — resolves once the bridge is connected
 *   window.mcp.isReady()             // boolean
 *   window.mcp.listTools()           // → Promise<Tool[]>
 *   window.mcp.callTool(name, args)  // → Promise<result> (Boxed tool-result text unwrapped to JSON)
 *   window.mcp.sendMessage(text)     // ui/message — injects a user turn into the chat
 *   window.mcp.call(method, params)  // low-level JSON-RPC escape hatch
 *
 * plus a document `mcp-ready` event. The script is idempotent (guards `window.mcp`) so a
 * second copy — e.g. an app that also pasted the old helper — is a no-op.
 */
export const MCP_BRIDGE_SCRIPT = `
(function(){
  if (window.mcp) return; // idempotent — do not double-install
  var nextId = 1, pending = {}, ready = false, inFlight = false, timer = null, readyResolve;
  var readyPromise = new Promise(function(r){ readyResolve = r; });

  window.addEventListener('message', function(e){
    if (e.source !== window.parent) return;
    var m = e.data;
    if (!m || typeof m !== 'object') return;
    if (m.id != null && pending[m.id]) {
      var p = pending[m.id]; delete pending[m.id];
      if (m.error) p.rej(m.error); else p.res(m.result);
    }
  });

  // Keyboard events do not cross an iframe boundary. Forward Escape as a
  // source-scoped host signal so fullscreen can restore the app's prior surface.
  window.addEventListener('keydown', function(e){
    if (e.key !== 'Escape') return;
    window.parent.postMessage({ type: 'nexus-mcp-app-keydown', key: 'Escape' }, '*');
  });

  function call(method, params, timeoutMs){
    return new Promise(function(res, rej){
      var id = nextId++; pending[id] = { res: res, rej: rej };
      window.parent.postMessage({ jsonrpc: '2.0', id: id, method: method, params: params || {} }, '*');
      setTimeout(function(){ if (pending[id]) { delete pending[id]; rej(new Error(method + ' timed out')); } }, timeoutMs || 15000);
    });
  }

  // Retry ui/initialize until the host bridge (which attaches asynchronously) answers.
  // inFlight guards a duplicate in-flight handshake; the retry stops on the first response.
  function init(){
    if (ready || inFlight) return;
    inFlight = true;
    call('ui/initialize', { protocolVersion: '2026-01-26', appCapabilities: {}, appInfo: { name: 'Nexus MCP App', version: '1.0.0' } }, 500)
      .then(function(r){
        inFlight = false;
        if (r && !ready) {
          ready = true;
          if (timer) clearInterval(timer);
          window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} }, '*');
          try { document.dispatchEvent(new Event('mcp-ready')); } catch (e) {}
          readyResolve();
        }
      })
      .catch(function(){ inFlight = false; });
  }

  // tools/call returns MCP content ({content:[{type:'text',text}]}); the exec tools box a
  // JSON string in there. Unwrap to the inner value so callers get clean data.
  function unwrap(r){
    if (r && r.content && r.content[0] && typeof r.content[0].text === 'string') {
      try { return JSON.parse(r.content[0].text); } catch (e) { return r.content[0].text; }
    }
    return r;
  }

  window.mcp = {
    ready: readyPromise,
    isReady: function(){ return ready; },
    call: call,
    listTools: function(){ return call('tools/list', {}).then(function(r){ return (r && r.tools) || []; }); },
    callTool: function(name, args){ return call('tools/call', { name: name, arguments: args || {} }).then(unwrap); },
    sendMessage: function(text){ return call('ui/message', { role: 'user', content: [{ type: 'text', text: String(text) }] }); }
  };

  init();
  timer = setInterval(init, 500);
})();
`;

/**
 * Insert the platform bridge script so it runs before the app's own scripts. Prefer
 * right after `<head>` (or `<html>`); fall back to prepending. Returning the HTML
 * unchanged is never correct here — an app with no bridge is exactly the failure this
 * guards against — so the fallback still prepends the script.
 */
export function injectMcpBridge(html: string): string {
  const scriptTag = `<script>${MCP_BRIDGE_SCRIPT}</script>`;
  const head = html.match(/<head[^>]*>/i);
  if (head && head.index != null) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + scriptTag + html.slice(at);
  }
  const htmlTag = html.match(/<html[^>]*>/i);
  if (htmlTag && htmlTag.index != null) {
    const at = htmlTag.index + htmlTag[0].length;
    return html.slice(0, at) + scriptTag + html.slice(at);
  }
  return scriptTag + html;
}
