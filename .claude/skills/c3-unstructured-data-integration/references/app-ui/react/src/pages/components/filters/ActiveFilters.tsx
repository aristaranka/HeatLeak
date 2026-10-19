/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React from 'react';
import { X } from 'lucide-react';

import { getStatusLabel } from '../utils/statusUtils';

interface ActiveFiltersProps {
  statusFilters: string[];
  sourceDirectoryFilters: string[];
  tagFilters: string[];
  getTagFilterLabel?: (value: string) => string;
  onRemoveStatusFilter: (value: string) => void;
  onRemoveSourceDirectoryFilter: (value: string) => void;
  onRemoveTagFilter: (value: string) => void;
}

export const ActiveFilters: React.FC<ActiveFiltersProps> = ({
  statusFilters,
  sourceDirectoryFilters,
  tagFilters,
  getTagFilterLabel,
  onRemoveStatusFilter,
  onRemoveSourceDirectoryFilter,
  onRemoveTagFilter,
}) => {
  if (statusFilters.length === 0 && sourceDirectoryFilters.length === 0 && tagFilters.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      {statusFilters.map((value) => (
        <div
          key={`status-${value}`}
          className="bg-tertiary flex items-center gap-2 rounded-xs px-4 py-2 text-sm text-primary"
        >
          <span>{getStatusLabel(value)}</span>
          <button
            type="button"
            onClick={() => onRemoveStatusFilter(value)}
            className="text-secondary hover:text-primary transition-colors ml-1"
            aria-label={`Remove ${getStatusLabel(value)} status filter`}
          >
            <X className="text-xs" size={10} />
          </button>
        </div>
      ))}
      {sourceDirectoryFilters.map((value) => (
        <div
          key={`dir-${value}`}
          className="bg-tertiary flex items-center gap-2 rounded-xs px-4 py-2 text-sm text-primary"
        >
          <span>{value}</span>
          <button
            type="button"
            onClick={() => onRemoveSourceDirectoryFilter(value)}
            className="text-secondary hover:text-primary transition-colors ml-1"
            aria-label={`Remove ${value} source directory filter`}
          >
            <X className="text-xs" size={10} />
          </button>
        </div>
      ))}
      {tagFilters.map((value) => (
        <div
          key={`tag-${value}`}
          className="bg-tertiary flex items-center gap-2 rounded-xs px-4 py-2 text-sm text-primary"
        >
          <span>{getTagFilterLabel ? getTagFilterLabel(value) : value}</span>
          <button
            type="button"
            onClick={() => onRemoveTagFilter(value)}
            className="text-secondary hover:text-primary transition-colors ml-1"
            aria-label={`Remove ${getTagFilterLabel ? getTagFilterLabel(value) : value} tag filter`}
          >
            <X className="text-xs" size={10} />
          </button>
        </div>
      ))}
    </div>
  );
};
