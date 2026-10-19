/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The route-ownership probe only needs to know WHERE the embed mounts, not what it does. Mounting
// the real one drags in Microservice discovery + a cookie exchange, so mock it at the package seam
// (same seam as EmbedDemoRoutes.test.tsx).
vi.mock('@c3/agentix-client-ui', () => ({
  NexusChatEmbed: () => <div data-testid="embed">embed</div>,
}));

import { EmbedDemoRoutes } from '../../demo/EmbedDemoRoutes';

// postBuild.cjs is the last hop before the embed is served, and it is where two of this ticket's
// real bugs lived: a phantom route directory, and an unstyled MCP dialog that only a built-CSS
// check can catch. Imported (not `require`d, via the adjacent .d.cts) so it is type-checked and runs
// through the same transform pipeline as the rest of the suite, which is what puts it in coverage.
import * as postBuild from '../../demo/postBuild.cjs';

/** A minimal stand-in for the head Vite emits (module script + stylesheet, both `./assets/`). */
const DIST_INDEX_HTML = [
  '<!doctype html>',
  '<html>',
  '  <head>',
  '    <title>Embed demo</title>',
  '    <script type="module" crossorigin src="./assets/index.js"></script>',
  '    <link rel="stylesheet" crossorigin href="./assets/index.css">',
  '  </head>',
  '  <body><div id="root"></div></body>',
  '</html>',
].join('\n');

/** CSS carrying every host-only rule the build assertion demands. */
const GOOD_CSS = '.max-w-lg{max-width:32rem}.animate-in{animation-name:enter}[data-state=open]{opacity:1}';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'postbuild-test-'));
});

afterEach(() => {
  cleanup();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Lay out a fake `dist/` the way Vite would, with the given stylesheet contents. */
function makeDist(css: string = GOOD_CSS): string {
  const distPath = path.join(tmpDir, 'dist');
  fs.mkdirSync(path.join(distPath, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(distPath, 'index.html'), DIST_INDEX_HTML);
  fs.writeFileSync(path.join(distPath, 'assets', 'index.css'), css);
  fs.writeFileSync(path.join(distPath, 'assets', 'index.js'), '// bundle');
  return distPath;
}

function runMain(distPath: string): { uiContentPath: string } {
  const uiContentPath = path.join(tmpDir, 'ui', 'content');
  postBuild.main({ distPath, uiContentPath, log: () => {} });
  return { uiContentPath };
}

describe('postBuild — asset tag surgery', () => {
  it('rewrites Vite\u2019s ./assets/ references to gateway-relative assets/', () => {
    const spa = postBuild.toSpaHtml(DIST_INDEX_HTML);
    expect(spa).toContain('src="assets/index.js"');
    expect(spa).toContain('href="assets/index.css"');
    expect(spa).not.toContain('./assets/');
  });

  it('extracts the script and stylesheet in document order and removes them from the head', () => {
    const { cleaned, tags } = postBuild.extractAssetTags(postBuild.toSpaHtml(DIST_INDEX_HTML));
    expect(tags.map((t: { path: string }) => t.path)).toEqual(['assets/index.js', 'assets/index.css']);
    expect(tags.map((t: { isScript: boolean }) => t.isScript)).toEqual([true, false]);
    // The preload scanner must not see them, which is the whole reason they are re-injected.
    expect(cleaned).not.toContain('assets/index.js');
    expect(cleaned).not.toContain('assets/index.css');
    expect(cleaned).toContain('<title>Embed demo</title>');
  });

  it('ignores a non-stylesheet link so only real stylesheets are re-injected', () => {
    const html = '<link rel="preload" href="assets/font.woff2"><script src="assets/index.js"></script>';
    const { tags } = postBuild.extractAssetTags(html);
    expect(tags.map((t: { path: string }) => t.path)).toEqual(['assets/index.js']);
  });

  it('throws when Vite emitted no assets/ tags at all rather than serving a blank page', () => {
    expect(() => postBuild.extractAssetTags('<html><head><title>t</title></head></html>')).toThrow(/no assets\//);
  });
});

describe('postBuild — dynamic base script', () => {
  const tags = [
    { path: 'assets/index.js', isScript: true, full: '' },
    { path: 'assets/index.css', isScript: false, full: '' },
  ];

  it('plants a <base> and prefixes both assets when served under /<env>/<app>', () => {
    const script = postBuild.buildDynamicBaseScript(tags);
    expect(script).toContain("document.write('<base href=\"'+b+'\">')");
    expect(script).toContain('src="\'+b+\'assets/index.js"');
    expect(script).toContain('href="\'+b+\'assets/index.css"');
  });

  it('falls back to unprefixed assets and no <base> when the page is served at root', () => {
    const script = postBuild.buildDynamicBaseScript(tags);
    // The `p.length<2` branch runs before any `b` is computed, so its writes carry no prefix.
    const rootBranch = script.slice(script.indexOf('if(p.length<2)'), script.indexOf('return;'));
    expect(rootBranch).toContain('src="assets/index.js"');
    expect(rootBranch).not.toContain("'+b+'");
  });

  it('escapes the injected closing script tag so it cannot terminate the inline script early', () => {
    expect(postBuild.buildDynamicBaseScript(tags)).toContain('<\\/script>');
  });

  it('injects the script into the head immediately after </title>', () => {
    const out = postBuild.injectDynamicBase('<head><title>t</title></head>', '<script>x</script>');
    expect(out).toContain('</title>\n    <script>x</script>');
  });

  it('throws when there is no </title> to anchor the injection', () => {
    expect(() => postBuild.injectDynamicBase('<head></head>', '<script>x</script>')).toThrow(/<\/title> not found/);
  });
});

describe('postBuild — host-only CSS assertion', () => {
  it('passes when every host-only rule is present', () => {
    expect(() => postBuild.assertHostOnlyCssRules(GOOD_CSS, 'assets/index.css')).not.toThrow();
  });

  it('rejects CSS where the bare utility is absent and only its responsive variant matches', () => {
    // The false-pass a substring check gives: `.sm\:max-w-lg` satisfies `includes('max-w-lg')`
    // while the bare `.max-w-lg` rule the dialog needs is missing. Observed on a real artifact.
    const css = '.sm\\:max-w-lg{max-width:32rem}.animate-in{animation-name:enter}[data-state=open]{opacity:1}';
    expect(() => postBuild.assertHostOnlyCssRules(css, 'assets/index.css')).toThrow(/max-w-lg \(dialog width\)/);
  });

  it('names every missing rule and points at the demo.css @source roots', () => {
    let message = '';
    try {
      postBuild.assertHostOnlyCssRules('.text-sm{font-size:.875rem}', 'assets/index.css');
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('max-w-lg (dialog width)');
    expect(message).toContain('animate-in (dialog enter animation)');
    expect(message).toContain('data-state=open (Radix open-state variant)');
    expect(message).toContain('demo/demo.css');
    expect(message).toContain('MCP consent dialog');
  });

  it('fails the whole build — not just warns — when the emitted CSS regresses', () => {
    expect(() => runMain(makeDist('.text-sm{font-size:.875rem}'))).toThrow(/missing host-only Tailwind rules/);
  });

  it('fails when the Tailwind entry produced no stylesheet at all', () => {
    const distPath = makeDist();
    fs.rmSync(path.join(distPath, 'assets', 'index.css'));
    expect(() => runMain(distPath)).toThrow(/no \*\.css/);
  });

  it('fails when the build emitted no assets/ dir at all', () => {
    const distPath = makeDist();
    fs.rmSync(path.join(distPath, 'assets'), { recursive: true });
    expect(() => runMain(distPath)).toThrow(/no assets\/ dir/);
  });
});

describe('postBuild — emitted route directories', () => {
  it('writes an index.html for the root and for every owned route', () => {
    const { uiContentPath } = runMain(makeDist());
    expect(fs.existsSync(path.join(uiContentPath, 'index.html'))).toBe(true);
    for (const route of postBuild.ROUTE_PATHS as string[]) {
      expect(fs.existsSync(path.join(uiContentPath, route, 'index.html'))).toBe(true);
    }
  });

  it('serves identical HTML at the root and at a deep-linked route', () => {
    const { uiContentPath } = runMain(makeDist());
    const root = fs.readFileSync(path.join(uiContentPath, 'index.html'), 'utf-8');
    const chat = fs.readFileSync(path.join(uiContentPath, 'chat', 'index.html'), 'utf-8');
    expect(chat).toBe(root);
  });

  it('emits exactly the routes EmbedDemoRoutes serves without redirecting', () => {
    // The phantom-route guard. A route is "owned" only if entering it renders the embed AT that
    // path; anything that redirects (`/`, `*`) is served by the root index and must NOT get a
    // directory. Behavioral: routes are probed by rendering, not by regexing the .tsx source.
    const owned = ['chat', 'home', 'settings'].filter((candidate) => {
      cleanup();
      render(
        <MemoryRouter initialEntries={[`/${candidate}`]}>
          <EmbedDemoRoutes />
          <Routes>
            <Route path="*" element={<PathProbe />} />
          </Routes>
        </MemoryRouter>
      );
      const landedHere = screen.getByTestId('pathname').textContent === `/${candidate}`;
      // Owning a route means the embed actually renders there, not merely that the path survived.
      return landedHere && screen.queryByTestId('embed') !== null;
    });
    expect([...(postBuild.ROUTE_PATHS as string[])].sort()).toEqual(owned.sort());
  });

  it('defaults to the real build locations when run as a script with no overrides', () => {
    // `main()` takes no args in script mode, so these defaults are the only thing pointing it at the
    // Vite output and the served directory. Drift here would publish nothing, silently.
    expect(postBuild.MAIN_DEFAULTS.distPath.endsWith(path.join('demo', 'dist'))).toBe(true);
    expect(postBuild.MAIN_DEFAULTS.uiContentPath.endsWith(path.join('ui', 'content'))).toBe(true);
  });

  it('starts from a clean ui/content so a removed route\u2019s directory cannot linger', () => {
    const distPath = makeDist();
    const { uiContentPath } = runMain(distPath);
    const stale = path.join(uiContentPath, 'home');
    fs.mkdirSync(stale, { recursive: true });
    fs.writeFileSync(path.join(stale, 'index.html'), 'stale');

    runMain(distPath);
    expect(fs.existsSync(stale)).toBe(false);
  });
});

/** Reports the post-redirect pathname so "does this route redirect?" is observable. */
function PathProbe() {
  const { pathname } = useLocation();
  return <div data-testid="pathname">{pathname}</div>;
}
