/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// Tab-level "needs you" badge — the no-permission layer of the session-waiting
// notification stack. Reflects how many background chats are awaiting input by:
//   1. Prefixing document.title with a "(N) " count (always works, no permission).
//   2. Overlaying a dot on the favicon (best-effort — needs <canvas>; silently
//      skipped where unavailable, e.g. jsdom, so the title prefix is the reliable
//      floor).
// Level-triggered: call applyTabBadge(count) on every state change; it fully
// derives the title/favicon from `count`, so repeated calls are idempotent.

// Matches the "(N) " prefix this module adds, so we can strip our own prefix
// before re-deriving — never a caller's or the router's title text.
const BADGE_PREFIX = /^\(\d+\)\s/;

// The favicon href before we ever badged it, captured once so clear() restores
// exactly what shipped (a data: URL in index.html) rather than guessing.
let originalFaviconHref: string | null = null;
let faviconCaptured = false;

function iconLink(): HTMLLinkElement | null {
  if (typeof document === 'undefined') return null;
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  if (!faviconCaptured) {
    originalFaviconHref = link.getAttribute('href');
    faviconCaptured = true;
  }
  return link;
}

// Composite a red dot onto the current favicon and swap it in. Async (Image
// decode) + guarded: any missing capability (no canvas 2d ctx, decode failure)
// leaves the favicon untouched — the title prefix already carries the signal.
function paintFaviconDot(): void {
  const link = iconLink();
  if (!link || originalFaviconHref == null) return;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null;
  try {
    canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    ctx = canvas.getContext('2d');
  } catch {
    return;
  }
  if (!ctx) return;
  const draw = ctx;
  const img = new Image();
  img.onload = () => {
    try {
      draw.clearRect(0, 0, 32, 32);
      draw.drawImage(img, 0, 0, 32, 32);
      const r = 9;
      const cx = 32 - r - 1;
      const cy = r + 1;
      draw.beginPath();
      draw.arc(cx, cy, r, 0, Math.PI * 2);
      draw.fillStyle = '#ef4444'; // red-500 — the "needs attention" accent
      draw.fill();
      draw.lineWidth = 2;
      draw.strokeStyle = '#ffffff'; // ring for contrast on dark tab bars
      draw.stroke();
      link.setAttribute('href', canvas.toDataURL('image/png'));
    } catch {
      /* best-effort — keep the original favicon */
    }
  };
  img.onerror = () => {
    /* can't decode source icon → leave it; title prefix still conveys state */
  };
  img.src = originalFaviconHref;
}

function restoreFavicon(): void {
  const link = typeof document !== 'undefined' ? document.querySelector<HTMLLinkElement>('link[rel~="icon"]') : null;
  if (link && originalFaviconHref != null) link.setAttribute('href', originalFaviconHref);
}

/** Reflect `count` background chats awaiting input in the tab title + favicon.
 *  count <= 0 clears the badge. Idempotent — safe to call every render/poll. */
export function applyTabBadge(count: number): void {
  if (typeof document === 'undefined') return;
  const base = document.title.replace(BADGE_PREFIX, '');
  if (count > 0) {
    document.title = `(${count}) ${base}`;
    paintFaviconDot();
  } else {
    document.title = base;
    restoreFavicon();
  }
}

/** Remove any badge and restore the original title/favicon (call on unmount). */
export function clearTabBadge(): void {
  applyTabBadge(0);
}

/** Test-only: forget the captured favicon so each test starts clean. */
export function _resetTabBadgeForTest(): void {
  originalFaviconHref = null;
  faviconCaptured = false;
}
