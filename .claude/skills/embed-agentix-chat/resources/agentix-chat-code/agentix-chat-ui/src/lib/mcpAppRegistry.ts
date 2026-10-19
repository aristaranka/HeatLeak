/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import type { ServerAppDescriptor } from './appServerDetection';

export type McpAppKind = 'server' | 'resource';

export interface McpAppDescriptor {
  instanceId: string;
  title: string;
  kind: McpAppKind;
  sourceMessageId: string;
  port?: number;
  resourceUri?: string;
  queryString?: string;
  requestedDisplayMode?: 'inline' | 'pip';
}

export interface AppPanelState {
  apps: Map<string, McpAppDescriptor>;
  tabOrder: string[];
  selectedId: string | null;
  fullscreenId: string | null;
}

export type AppPanelAction =
  | { type: 'register'; app: McpAppDescriptor }
  | { type: 'select'; instanceId: string }
  | { type: 'close'; instanceId: string }
  | { type: 'fullscreen'; instanceId: string | null }
  | { type: 'reset' };

export const EMPTY_APP_PANEL_STATE: AppPanelState = {
  apps: new Map(),
  tabOrder: [],
  selectedId: null,
  fullscreenId: null,
};

export function serverDescriptor(event: ServerAppDescriptor): McpAppDescriptor {
  return {
    instanceId: event.instanceId,
    title: event.title,
    kind: 'server',
    sourceMessageId: event.sourceMessageId,
    port: event.port,
    queryString: event.queryString,
    requestedDisplayMode: event.requestedDisplayMode,
  };
}

export function appPanelReducer(state: AppPanelState, action: AppPanelAction): AppPanelState {
  if (action.type === 'reset') return EMPTY_APP_PANEL_STATE;
  if (action.type === 'register') {
    const apps = new Map(state.apps);
    const exists = apps.has(action.app.instanceId);
    apps.set(action.app.instanceId, action.app);
    return {
      ...state,
      apps,
      tabOrder: exists ? state.tabOrder : [...state.tabOrder, action.app.instanceId],
      selectedId: action.app.instanceId,
    };
  }
  if (action.type === 'select') {
    return state.apps.has(action.instanceId) ? { ...state, selectedId: action.instanceId } : state;
  }
  if (action.type === 'fullscreen') {
    return action.instanceId === null || state.apps.has(action.instanceId)
      ? { ...state, fullscreenId: action.instanceId }
      : state;
  }
  if (!state.apps.has(action.instanceId)) return state;
  const closedIndex = state.tabOrder.indexOf(action.instanceId);
  const tabOrder = state.tabOrder.filter((id) => id !== action.instanceId);
  const apps = new Map(state.apps);
  apps.delete(action.instanceId);
  const selectedId =
    state.selectedId === action.instanceId
      ? (tabOrder[Math.min(Math.max(closedIndex - 1, 0), tabOrder.length - 1)] ?? null)
      : state.selectedId;
  return {
    apps,
    tabOrder,
    selectedId,
    fullscreenId: state.fullscreenId === action.instanceId ? null : state.fullscreenId,
  };
}
