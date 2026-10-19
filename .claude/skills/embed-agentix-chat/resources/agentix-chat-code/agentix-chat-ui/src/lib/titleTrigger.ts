/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import type { ChatMessage } from './types';

/** Re-title every N assistant turns past the initial title. Tests can mock-import this. */
export const RETITLE_TURN_INTERVAL = 50;

/** Per-message budget for the title-gen prompt. Anything over THRESHOLD gets
 *  head + ellipsis + tail truncation so one giant message (code dump, error
 *  trace, pasted document) doesn't crowd out the other messages. The shape
 *  preserves intent: the start of a message usually states the topic; the end
 *  usually states the specific ask. These are starting numbers — iterate later
 *  if titles end up underspecified. */
export const TITLE_MSG_THRESHOLD = 400;
export const TITLE_MSG_HEAD_TAIL = 100;

/** Clip one message's text for the title-gen prompt. */
export function clipForTitle(text: string): string {
  const t = (text || '').trim();
  if (t.length <= TITLE_MSG_THRESHOLD) return t;
  return `${t.slice(0, TITLE_MSG_HEAD_TAIL)} … ${t.slice(-TITLE_MSG_HEAD_TAIL)}`;
}

/** Decide what (if anything) the title-gen flow should do. */
export type TitleAction = 'none' | 'initial' | 'retitle';

interface DecideArgs {
  /** Number of ASSISTANT text messages already in state. */
  assistantTurns: number;
  /** Current persisted title; empty string for "not set". */
  currentTitle: string;
  /** Assistant-turn count at which the last title gen fired (0 = never). */
  lastTitleAtTurn: number;
  /** True if a title gen is already in flight; we never queue a second. */
  inFlight: boolean;
}

/**
 * Pure decision function for the title-gen trigger. No React coupling so it
 * can be unit-tested directly.
 *
 *   - 'initial' fires once the 1st assistant response has landed — the chat
 *     immediately gets a real, topic-bearing title instead of sitting as
 *     "New chat" until a second exchange. One Q&A is enough to summarize the
 *     topic in 4–6 words.
 *   - 'retitle' fires once every RETITLE_TURN_INTERVAL assistant turns past
 *     the last gen so the sidebar label keeps up as the conversation drifts.
 *   - 'none' otherwise. In particular: never fire while inFlight is true, and
 *     never fire before the 1st assistant response (the user message alone has
 *     no answer to summarize against).
 *
 *  The empty-title gate is intentional: the provisional sidebar label (the
 *  clipped first user message) is display-only and is NOT persisted as the
 *  title, so `currentTitle` stays empty until this smart title lands — which is
 *  exactly the "no smart title yet" signal this branch keys on.
 */
export function decideTitleAction({
  assistantTurns,
  currentTitle,
  lastTitleAtTurn,
  inFlight,
}: DecideArgs): TitleAction {
  if (inFlight) return 'none';

  if (!currentTitle.trim()) {
    if (assistantTurns >= 1) return 'initial';
    return 'none';
  }

  // Title is set. lastTitleAtTurn=0 only happens before the initial gen — once
  // 'initial' fires, callers must update it.
  if (lastTitleAtTurn === 0) return 'none';
  if (assistantTurns - lastTitleAtTurn >= RETITLE_TURN_INTERVAL) return 'retitle';
  return 'none';
}

/**
 * Build the prompt seed for the title-gen call. We send the latest 4 USER +
 * ASSISTANT text messages (oldest first so the conversation reads top-to-bottom),
 * each clipped via clipForTitle so a single long message doesn't dominate.
 *
 * For 'retitle' we also prepend the current title so the model can refine
 * without losing what's already there.
 */
export function buildTitlePrompt(action: 'initial' | 'retitle', messages: ChatMessage[], currentTitle: string): string {
  const transcript = transcriptFromMessages(messages, 4);
  if (action === 'retitle') {
    return [`Current title: "${currentTitle}"`, '', 'Latest exchange:', ...transcript].join('\n');
  }
  return transcript.join('\n\n');
}

function transcriptFromMessages(messages: ChatMessage[], take: number): string[] {
  const texts = messages.filter((m) => m.kind === 'TEXT' && (m.role === 'USER' || m.role === 'ASSISTANT'));
  const tail = texts.slice(-take);
  const lines: string[] = [];
  for (const m of tail) {
    const role = m.role === 'USER' ? 'USER' : 'ASSISTANT';
    const text = clipForTitle(m.text || '');
    if (text) lines.push(`${role}: ${text}`);
  }
  return lines;
}
