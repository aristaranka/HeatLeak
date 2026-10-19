/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';

import { Pagination } from '../pagination/Pagination';
import './DataGrid.css';

// Column definition for the grid
export interface Column<T> {
  key: string;
  header: string;
  width: number;
  render?: (item: T, index: number) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
}

// Props for the DataGrid component
export interface DataGridProps<T> {
  // Required
  title: string;
  data: T[];
  columns: Column<T>[];
  getRowId: (item: T) => string | number;

  // Search
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;

  // Actions slot (rendered after search bar and after filters)
  actions?: React.ReactNode;

  // Selection action bar slot (rendered above the table; typically shown only when rows are selected)
  selectionBar?: React.ReactNode;

  // Filters slot (rendered after search bar, before actions)
  filters?: React.ReactNode;

  // Active filters slot (rendered below search bar row)
  activeFilters?: React.ReactNode;

  // Checkboxes
  showCheckboxes?: boolean;
  selectedRows?: Set<number | string>;
  onSelectRow?: (id: number | string, checked: boolean) => void;
  onSelectAll?: (checked: boolean) => void;
  selectAll?: boolean;

  /**
   * When true, every row (on any page) renders as selected and the header checkbox is checked,
   * regardless of `selectedRows`. Used for "select all matching" mode where the selection spans
   * pages that aren't loaded. Toggling any checkbox still fires the normal callbacks so the parent
   * can drop back to per-row selection.
   */
  allRowsForced?: boolean;
  getCheckboxLabel?: (item: T, rowId: string | number) => string;

  // Pagination
  initialPageSize?: number;

  /**
   * Server-side pagination mode. When true, `data` is treated as the current page (already
   * fetched, filtered, and sliced by the parent) and the grid does NOT slice or client-filter it.
   * Pagination is controlled via `page` / `pageSize` / `totalItems` and the change callbacks.
   * When false/undefined the grid keeps its original client-side behavior (used by the Tags tab).
   */
  serverSide?: boolean;

  // Controlled pagination (used with serverSide)
  page?: number;
  pageSize?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;

  // Empty state
  emptyMessage?: string;

  // Custom filter function for search
  filterFn?: (item: T, searchQuery: string) => boolean;

  // Row actions (e.g. delete icon) - rendered in an extra column, shown on row hover
  rowActions?: (item: T, index: number) => React.ReactNode;
}

export function DataGrid<T>({
  title,
  data,
  columns,
  getRowId,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  actions,
  selectionBar,
  filters,
  activeFilters,
  showCheckboxes = false,
  selectedRows,
  onSelectRow,
  onSelectAll,
  selectAll = false,
  allRowsForced = false,
  getCheckboxLabel,
  initialPageSize = 10,
  serverSide = false,
  page: controlledPage,
  pageSize: controlledPageSize,
  totalItems: controlledTotalItems,
  onPageChange,
  onPageSizeChange,
  emptyMessage,
  filterFn,
  rowActions,
}: DataGridProps<T>) {
  const { t } = useTranslation();
  const resolvedSearchPlaceholder = searchPlaceholder ?? t('common.dataGrid.searchPlaceholder');
  const resolvedEmptyMessage = emptyMessage ?? t('common.dataGrid.emptyMessage');

  // Internal search state (used if not controlled)
  const [internalSearchValue, setInternalSearchValue] = useState('');
  const searchQuery = searchValue !== undefined ? searchValue : internalSearchValue;

  // Pagination state (client-side mode uses internal state; server-side mode is controlled by parent)
  const [internalPage, setInternalPage] = useState(1);
  const [internalPageSize, setInternalPageSize] = useState(initialPageSize);
  const currentPage = serverSide ? (controlledPage ?? 1) : internalPage;
  const pageSize = serverSide ? (controlledPageSize ?? initialPageSize) : internalPageSize;

  const setCurrentPage = useCallback(
    (page: number) => {
      if (serverSide) {
        onPageChange?.(page);
      } else {
        setInternalPage(page);
      }
    },
    [serverSide, onPageChange]
  );

  // Handle search change
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (onSearchChange) {
        onSearchChange(value);
      } else {
        setInternalSearchValue(value);
      }
      setCurrentPage(1); // Reset to first page on search
    },
    [onSearchChange, setCurrentPage]
  );

  /*
   * Filter data based on search query. In server-side mode the parent already fetched the
   * matching rows, so we render `data` as-is; only client-side mode filters locally.
   */
  const filteredData = useMemo(() => {
    if (serverSide || !searchQuery.trim() || !filterFn) {
      return data;
    }

    return data.filter((item) => filterFn(item, searchQuery));
  }, [serverSide, data, searchQuery, filterFn]);

  /*
   * Calculate paginated data. In server-side mode `data` is already the current page and
   * `totalItems` is the backend count; in client-side mode we slice locally.
   */
  const totalItems = serverSide ? (controlledTotalItems ?? filteredData.length) : filteredData.length;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedData = serverSide ? filteredData : filteredData.slice(startIndex, endIndex);

  // Calculate total columns (including checkbox, row actions if enabled)
  const totalColumns = (showCheckboxes ? 1 : 0) + columns.length + (rowActions ? 1 : 0);
  const ROW_ACTIONS_WIDTH = 96;

  return (
    <div className="flex-1 min-w-0">
      {/*
       * Agentix list-page parity — title + toolbar/filters live ABOVE the grid card, not inside a
       * padded box. The card itself is a flat bordered frame (rounded-md border bg-primary,
       * overflow-hidden) that wraps only the table, so it reads as a data surface, not a panel.
       */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-primary">{title}</h2>
      </div>

      {/* Search bar, filters, and action buttons row */}
      <div className="mb-3 flex items-center gap-3">
        {/* Search bar with icon */}
        <div className="relative flex items-center" style={{ width: '240px' }}>
          <div
            className="absolute left-3 pointer-events-none z-10"
            style={{ top: '50%', transform: 'translateY(-50%)' }}
          >
            <Search className="text-secondary" size={14} />
          </div>
          <input
            type="text"
            placeholder={resolvedSearchPlaceholder}
            value={searchQuery}
            onChange={handleSearchChange}
            className="c3-input w-full text-sm"
            style={{ paddingLeft: '2.5rem', height: '38px' }}
          />
        </div>

        {/* Filters slot */}
        {filters}

        {/* Actions slot */}
        {actions}
      </div>

      {/* Active Filters slot */}
      {activeFilters}

      {/* Selection action bar slot (appears above the table when rows are selected) */}
      {selectionBar}

      {/* Data Grid Table — flat bordered frame */}
      <div className="mt-3 overflow-hidden rounded-sm border border-weak bg-primary">
        <div className="overflow-x-auto">
          <table className="data-grid-table w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            {/* Table Header — muted band with a strong bottom divider (Agentix DataGrid header) */}
            <thead className="bg-tertiary border-b-2 border-weak">
              <tr>
                {showCheckboxes && (
                  <th className="pl-4 pr-0 py-3 text-left" style={{ width: '50px', position: 'relative' }}>
                    <input
                      type="checkbox"
                      className="cursor-pointer"
                      aria-label={t('common.selectAll')}
                      checked={allRowsForced || selectAll}
                      onChange={(e) => onSelectAll?.(e.target.checked)}
                    />
                  </th>
                )}
                {columns.map((column, index) => (
                  <th
                    key={column.key}
                    className={`${showCheckboxes && index === 0 ? 'pl-2 pr-4' : 'px-4'} py-3 text-left text-xs font-medium uppercase tracking-wide text-secondary ${column.headerClassName || ''}`}
                    style={{ width: `${column.width}px`, position: 'relative' }}
                  >
                    {column.header}
                  </th>
                ))}
                {rowActions && (
                  <th
                    className="px-2 py-3 text-right"
                    style={{
                      width: `${ROW_ACTIONS_WIDTH}px`,
                      minWidth: `${ROW_ACTIONS_WIDTH}px`,
                      position: 'relative',
                    }}
                    aria-label={t('common.rowActions')}
                  />
                )}
              </tr>
            </thead>
            {/* Table Body */}
            <tbody>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={totalColumns} className="px-4 py-8 text-center text-secondary">
                    {resolvedEmptyMessage}
                  </td>
                </tr>
              ) : (
                paginatedData.map((item, index) => {
                  const rowId = getRowId(item);
                  const isSelected = allRowsForced || selectedRows?.has(rowId) || false;

                  return (
                    <tr
                      key={rowId}
                      className={`hover:bg-hover transition-colors ${
                        index < paginatedData.length - 1 ? 'border-b border-weak' : ''
                      }`}
                    >
                      {showCheckboxes && (
                        <td className="pl-4 pr-0 py-3" style={{ width: '50px', maxWidth: '50px' }}>
                          <input
                            type="checkbox"
                            className="cursor-pointer"
                            aria-label={
                              getCheckboxLabel
                                ? getCheckboxLabel(item, rowId)
                                : t('common.dataGrid.selectRow', { rowId })
                            }
                            checked={isSelected}
                            onChange={(e) => onSelectRow?.(rowId, e.target.checked)}
                          />
                        </td>
                      )}
                      {columns.map((column, colIndex) => (
                        <td
                          key={column.key}
                          className={`${showCheckboxes && colIndex === 0 ? 'pl-2 pr-4' : 'px-4'} py-3 text-sm text-primary ${column.cellClassName || ''}`}
                          style={{ width: `${column.width}px`, maxWidth: `${column.width}px` }}
                        >
                          {column.render
                            ? column.render(item, index)
                            : ((item as Record<string, unknown>)[column.key] as React.ReactNode)}
                        </td>
                      ))}
                      {rowActions && (
                        <td
                          className="px-2 py-3 text-right align-middle whitespace-nowrap"
                          style={{
                            width: `${ROW_ACTIONS_WIDTH}px`,
                            minWidth: `${ROW_ACTIONS_WIDTH}px`,
                            maxWidth: `${ROW_ACTIONS_WIDTH}px`,
                          }}
                        >
                          <div
                            className="data-grid-row-actions flex items-center justify-end"
                            style={{ minHeight: '24px' }}
                          >
                            {rowActions(item, index)}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination — below the grid card (Agentix places pagination outside the frame) */}
      <Pagination
        currentPage={currentPage}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={setCurrentPage}
        onPageSizeChange={(size) => {
          if (serverSide) {
            onPageSizeChange?.(size);
          } else {
            setInternalPageSize(size);
          }
          setCurrentPage(1); // Reset to first page when page size changes
        }}
      />
    </div>
  );
}
