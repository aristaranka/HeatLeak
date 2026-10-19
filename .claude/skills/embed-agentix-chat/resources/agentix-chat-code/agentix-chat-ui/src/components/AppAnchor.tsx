/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useLayoutEffect, useRef } from 'react';

export interface AppAnchorProps {
  id: string;
  kind: 'resource' | 'server';
  location: 'inline' | 'panel';
  active?: boolean;
  onMount: (location: 'inline' | 'panel', id: string, node: HTMLDivElement | null) => void;
}

export function AppAnchor({ id, kind, location, active = true, onMount }: AppAnchorProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    onMount(location, id, ref.current);
    return () => onMount(location, id, null);
  }, [id, location, onMount]);
  return (
    <div
      ref={ref}
      className={
        location === 'panel'
          ? 'flex min-h-0 min-w-0 flex-1 flex-col'
          : !active
            ? 'h-0 min-w-0'
            : kind === 'server'
              ? 'mx-4 mb-4 h-[480px] min-w-0'
              : 'mx-4 mb-4 h-[490px] min-w-0'
      }
      {...{ [`data-${kind}-app-anchor`]: id }}
    />
  );
}
