/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Check } from 'lucide-react';

import { useBanner } from '../../../contexts/BannerContext';
import { addSourceFileManualTag, fetchSourceFileMetadataCategoryLabels } from '../../../shared/api';

import './TagsAdditionModal.scss';

interface TagsAdditionModalProps {
  isOpen: boolean;
  onClose: () => void;

  /** Source file id for Genai.SourceFile.addManualTag (same as GenAiUiManageDocumentTagsPopover request payload). */
  sourceFileId?: string;

  /** Invoked after a tag is added successfully (e.g. refresh grid). */
  onTagAdded?: () => void | Promise<void>;
  documentName?: string;
}

export function TagsAdditionModal({ isOpen, onClose, sourceFileId, onTagAdded, documentName }: TagsAdditionModalProps) {
  void documentName;

  const { t } = useTranslation();
  const { showBanner } = useBanner();
  const [category, setCategory] = useState('');
  const [tagValue, setTagValue] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesLoadFailed, setCategoriesLoadFailed] = useState(false);
  const [submitPending, setSubmitPending] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);

  const resetForm = useCallback(() => {
    setCategory('');
    setTagValue('');
    setCategoriesLoadFailed(false);
    setCategoryOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetForm();
      return;
    }

    let cancelled = false;
    setCategoriesLoading(true);
    setCategoriesLoadFailed(false);
    fetchSourceFileMetadataCategoryLabels()
      .then((labels) => {
        if (!cancelled) {
          setCategories(labels);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategories([]);
          setCategoriesLoadFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCategoriesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, resetForm]);

  const handleClose = () => {
    if (submitPending) {
      return;
    }
    resetForm();
    onClose();
  };

  const canSubmitToApi = Boolean(sourceFileId?.trim());
  const isFormValid = category.trim() !== '' && tagValue.trim() !== '' && canSubmitToApi;
  const addDisabled =
    !isFormValid || submitPending || categoriesLoading || categories.length === 0 || categoriesLoadFailed;

  const handleAddTag = async () => {
    if (!isFormValid || submitPending) {
      return;
    }
    const cat = category.trim();
    const tag = tagValue.trim();
    setSubmitPending(true);
    try {
      await addSourceFileManualTag(sourceFileId!, tag, cat);
      let refreshFailed = false;
      if (onTagAdded) {
        try {
          await onTagAdded();
        } catch {
          refreshFailed = true;
        }
      }
      if (refreshFailed) {
        showBanner('warning', t('tagsAdditionModal.bannerRefreshWarning'));
      } else {
        showBanner('success', t('tagsAdditionModal.bannerTagAdded'));
      }
      resetForm();
      onClose();
    } catch {
      showBanner('error', t('tagsAdditionModal.bannerAddError'));
    } finally {
      setSubmitPending(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} role="presentation" />
      <div
        className="relative w-[412px] max-w-[90vw] bg-primary rounded-sm p-3 shadow-light-03"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-tag-modal-title"
      >
        <div className="flex items-center justify-between mb-2">
          <h2 id="add-tag-modal-title" className="text-lg font-semibold text-primary">
            {t('tagsAdditionModal.title')}
          </h2>
          <button
            onClick={handleClose}
            disabled={submitPending}
            className="p-1 text-secondary hover:text-primary transition-colors rounded border-none bg-transparent leading-none disabled:opacity-50"
            aria-label={t('tagsAdditionModal.closeAriaLabel')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleAddTag();
          }}
        >
          {!canSubmitToApi ? (
            <p className="text-sm text-secondary m-0" role="status">
              {t('tagsAdditionModal.noDocumentIdMessage')}
            </p>
          ) : null}

          <div>
            <label htmlFor="add-tag-category" className="block text-base font-medium mb-1 text-primary">
              {t('tagsAdditionModal.categoryLabel')} <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <button
                id="add-tag-category"
                type="button"
                disabled={submitPending || categoriesLoading}
                className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-xs border bg-primary px-3 py-2 text-sm transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-60 ${
                  categoryOpen ? 'border-accent' : 'border-weak'
                }`}
                onClick={() => setCategoryOpen((open) => !open)}
                aria-expanded={categoryOpen}
                aria-haspopup="listbox"
                aria-label={t('tagsAdditionModal.categoryLabel')}
              >
                <span className={`flex-1 text-left ${category ? 'text-primary' : 'text-secondary'}`}>
                  {category ||
                    (categoriesLoading
                      ? t('tagsAdditionModal.categoryOptionLoading')
                      : t('tagsAdditionModal.categoryOptionSelect'))}
                </span>
                <ChevronDown
                  className={`text-secondary text-xs transition-transform flex-shrink-0 ${categoryOpen ? 'rotate-180' : ''}`}
                  size={12}
                />
              </button>
              {categoryOpen ? (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setCategoryOpen(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setCategoryOpen(false);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={t('common.closeDropdown')}
                  />
                  <div
                    className="bg-menu border-weak shadow-menu absolute top-full left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-xs border"
                    role="listbox"
                  >
                    {categories.map((label) => {
                      const selected = category === label;
                      return (
                        <button
                          key={label}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                            selected ? 'bg-accent-weak text-accent' : 'text-primary hover:bg-hover'
                          }`}
                          onClick={() => {
                            setCategory(label);
                            setCategoryOpen(false);
                          }}
                        >
                          <span>{label}</span>
                          {selected ? <Check className="text-accent flex-shrink-0" size={14} /> : null}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
            {categoriesLoadFailed ? (
              <p className="text-sm text-danger mt-1 m-0" role="alert">
                {t('tagsAdditionModal.categoriesLoadError')}
              </p>
            ) : null}
          </div>

          <p className="text-sm text-secondary">{t('tagsAdditionModal.metadataHint')}</p>

          <div>
            <label htmlFor="add-tag-value" className="block text-base font-medium mb-1 text-primary">
              {t('tagsAdditionModal.tagValueLabel')} <span className="text-red-500">*</span>
            </label>
            <input
              id="add-tag-value"
              type="text"
              value={tagValue}
              onChange={(e) => setTagValue(e.target.value)}
              placeholder={t('tagsAdditionModal.tagValuePlaceholder')}
              disabled={submitPending}
              className="genai-tags-addition-modal__field-control c3-input w-full text-sm rounded border border-border"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitPending}
              className="genai-tags-addition-modal__btn-cancel py-1.5 px-3 text-base rounded transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {t('tagsAdditionModal.cancel')}
            </button>
            <button
              type="submit"
              disabled={addDisabled}
              className="genai-tags-addition-modal__btn-submit py-1.5 px-3 text-base rounded transition-colors disabled:cursor-not-allowed"
            >
              {submitPending ? t('tagsAdditionModal.adding') : t('tagsAdditionModal.addTag')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
