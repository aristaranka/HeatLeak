import { type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

/**
 * LoginPage — centered authentication card.
 *
 * Ported from the C3 docs site (project-kc4t9). A full-surface page on
 * `bg-page` with a 400px card (`bg-primary`, hairline border, rounded) centered
 * both axes: optional logo, title, muted description, form (children), and an
 * optional footer link row below the card. Auth pages live OUTSIDE the app
 * shell — no TopNav / NavRail here.
 *
 * Styling re-expressed for this project (Tailwind + `--c3-style-*` tokens);
 * the source used the old `--theme-*` / `--font-size-*` names.
 */
export interface LoginPageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  logo?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Card width (default 400px). */
  cardWidth?: number | string;
}

export function LoginPage({
  title,
  description,
  logo,
  children,
  footer,
  cardWidth = 400,
  className = '',
  ...rest
}: LoginPageProps) {
  const maxWidth = typeof cardWidth === 'number' ? `${cardWidth}px` : cardWidth;
  return (
    <div
      className={[
        'flex min-h-full w-full items-center justify-center bg-[var(--c3-style-basic-bg-page)] px-6 py-8',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <div className="flex w-full flex-col items-stretch gap-4" style={{ maxWidth } as CSSProperties}>
        <div className="flex flex-col items-stretch gap-4 rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] p-8">
          {logo && <div className="flex justify-center">{logo}</div>}
          <div className="flex flex-col gap-1 text-center">
            <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">{title}</h1>
            {description && (
              <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">{description}</p>
            )}
          </div>
          <div className="flex flex-col items-stretch gap-4">{children}</div>
        </div>
        {footer && (
          <div className="flex items-center gap-4 px-1 text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)] [&>:first-child]:min-w-0 [&>:first-child]:flex-1">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
