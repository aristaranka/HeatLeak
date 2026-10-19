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
import { InlineAppServer, type InlineAppServerProps } from './InlineAppServer';
import { useAppPortal } from './movePortalNode';

interface MovableServerAppProps extends InlineAppServerProps {
  inlineTarget: HTMLElement | null;
  panelTarget: HTMLElement | null;
  inPanel: boolean;
}

export function ServerAppAnchor({
  instanceId,
  ...props
}: Omit<AppAnchorProps, 'id' | 'kind'> & { instanceId: string }) {
  return <AppAnchor {...props} id={instanceId} kind="server" />;
}

/** Moves one live server iframe between its transcript card and the shared panel without remounting it. */
export function MovableServerApp({ inlineTarget, panelTarget, inPanel, ...appProps }: MovableServerAppProps) {
  const mountNode = useAppPortal(
    inPanel ? panelTarget : inlineTarget,
    appProps.displayMode === 'fullscreen' ? 60 : inPanel ? 40 : 1,
    appProps.displayMode !== 'fullscreen'
  );
  if (!mountNode) return null;

  return createPortal(
    <InlineAppServer
      {...appProps}
      presentation={inPanel ? 'panel' : 'card'}
      className={inPanel ? 'h-full' : undefined}
    />,
    mountNode
  );
}
