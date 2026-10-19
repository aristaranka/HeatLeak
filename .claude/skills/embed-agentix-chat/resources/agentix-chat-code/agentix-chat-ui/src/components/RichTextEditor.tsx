/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { Extension } from '@tiptap/core';
import { CharacterCount } from '@tiptap/extension-character-count';
import { Link } from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { Markdown } from '@tiptap/markdown';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Italic,
  Code,
  List,
  ListOrdered,
  ListChecks,
  Link2,
  ExternalLink,
  Maximize2,
  Heading1,
  Heading2,
  Heading3,
} from 'lucide-react';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { cleanMarkdown } from './markdownPlain';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

// ProseMirror hides the native text-selection highlight the moment the editor blurs — so when the
// link popover opens and focus jumps to its input, the text you selected to link looks unstyled.
// This plugin paints a decoration over the current selection while a flag is set (popover open), so
// the "you're linking THIS" highlight survives the blur. Toggled via a meta transaction.
// Built per editor instance (not a module singleton): a shared extension/PluginKey re-adds the same
// keyed plugin when a second editor mounts → ProseMirror "Adding different instances of a keyed
// plugin". The caller owns one key per mount (see linkSelectionKeyRef) and threads it here and to
// the toggle dispatch below.
const createLinkSelectionHighlight = (key: PluginKey<{ active: boolean }>) =>
  Extension.create({
    name: 'linkSelectionHighlight',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key,
          state: {
            init: () => ({ active: false }),
            apply(tr, value) {
              const meta = tr.getMeta(key);
              return typeof meta === 'boolean' ? { active: meta } : value;
            },
          },
          props: {
            decorations(state) {
              if (!key.getState(state)?.active) return null;
              const { from, to } = state.selection;
              if (from === to) return null;
              return DecorationSet.create(state.doc, [Decoration.inline(from, to, { class: 'rt-link-selection' })]);
            },
          },
        }),
      ];
    },
  });

// StarterKit wires the formatting shortcuts on each mark/node; label them per-OS for the button tooltips.
const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
const MOD = IS_MAC ? '⌘' : 'Ctrl+';
const SHIFT = IS_MAC ? '⇧' : 'Shift+';
const ALT = IS_MAC ? '⌥' : 'Alt+';

export { cleanMarkdown, plainToMarkdown } from './markdownPlain';

/**
 * Reverse the markdown serializer's *defensive* escaping so a value consumed as LITERAL text —
 * an agent system prompt spliced verbatim into AGENTS.md, an automation task instruction — reads
 * cleanly by the model. Tiptap entity-encodes `< > &` and backslash-escapes markdown punctuation;
 * left in place those artifacts (`&lt;tag&gt;`, `snake\_case`, doubled `\\`, trailing `\` breaks)
 * reach the model literally and corrupt the prompt (agent prompts lean on `<xml>` tags + code).
 * Structural markdown the user actually applied (`**bold**`, `- lists`, `[text](url)`) is left
 * intact — only the escape/entity noise is stripped.
 *
 * Sound ONLY over serializer output: there, every `\<punct>` / entity is an escape the serializer
 * added, so removing it restores intent. It is NOT a general-purpose unescaper — do not run it over
 * arbitrary user text. Idempotent for realistic prompt content (verified round-trip); the one lossy
 * corner is a genuine literal backslash immediately before punctuation in PROSE (e.g. `\_`), which
 * degrades on re-edit — an accepted trade for a prompt field. Entities decode with `&amp;` LAST so a
 * literal `&amp;lt;` collapses to `&lt;`, not `<`.
 *
 * Code is protected: the serializer emits code content verbatim (no defensive escapes inside a code
 * block/span), so a backslash the author actually typed in code — `\.` in a regex, `\(`, `\|`, a
 * LaTeX/shell escape — is real and must survive. We split off fenced (```` ``` ````/`~~~`) and inline
 * (`` ` ``) code regions and strip escape-noise only from the prose between them.
 */
const stripEscapeNoise = (prose: string): string =>
  prose
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1') // drop the backslash before escaped punctuation
    .replace(/\\\n/g, '\n') // hard-break backslash (from plainToMarkdown flip) → real newline
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

export const markdownToLiteral = (md: string): string =>
  // Capturing split → odd indices are the code regions (left verbatim), even indices are prose.
  md
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g)
    .map((segment, i) => (i % 2 === 1 ? segment : stripEscapeNoise(segment)))
    .join('');

/**
 * The extensions that determine markdown parsing/serialization. Exported as a factory (fresh
 * instances per call — the same configured instance must not be shared across live editors) so the
 * round-trip unit tests exercise the exact serializer the component uses, and can't drift from it.
 * UI-only extensions (Placeholder, CharacterCount, link-selection highlight) are NOT here — they
 * don't affect serialized output.
 */
export const markdownExtensions = () => [
  // StarterKit v3 bundles Link; disable it here so our explicitly-configured Link below is the
  // single owner (no "duplicate extension" warning, no split config).
  StarterKit.configure({ link: false }),
  // openOnClick:false so clicking a link in the editor edits text, not navigates away; autolink
  // turns a pasted/typed bare URL into a link. Serializes to `[text](url)`.
  Link.configure({
    openOnClick: false,
    autolink: true,
    HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
  }),
  // GFM task lists (`- [ ]` / `- [x]`) — round-trip through @tiptap/markdown and render on the
  // receiving side via remark-gfm. `.configure()` returns a FRESH instance per call: a Tiptap
  // extension instance must not be shared across live editors (it re-adds the same keyed plugin →
  // ProseMirror "Adding different instances of a keyed plugin"), which surfaces when two editors
  // co-exist — an inline + modal editor, or pooled test workers (`isolate: false`) reusing modules.
  TaskList.configure(),
  TaskItem.configure({ nested: true }),
  Markdown.configure(),
];

/** A toolbar toggle/action button with a styled tooltip that shows its keyboard binding on hover. */
const ToolbarButton: React.FC<{
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  shortcut?: string;
  testId?: string;
}> = ({ label, onClick, children, active, shortcut, testId }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn('shrink-0 text-muted-foreground', active && 'bg-muted text-foreground')}
        aria-pressed={active}
        aria-label={label}
        data-testid={testId}
        onClick={onClick}
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      {label}
      {shortcut ? <span className="ml-1.5 opacity-70">{shortcut}</span> : null}
    </TooltipContent>
  </Tooltip>
);

export interface RichTextEditorProps {
  /** Markdown — single source of truth, owned by the parent. */
  value: string;
  /** Emits the current markdown on every edit. */
  onChange: (markdown: string) => void;
  placeholder: string;
  disabled?: boolean;
  className?: string;
  /** Extra classes for the editable surface — used to grow it (e.g. in an expanded modal). */
  editorClassName?: string;
  /** When provided, renders an "expand" button in the toolbar (omit inside the modal itself). */
  onExpand?: () => void;
  /** Focus the editor (caret at end) on mount — used by the expanded modal. */
  autoFocus?: boolean;
  /**
   * Soft character budget. When set, a live count surfaces once the user nears it (≥80%) and
   * turns destructive past it. Advisory only — never blocks typing or truncates a paste.
   */
  characterLimit?: number;
  /**
   * Optional raw ProseMirror keydown hook. Return `true` to consume the event (ProseMirror won't
   * also handle it). Used by the chat composer to route Cmd/Ctrl+Enter (send) and Escape (dequeue);
   * plain-prose callers (system prompt, automation instructions) omit it so Enter inserts a newline.
   */
  onKeyDownCapture?: (event: KeyboardEvent) => boolean;
  /** Trailing toolbar slot (right side, before the expand button). Chat composer puts its send hint here. */
  toolbarTrailing?: React.ReactNode;
  /**
   * Emit a value consumed as LITERAL text rather than rendered markdown (system prompt, automation
   * instruction). Runs {@link markdownToLiteral} on the serialized output so the serializer's
   * escape/entity noise (`&lt;`, `snake\_case`, `\\`, `\`-breaks) doesn't reach the model. Leave
   * false (default) for the chat composer, whose output is rendered as markdown on both ends.
   */
  literalOutput?: boolean;
  /** `data-testid` for the editable surface. Distinct per instance so multiple editors on one page
   *  (e.g. an inline composer and its expanded-modal twin) don't collide on the same selector. */
  editorTestId?: string;
  /** Prefix for the link/expand control test IDs (`<prefix>-link-btn`, `<prefix>-expand-btn`, …). */
  testIdPrefix?: string;
}

/** Imperative surface exposed to parents — lets the page refocus the editor after a send/apply. */
export interface RichTextEditorHandle {
  focus: () => void;
}

/**
 * Headless Tiptap editor rendered as a controlled markdown view. The parent owns `value` as a
 * markdown string; this component keeps ProseMirror's document in sync with it and reports edits
 * back as markdown, so the rest of the app never has to know a rich editor is involved.
 *
 * Chat-specific behavior (send-on-⌘Enter, the send hint) lives in the thin `RichTextComposer`
 * wrapper — this component stays generic so plain-prose fields (system prompt, automation
 * instructions) can reuse it without inheriting composer semantics.
 */
const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  {
    value,
    onChange,
    placeholder,
    disabled = false,
    className,
    editorClassName,
    onExpand,
    autoFocus = false,
    characterLimit,
    onKeyDownCapture,
    toolbarTrailing,
    literalOutput = false,
    editorTestId = 'chat-message-input-rich',
    testIdPrefix = 'chat-rich-text',
  },
  ref
) {
  const { t } = useTranslation('chat');
  // Read by the Placeholder extension's dynamic `placeholder` option so the label reacts to prop
  // changes without having to reconfigure/recreate the extension.
  const placeholderRef = useRef(placeholder);
  placeholderRef.current = placeholder;

  // One link-selection PluginKey per editor instance (see createLinkSelectionHighlight). Lazily
  // initialized so a re-render doesn't mint a new key; shared with the toggle dispatch below.
  const linkSelectionKeyRef = useRef<PluginKey<{ active: boolean }> | null>(null);
  if (!linkSelectionKeyRef.current) linkSelectionKeyRef.current = new PluginKey('linkSelectionHighlight');
  const linkSelectionKey = linkSelectionKeyRef.current;

  // The keydown hook is read through a ref so the ProseMirror plugin (created once) always calls the
  // latest closure without recreating the editor when the parent passes a new function each render.
  const keyDownRef = useRef(onKeyDownCapture);
  keyDownRef.current = onKeyDownCapture;

  // Read through a ref so the one-time onUpdate closure always sees the latest flag without
  // recreating the editor. In practice it's static per mount (an editor only mounts in one mode).
  const literalOutputRef = useRef(literalOutput);
  literalOutputRef.current = literalOutput;

  // The last markdown string WE emitted via onChange. Used to tell an external write (draft load,
  // clear, flip, queue-restore) apart from our own onUpdate echo, so the sync effect below doesn't
  // fight the editor while the user is typing.
  const lastEmittedRef = useRef(value);

  // Link hover preview. Since openOnClick is off (clicking a link edits its text), hovering a link
  // surfaces a small card with the full URL that IS clickable to open it in a new tab. Declared
  // before useEditor so the editorProps DOM handlers below close over the stable setters.
  const [linkHover, setLinkHover] = useState<{ href: string; top: number; left: number } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHoverHide = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };
  // Small grace delay so moving the cursor from the link onto the card doesn't dismiss it.
  const scheduleHoverHide = () => {
    cancelHoverHide();
    hoverTimerRef.current = setTimeout(() => setLinkHover(null), 150);
  };
  useEffect(() => () => cancelHoverHide(), []);

  const editor = useEditor({
    extensions: [
      // Serialization-relevant extensions (shared with the round-trip tests — see markdownExtensions).
      ...markdownExtensions(),
      // UI-only extensions below — they don't affect serialized markdown, so they stay out of the
      // shared factory. Extension order is not significant to tiptap (extensions are keyed by name).
      Placeholder.configure({ placeholder: () => placeholderRef.current }),
      CharacterCount.configure(),
      createLinkSelectionHighlight(linkSelectionKey),
    ],
    content: value,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        // Auto-grows with content between min and max, then scrolls. `cn` (tailwind-merge) lets a
        // caller's editorClassName override the min/max box — e.g. the expanded modal grows it.
        class: cn(
          'prose prose-sm max-w-none dark:prose-invert min-h-[88px] max-h-[40vh] w-full overflow-y-auto bg-transparent p-3.5 text-[15px] leading-[1.55] focus:outline-none [overflow-wrap:anywhere]',
          editorClassName
        ),
        'data-testid': editorTestId,
      },
      handleDOMEvents: {
        mouseover: (_view, event) => {
          const a = (event.target as HTMLElement | null)?.closest?.('a');
          if (a instanceof HTMLAnchorElement && a.href) {
            cancelHoverHide();
            const rect = a.getBoundingClientRect();
            setLinkHover({ href: a.href, top: rect.top, left: rect.left });
          }
          return false;
        },
        mouseout: (_view, event) => {
          if ((event.target as HTMLElement | null)?.closest?.('a')) scheduleHoverHide();
          return false;
        },
      },
      handleKeyDown: (_view, event) => {
        if (event.isComposing) return false;
        // Delegate to the optional parent hook (chat: send/dequeue). Anything it doesn't claim
        // falls through to ProseMirror's default editing (Enter = newline / next list item).
        return keyDownRef.current?.(event) ?? false;
      },
    },
    onUpdate: ({ editor: e }) => {
      // Emit exactly what we store into lastEmittedRef, so the value-sync effect below (which
      // compares `value === lastEmittedRef.current`) doesn't re-inject our own echo and fight the
      // caret — this is why the literal transform lives here, not in the parent's onChange.
      const md = cleanMarkdown(e.getMarkdown());
      const out = literalOutputRef.current ? markdownToLiteral(md) : md;
      lastEmittedRef.current = out;
      onChange(out);
    },
  });

  // Propagate external writes to `value` (draft load, clear, flip, queue-restore) into the editor.
  // Skipped when `value` already matches what we last emitted, so our own onUpdate → onChange →
  // value round-trip doesn't bounce back in and fight the user's cursor.
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedRef.current) return;
    const hadFocus = editor.isFocused;
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
    lastEmittedRef.current = value;
    if (hadFocus) editor.commands.focus('end');
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  // Let the page drive focus back into the editor after a send/apply (parallel to a plain
  // textarea's inputRef.focus()). Caret goes to the end so the user keeps typing where they left off.
  useImperativeHandle(ref, () => ({ focus: () => editor?.commands.focus('end') }), [editor]);

  // v3 `useEditor` does NOT re-render on every transaction, so `editor.isActive(...)` read straight
  // in render goes stale after a keyboard shortcut (⌘B etc.). Subscribe to just the marks/nodes the
  // toolbar reflects; this re-renders only when one of these flags flips (keyboard, click, or the
  // caret moving into/out of formatted text).
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      heading1: e?.isActive('heading', { level: 1 }) ?? false,
      heading2: e?.isActive('heading', { level: 2 }) ?? false,
      heading3: e?.isActive('heading', { level: 3 }) ?? false,
      bold: e?.isActive('bold') ?? false,
      italic: e?.isActive('italic') ?? false,
      code: e?.isActive('code') ?? false,
      bulletList: e?.isActive('bulletList') ?? false,
      orderedList: e?.isActive('orderedList') ?? false,
      taskList: e?.isActive('taskList') ?? false,
      link: e?.isActive('link') ?? false,
      characters: e?.storage.characterCount?.characters() ?? 0,
    }),
  });

  // Link editor popover — controlled so we can prefill the URL from the current selection on open.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const applyLink = () => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      // Default a bare host to https:// so `example.com` becomes a real link, not a relative path.
      const href = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`;
      const { from, to } = editor.state.selection;
      if (from === to) {
        // No selection: drop the URL in as its own linked text.
        editor
          .chain()
          .focus()
          .insertContent(url)
          .setTextSelection({ from, to: from + url.length })
          .setLink({ href })
          .run();
      } else {
        editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
      }
    }
    setLinkOpen(false);
  };

  const removeLink = () => {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkOpen(false);
  };

  // Keep the selection-highlight decoration in sync with the popover — covers both user-driven
  // closes (onOpenChange) and programmatic ones (applyLink/removeLink set linkOpen directly).
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta(linkSelectionKey, linkOpen));
  }, [linkOpen, editor]);

  const characters = active?.characters ?? 0;
  const showCount = characterLimit != null && characters >= characterLimit * 0.8;

  if (!editor) return null;

  return (
    <div className={cn('flex w-full flex-col', disabled && 'pointer-events-none opacity-60', className)}>
      <TooltipProvider delayDuration={300}>
        {/* role="group", not "toolbar": a WAI-ARIA toolbar promises roving-tabindex + arrow-key
            navigation between controls, which we don't implement. Each button is individually
            Tab-focusable and labeled, so a labeled group is the honest role. */}
        <div
          role="group"
          aria-label={t('composer.formattingToolbar')}
          className="flex items-center gap-0.5 border-b border-border px-2 py-1"
        >
          <ToolbarButton
            label={t('composer.heading1')}
            shortcut={`${MOD}${ALT}1`}
            active={active?.heading1}
            testId={`${testIdPrefix}-h1-btn`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            <Heading1 className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label={t('composer.heading2')}
            shortcut={`${MOD}${ALT}2`}
            active={active?.heading2}
            testId={`${testIdPrefix}-h2-btn`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label={t('composer.heading3')}
            shortcut={`${MOD}${ALT}3`}
            active={active?.heading3}
            testId={`${testIdPrefix}-h3-btn`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <Heading3 className="size-4" />
          </ToolbarButton>
          <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
          <ToolbarButton
            label={t('composer.bold')}
            shortcut={`${MOD}B`}
            active={active?.bold}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label={t('composer.italic')}
            shortcut={`${MOD}I`}
            active={active?.italic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label={t('composer.code')}
            shortcut={`${MOD}E`}
            active={active?.code}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label={t('composer.bulletList')}
            shortcut={`${MOD}${SHIFT}8`}
            active={active?.bulletList}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label={t('composer.orderedList')}
            shortcut={`${MOD}${SHIFT}7`}
            active={active?.orderedList}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label={t('composer.taskList')}
            active={active?.taskList}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          >
            <ListChecks className="size-4" />
          </ToolbarButton>
          <Popover
            open={linkOpen}
            onOpenChange={(open) => {
              // Prefill from the link under the caret so re-opening edits the existing URL.
              if (open) setLinkUrl((editor.getAttributes('link').href as string) ?? '');
              setLinkOpen(open);
            }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className={cn('shrink-0 text-muted-foreground', active?.link && 'bg-muted text-foreground')}
                    aria-pressed={active?.link}
                    aria-label={t('composer.link')}
                    data-testid={`${testIdPrefix}-link-btn`}
                  >
                    <Link2 className="size-4" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>{t('composer.link')}</TooltipContent>
            </Tooltip>
            <PopoverContent align="start" className="w-72 p-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  applyLink();
                }}
                className="flex flex-col gap-2"
              >
                <Input
                  autoFocus
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder={t('composer.linkPlaceholder')}
                  aria-label={t('composer.linkUrl')}
                  data-testid={`${testIdPrefix}-link-input`}
                />
                <div className="flex items-center justify-between">
                  <Button type="button" variant="ghost" size="sm" onClick={removeLink} disabled={!active?.link}>
                    {t('composer.linkRemove')}
                  </Button>
                  <Button type="submit" size="sm" data-testid={`${testIdPrefix}-link-apply`}>
                    {t('composer.linkApply')}
                  </Button>
                </div>
              </form>
            </PopoverContent>
          </Popover>
          <div className="ml-auto flex items-center gap-2">
            {showCount && (
              <span
                className={cn(
                  'shrink-0 text-2xs tabular-nums',
                  characters > (characterLimit ?? 0) ? 'text-destructive' : 'text-muted-foreground'
                )}
                aria-label={t('composer.charCountLabel', { count: characters, limit: characterLimit })}
              >
                {characters}/{characterLimit}
              </span>
            )}
            {toolbarTrailing}
            {onExpand && (
              <ToolbarButton label={t('composer.expand')} testId={`${testIdPrefix}-expand-btn`} onClick={onExpand}>
                <Maximize2 className="size-4" />
              </ToolbarButton>
            )}
          </div>
        </div>
      </TooltipProvider>
      <EditorContent editor={editor} />
      {/* Portaled to <body> so it escapes any transformed ancestor (e.g. Radix DialogContent, which
          is centered with a CSS transform). A transform makes its subtree the containing block for
          position:fixed, which would otherwise offset this card away from the link it points at. */}
      {linkHover &&
        createPortal(
          <div
            className="fixed z-[100]"
            style={{ top: linkHover.top, left: linkHover.left, transform: 'translateY(calc(-100% - 6px))' }}
            onMouseEnter={cancelHoverHide}
            onMouseLeave={scheduleHoverHide}
          >
            <a
              href={linkHover.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              aria-label={t('composer.linkOpen')}
              data-testid={`${testIdPrefix}-link-preview`}
              className="flex max-w-[320px] items-center gap-1.5 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md hover:bg-muted"
            >
              <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate" title={linkHover.href}>
                {linkHover.href}
              </span>
            </a>
          </div>,
          document.body
        )}
    </div>
  );
});

export default RichTextEditor;
