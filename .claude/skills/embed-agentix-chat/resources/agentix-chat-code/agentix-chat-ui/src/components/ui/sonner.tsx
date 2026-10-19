/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTheme } from '../../lib/theme';

const Toaster = ({ ...props }: ToasterProps) => {
  // Nexus owns its own light/dark via lib/theme.ts (data-theme attr), not next-themes.
  const [theme] = useTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          // Reference the base runtime tokens directly. The theme exposes only the
          // Tailwind-v4 `@theme inline` names (`--color-popover`/`--color-popover-foreground`),
          // which are inlined into utilities and are NOT resolvable runtime CSS variables — so
          // `var(--popover)` / `var(--popover-foreground)` resolved to empty here and left the
          // toast with no background (translucent) and no text color. `--bg-primary` /
          // `--text-primary` are the real `:root` tokens those theme names map to, and they
          // flip with dark mode.
          '--normal-bg': 'var(--bg-primary)',
          '--normal-text': 'var(--text-primary)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
