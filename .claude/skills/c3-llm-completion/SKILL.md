---
name: c3-llm-completion
description: |
  Configure and make a direct LLM call from C3 server-side code (Python or JS). Use when
  the agent needs to call a large language model (Bedrock, GPT, Gemini) from a type method,
  send a prompt and read the model's text or JSON response, stream the response token-by-token
  to a UI, pick a model, or find where model credentials live. Covers the genaiPlatform
  dependency the LLM client requires, the pre-provisioned default-completions client, and
  streaming via a stream<string> endpoint, and steers away from hand-rolling raw Bedrock
  invoke_model or AWS SigV4 signing.
core: true
category: platform
version: 8.9.0
minVersion: 8.7.0
---

# C3 LLM Completion

Call an LLM from C3 server-side code with the platform's first-class client,
`GenaiCore.Llm.Completion.Client`. The platform owns credentials, request signing, model
routing, and retries — you build messages and read the response.

> **Do not hand-roll a raw provider call** (boto3 `invoke_model`, manual AWS SigV4 signing, or
> `urllib` to the Bedrock/Anthropic HTTP API). Agents reach for that when `GenaiCore.Llm.*`
> "isn't found" — but the fix is to confirm the type is available (Step 0), not to hand-roll.

## Step 0 — Confirm the LLM client is available

`GenaiCore.Llm.*` comes from the **`genaiPlatform`** package. In practice it is usually already
available — it's a dependency of the GenAI/MCP stack (e.g. `mcpServer` requires `genaiPlatform`),
so most C3 apps resolve these types without adding anything.

**Check first, don't assume you must add a dependency:** confirm the type resolves in Console /
code runner —

```javascript
GenaiCore.Llm.Completion.Client            // JS: resolves if available
```
```python
c3.GenaiCore.Llm.Completion.Client         # Python
```

Only if it does **not** resolve, add `genaiPlatform` to the package's `*.c3pkg.json`
`dependencies` and re-provision. Either way, the answer is never to hand-roll a raw provider call.

## Step 1 — Pick a completion client

You reference a completion client **by name**. Two common choices:

- **Use the pre-provisioned `default-completions`** (simplest — the deployment cloud picks the
  model, so you don't hardcode a model id). Best default when you just need "an LLM."
- **Select a specific configured model** when you need a particular one — pass its config key to
  `forConfigKey(...)` (e.g. `"claude-sonnet-4.6"`, `"gpt-5.4"`, or any client your admin
  configured). List what's available with the discovery calls below, or configure your own (Step 4).

When `genaiPlatform` is present, these named clients ship pre-provisioned:

| Pre-provisioned name      | What it is                                                       |
| ------------------------- | ---------------------------------------------------------------- |
| `default-completions`     | Default completion client (Claude Sonnet on AWS/GCP, GPT on Azure) |
| `default-auth`            | Default per-provider auth (`Bedrock`/`AzureOpenAi`/`VertexAi`)   |
| `default-completions-web` | Completion client with web search (Gemini)                       |
| `embedding-client-1`      | Default embedding client                                         |

```python
client = c3.GenaiCore.Llm.Completion.Client.forConfigKey("default-completions")
# or a specific configured model:
client = c3.GenaiCore.Llm.Completion.Client.forConfigKey("claude-sonnet-4.6")
```

**Verify the client exists first.** Defaults are only configured if the model is available in your
deployment region — otherwise the object is absent:

```javascript
var config = GenaiCore.Llm.Completion.Client.make({ name: 'default-completions' }).getConfig();
if (!config) { /* not provisioned in this region — pick another or configure your own (Step 4) */ }
```

## Make the call

```python
client = c3.GenaiCore.Llm.Completion.Client.forConfigKey("default-completions")
response = client.completion(
    messages=[
        {"role": "system", "content": "You are a concise assistant."},
        {"role": "user", "content": question},
    ],
    options={"returnJson": True, "max_tokens": 1024},
)
content = response["choices"][0]["message"]["content"]
```

Verified in-repo example (`repo/genesis/src/chat/Genesis.ChatSession.py`) builds an explicit
client: `Bedrock.Auth.forConfigKey("bedrock")` → `Bedrock.Model(model=..., auth=...)` →
`Completion.Client(model=model)` → `client.completion(...)`.

## Messages

`messages` is a list of `{"role", "content"}` dicts. Roles: `system` (instructions, first),
`user`, `assistant` (prior turns). For multi-turn, replay history then append the new `user` turn:

```python
messages = [{"role": "system", "content": system_prompt}]
for turn in history:                      # [{role, content}, ...]
    messages.append({"role": turn["role"], "content": turn["content"]})
messages.append({"role": "user", "content": question})
```

## Options

| Option        | Effect                                              |
| ------------- | --------------------------------------------------- |
| `returnJson`  | `True` requests/parses a JSON object response       |
| `max_tokens`  | Cap on output tokens                                |
| `temperature` | Sampling temperature (`0` = deterministic)          |

```python
options={"returnJson": True, "max_tokens": 4096, "temperature": 0}
```

With `returnJson: True`, `content` is a JSON string — parse defensively (strip markdown fences,
locate the first `{...}`) because models occasionally wrap it.

`defaultOptions` set on the **model** apply to every call (e.g. `temperature`, `stop`,
`max_tokens`) unless overridden per call — set defaults there instead of repeating them.

## Reading the Response

```python
response["choices"][0]["message"]["content"]   # text, or JSON string when returnJson
```

(Attribute access — `response.choices[0].message.content` — also works.) Wrap calls in
`try/except`; credential/region/model errors surface as exceptions:

```python
try:
    response = client.completion(messages=messages, options=options)
    content = response["choices"][0]["message"]["content"]
except Exception as e:
    raise RuntimeError(f"LLM call failed: {e}") from e
```

## Streaming (progressive token-by-token UX)

To stream tokens to a UI as they are generated, use a C3 **`stream<string>`** endpoint (a member
function) backed by a Python generator wrapped in `c3.Stream.make`, and read it on the frontend with
a `fetch` + `response.body.getReader()` NDJSON loop. It works over the normal `c3Action` transport —
no websocket/SSE rebuild.

**The full guide is in [`references/streaming.md`](references/streaming.md)** — read it before
building streaming. It covers the wire contract (yield RAW strings; the transport encodes + frames),
the runtime decision (native-runtime-only `stream=true` vs. the portable stdlib-generator path — and
how to *validate* which you have), the backend endpoint, the frontend reader, smoothing a "chunky"
stream, user interruption, and the polling fallback. Copy-paste starting points:

| Need | File |
| --- | --- |
| **Validate whether native streaming is available** + which runtime to pin (run FIRST) | [`scripts/check-streaming-runtime.js`](scripts/check-streaming-runtime.js) |
| Backend `stream<string>` generator (yield RAW tokens → persist in `finally`) | [`examples/stream_endpoint.py`](examples/stream_endpoint.py) |
| Frontend fetch-reader + smoothing + abort, all wired together | [`examples/streamRead.ts`](examples/streamRead.ts) |
| Reusable client-side smoothing buffer (`useTypewriterBuffer`) | [`examples/useTypewriterBuffer.ts`](examples/useTypewriterBuffer.ts) |
| Diagnose *where* a chunky stream stalls (upstream vs. transport) | [`scripts/stream-latency-probe.js`](scripts/stream-latency-probe.js) |

Three things agents get wrong most often, called out here so they aren't missed:

- **Validate the runtime before writing the endpoint.** Genuine `completion(stream=true)` only works
  in the model's native runtime; from anywhere else it silently returns one blocking response and a
  naive "stream" degrades into a blank wait then a snap-in. Run `scripts/check-streaming-runtime.js`
  (via `runJsCode`) to get the verdict + the exact runtime to pin to. **Never fake a stream** by
  chopping a finished blocking response into chunks.
- **Yield RAW strings from the generator — never `json.dumps`, never a metadata/error object.** The
  `stream<string>` transport JSON-encodes + newline-frames each yielded string itself; encoding it
  yourself double-encodes (leaked quotes), and objects can't ride a string stream (put run
  status/errors on the persisted entity). This is the #1 streaming bug — see `references/streaming.md`.
- **"Chunky"/stuttering stream → fix it on the client, not the server.** The burstiness is upstream
  provider SSE framing; a server-side queue stays empty during the stall and does nothing. Use the
  `useTypewriterBuffer` drip and, if it still stutters, **make the buffer bigger/slower** (raise
  `drainMs`); keep `maxBacklog` above your longest answer. Full tuning table in `references/streaming.md`.
- **Let the user stop a generation** with an `AbortController` wired into the `fetch` `signal`;
  swallow the resulting `AbortError` and abort on unmount. See `examples/streamRead.ts`.

## Step 4 — Configure your own client (only if a default isn't available)

If `default-completions` isn't provisioned (e.g. the model isn't in your region), create a client:
auth → model → client, then `setConfig()`. Auth carries the endpoint/keys; give the client a
`name` so it is reusable and visible in the Agent Workbench.

```python
auth = c3.GenaiCore.Llm.AzureOpenAi.Auth(
    name="my_azure", apiKey="<key>", azureEndpoint="<endpoint>", apiVersion="2024-02-01")
auth.setConfig(); auth.setSecret()

model = c3.GenaiCore.Llm.AzureOpenAi.Model(
    model="gpt-5-mini", auth=auth, defaultOptions={"temperature": 1, "max_tokens": 100})

client = c3.GenaiCore.Llm.Completion.Client(name="my_client", model=model)
client.setConfig()
```

Providers: `Bedrock`, `AzureOpenAi`, `VertexAi`, `OpenAi`, `AzureAi` — each with a matching
`.Auth` and `.Model`. For Bedrock/Vertex the auth fields differ (keys/region/endpoint vs service
account); see the docs linked below.

## Finding what's configured

```javascript
GenaiCore.Llm.Completion.Client.listConfigKeys().collect();        // configured completion clients
GenaiCore.Llm.Completion.Client.UiHelper.listCompletionClients();  // UI helper listing
GenaiCore.Llm.Bedrock.Auth.listConfigs().collect();                // per-provider auth configs
// also: AzureOpenAi, VertexAi, OpenAi, AzureAi
```

## Anti-Patterns (the no-dependency trap)

The common failure: a package can't resolve `GenaiCore.Llm.*`, so an agent
hand-rolls the call — `boto3`/`invoke_model`, raw `urllib` to Bedrock/Anthropic, manual SigV4,
hand-built `anthropic_version` payloads, env-var/hardcoded keys. **The fix is the availability
check (Step 0) + the platform client — not raw HTTP.** Specifically avoid *writing code that*:

- `boto3` / `invoke_model` / `bedrock-runtime`
- manual SigV4 (`AWS4-HMAC-SHA256`, `hmac`/`hashlib`, canonical requests)
- hand-built `anthropic_version` payloads or `urllib` to the provider API
- reading `awsAccessKeyId`/`awsSecretKey` and passing them to an SDK by hand

## Going Deeper

- 8.10 docs: [Set Up LLM Clients](https://docs.c3.ai/docs/genaiPlatform/8.10/topic/genaiPlatform-llm-client),
  [Default LLMs and Embedders](https://docs.c3.ai/docs/genaiPlatform/8.10/topic/genaiPlatform-default-llms-embedders).
- MCP docs tool: `search_c3_documentation` (tag `C3 AI Generative AI#8.9`).
