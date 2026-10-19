/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Chat attachment policy (UI + future pod/job wiring).
 *
 * Today: the React client uses these values for staged UX and simulated ribbon TTL.
 * Later: point the upload retention job and bucket GC at the same numbers (or env-driven copy).
 */
export const CHAT_ATTACHMENT_CONFIG = {
  /** Objects stay addressable in pod/bucket until this age, then eligible for purge. */
  fileRetentionHours: 24,

  /**
   * Cleanup job buckets objects by this many hours (batch boundaries for GC scans).
   * UI uses this only for copy on ribbons; wire the CronJob to match.
   */
  cleanupBucketHours: 1,

  /** Max files staged before Send (picker + tray). */
  maxPendingFiles: 8,

  /**
   * Max bytes per attached file. Mirrors the agent server's per-file multer
   * limit (`CHAT_UPLOAD_MAX_BYTES`, default 25 MB) so the picker rejects
   * oversize files up front instead of pushing the whole body over the wire
   * only to be refused server-side.
   */
  maxFileBytes: 25 * 1024 * 1024,
} as const;

/**
 * Split picked files into those within the per-file byte limit and those over
 * it. Pure helper so the size policy is unit-testable without rendering the
 * composer. Order is preserved within each bucket.
 */
export function splitFilesBySize(files: File[], maxBytes: number): { withinLimit: File[]; oversize: File[] } {
  const withinLimit: File[] = [];
  const oversize: File[] = [];
  for (const file of files) {
    (file.size > maxBytes ? oversize : withinLimit).push(file);
  }
  return { withinLimit, oversize };
}
