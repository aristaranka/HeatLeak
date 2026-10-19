/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useEffect, useState } from 'react';
import type { ChatMessage } from './types';

/**
 * Wall-clock start (ms) of the in-flight turn, derived from the last user TEXT
 * message's timestamp in a hydrated transcript. Used when reattaching to a live
 * stream on session switch / reload so "Thinking for …" reflects real elapsed
 * time instead of restarting from the reconnect moment. Returns null when no
 * usable timestamp is present, so callers fall back to "now".
 */
export function deriveActiveTurnStartMs(messages: ChatMessage[]): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'USER' && m.kind === 'TEXT' && m.timestamp) {
      const ms = Date.parse(m.timestamp);
      return Number.isNaN(ms) ? null : ms;
    }
  }
  return null;
}

/** Compact duration for "Thinking for …" labels */
export function formatThinkingDurationSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m < 60) return s === 0 ? `${m}m` : `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const mRem = m % 60;
  if (s === 0 && mRem === 0) return `${h}h`;
  if (s === 0) return `${h}h ${mRem}m`;
  return `${h}h ${mRem}m ${s}s`;
}

/**
 * Whole seconds elapsed since `startMs` (wall clock), updating ~4×/s.
 * Use the timestamp captured when the query/stream begins so the timer survives remounts and matches commitThoughtDuration.
 */
export function useElapsedSecondsSince(startMs: number | null): number {
  const [sec, setSec] = useState(0);

  useEffect(() => {
    if (startMs == null) {
      setSec(0);
      return undefined;
    }

    const tick = () => {
      setSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };

    tick();
    const id = window.setInterval(tick, 250);

    return () => {
      window.clearInterval(id);
    };
  }, [startMs]);

  return sec;
}
