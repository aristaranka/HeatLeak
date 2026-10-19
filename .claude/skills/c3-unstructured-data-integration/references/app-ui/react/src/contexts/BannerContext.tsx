/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { MessageBanner, MessageBannerType } from '../pages/components/MessageBanner';

interface BannerContextType {
  showBanner: (type: MessageBannerType, message: string) => void;
}

const BannerContext = createContext<BannerContextType | undefined>(undefined);

interface BannerState {
  message: string;
  type: MessageBannerType;
}

export const BannerProvider = ({ children }: { children: ReactNode }) => {
  const [bannerState, setBannerState] = useState<BannerState>({
    message: '',
    type: 'error',
  });

  const showBanner = (type: MessageBannerType, message: string) => {
    setBannerState({ type, message });
  };

  const hideBanner = () => {
    setBannerState({ message: '', type: 'error' });
  };

  return (
    <BannerContext.Provider value={{ showBanner }}>
      {children}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 'var(--z-index-fixed)',
          display: 'flex',
          justifyContent: 'center',
          padding: 'var(--c3-style-space-05)',
          pointerEvents: 'none',
        }}
      >
        <div style={{ maxWidth: 'var(--container-4xl)', width: '100%', pointerEvents: 'auto' }}>
          <MessageBanner
            message={bannerState.message}
            type={bannerState.type}
            onClose={hideBanner}
          />
        </div>
      </div>
    </BannerContext.Provider>
  );
};

export const useBanner = () => {
  const context = useContext(BannerContext);
  if (!context) {
    throw new Error('useBanner must be used within a BannerProvider');
  }
  return context;
};
