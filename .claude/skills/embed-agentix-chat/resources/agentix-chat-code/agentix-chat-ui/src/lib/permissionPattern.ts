/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Render the `pattern` field of a PERMISSION frame as a single string.
 *
 * opencode emits a `patterns: string[]` per permission.asked event. The sidecar
 * flattens that to either a single string (when only one pattern was sent) or
 * the array verbatim (when multiple patterns landed). Arrays are joined with a
 * bullet so the UI shows one preview line; null / undefined collapses to ''.
 */
export function formatPermissionPattern(pattern: string | string[] | null | undefined): string {
  if (!pattern) return '';
  if (Array.isArray(pattern)) return pattern.join(' • ');
  return pattern;
}
