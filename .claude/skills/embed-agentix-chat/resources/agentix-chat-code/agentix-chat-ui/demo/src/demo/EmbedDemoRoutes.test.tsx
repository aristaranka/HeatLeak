/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * Mock the embed at the package seam rather than mounting the real one: NexusChatEmbed does
 * Microservice discovery + a cookie exchange + a full ChatPage mount, none of which this file is
 * about. What IS under test is the consumer-side wiring a real embedding app must get right —
 * that `/chat` (and only `/chat`) mounts the embed with the required `agentDefId`, and that every
 * other entry redirects there instead of rendering a dead page. The mock surfaces the props it
 * received (the same prop-surfacing pattern as `src/NexusChatEmbed.test.tsx`) so the mount's exact
 * prop set is assertable. NexusChatEmbed's own behavior is covered in `src/NexusChatEmbed.test.tsx`.
 */
vi.mock('@c3/agentix-client-ui', () => ({
  NexusChatEmbed: (props: { agentDefId: string }) => (
    <div data-testid="embed" data-agent-def-id={props.agentDefId}>
      embed
    </div>
  ),
}));

import { EmbedDemoRoutes } from '../../demo/EmbedDemoRoutes';

/** Surfaces the post-redirect location so a redirect's destination is assertable, not just implied. */
function LocationProbe() {
  const { pathname, hash } = useLocation();
  return (
    <>
      <div data-testid="pathname">{pathname}</div>
      <div data-testid="hash">{hash}</div>
    </>
  );
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <EmbedDemoRoutes />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EmbedDemoRoutes', () => {
  afterEach(() => {
    cleanup();
  });

  it('mounts the embed at /chat with the required agentDefId', () => {
    renderAt('/chat');

    const embed = screen.getByTestId('embed');
    expect(embed).toBeInTheDocument();
    expect(screen.getByTestId('pathname')).toHaveTextContent('/chat');
    // The demo renders the full default embed: agentDefId is pinned; every per-feature toggle is
    // left to NexusChatEmbed's own defaults, NOT forced.
    expect(embed).toHaveAttribute('data-agent-def-id', 'C3Agent');
  });

  // ChatPage navigates to `/chat#<sessionId>`, so a bare app URL must not sit on a blank index.
  it('redirects the index to /chat', () => {
    renderAt('/');

    expect(screen.getByTestId('pathname')).toHaveTextContent('/chat');
    expect(screen.getByTestId('embed')).toBeInTheDocument();
  });

  it('redirects an unknown deep link to /chat rather than rendering nothing', () => {
    renderAt('/does/not/exist');

    expect(screen.getByTestId('pathname')).toHaveTextContent('/chat');
    expect(screen.getByTestId('embed')).toBeInTheDocument();
  });

  // The hash carries the session id, so the route that actually serves chat must not disturb it.
  it('preserves the session hash on a direct /chat entry', () => {
    renderAt('/chat#session-42');

    expect(screen.getByTestId('embed')).toBeInTheDocument();
    expect(screen.getByTestId('pathname')).toHaveTextContent('/chat');
    expect(screen.getByTestId('hash')).toHaveTextContent('#session-42');
  });
});
