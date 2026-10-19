import { type HTMLAttributes, type ReactNode } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import type { BreadcrumbItemData } from '@/components/ui/breadcrumbs';

/**
 * DetailPage — single-record detail layout. Ported from the C3 docs site
 * (project-kc4t9): PageHeader (breadcrumbs / title / actions / tabs) over an
 * optional KPI row and a content area with an optional right sidebar. Styling
 * re-expressed for this project (Tailwind + `--c3-style-*`); uses this
 * project's PageHeader.
 */
export interface DetailPageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: BreadcrumbItemData[];
  /** Status chip(s) shown inline next to the title on the left. Not an action. */
  badges?: ReactNode;
  actions?: ReactNode;
  /** Tab row under the header. */
  tabsSlot?: ReactNode;
  /** KPI tiles row for entity metrics. */
  kpiSlot?: ReactNode;
  /** Primary content — detail sections, sub-grids, etc. */
  children: ReactNode;
  /** Optional right sidebar for related entities / supplementary info. */
  sidebarSlot?: ReactNode;
}

export function DetailPage({
  title,
  description,
  breadcrumbs,
  badges,
  actions,
  tabsSlot,
  kpiSlot,
  children,
  sidebarSlot,
  className = '',
  ...rest
}: DetailPageProps) {
  return (
    <div
      className={['flex min-h-full flex-col bg-[var(--c3-style-basic-bg-page)]', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {/* Full-bleed band: PageHeader owns its own gutter + bottom border and must
          sit flush to the page edges — no wrapping padding (matches PortalPage /
          WorkflowPage top bands). Page padding lives on the content region below. */}
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
        {kpiSlot && <div className="flex shrink-0 flex-wrap gap-3">{kpiSlot}</div>}

        <div className="flex min-h-0 flex-1 flex-col gap-5 lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
          {sidebarSlot && (
            <aside className="flex w-full flex-col gap-4 lg:w-80 lg:flex-none">{sidebarSlot}</aside>
          )}
        </div>
      </div>
    </div>
  );
}
