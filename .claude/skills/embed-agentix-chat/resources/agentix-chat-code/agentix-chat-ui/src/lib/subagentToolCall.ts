/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import type { ChatMessage } from './types';

/** Bare MCP name or prefixed stream frame (e.g. `nexus-proxy_create-subagent`). */
export function isCreateSubagentToolName(name: string | undefined): boolean {
  if (!name) return false;
  return name === 'create-subagent' || name.endsWith('_create-subagent');
}

function toolNameFromMessage(message: ChatMessage): string | undefined {
  return message.toolName || (typeof message.data?.name === 'string' ? message.data.name : undefined);
}

/** Session id from a completed `create-subagent` tool output, or null if not applicable. */
export function subagentSessionIdFromCreateToolCall(message: ChatMessage): string | null {
  if (!isCreateSubagentToolName(toolNameFromMessage(message)) || message.toolState !== 'COMPLETED') {
    return null;
  }
  const raw = message.data?.output;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { subagent_session_id?: unknown };
    const id = parsed.subagent_session_id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}
