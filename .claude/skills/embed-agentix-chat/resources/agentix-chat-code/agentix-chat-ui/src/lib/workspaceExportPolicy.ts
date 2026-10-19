/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// REST workspace export deny/allow policy for chat linkification. Browser mirror
// of docker/shared/workspaceExportPolicy.js — keep in sync manually; JS↔TS drift
// is asserted in workspaceExportPolicy.test.ts (docker/proxy test covers JS only).

/** Dot-dirs allowed in REST session export. `.opencode` omitted — holds MCP auth. */
const EXPORT_VISIBLE_DOT_DIRS = new Set(['.agents', '.claude']);

/** Whether a path segment is exposed via REST list/zip/upload/download. */
export function shouldExposeSessionDirEntry(name: string): boolean {
  if (name === 'opencode.json') return false;
  if (name === 'tmp' || name === '.opencode') return false;
  if (name.startsWith('.') && !EXPORT_VISIBLE_DOT_DIRS.has(name)) return false;
  return true;
}

/** Whether any path segment is blocked by REST export policy. */
export function isDeniedExportPathBySegment(relPath: string): boolean {
  if (!relPath || typeof relPath !== 'string') return false;
  const n = relPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!n) return false;
  for (const seg of n.split('/')) {
    if (!seg) continue;
    if (!shouldExposeSessionDirEntry(seg)) return true;
  }
  return false;
}

/**
 * Whether a `/data/workspace/...` absolute path is previewable/downloadable via REST.
 * Returns false for denied segments (e.g. `tmp/`, `.opencode/`) and traversal attempts.
 */
export function isWorkspacePathExportable(absPath: string): boolean {
  const trimmed = absPath.trim();
  if (!trimmed.startsWith('/data/workspace/')) return false;
  const rel = trimmed.slice('/data/workspace/'.length);
  if (!rel || /\.\.[\\/]/.test(rel)) return false;
  return !isDeniedExportPathBySegment(rel);
}
