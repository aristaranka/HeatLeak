/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { Minimize2 } from 'lucide-react';
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  clampAppPanelWidth,
  getAppPanelMaxWidth,
  persistAppPanelWidth,
  readAppPanelWidth,
} from '../lib/appPanelSizing';
import { cn } from '../lib/utils';

export interface PipPanelProps {
  children: React.ReactNode;
  /** Called when the user clicks the "dismiss to inline" button. */
  onDismiss?: () => void;
  className?: string;
}

/**
 * Persistent side panel for MCP Apps in "pip" (picture-in-picture) display mode.
 * Renders as a fixed-width right panel that persists across message scrolling.
 * Includes a resize handle and dismiss control.
 */
export const PipPanel: React.FC<PipPanelProps> = ({ children, onDismiss, className }) => {
  const { t } = useTranslation('chat');
  const [requestedWidth, setRequestedWidth] = useState(readAppPanelWidth);
  const [availableWidth, setAvailableWidth] = useState(Number.POSITIVE_INFINITY);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelWidth = clampAppPanelWidth(requestedWidth, availableWidth);
  const latestPanelWidthRef = useRef(panelWidth);
  const resizeStartRef = useRef<{ x: number; w: number } | null>(null);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      resizeStartRef.current = { x: e.clientX, w: panelWidth };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [panelWidth]
  );

  const onResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const newWidth = clampAppPanelWidth(start.w - (e.clientX - start.x), availableWidth);
      latestPanelWidthRef.current = newWidth;
      setRequestedWidth(newWidth);
    },
    [availableWidth]
  );

  const onResizePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    resizeStartRef.current = null;
    persistAppPanelWidth(latestPanelWidthRef.current);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  const onResizeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      let next: number | null = null;
      if (e.key === 'ArrowLeft') next = panelWidth + 32;
      if (e.key === 'ArrowRight') next = panelWidth - 32;
      if (e.key === 'Home') next = 320;
      if (e.key === 'End') next = Number.isFinite(availableWidth) ? Number.POSITIVE_INFINITY : panelWidth;
      if (next === null) return;
      e.preventDefault();
      const width = clampAppPanelWidth(next, availableWidth);
      latestPanelWidthRef.current = width;
      setRequestedWidth(width);
      persistAppPanelWidth(width);
    },
    [availableWidth, panelWidth]
  );

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const measure = () => {
      const chat = panel.previousElementSibling;
      const available = panel.getBoundingClientRect().width + (chat?.getBoundingClientRect().width ?? 0);
      if (available > 0) setAvailableWidth(available);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    if (panel.parentElement) observer.observe(panel.parentElement);
    const chat = panel.previousElementSibling;
    if (chat) observer.observe(chat);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={panelRef}
      className={cn('pip-panel relative flex min-h-0 flex-shrink-0 flex-col border-l border-border', className)}
      style={{ width: panelWidth }}
      data-testid="pip-panel"
    >
      <button
        type="button"
        className="pip-panel__resizer group absolute bottom-0 left-0 top-0 z-[5] w-2 cursor-col-resize border-0 bg-transparent p-0 focus-visible:outline-none"
        aria-label={t('panelResize')}
        title={t('panelResize')}
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={320}
        aria-valuemax={Number.isFinite(availableWidth) ? getAppPanelMaxWidth(availableWidth) : undefined}
        aria-valuenow={panelWidth}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        onKeyDown={onResizeKeyDown}
      >
        <span className="absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
      </button>
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t('appServer.pipPanel', 'App Panel')}</span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('appServer.collapse')}
            title={t('appServer.collapse')}
            data-testid="pip-panel-dismiss"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
};
