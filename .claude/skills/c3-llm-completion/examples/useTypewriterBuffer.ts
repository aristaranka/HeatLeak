/*
 * useTypewriterBuffer — a reusable client-side smoothing buffer for streamed text.
 *
 * Streamed LLM tokens arrive in bursts (several within ~1ms, then a stall of a few hundred ms while
 * the provider batches the next SSE frame). Appending each delta straight to React state makes that
 * burstiness visible as a stutter ("chunky" streaming). This hook decouples *arrival* from
 * *display*: callers push() raw deltas into a pending buffer, and a requestAnimationFrame loop
 * reveals characters at a backlog-adaptive rate, so stalls are hidden behind a steady drip.
 *
 * Tuning (pass as options): if it still feels chunky, INCREASE drainMs (bigger/slower buffer). If it
 * lags too far behind, DECREASE drainMs and/or lower maxBacklog. Raise maxBacklog to drip large
 * bursts instead of snapping them. See references/streaming.md for the full tuning table.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface TypewriterOptions {
  /** Target time (ms) to fully drain the current backlog. Larger => smoother but laggier. */
  drainMs?: number;
  /** Minimum characters revealed per animation frame while there is a backlog. */
  minCharsPerFrame?: number;
  /**
   * Backlog (chars) above which smoothing is abandoned and everything is revealed at once.
   * Set this comfortably ABOVE your longest expected answer — a full LLM analysis is easily
   * 2–5k chars, so a low value snaps the whole response in instead of dripping it (the classic
   * "it appeared all at once" bug). Default 8000.
   */
  maxBacklog?: number;
}

export interface TypewriterBuffer {
  /** The smoothed, progressively-revealed text to render. */
  displayed: string;
  /** Append newly-arrived text (e.g. an LLM delta) to the pending buffer. */
  push: (text: string) => void;
  /** Immediately reveal all pending text (call when the stream completes or on cancel). */
  flush: () => void;
  /** Clear both the visible text and the pending buffer (call before a new run). */
  reset: () => void;
}

// maxBacklog defaults high (8000) on purpose: below the char length of a typical answer it would
// snap the whole response in at once. Only lower it if you *want* long answers to catch up fast.
const DEFAULTS: Required<TypewriterOptions> = { drainMs: 220, minCharsPerFrame: 1, maxBacklog: 8000 };

export function useTypewriterBuffer(options?: TypewriterOptions): TypewriterBuffer {
  const cfgRef = useRef({ ...DEFAULTS, ...options });
  cfgRef.current = { ...DEFAULTS, ...options };

  const [displayed, setDisplayed] = useState('');
  const targetRef = useRef('');       // everything that has arrived
  const shownRef = useRef(0);          // how many chars are currently visible
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);

  const stop = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  const tick = useCallback((now: number) => {
    const { drainMs, minCharsPerFrame, maxBacklog } = cfgRef.current;
    const backlog = targetRef.current.length - shownRef.current;
    if (backlog <= 0) { rafRef.current = null; return; }          // caught up — pause
    const dt = lastFrameRef.current ? now - lastFrameRef.current : 16;
    lastFrameRef.current = now;
    const advance = backlog > maxBacklog
      ? backlog                                                    // too far behind — snap
      : Math.max(minCharsPerFrame, Math.ceil((backlog / drainMs) * dt));
    shownRef.current = Math.min(targetRef.current.length, shownRef.current + advance);
    setDisplayed(targetRef.current.slice(0, shownRef.current));
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const ensureLoop = useCallback(() => {
    if (rafRef.current === null) { lastFrameRef.current = 0; rafRef.current = requestAnimationFrame(tick); }
  }, [tick]);

  const push = useCallback((t: string) => { if (t) { targetRef.current += t; ensureLoop(); } }, [ensureLoop]);
  const flush = useCallback(() => { stop(); shownRef.current = targetRef.current.length; setDisplayed(targetRef.current); }, [stop]);
  const reset = useCallback(() => { stop(); targetRef.current = ''; shownRef.current = 0; lastFrameRef.current = 0; setDisplayed(''); }, [stop]);

  useEffect(() => stop, [stop]);       // cancel the rAF loop on unmount
  return { displayed, push, flush, reset };
}

export default useTypewriterBuffer;
