/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOptionalChatTransport } from '../chatTransportContext';
import { listDefinitions, PAGE_SIZE } from '../lib/agentDefsApi';
import { chatQueryKeys } from '../lib/queryKeys';
import type { AgentDefinitionRow, ListResult } from '../lib/agentDefsApi';

// Matches AgentsPage's search debounce so the agent-list surfaces feel identical.
const SEARCH_DEBOUNCE_MS = 300;

export interface UseAgentDefinitionsResult {
  agents: AgentDefinitionRow[];
  hasMore: boolean;
  loadingMore: boolean;
  loadError: boolean;
  /** True until the first page-0 fetch (or a refreshKey reload) settles. */
  initialLoading: boolean;
  /** True while ANY page-0 fetch (initial / refresh / search / clear) is in flight. Consumers use
   *  this to keep a zero-result search — or the in-flight re-fetch after clearing it — from flashing
   *  the empty state. */
  fetching: boolean;
  search: string;
  setSearch: (value: string) => void;
  /** The applied (debounced + trimmed) term the current rows reflect. */
  debouncedSearch: string;
  loadMore: () => void;
  /** Ref callback for a bottom-of-list sentinel; wires the IntersectionObserver that lazy-loads
   *  the next page when the sentinel scrolls into view inside a cmdk list. */
  sentinelRef: (node: HTMLDivElement | null) => void;
}

export interface UseAgentDefinitionsOptions {
  /** Fetch only while enabled. The underlying React Query cache SURVIVES a disable (only the local
   *  search text resets) — so a re-enable (e.g. reopening a popover) within the shared 30s staleTime
   *  serves the cached rows instantly instead of a cold page-0 fetch. Callers that need the list on
   *  mount (the chat-header switcher) pass a constant `true`; lazy callers (the new-chat popover)
   *  pass their open state. */
  enabled: boolean;
  /** Bump to force a fresh page-0 reload (e.g. after the parent learns a row was deleted). */
  refreshKey?: number;
}

/**
 * Data hook owning the agent-definition list surface shared by the chat-header `AgentPicker` and the
 * new-chat popover: server-side search (the returned rows ARE the filtered set), lazy pagination via
 * a sentinel IntersectionObserver, and the load / error / in-flight state both render. It is purely
 * the fetch state machine — selection concerns (auto-selecting the default, reporting availability)
 * stay in the consumer, keyed off the `initialLoading` edge.
 *
 * Backed by React Query's `useInfiniteQuery`: the query cache is keyed by the debounced search term
 * and is NOT cleared when `enabled` flips false, so a popover that closes and reopens within the
 * shared staleTime (30s, `lib/queryClient.ts`) reuses the cached rows instead of a cold refetch —
 * no skeleton flash, no popover resize on reopen.
 */
export function useAgentDefinitions({ enabled, refreshKey }: UseAgentDefinitionsOptions): UseAgentDefinitionsResult {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const prevRefreshKeyRef = useRef(refreshKey);
  // Prefer the page transport (host DefinitionApi may be absent on a consumer app).
  // Fall back to host `@/lib/agentsApi` when mounted outside ChatPage (tests / host-only).
  const transport = useOptionalChatTransport();

  // Debounce the search box into debouncedSearch, which drives the page-0 re-fetch below.
  useEffect(() => {
    if (!enabled) return;
    const id = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search, enabled]);

  // Reset the local search text (only) when disabled so a re-enable (reopen) starts unfiltered. The
  // query cache is deliberately left alone — clearing it would defeat the whole point of caching.
  useEffect(() => {
    if (enabled) return;
    setSearch('');
    setDebouncedSearch('');
  }, [enabled]);

  const query = useInfiniteQuery({
    queryKey: [...chatQueryKeys.agentDefinitions, 'picker', debouncedSearch, transport ? 'transport' : 'host'],
    queryFn: ({ pageParam }) => {
      // Prefer the page transport. Never fall through to host DefinitionApi while a
      // transport is mounted — a consumer-app 404 there surfaces as "Failed to load agents"
      // even when the transport's own listAgentDefinitions works.
      if (transport) {
        if (typeof transport.listAgentDefinitions !== 'function') {
          return Promise.reject(
            new Error('Chat transport is missing listAgentDefinitions — rebuild/redeploy the consumer UI bundle.')
          );
        }
        return transport.listAgentDefinitions(pageParam, PAGE_SIZE, debouncedSearch);
      }
      return listDefinitions(pageParam, PAGE_SIZE, debouncedSearch);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage: ListResult, allPages) =>
      lastPage.hasMore ? allPages.reduce((n, p) => n + p.rows.length, 0) : undefined,
    enabled,
    // Each debounced search term is its OWN cache entry (queryKey above), so without this a term
    // that has never been fetched would render as a cold "pending" query — flashing the loading
    // skeleton on every keystroke. `placeholderData` carries the previous term's rows forward while
    // the new term's page-0 fetch is in flight, which also flips React Query's derived `status` to
    // 'success' (not 'pending') for that window — see the `initialLoading` derivation below.
    placeholderData: (previous) => previous,
    // Inherit the shared client's default staleTime (30s) — a reopen within that window serves the
    // cached page(s) with no refetch, which is what removes the reopen-flicker.
  });

  // refreshKey is intentionally NOT in the queryKey (that would leak one cache entry per bump); a
  // bump instead forces a fresh page-0 read of the CURRENT key via an explicit refetch. `query` is
  // read through a ref so the effect only re-runs on an actual refreshKey/enabled change, not on
  // every render (the query object identity is not stable across renders).
  const queryRef = useRef(query);
  queryRef.current = query;
  useEffect(() => {
    if (prevRefreshKeyRef.current === refreshKey) return;
    prevRefreshKeyRef.current = refreshKey;
    if (enabled) void queryRef.current.refetch();
  }, [refreshKey, enabled]);

  // `placeholderData` only bridges a NEW key while its fetch is `pending` (see above) — once that
  // fetch settles as an error, React Query flips the query's real status to 'error' and `data` back
  // to undefined (a key that never succeeded has nothing to hold). So a search term whose page-0
  // fetch fails would otherwise show as empty + terminal, discarding whatever the previous
  // (different-key) search term had loaded — the old hand-rolled hook's non-terminal-search-failure
  // contract. Bridge that gap ourselves: remember the last successfully-fetched pages and fall back
  // to them when the active key has no data of its own AND errored. Plain (non-effect) ref writes
  // are intentional here — this only ever memoizes the most recent successful value, so re-running
  // it under React 18 Strict Mode's double-render is idempotent.
  const lastGoodDataRef = useRef<typeof query.data>(undefined);
  if (query.data !== undefined) lastGoodDataRef.current = query.data;
  const effectiveData = query.data ?? (query.isError ? lastGoodDataRef.current : undefined);

  const agents = effectiveData ? effectiveData.pages.flatMap((p) => p.rows) : [];
  // hasNextPage is computed off the ACTIVE query's own data; when we're serving the fallback instead
  // (active key errored with nothing of its own), derive it from the fallback's own last page rather
  // than trusting `query.hasNextPage` (which reflects the errored, empty-data query).
  const hasMore =
    query.data !== undefined
      ? (query.hasNextPage ?? false)
      : query.isError && lastGoodDataRef.current
        ? (lastGoodDataRef.current.pages.at(-1)?.hasMore ?? false)
        : false;
  const loadingMore = query.isFetchingNextPage;
  // A disabled, never-fetched hook has no data and RQ reports isLoading:false (nothing pending) —
  // derive "pristine" (no data yet) explicitly so a hook that hasn't been enabled yet still reports
  // the same `initialLoading: true` contract callers rely on before the first open.
  const initialLoading = enabled ? query.isLoading : query.data === undefined;
  // Terminal only when there is NO data at all — including the fallback above. A search-refetch
  // failure that still has a fallback (or a fresh query still holding placeholder data) is non-fatal:
  // the popover keeps its prior rows and the user can retry by editing the term.
  const loadError = query.isError && effectiveData === undefined;

  const loadMore = useCallback(() => {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    void query.fetchNextPage();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  const sentinelObserverRef = useRef<IntersectionObserver | null>(null);

  // Cleanup observer on unmount.
  useEffect(() => {
    return () => {
      sentinelObserverRef.current?.disconnect();
      sentinelObserverRef.current = null;
    };
  }, []);

  // Fires loadMore when the bottom-of-list sentinel scrolls into view inside the dropdown. The
  // IntersectionObserver root is the cmdk list (the scroll container), found via the sentinel's
  // nearest [data-slot="command-list"] ancestor since the ShadCN wrappers don't forward refs.
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (sentinelObserverRef.current) {
        sentinelObserverRef.current.disconnect();
        sentinelObserverRef.current = null;
      }
      if (!node || !hasMore || loadingMore || !enabled) return;
      const root = node.closest('[data-slot="command-list"]');
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) loadMore();
        },
        { root, rootMargin: '80px' }
      );
      observer.observe(node);
      sentinelObserverRef.current = observer;
    },
    [hasMore, loadingMore, enabled, loadMore]
  );

  return {
    agents,
    hasMore,
    loadingMore,
    loadError,
    initialLoading,
    fetching: query.isFetching,
    search,
    setSearch,
    debouncedSearch,
    loadMore,
    sentinelRef,
  };
}
