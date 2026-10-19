/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

/**
 * Compiles `src/styles/embed.source.css` (Tailwind v4, NO Preflight) into a single self-contained
 * stylesheet that `NexusChatEmbed` imports so a consumer gets the host's exact look — fonts, tokens,
 * dark mode, and every utility the chat subtree uses — with zero Tailwind setup of their own.
 *
 * `scripts/build-embed-css.sh` runs this and post-processes the output into `src/styles/embed.css`
 * — a gitignored BUILD OUTPUT, never committed. Every host/demo build invokes build:embed-css
 * generate-first (so embed.css exists before vite resolves NexusChatEmbed's static import), and the
 * host postBuild vendors it into the starter-kit tgz. The raw Vite output dir is gitignored too.
 *
 * Fonts inline as data URIs (assetsInlineLimit forces woff2 inline) so the shipped CSS makes no
 * external asset request — the right default for a locked-CSP / air-gapped embed.
 */
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    outDir: 'dist-embed-css',
    emptyOutDir: true,
    cssCodeSplit: false,
    cssMinify: true,
    // Force the Geist woff2 (~56KB each, above Vite's 4KB default) to inline as data URIs.
    assetsInlineLimit: (filePath: string) => (/\.woff2?$/i.test(filePath) ? true : undefined),
    lib: {
      entry: 'embed-css.entry.ts',
      formats: ['es'],
      fileName: () => 'embed-entry.js',
    },
  },
});
