/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { Loader2, Trash2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  loadingLabel?: string;
  danger?: boolean;
  loading?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

/**
 * Confirm / delete dialog. Migrated to the ShadCN Dialog primitive (Radix) — the
 * prop API is unchanged so existing callers across the app keep working. Escape /
 * backdrop dismissal and focus management come from Radix; we only suppress
 * dismissal while a confirm action is in flight.
 */
const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  message,
  confirmLabel,
  loadingLabel,
  danger,
  loading,
  confirmDisabled,
  onConfirm,
  onCancel,
  children,
}) => {
  const { t } = useTranslation('common');
  const resolvedConfirmLabel = confirmLabel ?? t('confirm');
  const busyLabel = loadingLabel || resolvedConfirmLabel;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !loading) onCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!loading}
        onInteractOutside={(e) => loading && e.preventDefault()}
        onEscapeKeyDown={(e) => loading && e.preventDefault()}
      >
        {/* Content stays fixed while a confirm action is in flight — only the confirm button flips
            to a disabled spinner, then the caller closes the dialog once the network call resolves.
            No content swap, no second dialog. min-w-0 down this flex/grid chain lets long,
            unbreakable message content (e.g. full build-metadata versions) scroll inside its own
            container instead of the min-width:auto default blowing the whole dialog out horizontally. */}
        <DialogHeader className="min-w-0">
          <div className="flex min-w-0 items-start gap-3">
            {danger && (
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <Trash2 className="size-5" />
              </span>
            )}
            <div className="min-w-0 space-y-1.5">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription asChild>
                <div className="min-w-0">{message}</div>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {children && <div className="min-w-0 space-y-3">{children}</div>}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            data-testid="confirm-modal-cancel"
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant={danger ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading || confirmDisabled}
            aria-busy={loading || undefined}
            // Keep the visible label unchanged; announce the in-flight action to assistive tech.
            aria-label={loading ? busyLabel : undefined}
            data-testid="confirm-modal-confirm"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" data-testid="confirm-modal-loading" aria-hidden />
            ) : (
              danger && <Trash2 className="size-4" />
            )}
            {resolvedConfirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmModal;
