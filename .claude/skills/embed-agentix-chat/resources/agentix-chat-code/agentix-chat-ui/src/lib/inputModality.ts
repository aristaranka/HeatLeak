/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// Tracks whether the user's most recent interaction was keyboard or pointer, so components
// can branch focus behavior on modality. Used by the menu/popover primitives to decide whether
// to restore the focus ring to the trigger on close: keyboard close → restore (a11y), pointer
// close → don't (avoids the focus-visible ring lingering on the trigger after a mouse click).
let keyboard = false;

if (typeof window !== 'undefined') {
  // Capture phase so we observe the modality before any handler runs.
  window.addEventListener(
    'keydown',
    () => {
      keyboard = true;
    },
    true
  );
  window.addEventListener(
    'pointerdown',
    () => {
      keyboard = false;
    },
    true
  );
}

export function lastInputWasKeyboard(): boolean {
  return keyboard;
}
