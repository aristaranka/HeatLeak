/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import RichTextEditor, { type RichTextEditorHandle } from './RichTextEditor';

// The generic markdown helpers live with the editor now; re-export them so existing importers
// (ChatColumn, the composer test) keep resolving them from './RichTextComposer'.
export { cleanMarkdown, plainToMarkdown } from './markdownPlain';

// Rich mode follows the editor convention: Enter edits, Cmd/Ctrl+Enter sends. Label the send
// shortcut per-OS for the toolbar hint (⌘ on macOS/iOS, Ctrl elsewhere).
const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
const SEND_SHORTCUT = IS_MAC ? '⌘↵' : 'Ctrl+↵';

export interface RichTextComposerProps {
  /** Markdown — single source of truth, owned by the parent. */
  value: string;
  /** Emits the current markdown on every edit. */
  onChange: (markdown: string) => void;
  /** Reuse the parent's existing keydown handler (Enter=send, Esc=dequeue, etc.). */
  onKeyDown: React.KeyboardEventHandler;
  placeholder: string;
  disabled?: boolean;
  className?: string;
  /** Extra classes for the editable surface — used to grow it (e.g. in the expanded modal). */
  editorClassName?: string;
  /** When provided, renders an "expand" button in the toolbar (omit inside the modal itself). */
  onExpand?: () => void;
  /** Focus the editor (caret at end) on mount — used by the expanded modal. */
  autoFocus?: boolean;
  /**
   * Soft character budget. When set, a live count surfaces once the user nears it (≥80%) and
   * turns destructive past it. Advisory only — never blocks typing or truncates a paste; it's an
   * awareness cue so a giant message doesn't silently blow the agent's context.
   */
  characterLimit?: number;
  /** `data-testid` for the editable surface. Distinct per instance so the inline and the
   *  expanded-modal composer don't collide on the same selector when both are mounted. */
  editorTestId?: string;
}

/** Imperative surface exposed to parents — lets the page refocus the editor after a send. */
export type RichTextComposerHandle = RichTextEditorHandle;

/**
 * Chat composer skin over the generic {@link RichTextEditor}: adds the send-shortcut hint and routes
 * Cmd/Ctrl+Enter (send) and Escape (dequeue a pending message) to the parent's keydown handler while
 * leaving plain Enter / Shift+Enter to ProseMirror. Everything else (toolbar, markdown round-trip,
 * link popover, character budget) is the shared editor.
 */
const RichTextComposer = forwardRef<RichTextComposerHandle, RichTextComposerProps>(function RichTextComposer(
  {
    value,
    onChange,
    onKeyDown,
    placeholder,
    disabled,
    className,
    editorClassName,
    onExpand,
    autoFocus,
    characterLimit,
    editorTestId,
  },
  ref
) {
  const { t } = useTranslation('chat');

  // Map the raw ProseMirror keydown onto the parent's React handler. The parent sends on
  // Enter && !shiftKey and dequeues on Escape — hand it exactly that shape.
  const onKeyDownCapture = (event: KeyboardEvent): boolean => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      const shim = {
        key: 'Enter',
        shiftKey: false,
        preventDefault: () => event.preventDefault(),
      } as unknown as React.KeyboardEvent;
      onKeyDown(shim);
      return true; // consume so ProseMirror doesn't also insert a newline
    }
    if (event.key === 'Escape') {
      const shim = {
        key: 'Escape',
        shiftKey: event.shiftKey,
        preventDefault: () => event.preventDefault(),
      } as unknown as React.KeyboardEvent;
      onKeyDown(shim);
      return event.defaultPrevented; // consumed only when the parent dequeued a pending message
    }
    return false;
  };

  return (
    <RichTextEditor
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      editorClassName={editorClassName}
      onExpand={onExpand}
      autoFocus={autoFocus}
      characterLimit={characterLimit}
      onKeyDownCapture={onKeyDownCapture}
      editorTestId={editorTestId ?? 'chat-message-input-rich'}
      testIdPrefix="chat-rich-text"
      toolbarTrailing={
        <span className="shrink-0 pr-1 text-2xs text-muted-foreground" aria-hidden="true">
          {SEND_SHORTCUT} {t('composer.sendHint')}
        </span>
      }
    />
  );
});

export default RichTextComposer;
