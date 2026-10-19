/*
 * HeatLeak AI — demonstration scenario generator.
 *
 * Generates three SYNTHETIC thermal images entirely in-browser, then runs the
 * SAME real analysis pipeline on them that user uploads go through. Nothing is
 * faked: the boxes come from the synthetic pixels and the explanations from the
 * backend LLM. Every resulting inspection is flagged isDemo so the UI can label
 * it clearly as fictional demonstration data.
 */
import { analyzeThermalImage, LoadedImage } from './thermalAnalysis';
import {
  analyzeInspection,
  BuildingType,
  createInspection,
  ensureBuilding,
  ThermalInspection,
} from './heatleak';

type Field = (x: number, y: number) => number; // returns 0..1 scalar

interface DemoScenario {
  id: string;
  name: string;
  buildingName: string;
  buildingType: BuildingType;
  notes: string;
  indoorTempC: number;
  outdoorTempC: number;
  field: Field;
}

/** Pseudo-noise, deterministic so demo images are stable across runs. */
function noise(x: number, y: number): number {
  const v = Math.sin(x * 91.17 + y * 47.53) * 43758.5453;
  return v - Math.floor(v); // 0..1
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

const SCENARIOS: DemoScenario[] = [
  {
    id: 'demo_insp_window',
    name: 'Demo · Possible window-frame thermal anomaly',
    buildingName: 'Sample — Maple Street Residence',
    buildingType: 'Residential',
    notes: 'Synthetic demonstration image — exterior view of a window on a cold day.',
    indoorTempC: 21,
    outdoorTempC: -2,
    field: (x, y) => {
      // Warm wall background with a window; cold air-leak band on the lower frame.
      let v = 0.5 + 0.05 * Math.sin(x * 6) + 0.04 * (noise(x, y) - 0.5);
      const inWindow = x > 0.32 && x < 0.68 && y > 0.25 && y < 0.72;
      if (inWindow) v = 0.42; // glass a touch cooler
      // cold leak along bottom + left frame of the window
      const bottomFrame = x > 0.3 && x < 0.7 && y > 0.66 && y < 0.76;
      const leftFrame = x > 0.3 && x < 0.37 && y > 0.25 && y < 0.74;
      if (bottomFrame || leftFrame) v = 0.14;
      return clamp01(v);
    },
  },
  {
    id: 'demo_insp_bridging',
    name: 'Demo · Possible wall thermal bridging',
    buildingName: 'Sample — Downtown Office Block',
    buildingType: 'Commercial',
    notes: 'Synthetic demonstration image — interior wall with a suspected structural member.',
    indoorTempC: 22,
    outdoorTempC: 4,
    field: (x, y) => {
      // Cool interior wall with a warm vertical streak (possible thermal bridge).
      let v = 0.4 + 0.03 * Math.cos(y * 5) + 0.04 * (noise(x * 2, y) - 0.5);
      const streak = Math.abs(x - 0.6) < 0.05;
      if (streak) v = 0.82;
      const streak2 = Math.abs(x - 0.6) < 0.09;
      if (streak2 && !streak) v = 0.6;
      return clamp01(v);
    },
  },
  {
    id: 'demo_insp_ambiguous',
    name: 'Demo · Ambiguous temperature pattern',
    buildingName: 'Sample — Community Library',
    buildingType: 'Institutional',
    notes: 'Synthetic demonstration image — low-contrast scene requiring further investigation.',
    indoorTempC: 20,
    outdoorTempC: 12,
    field: (x, y) => {
      // Low-contrast field with a mild warm blob and a mild cool blob.
      let v = 0.48 + 0.05 * (noise(x * 3, y * 3) - 0.5);
      const warm = Math.hypot(x - 0.3, y - 0.4) < 0.12;
      const cool = Math.hypot(x - 0.72, y - 0.65) < 0.1;
      if (warm) v += 0.22;
      if (cool) v -= 0.2;
      return clamp01(v);
    },
  },
];

/** Ironbow-style thermal colormap: scalar 0..1 → [r,g,b]. */
function thermalColor(v: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0.0, [8, 10, 38]],
    [0.2, [40, 22, 120]],
    [0.4, [150, 30, 110]],
    [0.6, [232, 70, 40]],
    [0.8, [250, 170, 30]],
    [1.0, [255, 255, 210]],
  ];
  const t = clamp01(v);
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (t >= a && t <= b) {
      const f = (t - a) / (b - a || 1);
      return [
        Math.round(ca[0] + (cb[0] - ca[0]) * f),
        Math.round(ca[1] + (cb[1] - ca[1]) * f),
        Math.round(ca[2] + (cb[2] - ca[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

function renderField(field: Field, W = 480, H = 360): LoadedImage {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const imgData = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = field(x / W, y / H);
      const [r, g, b] = thermalColor(v);
      const idx = (y * W + x) * 4;
      imgData.data[idx] = r;
      imgData.data[idx + 1] = g;
      imgData.data[idx + 2] = b;
      imgData.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), width: W, height: H };
}

export interface DemoProgress {
  index: number;
  total: number;
  label: string;
}

/**
 * Generate, analyze, and persist the three demonstration inspections. Idempotent
 * (stable ids). Returns the created inspections.
 */
export async function loadDemoData(onProgress?: (p: DemoProgress) => void): Promise<ThermalInspection[]> {
  const results: ThermalInspection[] = [];
  for (let i = 0; i < SCENARIOS.length; i++) {
    const s = SCENARIOS[i];
    onProgress?.({ index: i, total: SCENARIOS.length, label: s.name });
    const image = renderField(s.field);
    const analysis = await analyzeThermalImage(image);
    const building = await ensureBuilding(s.buildingName, s.buildingType);
    await createInspection({
      id: s.id,
      name: s.name,
      buildingId: building.id,
      buildingName: s.buildingName,
      buildingType: s.buildingType,
      notes: s.notes,
      indoorTempC: s.indoorTempC,
      outdoorTempC: s.outdoorTempC,
      originalImage: image.dataUrl,
      annotatedImage: analysis.annotatedDataUrl,
      imageWidth: analysis.width,
      imageHeight: analysis.height,
      isDemo: true,
    });
    const analyzed = await analyzeInspection(s.id, JSON.stringify(analysis.regions));
    results.push(analyzed);
  }
  return results;
}
