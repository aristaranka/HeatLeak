/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { getAppBaseUrl } from '../c3Action';

/**
 * Build an HTTPS link to the C3 file servlet for a cloud-storage URL.
 *
 * Uploaded files are stored as C3 storage URLs — `s3://bucket/path/file.pdf`,
 * `azure://container/path/file.pdf`, `gs://bucket/path/file.pdf` — which a browser cannot open
 * directly. The C3 server exposes a `/file/{url-encoded-storage-path}` servlet that acts as an
 * authenticating proxy: it validates the request, fetches the blob from cloud storage, and streams it
 * back to the browser over HTTPS. So the browser never touches S3/Azure/GCS directly.
 *
 * The storage path MUST be URL-encoded. Left raw, the `s3://…` scheme sits inside the servlet path
 * (`…/file/s3://bucket/…`) and produces an un-openable link; encoding turns it into
 * `…/file/s3%3A%2F%2Fbucket%2F…` which the servlet decodes and resolves.
 *
 * Prefixed with the app base URL (`<origin>/<env>/<app>`, the same prefix `c3Action` derives) so the
 * link targets this app's servlet. Values that are already `http(s)://…` pass through untouched.
 *
 * @param rawUrl the C3 storage URL (e.g. `Genai.SourceFile.originalFile.url`)
 * @returns an absolute HTTPS servlet URL, or `''` when `rawUrl` is empty
 */
export function buildViewSourceFileHref(rawUrl: string): string {
  if (!rawUrl) {
    return '';
  }
  if (/^https?:\/\//i.test(rawUrl)) {
    return rawUrl;
  }
  const base = getAppBaseUrl();
  return `${base}/file/${encodeURIComponent(rawUrl)}`;
}
