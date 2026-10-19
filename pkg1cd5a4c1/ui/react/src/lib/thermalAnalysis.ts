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
 */

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
}

/**
 * How the camera mapped temperature to color. Different cameras and export
 * settings use different palettes, so "warm-looking" is palette-dependent.
 */
export type ThermalPalette = 'auto' | 'iron' | 'rainbow' | 'white-hot' | 'black-hot';

export const THERMAL_PALETTES: { value: ThermalPalette; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto (brightness + warm hues)', hint: 'Works for most iron/amber exports.' },
  { value: 'iron', label: 'Iron / Ironbow', hint: 'Black → purple → red → yellow → white.' },
  { value: 'rainbow', label: 'Rainbow', hint: 'Blue (cold) → green → yellow → red/magenta (hot).' },
  { value: 'white-hot', label: 'Grayscale — white hot', hint: 'Brighter is warmer.' },
  { value: 'black-hot', label: 'Grayscale — black hot', hint: 'Darker is warmer.' },
];

/** Map one pixel to an apparent-warmth score in 0..1 for the given palette. */
function warmthScore(r: number, g: number, b: number, palette: ThermalPalette): number {
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255; // 0..1
  switch (palette) {
    case 'white-hot':
      return lum;
    case 'black-hot':
      return 1 - lum;
    case 'rainbow': {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      // Near-gray pixels (white/black ends of some rainbow scales) fall back to brightness.
      if (sat < 0.2) return lum;
      let hue: number;
      const d = max - min;
      if (max === r) hue = ((g - b) / d) % 6;
      else if (max === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue = (hue * 60 + 360) % 360;
      // Magenta/pink sits past red at the hot end of most rainbow scales.
      if (hue > 270) return 1;
      return Math.max(0, Math.min(1, (240 - hue) / 240));
    }
    case 'iron':
    case 'auto':
    default: {
      const warmCool = (r - b + 255) / 510; // 0..1 (warm ↑)
      return 0.6 * lum + 0.4 * warmCool;
    }
  }
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
}

const MAX_STORE_DIM = 960;
const MAX_REGIONS = 5;
/** Neighborhood radius for local contrast, as a fraction (1/n) of the grid width. */
const LOCAL_RADIUS_DIVISOR = 7;
/** Regions larger than this share of the frame are a whole surface, not a localized anomaly. */
const MAX_REGION_AREA = 0.2;
/** Minimum contrast (in image std units) against a side for it to count as "enclosing". */
const MIN_SIDE_CONTRAST = 0.35;

/** Load an <img> from a data URL (or any URL). */
function loadImage(src: string): Promise<HTMLImageElement> {
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
  // Always JPEG: thermal exports are photographic, and a PNG re-encode can be ~5x
  // larger, which bloats the record the backend has to store.
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { dataUrl, width: w, height: h };
}

function locationLabel(cxPct: number, cyPct: number): string {
  const v = cyPct < 0.34 ? 'upper' : cyPct > 0.66 ? 'lower' : 'middle';
  const hLabel = cxPct < 0.34 ? 'left' : cxPct > 0.66 ? 'right' : 'center';
  if (v === 'middle' && hLabel === 'center') return 'center';
  return `${v}-${hLabel}`;
}

interface ThermalGrid {
  GW: number;
  GH: number;
  /** Raw apparent-warmth score of a grid cell (0..1). */
  scoreAt: (gx: number, gy: number) => number;
  /** Whole-image standard deviation of the score, used to normalize contrasts. */
  std: number;
  /**
   * Local contrast of a cell: its score minus the mean of its neighborhood,
   * normalized by the image std. Unlike a whole-image z-score, large uniform
   * areas (sky, ground, an ice rink) stay near zero, so localized features such
   * as leaky windows or thermal bridges stand out.
   */
  localZAt: (gx: number, gy: number) => number;
}

/** Downsample the image to a grid and score each cell's apparent warmth. */
function sampleThermalGrid(
  img: HTMLImageElement,
  width: number,
  height: number,
  palette: ThermalPalette,
): ThermalGrid {
  // Grid sized to the aspect ratio.
  const GW = 56;
  const GH = Math.min(72, Math.max(24, Math.round((GW * height) / width)));

  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = GW;
  sampleCanvas.height = GH;
  const sctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  if (!sctx) throw new Error('Canvas unavailable');
  sctx.drawImage(img, 0, 0, GW, GH);
  const { data } = sctx.getImageData(0, 0, GW, GH);

  const scores = new Float64Array(GW * GH);
  let sum = 0;
  for (let i = 0; i < GW * GH; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const score = warmthScore(r, g, b, palette);
    scores[i] = score;
    sum += score;
  }
  const mean = sum / (GW * GH);
  let variance = 0;
  for (let i = 0; i < scores.length; i++) {
    const d = scores[i] - mean;
    variance += d * d;
  }
  const std = Math.sqrt(variance / scores.length) || 1e-6;

  // Summed-area table for O(1) neighborhood means.
  const sat = new Float64Array((GW + 1) * (GH + 1));
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      sat[(y + 1) * (GW + 1) + (x + 1)] =
        scores[y * GW + x] + sat[y * (GW + 1) + (x + 1)] + sat[(y + 1) * (GW + 1) + x] - sat[y * (GW + 1) + x];
    }
  }
  const R = Math.max(3, Math.round(GW / LOCAL_RADIUS_DIVISOR));
  const localMean = (gx: number, gy: number) => {
    const x0 = Math.max(0, gx - R);
    const y0 = Math.max(0, gy - R);
    const x1 = Math.min(GW, gx + R + 1);
    const y1 = Math.min(GH, gy + R + 1);
    const total =
      sat[y1 * (GW + 1) + x1] - sat[y0 * (GW + 1) + x1] - sat[y1 * (GW + 1) + x0] + sat[y0 * (GW + 1) + x0];
    return total / ((x1 - x0) * (y1 - y0));
  };

  const scoreAt = (gx: number, gy: number) => scores[gy * GW + gx];
  return { GW, GH, scoreAt, std, localZAt: (gx, gy) => (scoreAt(gx, gy) - localMean(gx, gy)) / std };
}

/**
 * Analyze a stored thermal image: detect candidate anomaly regions and render an
 * annotated copy with numbered bounding boxes.
 */
export async function analyzeThermalImage(
  image: LoadedImage,
  palette: ThermalPalette = 'auto',
): Promise<AnalysisResult> {
  const img = await loadImage(image.dataUrl);
  const width = image.width || img.width;
  const height = image.height || img.height;

  const grid = sampleThermalGrid(img, width, height, palette);
  const { GW, GH } = grid;

  const minCells = Math.max(4, Math.round(0.004 * GW * GH));

  // Try decreasing thresholds until we find at least one region (or give up).
  const thresholds = [1.25, 1.0, 0.8];
  let regions: DetectedRegion[] = [];
  for (const T of thresholds) {
    regions = findRegions(grid, T, minCells);
    if (regions.length > 0) break;
  }

  // Render annotated image.
  const annotatedDataUrl = renderAnnotated(img, width, height, regions);

  return { regions, annotatedDataUrl, width, height };
}

function findRegions(grid: ThermalGrid, T: number, minCells: number): DetectedRegion[] {
  const { GW, GH, localZAt: zAt } = grid;
  const label = new Int32Array(GW * GH).fill(-1);
  const comps: { cells: number[]; polarity: 'hot' | 'cold' }[] = [];

  const sign = (gx: number, gy: number): 0 | 1 | -1 => {
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
      // BFS flood fill of same-sign neighbors.
      const compId = comps.length;
      const stack = [idx];
      label[idx] = compId;
      const cellList: number[] = [];
      while (stack.length) {
        const cur = stack.pop() as number;
        cellList.push(cur);
        const cx = cur % GW;
        const cy = Math.floor(cur / GW);
        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (const [nx, ny] of neighbors) {
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

  const scored = comps
    .filter((c) => c.cells.length >= minCells)
    .map((c) => {
      let minX = GW;
      let minY = GH;
      let maxX = 0;
      let maxY = 0;
      let zSum = 0;
      for (const cell of c.cells) {
        const cx = cell % GW;
        const cy = Math.floor(cell / GW);
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);
        zSum += zAt(cx, cy);
      }
      const avgZ = zSum / c.cells.length;
      const areaPct = c.cells.length / (GW * GH);
      const x0 = minX / GW;
      const y0 = minY / GH;
      const wPct = (maxX - minX + 1) / GW;
      const hPct = (maxY - minY + 1) / GH;
      const cxPct = x0 + wPct / 2;
      const cyPct = y0 + hPct / 2;
      if (isLikelyOverlay(x0, wPct, hPct, areaPct)) return null;
      if (!isEnclosedContrast(grid, c.cells, c.polarity, minX, minY, maxX, maxY)) return null;
      const rank = Math.abs(avgZ) * Math.sqrt(c.cells.length);
      const region: DetectedRegion = {
        xPct: round3(x0),
        yPct: round3(y0),
        wPct: round3(wPct),
        hPct: round3(hPct),
        polarity: c.polarity,
        relativeIntensity: round3(Math.max(-1, Math.min(1, avgZ / 3))),
        areaPct: round3(areaPct),
        locationLabel: locationLabel(cxPct, cyPct),
      };
      return { region, rank };
    })
    .filter((s): s is { region: DetectedRegion; rank: number } => s !== null)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, MAX_REGIONS)
    .map((s) => s.region);

  return scored;
}

/** A bounding box as fractions (0..1) of the image. */
export interface RegionBox {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

/**
 * Measure an inspector-drawn box against the actual image pixels: its average
 * thermal score compared with a ring of surrounding pixels gives polarity and
 * relative intensity. A box with little contrast comes back with a near-zero
 * intensity rather than an invented one.
 */
export async function measureRegion(
  image: LoadedImage,
  box: RegionBox,
  palette: ThermalPalette = 'auto',
): Promise<DetectedRegion> {
  const img = await loadImage(image.dataUrl);
  const { GW, GH, scoreAt, std } = sampleThermalGrid(
    img,
    image.width || img.width,
    image.height || img.height,
    palette,
  );
  const x0 = Math.max(0, Math.min(GW - 1, Math.floor(box.xPct * GW)));
  const y0 = Math.max(0, Math.min(GH - 1, Math.floor(box.yPct * GH)));
  const x1 = Math.max(x0, Math.min(GW - 1, Math.ceil((box.xPct + box.wPct) * GW) - 1));
  const y1 = Math.max(y0, Math.min(GH - 1, Math.ceil((box.yPct + box.hPct) * GH) - 1));
  // Compare the box with a surrounding ring half its size on each side.
  const padX = Math.max(1, Math.round((x1 - x0 + 1) / 2));
  const padY = Math.max(1, Math.round((y1 - y0 + 1) / 2));
  let inSum = 0;
  let inN = 0;
  let ringSum = 0;
  let ringN = 0;
  for (let gy = Math.max(0, y0 - padY); gy <= Math.min(GH - 1, y1 + padY); gy++) {
    for (let gx = Math.max(0, x0 - padX); gx <= Math.min(GW - 1, x1 + padX); gx++) {
      if (gx >= x0 && gx <= x1 && gy >= y0 && gy <= y1) {
        inSum += scoreAt(gx, gy);
        inN++;
      } else {
        ringSum += scoreAt(gx, gy);
        ringN++;
      }
    }
  }
  // A box covering the whole frame has no ring; it then has no relative contrast.
  const avgZ = inN && ringN ? (inSum / inN - ringSum / ringN) / std : 0;
  return {
    xPct: round3(box.xPct),
    yPct: round3(box.yPct),
    wPct: round3(box.wPct),
    hPct: round3(box.hPct),
    polarity: avgZ >= 0 ? 'hot' : 'cold',
    relativeIntensity: round3(Math.max(-1, Math.min(1, avgZ / 3))),
    areaPct: round3(box.wPct * box.hPct),
    locationLabel: locationLabel(box.xPct + box.wPct / 2, box.yPct + box.hPct / 2),
  };
}

/**
 * Re-draw the annotated copy of a stored image from its current findings, so the
 * report's annotated image stays in sync after regions are added or removed.
 */
export async function renderAnnotatedImage(
  image: LoadedImage,
  regions: (RegionBox & { polarity: 'hot' | 'cold' })[],
): Promise<string> {
  const img = await loadImage(image.dataUrl);
  return renderAnnotated(img, image.width || img.width, image.height || img.height, regions);
}

/**
 * Reject regions that are almost certainly not building features: a camera's
 * temperature scale bar (narrow, tall, hugging the left/right edge) or a region so
 * large it is the whole surface/background rather than a localized anomaly.
 */
function isLikelyOverlay(x0: number, wPct: number, hPct: number, areaPct: number): boolean {
  const atSideEdge = x0 <= 0.02 || x0 + wPct >= 0.98;
  if (atSideEdge && wPct <= 0.12 && hPct >= 0.4) return true;
  if (areaPct > MAX_REGION_AREA) return true;
  return false;
}

/**
 * A genuine localized anomaly differs from its surroundings on most sides. A
 * region that only differs on one side is a step edge — e.g. a roofline against
 * the sky — which local contrast also picks up, so it is rejected. Sides that fall
 * outside the frame are not counted.
 */
function isEnclosedContrast(
  grid: ThermalGrid,
  cells: number[],
  polarity: 'hot' | 'cold',
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  const { GW, GH, scoreAt, std } = grid;
  let inside = 0;
  for (const cell of cells) inside += scoreAt(cell % GW, Math.floor(cell / GW));
  inside /= cells.length;

  const pad = Math.max(2, Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) / 2));
  const stripMean = (x0: number, y0: number, x1: number, y1: number): number | null => {
    const ax = Math.max(0, x0);
    const ay = Math.max(0, y0);
    const bx = Math.min(GW - 1, x1);
    const by = Math.min(GH - 1, y1);
    if (ax > bx || ay > by) return null;
    let sum = 0;
    let n = 0;
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
      sum += scoreAt(x, y);
      n++;
    }
    return sum / n;
  };
  const above = stripMean(minX, minY - pad, maxX, minY - 1);
  const below = stripMean(minX, maxY + 1, maxX, maxY + pad);
  const left = stripMean(minX - pad, minY, minX - 1, maxY);
  const right = stripMean(maxX + 1, minY, maxX + pad, maxY);

  const dir = polarity === 'hot' ? 1 : -1;
  const contrasts = (m: number | null) => m !== null && (inside - m) * dir >= MIN_SIDE_CONTRAST * std;
  const sides = [above, below, left, right].filter((v) => v !== null);
  const contrasting = [above, below, left, right].filter(contrasts).length;

  // Elongated regions (roof/floor lines, frames) must stand out on BOTH long sides,
  // otherwise they are just the boundary between two surfaces.
  const wc = maxX - minX + 1;
  const hc = maxY - minY + 1;
  if (wc >= 3 * hc && !(contrasts(above) && contrasts(below))) return false;
  if (hc >= 3 * wc && !(contrasts(left) && contrasts(right))) return false;

  // A region cut off by the frame edge must contrast on every side we can see.
  const touchesEdge = sides.length < 4;
  if (touchesEdge) return sides.length >= 2 && contrasting === sides.length;
  return contrasting >= 3;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function renderAnnotated(
  img: HTMLImageElement,
  width: number,
  height: number,
  regions: (RegionBox & { polarity: 'hot' | 'cold' })[],
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

  regions.forEach((r, i) => {
    const color = r.polarity === 'hot' ? '#f59e0b' : '#22d3ee';
    const bx = r.xPct * w;
    const by = r.yPct * h;
    const bw = r.wPct * w;
    const bh = r.hPct * h;
    ctx.strokeStyle = color;
    ctx.fillStyle = color + '22';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);
    // label chip
    const label = `#${i + 1}`;
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
