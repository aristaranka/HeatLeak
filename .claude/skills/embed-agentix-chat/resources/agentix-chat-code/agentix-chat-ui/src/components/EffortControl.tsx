/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDismissablePopover } from '../hooks/useDismissablePopover';

/**
 * Universal fallback levels for a model whose catalog reports no variants, and
 * for `auto` (where the per-turn model — hence its level set — varies).
 * `DEFAULT_EFFORT` mirrors the pod default (`LLM_EFFORT`).
 */
export const DEFAULT_EFFORT_LEVELS = ['low', 'medium', 'high'] as const;
export const DEFAULT_EFFORT = 'medium';

/** Canonical Faster→Smarter order (mirrors the agent's EFFORT_ORDER). Used to snap
 *  a selection the current model doesn't support to the nearest level it does. */
const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/** Snap `requested` to the nearest level in `scale` (ordered Faster→Smarter),
 *  biasing UP: a `low` preference on `[high,max]` lands on `high` (its floor), and
 *  `low` on `[medium,high,max]` lands on `medium`, not `high`. Above-range or
 *  unknown clamps to the top. Resilient to any model's variant set. Exported so the
 *  composer can pre-clamp the derived effort against the selected model's scale. */
export function clampToScale(requested: string, scale: string[]): string {
  if (scale.includes(requested)) return requested;
  const reqIdx = EFFORT_ORDER.indexOf(requested);
  if (reqIdx === -1) return scale.includes('high') ? 'high' : scale[scale.length - 1] || DEFAULT_EFFORT;
  const up = scale.find((e) => EFFORT_ORDER.indexOf(e) >= reqIdx);
  return up || scale[scale.length - 1] || DEFAULT_EFFORT;
}

/** Half the thumb width in px — keep in sync with `--effort-thumb` in ChatPage.scss.
 *  The pointer→fraction math insets the track by this so the thumb center lands on
 *  the same travel the dots are laid out on. */
const THUMB_INSET_PX = 8;

/**
 * Reasoning-effort control — a Faster↔Smarter slider in a click-to-open popover
 * (Claude-app convention). The notches are the *selected model's* effort
 * variants (e.g. low/medium/high/xhigh/max for Opus 4.7+), sourced live from
 * OpenCode's catalog via `ModelInfo.variants`; falls back to the universal
 * low/medium/high set. The slider is custom (pointer-capture drag + keyboard),
 * not a native range: the thumb glides 1:1 with the pointer and snaps to the
 * nearest notch on release — native range thumbs can't animate and leak
 * browser chrome. Square-cornered (C3 theme). Usable while streaming — a
 * mid-stream change applies from the next turn.
 */
const EffortControl: React.FC<{
  selectedEffort: string;
  /** Pin a concrete effort level (or 'auto'). Only ever called with a string. */
  setSelectedEffort: (effort: string) => void;
  /** Selected model's variant ids, ordered Faster→Smarter; empty → universal fallback. */
  levels?: string[];
  disabled?: boolean;
  /** True when the chat is on the `auto` model — enables the "Auto" effort choice (let auto
   *  mode pick effort per turn). Meaningless without auto model, so hidden otherwise. */
  autoAvailable?: boolean;
  /** Render the slider inline (no trigger button / popover) — for a settings row where the control
   *  is the configurator itself, not a compact composer chip. Drops the header, help, and auto entry
   *  (a settings page carries the label + description around it). */
  inline?: boolean;
}> = ({ selectedEffort, setSelectedEffort, levels, disabled = false, autoAvailable = false, inline = false }) => {
  const { t } = useTranslation('chat');
  const { open, setOpen, wrapRef, triggerRef } = useDismissablePopover();

  const scale = levels && levels.length ? levels : [...DEFAULT_EFFORT_LEVELS];
  const scaleKey = scale.join(',');
  const labelFor = (lvl: string) => t(`effort.level.${lvl}`, { defaultValue: lvl });
  // 'auto' = let auto mode choose effort per turn (only when the model is auto).
  const isAuto = selectedEffort === 'auto';
  const autoLabel = t('effort.auto', { defaultValue: 'Auto' });

  // Keep the selection valid for the current model: when the model changes and
  // its scale no longer offers the selected level (e.g. switching off a model
  // that had xhigh/max), snap to `high` (every reasoning model has it) or the
  // top of the scale. Self-correcting so the wire/badge never carries a level
  // the model rejects.
  useEffect(() => {
    // 'auto' is a valid sentinel (auto-effort) only when the model is auto. If the model
    // switched to a concrete one, resolve it to a real level; otherwise leave it.
    if (selectedEffort === 'auto') {
      if (!autoAvailable) setSelectedEffort(clampToScale(DEFAULT_EFFORT, scale));
      return;
    }
    if (!scale.includes(selectedEffort)) {
      setSelectedEffort(clampToScale(selectedEffort, scale));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaleKey, selectedEffort, autoAvailable]);

  const activeIdx = Math.max(0, scale.indexOf(selectedEffort));
  const maxIdx = Math.max(0, scale.length - 1);

  const sliderRef = useRef<HTMLDivElement>(null);
  // While dragging, the thumb tracks the pointer continuously (percent 0–100);
  // null when idle — the thumb then sits on the active notch (CSS-transitioned).
  const [dragPct, setDragPct] = useState<number | null>(null);
  const pct = dragPct ?? (maxIdx > 0 ? (activeIdx / maxIdx) * 100 : 0);

  const fractionAt = (clientX: number): number => {
    const el = sliderRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const travel = rect.width - 2 * THUMB_INSET_PX;
    if (travel <= 0) return 0;
    const x = clientX - rect.left - THUMB_INSET_PX;
    return Math.min(1, Math.max(0, x / travel));
  };

  const selectAt = (frac: number) => {
    const lvl = scale[maxIdx > 0 ? Math.round(frac * maxIdx) : 0];
    if (lvl && lvl !== selectedEffort) setSelectedEffort(lvl);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    // Optional-chained for jsdom (no pointer-capture there); in browsers capture
    // keeps move/up events flowing to the slider even when the pointer leaves it.
    sliderRef.current?.setPointerCapture?.(e.pointerId);
    sliderRef.current?.focus();
    const f = fractionAt(e.clientX);
    setDragPct(f * 100);
    selectAt(f);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragPct === null) return;
    const f = fractionAt(e.clientX);
    setDragPct(f * 100);
    selectAt(f);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragPct === null) return;
    sliderRef.current?.releasePointerCapture?.(e.pointerId);
    // Thumb snaps from the pointer position to the nearest notch (CSS transition).
    setDragPct(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Inline mode leaves the slider mounted while disabled (loading/saving); the popover path only
    // ever showed it enabled. Guard here so keyboard can't move a disabled slider.
    if (disabled) return;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(maxIdx, activeIdx + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, activeIdx - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = maxIdx;
    if (next === null) return;
    e.preventDefault();
    const lvl = scale[next];
    if (lvl && lvl !== selectedEffort) setSelectedEffort(lvl);
  };

  const fasterSmarterNode = (
    <div className="mb-1.5 flex justify-between text-2xs text-muted-foreground" aria-hidden>
      <span>{t('effort.faster')}</span>
      <span>{t('effort.smarter')}</span>
    </div>
  );
  const sliderNode = (
    <div
      ref={sliderRef}
      className="chat-page__effort-slider group relative h-6 cursor-pointer touch-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ring data-[dragging=true]:cursor-grabbing"
      data-testid="effort-slider"
      data-dragging={dragPct !== null ? 'true' : undefined}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-valuemin={0}
      aria-valuemax={maxIdx}
      aria-valuenow={activeIdx}
      aria-valuetext={labelFor(scale[activeIdx])}
      aria-label={t('effort.ariaLabel')}
      aria-disabled={disabled || undefined}
      style={{ '--effort-pct': pct } as React.CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-border" aria-hidden />
      <span className="chat-page__effort-ticks pointer-events-none absolute inset-x-2 top-1/2" aria-hidden>
        {scale.map((lvl, i) => (
          <span
            key={lvl}
            className="chat-page__effort-tick absolute size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/55 data-[active=true]:opacity-0 data-[max=true]:bg-primary data-[max=true]:opacity-100"
            data-active={i === activeIdx ? 'true' : undefined}
            data-max={i === maxIdx ? 'true' : undefined}
            style={{ left: `${maxIdx > 0 ? (i / maxIdx) * 100 : 0}%` }}
          />
        ))}
      </span>
      <span
        className="chat-page__effort-thumb pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background shadow-[0_1px_4px_rgb(0_0_0/25%)] transition-[left] duration-100 ease-out group-data-[dragging=true]:transition-none"
        style={{ left: `calc(8px + (100% - 16px) * ${pct} / 100)` }}
        aria-hidden
      />
    </div>
  );

  // Inline: the slider IS the control (settings row) — no trigger, popover, header, help, or auto.
  // No level readout: the Faster↔Smarter ends and the thumb position already name the choice.
  if (inline) {
    return (
      <div className="w-full" data-testid="effort-inline">
        {fasterSmarterNode}
        {sliderNode}
      </div>
    );
  }

  return (
    <div className="relative inline-flex shrink-0" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="cursor-pointer whitespace-nowrap rounded-md border border-border bg-background px-[0.7em] py-[0.4em] font-mono text-xs leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-default disabled:opacity-50 disabled:hover:bg-background disabled:hover:text-muted-foreground"
        data-testid="effort-trigger"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('effort.title', { level: isAuto ? autoLabel : labelFor(scale[activeIdx]) })}
        title={t('effort.title', { level: isAuto ? autoLabel : labelFor(scale[activeIdx]) })}
        onClick={() => setOpen((o) => !o)}
      >
        {/* Compact: just the level (e.g. "High") or "Auto"; the "Effort" word lives in
            the popover header + the aria-label/title, saving composer real estate. */}
        {isAuto ? autoLabel : labelFor(scale[activeIdx])}
      </button>
      {open && (
        <div
          className="absolute bottom-[calc(100%+6px)] left-0 z-20 w-[260px] rounded-md border border-border bg-popover px-3.5 py-3 text-popover-foreground shadow-md"
          role="dialog"
          aria-label={t('effort.ariaLabel')}
          data-testid="effort-popover"
        >
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-[13px] text-muted-foreground">{t('effort.label')}</span>
            <span className="text-[13px] font-semibold text-foreground">
              {isAuto ? autoLabel : labelFor(scale[activeIdx])}
            </span>
            <span
              className="ml-auto inline-flex size-4 cursor-help items-center justify-center rounded-md border border-border text-2xs text-muted-foreground"
              role="img"
              aria-label={t('effort.help')}
              title={t('effort.help')}
            >
              {'?'}
            </span>
          </div>
          {/* Auto option — only under the auto model. Mirrors ModelSelect's auto entry:
              selecting it hands effort choice to auto mode per turn; moving the slider
              below pins a concrete level (auto off). */}
          {autoAvailable && (
            <button
              type="button"
              className={`mb-2 flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                isAuto
                  ? 'bg-accent/60 font-semibold text-foreground'
                  : 'text-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
              data-testid="effort-auto"
              aria-pressed={isAuto}
              onClick={() => setSelectedEffort('auto')}
            >
              <span className="flex-1">{autoLabel}</span>
              {isAuto && (
                <span className="text-primary" aria-hidden>
                  {'✓'}
                </span>
              )}
            </button>
          )}
          {fasterSmarterNode}
          {sliderNode}
        </div>
      )}
    </div>
  );
};

export default EffortControl;
