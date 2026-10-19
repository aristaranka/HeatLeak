# Streaming an LLM response to a UI (progressive token-by-token UX)

A plain `completion(...)` returns the whole answer at once. To stream tokens to a UI as they are
generated, use a C3 **`stream<string>`** endpoint backed by a Python generator. It works over the
normal `c3Action` transport (no websocket/SSE, no chat-feed viewMode) and streams as
newline-delimited JSON (NDJSON).

## The wire contract (read this first — it's the #1 source of streaming bugs)

The C3 `stream<string>` transport **JSON-encodes each string your generator yields and appends the
`\n` NDJSON framing itself.** Your generator therefore yields **RAW, already-decoded text** —
`yield delta` — and the transport does the encoding exactly once. On the wire each line is a
JSON-encoded string; the client reads it back with a single `JSON.parse(line)` and gets back a value
whose `typeof === 'string'`.

Two mistakes break this, and both have actually shipped:

- **Do NOT `json.dumps(...)` what you yield.** That double-encodes: the transport encodes your
  already-encoded string again, so literal quotes and escapes (`"## Executive Summary"`) leak into
  the UI. Yield the plain text; let the transport encode.
- **Do NOT yield a metadata/error *object* (dict) inline in the stream.** A `stream<string>` can only
  carry strings — an object gets stringified and arrives at the client as a meaningless string that
  collides with your first real token. Run **status and error detail belong on the persisted
  entity**, not in the stream: write them in the generator's `finally` (status `Running` →
  `Completed`/`Error`, plus `errorMessage`) and have the client read them back from the entity after
  the stream ends. Do not try to open the stream with a metadata line either.

> **Mnemonic:** the generator yields plain text; the transport handles JSON encoding + newline
> framing; the client does exactly one `JSON.parse` per line. Anything you add on top of that
> (a `json.dumps`, a leading metadata object) is a bug.

## The runtime decision — CHECK, don't assume

`GenaiCore.Llm.<Provider>.Model.completion(options={"stream": true})` yields real provider chunks
**only in the model's native runtime** (e.g. `py-vertexai_litellm_312` for a VertexAi model, whose
`Action.Requirement` is `py-vertexai_litellm_312-server-py4j`). Called from any other runtime the
platform falls back to a single blocking response, so there is nothing to stream.

**Decide by checking whether that native runtime is installed — do not assume it is missing.** In
many deployments it already is:

```python
rt = c3.Py.Runtime.forName("py.3.12-vertexai_litellm_312-server-py4j")
installed = c3.Py.libraryManager().isInstalled(rt)   # True in many deployments already
```

| If the native runtime is… | Do this |
| --- | --- |
| **installed** (or you can install it — see the runtime skill) | **Pin your method to it** and call `completion(options={"stream": True})`, yielding each real delta. Pin by appending the `Action.Requirement` as the method suffix in the `.c3typ`: `streamAnalysis: member function(): stream<string> py-vertexai_litellm_312-server-py4j`. This is the genuine token-by-token path. |
| **not available** and can't be installed | Use the **portable stdlib path**: produce tokens with a stdlib generator (stream the provider's HTTP API yourself with `http.client`) and wrap it in `c3.Stream.make`. Needs only stdlib + `genaiPlatform`, so it runs in a stock runtime. |

**Don't eyeball this — run the check.** `scripts/check-streaming-runtime.js` does the whole decision
for you: it lists installed streaming-capable runtimes, confirms your completion client resolves, and
returns a `verdict` plus the exact `Action.Requirement` string to pin to. Run it via C3AI-AppMCP
`runJsCode` (or paste into the Console) **before** you write the endpoint:

```javascript
checkStreamingRuntime("claude_4.5_sonnet")
// => { verdict: "NATIVE_STREAMING_READY",
//      pinRuntime: "py-vertexai_litellm_312-server-py4j",
//      installedStreamingRuntimes: [...], notes: [...] }
```

| `verdict` | What to do |
| --- | --- |
| `NATIVE_STREAMING_READY` | Pin your method to `pinRuntime` and use `completion(options={"stream": True})`. |
| `NATIVE_RUNTIME_NOT_INSTALLED` | Install `pinRuntime` (see the **c3-runtime** skill), then re-run the check — or take the portable stdlib path. |
| `NO_STREAMING_RUNTIME_FOUND` | Take the portable stdlib path, or ask an admin which runtime backs your model. |

> ⛔ **Anti-pattern — the fake stream.** Do NOT make one blocking
> `completion(options={"returnJson": True})` call and then chop the finished string into pieces
> (`_chunk_text`, `textwrap`, a loop that `yield`s slices) to "look like" streaming. The user waits
> for the *entire* generation with a blank screen, then the whole answer snaps in at once — the exact
> opposite of streaming. If you catch yourself replaying a completed response chunk-by-chunk, stop
> and use one of the two real paths above. A pinned native runtime is the fix, not a workaround to
> avoid.

## Backend — a `stream<string>` endpoint

Declare a **`member function`** returning `stream<string>` (member functions are required for
streaming return over the API):

```c3typ
askQuestion: member function(question: string, settings: json): stream<string> py
```

Implement it by wrapping a Python generator in `c3.Stream.make`. Each yielded string becomes one
NDJSON line; returning `None` ends the stream. Per the wire contract above, **yield only raw token
text** — no leading metadata object, no `json.dumps`. Accumulate the deltas as you go and persist the
full answer (plus run status/error) exactly once when the generator is exhausted, in a `finally`.

See **`examples/stream_endpoint.py`** for the full pattern. The key shape:

```python
def askQuestion(this, question, settings):
    gen = _generate(this, question, settings)        # yields raw token strings; persists in finally
    return c3.Stream.make(c3.PrimitiveType.ofStr(), lambda: next(gen, None))
```

The generator opens the provider stream (native `completion(stream=True)` when pinned, or a stdlib
`http.client.HTTPSConnection` to the provider on the portable path), `yield`s each raw delta, and in
its `finally` persists the assembled text and the terminal status (`Completed`/`Error`) onto the
entity. Persisting only in the `finally` keeps the DB write atomic and still runs if the client
disconnects mid-stream; the client accumulates the live tokens and reads status/errors back from the
persisted entity once the stream ends.

## Frontend — read the NDJSON stream with a fetch reader

The endpoint responds with `Content-Type: application/x-ndjson`. Read it with `fetch` +
`response.body.getReader()`, buffering partial lines so a chunk split across reads isn't corrupted.
Each line is one JSON-encoded string — do a single `JSON.parse(line)` per line to get the raw token
text back (`typeof === 'string'`); there is no metadata line to skip. Accumulate tokens into one
message and update it in place (don't create a node per token). The stream is complete when the
reader reports `done` — there's no separate sentinel.

See **`examples/streamRead.ts`** for the full reader + buffer + abort wiring. Minimal loop:

```ts
const reader = res.body!.getReader();
const decoder = new TextDecoder('utf-8');
let buffer = '';
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';                       // keep the incomplete trailing line
  for (const line of lines) { if (line) onToken(JSON.parse(line)); }
}
```

## Smooth the render with a client-side buffer (fixes "chunky" streaming)

Streamed tokens do **not** arrive evenly. The provider batches SSE frames, so deltas come in
bursts — several tokens within ~1ms, then a stall of a few hundred ms while the next frame is
assembled. Appending each delta straight to React state makes that burstiness visible as a stutter
("chunky" streaming). This is almost always the real complaint, and it lives at the **provider**,
not in your transport.

> **Don't add a server-side queue to fix this.** A producer/consumer queue only smooths a stream
> when the consumer is the bottleneck. Here the consumer drains each burst in ~1ms and then waits;
> during the provider's stall the queue is simply **empty** — a buffer can't hand out tokens that
> haven't arrived. This was measured directly (server-yield gaps ≈ browser-arrival gaps: same p90
> ~450ms, same burst count), and a queued variant showed **no** improvement. The fix is on the
> **client**: buffer arrivals and reveal them at a steady rate. To confirm where *your* stream
> stalls, run **`scripts/stream-latency-probe.js`** against your endpoint.

Decouple *arrival* from *display*: push each delta into a pending buffer, and drain characters to
the visible string on a `requestAnimationFrame` loop at a backlog-adaptive rate. Stalls are then
hidden behind a steady "typewriter" drip. Ship this as the default whenever you stream text to a UI.

The reusable hook is in **`examples/useTypewriterBuffer.ts`**. Wire it into the reader loop:
`reset()` before a run, `push(delta)` per token, `flush()` when the stream ends / errors / is
cancelled, and render `displayed`.

```ts
const buf = useTypewriterBuffer();     // add options to tune — see below
// before starting:            buf.reset();
// in onToken(delta):          buf.push(delta);
// after reader reports done:  buf.flush();
// render:                     <p className="whitespace-pre-wrap">{buf.displayed}</p>
```

**Tuning — if the user says it still feels chunky, make the buffer bigger/slower:**

| Symptom the user reports              | Change                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------- |
| "Still stutters / still chunky"       | **Increase `drainMs`** (e.g. 220 → 400–600). Longer drain = smoother, more even drip, at the cost of a little more display lag. |
| "It lags too far behind the response" | **Decrease `drainMs`** (e.g. 220 → 120), and/or lower `maxBacklog` so it snaps to caught-up sooner. |
| "Big bursts still dump all at once"   | **Raise `maxBacklog`** (e.g. 8000 → 12000) so large bursts are dripped rather than snapped. `maxBacklog` is the char threshold above which smoothing is *abandoned* and everything reveals at once — set it comfortably above your longest expected answer (a full analysis is easily 2–5k chars), or the whole response snaps in. The default is 8000; the old 1500 default was a footgun that snapped any realistic answer. |
| "Feels too slow/mechanical on short answers" | Lower `drainMs` or raise `minCharsPerFrame` (e.g. 1 → 3) so short outputs finish quickly. |

The buffer never changes **time-to-first-token** (that's provider latency) — it only smooths the
cadence *after* tokens start. `flush()` on completion guarantees no artificial trailing delay.

## Let the user interrupt the stream

Give the user a way to stop a long or wrong-headed generation. Drive the `fetch` with an
`AbortController` and expose a Cancel button; aborting rejects the in-flight `reader.read()`, which
tears down the request. Because the server persists the full text only when the generator is
exhausted (see the backend `finally`), a mid-stream abort simply leaves the last-saved partial —
no corruption. Full wiring is in **`examples/streamRead.ts`**; the essentials:

```ts
const controller = new AbortController();
const res = await fetch(url, { /* ... */ signal: controller.signal });
// ... reader loop ...
// Stop button:      controller.abort();
// catch:            if ((err as Error).name !== 'AbortError') throw err;   // ignore user cancels
// on unmount:       useEffect(() => () => controller.abort(), []);
```

Two cautions: (1) an aborted stream throws `AbortError` in the reader loop — swallow *that specific*
error, don't report it as a failure; and (2) if the backend does extra work per token (e.g. writing
to a DB), the server generator keeps running until its next `yield` notices the closed connection —
keep per-token side effects cheap, and rely on the `finally` for the single authoritative persist.

## Fallback — AsyncAction + incremental persist + polling

If you can't stream from the method's runtime, get progressive UX another way: run the work in an
`AsyncAction` that writes partial `result` text to an entity as chunks arrive, and have the client
poll (~1s) and re-render. Coarser than token streaming but needs no stream endpoint.
For member functions, target the instance with `args={"this": {"id": ...}}` (see the async-actions
docs / `AsyncActionSpec`).

## If you truly need a custom runtime

`py-agents`/`py-vertexai_litellm_312` etc. are **not present in every environment** and cost install
time. Only add one when you need libraries a stock runtime lacks (e.g. `autogen`). If so, define it
via a runtime/conda spec in the package and reference it as the method's suffix; otherwise stay on an
existing runtime with the stdlib streaming approach above.
