import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Thermometer, SquareDashedMousePointer, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import DemoBadge from '@/components/heatleak/DemoBadge';
import ThermalImageViewer from '@/components/heatleak/ThermalImageViewer';
import { AnomalyList, AnomalyPanel } from '@/components/heatleak/AnomalyViews';
import {
  fetchInspection,
  updateInspectionStatus,
  interpretRegion,
  removeAnomaly,
  updateAnomaly,
  updateAnnotatedImage,
  AnomalyEdit,
  statusAppearance,
  priorityAppearance,
  explanationSourceLabel,
  formatDateTime,
  INSPECTION_STATUSES,
  InspectionStatus,
  ThermalInspection,
  ThermalAnomaly,
} from '@/lib/heatleak';
import { measureRegion, renderAnnotatedImage, LoadedImage, RegionBox } from '@/lib/thermalAnalysis';

// Display order from the backend: kept scout regions, vision additions, then dismissed candidates.
const sortAnomalies = (list?: ThermalAnomaly[]) =>
  [...(list ?? [])].sort((a, b) => (a.anomalyIndex ?? 0) - (b.anomalyIndex ?? 0));

function errorText(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string' && e) return e;
  return fallback;
}

export default function AnalysisDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [inspection, setInspection] = useState<ThermalInspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [draftBox, setDraftBox] = useState<RegionBox | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [interpreting, setInterpreting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const anomalies: ThermalAnomaly[] = useMemo(() => sortAnomalies(inspection?.anomalies), [inspection]);
  const keptCount = useMemo(() => anomalies.filter((a) => !a.rejected).length, [anomalies]);

  const handleDismissedOpen = (open: boolean) => {
    setShowRejected(open);
    // Collapsing the group makes its boxes inert again; drop a dismissed selection so the panel does not dangle.
    if (!open && active !== null && anomalies[active]?.rejected) setActive(null);
  };

  const storedImage = (insp: ThermalInspection): LoadedImage | null =>
    insp.originalImage
      ? { dataUrl: insp.originalImage, width: insp.imageWidth ?? 0, height: insp.imageHeight ?? 0 }
      : null;

  /**
   * Reload the inspection after its findings changed and re-draw the annotated
   * image from the current boxes so the report and before/after view stay in sync.
   */
  const reloadAndReannotate = async (inspectionId: string): Promise<ThermalInspection | null> => {
    const fresh = await fetchInspection(inspectionId);
    if (!fresh) return null;
    const image = storedImage(fresh);
    if (image) {
      const annotated = await renderAnnotatedImage(image, sortAnomalies(fresh.anomalies));
      await updateAnnotatedImage(fresh.id, annotated);
      fresh.annotatedImage = annotated;
    }
    setInspection(fresh);
    return fresh;
  };

  const handleDraw = (box: RegionBox) => {
    setDraftBox(box);
    setActive(null);
    setActionError(null);
  };

  const discardDraft = () => {
    setDraftBox(null);
    setDraftNote('');
  };

  const handleInterpret = async () => {
    if (!inspection || !draftBox) return;
    const image = storedImage(inspection);
    if (!image) return;
    setInterpreting(true);
    setActionError(null);
    try {
      const region = await measureRegion(image, draftBox, inspection.palette ?? 'auto');
      const created = await interpretRegion(inspection.id, { ...region, inspectorNote: draftNote.trim() || undefined });
      const fresh = await reloadAndReannotate(inspection.id);
      const idx = sortAnomalies(fresh?.anomalies).findIndex((a) => a.id === created.id);
      setActive(idx >= 0 ? idx : null);
      discardDraft();
      setDrawMode(false);
    } catch (e) {
      setActionError(errorText(e, 'AI interpretation failed. The region was not saved.'));
    } finally {
      setInterpreting(false);
    }
  };

  const handleSaveEdit = async (edit: AnomalyEdit) => {
    if (!inspection || active === null) return;
    const target = anomalies[active];
    await updateAnomaly(target.id, edit);
    setInspection({
      ...inspection,
      anomalies: (inspection.anomalies ?? []).map((a) => (a.id === target.id ? { ...a, ...edit } : a)),
    });
  };

  const handleRemove = async () => {
    if (!inspection || active === null) return;
    setActionError(null);
    try {
      await removeAnomaly(inspection.id, anomalies[active].id);
      setActive(null);
      await reloadAndReannotate(inspection.id);
    } catch (e) {
      setActionError(errorText(e, 'Failed to remove the finding.'));
    }
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
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                  {drawMode
                    ? 'Drag on the image to outline an area you want the AI to interpret.'
                    : 'Spot something the detector missed? Draw a region for AI-assisted interpretation.'}
                </p>
                <Button
                  size="sm"
                  variant={drawMode ? 'soft' : 'outline'}
                  appearance={drawMode ? 'accent' : 'secondary'}
                  leadingIcon={<SquareDashedMousePointer className="size-3.5" />}
                  disabled={interpreting}
                  onClick={() => {
                    if (drawMode) discardDraft();
                    setDrawMode(!drawMode);
                  }}
                >
                  {drawMode ? 'Stop drawing' : 'Draw region'}
                </Button>
              </div>
              <ThermalImageViewer
                originalImage={inspection.originalImage}
                annotatedImage={inspection.annotatedImage}
                boxes={anomalies}
                activeIndex={active}
                onActiveChange={setActive}
                showRejected={showRejected}
                drawMode={drawMode && !interpreting}
                draftBox={draftBox}
                onDraw={handleDraw}
              />
              {draftBox ? (
                <Card className="gap-2">
                  <CardHeader>
                    <CardTitle>Interpret drawn region</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                      The region&apos;s contrast is measured from the image pixels, then the AI writes a cautious
                      finding. A drawn region is still a screening observation, not a confirmed defect.
                    </p>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="hl-draft-note" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                        What do you suspect here? (optional)
                      </label>
                      <Textarea
                        id="hl-draft-note"
                        rows={2}
                        placeholder="e.g. Possible gap at the bottom of the window sill"
                        value={draftNote}
                        onChange={(e) => setDraftNote(e.target.value)}
                        disabled={interpreting}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        appearance="secondary"
                        leadingIcon={<X className="size-3.5" />}
                        onClick={discardDraft}
                        disabled={interpreting}
                      >
                        Discard
                      </Button>
                      <Button
                        appearance="accent"
                        leadingIcon={interpreting ? <Spinner size="sm" /> : <Sparkles className="size-3.5" />}
                        onClick={handleInterpret}
                        disabled={interpreting}
                      >
                        {interpreting ? 'Interpreting…' : 'Interpret with AI'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              {actionError ? (
                <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-danger)]">{actionError}</p>
              ) : null}
            </>
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
          <AnomalyPanel
            key={active !== null ? anomalies[active]?.id : 'none'}
            anomaly={active !== null ? anomalies[active] ?? null : null}
            onSave={handleSaveEdit}
            onRemove={handleRemove}
            simulateLabel={
              active !== null
                ? `${inspection.buildingName || inspection.name} — finding #${active + 1}`
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
