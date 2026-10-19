/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Tags } from 'lucide-react';

import { TagPill } from './TagPill';
import { TagsAdditionModal } from './TagsAdditionModal';
import {
  documentTagGroupsFromMetadataTags,
  type DocumentMetadataTag,
  type DocumentTagGroup,
} from '../utils/transformSourceFile';

import './TagsCell.scss';

interface TagsCellProps {
  tags: string;
  documentId?: string;
  documentName?: string;

  /** From fetch transform; grouping key matches GenAiUiDocumentTagsDetail (`category.id` preferred). */
  tagGroups?: DocumentTagGroup[];

  /** Raw `metadata.tags` rows for parity with GenAiUiDocumentTagsDetail. */
  metadataTags?: DocumentMetadataTag[];

  /** Refresh document list after tag edit/remove (e.g. `fetchDocuments(false)`). */
  onTagsChanged?: () => void | Promise<void>;

  /** When true, hide add-tag and tag pill mutations (read-only for users without doc-admin scope on documents). */
  readOnly?: boolean;
}

function categoryLabelForMeta(m: DocumentMetadataTag): string {
  return m.category?.label?.trim() || (typeof m.categoryLabel === 'string' ? m.categoryLabel.trim() : '') || '';
}

/** Resolve metadata for a tag label inside a modal group (handles duplicate labels across categories). */
function metadataForGroupTag(
  tagLabel: string,
  groupCategoryLabel: string,
  metadataTags: DocumentMetadataTag[] | undefined
): DocumentMetadataTag | undefined {
  if (!metadataTags?.length) {
    return undefined;
  }
  const groupCat = groupCategoryLabel.trim();
  const matches = metadataTags.filter((m) => m.label === tagLabel);
  if (matches.length <= 1) {
    return matches[0];
  }

  return (
    matches.find((m) => categoryLabelForMeta(m) === groupCat) ??
    matches.find((m) => !categoryLabelForMeta(m) && !groupCat) ??
    matches[0]
  );
}

/**
 * Resolve metadata for the flat grid pills: same ordering as the comma-separated `tags` string
 * (metadata iteration order). When duplicate labels exist, matches by occurrence index so inline
 * edit/remove use the same row as {@link metadataForGroupTag} in the modal.
 */
function metadataForFlatTag(
  tagLabel: string,
  flatIndex: number,
  flatTags: string[],
  metadataTags: DocumentMetadataTag[] | undefined
): DocumentMetadataTag | undefined {
  if (!metadataTags?.length) {
    return undefined;
  }
  if (flatTags.length === metadataTags.length && metadataTags[flatIndex]?.label === tagLabel) {
    return metadataTags[flatIndex];
  }
  let occurrence = 0;
  for (let i = 0; i < flatIndex; i++) {
    if (flatTags[i] === tagLabel) {
      occurrence++;
    }
  }
  const withLabel = metadataTags.filter((m) => m.label === tagLabel);
  return withLabel[occurrence];
}

export const TagsCell: React.FC<TagsCellProps> = ({
  tags,
  documentId,
  documentName,
  tagGroups,
  metadataTags,
  onTagsChanged,
  readOnly = false,
}) => {
  const { t } = useTranslation();
  const NUM_TAGS_TO_DISPLAY = 3;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddTagModalOpen, setIsAddTagModalOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Parse comma-separated tags string into array
  const tagsArray = tags
    ? tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
    : [];
  const tagsToRender = tagsArray.slice(0, NUM_TAGS_TO_DISPLAY);
  const remainingCount = tagsArray.length - NUM_TAGS_TO_DISPLAY;

  const groupsFromMetadata = documentTagGroupsFromMetadataTags(metadataTags);
  const modalTagGroups: DocumentTagGroup[] =
    tagGroups && tagGroups.length > 0
      ? tagGroups
      : groupsFromMetadata.length > 0
        ? groupsFromMetadata
        : tagsArray.length > 0
          ? [{ categoryKey: '', categoryLabel: t('tagsCell.tagsCategoryFallback'), tags: tagsArray }]
          : [];

  return (
    <>
      <div
        className={`relative -my-3 -mx-4 py-3 px-4 min-h-6 transition-colors ${isHovered ? 'bg-tertiary' : ''}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {!readOnly && (
          <button
            type="button"
            className="absolute top-2 right-2 text-secondary hover:text-accent transition-colors cursor-pointer bg-transparent border-none p-0"
            aria-label={`Add tag to ${documentName || 'document'}`}
            title={t('tagsCell.addTag')}
            onClick={(e) => {
              e.stopPropagation();
              setIsAddTagModalOpen(true);
            }}
          >
            <Plus size={14} />
          </button>
        )}
        <div className="genai-tags-cell__tag-stack flex flex-col">
          {tagsToRender.map((tag, index) => {
            const meta = metadataForFlatTag(tag, index, tagsArray, metadataTags);
            return (
              <TagPill
                key={meta?.id ?? `${tag}-${index}`}
                tag={tag}
                tagContext={meta}
                sourceFileId={documentId}
                onTagsMutated={onTagsChanged}
                readOnly={readOnly}
              />
            );
          })}
          {remainingCount > 0 && (
            <button
              type="button"
              className="genai-tags-cell__overflow-btn flex items-center cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                setIsModalOpen(true);
              }}
            >
              <span className="genai-tags-cell__overflow-label">{`+${remainingCount}`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tags Detail Modal */}
      {isModalOpen && (
        <div
          className="genai-tags-cell__modal-backdrop fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setIsModalOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsModalOpen(false);
            }
          }}
          role="presentation"
          aria-label={t('common.modalBackdrop')}
        >
          <div
            className="genai-tags-cell__modal-dialog c3-card bg-primary rounded"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tags-modal-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-weak gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Tags className="text-secondary shrink-0" size={16} aria-hidden />
                <h3 id="tags-modal-title" className="text-md font-semibold text-primary truncate">
                  {t('tagsCell.modalTitle', {
                    fileName: documentName || t('tagsCell.documentFallback'),
                  })}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-secondary hover:text-primary transition-colors"
                aria-label={t('common.closeModal')}
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              {modalTagGroups.length === 0 ? (
                <div className="genai-ui-document-tags-empty text-secondary">{t('tagsCell.noTagsAvailable')}</div>
              ) : (
                modalTagGroups.map((group, groupIndex) => (
                  <div
                    key={`${group.categoryKey}-${groupIndex}`}
                    className="genai-tags-cell__group-card rounded border border-weak p-3 bg-primary"
                  >
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      {group.categoryLabel ? (
                        <h4 className="text-base font-semibold text-primary m-0">{group.categoryLabel}</h4>
                      ) : null}
                      <span className="genai-tags-cell__count-badge text-sm text-secondary px-2 py-0.5 rounded-full border border-weak inline-flex items-center">
                        {group.tags.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.tags.map((tag, index) => {
                        const meta = metadataForGroupTag(tag, group.categoryLabel, metadataTags);
                        return (
                          <TagPill
                            key={meta?.id ?? `${group.categoryKey}-${tag}-${index}`}
                            tag={tag}
                            tagContext={meta}
                            sourceFileId={documentId}
                            onTagsMutated={onTagsChanged}
                            readOnly={readOnly}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {!readOnly && (
        <TagsAdditionModal
          isOpen={isAddTagModalOpen}
          onClose={() => setIsAddTagModalOpen(false)}
          sourceFileId={documentId}
          onTagAdded={onTagsChanged}
          documentName={documentName}
        />
      )}
    </>
  );
};
