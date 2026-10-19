/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { Check, Clipboard } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { copyText } from '../../lib/clipboard';
import { cn } from '../../lib/utils';
import { Button } from './button';

const COPIED_MS = 2000;

export interface CopyTextButtonProps {
  /** Full text to copy (not viewport-limited). Empty / missing disables the button. */
  text: string;
  disabled?: boolean;
  /** Icon hit-area size. Defaults to `icon-sm` (modal chrome); chat action rows use `icon-xs`. */
  size?: 'icon-sm' | 'icon-xs';
  className?: string;
  'data-testid'?: string;
}

/**
 * Icon-only copy control for text-view surfaces. Success flips Clipboard → Check for
 * ~2s; failure toasts without throwing. Generic — any caller with a string payload.
 */
export function CopyTextButton({
  text,
  disabled,
  size = 'icon-sm',
  className,
  'data-testid': testId,
}: CopyTextButtonProps) {
  const { t } = useTranslation('common');
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onClick = async () => {
    const ok = await copyText(text);
    if (!ok) {
      toast.error(t('copyFailed'));
      return;
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  const label = copied ? t('copied') : t('copy');

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      disabled={disabled || !text}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={cn('text-muted-foreground', copied && 'text-success', className)}
      onClick={() => void onClick()}
    >
      {copied ? <Check aria-hidden /> : <Clipboard aria-hidden />}
    </Button>
  );
}

export default CopyTextButton;
