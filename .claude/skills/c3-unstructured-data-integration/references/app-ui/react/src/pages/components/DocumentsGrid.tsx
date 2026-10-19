/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileCheck2, Trash2 } from 'lucide-react';

import {
  addSourceFilesToIndex,
  deleteSourceFiles,
  fetchAllSourceFileIds,
  fetchSourceCollectionNames,
  fetchSourceFileMetadataTagFilterOptions,
  type TagFilterOption,
  fetchSourceFileStatusFilterOptions,
  fetchSourceFiles,
  fetchSourceFilesCount,
  buildSourceFileFilter,
  removeSourceFilesFromIndex,
  PROCESSABLE_STATUS_VALUES,
  UNPROCESSABLE_STATUS_VALUES,
  withStatusValues,
} from '../../shared/api';
import { DocumentActions, DocumentSelectionBar } from './actions/DocumentActions';
import { StatusCell } from './cells/StatusCell';
import { ActiveFilters } from './filters/ActiveFilters';
import { FilterDropdown } from './filters/FilterDropdown';
import { DataGrid, Column } from './grid';
import { TagsCell } from './tags/TagsCell';
import { formatStatusEnum, getStatusLabel, isProcessable, isUnprocessable } from './utils/statusUtils';
import type { Document } from './utils/transformSourceFile';
import { POLLING_STATE_STATUSES, transformSourceFileFetchResult } from './utils/transformSourceFile';
import { useBanner } from '../../contexts/BannerContext';
import { useGenAiRoles } from '../../contexts/GenAiRoleContext';
import { DeleteDocumentModal } from './DeleteDocumentModal';
import { DocumentDetailsModal } from './DocumentDetailsModal';
import { UploadDocumentsModal } from './upload';
import { DocumentsWarningBanner } from './DocumentsWarningBanner';

const POLL_INTERVAL = 5000;

const STATUSES_ALLOWED_FOR_DELETION = ['Indexed', 'Failed', 'Not Indexed', 'Needs Re-indexing'];

/** Debounce (ms) applied to the search box before issuing a server-side fetch. */
const SEARCH_DEBOUNCE_MS = 300;

const DEFAULT_PAGE_SIZE = 10;

interface DocumentsGridProps {
  refreshKey?: number;

  /** Incrementing counter that opens the upload modal (driven by the header's primary Upload button). */
  uploadSignal?: number;
}

export const DocumentsGrid: React.FC<DocumentsGridProps> = ({ refreshKey, uploadSignal }) => {
  const { t } = useTranslation();
  const { showBanner } = useBanner();
  const { flags, loading: rolesLoading } = useGenAiRoles();
  const canManageDocuments = !rolesLoading && flags.isAtLeastDocAdmin;
  const [documents, setDocuments] = useState<Document[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [sourceDirectoryFilters, setSourceDirectoryFilters] = useState<string[]>([]);
  const [tagFilters, setTagFilters] = useState<string[]>([]);

  // Server-side pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [sourceDirectoryOptions, setSourceDirectoryOptions] = useState<string[]>([]);
  const [tagOptions, setTagOptions] = useState<TagFilterOption[]>([]);
  const [statusFilterOptions, setStatusFilterOptions] = useState<string[]>([]);

  const loadFilterDropdownOptions = useCallback(async () => {
    try {
      const [dirs, labels, statuses] = await Promise.all([
        fetchSourceCollectionNames(),
        fetchSourceFileMetadataTagFilterOptions(),
        fetchSourceFileStatusFilterOptions(),
      ]);
      setSourceDirectoryOptions(dirs);
      setTagOptions(labels);
      setStatusFilterOptions(statuses);
    } catch {
      setSourceDirectoryOptions([]);
      setTagOptions([]);
      setStatusFilterOptions([]);
    }
  }, []);

  /*
   * Server-side filter expression built from the search box + all filter dropdowns.
   * Sending this to Genai.SourceFile.fetch/fetchCount ensures search / filter / pagination
   * query the full corpus rather than the first page of loaded rows (DOCAI-250).
   */
  const serverFilter = useMemo(
    () =>
      buildSourceFileFilter({
        search: debouncedSearch,
        statuses: statusFilters,
        sourceDirectories: sourceDirectoryFilters,
        tagFilterValues: tagFilters,
      }),
    [debouncedSearch, statusFilters, sourceDirectoryFilters, tagFilters]
  );

  // Upload modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Delete modal state
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);

  const [documentDetails, setDocumentDetails] = useState<{ id: string; name: string } | null>(null);

  /*
   * Checkbox state. `selectAll` is derived from the current page (see below) rather than stored,
   * so navigating pages never shows a "checked" header while the visible rows are unselected.
   */
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  /*
   * When true, the user chose "Select all N" so bulk actions target every item matching the
   * current server filter (across all pages), not just the loaded page. Any change to the
   * selection, filters, page, or page size resets this back to per-row selection.
   */
  const [selectAllMatching, setSelectAllMatching] = useState(false);

  /*
   * In "all matching" mode the selection spans pages we haven't loaded, so we can't derive how
   * many files each action applies to from the current page. We fetch the real per-status counts
   * for the active filter so the Process / Unprocess buttons show accurate, status-aware totals
   * (and disable correctly when zero) — matching the precise per-page behavior.
   */
  const [matchingProcessCount, setMatchingProcessCount] = useState(0);
  const [matchingUnprocessCount, setMatchingUnprocessCount] = useState(0);

  const fetchDocuments = useCallback(
    async (showLoading = true) => {
      if (showLoading) setIsLoading(true);
      try {
        const [result, count] = await Promise.all([
          fetchSourceFiles({
            filter: serverFilter,
            order: 'descending(meta.updated)',
            limit: pageSize,
            offset: (currentPage - 1) * pageSize,
          }),
          fetchSourceFilesCount({ filter: serverFilter }),
        ]);
        const { documents: docs } = transformSourceFileFetchResult(result);
        setDocuments(docs);
        setTotalCount(count);
      } finally {
        if (showLoading) setIsLoading(false);
      }
    },
    [serverFilter, currentPage, pageSize]
  );

  // Debounce free-text search so we don't fetch on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  /*
   * Any filter / search change resets pagination back to the first page and clears selection
   * (the "all matching" set changes with the filter, so a stale selection must not persist).
   */
  useEffect(() => {
    setCurrentPage(1);
    setSelectedRows(new Set());
    setSelectAllMatching(false);
  }, [debouncedSearch, statusFilters, sourceDirectoryFilters, tagFilters, pageSize]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    void loadFilterDropdownOptions();
  }, [loadFilterDropdownOptions, refreshKey]);

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      setSelectedRows(new Set());
      fetchDocuments();
    }
  }, [refreshKey, fetchDocuments]);

  useEffect(() => {
    if (uploadSignal !== undefined && uploadSignal > 0) {
      setIsUploadModalOpen(true);
    }
  }, [uploadSignal]);

  /*
   * Resolve accurate Process / Unprocess counts for "all matching" mode by asking the server how
   * many files match the active filter in each action's applicable status set. Runs only while in
   * matching mode; a stale/racing response is ignored via the `cancelled` guard.
   */
  useEffect(() => {
    if (!selectAllMatching) {
      setMatchingProcessCount(0);
      setMatchingUnprocessCount(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [processable, unprocessable] = await Promise.all([
        fetchSourceFilesCount({ filter: withStatusValues(serverFilter, PROCESSABLE_STATUS_VALUES) }),
        fetchSourceFilesCount({ filter: withStatusValues(serverFilter, UNPROCESSABLE_STATUS_VALUES) }),
      ]);
      if (!cancelled) {
        setMatchingProcessCount(processable);
        setMatchingUnprocessCount(unprocessable);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectAllMatching, serverFilter]);

  useEffect(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    const needsPolling = documents.some((doc) => {
      const rawStatus = doc.status.replace(/\.\.\.$/, '');
      return POLLING_STATE_STATUSES.includes(rawStatus);
    });

    if (needsPolling) {
      pollTimerRef.current = setTimeout(() => {
        fetchDocuments(false);
      }, POLL_INTERVAL);
    }

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [documents, fetchDocuments]);

  const handleSelectAll = (checked: boolean) => {
    // Toggling the header checkbox always drops back to per-page selection scope.
    setSelectAllMatching(false);
    setSelectedRows((prev) => {
      const next = new Set(prev);

      // Scope select-all to the current page (server-side pagination only fetches this page).
      documents.forEach((doc) => {
        if (checked) {
          next.add(doc.id);
        } else {
          next.delete(doc.id);
        }
      });
      return next;
    });
  };

  const handleRowSelect = (id: number | string, checked: boolean) => {
    const strId = String(id);
    setSelectedRows((prev) => {
      /*
       * Leaving "all matching" via a row toggle: materialize the current page's rows as the
       * concrete selection (minus this row if it was unchecked) so the visible page stays accurate.
       */
      const base = selectAllMatching ? new Set(documents.map((doc) => doc.id)) : new Set(prev);
      if (checked) {
        base.add(strId);
      } else {
        base.delete(strId);
      }

      return base;
    });

    // Any per-row change means the selection is no longer "all matching".
    setSelectAllMatching(false);
  };

  /*
   * Header checkbox reflects only the current page so it never shows checked on a page whose
   * rows are unselected (e.g. after paging away from a page where select-all was used).
   */
  const selectAll = documents.length > 0 && documents.every((doc) => selectedRows.has(doc.id));

  const getSelectedDocuments = () => {
    return documents.filter((doc) => selectedRows.has(doc.id));
  };

  const selectedDocs = getSelectedDocuments();

  /*
   * Subset-based bulk actions: each button acts only on the selected files it validly applies to.
   * - Process: settled, not-yet-processed files (Unprocessed / Needs Re-processing / Failed).
   * - Unprocess: processed files (Processed / Needs Removal).
   * In-flight files (Processing / Indexing / ...) belong to neither and are left untouched.
   * A button is enabled iff its subset is non-empty, and shows that subset's count.
   */
  const processableDocs = selectedDocs.filter((doc) => isProcessable(doc.status));
  const unprocessableDocs = selectedDocs.filter((doc) => isUnprocessable(doc.status));

  /*
   * In "all matching" mode the selection spans pages we haven't loaded, so subset counts come from
   * the server (matchingProcessCount / matchingUnprocessCount) rather than the current page. In
   * per-page mode we compute them precisely from the loaded rows.
   */
  const processCount = selectAllMatching ? matchingProcessCount : processableDocs.length;
  const unprocessCount = selectAllMatching ? matchingUnprocessCount : unprocessableDocs.length;

  const handleRemoveFromIndex = async () => {
    const ids = selectAllMatching
      ? await fetchAllSourceFileIds({ filter: withStatusValues(serverFilter, UNPROCESSABLE_STATUS_VALUES) })
      : unprocessableDocs.map((d) => d.id);
    if (ids.length === 0) return;
    try {
      await removeSourceFilesFromIndex(ids);
      setSelectedRows(new Set());
      setSelectAllMatching(false);
    } finally {
      await fetchDocuments(false);
    }
  };

  const handleAddToIndex = async () => {
    const ids = selectAllMatching
      ? await fetchAllSourceFileIds({ filter: withStatusValues(serverFilter, PROCESSABLE_STATUS_VALUES) })
      : processableDocs.map((d) => d.id);
    if (ids.length === 0) return;
    try {
      await addSourceFilesToIndex(ids);
      setSelectedRows(new Set());
      setSelectAllMatching(false);
    } finally {
      await fetchDocuments(false);
    }
  };

  const handleRefresh = () => {
    fetchDocuments();
  };

  const handleUpload = async (_data?: unknown) => {
    await fetchDocuments();
  };

  const getTagFilterLabel = useCallback((v: string) => tagOptions.find((o) => o.value === v)?.label ?? v, [tagOptions]);

  const handleWarningBannerIndexedComplete = useCallback(async () => {
    setSelectedRows(new Set());
    await fetchDocuments(false);
  }, [fetchDocuments]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!documentToDelete) return;
    setIsDeleteLoading(true);
    try {
      await deleteSourceFiles([documentToDelete.id]);
      const deletedId = documentToDelete.id;
      setDocumentToDelete(null);
      setIsDeleteModalOpen(false);
      setSelectedRows((prev) => {
        const next = new Set(prev);
        next.delete(deletedId);
        return next;
      });
      showBanner('success', t('documents.grid.banner.deleteSentSuccess'));
      await fetchDocuments();
    } catch {
      setDocumentToDelete(null);
      setIsDeleteModalOpen(false);
      showBanner('error', t('documents.grid.banner.deleteError'));
    } finally {
      setIsDeleteLoading(false);
    }
  }, [documentToDelete, fetchDocuments, showBanner, t]);

  const handleDeleteClick = useCallback(
    (doc: Document) => {
      const formattedStatus = formatStatusEnum(doc.status);
      const isStatusAllowed = STATUSES_ALLOWED_FOR_DELETION.some((s) => formatStatusEnum(s) === formattedStatus);

      if (!isStatusAllowed) {
        showBanner('warning', t('documents.grid.banner.deletionProcessingWarning'));
        return;
      }

      setDocumentToDelete(doc);
      setIsDeleteModalOpen(true);
    },
    [showBanner, t]
  );

  const rowActions = useCallback(
    (doc: Document, _index: number) => {
      void _index;
      return (
        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDocumentDetails({ id: doc.id, name: doc.name });
            }}
            className="p-1.5 rounded-xs text-secondary hover:text-accent hover:bg-hover transition-colors"
            aria-label={t('documents.grid.viewDetailsAria', { name: doc.name })}
            title={t('documents.grid.viewDocumentDetails')}
          >
            <FileCheck2 className="text-sm" size={14} />
          </button>
          {canManageDocuments && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteClick(doc);
              }}
              className="p-1.5 rounded text-secondary hover:text-danger hover:bg-danger-weak transition-colors"
              aria-label={t('documents.grid.deleteAria', { name: doc.name })}
              title={t('documents.grid.deleteTitle', { name: doc.name })}
            >
              <Trash2 className="text-sm" size={14} />
            </button>
          )}
        </div>
      );
    },
    [canManageDocuments, handleDeleteClick, t]
  );

  // Column definitions - matching original design exactly
  const columns: Column<Document>[] = useMemo(
    () => [
      {
        key: 'name',
        header: t('documents.grid.columns.name'),
        width: 200,
        render: (doc) =>
          doc.displayUrl ? (
            <a
              href={doc.displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline text-left block max-w-full truncate"
              title={doc.name}
              onClick={(e) => e.stopPropagation()}
            >
              {doc.name}
            </a>
          ) : (
            <span className="text-primary text-left block max-w-full truncate" title={doc.name}>
              {doc.name}
            </span>
          ),
      },
      {
        key: 'status',
        header: t('documents.grid.columns.status'),
        width: 100,
        render: (doc) => <StatusCell status={doc.status} />,
      },
      {
        key: 'sourceDirectory',
        header: t('documents.grid.columns.sourceDirectory'),
        width: 140,
      },
      {
        key: 'contentSize',
        header: t('documents.grid.columns.contentSize'),
        width: 100,
      },
      {
        key: 'lastUpdated',
        header: t('documents.grid.columns.lastUpdated'),
        width: 100,
      },
      {
        key: 'tags',
        header: t('documents.grid.columns.tags'),
        width: 140,
        render: (doc) => (
          <TagsCell
            tags={doc.tags}
            documentId={doc.id}
            documentName={doc.name}
            tagGroups={doc.tagGroups}
            metadataTags={doc.metadataTags}
            onTagsChanged={() => void fetchDocuments(false)}
            readOnly={!canManageDocuments}
          />
        ),
      },
    ],
    [canManageDocuments, fetchDocuments, t]
  );

  // Filters component
  const filtersComponent = (
    <>
      <FilterDropdown
        label={t('documents.grid.filters.status')}
        multi
        value={statusFilters}
        options={statusFilterOptions.map((v) => ({ value: v, label: getStatusLabel(v) }))}
        onChange={setStatusFilters}
      />
      <FilterDropdown
        label={t('documents.grid.filters.sourceDirectory')}
        multi
        value={sourceDirectoryFilters}
        options={sourceDirectoryOptions}
        onChange={setSourceDirectoryFilters}
      />
      <FilterDropdown
        label={t('documents.grid.filters.tag')}
        multi
        value={tagFilters}
        options={tagOptions}
        onChange={setTagFilters}
      />
    </>
  );

  // Actions component
  const actionsComponent = <DocumentActions onRefresh={handleRefresh} />;

  // Selection action bar (appears above the table when rows are selected)
  const selectionBarComponent = canManageDocuments ? (
    <DocumentSelectionBar
      selectedCount={selectAllMatching ? totalCount : selectedRows.size}
      totalMatching={totalCount}
      allMatchingSelected={selectAllMatching}
      canSelectAllMatching={selectAll && totalCount > documents.length}
      processCount={processCount}
      unprocessCount={unprocessCount}
      onAddToIndex={handleAddToIndex}
      onRemoveFromIndex={handleRemoveFromIndex}
      onSelectAllMatching={() => setSelectAllMatching(true)}
      onClearSelection={() => {
        setSelectedRows(new Set());
        setSelectAllMatching(false);
      }}
    />
  ) : null;

  // Active filters component
  const activeFiltersComponent = (
    <ActiveFilters
      statusFilters={statusFilters}
      sourceDirectoryFilters={sourceDirectoryFilters}
      tagFilters={tagFilters}
      getTagFilterLabel={getTagFilterLabel}
      onRemoveStatusFilter={(value) => setStatusFilters((prev) => prev.filter((v) => v !== value))}
      onRemoveSourceDirectoryFilter={(value) => setSourceDirectoryFilters((prev) => prev.filter((v) => v !== value))}
      onRemoveTagFilter={(value) => setTagFilters((prev) => prev.filter((v) => v !== value))}
    />
  );

  return (
    <>
      <DocumentsWarningBanner onIndexedComplete={handleWarningBannerIndexedComplete} refreshKey={refreshKey} />
      <DataGrid<Document>
        title={t('documents.grid.documentsTitle')}
        data={documents}
        columns={columns}
        getRowId={(doc) => doc.id}
        searchPlaceholder={t('documents.grid.searchPlaceholder')}
        showCheckboxes={canManageDocuments}
        selectedRows={selectedRows}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectRow={handleRowSelect}
        onSelectAll={handleSelectAll}
        selectAll={selectAll}
        allRowsForced={selectAllMatching}
        getCheckboxLabel={(doc) => t('documents.grid.selectRow', { name: doc.name })}
        filters={filtersComponent}
        actions={actionsComponent}
        selectionBar={selectionBarComponent}
        activeFilters={activeFiltersComponent}
        emptyMessage={t('documents.grid.emptyMessage')}
        rowActions={rowActions}
        serverSide
        page={currentPage}
        pageSize={pageSize}
        totalItems={totalCount}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />

      {/* Upload Documents Modal */}
      <UploadDocumentsModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={handleUpload}
        hasSourceDirectory={true}
      />

      {/* Delete Document Modal */}
      <DeleteDocumentModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!isDeleteLoading) {
            setIsDeleteModalOpen(false);
            setDocumentToDelete(null);
          }
        }}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleteLoading}
      />
      <DocumentDetailsModal
        isOpen={documentDetails !== null}
        sourceFileId={documentDetails?.id ?? null}
        fileName={documentDetails?.name ?? ''}
        onClose={() => setDocumentDetails(null)}
      />
    </>
  );
};
