/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import type { ChatMessage } from './types';

/**
 * Pick the id of the single PERMISSION frame that should render its approve/deny buttons.
 *
 * Claude Code-style queue: only the oldest PENDING permission is interactive. Resolved
 * frames and any newer PENDING ones collapse to null in MessageBlock. Returns null when
 * there is nothing pending, so the chat shows no permission UI.
 */
export function findActivePermissionId(messages: ChatMessage[]): string | null {
  let oldest: ChatMessage | null = null;
  for (const m of messages) {
    if (m.kind !== 'PERMISSION') continue;
    if ((m.data?.state ?? 'PENDING') !== 'PENDING') continue;
    if (!oldest) {
      oldest = m;
      continue;
    }
    const a = m.timestamp ?? '';
    const b = oldest.timestamp ?? '';
    if (a && b && a < b) oldest = m;
  }
  return oldest?.data?.permissionId || oldest?.id || null;
}
