/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { StatusPill } from './ui/status-pill';
import type { SkillRow } from '../lib/types';

/** A passive, contextual receipt for a proposal already staged in the existing review queue. */
export default function SkillLearningReceipt({
  proposal,
  proposalCount = 1,
  onReview,
}: {
  proposal: SkillRow;
  proposalCount?: number;
  onReview: () => void;
}) {
  const { t } = useTranslation('chat');
  return (
    <aside
      className="mx-auto mb-3 flex w-full max-w-3xl flex-wrap items-start gap-3 rounded-md border border-primary/30 bg-primary/5 p-3.5"
      aria-label={t('learningReceipt.ariaLabel')}
      aria-live="polite"
      data-testid="skill-learning-receipt"
    >
      <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{t('learningReceipt.title')}</p>
          <StatusPill tone="warning">{t('learningReceipt.pending')}</StatusPill>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {proposal.provenance?.rationale ||
            (proposal.supersedes
              ? t('learningReceipt.updated', { skill: proposal.supersedes })
              : t('learningReceipt.created', { skill: proposal.name }))}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t('learningReceipt.inactive')}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onReview}>
        {t('learningReceipt.review', { count: proposalCount })}
      </Button>
    </aside>
  );
}
