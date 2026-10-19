# CHARM ↔ C3 Integration

Everything C3-specific about calling CHARM from server-side code: the runtime setup, credentials/config,
converting a C3 `Timeseries` to/from `ts_array`, sync vs. async, the wire protocol (why you must use the
SDK), and writing results back onto entities. **CHARM runs CPU-only — no GPU is needed** (the model
executes server-side; the SDK is just a client).

## Credentials & configuration

**Current preview endpoint (frozen).** For now, point at this URL. It **does not require a real API
key** — `api_key` just needs to be a non-empty string:

```python
from charm import CharmClient

client = CharmClient(
    base_url="http://ab778f946c58843afa52a72d5af0657a-1381817648.us-west-2.elb.amazonaws.com:8080",
    api_key="YOUR_API_KEY_HERE",   # any non-empty string; this endpoint ignores it for now
    timeout=300,                   # /forecast can take ~220s; the 15s default is too low
)
```

**Later (secured endpoint).** A production/secured endpoint isn't provisioned yet, and the
credential-handling approach isn't decided. When it is, the URL + key should move out of hardcoded code
into secure configuration (see the `c3-config-framework` skill) — tracked as a follow-up. The SDK also
honors env vars `CHARM_BASE_URL` / `CHARM_API_KEY` as a fallback.

## Build the client — a thin wrapper type (recommended pattern)

Follow the repo's established hosted-model pattern (`Genesis.Llm.CompletionClient`): a small **stateless
utility type** with static functions — function docs on the `.c3typ`, logic in the `.py`. This centralizes
client construction and keeps the heavy import in one place.

```c3typ
/** Single entry point for CHARM calls (embeddings + forecast). Stateless utility. */
type MyCharm.Client {
  /** Zero-shot forecast; returns median + 10/90 bands per channel. */
  forecast: function(descriptions: [[string]], tsArray: [[[double]]], targetLen: int): any py-charm_312
}
```

```python
# MyCharm.Client.py — the method claims the py-charm_312 runtime (see below)
def forecast(cls, descriptions, tsArray, targetLen):
    from charm import CharmClient
    client = CharmClient(
        base_url="http://ab778f946c58843afa52a72d5af0657a-1381817648.us-west-2.elb.amazonaws.com:8080",
        api_key="YOUR_API_KEY_HERE",   # any non-empty string for the current endpoint
        timeout=300,
    )
    try:
        resp = client.prediction.create(
            descriptions=descriptions, ts_array=tsArray,
            target_len=int(targetLen), return_tensors="np",
        )
    except Exception as e:
        raise RuntimeError(f"CHARM forecast failed: {str(e) or repr(e)}") from e
    fc = resp.denormalized_predictions          # (N, H, C, Q)
    Q = fc.shape[-1]
    return {
        "median": fc[..., Q // 2].tolist(),
        "lo": fc[..., int(0.1 * (Q - 1))].tolist(),
        "hi": fc[..., int(0.9 * (Q - 1))].tolist(),
    }
```

> Wrap calls in `try/except` and re-raise as a `RuntimeError` with the message — the SDK raises typed
> `CharmError` subclasses (below); surface them, don't swallow them.

## Runtime setup (do this first — the #1 gotcha)

The `charm` SDK is a third-party package (imports `torch`, `httpx`, `numpy`, …) that isn't in the default
`py` runtime, so a method importing it under `py` fails with `ModuleNotFoundError: No module named 'charm'`
(or `'torch'`). Create a runtime that has it, using the **`c3-runtime` skill**:

- **Parent:** `py-data_312` · **Name:** `py-charm_312`
- **Libraries:** `pip c3-charm[toolkit]` **plus `pip nest-asyncio==1.6.0`** (install the toolkit by default;
  plain `pip c3-charm` is the leaner core-only option for forecast + embeddings).
- **CPU-only** at runtime — no GPU is needed; the model runs server-side. (The install still pulls torch's
  default CUDA wheel on Linux, which is heavy/slow but never exercised.)

```python
runtime = c3.ImplLanguage.Runtime.fromJson({
    "name": "py-charm_312",
    "languageVersion": "3.12",
    "parents": ["py-data_312"],
    "libraries": ["pip c3-charm[toolkit]", "pip nest-asyncio==1.6.0"],
    "repositories": ["conda-forge", "defaults"],
})
c3.Py.upsertRuntime(runtime)   # install per c3-runtime; async, can take many minutes / retry if it times out
```

Then **claim the runtime** on each CHARM method — the **bare trailing token** on the `.c3typ` signature,
right after the return type: `... : json py-charm_312` (the runtime **name**). This matches how real
`.c3typ` files in the repo pin runtimes (`... : string py-data_312` in `c3-code-python-upgrade`,
`... : json py-c3intelligence-server`, `doEnsure: ~ py-claude_code_312` on `Genesis...GenAi`). Both the
short `py-charm_312` and the `py-charm_312-server-py4j` form compile and run; use the short one. Do **not**
write the fully-resolved dotted form `py.3.12-charm_312-server-py4j` — it **fails at the lexer** (`mismatched
character '3'`; dots are illegal) and, being a parse error, takes down the **whole type**. Do **not** wrap it
as `py(runtime='...')` either — that does not parse.

> **Name vs. resolved requirement:** you write the runtime **name** (`py-charm_312`); the platform resolves
> it to a longer `Action.Requirement` — `py.3.12-charm_312-server-py4j`, visible in `metadata/Py.Runtime/` —
> by appending `-server-py4j` itself. Write the short name; don't paste the resolved dotted string back into
> the `.c3typ`.

- **`nest-asyncio` (toolkit dependency):** always include `pip nest-asyncio==1.6.0` in a toolkit runtime
  (hyphenated pip package name, pinned). Without it, `import charm_toolkit` fails.
- **Shared-module trap:** all methods on a type share one `.py` module, so a **module-level**
  `from charm import ...` forces the heavy runtime onto **every** method of that type (including plain
  getters). Keep the CHARM import **inside the function body** (as above), and/or isolate CHARM calls on
  their own thin type.
- **Verifying inside the runtime:** `runPyCode` runs in the default `py` runtime, so it **can't** `import
  charm`. To smoke-test CHARM in `py-charm_312`, call a real `.c3typ` method that claims the runtime (e.g.
  a `modelInfo()` that returns `client.model_info()`).
- Runtime creation requires a **Single Node Environment** with a writable package store — see the
  `c3-runtime` skill for prerequisites. If they aren't met, it's an operator task.

## Timeseries ↔ ts_array

CHARM speaks plain nested lists `(N, T, C)`. Convert to/from C3 `Timeseries` (produced by `tsEval` — see
`c3-timeseries`):

```python
# C3 Timeseries -> ts_array (single series, C channels)
tsC1 = MySeries.tsEval({"ids": [sid], "projection": "avg(normalized.data.a)",
                        "start": s, "end": e, "interval": "HOUR"})
tsC2 = MySeries.tsEval({"ids": [sid], "projection": "avg(normalized.data.b)",
                        "start": s, "end": e, "interval": "HOUR"})
a, b = tsC1.data(), tsC2.data()               # each length T
ts_array = [[[a[i], b[i]] for i in range(len(a))]]   # (N=1, T, C=2)
descriptions = [["a", "b"]]

# Forecast/embeddings back -> persist
resp = client.prediction.create(descriptions=descriptions, ts_array=ts_array,
                                 target_len=24, return_tensors="np")
```

Notes:
- **Query `normalized.data.<field>`** and always wrap in an aggregation (`avg(...)`, `sum(...)`) — that's a
  `c3-timeseries` rule. The normalized series gives you evenly-spaced values suitable for CHARM.
- **`ts_array` is `(N, T, C)`** — timesteps outer, channels inner. Don't transpose.
- **NaNs / missing values — clean them before sending.** The SDK's `_validate_shapes` checks shape and
  `T` only; it does **not** reject NaN/Inf, so a NaN passes silently to the model and corrupts CHARM's
  internal asinh z-score normalization (garbage or NaN outputs). If the input has gaps, **back-fill first**
  (`np.nan_to_num` is not enough — you want a real value, not 0, on a raw scale). A minimal bfill on the
  `(T, C)` array right before the call:
  ```python
  import numpy as np
  arr = np.asarray(ts_array, dtype=float)                 # (N, T, C)
  # backward-fill NaNs along time; a trailing NaN (no later valid value) falls back to the median below
  for n in range(arr.shape[0]):
      s = arr[n]
      idx = np.where(~np.isnan(s), np.arange(s.shape[0])[:, None], s.shape[0])
      idx = np.minimum.accumulate(idx[::-1], axis=0)[::-1]  # next valid index per (t, c)
      idx = np.clip(idx, 0, s.shape[0] - 1)
      s = np.take_along_axis(s, idx, axis=0)
      arr[n] = s
  arr = np.nan_to_num(arr, nan=np.nanmedian(arr))          # trailing gaps / all-NaN channel → series median
  ts_array = arr.tolist()
  ```
  Upstream in C3 you can instead fill on the `Timeseries` itself (`ts.fillMissing(...)` / `interpolate(...)`
  in `c3-timeseries`) — but whichever layer you pick, **no NaN may reach `ts_array`**. Send raw scale (no
  pre-scaling). To *reconstruct* larger gaps rather than fill them flat, use CHARM backcast (`target_len < 0`).
- To write a forecast back, materialize it onto data points / a `Feature.Set` / a result entity as
  appropriate — see `c3-timeseries` (Feature Sets) and `c3-machine-learning` (Feature Store) for
  persistence options.

## Sync vs. async & batching

- **Sync** (`create`) is sequential — fine for a handful of series; slow past ~100.
- **Async** (`async_create`) batches concurrently — `max_B_per_request` (per-call size) and
  `concurrency_per_call` (parallel calls). Prefer it for large N.
- Respect **`batch_size × C × T ≤ 500,000`** (the SDK splits, but tune the batch to your payload).
- **Raise `timeout`** — default 15s; `/forecast` can take ~220s. Construct with `timeout=300`.
- Keep the SDK's **built-in retries** (exponential backoff on 429/500/502/503/504, respects
  `Retry-After`) — don't hand-roll retry loops.

## `model_info()` — don't hardcode model params

```python
info = client.model_info()          # GET /model/metadata
# info["models"]["embedding"]["embed_dim"]  -> D
# info["models"]["forecast"]["patch_size"]  -> patch size
```

Embedding dim `D`, quantile count `Q`, and `patch_size` are **model-dependent**, and the embedding vs.
forecast checkpoints may differ (dual-model serving). Read them at runtime rather than hardcoding.

## Wire protocol — why you must use the SDK

Don't hand-roll HTTP to `/predict` or `/forecast`; the encoding is non-obvious and the SDK decodes it:

- **`/predict`** returns **raw fp16 bytes** in the body, with shape in the `X-Shape` header (JSON list)
  and dtype in `X-Dtype`. The SDK reshapes and upcasts to float32.
- **`/forecast`** returns **JSON** with base64-encoded fp16 blobs under `predictions`, `data`, and
  `denormalized_predictions` (each `{blob, shape, dtype}`).
- Behind **Azure Foundry / SageMaker adapters** the binary is "folded" into a JSON body
  (`{blob_b64, shape, dtype}`) because those routers may drop custom headers — the SDK
  transparently un-folds it. Hand-rolled clients will break on this.

## Error handling

All SDK errors subclass `charm.CharmError`:

| Exception | Trigger |
| --- | --- |
| `AuthenticationError` | 401/403 — bad/missing API key |
| `InvalidRequestError` | 400 / client-side validation (shape, `target_len=0`, `T>8192`, batch too large) |
| `RateLimitError` | 429 — back off and retry |
| `ServiceUnavailableError` | 503 |
| `APIError` | 5xx / unexpected status |
| `TimeoutError_` | request timed out (raise `timeout`) |
| `NetworkError` | connectivity / TLS |
| `ResponseValidationError` | malformed response (e.g. mis-decoded binary) |
| `LocalDeploymentError` | local `tag=` deployment failed (GPU/clone/weights/health) |

```python
from charm import CharmError, AuthenticationError, InvalidRequestError, RateLimitError
try:
    resp = client.prediction.create(...)
except AuthenticationError:
    ...   # key/config problem — check the endpoint + api_key
except InvalidRequestError as e:
    ...   # fix shapes / target_len / limits
except RateLimitError:
    ...   # backoff (SDK already retries)
except CharmError as e:
    raise RuntimeError(f"CHARM call failed: {e}") from e
```

## Local deployment (`tag=`) — not used in C3 apps

The SDK's `CharmClient(tag=...)` mode (clone a GitHub release + run the model locally) needs a GPU and is
for research/dev machines only. In C3, always point at the hosted `base_url` above. Ignore `tag=` here.
