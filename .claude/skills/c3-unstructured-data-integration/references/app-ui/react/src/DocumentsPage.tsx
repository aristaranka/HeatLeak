/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import DataPage from './pages/DataPage';
import { BannerProvider } from './contexts/BannerContext';
import { NavigationProvider } from './contexts/NavigationContext';
import { GenAiRoleProvider } from './contexts/GenAiRoleContext';

/**
 * Top-level, self-contained entry for the Document AI Documents page. A host mounts this directly
 * inside its own route/layout; it wires the banner, navigation, and role providers around the
 * Documents grid ({@link DataPage}). Roles load once via `fetchMyUserRoleIds` to gate indexer /
 * upload / delete actions (see {@link GenAiRoleProvider}).
 *
 * Sizing: the page fills its parent, adapting to whatever slot the host gives it (e.g. a route body
 * beside a left nav / app chrome) without overflowing. The root is both `h-full` and `flex-1
 * min-h-0`, so it fills correctly whether the host sizes the slot by height (a container with an
 * explicit/`h-full` height) OR by flex growth (a `flex` row/column where this is a `flex-1` child) —
 * the two common embedding layouts. The host still owns giving the overall layout a bounded height
 * (e.g. an outer `h-screen`); as a standalone full-page app, wrap this in your own `h-screen` shell.
 *
 * The host owns i18n init — call `initDocAiI18n()` (or configure `react-i18next` with the exported
 * default strings) before rendering so the page's `useTranslation` keys resolve.
 */
export default function DocumentsPage() {
  return (
    <BannerProvider>
      <NavigationProvider>
        <GenAiRoleProvider>
          <div className="h-full flex-1 min-h-0 flex flex-col max-w-full overflow-hidden">
            <div className="flex flex-1 min-h-0">
              <div className="flex-1 flex flex-col min-w-0">
                <main className="flex-1 overflow-auto">
                  <DataPage />
                </main>
              </div>
            </div>
          </div>
        </GenAiRoleProvider>
      </NavigationProvider>
    </BannerProvider>
  );
}
