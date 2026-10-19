/*
 * stream-latency-probe.js — diagnose WHERE a "chunky" LLM stream stalls.
 *
 * Run in the app's browser context (e.g. via a Playwright browser_evaluate, or paste into the
 * devtools console on the running app page). It hits a stream<string> NDJSON endpoint and reports
 * the inter-arrival gaps between rendered lines, so you can tell whether the burstiness is inherent
 * to token arrival (upstream provider SSE framing — a client-side smoothing buffer is the fix) or an
 * artifact of how your UI batches renders.
 *
 * Interpreting the result:
 *   - gapStats.p90 in the hundreds of ms with a handful of gaps > 150ms, while median ~1ms
 *       => tokens arrive in bursts then stall. This is upstream. A SERVER-SIDE QUEUE WON'T HELP
 *          (the queue is empty during the stall). Use the client-side useTypewriterBuffer.
 *   - linesPerRead.avg >> 1
 *       => the network layer is coalescing many lines per read(); make sure you render per PARSED
 *          LINE, not per read().
 *
 * Adjust ENDPOINT/BODY for your type & method. BODY is the c3Action argument envelope your endpoint
 * expects (for a member fn: [{ id }, ...args]).
 */
async function probeStream({
  endpoint = `${location.origin}/api/8/MyType/myStreamMethod`,
  body = JSON.stringify([{ id: 'someId' }, /* ...args */]),
} = {}) {
  const t0 = performance.now();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Accept: 'application/x-ndjson', 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok || !res.body) {
    return { ok: false, status: res.status, body: await res.text().catch(() => '') };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let lastLine = performance.now();
  let ttfl = null; // time to first content line
  let chars = 0;
  const lineGaps = [];
  const linesPerRead = [];

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    let count = 0;
    for (const line of lines) {
      const tr = line.trim();
      if (!tr) continue;
      count++;
      let obj;
      try { obj = JSON.parse(tr); if (typeof obj === 'string') obj = JSON.parse(obj); } catch { continue; }
      const delta = typeof obj === 'string' ? obj : (obj.delta ?? '');
      if (!delta) continue; // skip metadata / control lines
      const now = performance.now();
      if (ttfl === null) ttfl = +(now - t0).toFixed(1);
      lineGaps.push(+(now - lastLine).toFixed(1));
      lastLine = now;
      chars += delta.length;
    }
    if (count) linesPerRead.push(count);
  }

  const stats = (a) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    return {
      n: a.length,
      min: s[0],
      median: s[(s.length / 2) | 0],
      p90: s[Math.min(s.length - 1, (s.length * 0.9) | 0)],
      max: s[s.length - 1],
      over150ms: a.filter((g) => g > 150).length,
    };
  };

  return {
    ok: true,
    totalMs: +(performance.now() - t0).toFixed(1),
    ttflMs: ttfl,
    contentChars: chars,
    gapStats: stats(lineGaps),
    linesPerRead: {
      reads: linesPerRead.length,
      avg: +(linesPerRead.reduce((p, c) => p + c, 0) / Math.max(1, linesPerRead.length)).toFixed(2),
      max: Math.max(0, ...linesPerRead),
    },
  };
}

// Usage: await probeStream({ endpoint, body });
if (typeof module !== 'undefined') module.exports = { probeStream };
