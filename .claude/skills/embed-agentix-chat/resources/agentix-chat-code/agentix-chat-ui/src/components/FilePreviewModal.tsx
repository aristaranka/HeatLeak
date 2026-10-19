/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { ExternalLink, Minus, Plus, X } from 'lucide-react';
import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import FileContentRenderer from './FileContentRenderer';
import { Button } from './ui/button';
import { CopyTextButton } from './ui/copy-text-button';
import { SkeletonText } from './ui/skeleton';

interface FilePreviewModalProps {
  open: boolean;
  fileUrl: string;
  fileName: string;
  onClose: () => void;
}

const HTML_EXTENSIONS = /\.html?$/i;
const PDF_EXTENSIONS = /\.pdf$/i;
const IFRAME_EXTENSIONS = /\.(html?|pdf)$/i;
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;
const MAX_PREVIEW = 5 * 1024 * 1024;

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ open, fileUrl, fileName, onClose }) => {
  const { t } = useTranslation('chat');
  // `t`'s identity changes when the active language changes. The fetch effects below stamp
  // fallback text (too-large / load-failed) but must NOT re-run on a language switch, so they
  // read the latest `t` through this ref instead of listing it as a dependency. The plain
  // every-render write is idempotent and safe under Strict Mode's double render.
  const tRef = useRef(t);
  tRef.current = t;
  const [textContent, setTextContent] = useState<string | null>(null);
  // True when `textContent` holds a synthetic "too large" / "load failed" message rather than
  // real file content — that message must never be routed through FileContentRenderer's
  // Markdown/CSV parsing (e.g. a too-large .csv would otherwise render the error text as a
  // one-cell table).
  const [previewError, setPreviewError] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const useHtml = HTML_EXTENSIONS.test(fileName);
  const usePdf = PDF_EXTENSIONS.test(fileName);
  const useIframe = IFRAME_EXTENSIONS.test(fileName);
  const useImage = IMAGE_EXTENSIONS.test(fileName);

  // HTML artifact rendering: fetch the HTML content and inject into a sandboxed iframe
  // with allow-scripts but NO allow-same-origin (opaque origin — scripts run but cannot
  // reach app cookies/DOM/APIs).
  const [htmlBlobUrl, setHtmlBlobUrl] = useState<string | null>(null);
  const [htmlLoading, setHtmlLoading] = useState(false);
  const [htmlError, setHtmlError] = useState<string | null>(null);

  // Image zoom/pan viewer state. `scale` 1 == fit; translate is in CSS px from
  // the centered origin. Reset whenever the previewed image changes or reopens.
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; ox: number; oy: number }>({
    active: false,
    startX: 0,
    startY: 0,
    ox: 0,
    oy: 0,
  });
  const MIN_SCALE = 0.2;
  const MAX_SCALE = 8;

  useEffect(() => {
    setView({ scale: 1, x: 0, y: 0 });
  }, [fileUrl, open]);

  // Fetch HTML file content and create a blob URL for opaque-origin rendering.
  useEffect(() => {
    if (!open || !useHtml) {
      setHtmlBlobUrl(null);
      setHtmlError(null);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setHtmlLoading(true);
    setHtmlError(null);
    setHtmlBlobUrl(null);
    fetch(fileUrl, { signal: controller.signal, credentials: 'include', headers: { Range: `bytes=0-${MAX_PREVIEW}` } })
      .then((r) => {
        if (!r.ok && r.status !== 206) return Promise.reject(r.statusText);
        const len = Number(r.headers.get('content-length') || 0);
        if (len > MAX_PREVIEW) return Promise.reject('FILE_TOO_LARGE');
        return r.text();
      })
      .then((html) => {
        if (cancelled) return;
        if (html.length > MAX_PREVIEW) {
          setHtmlError(tRef.current('workspace.preview.tooLarge'));
        } else {
          const blob = new Blob([html], { type: 'text/html' });
          setHtmlBlobUrl(URL.createObjectURL(blob));
        }
        setHtmlLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (cancelled) return;
        setHtmlError(
          err === 'FILE_TOO_LARGE'
            ? tRef.current('workspace.preview.tooLarge')
            : tRef.current('workspace.preview.loadFailed')
        );
        setHtmlLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
      setHtmlBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [open, fileUrl, useHtml]);

  const resetView = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), []);

  // Zoom toward a focal point (defaults to viewport center) so the pixel under
  // the cursor stays put. With transform `translate(x,y) scale(s)` + center
  // origin: t2 = p - (s2/s)·(p − t).
  const zoomTo = useCallback((nextScale: number, focalX?: number, focalY?: number) => {
    setView((v) => {
      const s2 = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
      const rect = viewportRef.current?.getBoundingClientRect();
      const px = focalX != null && rect ? focalX - rect.left - rect.width / 2 : 0;
      const py = focalY != null && rect ? focalY - rect.top - rect.height / 2 : 0;
      const ratio = s2 / v.scale;
      return { scale: s2, x: px - ratio * (px - v.x), y: py - ratio * (py - v.y) };
    });
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!useImage) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomTo(view.scale * factor, e.clientX, e.clientY);
    },
    [useImage, view.scale, zoomTo]
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!useImage) return;
      dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, ox: view.x, oy: view.y };
    },
    [useImage, view.x, view.y]
  );

  useEffect(() => {
    if (!useImage) return undefined;
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d.active) return;
      setView((v) => ({ ...v, x: d.ox + (e.clientX - d.startX), y: d.oy + (e.clientY - d.startY) }));
    };
    const up = () => {
      dragRef.current.active = false;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [useImage]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onKey]);

  useEffect(() => {
    if (!open || useIframe || useImage) {
      setTextContent(null);
      return;
    }
    const controller = new AbortController();
    setTextContent(null);
    setPreviewError(false);
    setLoading(true);
    fetch(fileUrl, {
      signal: controller.signal,
      credentials: 'include',
      headers: { Range: `bytes=0-${MAX_PREVIEW}` },
    })
      .then((r) => {
        if (!r.ok && r.status !== 206) return Promise.reject(r.statusText);
        const len = Number(r.headers.get('content-length') || 0);
        if (len > MAX_PREVIEW) return Promise.reject('FILE_TOO_LARGE');
        return r.text();
      })
      .then((txt) => {
        if (txt.length > MAX_PREVIEW) {
          setTextContent(tRef.current('workspace.preview.tooLarge'));
          setPreviewError(true);
        } else {
          setTextContent(txt);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setTextContent(
          err === 'FILE_TOO_LARGE'
            ? tRef.current('workspace.preview.tooLarge')
            : tRef.current('workspace.preview.loadFailed')
        );
        setPreviewError(true);
        setLoading(false);
      });
    return () => controller.abort();
    // tRef.current (latest `t`, read without depending on it) stamps fallback text so this fetch
    // effect doesn't re-run on language change; render-time strings use `t` directly.
  }, [open, fileUrl, useIframe, useImage]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-6"
      data-testid="file-preview-backdrop"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={cn(
          'flex w-full max-w-[1100px] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg',
          useImage ? 'h-auto max-h-[92vh] w-auto max-w-[92vw]' : 'h-[85vh] max-h-[85vh]'
        )}
        data-testid="file-preview-panel"
        data-image={useImage ? 'true' : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={t('workspace.preview.dialogLabel', { name: fileName })}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <span className="max-w-[70%] truncate font-mono text-[13px] font-medium text-foreground" title={fileName}>
            {fileName}
          </span>
          <div className="flex items-center gap-2">
            {useImage && (
              <div className="mr-1 inline-flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  data-testid="file-preview-zoom-btn"
                  onClick={() => zoomTo(view.scale / 1.25)}
                  aria-label={t('workspace.preview.zoomOut')}
                  title={t('workspace.preview.zoomOut')}
                >
                  <Minus aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-w-12 tabular-nums"
                  data-testid="file-preview-zoom-reset"
                  onClick={resetView}
                  aria-label={t('workspace.preview.zoomReset')}
                  title={t('workspace.preview.zoomReset')}
                >
                  {Math.round(view.scale * 100)}%
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  data-testid="file-preview-zoom-btn"
                  onClick={() => zoomTo(view.scale * 1.25)}
                  aria-label={t('workspace.preview.zoomIn')}
                  title={t('workspace.preview.zoomIn')}
                >
                  <Plus aria-hidden />
                </Button>
              </div>
            )}
            {!useImage && !useIframe && !loading && !previewError && textContent != null && (
              <CopyTextButton text={textContent} data-testid="file-preview-copy" />
            )}
            <Button
              asChild
              variant="ghost"
              size="icon-sm"
              data-testid="file-preview-open"
              title={t('workspace.preview.openNewTab')}
            >
              <a href={fileUrl} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden />
              </a>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              data-testid="file-preview-close"
              onClick={onClose}
              aria-label={t('workspace.preview.closePreview')}
            >
              <X aria-hidden />
            </Button>
          </div>
        </div>
        <div className={cn('min-h-0 flex-1', useImage ? 'flex overflow-hidden' : 'overflow-auto')}>
          {useHtml ? (
            htmlLoading ? (
              <div
                className="h-full p-4"
                data-testid="file-preview-html-loading"
                aria-busy
                aria-label={t('workspace.preview.loading')}
              >
                <SkeletonText lines={8} />
              </div>
            ) : htmlError ? (
              <pre
                className="m-0 box-border h-full w-full overflow-auto whitespace-pre-wrap break-words border-none bg-background px-5 py-4 font-mono text-[13px] leading-relaxed text-foreground"
                data-testid="file-preview-html-error"
              >
                {htmlError}
              </pre>
            ) : htmlBlobUrl ? (
              <iframe
                src={htmlBlobUrl}
                className="h-full w-full border-none bg-white"
                data-testid="file-preview-html-iframe"
                title={fileName}
                sandbox="allow-scripts"
              />
            ) : null
          ) : usePdf ? (
            <iframe
              src={fileUrl}
              className="h-full w-full border-none bg-background"
              data-testid="file-preview-iframe"
              title={fileName}
              sandbox="allow-same-origin"
            />
          ) : useImage ? (
            <div
              ref={viewportRef}
              className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden"
              data-testid="file-preview-image-viewport"
              onWheel={onWheel}
              onMouseDown={onMouseDown}
              style={{ cursor: view.scale > 1 ? (dragRef.current.active ? 'grabbing' : 'grab') : 'default' }}
            >
              <img
                src={fileUrl}
                alt={fileName}
                className="block h-[min(80vh,calc(92vh-85px))] max-h-[calc(92vh-85px)] w-auto max-w-[calc(92vw-32px)] origin-center select-none object-contain"
                data-testid="file-preview-image"
                draggable={false}
                style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
              />
            </div>
          ) : loading ? (
            <div
              className="h-full p-4"
              data-testid="file-preview-loading"
              aria-busy
              aria-label={t('workspace.preview.loading')}
            >
              <SkeletonText lines={8} />
            </div>
          ) : previewError ? (
            <pre
              className="m-0 box-border h-full w-full overflow-auto whitespace-pre-wrap break-words border-none bg-background px-5 py-4 font-mono text-[13px] leading-relaxed text-foreground"
              data-testid="file-preview-text"
            >
              {textContent}
            </pre>
          ) : (
            <div className="box-border h-full w-full overflow-auto bg-background px-5 py-4">
              <FileContentRenderer
                fileName={fileName}
                content={textContent ?? ''}
                preClassName="m-0 whitespace-pre-wrap break-words border-none bg-transparent p-0 font-mono text-[13px] leading-relaxed text-foreground"
                preTestId="file-preview-text"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilePreviewModal;
