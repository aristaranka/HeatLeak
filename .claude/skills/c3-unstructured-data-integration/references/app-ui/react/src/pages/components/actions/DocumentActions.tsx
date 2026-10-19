/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus, RefreshCw, X } from 'lucide-react';

interface DocumentActionsProps {
  onRefresh: () => void;
}

interface DocumentSelectionBarProps {
  selectedCount: number;
  totalMatching: number;
  allMatchingSelected: boolean;
  canSelectAllMatching: boolean;
  /** How many of the selected files the Process action will actually affect (settled, not-processed). */
  processCount: number;
  /** How many of the selected files the Unprocess action will actually affect (settled, processed). */
  unprocessCount: number;
  onAddToIndex: () => void;
  onRemoveFromIndex: () => void;
  onSelectAllMatching: () => void;
  onClearSelection: () => void;
}

/** Low-emphasis toolbar actions that are always available regardless of selection. */
export const DocumentActions: React.FC<DocumentActionsProps> = ({ onRefresh }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 ml-auto">
      <button
        className="flex items-center gap-2 rounded-xs px-3 py-2 text-sm text-primary hover:text-accent transition-colors"
        title={t('documents.actions.refresh')}
        onClick={onRefresh}
      >
        <RefreshCw size={14} />
        <span>{t('documents.actions.refresh')}</span>
      </button>
    </div>
  );
};

/**
 * Contextual bulk-action bar shown above the table when one or more rows are selected.
 * Follows the common list-page pattern (selection count + primary actions + clear) so the
 * two main actions on a selection — Process / Unprocess — are unmissable.
 */
export const DocumentSelectionBar: React.FC<DocumentSelectionBarProps> = ({
  selectedCount,
  totalMatching,
  allMatchingSelected,
  canSelectAllMatching,
  processCount,
  unprocessCount,
  onAddToIndex,
  onRemoveFromIndex,
  onSelectAllMatching,
  onClearSelection,
}) => {
  const { t } = useTranslation();

  if (selectedCount === 0) {
    return null;
  }

  const canAddToIndex = processCount > 0;
  const canRemoveFromIndex = unprocessCount > 0;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xs border border-accent bg-accent-weak px-4 py-2.5">
      <button
        type="button"
        onClick={onClearSelection}
        className="flex items-center gap-1 rounded-xs px-1 py-1 text-secondary hover:text-primary transition-colors"
        aria-label={t('documents.actions.clearSelection')}
        title={t('documents.actions.clearSelection')}
      >
        <X size={16} />
      </button>
      <span className="text-sm font-medium text-primary tabular-nums">
        {allMatchingSelected
          ? t('documents.actions.allMatchingSelected', { count: totalMatching })
          : t('documents.actions.selectedCount', { count: selectedCount })}
      </span>
      {allMatchingSelected ? (
        <button
          type="button"
          onClick={onClearSelection}
          className="rounded-xs px-1 py-1 text-sm font-medium text-accent hover:underline"
        >
          {t('documents.actions.clearSelection')}
        </button>
      ) : (
        canSelectAllMatching && (
          <button
            type="button"
            onClick={onSelectAllMatching}
            className="rounded-xs px-1 py-1 text-sm font-medium text-accent hover:underline"
          >
            {t('documents.actions.selectAllMatching', { count: totalMatching })}
          </button>
        )
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canAddToIndex}
          onClick={onAddToIndex}
          className="flex items-center gap-2 rounded-xs bg-accent px-4 py-2 text-sm text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          title={canAddToIndex ? t('documents.actions.addToIndex') : t('documents.actions.addToIndexUnavailable')}
        >
          <Plus size={14} />
          <span>
            {canAddToIndex
              ? t('documents.actions.addToIndexCount', { count: processCount })
              : t('documents.actions.addToIndex')}
          </span>
        </button>
        <button
          type="button"
          disabled={!canRemoveFromIndex}
          onClick={onRemoveFromIndex}
          className="flex items-center gap-2 rounded-xs border border-strong bg-primary px-4 py-2 text-sm text-primary transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
          title={
            canRemoveFromIndex
              ? t('documents.actions.removeFromIndex')
              : t('documents.actions.removeFromIndexUnavailable')
          }
        >
          <Minus size={14} />
          <span>
            {canRemoveFromIndex
              ? t('documents.actions.removeFromIndexCount', { count: unprocessCount })
              : t('documents.actions.removeFromIndex')}
          </span>
        </button>
      </div>
    </div>
  );
};
