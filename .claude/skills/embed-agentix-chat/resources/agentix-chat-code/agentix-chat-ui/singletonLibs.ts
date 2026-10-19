/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/*
 * Canonical single-copy library set for `@c3/agentix-client-ui`.
 *
 * These are the context-bearing / stateful libraries the chat UI renders through that MUST resolve
 * to exactly one physical copy in any bundle. Two copies means the consumer's Provider and the chat
 * UI's `useContext` read different instances, so context comes back empty at runtime with NOTHING
 * failing at build time — the worst kind of regression to catch late.
 *
 * This list is the SINGLE SOURCE for every place that pins these:
 *   - this package's own `vite.config.ts` (the vitest config that runs the embed demo suites)
 *   - the embed demo's `demo/viteShared.ts`, re-exported into `demo/vite.demo.config.ts`
 *   - the host SPA's `c3/nexus/react/vite.config.ts` `dedupe` (host depends on this package)
 *   - the test harness `c3/nexusClientTest/react/viteShared.ts`, re-exported into its vitest config
 *     (the test package depends on this package)
 * The package is the one module all of these may import under C3 package-independence, so it owns the
 * list. Every config IMPORTS this array rather than copying it, so the single source is enforced by
 * construction: there is no second copy that could drift by an entry and silently reintroduce the
 * two-copies bug — the failure mode is designed out, not policed by a test.
 *
 * `react-router` is a consumer-provided peer (`^7 || ^8` — v7 pairs with React 18, v8 with React 19);
 * pin the `react-router` name, not the v6-era `react-router-dom` (that name pins nothing — the mistake
 * shipped once and deduped no router at all). `@tiptap/{react,core,pm}` carry the editor's React context and
 * ProseMirror state/plugin identity (the package ships `RichTextEditor`); the tiptap *extension*
 * packages are stateless glue and need no pinning — mirror this scope, not the whole tiptap tree.
 */
export const SINGLETON_LIBS = [
  '@tanstack/react-query',
  'i18next-browser-languagedetector',
  'react-router',
  'react-i18next',
  'react-dom',
  'react',
  'i18next',
  'next-themes',
  'sonner',
  'radix-ui',
  'lucide-react',
  'cmdk',
  '@tiptap/react',
  '@tiptap/core',
  '@tiptap/pm',
];
