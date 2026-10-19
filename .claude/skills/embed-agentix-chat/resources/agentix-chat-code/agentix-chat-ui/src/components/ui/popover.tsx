/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { Popover as PopoverPrimitive } from 'radix-ui';
import * as React from 'react';

import { lastInputWasKeyboard } from '../../lib/inputModality';
import { cn } from '../../lib/utils';

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  onCloseAutoFocus,
  animateZoom = true,
  container,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  /** Set false to drop the open/close zoom (scale) animation while keeping the fade + slide —
   *  softens the mount transition for content whose size can change between opens (e.g. a list
   *  that goes from a skeleton to real rows) without touching every other popover's default
   *  animation. Defaults to true, which reproduces today's exact className string. */
  animateZoom?: boolean;
  /** Optional portal host. Use a modal's content element when the popover must remain inside
   *  that modal's pointer/scroll-lock boundary. Defaults to document.body. */
  container?: React.ComponentProps<typeof PopoverPrimitive.Portal>['container'];
}) {
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        // Pointer close: skip restoring focus to the trigger so no focus-visible ring lingers
        // after a mouse click. Keyboard close still restores focus for accessibility.
        onCloseAutoFocus={(e) => {
          if (!lastInputWasKeyboard()) e.preventDefault();
          onCloseAutoFocus?.(e);
        }}
        // Zoom tokens are spliced in/out at their ORIGINAL positions (not appended) so the
        // animateZoom=true string is byte-for-byte identical to the pre-existing className —
        // clsx only joins truthy fragments, so animateZoom=false cleanly drops both zoom tokens
        // (and their surrounding whitespace) while every fade/slide/other token is unaffected.
        className={cn(
          'z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          animateZoom && 'data-[state=closed]:zoom-out-95',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0',
          animateZoom && 'data-[state=open]:zoom-in-95',
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="popover-header" className={cn('flex flex-col gap-1 text-sm', className)} {...props} />;
}

function PopoverTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return <div data-slot="popover-title" className={cn('font-medium', className)} {...props} />;
}

function PopoverDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="popover-description" className={cn('text-muted-foreground', className)} {...props} />;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor, PopoverHeader, PopoverTitle, PopoverDescription };
