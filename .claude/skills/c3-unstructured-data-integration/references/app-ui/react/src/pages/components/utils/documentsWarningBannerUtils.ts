/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Mirrors {@link GenAiUiConditionalRendererIsAdmin} and {@link GenAiUiConditionalRendererIsDocAdmin},
 * combined as {@link GenAiUiConditionalRendererIsAtLeastDocAdminAndProjectEditable}.
 */
export const DOCUMENTS_WARNING_BANNER_ADMIN_ROLE_IDS = [
  'C3.AppAdmin',
  'Genai.AdminUser',
  'GenAiSearch.Role.Admin',
] as const;

export const DOCUMENTS_WARNING_BANNER_DOCUMENT_ADMIN_ROLE_IDS = ['GenAiSearch.Role.DocumentAdmin'] as const;

export function userMaySeeDocumentsWarningBanner(roleIds: readonly string[]): boolean {
  const isAdmin = DOCUMENTS_WARNING_BANNER_ADMIN_ROLE_IDS.some((id) => roleIds.includes(id));
  const isDocumentAdmin = DOCUMENTS_WARNING_BANNER_DOCUMENT_ADMIN_ROLE_IDS.some((id) => roleIds.includes(id));
  return isAdmin || isDocumentAdmin;
}
