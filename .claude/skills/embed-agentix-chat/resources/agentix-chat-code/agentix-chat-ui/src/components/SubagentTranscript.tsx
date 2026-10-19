/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useTranslation } from 'react-i18next';
import { useSubagentMessages } from '../lib/useSubagentMessages';
import MessageBlock from './MessageBlock';
import { Button } from './ui/button';

export interface SubagentTranscriptProps {
  subagentSessionId: string;
  onBack: () => void;
}

// Read-only viewer for a subagent's chat transcript. No composer, no streaming, no file upload —
// it only polls readSubagentMessagesForSession (via useSubagentMessages) and renders what comes
// back, matching the pod's own polling cadence used elsewhere for awaiting-input state.
export function SubagentTranscript({ subagentSessionId, onBack }: SubagentTranscriptProps) {
  const { t } = useTranslation('chat');
  const { messages, hasMore, loadingOlder, hasError, loadOlder } = useSubagentMessages(subagentSessionId);

  return (
    <div className="subagent-transcript flex h-full min-h-0 flex-col">
      <div className="subagent-transcript__header flex items-center gap-2 border-b border-border px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="subagent-transcript-back">
          {t('subagent.backToParent')}
        </Button>
        <span className="subagent-transcript__title text-sm text-muted-foreground">
          {t('subagent.transcriptTitle')}
        </span>
      </div>
      <div className="subagent-transcript__body min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {hasMore && (
          <div className="mb-3 flex justify-center">
            <Button variant="outline" size="sm" onClick={loadOlder} disabled={loadingOlder}>
              {t('subagent.loadOlder')}
            </Button>
          </div>
        )}
        {messages.map((m) => (
          <MessageBlock key={m.id} message={m} isSubagentTranscript />
        ))}
        {hasError && (
          <div className="subagent-transcript__error text-sm text-destructive">{t('subagent.transcriptLoadError')}</div>
        )}
      </div>
    </div>
  );
}

export default SubagentTranscript;
