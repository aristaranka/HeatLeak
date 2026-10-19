/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Types for the CommonJS post-build script. The script itself stays plain `.cjs` because `npm run
 * build:demo` runs it with bare node (no transpile step); this declaration exists so the vitest
 * suite can import it — rather than `require` it — and be both type-checked and instrumented for
 * coverage.
 */

/** One `assets/*` tag lifted out of the HTML Vite emitted. */
export interface AssetTag {
  /** The `assets/…`-relative URL, as written in the emitted HTML. */
  path: string;
  /** True for `<script>`, false for `<link rel="stylesheet">`. */
  isScript: boolean;
  /** The full original tag text. */
  full: string;
}

/** A host-only Tailwind rule the emitted stylesheet must contain. */
export interface HostOnlyCssRule {
  label: string;
  pattern: RegExp;
}

/** Options for {@link main}; anything omitted falls back to {@link MAIN_DEFAULTS}. */
export interface MainOptions {
  distPath?: string;
  uiContentPath?: string;
  log?: (...args: unknown[]) => void;
}

/** Routes that get their own emitted `index.html`, mirroring what `EmbedDemoRoutes` owns. */
export const ROUTE_PATHS: readonly string[];

export const HOST_ONLY_CSS_RULES: readonly HostOnlyCssRule[];

export const MAIN_DEFAULTS: { distPath: string; uiContentPath: string; log: (...args: unknown[]) => void };

/** Splits the emitted HTML into its `assets/*` tags and the HTML with those tags removed. */
export function extractAssetTags(html: string): { tags: AssetTag[]; cleaned: string };

export function toSpaHtml(html: string): string;

export function buildDynamicBaseScript(tags: readonly AssetTag[]): string;

export function injectDynamicBase(html: string, script: string): string;

export function buildIndexHtml(distHtml: string): string;

export function assertHostOnlyCssRules(css: string, cssPathLabel: string): void;

export function findEmittedCss(uiContentPath: string): string[];

export function main(overrides?: MainOptions): void;
