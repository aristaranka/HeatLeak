/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import type { ChatMessage } from './types';

/** Rough GPT-style heuristic (~4 Latin chars ≈ 1 token). Not provider usage. */
const CHARS_PER_TOKEN_ESTIMATE = 4;

/**
 * Approximate “conversation size” from text the UI shows (user + assistant +
 * reasoning). Tool JSON I/O is excluded so counts stay readable.
 */
export function estimateConversationTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    if ((m.kind === 'TEXT' || m.kind === 'REASONING') && m.text) {
      chars += m.text.length;
    }
  }
  if (chars === 0) return 0;
  return Math.max(1, Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE));
}

/**
 * Compact display for a provider-reported token count (badge: "812", "3.2K", "12K").
 * Under 1000 shows the integer; 1000+ shows one decimal of thousands, trailing ".0"
 * trimmed. Returns "" for null/zero/negative so callers can omit the segment.
 */
export function formatTokenCount(n?: number | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '';
  if (n < 1000) return String(Math.round(n));
  return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
}

/**
 * Compact display for a turn duration (badge: "8s", "2m 35s", "1h 12m").
 * Sub-minute rounds to whole seconds (min "1s"); the unit letters are universal
 * SI-style abbreviations, kept identical across locales. Returns "" for
 * null/zero/negative so callers can omit the segment.
 */
export function formatDuration(ms?: number | null): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '';
  const totalSec = Math.max(1, Math.round(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) {
    const sec = totalSec % 60;
    return sec ? `${totalMin}m ${sec}s` : `${totalMin}m`;
  }
  const hours = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return min ? `${hours}h ${min}m` : `${hours}h`;
}
