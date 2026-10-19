/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Maps raw backend status values to user-facing display labels.
 * Only entries that differ from the raw value are listed here.
 */
const STATUS_DISPLAY_LABELS: Record<string, string> = {
  Indexed: 'Processed',
  'Not Indexed': 'Unprocessed',
  'Needs Re-indexing': 'Needs Re-processing',
};

/** Semantic status tone used to drive the pill badge styling. */
type StatusTone = 'success' | 'warning' | 'danger' | 'progress' | 'neutral';

/**
 * Ion semantic text-color class for each tone (drives both the label text and the filled status
 * dot via `currentColor`). Token-backed so light/dark are baked in — no hardcoded hex (Ion rule).
 */
const TONE_TEXT_CLASSES: Record<StatusTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',

  // In-flight states use the accent (blue) to read as "actively working" alongside the spinner.
  progress: 'text-accent',

  // Benign "not started yet" / unknown states are muted grey.
  neutral: 'text-secondary',
};

// Format status enum (remove spaces and hyphens, convert to lowercase)
export const formatStatusEnum = (status: string): string => {
  if (!status) {
    return '';
  }

  /*
   * Intermediate statuses are displayed with a trailing "..." (e.g. "Processing..."); strip it so
   * tone/label lookups match the underlying enum value.
   */
  return status.replaceAll('.', '').replaceAll(' ', '').replaceAll('-', '').toLowerCase();
};

/** Returns the display label for a raw backend status value. */
export const getStatusLabel = (status: string): string => STATUS_DISPLAY_LABELS[status] ?? status;

/** Maps a raw backend status value to a semantic tone. */
export const getStatusTone = (status: string): StatusTone => {
  const formattedStatus = formatStatusEnum(status);

  if (formattedStatus === 'indexed') {
    return 'success';
  }

  // "Unprocessed" (never processed) is a benign not-started state, not an attention/warning state.
  if (formattedStatus === 'notindexed') {
    return 'neutral';
  }

  // "Needs Re-processing" / "Needs Removal" mean previously-processed content is now stale — needs action.
  if (formattedStatus === 'needsreindexing' || formattedStatus === 'needsremoval') {
    return 'warning';
  }

  if (formattedStatus === 'failed') {
    return 'danger';
  }

  if (
    formattedStatus === 'indexing' ||
    formattedStatus === 'chunked' ||
    formattedStatus === 'removing' ||
    formattedStatus === 'syncing' ||
    formattedStatus === 'chunking' ||
    formattedStatus === 'processing'
  ) {
    return 'progress';
  }

  return 'neutral';
};

/** Returns the Ion semantic text-color class (label + dot) for a raw backend status value. */
export const getStatusColorClass = (status: string): string => TONE_TEXT_CLASSES[getStatusTone(status)];

/*
 * Settled statuses that the Process action applies to: files that are not yet processed and are
 * not mid-flight. "Failed" is included so a failed file can be retried. In-flight statuses
 * (Processing / Indexing / Chunking / Chunked / Removing / Syncing) are intentionally excluded so
 * we never act on a file that is already moving through the pipeline.
 */
const PROCESSABLE_STATUSES = new Set(['notindexed', 'needsreindexing', 'failed']);

/*
 * Settled statuses that the Unprocess action applies to: files whose content is in the index
 * (Processed) or explicitly flagged for removal. In-flight statuses are excluded (see above).
 */
const UNPROCESSABLE_STATUSES = new Set(['indexed', 'needsremoval']);

/** True when the Process action should act on a file with this status. */
export const isProcessable = (status: string): boolean => PROCESSABLE_STATUSES.has(formatStatusEnum(status));

/** True when the Unprocess action should act on a file with this status. */
export const isUnprocessable = (status: string): boolean => UNPROCESSABLE_STATUSES.has(formatStatusEnum(status));

export type { StatusTone };
