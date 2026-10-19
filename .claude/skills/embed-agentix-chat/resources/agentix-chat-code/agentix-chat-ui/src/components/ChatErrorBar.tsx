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
import { CopyTextButton } from './ui/copy-text-button';

/**
 * The chat column's error surface (resume failures and other operational errors). A bare text line
 * left the full message unselectable-feeling and with no way to share it; this fixes that:
 *  - the full message wraps and is selectable — never clipped to one line.
 *  - a Copy control puts a support payload on the clipboard (the message plus the session reference
 *    id when known), so the user can share the exact failure with an administrator.
 *  - when a `referenceId` is known, a hint line reports it and asks the user to give it to an admin.
 */
const ChatErrorBar: React.FC<{ message: string; referenceId?: string; onDismiss: () => void }> = ({
  message,
  referenceId,
  onDismiss,
}) => {
  const { t } = useTranslation('chat');
  const copyPayload = referenceId ? t('error.copyContent', { message, id: referenceId }) : message;
  return (
    <div
      className="chat-page__error-bar border-t border-destructive bg-destructive/10 px-4 py-2 text-[13px] text-destructive"
      data-testid="chat-error-bar"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words select-text" data-testid="chat-error-message">
          {message}
        </p>
        <CopyTextButton
          text={copyPayload}
          size="icon-xs"
          className="shrink-0 text-destructive hover:text-destructive/80"
          data-testid="chat-error-copy"
        />
      </div>
      {referenceId && (
        <p className="mt-1 text-xs break-words text-destructive/80 select-text" data-testid="chat-error-reference">
          {t('error.referenceHint', { id: referenceId })}
        </p>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="chat-page__error-dismiss mt-1 cursor-pointer border-0 bg-transparent p-0 text-[13px] text-destructive underline"
      >
        {t('dismiss')}
      </button>
    </div>
  );
};

export default ChatErrorBar;
