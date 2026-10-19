import React, { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { RegionBox } from '@/lib/thermalAnalysis';

/** Minimal box shape the viewer needs — matches ThermalAnomaly / DetectedRegion. */
export interface ViewerBox {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  polarity: 'hot' | 'cold';
}

interface ThermalImageViewerProps {
  /** The real (un-annotated) uploaded/generated image, as a data URL. */
  originalImage: string;
  /** Optional pre-rendered annotated image (boxes burned in) for the compare view. */
  annotatedImage?: string;
  boxes: ViewerBox[];
  activeIndex: number | null;
  onActiveChange?: (index: number | null) => void;
  /** Show the before/after comparison slider tab. */
  enableCompare?: boolean;
  /** When true, dragging on the image draws a new region instead of selecting boxes. */
  drawMode?: boolean;
  /** A drawn-but-not-yet-saved region, shown dashed. */
  draftBox?: RegionBox | null;
  /** Called when the user finishes drawing a region in draw mode. */
  onDraw?: (box: RegionBox) => void;
  className?: string;
}

/** Ignore accidental clicks: a drawn box must cover at least this fraction per side. */
const MIN_DRAW_PCT = 0.015;

type Mode = 'interactive' | 'compare';

/**
 * Interactive thermal-image viewer.
 *
 * In "interactive" mode it renders the ACTUAL image with DOM bounding boxes laid
 * over it (positioned by percentage so they track any container size); hovering
 * or clicking a box selects the matching anomaly, and the externally-controlled
 * `activeIndex` highlights one. In "compare" mode a draggable slider wipes
 * between the original and the annotated render. Boxes come from real detected
 * regions — the viewer never invents them.
 */
export default function ThermalImageViewer({
  originalImage,
  annotatedImage,
  boxes,
  activeIndex,
  onActiveChange,
  enableCompare = true,
  drawMode = false,
  draftBox = null,
  onDraw,
  className,
}: ThermalImageViewerProps) {
  const [mode, setMode] = useState<Mode>('interactive');
  const drawRef = useRef<HTMLDivElement>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [dragBox, setDragBox] = useState<RegionBox | null>(null);
  const [slider, setSlider] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const canCompare = enableCompare && Boolean(annotatedImage);
  const view: Mode = drawMode ? 'interactive' : mode;

  const pointPct = (clientX: number, clientY: number) => {
    const rect = drawRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  };

  const boxFrom = (a: { x: number; y: number }, b: { x: number; y: number }): RegionBox => ({
    xPct: Math.min(a.x, b.x),
    yPct: Math.min(a.y, b.y),
    wPct: Math.abs(a.x - b.x),
    hPct: Math.abs(a.y - b.y),
  });

  const shownDraft = dragBox ?? draftBox;

  const updateSlider = useCallback((clientX: number) => {
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSlider(Math.max(0, Math.min(100, pct)));
  }, []);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {canCompare ? (
        <div className="flex items-center gap-1 self-start rounded-[var(--c3-style-border-radius-4)] border border-[var(--c3-style-basic-border-border)] p-0.5">
          <button
            type="button"
            onClick={() => setMode('interactive')}
            className={cn(
              'rounded-[var(--c3-style-border-radius-4)] px-3 py-1 text-c3-regular-label-l3',
              view === 'interactive'
                ? 'bg-[var(--c3-style-basic-bg-accent)] text-[var(--c3-style-basic-fg-accent)]'
                : 'text-[var(--c3-style-basic-fg-secondary)]',
            )}
          >
            Interactive
          </button>
          <button
            type="button"
            onClick={() => setMode('compare')}
            // Kept visible (disabled) while drawing so the image does not jump.
            disabled={drawMode}
            className={cn(
              'rounded-[var(--c3-style-border-radius-4)] px-3 py-1 text-c3-regular-label-l3 disabled:opacity-40',
              view === 'compare'
                ? 'bg-[var(--c3-style-basic-bg-accent)] text-[var(--c3-style-basic-fg-accent)]'
                : 'text-[var(--c3-style-basic-fg-secondary)]',
            )}
          >
            Before / after
          </button>
        </div>
      ) : null}

      {view === 'interactive' ? (
        <div className="relative w-full select-none overflow-hidden rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-border)] bg-black">
          <img src={originalImage} alt="Thermal inspection" className="block w-full" />
          <div className="absolute inset-0">
            {boxes.map((b, i) => {
              const active = activeIndex === i;
              return (
                <button
                  type="button"
                  key={i}
                  aria-label={`Anomaly ${i + 1}`}
                  onClick={() => onActiveChange?.(active ? null : i)}
                  onMouseEnter={() => onActiveChange?.(i)}
                  className={cn(
                    'hl-box',
                    b.polarity === 'hot' ? 'hl-box-hot' : 'hl-box-cold',
                    active && 'hl-box-active',
                  )}
                  style={{
                    left: `${b.xPct * 100}%`,
                    top: `${b.yPct * 100}%`,
                    width: `${b.wPct * 100}%`,
                    height: `${b.hPct * 100}%`,
                  }}
                >
                  <span className={cn('hl-box-label', b.polarity === 'hot' ? 'hl-box-label-hot' : 'hl-box-label-cold')}>
                    {i + 1}
                  </span>
                </button>
              );
            })}
          </div>
          {shownDraft ? (
            <div
              className="hl-box hl-box-draft pointer-events-none"
              style={{
                left: `${shownDraft.xPct * 100}%`,
                top: `${shownDraft.yPct * 100}%`,
                width: `${shownDraft.wPct * 100}%`,
                height: `${shownDraft.hPct * 100}%`,
              }}
            />
          ) : null}
          {drawMode ? (
            <div
              ref={drawRef}
              role="application"
              aria-label="Drag to draw a region for AI interpretation"
              className="absolute inset-0 cursor-crosshair touch-none"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const p = pointPct(e.clientX, e.clientY);
                drawStart.current = p;
                setDragBox({ xPct: p.x, yPct: p.y, wPct: 0, hPct: 0 });
              }}
              onPointerMove={(e) => {
                if (drawStart.current) setDragBox(boxFrom(drawStart.current, pointPct(e.clientX, e.clientY)));
              }}
              onPointerUp={(e) => {
                const start = drawStart.current;
                drawStart.current = null;
                setDragBox(null);
                if (!start) return;
                const box = boxFrom(start, pointPct(e.clientX, e.clientY));
                if (box.wPct >= MIN_DRAW_PCT && box.hPct >= MIN_DRAW_PCT) onDraw?.(box);
              }}
            />
          ) : null}
        </div>
      ) : (
        <div
          ref={frameRef}
          className="relative w-full cursor-ew-resize select-none overflow-hidden rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-border)] bg-black"
          onMouseDown={(e) => {
            dragging.current = true;
            updateSlider(e.clientX);
          }}
          onMouseMove={(e) => {
            if (dragging.current) updateSlider(e.clientX);
          }}
          onMouseUp={() => {
            dragging.current = false;
          }}
          onMouseLeave={() => {
            dragging.current = false;
          }}
        >
          <img src={originalImage} alt="Original thermal view" className="block w-full" />
          <div className="absolute inset-0 overflow-hidden" style={{ width: `${slider}%` }}>
            <img
              src={annotatedImage}
              alt="Annotated thermal view"
              className="block h-full max-w-none"
              style={{ width: frameRef.current ? `${frameRef.current.clientWidth}px` : '100%' }}
            />
          </div>
          <div className="pointer-events-none absolute inset-y-0" style={{ left: `${slider}%` }}>
            <div className="h-full w-0.5 -translate-x-1/2 bg-[var(--hl-cyan)]" />
            <div className="absolute top-1/2 left-0 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--hl-cyan)] text-[10px] font-bold text-[#06121f]">
              ↔
            </div>
          </div>
          <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[11px] text-white">Annotated</span>
          <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[11px] text-white">Original</span>
        </div>
      )}

      {/* Thermal scale legend */}
      <div className="flex items-center gap-2">
        <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">Cooler</span>
        <div className="hl-thermal-bar h-2 flex-1 rounded-full" aria-hidden />
        <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">Warmer (apparent)</span>
      </div>
    </div>
  );
}
