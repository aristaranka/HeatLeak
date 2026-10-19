/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import cn from 'classnames';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2, X } from 'lucide-react';

import type { DocumentMetadataTag } from '../utils/transformSourceFile';
import { removeSourceFileManualTag, updateSourceFileManualTag } from '../../../shared/api';
import { useBanner } from '../../../contexts/BannerContext';

import './TagPill.scss';

function formatTagUpdated(iso: string | undefined, dashPlaceholder: string): string {
  if (!iso) {
    return dashPlaceholder;
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return dashPlaceholder;
  }
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function categoryDisplayName(ctx?: DocumentMetadataTag): string {
  return ctx?.category?.label?.trim() || ctx?.categoryLabel?.trim() || '';
}

export interface TagPillProps {
  /** Label shown in the pill (may be truncated visually by parent styles). */
  tag: string;
  /** When set with `sourceFileId` and `id`, edit/delete call Genai.SourceFile manual tag APIs. */
  tagContext?: DocumentMetadataTag;
  sourceFileId?: string;
  /** Called after a successful edit or remove (e.g. refresh grid). */
  onTagsMutated?: () => void | Promise<void>;
  /** Legacy: invoked when not using API-backed mutation. */
  onEdit?: () => void;
  /** Legacy: invoked when not using API-backed mutation. */
  onDelete?: () => void;
  /** When true, hide edit/remove affordances (documents grid read-only for non–doc-admin users). */
  readOnly?: boolean;
}

export const TagPill: React.FC<TagPillProps> = ({
  tag,
  tagContext,
  sourceFileId,
  onTagsMutated,
  onEdit,
  onDelete,
  readOnly = false,
}) => {
  const { t } = useTranslation();
  const { showBanner } = useBanner();

  const validateEditTagForm = useCallback(
    (newTagLabel: string, currentTagLabel: string): string => {
      if (newTagLabel === currentTagLabel) {
        return t('tagPill.validationMustDiffer');
      }
      return '';
    },
    [t]
  );

  const [isHovered, setIsHovered] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [newLabel, setNewLabel] = useState(tag);
  const [editError, setEditError] = useState('');
  const [pending, setPending] = useState(false);
  const editDialogRef = useRef<HTMLDivElement>(null);
  const removeDialogRef = useRef<HTMLDivElement>(null);

  const useInternalMutation = Boolean(sourceFileId && tagContext?.id);

  useEffect(() => {
    if (!editOpen && !removeOpen) {
      return;
    }
    const onDocumentKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || pending) {
        return;
      }
      e.preventDefault();
      if (editOpen) {
        setEditOpen(false);
      }
      if (removeOpen) {
        setRemoveOpen(false);
      }
    };
    document.addEventListener('keydown', onDocumentKeyDown, true);
    return () => document.removeEventListener('keydown', onDocumentKeyDown, true);
  }, [editOpen, removeOpen, pending]);

  useLayoutEffect(() => {
    if (editOpen && editDialogRef.current) {
      editDialogRef.current.focus();
    }
  }, [editOpen]);

  useLayoutEffect(() => {
    if (removeOpen && removeDialogRef.current) {
      removeDialogRef.current.focus();
    }
  }, [removeOpen]);

  const openEdit = useCallback(() => {
    if (readOnly) {
      return;
    }
    if (useInternalMutation) {
      setNewLabel(tagContext?.label ?? tag);
      setEditError('');
      setEditOpen(true);
      return;
    }
    onEdit?.();
  }, [readOnly, useInternalMutation, tagContext?.label, tag, onEdit]);

  const openRemove = useCallback(() => {
    if (readOnly) {
      return;
    }
    if (useInternalMutation) {
      setRemoveOpen(true);
      return;
    }
    onDelete?.();
  }, [readOnly, useInternalMutation, onDelete]);

  useEffect(() => {
    if (editOpen) {
      setNewLabel(tagContext?.label ?? tag);
      setEditError('');
    }
  }, [editOpen, tagContext?.label, tag]);

  const showActionIcons = !readOnly && isHovered && (useInternalMutation || onEdit || onDelete);

  const handleNewLabelChange = (value: string) => {
    setNewLabel(value);
    setEditError(validateEditTagForm(value.trim(), tagContext?.label ?? tag));
  };

  const handleSaveEdit = async () => {
    if (!sourceFileId || !tagContext?.id) {
      return;
    }
    const trimmed = newLabel.trim();
    const err = validateEditTagForm(trimmed, tagContext.label);
    if (err) {
      setEditError(err);
      return;
    }
    setPending(true);
    try {
      await updateSourceFileManualTag(sourceFileId, { id: tagContext.id }, trimmed);
      showBanner('success', t('tagPill.bannerUpdated'));
      setEditOpen(false);
      await onTagsMutated?.();
    } catch {
      showBanner('error', t('tagPill.errorUpdate'));
    } finally {
      setPending(false);
    }
  };

  const handleConfirmRemove = async () => {
    if (!sourceFileId || !tagContext?.id) {
      return;
    }
    setPending(true);
    try {
      await removeSourceFileManualTag(sourceFileId, { id: tagContext.id });
      showBanner('success', t('tagPill.bannerRemoved'));
      setRemoveOpen(false);
      await onTagsMutated?.();
    } catch {
      showBanner('error', t('tagPill.errorRemove'));
    } finally {
      setPending(false);
    }
  };

  const dashPlaceholder = t('tagPill.unknownCategoryPlaceholder');
  const removeMessagePath = `${categoryDisplayName(tagContext) || t('tagPill.tagTypeFallback')}/${tagContext?.label ?? tag}`;

  const editModal =
    editOpen &&
    createPortal(
      <div
        className="genai-tag-pill__modal-backdrop fixed inset-0 z-[60] flex items-center justify-center"
        role="presentation"
        onClick={() => !pending && setEditOpen(false)}
      >
        <div
          ref={editDialogRef}
          className="c3-card bg-primary rounded shadow-lg max-w-lg w-[90%] max-h-[90vh] overflow-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tag-pill-edit-title"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-weak">
            <h2 id="tag-pill-edit-title" className="text-lg font-semibold text-primary m-0">
              {t('tagPill.editTagTitle')}
            </h2>
            <button
              type="button"
              className="text-secondary hover:text-primary p-1"
              aria-label={t('common.close')}
              disabled={pending}
              onClick={() => setEditOpen(false)}
            >
              <X size={14} />
            </button>
          </div>
          <div className="p-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4 border-b border-weak pb-4">
              <div>
                <div className="text-xs text-secondary uppercase tracking-wide mb-1">{t('tagPill.userLastUpdated')}</div>
                <div className="text-sm font-semibold text-primary">
                  {tagContext?.lastModifiedBy?.email || t('tagPill.updatedBySystem')}
                </div>
              </div>
              <div>
                <div className="text-xs text-secondary uppercase tracking-wide mb-1">{t('tagPill.timeLastUpdated')}</div>
                <div className="text-sm font-semibold text-primary">
                  {formatTagUpdated(tagContext?.meta?.updated, dashPlaceholder)}
                </div>
              </div>
            </div>
            <p className="text-sm text-primary m-0">
              {t('tagPill.renameDescription', {
                value: tagContext?.label ?? tag,
                category: categoryDisplayName(tagContext) || dashPlaceholder,
              })}
            </p>
            <div className="flex flex-col gap-1">
              <label htmlFor="tag-pill-edit-input" className="text-sm font-medium text-primary">
                {t('tagPill.tagValueLabel')}
              </label>
              <input
                id="tag-pill-edit-input"
                type="text"
                className="w-full border border-weak rounded px-3 py-2 text-primary bg-primary"
                value={newLabel}
                disabled={pending}
                aria-invalid={Boolean(editError)}
                onChange={(e) => handleNewLabelChange(e.target.value)}
              />
              {editError ? <span className="text-sm text-red-600">{editError}</span> : null}
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                className="genai-tag-pill__btn genai-tag-pill__btn--outline-accent py-1.5 px-3 text-sm font-medium rounded transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={pending}
                onClick={() => setEditOpen(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="genai-tag-pill__btn genai-tag-pill__btn--solid-accent py-1.5 px-3 text-sm font-medium rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending || !newLabel.trim() || Boolean(validateEditTagForm(newLabel.trim(), tagContext?.label ?? tag))}
                onClick={() => void handleSaveEdit()}
              >
                {t('tagPill.saveChangesButton')}
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );

  const removeModal =
    removeOpen &&
    createPortal(
      <div
        className="genai-tag-pill__modal-backdrop fixed inset-0 z-[60] flex items-center justify-center"
        role="presentation"
        onClick={() => !pending && setRemoveOpen(false)}
      >
        <div
          ref={removeDialogRef}
          className="c3-card bg-primary rounded shadow-lg max-w-md w-[90%]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tag-pill-remove-title"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-weak">
            <h2 id="tag-pill-remove-title" className="text-lg font-semibold text-primary m-0">
              {t('tagPill.removeTagTitle')}
            </h2>
            <button
              type="button"
              className="text-secondary hover:text-primary p-1"
              aria-label={t('common.close')}
              disabled={pending}
              onClick={() => setRemoveOpen(false)}
            >
              <X size={14} />
            </button>
          </div>
          <div className="p-4 flex flex-col gap-4">
            <p className="text-sm text-primary m-0">{t('tagPill.removeConfirm', { path: removeMessagePath })}</p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="genai-tag-pill__btn genai-tag-pill__btn--outline-danger py-1.5 px-3 text-sm font-medium rounded transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={pending}
                onClick={() => setRemoveOpen(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="genai-tag-pill__btn genai-tag-pill__btn--solid-danger py-1.5 px-3 text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={pending}
                onClick={() => void handleConfirmRemove()}
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <>
      <div
        className={cn('genai-tag-pill__surface', isHovered && 'genai-tag-pill__surface--hovered')}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <span className="genai-tag-pill__label" title={tag}>
          {tag}
        </span>
        {showActionIcons && (
          <div className="flex items-center gap-1 ml-1">
            {(useInternalMutation || onEdit) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openEdit();
                }}
                className="genai-tag-pill__icon-btn"
                aria-label={t('tagPill.editTag')}
              >
                <Pencil className="text-xs" size={10} />
              </button>
            )}
            {(useInternalMutation || onDelete) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openRemove();
                }}
                className="genai-tag-pill__icon-btn"
                aria-label={t('tagPill.removeTag')}
              >
                <Trash2 className="text-xs" size={10} />
              </button>
            )}
          </div>
        )}
      </div>
      {editModal}
      {removeModal}
    </>
  );
};
