import { type HTMLAttributes, type ReactNode } from 'react';

/**
 * EmptyState — centered status / empty-state template.
 *
 * Ported from the C3 docs site (project-kc4t9) template. Same layout and API;
 * styling re-expressed in this project's system — Tailwind for layout, the
 * `text-c3-*` type utilities for typography, and `--c3-style-basic-*` role
 * tokens for color (the source used the old `--theme-*` / `--font-size-*`
 * names, which don't exist here).
 *
 * One layout serves three states by swapping icon + copy + actions:
 *   - Error   — <TriangleAlert /> + retry / back
 *   - Empty   — <FileWarning /> + clear-filters / create
 *   - Loading — a spinner + cancel / back
 *
 * Host chrome (TopNav + NavRail) is NOT included — the app shell supplies it.
 */
export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 48×48 illustration above the title — a Lucide icon or any node. */
  icon?: ReactNode;
  /** Main heading — typically the status / error line. */
  title: ReactNode;
  /** Secondary heading — what happened. */
  subtitle?: ReactNode;
  /** Small print under the subtitle — error codes, chunk URLs, etc. */
  description?: ReactNode;
  /** Action row — typically a primary + secondary Button. */
  actions?: ReactNode;
  /** Vertical anchor. `center` (default) sits mid-page; `upper` ~18% from top. */
  anchor?: 'center' | 'upper';
}

export function EmptyState({
  icon,
  title,
  subtitle,
  description,
  actions,
  anchor = 'center',
  className = '',
  ...rest
}: EmptyStateProps) {
  return (
    <div
      className={[
        'flex min-h-full w-full flex-col items-center bg-[var(--c3-style-basic-bg-page)] px-6 py-8',
        anchor === 'center' ? 'justify-center' : 'justify-start pt-[18vh]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <div className="flex max-w-[640px] flex-col items-center text-center">
        {icon && (
          <div
            className="mb-8 flex size-12 items-center justify-center text-[var(--c3-style-basic-fg-secondary)] [&>*]:size-8"
            aria-hidden
          >
            {icon}
          </div>
        )}
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-c3-bold-heading-h1 text-[var(--c3-style-basic-fg-primary)]">{title}</h1>
          {subtitle && (
            <p className="text-c3-regular-heading-h3 text-[var(--c3-style-basic-fg-primary)]">{subtitle}</p>
          )}
          {description && (
            <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">{description}</p>
          )}
        </div>
        {actions && <div className="mt-8 flex items-center justify-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
