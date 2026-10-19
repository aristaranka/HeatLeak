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
import AgentSpinUp, { type AgentSpinUpProps } from './AgentSpinUp';
import StartupErrorCopyButton from './StartupErrorCopyButton';
import type { AgentStatus } from '../lib/chatApi';

type Props = AgentSpinUpProps & {
  /**
   * The non-recoverable startup status once one is detected (polled at the page level so it survives
   * the provisioning → terminal transition), or null while none. Its `referenceId` is what the copy
   * button puts on the clipboard.
   */
  nonRecoverableStatus?: AgentStatus | null;
  /**
   * True when the caller already knows the agent failed (terminal `session.failed`), so the message
   * shows even before a status is polled. */
  forceFatal?: boolean;
  /** Reference id to copy when no status was polled (e.g. the failed session's correlation id). */
  fallbackReferenceId?: string | null;
};

/**
 * AgentSpinUp that, once a non-recoverable startup failure is known (polled, or forced by the
 * caller), swaps only its subtitle — the "taking longer than usual" long-wait line and any base
 * subtitle — for a short "reach out to the administrator" message with an inline Copy button at the
 * end (message + reference id → clipboard; id kept off-screen). The spinner / stepper and actions are
 * left intact so provisioning keeps animating and the transition to the Retry screen is preserved.
 * Non-fatal renders pass straight through.
 */
const AgentSpinUpWithStatus: React.FC<Props> = ({
  nonRecoverableStatus,
  forceFatal = false,
  fallbackReferenceId,
  ...spinUpProps
}) => {
  const { t } = useTranslation('chat');
  const fatal = forceFatal || !!nonRecoverableStatus;
  if (!fatal) return <AgentSpinUp {...spinUpProps} />;

  const referenceId = nonRecoverableStatus?.referenceId ?? fallbackReferenceId ?? null;
  // forceFatal is the terminal ("Couldn't start your agent") screen → tell the user to reach out.
  // Otherwise the spinner is still up and the controller keeps retrying internally → "Retrying…".
  const message = forceFatal ? t('startupStatus.nonRecoverable') : t('startupStatus.retrying');
  return (
    <AgentSpinUp
      {...spinUpProps}
      longWaitSubtitle={undefined}
      subtitle={<StartupErrorCopyButton referenceId={referenceId} message={message} />}
    />
  );
};

export default AgentSpinUpWithStatus;
