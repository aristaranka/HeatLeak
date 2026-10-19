/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleAlert, TriangleAlert, CircleCheck, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import './MessageBanner.scss';

export type MessageBannerType = 'error' | 'warning' | 'success';

export interface MessageBannerProps {
  /** The message to display in the banner. Empty string hides the banner. */
  message: string;
  /** The type of banner: error, warning, or success */
  type: MessageBannerType;
  /** Callback when the banner is closed (either manually or auto-dismissed) */
  onClose: () => void;
  /** Optional className for additional styling */
  className?: string;
  /** Auto-dismiss duration in milliseconds. Default is 5000ms (5 seconds). Set to 0 to disable auto-dismiss. */
  autoDismissDuration?: number;
}

const ICON_MAP: Record<MessageBannerType, LucideIcon> = {
  error: CircleAlert,
  warning: TriangleAlert,
  success: CircleCheck,
} as const;

export const MessageBanner: React.FC<MessageBannerProps> = ({
  message,
  type,
  onClose,
  className = '',
  autoDismissDuration = 5000,
}) => {
  const { t } = useTranslation();
  useEffect(() => {
    if (message && autoDismissDuration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, autoDismissDuration);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [message, autoDismissDuration, onClose]);

  if (!message) return null;

  return (
    <div className={`message-banner message-banner-${type} ${className}`.trim()}>
      <div className="message-banner-content">
        <div className="message-banner-left">
          <div className="message-banner-icon">
            {React.createElement(ICON_MAP[type], { size: 16 })}
          </div>
          <span className="message-banner-text">{message}</span>
        </div>
        <button
          className="message-banner-close"
          onClick={onClose}
          aria-label={t('common.closeBanner')}
          type="button"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
