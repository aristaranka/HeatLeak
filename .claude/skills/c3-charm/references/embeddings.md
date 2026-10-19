# CHARM Embeddings

Turn multivariate time-series windows into dense vectors with the CHARM foundation model — one call to
`client.embeddings.create(...)` (endpoint `POST /predict`). The embeddings are task-agnostic: use them
for retrieval, clustering, similarity search, anomaly detection, or as features for any downstream model.

## API

```python
resp = client.embeddings.create(
    descriptions,          # (N, C) list[list[str]] — channel names, REQUIRED and load-bearing
    ts_array,              # (N, T, C) list[list[list[float]]] — raw values, do NOT pre-scale
    batch_size=None,       # default N; SDK splits to respect N*C*T <= 500_000
    return_tensors="list", # "list" | "np" | "torch"
    aggregate=True,        # True → (N, D); False → (N, T_, C, D)
    progress=True,
)
X = resp.embeds
```

Async for large N: `await client.embeddings.async_create(..., max_B_per_request=64, concurrency_per_call=8)`.

## Output — `EmbeddingsResponse`

| Field | Shape | Notes |
| --- | --- | --- |
| `resp.embeds` (`aggregate=True`) | `(N, D)` | One vector per series. `D` is model-dependent — read via `client.model_info()`, don't hardcode. |
| `resp.embeds` (`aggregate=False`) | `(N, T_, C, D)` | Per-patch, per-channel; `T_ = ceil(T / patch_size)`. Use only for custom fine-grained heads. |
| `resp.model` | str | Logical model name. |
| `resp.usage`, `resp.raw` | dict/None | Optional server metadata. |

- **`aggregate=True` (default)** → `(N, D)`: the right choice for retrieval, clustering, classification,
  kNN anomaly detection.
- **`aggregate=False`** → `(N, T_, C, D)`: only when you need per-patch/per-channel detail for a custom head.

> **Be defensive about the shape.** Against the current preview endpoint, the server may return the
> **un-aggregated 4D `(N, T_, C, D)` even when `aggregate=True`**; the SDK's own toolkit works around this
> by mean-pooling. So don't assume 2D — if `resp.embeds.ndim == 4`, collapse it yourself:
> `X = resp.embeds.mean(axis=(1, 2))` → `(N, D)` (this is exactly what `sliding_window_embeddings` does).

## Descriptions are a quality lever

CHARM is **channel-aware** — the channel names condition the encoder. Use meaningful, consistent names:

```python
descriptions = [["engine_temperature", "oil_pressure", "rpm"]]   # good
descriptions = [["temp", "pressure", "speed"]]                   # acceptable
descriptions = [["col_0", "col_1", "col_2"]]                     # works but suboptimal — avoid
```

Reuse the **same** names across requests so embeddings remain comparable for retrieval/clustering. From a
pandas frame: `descriptions = [df.columns.tolist()] * N`.

## Use the vectors

CHARM embeddings are drop-in feature vectors for any downstream method.

```python
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import IsolationForest

X = client.embeddings.create(
    descriptions=descriptions, ts_array=windows, return_tensors="np", aggregate=True
).embeds                                   # (N, D)

# Classifier on top of embeddings
clf = LogisticRegression().fit(X_train, y_train)

# Unsupervised anomaly flag
labels = IsolationForest(contamination=0.05).fit_predict(X)   # -1 = anomaly
```

Toolkit helpers for retrieval / kNN anomaly detection (`cosine_similarity_matrix`, `knn_search`,
`knn_anomaly_scores`, sliding-window utilities) are in [toolkit.md](toolkit.md).

## Similarity / retrieval quick start

```python
from charm_toolkit.retrieval import l2_normalize, cosine_similarity_matrix, knn_search

X = l2_normalize(X)                        # unit-norm so dot == cosine
sim = cosine_similarity_matrix(X, X)       # (N, N)
idx, scores = knn_search(query_emb, corpus_emb, k=5)
```

## Rules & limits

- **`1 ≤ T ≤ 8192`**, no hard C cap (but large C grows memory ~O(C²)).
- **All series in one request share the same T and C.** Window ragged series to a common T first.
- **`batch_size × C × T ≤ 500,000`** per request; use `async_create` for large N.
- **Do not pre-scale** — CHARM normalizes internally.
- Each window should have at least a few patches (patch size 16 → ~48+ timesteps is a good floor).
- L2-normalize before cosine similarity (encoder output is unit-normed, but re-normalize after any pooling).

## Common pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| `ResponseValidationError: binary size mismatch` | you hand-rolled HTTP and mis-decoded fp16 | use the SDK; it reads `X-Shape`/`X-Dtype` for you |
| embeddings not comparable across runs | different channel names each call | reuse identical `descriptions` |
| `Batch inconsistency` | mixed T or C in one request | window to a common T; group by C |
| slow for many series | sync `create` is sequential | use `async_create` with `concurrency_per_call` |
| hardcoded `D` breaks on a new model | `D` is model-dependent | read it from `resp.embeds.shape[-1]` / `client.model_info()` |
