/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useQuery } from '@tanstack/react-query';
import { Check, X, Type } from 'lucide-react';
import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CHAT_ATTACHMENT_CONFIG } from '../config/chatAttachments.config';
import { findActivePermissionId } from '../lib/activePermission';
import { markAwaitingDismissed } from '../lib/awaitingDismissed';
import { listEnvApps } from '../lib/chatApi';
import { isLlmBlocked } from '../lib/llmBlockReason';
import { formatThinkingDurationSeconds, useElapsedSecondsSince } from '../lib/thinkingElapsed';
import { hasPendingPermission } from '../lib/toolCallStatus';
import { cn } from '../lib/utils';
import { C3Logo } from './AgentIcons';
import AppsPicker from './AppsPicker';
import ChatErrorBar from './ChatErrorBar';
import ChatTranscriptSkeleton from './ChatTranscriptSkeleton';
import ContextGauge from './ContextGauge';
import CrossClusterAuthBanner from './CrossClusterAuthBanner';
import EffortControl from './EffortControl';
import { InlineResourceApp } from './InlineResourceApp';
import LiveActivity from './LiveActivity';
import { plainToMarkdown } from './markdownPlain';
import McpAuthExpiredBanner from './McpAuthExpiredBanner';
import McpConnectionsMenu from './McpConnectionsMenu';
import MessageBlock from './MessageBlock';
import ModelSelect from './ModelSelect';
import QuestionBlock from './QuestionBlock';

const RichTextComposer = lazy(() => import('./RichTextComposer'));
import SkillLearningReceipt from './SkillLearningReceipt';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import type { InlineResourceAppProps } from './InlineResourceApp';
import type { RichTextComposerHandle } from './RichTextComposer';
import type { ModelAvailability, ModelAvailabilityReason, ModelInfo, UploadProgress } from '../lib/chatApi';
import type { LlmBlockReason } from '../lib/llmBlockReason';
import type { ResourceAppInfo } from '../lib/resourceAppDetection';
import type { ChatMessage, FeedbackRating, PermissionResponse, QueuedMessage } from '../lib/types';

const COMPOSER_MIN_HEIGHT = 88;
const COMPOSER_MAX_HEIGHT = 280;
// Soft, advisory character budget surfaced by the rich composer as the user nears it — a nudge so a
// very long message doesn't silently blow the agent's context. Not a hard cap (never blocks typing).
const COMPOSER_CHAR_LIMIT = 8000;

/**
 * Hide the pending question while the turn is still streaming so option / free-text controls never
 * appear clickable-but-dead. Historical (already-answered) questions still render disabled.
 */
function shouldRenderQuestionBlock(
  messageId: string | undefined,
  isStreaming: boolean,
  pendingQuestionId: string | undefined
): boolean {
  return !(isStreaming && messageId != null && pendingQuestionId === messageId);
}

/**
 * Drag-to-resize the composer from a custom top-right handle. The native textarea grip is locked to
 * the bottom-right corner and can't be relocated via CSS, so `resize` is disabled and this drives the
 * height imperatively instead: dragging up (toward the chat history) grows the box, clamped to the
 * same min/max the textarea used.
 */
function startComposerResize(e: React.MouseEvent, textarea: HTMLTextAreaElement | null): void {
  if (!textarea) return;
  e.preventDefault();
  const startY = e.clientY;
  const startHeight = textarea.offsetHeight;
  const onMove = (ev: MouseEvent) => {
    const next = Math.min(COMPOSER_MAX_HEIGHT, Math.max(COMPOSER_MIN_HEIGHT, startHeight + (startY - ev.clientY)));
    textarea.style.height = `${next}px`;
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

/** Consecutive reasoning + tool-call frames render as one unordered list */
type ResponseStepSegment = { type: 'steps'; items: ChatMessage[] } | { type: 'single'; message: ChatMessage };

function segmentMessagesForResponseSteps(messages: ChatMessage[]): ResponseStepSegment[] {
  const out: ResponseStepSegment[] = [];
  let buf: ChatMessage[] = [];

  const flush = () => {
    if (buf.length > 0) {
      out.push({ type: 'steps', items: buf });
      buf = [];
    }
  };

  for (const m of messages) {
    if (m.kind === 'STEP_START') {
      flush();
      out.push({ type: 'single', message: m });
      continue;
    }
    if (
      m.kind === 'TOOL_CALL' ||
      m.kind === 'REASONING' ||
      (m.kind === 'TEXT' && m.role !== 'USER') ||
      m.kind === 'STEP_FINISH' ||
      m.kind === 'COMPACTION' ||
      m.kind === 'RETRY' ||
      m.kind === 'ERROR'
    ) {
      buf.push(m);
      continue;
    }
    flush();
    out.push({ type: 'single', message: m });
  }
  flush();
  return out;
}

/** Span from earliest to latest message timestamp in the step list (fallback when wall-clock duration was not stored). */
function inferDurationFromStepMessages(stepMsgs: ChatMessage[]): number | null {
  const times: number[] = [];
  for (const m of stepMsgs) {
    if (m.timestamp) {
      const t = Date.parse(m.timestamp);
      if (!Number.isNaN(t)) times.push(t);
    }
  }
  if (times.length < 2) return null;
  times.sort((a, b) => a - b);
  return Math.max(0, Math.floor((times[times.length - 1] - times[0]) / 1000));
}

/** Mirrors MessageBlock collapsible rules so the list bullet can delegate to the step toggle */
function stringifyStepPayload(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

function responseStepHasCollapsibleToggle(msg: ChatMessage, reasoningAutoExpanded: boolean): boolean {
  if (msg.kind === 'REASONING') {
    return !reasoningAutoExpanded;
  }
  if (msg.kind !== 'TOOL_CALL') return false;
  const state = msg.toolState || msg.data?.state || '';
  const isTerminal = state === 'COMPLETED' || state === 'ERROR' || state === 'CANCELLED';
  const inputStr = stringifyStepPayload(msg.data?.input);
  let outputStr = stringifyStepPayload(msg.data?.output);
  if (!outputStr && msg.text) {
    outputStr = typeof msg.text === 'string' ? msg.text : stringifyStepPayload(msg.text);
  }
  const hasDetails = Boolean(inputStr || outputStr);
  return isTerminal && hasDetails;
}

export type MessageChunk = { type: 'user'; message: ChatMessage } | { type: 'assistant'; messages: ChatMessage[] };

/**
 * Index of the chunk that published a given message (the ui:// app's source TOOL_CALL), so the
 * inline app card anchors at that turn. Returns -1 when the id is absent/unset. Pure (unit-tested).
 */
export function findAppChunkIndex(chunks: MessageChunk[], sourceMessageId: string | null | undefined): number {
  if (!sourceMessageId) return -1;
  return chunks.findIndex((c) => {
    return c.type === 'assistant' ? c.messages.some((m) => m.id === sourceMessageId) : c.message.id === sourceMessageId;
  });
}

/** Upper bound for treating an assistant TEXT as a tool-call preamble. Above this the text is real prose. */
const TOOL_DESCRIPTION_MAX_LEN = 120;

function qualifiesAsToolPreamble(msg: ChatMessage): boolean {
  if (msg.kind !== 'TEXT' || msg.role === 'USER') return false;
  const t = msg.text;
  if (typeof t !== 'string') return false;
  const trimmed = t.trim();
  if (trimmed.length === 0 || trimmed.length > TOOL_DESCRIPTION_MAX_LEN) return false;
  if (trimmed.includes('\n')) return false;
  return true;
}

// Identity-preserving cache for the decorated TOOL_CALL clones below. Keyed on the SOURCE message
// object (which mergeFrame keeps stable across streamed frames for unchanged messages), the cache
// returns the SAME decorated clone as long as the bound description hasn't changed — so a decorated
// tool call keeps its ref frame-to-frame and MessageBlock's React.memo can skip re-rendering it.
// Without this the `{ ...m, description }` spread minted a fresh object every frame, defeating the
// memo for exactly the tool-call-heavy streaming case it targets. WeakMap → source rows GC naturally.
const _decoratedToolCache = new WeakMap<ChatMessage, { description: string; clone: ChatMessage }>();

/**
 * Promote each TOOL_CALL's preceding short single-line assistant TEXT into the tool's
 * `description`, then drop the now-redundant TEXT bubble. Per AGENTS.md "Tool call labels"
 * the model emits these preambles deliberately; here we attach them so the UI renders the
 * description as the tool card's primary label instead of a separate text bubble above it.
 */
export function bindToolDescriptions(messages: ChatMessage[]): ChatMessage[] {
  const consumed = new Set<number>();
  const decorated = messages.map((m, i) => {
    if (m.kind !== 'TOOL_CALL') return m;
    if (m.description) return m;
    const prev = messages[i - 1];
    if (!prev || !qualifiesAsToolPreamble(prev)) return m;
    // Guard against pulling the closing TEXT of turn N onto a tool call in turn N+1.
    if (prev.turnId && m.turnId && prev.turnId !== m.turnId) return m;
    consumed.add(i - 1);
    const description = prev.text!.trim();
    const cached = _decoratedToolCache.get(m);
    if (cached && cached.description === description) return cached.clone;
    const clone = { ...m, description };
    _decoratedToolCache.set(m, { description, clone });
    return clone;
  });
  if (consumed.size === 0) return decorated;
  return decorated.filter((_, i) => !consumed.has(i));
}

export function chunkMessages(messages: ChatMessage[]): MessageChunk[] {
  const out: MessageChunk[] = [];
  for (const m of messages) {
    if (m.kind === 'TEXT' && m.role === 'USER') {
      out.push({ type: 'user', message: m });
    } else {
      const prev = out[out.length - 1];
      if (prev?.type === 'assistant') {
        prev.messages.push(m);
      } else {
        out.push({ type: 'assistant', messages: [m] });
      }
    }
  }
  return out;
}

/**
 * Everything except the last assistant TEXT chunk is "steps". QUESTION and PERMISSION
 * frames are pulled into their own buckets from BOTH halves so they never collapse
 * inside the thought-process disclosure and so PERMISSION always renders at the very
 * bottom of the chunk — after every tool call the model fired.
 */
function partitionAssistantMessages(messages: ChatMessage[]): {
  steps: ChatMessage[];
  tailTexts: ChatMessage[];
  questions: ChatMessage[];
  permissions: ChatMessage[];
} {
  let lastAssistantTextIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.kind === 'TEXT' && m.role !== 'USER') {
      lastAssistantTextIdx = i;
      break;
    }
  }
  const rawSteps = lastAssistantTextIdx === -1 ? messages : messages.slice(0, lastAssistantTextIdx);
  const rawTail = lastAssistantTextIdx === -1 ? [] : messages.slice(lastAssistantTextIdx);
  const steps: ChatMessage[] = [];
  const questions: ChatMessage[] = [];
  const permissions: ChatMessage[] = [];
  const tailTexts: ChatMessage[] = [];
  for (const m of rawSteps) {
    if (m.kind === 'QUESTION') questions.push(m);
    else if (m.kind === 'PERMISSION') permissions.push(m);
    else steps.push(m);
  }
  for (const m of rawTail) {
    if (m.kind === 'QUESTION') questions.push(m);
    else if (m.kind === 'PERMISSION') permissions.push(m);
    else tailTexts.push(m);
  }
  return { steps, tailTexts, questions, permissions };
}

/** Aligns with MessageBlock: omit thought UI when every step renders null or empty chrome (e.g. only STEP_START). */
function assistantStepMessageHasVisibleUI(msg: ChatMessage): boolean {
  switch (msg.kind) {
    case 'STEP_START':
      return false;
    case 'TEXT':
      if (msg.role === 'USER') {
        return Boolean(msg.attachments?.length || msg.text?.trim());
      }
      return Boolean(msg.text?.trim());
    case 'REASONING':
    case 'TOOL_CALL':
    case 'ERROR':
    case 'STEP_FINISH':
    case 'PERMISSION':
    case 'COMPACTION':
      return true;
    default:
      return false;
  }
}

function thoughtStepsHaveVisibleUI(steps: ChatMessage[]): boolean {
  return steps.some(assistantStepMessageHasVisibleUI);
}

/** Open the thought-process <details> by default so ERROR / CANCELLED frames (and failed/stopped tools) are not hidden. */
function thoughtStepsShouldDefaultOpen(steps: ChatMessage[]): boolean {
  return steps.some((m) => {
    if (m.kind === 'ERROR') return true;
    if (m.kind === 'TOOL_CALL') {
      const s = m.toolState || m.data?.state || '';
      return s === 'ERROR' || s === 'CANCELLED';
    }
    return false;
  });
}

/** Visual state of a single rail node. Tool calls map from their run state; reasoning/other steps
 *  are "neutral" (a quiet dot). State may live in `toolState` or `data.state` depending on the harness. */
type StepStatus = 'running' | 'done' | 'error' | 'cancelled' | 'neutral';

function stepMarkerStatus(msg: ChatMessage): StepStatus {
  if (msg.kind === 'TOOL_CALL') {
    const state = msg.toolState || msg.data?.state || '';
    if (state === 'RUNNING') return 'running';
    if (state === 'COMPLETED') return 'done';
    if (state === 'ERROR') return 'error';
    if (state === 'CANCELLED') return 'cancelled';
  }
  return 'neutral';
}

/** The icon that sits on the timeline rail for a step: spinner while running, a green check when
 *  done, a red ✕ on error, a muted ✕ when cancelled, and a small dot for reasoning/queued steps. */
const StepMarkerIcon: React.FC<{ status: StepStatus }> = ({ status }) => {
  if (status === 'running') return <span className="nexus-spinner size-3.5 border-[1.5px]" aria-hidden />;
  if (status === 'done') return <Check className="size-3.5 text-success" strokeWidth={3} aria-hidden />;
  if (status === 'error') return <X className="size-3.5 text-destructive" strokeWidth={3} aria-hidden />;
  if (status === 'cancelled') return <X className="size-3.5 text-muted-foreground" strokeWidth={2.5} aria-hidden />;
  return (
    <span
      className="chat-page__response-steps-dot block h-[7px] w-[7px] rounded-full bg-muted-foreground transition-colors"
      aria-hidden
    />
  );
};

const ThoughtProcessDetails: React.FC<{
  steps: ChatMessage[];
  /** Summary line: the live activity node during a live turn, or a "Thought for {N}s" string after. */
  summary: React.ReactNode;
  children: React.ReactNode;
}> = ({ steps, summary, children }) => {
  // Collapsed by default (compact, expand-on-demand); auto-opens on ERROR/CANCELLED below.
  const shouldForceOpen = thoughtStepsShouldDefaultOpen(steps);
  const [open, setOpen] = useState(shouldForceOpen);
  // When an ERROR or CANCELLED arrives AFTER mount (e.g. user clicks Stop and
  // the finally-flip turns a RUNNING tool into CANCELLED), open the drawer so
  // the badge is visible. Boolean dep is stable; only transitions trigger.
  useEffect(() => {
    if (shouldForceOpen) setOpen(true);
  }, [shouldForceOpen]);

  return (
    <details
      className="chat-page__thought-details group mb-4"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="chat-page__thought-summary flex cursor-pointer select-none list-none items-center gap-2 pb-1.5 text-[13px] font-normal text-muted-foreground [&::-webkit-details-marker]:hidden">
        <span className="chat-page__thought-summary-chevron -mt-px inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center text-muted-foreground transition-transform duration-200 group-open:rotate-90">
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 2l4 3-4 3" />
          </svg>
        </span>
        {/* overflow-hidden (not truncate): LiveActivity owns ellipsis. div, not span — summary is a block. */}
        <div className="chat-page__thought-summary-label min-w-0 flex-1 overflow-hidden">{summary}</div>
      </summary>
      {children}
    </details>
  );
};

/** Prefer the latest frame's turn id so it matches `streamingTurnKeyRef` / commitThoughtDuration storage */
function assistantTurnKey(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const tid = messages[i].turnId;
    if (tid) return tid;
  }
  return messages[0]?.id || 'unknown';
}

/** Plain elapsed-time "Thinking" row — the live line before any tool step exists (matches the
 *  historical footprint, so auto-follow-to-bottom behaves exactly as before for plain-text turns). */
const LiveThinkingRow: React.FC<{ startedAtMs: number | null }> = ({ startedAtMs }) => {
  const { t: tChat } = useTranslation('chat');
  const sec = useElapsedSecondsSince(startedAtMs);
  return (
    <div className="chat-page__thinking-row mb-3 text-[13px] text-muted-foreground" aria-live="polite">
      {tChat('thinkingFor', { duration: formatThinkingDurationSeconds(sec) })}
    </div>
  );
};

/**
 * The bare live line shown while a turn streams but has no visible tool steps yet: a
 * session-resume notice, or the plain "Thinking" row. The richer `LiveActivity` line
 * (verb + target + spinner) is reserved for the thought-process disclosure summary, where
 * actual tool activity lives — so a plain-text turn keeps the prior indicator + layout.
 */
function renderLiveLine(
  isResumingSession: boolean,
  startedAtMs: number | null,
  resumingLabel: string
): React.ReactNode {
  if (isResumingSession) {
    return (
      <div className="chat-page__thinking-row mb-3 text-[13px] text-muted-foreground" aria-live="polite">
        {resumingLabel}
      </div>
    );
  }
  return <LiveThinkingRow startedAtMs={startedAtMs} />;
}

/**
 * Single pass over a turn's steps: the live "current action" (latest in-flight TOOL_CALL,
 * else latest STEP_START) plus the per-turn STEP_START count. State may live in `toolState`
 * or `data.state` depending on the harness — read both (mirrors `thoughtStepsShouldDefaultOpen`).
 *
 * `permissions` is the turn's own PERMISSION frames (from `partitionAssistantMessages`) — when one
 * is still unresolved, the turn is blocked on a human, not actually executing a tool, so callers
 * should suppress the "running" spinner in favor of an "awaiting approval" indicator.
 */
export function liveActivityFor(
  steps: ChatMessage[],
  permissions: ChatMessage[] = []
): {
  activity: ChatMessage | null;
  stepCount: number;
  retryFrame: ChatMessage | null;
  awaitingApproval: boolean;
} {
  let activity: ChatMessage | null = null;
  let latestStepStart: ChatMessage | null = null;
  let stepCount = 0;
  let retryFrame: ChatMessage | null = null;
  for (const m of steps) {
    if (m.kind === 'STEP_START') {
      stepCount++;
      latestStepStart = m;
      retryFrame = null;
    } else if (m.kind === 'TOOL_CALL') {
      const state = m.toolState || m.data?.state;
      if (state === 'RUNNING' || state === 'PENDING') activity = m;
      retryFrame = null;
    } else if (m.kind === 'RETRY') {
      retryFrame = m;
    }
  }
  return {
    activity: activity ?? latestStepStart,
    stepCount,
    retryFrame,
    awaitingApproval: hasPendingPermission(permissions),
  };
}

export type TranscriptView = 'skeleton' | 'empty' | 'messages';

/**
 * Decides what fills the transcript area while it holds no messages: a content-shaped skeleton
 * while an existing chat's transcript is hydrating (so navigating between chats doesn't flash the
 * new-chat empty state), the empty state otherwise. Once messages exist — or a stream is live —
 * the real transcript renders.
 */
export function transcriptView(messageCount: number, isStreaming: boolean, hydrating: boolean): TranscriptView {
  if (messageCount > 0 || isStreaming) return 'messages';
  return hydrating ? 'skeleton' : 'empty';
}

/** Whether a composer change should locally dismiss this chat's awaiting-input nudge. True only
 *  for real typed content — a programmatic clear-to-empty (or whitespace) must not count as the
 *  user answering, or the nudge would vanish on a reset the user didn't intend. */
export function shouldDismissAwaitingOnInput(value: string): boolean {
  return value.trim().length > 0;
}

export interface ChatColumnProps {
  columnClassName: string;
  /** Callback or object ref — ChatPage uses a callback so scroll listeners re-bind when
   *  this node mounts after the landing-resolve early return (hashless /chat → /chat#id). */
  scrollRef: React.Ref<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  /** Pending realtime proposal sourced from this chat; rendered as a passive transcript receipt. */
  learningProposal?: import('../lib/types').SkillRow | null;
  learningProposalCount?: number;
  onReviewLearningProposal?: () => void;
  /** NXS-1157: show the jump-to-bottom affordance (true when the user has scrolled away from the
   *  bottom during a streaming turn). Scroll-follow logic lives in ChatPage; this just renders it. */
  showScrollToBottom: boolean;
  onScrollToBottom: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Bridge the active composer up to the page: `focus()` refocuses whichever composer is live
   *  (plain textarea or rich editor), and `richMode` reports whether the draft was composed in
   *  rich mode — the page reads it when tagging the optimistic user message so only rich-composed
   *  text is rendered as markdown. Composer-view state stays owned here; only these two facts leak. */
  composerBridgeRef?: React.MutableRefObject<{ focus: () => void; richMode: boolean } | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  /** Agent this chat is bound to — scopes the composer's MCP menu to that agent's connections. */
  agentDefId?: string | null;
  messages: ChatMessage[];
  messageChunks: MessageChunk[];
  isStreaming: boolean;
  /** True while an existing chat's transcript is being fetched (no messages on screen yet).
   *  Drives a loading skeleton instead of the new-chat empty state during navigation. */
  hydrating?: boolean;
  /** Turn start time + resuming flag — ChatColumn builds the live activity line per-turn from these. */
  liveQueryStartedAt: number | null;
  isResumingSession: boolean;
  thoughtDurationByTurnKey: Record<string, number>;
  activeStreamTurnId: string | null;
  lastStreamMessageId: string | null;
  respondToQuestion: (answer: string) => void;
  pendingQuestion: ChatMessage | null;
  onPermissionRespond?: (permissionId: string, response: PermissionResponse) => Promise<void> | void;
  error: string;
  setError: (msg: string) => void;
  /** Durable reference id for the current chat (its session id) shown on the error bar so a user can
   *  give it to an administrator when a resume/operational error needs support. Absent for a brand-new
   *  chat with no session id yet. */
  errorReferenceId?: string;
  agentBaseUrl: string | null | undefined;
  /** Session + MCP token and the detected ui:// app, so a published app renders INLINE in the
   *  message thread (a card anchored at its publishing turn) rather than as a side column. */
  sessionId?: string | null;
  /** From host `agentix-subagents` flag — gates inline subagent activity cards in the message list. */
  subagentsEnabled?: boolean;
  mcpToken?: string | null;
  resourceApp?: ResourceAppInfo | null;
  /** Inject a user turn from an in-thread app (its ui/message). */
  onAppSendMessage?: (text: string) => void;
  /** Callback invoked when the app requests a display mode change. */
  onAppRequestDisplayMode?: InlineResourceAppProps['onRequestDisplayMode'];
  /** Current display mode for the active app. */
  appDisplayMode?: InlineResourceAppProps['displayMode'];
  /** Display modes supported by the host. */
  appAvailableDisplayModes?: InlineResourceAppProps['availableDisplayModes'];
  /** Stable mount anchors for ui:// apps whose iframe lifecycle is owned by ChatPage. */
  inlineAppNodes?: Array<{ sourceMessageId?: string; node: React.ReactNode }>;
  /** No Agent.Definition exists to start a new chat with — disables the composer
   *  (new-chat/pending mode only; committed chats already have a bound agent). */
  noAgentsAvailable?: boolean;
  /** Cause of an LLM send block from `serviceHealth` (`llmBlockReason`). `starting` /
   *  `unavailable` / `empty` disable send, hide model+effort controls, set cause-specific
   *  placeholder/tooltip, and show a muted strip above the composer. `none` (default) leaves
   *  the composer ungated on models. */
  llmBlockReason?: LlmBlockReason;
  /** When `llmBlockReason === 'starting'`, use the long-wait starting copy (parent clocks ~60s). */
  llmStartingLongWait?: boolean;
  pendingFiles: { id: string; file: File }[];
  /** Attachment upload progress for the in-flight send (`null` when idle).
   *  `total === 0` renders as indeterminate (size not yet known). */
  uploadProgress: UploadProgress | null;
  onPickFiles: React.ChangeEventHandler<HTMLInputElement>;
  removePendingAt: (idx: number) => void;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  handleKeyDown: React.KeyboardEventHandler;
  sendMessage: () => void;
  /** Queued-message slot for the active session (PLAT-148695). When non-null, the
   *  composer renders a "Queued" chip next to the send/stop buttons. */
  queuedMessage: QueuedMessage | null;
  /** Click handler for the chip's × button — restores queued text to the textarea
   *  and clears the slot without aborting the active stream. */
  onCancelQueue: () => void;
  /** Click handler for the Stop button — restores queued text (if any) before
   *  aborting the active stream and notifying the server. */
  onStop: () => void;
  models: ModelInfo[];
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  autoAvailability?: ModelAvailability;
  autoAvailabilityReason?: ModelAvailabilityReason;
  /** False when the currently selected fixed/Auto route is not dispatchable. */
  modelRouteAvailable?: boolean;
  /** User-visible state/reason for the selected fixed route. Kept separate from the send-blocking
   *  boolean so a generation still applying is described as syncing rather than unavailable. */
  modelRouteAvailability?: ModelAvailability;
  modelRouteAvailabilityReason?: ModelAvailabilityReason;
  /** Fired when the model picker opens, so the page can re-read the pod catalog and let a
   *  `pending` option settle without polling. Optional. */
  onModelSelectOpen?: () => void;
  /** Effective reasoning-effort to display ('low'/'medium'/'high'/'auto'); derived by the composer. */
  selectedEffort: string;
  /** Pin a concrete effort level (or 'auto'). Only ever called with a string. */
  setSelectedEffort: (effort: string) => void;
  /** When true (default), render the effort + model pickers in the composer footer. When false,
   *  both are hidden so the conversation runs on the agent's configured model/effort defaults. */
  modelControlsEnabled?: boolean;
  /** When true, render the {@link AppsPicker} (connect + connected-apps list) in the composer footer.
   *  When false the whole picker is omitted — no trigger button, no connected-apps list — so an embed
   *  cannot connect apps at all. The host passes true; the embed leaves it off. */
  connectAppsEnabled?: boolean;
  /** When true, expose the picker's cross-cluster per-user OAuth entry point (the "ADD EXTERNAL APP"
   *  free-text id/URL input). Gated by the `nexus-cross-cluster-user-oauth` flag in the host. When
   *  false (default) the input is not rendered; the connected-apps list, "This app", and the admin
   *  Studio list are unaffected. Only meaningful alongside {@link connectAppsEnabled}. */
  crossClusterOAuthEnabled?: boolean;
  defaultModel: string | null;
  currentModel: string | null;
  estimatedConversationTokens: number;
  /** Latest turn-end context occupancy vs the auto-compaction ceiling (composer gauge).
   *  Null until a turn has reported (incl. after reload — turn-end facts aren't rehydrated). */
  contextUsage?: { used: number; max: number } | null;
  onFileClick?: (path: string) => void;
  /** Resolve a `/data/workspace/...` path to its served file URL, for inline image rendering. */
  resolveFileUrl?: (path: string) => string | null;
  /** Navigate to an app-internal, root-relative link the agent emitted in Markdown (SPA routing). */
  onInternalLinkClick?: (path: string) => void;
  onAttachmentClick?: (fileName: string) => void;
  onFeedback?: (turnId: string, rating: FeedbackRating, categories: string[], comment: string) => void;
  /** Resend the prompt behind an errored turn (rendered as a Retry control on `ERROR` bubbles). */
  onRetry?: (message: ChatMessage) => void;
  /** Observed sentinel at the top of the transcript — ChatPage attaches an
   *  IntersectionObserver that loads the previous page when it scrolls into view. */
  topSentinelRef?: React.RefObject<HTMLDivElement | null>;
  /** True while older pages remain to load (renders the sentinel). */
  hasMoreOlder?: boolean;
  /** True while an older page is in flight (renders the spinner). */
  loadingOlder?: boolean;
  /** Browser SpeechRecognition API available (see useSpeechRecognition). */
  speechSupported?: boolean;
  speechIsListening?: boolean;
  onSpeechStart?: () => void;
  onSpeechStop?: () => void;
  /** Connected apps for the composer footer picker. */
  connectedApps?: Record<string, import('../lib/types').TargetAppInfo>;
  onRemoveApp?: (appId: string) => void;
  onConnectApp?: (appId: string) => Promise<void>;
  /** The Nexus host app (id + display name), forwarded to {@link AppsPicker} as the pinned
   *  "This app" one-click connect row so any user can connect the agent to the app they're in. */
  currentApp?: { id: string; name: string };
  /** connectionKeys with a live mid-session MCP OAuth expiry (see McpAuthExpiredBanner). */
  mcpAuthExpiredKeys?: string[];
  /** Dismiss one connectionKey's expiry banner (X click or a successful reconnect). */
  onDismissMcpAuthExpired?: (connectionKey: string) => void;
  /** appIds needing a per-user cross-cluster sign-in the in-pod agent can't start (see
   *  CrossClusterAuthBanner). Oldest-first; empty renders nothing. */
  crossClusterAuthAppIds?: string[];
  /** Run per-user OAuth for one appId then auto-resume the agent. Rejects surface a row retry. */
  onConnectCrossClusterAuth?: (appId: string) => Promise<void>;
  /** Dismiss one appId's connect banner (X click). */
  onDismissCrossClusterAuth?: (appId: string) => void;
}

const ChatColumn: React.FC<ChatColumnProps> = ({
  columnClassName,
  scrollRef,
  messagesEndRef,
  learningProposal,
  learningProposalCount,
  onReviewLearningProposal,
  showScrollToBottom,
  onScrollToBottom,
  inputRef,
  composerBridgeRef,
  fileInputRef,
  agentDefId,
  messages,
  messageChunks,
  isStreaming,
  hydrating,
  liveQueryStartedAt,
  isResumingSession,
  thoughtDurationByTurnKey,
  activeStreamTurnId,
  lastStreamMessageId,
  respondToQuestion,
  pendingQuestion,
  onPermissionRespond,
  onRetry,
  error,
  setError,
  errorReferenceId,
  agentBaseUrl,
  noAgentsAvailable = false,
  llmBlockReason = 'none',
  llmStartingLongWait = false,
  pendingFiles,
  uploadProgress,
  onPickFiles,
  removePendingAt,
  input,
  setInput,
  handleKeyDown,
  sendMessage,
  queuedMessage,
  onCancelQueue,
  onStop,
  models,
  selectedModel,
  setSelectedModel,
  autoAvailability = 'available',
  autoAvailabilityReason,
  modelRouteAvailable = true,
  modelRouteAvailability,
  modelRouteAvailabilityReason,
  onModelSelectOpen,
  selectedEffort,
  setSelectedEffort,
  modelControlsEnabled = true,
  connectAppsEnabled = false,
  crossClusterOAuthEnabled = false,
  defaultModel,
  currentModel,
  estimatedConversationTokens,
  contextUsage = null,
  onFileClick,
  resolveFileUrl,
  onInternalLinkClick,
  onAttachmentClick,
  onFeedback,
  speechSupported = false,
  speechIsListening = false,
  onSpeechStart,
  onSpeechStop,
  connectedApps = {},
  onRemoveApp,
  onConnectApp,
  currentApp,
  topSentinelRef,
  hasMoreOlder,
  loadingOlder,
  mcpAuthExpiredKeys = [],
  onDismissMcpAuthExpired,
  crossClusterAuthAppIds = [],
  onConnectCrossClusterAuth,
  onDismissCrossClusterAuth,
  sessionId,
  subagentsEnabled = false,
  mcpToken,
  resourceApp,
  onAppSendMessage,
  onAppRequestDisplayMode,
  appDisplayMode,
  appAvailableDisplayModes,
  inlineAppNodes = [],
}) => {
  const { t } = useTranslation('chat');

  // Composer edits double as an implicit "I'm answering" signal: the moment the user types
  // a reply, locally dismiss this chat's awaiting-input nudge (badge + sidebar pill + toast)
  // rather than waiting for the pod to clear the server flag on submit. Guarded on real
  // content so a programmatic clear-to-empty doesn't count as typing.
  const handleComposerChange = (value: string) => {
    setInput(value);
    if (sessionId && shouldDismissAwaitingOnInput(value)) markAwaitingDismissed(sessionId);
  };

  // Studio apps for the composer footer picker's "add from studio" list. Shares the
  // ['envApps'] React-Query key with the Automations / Agent Details pages so it dedupes.
  // Admin-gated server-side (listEnvApps 403s non-admins; the client wrapper degrades that to an
  // empty list, so they just get the manual connect-by-id input in AppsPicker). Fetched whenever
  // the connect UI is present — including a brand-new chat before a pod exists — so the studio
  // list hydrates immediately rather than waiting for the first message to reserve a session.
  const studioAppsQuery = useQuery({
    queryKey: ['envApps'],
    queryFn: listEnvApps,
    enabled: !!onConnectApp,
    staleTime: 60_000,
  });

  // A published ui:// app renders INLINE in the thread, anchored at the assistant turn that
  // published it (chunk containing its source TOOL_CALL message). One node, reused only at the
  // matched chunk, so React never re-parents the iframe (its live state survives scroll/expand).
  const appChunkIndex = findAppChunkIndex(messageChunks, resourceApp?.sourceMessageId);
  const inlineAppNode =
    resourceApp && agentBaseUrl && sessionId ? (
      <InlineResourceApp
        agentBaseUrl={agentBaseUrl}
        sessionId={sessionId}
        mcpToken={mcpToken ?? null}
        resourceApp={resourceApp}
        messages={messages}
        onSendMessage={onAppSendMessage}
        onRequestDisplayMode={onAppRequestDisplayMode}
        displayMode={appDisplayMode ?? 'inline'}
        availableDisplayModes={appAvailableDisplayModes}
        className="mx-4 mb-4"
      />
    ) : null;
  const appNodesByChunk = new Map<number, React.ReactNode[]>();
  inlineAppNodes.forEach(({ sourceMessageId, node }) => {
    const index = findAppChunkIndex(messageChunks, sourceMessageId);
    appNodesByChunk.set(index, [...(appNodesByChunk.get(index) ?? []), node]);
  });
  // Composer view preference (plain textarea vs. Tiptap rich-text) — persisted locally, per browser.
  const [richText, setRichText] = useState<boolean>(() => {
    try {
      return localStorage.getItem('nexus.composer.richText') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('nexus.composer.richText', richText ? '1' : '0');
    } catch {
      // Best-effort persistence only — a disabled/full localStorage shouldn't break the composer.
    }
  }, [richText]);
  // Imperative handle to the inline rich editor (the modal one closes on send, so it never needs
  // refocus). Bridged up to the page so a post-send refocus lands in the right composer.
  const richComposerRef = useRef<RichTextComposerHandle>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!composerBridgeRef) return;
    composerBridgeRef.current = {
      focus: () => (richText ? richComposerRef.current?.focus() : inputRef.current?.focus()),
      richMode: richText,
    };
    return () => {
      composerBridgeRef.current = null;
    };
  }, [composerBridgeRef, richText, inputRef]);
  // Expanded (modal) rich-text composition — a larger surface for long-form / formatted messages.
  const [composerExpanded, setComposerExpanded] = useState(false);
  const llmBlocked = isLlmBlocked(llmBlockReason);
  const llmBlockMessage =
    llmBlockReason === 'empty'
      ? t('error.noModelsContactAdmin')
      : llmBlockReason === 'unavailable'
        ? t('error.llmServiceUnavailable')
        : llmBlockReason === 'starting'
          ? t(llmStartingLongWait ? 'error.llmStartingLongWait' : 'error.llmStarting')
          : null;
  const modelRouteBlockMessage = !modelRouteAvailable
    ? t(
        `modelAvailability.${
          modelRouteAvailabilityReason || (modelRouteAvailability === 'pending' ? 'syncing' : 'notServed')
        }`
      )
    : null;
  // Hidden model controls must not turn a rejected route into an unexplained dead end. Inherited
  // defaults recover automatically in ChatPage; an explicit pin remains sticky and gets this
  // actionable status until the route returns or an administrator changes the configuration.
  const composerBlockMessage = llmBlockMessage || modelRouteBlockMessage;
  const composerDisabled = !agentBaseUrl || noAgentsAvailable || llmBlocked || !modelRouteAvailable;
  const sendDisabled = (!input.trim() && pendingFiles.length === 0) || composerDisabled;
  const composerPlaceholder = composerBlockMessage
    ? composerBlockMessage
    : noAgentsAvailable
      ? t('placeholder.noAgents')
      : pendingQuestion
        ? t('placeholder.question')
        : agentBaseUrl
          ? t('placeholder.default')
          : t('placeholder.loading');
  // One-at-a-time approve queue. Logic + cases live in lib/activePermission.ts.
  const activePermissionId = useMemo(() => findActivePermissionId(messages), [messages]);
  // Friendly display name per model id (id is an AIP ARN for Bedrock) for the
  // per-turn model badge; the picker label is handled inside ModelSelect.
  const modelLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    models.forEach((m) => {
      map[m.id] = m.label;
    });
    return map;
  }, [models]);
  const plainComposer = (
    <>
      <textarea
        ref={inputRef}
        data-testid="chat-message-input"
        value={input}
        onChange={(e) => handleComposerChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={composerPlaceholder}
        disabled={composerDisabled}
        rows={4}
        className="chat-page__input block max-h-[280px] min-h-[88px] w-full resize-none border-0 bg-transparent p-3.5 text-[15px] leading-[1.55] focus:outline-none"
      />
      <button
        type="button"
        className="chat-page__input-resize-handle absolute right-0 top-0 z-[2] flex h-5 w-5 cursor-ns-resize items-center justify-center border-0 bg-transparent p-0 text-muted-foreground opacity-50 hover:opacity-100"
        aria-label={t('composer.resize')}
        title={t('composer.resize')}
        onMouseDown={(e) => startComposerResize(e, inputRef.current)}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2 2L10 10M6 2L10 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
    </>
  );

  return (
    <div className={columnClassName}>
      <div className="chat-page__scroll-wrap relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="chat-page__messages-scroll min-h-0 flex-1 overflow-y-auto py-4 [overflow-anchor:none]"
        >
          {/* data-nexus-transcript marks the conversation transcript so PostHog session replay
            masks its text WHEN configured (Nexus.Agent.Service.Config.posthogMaskTranscript →
            analyticsConfig.maskTranscript → session_recording.maskTextSelector in
            lib/analytics.ts). Default OFF: transcripts record in full (internal deployments);
            turn masking on for external/customer-facing ones. The marker is inert when masking
            is off. */}
          <div className="chat-page__messages-inner mx-auto max-w-[800px] px-4" data-nexus-transcript>
            {hasMoreOlder && (
              <div
                ref={topSentinelRef}
                data-testid="load-older-sentinel"
                className="chat-page__load-older-sentinel h-px"
              />
            )}
            {loadingOlder && (
              <div
                className="chat-page__load-older-spinner py-2 text-center text-[13px] text-muted-foreground"
                data-testid="load-older-spinner"
              >
                {t('loadingOlder')}
              </div>
            )}
            {transcriptView(messages.length, isStreaming, !!hydrating) === 'skeleton' && (
              <div className="chat-page__transcript-skeleton mt-6">
                <ChatTranscriptSkeleton />
              </div>
            )}
            {transcriptView(messages.length, isStreaming, !!hydrating) === 'empty' && (
              <div className="chat-page__empty mt-20 text-center text-muted-foreground">
                <p className="chat-page__empty-title mb-2 text-lg">{t('emptyState.title')}</p>
                <p className="chat-page__empty-sub text-[13px]">{t('emptyState.subtitle')}</p>
                {Object.keys(connectedApps).length > 0 && (
                  <p className="chat-page__empty-apps mt-1 text-[13px]">
                    {t('emptyState.connectedTo', { apps: Object.keys(connectedApps).join(', ') })}
                  </p>
                )}
              </div>
            )}
            {messageChunks.map((chunk, ci) => {
              if (chunk.type === 'user') {
                const isLastChunk = ci === messageChunks.length - 1;
                return (
                  <React.Fragment key={chunk.message.id || `user-${ci}`}>
                    <MessageBlock
                      message={chunk.message}
                      modelLabelById={modelLabelById}
                      reasoningAutoExpanded={false}
                      onFileClick={onFileClick}
                      resolveFileUrl={resolveFileUrl}
                      onInternalLinkClick={onInternalLinkClick}
                      onAttachmentClick={onAttachmentClick}
                    />
                    {isStreaming && isLastChunk
                      ? renderLiveLine(isResumingSession, liveQueryStartedAt, t('resumingSession'))
                      : null}
                  </React.Fragment>
                );
              }

              const turnKey = assistantTurnKey(chunk.messages);
              const storedDur = thoughtDurationByTurnKey[turnKey];
              const { steps, tailTexts, questions, permissions } = partitionAssistantMessages(chunk.messages);
              const inferredDur = inferDurationFromStepMessages(steps);
              const displayThoughtDur = storedDur ?? inferredDur ?? null;
              const isLastChunk = ci === messageChunks.length - 1;
              const isLiveTurn = isStreaming && isLastChunk;
              const stepSegments = segmentMessagesForResponseSteps(steps);
              const showThoughtProcess = thoughtStepsHaveVisibleUI(steps);

              // Live "current action": derived from THIS turn's steps so the step count is per-turn.
              const live = isLiveTurn ? liveActivityFor(steps, permissions) : null;
              const liveStepNumber = live ? live.stepCount || null : null;
              // One summary node serves both states: the live line during the turn, "Thought for {N}s" after.
              const thoughtSummary: React.ReactNode = isLiveTurn ? (
                <LiveActivity
                  activity={live?.activity ?? null}
                  stepNumber={liveStepNumber}
                  startedAtMs={liveQueryStartedAt}
                  retryFrame={live?.retryFrame ?? null}
                  awaitingApproval={live?.awaitingApproval ?? false}
                />
              ) : displayThoughtDur != null ? (
                t('thoughtFor', { duration: formatThinkingDurationSeconds(displayThoughtDur) })
              ) : (
                t('thoughtProcess')
              );

              const reasoningAutoExpandedFor = (msg: ChatMessage) =>
                msg.kind === 'REASONING' &&
                Boolean(
                  isStreaming &&
                    activeStreamTurnId &&
                    msg.turnId === activeStreamTurnId &&
                    msg.id === lastStreamMessageId
                );

              const renderStepSegment = (seg: ResponseStepSegment, si: number) =>
                seg.type === 'steps' ? (
                  <ul
                    key={seg.items[0]?.id ? `steps-${seg.items[0].id}` : `steps-${ci}-${si}`}
                    className="chat-page__response-steps m-0 mb-4 list-none p-0"
                  >
                    {seg.items.map((msg, ii) => {
                      const reasoningAutoExpanded = reasoningAutoExpandedFor(msg);
                      const bulletCollapsible = responseStepHasCollapsibleToggle(msg, reasoningAutoExpanded);
                      const status = stepMarkerStatus(msg);
                      const isLastStep = ii === seg.items.length - 1;

                      const bulletTriggerToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
                        e.preventDefault();
                        const li = e.currentTarget.closest('.chat-page__response-steps-item');
                        const toggle = li?.querySelector<HTMLButtonElement>(
                          'button.message-block__reasoning-toggle, button.message-block__tool-toggle'
                        );
                        toggle?.click();
                      };

                      // The marker is the timeline node for this step; it carries the status icon.
                      // Collapsible steps make it a button (click = expand the step), settled ones a
                      // decorative span. A hairline rail joins each node to the next.
                      const markerBase =
                        'chat-page__response-steps-bullet absolute left-0 top-0.5 z-[2] flex h-5 w-5 items-center justify-center';

                      return (
                        <li
                          key={msg.id || `step-${ci}-${si}-${ii}`}
                          className="chat-page__response-steps-item relative pl-7 pb-4 last:pb-0"
                        >
                          {!isLastStep ? (
                            <span
                              className="chat-page__response-steps-rail absolute bottom-0 left-[9px] top-[22px] w-px bg-border"
                              aria-hidden
                            />
                          ) : null}
                          {bulletCollapsible ? (
                            <button
                              type="button"
                              data-step-status={status}
                              className={cn(
                                markerBase,
                                'chat-page__response-steps-bullet--interactive cursor-pointer rounded-full border-0 bg-transparent p-0 hover:[&>.chat-page__response-steps-dot]:bg-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring'
                              )}
                              aria-label={t('stepToggle')}
                              title={t('stepToggle')}
                              onClick={bulletTriggerToggle}
                            >
                              <StepMarkerIcon status={status} />
                            </button>
                          ) : (
                            <span className={markerBase} data-step-status={status} aria-hidden>
                              <StepMarkerIcon status={status} />
                            </span>
                          )}
                          <MessageBlock
                            message={msg}
                            modelLabelById={modelLabelById}
                            reasoningAutoExpanded={reasoningAutoExpanded}
                            onFileClick={onFileClick}
                            resolveFileUrl={resolveFileUrl}
                            onInternalLinkClick={onInternalLinkClick}
                            onRetry={onRetry}
                            retryDisabled={isStreaming}
                            subagentsEnabled={subagentsEnabled}
                            parentSessionId={sessionId}
                          />
                        </li>
                      );
                    })}
                  </ul>
                ) : seg.message.kind === 'QUESTION' ? (
                  shouldRenderQuestionBlock(seg.message.id, isStreaming, pendingQuestion?.id) ? (
                    <QuestionBlock
                      key={seg.message.id || `single-${ci}-${si}`}
                      questions={seg.message.data?.questions || []}
                      onSubmit={respondToQuestion}
                      disabled={isStreaming || pendingQuestion?.id !== seg.message.id}
                    />
                  ) : null
                ) : (
                  <MessageBlock
                    key={seg.message.id || `single-${ci}-${si}`}
                    message={seg.message}
                    modelLabelById={modelLabelById}
                    reasoningAutoExpanded={reasoningAutoExpandedFor(seg.message)}
                    onFileClick={onFileClick}
                    resolveFileUrl={resolveFileUrl}
                    onInternalLinkClick={onInternalLinkClick}
                  />
                );

              return (
                <React.Fragment key={`assistant-wrap-${ci}`}>
                  <div
                    key={`assistant-chunk-${ci}`}
                    className="chat-page__assistant-turn flex flex-row items-start gap-3"
                  >
                    <div
                      className="chat-page__assistant-turn-icon mt-0.5 flex h-7 w-7 flex-shrink-0 select-none items-center justify-center rounded-md bg-muted text-foreground dark:border dark:border-white"
                      aria-hidden
                      title={t('assistantLabel')}
                    >
                      <C3Logo className="size-4" />
                    </div>
                    <div className="chat-page__assistant-turn-body min-w-0 flex-1">
                      {/* One disclosure for both states (stable across the live→post-turn flip, so an
                      expand mid-stream persists): live line as summary, steps as the collapsed body.
                      Before any visible step exists, fall back to the bare live line. */}
                      {showThoughtProcess ? (
                        <ThoughtProcessDetails steps={steps} summary={thoughtSummary}>
                          <div className="chat-page__thought-details-body pt-1.5">
                            {stepSegments.map((seg, si) => renderStepSegment(seg, si))}
                          </div>
                        </ThoughtProcessDetails>
                      ) : isLiveTurn ? (
                        renderLiveLine(isResumingSession, liveQueryStartedAt, t('resumingSession'))
                      ) : null}
                      {questions
                        .filter((q) => shouldRenderQuestionBlock(q.id, isStreaming, pendingQuestion?.id))
                        .map((q) => (
                          <QuestionBlock
                            key={q.id || `q-${ci}`}
                            questions={q.data?.questions || []}
                            onSubmit={respondToQuestion}
                            disabled={isStreaming || pendingQuestion?.id !== q.id}
                          />
                        ))}
                      {tailTexts.map((m, ti) => (
                        <MessageBlock
                          key={m.id || `tail-${ci}-${ti}`}
                          message={m}
                          modelLabelById={modelLabelById}
                          reasoningAutoExpanded={reasoningAutoExpandedFor(m)}
                          onFileClick={onFileClick}
                          resolveFileUrl={resolveFileUrl}
                          onInternalLinkClick={onInternalLinkClick}
                          onFeedback={onFeedback}
                          isStreaming={isStreaming && activeStreamTurnId === m.turnId}
                          onRetry={onRetry}
                          retryDisabled={isStreaming}
                        />
                      ))}
                      {/* PERMISSION renders dead-last so the user sees every tool the model fired
                    before the approval prompt. activePermissionId keeps it one-at-a-time. */}
                      {permissions.map((p) => (
                        <MessageBlock
                          key={p.id || `perm-${ci}`}
                          message={p}
                          modelLabelById={modelLabelById}
                          reasoningAutoExpanded={false}
                          onFileClick={onFileClick}
                          resolveFileUrl={resolveFileUrl}
                          onInternalLinkClick={onInternalLinkClick}
                          onPermissionRespond={onPermissionRespond}
                          activePermissionId={activePermissionId}
                        />
                      ))}
                    </div>
                  </div>
                  {ci === appChunkIndex && inlineAppNode}
                  {appNodesByChunk.get(ci)}
                </React.Fragment>
              );
            })}
            {appChunkIndex === -1 && inlineAppNode}
            {appNodesByChunk.get(-1)}
            {learningProposal && onReviewLearningProposal ? (
              <SkillLearningReceipt
                proposal={learningProposal}
                proposalCount={learningProposalCount}
                onReview={onReviewLearningProposal}
              />
            ) : null}
            <div ref={messagesEndRef} data-testid="messages-end" />
          </div>
        </div>
        <button
          type="button"
          className={`chat-page__jump-to-bottom absolute bottom-4 right-4 z-10 flex size-9 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md transition-opacity hover:bg-accent ${
            showScrollToBottom ? 'chat-page__jump-to-bottom--visible opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={onScrollToBottom}
          aria-label={t('scrollToBottom.ariaLabel')}
          aria-hidden={!showScrollToBottom}
          tabIndex={showScrollToBottom ? 0 : -1}
          data-testid="scroll-to-bottom"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 5v14" />
            <path d="M19 12l-7 7-7-7" />
          </svg>
        </button>
      </div>
      {/* Mounted only while there's something to show — McpAuthExpiredBanner calls a React
          Query hook (useMyMcpConnectionStatus) to resolve the display name, so keeping it
          unmounted in the (overwhelmingly common) no-expiry case avoids requiring every
          ChatColumn host to sit under a QueryClientProvider. */}
      {mcpAuthExpiredKeys.length > 0 && onDismissMcpAuthExpired && (
        <McpAuthExpiredBanner
          connectionKeys={mcpAuthExpiredKeys}
          agentDefId={agentDefId}
          onDismiss={onDismissMcpAuthExpired}
        />
      )}
      {/* Cross-cluster per-user OAuth prompt (see CrossClusterAuthBanner). No status query — the
          appId is the identity — so this can mount without a QueryClientProvider. */}
      {crossClusterAuthAppIds.length > 0 && onConnectCrossClusterAuth && onDismissCrossClusterAuth && (
        <CrossClusterAuthBanner
          appIds={crossClusterAuthAppIds}
          onConnect={onConnectCrossClusterAuth}
          onDismiss={onDismissCrossClusterAuth}
        />
      )}
      {error && <ChatErrorBar message={error} referenceId={errorReferenceId} onDismiss={() => setError('')} />}
      <div className="chat-page__composer flex-shrink-0 bg-background p-4">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="chat-column__file-input hidden"
          onChange={onPickFiles}
        />
        <div className="chat-page__composer-stack @container/composer mx-auto flex max-w-[800px] flex-col gap-1.5">
          {pendingFiles.length > 0 && !agentBaseUrl && (
            <p className="chat-column__staging-warning mb-2 text-xs leading-snug text-warning">{t('stagingWarning')}</p>
          )}
          {pendingFiles.length > 0 && (
            <div className="nexus-chat-attach-tray chat-column__attach-tray mb-2.5 rounded-lg border border-border bg-background px-3 py-2.5">
              <div className="chat-column__attach-tray-inner flex flex-wrap gap-2">
                {pendingFiles.map((p, idx) => (
                  <span
                    key={p.id}
                    className="chat-column__attach-chip inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1.5 text-[13px]"
                    title={p.file.name}
                  >
                    <span className="chat-column__attach-chip-name truncate">{p.file.name}</span>
                    {!isStreaming && (
                      <button
                        type="button"
                        className="chat-column__attach-chip-remove cursor-pointer border-0 bg-transparent p-0 text-lg leading-none text-muted-foreground hover:text-foreground"
                        onClick={() => removePendingAt(idx)}
                        aria-label={t('attachRemove', { name: p.file.name })}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          {uploadProgress != null &&
            (() => {
              const determinate = uploadProgress.total > 0;
              const pct = determinate
                ? Math.min(100, Math.round((uploadProgress.loaded / uploadProgress.total) * 100))
                : 0;
              return (
                <div
                  className="chat-column__upload-progress mb-2 flex items-center gap-2 rounded-md border-l-[3px] border-muted-foreground bg-muted px-3 py-2 text-[13px] text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  <span
                    className="nexus-spinner chat-column__upload-progress-spinner h-[11px] w-[11px] flex-shrink-0 border-[1.5px]"
                    aria-hidden="true"
                  />
                  <span className="chat-column__upload-progress-label flex-shrink-0">
                    {determinate ? t('uploadProgress.uploading', { pct }) : t('uploadProgress.indeterminate')}
                  </span>
                  {determinate && (
                    <span
                      className="chat-column__upload-progress-bar h-1 flex-1 overflow-hidden rounded-sm bg-muted-foreground/20"
                      aria-hidden="true"
                    >
                      <span
                        className="chat-column__upload-progress-bar-fill block h-full bg-muted-foreground transition-[width] duration-150 ease-out"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  )}
                </div>
              );
            })()}
          {queuedMessage != null && (
            <div
              className="chat-column__queued-chip mb-2 flex items-start gap-2.5 rounded-md border-l-[3px] border-muted-foreground bg-muted px-3 py-2"
              aria-live="polite"
            >
              <span className="chat-column__queued-chip-label flex-shrink-0 pt-0.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('queued.label')}
              </span>
              <span
                className="chat-column__queued-chip-text line-clamp-2 flex-1 whitespace-pre-wrap break-words text-[13px] leading-snug text-foreground"
                title={queuedMessage.text}
              >
                {queuedMessage.text}
              </span>
              <button
                type="button"
                className="chat-column__queued-chip-cancel flex-shrink-0 cursor-pointer self-center border-0 bg-transparent px-1 text-lg leading-none text-muted-foreground hover:text-foreground"
                onClick={onCancelQueue}
                data-testid="chat-cancel-queued-btn"
                aria-label={t('queued.cancelAriaLabel')}
                title={t('queued.cancelTitle')}
              >
                ×
              </button>
            </div>
          )}
          {(llmBlockMessage || modelRouteBlockMessage) && (
            <div
              className={
                llmBlockReason === 'starting'
                  ? 'chat-column__llm-status mb-2 rounded-md border border-border bg-muted/60 px-3 py-2 text-[13px] leading-snug text-muted-foreground'
                  : 'chat-column__llm-status mb-2 rounded-md border border-border bg-muted px-3 py-2 text-[13px] leading-snug text-foreground'
              }
              role="status"
              aria-live="polite"
              data-testid={llmBlockMessage ? 'chat-llm-status' : 'chat-model-route-status'}
            >
              {llmBlockMessage || modelRouteBlockMessage}
            </div>
          )}
          <div className="chat-page__composer-inner w-full">
            {/* Expanded composer — a larger focused surface bound to the SAME draft (`input`), so
                content is shared with the inline editor. Sends via the footer button or ⌘/Ctrl+Enter. */}
            {richText && (
              <Dialog open={composerExpanded} onOpenChange={setComposerExpanded}>
                <DialogContent
                  className="flex w-[92vw] flex-col gap-3 sm:max-w-4xl"
                  onOpenAutoFocus={(e) => {
                    // Let the editor's own autofocus land the caret in the text, not on a toolbar button.
                    e.preventDefault();
                  }}
                >
                  <DialogHeader>
                    <DialogTitle>{t('composer.expandedTitle')}</DialogTitle>
                  </DialogHeader>
                  <div className="rounded-xl border border-border bg-background transition-colors focus-within:border-ring">
                    <Suspense fallback={null}>
                      <RichTextComposer
                        value={input}
                        onChange={handleComposerChange}
                        onKeyDown={(e) => {
                          handleKeyDown(e);
                          // A ⌘/Ctrl+Enter send from the modal (parent fires on Enter w/o shift) closes
                          // it — but only when the send is actually eligible, so an empty ⌘/Ctrl+Enter
                          // doesn't dismiss the modal without sending anything.
                          if (e.key === 'Enter' && !e.shiftKey && !sendDisabled) setComposerExpanded(false);
                        }}
                        placeholder={composerPlaceholder}
                        disabled={composerDisabled}
                        editorClassName="min-h-[50vh] max-h-[70vh]"
                        editorTestId="chat-message-input-rich-modal"
                        characterLimit={COMPOSER_CHAR_LIMIT}
                        autoFocus
                      />
                    </Suspense>
                  </div>
                  <DialogFooter>
                    {isStreaming ? (
                      <Button type="button" variant="secondary" onClick={onStop}>
                        {t('stop.title')}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => {
                          sendMessage();
                          setComposerExpanded(false);
                        }}
                        disabled={sendDisabled}
                        title={composerBlockMessage ?? undefined}
                      >
                        {t('composer.send')}
                      </Button>
                    )}
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            <div
              ref={inputWrapRef}
              className="chat-page__input-wrap relative flex w-full flex-col rounded-xl border border-border bg-background shadow-sm transition-colors focus-within:border-ring"
            >
              {richText ? (
                <Suspense fallback={plainComposer}>
                  <RichTextComposer
                    ref={richComposerRef}
                    value={input}
                    onChange={handleComposerChange}
                    onKeyDown={handleKeyDown}
                    placeholder={composerPlaceholder}
                    disabled={composerDisabled}
                    characterLimit={COMPOSER_CHAR_LIMIT}
                    onExpand={() => setComposerExpanded(true)}
                    autoFocus={!!inputWrapRef.current?.contains(document.activeElement)}
                  />
                </Suspense>
              ) : (
                plainComposer
              )}
              {/* Wrapping toolbar: at a narrow composer width (13" MBP with the Workspace panel
                  open) the actions group can't fit beside the leading icons, so instead of the
                  two groups overlapping, the actions group drops onto its own line (right-aligned
                  via ml-auto) and the model selector compacts. Breakpoints are container-relative
                  (@container/composer on the stack), keyed to the COMPOSER's width, not the
                  viewport — the column, not the window, is what narrows here. gap-x keeps the
                  single-row spacing; gap-y adds breathing room once the actions group wraps. */}
              <div className="chat-page__input-footer flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-2 px-3.5 pb-2">
                <div className="chat-page__input-footer-leading flex min-w-0 flex-auto items-center">
                  <div
                    className="chat-page__input-footer-leading-icons flex items-center gap-0.5"
                    aria-label={t('composerShortcuts')}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="chat-page__composer-footer-icon-link text-muted-foreground"
                      data-testid="chat-attach-files-btn"
                      title={t('attachFilesTitle')}
                      aria-label={t('attachFiles')}
                      disabled={pendingFiles.length >= CHAT_ATTACHMENT_CONFIG.maxPendingFiles}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                      </svg>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'chat-page__composer-footer-icon-link',
                        richText ? 'text-foreground' : 'text-muted-foreground'
                      )}
                      data-testid="chat-rich-text-toggle-btn"
                      aria-pressed={richText}
                      title={t(richText ? 'composer.richTextOff' : 'composer.richTextOn')}
                      aria-label={t(richText ? 'composer.richTextOff' : 'composer.richTextOn')}
                      onClick={() => {
                        // Flip plain ↔ rich. Going plain → rich, re-parse the shared draft as
                        // markdown; promote lone newlines to hard breaks first so CommonMark's
                        // soft-break rule doesn't silently collapse a multi-line draft onto one line.
                        if (!richText && input) setInput(plainToMarkdown(input));
                        setRichText((v) => !v);
                      }}
                    >
                      <Type className="size-4" />
                    </Button>
                    {speechSupported && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'chat-page__composer-footer-icon-link relative',
                          speechIsListening
                            ? 'chat-page__composer-footer-icon-link--recording animate-pulse text-destructive hover:text-destructive'
                            : 'text-muted-foreground'
                        )}
                        data-testid={speechIsListening ? 'chat-voice-stop-btn' : 'chat-voice-start-btn'}
                        title={t('voiceInput')}
                        aria-label={speechIsListening ? t('stopVoiceInput') : t('startVoiceInput')}
                        disabled={isStreaming || composerDisabled || (!!input.trim() && !speechIsListening)}
                        onClick={() => {
                          if (speechIsListening) {
                            onSpeechStop?.();
                          } else {
                            onSpeechStart?.();
                          }
                        }}
                      >
                        {speechIsListening ? (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                            <rect x="3" y="3" width="10" height="10" rx="1.5" />
                          </svg>
                        ) : (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden
                          >
                            <path
                              d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path d="M19 10v1a7 7 0 0 1-14 0v-1" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M12 19v3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {speechIsListening ? (
                          <span className="chat-page__recording-tooltip pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-popover px-2.5 py-1.5 text-2xs leading-snug text-popover-foreground shadow-md">
                            {t('listening')}
                          </span>
                        ) : null}
                      </Button>
                    )}
                  </div>
                </div>
                {/* ml-auto right-aligns the group whether it shares the first row or wraps to its
                    own; flex-wrap + justify-end let the actions themselves wrap right-aligned at
                    extreme narrowness; the container-query gap tightens spacing before that. */}
                <div className="chat-page__input-footer-actions ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 @max-[520px]/composer:gap-1.5">
                  {/* Context gauge — fill = occupancy vs the auto-compaction ceiling,
                      from the latest completed turn. Hidden until a turn reports. */}
                  {contextUsage && <ContextGauge used={contextUsage.used} max={contextUsage.max} />}
                  {connectAppsEnabled && (
                    <AppsPicker
                      connectedApps={connectedApps}
                      onRemoveApp={onRemoveApp}
                      onConnectApp={onConnectApp}
                      studioApps={studioAppsQuery.data ?? []}
                      studioLoading={studioAppsQuery.isLoading}
                      studioError={studioAppsQuery.isError}
                      onRetryStudio={() => void studioAppsQuery.refetch()}
                      currentApp={currentApp}
                      crossClusterOAuthEnabled={crossClusterOAuthEnabled}
                    />
                  )}
                  {/* Per-user external MCP connection auth (oauth / apiKey). Self-fetches; renders
                      nothing when there are no auth-requiring connections. */}
                  <McpConnectionsMenu agentDefId={agentDefId} />
                  {/* Reasoning-effort control — user-owned in every mode (incl. auto),
                      immediately left of the model select. Stays ENABLED while streaming
                      (Claude-app convention): a mid-stream change applies from the next
                      turn — effort rides each /query send, never the in-flight one.
                      Levels are the selected model's catalog variants (auto / unknown
                      → the control's universal low/medium/high fallback). */}
                  {!llmBlocked && modelControlsEnabled && (
                    <EffortControl
                      selectedEffort={selectedEffort}
                      setSelectedEffort={setSelectedEffort}
                      levels={models.find((m) => m.id === selectedModel)?.variants}
                      autoAvailable={selectedModel === 'auto'}
                    />
                  )}
                  {!llmBlocked && modelControlsEnabled && (
                    <ModelSelect
                      models={models}
                      selectedModel={selectedModel}
                      setSelectedModel={setSelectedModel}
                      isStreaming={isStreaming}
                      defaultModel={defaultModel}
                      currentModel={currentModel}
                      autoAvailability={autoAvailability}
                      autoAvailabilityReason={autoAvailabilityReason}
                      selectedRouteAvailability={modelRouteAvailability}
                      selectedRouteAvailabilityReason={modelRouteAvailabilityReason}
                      onOpen={onModelSelectOpen}
                    />
                  )}
                  {/*
                    While streaming we deliberately show only the Stop button — no
                    explicit enqueue button. Mid-stream enqueue is
                    keyboard-only: pressing Enter routes through dispatchSendOrEnqueue
                    (ChatPage) which enqueues a single pending message while a run is
                    active. Keep this a hard swap; do not re-add a send button here.
                  */}
                  {isStreaming ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      onClick={onStop}
                      className="chat-page__composer-icon-btn chat-page__composer-icon-btn--send active:scale-95"
                      data-testid="chat-stop-generation-btn"
                      aria-label={t('stop.ariaLabel')}
                      title={t('stop.title')}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                        <rect x="3" y="3" width="10" height="10" rx="1.5" />
                      </svg>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="icon-sm"
                      onClick={sendMessage}
                      className="chat-page__composer-icon-btn chat-page__composer-icon-btn--send active:scale-95"
                      data-testid="chat-send-btn"
                      disabled={sendDisabled}
                      aria-label={t('send.ariaLabel')}
                      title={
                        composerBlockMessage
                          ? composerBlockMessage
                          : !agentBaseUrl
                            ? t('send.titleWaiting')
                            : !input.trim() && pendingFiles.length === 0
                              ? t('send.titleEmpty')
                              : t('send.title')
                      }
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M12 17V9M12 9l-4 4M12 9l4 4" />
                      </svg>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Always rendered (hidden while 0) so the row's height is reserved up
              front — when it used to mount on the first turn, the whole composer
              (and any open popover anchored in it) jumped up by the row height
              mid-stream. */}
          <p
            className="chat-page__token-estimate m-0 px-0.5 text-xs leading-[1.35] text-muted-foreground data-[empty=true]:invisible"
            data-empty={estimatedConversationTokens > 0 ? undefined : 'true'}
            aria-live="polite"
            aria-hidden={estimatedConversationTokens > 0 ? undefined : 'true'}
            title={estimatedConversationTokens > 0 ? t('tokenEstimateTitle') : undefined}
          >
            {estimatedConversationTokens > 0 ? t('tokenEstimate', { count: estimatedConversationTokens }) : ' '}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatColumn;
