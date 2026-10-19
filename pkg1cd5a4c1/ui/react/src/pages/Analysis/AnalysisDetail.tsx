import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Thermometer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { Spinner } from '@/components/ui/spinner';
import DemoBadge from '@/components/heatleak/DemoBadge';
import ThermalImageViewer from '@/components/heatleak/ThermalImageViewer';
import { AnomalyList, AnomalyPanel } from '@/components/heatleak/AnomalyViews';
import {
  fetchInspection,
  updateInspectionStatus,
  statusAppearance,
  priorityAppearance,
  explanationSourceLabel,
  formatDateTime,
  INSPECTION_STATUSES,
  InspectionStatus,
  ThermalInspection,
  ThermalAnomaly,
} from '@/lib/heatleak';

export default function AnalysisDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [inspection, setInspection] = useState<ThermalInspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchInspection(id)
      .then((insp) => {
        setInspection(insp);
        if (!insp) setError('Inspection not found.');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load inspection.'))
      .finally(() => setLoading(false));
  }, [id]);

  // Display order from the backend: kept scout regions, vision additions, then dismissed candidates.
  const anomalies: ThermalAnomaly[] = useMemo(
    () => [...(inspection?.anomalies ?? [])].sort((a, b) => (a.anomalyIndex ?? 0) - (b.anomalyIndex ?? 0)),
    [inspection],
  );
  const keptCount = useMemo(() => anomalies.filter((a) => !a.rejected).length, [anomalies]);

  const handleDismissedOpen = (open: boolean) => {
    setShowRejected(open);
    // Collapsing the group makes its boxes inert again; drop a dismissed selection so the panel does not dangle.
    if (!open && active !== null && anomalies[active]?.rejected) setActive(null);
  };

  const handleStatus = async (status: string | null) => {
    if (!inspection || !status) return;
    setSavingStatus(true);
    try {
      await updateInspectionStatus(inspection.id, status as InspectionStatus);
      setInspection({ ...inspection, status: status as InspectionStatus });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status.');
    } finally {
      setSavingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" label="Loading inspection" />
      </div>
    );
  }

  if (error || !inspection) {
    return (
      <div className="mx-auto max-w-[800px] p-6">
        <Button variant="ghost" appearance="secondary" leadingIcon={<ArrowLeft className="size-4" />} onClick={() => navigate('/analysis')}>
          Back to analysis
        </Button>
        <p className="mt-4 text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">{error ?? 'Not found.'}</p>
      </div>
    );
  }

  const explanationLabel = explanationSourceLabel(inspection.explanationSource);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 p-6">
      <div>
        <Button
          variant="ghost"
          appearance="secondary"
          size="sm"
          leadingIcon={<ArrowLeft className="size-4" />}
          onClick={() => navigate('/analysis')}
        >
          Back to analysis
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">
              {inspection.buildingName || inspection.name}
            </h1>
            {inspection.isDemo ? <DemoBadge /> : null}
          </div>
          <p className="mt-1 text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
            {inspection.buildingType ? `${inspection.buildingType} · ` : ''}
            Analyzed {formatDateTime(inspection.inspectionDate)}
          </p>
          <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
            Screening observations, not a diagnosis.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {explanationLabel ? (
            <Badge variant="soft" appearance="info">
              {explanationLabel}
            </Badge>
          ) : null}
          <div className="w-52">
            <Combobox
              value={inspection.status ?? null}
              onValueChange={handleStatus}
              disabled={savingStatus}
              options={INSPECTION_STATUSES.map((s) => ({ value: s, label: s }))}
            />
          </div>
          <Button asChild variant="outline" appearance="secondary" leadingIcon={<FileText className="size-4" />}>
            <Link to={`/reports/${inspection.id}`}>View report</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Left: viewer */}
        <div className="flex flex-col gap-4">
          {inspection.originalImage ? (
            <ThermalImageViewer
              originalImage={inspection.originalImage}
              annotatedImage={inspection.annotatedImage}
              boxes={anomalies}
              activeIndex={active}
              onActiveChange={setActive}
              showRejected={showRejected}
            />
          ) : (
            <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">No image stored.</p>
          )}

          <div className="flex flex-wrap gap-3">
            <Badge appearance={statusAppearance(inspection.status)} variant="soft">
              {inspection.status}
            </Badge>
            {inspection.priority ? (
              <Badge appearance={priorityAppearance(inspection.priority)} variant="soft">
                {inspection.priority} overall priority
              </Badge>
            ) : null}
            {typeof inspection.indoorTempC === 'number' || typeof inspection.outdoorTempC === 'number' ? (
              <span className="flex items-center gap-1 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                <Thermometer className="size-3.5" aria-hidden />
                {typeof inspection.indoorTempC === 'number' ? `${inspection.indoorTempC}°C in` : '—'}
                {' / '}
                {typeof inspection.outdoorTempC === 'number' ? `${inspection.outdoorTempC}°C out` : '—'}
              </span>
            ) : null}
          </div>

          {inspection.summary ? (
            <Card className="gap-1">
              <CardHeader>
                <CardTitle>AI summary</CardTitle>
              </CardHeader>
              <CardContent className="text-[var(--c3-style-basic-fg-primary)]">{inspection.summary}</CardContent>
            </Card>
          ) : null}

          {inspection.notes ? (
            <Card className="gap-1">
              <CardHeader>
                <CardTitle>Inspector notes</CardTitle>
              </CardHeader>
              <CardContent>{inspection.notes}</CardContent>
            </Card>
          ) : null}
        </div>

        {/* Right: anomalies + detail */}
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="mb-2 text-c3-bold-heading-h6 text-[var(--c3-style-basic-fg-primary)]">
              Flagged regions ({keptCount})
            </h2>
            <AnomalyList
              anomalies={anomalies}
              activeIndex={active}
              onActiveChange={setActive}
              dismissedOpen={showRejected}
              onDismissedOpenChange={handleDismissedOpen}
            />
          </div>
          <AnomalyPanel anomaly={active !== null ? anomalies[active] ?? null : null} />
        </div>
      </div>
    </div>
  );
}
