/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigation } from '../contexts/NavigationContext';
import { useGenAiRoles } from '../contexts/GenAiRoleContext';
import { DataPageHeader } from './components/DataPageHeader';
import { DocumentsGrid } from './components/DocumentsGrid';

function DataPage() {
  const { t } = useTranslation();
  const { toggleMenu } = useNavigation();
  const { flags, loading: rolesLoading } = useGenAiRoles();
  const allowIndexerActions = !rolesLoading && flags.isAtLeastDocAdmin;
  const [uploadSignal, setUploadSignal] = useState(0);

  const handleUploadDocuments = useCallback(() => {
    setUploadSignal((prev) => prev + 1);
  }, []);

  return (
    <div className="flex h-full min-w-0 max-w-full flex-col overflow-auto bg-primary">
      {/* Mobile hamburger menu */}
      <div className="mb-3 flex items-center gap-3 px-4 pt-4 sm:hidden">
        <button
          onClick={toggleMenu}
          className="p-2 bg-transparent text-secondary hover:text-primary transition-colors rounded-xs"
          aria-label={t('common.toggleNavigationMenu')}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-xl font-semibold">{t('dataPage.title')}</h1>
      </div>

      {/* Top section: min-w-0 lets the header shrink with the main column instead of clipping */}
      <div className="w-full min-w-0 max-w-full shrink-0">
        <DataPageHeader onUploadDocuments={handleUploadDocuments} allowIndexerActions={allowIndexerActions} />
      </div>

      {/* Grid Content (takes full width) */}
      <div className="flex-1 min-w-0 px-4 pb-4 pt-4">
        <DocumentsGrid uploadSignal={uploadSignal} />
      </div>
    </div>
  );
}

export default DataPage;
