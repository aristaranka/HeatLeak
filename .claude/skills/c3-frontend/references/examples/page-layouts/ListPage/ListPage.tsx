import { type HTMLAttributes, type ReactNode } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import type { BreadcrumbItemData } from '@/components/ui/breadcrumbs';

/**
 * ListPage — index / list-of-records layout. Ported from the C3 docs site
 * (project-kc4t9): a full-bleed PageHeader band (breadcrumbs / title / actions /
 * tabs) over a padded content zone — optional filter strip, optional KPI row,
 * the primary data grid, and an optional pagination footer.
 *
 * Follows the same band/content split as DetailPage: the PageHeader sits flush
 * to the page edges (it owns its own gutter + bottom border); page padding
 * (`p-6`) applies only to the content zone below. Tabs are routed into the
 * header band via PageHeader's `tabs` slot (not a separate zone), matching this
 * project's PageHeader design. Styling re-expressed for this project
 * (Tailwind + `--c3-style-*`).
 */
export interface ListPageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: BreadcrumbItemData[];
  /** Status chip(s) shown inline next to the title on the left. Not an action. */
  badges?: ReactNode;
  /** Right-aligned header actions (e.g. Export, Add New). */
  actions?: ReactNode;
  /** Tab row for sub-navigation — rendered in the header band. */
  tabsSlot?: ReactNode;
  /** Filter strip above the grid (search + selects). */
  filterSlot?: ReactNode;
  /** KPI tiles row above the grid. */
  kpiSlot?: ReactNode;
  /** Primary data grid (or table). */
  children: ReactNode;
  /** Pagination footer below the grid. */
  paginationSlot?: ReactNode;
}

export function ListPage({
  title,
  description,
  breadcrumbs,
  badges,
  actions,
  tabsSlot,
  filterSlot,
  kpiSlot,
  children,
  paginationSlot,
  className = '',
  ...rest
}: ListPageProps) {
  return (
    <div
      className={['flex min-h-full flex-col bg-[var(--c3-style-basic-bg-page)]', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <PageHeader
        className="shrink-0"
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
        badges={badges}
        actions={actions}
        tabs={tabsSlot}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        {filterSlot && <div className="shrink-0">{filterSlot}</div>}

        {kpiSlot && <div className="flex shrink-0 flex-wrap gap-3">{kpiSlot}</div>}

        <div className="min-h-[200px] flex-1">{children}</div>

        {paginationSlot && (
          <div className="flex shrink-0 justify-center pt-2">{paginationSlot}</div>
        )}
      </div>
    </div>
  );
}
