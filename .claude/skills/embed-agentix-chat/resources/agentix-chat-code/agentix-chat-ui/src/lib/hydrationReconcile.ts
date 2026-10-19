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
 * Merge freshly-fetched server history with the transcript already on screen,
 * instead of replacing it wholesale.
 *
 * The hash-hydrate path fetches session history asynchronously; under a slow
 * load that fetch can resolve AFTER the user has already sent a turn, whose
 * optimistic user bubble and (on failure) client-only error bubble live only in
 * React state — they are not yet, or never will be, in server history. A blind
 * `setMessages(server)` drops them, unmounting an in-flight turn or a retryable
 * error mid-interaction.
 *
 * Rule: server history is authoritative and comes first; any message currently
 * on screen whose id is absent from server history is a client-only tail
 * (optimistic send, error bubble, in-flight stream frame) and is kept after it.
 * A trailing optimistic `user-local-*` bubble whose text already appears as a
 * server USER message is a persisted twin and is dropped — the same dedup
 * `mergeFrame` applies when the server echoes a sent turn.
 *
 * The one client-only fact worth carrying onto the authoritative server copy is
 * `composedRich`: the wire format is plain markdown text with no field for it, so
 * the twin coming back from the server lacks it. Without this graft, a just-sent
 * rich message would flip from formatted to plain the moment history reconciles.
 * (A full page reload still shows raw markdown source — there's no optimistic twin
 * to source the flag from — which is the accepted degradation.)
 */
export function reconcileHydratedTranscript(server: ChatMessage[], current: ChatMessage[]): ChatMessage[] {
  const serverIds = new Set(server.map((m) => m.id));
  const serverUserTexts = new Set(
    server.filter((m) => m.kind === 'TEXT' && m.role === 'USER').map((m) => (m.text ?? '').trim())
  );
  const richUserTexts = new Set(
    current.filter((m) => m.kind === 'TEXT' && m.role === 'USER' && m.composedRich).map((m) => (m.text ?? '').trim())
  );
  const merged = server.map((m) => {
    return m.kind === 'TEXT' && m.role === 'USER' && !m.composedRich && richUserTexts.has((m.text ?? '').trim())
      ? { ...m, composedRich: true }
      : m;
  });
  const clientOnly = current.filter((m) => {
    if (serverIds.has(m.id)) return false; // server copy wins — no duplicate
    const isOptimisticUser = m.kind === 'TEXT' && m.role === 'USER' && m.id.startsWith('user-local-');
    if (isOptimisticUser && serverUserTexts.has((m.text ?? '').trim())) return false; // persisted twin
    return true;
  });
  return [...merged, ...clientOnly];
}
