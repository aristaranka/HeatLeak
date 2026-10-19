/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { Maximize2, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { useHref } from 'react-router';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { modelRouteTooltip, resolveModelLabel } from '../lib/modelLabel';
import { subagentSessionIdFromCreateToolCall } from '../lib/subagentToolCall';
import { formatDuration, formatTokenCount } from '../lib/tokenEstimate';
import { cn } from '../lib/utils';
import { isWorkspacePathExportable } from '../lib/workspaceExportPolicy';
import PermissionBlock from './PermissionBlock';
import SubagentActivityCard from './SubagentActivityCard';
import { Button } from './ui/button';
import { CopyTextButton } from './ui/copy-text-button';
import { SkeletonText } from './ui/skeleton';
import type { ChatMessage, FeedbackRating, FeedbackState, PermissionResponse } from '../lib/types';

/** Quiet until hover/focus on fine pointers; always visible on touch (no hover). */
const MESSAGE_ACTIONS_REVEAL =
  'opacity-100 transition-opacity [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover/msg:opacity-100 focus-within:!opacity-100';

const WORKSPACE_FILE_RE = /^\/data\/workspace\/.+\.\w+$/;
// Image artifacts the agent writes to its workspace (plots as PNG, diagrams as
// SVG, etc.) are rendered inline in the chat; other workspace files stay as
// click-to-preview links.
const IMAGE_FILE_RE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;
const HTML_FILE_RE = /\.html?$/i;
const MAX_INLINE_HTML = 10 * 1024 * 1024;

function isPreviewableFile(path: string): boolean {
  return !/\.(docx?|pptx?|xlsx?)$/i.test(path);
}

/** Workspace path the chat may linkify for REST preview/download (export policy applied). */
function isClickableWorkspaceFilePath(path: string): boolean {
  return WORKSPACE_FILE_RE.test(path) && isWorkspacePathExportable(path);
}

function reasoningPreview(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= 96) return oneLine;
  return `${oneLine.slice(0, 96)}…`;
}

/** Root-relative app path (e.g. `/automations`), not protocol-relative `//…`. */
const APP_RELATIVE_PATH_RE = /^\/(?!\/)/;

/** Basename-resolved in-app Markdown link — same `useHref` pattern as `useDetailHref`. */
const InternalAppMarkdownLink: React.FC<
  React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    url: string;
    onInternalLinkClick: (path: string) => void;
  }
> = ({ url, onInternalLinkClick, children, onClick, ...props }) => {
  const resolvedHref = useHref(url);
  return (
    <a
      href={resolvedHref}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
          return;
        }
        e.preventDefault();
        onInternalLinkClick(url);
      }}
      {...props}
    >
      {children}
    </a>
  );
};

/** Inline HTML artifact rendered as a sandboxed iframe in the chat stream. Fetches
 *  the file content with credentials and injects into an opaque-origin iframe
 *  (allow-scripts, NO allow-same-origin) so the artifact's JS runs interactively
 *  but cannot reach the app's cookies/DOM/APIs. */
const InlineHtmlArtifact: React.FC<{
  url: string;
  path: string;
  onExpand: () => void;
}> = ({ url, path, onExpand }) => {
  const { t } = useTranslation('chat');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBlobUrl(null);

    fetch(url, {
      signal: controller.signal,
      credentials: 'include',
      headers: { Range: `bytes=0-${MAX_INLINE_HTML}` },
    })
      .then((r) => {
        if (!r.ok && r.status !== 206) return Promise.reject(r.statusText);
        return r.text();
      })
      .then((html) => {
        if (cancelled) return;
        if (html.length > MAX_INLINE_HTML) {
          setError(t('message.inlineHtml.tooLarge'));
        } else {
          const blob = new Blob([html], { type: 'text/html' });
          setBlobUrl(URL.createObjectURL(blob));
        }
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (cancelled) return;
        setError(t('message.inlineHtml.loadFailed'));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [url, t]);

  const basename = path.replace(/^.*\//, '');

  if (loading) {
    return (
      <div
        className="message-block__inline-html my-3 overflow-hidden rounded-md border border-border"
        data-testid="inline-html-artifact"
        data-path={path}
      >
        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
          <span className="truncate font-mono text-xs text-muted-foreground">{basename}</span>
        </div>
        <div className="p-4" aria-busy aria-label={t('message.inlineHtml.loading')}>
          <SkeletonText lines={4} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="message-block__inline-html my-3 overflow-hidden rounded-md border border-border"
        data-testid="inline-html-artifact"
        data-path={path}
      >
        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
          <span className="truncate font-mono text-xs text-muted-foreground">{basename}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onExpand}
            title={t('message.inlineHtml.expand')}
          >
            <Maximize2 className="size-3.5" aria-hidden />
          </Button>
        </div>
        <p className="px-3 py-2 text-xs text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div
      className="message-block__inline-html my-3 overflow-hidden rounded-md border border-border"
      data-testid="inline-html-artifact"
      data-path={path}
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
        <span className="truncate font-mono text-xs text-muted-foreground">{basename}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onExpand}
          aria-label={t('message.inlineHtml.expand')}
          title={t('message.inlineHtml.expand')}
        >
          <Maximize2 className="size-3.5" aria-hidden />
        </Button>
      </div>
      {blobUrl && (
        <iframe
          src={blobUrl}
          className="h-[360px] w-full border-none bg-white"
          title={basename}
          sandbox="allow-scripts"
        />
      )}
    </div>
  );
};

/** Live reasoning stream — timer lives on ChatPage above all steps */
const ReasoningLiveBlock: React.FC<{ body: string }> = ({ body }) => (
  <div className="message-block__reasoning mb-3 overflow-hidden rounded-md border-l-[3px] border-amber-500 bg-muted/40">
    <div className="message-block__reasoning-live whitespace-pre-wrap px-3.5 pb-2.5 pt-2 text-[13px] italic leading-relaxed text-muted-foreground">
      {body}
    </div>
  </div>
);

const ReasoningBlock: React.FC<{ text?: string; autoExpanded: boolean }> = ({ text, autoExpanded }) => {
  const { t } = useTranslation('chat');
  const body = text || '';
  const [userExpanded, setUserExpanded] = useState(false);

  useEffect(() => {
    if (!autoExpanded) {
      setUserExpanded(false);
    }
  }, [autoExpanded]);

  if (autoExpanded) {
    return <ReasoningLiveBlock body={body} />;
  }

  const preview = body ? reasoningPreview(body) : '';

  return (
    <div className="message-block__reasoning mb-3 overflow-hidden rounded-md border-l-[3px] border-amber-500 bg-muted/40">
      <button
        type="button"
        className="message-block__reasoning-toggle flex w-full cursor-pointer items-center gap-2 px-3.5 py-2 text-left text-[13px] text-muted-foreground hover:bg-accent/50"
        aria-expanded={userExpanded}
        onClick={() => setUserExpanded((v) => !v)}
      >
        <span className="message-block__reasoning-toggle-label shrink-0 font-semibold">{t('message.thinking')}</span>
        {!userExpanded && preview ? (
          <span className="message-block__reasoning-preview min-w-0 truncate opacity-75" title={body}>
            — {preview}
          </span>
        ) : null}
      </button>
      {userExpanded ? (
        <div className="message-block__reasoning-body whitespace-pre-wrap px-3.5 pb-2.5 pl-8 text-[13px] italic leading-relaxed text-muted-foreground">
          {body}
        </div>
      ) : null}
    </div>
  );
};

function stringify(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

// Text files are inlined into the prompt as <file name="...">content</file> XML so the
// model sees them immediately. Strip those blocks before rendering the user bubble so the
// chat shows only the user's original words, not a raw dump of the uploaded file content.
const FILE_TAG_RE = /<file\s+[^>]*>[\s\S]*?<\/file>\s*|<file\s+[^/]*\/>\s*/g;

function stripFileTags(s: string | undefined): string {
  if (!s) return '';
  return s.replace(FILE_TAG_RE, '').trim();
}

function toolCallPreview(inputStr: string, outputStr: string): string {
  if (outputStr) return reasoningPreview(outputStr);
  if (inputStr) return reasoningPreview(inputStr);
  return '';
}

const ToolCallBlock: React.FC<{
  message: ChatMessage;
  subagentsEnabled?: boolean;
  parentSessionId?: string | null;
}> = ({ message, subagentsEnabled = false, parentSessionId }) => {
  const { t } = useTranslation('chat');
  const { toolName, toolState, data, text, description } = message;
  const name = toolName || data?.name || t('message.tool');
  const state = toolState || data?.state || '';
  const inputStr = stringify(data?.input);
  let outputStr = stringify(data?.output);
  if (!outputStr && text) {
    outputStr = typeof text === 'string' ? text : stringify(text);
  }

  const isToolId = name.startsWith('toolu_');
  const isTerminal = state === 'COMPLETED' || state === 'ERROR' || state === 'CANCELLED';
  const hasDetails = Boolean(inputStr || outputStr);
  const [userExpanded, setUserExpanded] = useState(state === 'ERROR' && hasDetails);
  const prevIsTerminalRef = useRef<boolean | null>(null);

  useEffect(() => {
    const prev = prevIsTerminalRef.current;
    prevIsTerminalRef.current = isTerminal;
    if (prev === null) return;
    if (isTerminal && !prev) {
      setUserExpanded(state === 'ERROR' && hasDetails);
    }
  }, [isTerminal, state, hasDetails]);

  // The step's state (running / done / error) is shown by the timeline rail marker in ChatColumn,
  // not by an in-card badge — so the tool card carries only its label and (when expandable) body.
  const toolNameChip = isToolId ? (
    <span className="message-block__tool-name shrink-0 text-xs font-semibold">{t('message.tool')}</span>
  ) : (
    <span
      className={cn(
        'message-block__tool-name message-block__tool-name--mono shrink-0 font-mono text-xs font-semibold',
        description && 'message-block__tool-name--secondary font-medium text-muted-foreground'
      )}
    >
      {name}
    </span>
  );
  const labelGroup = description ? (
    <>
      <span
        className="message-block__tool-name message-block__tool-label min-w-0 flex-auto truncate text-xs font-semibold"
        title={description}
      >
        {description}
      </span>
      {!isToolId && toolNameChip}
    </>
  ) : (
    toolNameChip
  );

  // Input + output flow inside one body block. Only a single light hairline separates output from
  // input (when both exist) — no full per-section borders, which read as heavy nested boxes.
  // Each section is labelled ("Input" / "Output") and the output panel sits on a distinct surface so
  // it's unambiguous which is the request and which is the result.
  const sectionLabel =
    'message-block__tool-section-label mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70';
  const renderBody = () => (
    <>
      {inputStr ? (
        <div className="message-block__tool-section message-block__tool-section--input px-3.5 py-2">
          <div className={sectionLabel}>{t('message.toolInput')}</div>
          <pre className="message-block__tool-pre m-0 whitespace-pre-wrap break-all text-xs text-muted-foreground">
            {inputStr.length > 2000 ? t('message.toolTruncated', { content: inputStr.slice(0, 2000) }) : inputStr}
          </pre>
        </div>
      ) : null}
      {outputStr ? (
        <div
          className={cn(
            'message-block__tool-section message-block__tool-section--output px-3.5 py-2',
            inputStr && 'border-t border-border/60 bg-background/40'
          )}
        >
          <div className={sectionLabel}>{t('message.toolOutput')}</div>
          <pre className="message-block__tool-pre message-block__tool-pre--emphasis m-0 whitespace-pre-wrap break-all text-xs text-foreground">
            {outputStr.length > 2000 ? t('message.toolTruncated', { content: outputStr.slice(0, 2000) }) : outputStr}
          </pre>
        </div>
      ) : null}
    </>
  );

  const preview = toolCallPreview(inputStr, outputStr);
  const showNonTerminalBody = hasDetails && state !== 'PENDING';

  const toolWrap = 'message-block__tool mb-3 overflow-hidden rounded-md border border-border bg-muted/30';
  const headerBase = 'flex min-w-0 items-center gap-2 px-3.5 py-2 bg-muted/50';

  // Nothing to expand (no input/output) → a flat, borderless row instead of an empty card.
  // The rail marker conveys the state, so a settled step reads as a single quiet line.
  if (!hasDetails) {
    return (
      <div className="message-block__tool message-block__tool--flat flex min-w-0 items-center gap-2 py-1 text-[13px]">
        {(description || !isToolId) && labelGroup}
      </div>
    );
  }

  if (!isTerminal) {
    return (
      <div className={toolWrap}>
        <div
          className={cn(
            'message-block__tool-header',
            showNonTerminalBody ? 'border-b border-border/60' : 'message-block__tool-header--flat',
            headerBase
          )}
        >
          {(description || !isToolId) && labelGroup}
        </div>
        {showNonTerminalBody ? <div className="message-block__tool-body">{renderBody()}</div> : null}
      </div>
    );
  }

  const subagentSessionId = subagentsEnabled ? subagentSessionIdFromCreateToolCall(message) : null;

  return (
    <>
      <div className={toolWrap}>
        <button
          type="button"
          className={cn(
            'message-block__tool-toggle flex w-full cursor-pointer items-center gap-2 border-b border-border/60 px-3.5 py-2 text-left text-[13px] text-muted-foreground hover:brightness-105',
            headerBase
          )}
          aria-expanded={userExpanded}
          onClick={() => setUserExpanded((v) => !v)}
        >
          {labelGroup}
          {!userExpanded && preview && !description ? (
            <span className="message-block__tool-preview min-w-0 truncate font-mono text-xs opacity-75" title={preview}>
              — {preview}
            </span>
          ) : null}
        </button>
        {userExpanded && hasDetails ? <div className="message-block__tool-body">{renderBody()}</div> : null}
      </div>
      {subagentSessionId && (
        <SubagentActivityCard subagentSessionId={subagentSessionId} parentSessionId={parentSessionId} />
      )}
    </>
  );
};

const FEEDBACK_CHIP_KEYS = [
  'message.feedback.incorrect',
  'message.feedback.notAsked',
  'message.feedback.slow',
  'message.feedback.style',
  'message.feedback.other',
] as const;

const ThumbIcon: React.FC<{ direction: 'up' | 'down'; filled: boolean }> = ({ direction, filled }) => {
  const Icon = direction === 'up' ? ThumbsUp : ThumbsDown;
  // `fill-current` solidifies the icon for the selected state; default (no fill) is the outline.
  return <Icon className={cn('size-4', filled && 'fill-current')} aria-hidden />;
};

const FeedbackSheet: React.FC<{
  onSubmit: (categories: string[], comment: string) => void;
}> = ({ onSubmit }) => {
  const { t } = useTranslation('chat');
  const [categories, setCategories] = useState<string[]>([]);
  const [comment, setComment] = useState('');

  const toggleChip = (chip: string) => {
    setCategories((prev) => (prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]));
  };

  return (
    <div className="message-block__feedback-sheet mt-2 flex max-w-md flex-col gap-2">
      <div className="message-block__feedback-chips flex flex-wrap gap-1.5">
        {FEEDBACK_CHIP_KEYS.map((key) => {
          // Submit the canonical English label so stored feedback categories are language-stable.
          const chip = t(key, { lng: 'en' });
          const selected = categories.includes(chip);
          return (
            <Button
              key={key}
              type="button"
              variant="outline"
              size="xs"
              className={cn(
                'message-block__feedback-chip rounded-full',
                selected && 'message-block__feedback-chip--selected border-primary bg-primary/10 text-primary'
              )}
              onClick={() => toggleChip(chip)}
            >
              {t(key)}
            </Button>
          );
        })}
      </div>
      <textarea
        className="message-block__feedback-textarea w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-[0.85em] focus:border-primary focus:outline-none"
        placeholder={t('message.feedback.shareDetails')}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
      />
      <Button
        type="button"
        size="sm"
        className="message-block__feedback-submit self-start"
        onClick={() => onSubmit(categories, comment)}
      >
        {t('message.feedback.submit')}
      </Button>
    </div>
  );
};

const FeedbackGroup: React.FC<{
  turnId: string;
  isStreaming: boolean;
  onFeedback: (turnId: string, rating: FeedbackRating, categories: string[], comment: string) => void;
}> = ({ turnId, isStreaming, onFeedback }) => {
  const { t } = useTranslation('chat');
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  if (isStreaming) return null;

  // Feedback is changeable and cancelable (each submit is an independent telemetry event — there's
  // no server-side state to retract, so cancel is UI-only). The active rating shows filled; clicking
  // the already-selected thumb clears it; clicking the other thumb switches.
  const rating = feedback?.rating ?? null;
  const showSheet = rating === 'down' && !feedback?.submitted;

  const handleUp = () => {
    if (rating === 'up') {
      setFeedback(null); // re-click the active thumb = cancel / unselect
      return;
    }
    setFeedback({ rating: 'up', categories: [], comment: '', submitted: true });
    onFeedback(turnId, 'up', [], '');
  };

  const handleDown = () => {
    if (rating === 'down') {
      setFeedback(null); // cancel (also closes the detail sheet)
      return;
    }
    setFeedback({ rating: 'down', categories: [], comment: '', submitted: false });
  };

  const handleSubmit = (categories: string[], comment: string) => {
    setFeedback({ rating: 'down', categories, comment, submitted: true });
    onFeedback(turnId, 'down', categories, comment);
  };

  const btnCls = (active: boolean) =>
    cn(
      'message-block__feedback-btn hover:bg-primary/10 hover:text-primary',
      active ? 'message-block__feedback-btn--active text-primary' : 'text-muted-foreground'
    );

  return (
    <div className="message-block__feedback">
      <div className="message-block__feedback-group flex gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={btnCls(rating === 'up')}
          aria-label={t('message.feedback.thumbsUp')}
          aria-pressed={rating === 'up'}
          onClick={handleUp}
        >
          <ThumbIcon direction="up" filled={rating === 'up'} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={btnCls(rating === 'down')}
          aria-label={t('message.feedback.thumbsDown')}
          aria-pressed={rating === 'down'}
          onClick={handleDown}
        >
          <ThumbIcon direction="down" filled={rating === 'down'} />
        </Button>
      </div>
      {showSheet && <FeedbackSheet onSubmit={handleSubmit} />}
    </div>
  );
};

// Short, friendly label for the per-turn model badge. Model family names are
// proper nouns (i18n-exempt); the full id is shown in the tooltip. When an
// admin-configured display name is known (e.g. for an AIP-ARN model id), it is
// used as the basis for family detection and as the fallback label.
function modelBadgeLabel(modelId: string, labelById?: Record<string, string>): string {
  const friendly = labelById ? labelById[modelId] : undefined;
  const basis = friendly || modelId.split('/').pop() || modelId;
  if (/haiku/i.test(basis)) return 'Haiku';
  if (/sonnet/i.test(basis)) return 'Sonnet';
  if (/opus/i.test(basis)) return 'Opus';
  if (friendly) return friendly.slice(0, 24);
  return (basis.replace(/^.*\./, '') || basis).slice(0, 24);
}

const MessageBlockInner: React.FC<{
  message: ChatMessage;
  reasoningAutoExpanded?: boolean;
  onFileClick?: (path: string) => void;
  /** Resolve a `/data/workspace/...` path to its served file URL, for inline image rendering. */
  resolveFileUrl?: (path: string, options?: { inline?: boolean }) => string | null;
  /** Navigate to an app-internal, root-relative link (e.g. `/automations`) emitted by the agent
   *  in Markdown. Given so the transcript can perform in-SPA routing instead of a full page reload;
   *  when absent the link renders as a plain anchor. */
  onInternalLinkClick?: (path: string) => void;
  /** Open workspace tree + preview for a chat attachment filename. */
  onAttachmentClick?: (fileName: string) => void;
  onPermissionRespond?: (permissionId: string, response: PermissionResponse) => Promise<void> | void;
  /** Id of the single PENDING permission to render full UI for; all others collapse to null. */
  activePermissionId?: string | null;
  onFeedback?: (turnId: string, rating: FeedbackRating, categories: string[], comment: string) => void;
  isStreaming?: boolean;
  /** Friendly display name per model id, for the model badge (id may be an AIP ARN). */
  modelLabelById?: Record<string, string>;
  /** Resend the prompt that produced this errored turn. Only rendered on `kind: 'ERROR'` bubbles. */
  onRetry?: (message: ChatMessage) => void;
  /** Disable the retry control (e.g. while a turn is streaming). */
  retryDisabled?: boolean;
  /** Rendering inside {@link SubagentTranscript} rather than a normal chat. There is no human
   *  party in a subagent transcript, so both agents' turns render on the left (see the
   *  PARENT_AGENT branch below) and each gets a speaker label — without this, the subagent's own
   *  reply renders exactly like an ordinary top-level assistant message with no indication that
   *  it's one side of an agent-to-agent exchange. */
  isSubagentTranscript?: boolean;
  /** When true (from `agentix-subagents`), completed `create-subagent` tool rows get an inline activity card. */
  subagentsEnabled?: boolean;
  /** Parent session id for the activity card's "view full transcript" link. */
  parentSessionId?: string | null;
}> = ({
  message,
  reasoningAutoExpanded = false,
  onFileClick,
  resolveFileUrl,
  onInternalLinkClick,
  onAttachmentClick,
  onPermissionRespond,
  activePermissionId = null,
  onFeedback,
  isStreaming = false,
  modelLabelById,
  onRetry,
  retryDisabled = false,
  isSubagentTranscript = false,
  subagentsEnabled = false,
  parentSessionId,
}) => {
  const { t } = useTranslation('chat');
  const { kind, role, text, data } = message;

  const markdownComponents = useMemo((): React.ComponentProps<typeof ReactMarkdown>['components'] => {
    const components: NonNullable<React.ComponentProps<typeof ReactMarkdown>['components']> = {
      // App-internal, root-relative links (e.g. `[Automations → Schedules](/automations)` emitted by
      // the agent) navigate within the SPA instead of triggering a full page reload. The resolved
      // href respects the router basename (production serves the SPA under `/<env>/<app>/`) so
      // cmd/ctrl/middle-click and "open in new tab" land on the right URL. External links open in a
      // new tab with `noopener`. When no navigation callback is wired (e.g. the embed or a bare
      // unit-test render) internal links degrade to a plain anchor.
      a: ({ href, children, ...props }) => {
        const url = typeof href === 'string' ? href.trim() : '';
        const isInternal = APP_RELATIVE_PATH_RE.test(url);
        if (isInternal && onInternalLinkClick) {
          return (
            <InternalAppMarkdownLink url={url} onInternalLinkClick={onInternalLinkClick} {...props}>
              {children}
            </InternalAppMarkdownLink>
          );
        }
        const isHttp = /^https?:\/\//i.test(url);
        return (
          <a href={url || undefined} {...(isHttp ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...props}>
            {children}
          </a>
        );
      },
    };
    if (!onFileClick) return components;
    return {
      ...components,
      // Render workspace image artifacts (e.g. agent-generated plots/diagrams)
      // inline; the same file also remains in the workspace panel. Clicking the
      // image opens the full-size preview. Non-workspace srcs are not fetched —
      // we never auto-load an arbitrary remote URL from agent output.
      img: ({ src, alt }) => {
        const path = (typeof src === 'string' ? src : '').trim();
        if (isClickableWorkspaceFilePath(path) && IMAGE_FILE_RE.test(path)) {
          const url = resolveFileUrl?.(path);
          if (url) {
            return (
              <button
                type="button"
                className="message-block__inline-image-btn my-2 block max-w-full cursor-pointer border-0 bg-transparent p-0"
                onClick={() => onFileClick(path)}
                title={t('message.inlineImage.open')}
              >
                <img
                  className="message-block__inline-image block h-auto max-h-[480px] max-w-full rounded-md border border-border bg-background"
                  src={url}
                  alt={alt || path}
                  loading="lazy"
                />
              </button>
            );
          }
        }
        return alt ? <span className="message-block__inline-image-fallback italic opacity-70">{alt}</span> : null;
      },
      code: ({ children, className, ...props }) => {
        const content = String(children ?? '')
          .replace(/\n$/, '')
          .trim();
        const isInline = !className;
        if (isInline && !content.includes('\n') && isClickableWorkspaceFilePath(content)) {
          if (HTML_FILE_RE.test(content)) {
            const htmlUrl = resolveFileUrl?.(content, { inline: true });
            if (htmlUrl) {
              return <InlineHtmlArtifact url={htmlUrl} path={content} onExpand={() => onFileClick(content)} />;
            }
          }
          return (
            <button
              type="button"
              className="message-block__file-link inline-flex cursor-pointer items-center gap-1 rounded-md border border-primary/25 bg-primary/[0.08] px-2 py-0.5 font-mono text-[0.85em] leading-relaxed text-primary no-underline transition-colors hover:border-primary hover:bg-primary/[0.14]"
              onClick={() => onFileClick(content)}
              title={isPreviewableFile(content) ? t('message.fileLink.preview') : t('message.fileLink.open')}
            >
              {content}
            </button>
          );
        }
        // Relative workspace paths: agent may output `results/chart.html` without the
        // full `/data/workspace/` prefix. Resolve by prepending the workspace root.
        if (
          isInline &&
          !content.includes('\n') &&
          !content.includes(' ') &&
          !content.includes('://') &&
          HTML_FILE_RE.test(content)
        ) {
          const fullPath = `/data/workspace/${content.replace(/^\.?\//, '')}`;
          const htmlUrl = resolveFileUrl?.(fullPath, { inline: true });
          if (htmlUrl) {
            return <InlineHtmlArtifact url={htmlUrl} path={content} onExpand={() => onFileClick(fullPath)} />;
          }
        }
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      },
    };
  }, [onFileClick, resolveFileUrl, onInternalLinkClick, t]);

  if (kind === 'TEXT' && role === 'PARENT_AGENT') {
    // The subagent transcript's own USER-role turns are the parent agent's dispatched
    // instructions, not a human typing — relabeled to this role by the caller (SubagentTranscript)
    // before render. Left-aligned like an assistant bubble, but a plain muted box with no border
    // reads as just another assistant turn — the dashed border + small agent glyph (instead of a
    // solid fill) mark it as delegated-instruction traffic rather than either party's own words.
    // The subagent's own reply gets a matching speaker label (see the ASSISTANT branch below) so
    // the two turns stay distinguishable without relying on left/right position.
    const displayText = stripFileTags(text);
    if (!displayText) return null;
    return (
      <div className="message-block__parent-agent-row mb-4 flex flex-col items-start">
        <span className="message-block__parent-agent-label mb-1 flex items-center gap-1 text-2xs text-muted-foreground">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
            <rect x="1.5" y="3" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1" />
            <path d="M5.5 3V1.3M3.5 5.3h.01M7.5 5.3h.01" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          </svg>
          {t('subagent.parentAgentLabel')}
        </span>
        <div className="message-block__parent-agent-bubble max-w-[80%] rounded-md border border-dashed border-muted-foreground/40 bg-muted-foreground/5 px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
          {displayText}
        </div>
      </div>
    );
  }

  if (kind === 'TEXT' && role === 'USER') {
    // Original filenames attached to this message, set by ChatPage from pendingUserAttachmentsRef.
    // Rendered as pill badges above the prompt text. UI-only — the actual file content is inlined
    // into the prompt text as <file> blocks (stripped before display by stripFileTags).
    const names = message.attachments ?? [];
    const displayText = stripFileTags(text);
    const chipCls =
      'message-block__user-attachment-chip max-w-full truncate rounded-full border border-primary/35 bg-primary/15 px-2 py-0.5 text-2xs';
    return (
      <div className="message-block__user-row group/msg mb-4 flex flex-col items-end">
        <div className="message-block__user-bubble max-w-[80%] rounded-md bg-accent px-4 py-2.5">
          {names.length > 0 && (
            <div
              className={cn(
                'message-block__user-attachments flex flex-wrap gap-1.5',
                displayText && 'message-block__user-attachments--spaced mb-2.5'
              )}
            >
              {names.map((name, idx) =>
                onAttachmentClick ? (
                  <button
                    key={`${name}-${idx}`}
                    type="button"
                    // aria-label, not just title, so the accessible name describes the action
                    // (a `<button>`'s name comes from its text content first — without this,
                    // the button would announce as just the filename).
                    data-testid="chat-attachment-show"
                    data-name={name}
                    aria-label={t('message.attachmentShow', { name })}
                    title={t('message.attachmentShow', { name })}
                    className={cn(
                      chipCls,
                      'cursor-pointer transition-colors hover:border-primary/55 hover:bg-primary/25'
                    )}
                    onClick={() => onAttachmentClick(name)}
                  >
                    {name}
                  </button>
                ) : (
                  <span key={`${name}-${idx}`} title={name} className={chipCls}>
                    {name}
                  </span>
                )
              )}
            </div>
          )}
          {displayText ? (
            message.composedRich ? (
              // Rich-composed (the flag is set only on messages authored in the rich editor): render
              // as markdown, same pipeline as assistant replies, so a bulleted list shows as a list,
              // not raw `- ` source. `remark-breaks` maps single newlines to <br> so line breaks
              // survive. `[&_:first-child]:mt-0 [&_:last-child]:mb-0` collapses leading/trailing block
              // margins so the bubble stays tight; code backtick quotes are dropped like the assistant.
              <div className="message-block__user-text markdown-body prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-foreground prose-code:before:content-none prose-code:after:content-none [&_:first-child]:mt-0 [&_:last-child]:mb-0">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                  {displayText}
                </ReactMarkdown>
              </div>
            ) : (
              // Plain-typed (or reloaded from server history, where intent isn't persisted): render
              // verbatim with preserved whitespace — never through markdown — so plain dev content
              // like `run make_setup` or `1. buy milk` or a leading `#` isn't silently reformatted.
              <div className="message-block__user-text whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                {displayText}
              </div>
            )
          ) : null}
        </div>
        {displayText ? (
          <div
            className={cn(
              'message-block__user-actions message-block__message-actions mt-1 flex items-center',
              MESSAGE_ACTIONS_REVEAL
            )}
          >
            <CopyTextButton text={displayText} size="icon-xs" data-testid="message-copy-user" />
          </div>
        ) : null}
      </div>
    );
  }

  if (kind === 'TEXT') {
    const sourceText = text || '';
    const showCopy = role === 'ASSISTANT' && Boolean(sourceText.trim()) && !isStreaming;
    // FeedbackGroup itself returns null while streaming; keep the gate here so we don't
    // leave an empty hover-actions shell in the footer during a turn.
    const showFeedback = role === 'ASSISTANT' && Boolean(message.turnId && onFeedback) && !isStreaming;
    const showFooter = role === 'ASSISTANT' && (Boolean(message.modelId) || showCopy || showFeedback);

    // Badge tooltip: lead with the friendly model name (resolveModelLabel — the shared helper, not
    // modelBadgeLabel's family-only ladder), carry the fully-qualified route on the next line, then
    // the per-turn metadata suffixes. The visible badge text stays the compact family label.
    const modelId = message.modelId;
    const badgeFriendly = modelId ? resolveModelLabel(modelId, modelLabelById?.[modelId]) : '';
    const badgeHead = message.autoRouted
      ? t('modelBadge.autoTitle', { model: badgeFriendly })
      : t('modelBadge.title', { model: badgeFriendly });
    const modelBadgeTitle = modelId
      ? modelRouteTooltip(badgeHead, modelId) + // friendly-name line (the head) then the raw route
        (message.effort ? t('modelBadge.effortTitleSuffix', { effort: message.effort }) : '') +
        (message.outTok ? t('modelBadge.tokensTitleSuffix', { tokens: message.outTok }) : '') +
        (message.elapsedMs ? t('modelBadge.elapsedTitleSuffix', { elapsed: formatDuration(message.elapsedMs) }) : '')
      : undefined;

    return (
      <div className="message-block__assistant-text group/msg mb-4">
        {isSubagentTranscript && (
          // Matches the PARENT_AGENT label above — both sides of an agent-to-agent exchange now
          // render on the left (see that branch's comment), so a speaker label is what tells them
          // apart instead of which side of the screen they're on.
          <span className="message-block__subagent-reply-label mb-1 flex items-center gap-1 text-2xs text-muted-foreground">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
              <circle cx="5.5" cy="3.5" r="2" stroke="currentColor" strokeWidth="1" />
              <path
                d="M2 9.5c0-1.9 1.6-3.5 3.5-3.5S9 7.6 9 9.5"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
              />
            </svg>
            {t('subagent.thisAgentLabel')}
          </span>
        )}
        {/* `prose` (Tailwind Typography) restores heading/list/table styling that v4's preflight
            strips. `dark:prose-invert` follows the theme; `max-w-none` lets it fill the column.
            The code-* overrides drop prose's `code::before/after` backtick quotes since our custom
            `code` renderer already styles inline code + file-link chips. */}
        <div className="markdown-body prose prose-sm dark:prose-invert max-w-none leading-[1.7] text-foreground prose-pre:bg-muted prose-pre:text-foreground prose-code:before:content-none prose-code:after:content-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {sourceText}
          </ReactMarkdown>
        </div>
        {showFooter && (
          <div className="message-block__assistant-footer mt-2 flex flex-wrap items-center gap-2">
            {message.modelId && (
              <span
                className="message-block__model-badge inline-flex cursor-default items-center whitespace-nowrap rounded-md border border-border bg-muted-foreground/[0.08] px-2 py-[3px] text-2xs leading-none text-muted-foreground"
                data-testid="model-badge"
                data-auto-routed={message.autoRouted ? 'true' : undefined}
                title={modelBadgeTitle}
              >
                {message.autoRouted
                  ? t('modelBadge.autoLabel', { model: modelBadgeLabel(message.modelId, modelLabelById) })
                  : modelBadgeLabel(message.modelId, modelLabelById)}
                {/* Effort (low/medium/high), the output-token count, and the turn
                    duration are normalized values — i18n-exempt, shown raw like the
                    model family name. Tokens + duration are muted (secondary
                    metadata) vs the model name. */}
                {message.effort ? ` · ${message.effort}` : ''}
                {message.outTok ? (
                  <span className="message-block__model-badge-tokens text-muted-foreground/70">{` · ${formatTokenCount(message.outTok)}`}</span>
                ) : null}
                {message.elapsedMs ? (
                  <span className="message-block__model-badge-tokens text-muted-foreground/70">{` · ${formatDuration(message.elapsedMs)}`}</span>
                ) : null}
              </span>
            )}
            {(showCopy || showFeedback) && (
              <div
                className={cn(
                  // items-start keeps the copy icon aligned with the thumb row when the
                  // downvote detail sheet expands below.
                  'message-block__assistant-actions message-block__message-actions flex items-start gap-0.5',
                  MESSAGE_ACTIONS_REVEAL
                )}
              >
                {showCopy && <CopyTextButton text={sourceText} size="icon-xs" data-testid="message-copy-assistant" />}
                {showFeedback && message.turnId && onFeedback && (
                  <FeedbackGroup turnId={message.turnId} isStreaming={isStreaming} onFeedback={onFeedback} />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (kind === 'REASONING') {
    return <ReasoningBlock text={text} autoExpanded={reasoningAutoExpanded} />;
  }

  if (kind === 'TOOL_CALL') {
    return <ToolCallBlock message={message} subagentsEnabled={subagentsEnabled} parentSessionId={parentSessionId} />;
  }

  if (kind === 'PERMISSION') {
    // One-at-a-time: render only the oldest PENDING permission. Resolved frames
    // and queued PENDING ones collapse to null — the tool-call bubble is the feedback.
    if ((data?.state ?? 'PENDING') !== 'PENDING') return null;
    const permId = data?.permissionId || message.id;
    if (activePermissionId && permId !== activePermissionId) return null;
    // Read-only transcript: do not mount the interactive PermissionBlock. Those Allow/Deny
    // buttons POST to the live pod; a viewer of someone else's (or a finished) subagent
    // must not be able to answer a pending permission from this surface.
    if (isSubagentTranscript) {
      return (
        <div
          data-testid="permission-block-readonly"
          role="status"
          className="my-2 mb-4 rounded-md border border-l-[3px] border-l-amber-600 bg-muted/40 px-3.5 py-3 text-sm text-muted-foreground"
        >
          {t('subagent.permissionReadOnly')}
        </div>
      );
    }
    return <PermissionBlock message={message} onRespond={onPermissionRespond ?? (() => {})} />;
  }

  if (kind === 'ERROR') {
    return (
      <div className="message-block__error mb-3 flex items-start justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-[13px] text-destructive">
        <div className="message-block__error-text min-w-0">
          <strong>{t('message.error')}</strong> {text || stringify(data?.detail) || t('message.unknownError')}
        </div>
        {onRetry && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="message-block__error-retry -me-1 shrink-0 text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
            aria-label={t('message.retryAriaLabel')}
            title={t('message.retry')}
            disabled={retryDisabled}
            onClick={() => onRetry(message)}
          >
            <RefreshCw aria-hidden />
          </Button>
        )}
      </div>
    );
  }

  if (kind === 'STEP_START') return null;

  if (kind === 'STEP_FINISH') {
    return (
      <div className="message-block__step-finish mb-4 border-t border-border pt-1">
        <span className="message-block__step-finish-label text-2xs text-muted-foreground">
          {data?.reason === 'turn_finished' ? t('message.turnComplete') : stringify(data?.reason)}
        </span>
      </div>
    );
  }

  if (kind === 'COMPACTION') {
    // PENDING = auto-compaction in progress (transient spinner); COMPLETED =
    // context summarized (quiet persisted divider). data-testid lets tests + the
    // user distinguish the two states.
    const inProgress = data?.state === 'PENDING';
    return (
      <div
        className="message-block__compaction my-2 flex items-center justify-center gap-1.5 text-2xs text-muted-foreground"
        data-testid="compaction-notice"
        data-state={data?.state}
      >
        {inProgress && <span className="nexus-spinner message-block__compaction-spinner size-2.5 border" aria-hidden />}
        <span className="message-block__compaction-label text-muted-foreground" aria-live="polite">
          {inProgress ? t('compaction.inProgress') : t('compaction.done')}
        </span>
      </div>
    );
  }

  return null;
};

// Memoized: the transcript re-renders on every streamed frame (each mergeFrame state update). Only
// the one changed message gets a new object identity — every other message keeps its ref across the
// update — so a shallow prop compare skips re-rendering the unchanged blocks. The `message` prop's
// identity is preserved by mergeFrame (unchanged rows) and by ChatColumn's bindToolDescriptions
// identity cache (decorated tool calls); `modelLabelById` is useMemo'd; callbacks are useCallback'd
// by ChatPage; `subagentsEnabled` / `parentSessionId` are primitives — default shallow compare holds.
// (onRetry's identity does churn while the composer input changes, but not during pure streaming
// frames — input is untouched then — so the streaming hot path this targets stays memo-stable.)
const MessageBlock = React.memo(MessageBlockInner);

export default MessageBlock;
