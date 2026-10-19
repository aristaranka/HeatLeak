/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useHref } from 'react-router';

export interface DetailTarget {
  /** App-relative path for `navigate()` — react-router applies the router basename itself. */
  path: string;
  /** Basename-resolved absolute URL for a real `<a href>`, so the browser's native
   *  open-in-new-tab gestures land on the right URL in production. */
  href: string;
}

/**
 * Basename-safe row/card → detail navigation for list pages.
 *
 * A list row/card wants two forms of the same target: an app-relative path to hand to
 * `navigate()` (which applies the `BrowserRouter` basename itself) and a basename-resolved
 * absolute URL for a real `<a href>` — production serves the SPA under `/<env>/<app>/`, so a
 * raw root-absolute `<a href>` 404s on ctrl/cmd-click, middle-click, or "Open in new tab".
 * (Masked in Vite dev / tests where the basename is `/`.)
 *
 * Call once at the top of a list component with the detail page's base path; the returned
 * builder maps a per-item `fragment` (an id or `encodeURIComponent(name)` — passed verbatim,
 * so the caller owns any encoding) to `{ path, href }` for that item's hash target.
 *
 *   const skillDetailHref = useDetailHref('/skill-detail');
 *   const { path, href } = skillDetailHref(encodeURIComponent(name));
 *   <a href={href} onClick={(e) => { e.preventDefault(); navigate(path); }}>…</a>
 */
export function useDetailHref(basePath: string): (fragment: string) => DetailTarget {
  const baseHref = useHref(basePath);
  return (fragment: string) => ({
    path: `${basePath}#${fragment}`,
    href: `${baseHref}#${fragment}`,
  });
}
