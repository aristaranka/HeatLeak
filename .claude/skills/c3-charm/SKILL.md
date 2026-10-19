---
name: c3-charm
description: |
  Use CHARM — C3 AI's time-series foundation model — from C3 server-side code (Python/JS) via
  its hosted `/predict` (embeddings) and `/forecast` (quantile forecast/backcast) endpoints.
  Use when the agent needs to:
  (1) Zero-shot forecast a time series with NO training data / no per-series model (probabilistic,
      quantile output) — "predict the next N steps", "forecast this sensor", "extend this series"
  (2) Backcast / reconstruct missing or past timesteps of a series
  (3) Embed multivariate time series into dense vectors for retrieval, clustering, similarity search,
      anomaly detection, or as features for a downstream classifier
  (4) Detect anomalies in sensor/telemetry streams without labels (kNN-on-embeddings, sliding windows)
  (5) Feed a C3 `Timeseries` (from `tsEval`) into CHARM and write forecasts/scores back onto entities
  (6) Configure the CHARM client/endpoint + API key, and steer away from hand-rolling raw HTTP to the
      `/predict`/`/forecast` doors (binary fp16 + base64 protocol) or hand-rolling a forecasting model
  ALSO use this skill whenever a request describes FORECASTING / ANOMALY / EMBEDDING intent on time
  series and wants it done with a pretrained foundation model rather than training a model — e.g.
  "zero-shot forecast", "no training data", "foundation model for time series", "CHARM", "embed my
  sensor windows", "find similar historical patterns", "flag unusual behavior in this telemetry".
  For TRAIN-YOUR-OWN tabular models (XGBoost/sklearn, Feature.Set → MlPipeline → MlModel, HPO) use
  `c3-machine-learning`. For defining/normalizing/querying the timeseries itself (TimedDataPoint,
  tsEval, metrics) use `c3-timeseries`. This skill is the bridge: it consumes what `c3-timeseries`
  produces and complements — does not replace — the native ML framework in `c3-machine-learning`.
triggers:
  - forecast this time series
  - forecast the next N steps
  - zero-shot forecast
  - forecast without training data
  - foundation model for time series
  - use CHARM
  - CHARM embeddings
  - embed my time series
  - embed sensor windows
  - find similar time series
  - time series retrieval
  - detect anomalies in this telemetry
  - anomaly detection without labels
  - reconstruct missing timesteps
  - backcast a series
  - probabilistic / quantile forecast
antiTriggers:
  - train an xgboost model
  - train a regression model on my columns
  - Feature.Set MlPipeline MlModel
  - define a TimedDataPoint type
  - normalize my timeseries
  - write a tsEval projection
core: false
category: platform
version: 0.1.1
minimumVersion: 8.7.0
---

# CHARM — Time-Series Foundation Model in C3

CHARM (**CH**annel-**A**ware **R**epresentation **M**odel) is C3 AI's foundation model for
**multivariate** time series. It is a **hosted model behind two HTTP doors**, wrapped by the
`c3-charm` Python SDK (`CharmClient`). One frozen model, two capabilities:

| Capability | Door | SDK call | Output |
| --- | --- | --- | --- |
| **Embeddings** — series → dense vectors | `POST /predict` | `client.embeddings.create(...)` | `(N, D)` |
| **Forecast / backcast** — zero-shot quantile predictions | `POST /forecast` | `client.prediction.create(..., target_len)` | `(N, |target_len|, C, Q)` |

**The two things that make CHARM different from `c3-machine-learning`:**

1. **Zero-shot.** Forecasting needs **no training data and no per-series model** — one API call
   returns a full probabilistic (quantile) forecast. There is no `Feature.Set`, no `MlPipeline.train()`,
   no held-out split. If the user wants a *trained* tabular model (XGBoost/sklearn on entity columns),
   that is `c3-machine-learning`, not this skill.
2. **It's a client, not an estimator.** You call a remote model over HTTP; the platform/deployment
   owns the endpoint + credentials. **Never hand-roll `requests`/`httpx`/`urllib` to `/predict` or
   `/forecast`** — the wire protocol is non-obvious (raw fp16 bytes with `X-Shape`/`X-Dtype` headers on
   `/predict`; JSON with base64 fp16 blobs on `/forecast`; a "folded" JSON variant behind Azure/SageMaker
   adapters). The SDK decodes all of this. Use the SDK.

> **Version note:** the live PyPI/runtime resolves **`c3-charm==0.1.12`** even though the package's
> `__version__` may still say `0.1.1`. Trust the installed package; re-check `client.model_info()` if a call disagrees.

## Step 0 — One-time setup: runtime + endpoint

CHARM runs remotely (CPU-only, server-side); the SDK is just a client. Two setup steps before you can call it.

### 1. Create + claim a Python runtime (so `import charm` works)

The `charm` SDK isn't in the default `py` runtime — a method importing it under `py` fails with
`ModuleNotFoundError`. Create a `py-charm_312` runtime via the **`c3-runtime` skill**:

- **Parent:** `py-data_312` (8.9+)
- **Libraries:** `pip c3-charm[toolkit]` + `pip nest-asyncio==1.6.0`
- **Claim it** on each CHARM method as a **bare trailing token** after the return type —
  e.g. `forecast: function(...): any py-charm_312`.
- **Import `charm` inside the method body**, never at module top level — all methods on a type share one
  `.py` module, so a top-level import forces the heavy runtime onto every method (the shared-module trap).

> The full `upsertRuntime` recipe, claim-syntax gotchas, and the heavy `[toolkit]`/torch install note live
> in [references/integration.md](references/integration.md) § Runtime setup.

### 2. Point at the endpoint (preview, frozen)

The current preview endpoint needs **no real API key** — `api_key` must be a non-empty string but is ignored:

```python
from charm import CharmClient

client = CharmClient(
    base_url="http://ab778f946c58843afa52a72d5af0657a-1381817648.us-west-2.elb.amazonaws.com:8080",
    api_key="YOUR_API_KEY_HERE",   # any non-empty string; ignored for now
    timeout=300,                   # raise from the 15s default — /forecast can take ~220s
)
```

Confirm reachability with `client.model_info()` before real work; don't hardcode `D`/`Q`.

> **TODO:** replace this hardcoded preview endpoint with secure production endpoint configuration once a
> secured endpoint is provisioned. (Credential-handling approach is not yet decided — tracked separately.)

## Reference Dispatch

| Task | Reference File |
| ---- | -------------- |
| Zero-shot forecast / backcast — `prediction.create`, quantiles vs `median`, horizons, the `T + |target_len| ≤ 8192` rule | [references/forecasting.md](references/forecasting.md) |
| Embeddings — `embeddings.create`, `aggregate`, descriptions-as-channels, feeding vectors into retrieval / clustering / sklearn | [references/embeddings.md](references/embeddings.md) |
| Toolkit — anomaly detection (exactly the SDK's kNN-on-embeddings pipeline: `sliding_window_embeddings` → `knn_anomaly_scores` → `window_scores_to_pointwise`, plus zero-shot bootstrap, statistics-ensemble, per-channel, multiscale), retrieval, and trainable heads | [references/toolkit.md](references/toolkit.md) |
| C3 integration — creds/config, runtime claims, `Timeseries` ↔ `ts_array`, sync vs async, wire protocol, errors, writing results back | [references/integration.md](references/integration.md) |
| Native train-your-own models (Feature.Set → MlPipeline → MlModel, HPO) | See the `c3-machine-learning` skill |
| Defining / normalizing / querying the timeseries itself (TimedDataPoint, tsEval, metrics) | See the `c3-timeseries` skill |

## The shared input format (both endpoints)

Every call takes the **same two arguments**:

- **`descriptions`** — channel names, shape **(N, C)** — `list[list[str]]`. *Required and load-bearing:*
  CHARM is channel-aware, so `[["engine_temperature", "oil_pressure"]]` embeds better than
  `[["col_0", "col_1"]]`. Reuse the same names across requests so embeddings stay comparable.
- **`ts_array`** — values, shape **(N, T, C)** — `list[list[list[float]]]`. N series, each T timesteps
  × C channels.

**Constraints (SDK-enforced client-side in v0.1.1):**

| Constraint | Limit |
| --- | --- |
| Timesteps per series | `1 ≤ T ≤ 8192` (the model's training window) |
| Channels per series | No hard cap (large C grows memory ~O(C²)) |
| Per-request size | `batch_size × C × T ≤ 500,000` (SDK splits into batches) |
| Batch consistency | **All series in one request must share the same T and the same C** |

> **Do NOT pre-scale.** CHARM normalizes internally (asinh z-score). Do **not** apply
> `StandardScaler`/`MinMaxScaler`/log yourself — it hurts results. Send raw values.

> **No NaNs.** The SDK does not validate for NaN/Inf, and a NaN corrupts the internal normalization.
> **Back-fill (bfill) missing values before sending** (or `fillMissing`/`interpolate` upstream in
> `c3-timeseries`) — no NaN may reach `ts_array`. See [references/integration.md](references/integration.md) § Timeseries ↔ ts_array.

## Minimal call

```python
from charm import CharmClient

client = CharmClient(base_url=base_url, api_key=api_key, timeout=300)  # 15s default too low for /forecast

# Zero-shot forecast: next 24 steps (target_len < 0 = backcast)
resp = client.prediction.create(
    descriptions=[["load_mw", "ambient_temp"]],   # (N=1, C=2) channel names
    ts_array=[history],                            # (N=1, T, C=2), RAW values
    target_len=24, return_tensors="np",
)
point = resp.median                     # (1, 24, 2) — point forecast
bands = resp.denormalized_predictions   # (1, 24, 2, Q) — quantiles for intervals
```

Embeddings mirror this: `client.embeddings.create(descriptions=..., ts_array=..., aggregate=True).embeds`
→ `(N, D)`. Full API, quantiles, and shapes in [references/forecasting.md](references/forecasting.md) and
[references/embeddings.md](references/embeddings.md).

## Decision guide — is CHARM the right tool?

| Situation | Use |
| --- | --- |
| "Forecast this series, no training data / quick baseline" | **CHARM** `prediction.create` (this skill) |
| "Embed/cluster/retrieve/anomaly-detect on time series windows" | **CHARM** `embeddings.create` + toolkit (this skill) |
| "Reconstruct missing/past timesteps" | **CHARM** backcast (`target_len < 0`) |
| "Train an XGBoost/sklearn model to predict a column from other columns" | `c3-machine-learning` (Feature.Set → MlPipeline → MlModel) |
| "Define a TimedDataPoint / normalize / write a tsEval projection / metric" | `c3-timeseries` |
| Tabular data with no time axis, or a series < ~10–48 steps | classical (LightGBM/ARIMA) — CHARM needs a few patches (patch size 16) |

## Best Practices

- **Set up the runtime first (Step 0)** — confirm reachability with `client.model_info()`, and read
  `D`/`Q`/`patch_size` from it rather than hardcoding.
- **Send raw data; never pre-scale.** Use meaningful, consistent channel descriptions.
- **Keep `T ≤ 8192`** and `T + |target_len| ≤ 8192` for best forecast quality.
- **Raise `timeout` to ~220s+ for forecasting**; use `async_create` for large N (sync is slow past ~100 series).
- **Import CHARM inside the method body** (shared-module trap) and **don't hand-roll HTTP** — use `CharmClient`.

## Anti-Patterns

1. **Hand-rolling `requests`/`httpx`/`urllib` to `/predict` or `/forecast`** — you'll mis-decode the raw
   fp16 (`X-Shape`/`X-Dtype`) or base64 blobs. Use `CharmClient`.
2. **Building a trained model for a zero-shot job** — don't stand up a `Feature.Set` → `MlPipeline` →
   `MlModel` when the user just wants a forecast; call `prediction.create`. (Conversely, don't use CHARM
   when they explicitly want a *trained, deployable* tabular model — that's `c3-machine-learning`.)
3. **Pre-scaling the input** (`StandardScaler`/`MinMaxScaler`/log) — CHARM normalizes internally.
4. **Hardcoding `D`, `Q`, or `patch_size`** — read them from `client.model_info()` / the output shape.
5. **Skipping the runtime setup** — a method importing `charm` under the default `py` runtime fails with
   `ModuleNotFoundError`. Create/claim the `py-charm_312` runtime (Step 0, via `c3-runtime`).
6. **Reimplementing toolkit functions because the `[toolkit]` install is slow** — the CUDA torch stack
   makes the install heavy, but the fix is to be patient / retry the async upsert, **not** to hand-roll
   numpy kNN that `charm_toolkit.anomaly_detection` already ships.
7. **One giant request** instead of async batching — respect `N×C×T ≤ 500,000` and use `async_create`.
8. **Transposing shapes** — `ts_array` is `(N, T, C)` (timesteps outer, channels inner); `descriptions`
   is `(N, C)`; they must agree on C.
