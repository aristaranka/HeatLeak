/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Role / UserGroup ids aligned with GenAiSearch SDL conditional hooks and nav
 * ({@link GenAiUiConditionalRendererIsAdmin}, {@link GenAiUiDynamicNavMenuRenderer}, etc.).
 */

/** Matches {@link GenAiUiConditionalRendererIsAdmin} */
export const GENAI_ROLE_IDS_ADMIN = ['C3.AppAdmin', 'Genai.AdminUser', 'GenAiSearch.Role.Admin'] as const;

/** Matches {@link GenAiUiConditionalRendererIsDocAdmin} */
export const GENAI_ROLE_IDS_DOCUMENT_ADMIN = ['GenAiSearch.Role.DocumentAdmin'] as const;

/** Matches {@link GenAiUiConditionalRendererIsWorkflowUser} */
export const GENAI_ROLE_IDS_WORKFLOW_EDITOR = ['GenAiSearch.Role.WorkflowEditor'] as const;

/** Matches workflow viewer role used by {@link GenAiUiConditionalRendererIsOnlyWorkflowViewer} */
export const GENAI_ROLE_IDS_WORKFLOW_VIEWER = ['GenAiSearch.Role.WorkflowViewer'] as const;

/**
 * When {@link User.myUser} resolves no groups, SDL nav falls back to this id so menus still resolve.
 * {@link GenAiUiDynamicBaseElementsRenderer#getElements}
 */
export const GENAI_FALLBACK_ROLE_ID_WHEN_NONE = 'Genai.BasicUser';

/** SDL nav DATA item — {@link GenAiUiDynamicNavMenuRenderer#getBaseElements} */
export const GENAI_NAV_ALLOW_DATA = [
  'C3.AppAdmin',
  'GenAiSearch.Role.User',
  'GenAiSearch.Role.User.SearchOnly',
  'Genai.AdminUser',
  'GenAiSearch.Role.Admin',
  'Genai.BasicUser',
] as const;

/** SDL nav MODELS → History route in pure React */
export const GENAI_NAV_ALLOW_HISTORY = [
  'C3.AppAdmin',
  'Genai.AdminUser',
  'GenAiSearch.Role.Admin',
  'GenAiSearch.Role.User',
  'GenAiSearch.Role.User.SearchOnly',
  'Genai.BasicUser',
] as const;

/** SDL nav WORKFLOWS */
export const GENAI_NAV_ALLOW_WORKFLOWS = [
  'C3.AppAdmin',
  'Genai.AdminUser',
  'GenAiSearch.Role.Admin',
  'GenAiSearch.Role.User',
  'GenAiSearch.Role.User.SearchOnly',
  'Genai.BasicUser',
] as const;

/** SDL nav SETTINGS */
export const GENAI_NAV_ALLOW_SETTINGS = ['C3.AppAdmin'] as const;

/** SDL footer DATA_FUSION — {@link GenAiUiDynamicNavMenuRenderer#getFooterElements} */
export const GENAI_NAV_ALLOW_DATA_FUSION = ['C3.AppAdmin', 'Genai.AdminUser', 'GenAiSearch.Role.Admin'] as const;

/**
 * Resolved from {@link computeGenAiRoleFlags} / `GenAiRoleProvider`. Typical genAiUi mapping:
 * - **isAdmin** — broader admin-only UI where used (e.g. workflows with editor roles).
 * - **isDocumentAdmin** — document admin role; included in **isAtLeastDocAdmin**.
 * - **isWorkflowEditor** — workflow list/detail mutations where gated.
 * - **isWorkflowViewer** — workflow viewer role flag (combine with **isOnlyWorkflowViewer** for read-only UX).
 * - **isAtLeastDocAdmin** — Documents grid bulk/index/upload/delete, Data Sync, warning banner eligibility.
 * - **isOnlyWorkflowViewer** — workflows list read-only; Run disabled on detail.
 */
export interface GenAiComputedRoleFlags {
  isAdmin: boolean;
  isDocumentAdmin: boolean;
  isWorkflowEditor: boolean;
  isWorkflowViewer: boolean;

  /** {@link GenAiUiConditionalRendererIsAtLeastDocAdmin} / {@link GenAiUiConditionalRendererIsAtLeastDocAdminAndProjectEditable} */
  isAtLeastDocAdmin: boolean;

  /** {@link GenAiUiConditionalRendererIsOnlyWorkflowViewer} — WorkflowViewer and not WorkflowEditor */
  isOnlyWorkflowViewer: boolean;
}

/** Workflow list/detail destructive or authoring actions (not viewer-only). */
export function canMutateWorkflowsInUi(flags: GenAiComputedRoleFlags): boolean {
  return !flags.isOnlyWorkflowViewer && flags.isWorkflowEditor;
}

/** Run / execute workflow from UI (blocked for viewer-only; allowed for editors, admins, and other roles). */
export function canRunWorkflowFromUi(flags: GenAiComputedRoleFlags): boolean {
  return !flags.isOnlyWorkflowViewer && flags.isWorkflowEditor;
}

/**
 * Permission flags from raw role ids (no fallback). Matches {@link GenAiUiConditionalRendererIsUserGroupOneOf}.
 */
export function computeGenAiRoleFlags(roleIds: readonly string[]): GenAiComputedRoleFlags {
  // Role gating removed: every user sees the same (full) UI — upload, manage,
  // and banner actions are always enabled regardless of assigned roles.
  // To re-enable role-based gating, restore the role-id checks below (the
  // GENAI_ROLE_IDS_* constants are kept intact for that purpose).
  void roleIds;
  return {
    isAdmin: true,
    isDocumentAdmin: true,
    isWorkflowEditor: true,
    isWorkflowViewer: true,
    isAtLeastDocAdmin: true,
    isOnlyWorkflowViewer: false,
  };
}

/**
 * {@link GenAiUiConditionalRendererIsAtLeastDocAdminAndProjectEditable} (projects removed — admin or document admin).
 */
export function userMaySeeAtLeastDocAdminEditable(roleIds: readonly string[]): boolean {
  return computeGenAiRoleFlags(roleIds).isAtLeastDocAdmin;
}

/**
 * Branch keys aligned with {@link GenAiUiRoleSwitchCondition} (role tiers only).
 */
export type GenAiRoleSwitchTier = 'isAdmin' | 'isDocumentAdmin' | 'isBasicUser';

export function getGenAiRoleSwitchTier(roleIds: readonly string[]): GenAiRoleSwitchTier {
  const f = computeGenAiRoleFlags(roleIds);
  if (f.isAdmin) {
    return 'isAdmin';
  }
  if (f.isDocumentAdmin) {
    return 'isDocumentAdmin';
  }

  return 'isBasicUser';
}

/**
 * Role ids used only for nav visibility when intersecting with allowedGroups (SDL fallback).
 */
export function effectiveRoleIdsForNav(roleIds: readonly string[]): string[] {
  return roleIds.length > 0 ? [...roleIds] : [GENAI_FALLBACK_ROLE_ID_WHEN_NONE];
}

/**
 * Whether the user may see a nav item that declares {@link allowedGroups}, matching
 * {@link GenAiUiDynamicBaseElementsRenderer#getElements}.
 */
export function userMayAccessNavGroups(roleIds: readonly string[], allowedGroups?: readonly string[]): boolean {
  if (!allowedGroups || allowedGroups.length === 0) {
    return true;
  }
  const effective = effectiveRoleIdsForNav(roleIds);
  return allowedGroups.some((id) => effective.includes(id));
}

/** Maps {@link NavItem} `id` values to SDL `allowedGroups`; omitted ids are unrestricted (e.g. search). */
export function allowedGroupsForNavItemId(navItemId: string): readonly string[] | undefined {
  switch (navItemId) {
    case 'data':
      return GENAI_NAV_ALLOW_DATA;
    case 'history':
      return GENAI_NAV_ALLOW_HISTORY;
    case 'workflows':
      return GENAI_NAV_ALLOW_WORKFLOWS;
    case 'settings':
      return GENAI_NAV_ALLOW_SETTINGS;
    case 'datafusion':
      return GENAI_NAV_ALLOW_DATA_FUSION;
    default:
      return undefined;
  }
}
