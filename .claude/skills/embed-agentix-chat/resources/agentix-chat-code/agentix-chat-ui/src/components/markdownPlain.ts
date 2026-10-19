/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Normalize Tiptap's markdown serialization before it leaves the editor. Empty paragraphs (from the
 * user pressing Enter) serialize to a literal `&nbsp;` line, and blocks can accumulate extra blank
 * lines — both render as junk (a literal "&nbsp;", big gaps) downstream. Strip them without touching
 * intentional content.
 */
export const cleanMarkdown = (md: string): string =>
  md
    .replace(/&nbsp;/g, ' ') // entity Tiptap emits for hard/empty spaces → real space
    .replace(/[ \t]+$/gm, '') // trailing whitespace per line
    .replace(/\n{3,}/g, '\n\n') // collapse 3+ newlines to a single blank line
    .replace(/\s+$/g, ''); // drop trailing blank lines / whitespace

/**
 * Convert a plain-text draft into markdown that survives the flip into rich mode without
 * losing single newlines. CommonMark treats a lone `\n` inside a paragraph as a soft break
 * (renders as a space), so a plain draft like "line 1\nline 2" would collapse onto one line
 * when Tiptap parses it as markdown. We keep blank-line paragraph breaks (`\n\n`) intact and
 * turn every remaining in-paragraph newline into a backslash hard break — which Tiptap imports
 * as a real line break and which `cleanMarkdown` won't strip (unlike a two-trailing-space break).
 */
export const plainToMarkdown = (text: string): string =>
  text
    .split(/\n{2,}/) // paragraphs — preserve the blank-line breaks between them
    .map((para) => para.replace(/\n/g, '\\\n')) // in-paragraph newlines → hard breaks
    .join('\n\n');
