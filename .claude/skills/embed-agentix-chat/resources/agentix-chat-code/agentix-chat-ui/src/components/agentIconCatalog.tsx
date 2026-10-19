/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import type { ReactNode } from 'react';

export interface CatalogIcon {
  key: string;
  label: string;
  svg: ReactNode;
}

const S = 24;
const props = { width: S, height: S, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true } as const;
const strokeProps = {
  width: S,
  height: S,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
} as const;

export const AGENT_ICONS: CatalogIcon[] = [
  {
    key: 'palette',
    label: 'icon_palette',
    svg: (
      <svg {...strokeProps}>
        <circle cx="13.5" cy="6.5" r="2.5" />
        <circle cx="6.5" cy="13.5" r="2.5" fill="currentColor" />
        <circle cx="17.5" cy="13.5" r="2.5" />
        <circle cx="13.5" cy="17.5" r="2.5" />
        <circle cx="8" cy="8" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: 'trend-up',
    label: 'icon_trend_up',
    svg: (
      <svg {...strokeProps}>
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
  {
    key: 'bar-chart',
    label: 'icon_bar_chart',
    svg: (
      <svg {...strokeProps}>
        <line x1="12" y1="20" x2="12" y2="10" />
        <line x1="18" y1="20" x2="18" y2="4" />
        <line x1="6" y1="20" x2="6" y2="16" />
      </svg>
    ),
  },
  {
    key: 'pie-chart',
    label: 'icon_pie_chart',
    svg: (
      <svg {...strokeProps}>
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
        <path d="M22 12A10 10 0 0 0 12 2v10z" />
      </svg>
    ),
  },
  {
    key: 'tag',
    label: 'icon_tag',
    svg: (
      <svg {...strokeProps}>
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
  },
  {
    key: 'truck',
    label: 'icon_truck',
    svg: (
      <svg {...strokeProps}>
        <rect x="1" y="3" width="15" height="13" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
  {
    key: 'cloud',
    label: 'icon_cloud',
    svg: (
      <svg {...strokeProps}>
        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
      </svg>
    ),
  },
  {
    key: 'gear',
    label: 'icon_settings',
    svg: (
      <svg {...strokeProps}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
  {
    key: 'hammer',
    label: 'icon_tool',
    svg: (
      <svg {...strokeProps}>
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    key: 'dog',
    label: 'icon_dog',
    svg: (
      <svg {...props}>
        <path d="M10 5.172C10 3.782 8.884 2.564 7.5 2.5 6.116 2.436 5 3.536 5 4.922v3.156C5 9.142 5.858 10 6.922 10H10V5.172zM14 5.172C14 3.782 15.116 2.564 16.5 2.5c1.384-.064 2.5 1.036 2.5 2.422v3.156C19 9.142 18.142 10 17.078 10H14V5.172z" />
        <path d="M6 10v4a6 6 0 0 0 12 0v-4H6z" />
        <circle cx="9.5" cy="13" r="1" />
        <circle cx="14.5" cy="13" r="1" />
        <path d="M10 17h4" />
      </svg>
    ),
  },
  {
    key: 'person',
    label: 'icon_person',
    svg: (
      <svg {...strokeProps}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    key: 'clipboard',
    label: 'icon_clipboard',
    svg: (
      <svg {...strokeProps}>
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      </svg>
    ),
  },
  {
    key: 'invoice',
    label: 'icon_invoice',
    svg: (
      <svg {...strokeProps}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    key: 'compose',
    label: 'icon_compose',
    svg: (
      <svg {...strokeProps}>
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
  {
    key: 'flag',
    label: 'icon_flag',
    svg: (
      <svg {...strokeProps}>
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    ),
  },
  {
    key: 'wifi',
    label: 'icon_wifi',
    svg: (
      <svg {...strokeProps}>
        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
        <path d="M1.42 9a16 16 0 0 1 21.16 0" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
    ),
  },
  {
    key: 'database',
    label: 'icon_database',
    svg: (
      <svg {...strokeProps}>
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
  },
  {
    key: 'search',
    label: 'icon_search',
    svg: (
      <svg {...strokeProps}>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    key: 'bolt',
    label: 'icon_bolt',
    svg: (
      <svg {...strokeProps}>
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    key: 'contrast',
    label: 'icon_contrast',
    svg: (
      <svg {...strokeProps}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: 'flask',
    label: 'icon_flask',
    svg: (
      <svg {...strokeProps}>
        <path d="M9 3h6" />
        <path d="M10 3v6.5L4.5 19.5a1 1 0 0 0 .87 1.5h13.26a1 1 0 0 0 .87-1.5L14 9.5V3" />
      </svg>
    ),
  },
  {
    key: 'chat',
    label: 'icon_chat',
    svg: (
      <svg {...strokeProps}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    key: 'code',
    label: 'icon_code',
    svg: (
      <svg {...strokeProps}>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    key: 'shield',
    label: 'icon_shield',
    svg: (
      <svg {...strokeProps}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    key: 'network',
    label: 'icon_network',
    svg: (
      <svg {...strokeProps}>
        <rect x="9" y="2" width="6" height="6" />
        <rect x="16" y="16" width="6" height="6" />
        <rect x="2" y="16" width="6" height="6" />
        <path d="M5 16v-4h14v4" />
        <line x1="12" y1="12" x2="12" y2="8" />
      </svg>
    ),
  },
  {
    key: 'github',
    label: 'icon_github',
    svg: (
      <svg {...props}>
        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21.5c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z" />
      </svg>
    ),
  },
  {
    key: 'globe',
    label: 'icon_globe',
    svg: (
      <svg {...strokeProps}>
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    key: 'puzzle',
    label: 'icon_puzzle',
    svg: (
      <svg {...props}>
        <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4c-1.1 0-2 .9-2 2v3.8h1.5a2.5 2.5 0 0 1 0 5H2V20c0 1.1.9 2 2 2h3.8v-1.5a2.5 2.5 0 0 1 5 0V22H17c1.1 0 2-.9 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z" />
      </svg>
    ),
  },
];

export const ICON_MAP = new Map(AGENT_ICONS.map((i) => [i.key, i]));
