/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslations from './locales/en.json';

/** The shared i18next instance the Documents page renders against. */
const i18n = i18next;

/**
 * Merge the Documents strings into the instance's ACTIVE default namespace (not a hard-coded
 * 'translation') so the page's bare `useTranslation()` — which reads the host's `defaultNS` —
 * resolves Documents keys even when the host configured a different `defaultNS`. deep=true keeps
 * nested keys the host already set; overwrite=false yields to any Documents key the host overrode.
 */
function addDocAiBundle(): void {
  const rawDefaultNs = i18n.options.defaultNS ?? 'translation';
  const defaultNs = Array.isArray(rawDefaultNs) ? (rawDefaultNs[0] ?? 'translation') : rawDefaultNs;
  i18n.addResourceBundle('en', defaultNs, enTranslations, true, false);
}

/**
 * Single in-flight/settled promise for {@link initDocAiI18n}. Guards against the init race with the
 * host: `i18next.init()` is asynchronous, so `isInitialized` does not flip synchronously. Without
 * this, two overlapping calls (or a call that races the host's own `init`) could each see
 * `isInitialized === false` and fire a second competing `init` on the shared singleton, clobbering
 * the host's options. Memoizing the promise makes the operation fire-once and awaitable.
 */
let initPromise: Promise<typeof i18n> | undefined;

/**
 * Register the Documents page's default strings on the shared `i18next` instance and initialize it
 * if the host hasn't already. The host owns the single `i18next` copy (a peer dependency), so it can
 * call this once at startup instead of side-effect importing this module.
 *
 * Race-safe and idempotent:
 * - Returns a memoized promise, so concurrent/repeat calls never trigger a second `init` on the
 *   shared instance and callers can `await` it to sequence rendering deterministically.
 * - If i18next is already initialized (host got there first), the Documents strings are merged
 *   immediately via {@link addDocAiBundle} without re-initializing.
 * - If the host's `init()` is still in flight, we do NOT call `init` ourselves; we wait for the
 *   `initialized` event and then merge, so we never clobber the host's config.
 * - Only when nobody has started `init` do we initialize the instance ourselves.
 */
export function initDocAiI18n(): Promise<typeof i18n> {
  if (initPromise) {
    return initPromise;
  }

  // Host already finished init — just merge our strings in, no re-init.
  if (i18n.isInitialized) {
    addDocAiBundle();
    initPromise = Promise.resolve(i18n);
    return initPromise;
  }

  /*
   * A host init is in flight (isInitializing is set once .init() is called but before it resolves):
   * wait for it to settle and merge, rather than racing it with a competing init.
   */
  if (i18n.isInitializing) {
    initPromise = new Promise<typeof i18n>((resolve) => {
      i18n.on('initialized', () => {
        addDocAiBundle();
        resolve(i18n);
      });
    });
    return initPromise;
  }

  // Nobody has started init — we own it.
  initPromise = i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: {
          translation: enTranslations,
        },
      },
      fallbackLng: 'en',
      defaultNS: 'translation',
      interpolation: {
        escapeValue: false, // React already escapes values
      },
      detection: {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
      },
    })
    .then(() => i18n);

  return initPromise;
}

/** Default English strings the Documents page renders. A host may merge these into its own bundle. */
export { enTranslations as docAiEnTranslations };

export default i18n;
