/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import type { ChatMessage } from './types';

/**
 * Detects ports where a live server is running based on agent chat messages.
 *
 * The agent signals a running server through tool call output (bash/exec tool)
 * or assistant text containing patterns like:
 *   - "Server running on port 5173"
 *   - "listening on http://localhost:8000"
 *   - "VITE v5.x ready in 200ms — Local: http://localhost:5173/"
 *   - "[mcp-app-server] port=4000"
 *
 * Returns port numbers found. Only user-space ports (1024–65535) are returned;
 * reserved/system ports are filtered out.
 */

const SERVER_PORT_PATTERNS = [
  /(?:listening|running|started|serving|ready)\s+(?:on|at)\s+(?:(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0):)(\d+)/gi,
  /(?:Local|Network):\s+https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/gi,
  /\[mcp-app-server\]\s+port=(\d+)/gi,
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})\b/gi,
];

const MIN_PORT = 1024;
const MAX_PORT = 65535;

const BLOCKED_PORTS = new Set([3000, 8081, 9999]);

export interface ActiveServerApp {
  port: number;
  queryString: string;
}

export interface ServerAppDescriptor extends ActiveServerApp {
  instanceId: string;
  title: string;
  sourceMessageId: string;
  requestedDisplayMode?: 'inline' | 'pip';
}

const INSTANCE_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_TITLE_CHARS = 80;
const MAX_QUERY_KEYS = 20;
const MAX_QUERY_KEY_CHARS = 128;
const MAX_QUERY_VALUE_CHARS = 2048;

function isUserSpacePort(port: number): boolean {
  return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT && !BLOCKED_PORTS.has(port);
}

export function detectServerPorts(text: string): number[] {
  const ports = new Set<number>();
  for (const pattern of SERVER_PORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const port = parseInt(match[1], 10);
      if (isUserSpacePort(port)) ports.add(port);
    }
  }
  return [...ports];
}

/**
 * Scans recent chat messages for server-start signals. Returns the most
 * recently detected port, or null if none found.
 *
 * Only TOOL_CALL messages (bash/exec tool output) in RUNNING or COMPLETED
 * state are considered — the most reliable signal. Assistant TEXT messages are
 * intentionally ignored: agent prose mentions ports in documentation and
 * discussion contexts too, so trusting it produces false positives.
 */
function sanitizedQueryString(value: string): string {
  const incoming = new URLSearchParams(value);
  const safe = new URLSearchParams();
  let count = 0;
  incoming.forEach((fieldValue, key) => {
    if (count >= MAX_QUERY_KEYS || !key || key.length > MAX_QUERY_KEY_CHARS) return;
    if (fieldValue.length > MAX_QUERY_VALUE_CHARS) return;
    safe.set(key, fieldValue);
    count += 1;
  });
  return safe.toString();
}

function sanitizedDeepLink(text: string): string {
  const match = /deep link:\s*\?([^\r\n]+?)(?:\.\s*)?$/im.exec(text);
  if (!match) return '';
  return sanitizedQueryString(match[1]);
}

/**
 * App announcements are a small stdout protocol, not arbitrary text search.
 * Only complete marker lines from launch-capable tool output are trusted.
 * Tool-name filtering prevents examples printed while reading or writing a
 * skill/source file from opening phantom apps. Launchers may print readiness
 * details (such as detached PIDs) before announcing one or more applications.
 */
function markerLines(text: string): string {
  const lines = text.split(/\r?\n/);
  const markers: string[] = [];
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line && markers.length === 0) continue;
    if (!/^\[mcp-app-server\]\s+(?:\{[^\r\n]+\}|port=\d+)$/.test(line)) break;
    markers.unshift(line);
  }
  return markers.join('\n');
}

function canAnnounceServerApp(msg: ChatMessage): boolean {
  const toolName = (msg.toolName || msg.data?.name || '').toLowerCase();
  if (!toolName) return true; // Historical transcripts did not persist tool names.
  return (
    toolName === 'bash' ||
    toolName === 'exec' ||
    toolName === 'exec_command' ||
    toolName === 'shell' ||
    toolName.startsWith('fewshot_') ||
    toolName.includes('__fewshot_')
  );
}

function structuredMarkers(text: string): Array<Omit<ServerAppDescriptor, 'sourceMessageId'>> {
  const descriptors: Array<Omit<ServerAppDescriptor, 'sourceMessageId'>> = [];
  const markerBlock = markerLines(text);
  const marker = /\[mcp-app-server\]\s+(\{[^\r\n]+\})/gi;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(markerBlock)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      const instanceId = typeof parsed.id === 'string' ? parsed.id : '';
      const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
      const port = typeof parsed.port === 'number' ? parsed.port : Number(parsed.port);
      const requestedDisplayMode = parsed.requestedDisplayMode;
      if (
        !INSTANCE_ID_RE.test(instanceId) ||
        !title ||
        title.length > MAX_TITLE_CHARS ||
        !isUserSpacePort(port) ||
        (requestedDisplayMode !== undefined && requestedDisplayMode !== 'inline' && requestedDisplayMode !== 'pip')
      ) {
        continue;
      }
      descriptors.push({
        instanceId,
        title,
        port,
        ...(requestedDisplayMode ? { requestedDisplayMode } : {}),
        queryString:
          typeof parsed.queryString === 'string'
            ? sanitizedQueryString(parsed.queryString.replace(/^\?/, ''))
            : sanitizedDeepLink(text),
      });
    } catch {
      // Malformed structured markers are ignored instead of falling through to their embedded port.
    }
  }
  return descriptors;
}

/** Returns every valid server-app event in transcript order. */
export function findServerAppEvents(messages: ChatMessage[]): ServerAppDescriptor[] {
  const events: ServerAppDescriptor[] = [];
  messages.forEach((msg, messageIndex) => {
    if (msg.role === 'USER' || msg.kind !== 'TOOL_CALL') return;
    if (msg.toolState !== 'RUNNING' && msg.toolState !== 'COMPLETED') return;
    if (!canAnnounceServerApp(msg)) return;
    const text = getMessageText(msg);
    if (!text) return;
    const sourceMessageId = msg.id || `tool-${messageIndex}`;
    const structured = structuredMarkers(text);
    if (structured.length > 0) {
      structured.forEach((descriptor) => events.push({ ...descriptor, sourceMessageId }));
      return;
    }
    const explicitLegacy = /\[mcp-app-server\]\s+port=(\d+)/gi;
    const markerBlock = markerLines(text);
    let legacy: RegExpExecArray | null;
    while ((legacy = explicitLegacy.exec(markerBlock)) !== null) {
      const port = Number(legacy[1]);
      if (!isUserSpacePort(port)) continue;
      events.push({
        instanceId: `port-${port}`,
        title: `App ${port}`,
        port,
        queryString: sanitizedDeepLink(text),
        sourceMessageId,
      });
    }
  });
  return events;
}

export function findActiveServerApp(messages: ChatMessage[]): ActiveServerApp | null {
  const events = findServerAppEvents(messages);
  if (events.length > 0) {
    const latest = events[events.length - 1];
    return { port: latest.port, queryString: latest.queryString };
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'USER') continue;
    if (msg.kind !== 'TOOL_CALL') continue;
    if (msg.toolState !== 'RUNNING' && msg.toolState !== 'COMPLETED') continue;
    if (!canAnnounceServerApp(msg)) continue;

    const text = getMessageText(msg);
    if (!text) continue;

    const ports = detectServerPorts(text);
    if (ports.length > 0) return { port: ports[ports.length - 1], queryString: sanitizedDeepLink(text) };
  }

  return null;
}

export function findActiveServerPort(messages: ChatMessage[]): number | null {
  return findActiveServerApp(messages)?.port ?? null;
}

function getMessageText(msg: ChatMessage): string {
  if (msg.data?.output) return String(msg.data.output);
  if (msg.data?.text) return String(msg.data.text);
  return msg.text ? String(msg.text) : '';
}
