/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import axios from 'axios';

import { User, UserGroup } from '../Interfaces';
import { c3Action, getAppBaseUrl } from '../c3Action';

/**
 * Helper: POST to C3 API with spec-only payload (no typeName prepended in body).
 * The typeName and actionName are already encoded in the URL path.
 */
async function c3Post(typeName: string, actionName: string, spec?: any): Promise<any> {
  const appBaseUrl = getAppBaseUrl();
  const url = `${appBaseUrl}/api/8/${typeName}/${actionName}`;
  const payload = spec !== undefined ? JSON.stringify(spec) : undefined;
  const response = await axios.post(url, payload, { withCredentials: true });
  return response.data;
}

/** Escape a value for use inside a single-quoted C3 filter literal. */
function escapeFilterLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Wrap comma-separated OR clauses in a parenthesized group, or return null when empty. */
function orGroup(clauses: string[]): string | null {
  const nonEmpty = clauses.filter(Boolean);
  if (nonEmpty.length === 0) {
    return null;
  }

  return `(${nonEmpty.join(' || ')})`;
}

function sourceFileRefsFromIds(fileIds: string[]): Array<{ id: string }> {
  return fileIds.map((id) => ({ id }));
}

const SOURCE_FILE_DETAIL_INCLUDE =
  'status.errorMessage, status.value, statusHistory[0].transformedError, statusHistory[0].value, collection.name, originalFile.url, modifiedTimeWhenLastProcessed, originalFile.contentLength, contentSize, displayLastProcessedBy, meta.updated';

/**
 * Update a manual tag label (Genai.SourceFile.updateManualTag).
 */
export async function updateSourceFileManualTag(
  sourceFileId: string,
  oldTag: { id: string },
  newTagLabel: string
): Promise<unknown> {
  return c3Action('Genai.SourceFile', 'updateManualTag', [{ id: sourceFileId }, { id: oldTag.id }, newTagLabel]);
}

/**
 * Remove a manual tag (Genai.SourceFile.removeManualTag).
 */
export async function removeSourceFileManualTag(sourceFileId: string, tag: { id: string }): Promise<unknown> {
  return c3Action('Genai.SourceFile', 'removeManualTag', [{ id: sourceFileId }, { id: tag.id }]);
}

/**
 * Add a manual tag (Genai.SourceFile.addManualTag). Same flow as GenAiUi addTagToDocumentAction payload.
 */
export async function addSourceFileManualTag(
  sourceFileId: string,
  tagLabel: string,
  categoryLabel: string
): Promise<unknown> {
  return c3Action('Genai.SourceFile', 'addManualTag', [{ id: sourceFileId }, tagLabel, categoryLabel]);
}

/**
 * Category labels for manual tag UI (Genai.SourceFile.Metadata.Category fetch), aligned with GenAiUiHelpers.getCategoriesData.
 */
export async function fetchSourceFileMetadataCategoryLabels(): Promise<string[]> {
  const response = await c3Post('Genai.SourceFile.Metadata.Category', 'fetch', {
    spec: { include: 'label', limit: -1, order: 'ascending(label)' },
  });
  const raw = response?.response !== undefined ? response.response : response;
  const objs = (raw?.objs ?? []) as Array<{ label?: string }>;
  const labels = objs
    .map((o) => (typeof o.label === 'string' ? o.label.trim() : ''))
    .filter((l): l is string => Boolean(l));
  return Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b));
}

export const fetchUsers = async (): Promise<User[]> => {
  const response = await c3Action('User', 'fetch', [{ limit: -1 }]);
  return response.objs;
};

export const fetchUserGroups = async (): Promise<UserGroup[]> => {
  const response = await c3Action('UserGroup', 'fetch', [{ limit: -1 }]);
  return response.objs;
};

/**
 * Get the mount URL for file storage (e.g. Azure/GCS).
 * Returns the base URL like "azure://plat/tenant/app/dl/"
 */
export const getUrlFromMount = async (mount: string): Promise<string> => {
  const response = await c3Post('FileSystem', 'urlFromMount', { mount });
  return response?.response || response;
};

/**
 * Upload files from the tmp directory into a source collection.
 *
 * `Genai.SourceCollection.Utils.upload` expects its first parameter,
 * `collectionWithFilesMap`, to be a **non-null array** of
 * `Genai.SourceFile.UploadMapping` (`![Genai.SourceFile.UploadMapping]`) — one mapping per
 * target collection. The caller supplies a single `{ collection, files }` mapping for the
 * current upload, so we wrap it in an array here before posting. Sending the bare object
 * (as an earlier version did) makes the server reject the call with
 * `Invalid value ... for parameter: collectionWithFilesMap`, leaving the returned file list
 * null and causing the downstream `processWithPipeline` call to fail with
 * `Invalid value null for parameter: files`.
 *
 * The action returns `![Genai.SourceFile]`; we normalize the various REST envelope shapes
 * (bare array, `{ objs }`, `{ value }`, `{ response }`) down to the array of uploaded files
 * so callers always receive `Array<{ id }>` to hand to {@link processSourceFilesWithPipeline}.
 */
export const uploadToSourceCollection = async (spec: {
  collectionWithFilesMap: { collection: { id: string } | null; files: string[] };
  transitionToChunking: boolean;
  tags: Array<{ label: string; categoryLabel: string; metadataType: string }>;
}): Promise<Array<{ id: string }>> => {
  const response = await c3Post('Genai.SourceCollection.Utils', 'upload', {
    collectionWithFilesMap: [spec.collectionWithFilesMap],
    transitionToChunking: spec.transitionToChunking,
    tags: spec.tags,
  });

  const unwrapped = response?.response ?? response;
  const files = Array.isArray(unwrapped)
    ? unwrapped
    : (unwrapped?.objs ?? unwrapped?.value ?? []);
  return (Array.isArray(files) ? files : []) as Array<{ id: string }>;
};

/**
 * Process uploaded source files for indexing.
 */
export const processSourceFiles = async (files: any[]): Promise<any> => {
  return await c3Post('Genai.SourceFile', 'process', { files });
};

/**
 * Delete files from the filesystem (e.g. cleanup tmp files).
 */
export const deleteFilesBatch = async (files: string[]): Promise<any> => {
  return await c3Post('FileSystem', 'deleteFilesBatch', { files });
};

/**
 * Fetch source files for the current user's active project.
 * Uses the same spec as the original app's DocumentsGrid.
 * The backend defaults to User.myUser() if no user is provided.
 *
 * Callers that paginate should always pass explicit `limit` and `offset`; the previous
 * hard `limit: 10` default caused the grid to silently load only the 10 most-recently-updated
 * files (DOCAI-250), making search/filter/pagination operate over just those rows.
 */
export const fetchSourceFiles = async (spec?: {
  limit?: number;
  offset?: number;
  filter?: string;
  order?: string;
  include?: string;
}): Promise<any> => {
  const defaultSpec = {
    limit: 10,
    include:
      'displayUrl, originalFile.url, meta.updated, originalFile.contentLength, contentSize, status.value, status.errorMessage, statusHistory[0].value, statusHistory[0].transformedError, collection.name, { metadata: [tags.id, tags.metadataType, tags.lastModifiedBy.email, tags.label, tags.category.label, tags.category.id, tags.meta.createdBy, tags.meta.updated] }',
    order: 'descending(meta.updated)',
    ...spec,
  };

  const response = await c3Post('Genai.SourceFile', 'fetch', { spec: defaultSpec });
  return response;
};

/** Always-applied base filter for the Documents grid (excludes soft-deleted files). */
export const SOURCE_FILE_NOT_DELETED_FILTER = "status.value != 'Deleted'";

/*
 * Raw `status.value` enum values the bulk Process / Unprocess actions apply to. These mirror the
 * normalized PROCESSABLE_STATUSES / UNPROCESSABLE_STATUSES sets in pages/components/utils/statusUtils.ts
 * (kept as raw strings here because server filters match against the raw enum).
 */
export const PROCESSABLE_STATUS_VALUES = ['Not Indexed', 'Needs Re-indexing', 'Failed'] as const;
export const UNPROCESSABLE_STATUS_VALUES = ['Indexed', 'Needs Removal'] as const;

/**
 * ANDs an existing grid filter with an OR-group restricting to the given `status.value`s.
 * Used to scope "select all N" bulk actions/counts to only the files an action validly applies to.
 */
export const withStatusValues = (baseFilter: string, statusValues: readonly string[]): string => {
  const statusGroup = statusValues.map((s) => `status.value == '${escapeFilterLiteral(s)}'`).join(' || ');
  if (!statusGroup) {
    return baseFilter;
  }

  return baseFilter ? `(${baseFilter}) && (${statusGroup})` : `(${statusGroup})`;
};

/**
 * Inputs for {@link buildSourceFileFilter}. Mirrors the Documents grid controls:
 * a free-text search, plus multi-select Status / Source Directory / Tag filters.
 */
export interface SourceFileFilterInput {
  /** Free-text search matched (case-insensitively) against the file URL / name. */
  search?: string;

  /** Selected `status.value` enum values (OR'd together). */
  statuses?: string[];

  /** Selected `collection.name` source directories (OR'd together). */
  sourceDirectories?: string[];

  /**
   * Selected tag filter values from {@link fetchSourceFileMetadataTagFilterOptions}:
   * a bare category label, or `category${TAG_FILTER_VALUE_SEPARATOR}tagLabel` (OR'd together).
   */
  tagFilterValues?: string[];
}

/**
 * Build a server-side C3 filter expression for the Documents grid so search / status /
 * source-directory / tag filters query the whole corpus instead of the first page of rows.
 *
 * Groups are AND'd together; values within a group are OR'd. The not-deleted base filter is
 * always applied. Returns just the not-deleted filter when no user filters are set.
 */
export const buildSourceFileFilter = (input: SourceFileFilterInput = {}): string => {
  const groups: string[] = [SOURCE_FILE_NOT_DELETED_FILTER];

  const search = input.search?.trim();
  if (search) {
    const needle = escapeFilterLiteral(search.toLowerCase());
    groups.push(`contains(lowerCase(originalFile.url), '${needle}')`);
  }

  const statuses = input.statuses ?? [];
  const statusGroup = orGroup(statuses.map((s) => `status.value == '${escapeFilterLiteral(s)}'`));
  if (statusGroup) {
    groups.push(statusGroup);
  }

  const dirs = (input.sourceDirectories ?? []).filter(Boolean);
  if (dirs.length > 0) {
    groups.push(`intersects(collection.name, [${dirs.map((d) => `'${escapeFilterLiteral(d)}'`).join(', ')}])`);
  }

  const tagValues = input.tagFilterValues ?? [];
  const tagClauses: string[] = [];
  for (const value of tagValues) {
    const sepIdx = value.indexOf(TAG_FILTER_VALUE_SEPARATOR);
    if (sepIdx === -1) {
      // Category-only filter: any tag in this category.
      tagClauses.push(`intersects(metadata.tags.category.label, ['${escapeFilterLiteral(value)}'])`);
    } else {
      // Specific tag within a category.
      const tagLabel = value.slice(sepIdx + TAG_FILTER_VALUE_SEPARATOR.length);
      if (tagLabel) {
        tagClauses.push(`intersects(metadata.tags.label, ['${escapeFilterLiteral(tagLabel)}'])`);
      }
    }
  }
  const tagGroup = orGroup(tagClauses);
  if (tagGroup) {
    groups.push(tagGroup);
  }

  return groups.join(' && ');
};

/**
 * Load a single source file for the document details modal (same fields as SDL definition list).
 */
export const fetchSourceFileDetail = async (id: string): Promise<any> => {
  const raw = await c3Post('Genai.SourceFile', 'get', {
    this: { id },
    include: SOURCE_FILE_DETAIL_INCLUDE,
  });
  return raw?.response ?? raw;
};

/**
 * Fetch total count of non-deleted source files for the current user.
 * Used for pagination total count.
 */
export const fetchSourceFilesCount = async (spec?: { filter?: string }): Promise<number> => {
  const defaultSpec = {
    ...spec,
  };

  const response = await c3Post('Genai.SourceFile', 'fetchCount', { spec: defaultSpec });
  return response?.response ?? response ?? 0;
};

/**
 * Fetch the ids of every source file matching a filter (across all pages), for "select all N"
 * bulk actions where the user selects the whole filtered corpus rather than the current page.
 * Only ids are included to keep the payload small; limit -1 returns all matches.
 */
export const fetchAllSourceFileIds = async (spec?: { filter?: string }): Promise<string[]> => {
  const response = await c3Post('Genai.SourceFile', 'fetch', {
    spec: { ...spec, include: 'id', limit: -1 },
  });
  const objs = (response?.objs ?? []) as Array<{ id?: string }>;
  return objs.map((o) => o.id).filter((id): id is string => Boolean(id));
};

/** Same filter as GenAiUi.DocumentsWarningBanner (Genai.SourceFile fetchCount spec). */
export const DOCUMENTS_WARNING_BANNER_STATUS_FILTER =
  "status.value == 'Not Indexed' || status.value == 'Needs Re-indexing'";

export const fetchDocumentsWarningBannerPendingCount = async (): Promise<number> => {
  return fetchSourceFilesCount({ filter: DOCUMENTS_WARNING_BANNER_STATUS_FILTER });
};

/**
 * Role ids for the current user (groups + c3Groups), for UI permission checks aligned with GenAiSearch SDL hooks.
 */
export const fetchMyUserRoleIds = async (): Promise<string[]> => {
  try {
    const raw = await c3Action('User', 'myUser', []);
    const user = raw?.response?.objs ?? raw?.response ?? raw;
    if (!user || typeof user !== 'object') {
      return [];
    }
    const u = user as { groups?: Array<{ id?: string }>; c3Groups?: Array<{ id?: string }> };
    const ids = [...(u.groups ?? []), ...(u.c3Groups ?? [])]
      .map((g) => g?.id)
      .filter((id): id is string => Boolean(id && String(id).trim()));
    return Array.from(new Set(ids));
  } catch {
    return [];
  }
};

export const transitionRelevantFilesToChunking = async (): Promise<Array<{ id: string }>> => {
  const raw = await c3Post('Genai.SourceFile', 'transitionRelevantFilesToChunking', {});
  const response = raw?.response ?? raw;
  if (!Array.isArray(response)) {
    return [];
  }

  return response.filter(
    (f: unknown): f is { id: string } =>
      Boolean(f) && f !== null && typeof f === 'object' && 'id' in f && typeof (f as { id: unknown }).id === 'string'
  );
};

export const processSourceFilesWithPipeline = async (
  files: Array<{ id: string } | string>
): Promise<unknown> => {
  /*
   * `Genai.SourceFile.processWithPipeline` expects `files: ![Genai.SourceFile]` — a non-null array of
   * plain `{ id }` references. Callers hand us whatever `uploadToSourceCollection` returned, whose exact
   * shape depends on the REST envelope (full SourceFile objects, `{ id }` refs, or — if the envelope is
   * unrecognized — malformed/empty entries). Passing those straight through is what serialized to
   * `files: null` and 500'd. The grid path never hit this because it rebuilds clean `{ id }` refs via
   * `sourceFileRefsFromIds`. So we do the same here: reduce every entry to a bare `{ id }` ref and drop
   * anything without a usable id, guaranteeing the exact structure the server accepts.
   */
  const refs = (Array.isArray(files) ? files : [])
    .map((f) => {
      if (typeof f === 'string') {
        return f.trim() ? { id: f.trim() } : null;
      }
      const id = f && typeof f === 'object' ? (f as { id?: unknown }).id : undefined;
      return typeof id === 'string' && id.trim() ? { id: id.trim() } : null;
    })
    .filter((f): f is { id: string } => f !== null);

  if (refs.length === 0) {
    return undefined;
  }

  return c3Post('Genai.SourceFile', 'processWithPipeline', { files: refs });
};

/**
 * Process all eligible (Not Indexed / Needs Re-indexing) source files for the Documents warning banner.
 * The backend transitions every eligible file to Processing and dispatches pipeline processing in batches,
 * uncapped by the default fetch limit. Returns the number of files processed.
 */
export const processAllRelevantFiles = async (): Promise<number> => {
  const raw = await c3Post('Genai.SourceFile', 'processAllRelevantFiles', {});
  return (raw?.response ?? raw ?? 0) as number;
};

/**
 * Source collection names for the Documents grid source-directory filter.
 * Matches GenAiUi.DocumentsFilterPanel collection field (Genai.SourceCollection fetch).
 */
export const fetchSourceCollectionNames = async (): Promise<string[]> => {
  const response = await c3Post('Genai.SourceCollection', 'fetch', {
    spec: { include: 'name', limit: -1 },
  });
  const objs = (response?.objs ?? []) as Array<{ name?: string }>;
  const names = objs.map((o) => o.name).filter((n: string | undefined): n is string => Boolean(n && String(n).trim()));
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
};

/** Separator between category label and tag label in filter values (same as GenAiUiTransformDocumentsFilterPanel). */
export const TAG_FILTER_VALUE_SEPARATOR = '\u001e';

export interface TagFilterOption {
  /** Stored filter value: category label, or `category${TAG_FILTER_VALUE_SEPARATOR}tagLabel`. */
  value: string;

  /** Display label: category label, or `category: tagLabel`. */
  label: string;
}

/**
 * Tag filter options for the Documents grid.
 */
export const fetchSourceFileMetadataTagFilterOptions = async (): Promise<TagFilterOption[]> => {
  const response = await c3Post('Genai.SourceFile.Metadata.Tag', 'fetch', {
    spec: { include: 'label, category.label', limit: 1000 },
  });
  const objs = (response?.objs ?? []) as Array<{
    label?: string;
    category?: { label?: string };
  }>;
  const rows: TagFilterOption[] = [];
  const sep = TAG_FILTER_VALUE_SEPARATOR;

  for (const tag of objs) {
    const tagLabel = typeof tag?.label === 'string' ? tag.label.trim() : '';
    const categoryLabel = tag?.category?.label?.trim();
    if (tagLabel && categoryLabel) {
      rows.push(
        { value: categoryLabel, label: categoryLabel },
        { value: `${categoryLabel}${sep}${tagLabel}`, label: `${categoryLabel}: ${tagLabel}` }
      );
    }
  }

  const byValue = new Map<string, string>();
  for (const r of rows) {
    if (!byValue.has(r.value)) {
      byValue.set(r.value, r.label);
    }
  }

  return Array.from(byValue.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

/**
 * Status labels for the Documents grid status filter.
 * Uses Genai.SourceFile.StatusEnum.values(), then applies GenAiUiTransformSourceFileStatusEnumValues (excludes Deleted).
 */
export const fetchSourceFileStatusFilterOptions = async (): Promise<string[]> => {
  const response = await c3Post('Genai.SourceFile.StatusEnum', 'values', {});
  const raw = response?.response !== undefined ? response.response : response;
  const list = Array.isArray(raw) ? raw : [];
  const strings = list.filter((v: unknown): v is string => typeof v === 'string');
  const withoutDeleted = strings.filter((v) => v !== 'Deleted');
  return [...new Set(withoutDeleted)];
};

/**
 * Add selected source files to the index (same flow as GenAiUiEpicAddOrRemoveFilesFromIndex).
 */
export const addSourceFilesToIndex = async (fileIds: string[]): Promise<void> => {
  if (fileIds.length === 0) {
    return;
  }
  const files = sourceFileRefsFromIds(fileIds);
  await c3Post('Genai.SourceFile', 'transitionFilesToStatus', {
    files,
    status: 'Processing',
  });
  await c3Post('Genai.SourceFile', 'processWithPipeline', { files });
};

/**
 * Remove selected source files from the index (not deleted).
 */
export const removeSourceFilesFromIndex = async (fileIds: string[]): Promise<void> => {
  if (fileIds.length === 0) {
    return;
  }
  const files = sourceFileRefsFromIds(fileIds);
  await c3Post('Genai.SourceFile', 'transitionFilesToStatus', {
    files,
    status: 'Removing',
  });
  await c3Post('Genai.SourceFile', 'unprocessWithPipeline', {
    files,
    shouldTransitionToDeleted: false,
  });
};

export const manualSync = async (): Promise<any> => {
  return c3Post('Genai.SourceCollection.Utils', 'sync', {});
};

/**
 * Delete source file(s) - removes from index and marks as ignored in future syncs.
 */
export const deleteSourceFiles = async (fileIds: string[]): Promise<any> => {
  return c3Post('Genai.SourceFile', 'unprocessAndTransitionToDeleted', {
    files: fileIds.map((id) => ({ id })),
  });
};
