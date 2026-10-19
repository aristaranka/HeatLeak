/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// Out-of-tab "a chat needs you" notification for sessions awaiting user input.
// Two layers, both driven off the sidebar's existing session poll + the
// server-authoritative `awaitingInput` flag — no new data path:
//
//   Layer 1 (tab badge)      — always on, no permission. Title "(N) …" + favicon
//                              dot for every chat awaiting input, including the one you
//                              are actively viewing, so the dot shows on the active tab
//                              too (part of the reported bug).
//   Layer 2 (notification)    — fires once when ANY chat *transitions* into
//                              awaiting-input, so the nudge is visible on the ACTIVE
//                              tab too (the reported bug: it only showed after you
//                              switched away). Delivered as an in-app toast when this
//                              tab is visible (an OS notification would be buried
//                              behind a focused tab), and as a permission-gated OS
//                              Notification when the tab is hidden.
//
// Mute — independent of browser permission, persisted per-browser (see
// lib/chatNotificationsMuted). Permission only controls whether Layer 2 CAN reach the
// user via the OS when the tab is hidden; it has no "off" the page can set once granted
// (the Notifications API is one-directional from script). Mute is the actual off switch
// the sidebar bell exposes, and it silences BOTH layers — including the tab badge — so a
// muted user sees nothing, not just fewer toasts.
//
// A session's nudge (badge + notification) can be dismissed WITHOUT answering: the
// user starting to type a reply, or clicking the pill's ×, records a local dismissal
// in lib/awaitingDismissed. The server `awaitingInput` flag stays true until they
// actually submit, so we treat "effective awaiting" = awaitingInput && !dismissed
// here and in the sidebar pill, and drop the dismissal once the server flag clears.
//
// Edge-triggered toast, level-triggered badge: the toast fires on the awaiting
// transition only (never re-nags for a session that merely stays awaiting or when
// you switch tabs); the badge always reflects the current awaiting count.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  clearAwaitingDismissed,
  getAwaitingDismissedSnapshot,
  isAwaitingDismissed,
  subscribeAwaitingDismissed,
} from '../lib/awaitingDismissed';
import {
  getChatNotificationsMutedSnapshot,
  setChatNotificationsMuted,
  subscribeChatNotificationsMuted,
} from '../lib/chatNotificationsMuted';
import { applyTabBadge, clearTabBadge } from '../lib/tabBadge';
import type { Session } from '../lib/types';

export interface UseSessionAwaitingNotificationsArgs {
  sessions: Session[];
  /** Open a session (the parent navigates); invoked when a notification is clicked. */
  onOpenSession?: (sessionId: string) => void;
}

export interface UseSessionAwaitingNotificationsReturn {
  /** Browser exposes the Notifications API (Layer 2 available). Layer 1 runs regardless. */
  isSupported: boolean;
  /** Current permission: 'default' (can ask), 'granted', or 'denied'. */
  permission: NotificationPermission;
  /** Ask for notification permission. Call from a user gesture (button click). No-op
   *  when unsupported or already decided. Fires a confirmation toast on a fresh grant. */
  requestPermission: () => void;
  /** Whether the "chat needs input" nudge (both layers) is currently muted. */
  muted: boolean;
  /** Flip the mute preference. Independent of `permission` — see module comment. */
  toggleMuted: () => void;
}

function notificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function isVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

// Post a browser notification. Best-effort: a failure here must never break the caller.
function postNotification(title: string, body: string, tag: string, onClick?: () => void): void {
  try {
    const n = new Notification(title, { body, tag });
    if (onClick) {
      n.onclick = () => {
        try {
          window.focus();
        } catch {
          /* focus may be blocked — still run the handler */
        }
        onClick();
        n.close();
      };
    }
  } catch {
    /* best-effort — never throw into the caller */
  }
}

export function useSessionAwaitingNotifications({
  sessions,
  onOpenSession,
}: UseSessionAwaitingNotificationsArgs): UseSessionAwaitingNotificationsReturn {
  const { t } = useTranslation('chat');
  const isSupported = notificationSupported();

  const [permission, setPermission] = useState<NotificationPermission>(() =>
    isSupported ? Notification.permission : 'denied'
  );

  const muted = useSyncExternalStore(subscribeChatNotificationsMuted, getChatNotificationsMutedSnapshot);
  const toggleMuted = useCallback(() => {
    setChatNotificationsMuted(!getChatNotificationsMutedSnapshot());
  }, []);

  // Track document visibility as state so the badge/suppression recompute when the
  // user leaves or returns to the tab, not only when the session list changes.
  const [visible, setVisible] = useState<boolean>(isVisible);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onChange = () => setVisible(isVisible());
    document.addEventListener('visibilitychange', onChange);
    window.addEventListener('focus', onChange);
    window.addEventListener('blur', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('focus', onChange);
      window.removeEventListener('blur', onChange);
    };
  }, []);

  const requestPermission = useCallback(() => {
    if (!isSupported || Notification.permission !== 'default') return;
    // On a fresh grant, confirm with a sample toast so the user sees it working.
    const onResult = (result: NotificationPermission) => {
      setPermission(result);
      if (result === 'granted') {
        postNotification(t('notifications.testTitle'), t('notifications.testBody'), 'nexus-awaiting-test');
      }
    };
    try {
      // Modern promise form; wrap so an older callback-only browser can't throw.
      void Notification.requestPermission().then(onResult);
    } catch {
      try {
        Notification.requestPermission(onResult);
      } catch {
        /* give up silently — Layer 1 still works */
      }
    }
  }, [isSupported, t]);

  // Awaiting ids seen on the previous poll, so we can edge-detect new transitions.
  // Seeded on first run (existing awaiting sessions at mount must NOT all toast).
  const prevAwaitingRef = useRef<Set<string> | null>(null);
  // Keep the click handler's navigate callback current without re-arming the effect.
  const onOpenRef = useRef(onOpenSession);
  onOpenRef.current = onOpenSession;

  // Sessions this browser has locally dismissed (started typing / clicked the pill ×).
  // Suppresses the badge + notification for a still-server-awaiting chat the user has
  // already engaged with — the server flag only clears on submit.
  const dismissed = useSyncExternalStore(subscribeAwaitingDismissed, getAwaitingDismissedSnapshot);

  useEffect(() => {
    // Prune a dismissal only when its chat is present in the list with the server flag
    // cleared (answer submitted / turn started) so a genuinely NEW awaiting-input transition
    // nudges again. Do NOT prune when the chat is merely absent from the list: the sidebar
    // empties `sessions` transiently on an agent-service switch, and treating that gap as
    // "flag cleared" would wipe every dismissal and re-nag the same chats on switch-back.
    const presentIds = new Set<string>();
    const serverAwaiting = new Set<string>();
    for (const s of sessions) {
      presentIds.add(s.id);
      if (s.awaitingInput) serverAwaiting.add(s.id);
    }
    for (const id of Object.keys(dismissed)) {
      if (presentIds.has(id) && !serverAwaiting.has(id)) clearAwaitingDismissed(id);
    }

    // "Effective" awaiting = server flag set AND not locally dismissed. `prevAwaitingRef`
    // always tracks the true set (see below) so unmuting later doesn't flood-notify for
    // everything that changed while muted; muting itself is applied once, below, as the
    // single choke point both layers read from.
    const awaitingIds = new Set<string>();
    const awaitingById = new Map<string, Session>();
    for (const s of sessions) {
      if (s.awaitingInput && !isAwaitingDismissed(dismissed, s.id)) {
        awaitingIds.add(s.id);
        awaitingById.set(s.id, s);
      }
    }
    const effectiveAwaitingIds = muted ? new Set<string>() : awaitingIds;

    // Layer 1 — tab-title badge + favicon dot for EVERY awaiting chat, including the one
    // you're actively viewing, so the dot shows on the active tab too (the reported bug).
    applyTabBadge(effectiveAwaitingIds.size);

    // Layer 2 — notify on new awaiting transitions (skip the seeding pass). Fires for the
    // active chat too so the nudge is visible on the focused tab, not only after switching.
    const prev = prevAwaitingRef.current;
    if (prev != null) {
      // Typing already dismisses the chat's awaiting state. Remove its existing nudge too,
      // so a toast over the composer cannot keep intercepting Send after the user responds.
      for (const id of prev) {
        if (!effectiveAwaitingIds.has(id)) toast.dismiss(`nexus-awaiting-${id}`);
      }
      for (const id of effectiveAwaitingIds) {
        if (prev.has(id)) continue; // already awaiting last poll — no new edge
        const session = awaitingById.get(id);
        if (session) fireNotification(session);
      }
    }
    prevAwaitingRef.current = awaitingIds;

    function fireNotification(session: Session) {
      const label = (session.title && session.title.trim()) || t('sidebar.newChatLabel');
      const title = t('notifications.needsInputTitle');
      const body = t('notifications.needsInputBody', { title: label });
      const open = () => onOpenRef.current?.(session.id);
      if (visible) {
        // Active tab: an OS notification is buried behind the focused window, so show
        // an in-app toast instead. Per-session id dedupes/replaces across re-fires and
        // gives the user a built-in dismiss control (issue: "nice to dismiss"). No position
        // override — it inherits the app-wide Toaster placement (bottom-right). An explicit
        // opaque background (the popover token, not the app Toaster's) keeps this nudge
        // readable when it lands over the composer/other UI, without touching other toasts.
        toast(title, {
          id: `nexus-awaiting-${session.id}`,
          description: body,
          style: { background: 'var(--color-popover)', color: 'var(--color-popover-foreground)' },
          action: onOpenRef.current ? { label: t('notifications.openAction'), onClick: open } : undefined,
        });
      } else if (isSupported && permission === 'granted') {
        // Hidden tab: a real OS notification is what actually reaches the user. Per-session
        // tag: a re-fire replaces the prior toast, and the browser dedupes across tabs.
        postNotification(title, body, `nexus-awaiting-${session.id}`, open);
      }
    }
  }, [sessions, visible, isSupported, permission, dismissed, muted, t]);

  // Drop the badge when the chat UI unmounts so a stale "(N)" title can't linger.
  useEffect(() => () => clearTabBadge(), []);

  return { isSupported, permission, requestPermission, muted, toggleMuted };
}
