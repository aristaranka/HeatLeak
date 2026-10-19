/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import type { ChatMessage } from './types';

export interface ResourceAppInfo {
  uri: string;
  toolArguments: unknown;
  toolResult: unknown;
  /** Only Nexus' ui-app-publish output needs the generated-app compatibility bridge. */
  compatibilityBridge?: boolean;
  requestedDisplayMode?: 'inline' | 'pip';
  /** Id of the TOOL_CALL message that published the app — anchors the inline render in the thread. */
  sourceMessageId?: string;
}

/**
 * Extracts `_meta.ui.resourceUri` from a parsed tool result object.
 * Supports both the nested form (`_meta.ui.resourceUri`) and the deprecated
 * flat key (`_meta["ui/resourceUri"]`).
 */
function extractResourceUri(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  const meta = obj._meta;
  if (!meta || typeof meta !== 'object') return null;
  const metaObj = meta as Record<string, unknown>;

  // Nested: _meta.ui.resourceUri
  if (metaObj.ui && typeof metaObj.ui === 'object') {
    const uri = (metaObj.ui as Record<string, unknown>).resourceUri;
    if (typeof uri === 'string' && uri) return uri;
  }

  // Deprecated flat: _meta["ui/resourceUri"]
  const flatUri = metaObj['ui/resourceUri'];
  if (typeof flatUri === 'string' && flatUri) return flatUri;

  return null;
}

function extractRequestedDisplayMode(parsed: unknown): ResourceAppInfo['requestedDisplayMode'] {
  if (!parsed || typeof parsed !== 'object') return undefined;
  const meta = (parsed as Record<string, unknown>)._meta;
  if (!meta || typeof meta !== 'object') return undefined;
  const ui = (meta as Record<string, unknown>).ui;
  if (!ui || typeof ui !== 'object') return undefined;
  const mode = (ui as Record<string, unknown>).requestedDisplayMode;
  return mode === 'inline' || mode === 'pip' ? mode : undefined;
}

/**
 * Scans chat messages (newest-first) for completed TOOL_CALL messages whose
 * output contains a `_meta.ui.resourceUri`. Returns the most recent match
 * with the URI, tool arguments, and parsed tool result.
 */
export function findResourceApp(messages: ChatMessage[]): ResourceAppInfo | null {
  return findResourceApps(messages).at(-1) ?? null;
}

/** Returns one descriptor per resource URI, updating it from the newest matching tool call. */
export function findResourceApps(messages: ChatMessage[]): ResourceAppInfo[] {
  const apps = new Map<string, ResourceAppInfo>();
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'USER') continue;
    if (msg.kind !== 'TOOL_CALL') continue;
    if (msg.toolState !== 'COMPLETED') continue;

    const output = msg.data?.output;
    if (!output || typeof output !== 'string') continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      continue;
    }

    const uri = extractResourceUri(parsed);
    if (!uri) continue;

    apps.set(uri, {
      uri,
      toolArguments: msg.data?.input ?? null,
      toolResult: parsed,
      compatibilityBridge: (msg.toolName || msg.data?.name) === 'ui-app-publish',
      requestedDisplayMode: extractRequestedDisplayMode(parsed),
      sourceMessageId: msg.id,
    });
  }
  return [...apps.values()];
}

/**
 * Declaration-based detection for standard MCP Apps servers (e.g. an external MCP connection like
 * excalidraw). Unlike the in-pod `ui-app-publish` path, a standard server declares its UI on the
 * *tool* (`tools/list` `_meta.ui.resourceUri`), not in the tool result — so `findResourceApp`
 * (which scans results) never sees it. `toolUiMap` maps a tool name → its declared `ui://` resource
 * (built from the aggregated `tools/list`); this finds the most recent completed TOOL_CALL of such
 * a tool and returns its resource so the host mounts the app.
 */
export function findResourceAppFromToolUi(
  messages: ChatMessage[],
  toolUiMap: Record<string, string> | null | undefined
): ResourceAppInfo | null {
  return findResourceAppsFromToolUi(messages, toolUiMap).at(-1) ?? null;
}

export function findResourceAppsFromToolUi(
  messages: ChatMessage[],
  toolUiMap: Record<string, string> | null | undefined
): ResourceAppInfo[] {
  if (!toolUiMap || Object.keys(toolUiMap).length === 0) return [];

  const apps = new Map<string, ResourceAppInfo>();
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'USER') continue;
    if (msg.kind !== 'TOOL_CALL') continue;
    if (msg.toolState !== 'COMPLETED') continue;

    const name = msg.toolName || msg.data?.name;
    if (!name || !toolUiMap[name]) continue;

    let parsed: unknown = null;
    const output = msg.data?.output;
    if (typeof output === 'string') {
      try {
        parsed = JSON.parse(output);
      } catch {
        parsed = null;
      }
    }

    const uri = toolUiMap[name];
    apps.set(uri, {
      uri,
      toolArguments: msg.data?.input ?? null,
      toolResult: parsed,
      sourceMessageId: msg.id,
    });
  }
  return [...apps.values()];
}
