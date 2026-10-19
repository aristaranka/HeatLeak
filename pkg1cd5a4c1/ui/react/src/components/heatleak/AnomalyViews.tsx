import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin,
  Flame,
  Snowflake,
  Search,
  Lightbulb,
  HelpCircle,
  CheckCircle2,
  PencilLine,
  Trash2,
  StickyNote,
  Calculator,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  ThermalAnomaly,
  AnomalyEdit,
  ANOMALY_CATEGORIES,
  PRIORITIES,
  Priority,
  priorityAppearance,
  interventionForCategory,
} from '@/lib/heatleak';

/** Small label marking a region the inspector drew by hand. */
export function ManualBadge() {
  return (
    <Badge appearance="info" variant="outline" size="sm">
      Inspector-drawn
    </Badge>
  );
}

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
                  {a.source === 'manual' ? <ManualBadge /> : null}
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

const EDIT_FIELDS: { key: keyof AnomalyEdit; label: string }[] = [
  { key: 'observation', label: 'Visual observation' },
  { key: 'possibleCauses', label: 'Possible causes' },
  { key: 'alternativeExplanations', label: 'Alternative explanations' },
  { key: 'verificationStep', label: 'Suggested verification' },
  { key: 'inspectorNote', label: 'Inspector note' },
];

function AnomalyEditor({
  anomaly,
  onSave,
  onCancel,
}: {
  anomaly: ThermalAnomaly;
  onSave: (edit: AnomalyEdit) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<AnomalyEdit>({
    category: anomaly.category,
    priority: anomaly.priority,
    observation: anomaly.observation,
    possibleCauses: anomaly.possibleCauses,
    alternativeExplanations: anomaly.alternativeExplanations,
    verificationStep: anomaly.verificationStep,
    inspectorNote: anomaly.inspectorNote ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : typeof e === 'string' ? e : 'Failed to save changes.');
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-accent)] p-4">
      <h3 className="text-c3-bold-heading-h6 text-[var(--c3-style-basic-fg-primary)]">Edit finding</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="hl-edit-category" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
            Category
          </label>
          <Combobox
            id="hl-edit-category"
            value={draft.category ?? null}
            onValueChange={(v) => v && setDraft({ ...draft, category: v })}
            options={ANOMALY_CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="hl-edit-priority" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
            Priority
          </label>
          <Combobox
            id="hl-edit-priority"
            value={draft.priority ?? null}
            onValueChange={(v) => v && setDraft({ ...draft, priority: v as Priority })}
            options={PRIORITIES.map((p) => ({ value: p, label: p }))}
          />
        </div>
      </div>
      {EDIT_FIELDS.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-1">
          <label htmlFor={`hl-edit-${key}`} className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
            {label}
          </label>
          <Textarea
            id={`hl-edit-${key}`}
            rows={key === 'inspectorNote' ? 2 : 3}
            value={draft[key] ?? ''}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          />
        </div>
      ))}
      {error ? <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-danger)]">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" appearance="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button appearance="accent" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

/** Detailed explanation panel for one selected anomaly. */
export function AnomalyPanel({
  anomaly,
  onSave,
  onRemove,
  simulateLabel,
}: {
  anomaly: ThermalAnomaly | null;
  /** When provided, offers a link to the Impact Simulator prefilled for this finding. */
  simulateLabel?: string;
  /** When provided, the panel offers an Edit button that saves through this callback. */
  onSave?: (edit: AnomalyEdit) => Promise<void>;
  /** When provided, the panel offers a Remove button. */
  onRemove?: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (anomaly && editing && onSave) {
    return (
      <AnomalyEditor
        anomaly={anomaly}
        onCancel={() => setEditing(false)}
        onSave={async (edit) => {
          await onSave(edit);
          setEditing(false);
        }}
      />
    );
  }

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
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge appearance={priorityAppearance(anomaly.priority)} variant="soft" size="sm">
            {anomaly.priority} priority
          </Badge>
          {anomaly.source === 'manual' ? <ManualBadge /> : null}
        </div>
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
      {anomaly.inspectorNote ? (
        <Section icon={<StickyNote className="size-3.5" aria-hidden />} title="Inspector note">
          {anomaly.inspectorNote}
        </Section>
      ) : null}
      {onSave || onRemove || simulateLabel ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--c3-style-basic-border-border)] pt-3">
          {simulateLabel ? (
            <Button
              asChild
              variant="ghost"
              appearance="accent"
              size="sm"
              leadingIcon={<Calculator className="size-3.5" />}
              className="mr-auto"
            >
              <Link
                to={`/simulator?${new URLSearchParams({
                  intervention: interventionForCategory(anomaly.category),
                  name: simulateLabel,
                }).toString()}`}
              >
                Simulate a repair
              </Link>
            </Button>
          ) : null}
          {onRemove ? (
            <Button
              variant="ghost"
              appearance="danger"
              size="sm"
              leadingIcon={<Trash2 className="size-3.5" />}
              disabled={removing}
              onClick={async () => {
                if (!window.confirm('Remove this finding from the inspection?')) return;
                setRemoving(true);
                try {
                  await onRemove();
                } finally {
                  setRemoving(false);
                }
              }}
            >
              {removing ? 'Removing…' : 'Remove'}
            </Button>
          ) : null}
          {onSave ? (
            <Button
              variant="outline"
              appearance="secondary"
              size="sm"
              leadingIcon={<PencilLine className="size-3.5" />}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
