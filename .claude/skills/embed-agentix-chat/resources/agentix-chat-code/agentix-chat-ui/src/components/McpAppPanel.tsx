/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { ChevronDown, Minimize2, X } from 'lucide-react';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import type { AppPanelState, McpAppDescriptor } from '../lib/mcpAppRegistry';

export interface McpAppPanelProps {
  state: AppPanelState;
  onSelect: (instanceId: string) => void;
  onClose: (instanceId: string) => void;
  onExitFullscreen: () => void;
  renderApp: (app: McpAppDescriptor, hidden: boolean) => React.ReactNode;
  className?: string;
}

const VISIBLE_TAB_COUNT = 4;

export function McpAppPanel({ state, onSelect, onClose, onExitFullscreen, renderApp, className }: McpAppPanelProps) {
  const { t } = useTranslation('chat');
  const apps = state.tabOrder.map((id) => state.apps.get(id)).filter((app): app is McpAppDescriptor => !!app);
  const visible = apps.slice(0, VISIBLE_TAB_COUNT);
  const overflow = apps.slice(VISIBLE_TAB_COUNT);

  useEffect(() => {
    if (!state.fullscreenId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onExitFullscreen();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.fullscreenId, onExitFullscreen]);

  if (apps.length === 0) return null;

  return (
    <section
      className={cn(
        'app-panel flex min-h-0 min-w-0 flex-1 flex-col bg-background',
        state.fullscreenId && 'fixed inset-0 z-50',
        className
      )}
      aria-label={t('appServer.pipPanel')}
      data-testid="mcp-app-panel"
    >
      <header className="flex h-10 min-w-0 shrink-0 items-center gap-1 border-b border-border px-2">
        <div
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          role="tablist"
          aria-label={t('appServer.openApps')}
        >
          {visible.map((app) => (
            <AppTab
              key={app.instanceId}
              app={app}
              selected={state.selectedId === app.instanceId}
              onSelect={onSelect}
              onClose={onClose}
            />
          ))}
        </div>
        {overflow.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="xs" aria-label={t('appServer.moreApps')}>
                {t('appServer.more')} <ChevronDown />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-1">
              {overflow.map((app) => (
                <div key={app.instanceId} className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-w-0 flex-1 justify-start"
                    onClick={() => onSelect(app.instanceId)}
                  >
                    <span className="truncate">{app.title}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('appServer.closeApp', { title: app.title })}
                    onClick={() => onClose(app.instanceId)}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </PopoverContent>
          </Popover>
        )}
        {state.fullscreenId && (
          <Button variant="ghost" size="icon-sm" onClick={onExitFullscreen} aria-label={t('appServer.exitFullscreen')}>
            <Minimize2 />
          </Button>
        )}
      </header>
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {apps.map((app) => {
          const hidden = app.instanceId !== state.selectedId;
          return (
            <div
              key={app.instanceId}
              className={cn('min-h-0 min-w-0 flex-1 flex-col', hidden ? 'hidden' : 'flex')}
              role="tabpanel"
              aria-hidden={hidden}
              data-app-instance-id={app.instanceId}
            >
              {renderApp(app, hidden)}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AppTab({
  app,
  selected,
  onSelect,
  onClose,
}: {
  app: McpAppDescriptor;
  selected: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const { t } = useTranslation('chat');
  return (
    <div className={cn('flex max-w-52 items-center rounded-md', selected && 'bg-muted')}>
      <Button
        variant="ghost"
        size="xs"
        className="min-w-0 rounded-r-none"
        role="tab"
        aria-selected={selected}
        tabIndex={selected ? 0 : -1}
        onClick={() => onSelect(app.instanceId)}
      >
        <span className="truncate">{app.title}</span>
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="rounded-l-none"
        aria-label={t('appServer.closeApp', { title: app.title })}
        onClick={() => onClose(app.instanceId)}
      >
        <X />
      </Button>
    </div>
  );
}
