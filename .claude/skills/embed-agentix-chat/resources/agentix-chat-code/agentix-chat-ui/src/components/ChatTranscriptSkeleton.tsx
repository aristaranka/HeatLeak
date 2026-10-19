/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { Skeleton } from './ui/skeleton';

/**
 * Content-shaped placeholder shown while an existing chat's transcript is being fetched.
 * Navigating between chats clears the message list and runs two sequential network calls
 * (session info + transcript); without this, the new-chat empty state would briefly flash.
 * Purely decorative (`aria-hidden`) — the real transcript replaces it once messages load.
 */
export default function ChatTranscriptSkeleton() {
  return (
    <div className="chat-transcript-skeleton flex flex-col gap-6" data-testid="chat-transcript-skeleton" aria-hidden>
      {/* A user bubble (right-aligned) followed by an assistant turn (avatar + text lines),
          mirroring the real transcript layout so the load-in doesn't shift content. */}
      <div className="flex justify-end">
        <Skeleton className="h-9 w-48" />
      </div>
      <div className="flex flex-row items-start gap-3">
        <Skeleton className="h-7 w-7 flex-shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-4 w-[85%]" />
          <Skeleton className="h-4 w-[70%]" />
          <Skeleton className="h-4 w-[45%]" />
        </div>
      </div>
    </div>
  );
}
