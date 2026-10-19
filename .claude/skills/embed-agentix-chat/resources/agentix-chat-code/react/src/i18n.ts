/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/*
 * The demo's own i18next bootstrap — the consumer-side half of the embed contract.
 *
 * `@c3/agentix-client-ui` deliberately ships no i18n instance: it reads the `chat` / `common` /
 * `connect` namespaces out of whatever `react-i18next` context the mounting app provides, exactly
 * as it reads QueryClient and theme from consumer providers. So every consumer owns this file, and
 * the demo has to own one too or it is not standing in for a real consumer.
 *
 * The namespaces are registered with EMPTY resources on purpose. i18next's missing-key behaviour
 * returns the key itself, so the demo renders readable placeholders (`emptyState.title`) with zero
 * copied content. The translated strings live in exactly one place — the Nexus host SPA's
 * `src/locales/` — and vendoring them here would fork 50-odd JSON files that immediately start
 * drifting from that source for no functional gain. Shipping real copy to embedders is a separate
 * distribution question (publish the packs alongside the package), not a copy-paste.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

void i18n.use(initReactI18next).init({
  // The namespaces the chat cluster asks for. Values stay empty — see the note above.
  resources: { en: { common: {}, chat: {}, connect: {} } },
  lng: 'en',
  fallbackLng: 'en',
  ns: ['common', 'chat', 'connect'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

export default i18n;
