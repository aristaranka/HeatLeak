/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatTransport } from '../chatTransportContext';
import { useWorkspacePdfObjectUrl } from '../hooks/useWorkspacePdfObjectUrl';
import { workspaceFilesUserMessage } from '../lib/chatApi';
import { DownloadIcon } from './AgentIcons';
import FileContentRenderer from './FileContentRenderer';
import { Button } from './ui/button';
import { SkeletonText } from './ui/skeleton';
import type { WorkspaceViewResponse } from '../lib/chatApi';

const HTML_RE = /\.html?$/i;

export type WorkspaceFileViewerProps = {
  path: string;
  agentBaseUrl: string;
  sessionId: string;
  onClose: () => void;
};

const WorkspaceFileViewer: React.FC<WorkspaceFileViewerProps> = ({ path, agentBaseUrl, sessionId, onClose }) => {
  const { t } = useTranslation('chat');
  // Latest `t` via a ref so the fetch effect / download callback below produce stable user-facing
  // copy without taking `t` as a dependency (which would re-run the fetch on a UI-language change).
  const tRef = useRef(t);
  tRef.current = t;
  const transport = useChatTransport();
  const [data, setData] = useState<WorkspaceViewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const isHtml = HTML_RE.test(path);
  const [htmlBlobUrl, setHtmlBlobUrl] = useState<string | null>(null);
  const [htmlLoading, setHtmlLoading] = useState(false);
  const [htmlError, setHtmlError] = useState<string | null>(null);

  // PDFs are embedded via the shared resolver (same path the side-panel preview uses) rather than
  // fetched as text — workspace-view returns `binary` for them, which is why the full viewer used
  // to show "binary file — cannot display as text".
  const pdf = useWorkspacePdfObjectUrl(agentBaseUrl, sessionId, path);

  // Fetch HTML via the transport and create a blob URL for
  // opaque-origin iframe rendering — never hit the pod URL from the browser on the embed path.
  useEffect(() => {
    if (!isHtml || !path.trim() || !agentBaseUrl.trim() || !sessionId.trim()) {
      setHtmlBlobUrl(null);
      setHtmlError(null);
      setHtmlLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setHtmlLoading(true);
    setHtmlError(null);
    setHtmlBlobUrl(null);
    (async () => {
      try {
        const view = await transport.fetchWorkspaceView(agentBaseUrl, sessionId, path, {
          signal: controller.signal,
        });
        if (cancelled) return;
        if (view.kind !== 'text' || typeof view.content !== 'string') {
          setHtmlError(t('workspace.preview.loadFailed'));
          setHtmlLoading(false);
          return;
        }
        const blob = new Blob([view.content], { type: 'text/html' });
        setHtmlBlobUrl(URL.createObjectURL(blob));
        setHtmlLoading(false);
      } catch (err) {
        if ((err as { name?: string } | null)?.name === 'AbortError') return;
        if (cancelled) return;
        setHtmlError(t('workspace.preview.loadFailed'));
        setHtmlLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      setHtmlBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [isHtml, path, agentBaseUrl, sessionId, t, transport]);

  useEffect(() => {
    setDownloadError('');
  }, [path]);

  useEffect(() => {
    if (!path.trim() || !agentBaseUrl.trim() || !sessionId.trim() || pdf.isPdf || isHtml) {
      setData(null);
      setLoadError('');
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setLoadError('');
    setData(null);
    (async () => {
      try {
        const view = await transport.fetchWorkspaceView(agentBaseUrl, sessionId, path, { signal: ac.signal });
        setData(view);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        // Stable user-facing copy via workspaceFilesUserMessage (not effect deps).
        setLoadError(workspaceFilesUserMessage(err, 'view', tRef.current));
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [agentBaseUrl, sessionId, path, pdf.isPdf, isHtml, transport]);

  const handleDownload = useCallback(async () => {
    if (!path.trim() || !agentBaseUrl.trim() || !sessionId.trim()) return;
    setDownloadError('');
    setDownloading(true);
    try {
      await transport.downloadWorkspaceFile(agentBaseUrl, sessionId, path);
    } catch (err) {
      setDownloadError(workspaceFilesUserMessage(err, 'download', tRef.current));
    } finally {
      setDownloading(false);
    }
  }, [agentBaseUrl, sessionId, path, t, transport]);

  // PDF state lives in the shared hook; HTML in htmlLoading/htmlError; text/image state in `data`.
  const showLoading = pdf.isPdf ? pdf.pdfLoading : isHtml ? htmlLoading : loading;
  const showError = pdf.isPdf ? pdf.pdfError : isHtml ? htmlError : loadError;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-background"
      data-testid="workspace-file-viewer"
      aria-label={t('workspace.fileViewerLabel')}
    >
      <header className="flex min-h-11 flex-shrink-0 items-center gap-3 border-b border-border bg-muted/40 px-3.5 py-2.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold leading-8" title={path}>
          {path}
        </span>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="workspace-file-viewer-download"
            aria-label={t('workspace.downloadFile')}
            title={t('workspace.downloadFile')}
            disabled={downloading || !agentBaseUrl.trim() || !sessionId.trim()}
            onClick={() => void handleDownload()}
          >
            <DownloadIcon />
            {t('workspace.download')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-testid="workspace-file-viewer-close"
            aria-label={t('workspace.closeViewer')}
            title={t('workspace.close')}
            onClick={onClose}
          >
            <X aria-hidden />
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {downloadError ? (
          <div className="mb-3 text-destructive" data-testid="workspace-file-viewer-download-error" role="alert">
            {downloadError}
          </div>
        ) : null}
        {showLoading ? (
          <div
            className="min-h-[120px] p-3"
            data-testid="workspace-file-viewer-center"
            aria-busy
            aria-label={t('workspace.loadingFile')}
          >
            <SkeletonText lines={6} />
          </div>
        ) : null}
        {!showLoading && showError ? (
          <div
            className="flex min-h-[120px] items-center justify-center text-[13px] text-destructive"
            data-testid="workspace-file-viewer-error"
          >
            {showError}
          </div>
        ) : null}
        {!showLoading && !showError && pdf.isPdf && pdf.pdfEmbedSrc ? (
          <div className="flex h-full min-h-[480px]">
            <embed
              type="application/pdf"
              className="min-h-[480px] w-full border-0"
              src={pdf.pdfEmbedSrc}
              title={t('workspace.pdfPreviewTitle', { path })}
            />
          </div>
        ) : null}
        {!showLoading && !showError && isHtml && htmlBlobUrl ? (
          <div className="flex h-full min-h-[480px]">
            <iframe
              src={htmlBlobUrl}
              className="min-h-[480px] w-full border-none bg-white"
              title={path}
              sandbox="allow-scripts"
            />
          </div>
        ) : null}
        {!showLoading && !showError && !pdf.isPdf && !isHtml && data?.kind === 'binary' ? (
          <p className="m-0 text-[13px] text-muted-foreground" data-testid="workspace-file-viewer-msg">
            {data.message}
          </p>
        ) : null}
        {!showLoading && !showError && !pdf.isPdf && !isHtml && data?.kind === 'image' ? (
          <div className="flex justify-center">
            <img
              className="block h-auto max-w-full object-contain"
              data-testid="workspace-file-viewer-image"
              src={`data:${data.mime};base64,${data.base64}`}
              alt={t('workspace.fileImageAlt', { path })}
            />
          </div>
        ) : null}
        {!showLoading && !showError && !pdf.isPdf && !isHtml && data?.kind === 'text' ? (
          <>
            {data.truncated ? (
              <p className="mb-3 text-xs text-muted-foreground" data-testid="workspace-file-viewer-hint">
                {t('workspace.viewerTruncatedHint')}
              </p>
            ) : null}
            <FileContentRenderer
              fileName={path}
              content={data.content}
              preClassName="m-0 whitespace-pre-wrap break-words border-0 bg-transparent p-0 font-mono text-xs leading-[1.45] text-foreground"
              preTestId="workspace-file-viewer-pre"
              truncated={data.truncated}
            />
          </>
        ) : null}
      </div>
    </div>
  );
};

export default WorkspaceFileViewer;
