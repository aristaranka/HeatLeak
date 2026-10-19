/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { getFileName } from '../upload/uploadUtils';
import { buildViewSourceFileHref } from '../../../shared/fileServletUrl';

/**
 * Minimal tag shape from `metadata.tags`, aligned with Genai.SourceFile.Metadata.Tag fields
 * used by GenAiUiDocumentTagsDetail (e.g. category.id for grouping).
 */
export interface DocumentMetadataTag {
  id?: string;
  label: string;
  metadataType?: string;
  category?: {
    id?: string;
    label?: string;
  };
  categoryLabel?: string;
  meta?: {
    updated?: string;
  };
  lastModifiedBy?: {
    email?: string;
  };
}

/**
 * Tags grouped for display (modal / detail). `categoryKey` matches GenAiUiDocumentTagsDetail’s
 * reduce key: `tag.category.id` when present; otherwise a trimmed category label (fallback when id is missing).
 */
export interface DocumentTagGroup {
  categoryKey: string;
  categoryLabel: string;
  tags: string[];
}

interface Document {
  id: string;
  name: string;
  originalFileUrl: string;
  displayUrl: string;
  status: string;
  sourceDirectory: string;
  contentSize: string;
  lastUpdated: string;
  tags: string;
  /** Raw tag rows from the fetch (for parity with GenAiUiDocumentTagsDetail data). */
  metadataTags?: DocumentMetadataTag[];
  /** Grouped by {@link DocumentTagGroup#categoryKey}. */
  tagGroups?: DocumentTagGroup[];
}

/**
 * Statuses that represent intermediate/in-progress states.
 * These get a trailing "..." appended when displayed.
 * Matches INTERMEDIATE_STATE_STATUSES from GenAiUiTransformUtil.ts
 */
const INTERMEDIATE_STATE_STATUSES = ['Syncing', 'Removing', 'Indexing', 'Chunking', 'Processing'];

/**
 * Statuses that trigger polling. Superset of INTERMEDIATE_STATE_STATUSES.
 * When any document has one of these statuses, the grid polls every 5s until all reach a final state.
 * Matches POLLING_STATE_STATUSES from GenAiUiTransformUtil.ts
 */
const POLLING_STATE_STATUSES = ['Syncing', 'Removing', 'Indexing', 'Chunking', 'Chunked', 'Deleted', 'Processing'];

/**
 * Convert bytes to human-readable file size string.
 * Matches bytesToFileSize from GenAiUiTransformUtil.ts
 */
function bytesToFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) {
    return '0 Bytes';
  }
  const i = parseInt(String(Math.floor(Math.log(bytes) / Math.log(1024))), 10);
  if (i === 0) {
    return `${bytes} ${sizes[i]}`;
  }

  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

/**
 * Convert an ISO timestamp string to a relative time string (e.g. "1 day ago", "2 hrs ago").
 * Matches getTimeElapsedString from GenAiUiTransformUtil.ts (without translation support).
 */
function getTimeElapsedString(isoTimestamp: string): string {
  const timestamp = new Date(isoTimestamp).getTime();
  const now = Date.now();
  const millisDiff = now - timestamp;

  if (millisDiff < 0 || isNaN(millisDiff)) {
    return '';
  }

  const intervalStrings = ['yr', 'mo', 'day', 'hr', 'min'];
  const millisPerMinute = 1000 * 60;
  const millisPerHour = millisPerMinute * 60;
  const millisPerDay = millisPerHour * 24;
  const millisPerMonth = millisPerDay * 30;
  const millisPerYear = millisPerDay * 365;
  const millisThresholds = [millisPerYear, millisPerMonth, millisPerDay, millisPerHour, millisPerMinute];

  for (const [i, threshold] of millisThresholds.entries()) {
    if (millisDiff >= threshold) {
      const count = Math.round(millisDiff / threshold);
      const timeInterval = intervalStrings[i] + (count !== 1 ? 's' : '');
      return count + ' ' + timeInterval + ' ago';
    }
  }

  return 'Just now';
}

/**
 * Get the displayed status from a source file object.
 * Uses statusHistory[0] if available (latest status), otherwise falls back to status.value.
 * Appends "..." for intermediate states.
 * Matches the logic in GenAiUiTransformSourceFileFetchResult.ts
 */
export function getDisplayedStatus(obj: any): string {
  const latestStatus = obj.statusHistory?.length ? obj.statusHistory[0] : obj.status;
  let displayedStatus = latestStatus?.value || '';
  if (INTERMEDIATE_STATE_STATUSES.indexOf(displayedStatus) > -1) {
    displayedStatus += '...';
  }

  return displayedStatus;
}

/**
 * Format tags from the metadata.tags array into a comma-separated string of labels.
 * Uses the same trimmed non-empty string rules as {@link normalizeMetadataTags} so the
 * flat `tags` string stays aligned with `metadataTags` indices.
 */
function formatTags(metadata: any): string {
  if (!metadata?.tags || !Array.isArray(metadata.tags)) {
    return '';
  }

  const labels: string[] = [];
  for (const tag of metadata.tags) {
    const rawLabel = tag?.label;
    const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';
    if (label) {
      labels.push(label);
    }
  }
  return labels.join(', ');
}

/**
 * Grouping key: prefer `tag.category.id` (same as GenAiUiDocumentTagsDetail); if absent, use
 * trimmed category label / categoryLabel so fetches without resolved category ids still split sensibly.
 */
function metadataTagGroupKey(tag: any): string {
  const id = tag?.category?.id;
  if (id !== undefined && id !== null && String(id).length > 0) {
    return String(id);
  }
  const rawCat = tag?.category?.label ?? tag?.categoryLabel ?? '';
  return typeof rawCat === 'string' ? rawCat.trim() : '';
}

function metadataTagCategoryLabel(tag: any): string {
  const fromCategory = tag?.category?.label;
  if (typeof fromCategory === 'string' && fromCategory.trim()) {
    return fromCategory.trim();
  }
  if (typeof tag?.categoryLabel === 'string' && tag.categoryLabel.trim()) {
    return tag.categoryLabel.trim();
  }
  return '';
}

function normalizeMetadataTags(metadata: any): DocumentMetadataTag[] | undefined {
  if (!metadata?.tags || !Array.isArray(metadata.tags)) {
    return undefined;
  }
  const out: DocumentMetadataTag[] = [];
  for (const tag of metadata.tags) {
    const rawLabel = tag?.label;
    const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';
    if (!label) {
      continue;
    }
    const cat = tag?.category;
    out.push({
      id: tag?.id,
      label,
      metadataType: tag?.metadataType,
      category: cat
        ? {
            id: cat?.id,
            label: cat?.label,
          }
        : undefined,
      categoryLabel: typeof tag?.categoryLabel === 'string' ? tag.categoryLabel : tag?.categoryLabel,
      meta: tag?.meta?.updated ? { updated: tag.meta.updated } : undefined,
      lastModifiedBy: tag?.lastModifiedBy?.email
        ? { email: tag.lastModifiedBy.email }
        : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Group metadata.tags for UI. Order matches first tag per group in the array.
 * Single group with no category key uses label "Tags" (flat-string parity).
 */
function buildTagGroups(metadata: any): DocumentTagGroup[] {
  if (!metadata?.tags || !Array.isArray(metadata.tags)) {
    return [];
  }

  const order: string[] = [];
  const map = new Map<string, { tags: string[]; categoryLabel: string }>();

  for (const tag of metadata.tags) {
    const rawLabel = tag?.label;
    const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';
    if (!label) {
      continue;
    }
    const key = metadataTagGroupKey(tag);
    const catLabel = metadataTagCategoryLabel(tag);
    if (!map.has(key)) {
      map.set(key, { tags: [], categoryLabel: catLabel });
      order.push(key);
    } else {
      const entry = map.get(key)!;
      if (!entry.categoryLabel && catLabel) {
        entry.categoryLabel = catLabel;
      }
    }
    map.get(key)!.tags.push(label);
  }

  if (order.length === 0) {
    return [];
  }
  if (order.length === 1 && order[0] === '') {
    const g = map.get('')!;
    return [{ categoryKey: '', categoryLabel: g.categoryLabel || 'Tags', tags: g.tags }];
  }

  return order.map((key) => {
    const g = map.get(key)!;
    return {
      categoryKey: key,
      categoryLabel: g.categoryLabel,
      tags: g.tags,
    };
  });
}

/**
 * Transform a single Genai.SourceFile object from the backend into our Document interface.
 * Mirrors mapSourceFileObj from GenAiUiTransformSourceFileFetchResult.ts
 */
function mapSourceFileToDocument(obj: any): Document {
  const originalFileUrl = typeof obj.originalFile?.url === 'string' ? obj.originalFile.url : '';
  const name = originalFileUrl ? getFileName(originalFileUrl) : '';
  // Build the HTTPS file-servlet link from the raw storage URL. The backend `displayUrl` is a
  // relative, unencoded `file/s3://…` path that a browser cannot open; buildViewSourceFileHref
  // URL-encodes the storage path and prefixes the app base so it targets the C3 file servlet.
  const displayUrl = buildViewSourceFileHref(originalFileUrl);
  const contentSizeBytes = obj.contentSize ?? obj.originalFile?.contentLength;
  const contentSize = typeof contentSizeBytes === 'number' ? bytesToFileSize(contentSizeBytes) : '0 Bytes';
  const lastUpdated = obj.meta?.updated ? getTimeElapsedString(obj.meta.updated) : '';
  const status = getDisplayedStatus(obj);
  const sourceDirectory = obj.collection?.name || '';
  const tags = formatTags(obj.metadata);
  const metadataTags = normalizeMetadataTags(obj.metadata);
  const tagGroups = buildTagGroups(obj.metadata);

  return {
    id: obj.id || '',
    name,
    originalFileUrl,
    displayUrl,
    status,
    sourceDirectory,
    contentSize,
    lastUpdated,
    tags,
    metadataTags,
    tagGroups: tagGroups.length > 0 ? tagGroups : undefined,
  };
}

/**
 * Transform the fetchForUser response into an array of Document objects.
 * Filters out deleted files, then maps each object.
 * Mirrors the transform function from GenAiUiTransformSourceFileFetchResult.ts
 */
function transformSourceFileFetchResult(fetchResult: any): {
  documents: Document[];
  count: number;
  hasMore: boolean;
} {
  if (!fetchResult?.objs || !Array.isArray(fetchResult.objs)) {
    return { documents: [], count: 0, hasMore: false };
  }

  const nonDeletedFiles = fetchResult.objs.filter((file: any) => file?.status?.value !== 'Deleted');

  const documents = nonDeletedFiles.map(mapSourceFileToDocument);

  return {
    documents,
    count: fetchResult.count ?? documents.length,
    hasMore: fetchResult.hasMore ?? false,
  };
}

/**
 * Build tag groups from normalized tags (same rules as {@link buildTagGroups} on fetch).
 */
export function documentTagGroupsFromMetadataTags(tags: DocumentMetadataTag[] | undefined): DocumentTagGroup[] {
  if (!tags?.length) {
    return [];
  }
  return buildTagGroups({ tags });
}

export type { Document };
export {
  INTERMEDIATE_STATE_STATUSES,
  POLLING_STATE_STATUSES,
  bytesToFileSize,
  getTimeElapsedString,
  transformSourceFileFetchResult,
};
