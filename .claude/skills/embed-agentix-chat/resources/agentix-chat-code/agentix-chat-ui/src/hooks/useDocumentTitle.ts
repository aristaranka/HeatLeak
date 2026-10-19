/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Sets `document.title` to "<brand> - <subtitle>" while the component is
 * mounted, and restores the base title on unmount.
 */
export function useDocumentTitle(subtitle: string): void {
  const { t } = useTranslation('common');
  // Read the latest `t` through a ref so the title effect depends only on `subtitle` — the brand
  // string is stable, so this preserves the prior module-singleton behaviour of not re-running the
  // title write on a language change.
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    const prev = document.title;
    const brand = tRef.current('brand');
    document.title = subtitle ? `${brand} - ${subtitle}` : brand;
    return () => {
      document.title = prev;
    };
  }, [subtitle]);
}
