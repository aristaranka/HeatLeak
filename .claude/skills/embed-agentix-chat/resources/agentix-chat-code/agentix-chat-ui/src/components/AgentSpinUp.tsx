/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useEffect, useRef, useState } from 'react';
import { DEFAULT_LONG_WAIT_THRESHOLD_MS } from '../lib/llmBlockReason';
import { cn } from '../lib/utils';
import { CheckIcon } from './AgentIcons';

export { DEFAULT_LONG_WAIT_THRESHOLD_MS };

const DEFAULT_STEP_INTERVAL_MS = 5000;

/* Motion tunables for the stepped variant. Kept as named constants so the feel can be
   adjusted in one place: the active node's fill pulse and the gauge hand's wiggle. */
const DOT_PULSE_MS = 900; // active-circle fill: 0 → full radius, then snap back (sawtooth)
const HAND_WIGGLE_DEG = 3; // gauge hand oscillation amplitude around the target angle
const HAND_WIGGLE_MS = 180; // gauge hand wiggle period
const CONNECTOR_FILL_MS = 250; // blue connector fill sweep from one circle to the next

/* Orbit keyframes for the spinner variant. AgentSpinUp no longer ships a stylesheet, and
   keyframes can't be expressed as Tailwind utilities, so we inject them inline alongside
   the spinner (only when the spinner variant renders). */
const ORBIT_KEYFRAMES = `@keyframes agent-spin-up-orbit {
  0% { transform: rotate(0deg) translateX(34px) scale(0.85); opacity: 0.35; }
  50% { transform: rotate(180deg) translateX(34px) scale(1.1); opacity: 1; }
  100% { transform: rotate(360deg) translateX(34px) scale(0.85); opacity: 0.35; }
}`;

/* Keyframes for the stepped variant (injected only when the stepper renders):
   - dot-pulse: the active circle's blue fill grows linearly 0 → full radius, holds briefly, then
     the loop restart snaps it back to 0 (a sawtooth "blink", never easing back down through 99%).
   - hand-wiggle: the gauge hand oscillates ±HAND_WIGGLE_DEG around whatever target angle the
     enclosing group is rotated to, so the needle looks alive while it holds a reading.
   prefers-reduced-motion pins the fill on and stills the needle. */
const STEPPER_KEYFRAMES = `@keyframes agent-spin-up-dot-pulse {
  0% { transform: scale(0); }
  88% { transform: scale(1); }
  100% { transform: scale(1); }
}
@keyframes agent-spin-up-hand-wiggle {
  0% { transform: rotate(-${HAND_WIGGLE_DEG}deg); }
  50% { transform: rotate(${HAND_WIGGLE_DEG}deg); }
  100% { transform: rotate(-${HAND_WIGGLE_DEG}deg); }
}
.agent-spin-up__step:not(:last-child)::before,
.agent-spin-up__step:not(:last-child)::after {
  content: ''; position: absolute; left: 50%; top: 12px; height: 2px; width: 100%;
}
.agent-spin-up__step:not(:last-child)::before { background: var(--border); }
.agent-spin-up__step:not(:last-child)::after {
  background: var(--accent); transform: scaleX(0); transform-origin: left;
  transition: transform ${CONNECTOR_FILL_MS}ms ease-out;
}
.agent-spin-up__step.is-done:not(:last-child)::after { transform: scaleX(1); }
@media (prefers-reduced-motion: reduce) {
  .agent-spin-up__dot { animation: none !important; transform: scale(1) !important; }
  .agent-spin-up__hand-wiggle { animation: none !important; }
  .agent-spin-up__hand-target { transition: none !important; }
  .agent-spin-up__step:not(:last-child)::after { transition: none !important; }
}`;

/**
 * How long a provision must run before the subtitle swaps to the longer-wait reassurance copy.
 * Set at the ~p90–95 of cold-start latency so the "taking a while" message stays rare — surfacing
 * it too early trains users to read every provision as slow. Shared with chat LLM-starting copy
 * via `lib/llmBlockReason`.
 */

export type AgentSpinUpProps = {
  title: string;
  subtitle?: React.ReactNode;
  overlay?: boolean;
  /** 'error' hides the spinner orbits and switches role to alert — use with `actions`. */
  variant?: 'spinner' | 'error';
  /** Action buttons rendered below the text (e.g. Retry / Go to Agents) for the error variant. */
  actions?: React.ReactNode;
  /** Extra content rendered below the actions (e.g. the collapsible startup-status disclosure). */
  footer?: React.ReactNode;
  /**
   * When provided (and not the error variant), renders a deterministic multi-step provisioning
   * stepper with an animated gauge in place of the orbit spinner. The active node advances one step
   * every `stepIntervalMs`, clamped at the final node — purely time-driven, not backend state.
   */
  steps?: string[];
  stepIntervalMs?: number;
  /**
   * Wall-clock start (ms epoch) the step progression is measured from. Anchor it in the parent
   * (e.g. a ref) so progress survives the brief overlay swaps that happen during provisioning —
   * otherwise each remount would restart at step 0. Falls back to this component's mount time.
   */
  stepStartTime?: number;
  /**
   * Reassurance copy that replaces `subtitle` once the wait crosses `longWaitThresholdMs`. Pass the
   * resume- vs start-specific message from the parent. No-op for the error variant or when unset.
   * Measured from `stepStartTime` (falling back to mount) so it tracks the same clock as the stepper.
   */
  longWaitSubtitle?: string;
  longWaitThresholdMs?: number;
};

/**
 * True once `thresholdMs` has elapsed since `startTime` (falling back to mount). Polls on a 1s tick
 * while `enabled`; resets when disabled so a fast re-provision doesn't inherit a stale long-wait flag.
 */
const useLongWaitReached = (enabled: boolean, startTime: number | undefined, thresholdMs: number): boolean => {
  const fallbackStart = useRef(Date.now());
  const start = startTime ?? fallbackStart.current;
  const [reached, setReached] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setReached(false);
      return undefined;
    }
    const check = () => setReached(Date.now() - start >= thresholdMs);
    check();
    const id = window.setInterval(check, 1000);
    return () => window.clearInterval(id);
  }, [enabled, start, thresholdMs]);
  return reached;
};

/**
 * The current active step index for the time-driven stepper: `floor(elapsed / interval)` clamped
 * to the final node. Ticks on a 1s poll and is shared by both the stepper nodes and the gauge so
 * the needle and the circles advance off one clock (no drift between two intervals).
 */
const useSteppedActive = (count: number, intervalMs: number, startTime: number | undefined): number => {
  const fallbackStart = useRef(Date.now());
  const start = startTime ?? fallbackStart.current;
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (count <= 0) return 0;
  const elapsed = Math.max(0, Date.now() - start);
  return Math.min(count - 1, Math.floor(elapsed / intervalMs));
};

/**
 * Speedometer glyph whose needle swings to the reached step's fraction — for N steps the active
 * node maps to (active+1)/N of the dial, so a 4-step provision reads 25 / 50 / 75 / 100%. The needle
 * eases to each new target (spring-ish curve) and continuously wiggles ±HAND_WIGGLE_DEG around it.
 * The nested groups compose: the outer holds the target angle, the inner runs the wiggle — both
 * pivot at the dial center (12,18) so the needle's free end is what oscillates.
 */
const AnimatedGauge: React.FC<{ active: number; total: number }> = ({ active, total }) => {
  const fraction = total > 0 ? (active + 1) / total : 1;
  const angle = -90 + fraction * 180; // -90° = far left, 0° = straight up, +90° = far right
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 18a8 8 0 1 1 16 0" />
      <g
        className="agent-spin-up__hand-target"
        style={{
          transform: `rotate(${angle}deg)`,
          transformBox: 'view-box',
          transformOrigin: '12px 18px',
          transition: 'transform 0.55s cubic-bezier(0.34, 1.4, 0.64, 1)',
        }}
      >
        <g
          className="agent-spin-up__hand-wiggle"
          style={{
            transformBox: 'view-box',
            transformOrigin: '12px 18px',
            animation: `agent-spin-up-hand-wiggle ${HAND_WIGGLE_MS}ms ease-in-out infinite`,
          }}
        >
          {/* Arc radius is 8 (center 12,18); keep the needle shorter than that so the tip — plus its
              round cap — stays inside the dial at every rotation. */}
          <line x1="12" y1="18" x2="12" y2="11.5" strokeWidth="1.6" />
        </g>
      </g>
      <circle cx="12" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
};

const ProvisioningStepper: React.FC<{ steps: string[]; active: number }> = ({ steps, active }) => (
  <ol className="mt-2.5 flex w-full list-none items-start px-2">
    {steps.map((label, i) => {
      const state = i < active ? 'done' : i === active ? 'active' : 'pending';
      const done = state === 'done';
      return (
        <li
          key={label}
          // Connector track (grey) + blue fill that sweeps in left→right as the step completes are
          // in the injected STEPPER_KEYFRAMES CSS (a transform transition on a pseudo-element, which
          // Tailwind's scale utilities don't reliably drive) — keyed off the `is-done` class here.
          className={cn(
            'agent-spin-up__step relative flex min-w-0 flex-1 flex-col items-center gap-2.5',
            done && 'is-done'
          )}
        >
          <span
            className={cn(
              'relative z-[1] flex size-[26px] items-center justify-center overflow-hidden rounded-full border text-primary-foreground',
              done && 'border-primary bg-primary',
              state === 'active' && 'border-primary bg-background',
              state === 'pending' && 'border-border bg-background'
            )}
            aria-hidden="true"
          >
            {state === 'done' && <CheckIcon />}
            {state === 'active' && (
              // blue fill that grows from radius 0 to the full circle, then snaps back (sawtooth pulse)
              <span
                className="agent-spin-up__dot absolute inset-px rounded-full bg-primary"
                style={{ animation: `agent-spin-up-dot-pulse ${DOT_PULSE_MS}ms linear infinite` }}
              />
            )}
          </span>
          <span
            className={cn(
              'max-w-[130px] text-center text-[13px] leading-snug',
              state === 'pending' ? 'text-muted-foreground' : 'text-foreground',
              state === 'active' && 'italic'
            )}
          >
            {label}
          </span>
        </li>
      );
    })}
  </ol>
);

const AgentSpinUp: React.FC<AgentSpinUpProps> = ({
  title,
  subtitle,
  overlay,
  variant = 'spinner',
  actions,
  footer,
  steps,
  stepIntervalMs = DEFAULT_STEP_INTERVAL_MS,
  stepStartTime,
  longWaitSubtitle,
  longWaitThresholdMs = DEFAULT_LONG_WAIT_THRESHOLD_MS,
}) => {
  const isError = variant === 'error';
  const isStepped = !isError && !!steps && steps.length > 0;
  const stepCount = steps?.length ?? 0;
  // One shared clock for the gauge and the stepper. Called unconditionally (hooks rule); a no-op
  // count for the non-stepped variants just parks it at 0.
  const active = useSteppedActive(stepCount, stepIntervalMs, stepStartTime);
  const longWaitReached = useLongWaitReached(!isError && !!longWaitSubtitle, stepStartTime, longWaitThresholdMs);
  const effectiveSubtitle = longWaitReached && longWaitSubtitle ? longWaitSubtitle : subtitle;
  const body = (
    <div
      className={cn(
        'agent-spin-up flex flex-col items-center justify-center gap-[18px] text-center',
        isError && 'agent-spin-up--error',
        isStepped && 'agent-spin-up--stepped w-[min(820px,78%)] gap-5'
      )}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      {!isError && !isStepped && <style>{ORBIT_KEYFRAMES}</style>}
      {isStepped && <style>{STEPPER_KEYFRAMES}</style>}
      {isStepped ? (
        <span
          className="agent-spin-up__glyph flex size-[72px] items-center justify-center rounded-md border bg-muted text-primary [&_svg]:size-[34px]"
          aria-hidden="true"
        >
          <AnimatedGauge active={active} total={stepCount} />
        </span>
      ) : (
        !isError && (
          <div className="agent-spin-up__orbits relative flex size-24 items-center justify-center" aria-hidden="true">
            <span className="agent-spin-up__orb absolute size-[22px] rounded-full bg-primary opacity-85 [animation:agent-spin-up-orbit_1.6s_cubic-bezier(0.55,0.06,0.45,0.94)_infinite]" />
            <span className="agent-spin-up__orb agent-spin-up__orb--two absolute size-[22px] rounded-full bg-primary/70 opacity-85 [animation:agent-spin-up-orbit_1.6s_cubic-bezier(0.55,0.06,0.45,0.94)_infinite] [animation-delay:-0.53s]" />
            <span className="agent-spin-up__orb agent-spin-up__orb--three absolute size-[22px] rounded-full bg-primary opacity-60 [animation:agent-spin-up-orbit_1.6s_cubic-bezier(0.55,0.06,0.45,0.94)_infinite] [animation-delay:-1.06s]" />
          </div>
        )
      )}
      <h2
        className={cn(
          'agent-spin-up__title font-semibold tracking-tight text-foreground',
          isStepped ? 'text-[26px]' : 'text-[22px]'
        )}
      >
        {title}
      </h2>
      {effectiveSubtitle && (
        <p
          className={cn(
            'agent-spin-up__subtitle font-mono text-muted-foreground',
            isStepped ? 'text-[15px]' : 'text-sm'
          )}
        >
          {effectiveSubtitle}
        </p>
      )}
      {isStepped && <ProvisioningStepper steps={steps as string[]} active={active} />}
      {actions && (
        <div className={cn('agent-spin-up__actions flex gap-3', isStepped ? 'mt-2.5' : 'mt-5')}>{actions}</div>
      )}
      {footer && <div className="agent-spin-up__footer mt-4 flex w-full justify-center">{footer}</div>}
    </div>
  );
  if (!overlay) return body;
  return (
    <div className="agent-spin-up__overlay absolute inset-0 z-50 flex items-center justify-center bg-background">
      {body}
    </div>
  );
};

export default AgentSpinUp;
