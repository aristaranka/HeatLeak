/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { AgentHttpError } from './chatApi';
import { SessionExpiredError } from './sessionExpiry';

/** Map a chat-page request failure to a friendly i18n key. Status-aware for the typed
 *  {@link AgentHttpError} (network / server / auth); every other error returns the caller's
 *  context fallback key. Never returns raw backend text. */
export function chatRequestErrorKey(err: unknown, fallbackKey: string): string {
  // An expired session surfaces the app-wide reauth banner (raised by the latch); this key is the
  // secondary in-bar fallback so the old misleading "connection interrupted" never flashes.
  if (err instanceof SessionExpiredError) return 'error.sessionExpired';
  if (err instanceof AgentHttpError) {
    if (err.status === 0) return 'error.connectionLost';
    if (err.status >= 500) return 'error.serverError';
    if (err.status === 401 || err.status === 403) return 'error.accessDenied';
    if (err.status === 429) return 'error.rateLimited';
    if (err.status === 408) return 'error.connectionLost';
  }
  return fallbackKey;
}

/** True when `text` reads like a model context-window / prompt-length overflow, across the
 *  common provider phrasings (Anthropic "prompt is too long", OpenAI/litellm
 *  "maximum context length" / "context_length_exceeded", generic "context window").
 *  Used to map a recovered terminal error to the friendly `error.conversationTooLarge`. */
export function isContextLengthError(text: string | null | undefined): boolean {
  if (!text) return false;
  return /prompt is too long|context[ _]length|context window|maximum context|too many tokens|context_length_exceeded/i.test(
    text
  );
}
