/*
 * Frontend: read a C3 stream<string> endpoint (NDJSON) with a fetch reader, smooth the render with
 * useTypewriterBuffer, and let the user interrupt via an AbortController.
 *
 * The endpoint responds with Content-Type: application/x-ndjson. Read response.body.getReader(),
 * buffering partial lines so a chunk split across reads isn't corrupted. Per the wire contract
 * (see references/streaming.md): every line is a single JSON-encoded string — a raw token delta.
 * There is NO metadata line to skip and no error object inline; run status/errors live on the
 * persisted entity, which you read back after the stream ends. The stream is complete when the
 * reader reports done — there is no separate sentinel.
 */
import { useEffect, useRef } from 'react';
import { useTypewriterBuffer } from './useTypewriterBuffer';

/** Parse one NDJSON line into the delta text your UI appends: one JSON.parse yields the raw string. */
function parseDelta(line: string): string {
  const obj = JSON.parse(line);
  return typeof obj === 'string' ? obj : (obj.delta ?? '');
}

export function useStreamedAnswer(url: string) {
  const buf = useTypewriterBuffer(); // pass { drainMs, maxBacklog } to tune — see references/streaming.md
  const abortRef = useRef<AbortController | null>(null);

  async function run(body: string) {
    const controller = new AbortController();
    abortRef.current = controller;
    buf.reset(); // clear before a new run
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/x-ndjson', 'Content-Type': 'application/json' },
        body,
        signal: controller.signal, // wire the abort signal into fetch
      });
      if (!res.ok || !res.body) throw new Error(`Stream request failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read(); // rejects with AbortError on cancel
        if (done) break; // done => stream complete
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // keep the incomplete trailing line
        for (const line of lines) {
          if (line.trim()) buf.push(parseDelta(line));
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') throw err; // ignore user-initiated cancels
    } finally {
      buf.flush(); // reveal whatever arrived before completion/stop
      abortRef.current = null;
    }
  }

  /** Stop button handler: abort the in-flight stream. */
  function cancel() {
    abortRef.current?.abort();
  }

  // Always abort on unmount so a background stream can't keep writing to a torn-down component.
  useEffect(() => () => abortRef.current?.abort(), []);

  return { displayed: buf.displayed, run, cancel };
}
