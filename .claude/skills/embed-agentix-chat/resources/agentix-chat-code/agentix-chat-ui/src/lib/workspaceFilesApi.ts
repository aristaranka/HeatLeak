/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { fetchAgentWithRetry } from './agentPodFetch';
import { authFetch } from './sessionExpiry';
import type { TFunction } from 'i18next';

export type WorkspaceFilesUserMessageContext = 'tree' | 'preview' | 'pdf' | 'view' | 'download' | 'zip' | 'move';

const WORKSPACE_FILES_I18N: Record<WorkspaceFilesUserMessageContext, string> = {
  tree: 'chat:workspace.loadTreeFailed',
  preview: 'chat:workspace.previewFailed',
  pdf: 'chat:workspace.pdfPreviewFailed',
  view: 'chat:workspace.loadFileFailed',
  download: 'chat:workspace.downloadFailed',
  zip: 'chat:workspace.downloadZipFailed',
  move: 'chat:workspace.moveFailed',
};

/**
 * Stable user-facing message for workspace file API failures — never backend error tokens. The
 * caller supplies its own react-i18next `t` (bound to the `chat` namespace resources, which carry
 * the `chat:` keys), so this plain module owns no i18n singleton and the package stays free of a
 * host i18n import. `_err` is intentionally ignored: the copy is fixed per context, never derived
 * from the (potentially sensitive) backend error.
 */
export function workspaceFilesUserMessage(
  _err: unknown,
  context: WorkspaceFilesUserMessageContext,
  t: TFunction
): string {
  return t(WORKSPACE_FILES_I18N[context]);
}

export type WorkspaceTreeScope = 'session' | 'workspace';

export type WorkspaceTreeNode = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: WorkspaceTreeNode[];
};

export type WorkspaceTreeResponse = {
  roots: WorkspaceTreeNode[];
  truncated?: boolean;
};

export class WorkspaceTreeHttpError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? `workspace files failed: HTTP ${status}`);
    this.name = 'WorkspaceTreeHttpError';
    this.status = status;
  }
}

export type WorkspacePreviewText = {
  kind: 'text';
  path: string;
  lines: string[];
  truncated: boolean;
};

export type WorkspacePreviewBinary = {
  kind: 'binary';
  path: string;
  message: string;
};

export type WorkspacePreviewImage = {
  kind: 'image';
  path: string;
  mime: string;
  base64: string;
  truncated?: boolean;
};

export type WorkspacePreviewResponse = WorkspacePreviewText | WorkspacePreviewBinary | WorkspacePreviewImage;

export type WorkspaceViewText = {
  kind: 'text';
  path: string;
  content: string;
  truncated: boolean;
};

export type WorkspaceViewBinary = {
  kind: 'binary';
  path: string;
  message: string;
};

export type WorkspaceViewImage = {
  kind: 'image';
  path: string;
  mime: string;
  base64: string;
  truncated?: boolean;
};

export type WorkspaceViewResponse = WorkspaceViewText | WorkspaceViewBinary | WorkspaceViewImage;

export type MoveWorkspacePathResult = { ok: true } | { ok: false; conflict: true; message?: string };

function sessionsRestBase(agentBaseUrl: string): string {
  return `${agentBaseUrl.replace(/\/$/, '')}/agent-api/v1/sessions`;
}

/**
 * A per-call upload idempotency key matching the server's `^[A-Za-z0-9._:-]{1,255}$` grammar.
 *
 * `crypto.randomUUID` is only defined in a *secure context* (https / localhost). An agent pod
 * page loaded over plain http on a non-localhost host — e.g. the internal `http://…:8888` origin
 * the CI Playwright pod runner navigates to — has `crypto.randomUUID === undefined`, so calling it
 * threw a `TypeError` before the upload XHR ever fired (opaque "Query failed", no request). Fall
 * back to `crypto.getRandomValues` (available in insecure contexts) and finally to time+random.
 */
function newUploadIdempotencyKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  if (typeof c?.getRandomValues === 'function') {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
    return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h
      .slice(8, 10)
      .join('')}-${h.slice(10, 16).join('')}`;
  }
  return `idk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

async function readPodUnavailableAsTreeError(res: Response): Promise<never> {
  if (res.status === 503) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (body.error === 'pod_unavailable') {
      throw new WorkspaceTreeHttpError(503, body.error);
    }
  }
  throw new WorkspaceTreeHttpError(res.status);
}

export async function fetchSessionFilesTree(
  agentBaseUrl: string,
  sessionId: string,
  options?: { scope?: WorkspaceTreeScope; signal?: AbortSignal }
): Promise<WorkspaceTreeResponse> {
  const scope = options?.scope ?? 'session';
  const qs = new URLSearchParams({ scope });
  const path = `/agent-api/v1/sessions/files-tree/${encodeURIComponent(sessionId)}?${qs.toString()}`;
  const res = await fetchAgentWithRetry(agentBaseUrl, path, { method: 'GET', credentials: 'include' }, options?.signal);
  if (!res.ok) {
    if (res.status === 404) throw new WorkspaceTreeHttpError(404);
    await readPodUnavailableAsTreeError(res);
  }
  return (await res.json()) as WorkspaceTreeResponse;
}

export async function fetchSessionFilePreview(
  agentBaseUrl: string,
  sessionId: string,
  filePath: string,
  options?: { lines?: number; signal?: AbortSignal }
): Promise<WorkspacePreviewResponse> {
  const lines = options?.lines ?? 10;
  const qs = new URLSearchParams({
    path: filePath,
    lines: String(lines),
  });
  const restPath = `/agent-api/v1/sessions/file-preview/${encodeURIComponent(sessionId)}?${qs.toString()}`;
  const res = await fetchAgentWithRetry(
    agentBaseUrl,
    restPath,
    { method: 'GET', credentials: 'include' },
    options?.signal
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = typeof (body as { error?: string }).error === 'string' ? (body as { error: string }).error : '';
    if (res.status === 404) {
      if (msg === 'Not found') throw new Error(msg);
      throw new WorkspaceTreeHttpError(404);
    }
    if (res.status === 503 && msg === 'pod_unavailable') throw new WorkspaceTreeHttpError(503);
    throw new Error(msg || `file-preview failed: HTTP ${res.status}`);
  }
  return (await res.json()) as WorkspacePreviewResponse;
}

export async function fetchSessionFileView(
  agentBaseUrl: string,
  sessionId: string,
  filePath: string,
  options?: { signal?: AbortSignal }
): Promise<WorkspaceViewResponse> {
  const qs = new URLSearchParams({ path: filePath });
  const restPath = `/agent-api/v1/sessions/file-view/${encodeURIComponent(sessionId)}?${qs.toString()}`;
  const res = await fetchAgentWithRetry(
    agentBaseUrl,
    restPath,
    { method: 'GET', credentials: 'include' },
    options?.signal
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = typeof (body as { error?: string }).error === 'string' ? (body as { error: string }).error : '';
    throw new Error(msg || `file-view failed: HTTP ${res.status}`);
  }
  return (await res.json()) as WorkspaceViewResponse;
}

export function sessionFileDownloadUrl(
  agentBaseUrl: string,
  sessionId: string,
  filePath: string,
  options?: { inline?: boolean }
): string {
  const qs = new URLSearchParams({ path: filePath });
  if (options?.inline) qs.set('inline', '1');
  return `${sessionsRestBase(agentBaseUrl)}/file/${encodeURIComponent(sessionId)}?${qs.toString()}`;
}

export async function fetchSessionPdfObjectUrl(
  agentBaseUrl: string,
  sessionId: string,
  filePath: string,
  options?: { signal?: AbortSignal }
): Promise<string> {
  const qs = new URLSearchParams({ path: filePath, inline: '1' });
  const restPath = `/agent-api/v1/sessions/file/${encodeURIComponent(sessionId)}?${qs.toString()}`;
  const res = await fetchAgentWithRetry(
    agentBaseUrl,
    restPath,
    { method: 'GET', credentials: 'include' },
    options?.signal
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = typeof (body as { error?: string }).error === 'string' ? (body as { error: string }).error : '';
    if (res.status === 404) {
      if (msg === 'Not found') throw new Error(msg);
      throw new WorkspaceTreeHttpError(404);
    }
    throw new Error(msg || `PDF preview failed: HTTP ${res.status}`);
  }
  const blob = await res.blob();
  if (blob.size === 0) {
    throw new Error('PDF file is empty or could not be loaded');
  }
  const pdfBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
  return URL.createObjectURL(pdfBlob);
}

export async function downloadSessionFile(agentBaseUrl: string, sessionId: string, filePath: string): Promise<void> {
  const url = sessionFileDownloadUrl(agentBaseUrl, sessionId, filePath);
  const res = await authFetch(url, { method: 'GET', credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = typeof (body as { error?: string }).error === 'string' ? (body as { error: string }).error : '';
    throw new Error(msg || `Download failed: HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition');
  let filename = filePath.includes('/') ? filePath.slice(filePath.lastIndexOf('/') + 1) : filePath;
  if (filename === '') filename = 'download';
  const quoted = cd?.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+|"[^"]*")/i);
  if (quoted) {
    let raw = quoted[1].replace(/^["']|["']$/g, '');
    try {
      raw = decodeURIComponent(raw);
    } catch {
      /* keep raw */
    }
    if (raw) filename = raw;
  }
  const a = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  a.href = objectUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

export async function downloadSessionZip(agentBaseUrl: string, sessionId: string): Promise<void> {
  const url = `${sessionsRestBase(agentBaseUrl)}/files-zip/${encodeURIComponent(sessionId)}`;
  const res = await authFetch(url, { method: 'GET', credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = typeof (body as { error?: string }).error === 'string' ? (body as { error: string }).error : '';
    throw new Error(msg || `Zip download failed: HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  a.href = objectUrl;
  a.download = `workspace-${sessionId}.zip`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

export async function moveSessionFile(
  agentBaseUrl: string,
  sessionId: string,
  from: string,
  to: string,
  options?: { overwrite?: boolean; signal?: AbortSignal }
): Promise<MoveWorkspacePathResult> {
  const url = `${sessionsRestBase(agentBaseUrl)}/file-move/${encodeURIComponent(sessionId)}`;
  const res = await authFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ from, to, overwrite: options?.overwrite === true }),
    signal: options?.signal,
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; conflict?: boolean };
  if (res.status === 409 || body.conflict) {
    return { ok: false, conflict: true, message: typeof body.error === 'string' ? body.error : undefined };
  }
  if (res.status === 404) {
    throw new WorkspaceTreeHttpError(404);
  }
  if (!res.ok) {
    throw new Error(body.error || `file-move failed: HTTP ${res.status}`);
  }
  return { ok: true };
}

export type SessionUploadedFile = { name: string; path: string; size: number };

/** Ref to a file already uploaded via REST — passed to POST /query after composer upload. */
export type UploadedFileRef = { path: string; name: string; mime?: string };

export type ComposerUploadProgress = {
  loaded: number;
  total: number;
};

/** Warm-up retry budget for the composer upload POST — mirrors {@link fetchAgentWithRetry}.
 *  Same status set (rproxy 502/503/504), same 6× bound and 2s gap; the upload path shares
 *  the same pod control-plane races (readiness, auth-cache expiry, mid-session re-provision). */
const UPLOAD_MAX_RETRIES = 6;
const UPLOAD_RETRY_DELAY_MS = 2000;
const UPLOAD_RETRY_STATUSES = new Set([502, 503, 504]);

function uploadRetrySleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

/** True when the XHR error carries a retryable rproxy warm-up status. Errors from
 *  `uploadSessionFilesXhr` carry `.status` for non-2xx HTTP; abort / network-error
 *  paths omit it, so they short-circuit without a retry (correct — a user cancel
 *  or a truly-dead socket is not a warm-up transient). */
function isRetryableUploadError(err: unknown): boolean {
  const status = (err as { status?: unknown })?.status;
  return typeof status === 'number' && UPLOAD_RETRY_STATUSES.has(status);
}

class UploadHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'UploadHttpError';
    this.status = status;
  }
}

function uploadSessionFilesXhr(
  url: string,
  files: File[],
  idempotencyKey: string,
  options?: { signal?: AbortSignal; onUploadProgress?: (p: ComposerUploadProgress) => void }
): Promise<{ uploaded: SessionUploadedFile[] }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    // Server (docker/shared/workspaceRestRoutes.js) dedups on this header alone; the outer
    // retry loop reuses the same key across every attempt so a pod-processed-then-response-lost
    // 504 replays the original response on the next POST instead of writing a second copy
    // (multer's `nextAvailableName` would otherwise store the retry as `foo (1).txt`).
    xhr.setRequestHeader('Idempotency-Key', idempotencyKey);

    if (options?.onUploadProgress) {
      xhr.upload.onprogress = (e) => {
        options.onUploadProgress!({
          loaded: e.loaded,
          total: e.lengthComputable ? e.total : 0,
        });
      };
    }

    const onAbort = () => xhr.abort();
    if (options?.signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    options?.signal?.addEventListener('abort', onAbort, { once: true });

    xhr.onload = () => {
      options?.signal?.removeEventListener('abort', onAbort);
      if (xhr.status < 200 || xhr.status >= 300) {
        let msg = `upload failed: HTTP ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText) as { error?: string };
          if (typeof body.error === 'string') msg = body.error;
        } catch {
          /* ignore */
        }
        reject(new UploadHttpError(xhr.status, msg));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as { uploaded: SessionUploadedFile[] });
      } catch {
        reject(new Error('upload failed: invalid JSON response'));
      }
    };
    xhr.onerror = () => {
      options?.signal?.removeEventListener('abort', onAbort);
      reject(new Error('upload failed: network error'));
    };
    xhr.onabort = () => {
      options?.signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    const form = new FormData();
    for (const f of files) {
      form.append('file', f, f.name);
    }
    xhr.send(form);
  });
}

/** REST multipart upload to the session workspace (default: chat-uploads/).
 *
 * Retries a rproxy 5xx (502/503/504) up to `UPLOAD_MAX_RETRIES` times with a
 * bounded delay — mirrors {@link fetchAgentWithRetry}'s warm-up budget for the
 * agent-pod path. Pod control-plane state (rproxy resolver green while the pod's
 * upload data-plane hasn't finished spinning, transient auth-cache expiry mid-
 * traffic, or a mid-session pod re-provision on node eviction) surfaces as an
 * immediate rproxy 5xx on POST; treating that as user-visible upload failure —
 * where the READ helpers (files-tree, preview, view, pdf) already retry through
 * `fetchAgentWithRetry` — created an inconsistent UX where a random workspace
 * click succeeded but the composer upload right after would fail. Non-5xx
 * (413 payload too large, 507 storage full, 400 validation, 4xx auth) still
 * surface immediately — those are real caller errors, not warm-up transients.
 * Abort/network-error paths also short-circuit (no retry buys a user-cancelled
 * upload). Same rationale, same retryable set as `fetchAgentWithRetry`.
 *
 * Retrying a POST that mutates server state is safe here because every attempt
 * carries the SAME `Idempotency-Key` header — the server (docker/shared/
 * workspaceRestRoutes.js) dedups on the key alone, so a 504 that lost the
 * response mid-flight replays the original response on the retry instead of
 * writing a second copy of the file. Every other `fetchAgentWithRetry` call
 * site is a GET, so this is the first retried write; without the key,
 * `nextAvailableName` would silently attach both `foo.txt` and `foo (1).txt`
 * to the turn.
 */
export async function uploadSessionFiles(
  agentBaseUrl: string,
  sessionId: string,
  files: File[],
  options?: { path?: string; signal?: AbortSignal; onUploadProgress?: (p: ComposerUploadProgress) => void }
): Promise<{ uploaded: SessionUploadedFile[] }> {
  const qs = options?.path ? `?path=${encodeURIComponent(options.path)}` : '';
  const url = `${sessionsRestBase(agentBaseUrl)}/files/${encodeURIComponent(sessionId)}${qs}`;
  // Minted once, reused across every retry attempt for this call — a fresh key per call means
  // separate user-initiated uploads still dedup independently. See {@link newUploadIdempotencyKey}
  // for why this is not a bare `crypto.randomUUID()` (insecure-context agent pod pages).
  const idempotencyKey = newUploadIdempotencyKey();
  for (let attempt = 0; ; attempt++) {
    const lastAttempt = attempt >= UPLOAD_MAX_RETRIES;
    try {
      return await uploadSessionFilesXhr(url, files, idempotencyKey, options);
    } catch (err) {
      if (lastAttempt || !isRetryableUploadError(err) || options?.signal?.aborted) throw err;
    }
    await uploadRetrySleep(UPLOAD_RETRY_DELAY_MS, options?.signal);
    if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  }
}
