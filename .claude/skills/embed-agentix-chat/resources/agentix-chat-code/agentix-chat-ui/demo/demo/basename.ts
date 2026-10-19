/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Router basename for a gateway-served page: the `/<env>/<app>` prefix of the path, or `/` when
 * the page is served at root (local dev, malformed path). Pure — the caller strips
 * `/index.html` from the address bar itself if it wants the URL cleaned.
 */
export function computeBasename(pathname: string): string {
  const path = pathname.replace(/\/index\.html$/, '/');
  const parts = path.split('/').filter(Boolean);
  return parts.length >= 2 ? `/${parts[0]}/${parts[1]}` : '/';
}
