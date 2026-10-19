/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Small circular context gauge (Claude-app convention): ring fill = context
 * occupancy vs the model's auto-compaction ceiling, so 100% is the point where
 * the agent auto-compacts. Fed by the turn-end `ctxTok`/`ctxMax` stamped on the
 * latest assistant bubble; renders nothing until a turn has reported. The ring
 * is iconography, not a themed component — the circle shape is intentional.
 */
const ContextGauge: React.FC<{ used: number; max: number }> = ({ used, max }) => {
  const { t } = useTranslation('chat');
  if (!(used > 0) || !(max > 0)) return null;
  const frac = Math.min(1, used / max);
  const pct = Math.round(frac * 100);
  // r=5.5 with strokeWidth 2 inside a 16px box; dasharray fills clockwise from 12 o'clock.
  const r = 5.5;
  const circumference = 2 * Math.PI * r;
  const level = frac >= 0.9 ? 'danger' : frac >= 0.7 ? 'warn' : 'ok';
  const label = t('contextGauge.title', { pct });
  return (
    <span className="chat-page__context-gauge" data-level={level} data-testid="context-gauge" title={label}>
      <svg width="16" height="16" viewBox="0 0 16 16" role="img" aria-label={label}>
        <circle cx="8" cy="8" r={r} fill="none" stroke="var(--border)" strokeWidth="2" />
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={`${frac * circumference} ${circumference}`}
          transform="rotate(-90 8 8)"
        />
      </svg>
    </span>
  );
};

export default ContextGauge;
