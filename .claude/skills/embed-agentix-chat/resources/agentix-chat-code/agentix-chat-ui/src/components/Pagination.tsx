/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface Props {
  page: number;
  pageSize: number;
  total: number;
  rowCount: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** BEM block prefix (e.g. `skills` / `async`) kept on the pager's DOM nodes as selector hooks
   *  for tests / Playwright; visuals come from this component's own Tailwind utilities. */
  classPrefix: string;
  /** i18n namespace holding the `pagination.*` keys (e.g. `skills` / `jobs`). */
  ns: string;
}

/**
 * Numbered pager shared by the list pages (first / prev / position / next / last + page-size).
 * `total < 0` means the count is unknown, so it degrades to "Page N" with `next` driven by whether
 * a full page came back. Self-styled with Tailwind utilities (the `${classPrefix}__*` classNames
 * are kept only as test/Playwright selector hooks); strings from the `${ns}` namespace's
 * `pagination.*` keys.
 */
export default function Pagination({
  page,
  pageSize,
  total,
  rowCount,
  loading,
  onPageChange,
  onPageSizeChange,
  classPrefix,
  ns,
}: Props) {
  const { t } = useTranslation(ns);
  const totalKnown = total >= 0;
  const totalPages = totalKnown ? Math.max(1, Math.ceil(total / pageSize)) : page + 1;
  const clampedPage = Math.min(page, totalPages);

  if (totalKnown ? total <= 0 : rowCount <= 0) return null;

  return (
    <div
      className={`${classPrefix}__footer flex items-center justify-between gap-4 pt-2.5 text-xs text-muted-foreground`}
    >
      <span className={`${classPrefix}__footer-counter tabular-nums`}>
        {totalKnown
          ? t('pagination.counter', {
              from: (clampedPage - 1) * pageSize + 1,
              to: Math.min(clampedPage * pageSize, total),
              total,
            })
          : t('pagination.pageOnly', { page: clampedPage })}
      </span>
      <div className={`${classPrefix}__pager flex items-center gap-1`}>
        <label className={`${classPrefix}__page-size mr-2 inline-flex items-center`}>
          <select
            className={`${classPrefix}__page-size-select appearance-none rounded-md border border-border bg-muted bg-[url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")] bg-no-repeat [background-position:right_8px_center] py-1 pl-2 pr-7 text-xs text-foreground [font-family:inherit] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
            data-testid={`${classPrefix}-page-size`}
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={loading}
            aria-label={t('pagination.rowsPerPage', 'Rows per page')}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {t('pagination.perPage', { count: n })}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className={`${classPrefix}__pager-btn`}
          data-testid={`${classPrefix}-page-first`}
          onClick={() => onPageChange(1)}
          disabled={clampedPage <= 1 || loading}
          title={t('pagination.firstPage')}
          aria-label={t('pagination.firstPage')}
        >
          <ChevronsLeft />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className={`${classPrefix}__pager-btn`}
          data-testid={`${classPrefix}-page-prev`}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={clampedPage <= 1 || loading}
          title={t('pagination.previousPage')}
          aria-label={t('pagination.previousPage')}
        >
          <ChevronLeft />
        </Button>
        <span className={`${classPrefix}__pager-pos px-2.5 text-foreground tabular-nums`}>
          {totalKnown
            ? t('pagination.position', { page: clampedPage, totalPages })
            : t('pagination.pageOnly', { page: clampedPage })}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className={`${classPrefix}__pager-btn`}
          data-testid={`${classPrefix}-page-next`}
          onClick={() => onPageChange(page + 1)}
          disabled={loading || (totalKnown ? clampedPage >= totalPages : rowCount < pageSize)}
          title={t('pagination.nextPage')}
          aria-label={t('pagination.nextPage')}
        >
          <ChevronRight />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className={`${classPrefix}__pager-btn`}
          data-testid={`${classPrefix}-page-last`}
          onClick={() => onPageChange(totalPages)}
          disabled={!totalKnown || clampedPage >= totalPages || loading}
          title={t('pagination.lastPage')}
          aria-label={t('pagination.lastPage')}
        >
          <ChevronsRight />
        </Button>
      </div>
    </div>
  );
}
