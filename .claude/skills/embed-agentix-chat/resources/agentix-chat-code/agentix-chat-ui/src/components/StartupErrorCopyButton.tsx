/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { CopyIcon } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { copyText } from '../lib/clipboard';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

/**
 * Copy affordance for the startup error. The whole control — the leading copy icon AND the visible
 * `message` — is one clickable button that puts a support payload on the clipboard (id kept
 * off-screen). With a reference id it copies the id-bearing support line; without one it copies the
 * exact message shown, so the copied text never diverges from what the user sees. A copy failure
 * (denied permission / unfocused document) surfaces an error toast rather than a silent no-op.
 */
const StartupErrorCopyButton: React.FC<{ referenceId?: string | null; message: string }> = ({
  referenceId,
  message,
}) => {
  const { t } = useTranslation('chat');
  const copy = async () => {
    const payload = referenceId ? t('startupStatus.copyContent', { id: referenceId }) : message;
    if (await copyText(payload)) toast.success(t('startupStatus.copied'));
    else toast.error(t('startupStatus.copyFailed'));
  };
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid="startup-status-copy"
            onClick={copy}
            aria-label={t('startupStatus.copyButton')}
            className="inline-flex flex-wrap items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <CopyIcon className="size-3.5 shrink-0" />
            {message}
          </button>
        </TooltipTrigger>
        <TooltipContent>{t('startupStatus.copyButton')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default StartupErrorCopyButton;
