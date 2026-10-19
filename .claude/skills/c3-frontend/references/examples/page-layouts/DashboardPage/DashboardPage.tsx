import { type HTMLAttributes, type ReactNode } from 'react';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import type { BreadcrumbItemData } from '@/components/ui/breadcrumbs';

/**
 * DashboardPage — overview / analytics layout. Ported from the C3 docs site
 * (project-kc4t9). Unlike DetailPage/ListPage, the header is an *inline* title
 * band (no boxed PageHeader): a full-bleed topbar surface (bg-primary + bottom
 * border) wrapping breadcrumbs / title / description / actions and an optional
 * filter row, so it reads as one elevated page-header band. Below it, a padded
 * content area on the page bg holds an optional KPI row, an auto-fit chart grid
 * (children), and an optional fixed 320px sidebar (activity / alerts).
 *
 * Styling re-expressed for this project (Tailwind + `--c3-style-*`). The title
 * uses the H4-bold page scale (matching PageHeader's xl title); there is no
 * `--font-size-2xl` token here, so the closest page-title scale is used.
 */
export interface DashboardPageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: BreadcrumbItemData[];
  /** Right-aligned header actions. */
  actions?: ReactNode;
  /** Filter controls between the header and the KPIs. */
  filterSlot?: ReactNode;
  /** KPI tiles row. */
  kpiSlot?: ReactNode;
  /** Chart grid content. */
  children: ReactNode;
  /** Fixed-width 320px sidebar (activity feed, alerts). */
  sidebarSlot?: ReactNode;
}

export function DashboardPage({
  title,
  description,
  breadcrumbs,
  actions,
  filterSlot,
  kpiSlot,
  children,
  sidebarSlot,
  className = '',
  ...rest
}: DashboardPageProps) {
  return (
    <div
      className={['flex min-h-full flex-col bg-[var(--c3-style-basic-bg-page)]', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {/* Topbar surface — inline title band (bg-primary + bottom border), flush
          to the page edges. Wraps the title row and the optional filter row. */}
      <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-6 py-4">
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} size="md" />}
            <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">{title}</h1>
            {description && (
              <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
        {filterSlot && <div className="shrink-0">{filterSlot}</div>}
      </div>

      {/* Content area — KPI + chart grid (+ optional sidebar) on the page bg. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        {kpiSlot && <div className="shrink-0">{kpiSlot}</div>}

        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          <div className="grid min-w-0 flex-1 content-start grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
            {children}
          </div>
          {sidebarSlot && (
            <aside className="flex w-full flex-col gap-4 lg:w-80 lg:flex-none">{sidebarSlot}</aside>
          )}
        </div>
      </div>
    </div>
  );
}
