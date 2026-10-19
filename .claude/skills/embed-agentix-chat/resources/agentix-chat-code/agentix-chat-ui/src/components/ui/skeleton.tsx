/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { cn } from '../../lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  // `nexus-skeleton-shimmer` (styles/theme.css) paints a neutral base + a sweeping highlight — the
  // modern loading cue. A caller can cascade a list/table by setting `--shimmer-delay`
  // per item via `style`. Honors prefers-reduced-motion (freezes to a static skeleton).
  return <div data-slot="skeleton" className={cn('nexus-skeleton-shimmer rounded-md', className)} {...props} />;
}

interface SkeletonTextProps extends React.ComponentProps<'div'> {
  /** Number of placeholder lines to render. */
  lines?: number;
  /** Extra classes applied to every line bar. */
  lineClassName?: string;
}

/**
 * A stack of shimmer line bars sized like a paragraph — the generic replacement
 * for a bare "Loading…" string in a panel, list, or detail view. The final line
 * is rendered shorter so the block reads like real ragged text rather than a grid.
 */
function SkeletonText({ lines = 3, className, lineClassName, ...props }: SkeletonTextProps) {
  return (
    <div data-slot="skeleton-text" className={cn('flex flex-col gap-2', className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 && lines > 1 ? 'w-1/2' : 'w-full', lineClassName)} />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonText };
