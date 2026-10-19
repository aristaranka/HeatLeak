/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import type { WorkspaceTreeNode } from './chatApi';

/** Synthetic tree row id — matches WorkspaceSidePanel. */
export const WORKSPACE_TREE_ROOT_ROW_ID = '\u0000workspace-root';

/** Session subtree from the agent vs full workspace (no `?sessionId=`). */
export type WorkspaceTreeScope = 'session' | 'workspace';

/** Default expanded dirs when entering a tree scope. */
export function defaultWorkspaceExpandedPaths(scope: WorkspaceTreeScope, sessionId?: string): Set<string> {
  if (scope === 'workspace') {
    return new Set([WORKSPACE_TREE_ROOT_ROW_ID, 'results', 'user-uploads', 'sessions']);
  }
  const next = new Set([WORKSPACE_TREE_ROOT_ROW_ID, 'results', 'user-uploads', 'chat-uploads']);
  const sid = sessionId?.trim();
  if (sid) {
    const prefix = `sessions/${sessionUploadDirForWorkspace(sid)}`;
    for (const name of ['results', 'user-uploads', 'chat-uploads'] as const) {
      next.add(`${prefix}/${name}`);
    }
  }
  return next;
}

/** Must match `uploadDirForSession` in `docker/agent/src/upload.js`. */
export function sessionUploadDirForWorkspace(sessionId: string): string {
  return String(sessionId)
    .replace(/[/\\:?*|"<>]/g, '_')
    .slice(0, 240);
}

/** Default workspace-relative path for a chat attachment by display name. */
export function chatAttachmentWorkspacePath(sessionId: string, fileName: string): string {
  return `sessions/${sessionUploadDirForWorkspace(sessionId)}/chat-uploads/${fileName}`;
}

function collectWorkspaceFiles(nodes: WorkspaceTreeNode[]): WorkspaceTreeNode[] {
  const out: WorkspaceTreeNode[] = [];
  for (const n of nodes) {
    if (n.type === 'file') out.push(n);
    if (n.children?.length) out.push(...collectWorkspaceFiles(n.children));
  }
  return out;
}

/** Match display name to a tree file node (exact name or OS-style `name (N).ext` collision). */
export function findWorkspaceFileByDisplayName(
  roots: WorkspaceTreeNode[] | null | undefined,
  displayName: string
): string | null {
  if (!roots?.length) return null;
  const files = collectWorkspaceFiles(roots);
  const exact = files.find((f) => f.name === displayName);
  if (exact) return exact.path;

  const dot = displayName.lastIndexOf('.');
  const stem = dot > 0 ? displayName.slice(0, dot) : displayName;
  const ext = dot > 0 ? displayName.slice(dot) : '';
  if (!ext) return null;

  const collision = files.find((f) => f.name.startsWith(`${stem} (`) && f.name.endsWith(`)${ext}`));
  return collision?.path ?? null;
}

/** Resolve attachment pill name to a workspace-relative path (tree search, then default layout). */
export function resolveChatAttachmentWorkspacePath(
  roots: WorkspaceTreeNode[] | null | undefined,
  sessionId: string,
  fileName: string
): string {
  return findWorkspaceFileByDisplayName(roots, fileName) ?? chatAttachmentWorkspacePath(sessionId, fileName);
}

/** Directory prefixes of `filePath` for expanding the workspace tree. */
export function ancestorDirectoryPaths(filePath: string): string[] {
  const parts = filePath.replace(/\\/g, '/').trim().split('/').filter(Boolean);
  const dirs: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    dirs.push(parts.slice(0, i).join('/'));
  }
  return dirs;
}

/** Expanded directory paths so a file and its ancestors are visible in the tree. */
export function expandedPathsForWorkspaceFile(filePath: string): Set<string> {
  const expanded = new Set<string>([WORKSPACE_TREE_ROOT_ROW_ID, 'results', 'user-uploads', 'chat-uploads']);
  for (const d of ancestorDirectoryPaths(filePath)) {
    expanded.add(d);
  }
  return expanded;
}
