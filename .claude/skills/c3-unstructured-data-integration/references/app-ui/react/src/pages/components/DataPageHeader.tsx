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
import { Upload } from 'lucide-react';

interface DataPageHeaderProps {
  /** Opens the upload documents modal. */
  onUploadDocuments?: () => void;

  /** When false, mutation controls (upload) are hidden (read-only Data header). */
  allowIndexerActions?: boolean;
}

export const DataPageHeader: React.FC<DataPageHeaderProps> = ({ onUploadDocuments, allowIndexerActions = true }) => {
  const { t } = useTranslation();

  return (
    <div className="w-full min-w-0 max-w-full">
      {/*
       * Ion T1 ListPage — PageHeader zone: title left, primary action right-aligned,
       * border-bottom only (no full-rectangle card) to avoid the box-in-box look.
       */}
      <div className="flex min-w-0 flex-col gap-3 border-b border-weak px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight text-primary">
          {t('documents.dataPageHeader.manageDocuments')}
        </h1>
        {allowIndexerActions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              onClick={onUploadDocuments}
              className="bg-accent text-inverse flex items-center gap-2 rounded-xs px-6 py-2 text-sm transition-opacity hover:opacity-90 focus:outline-none"
            >
              <Upload size={16} />
              <span>{t('documents.actions.uploadDocuments')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
