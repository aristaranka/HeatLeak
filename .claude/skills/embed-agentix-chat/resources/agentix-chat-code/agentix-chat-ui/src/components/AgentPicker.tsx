/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAgentDefinitions } from '../hooks/useAgentDefinitions';
import { cn } from '../lib/utils';
import { ChevronDownIcon } from './AgentIcons';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Skeleton } from './ui/skeleton';

interface AgentPickerProps {
  selectedDefId: string | null;
  locked: boolean;
  /** Parent-tracked name of the bound/selected agent. Locked state: the bound agent's name
   *  (`undefined` = session info still loading → render a skeleton). Unlocked state: the
   *  fallback label when the selected definition isn't on the currently loaded page. */
  agentName?: string | null;
  onSelect: (defId: string | null, name: string | null) => void;
  /** Bump to force a re-fetch (e.g. after the parent learns the selected agent was deleted). */
  refreshKey?: number;
  /** Reports whether any Agent.Definition exists once the (unlocked) list resolves. The parent
   *  gates the chat composer on this — no agents → nothing to start a new chat with. */
  onAvailabilityChange?: (available: boolean) => void;
  /** Borderless switcher: plain medium-weight label + chevron with a subtle hover, no bordered pill.
   *  For the chat header, where the agent name reads as the header title (per the AaaS design). */
  bare?: boolean;
  /** Agent id to prefer as the default highlight when nothing is explicitly selected;
   *  falls back to the first available agent. */
  preferredDefId?: string;
}

// Display name shown to users as a synchronous fallback before the picker's async
// fetch resolves (locked label with no bound name yet).
export const DEFAULT_AGENT_NAME = 'C3 Agent';

export default function AgentPicker({
  selectedDefId,
  locked,
  agentName,
  onSelect,
  refreshKey,
  onAvailabilityChange,
  bare,
  preferredDefId,
}: AgentPickerProps) {
  const { t } = useTranslation('chat');
  // Fetch / search / lazy-pagination live in the shared hook (also drives the new-chat popover).
  // Fetch whenever unlocked so the trigger label + availability resolve without opening the dropdown.
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
  } = useAgentDefinitions({ enabled: !locked, refreshKey });
  // Open/close + outside-click + Escape (focus restored to trigger) come free from Radix Popover.
  const [open, setOpen] = useState(false);
  // Live mirrors for the availability/auto-select edge effect below, kept out of its deps so a
  // changing callback identity or a mid-resolve selection can't retrigger or stale it.
  const selectedDefIdRef = useRef(selectedDefId);
  selectedDefIdRef.current = selectedDefId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onAvailabilityChangeRef = useRef(onAvailabilityChange);
  onAvailabilityChangeRef.current = onAvailabilityChange;
  const preferredDefIdRef = useRef(preferredDefId);
  preferredDefIdRef.current = preferredDefId;

  // Availability + auto-select-default fire once per fresh load, on the initialLoading true→false
  // edge (a debounced-search re-fetch never flips initialLoading, so it can't retrigger these).
  // Reading agents on the edge — rather than inside the fetch — avoids reporting against stale rows.
  const wasInitialLoadingRef = useRef(true);
  useEffect(() => {
    const justResolved = wasInitialLoadingRef.current && !initialLoading;
    wasInitialLoadingRef.current = initialLoading;
    if (locked || initialLoading || loadError || !justResolved) return;
    onAvailabilityChangeRef.current?.(agents.length > 0);
    if (!selectedDefIdRef.current && agents.length > 0) {
      // Nothing picked yet — highlight the preferred agent when it's on the list, else the first.
      // (The picker only mounts when agent-switching is enabled, so this is just the switcher's own default row.)
      const preferred = preferredDefIdRef.current;
      const defaultDef = (preferred ? agents.find((a) => a.id === preferred) : undefined) ?? agents[0];
      onSelectRef.current(defaultDef.id, defaultDef.name);
    }
  }, [locked, initialLoading, loadError, agents]);

  const handleSelect = useCallback(
    (defId: string | null, name: string | null) => {
      onSelect(defId, name);
      setOpen(false);
      setSearch('');
    },
    [onSelect, setSearch]
  );

  // Clear the search box whenever the popover closes so it reopens fresh.
  useEffect(() => {
    if (!open) setSearch('');
  }, [open, setSearch]);

  if (locked) {
    // undefined means "not yet known" (session info still loading). Render a
    // skeleton so the label doesn't flash the default while we wait.
    if (agentName === undefined) {
      return (
        <div
          className="inline-flex items-center"
          data-testid="agent-picker-loading"
          aria-label={t('agentPicker.loadingAgent')}
        >
          <Skeleton className="h-4 w-24" data-testid="agent-picker-skeleton" />
        </div>
      );
    }
    return (
      <div
        className="inline-flex items-center"
        data-testid="agent-picker-locked"
        aria-label={t('agentPicker.selectedAgent')}
      >
        <span className="truncate text-sm text-foreground">{agentName || DEFAULT_AGENT_NAME}</span>
      </div>
    );
  }

  // First fetch still in flight — show the skeleton, not the empty state.
  if (initialLoading) {
    return (
      <div
        className="inline-flex items-center"
        data-testid="agent-picker-loading"
        aria-label={t('agentPicker.loadingAgents')}
      >
        <span className="h-4 w-24 animate-pulse rounded-md bg-accent" data-testid="agent-picker-skeleton" />
      </div>
    );
  }

  if (loadError) {
    return (
      <button
        type="button"
        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm text-destructive opacity-80"
        data-testid="agent-picker-error"
        disabled
        title={t('agentPicker.loadFailed')}
      >
        <span>{t('agentPicker.unavailable')}</span>
      </button>
    );
  }

  // No Agent.Definition exists. Render an honest empty state (not a fake default);
  // the parent disables the composer via onAvailabilityChange(false). Guarded by the applied
  // (debounced) search AND `!fetching` so neither a zero-result search nor the in-flight unfiltered
  // re-fetch that follows clearing it collapses the picker — that case keeps the dropdown (cmdk's
  // CommandEmpty shows the "no results" row so the term can be edited).
  if (agents.length === 0 && !debouncedSearch.trim() && !fetching) {
    return (
      <div
        className="inline-flex items-center"
        data-testid="agent-picker-empty"
        aria-label={t('agentPicker.noAgentsAvailable')}
      >
        <span className="truncate text-sm text-muted-foreground">{t('agentPicker.noAgentsAvailable')}</span>
      </div>
    );
  }

  // When nothing is explicitly picked, the switcher highlights the preferred agent (when it's on
  // the loaded page) or the first available agent, so the trigger label and the marked row agree
  // instead of the label showing a name while no row is marked current.
  const defaultAgent = (preferredDefId ? agents.find((a) => a.id === preferredDefId) : undefined) ?? agents[0];
  const effectiveSelectedId = selectedDefId ?? defaultAgent?.id ?? null;
  const displayName = agents.find((a) => a.id === effectiveSelectedId)?.name ?? agentName ?? DEFAULT_AGENT_NAME;

  // Only one agent (and no more pages): nothing to choose — render a static label, no dropdown.
  // Guarded by the applied search + `!fetching` so a search narrowing to one result (or the in-flight
  // re-fetch after clearing it) doesn't transiently collapse the picker to a static label.
  if (agents.length === 1 && !hasMore && !debouncedSearch.trim() && !fetching) {
    return (
      <div
        className="inline-flex items-center"
        data-testid="agent-picker-single"
        aria-label={t('agentPicker.selectedAgent')}
      >
        <span className={cn('truncate text-sm text-foreground', bare && 'font-medium')}>{displayName}</span>
      </div>
    );
  }

  return (
    <span className="inline-flex" data-testid="agent-picker">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:opacity-60',
              bare
                ? 'px-2 py-1 font-medium hover:bg-secondary'
                : 'border border-border bg-background px-2.5 py-1.5 hover:bg-accent',
              open && (bare ? 'bg-secondary' : 'bg-accent')
            )}
            data-testid="agent-picker-trigger"
            aria-haspopup="listbox"
          >
            <span className="max-w-40 truncate">{displayName}</span>
            <ChevronDownIcon />
          </button>
        </PopoverTrigger>
        {/* The compact header switcher opens above (Radix flips on collision) at a fixed width so
            it never stretches the toolbar. */}
        <PopoverContent
          align="start"
          side="top"
          sideOffset={4}
          className="w-64 p-0"
          data-testid="agent-picker-dropdown"
        >
          {/* cmdk's built-in filter is disabled (shouldFilter={false}): search is server-side (the
              rows returned ARE the filtered set), so the local list must render them verbatim. */}
          <Command shouldFilter={false} loop>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={t('agentPicker.searchPlaceholder')}
              aria-label={t('agentPicker.filterAgents')}
              data-testid="agent-picker-search"
            />
            <CommandList id="agent-picker-list" aria-label={t('agentPicker.selectAgent')}>
              <CommandEmpty>{t('agentPicker.noResults')}</CommandEmpty>
              <CommandGroup>
                {agents.map((a) => {
                  const isCurrent = effectiveSelectedId === a.id;
                  return (
                    <CommandItem
                      key={a.id}
                      value={a.id}
                      data-current={isCurrent ? 'true' : undefined}
                      onSelect={() => handleSelect(a.id, a.name)}
                      className={cn('justify-between', isCurrent && 'font-medium')}
                    >
                      <span className="truncate">{a.name}</span>
                      {isCurrent && <Check className="ml-auto size-4 shrink-0 text-primary" aria-hidden />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {hasMore && (
                <div
                  ref={sentinelRef}
                  className="px-2 py-1.5 text-center text-xs text-muted-foreground"
                  data-testid="agent-picker-sentinel"
                  aria-hidden
                >
                  {loadingMore ? t('agentPicker.loadingMore') : ' '}
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </span>
  );
}
