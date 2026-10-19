/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useSubagentMessages } from '../lib/useSubagentMessages';
import MessageBlock from './MessageBlock';

export interface SubagentActivityCardProps {
  subagentSessionId: string;
  /** Parent chat's own session id, to build the "view full transcript" deep link
   *  (`/chat#<parent>/subagents/<sub>` — the same route SessionSidebar's nested subagent rows use).
   *  Absent (e.g. an embed with no session route resolved yet) hides the link — there's nowhere
   *  useful to send the click. */
  parentSessionId?: string | null;
  /** Compact preview cap — only the newest N messages render inline; "view full transcript" is the
   *  only way to see the rest. Keeps a long-running subagent's card from growing unboundedly tall
   *  inside the parent's own message list. */
  maxMessages?: number;
}

const DEFAULT_MAX_MESSAGES = 6;

/** Compact inline subagent transcript in the parent chat (see {@link useSubagentMessages}). */
export function SubagentActivityCard({
  subagentSessionId,
  parentSessionId,
  maxMessages = DEFAULT_MAX_MESSAGES,
}: SubagentActivityCardProps) {
  const { t } = useTranslation('chat');
  const { messages, isActive, hasError } = useSubagentMessages(subagentSessionId);
  // Auto-expanded by default — the whole point of an inline card is to observe the subagent
  // without an extra click; a user who doesn't care can still collapse it.
  const [expanded, setExpanded] = useState(true);

  const preview = useMemo(() => messages.slice(-maxMessages), [messages, maxMessages]);
  const showSpinner = isActive && !hasError;

  return (
    <div
      className="subagent-activity-card mb-3 overflow-hidden rounded-md border border-border bg-muted/30"
      data-testid="subagent-activity-card"
      data-active={isActive}
    >
      <button
        type="button"
        className="subagent-activity-card__header flex w-full min-w-0 items-center gap-2 bg-muted/50 px-3.5 py-2 text-left text-[13px] hover:brightness-105"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {showSpinner && <span className="nexus-spinner subagent-activity-card__spinner size-2.5 border" aria-hidden />}
        <span className="subagent-activity-card__title min-w-0 flex-auto truncate font-semibold">
          {t('subagent.activityCardTitle')}
        </span>
        <span className="subagent-activity-card__status shrink-0 text-2xs text-muted-foreground">
          {hasError
            ? t('subagent.activityCardFinished')
            : isActive
              ? t('subagent.activityCardActive')
              : t('subagent.activityCardFinished')}
        </span>
      </button>
      {expanded && (
        <div className="subagent-activity-card__body border-t border-border/60 px-3.5 py-2.5">
          {preview.length === 0 && !hasError ? (
            <div className="subagent-activity-card__empty text-xs text-muted-foreground">
              {t('subagent.activityCardEmpty')}
            </div>
          ) : (
            <div className="subagent-activity-card__messages text-[13px]">
              {preview.map((m) => (
                <MessageBlock key={m.id} message={m} isSubagentTranscript />
              ))}
            </div>
          )}
          {hasError && (
            <div className="subagent-activity-card__error text-xs text-destructive">
              {t('subagent.activityCardLoadError')}
            </div>
          )}
          {parentSessionId && (
            <Link
              to={`/chat#${parentSessionId}/subagents/${subagentSessionId}`}
              className="subagent-activity-card__view-full mt-1 inline-block text-xs text-primary hover:underline"
              data-testid="subagent-activity-card-view-full"
            >
              {t('subagent.activityCardViewFull')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export default SubagentActivityCard;
