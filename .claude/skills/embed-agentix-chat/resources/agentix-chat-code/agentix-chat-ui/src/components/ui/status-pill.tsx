/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import * as React from 'react';

import { cn } from '../../lib/utils';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

// Semantic, theme-bridged tones (track light/dark) — no hardcoded palette colors.
// Borderless soft fill + strong same-hue text: the fill + (optional) saturated dot carry the
// signal, so the pill reads crisp instead of the washed-out fill-fighting-a-faint-border look.
const TONE_CLASS: Record<StatusTone, string> = {
  success: 'bg-success/10 text-[var(--success-on-soft)]',
  warning: 'bg-warning/10 text-[var(--warning-on-soft)]',
  danger: 'bg-destructive/10 text-[var(--danger-on-soft)]',
  info: 'bg-primary/10 text-[var(--info-on-soft)]',
  neutral: 'bg-muted text-muted-foreground',
};

const DOT_CLASS: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-primary',
  neutral: 'bg-muted-foreground',
};

export interface StatusPillProps extends Omit<React.ComponentProps<'span'>, 'children'> {
  /** Color-codes the pill by status. Defaults to `neutral`. */
  tone?: StatusTone;
  /** Show a leading tone-colored status dot. */
  dot?: boolean;
  /**
   * Animate the dot with a soft outward "ping" to signal a LIVE or transitional state
   * (e.g. an agent that is Running / Provisioning / Updating) versus a settled one
   * (Stopped / Paused). Only takes effect together with `dot`. Honors
   * `prefers-reduced-motion` via the global reduce-motion rule (the ping freezes; the
   * solid dot stays visible, so the status is still legible).
   */
  pulse?: boolean;
  /** Optional leading icon (rendered before the label). Ignored when `dot` is set. */
  icon?: React.ReactNode;
  /**
   * Give the pill a consistent fixed min-width (and center the label) instead of hugging its
   * text. Use for a status COLUMN in a DataGrid so every status pill renders at the same compact
   * size and the column reads cleanly — without stretching to the full column width. Leave off
   * for inline label chips (e.g. container lists), which should stay tight to their text.
   */
  fixedWidth?: boolean;
  children: React.ReactNode;
}

/**
 * Tone-coded status pill (soft fill + optional saturated dot). Hugs its content by default so
 * short labels (e.g. container names) stay tight; pass `fixedWidth` to give status-column pills a
 * uniform, compact width. Color comes from the semantic `tone`, not the label, so status reads at
 * a glance.
 */
// The shared pill geometry + tone — exported so interactive pills (e.g. a clickable
// scope badge that must be a <button>) render byte-identical to the <span> StatusPill.
export function statusPillClass(tone: StatusTone = 'neutral', className?: string): string {
  return cn(
    'inline-flex items-center justify-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
    TONE_CLASS[tone],
    className
  );
}

export function StatusPill({
  tone = 'neutral',
  dot,
  pulse,
  icon,
  fixedWidth,
  className,
  children,
  ...rest
}: StatusPillProps) {
  return (
    <span className={statusPillClass(tone, cn(fixedWidth && 'min-w-[6.5rem]', className))} {...rest}>
      {dot ? (
        <span className="relative flex size-1.5 shrink-0" aria-hidden>
          {pulse && (
            <span
              className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-75', DOT_CLASS[tone])}
            />
          )}
          <span className={cn('relative inline-flex size-1.5 rounded-full', DOT_CLASS[tone])} />
        </span>
      ) : (
        icon
      )}
      {children}
    </span>
  );
}

export default StatusPill;
