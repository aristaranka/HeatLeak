/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { ChevronDown, ChevronsUpDown, ChevronUp, MoveHorizontal } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';
import Pagination from '../Pagination';
import { Checkbox } from './checkbox';
import { Skeleton } from './skeleton';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './table';

type Align = 'left' | 'right' | 'center';

const ALIGN_CLASS: Record<Align, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

// Deterministic, content-shaped skeleton bar widths. Each column keeps a roughly
// consistent base width (so columns still read as columns) with a little per-row jitter
// so the right edge is ragged like real text — not a uniform block that reads as "empty
// rows". Deterministic (no Math.random) so it doesn't reflow/flicker between renders.
const SKELETON_BASE_W = [66, 42, 80, 52, 38, 72, 58];
function skeletonWidth(rowIdx: number, colIdx: number): string {
  const base = SKELETON_BASE_W[colIdx % SKELETON_BASE_W.length];
  const jitter = ((rowIdx * 7 + colIdx * 13) % 5) * 5 - 10; // -10 … +10
  return `${Math.max(30, Math.min(92, base + jitter))}%`;
}

export interface DataGridColumn<T> {
  /** Stable column id — also used as the sort key when `sortable` is set. */
  id: string;
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  /** Horizontal alignment applied to both the header cell and body cells. */
  align?: Align;
  headerClassName?: string;
  cellClassName?: string;
  /** Fixed column width (any CSS length), applied to the header cell. */
  width?: string;
  /**
   * Keep one edge column visible while a wide grid scrolls horizontally. Use at most one column
   * per edge; callers with several frozen columns need explicit cumulative offsets instead.
   */
  sticky?: 'left' | 'right';
  sortable?: boolean;
}

/**
 * Controlled row multiselect. The caller owns the selected-id set (typically React state) and gets
 * a new Set on every change. When set, the grid renders a leading checkbox column: a select-all in
 * the header (operating over the currently-rendered selectable rows) and a per-row checkbox. Rows
 * where `isSelectable` returns false render no checkbox and are excluded from select-all.
 */
export interface DataGridSelection<T> {
  selectedIds: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  /** Return false to make a row non-selectable (no checkbox, excluded from select-all). Default: all selectable. */
  isSelectable?: (row: T) => boolean;
}

export interface DataGridProps<T> {
  columns: DataGridColumn<T>[];
  data: T[];
  getRowId: (row: T, index: number) => string;

  // States — each rendered as a single full-width row inside the body.
  loading?: boolean;
  /**
   * Custom content for the loading state, rendered in a single full-width centered
   * row. When omitted (the default), the grid renders shimmer skeleton rows shaped
   * like the columns — prefer this over passing a "Loading…" string.
   */
  loadingContent?: React.ReactNode;
  /** Number of skeleton rows rendered while loading with no `loadingContent`. Default 5. */
  loadingRowCount?: number;
  /** Content for the empty row, shown when not loading and `data` is empty. */
  empty?: React.ReactNode;
  /** Optional error banner rendered above the table. */
  error?: React.ReactNode;

  // Interaction / escape hatches.
  onRowClick?: (row: T) => void;
  /**
   * Accessible name for a clickable row (only used when `onRowClick` is set). When provided,
   * the row is exposed as a keyboard-activatable `role="button"` with this label; Enter/Space
   * fire `onRowClick`. Omit for click-only rows that don't need an individual a11y name.
   */
  rowAriaLabel?: (row: T) => string;
  /**
   * Row navigation target. When set and it returns a URL for a row, that row renders a real
   * anchor (`<a href>`) stretched over it, so the browser's native "open in new tab" gestures —
   * ctrl/cmd-click, middle-click, right-click → Open in new tab — work. A plain left click
   * (including keyboard Enter) is intercepted and routed through `onRowClick`, preserving
   * client-side (SPA) navigation; modified / middle / right clicks fall through to the browser.
   * Requires `onRowClick` (the plain-click handler) and expects `rowAriaLabel` (the link's
   * accessible name). Ignored for rows in a grid with `selection` — the overlay would cover the
   * checkbox column, so a selectable grid keeps its plain click rows.
   */
  rowHref?: (row: T) => string | undefined;
  rowClassName?: (row: T, index: number) => string;
  /** Render an extra full-width row beneath a row when `isRowExpanded` is true. */
  renderExpandedRow?: (row: T) => React.ReactNode;
  isRowExpanded?: (row: T) => boolean;
  /** Extra rows appended inside the body after data rows (e.g. an inline form). */
  trailingRows?: React.ReactNode;

  // Sorting — state is owned by the caller; the grid only renders the caret and
  // fires `onSortChange` with the clicked column id.
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSortChange?: (columnId: string) => void;

  /**
   * Wrap the table in the standard bordered, rounded card. Default `true` — the
   * shared look every grid gets. Set `false` only when an ancestor already owns
   * the border (e.g. a panel that also holds a footer, or a sticky-scroll container).
   */
  bordered?: boolean;
  /**
   * Pin the header row to the top while the body scrolls. Wraps the table in its own
   * `overflow-auto` container (pair with `maxHeight` to cap it); the header keeps its
   * muted band and stays opaque over the scrolled rows. Independent of `bordered`.
   */
  stickyHeader?: boolean;
  /** Max height (any CSS length) of the scroll container when `stickyHeader` is set. */
  maxHeight?: string;
  className?: string;
  containerClassName?: string;
  /** Extra classes merged onto the (already tinted) header row. */
  headerRowClassName?: string;
  caption?: React.ReactNode;
  /**
   * Helper rendered only when the table is wider than its viewport. Use for dense grids where
   * overlay scrollbars can otherwise make the additional columns undiscoverable.
   */
  horizontalScrollHint?: React.ReactNode;

  /**
   * Server-side pagination. When set, the shared {@link Pagination} pager (the same
   * first/prev/position/next/last + page-size control the Skills / list pages use) renders
   * BELOW the table card. The caller owns page state + data fetching and passes only the current
   * page's rows as `data`, so the look is consistent app-wide. Omit for un-paginated grids.
   */
  pagination?: React.ComponentProps<typeof Pagination>;

  /** Controlled row multiselect. When set, a leading checkbox column is rendered. */
  selection?: DataGridSelection<T>;
  /** Accessible name for the header select-all checkbox (only used when `selection` is set). */
  selectAllLabel?: string;
}

const HEADER_CLASS = 'text-xs font-medium uppercase tracking-wide text-muted-foreground';
// Shared header strip — a solid muted band with a stronger bottom divider so it reads as a
// distinct header above the (white) data rows, not just a faint tint. The tint is pinned
// through hover so the header row never picks up the data-row hover style from the base TableRow.
const HEADER_ROW_CLASS = 'bg-muted hover:bg-muted border-b-2 border-border';

function stickyHeaderClass(sticky?: 'left' | 'right'): string | undefined {
  if (sticky === 'left') return 'sticky left-0 z-20 border-r border-border bg-muted';
  if (sticky === 'right') return 'sticky right-0 z-20 border-l border-border bg-muted';
  return undefined;
}

function stickyCellClass(sticky?: 'left' | 'right'): string | undefined {
  if (sticky === 'left')
    return 'sticky left-0 z-10 border-r border-border bg-background transition-colors group-hover/data-grid-row:bg-muted/50';
  if (sticky === 'right')
    return 'sticky right-0 z-10 border-l border-border bg-background transition-colors group-hover/data-grid-row:bg-muted/50';
  return undefined;
}

function SortCaret({ active, dir }: { active: boolean; dir?: 'asc' | 'desc' }) {
  if (!active) return <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />;
  return dir === 'asc' ? (
    <ChevronUp className="size-3.5" aria-hidden />
  ) : (
    <ChevronDown className="size-3.5" aria-hidden />
  );
}

export function DataGrid<T>({
  columns,
  data,
  getRowId,
  loading = false,
  loadingContent,
  loadingRowCount = 5,
  empty,
  error,
  onRowClick,
  rowAriaLabel,
  rowHref,
  rowClassName,
  renderExpandedRow,
  isRowExpanded,
  trailingRows,
  sortKey,
  sortDir,
  onSortChange,
  bordered = true,
  stickyHeader = false,
  maxHeight,
  className,
  containerClassName,
  headerRowClassName,
  caption,
  horizontalScrollHint,
  pagination,
  selection,
  selectAllLabel = 'Select all rows',
}: DataGridProps<T>) {
  const gridFrameRef = React.useRef<HTMLDivElement>(null);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = React.useState(false);
  const shouldMeasureHorizontalOverflow = horizontalScrollHint != null;
  const colCount = columns.length;
  // A leading checkbox column adds one to the span of the full-width state rows (loading / empty /
  // expanded), so those cells still stretch across the whole table.
  const effectiveColCount = colCount + (selection ? 1 : 0);

  // Select-all operates over the currently-rendered selectable rows only (the visible page). Ids
  // are resolved with the same getRowId the body uses so the header/body/set stay in lockstep.
  const selectableIds = selection
    ? data.reduce<string[]>((acc, row, index) => {
        if (selection.isSelectable?.(row) !== false) acc.push(getRowId(row, index));
        return acc;
      }, [])
    : [];
  const selectedRenderedCount = selection ? selectableIds.filter((id) => selection.selectedIds.has(id)).length : 0;
  const allRenderedSelected = selectableIds.length > 0 && selectedRenderedCount === selectableIds.length;
  const someRenderedSelected = selectedRenderedCount > 0 && !allRenderedSelected;
  const headerChecked: boolean | 'indeterminate' = allRenderedSelected
    ? true
    : someRenderedSelected
      ? 'indeterminate'
      : false;

  // Anchor for shift-click range selection: the index (into the rendered `data`) of the last row
  // whose checkbox was clicked. Shift-clicking another row selects every selectable row between the
  // anchor and it (inclusive) — the standard table range-select. Reset when the page's rows change
  // so a stale index can't map to an unrelated row after paging.
  const lastSelectedIndexRef = React.useRef<number | null>(null);
  const firstRowId = data.length > 0 ? getRowId(data[0], 0) : null;
  React.useEffect(() => {
    lastSelectedIndexRef.current = null;
  }, [firstRowId, data.length]);

  const updateHorizontalOverflow = React.useCallback(() => {
    if (!shouldMeasureHorizontalOverflow) {
      setHasHorizontalOverflow(false);
      return;
    }
    const frame = gridFrameRef.current;
    const scrollContainer = frame?.querySelector<HTMLElement>('[data-slot="table-container"]');
    if (!scrollContainer) return;
    setHasHorizontalOverflow(scrollContainer.scrollWidth > scrollContainer.clientWidth + 1);
  }, [shouldMeasureHorizontalOverflow]);

  // Content can change its scroll width without changing the element's observed border box. Measure after
  // every render, while keeping the observer/listener subscription stable across fresh data-array identities.
  React.useLayoutEffect(() => {
    updateHorizontalOverflow();
  });

  React.useEffect(() => {
    if (!shouldMeasureHorizontalOverflow) return undefined;
    const frame = gridFrameRef.current;
    const scrollContainer = frame?.querySelector<HTMLElement>('[data-slot="table-container"]');
    if (!scrollContainer) return undefined;
    window.addEventListener('resize', updateHorizontalOverflow);
    if (typeof ResizeObserver === 'undefined')
      return () => window.removeEventListener('resize', updateHorizontalOverflow);
    const observer = new ResizeObserver(updateHorizontalOverflow);
    observer.observe(scrollContainer);
    const table = scrollContainer.querySelector('table');
    if (table) observer.observe(table);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHorizontalOverflow);
    };
  }, [shouldMeasureHorizontalOverflow, updateHorizontalOverflow]);

  const toggleSelectAll = () => {
    if (!selection) return;
    const next = new Set(selection.selectedIds);
    if (allRenderedSelected) selectableIds.forEach((id) => next.delete(id));
    else selectableIds.forEach((id) => next.add(id));
    selection.onSelectionChange(next);
  };
  // Select a row from a checkbox click. Plain click toggles that one row; Shift+click selects the
  // contiguous range of selectable rows from the anchor to this row (adds them). `index` is the
  // row's position in the currently-rendered `data` (the visible page for a server-paginated grid).
  const selectRow = (index: number, shiftKey: boolean) => {
    if (!selection) return;
    const next = new Set(selection.selectedIds);
    const anchor = lastSelectedIndexRef.current;
    if (shiftKey && anchor != null) {
      const start = Math.min(anchor, index);
      const end = Math.max(anchor, index);
      for (let i = start; i <= end; i++) {
        const r = data[i];
        if (r && selection.isSelectable?.(r) !== false) next.add(getRowId(r, i));
      }
    } else {
      const id = getRowId(data[index], index);
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    lastSelectedIndexRef.current = index;
    selection.onSelectionChange(next);
  };

  return (
    <div className={cn('flex flex-col gap-3', containerClassName)} aria-busy={loading || undefined}>
      {error != null && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div
        ref={gridFrameRef}
        className={cn(
          bordered && 'rounded-md border bg-background',
          stickyHeader ? 'overflow-auto' : bordered && 'overflow-hidden'
        )}
        style={stickyHeader && maxHeight ? { maxHeight } : undefined}
      >
        <Table className={className}>
          {caption != null && <TableCaption>{caption}</TableCaption>}
          <TableHeader>
            <TableRow className={cn(HEADER_ROW_CLASS, headerRowClassName)}>
              {selection && (
                <TableHead className={cn('w-10', stickyHeader && 'sticky top-0 z-10 bg-muted')}>
                  <Checkbox
                    checked={headerChecked}
                    onCheckedChange={toggleSelectAll}
                    disabled={selectableIds.length === 0}
                    aria-label={selectAllLabel}
                  />
                </TableHead>
              )}
              {columns.map((col) => {
                const sortable = col.sortable && onSortChange;
                const active = sortable ? sortKey === col.id : false;
                return (
                  <TableHead
                    key={col.id}
                    aria-sort={
                      sortable ? (active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined
                    }
                    className={cn(
                      HEADER_CLASS,
                      stickyHeader && 'sticky top-0 z-10 bg-muted',
                      stickyHeaderClass(col.sticky),
                      col.align && ALIGN_CLASS[col.align],
                      col.headerClassName
                    )}
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {sortable ? (
                      // role="button" on a non-button element (not a native <button>) so a
                      // keyboard Enter/Space fires our handler exactly once — a native button
                      // would also synthesize a click and toggle the sort twice.
                      <span
                        role="button"
                        tabIndex={0}
                        className={cn(
                          'inline-flex cursor-pointer items-center gap-1 select-none hover:text-foreground',
                          active && 'text-foreground',
                          col.align === 'right' && 'flex-row-reverse'
                        )}
                        onClick={() => onSortChange(col.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSortChange(col.id);
                          }
                        }}
                      >
                        {col.header}
                        <SortCaret active={active} dir={sortDir} />
                      </span>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              loadingContent != null ? (
                <TableRow>
                  <TableCell colSpan={effectiveColCount} className="py-8 text-center text-sm text-muted-foreground">
                    {loadingContent}
                  </TableCell>
                </TableRow>
              ) : (
                Array.from({ length: loadingRowCount }).map((_, rowIdx) => (
                  <TableRow key={`skeleton-${rowIdx}`} aria-hidden>
                    {selection && (
                      <TableCell className="w-10">
                        <Skeleton className="size-4" />
                      </TableCell>
                    )}
                    {columns.map((col, colIdx) => (
                      <TableCell
                        key={col.id}
                        className={cn(
                          stickyCellClass(col.sticky),
                          col.align && ALIGN_CLASS[col.align],
                          col.cellClassName
                        )}
                      >
                        <Skeleton
                          className={cn('h-4', col.align === 'right' && 'ml-auto', col.align === 'center' && 'mx-auto')}
                          // Per-column width + ragged jitter so it reads as content, not empty
                          // cells; per-row delay cascades the shimmer down the table.
                          style={
                            {
                              width: skeletonWidth(rowIdx, colIdx),
                              '--shimmer-delay': `${rowIdx * 110}ms`,
                            } as React.CSSProperties
                          }
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )
            ) : data.length === 0 && !trailingRows ? (
              <TableRow>
                <TableCell colSpan={effectiveColCount} className="py-8 text-center text-sm text-muted-foreground">
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, index) => {
                const expanded = isRowExpanded?.(row) ?? false;
                // A navigable row with a resolved href renders a real anchor (below) so the
                // browser's native new-tab gestures work; that anchor then owns focus + keyboard
                // activation. Not combined with `selection` — the stretched overlay would cover
                // the checkbox column, so a selectable grid keeps the plain role="button" row.
                const href = rowHref?.(row);
                const anchorRow = Boolean(onRowClick) && href != null && !selection;
                const buttonRow = Boolean(onRowClick) && !anchorRow;
                return (
                  <React.Fragment key={getRowId(row, index)}>
                    <TableRow
                      className={cn(
                        'group/data-grid-row',
                        onRowClick && 'cursor-pointer',
                        anchorRow && 'relative',
                        rowClassName?.(row, index)
                      )}
                      onClick={buttonRow ? () => onRowClick?.(row) : undefined}
                      // A click-only row is keyboard-activatable: exposed as role="button" so
                      // Enter/Space fire the same handler as a click (a11y parity with a real button).
                      // An anchor row (anchorRow) lets its <a> own focus/keyboard instead.
                      role={buttonRow ? 'button' : undefined}
                      tabIndex={buttonRow ? 0 : undefined}
                      aria-label={buttonRow ? rowAriaLabel?.(row) : undefined}
                      onKeyDown={
                        buttonRow
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onRowClick?.(row);
                              }
                            }
                          : undefined
                      }
                    >
                      {selection && (
                        // stopPropagation so ticking the box never triggers row click / expansion;
                        // select-none so a Shift+click range-select doesn't also highlight page text.
                        <TableCell className="w-10 select-none" onClick={(e) => e.stopPropagation()}>
                          {selection.isSelectable?.(row) !== false ? (
                            <Checkbox
                              checked={selection.selectedIds.has(getRowId(row, index))}
                              // onClick (not onCheckedChange) so we can read shiftKey for range-select;
                              // the box stays controlled via `checked`, so there's no double toggle.
                              onClick={(e) => selectRow(index, e.shiftKey)}
                              aria-label={rowAriaLabel?.(row) ?? getRowId(row, index)}
                            />
                          ) : null}
                        </TableCell>
                      )}
                      {columns.map((col, colIdx) => (
                        <TableCell
                          key={col.id}
                          className={cn(
                            stickyCellClass(col.sticky),
                            col.align && ALIGN_CLASS[col.align],
                            col.cellClassName
                          )}
                        >
                          {anchorRow && colIdx === 0 && (
                            // Stretched over the whole row (the row is `relative`). Middle- and
                            // right-clicks never fire a `click` event, so they fall through to the
                            // browser's native open-in-new-tab / context menu. A plain left click
                            // (and keyboard Enter, which synthesizes a click) is intercepted for SPA
                            // nav; a modified click (ctrl/cmd/shift/alt) falls through so the browser
                            // opens it in a new tab / window.
                            <a
                              href={href}
                              aria-label={rowAriaLabel?.(row)}
                              className="absolute inset-0"
                              onClick={(e) => {
                                if (e.defaultPrevented) return;
                                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                                e.preventDefault();
                                onRowClick?.(row);
                              }}
                            />
                          )}
                          {col.cell(row, index)}
                        </TableCell>
                      ))}
                    </TableRow>
                    {renderExpandedRow && expanded && (
                      <TableRow>
                        <TableCell colSpan={effectiveColCount} className="bg-muted/30">
                          {renderExpandedRow(row)}
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })
            )}
            {!loading && trailingRows}
          </TableBody>
        </Table>
      </div>
      {hasHorizontalOverflow && horizontalScrollHint != null && (
        <p
          data-slot="data-grid-scroll-hint"
          className="-mt-1 flex items-center justify-end gap-1 text-xs text-muted-foreground"
        >
          <MoveHorizontal className="size-3.5 shrink-0" aria-hidden />
          {horizontalScrollHint}
        </p>
      )}
      {pagination && <Pagination {...pagination} />}
    </div>
  );
}

export default DataGrid;
