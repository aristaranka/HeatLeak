import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, ImageIcon, X, Microscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import CautionNotice from '@/components/heatleak/CautionNotice';
import {
  fetchBuildings,
  ensureBuilding,
  createInspection,
  analyzeInspection,
  BUILDING_TYPES,
  BuildingType,
  Building,
} from '@/lib/heatleak';
import {
  fileToStoredImage,
  analyzeThermalImage,
  LoadedImage,
  ThermalPalette,
  THERMAL_PALETTES,
} from '@/lib/thermalAnalysis';

const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png'];

export default function NewInspection() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [buildings, setBuildings] = useState<Building[]>([]);

  const [buildingName, setBuildingName] = useState('');
  const [buildingType, setBuildingType] = useState<BuildingType>('Residential');
  const [notes, setNotes] = useState('');
  const [palette, setPalette] = useState<ThermalPalette>('auto');
  const [indoorTemp, setIndoorTemp] = useState('');
  const [outdoorTemp, setOutdoorTemp] = useState('');

  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchBuildings().then(setBuildings).catch(() => undefined);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError('Please choose a JPG, JPEG, or PNG image.');
      return;
    }
    try {
      const stored = await fileToStoredImage(file);
      setImage(stored);
      setFileName(file.name);
      if (!buildingName) setBuildingName(file.name.replace(/\.[^.]+$/, ''));
    } catch {
      setError('Could not read that image. Try a different file.');
    }
  }, [buildingName]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const canSubmit = Boolean(image) && buildingName.trim().length > 0 && !busy;

  const handleSubmit = async () => {
    if (!image) return;
    setBusy(true);
    setError(null);
    let step = 'Analyzing image pixels';
    try {
      setBusyLabel('Analyzing image pixels…');
      const analysis = await analyzeThermalImage(image, palette);

      step = 'Saving building';
      setBusyLabel('Saving inspection…');
      const building = await ensureBuilding(buildingName.trim(), buildingType);
      step = 'Saving inspection';
      const inspection = await createInspection({
        name: `${buildingName.trim()} — thermal inspection`,
        buildingId: building.id,
        buildingName: buildingName.trim(),
        buildingType,
        notes: notes.trim() || undefined,
        indoorTempC: indoorTemp ? Number(indoorTemp) : undefined,
        outdoorTempC: outdoorTemp ? Number(outdoorTemp) : undefined,
        originalImage: image.dataUrl,
        annotatedImage: analysis.annotatedDataUrl,
        palette,
        imageWidth: analysis.width,
        imageHeight: analysis.height,
      });

      step = 'Generating AI explanations';
      setBusyLabel('Generating AI explanations…');
      await analyzeInspection(inspection.id, JSON.stringify(analysis.regions));

      navigate(`/analysis/${inspection.id}`);
    } catch (e) {
      const detail = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
      console.error(`[HeatLeak] ${step} failed`, e);
      setError(`${step} failed${detail ? `: ${detail}` : '.'}`);
      setBusy(false);
      setBusyLabel('');
    }
  };

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 p-6">
      <div>
        <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">New inspection</h1>
        <p className="mt-1 text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
          Upload an infrared thermal image. HeatLeak analyzes the actual image pixels, highlights candidate thermal
          anomalies, and drafts a cautious inspection report.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upload */}
        <div className="flex flex-col gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED.join(',')}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          {!image ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={cn(
                'flex min-h-[320px] w-full flex-col items-center justify-center gap-3 rounded-[var(--c3-style-border-radius-6)] border-2 border-dashed p-8 text-center transition-colors',
                dragOver
                  ? 'border-[var(--hl-cyan)] bg-[var(--hl-cyan-soft)]'
                  : 'border-[var(--c3-style-basic-border-border)] hover:border-[var(--hl-cyan)]',
              )}
            >
              <UploadCloud className="size-10 text-[var(--hl-cyan)]" aria-hidden />
              <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
                Drag &amp; drop a thermal image
              </span>
              <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                or click to browse — JPG, JPEG or PNG
              </span>
            </button>
          ) : (
            <Card className="gap-3">
              <div className="flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <ImageIcon className="size-4 shrink-0 text-[var(--hl-cyan)]" aria-hidden />
                  <span className="truncate text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                    {fileName} · {image.width}×{image.height}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  appearance="secondary"
                  size="icon-sm"
                  aria-label="Remove image"
                  onClick={() => {
                    setImage(null);
                    setFileName('');
                  }}
                  disabled={busy}
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="overflow-hidden rounded-[var(--c3-style-border-radius-4)] border border-[var(--c3-style-basic-border-border)] bg-black">
                <img src={image.dataUrl} alt="Uploaded thermal preview" className="block w-full" />
              </div>
            </Card>
          )}
          <CautionNotice compact />
        </div>

        {/* Details form */}
        <Card className="gap-4">
          <CardHeader>
            <CardTitle>Inspection details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="bname" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                Building name
              </label>
              <Input
                id="bname"
                list="building-suggestions"
                placeholder="e.g. 128 Elm Street"
                value={buildingName}
                onChange={(e) => setBuildingName(e.target.value)}
                disabled={busy}
              />
              <datalist id="building-suggestions">
                {buildings.map((b) => (
                  <option key={b.id} value={b.name} />
                ))}
              </datalist>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="btype" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                Building type
              </label>
              <Combobox
                id="btype"
                value={buildingType}
                onValueChange={(v) => v && setBuildingType(v as BuildingType)}
                options={BUILDING_TYPES.map((t) => ({ value: t, label: t }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="palette" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                Camera color palette
              </label>
              <Combobox
                id="palette"
                value={palette}
                onValueChange={(v) => v && setPalette(v as ThermalPalette)}
                options={THERMAL_PALETTES.map((p) => ({ value: p.value, label: p.label }))}
              />
              <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                {THERMAL_PALETTES.find((p) => p.value === palette)?.hint} Palettes differ between cameras, so pick the
                one your scale bar shows.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="indoor" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                  Indoor temp (°C)
                </label>
                <Input
                  id="indoor"
                  type="number"
                  placeholder="21"
                  value={indoorTemp}
                  onChange={(e) => setIndoorTemp(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="outdoor" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                  Outdoor temp (°C)
                </label>
                <Input
                  id="outdoor"
                  type="number"
                  placeholder="2"
                  value={outdoorTemp}
                  onChange={(e) => setOutdoorTemp(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="notes" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                Notes <span className="font-normal">(optional)</span>
              </label>
              <Textarea
                id="notes"
                rows={3}
                placeholder="Context: weather, camera, what you were inspecting…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={busy}
              />
            </div>

            {error ? (
              <div className="rounded-[var(--c3-style-border-radius-4)] border border-[var(--c3-style-basic-border-danger)] bg-[var(--c3-style-basic-bg-danger)] p-2.5 text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-danger)]">
                {error}
              </div>
            ) : null}

            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              leadingIcon={busy ? <Spinner size="sm" tone="on-primary" /> : <Microscope className="size-4" />}
            >
              {busy ? busyLabel || 'Working…' : 'Analyze thermal image'}
            </Button>
            {!image ? (
              <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                Upload an image to enable analysis.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
