/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import * as path from 'path';
import { SINGLETON_LIBS } from './singletonLibs';

// This package ships raw `src/` and is consumed by apps whose own tsconfig/vite may map `@/` to a
// different tree. So shipped `src/` uses package-relative imports ONLY — there is deliberately no
// `@/` alias here (nor in tsconfig.json). A reintroduced `@/` specifier must fail to resolve in
// build (surfacing as an error) rather than silently working in-repo and breaking every consumer;
// the package-boundary guard in nexusClientTest is the source-level companion.
//
// The CHAT vitest suite still lives in c3/nexusClientTest/react. What runs HERE is only the embed
// demo's own suites (demo/src/demo), which cover the runnable host SPA this template ships. They
// mock `@c3/agentix-client-ui` at the package seam, so they never mount the real ChatPage — hence
// the light jsdom setup below rather than the full chat harness.

const PKG_NM = path.resolve(__dirname, 'node_modules');
const CLIENT_SRC = path.resolve(__dirname, 'src');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // The demo mounts `@c3/agentix-client-ui` — resolve it to this package's own source (the
      // demo tests mock it, but vitest still resolves the specifier's id).
      { find: /^@c3\/agentix-client-ui$/, replacement: path.join(CLIENT_SRC, 'index.ts') },
      { find: /^@c3\/agentix-client-ui\/(.*)$/, replacement: `${CLIENT_SRC}/$1` },
      ...SINGLETON_LIBS.map((lib) => ({ find: lib, replacement: path.join(PKG_NM, lib) })),
    ],
    dedupe: SINGLETON_LIBS,
  },
  test: {
    // The embed demo's suites (demo/src/demo). Every c3/*/react package must expose a `test` script
    // that Jarvis runs; here it runs the demo tests. jsdom because they render the demo routes.
    environment: 'jsdom',
    include: ['demo/src/**/*.test.{ts,tsx}'],
    setupFiles: ['./demo/src/test/setupTests.ts'],
    passWithNoTests: true,
    // Jarvis enableC3UiCoverage passes --coverage on every c3/*/react package.
    // Without an explicit istanbul provider, vitest defaults to v8 and fails
    // with MISSING DEPENDENCY '@vitest/coverage-v8' (no JUnit XML). Same
    // provider + denominator shape as host / nexusClientTest; real suite hits
    // on product sources live in nexusClientTest (merge overwrites this
    // package's src/ zeros for shared path keys). The demo tree is not in the
    // denominator here — same as before the demo moved (nexusClientTest never
    // counted it either).
    coverage: {
      provider: 'istanbul',
      reporter: ['text-summary', 'json'],
      reportsDirectory: './coverage',
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'src/test/**'],
    },
  },
});
