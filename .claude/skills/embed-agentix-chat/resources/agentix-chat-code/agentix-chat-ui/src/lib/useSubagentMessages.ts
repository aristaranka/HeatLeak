/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSubagentMessages } from './chatApi';
import { mergeNewest, olderCursor, prependOlder } from './messagePaging';
import type { ChatMessage } from './types';

// Same cadence the sidebar uses for its own subagent-list poll (SessionSidebar's POLL_MS) — a
// subagent runs unattended, so this is the only signal any viewer has that it made progress.
export const SUBAGENT_POLL_MS = 10_000;

/** Relabel a subagent transcript's USER-role turns as PARENT_AGENT before render: those turns are
 *  the parent's dispatched instructions (sendToSubagent), not a human typing into this session.
 *  Scoped to kind 'TEXT' — the only kind a dispatched instruction ever takes — so MessageBlock's
 *  TEXT+PARENT_AGENT branch is guaranteed a match; any other USER-role kind falls through to its
 *  own kind-specific (role-agnostic) branch unrelabeled instead of matching no branch at all. */
export function relabelParentTurns(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => (m.role === 'USER' && m.kind === 'TEXT' ? { ...m, role: 'PARENT_AGENT' } : m));
}

export interface UseSubagentMessagesResult {
  messages: ChatMessage[];
  isActive: boolean;
  hasMore: boolean;
  loadingOlder: boolean;
  hasError: boolean;
  loadOlder: () => Promise<void>;
}

/** Poll one subagent's chat transcript, relabel its dispatched-instruction turns, and expose a
 *  keyset "load older" page. Shared by {@link SubagentTranscript} (the full read-only viewer) and
 *  {@link SubagentActivityCard} (the compact inline-in-parent-chat activity feed) — both surfaces
 *  render the identical two-party exchange, just at different sizes, so the fetch/poll/relabel
 *  logic lives once here. Polling stops once the subagent goes inactive (TERMINATED): a finished
 *  subagent's transcript will never change again, so polling it forever wastes a recurring backend
 *  call for as long as the viewer stays mounted. */
export function useSubagentMessages(subagentSessionId: string): UseSubagentMessagesResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasError, setHasError] = useState(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  // Guards against a stale response: an in-flight fetch started for a prior subagentSessionId
  // (switched away from before it resolved) must not paint its result over the new one.
  const activeIdRef = useRef(subagentSessionId);
  // Holds the current poll's interval id so refresh() can stop the poll once the subagent goes
  // inactive.
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const page = await fetchSubagentMessages(subagentSessionId, { limit: 0 });
      if (activeIdRef.current !== subagentSessionId) return;
      setMessages((prev) => mergeNewest(prev, relabelParentTurns(page.messages)));
      setHasMore(page.hasMore);
      setIsActive(page.isActive);
      setHasError(false);
      if (!page.isActive && timerRef.current != null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    } catch {
      if (activeIdRef.current !== subagentSessionId) return;
      setHasError(true);
    }
  }, [subagentSessionId]);

  useEffect(() => {
    activeIdRef.current = subagentSessionId;
    setMessages([]);
    setIsActive(true);
    setHasMore(false);
    setHasError(false);
    setLoadingOlder(false);
    refresh();
    timerRef.current = window.setInterval(refresh, SUBAGENT_POLL_MS);
    return () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [refresh, subagentSessionId]);

  const loadOlder = useCallback(async () => {
    const cursor = olderCursor(messagesRef.current);
    if (!cursor) return;
    setLoadingOlder(true);
    try {
      const page = await fetchSubagentMessages(subagentSessionId, {
        limit: 0,
        beforeTs: cursor.beforeTs,
        beforeId: cursor.beforeId,
      });
      if (activeIdRef.current !== subagentSessionId) return;
      setMessages((prev) => prependOlder(prev, relabelParentTurns(page.messages)));
      setHasMore(page.hasMore);
    } catch {
      if (activeIdRef.current === subagentSessionId) setHasError(true);
    } finally {
      if (activeIdRef.current === subagentSessionId) setLoadingOlder(false);
    }
  }, [subagentSessionId]);

  return { messages, isActive, hasMore, loadingOlder, hasError, loadOlder };
}
