/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/** localStorage key for the user's last-typed `env-app` value. */
export const LAST_ENV_APP_STORAGE_KEY = 'sa_last_env_app';

/** localStorage breadcrumb for the user's most recent agent service. Written by
 *  ChatPage on every successful getSession landing so a remount can resume the
 *  same pod; cleared on 404/410. */
export const LAST_SERVICE_ID_KEY = 'nexus.lastServiceId';

/** localStorage breadcrumb for the agent service's base URL. Written alongside
 *  LAST_SERVICE_ID_KEY so a fresh-mount pending-mode chat (no hash) has an
 *  agentBaseUrl immediately without waiting for a getSession round-trip. */
export const LAST_AGENT_BASE_URL_KEY = 'nexus.lastAgentBaseUrl';

export function parseEnvApp(envApp: string): { env: string; app: string } | null {
  const trimmed = envApp.trim();
  const sep = trimmed.indexOf('-');
  if (sep <= 0 || sep >= trimmed.length - 1) return null;
  const env = trimmed.substring(0, sep);
  const app = trimmed.substring(sep + 1);
  if (!env || !app) return null;
  return { env, app };
}

export function buildAppId(cluster: string, envApp: string): string {
  const parsed = parseEnvApp(envApp);
  if (!parsed || !cluster) return '';
  return `${cluster}-${parsed.env}-${parsed.app}`;
}
