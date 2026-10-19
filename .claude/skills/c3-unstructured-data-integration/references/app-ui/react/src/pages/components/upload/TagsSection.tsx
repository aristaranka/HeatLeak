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

interface Tag {
  tagValue: string;
  tagType: string;
}

interface TagsSectionProps {
  tags: Tag[];
  onChange: (tags: Tag[]) => void;
}

const TagsSection: React.FC<TagsSectionProps> = ({ tags, onChange }) => {
  const { t } = useTranslation();
  const removeTag = (index: number) => {
    const newTags = tags.filter((_, i) => i !== index);
    onChange(newTags);
  };

  if (tags.length === 0) {
    return null;
  }

  return (
    <>
      {/* Tag count */}
      <div className="mt-4 mb-2">
        <span className="text-secondary text-sm font-medium">
          {tags.length === 1
            ? t('documents.upload.tagsAddedSingular', { count: tags.length })
            : t('documents.upload.tagsAddedPlural', { count: tags.length })}
        </span>
      </div>

      {/* Tag chips */}
      <div data-testid="tag-scrollable-container" className="mt-4 max-h-[120px] overflow-y-auto overflow-x-hidden">
        <div className="flex min-h-0 flex-wrap items-start gap-2">
          {tags.map((tag, index) => {
            // Create a unique key from tag properties
            const tagKey = `${tag.tagType || ''}-${tag.tagValue}-${index}`;
            return (
              <div
                key={tagKey}
                role="group"
                aria-label={
                  tag.tagType
                    ? t('documents.upload.tagGroupAria', { tagValue: tag.tagValue, category: tag.tagType })
                    : t('documents.upload.tagGroupAriaNoCategory', { tagValue: tag.tagValue })
                }
                className="border-strong rounded-pill inline-flex flex-shrink-0 items-center gap-1 border px-3 py-1 text-base leading-normal transition-all"
              >
                <span className="text-primary font-medium">{tag.tagValue}</span>
                {tag.tagType && (
                  <span data-testid="tag-separator" className="text-secondary">
                    •
                  </span>
                )}
                {tag.tagType && <span className="text-secondary">{tag.tagType}</span>}
                <button
                  onClick={() => removeTag(index)}
                  title={t('documents.upload.removeTagTitle')}
                  aria-label={t('documents.upload.removeTagAria', { tagValue: tag.tagValue })}
                  className="text-secondary ml-1 flex cursor-pointer items-center justify-center bg-transparent p-0.5 text-sm font-bold transition-colors hover:text-danger"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

export { TagsSection };
export type { Tag };
