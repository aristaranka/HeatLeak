/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { resolveBasename } from '../../demo/resolveBasename';

const ORIGINAL_PATH = window.location.pathname + window.location.search + window.location.hash;

afterEach(() => {
  window.history.replaceState(null, '', ORIGINAL_PATH);
});

/** A location stand-in that records the normalizing replaceState the entry performs. */
function loc(pathname: string, search = '', hash = '') {
  const replaced: string[] = [];
  return {
    stub: { pathname, search, hash, replaceState: (p: string) => void replaced.push(p) },
    replaced,
  };
}

describe('resolveBasename', () => {
  it('returns the /<env>/<app> prefix for a gateway-served path', () => {
    const { stub, replaced } = loc('/nxenv/nxembed/chat');
    expect(resolveBasename(false, stub)).toBe('/nxenv/nxembed');
    expect(replaced).toEqual([]);
  });

  it('normalizes a trailing /index.html out of the address bar', () => {
    // The gateway serves /index.html for a directory hit; left in place React Router treats it as
    // a route segment and a reload lands on a dead path.
    const { stub, replaced } = loc('/nxenv/nxembed/index.html');
    expect(resolveBasename(false, stub)).toBe('/nxenv/nxembed');
    expect(replaced).toEqual(['/nxenv/nxembed/']);
  });

  it('carries the session hash and query through the normalization', () => {
    // ChatPage keeps the session id in the hash, so dropping it here would reset the user's chat.
    const { stub, replaced } = loc('/nxenv/nxembed/index.html', '?debug=1', '#session-42');
    expect(resolveBasename(false, stub)).toBe('/nxenv/nxembed');
    expect(replaced).toEqual(['/nxenv/nxembed/?debug=1#session-42']);
  });

  it('rewrites the address bar exactly once', () => {
    const { stub, replaced } = loc('/nxenv/nxembed/index.html');
    resolveBasename(false, stub);
    expect(replaced).toHaveLength(1);
  });

  it('leaves a clean path untouched rather than rewriting history needlessly', () => {
    const { stub, replaced } = loc('/nxenv/nxembed/');
    expect(resolveBasename(false, stub)).toBe('/nxenv/nxembed');
    expect(replaced).toEqual([]);
  });

  it('falls back to / when the path is too short to carry an env/app pair', () => {
    const { stub } = loc('/onlyone');
    expect(resolveBasename(false, stub)).toBe('/');
  });

  it('short-circuits to / in dev without touching the address bar', () => {
    // Vite serves at root, so the path holds React routes — normalizing it would corrupt them.
    const { stub, replaced } = loc('/chat/index.html');
    expect(resolveBasename(true, stub)).toBe('/');
    expect(replaced).toEqual([]);
  });

  it('defaults isDev from the bundle env when called with no arguments at all', () => {
    // Pins the entry's literal call shape, `resolveBasename()`. Under vitest the bundle env is dev,
    // so the dev short-circuit is what a zero-arg call must produce — and the address bar, parked
    // at a gateway-shaped path, must be left completely alone by that branch.
    window.history.replaceState(null, '', '/nxenv/nxembed/index.html');

    expect(resolveBasename()).toBe('/');
    expect(window.location.pathname).toBe('/nxenv/nxembed/index.html');
  });

  it('drives the real window/history when called with no arguments, as the entry does', () => {
    // The injected-stub cases above never exercise the production defaults. Park a real
    // `/index.html` address in jsdom's history, then call the zero-arg form the entry uses and
    // assert the address bar itself was normalized.
    window.history.replaceState(null, '', '/nxenv/nxembed/index.html#session-42');

    expect(resolveBasename(false)).toBe('/nxenv/nxembed');
    expect(window.location.pathname).toBe('/nxenv/nxembed/');
    expect(window.location.hash).toBe('#session-42');
  });

  it('leaves the real address bar alone when it is already clean', () => {
    window.history.replaceState(null, '', '/nxenv/nxembed/chat');

    expect(resolveBasename(false)).toBe('/nxenv/nxembed');
    expect(window.location.pathname).toBe('/nxenv/nxembed/chat');
  });
});
