/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TriangleAlert, X } from 'lucide-react';

import { fetchDocumentsWarningBannerPendingCount, processAllRelevantFiles } from '../../shared/api';
import { useBanner } from '../../contexts/BannerContext';
import { useGenAiRoles } from '../../contexts/GenAiRoleContext';

export interface DocumentsWarningBannerProps {
  /** Invoked after a successful “Add to index” from the banner (refresh grids, clear spinners, etc.). */
  onIndexedComplete: () => void | Promise<void>;

  /** When this changes (e.g. after sync), the banner reloads eligibility and pending count. */
  refreshKey?: number;
}

/**
 * Pure React equivalent of {@link GenAiUi.DocumentsWarningBannerConditionalRenderer} plus
 * {@link GenAiUi.DocumentsWarningBanner} (see genAiSearch UI metadata).
 */
export const DocumentsWarningBanner: React.FC<DocumentsWarningBannerProps> = ({ onIndexedComplete, refreshKey }) => {
  const { t } = useTranslation();
  const { showBanner } = useBanner();
  const { flags, loading: rolesLoading } = useGenAiRoles();
  const [eligible, setEligible] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [indexLoading, setIndexLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (rolesLoading) {
      return;
    }
    const mayShow = flags.isAtLeastDocAdmin;
    setEligible(mayShow);
    if (!mayShow) {
      setPendingCount(0);
      setReady(true);
      return;
    }
    try {
      const count = await fetchDocumentsWarningBannerPendingCount();
      setPendingCount(typeof count === 'number' ? count : 0);
    } catch {
      setPendingCount(0);
    } finally {
      setReady(true);
    }
  }, [rolesLoading, flags.isAtLeastDocAdmin]);

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      setDismissed(false);
    }
    void load();
  }, [load, refreshKey]);

  const handleClose = () => {
    setDismissed(true);
  };

  const handleAddToIndex = async () => {
    setIndexLoading(true);
    try {
      const processedCount = await processAllRelevantFiles();
      if (processedCount === 0) {
        showBanner('error', t('documents.warningBanner.indexNoFilesError'));
        return;
      }
      setPendingCount(0);
      setDismissed(false);
      await onIndexedComplete();
    } catch {
      showBanner('error', t('documents.warningBanner.indexError'));
    } finally {
      setIndexLoading(false);
    }
  };

  const visible = ready && eligible && !dismissed && pendingCount > 0;

  if (!visible) {
    return null;
  }

  return (
    <div
      className="bg-warning-weak border-warning mb-3 rounded-sm border text-secondary"
      role="region"
      aria-label={t('documents.warningBanner.regionAriaLabel')}
    >
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="text-warning shrink-0" aria-hidden>
          <TriangleAlert className="h-4 w-4" size={16} />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm text-primary">
          {pendingCount === 1
            ? t('documents.warningBanner.messageOne')
            : t('documents.warningBanner.messageMany', { count: pendingCount })}
        </p>
        <button
          type="button"
          className="border-warning text-primary rounded-xs shrink-0 border bg-transparent px-3 py-1 text-sm font-medium transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void handleAddToIndex()}
          disabled={indexLoading}
        >
          {indexLoading
            ? t('documents.warningBanner.starting')
            : pendingCount === 1
              ? t('documents.warningBanner.processAllOne')
              : t('documents.warningBanner.processAllMany', { count: pendingCount })}
        </button>
        <button
          type="button"
          className="text-secondary rounded-xs shrink-0 p-1 transition-colors hover:bg-hover hover:text-primary"
          onClick={handleClose}
          aria-label={t('documents.warningBanner.dismissAriaLabel')}
        >
          <X className="h-4 w-4" size={16} />
        </button>
      </div>
    </div>
  );
};
