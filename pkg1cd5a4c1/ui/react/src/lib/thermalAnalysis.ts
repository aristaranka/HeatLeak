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

const MAX_STORE_DIM = 1100;
const MAX_REGIONS = 5;

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

interface Cell {
  score: number;
}

/**
 * Analyze a stored thermal image: detect candidate anomaly regions and render an
 * annotated copy with numbered bounding boxes.
 */
export async function analyzeThermalImage(image: LoadedImage): Promise<AnalysisResult> {
  const img = await loadImage(image.dataUrl);
  const width = image.width || img.width;
  const height = image.height || img.height;

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

  const cells: Cell[] = new Array(GW * GH);
  let sum = 0;
  for (let i = 0; i < GW * GH; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255; // 0..1
    const warmCool = (r - b + 255) / 510; // 0..1 (warm ↑)
    const score = 0.6 * lum + 0.4 * warmCool;
    cells[i] = { score };
    sum += score;
  }
  const mean = sum / (GW * GH);
  let variance = 0;
  for (let i = 0; i < cells.length; i++) {
    const d = cells[i].score - mean;
    variance += d * d;
  }
  const std = Math.sqrt(variance / cells.length) || 1e-6;

  const zAt = (gx: number, gy: number) => (cells[gy * GW + gx].score - mean) / std;

  const minCells = Math.max(4, Math.round(0.004 * GW * GH));

  // Try decreasing thresholds until we find at least one region (or give up).
  const thresholds = [1.25, 1.0, 0.8];
  let regions: DetectedRegion[] = [];
  for (const T of thresholds) {
    regions = findRegions(zAt, GW, GH, T, minCells);
    if (regions.length > 0) break;
  }

  // Render annotated image.
  const annotatedDataUrl = renderAnnotated(img, width, height, regions);

  return { regions, annotatedDataUrl, width, height };
}

function findRegions(
  zAt: (gx: number, gy: number) => number,
  GW: number,
  GH: number,
  T: number,
  minCells: number,
): DetectedRegion[] {
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
    .sort((a, b) => b.rank - a.rank)
    .slice(0, MAX_REGIONS)
    .map((s) => s.region);

  return scored;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function renderAnnotated(
  img: HTMLImageElement,
  width: number,
  height: number,
  regions: DetectedRegion[],
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
