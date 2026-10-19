/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatThinkingDurationSeconds, useElapsedSecondsSince } from '../lib/thinkingElapsed';
import { toolActivityLabel } from '../lib/toolActivityLabel';
import type { ChatMessage } from '../lib/types';

const activityRowClass = 'flex w-full min-w-0 items-center gap-2 text-sm text-muted-foreground';

const ActivityLabel: React.FC<{ text: string }> = ({ text }) => (
  <span
    data-testid="live-activity-label"
    className="min-w-0 flex-1 truncate text-foreground"
    aria-live="polite"
    title={text}
  >
    {text}
  </span>
);

interface LiveActivityProps {
  /** Latest in-flight TOOL_CALL (RUNNING/PENDING) or STEP_START for this turn, else null. */
  activity: ChatMessage | null;
  /** Per-turn STEP_START count (computed by the caller against the turn's own steps). */
  stepNumber: number | null;
  /** Turn start time; this leaf owns the elapsed hook so the 250ms tick re-renders only the line. */
  startedAtMs: number | null;
  /** Active RETRY frame during LLM provider throttling, if any. */
  retryFrame?: ChatMessage | null;
  /** True when this turn is blocked on an unresolved human approval (PermissionBlock is showing
   *  Allow/Deny below). The tool call itself hasn't started executing yet, so the spinner would
   *  misleadingly read "Running" while nothing is actually running. */
  awaitingApproval?: boolean;
}

/**
 * Compact "current action" line shown during a streaming turn: a spinner, a verb+target label
 * derived from the in-flight tool frame, an optional step counter, and elapsed time.
 *
 * `aria-live` is scoped to the action label (which changes rarely); the per-second elapsed
 * counter is `aria-hidden` so screen readers aren't spammed every tick. When no activity frame
 * has arrived yet it shows "Thinking", so it doubles as the pre-first-frame fallback row.
 */
const LiveActivity: React.FC<LiveActivityProps> = ({
  activity,
  stepNumber,
  startedAtMs,
  retryFrame,
  awaitingApproval,
}) => {
  const { t } = useTranslation('chat');
  const sec = useElapsedSecondsSince(startedAtMs);

  if (retryFrame && retryFrame.kind === 'RETRY') {
    const attempt = retryFrame.data?.attempt ?? 1;
    const nextMs = retryFrame.data?.nextMs;
    const countdown = nextMs != null ? Math.ceil(Number(nextMs) / 1000) : null;
    const retryLabel =
      countdown != null
        ? t('activity.retrying_countdown', { attempt, seconds: countdown })
        : t('activity.retrying', { attempt });
    return (
      <div className={activityRowClass}>
        <span className="nexus-spinner shrink-0" aria-hidden />
        <ActivityLabel text={retryLabel} />
      </div>
    );
  }

  const label = awaitingApproval
    ? t('activity.awaiting_approval')
    : activity && activity.kind === 'TOOL_CALL'
      ? toolActivityLabel(activity.toolName ?? '', activity.data?.input)
      : activity
        ? t('activity.working')
        : t('activity.thinking');

  return (
    <div className={activityRowClass}>
      {awaitingApproval ? (
        <span className="block h-[7px] w-[7px] shrink-0 rounded-full bg-muted-foreground" aria-hidden />
      ) : (
        <span className="nexus-spinner shrink-0" aria-hidden />
      )}
      <ActivityLabel text={label} />
      {stepNumber != null ? (
        <span className="shrink-0" aria-hidden>
          {t('activity.step', { number: stepNumber })}
        </span>
      ) : null}
      <span className="shrink-0" data-testid="live-activity-elapsed" aria-hidden>
        · {formatThinkingDurationSeconds(sec)}
      </span>
    </div>
  );
};

export default LiveActivity;
