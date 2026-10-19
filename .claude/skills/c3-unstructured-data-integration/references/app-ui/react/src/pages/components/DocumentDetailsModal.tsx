/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fetchSourceFileDetail } from '../../shared/api';
import { getContentType } from './upload/uploadUtils';
import { bytesToFileSize, getDisplayedStatus, getTimeElapsedString } from './utils/transformSourceFile';
import { getStatusLabel } from './utils/statusUtils';

function formatDetailDateTime(value: unknown): string {
  if (value == null || value === '') {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const sec = (value as { seconds: number }).seconds;
    if (typeof sec === 'number' && Number.isFinite(sec)) {
      return new Date(sec * 1000).toISOString();
    }
  }

  return '';
}

function detailErrorMessage(obj: Record<string, unknown> | null): string {
  if (!obj) {
    return '';
  }
  const status = obj.status as Record<string, unknown> | undefined;
  const history = obj.statusHistory as Array<Record<string, unknown>> | undefined;
  const raw = status?.rawErrorMessage;
  if (typeof raw === 'string' && raw) {
    return raw;
  }
  const transformed = history?.[0]?.transformedError;
  if (typeof transformed === 'string' && transformed) {
    return transformed;
  }
  const err = status?.errorMessage;
  if (typeof err === 'string' && err) {
    return err;
  }

  return '';
}

function mapSourceFileToDetailFields(
  obj: Record<string, unknown>,
  t: (key: string, options?: Record<string, string>) => string
): { label: string; value: string }[] {
  const originalFile = obj.originalFile as { url?: string; contentLength?: number } | undefined;
  const url = typeof originalFile?.url === 'string' ? originalFile.url : '';
  const contentSizeBytes = (obj.contentSize as number | undefined) ?? originalFile?.contentLength;
  const contentSize = typeof contentSizeBytes === 'number' ? bytesToFileSize(contentSizeBytes) : '0 Bytes';
  const contentType = url ? getContentType(url) : '';
  const modified = formatDetailDateTime(obj.modifiedTimeWhenLastProcessed);
  const lastSyncedBy = typeof obj.displayLastProcessedBy === 'string' ? obj.displayLastProcessedBy : '';
  const meta = obj.meta as { updated?: string } | undefined;
  const lastSyncedTime = meta?.updated ? getTimeElapsedString(meta.updated) : '';
  const collection = obj.collection as { name?: string } | undefined;

  return [
    { label: t('documents.documentDetails.fieldLabels.status'), value: getStatusLabel(getDisplayedStatus(obj)) },
    {
      label: t('documents.documentDetails.fieldLabels.sourceDirectory'),
      value: typeof collection?.name === 'string' ? collection.name : '',
    },
    { label: t('documents.documentDetails.fieldLabels.path'), value: url },
    { label: t('documents.documentDetails.fieldLabels.sourceContentLastModified'), value: modified },
    { label: t('documents.documentDetails.fieldLabels.contentSize'), value: contentSize },
    { label: t('documents.documentDetails.fieldLabels.contentType'), value: contentType },
    { label: t('documents.documentDetails.fieldLabels.lastSyncedBy'), value: lastSyncedBy },
    { label: t('documents.documentDetails.fieldLabels.lastSyncedTime'), value: lastSyncedTime },
    { label: t('documents.documentDetails.fieldLabels.errorMessage'), value: detailErrorMessage(obj) },
  ];
}

export interface DocumentDetailsModalProps {
  isOpen: boolean;
  sourceFileId: string | null;
  fileName: string;
  onClose: () => void;
}

export function DocumentDetailsModal({ isOpen, sourceFileId, fileName, onClose }: DocumentDetailsModalProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<{ label: string; value: string }[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !sourceFileId) {
      setRows(null);
      setLoadError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    setRows(null);

    void (async () => {
      try {
        const obj = await fetchSourceFileDetail(sourceFileId);
        if (cancelled) {
          return;
        }
        if (!obj || typeof obj !== 'object') {
          setLoadError(t('documents.documentDetails.loadError'));
          setRows(null);
        } else {
          setRows(mapSourceFileToDetailFields(obj as Record<string, unknown>, t));
        }
      } catch {
        if (!cancelled) {
          setLoadError(t('documents.documentDetails.loadError'));
          setRows(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, sourceFileId, t]);

  if (!isOpen) {
    return null;
  }

  const title = t('documents.documentDetails.titleWithFile', { fileName });

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center">
      <div className="bg-overlay absolute inset-0" onClick={onClose} role="presentation" />
      <div
        className="relative bg-primary rounded-sm shadow-menu p-6 flex flex-col"
        style={{ width: '560px', maxWidth: '90vw', maxHeight: '90vh' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-details-modal-title"
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div id="document-details-modal-title" className="text-md font-semibold pr-4">
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-secondary hover:text-primary transition-colors rounded-xs bg-transparent shrink-0"
            style={{ lineHeight: 1 }}
            aria-label={t('common.close')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 mb-6">
          {isLoading && <p className="text-sm text-secondary">{t('common.loadingEllipsis')}</p>}
          {!isLoading && loadError && <p className="text-sm text-danger">{loadError}</p>}
          {!isLoading && !loadError && rows && (
            <div className="space-y-4 py-1">
              {rows.map(({ label, value }) => (
                <div key={label}>
                  <div className="text-xs font-medium text-secondary uppercase tracking-wide">{label}</div>
                  <div className="text-sm text-primary mt-1 break-all whitespace-pre-wrap">{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="border-accent text-accent rounded-xs border bg-transparent px-4 py-2 text-sm transition-colors hover:bg-accent hover:text-inverse"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
