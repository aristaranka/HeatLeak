/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import type { QuestionItem } from '../lib/types';

interface QuestionBlockProps {
  questions: QuestionItem[];
  /** Called once with the full answer: the selected choice(s) for a lone question
   *  (comma-joined when it's multi-select), or one `question: choices` line per
   *  question (newline-joined) when several were asked. Free-text custom answers
   *  replace option selections for that question when non-empty. */
  onSubmit: (answer: string) => void;
  disabled?: boolean;
}

/** OpenCode default: free-text allowed unless the agent sets `custom: false`. */
function allowsCustom(q: QuestionItem): boolean {
  return q.custom !== false;
}

function isAnswered(q: QuestionItem, selected: string[] | undefined, customText: string | undefined): boolean {
  const custom = (customText ?? '').trim();
  if (allowsCustom(q) && custom.length > 0) return true;
  return (selected?.length ?? 0) > 0;
}

/** Value for one question: non-empty custom text wins; else selected option labels. */
function answerForQuestion(q: QuestionItem, selected: string[] | undefined, customText: string | undefined): string {
  const custom = (customText ?? '').trim();
  if (allowsCustom(q) && custom.length > 0) return custom;
  return (selected ?? []).join(', ');
}

const QuestionBlock: React.FC<QuestionBlockProps> = ({ questions, onSubmit, disabled }) => {
  const { t } = useTranslation('chat');
  // Selected option labels per question, keyed by question index. Always an array so a
  // multi-select question can hold several choices; single-select holds at most one.
  const [selected, setSelected] = useState<Record<number, string[]>>({});
  // Per-question free-text ("Type your own answer"). Trimmed non-empty text counts as answered
  // and replaces option selections for that question on submit (including the whole multi-select set).
  const [customText, setCustomText] = useState<Record<number, string>>({});

  if (!questions || questions.length === 0) return null;

  const manyQuestions = questions.length > 1;
  const lone = questions[0];
  const loneCustomDirty = allowsCustom(lone) && (customText[0] ?? '').trim().length > 0;
  const loneHasSelection = (selected[0]?.length ?? 0) > 0;
  // One-click submit only for a lone single-select with options, no dirty free-text,
  // and nothing selected yet. If the user selected an option while custom was dirty then
  // cleared the field, keep Submit so a highlighted choice isn't stranded without a button.
  // Free-text-only / multi-select / multi-question / dirty custom → Submit (or Enter in field).
  const autoSubmit =
    !manyQuestions && !lone.multiple && (lone.options?.length ?? 0) > 0 && !loneCustomDirty && !loneHasSelection;
  const allAnswered = questions.every((q, qi) => isAnswered(q, selected[qi], customText[qi]));
  // Hide Submit for degenerate frames (no options and custom:false) — nothing can ever answer.
  const anyAnswerable = questions.some((q) => (q.options?.length ?? 0) > 0 || allowsCustom(q));
  const showSubmit = !autoSubmit && anyAnswerable;

  const handleOptionClick = (qi: number, label: string) => {
    if (autoSubmit) {
      onSubmit(label);
      return;
    }
    setSelected((prev) => {
      const current = prev[qi] ?? [];
      if (questions[qi].multiple) {
        // Toggle within the multi-select set.
        const next = current.includes(label) ? current.filter((l) => l !== label) : [...current, label];
        return { ...prev, [qi]: next };
      }
      // Single-select: replace.
      return { ...prev, [qi]: [label] };
    });
  };

  const handleSubmit = () => {
    if (!allAnswered) return;
    // A lone question answers with just its choice(s) or custom text; several questions
    // prefix each line with the question text so the agent can tell the answers apart.
    const answer = manyQuestions
      ? questions
          .map((q, qi) => `${q.question || q.header || ''}: ${answerForQuestion(q, selected[qi], customText[qi])}`)
          .join('\n')
      : answerForQuestion(lone, selected[0], customText[0]);
    onSubmit(answer);
  };

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!disabled && allAnswered) handleSubmit();
  };

  return (
    <div className="mb-4 flex flex-col gap-3" data-testid="question-block">
      {questions.map((q, qi) => {
        const showCustom = allowsCustom(q);
        const opts = q.options ?? [];
        // Non-empty custom wins on submit — disable options so only one input path is active
        // (avoids ambiguous "which wins" when both look selectable). Prior picks stay in state
        // and re-enable if the user clears the field.
        const customWins = showCustom && (customText[qi] ?? '').trim().length > 0;
        return (
          <div key={qi} className="flex flex-col gap-1.5" data-testid="question-item">
            {q.header && <div className="text-[15px] font-semibold text-foreground">{q.header}</div>}
            {q.question && <div className="text-sm text-muted-foreground">{q.question}</div>}
            {q.multiple && <div className="text-xs text-muted-foreground">{t('question.selectMultiple')}</div>}
            {opts.length > 0 && (
              <div className="mt-1 flex flex-col gap-2">
                {opts.map((opt, oi) => {
                  const isSelected = selected[qi]?.includes(opt.label) ?? false;
                  return (
                    <Button
                      key={oi}
                      type="button"
                      variant="outline"
                      data-testid="question-option"
                      className={cn(
                        'h-auto w-full flex-col items-start gap-0.5 whitespace-normal px-3.5 py-2.5 text-left',
                        isSelected &&
                          !customWins &&
                          'border-ring bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground',
                        // Prior selection while custom overrides: keep a muted cue (options are also disabled).
                        isSelected &&
                          customWins &&
                          'border-dashed border-muted-foreground/40 bg-muted/50 text-muted-foreground'
                      )}
                      aria-pressed={autoSubmit ? undefined : isSelected}
                      data-custom-override={isSelected && customWins ? 'true' : undefined}
                      onClick={() => handleOptionClick(qi, opt.label)}
                      disabled={disabled || customWins}
                    >
                      <span
                        className={cn(
                          'text-sm font-medium',
                          customWins && isSelected ? 'text-muted-foreground' : 'text-foreground'
                        )}
                      >
                        {opt.label}
                      </span>
                      {opt.description && (
                        <span className="text-xs font-normal text-muted-foreground">{opt.description}</span>
                      )}
                    </Button>
                  );
                })}
              </div>
            )}
            {showCustom && (
              <div className="mt-1 flex flex-col gap-1">
                <label className="text-xs text-muted-foreground" htmlFor={`question-custom-${qi}`}>
                  {t('question.customLabel', { defaultValue: 'Type your own answer' })}
                </label>
                <Input
                  id={`question-custom-${qi}`}
                  data-testid="question-custom-input"
                  type="text"
                  value={customText[qi] ?? ''}
                  onChange={(e) => setCustomText((prev) => ({ ...prev, [qi]: e.target.value }))}
                  onKeyDown={handleCustomKeyDown}
                  placeholder={t('question.customPlaceholder', {
                    defaultValue: 'Type your own answer…',
                  })}
                  disabled={disabled}
                  autoComplete="off"
                />
              </div>
            )}
          </div>
        );
      })}
      {showSubmit && (
        <Button type="button" className="mt-1 self-start" onClick={handleSubmit} disabled={disabled || !allAnswered}>
          {t('question.submit')}
        </Button>
      )}
    </div>
  );
};

export default QuestionBlock;
