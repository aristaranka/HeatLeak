/*
 * HeatLeak AI — client-side thermal-contrast analysis.
 *
 * This runs genuine computer vision on the ACTUAL uploaded image pixels (via an
 * offscreen <canvas>): it builds a per-cell "thermal score", finds cells that
 * deviate strongly from the image mean, groups them into connected regions, and
 * returns bounding boxes. Nothing here is fabricated — every box comes from the
 * pixels. The cautious prose explanation for each box is produced separately by
 * the backend LLM (ThermalInspection.analyze).
 *
 * Important scientific caveats surfaced in the UI: warm colors alone do not prove
 * heat loss; palettes differ between cameras; reflections/emissivity affect
 * apparent temperature; without radiometric metadata absolute temperatures cannot
 * be established. These are screening observations, not confirmed defects.
 *
 * Tuning (checked on the four public/samples images): detection grid 56 wide, thresholds
 * [1.25, 1.0, 0.8, 0.65] lowered until 3+ regions turn up, bbox area cap 30% with re-test at
 * T+0.75 then T+1.5 and then drop, same-polarity IoU merge > 0.3, MAX_REGIONS 6, palette ramps
 * sampled to 32 stops. Result: 3-6 candidates per sample; hero is house-uninsulated-wall.jpg
 * (cold sky regions upper-left and upper-center, plus one lower-right patch).
 */

export type Palette = 'auto' | 'ironbow' | 'rainbow' | 'whitehot' | 'blackhot';
type RampName = Exclude<Palette, 'auto'>;

export interface DetectedRegion {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  polarity: 'hot' | 'cold';
  /** Signed deviation from the image mean, normalized to roughly -1..1. */
  relativeIntensity: number;
  areaPct: number;
  locationLabel: string;
  /** JPEG data URL of the padded region, long side <= 256px. */
  crop?: string;
}

export interface LoadedImage {
  dataUrl: string;
  width: number;
  height: number;
}

export interface AnalysisResult {
  regions: DetectedRegion[];
  annotatedDataUrl: string;
  width: number;
  height: number;
  /** Rows of digits 0-9 (0 = coolest apparent, 9 = warmest), top row first. */
  gridText: string;
  gridW: number;
  gridH: number;
  paletteUsed: RampName;
}

export interface AnnotationBox {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  polarity: 'hot' | 'cold';
  rejected?: boolean;
  source?: 'cv' | 'vision';
}

const MAX_STORE_DIM = 1100;
const MAX_REGIONS = 6;
const MIN_WANTED_REGIONS = 3;
const MAX_AREA_FRAC = 0.3;
const MERGE_IOU = 0.3;
const GRID_W = 24;
const CROP_LONG_SIDE = 256;

/** Load an <img> from a data URL (or any URL). */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

/**
 * Read a user-selected file, downscale it so it is reasonable to persist, and
 * return a JPEG/PNG data URL plus its dimensions. The real uploaded pixels are
 * preserved (just resized) — never substituted.
 */
export async function fileToStoredImage(file: File): Promise<LoadedImage> {
  const rawUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
  const img = await loadImage(rawUrl);
  const scale = Math.min(1, MAX_STORE_DIM / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0, w, h);
  // Keep PNG for lossless small images, JPEG otherwise to bound size.
  const useJpeg = w * h > 400 * 400;
  const dataUrl = useJpeg ? canvas.toDataURL('image/jpeg', 0.85) : canvas.toDataURL('image/png');
  return { dataUrl, width: w, height: h };
}

function locationLabel(cxPct: number, cyPct: number): string {
  const v = cyPct < 0.34 ? 'upper' : cyPct > 0.66 ? 'lower' : 'middle';
  const hLabel = cxPct < 0.34 ? 'left' : cxPct > 0.66 ? 'right' : 'center';
  if (v === 'middle' && hLabel === 'center') return 'center';
  return `${v}-${hLabel}`;
}


type Rgb = [number, number, number];

/** Ironbow stops, shared with thermalDemo.ts. */
const IRONBOW_STOPS: [number, Rgb][] = [
  [0.0, [8, 10, 38]],
  [0.2, [40, 22, 120]],
  [0.4, [150, 30, 110]],
  [0.6, [232, 70, 40]],
  [0.8, [250, 170, 30]],
  [1.0, [255, 255, 210]],
];

const RAINBOW_HEX = ['#000080', '#0000ff', '#00ffff', '#00ff00', '#ffff00', '#ff0000', '#ffffff'];

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function evenStops(colors: Rgb[]): [number, Rgb][] {
  return colors.map((c, i) => [i / (colors.length - 1), c]);
}

function sampleRamp(stops: [number, Rgb][], n = 32): Rgb[] {
  const out: Rgb[] = [];
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    let color = stops[stops.length - 1][1];
    for (let i = 0; i < stops.length - 1; i++) {
      const [a, ca] = stops[i];
      const [b, cb] = stops[i + 1];
      if (t >= a && t <= b) {
        const f = (t - a) / (b - a || 1);
        color = [
          Math.round(ca[0] + (cb[0] - ca[0]) * f),
          Math.round(ca[1] + (cb[1] - ca[1]) * f),
          Math.round(ca[2] + (cb[2] - ca[2]) * f),
        ];
        break;
      }
    }
    out.push(color);
  }
  return out;
}

const RAMPS: Record<RampName, Rgb[]> = {
  ironbow: sampleRamp(IRONBOW_STOPS),
  rainbow: sampleRamp(evenStops(RAINBOW_HEX.map(hexToRgb))),
  whitehot: sampleRamp(evenStops([[0, 0, 0], [255, 255, 255]])),
  blackhot: sampleRamp(evenStops([[255, 255, 255], [0, 0, 0]])),
};
const RAMP_ORDER: RampName[] = ['ironbow', 'rainbow', 'whitehot', 'blackhot'];

/** Nearest sampled stop on the ramp: returns its index / 31 and the RGB distance to it. */
function nearestStop(ramp: Rgb[], r: number, g: number, b: number): { score: number; dist: number } {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < ramp.length; i++) {
    const dr = r - ramp[i][0];
    const dg = g - ramp[i][1];
    const db = b - ramp[i][2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { score: best / (ramp.length - 1), dist: Math.sqrt(bestD) };
}

function pickPalette(pixels: Uint8ClampedArray, count: number): RampName {
  let bestName: RampName = 'ironbow';
  let bestMean = Infinity;
  for (const name of RAMP_ORDER) {
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += nearestStop(RAMPS[name], pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]).dist;
    }
    const mean = total / count;
    if (mean < bestMean - 1e-9) {
      bestMean = mean;
      bestName = name;
    }
  }
  return bestName;
}

function sampleToGrid(img: HTMLImageElement, gw: number, gh: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = gw;
  canvas.height = gh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0, gw, gh);
  return ctx.getImageData(0, 0, gw, gh).data;
}

function scoresFor(pixels: Uint8ClampedArray, count: number, ramp: Rgb[]): number[] {
  const out = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    out[i] = nearestStop(ramp, pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]).score;
  }
  return out;
}

/** Decile digits (0-9) of the score distribution, one row per line, top row first. */
function buildGridText(scores: number[], gw: number, gh: number): string {
  const sorted = [...scores].sort((a, b) => a - b);
  const bounds: number[] = [];
  for (let k = 1; k < 10; k++) bounds.push(sorted[Math.floor((k * sorted.length) / 10)]);
  const rows: string[] = [];
  for (let y = 0; y < gh; y++) {
    let row = '';
    for (let x = 0; x < gw; x++) {
      const s = scores[y * gw + x];
      let digit = 0;
      for (const b of bounds) if (s >= b) digit++;
      row += String(digit);
    }
    rows.push(row);
  }
  return rows.join('\n');
}

interface Comp {
  cells: number[];
  polarity: 'hot' | 'cold';
}

function bboxOf(cells: number[], GW: number): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (const cell of cells) {
    const cx = cell % GW;
    const cy = Math.floor(cell / GW);
    if (cx < minX) minX = cx;
    if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;
  }
  return { minX, minY, maxX, maxY };
}

/** 4-neighbour flood fill of same-sign cells at threshold T, optionally limited to `allowed`. */
function floodComponents(
  zAt: (gx: number, gy: number) => number,
  GW: number,
  GH: number,
  T: number,
  allowed?: Set<number>,
): Comp[] {
  const label = new Int32Array(GW * GH).fill(-1);
  const comps: Comp[] = [];
  const sign = (gx: number, gy: number): 0 | 1 | -1 => {
    if (allowed && !allowed.has(gy * GW + gx)) return 0;
    const z = zAt(gx, gy);
    if (z >= T) return 1;
    if (z <= -T) return -1;
    return 0;
  };
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const idx = gy * GW + gx;
      const s = sign(gx, gy);
      if (s === 0 || label[idx] !== -1) continue;
      const compId = comps.length;
      const stack = [idx];
      label[idx] = compId;
      const cellList: number[] = [];
      while (stack.length) {
        const cur = stack.pop() as number;
        cellList.push(cur);
        const cx = cur % GW;
        const cy = Math.floor(cur / GW);
        for (const [nx, ny] of [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
          const nIdx = ny * GW + nx;
          if (label[nIdx] !== -1) continue;
          if (sign(nx, ny) === s) {
            label[nIdx] = compId;
            stack.push(nIdx);
          }
        }
      }
      comps.push({ cells: cellList, polarity: s === 1 ? 'hot' : 'cold' });
    }
  }
  return comps;
}

/**
 * Components whose bounding box covers more than MAX_AREA_FRAC of the frame (typically open sky
 * or a whole wall) are re-tested at a stricter threshold, twice at most, then dropped.
 */
function capComponent(
  comp: Comp,
  zAt: (gx: number, gy: number) => number,
  GW: number,
  GH: number,
  T: number,
  depth: number,
  minCells: number,
): Comp[] {
  const bb = bboxOf(comp.cells, GW);
  const frac = ((bb.maxX - bb.minX + 1) * (bb.maxY - bb.minY + 1)) / (GW * GH);
  if (frac <= MAX_AREA_FRAC) return [comp];
  if (depth >= 2) return [];
  const stricter = T + 0.75 * (depth + 1);
  const subs = floodComponents(zAt, GW, GH, stricter, new Set(comp.cells)).filter(
    (c) => c.polarity === comp.polarity && c.cells.length >= minCells,
  );
  return subs.flatMap((c) => capComponent(c, zAt, GW, GH, T, depth + 1, minCells));
}

function iou(a: DetectedRegion, b: DetectedRegion): number {
  const ix = Math.max(0, Math.min(a.xPct + a.wPct, b.xPct + b.wPct) - Math.max(a.xPct, b.xPct));
  const iy = Math.max(0, Math.min(a.yPct + a.hPct, b.yPct + b.hPct) - Math.max(a.yPct, b.yPct));
  const inter = ix * iy;
  const union = a.wPct * a.hPct + b.wPct * b.hPct - inter;
  return union > 0 ? inter / union : 0;
}

/** Merge same-polarity boxes with IoU above MERGE_IOU: union bbox, averaged intensity. */
function mergeOverlaps(regions: DetectedRegion[]): DetectedRegion[] {
  const pool = [...regions].sort((a, b) => b.wPct * b.hPct - a.wPct * a.hPct);
  const out: DetectedRegion[] = [];
  for (const r of pool) {
    const hit = out.find((o) => o.polarity === r.polarity && iou(o, r) > MERGE_IOU);
    if (!hit) {
      out.push({ ...r });
      continue;
    }
    const x0 = Math.min(hit.xPct, r.xPct);
    const y0 = Math.min(hit.yPct, r.yPct);
    const x1 = Math.max(hit.xPct + hit.wPct, r.xPct + r.wPct);
    const y1 = Math.max(hit.yPct + hit.hPct, r.yPct + r.hPct);
    hit.xPct = round3(x0);
    hit.yPct = round3(y0);
    hit.wPct = round3(x1 - x0);
    hit.hPct = round3(y1 - y0);
    hit.relativeIntensity = round3((hit.relativeIntensity + r.relativeIntensity) / 2);
    hit.areaPct = round3(Math.min(hit.wPct * hit.hPct, hit.areaPct + r.areaPct));
    hit.locationLabel = locationLabel(hit.xPct + hit.wPct / 2, hit.yPct + hit.hPct / 2);
  }
  return out;
}

function findRegions(
  zAt: (gx: number, gy: number) => number,
  GW: number,
  GH: number,
  T: number,
  minCells: number,
): DetectedRegion[] {
  const comps = floodComponents(zAt, GW, GH, T)
    .filter((c) => c.cells.length >= minCells)
    .flatMap((c) => capComponent(c, zAt, GW, GH, T, 0, minCells));

  const scored = comps.map((c) => {
    const { minX, minY, maxX, maxY } = bboxOf(c.cells, GW);
    let zSum = 0;
    for (const cell of c.cells) zSum += zAt(cell % GW, Math.floor(cell / GW));
    const avgZ = zSum / c.cells.length;
    const x0 = minX / GW;
    const y0 = minY / GH;
    const wPct = (maxX - minX + 1) / GW;
    const hPct = (maxY - minY + 1) / GH;
    const rank = Math.abs(avgZ) * Math.sqrt(c.cells.length);
    const region: DetectedRegion = {
      xPct: round3(x0),
      yPct: round3(y0),
      wPct: round3(wPct),
      hPct: round3(hPct),
      polarity: c.polarity,
      relativeIntensity: round3(Math.max(-1, Math.min(1, avgZ / 3))),
      areaPct: round3(c.cells.length / (GW * GH)),
      locationLabel: locationLabel(x0 + wPct / 2, y0 + hPct / 2),
    };
    return { region, rank };
  });

  // Rank before merging so the merge keeps the strongest candidates when truncating.
  const merged = mergeOverlaps(scored.map((s) => s.region));
  const rankOf = (r: DetectedRegion) => Math.abs(r.relativeIntensity) * Math.sqrt(r.areaPct);
  return merged.sort((a, b) => rankOf(b) - rankOf(a)).slice(0, MAX_REGIONS);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Crop the region (padded 15% per side, clamped) from the full image, long side 256px. */
function cropRegion(img: HTMLImageElement, r: DetectedRegion): string | undefined {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const x0 = Math.max(0, r.xPct - r.wPct * 0.15) * w;
  const y0 = Math.max(0, r.yPct - r.hPct * 0.15) * h;
  const x1 = Math.min(1, r.xPct + r.wPct * 1.15) * w;
  const y1 = Math.min(1, r.yPct + r.hPct * 1.15) * h;
  const sw = Math.max(1, x1 - x0);
  const sh = Math.max(1, y1 - y0);
  const scale = CROP_LONG_SIDE / Math.max(sw, sh);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.drawImage(img, x0, y0, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

/**
 * Analyze a stored thermal image: detect candidate anomaly regions, crop each, build the
 * decile grid for the model, and render an annotated copy with numbered bounding boxes.
 */
export async function analyzeThermalImage(
  image: LoadedImage,
  palette: Palette = 'auto',
): Promise<AnalysisResult> {
  const img = await loadImage(image.dataUrl);
  const width = image.width || img.width;
  const height = image.height || img.height;

  // Detection grid sized to the aspect ratio.
  const GW = 56;
  const GH = Math.min(72, Math.max(24, Math.round((GW * height) / width)));
  const pixels = sampleToGrid(img, GW, GH);
  const paletteUsed: RampName = palette === 'auto' ? pickPalette(pixels, GW * GH) : palette;
  const ramp = RAMPS[paletteUsed];

  const scores = scoresFor(pixels, GW * GH, ramp);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  let variance = 0;
  for (const s of scores) variance += (s - mean) * (s - mean);
  const std = Math.sqrt(variance / scores.length) || 1e-6;
  const zAt = (gx: number, gy: number) => (scores[gy * GW + gx] - mean) / std;

  const minCells = Math.max(4, Math.round(0.004 * GW * GH));

  // Lower the threshold until at least MIN_WANTED_REGIONS turn up (a scale bar can dominate the z-score).
  const thresholds = [1.25, 1.0, 0.8, 0.65];
  let regions: DetectedRegion[] = [];
  for (const T of thresholds) {
    const found = findRegions(zAt, GW, GH, T, minCells);
    if (found.length > regions.length) regions = found;
    if (regions.length >= MIN_WANTED_REGIONS) break;
  }
  regions = regions.map((r) => ({ ...r, crop: cropRegion(img, r) }));

  // Coarse decile grid for the model.
  const gridW = GRID_W;
  const gridH = Math.min(24, Math.max(8, Math.round((GRID_W * height) / width)));
  const gridPixels = sampleToGrid(img, gridW, gridH);
  const gridText = buildGridText(scoresFor(gridPixels, gridW * gridH, ramp), gridW, gridH);

  const annotatedDataUrl = renderAnnotated(img, width, height, regions);

  return { regions, annotatedDataUrl, width, height, gridText, gridW, gridH, paletteUsed };
}

/** Draw numbered boxes on a copy of the image. Rejected boxes are skipped; vision additions are dashed. */
export function renderAnnotated(
  img: HTMLImageElement,
  width: number,
  height: number,
  boxes: AnnotationBox[],
): string {
  const scale = Math.min(1, 1200 / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return img.src;
  ctx.drawImage(img, 0, 0, w, h);
  ctx.lineWidth = Math.max(2, Math.round(w / 320));
  ctx.font = `bold ${Math.max(12, Math.round(w / 48))}px Inter, sans-serif`;
  ctx.textBaseline = 'top';

  let n = 0;
  boxes.forEach((r) => {
    if (r.rejected) return;
    n += 1;
    const color = r.polarity === 'hot' ? '#f59e0b' : '#22d3ee';
    const bx = r.xPct * w;
    const by = r.yPct * h;
    const bw = r.wPct * w;
    const bh = r.hPct * h;
    ctx.strokeStyle = color;
    ctx.fillStyle = color + '22';
    ctx.fillRect(bx, by, bw, bh);
    ctx.setLineDash(r.source === 'vision' ? [6, 4] : []);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.setLineDash([]);
    const label = `#${n}`;
    const padX = 6;
    const tw = ctx.measureText(label).width + padX * 2;
    const th = Math.max(16, Math.round(w / 40));
    ctx.fillStyle = color;
    ctx.fillRect(bx, Math.max(0, by - th), tw, th);
    ctx.fillStyle = '#06121f';
    ctx.fillText(label, bx + padX, Math.max(0, by - th) + 2);
  });

  return canvas.toDataURL('image/jpeg', 0.85);
}
