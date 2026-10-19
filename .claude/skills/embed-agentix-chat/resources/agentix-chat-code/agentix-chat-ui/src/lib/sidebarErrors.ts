/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { ListSessionsHttpError } from './chatApi';
import { SessionExpiredError } from './sessionExpiry';

/** Map a sidebar session-load failure to a friendly i18n key. Status-aware for the
 *  typed {@link ListSessionsHttpError}; everything else (network, parse, unknown) is
 *  the generic load-failed message. Never returns raw backend text. */
export function sidebarLoadErrorKey(err: unknown): string {
  if (err instanceof SessionExpiredError) return 'sidebar.error.sessionExpired';
  if (err instanceof ListSessionsHttpError) {
    if (err.status === 403) return 'sidebar.error.accessDenied';
    if (err.status === 404 || err.status === 410) return 'sidebar.error.sessionGone';
  }
  return 'sidebar.error.loadFailed';
}
