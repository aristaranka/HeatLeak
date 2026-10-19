/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useCallback, useMemo, useReducer } from 'react';
import type { McpUiDisplayMode } from '@modelcontextprotocol/ext-apps/app-bridge';

export type AppInstanceId = string;

export interface DisplayModeState {
  apps: Map<AppInstanceId, McpUiDisplayMode>;
  /** Single app occupying the pip slot (persistent panel). */
  pipApp: AppInstanceId | null;
  /** Single app in fullscreen (exclusive). */
  fullscreenApp: AppInstanceId | null;
}

type DisplayModeAction =
  | { type: 'REQUEST_MODE'; appId: AppInstanceId; requestedMode: McpUiDisplayMode }
  | { type: 'REMOVE_APP'; appId: AppInstanceId };

const SUPPORTED_MODES: McpUiDisplayMode[] = ['inline', 'fullscreen', 'pip'];

function displayModeReducer(state: DisplayModeState, action: DisplayModeAction): DisplayModeState {
  switch (action.type) {
    case 'REQUEST_MODE': {
      const { appId, requestedMode } = action;
      const apps = new Map(state.apps);
      let { pipApp, fullscreenApp } = state;

      if (requestedMode === 'inline') {
        apps.set(appId, 'inline');
        if (pipApp === appId) pipApp = null;
        if (fullscreenApp === appId) fullscreenApp = null;
      } else if (requestedMode === 'pip') {
        if (pipApp && pipApp !== appId) {
          apps.set(pipApp, 'inline');
        }
        apps.set(appId, 'pip');
        pipApp = appId;
        if (fullscreenApp === appId) fullscreenApp = null;
      } else if (requestedMode === 'fullscreen') {
        if (fullscreenApp && fullscreenApp !== appId) {
          apps.set(fullscreenApp, 'inline');
        }
        apps.set(appId, 'fullscreen');
        fullscreenApp = appId;
        if (pipApp === appId) pipApp = null;
      }

      return { apps, pipApp, fullscreenApp };
    }
    case 'REMOVE_APP': {
      const { appId } = action;
      const apps = new Map(state.apps);
      apps.delete(appId);
      return {
        apps,
        pipApp: state.pipApp === appId ? null : state.pipApp,
        fullscreenApp: state.fullscreenApp === appId ? null : state.fullscreenApp,
      };
    }
    default:
      return state;
  }
}

export interface DisplayModeContextValue {
  state: DisplayModeState;
  supportedModes: McpUiDisplayMode[];
  requestDisplayMode: (appId: AppInstanceId, requestedMode: McpUiDisplayMode) => McpUiDisplayMode;
  getDisplayMode: (appId: AppInstanceId) => McpUiDisplayMode;
  removeApp: (appId: AppInstanceId) => void;
}

const INITIAL_STATE: DisplayModeState = {
  apps: new Map(),
  pipApp: null,
  fullscreenApp: null,
};

export function useDisplayModeManager(): DisplayModeContextValue {
  const [state, dispatch] = useReducer(displayModeReducer, INITIAL_STATE);

  const requestDisplayMode = useCallback(
    (appId: AppInstanceId, requestedMode: McpUiDisplayMode): McpUiDisplayMode => {
      if (!SUPPORTED_MODES.includes(requestedMode)) {
        return state.apps.get(appId) ?? 'inline';
      }
      dispatch({ type: 'REQUEST_MODE', appId, requestedMode });
      return requestedMode;
    },
    [state.apps]
  );

  const getDisplayMode = useCallback(
    (appId: AppInstanceId): McpUiDisplayMode => {
      return state.apps.get(appId) ?? 'inline';
    },
    [state.apps]
  );

  const removeApp = useCallback((appId: AppInstanceId) => {
    dispatch({ type: 'REMOVE_APP', appId });
  }, []);

  return useMemo(
    () => ({ state, supportedModes: SUPPORTED_MODES, requestDisplayMode, getDisplayMode, removeApp }),
    [state, requestDisplayMode, getDisplayMode, removeApp]
  );
}
