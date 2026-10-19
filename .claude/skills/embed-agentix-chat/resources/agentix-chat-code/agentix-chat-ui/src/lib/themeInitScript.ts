/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/*
 * The theme storage key and the pre-paint FOUC snippet, defined ONCE here in a dependency-free
 * module (no React import) so the same value can be used three ways without drift:
 *   1. the runtime light/dark helpers in `theme.ts` (re-export it),
 *   2. an external consumer that inlines the snippet into its own `<head>` (public export),
 *   3. the host app's static `index.html` inline script (kept in lock-step by a drift test).
 */

/**
 * localStorage key the persisted light/dark choice is stored under. Read by the runtime theme
 * helpers (`getStoredTheme` / `applyTheme`) AND by {@link themeInitScript}, so the value stamped
 * before first paint and the value React hydrates with always agree.
 */
export const THEME_STORAGE_KEY = 'nexus_theme';

/**
 * Pre-paint FOUC-prevention snippet. Stamps the persisted (or light-default) theme onto
 * `<html data-theme>` synchronously, BEFORE first paint, so a page that would otherwise flash the
 * wrong theme (dark-then-light, or the reverse) shows the correct one immediately.
 *
 * It is a raw, dependency-free JS string — inline it as the FIRST thing in `<head>`, ahead of the
 * app bundle so it runs before hydration:
 *
 *   - Static / Vite `index.html`:  `<script>` + themeInitScript + `</script>`
 *   - A framework rendering `<head>` from JSX:
 *       `<script dangerouslySetInnerHTML={{ __html: themeInitScript }} />`
 *
 * Default is light. Reads {@link THEME_STORAGE_KEY} — the same key the runtime helpers write — so
 * there is never a pre-paint/hydration mismatch. A read failure (private mode, disabled storage)
 * falls back to light rather than throwing.
 */
export const themeInitScript =
  `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');` +
  `document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}` +
  `catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
