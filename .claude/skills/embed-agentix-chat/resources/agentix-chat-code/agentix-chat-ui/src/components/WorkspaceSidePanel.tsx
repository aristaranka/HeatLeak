/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { ChevronRight, FolderArchive, Maximize2, PanelRightClose } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatTransport } from '../chatTransportContext';
import { useWorkspacePdfObjectUrl } from '../hooks/useWorkspacePdfObjectUrl';
import { isWorkspacePdfPath, workspaceFilesUserMessage, WorkspaceTreeHttpError } from '../lib/chatApi';
import { cn } from '../lib/utils';
import {
  WORKSPACE_TREE_ROOT_ROW_ID,
  defaultWorkspaceExpandedPaths,
  sessionUploadDirForWorkspace,
  type WorkspaceTreeScope,
} from '../lib/workspaceTreeUtils';
import { DownloadIcon } from './AgentIcons';
import ConfirmModal from './ConfirmModal';
import FileContentRenderer from './FileContentRenderer';
import { Button } from './ui/button';
import { Skeleton, SkeletonText } from './ui/skeleton';
import { WorkspaceTreeFileIcon, workspaceTreeFileIconKind } from './WorkspaceTreeIcons';
import type { WorkspacePreviewResponse, WorkspaceTreeNode } from '../lib/chatApi';
import type { NexusChatTransport } from '../transport';
import type { TFunction } from 'i18next';

const HTML_PREVIEW_RE = /\.html?$/i;

export { WORKSPACE_TREE_ROOT_ROW_ID };

const WORKSPACE_PATH_DRAG_TYPE = 'application/x-nexus-workspace-path';

function workspaceBasename(rel: string): string {
  const s = rel.replace(/\\/g, '/').replace(/\/+$/, '');
  const i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(i + 1) : s;
}

/** Strip `sessions/<uploadDir>/` from the preview header when browsing a session subtree. */
function workspacePathForDisplay(path: string, sessionId?: string): string {
  const sid = sessionId?.trim();
  if (!sid) return path;
  const prefix = `sessions/${sessionUploadDirForWorkspace(sid)}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/** `sessions/<firstSeg>` when `rel` is under that tree (same rule as agent `sessionsSubtreeRoot`). */
function sessionTreePrefixFromPath(rel: string): string | null {
  const n = rel.replace(/\\/g, '/').trim();
  const m = /^sessions\/([^/]+)/.exec(n);
  return m ? `sessions/${m[1]}` : null;
}

/**
 * Resolves `POST /workspace-move` `to` and the final workspace-relative path for selection updates.
 * Synthetic-root drops must land under the same `sessions/<uploadDir>/` as the source path so we
 * never write to the PVC root by mistake; when `from` has no `sessions/` prefix, fall back to
 * sanitizing `sessionId` like the agent does.
 */
function workspaceMoveTargets(
  fromRel: string,
  toDirRel: string,
  sessionId: string | undefined
): { from: string; moveTo: string; destIfInto: string; dir: string; isRoot: boolean } {
  const from = fromRel.replace(/\\/g, '/').trim();
  const dirRaw = toDirRel.replace(/\\/g, '/').trim();
  const isRoot = dirRaw === '';
  const dir = isRoot ? '' : dirRaw.replace(/\/+$/, '');
  const piece = workspaceBasename(from);
  const sid = sessionId?.trim();

  if (isRoot) {
    const prefixFromSource = sessionTreePrefixFromPath(from);
    const prefix = prefixFromSource ?? (sid ? `sessions/${sessionUploadDirForWorkspace(sid)}` : null);
    if (prefix) {
      const moveTo = `${prefix}/${piece}`;
      return { from, moveTo, destIfInto: moveTo, dir, isRoot };
    }
    return { from, moveTo: piece, destIfInto: piece, dir, isRoot };
  }
  return { from, moveTo: dir, destIfInto: `${dir}/${piece}`, dir, isRoot };
}

async function loadWorkspaceTreeRoots(
  transport: NexusChatTransport,
  agentBaseUrl: string,
  scope: WorkspaceTreeScope,
  sessionId: string | undefined,
  signal: AbortSignal
): Promise<{ roots: WorkspaceTreeNode[]; truncated: boolean }> {
  if (!sessionId?.trim()) {
    return { roots: [], truncated: false };
  }
  const data = await transport.fetchWorkspaceTree(agentBaseUrl, signal, sessionId, scope);
  return {
    roots: data.roots,
    truncated: data.truncated === true,
  };
}

/** User-facing tree-load error — never surface backend tokens like `pod_unavailable`. */
function workspaceTreeLoadErrorMessage(err: unknown, t: TFunction): string {
  return workspaceFilesUserMessage(err, 'tree', t);
}

// Resume route-binding grace: on first resume the pod can be reachable while the `files-tree`
// route isn't bound to the session yet, so the tree fetch 404s for a beat — the same warm-up
// window that `/models` liveness gets a grace retry for in fetchAgentWithRetry. That retry helper
// grace-retries 404 only on liveness paths, and 502/503/504 + network errors already ride its
// warm-up budget — so 404 is the one transient the workspace tree would otherwise latch as an
// inline error until a full page reload. Retry the cold load a few times on 404 before surfacing.
const WORKSPACE_TREE_RESUME_404_RETRIES = 4;
const WORKSPACE_TREE_RESUME_404_RETRY_DELAY_MS = 750;

/** A transient resume 404 worth a grace retry (route not bound yet), vs a permanent load error. */
function isTransientTreeBindingError(err: unknown): boolean {
  return err instanceof WorkspaceTreeHttpError && err.status === 404;
}

/** Abort-aware delay so a session switch / unmount cancels a pending resume retry immediately. */
function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

type KbdDropRow = { treePath: string; dropDirRel: string; displayName: string };

/** DFS list of directory rows (including synthetic workspace root) in visual order for keyboard drop navigation. */
function collectKbdDropRows(nodes: WorkspaceTreeNode[], expanded: Set<string>, rootLabel: string): KbdDropRow[] {
  const out: KbdDropRow[] = [];
  for (const node of nodes) {
    if (node.type !== 'directory') continue;
    const isSynth = node.path === WORKSPACE_TREE_ROOT_ROW_ID;
    const dropDirRel = isSynth ? '' : node.path;
    const displayName = isSynth ? rootLabel : node.name;
    out.push({ treePath: node.path, dropDirRel, displayName });
    if (expanded.has(node.path) && node.children?.length) {
      out.push(...collectKbdDropRows(node.children, expanded, rootLabel));
    }
  }
  return out;
}

/** Same validity rules as {@link handleWorkspaceDrop} before calling the agent. */
function isWorkspaceDropAllowed(fromRaw: string, toDirRelRaw: string, sessionId?: string): boolean {
  const { from, destIfInto, dir, isRoot } = workspaceMoveTargets(fromRaw, toDirRelRaw, sessionId);
  if (!from || (!isRoot && !dir)) return false;
  if (!isRoot && (from === dir || dir.startsWith(`${from}/`))) return false;
  if (destIfInto === from) return false;
  return true;
}

function TreeChildren({
  nodes,
  expanded,
  toggle,
  selectedPath,
  onSelectFile,
  agentBaseUrl,
  dragSourcePath,
  onDragSourcePath,
  dropTargetPath,
  onDropTargetPath,
  onWorkspaceDrop,
  kbdGrabbedPath,
  kbdDropHighlightTreePath,
  onKbdGrab,
  onClearKbdDnd,
}: {
  nodes: WorkspaceTreeNode[];
  expanded: Set<string>;
  toggle: (path: string) => void;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  agentBaseUrl: string;
  dragSourcePath: string | null;
  onDragSourcePath: (path: string | null) => void;
  dropTargetPath: string | null;
  onDropTargetPath: (path: string | null) => void;
  onWorkspaceDrop: (fromRel: string, toDirRel: string) => void;
  kbdGrabbedPath: string | null;
  kbdDropHighlightTreePath: string | null;
  onKbdGrab: (path: string) => void;
  onClearKbdDnd: () => void;
}): React.ReactElement {
  return (
    <ul className="workspace-side-panel__tree-nested m-0 list-none p-0 pl-10" role="group">
      {nodes.map((node) => (
        <TreeRow
          key={node.path}
          node={node}
          expanded={expanded}
          toggle={toggle}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          agentBaseUrl={agentBaseUrl}
          dragSourcePath={dragSourcePath}
          onDragSourcePath={onDragSourcePath}
          dropTargetPath={dropTargetPath}
          onDropTargetPath={onDropTargetPath}
          onWorkspaceDrop={onWorkspaceDrop}
          kbdGrabbedPath={kbdGrabbedPath}
          kbdDropHighlightTreePath={kbdDropHighlightTreePath}
          onKbdGrab={onKbdGrab}
          onClearKbdDnd={onClearKbdDnd}
        />
      ))}
    </ul>
  );
}

function TreeRow({
  node,
  expanded,
  toggle,
  selectedPath,
  onSelectFile,
  agentBaseUrl,
  dragSourcePath,
  onDragSourcePath,
  dropTargetPath,
  onDropTargetPath,
  onWorkspaceDrop,
  kbdGrabbedPath,
  kbdDropHighlightTreePath,
  onKbdGrab,
  onClearKbdDnd,
}: {
  node: WorkspaceTreeNode;
  expanded: Set<string>;
  toggle: (path: string) => void;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  agentBaseUrl: string;
  dragSourcePath: string | null;
  onDragSourcePath: (path: string | null) => void;
  dropTargetPath: string | null;
  onDropTargetPath: (path: string | null) => void;
  onWorkspaceDrop: (fromRel: string, toDirRel: string) => void;
  kbdGrabbedPath: string | null;
  kbdDropHighlightTreePath: string | null;
  onKbdGrab: (path: string) => void;
  onClearKbdDnd: () => void;
}): React.ReactElement {
  const { t } = useTranslation('chat');
  const isDir = node.type === 'directory';
  const isSyntheticWorkspaceRoot = node.path === WORKSPACE_TREE_ROOT_ROW_ID;
  const dropDirRel = isSyntheticWorkspaceRoot ? '' : node.path;
  const children = node.children && node.children.length > 0 ? node.children : [];
  const open = expanded.has(node.path);
  const isKbdDropHere = isDir && kbdGrabbedPath && kbdDropHighlightTreePath === node.path;
  const isDropHover = isDir && (dropTargetPath === node.path || isKbdDropHere);

  if (!isDir) {
    const selected = selectedPath === node.path;
    const iconKind = workspaceTreeFileIconKind(node.name);
    const dragging = dragSourcePath === node.path || kbdGrabbedPath === node.path;
    const canKbdPick = !!agentBaseUrl.trim();
    return (
      <li
        className="workspace-side-panel__item m-0 p-0"
        role="treeitem"
        aria-expanded={false}
        aria-grabbed={kbdGrabbedPath === node.path}
      >
        <button
          type="button"
          className={cn(
            // rounded-none overrides the global `button { border-radius: var(--radius) }` so the
            // full-width selected/hover highlight (and its focus outline) has square corners.
            'workspace-side-panel__file-btn flex w-full cursor-pointer items-center gap-1.5 break-all rounded-none px-3 py-[5px] text-left text-[13px] leading-[1.35] text-foreground hover:bg-foreground/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
            selected &&
              'workspace-side-panel__file-btn--selected bg-primary/15 font-medium text-primary hover:bg-primary/15',
            dragging && 'workspace-side-panel__file-btn--dragging opacity-65'
          )}
          title={node.path}
          data-testid="workspace-tree-file"
          data-name={node.name}
          data-path={node.path}
          aria-label={t('workspace.fileLabel', { name: node.name })}
          aria-pressed={selected}
          draggable={!!agentBaseUrl.trim()}
          onDragStart={(e) => {
            if (!agentBaseUrl.trim()) return;
            onClearKbdDnd();
            onDragSourcePath(node.path);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData(WORKSPACE_PATH_DRAG_TYPE, node.path);
          }}
          onDragEnd={() => {
            onDragSourcePath(null);
            onDropTargetPath(null);
          }}
          onKeyDown={(e) => {
            if (!canKbdPick || kbdGrabbedPath) return;
            /* Space picks up for move; Enter keeps default button activation -> onClick opens preview */
            if (e.key === ' ' || e.key === 'Spacebar') {
              e.preventDefault();
              onKbdGrab(node.path);
            }
          }}
          onClick={() => onSelectFile(node.path)}
        >
          {/* Spacer matching the directory row's toggle button (size-5 + the row gap), so a file's
              icon/label column aligns with sibling folders instead of out-denting to the left. */}
          <span className="workspace-side-panel__tree-toggle-spacer inline-flex size-5 shrink-0" aria-hidden />
          <span
            className="workspace-side-panel__tree-icon-wrap inline-flex size-[18px] shrink-0 items-center justify-center text-muted-foreground"
            aria-hidden
          >
            <WorkspaceTreeFileIcon kind={iconKind} className="workspace-side-panel__tree-icon block" />
          </span>
          <span className="workspace-side-panel__name--file text-left text-[13px] font-normal">{node.name}</span>
        </button>
      </li>
    );
  }

  const dirLabel = isSyntheticWorkspaceRoot ? '/' : node.name.endsWith('/') ? node.name : `${node.name}/`;

  return (
    <li
      className="workspace-side-panel__item m-0 p-0"
      role="treeitem"
      aria-expanded={open}
      aria-grabbed={!isSyntheticWorkspaceRoot && kbdGrabbedPath === node.path}
    >
      <div
        className={cn(
          'workspace-side-panel__row workspace-side-panel__row--dir flex cursor-pointer select-none items-center gap-1.5 break-all px-3 py-[5px] text-[13px] leading-[1.35] text-foreground hover:bg-foreground/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
          isSyntheticWorkspaceRoot && 'workspace-side-panel__row--dir-root',
          isDropHover &&
            'workspace-side-panel__row--dir-drop bg-foreground/[0.04] outline-dashed outline-2 -outline-offset-2 outline-ring'
        )}
        tabIndex={isSyntheticWorkspaceRoot ? -1 : 0}
        aria-label={
          isSyntheticWorkspaceRoot ? t('workspace.rootFolderLabel') : t('workspace.folderLabel', { name: node.name })
        }
        onDragOver={(e) => {
          if (!agentBaseUrl.trim() || !dragSourcePath) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          onDropTargetPath(node.path);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            onDropTargetPath(null);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          const from = e.dataTransfer.getData(WORKSPACE_PATH_DRAG_TYPE) || dragSourcePath;
          onDropTargetPath(null);
          onDragSourcePath(null);
          if (!from || !agentBaseUrl.trim()) return;
          onWorkspaceDrop(from, dropDirRel);
        }}
        onKeyDown={(e) => {
          if (!agentBaseUrl.trim() || isSyntheticWorkspaceRoot) return;
          if (kbdGrabbedPath) return;
          if (e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            onKbdGrab(node.path);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            toggle(node.path);
          }
        }}
        onClick={() => toggle(node.path)}
      >
        <button
          type="button"
          className="workspace-side-panel__toggle inline-flex size-5 shrink-0 cursor-pointer items-center justify-center text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          tabIndex={-1}
          onClick={(e) => {
            // Row already toggles on click; stop the bubble so the chevron doesn't double-toggle.
            e.stopPropagation();
            toggle(node.path);
          }}
          aria-label={
            open ? t('workspace.collapseFolder', { name: node.name }) : t('workspace.expandFolder', { name: node.name })
          }
        >
          <ChevronRight
            className={cn(
              'workspace-side-panel__chevron size-3 shrink-0 transition-transform',
              open && 'workspace-side-panel__chevron--open rotate-90'
            )}
            aria-hidden
          />
        </button>
        <span
          className="workspace-side-panel__tree-icon-wrap workspace-side-panel__tree-icon-wrap--dir inline-flex size-[18px] shrink-0 items-center justify-center text-muted-foreground"
          aria-hidden
        >
          <WorkspaceTreeFileIcon kind="folder" className="workspace-side-panel__tree-icon block" />
        </span>
        <span
          className={cn(
            'workspace-side-panel__name--dir font-medium text-foreground',
            isSyntheticWorkspaceRoot && 'font-semibold text-muted-foreground'
          )}
          title={isSyntheticWorkspaceRoot ? t('workspace.rootDropTitle') : node.path}
          draggable={!!agentBaseUrl.trim() && !isSyntheticWorkspaceRoot}
          onDragStart={(e) => {
            if (!agentBaseUrl.trim() || isSyntheticWorkspaceRoot) return;
            onClearKbdDnd();
            onDragSourcePath(node.path);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData(WORKSPACE_PATH_DRAG_TYPE, node.path);
          }}
          onDragEnd={() => {
            onDragSourcePath(null);
            onDropTargetPath(null);
          }}
        >
          {dirLabel}
        </span>
      </div>
      {open && children.length > 0 ? (
        <TreeChildren
          nodes={children}
          expanded={expanded}
          toggle={toggle}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          agentBaseUrl={agentBaseUrl}
          dragSourcePath={dragSourcePath}
          onDragSourcePath={onDragSourcePath}
          dropTargetPath={dropTargetPath}
          onDropTargetPath={onDropTargetPath}
          onWorkspaceDrop={onWorkspaceDrop}
          kbdGrabbedPath={kbdGrabbedPath}
          kbdDropHighlightTreePath={kbdDropHighlightTreePath}
          onKbdGrab={onKbdGrab}
          onClearKbdDnd={onClearKbdDnd}
        />
      ) : null}
    </li>
  );
}

/** Render HTML content in a sandboxed iframe for the workspace preview pane. */
function WorkspaceHtmlPreview({
  htmlSource,
  truncated,
  path,
  onExpand,
}: {
  htmlSource: string;
  truncated: boolean;
  path: string;
  onExpand: () => void;
}): React.ReactElement {
  const { t } = useTranslation('chat');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!htmlSource || truncated) {
      setBlobUrl(null);
      return;
    }
    const blob = new Blob([htmlSource], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [htmlSource, truncated]);

  if (truncated) {
    return (
      <div className="workspace-side-panel__preview-body-inner p-3 text-xs text-muted-foreground">
        {t('workspace.preview.htmlTooLarge')}
      </div>
    );
  }

  return (
    <div className="workspace-side-panel__preview-body-inner flex min-h-0 flex-1 flex-col">
      {blobUrl && (
        <button
          type="button"
          className="group relative m-0 min-h-0 flex-1 cursor-pointer border-0 bg-transparent p-0"
          onClick={onExpand}
          aria-label={t('workspace.openMainViewer')}
          title={t('workspace.openMainViewer')}
        >
          <iframe
            src={blobUrl}
            className="pointer-events-none h-full w-full border-none bg-white"
            title={path}
            sandbox="allow-scripts"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
            <Maximize2 className="size-5 text-white opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
          </span>
        </button>
      )}
    </div>
  );
}

function PreviewPane({
  agentBaseUrl,
  sessionId,
  selectedPath,
  onOpenExternalViewer,
}: {
  agentBaseUrl: string;
  sessionId?: string;
  selectedPath: string | null;
  onOpenExternalViewer?: (path: string) => void;
}): React.ReactElement | null {
  const { t } = useTranslation('chat');
  // Latest `t` via a ref so the preview effect / download callback produce stable error copy
  // without depending on `t` (which would re-run the preview fetch on a UI-language change).
  const tRef = useRef(t);
  tRef.current = t;
  const transport = useChatTransport();
  const [preview, setPreview] = useState<WorkspacePreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState(false);

  // PDFs render via the shared resolver (same hook the full file viewer uses) so both surfaces
  // embed PDFs identically; the workspace-preview fetch below handles only text/image/binary.
  // The PDF fetch is session-scoped (sessionId arg); the panel is decoupled from session
  // lifecycle, so a 404 surfaces as an inline pdfError and never escalates to a session resume.
  const pdf = useWorkspacePdfObjectUrl(agentBaseUrl, sessionId ?? '', selectedPath);

  useEffect(() => {
    setDownloadError('');
  }, [selectedPath]);

  useEffect(() => {
    // PDFs are handled by the shared hook above; this effect fetches the text/image/binary preview.
    if (!selectedPath || !agentBaseUrl.trim() || !sessionId?.trim() || isWorkspacePdfPath(selectedPath)) {
      setPreview(null);
      setPreviewError('');
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setPreviewError('');
    setPreview(null);
    (async () => {
      try {
        const data = await transport.fetchWorkspacePreview(agentBaseUrl, sessionId, selectedPath, {
          signal: ac.signal,
        });
        if (!ac.signal.aborted) setPreview(data);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        // Decoupled from session lifecycle: a 404 (files route missing on an older pod) is an
        // inline preview error, not a session-unavailable escalation.
        setPreviewError(workspaceFilesUserMessage(err, 'preview', tRef.current));
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [agentBaseUrl, sessionId, selectedPath, transport]);

  const handleDownload = useCallback(async () => {
    if (!selectedPath || !agentBaseUrl.trim() || !sessionId?.trim()) return;
    setDownloadError('');
    setDownloading(true);
    try {
      await transport.downloadWorkspaceFile(agentBaseUrl, sessionId, selectedPath);
    } catch (err) {
      setDownloadError(workspaceFilesUserMessage(err, 'download', tRef.current));
    } finally {
      setDownloading(false);
    }
  }, [agentBaseUrl, sessionId, selectedPath, t, transport]);

  if (!agentBaseUrl.trim()) {
    return (
      <div className="workspace-side-panel__preview-empty workspace-side-panel__idle p-3 text-xs leading-[1.45] text-muted-foreground">
        {t('workspace.idleConnectPreview')}
      </div>
    );
  }

  if (!selectedPath) {
    return (
      <div className="workspace-side-panel__preview-empty workspace-side-panel__idle p-3 text-xs leading-[1.45] text-muted-foreground">
        {t('workspace.selectFileHint')}
      </div>
    );
  }

  const showPdfEmbed = pdf.isPdf;
  // PDF loading/error live in the shared hook; text/image/binary in this component's state.
  const showLoading = showPdfEmbed ? pdf.pdfLoading : loading;
  const showError = showPdfEmbed ? pdf.pdfError : previewError;
  const showTruncatedHint = !showLoading && !showError && preview?.kind === 'text' && preview.truncated === true;

  return (
    <div className="workspace-side-panel__preview-root flex min-h-0 flex-1 flex-col">
      <header className="workspace-side-panel__preview-header flex shrink-0 flex-col gap-1 border-b border-border bg-background px-3 py-2">
        <div className="workspace-side-panel__preview-header-row flex min-w-0 items-center justify-between gap-2.5">
          <span
            className="workspace-side-panel__preview-header-path min-w-0 flex-1 truncate font-mono text-xs font-semibold leading-8 text-foreground"
            title={selectedPath}
          >
            {workspacePathForDisplay(selectedPath, sessionId)}
          </span>
          <div className="workspace-side-panel__preview-header-actions flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="workspace-side-panel__preview-header-btn text-muted-foreground"
              aria-label={t('workspace.downloadFile')}
              title={t('workspace.downloadFile')}
              disabled={downloading}
              onClick={() => void handleDownload()}
            >
              <DownloadIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="workspace-side-panel__preview-header-btn text-muted-foreground"
              data-testid="workspace-open-main-viewer-btn"
              aria-label={t('workspace.openMainViewer')}
              title={t('workspace.openMainViewer')}
              disabled={!selectedPath}
              onClick={() => {
                if (selectedPath) onOpenExternalViewer?.(selectedPath);
              }}
            >
              <Maximize2 />
            </Button>
          </div>
        </div>
        {showTruncatedHint ? (
          <span className="workspace-side-panel__preview-header-truncated text-[10px] font-medium uppercase leading-tight tracking-wider text-warning">
            {t('workspace.previewTruncated')}
          </span>
        ) : null}
      </header>
      {downloadError ? (
        <div
          className="workspace-side-panel__preview-download-error shrink-0 border-b border-border px-3 py-1.5 text-2xs text-destructive"
          role="alert"
        >
          {downloadError}
        </div>
      ) : null}
      <div className="workspace-side-panel__preview-content min-h-0 flex-1 overflow-auto">
        {showLoading ? (
          <div
            className="workspace-side-panel__preview-empty workspace-side-panel__loading p-3"
            aria-busy
            aria-label={t('workspace.loadingPreview')}
          >
            <SkeletonText lines={6} />
          </div>
        ) : null}
        {!showLoading && showError ? (
          <div className="workspace-side-panel__preview-empty workspace-side-panel__error p-3 text-xs leading-[1.45] text-destructive">
            {showError}
          </div>
        ) : null}
        {!showLoading && !showError && showPdfEmbed && pdf.pdfEmbedSrc ? (
          <div className="workspace-side-panel__preview-body-inner workspace-side-panel__preview-body-inner--pdf flex min-h-[200px] flex-1 px-3 pb-3 pt-2">
            <embed
              type="application/pdf"
              src={pdf.pdfEmbedSrc}
              className="workspace-side-panel__preview-embed min-h-[200px] w-full flex-1 border-0"
              title={t('workspace.pdfPreviewTitle', { path: selectedPath })}
            />
          </div>
        ) : null}
        {!showLoading && !showError && !showPdfEmbed && preview?.kind === 'binary' ? (
          <div className="workspace-side-panel__preview-body-inner min-h-0 px-3 pb-3 pt-2.5">
            <p className="workspace-side-panel__preview-binary m-0 text-xs leading-[1.45] text-muted-foreground">
              {preview.message}
            </p>
          </div>
        ) : null}
        {!showLoading && !showError && !showPdfEmbed && preview?.kind === 'image' ? (
          <div className="workspace-side-panel__preview-body-inner workspace-side-panel__preview-body-inner--image flex items-start justify-center px-3 pb-3 pt-2.5">
            <button
              type="button"
              className="workspace-side-panel__preview-img-btn group relative cursor-pointer border-0 bg-transparent p-0"
              onClick={() => {
                if (selectedPath) onOpenExternalViewer?.(selectedPath);
              }}
              aria-label={t('workspace.openMainViewer')}
              title={t('workspace.openMainViewer')}
            >
              <img
                className="workspace-side-panel__preview-img block h-auto max-h-[min(280px,50vh)] w-auto max-w-full rounded object-contain"
                src={`data:${preview.mime};base64,${preview.base64}`}
                alt={t('workspace.imagePreviewAlt', { path: selectedPath })}
              />
              <span className="absolute inset-0 flex items-center justify-center rounded bg-black/0 transition-colors group-hover:bg-black/30">
                <Maximize2
                  className="size-5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
              </span>
            </button>
          </div>
        ) : null}
        {!showLoading &&
        !showError &&
        !showPdfEmbed &&
        preview?.kind === 'text' &&
        selectedPath &&
        HTML_PREVIEW_RE.test(selectedPath) ? (
          <WorkspaceHtmlPreview
            htmlSource={preview.lines.join('\n')}
            truncated={!!preview.truncated}
            path={selectedPath}
            onExpand={() => {
              if (selectedPath) onOpenExternalViewer?.(selectedPath);
            }}
          />
        ) : null}
        {!showLoading &&
        !showError &&
        !showPdfEmbed &&
        preview?.kind === 'text' &&
        !(selectedPath && HTML_PREVIEW_RE.test(selectedPath)) ? (
          <div className="workspace-side-panel__preview-body-inner min-h-0 px-3 pb-3 pt-2.5">
            <FileContentRenderer
              fileName={preview.path}
              content={preview.lines.join('\n')}
              preClassName="workspace-side-panel__preview-pre m-0 whitespace-pre-wrap break-words p-0 font-mono text-2xs leading-[1.45] text-foreground"
              truncated={preview.truncated}
            />
          </div>
        ) : null}
      </div>
      {showTruncatedHint ? (
        <div
          className="workspace-side-panel__preview-truncated-cta flex shrink-0 items-center justify-between gap-2 border-t border-warning/40 bg-warning/10 px-3 py-2"
          data-testid="workspace-preview-truncated-cta"
        >
          <p className="m-0 min-w-0 flex-1 text-2xs leading-[1.4] text-muted-foreground">
            {t('workspace.viewerTruncatedHint')}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            data-testid="workspace-preview-expand-cta"
            onClick={() => {
              if (selectedPath) onOpenExternalViewer?.(selectedPath);
            }}
          >
            <Maximize2 className="size-3.5" aria-hidden />
            {t('workspace.openMainViewer')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export type WorkspaceSidePanelProps = {
  agentBaseUrl: string;
  /** When set, REST `files-tree` uses `scope=session` for this chat session's subtree. */
  sessionId?: string;
  /** Selected workspace file path (lifted so selection survives panel unmount during main-area file viewer). */
  selectedPath: string | null;
  onSelectedPathChange: (path: string | null) => void;
  /** Expanded directory paths (`node.path`) — lifted so expand/collapse survives panel unmount during file viewer. */
  expandedPaths: Set<string>;
  onExpandedPathsChange: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** Increment (e.g. when a chat turn completes) to refetch the tree without changing expanded directories. */
  treeRefreshSeq?: number;
  /** Open full-file viewer in the chat page main area (external-link control). */
  onOpenExternalViewer?: (path: string) => void;
  /** After a successful drag-move under the workspace tree (refetch / bump seq in parent). */
  onWorkspaceTreeMutation?: () => void;
  /** Hide the panel — paired with the collapsed-state strip in ChatPage. */
  onCollapse?: () => void;
  /** Latest workspace-tree roots (for resolving chat attachment paths in the parent). */
  onRootsChange?: (roots: WorkspaceTreeNode[] | null) => void;
};

type WorkspaceMoveConflict = {
  from: string;
  moveTo: string;
  destIfInto: string;
  expandDirKey: string;
};

const WorkspaceSidePanel: React.FC<WorkspaceSidePanelProps> = ({
  agentBaseUrl,
  sessionId,
  selectedPath,
  onSelectedPathChange,
  expandedPaths,
  onExpandedPathsChange,
  treeRefreshSeq = 0,
  onOpenExternalViewer,
  onWorkspaceTreeMutation,
  onCollapse,
  onRootsChange,
}) => {
  const { t } = useTranslation('chat');
  // Latest `t` via a ref so the tree-load effect and the move/zip callbacks produce stable error
  // copy without depending on `t` (which would re-hit the pod on a UI-language change).
  const tRef = useRef(t);
  tRef.current = t;
  const transport = useChatTransport();
  const [roots, setRoots] = useState<WorkspaceTreeNode[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState('');
  const [moveError, setMoveError] = useState('');
  const [moveConflict, setMoveConflict] = useState<WorkspaceMoveConflict | null>(null);
  const [moveOverwriteLoading, setMoveOverwriteLoading] = useState(false);
  const [dragSourcePath, setDragSourcePath] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [kbdGrabbedPath, setKbdGrabbedPath] = useState<string | null>(null);
  const [kbdDropIdx, setKbdDropIdx] = useState(0);
  const [kbdAnnounce, setKbdAnnounce] = useState('');
  const prevAgentUrlRef = useRef<string>('');
  const [treeScope, setTreeScope] = useState<WorkspaceTreeScope>('session');
  const [zipDownloading, setZipDownloading] = useState(false);
  const [zipError, setZipError] = useState('');
  const moveSessionId = treeScope === 'session' ? sessionId : undefined;

  const clearKbdDnd = useCallback(() => {
    setKbdGrabbedPath(null);
    setKbdDropIdx(0);
    setKbdAnnounce('');
  }, []);

  const onKbdGrab = useCallback((path: string) => {
    setKbdGrabbedPath(path);
    setKbdDropIdx(0);
  }, []);

  const kbdDropRowsAll = useMemo((): KbdDropRow[] => {
    if (!roots) return [];
    const rootNode: WorkspaceTreeNode = {
      name: '/',
      path: WORKSPACE_TREE_ROOT_ROW_ID,
      type: 'directory',
      children: roots,
    };
    return collectKbdDropRows([rootNode], expandedPaths, t('workspace.rootRowLabel'));
  }, [roots, expandedPaths, t]);

  const kbdDropRowsFiltered = useMemo(() => {
    if (!kbdGrabbedPath) return [];
    return kbdDropRowsAll.filter((r) => isWorkspaceDropAllowed(kbdGrabbedPath, r.dropDirRel, moveSessionId));
  }, [kbdGrabbedPath, kbdDropRowsAll, moveSessionId]);

  const goToWorkspaceScope = useCallback(() => {
    if (!sessionId?.trim()) return;
    setTreeScope('workspace');
    onSelectedPathChange(null);
    onExpandedPathsChange(defaultWorkspaceExpandedPaths('workspace'));
    setMoveConflict(null);
    setMoveOverwriteLoading(false);
    clearKbdDnd();
  }, [sessionId, onSelectedPathChange, onExpandedPathsChange, clearKbdDnd]);

  const goToSessionScope = useCallback(() => {
    setTreeScope('session');
    onSelectedPathChange(null);
    onExpandedPathsChange(defaultWorkspaceExpandedPaths('session', sessionId));
    setMoveConflict(null);
    setMoveOverwriteLoading(false);
    clearKbdDnd();
  }, [sessionId, onSelectedPathChange, onExpandedPathsChange, clearKbdDnd]);

  const kbdDropHighlightTreePath =
    kbdGrabbedPath && kbdDropRowsFiltered.length > 0
      ? (kbdDropRowsFiltered[Math.min(kbdDropIdx, kbdDropRowsFiltered.length - 1)]?.treePath ?? null)
      : null;

  const toggle = useCallback(
    (path: string) => {
      onExpandedPathsChange((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    },
    [onExpandedPathsChange]
  );

  useEffect(() => {
    onRootsChange?.(roots);
  }, [roots, onRootsChange]);

  useEffect(() => {
    setTreeScope('session');
  }, [sessionId]);

  useEffect(() => {
    if (!agentBaseUrl.trim()) {
      setRoots(null);
      setTruncated(false);
      setError('');
      setMoveError('');
      setMoveConflict(null);
      setMoveOverwriteLoading(false);
      setDragSourcePath(null);
      setDropTargetPath(null);
      clearKbdDnd();
      onSelectedPathChange(null);
      prevAgentUrlRef.current = '';
      return;
    }

    const prev = prevAgentUrlRef.current;
    if (prev !== '' && prev !== agentBaseUrl) {
      onSelectedPathChange(null);
      onExpandedPathsChange(defaultWorkspaceExpandedPaths('session', sessionId));
      setTreeScope('session');
      setMoveConflict(null);
      setMoveOverwriteLoading(false);
      clearKbdDnd();
    }
    prevAgentUrlRef.current = agentBaseUrl;

    if (treeScope === 'session' && !sessionId?.trim()) {
      setRoots(null);
      setTruncated(false);
      setError('');
      onSelectedPathChange(null);
      return;
    }

    const ac = new AbortController();
    setError('');
    setRoots(null);
    (async () => {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= WORKSPACE_TREE_RESUME_404_RETRIES; attempt++) {
        if (ac.signal.aborted) return;
        try {
          const { roots: nextRoots, truncated: nextTruncated } = await loadWorkspaceTreeRoots(
            transport,
            agentBaseUrl,
            treeScope,
            sessionId,
            ac.signal
          );
          setRoots(nextRoots);
          setTruncated(nextTruncated);
          return;
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          lastErr = err;
          // Resume route-binding lag: a transient 404 means the pod is reachable but the session
          // route isn't bound yet — retry (roots stays null → loading skeleton, not an error
          // flash) before latching. A 404 that persists past the grace budget (files route missing
          // on an older pod) then surfaces as the inline tree error below, exactly as before.
          if (isTransientTreeBindingError(err) && attempt < WORKSPACE_TREE_RESUME_404_RETRIES) {
            await abortableDelay(WORKSPACE_TREE_RESUME_404_RETRY_DELAY_MS, ac.signal);
            continue;
          }
          break;
        }
      }
      // Decoupled from session lifecycle: a load error (incl. a persistent 404, session otherwise
      // healthy) surfaces as an inline tree error — never a session-unavailable escalation.
      // workspaceTreeLoadErrorMessage has stable identity so this effect doesn't re-run (and
      // re-hit the pod) on every UI-language change.
      if (ac.signal.aborted) return;
      setError(workspaceTreeLoadErrorMessage(lastErr, tRef.current));
      setRoots([]);
      onSelectedPathChange(null);
    })();
    return () => ac.abort();
  }, [agentBaseUrl, sessionId, treeScope, onSelectedPathChange, onExpandedPathsChange, clearKbdDnd, transport]);

  useEffect(() => {
    if (!agentBaseUrl.trim() || treeRefreshSeq <= 0) return;
    if (treeScope === 'session' && !sessionId?.trim()) return;
    const ac = new AbortController();
    (async () => {
      try {
        const { roots: nextRoots, truncated: nextTruncated } = await loadWorkspaceTreeRoots(
          transport,
          agentBaseUrl,
          treeScope,
          sessionId,
          ac.signal
        );
        setRoots(nextRoots);
        setTruncated(nextTruncated);
        setError('');
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        /* Keep existing tree visible on transient refresh errors (incl. a 404 — the panel is
           decoupled from session lifecycle and never escalates to resume/reload). */
      }
    })();
    return () => ac.abort();
  }, [treeRefreshSeq, agentBaseUrl, sessionId, treeScope, onSelectedPathChange, transport]);

  const handleWorkspaceDrop = useCallback(
    async (fromRel: string, toDirRel: string) => {
      const { from, moveTo, destIfInto, dir, isRoot } = workspaceMoveTargets(fromRel, toDirRel, moveSessionId);
      if (!from || (!isRoot && !dir) || !agentBaseUrl.trim() || !sessionId?.trim()) return;
      if (!isRoot && (from === dir || dir.startsWith(`${from}/`))) return;
      if (destIfInto === from) return;
      setMoveError('');
      setMoveConflict(null);
      try {
        const result = await transport.moveWorkspacePath(agentBaseUrl, sessionId, from, moveTo);
        if (!result.ok) {
          setMoveConflict({
            from,
            moveTo,
            destIfInto,
            expandDirKey: isRoot ? WORKSPACE_TREE_ROOT_ROW_ID : dir,
          });
          return;
        }
        if (selectedPath === from) {
          onSelectedPathChange(destIfInto);
        }
        onExpandedPathsChange((prev) => new Set(prev).add(isRoot ? WORKSPACE_TREE_ROOT_ROW_ID : dir));
        onWorkspaceTreeMutation?.();
      } catch (e) {
        // Decoupled: a move 404 is an inline move error, not a session-unavailable escalation.
        setMoveError(workspaceFilesUserMessage(e, 'move', tRef.current));
      }
    },
    [
      agentBaseUrl,
      sessionId,
      moveSessionId,
      selectedPath,
      onSelectedPathChange,
      onExpandedPathsChange,
      onWorkspaceTreeMutation,
      t,
      transport,
    ]
  );

  const handleWorkspaceMoveOverwrite = useCallback(async () => {
    if (!moveConflict || !agentBaseUrl.trim() || !sessionId?.trim()) return;
    setMoveOverwriteLoading(true);
    setMoveError('');
    try {
      const result = await transport.moveWorkspacePath(
        agentBaseUrl,
        sessionId,
        moveConflict.from,
        moveConflict.moveTo,
        { overwrite: true }
      );
      if (!result.ok) {
        setMoveError(t('workspace.replaceFailed'));
        setMoveConflict(null);
        return;
      }
      if (selectedPath === moveConflict.from) {
        onSelectedPathChange(moveConflict.destIfInto);
      }
      onExpandedPathsChange((prev) => new Set(prev).add(moveConflict.expandDirKey));
      onWorkspaceTreeMutation?.();
      setMoveConflict(null);
    } catch (e) {
      setMoveError(workspaceFilesUserMessage(e, 'move', tRef.current));
      setMoveConflict(null);
    } finally {
      setMoveOverwriteLoading(false);
    }
  }, [
    moveConflict,
    agentBaseUrl,
    sessionId,
    selectedPath,
    onSelectedPathChange,
    onExpandedPathsChange,
    onWorkspaceTreeMutation,
    t,
    transport,
  ]);

  const handleDownloadZip = useCallback(async () => {
    if (!agentBaseUrl.trim() || !sessionId?.trim()) return;
    setZipError('');
    setZipDownloading(true);
    try {
      await transport.downloadWorkspaceZip(agentBaseUrl, sessionId);
    } catch (err) {
      setZipError(workspaceFilesUserMessage(err, 'zip', tRef.current));
    } finally {
      setZipDownloading(false);
    }
  }, [agentBaseUrl, sessionId, t, transport]);

  useEffect(() => {
    if (!kbdGrabbedPath || kbdDropRowsFiltered.length === 0) return;
    setKbdDropIdx((prev) => Math.min(prev, kbdDropRowsFiltered.length - 1));
  }, [kbdGrabbedPath, kbdDropRowsFiltered.length]);

  useEffect(() => {
    if (!kbdGrabbedPath) return;
    const piece = workspaceBasename(kbdGrabbedPath);
    const safeIdx = kbdDropRowsFiltered.length === 0 ? 0 : Math.min(kbdDropIdx, kbdDropRowsFiltered.length - 1);
    const row = kbdDropRowsFiltered[safeIdx];
    const intro = t('workspace.kbdGrabbed', { name: piece });
    if (!row || kbdDropRowsFiltered.length === 0) {
      setKbdAnnounce(t('workspace.kbdNoFolder', { intro }));
      return;
    }
    setKbdAnnounce(t('workspace.kbdDropTarget', { intro, target: row.displayName }));
  }, [kbdGrabbedPath, kbdDropIdx, kbdDropRowsFiltered, t]);

  useEffect(() => {
    if (!kbdGrabbedPath || !agentBaseUrl.trim()) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('textarea, input, select, [contenteditable="true"]')) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setKbdGrabbedPath(null);
        setKbdDropIdx(0);
        setKbdAnnounce(t('workspace.kbdMoveCancelled'));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (kbdDropRowsFiltered.length === 0) return;
        setKbdDropIdx((i) => (i + 1) % kbdDropRowsFiltered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (kbdDropRowsFiltered.length === 0) return;
        setKbdDropIdx((i) => (i - 1 + kbdDropRowsFiltered.length) % kbdDropRowsFiltered.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const row = kbdDropRowsFiltered[kbdDropIdx];
        if (!row || !kbdGrabbedPath) return;
        const from = kbdGrabbedPath;
        void (async () => {
          try {
            await handleWorkspaceDrop(from, row.dropDirRel);
          } finally {
            setKbdGrabbedPath(null);
            setKbdDropIdx(0);
            setKbdAnnounce('');
          }
        })();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [kbdGrabbedPath, kbdDropRowsFiltered, kbdDropIdx, agentBaseUrl, handleWorkspaceDrop, t]);

  const onSelectFile = useCallback(
    (path: string) => {
      onSelectedPathChange(path);
    },
    [onSelectedPathChange]
  );

  const idleCls = 'workspace-side-panel__idle p-3 text-xs leading-[1.45] text-muted-foreground';
  const srOnly =
    'absolute m-[-1px] h-px w-px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0,0,0,0)] [clip-path:inset(50%)]';

  let explorerBody: React.ReactNode;
  if (!agentBaseUrl.trim()) {
    explorerBody = <div className={idleCls}>{t('workspace.idleConnectBrowse')}</div>;
  } else if (treeScope === 'session' && !sessionId?.trim()) {
    explorerBody = <div className={idleCls}>{t('workspace.idleStartSession')}</div>;
  } else if (roots === null) {
    explorerBody = (
      <div
        className="workspace-side-panel__loading flex flex-col gap-2 p-3"
        aria-busy
        aria-label={t('workspace.loadingTree')}
      >
        {['w-3/4', 'w-1/2', 'w-2/3', 'w-1/3', 'w-3/5'].map((w, i) => (
          <Skeleton key={i} className={`h-4 ${w}`} />
        ))}
      </div>
    );
  } else if (error) {
    explorerBody = (
      <div className="workspace-side-panel__error p-3 text-xs leading-[1.45] text-destructive">{error}</div>
    );
  } else if (roots.length === 0) {
    explorerBody = <div className={idleCls}>{t('workspace.idleStartSession')}</div>;
  } else {
    explorerBody = (
      <>
        {moveError ? (
          <div
            className="workspace-side-panel__move-error mx-3 mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs leading-[1.4] text-destructive"
            role="alert"
          >
            {moveError}
          </div>
        ) : null}
        <p id="workspace-tree-kbd-help" className={cn('workspace-side-panel__visually-hidden', srOnly)}>
          {t('workspace.kbdHelp')}
        </p>
        <div className={cn('workspace-side-panel__live', srOnly)} role="status" aria-live="polite" aria-atomic="true">
          {kbdAnnounce}
        </div>
        <div className="workspace-side-panel__explorer-nav shrink-0 border-b border-border px-2 pb-1.5 pt-1">
          {treeScope === 'session' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="workspace-side-panel__nav-btn workspace-side-panel__nav-btn--parent min-w-9 justify-center font-mono text-muted-foreground"
              aria-label={t('workspace.browseOutsideSession')}
              onClick={goToWorkspaceScope}
            >
              ..
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="workspace-side-panel__nav-btn text-muted-foreground"
              aria-label={t('workspace.backToSessionLabel')}
              onClick={goToSessionScope}
            >
              {t('workspace.backToSession')}
            </Button>
          )}
        </div>
        <ul
          className="workspace-side-panel__tree m-0 list-none p-0"
          role="tree"
          aria-label={t('workspace.directoriesLabel')}
          aria-describedby="workspace-tree-kbd-help"
        >
          <TreeRow
            key={WORKSPACE_TREE_ROOT_ROW_ID}
            node={{
              name: '/',
              path: WORKSPACE_TREE_ROOT_ROW_ID,
              type: 'directory',
              children: roots || [],
            }}
            expanded={expandedPaths}
            toggle={toggle}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
            agentBaseUrl={agentBaseUrl}
            dragSourcePath={dragSourcePath}
            onDragSourcePath={setDragSourcePath}
            dropTargetPath={dropTargetPath}
            onDropTargetPath={setDropTargetPath}
            onWorkspaceDrop={handleWorkspaceDrop}
            kbdGrabbedPath={kbdGrabbedPath}
            kbdDropHighlightTreePath={kbdDropHighlightTreePath}
            onKbdGrab={onKbdGrab}
            onClearKbdDnd={clearKbdDnd}
          />
        </ul>
        {truncated ? (
          <p className="workspace-side-panel__truncated px-3 pt-2 text-2xs text-warning">
            {t('workspace.listingTruncated')}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <>
      <ConfirmModal
        open={moveConflict !== null}
        title={t('workspace.replaceModalTitle')}
        message={moveConflict ? t('workspace.replaceModalMessage', { dest: moveConflict.destIfInto }) : ''}
        confirmLabel={t('workspace.overwrite')}
        danger
        loading={moveOverwriteLoading}
        loadingLabel={t('workspace.overwriting')}
        onConfirm={() => void handleWorkspaceMoveOverwrite()}
        onCancel={() => {
          if (!moveOverwriteLoading) setMoveConflict(null);
        }}
      />
      <aside
        className="workspace-side-panel flex h-full min-h-0 flex-col bg-background"
        data-testid="workspace-side-panel"
        aria-label={t('workspace.sidePanelLabel')}
      >
        <div className="workspace-side-panel__section-label flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5 text-[13px] font-semibold text-foreground">
          <span className="workspace-side-panel__section-title inline-flex items-center gap-1.5 [&_svg]:text-primary">
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M2 4.5A1.5 1.5 0 013.5 3H6l1.5 1.5h5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5z" />
            </svg>
            {t('workspace')}
          </span>
          <div className="workspace-side-panel__section-actions flex items-center gap-1">
            {sessionId?.trim() && agentBaseUrl.trim() ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="workspace-side-panel__zip-btn text-muted-foreground"
                onClick={() => void handleDownloadZip()}
                disabled={zipDownloading}
                aria-busy={zipDownloading}
              >
                <FolderArchive aria-hidden />
                {zipDownloading ? t('workspace.downloadingZip') : t('workspace.downloadZip')}
              </Button>
            ) : null}
            {onCollapse && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="workspace-side-panel__icon-btn workspace-side-panel__collapse text-muted-foreground"
                onClick={onCollapse}
                aria-label={t('workspace.hidePanel')}
                title={t('workspace.hidePanel')}
              >
                <PanelRightClose aria-hidden />
              </Button>
            )}
          </div>
        </div>
        {zipError ? (
          <p className="workspace-side-panel__zip-error px-3 py-1.5 text-xs text-destructive">{zipError}</p>
        ) : null}
        <div className="workspace-side-panel__explorer relative min-h-0 flex-1 overflow-auto border-b border-border pb-3">
          {explorerBody}
        </div>
        <div className="workspace-side-panel__bottom flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <PreviewPane
            agentBaseUrl={agentBaseUrl}
            sessionId={sessionId}
            selectedPath={selectedPath}
            onOpenExternalViewer={onOpenExternalViewer}
          />
        </div>
      </aside>
    </>
  );
};

export default WorkspaceSidePanel;
