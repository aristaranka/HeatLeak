/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { AppAnchor, type AppAnchorProps } from './AppAnchor';
import { InlineResourceApp, type InlineResourceAppProps } from './InlineResourceApp';
import { useAppPortal } from './movePortalNode';

interface MovableResourceAppProps extends InlineResourceAppProps {
  inlineTarget: HTMLElement | null;
  panelTarget: HTMLElement | null;
  inPanel: boolean;
}

export function ResourceAppAnchor({ uri, ...props }: Omit<AppAnchorProps, 'id' | 'kind'> & { uri: string }) {
  return <AppAnchor {...props} id={uri} kind="resource" />;
}

/** Moves one stable portal container between the transcript and panel without remounting its iframe. */
export function MovableResourceApp({ inlineTarget, panelTarget, inPanel, ...appProps }: MovableResourceAppProps) {
  const mountNode = useAppPortal(
    inPanel ? panelTarget : inlineTarget,
    appProps.displayMode === 'fullscreen' ? 60 : inPanel ? 40 : 1,
    appProps.displayMode !== 'fullscreen'
  );
  if (!mountNode) return null;

  return createPortal(
    <InlineResourceApp
      {...appProps}
      presentation={inPanel ? 'panel' : 'inline'}
      className={inPanel ? 'h-full' : undefined}
    />,
    mountNode
  );
}
