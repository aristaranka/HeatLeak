/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useCallback, useState } from 'react';
// The storage key and the pre-paint FOUC snippet are defined once in `themeInitScript.ts`
// (dependency-free, so the snippet can also be inlined into static HTML). Imported here for the
// runtime helpers below and re-exported so existing importers of `THEME_STORAGE_KEY` are unaffected
// and consumers can reach `themeInitScript` from the same module.
import { THEME_STORAGE_KEY, themeInitScript } from './themeInitScript';

export type Theme = 'light' | 'dark';

export { THEME_STORAGE_KEY, themeInitScript };

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Apply persisted theme to `<html>`; call once at app startup (after optional inline script). */
export function initTheme(): Theme {
  const theme = getStoredTheme();
  document.documentElement.dataset.theme = theme;
  return theme;
}

/** React hook — single source of truth for theme state. Returns the current
 *  theme and a toggle callback; persistence is handled by `applyTheme`. */
export function useTheme(): [Theme, () => void] {
  // Lazy-init from storage so a freshly-mounted toggle reflects the value set
  // by `initTheme()` (and the inline `<head>` FOUC script).
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light';
      applyTheme(next);
      return next;
    });
  }, []);
  return [theme, toggle];
}
