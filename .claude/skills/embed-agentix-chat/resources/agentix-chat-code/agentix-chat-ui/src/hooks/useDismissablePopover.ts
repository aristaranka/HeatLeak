/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useEffect, useRef, useState } from 'react';

export interface DismissablePopover {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Attach to the popover root — clicks outside it auto-close the popover. */
  wrapRef: React.RefObject<HTMLDivElement | null>;
  /** Attach to the trigger button — focus returns here on Escape. */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * Shared open/close behavior for dropdown pickers (AgentPicker, AppsPicker, …):
 * tracks open state and, while open, closes on an outside mousedown or Escape.
 * Escape also restores focus to the trigger. `onDismiss` fires on either
 * auto-close path (e.g. to clear a search box) but NOT on a programmatic
 * `setOpen(false)` — callers that close imperatively run their own cleanup.
 *
 * `onDismiss` is read through a ref so passing an inline closure doesn't
 * re-subscribe the listeners every render; the effect stays keyed on `open`
 * alone, matching the hand-rolled versions this replaces.
 */
export function useDismissablePopover(onDismiss?: () => void): DismissablePopover {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        onDismissRef.current?.();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Capture phase + stopPropagation so a popover open inside a modal swallows
        // Escape itself instead of letting it bubble to the modal's own Escape-to-close
        // listener (also on `document`) and dismiss the whole modal underneath it.
        e.stopPropagation();
        setOpen(false);
        onDismissRef.current?.();
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [open]);

  return { open, setOpen, wrapRef, triggerRef };
}
