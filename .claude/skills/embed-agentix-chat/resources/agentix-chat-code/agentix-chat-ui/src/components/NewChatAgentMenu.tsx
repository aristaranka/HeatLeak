/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAgentDefinitions } from '../hooks/useAgentDefinitions';
import { cn } from '../lib/utils';
import { ICON_MAP } from './agentIconCatalog';
import { AgentIcon } from './AgentIcons';
import { Button } from './ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Skeleton } from './ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface NewChatAgentMenuProps {
  /** Create the committed Session for the chosen agent, then navigate. Rejects with a
   *  user-facing Error on failure (surfaced inline so the user can retry). */
  onPickAgent: (agentDefId: string) => Promise<void>;
  /** True when there's no service to start a chat on (no pod / serviceId yet), or when a known
   *  condition (e.g. no usable LLM models) would make any chat started right now fail. */
  disabled?: boolean;
  /** Explains why the trigger is disabled (shown as a tooltip). When set alongside
   *  {@link disabled}, the popover is skipped entirely — a plain disabled button + tooltip
   *  replaces it, since there is nothing left to open. */
  disabledTooltip?: string;
  /** Layout classes forwarded to the trigger button so the sidebar controls its placement. */
  className?: string;
}

/**
 * "+ New chat" trigger + an in-place agent-selection popover anchored below it. Picking an agent
 * immediately creates the chat (no confirm step): the parent's onPickAgent creates the committed
 * Session up front, so the chat opens already agent-bound. On success the parent navigates and this
 * popover closes; on failure it stays open with an inline error so the user can retry. The agent
 * list is fetched lazily only while the popover is open (via useAgentDefinitions, `enabled={open}`).
 */
export default function NewChatAgentMenu({
  onPickAgent,
  disabled = false,
  disabledTooltip,
  className,
}: NewChatAgentMenuProps) {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Sync guard — React state updates are async, so two cmdk onSelect events in the same tick
  // can both pass `if (submitting) return` and race the parent's MCP-gate supersede logic
  // (first pick resolves cancelled → popover closes, no chat).
  const submittingRef = useRef(false);
  const [error, setError] = useState('');
  // Bumped by the retry button to force a fresh page-0 reload after a load failure.
  const [retryKey, setRetryKey] = useState(0);
  const {
    agents,
    hasMore,
    loadingMore,
    loadError,
    initialLoading,
    fetching,
    search,
    setSearch,
    debouncedSearch,
    sentinelRef,
  } = useAgentDefinitions({ enabled: open, refreshKey: retryKey });

  // The sidebar keeps this menu mounted across chats, so the popover never unmounts itself — reset
  // the transient submit state whenever it closes (success, Escape, outside-click) so a reopen is clean.
  useEffect(() => {
    if (!open) {
      submittingRef.current = false;
      setSubmitting(false);
      setError('');
    }
  }, [open]);

  const handlePick = useCallback(
    async (id: string) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setError('');
      try {
        await onPickAgent(id);
        // Success: the new chat opens, but this menu stays mounted in the sidebar — close the popover
        // explicitly rather than relying on an unmount that never happens.
        setOpen(false);
      } catch (err) {
        submittingRef.current = false;
        setError(err instanceof Error ? err.message : t('newChatMenu.error'));
        setSubmitting(false);
      }
    },
    [onPickAgent, t]
  );

  // Distinct from a zero-result search: no agents exist at all (and nothing is loading / being searched).
  const showEmpty = !initialLoading && !loadError && agents.length === 0 && !debouncedSearch.trim() && !fetching;

  // Disabled for a known, explainable reason (e.g. no usable LLM models) — there is nothing to
  // open, so render a plain disabled button + tooltip instead of the popover rather than nest a
  // Tooltip inside a Popover trigger for a control that can never open.
  if (disabled && disabledTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('inline-flex', className)} tabIndex={0}>
            <Button
              type="button"
              className="w-full overflow-hidden whitespace-nowrap"
              disabled
              aria-disabled="true"
              title={disabledTooltip}
              data-testid="new-chat-menu-trigger"
            >
              {t('sidebar.newChat')}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent data-testid="new-chat-menu-trigger-tooltip">{disabledTooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          className={cn('overflow-hidden whitespace-nowrap', className)}
          disabled={disabled}
          data-testid="new-chat-menu-trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {t('sidebar.newChat')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0"
        // The list underneath can go skeleton→rows on a cold first open; a zoom-in on TOP of that
        // resize read as a double jump. Fade + slide still play — only the scale animation drops.
        animateZoom={false}
        data-testid="new-chat-menu-popover"
        aria-label={t('newChatMenu.title')}
      >
        <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{t('newChatMenu.title')}</p>
            <p className="truncate text-xs text-muted-foreground">{t('newChatMenu.subtitle')}</p>
          </div>
          {submitting && (
            <Loader2
              className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground"
              aria-label={t('newChatMenu.starting')}
            />
          )}
        </div>

        {/* Server-side search (shouldFilter={false}): the fetched rows ARE the filtered set. cmdk gives
            keyboard nav + the scroll container (CommandList is max-h capped + overflow-y-auto). */}
        <Command shouldFilter={false} loop>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={t('agentPicker.searchPlaceholder')}
            aria-label={t('agentPicker.filterAgents')}
            data-testid="new-chat-menu-search"
          />
          {/* min-h reserves the skeleton block's height up front (4 rows) so the cold first-open
              skeleton→rows / empty / error swap can't resize the popover — that resize is what
              made the previous frame feel like a jump. Keeps the base's max-h-[300px] cap. */}
          <CommandList className="min-h-48" aria-label={t('agentPicker.selectAgent')}>
            {loadError ? (
              <div className="px-3 py-6 text-center text-sm" data-testid="new-chat-menu-error">
                <p className="text-destructive">{t('agentPicker.loadFailed')}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setRetryKey((k) => k + 1)}
                  data-testid="new-chat-menu-retry"
                >
                  {t('newChatMenu.retry')}
                </Button>
              </div>
            ) : initialLoading ? (
              <div className="p-1" data-testid="new-chat-menu-loading" aria-label={t('agentPicker.loadingAgents')}>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
                    <Skeleton className="size-8 shrink-0 rounded-md" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-1/2" />
                      <Skeleton className="h-3 w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : showEmpty ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground" data-testid="new-chat-menu-empty">
                {t('agentPicker.noAgentsAvailable')}
              </div>
            ) : (
              <>
                <CommandEmpty>{t('agentPicker.noResults')}</CommandEmpty>
                <CommandGroup>
                  {agents.map((a) => (
                    <CommandItem
                      key={a.id}
                      value={a.id}
                      disabled={submitting}
                      onSelect={() => handlePick(a.id)}
                      className="items-start gap-2.5"
                      data-testid="new-chat-menu-option"
                    >
                      <span
                        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground [&_svg]:size-5"
                        data-testid={
                          a.icon && ICON_MAP.has(a.icon) ? 'new-chat-menu-icon-custom' : 'new-chat-menu-icon-default'
                        }
                        aria-hidden
                      >
                        {a.icon && ICON_MAP.has(a.icon) ? ICON_MAP.get(a.icon)!.svg : <AgentIcon />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium" title={a.name}>
                          {a.name}
                        </span>
                        {a.description && (
                          <span className="block truncate text-xs text-muted-foreground" title={a.description}>
                            {a.description}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {hasMore && (
                  <div
                    ref={sentinelRef}
                    className="px-2 py-1.5 text-center text-xs text-muted-foreground"
                    data-testid="new-chat-menu-sentinel"
                    aria-hidden
                  >
                    {loadingMore ? t('agentPicker.loadingMore') : ' '}
                  </div>
                )}
              </>
            )}
          </CommandList>
        </Command>

        {error && (
          <p
            className="border-t border-border px-3 py-2 text-sm text-destructive"
            role="alert"
            data-testid="new-chat-menu-submit-error"
          >
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
