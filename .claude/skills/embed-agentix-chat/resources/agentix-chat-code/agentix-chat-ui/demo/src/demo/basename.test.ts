/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { describe, expect, it } from 'vitest';
import { computeBasename } from '../../demo/basename';

describe('computeBasename', () => {
  it('extracts /<env>/<app> from a gateway-served path', () => {
    expect(computeBasename('/rambandi0717/nxembed/chat/')).toBe('/rambandi0717/nxembed');
  });

  it('strips a trailing index.html before deriving', () => {
    expect(computeBasename('/rambandi0717/nxembed/index.html')).toBe('/rambandi0717/nxembed');
    expect(computeBasename('/env/app/chat/index.html')).toBe('/env/app');
  });

  it('falls back to / for root-served or single-segment paths', () => {
    expect(computeBasename('/')).toBe('/');
    expect(computeBasename('/chat')).toBe('/');
    expect(computeBasename('/index.html')).toBe('/');
  });
});
