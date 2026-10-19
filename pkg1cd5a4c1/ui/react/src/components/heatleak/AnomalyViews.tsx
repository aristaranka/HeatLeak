import React from 'react';
import { MapPin, Flame, Snowflake, Search, Lightbulb, HelpCircle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ThermalAnomaly, priorityAppearance } from '@/lib/heatleak';

/** Clickable, selectable list of detected anomalies. */
export function AnomalyList({
  anomalies,
  activeIndex,
  onActiveChange,
}: {
  anomalies: ThermalAnomaly[];
  activeIndex: number | null;
  onActiveChange?: (index: number | null) => void;
}) {
  if (anomalies.length === 0) {
    return (
      <div className="rounded-[var(--c3-style-border-radius-6)] border border-dashed border-[var(--c3-style-basic-border-border)] p-6 text-center text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
        No distinct thermal anomalies were flagged for this image. The contrast across the scene stayed within a
        normal range for screening purposes.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {anomalies.map((a, i) => {
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
                className={cn(
                  'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-[#06121f]',
                )}
                style={{ background: a.polarity === 'hot' ? 'var(--hl-warm)' : 'var(--hl-cool)' }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-c3-bold-body-p3 text-[var(--c3-style-basic-fg-primary)]">
                    {a.category}
                  </span>
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

/** Detailed explanation panel for one selected anomaly. */
export function AnomalyPanel({ anomaly }: { anomaly: ThermalAnomaly | null }) {
  if (!anomaly) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center rounded-[var(--c3-style-border-radius-6)] border border-dashed border-[var(--c3-style-basic-border-border)] p-6 text-center text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
        Select a highlighted region to see its observation, possible causes, and the step to verify it.
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
