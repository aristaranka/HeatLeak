/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useEffect, useLayoutEffect, useState } from 'react';

interface PortalMoveOptions {
  zIndex?: number;
  clipToAncestors?: boolean;
}

/** Share the stable iframe mount lifecycle between resource and server apps. */
export function useAppPortal(target: HTMLElement | null, zIndex: number, clipToAncestors = true) {
  const [node] = useState(() => {
    const element = document.createElement('div');
    element.className = 'flex min-h-0 min-w-0 flex-1 flex-col';
    return element;
  });
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => {
    if (!target) return;
    const cleanup = movePortalNode(target, node, { zIndex, clipToAncestors });
    setMounted(true);
    return cleanup;
  }, [clipToAncestors, node, target, zIndex]);
  // React cleans up layout effects when a Suspense boundary temporarily hides translated UI.
  // Remove the portal only on a real unmount so a language bundle load cannot reload its iframe.
  useEffect(() => () => node.remove(), [node]);
  // Loading a detached iframe can race its postMessage relay's initialization.
  return mounted ? node : null;
}

/** Keep one live iframe container under `body` and align it with the active transcript or panel anchor. */
export function movePortalNode(
  target: HTMLElement,
  node: HTMLElement,
  { zIndex = 1, clipToAncestors = true }: PortalMoveOptions = {}
) {
  const ownerWindow = target.ownerDocument.defaultView;
  const body = target.ownerDocument.body;
  if (!ownerWindow || !body) return () => {};
  if (node.parentElement !== body) body.appendChild(node);

  let frame = 0;
  const sync = () => {
    frame = 0;
    if (!target.isConnected) {
      node.style.visibility = 'hidden';
      return;
    }
    const rect = target.getBoundingClientRect();
    const visible = { left: 0, top: 0, right: ownerWindow.innerWidth, bottom: ownerWindow.innerHeight };
    if (clipToAncestors) {
      for (let ancestor = target.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = ownerWindow.getComputedStyle(ancestor);
        const clipsX = /(auto|clip|hidden|scroll)/.test(`${style.overflow} ${style.overflowX}`);
        const clipsY = /(auto|clip|hidden|scroll)/.test(`${style.overflow} ${style.overflowY}`);
        if (!clipsX && !clipsY) continue;
        const bounds = ancestor.getBoundingClientRect();
        if (clipsX) {
          visible.left = Math.max(visible.left, bounds.left);
          visible.right = Math.min(visible.right, bounds.right);
        }
        if (clipsY) {
          visible.top = Math.max(visible.top, bounds.top);
          visible.bottom = Math.min(visible.bottom, bounds.bottom);
        }
      }
    }
    Object.assign(node.style, {
      visibility: 'visible',
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      zIndex: String(zIndex),
      overflow: 'hidden',
      clipPath: clipToAncestors
        ? `inset(${Math.max(0, visible.top - rect.top)}px ${Math.max(0, rect.right - visible.right)}px ${Math.max(
            0,
            rect.bottom - visible.bottom
          )}px ${Math.max(0, visible.left - rect.left)}px)`
        : 'none',
    });
  };
  const scheduleSync = () => {
    if (!frame) frame = ownerWindow.requestAnimationFrame(sync);
  };
  sync();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleSync);
  observer?.observe(target);
  ownerWindow.addEventListener('resize', scheduleSync);
  ownerWindow.addEventListener('scroll', scheduleSync, true);

  return () => {
    node.style.visibility = 'hidden';
    observer?.disconnect();
    ownerWindow.removeEventListener('resize', scheduleSync);
    ownerWindow.removeEventListener('scroll', scheduleSync, true);
    if (frame) ownerWindow.cancelAnimationFrame(frame);
  };
}
