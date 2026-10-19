/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { computeGenAiRoleFlags, type GenAiComputedRoleFlags } from '../constants/genAiRoles';
import { fetchMyUserRoleIds } from '../shared/api';

/**
 * Pure React equivalent of GenAiSearch SDL role state (`userContext.roles`) plus computed flags
 * ({@link GenAiUiConditionalRendererIsAdmin}, {@link GenAiUiConditionalRendererIsDocAdmin}, etc.), backed by
 * {@link User.myUser} via {@link fetchMyUserRoleIds}.
 *
 * Prefer `flags` for UI; see {@link GenAiComputedRoleFlags} for per-flag usage in genAiUi.
 */
export interface GenAiRoleContextValue {
  roleIds: string[];
  flags: GenAiComputedRoleFlags;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

const GenAiRoleContext = createContext<GenAiRoleContextValue | null>(null);

export function GenAiRoleProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = await fetchMyUserRoleIds();
      setRoleIds(ids);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setRoleIds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const flags = useMemo(() => computeGenAiRoleFlags(roleIds), [roleIds]);

  const value = useMemo(
    (): GenAiRoleContextValue => ({
      roleIds,
      flags,
      loading,
      error,
      refresh,
    }),
    [roleIds, flags, loading, error, refresh]
  );

  return <GenAiRoleContext.Provider value={value}>{children}</GenAiRoleContext.Provider>;
}

export function useGenAiRoles(): GenAiRoleContextValue {
  const ctx = useContext(GenAiRoleContext);
  if (!ctx) {
    throw new Error('useGenAiRoles must be used within GenAiRoleProvider');
  }
  return ctx;
}
