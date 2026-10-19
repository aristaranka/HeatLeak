/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import DataPage from './pages/DataPage';

/**
 * Layout for the self-contained Documents package. The package ships only the Documents (DocAI)
 * page, so the layout renders it directly with no sidebar or router.
 */
export default function AppLayout() {
  return (
    <div className="h-screen flex flex-col max-w-full overflow-hidden">
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 overflow-auto">
            <DataPage />
          </main>
        </div>
      </div>
    </div>
  );
}
