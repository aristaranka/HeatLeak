# CHARM Forecasting & Backcasting

Zero-shot **probabilistic** forecasting with the CHARM foundation model — no training, no per-series
model. One call to `client.prediction.create(...)` (endpoint `POST /forecast`) returns a full quantile
distribution for future steps (forecast) or past steps (backcast).

## API

```python
resp = client.prediction.create(
    descriptions,          # (N, C) list[list[str]] — channel names, REQUIRED
    ts_array,              # (N, T, C) list[list[list[float]]] — raw values, do NOT pre-scale
    target_len,            # int, non-zero. >0 = forecast ahead, <0 = backcast/reconstruct
    batch_size=None,       # default N; SDK splits to respect N*C*T <= 500_000
    return_tensors="list", # "list" | "np" | "torch"
    progress=True,
)
```

Async equivalent for large N: `await client.prediction.async_create(..., max_B_per_request=64, concurrency_per_call=8)`.

## Output — `ForecastResponse`

| Field | Shape | Meaning |
| --- | --- | --- |
| `resp.denormalized_predictions` | `(N, |target_len|, C, Q)` | **Predictions in original scale — use this.** Q = number of quantiles (model-dependent, e.g. 21 or 99). |
| `resp.median` | `(N, |target_len|, C)` | Point forecast = the middle quantile of `denormalized_predictions`. Convenience property. |
| `resp.predictions` | `(N, |target_len|, C, Q)` | Normalized (model-internal) predictions — rarely needed. |
| `resp.data` | `(N, T, C)` | Echo of your input. |
| `resp.mode` | `"forecast"` \| `"backcast"` | Set from the sign of `target_len`. |
| `resp.target_len` | int | The argument you passed. |

- **Point forecast** → `resp.median`.
- **Uncertainty bands** → index the quantile axis of `resp.denormalized_predictions`. `Q` is
  model-dependent; read it as `resp.denormalized_predictions.shape[-1]`, don't hardcode. The median is
  the middle index (`Q // 2`); low/high quantiles are the outer indices.

```python
import numpy as np
fc = resp.denormalized_predictions          # (N, H, C, Q)
Q = fc.shape[-1]
median = fc[..., Q // 2]                     # (N, H, C) — same as resp.median
lo = fc[..., int(0.1 * (Q - 1))]             # ~10th percentile band
hi = fc[..., int(0.9 * (Q - 1))]             # ~90th percentile band
```

## Forecast vs. backcast

- `target_len = 24` → forecast the **next 24** steps. Shape `(N, 24, C, Q)`.
- `target_len = -8` → **reconstruct the last 8** steps (backcast). Shape `(N, 8, C, Q)`,
  `resp.mode == "backcast"`. Use backcast to impute gaps or sanity-check a series against the model.
- `target_len = 0` → **raises `InvalidRequestError`.**

## Rules & limits

- **`1 ≤ T ≤ 8192`** input timesteps (the SDK enforces the 8192 training-window cap).
- For best quality keep **`T + |target_len| ≤ 8192`** — the horizon shares the model's window.
- **All series in one request share the same T and C.** For ragged histories, right-pad/trim to a common
  T or split into multiple requests.
- **`batch_size × C × T ≤ 500,000`** per request (SDK batches automatically).
- **Do not pre-scale** — CHARM normalizes internally. Send raw values.
- **Raise `timeout`** — the SDK default is 15s; forecasts can take up to ~220s. Pass `timeout=300` when
  constructing the client (or per-need).

## Multivariate note

CHARM is multivariate and channel-aware: pass all C channels of a system together (e.g.
`["load_mw", "ambient_temp", "humidity"]`) so cross-channel dynamics inform the forecast. The forecast
covers **all C channels**; slice the channel axis for the one you care about.

## End-to-end in a C3 method (Python)

Reads a normalized C3 `Timeseries` via `tsEval`, forecasts, writes the point forecast + band back.
See [integration.md](integration.md) for the `Timeseries` ↔ `ts_array` conversion and the one-time
runtime setup (`py-charm_312` via the `c3-runtime` skill) this method needs.

```python
def forecastLoad(this, horizon):
    from charm import CharmClient
    import numpy as np

    # 1. Pull the history as a Timeseries (see c3-timeseries for tsEval)
    ts = c3.PowerMeterSeries.tsEval({
        "ids": [this.id],
        "projection": "avg(normalized.data.loadMw)",
        "start": this.historyStart, "end": this.historyEnd, "interval": "HOUR",
    })
    values = [[v] for v in ts.data()]          # (T, C=1); wrap each step as a 1-channel row

    # 2. Forecast against the current preview endpoint (no real key needed — see integration.md)
    client = CharmClient(
        base_url="http://ab778f946c58843afa52a72d5af0657a-1381817648.us-west-2.elb.amazonaws.com:8080",
        api_key="YOUR_API_KEY_HERE",   # any non-empty string for now
        timeout=300,
    )
    resp = client.prediction.create(
        descriptions=[["load_mw"]],
        ts_array=[values],
        target_len=int(horizon),
        return_tensors="np",
    )

    # 3. Point forecast + 80% band
    fc = resp.denormalized_predictions[0]      # (H, C=1, Q)
    Q = fc.shape[-1]
    point = fc[:, 0, Q // 2].tolist()
    lo = fc[:, 0, int(0.1 * (Q - 1))].tolist()
    hi = fc[:, 0, int(0.9 * (Q - 1))].tolist()
    return {"point": point, "lo": lo, "hi": hi}
```

> **JS callers:** CHARM's SDK is Python. From a JS type method, either call a sibling Python method that
> wraps CHARM, or (for the timeseries plumbing) do `tsEval` in JS and hand ids to a Python `@ts`-aware
> method. Do not attempt to import the Python SDK from JS.

## Trained forecasting head (optional)

The zero-shot `prediction.create` above needs no training and is the default. If you have enough history
and want a fitted head on top of CHARM embeddings, the toolkit ships `ForecastingModel` +
`create_forecasting_datasets` — see [toolkit.md](toolkit.md). Match the head to the dataset factory:
**`input_size` must equal `train_horizon`, and `horizon` must equal `test_horizon`** — `ForecastingModel`
raises at forward time if the input length differs from `input_size`, and the datasets emit
`train_horizon`-length inputs with `test_horizon`-length targets. Precompute embeddings before fitting
(toolkit models call the API every forward pass).

## Common pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| `InvalidRequestError: target_len cannot be 0` | passed `target_len=0` | use a non-zero value (`>0` forecast, `<0` backcast) |
| `InvalidRequestError: Time series too long` | `T > 8192` | trim/downsample the history (coarser `interval` in `tsEval`) |
| `InvalidRequestError: Batch too large` | `batch_size × C × T > 500_000` | lower `batch_size`, or use `async_create` |
| `Batch inconsistency ... different time steps/channels` | series in one request differ in T or C | pad/trim to a common T; group by C |
| forecast looks flat/wrong scale | you pre-scaled the input | send **raw** values; CHARM normalizes internally |
| `TimeoutError_` on forecast | default 15s timeout | construct client with `timeout=300` |
