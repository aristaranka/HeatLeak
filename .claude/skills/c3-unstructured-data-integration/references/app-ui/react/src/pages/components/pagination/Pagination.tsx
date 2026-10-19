/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}) => {
  const { t } = useTranslation();
  const [isPageSizeOpen, setIsPageSizeOpen] = useState(false);
  const pageSizeOptions = [5, 10, 20, 30, 40];
  const totalPages = Math.ceil(totalItems / pageSize);
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between pt-2 pb-2 border-t border-weak">
      {/* Left: Items per page */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-secondary">{t('common.pagination.itemsPerPageLabel')}</span>
        <div className="relative">
          <button
            onClick={() => setIsPageSizeOpen(!isPageSizeOpen)}
            className="flex items-center gap-1 px-2 py-1 text-sm text-primary border-b border-weak hover:border-accent transition-colors"
          >
            <span>{pageSize}</span>
            <ChevronDown
              className={`text-secondary text-xs transition-transform ${isPageSizeOpen ? 'rotate-180' : ''}`}
              size={12}
            />
          </button>
          {isPageSizeOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsPageSizeOpen(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsPageSizeOpen(false);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={t('common.closeDropdown')}
              />
              <div className="bg-menu border-weak rounded-xs shadow-menu absolute top-full left-0 z-20 mt-1 min-w-[60px] border">
                {pageSizeOptions.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={`w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-hover ${
                      pageSize === size ? 'bg-accent-weak text-accent' : 'text-primary'
                    }`}
                    onClick={() => {
                      onPageSizeChange(size);
                      setIsPageSizeOpen(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onPageSizeChange(size);
                        setIsPageSizeOpen(false);
                      }
                    }}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Center: Item count */}
      <div className="text-sm text-secondary">
        {t('common.pagination.itemRange', { start: startItem, end: endItem, total: totalItems })}
      </div>
      {/* Right: Navigation controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="p-2 text-secondary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={t('common.firstPage')}
        >
          <ChevronsLeft className="text-sm" size={14} />
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 text-secondary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={t('common.previousPage')}
        >
          <ChevronLeft className="text-sm" size={14} />
        </button>
        <button className="px-3 py-1 text-sm text-accent border-b-2 border-accent" disabled>
          {currentPage}
        </button>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || totalPages === 0}
          className="p-2 text-secondary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={t('common.nextPage')}
        >
          <ChevronRight className="text-sm" size={14} />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages || totalPages === 0}
          className="p-2 text-secondary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={t('common.lastPage')}
        >
          <ChevronsRight className="text-sm" size={14} />
        </button>
      </div>
    </div>
  );
};
