/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React from 'react';
import { Circle } from 'lucide-react';

import { getStatusColorClass, getStatusLabel } from '../utils/statusUtils';

interface StatusCellProps {
  status: string;
}

export const StatusCell: React.FC<StatusCellProps> = ({ status }) => {
  const colorClass = getStatusColorClass(status);

  return (
    <span className="inline-flex items-start gap-2 text-sm">
      {/*
       * Every status renders as the same static filled dot (color carries the meaning). In-flight
       * statuses use the accent color + a trailing "…" in the label rather than an animated spinner,
       * so a table full of processing rows stays calm instead of showing many spinners at once.
       *
       * The dot is wrapped in a first-line-height box (leading-5 to match the label) and centered
       * within it so it aligns with the first line of text even when the label wraps to two lines.
       */}
      <span className="flex h-5 flex-shrink-0 items-center leading-5">
        <Circle className={colorClass} fill="currentColor" size={10} aria-hidden="true" />
      </span>
      <span className="text-primary leading-5">{getStatusLabel(status)}</span>
    </span>
  );
};
