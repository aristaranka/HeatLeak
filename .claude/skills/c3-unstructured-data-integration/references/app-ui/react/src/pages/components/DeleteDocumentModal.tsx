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

interface DeleteDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function DeleteDocumentModal({ isOpen, onClose, onConfirm, isLoading = false }: DeleteDocumentModalProps) {
  const { t } = useTranslation();
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center">
      <div className="bg-overlay absolute inset-0" onClick={onClose} role="presentation" />
      <div
        className="relative bg-primary rounded-sm shadow-menu p-6"
        style={{ width: '480px', maxWidth: '90vw' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-document-modal-title"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="delete-document-modal-title" className="text-lg font-semibold">
            {t('documents.deleteDocument.title')}
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1 text-secondary hover:text-primary transition-colors rounded-xs bg-transparent disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ lineHeight: 1 }}
            aria-label={t('common.close')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-secondary mb-6">{t('documents.deleteDocument.description')}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="border-accent text-accent rounded-xs border bg-transparent px-4 py-2 text-sm transition-colors hover:bg-accent hover:text-inverse disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-danger text-inverse rounded-xs flex items-center gap-2 px-4 py-2 text-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 text-inverse"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('documents.deleteDocument.deleting')}
              </>
            ) : (
              t('common.delete')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
