/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * MCP App iframes render in a sandboxed, opaque-origin document (`allow-scripts` without
 * `allow-same-origin`), so accessing `window.localStorage` / `sessionStorage` throws a
 * `SecurityError` rather than returning a store. Many off-the-shelf apps (and their deps — e.g.
 * jotai) read storage *unguarded* during init, so that throw crashes the app before its AppBridge
 * handshake completes (observed as an MCP `-32001` timeout on the host).
 *
 * This injects a tiny in-memory storage polyfill as the FIRST script in the document, so those
 * reads resolve to a working (non-persistent) store instead of throwing. It runs before the app's
 * ES-module scripts (a classic inline script executes during parse, ahead of deferred modules), and
 * only replaces storage when the native accessor actually throws — a same-origin document keeps its
 * real (persistent) storage untouched. This keeps the strict opaque-origin sandbox (no parent-origin
 * leak); persistence across reloads is the tradeoff, acceptable for MCP Apps whose state flows over
 * MCP. A same-origin isolated-serving-origin remains the longer-term path for true persistence.
 */
const STORAGE_SHIM = `<script>(function(){
  function mem(){var d=Object.create(null);return{
    getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null;},
    setItem:function(k,v){d[String(k)]=String(v);},
    removeItem:function(k){delete d[String(k)];},
    clear:function(){d=Object.create(null);},
    key:function(i){var ks=Object.keys(d);return i>=0&&i<ks.length?ks[i]:null;},
    get length(){return Object.keys(d).length;}
  };}
  ['localStorage','sessionStorage'].forEach(function(name){
    var broken=false;
    try{void window[name];}catch(e){broken=true;}
    if(broken){try{Object.defineProperty(window,name,{value:mem(),configurable:true,writable:false});}catch(_){}}
  });
})();</script>`;

/**
 * Return `html` with the in-memory storage shim injected as the first `<head>` script (falling back
 * to a document prefix when there is no `<head>`). Idempotent-safe to call once per fetched app.
 */
export function injectStorageShim(html: string): string {
  if (typeof html !== 'string' || !html) return html;
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    const idx = (headMatch.index ?? 0) + headMatch[0].length;
    return html.slice(0, idx) + STORAGE_SHIM + html.slice(idx);
  }
  return STORAGE_SHIM + html;
}
