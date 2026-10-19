/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';

const FADE_MS = 200;

/**
 * Full-bleed overlay wrapper that fades its content out before unmounting, so a covering layer
 * (e.g. the provisioning spinner) dissolves into the revealed content instead of cutting hard.
 * Appearance is immediate (no fade-in) — only the exit animates, which is what a "splash going
 * away" wants. The last-shown children are frozen for the duration of the fade so late prop
 * changes (a reset step clock, a cleared title) can't flicker the layer while it's dissolving.
 * Instant under `prefers-reduced-motion`.
 */
const OverlayFade: React.FC<{ show: boolean; children: React.ReactNode }> = ({ show, children }) => {
  const [mounted, setMounted] = useState(show);
  const [visible, setVisible] = useState(show);
  // Latest children while shown; held steady through the exit so the fading layer stays frozen.
  const frozen = useRef<React.ReactNode>(children);
  if (show) frozen.current = children;

  useEffect(() => {
    if (show) {
      setMounted(true);
      setVisible(true);
      return undefined;
    }
    setVisible(false);
    const id = window.setTimeout(() => setMounted(false), FADE_MS);
    return () => window.clearTimeout(id);
  }, [show]);

  if (!mounted) return null;
  return (
    <div
      className={cn(
        'absolute inset-0 z-50 transition-opacity motion-reduce:transition-none',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      {show ? children : frozen.current}
    </div>
  );
};

export default OverlayFade;
