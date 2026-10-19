/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { TriangleAlert } from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPermissionPattern } from '../lib/permissionPattern';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import type { ChatMessage, PermissionResponse } from '../lib/types';

interface Props {
  message: ChatMessage;
  onRespond: (permissionId: string, response: PermissionResponse) => Promise<void> | void;
}

const PermissionBlock: React.FC<Props> = ({ message, onRespond }) => {
  const { t } = useTranslation('chat');
  const { data = {} } = message;
  const permissionId = data.permissionId || message.id;
  const permissionType = data.permissionType || 'tool';
  const titleText = message.text || permissionType;
  const pattern = formatPermissionPattern(data.pattern);
  const [submitting, setSubmitting] = useState<PermissionResponse | null>(null);
  const [error, setError] = useState('');

  const click = async (resp: PermissionResponse) => {
    if (submitting) return;
    setSubmitting(resp);
    setError('');
    try {
      await onRespond(permissionId, resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('permission.sendFailed'));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div
      data-testid="permission-block"
      className="my-2 mb-4 rounded-md border border-l-[3px] border-l-amber-600 bg-muted/40 px-3.5 py-3"
    >
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
        <span
          data-testid="permission-title"
          className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
          title={titleText}
        >
          {titleText}
        </span>
        <Badge
          variant="secondary"
          data-testid="permission-type"
          className="shrink-0 rounded font-mono uppercase tracking-wide"
        >
          {permissionType}
        </Badge>
      </div>
      {pattern ? (
        <pre
          data-testid="permission-pattern"
          className="mb-2.5 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted px-2.5 py-2 font-mono text-xs"
          title={pattern}
        >
          {pattern}
        </pre>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          data-testid="permission-allow-once-btn"
          onClick={() => click('once')}
          disabled={!!submitting}
        >
          {submitting === 'once' ? t('permission.allowOnceLoading') : t('permission.allowOnce')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => click('always')} disabled={!!submitting}>
          {submitting === 'always' ? t('permission.alwaysAllowLoading') : t('permission.alwaysAllow')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          data-testid="permission-deny-btn"
          onClick={() => click('reject')}
          disabled={!!submitting}
          title={t('permission.denyTitle')}
        >
          {submitting === 'reject' ? t('permission.denyLoading') : t('permission.deny')}
        </Button>
      </div>
      {error ? (
        <div data-testid="permission-error" className="mt-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
};

export default PermissionBlock;
