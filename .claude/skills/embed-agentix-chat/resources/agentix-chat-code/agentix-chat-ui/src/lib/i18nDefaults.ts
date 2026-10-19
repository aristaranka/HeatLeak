/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// Built-in English defaults for the embed. The library ships no i18n instance of its own and reads
// `common` / `chat` / `connect` from whatever react-i18next context the mounting app provides — so a
// consumer with empty (or absent) namespaces renders raw keys (`emptyState.title`, …). These packs
// are the en subset for exactly the three namespaces NexusChatEmbed renders, vendored verbatim from
// the host (`c3/nexus/react/src/locales/en/`); a test keeps them byte-identical to the source so they
// cannot drift. They are registered as a LOW-PRIORITY fallback (see `ensureNexusChatI18nDefaults`),
// so any string the consumer already provides still wins — this is a floor, never an override.

import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import commonEn from '../locales/en/common.json';
import chatEn from '../locales/en/chat.json';
import connectEn from '../locales/en/connect.json';

/** The three namespaces the chat surface renders, in the load order i18next expects. */
export const NEXUS_CHAT_NAMESPACES = ['common', 'chat', 'connect'] as const;

type LocalePack = Record<string, unknown>;

/** en resources for the namespaces the embed renders, keyed for `addResourceBundle` / `init`. */
export const EN_DEFAULT_PACKS: Record<string, LocalePack> = {
  common: commonEn as LocalePack,
  chat: chatEn as LocalePack,
  connect: connectEn as LocalePack,
};

/**
 * Ensure the embed has readable English for `common` / `chat` / `connect`, whatever the host app did:
 *
 *  - **No i18next initialized at all** (a consumer with zero i18n setup): initialize the instance with
 *    the bundled en packs and `initReactI18next` so `useTranslation` has something to read. Production
 *    always calls this with the shared global singleton — the exact instance the library's hooks read
 *    from — so binding react-i18next here is what makes a zero-setup embed render real text.
 *  - **Already initialized** (the host provided i18n, possibly with these namespaces empty): merge the
 *    bundled en packs in as a fallback with `deep = true, overwrite = false`, so every key the
 *    consumer already set is preserved and only the gaps are filled.
 *
 * Idempotent, so NexusChatEmbed can call it once per mount without accumulating state. `instance` is
 * injectable purely so this is unit-testable against a throwaway instance; production always uses the
 * default global singleton. `async` so a caller can await the zero-setup init; the far more common
 * "host already initialized i18n" path runs the fallback merge synchronously and resolves at once
 * (the embed fires it and forgets — `useSuspense: false` keeps a mid-init render from suspending).
 */
export async function ensureNexusChatI18nDefaults(instance: I18nInstance = i18next): Promise<void> {
  if (!instance.isInitialized) {
    await instance.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      ns: [...NEXUS_CHAT_NAMESPACES],
      defaultNS: 'common',
      resources: { en: { common: commonEn, chat: chatEn, connect: connectEn } },
      interpolation: { escapeValue: false },
      returnNull: false,
      react: { useSuspense: false },
    });
    return;
  }
  for (const ns of NEXUS_CHAT_NAMESPACES) {
    instance.addResourceBundle('en', ns, EN_DEFAULT_PACKS[ns], /* deep */ true, /* overwrite */ false);
  }
}
