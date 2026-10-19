/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { Minimize2 } from 'lucide-react';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';

export interface FullscreenOverlayProps {
  children: React.ReactNode;
  /** Called when the user exits fullscreen (Escape or button). */
  onExit?: () => void;
  className?: string;
}

/**
 * Exclusive fullscreen overlay for MCP Apps in "fullscreen" display mode.
 * Renders above all other content. Escape key exits. Only one app may be
 * fullscreen at a time (enforced by the display mode state manager).
 */
export const FullscreenOverlay: React.FC<FullscreenOverlayProps> = ({ children, onExit, className }) => {
  const { t } = useTranslation('chat');

  useEffect(() => {
    if (!onExit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      data-testid="fullscreen-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('appServer.exitFullscreen', 'Exit fullscreen')}
    >
      <div className="flex items-center justify-end border-b border-border px-3 py-1.5">
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('appServer.exitFullscreen', 'Exit fullscreen')}
            title={t('appServer.exitFullscreen', 'Exit fullscreen')}
            data-testid="fullscreen-overlay-exit"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>{children}</div>
    </div>
  );
};
