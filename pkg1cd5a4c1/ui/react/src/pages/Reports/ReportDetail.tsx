import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Printer, Microscope, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { Spinner } from '@/components/ui/spinner';
import CautionNotice from '@/components/heatleak/CautionNotice';
import { ManualBadge } from '@/components/heatleak/AnomalyViews';
import DemoBadge from '@/components/heatleak/DemoBadge';
import {
  fetchInspection,
  updateInspectionStatus,
  statusAppearance,
  priorityAppearance,
  formatDateTime,
  INSPECTION_STATUSES,
  InspectionStatus,
  ThermalInspection,
  ThermalAnomaly,
} from '@/lib/heatleak';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-c3-bold-label-l3 uppercase tracking-wide text-[var(--c3-style-basic-fg-secondary)]">{label}</div>
      <div className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-primary)]">{value}</div>
    </div>
  );
}

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [inspection, setInspection] = useState<ThermalInspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchInspection(id)
      .then((insp) => {
        setInspection(insp);
        if (!insp) setError('Report not found.');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load report.'))
      .finally(() => setLoading(false));
  }, [id]);

  const anomalies: ThermalAnomaly[] = useMemo(
    () => [...(inspection?.anomalies ?? [])].sort((a, b) => (a.anomalyIndex ?? 0) - (b.anomalyIndex ?? 0)),
    [inspection],
  );

  const handleStatus = async (status: string | null) => {
    if (!inspection || !status) return;
    setSaving(true);
    try {
      await updateInspectionStatus(inspection.id, status as InspectionStatus);
      setInspection({ ...inspection, status: status as InspectionStatus });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" label="Loading report" />
      </div>
    );
  }

  if (error || !inspection) {
    return (
      <div className="mx-auto max-w-[800px] p-6">
        <Button variant="ghost" appearance="secondary" leadingIcon={<ArrowLeft className="size-4" />} onClick={() => navigate('/reports')}>
          Back to reports
        </Button>
        <p className="mt-4 text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">{error ?? 'Not found.'}</p>
      </div>
    );
  }

  const resolved = inspection.status === 'Resolved' || inspection.status === 'Verified';

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5 p-6">
      {/* Controls (not printed) */}
      <div className="hl-no-print flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          appearance="secondary"
          size="sm"
          leadingIcon={<ArrowLeft className="size-4" />}
          onClick={() => navigate('/reports')}
        >
          Back to reports
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-52">
            <Combobox
              value={inspection.status ?? null}
              onValueChange={handleStatus}
              disabled={saving}
              options={INSPECTION_STATUSES.map((s) => ({ value: s, label: s }))}
            />
          </div>
          {resolved ? (
            <Button variant="outline" appearance="secondary" onClick={() => handleStatus('Under Investigation')} disabled={saving}>
              Reopen
            </Button>
          ) : null}
          <Button asChild variant="outline" appearance="secondary" leadingIcon={<Microscope className="size-4" />}>
            <Link to={`/analysis/${inspection.id}`}>Interactive view</Link>
          </Button>
          <Button leadingIcon={<Printer className="size-4" />} onClick={() => window.print()}>
            Print / PDF
          </Button>
        </div>
      </div>

      {/* The report document */}
      <Card className="hl-print-full gap-6">
        {/* Report header */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--c3-style-basic-border-border)] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">
                Thermal Inspection Report
              </h1>
              {inspection.isDemo ? <DemoBadge /> : null}
            </div>
            <p className="mt-1 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
              HeatLeak AI · Report #{inspection.id.slice(-6)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge appearance={statusAppearance(inspection.status)} variant="soft">
              {inspection.status}
            </Badge>
            {inspection.priority ? (
              <Badge appearance={priorityAppearance(inspection.priority)} variant="soft">
                {inspection.priority} priority
              </Badge>
            ) : null}
          </div>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Building" value={inspection.buildingName || '—'} />
          <Field label="Type" value={inspection.buildingType || '—'} />
          <Field label="Date" value={formatDateTime(inspection.inspectionDate)} />
          <Field label="Findings" value={inspection.anomalyCount ?? anomalies.length} />
          <Field
            label="Indoor temp"
            value={typeof inspection.indoorTempC === 'number' ? `${inspection.indoorTempC} °C` : '—'}
          />
          <Field
            label="Outdoor temp"
            value={typeof inspection.outdoorTempC === 'number' ? `${inspection.outdoorTempC} °C` : '—'}
          />
        </div>

        {/* Images */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {inspection.originalImage ? (
            <figure className="flex flex-col gap-1">
              <div className="overflow-hidden rounded-[var(--c3-style-border-radius-4)] border border-[var(--c3-style-basic-border-border)] bg-black">
                <img src={inspection.originalImage} alt="Original unannotated thermal view" className="block w-full" />
              </div>
              <figcaption className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">Original thermal image</figcaption>
            </figure>
          ) : null}
          {inspection.annotatedImage ? (
            <figure className="flex flex-col gap-1">
              <div className="overflow-hidden rounded-[var(--c3-style-border-radius-4)] border border-[var(--c3-style-basic-border-border)] bg-black">
                <img src={inspection.annotatedImage} alt="Annotated thermal view with numbered candidate regions" className="block w-full" />
              </div>
              <figcaption className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                Annotated — numbered candidate regions
              </figcaption>
            </figure>
          ) : null}
        </div>

        {/* Summary */}
        {inspection.summary ? (
          <div>
            <h2 className="mb-1 text-c3-bold-heading-h6 text-[var(--c3-style-basic-fg-primary)]">Summary</h2>
            <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-primary)]">{inspection.summary}</p>
          </div>
        ) : null}

        <CautionNotice />

        {/* Findings */}
        <div>
          <h2 className="mb-2 text-c3-bold-heading-h6 text-[var(--c3-style-basic-fg-primary)]">
            Detailed findings ({anomalies.length})
          </h2>
          {anomalies.length === 0 ? (
            <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
              No distinct thermal anomalies were flagged for this image.
            </p>
          ) : (
            <ol className="flex flex-col gap-4">
              {anomalies.map((a, i) => (
                <li key={a.id ?? i} className="rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-border)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex size-6 items-center justify-center rounded-full text-[11px] font-bold text-[#06121f]"
                        style={{ background: a.polarity === 'hot' ? 'var(--hl-warm)' : 'var(--hl-cool)' }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">{a.category}</span>
                      {a.source === 'manual' ? <ManualBadge /> : null}
                    </div>
                    <Badge appearance={priorityAppearance(a.priority)} variant="soft" size="sm">
                      {a.priority}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                    <MapPin className="size-3" aria-hidden /> {a.locationLabel} · {a.polarity === 'hot' ? 'warmer' : 'cooler'} region
                  </div>
                  <dl className="mt-3 flex flex-col gap-2 text-c3-regular-body-p3">
                    <div>
                      <dt className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">Observation</dt>
                      <dd className="text-[var(--c3-style-basic-fg-primary)]">{a.observation}</dd>
                    </div>
                    <div>
                      <dt className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">Possible causes</dt>
                      <dd className="text-[var(--c3-style-basic-fg-primary)]">{a.possibleCauses}</dd>
                    </div>
                    <div>
                      <dt className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">Alternative explanations</dt>
                      <dd className="text-[var(--c3-style-basic-fg-primary)]">{a.alternativeExplanations}</dd>
                    </div>
                    <div>
                      <dt className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">Suggested follow-up</dt>
                      <dd className="text-[var(--c3-style-basic-fg-primary)]">{a.verificationStep}</dd>
                    </div>
                    {a.inspectorNote ? (
                      <div>
                        <dt className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">Inspector note</dt>
                        <dd className="text-[var(--c3-style-basic-fg-primary)]">{a.inspectorNote}</dd>
                      </div>
                    ) : null}
                  </dl>
                </li>
              ))}
            </ol>
          )}
        </div>

        {inspection.notes ? (
          <div>
            <h2 className="mb-1 text-c3-bold-heading-h6 text-[var(--c3-style-basic-fg-primary)]">Inspector notes</h2>
            <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-primary)]">{inspection.notes}</p>
          </div>
        ) : null}

        <p className="border-t border-[var(--c3-style-basic-border-border)] pt-3 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
          Generated by HeatLeak AI. Findings are preliminary thermal-screening observations and do not constitute a
          confirmed diagnosis. On-site verification by a qualified professional is required before remediation.
        </p>
      </Card>
    </div>
  );
}
