import React, { useState } from 'react';
import { MapPin, Flame, Snowflake, Search, Lightbulb, HelpCircle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ThermalAnomaly, priorityAppearance } from '@/lib/heatleak';

/** An anomaly paired with its index in the full display-ordered list (= its number on the image). */
interface Indexed {
  anomaly: ThermalAnomaly;
  index: number;
}

/**
 * Clickable, selectable list of detected anomalies.
 *
 * `anomalies` is the full display-ordered list (kept scout regions, then vision
 * additions, then dismissed candidates) and `activeIndex` indexes into it, so the
 * numbers here always match the boxes on the image. Kept findings render one per
 * row; candidates the model dismissed collapse into a "Dismissed by model (n)"
 * group that expands to grey rows carrying the model's one-sentence reason.
 */
export function AnomalyList({
  anomalies,
  activeIndex,
  onActiveChange,
  dismissedOpen,
  onDismissedOpenChange,
}: {
  anomalies: ThermalAnomaly[];
  activeIndex: number | null;
  onActiveChange?: (index: number | null) => void;
  /** Controlled expansion of the dismissed group; uncontrolled when omitted. */
  dismissedOpen?: boolean;
  onDismissedOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = dismissedOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onDismissedOpenChange?.(next);
  };

  const indexed: Indexed[] = anomalies.map((anomaly, index) => ({ anomaly, index }));
  const kept = indexed.filter((x) => !x.anomaly.rejected);
  const dismissed = indexed.filter((x) => x.anomaly.rejected);

  if (anomalies.length === 0) {
    return (
      <div className="rounded-[var(--c3-style-border-radius-6)] border border-dashed border-[var(--c3-style-basic-border-border)] p-6 text-center text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
        No distinct thermal anomalies were flagged for this image. The contrast across the scene stayed within a
        normal range for screening purposes.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {kept.length === 0 ? (
        <div className="rounded-[var(--c3-style-border-radius-6)] border border-dashed border-[var(--c3-style-basic-border-border)] p-4 text-center text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
          No kept findings. The model dismissed every region the pixel scout proposed.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {kept.map(({ anomaly: a, index: i }) => {
            const active = activeIndex === i;
            return (
              <li key={a.id ?? i}>
                <button
                  type="button"
                  onClick={() => onActiveChange?.(active ? null : i)}
                  onMouseEnter={() => onActiveChange?.(i)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-[var(--c3-style-border-radius-6)] border p-3 text-left transition-colors',
                    active
                      ? 'border-[var(--c3-style-basic-border-accent)] bg-[var(--c3-style-basic-bg-accent)]'
                      : 'border-[var(--c3-style-basic-border-border)] hover:bg-[var(--c3-style-basic-bg-hover)]',
                  )}
                >
                  <span
                    className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-[#06121f]"
                    style={{ background: a.polarity === 'hot' ? 'var(--hl-warm)' : 'var(--hl-cool)' }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-c3-bold-body-p3 text-[var(--c3-style-basic-fg-primary)]">
                        {a.category}
                      </span>
                      {a.source === 'vision' ? <span className="hl-tag shrink-0">found by model</span> : null}
                      {a.polarity === 'hot' ? (
                        <Flame className="size-3.5 shrink-0 text-[var(--hl-warm)]" aria-label="Warmer region" />
                      ) : (
                        <Snowflake className="size-3.5 shrink-0 text-[var(--hl-cool)]" aria-label="Cooler region" />
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                      <MapPin className="size-3" aria-hidden /> {a.locationLabel}
                    </div>
                  </div>
                  <Badge appearance={priorityAppearance(a.priority)} variant="soft" size="sm">
                    {a.priority}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {dismissed.length > 0 ? (
        <div className="rounded-[var(--c3-style-border-radius-6)] border border-dashed border-[var(--c3-style-basic-border-border)]">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)] hover:bg-[var(--c3-style-basic-bg-hover)]"
          >
            <span>Dismissed by model ({dismissed.length})</span>
            <span className="text-c3-regular-label-l3">{open ? 'Hide' : 'Show'}</span>
          </button>
          {open ? (
            <ul className="flex flex-col divide-y divide-[var(--c3-style-basic-border-border)] border-t border-[var(--c3-style-basic-border-border)]">
              {dismissed.map(({ anomaly: a, index: i }) => {
                const active = activeIndex === i;
                return (
                  <li key={a.id ?? i}>
                    <button
                      type="button"
                      onClick={() => onActiveChange?.(active ? null : i)}
                      onMouseEnter={() => onActiveChange?.(i)}
                      className={cn(
                        'flex w-full items-start gap-3 px-3 py-2 text-left text-[var(--c3-style-basic-fg-secondary)] transition-colors',
                        active ? 'bg-[var(--c3-style-basic-bg-hover)]' : 'hover:bg-[var(--c3-style-basic-bg-hover)]',
                      )}
                    >
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--c3-style-basic-fg-secondary)] text-[11px] font-bold">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 text-c3-regular-body-p3">
                        {a.rejectionReason || 'No reason recorded.'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-c3-bold-label-l3 uppercase tracking-wide text-[var(--c3-style-basic-fg-secondary)]">
        {icon}
        {title}
      </div>
      <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-primary)]">{children}</p>
    </div>
  );
}

/**
 * Detailed explanation panel for one selected anomaly. A kept finding shows its
 * four prose fields; a candidate the model dismissed shows only the reason.
 */
export function AnomalyPanel({ anomaly }: { anomaly: ThermalAnomaly | null }) {
  if (!anomaly) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center rounded-[var(--c3-style-border-radius-6)] border border-dashed border-[var(--c3-style-basic-border-border)] p-6 text-center text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
        Select a highlighted region to see its observation, possible causes, and the step to verify it.
      </div>
    );
  }
  if (anomaly.rejected) {
    return (
      <div className="flex flex-col gap-1 rounded-[var(--c3-style-border-radius-6)] border border-dashed border-[var(--c3-style-basic-border-border)] p-4">
        <div className="text-c3-bold-label-l3 uppercase tracking-wide text-[var(--c3-style-basic-fg-secondary)]">
          Dismissed by model
        </div>
        <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-primary)]">
          {anomaly.rejectionReason || 'No reason recorded.'}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-border)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-c3-bold-heading-h6 text-[var(--c3-style-basic-fg-primary)]">{anomaly.category}</h3>
          <div className="mt-0.5 flex items-center gap-1 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
            <MapPin className="size-3" aria-hidden /> {anomaly.locationLabel} · {anomaly.polarity === 'hot' ? 'warmer' : 'cooler'} than surroundings
          </div>
        </div>
        <Badge appearance={priorityAppearance(anomaly.priority)} variant="soft" size="sm">
          {anomaly.priority} priority
        </Badge>
      </div>
      <Section icon={<Search className="size-3.5" aria-hidden />} title="Visual observation">
        {anomaly.observation}
      </Section>
      <Section icon={<Lightbulb className="size-3.5" aria-hidden />} title="Possible causes">
        {anomaly.possibleCauses}
      </Section>
      <Section icon={<HelpCircle className="size-3.5" aria-hidden />} title="Alternative explanations">
        {anomaly.alternativeExplanations}
      </Section>
      <Section icon={<CheckCircle2 className="size-3.5" aria-hidden />} title="Suggested verification">
        {anomaly.verificationStep}
      </Section>
    </div>
  );
}
