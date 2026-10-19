/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Maps an in-flight tool frame to a compact human label for the live activity line.
 *
 * Keys ONLY on frame fields (`toolName` + `data.input`), never harness internals, so the
 * renderer stays harness-agnostic. Input key names are the verified opencode schema:
 *   read → filePath   bash → command   grep/glob → pattern   write/edit → filePath
 *
 * `input` is `unknown` (a raw passthrough of opencode's tool input) and is EMPTY (`{}`)
 * while a frame is PENDING — it only populates at RUNNING. Every branch therefore degrades
 * to a verb-only label when its key is absent, and unknown tools fall back to the tool name.
 * Never throws, never returns an empty string.
 */
export function toolActivityLabel(toolName: string, input: unknown): string {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

  switch (toolName.toLowerCase()) {
    case 'read':
      return join('Reading', str(o.filePath));
    case 'bash':
      return join('Running:', str(o.command));
    case 'edit':
    case 'write':
      return join('Editing', str(o.filePath));
    case 'grep':
    case 'glob':
      return join('Searching', str(o.pattern));
    default:
      return toolName ? `Running ${toolName}` : 'Working';
  }
}

/** `verb target` when a target is present, else just the verb (sans trailing colon). */
function join(verb: string, target: string | undefined): string {
  if (!target) return verb.endsWith(':') ? verb.slice(0, -1) : verb;
  return `${verb} ${target}`;
}
