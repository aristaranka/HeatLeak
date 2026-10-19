/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * `docAiDocumentsUi` — the self-contained Document AI **Documents** page as an importable library.
 *
 * A host `npm install`s this package, pulls in the CSS via the `exports` map
 * (`docAiDocumentsUi/globals.css`, `docAiDocumentsUi/styles/theme.css`,
 * `docAiDocumentsUi/styles/utilities.css`), initializes i18n with {@link initDocAiI18n}, and mounts
 * {@link DocumentsPage}. All imports here are package-relative so the package type-checks under any
 * consumer's tsconfig — no `@/` alias is used or shipped.
 *
 * - {@link DocumentsPage} — top-level entry that wires providers around the Documents grid.
 * - {@link DataPage} — the grid surface only, for hosts that supply their own providers.
 * - Providers/hooks — {@link GenAiRoleProvider}/{@link useGenAiRoles}, {@link NavigationProvider}/
 *   {@link useNavigation}, {@link BannerProvider}/{@link useBanner}.
 * - i18n — {@link initDocAiI18n}, {@link docAiEnTranslations}.
 * - Data access + role helpers a host can reuse for its own chrome.
 */

// Top-level page (providers wired). Default export of DocumentsPage plus a named alias.
export { default as DocumentsPage } from './DocumentsPage';

// Grid surface only — for hosts that mount their own providers.
export { default as DataPage } from './pages/DataPage';

// Providers + hooks.
export { GenAiRoleProvider, useGenAiRoles } from './contexts/GenAiRoleContext';
export type { GenAiRoleContextValue } from './contexts/GenAiRoleContext';
export { NavigationProvider, useNavigation } from './contexts/NavigationContext';
export { BannerProvider, useBanner } from './contexts/BannerContext';

// Presentational pieces a host may compose directly.
export { DataPageHeader } from './pages/components/DataPageHeader';
export { DocumentsGrid } from './pages/components/DocumentsGrid';
export { MessageBanner } from './pages/components/MessageBanner';
export type { MessageBannerType, MessageBannerProps } from './pages/components/MessageBanner';
export { DataGrid } from './pages/components/grid';
export type { DataGridProps, Column } from './pages/components/grid';
export { UploadDocumentsModal, FileUploadSection, TagsSection } from './pages/components/upload';
export type { UploadFormData, Tag } from './pages/components/upload';

// Internationalization entry.
export { initDocAiI18n, docAiEnTranslations } from './i18n/config';

// Role model + computed flags (aligned with GenAiSearch SDL conditional hooks).
export {
  GENAI_ROLE_IDS_ADMIN,
  GENAI_ROLE_IDS_DOCUMENT_ADMIN,
  GENAI_ROLE_IDS_WORKFLOW_EDITOR,
  GENAI_ROLE_IDS_WORKFLOW_VIEWER,
  GENAI_FALLBACK_ROLE_ID_WHEN_NONE,
  computeGenAiRoleFlags,
  canMutateWorkflowsInUi,
  canRunWorkflowFromUi,
  userMaySeeAtLeastDocAdminEditable,
  getGenAiRoleSwitchTier,
} from './constants/genAiRoles';
export type { GenAiComputedRoleFlags, GenAiRoleSwitchTier } from './constants/genAiRoles';

// Data access layer (C3 SourceFile fetch / filter / tag / sync / index helpers).
export {
  fetchSourceFiles,
  fetchSourceFilesCount,
  fetchSourceFileDetail,
  fetchSourceCollectionNames,
  fetchSourceFileStatusFilterOptions,
  fetchSourceFileMetadataTagFilterOptions,
  fetchSourceFileMetadataCategoryLabels,
  fetchDocumentsWarningBannerPendingCount,
  fetchMyUserRoleIds,
  buildSourceFileFilter,
  addSourceFilesToIndex,
  removeSourceFilesFromIndex,
  deleteSourceFiles,
  manualSync,
  transitionRelevantFilesToChunking,
  processSourceFilesWithPipeline,
  processAllRelevantFiles,
  updateSourceFileManualTag,
  removeSourceFileManualTag,
  addSourceFileManualTag,
  SOURCE_FILE_NOT_DELETED_FILTER,
  DOCUMENTS_WARNING_BANNER_STATUS_FILTER,
  TAG_FILTER_VALUE_SEPARATOR,
} from './shared/api';
export type { SourceFileFilterInput, TagFilterOption } from './shared/api';

// Low-level C3 action client (host may reuse for its own calls against the same env/app).
export {
  c3Action,
  c3GetAction,
  c3CreateAction,
  c3MemberAction,
  c3MemberActionKwargs,
  getAppBaseUrl,
  getCookieValue,
} from './c3Action';

// Shared UI types.
export type { User, UserGroup, SnackbarMessage } from './Interfaces';
