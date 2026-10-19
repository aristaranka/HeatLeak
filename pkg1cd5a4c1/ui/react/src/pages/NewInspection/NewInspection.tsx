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
import {
  fetchBuildings,
  ensureBuilding,
  createInspection,
  analyzeInspection,
  updateAnnotatedImage,
  BUILDING_TYPES,
  BuildingType,
  Building,
} from '@/lib/heatleak';
import {
  fileToStoredImage,
  analyzeThermalImage,
  loadImage,
  renderAnnotated,
  LoadedImage,
  Palette,
} from '@/lib/thermalAnalysis';

interface SampleEntry {
  file: string;
  title: string;
  buildingName: string;
  buildingType: BuildingType;
  credit: string;
  license: string;
  sourceUrl: string;
}

const PALETTE_OPTIONS: { value: Palette; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'ironbow', label: 'Ironbow' },
  { value: 'rainbow', label: 'Rainbow' },
  { value: 'whitehot', label: 'White-hot' },
  { value: 'blackhot', label: 'Black-hot' },
];
const PALETTE_LABEL: Record<string, string> = Object.fromEntries(PALETTE_OPTIONS.map((o) => [o.value, o.label]));

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
  const [indoorTemp, setIndoorTemp] = useState('');
  const [outdoorTemp, setOutdoorTemp] = useState('');
  const [palette, setPalette] = useState<Palette>('auto');
  const [paletteDetected, setPaletteDetected] = useState('');
  const [samples, setSamples] = useState<SampleEntry[]>([]);
  const [credit, setCredit] = useState<SampleEntry | null>(null);

  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchBuildings().then(setBuildings).catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'samples/manifest.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no manifest'))))
      .then((m: SampleEntry[]) => setSamples(Array.isArray(m) ? m : []))
      .catch(() => setSamples([]));
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
      setCredit(null);
      setPaletteDetected('');
      if (!buildingName) setBuildingName(file.name.replace(/\.[^.]+$/, ''));
    } catch {
      setError('Could not read that image. Try a different file.');
    }
  }, [buildingName]);

  const loadSample = async (entry: SampleEntry) => {
    setError(null);
    try {
      const res = await fetch(import.meta.env.BASE_URL + 'samples/' + entry.file);
      if (!res.ok) throw new Error('missing');
      const blob = await res.blob();
      await handleFile(new File([blob], entry.file, { type: blob.type }));
      setBuildingName(entry.buildingName);
      setBuildingType(entry.buildingType);
      setCredit(entry);
    } catch {
      setError('Could not load that sample. Try uploading your own image.');
    }
  };

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
    try {
      setBusyLabel('Scouting pixels…');
      const analysis = await analyzeThermalImage(image, palette);
      if (palette === 'auto') setPaletteDetected(PALETTE_LABEL[analysis.paletteUsed]);

      setBusyLabel('Saving inspection…');
      const building = await ensureBuilding(buildingName.trim(), buildingType);
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
        imageWidth: analysis.width,
        imageHeight: analysis.height,
      });

      setBusyLabel('Model reviewing image…');
      const analyzed = await analyzeInspection(
        inspection.id,
        JSON.stringify({
          regions: analysis.regions,
          gridText: analysis.gridText,
          gridW: analysis.gridW,
          gridH: analysis.gridH,
        }),
      );

      // Re-render the annotated copy from the final verdicts so report and slider match.
      const anomalies = analyzed.anomalies ?? [];
      const ordered = [...anomalies].sort((a, b) => a.anomalyIndex - b.anomalyIndex);
      if (ordered.length > 0) {
        const base = await loadImage(image.dataUrl);
        await updateAnnotatedImage(
          inspection.id,
          renderAnnotated(base, analysis.width, analysis.height, ordered),
        );
      }

      navigate(`/analysis/${inspection.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong during analysis.');
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
          {samples.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                Try a sample thermal image
              </span>
              {samples.map((s) => (
                <Button
                  key={s.file}
                  variant="outline"
                  size="sm"
                  className="h-auto max-w-full whitespace-normal py-1.5 text-left"
                  disabled={busy}
                  onClick={() => void loadSample(s)}
                >
                  {s.title}
                </Button>
              ))}
            </div>
          ) : null}
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
              {credit ? (
                <p className="text-[11px] text-[var(--c3-style-basic-fg-secondary)]">
                  Credit: {credit.credit}, {credit.license}.{' '}
                  <a href={credit.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                    Source
                  </a>
                </p>
              ) : null}
            </Card>
          )}
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
                Camera palette
              </label>
              <div className="flex items-center gap-3">
                <Combobox
                  id="palette"
                  value={palette}
                  onValueChange={(v) => v && setPalette(v as Palette)}
                  options={PALETTE_OPTIONS}
                />
                {palette === 'auto' && paletteDetected ? (
                  <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                    Palette detected: {paletteDetected}
                  </span>
                ) : null}
              </div>
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
