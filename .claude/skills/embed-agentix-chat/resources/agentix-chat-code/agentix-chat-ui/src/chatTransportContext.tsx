/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { createContext, useContext } from 'react';
import type { NexusChatTransport } from './transport';

const ChatTransportContext = createContext<NexusChatTransport | null>(null);

/** Provide the page-level {@link NexusChatTransport} to chat chrome (sidebar, workspace panel, …). */
export function ChatTransportProvider({
  transport,
  children,
}: {
  transport: NexusChatTransport;
  children: React.ReactNode;
}) {
  return <ChatTransportContext.Provider value={transport}>{children}</ChatTransportContext.Provider>;
}

/**
 * Transport injected by {@link ChatPage}. Child chrome (SessionSidebar, WorkspaceSidePanel, …) must
 * call through this hook — never import host `@/lib/api` chat/workspace functions directly — so
 * every embed stays on its injected transport.
 */
export function useChatTransport(): NexusChatTransport {
  const t = useContext(ChatTransportContext);
  if (!t) {
    throw new Error('useChatTransport must be used within ChatPage (ChatTransportProvider).');
  }
  return t;
}

/**
 * Same as {@link useChatTransport} but returns {@code null} outside {@link ChatTransportProvider}.
 * Used by hooks (e.g. agent-definition picker) that also fall back to the host `@/lib/agentsApi`
 * when mounted outside ChatPage (unit tests / host-only surfaces).
 */
export function useOptionalChatTransport(): NexusChatTransport | null {
  return useContext(ChatTransportContext);
}
