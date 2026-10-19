/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { Check, Sparkles } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDismissablePopover } from '../hooks/useDismissablePopover';
import { friendlyModelLabel, modelRouteTooltip } from '../lib/modelLabel';
import { cn } from '../lib/utils';
import { ChevronDownIcon } from './AgentIcons';
import type { ModelAvailability, ModelAvailabilityReason, ModelInfo } from '../lib/chatApi';

interface ModelSelectProps {
  models: ModelInfo[];
  selectedModel: string;
  setSelectedModel: (id: string) => void;
  isStreaming: boolean;
  defaultModel?: string | null;
  currentModel?: string | null;
  autoAvailability?: ModelAvailability;
  autoAvailabilityReason?: ModelAvailabilityReason;
  /** Authoritative dispatch state for the selected fixed route. This also covers a route removed
   *  from the catalog (no row) and a strict pod whose routing generation is still applying. */
  selectedRouteAvailability?: ModelAvailability;
  selectedRouteAvailabilityReason?: ModelAvailabilityReason;
  /** Fired when the dropdown opens, so the caller can re-read the pod catalog and let any
   *  `pending` option settle. Optional — the picker is correct without it, just slower to notice. */
  onOpen?: () => void;
}

/**
 * LLM picker for the composer — a Nexus UI dropdown (not the OS-native <select>), matching the other
 * pickers (AgentPicker / AppsPicker). Opens upward since the composer sits at the bottom of the page.
 * "Auto" is a fixed first option ahead of the catalog; the model list order is preserved from the
 * caller (default sorted first). Disabled while a turn is streaming.
 *
 * An option the pod cannot serve (`availability` other than `available` — see buildModelOptions)
 * is shown but not selectable: hiding it would make an admin's just-enabled model look like it
 * never landed, and offering it is what silently routes the turn to some other model. Its state is
 * named inline and explained on hover. Auto is held to the same contract: at least one published,
 * proxy-confirmed, OpenCode-applied tier must exist before it is selectable.
 */
const ModelSelect: React.FC<ModelSelectProps> = ({
  models,
  selectedModel,
  setSelectedModel,
  isStreaming,
  defaultModel,
  currentModel,
  autoAvailability = 'available',
  autoAvailabilityReason,
  selectedRouteAvailability,
  selectedRouteAvailabilityReason,
  onOpen,
}) => {
  const { t } = useTranslation('chat');
  const { open, setOpen, wrapRef, triggerRef } = useDismissablePopover();

  const availabilityOf = (id: string): ModelAvailability => {
    if (id === selectedModel && selectedRouteAvailability) return selectedRouteAvailability;
    const model = models.find((m) => m.id === id);
    if (model) return model.availability ?? 'available';
    return 'available';
  };
  const reasonOf = (id: string): string => {
    if (id === selectedModel && selectedRouteAvailabilityReason) {
      return t(`modelAvailability.${selectedRouteAvailabilityReason}`);
    }
    const m = models.find((x) => x.id === id);
    if (m?.availabilityReason) return t(`modelAvailability.${m.availabilityReason}`);
    return '';
  };

  const tagSuffix = (id: string): string => {
    const tags: string[] = [];
    if (id === defaultModel) tags.push(t('modelTag.default'));
    if (currentModel && id === currentModel) tags.push(t('modelTag.current'));
    // Ahead of default/current in the parens: it is the fact that changes what the user can do.
    const avail = availabilityOf(id);
    if (avail !== 'available') tags.unshift(t(`modelTag.${avail}`));
    return tags.length ? ` (${tags.join(', ')})` : '';
  };

  const isAuto = !selectedModel || selectedModel === 'auto';
  // Models carry the friendly display name as `label`; when the id isn't in the list (or carries no
  // label) derive a readable name from the route rather than showing the raw, truncating id.
  const labelFor = (id: string): string => models.find((m) => m.id === id)?.label || friendlyModelLabel(id);
  const autoTag = autoAvailability === 'available' ? '' : ` (${t(`modelTag.${autoAvailability}`)})`;
  const triggerLabel = isAuto
    ? `${t('modelSelect.auto')}${autoTag}`
    : `${labelFor(selectedModel)}${tagSuffix(selectedModel)}`;
  const baseTitle = selectedModel
    ? t('modelSelect.titleSelected', { model: labelFor(selectedModel) })
    : t('modelSelect.titleDefault', {
        defaultModel: defaultModel ? labelFor(defaultModel) : t('modelSelect.none'),
        currentModel: currentModel ? ` · ${t('modelTag.current')}: ${labelFor(currentModel)}` : '',
      });
  // Compose the fully-qualified route onto the (friendly, i18n) trigger title so it is discoverable
  // from the composer — mirroring the per-option tooltip and the detail pages. Skip the route line
  // for Auto / unset: there is no single concrete model to route.
  const routeTitle = isAuto ? baseTitle : modelRouteTooltip(baseTitle, selectedModel);
  // The reason goes on the trigger too, not just the option row: a chat restored with a model
  // pinned that the pod has since stopped serving shows its state in the composer without the
  // user having to open the dropdown to find out.
  const autoReason = autoAvailabilityReason ? t(`modelAvailability.${autoAvailabilityReason}`) : '';
  const selectedReason = isAuto ? autoReason : reasonOf(selectedModel);

  const choose = (id: string) => {
    setSelectedModel(id);
    setOpen(false);
  };

  const toggle = () => {
    // Read `open` rather than firing from inside the updater: React double-invokes state
    // updaters in dev StrictMode, which would double-fire the caller's re-read.
    if (!open) onOpen?.();
    setOpen((o) => !o);
  };

  const itemCls = (selected: boolean, disabled = false) =>
    cn(
      'flex w-full items-center gap-2 truncate px-2.5 py-2 text-left text-xs text-foreground',
      disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:bg-accent hover:text-accent-foreground',
      selected && 'bg-accent/60 font-semibold'
    );

  return (
    <div className="relative inline-flex min-w-0" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        data-testid="model-select"
        data-selected={selectedModel}
        className={cn(
          // Container-relative caps (nearest @container/composer = the chat composer): the label
          // truncates progressively as the composer narrows so the trigger never forces the
          // toolbar wider than the column. Falls back to the 220px cap wherever no composer
          // container ancestor exists.
          'inline-flex min-w-0 max-w-[220px] cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-55 @max-[600px]/composer:max-w-[150px] @max-[480px]/composer:max-w-[104px] [&_svg]:shrink-0 [&_svg]:transition-transform',
          open && 'border-ring [&>svg:last-child]:rotate-180'
        )}
        onClick={toggle}
        disabled={isStreaming}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t('modelSelect.ariaLabel')}: ${triggerLabel}${selectedReason ? `. ${selectedReason}` : ''}`}
        aria-busy={isStreaming}
        title={routeTitle}
      >
        <Sparkles className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{triggerLabel}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="absolute bottom-[calc(100%+4px)] right-0 z-50 flex max-h-80 min-w-60 max-w-[360px] flex-col rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          {/* Why the current pick can't be sent, pinned above the scroll area so it stays visible
              while the user scans for a replacement. No duplicate action button: "Auto" is the
              adjacent first option when viable; otherwise it explains why routing must recover. */}
          {selectedReason && (
            <div className="shrink-0 border-b border-border px-2.5 py-2 text-xs text-muted-foreground" role="status">
              {selectedReason}
            </div>
          )}
          <div
            className="flex min-h-0 flex-col overflow-y-auto py-1"
            role="listbox"
            aria-label={t('modelSelect.ariaLabel')}
          >
            {/* Auto mode — fixed first option, ahead of the catalog. Selected when the model is 'auto'
                OR unset/blank (isAuto), so a chat seeded from an Auto agent (or an unset composer) opens
                on Auto. Labeled just "Auto" — the "recommended" framing is admin-only (Chat defaults). */}
            <button
              type="button"
              role="option"
              data-model-id="auto"
              aria-selected={isAuto}
              aria-disabled={autoAvailability !== 'available' || undefined}
              disabled={autoAvailability !== 'available'}
              data-availability={autoAvailability}
              className={itemCls(isAuto, autoAvailability !== 'available')}
              onClick={() => choose('auto')}
              title={autoReason || undefined}
            >
              <span className="flex-1 truncate">
                {t('modelSelect.auto')}
                {autoTag}
              </span>
              {isAuto && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
            </button>
            {models.map((m) => {
              const availability = availabilityOf(m.id);
              const unusable = availability !== 'available';
              const reason = reasonOf(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  data-model-id={m.id}
                  data-availability={availability}
                  aria-selected={m.id === selectedModel}
                  // Both, deliberately. `role="option"` discards the button's implicit ARIA
                  // mapping, so native `disabled` alone would block the click without telling
                  // assistive tech why; `aria-disabled` alone would leave the click live.
                  aria-disabled={unusable || undefined}
                  disabled={unusable}
                  className={itemCls(m.id === selectedModel, unusable)}
                  onClick={() => choose(m.id)}
                  // Friendly label + fully-qualified route on hover (two lines), matching the trigger,
                  // Agent Detail, and the detail pages — the id stays discoverable. A third line
                  // carries why an unusable option can't be picked.
                  title={reason ? `${modelRouteTooltip(m.label, m.id)}\n${reason}` : modelRouteTooltip(m.label, m.id)}
                >
                  {/* The inline tag carries the ACTIONABLE half — "syncing" means wait,
                      "unavailable" means ask an admin — because a browser may suppress the
                      title tooltip on a disabled control. The tooltip only adds which flavour. */}
                  <span className="flex-1 truncate">
                    {m.label}
                    {tagSuffix(m.id)}
                  </span>
                  {m.id === selectedModel && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelSelect;
