/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatTransport } from '../chatTransportContext';
import { isWorkspacePdfPath, workspaceFilesUserMessage, workspacePdfEmbedSrc } from '../lib/chatApi';

export type WorkspacePdfState = {
  /** True when the path is a PDF (so callers can branch their render). */
  isPdf: boolean;
  /** `<embed type="application/pdf">` src (blob object URL + viewer params), or null. */
  pdfEmbedSrc: string | null;
  pdfLoading: boolean;
  pdfError: string;
};

/**
 * Resolve a workspace PDF path to an `<embed>` src, shared by the side-panel preview and the full
 * file viewer so a PDF renders identically in either surface — instead of one view embedding it and
 * the other falling through to "binary file". No-op for non-PDF paths. Fetches the bytes via the
 * injected {@link NexusChatTransport} as a blob object
 * URL — which also avoids the attachment-download the raw file route triggers — and revokes it on
 * path change / unmount.
 */
export function useWorkspacePdfObjectUrl(
  agentBaseUrl: string,
  sessionId: string,
  path: string | null
): WorkspacePdfState {
  const transport = useChatTransport();
  const { t } = useTranslation('chat');
  // Latest `t` via a ref so the PDF fetch effect produces stable error copy without depending on
  // `t` (which would re-fetch the object URL on a UI-language change).
  const tRef = useRef(t);
  tRef.current = t;
  const isPdf = !!path && isWorkspacePdfPath(path);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');

  useEffect(() => {
    if (!isPdf || !path || !agentBaseUrl.trim() || !sessionId.trim()) {
      setPdfObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPdfError('');
      setPdfLoading(false);
      return undefined;
    }
    const ac = new AbortController();
    setPdfError('');
    setPdfLoading(true);
    setPdfObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    (async () => {
      try {
        const objectUrl = await transport.fetchWorkspacePdfObjectUrl(agentBaseUrl, sessionId, path, {
          signal: ac.signal,
        });
        if (!ac.signal.aborted) setPdfObjectUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setPdfError(workspaceFilesUserMessage(err, 'pdf', tRef.current));
      } finally {
        if (!ac.signal.aborted) setPdfLoading(false);
      }
    })();
    return () => {
      ac.abort();
      setPdfObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [agentBaseUrl, sessionId, path, isPdf, transport]);

  return {
    isPdf,
    pdfEmbedSrc: pdfObjectUrl ? workspacePdfEmbedSrc(pdfObjectUrl) : null,
    pdfLoading,
    pdfError,
  };
}
