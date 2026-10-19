# CHARM Toolkit — Anomaly Detection, Retrieval & Trainable Heads

The optional toolkit (`pip install c3-charm[toolkit]`, imported as `charm_toolkit`) adds downstream
utilities and small PyTorch heads that sit **on top of frozen CHARM embeddings**. Two tiers:

- **Zero-shot / no-training utilities** — `retrieval` and `anomaly_detection` modules: pure numpy/kNN over
  embeddings. No labels, no training.
- **Trainable heads** — `ReconstructionModel`, `ForecastingModel`, `ClassificationModel` + a `Trainer`
  (exported as `TrainerClass`). Small heads you train on cached embeddings when you have labels/targets.

> All of this is **optional and Python-side**. The core forecast/embedding calls
> ([forecasting.md](forecasting.md), [embeddings.md](embeddings.md)) need only `charm`, not
> `charm_toolkit`. The toolkit pulls heavy deps (`torch`, `scikit-learn`, `lightgbm`, `optuna`, …).
>
> **Runtime note:** to use the toolkit, the runtime's libraries must include **`pip c3-charm[toolkit]`**
> **and `pip nest-asyncio==1.6.0`** (hyphenated pip package name, pinned; without it `import charm_toolkit`
> fails). Plain `pip c3-charm` is sufficient for forecast + embeddings only. Adjust the
> `libraries` list when creating the `py-charm_312` runtime (see [integration.md](integration.md) §Runtime
> setup / the `c3-runtime` skill). The `[toolkit]` install is heavy (pulls the full CUDA torch stack) and
> may time out on the first upsert — retry; CHARM still runs CPU-only.

**Version note:** PyPI/the C3 runtime currently resolve **`c3-charm==0.1.12`**, but the package's
`__version__` may still self-report `0.1.1`. Shapes and signatures below match what the
live 0.1.12 runtime returns; if a call ever disagrees, trust the installed package and re-check
`client.model_info()` / output shapes at runtime.

## Anomaly detection — exactly as the SDK does it

The SDK's AD approach is a **kNN-distance pipeline on windowed CHARM embeddings**: embed sliding windows,
score each test window by distance to reference windows, collapse overlapping windows to per-timestep
scores. Use the SDK functions exactly as below (verbatim from the SDK's own README / `demo_retrieval_anomaly_detection.ipynb`).

### The three-step pipeline

```python
from charm_toolkit.anomaly_detection import (
    sliding_window_embeddings,
    knn_anomaly_scores,
    window_scores_to_pointwise,
)

# 1. Embed sliding windows
train_emb = sliding_window_embeddings(
    client, train_data, descriptions,
    window_size=128, stride=1, batch_size=64,
)
test_emb = sliding_window_embeddings(
    client, test_data, descriptions,
    window_size=128, stride=1, batch_size=64,
)

# 2. Score test windows by distance to train
window_scores = knn_anomaly_scores(
    test_emb=test_emb,
    reference_emb=train_emb,
    k=5,
    distance="cosine",    # "cosine", "l2", "l1"
    aggregation="mean",   # "mean", "max"
)

# 3. Aggregate to per-timestep scores
pointwise_scores = window_scores_to_pointwise(
    window_scores=window_scores,
    window_size=128,
    stride=1,
    total_length=len(test_data),
    method="mean",  # "mean", "max", "last", "center"
)
```

`train_data` / `test_data` are `(T, C)` numpy arrays; `descriptions` is a length-C list of channel names.
`sliding_window_embeddings` returns `(N_windows, D)` and already mean-pools the server's 4D output
internally, so you don't handle that here.

**Pointwise aggregation `method`** (each timestep is covered by many overlapping windows):

| Method | Behavior | Use case |
|--------|----------|----------|
| `"mean"` | Average of all windows covering the point | Smooth, best for offline evaluation |
| `"max"` | Max score among covering windows | Conservative, catches isolated spikes |
| `"last"` | Score of the most recently *completed* window | Online/streaming — updates when a window finishes |
| `"center"` | Score of the window centered on each point | Minimal time-shift, tightest temporal alignment |

### Zero-shot recipes (no clean reference set) — SDK's recommended order

When you have no labeled-normal segment to use as `reference_emb`, build one from the data. The SDK's
recommended methods, strongest first:

1. **Bootstrap k-NN (best).** There is **no `bootstrap_reference` in the SDK** — this is a short recipe you
   write yourself: run `sklearn.ensemble.IsolationForest` on the embedding matrix, keep the **~70% of windows
   that look most normal** as the reference, then call `knn_anomaly_scores` against it. Mind the sign of
   whatever normality/suspicion metric you use — `IsolationForest.score_samples` returns **higher = more
   normal**, so you keep the **top** 70% of `score_samples` (equivalently, the bottom 70% of `-score_samples`):
   ```python
   import numpy as np
   from sklearn.ensemble import IsolationForest
   emb_n = l2_normalize(test_emb)                                               # windowed embeddings, unit-norm
   normality = IsolationForest(random_state=0).fit(emb_n).score_samples(emb_n)  # higher = more normal
   keep = max(4, int(round(0.70 * len(emb_n))))
   reference = emb_n[np.argsort(normality)[::-1][:keep]]                        # top-70% most-normal windows
   scores = knn_anomaly_scores(emb_n, reference, k=3, distance="cosine")
   ```
   The 0.70 is a **fraction of windows chosen by normality**, **not a time split** — do **not** slice the
   leading 40%/70% of history and call it "normal." CHARM/AD makes no assumption that early timesteps are
   clean; the reference is chosen by *how normal each window looks*, not *when it occurred*. (If you genuinely
   have a known-clean segment, pass its windows as `reference_emb` directly and skip the bootstrap.)
2. **CBLOF**: `pyod.models.cblof.CBLOF` on the embedding matrix.
3. **IsolationForest**: `sklearn.ensemble.IsolationForest` directly on the embedding matrix.

L2-normalize embeddings beforehand to use cosine geometry. See `demo_retrieval_anomaly_detection.ipynb`.

### Best practices (validated on TSB-AD, metric VUS-PR) — verbatim from the SDK

**1. Ensemble the embedding score with per-window statistics.** The encoder instance-normalizes each
window, erasing amplitude/level-shift anomalies (spikes, steps — the most common kind) from the embedding.
Recover them with `window_statistics` (no extra model call) and combine via `ensemble_scores`
(`method="zscore"` — z-score each detector and sum; parameter-free and as strong as a tuned weighted
ensemble). Worth **~+7 pp VUS-PR** supervised.

```python
from charm_toolkit.anomaly_detection import window_statistics, ensemble_scores

emb_score = knn_anomaly_scores(test_emb, train_emb, k=3, distance="cosine")
S_tr = window_statistics(train_data, 128, 1)
mu, sd = S_tr.mean(0, keepdims=True), S_tr.std(0, keepdims=True) + 1e-8
stats_score = knn_anomaly_scores(
    (window_statistics(test_data, 128, 1) - mu) / sd, (S_tr - mu) / sd,
    k=3, distance="l2")
window_scores = ensemble_scores([emb_score, stats_score], method="zscore")
# zero-shot: build the reference by bootstrap (above) and use method="rank"
```

**2. Multivariate: do NOT pool channels when the channel count is high.** Channel-mean pooling dilutes an
anomaly confined to a few channels across all of them. Keep channels separate with
`sliding_window_channel_embeddings` + `per_channel_knn_scores` (`channel_pool="adaptive"`). The benefit
grows with the number of channels — negligible at C≤3, sizeable at C≥20, large at C>60. For few channels,
plain mean-pooling is equally good and cheaper.

```python
from charm_toolkit.anomaly_detection import (
    sliding_window_channel_embeddings, per_channel_knn_scores)

train_pc = sliding_window_channel_embeddings(client, train_data, descriptions)  # (N, C, D)
test_pc  = sliding_window_channel_embeddings(client, test_data, descriptions)
emb_score = per_channel_knn_scores(test_pc, train_pc, k=3, channel_pool="adaptive")
```

**3. No compute constraints? Use multiscale (highest accuracy).** Run the embedding detector at several
window sizes (e.g. `{64, 128, 256}`) and the statistics detector at several more
(e.g. `{16, 32, 64, 128, 256, 512}`), combine each family with `multiscale_max_score`, then sum the two.
TSB-AD full eval (stride-1): VUS-PR 0.634 vs 0.607 for the single-scale ensemble, at ~3–6× the detector
calls. Z-scoring each scale before the max is not optional (skipping it costs ~6 pp VUS-PR).

```python
from charm_toolkit.anomaly_detection import multiscale_max_score

def multiscale_detector(client, train, test, descriptions, scales, is_stats):
    scores = []
    for ws in scales:
        train_w = sliding_window_embeddings(client, train, descriptions, window_size=ws) if not is_stats \
            else window_statistics(train, window_size=ws)
        test_w = sliding_window_embeddings(client, test, descriptions, window_size=ws) if not is_stats \
            else window_statistics(test, window_size=ws)
        s = knn_anomaly_scores(test_w, train_w, k=3, distance=("cosine" if not is_stats else "l2"))
        scores.append(window_scores_to_pointwise(s, ws, 1, len(test)))
    return multiscale_max_score(scores)

final_score = multiscale_detector(client, train, test, descriptions, [64, 128, 256], is_stats=False) \
    + multiscale_detector(client, train, test, descriptions, [16, 32, 64, 128, 256, 512], is_stats=True)
```

### Dependencies for the AD recipes

All AD functions live under **`pip c3-charm[toolkit]`** (which also requires **`pip nest-asyncio==1.6.0`** — see
the runtime note above; without it `import charm_toolkit` fails). Beyond that:

| Recipe | Needs beyond `[toolkit]` + `nest-asyncio` |
| --- | --- |
| 3-step pipeline, `window_statistics`, `ensemble_scores(method="zscore"/"minmax")`, per-channel, multiscale | nothing extra (numpy) |
| Bootstrap k-NN / IsolationForest | `scikit-learn` — **included** in `[toolkit]` |
| `ensemble_scores(method="rank")` | **`scipy`** — NOT in `[toolkit]` deps; add `pip scipy` to the runtime |
| CBLOF | **`pyod`** — NOT in `[toolkit]` deps; add `pip pyod` to the runtime |

The output is a continuous per-timestep **score** (higher = more anomalous). Turning scores into a
yes/no label is a **thresholding choice you make** (e.g. a high percentile of the scores, or a
`contamination` rate) — the SDK intentionally returns scores, not labels.

## Retrieval / similarity

```python
from charm_toolkit.retrieval import (
    l2_normalize, cosine_similarity_matrix, knn_search, retrieval_metrics,
)

emb = l2_normalize(emb)                          # unit-norm so dot == cosine
sim = cosine_similarity_matrix(emb, emb)         # (N, N)
indices, scores = knn_search(query_emb, corpus_emb, k=5)   # (N_q, k), (N_q, k)

metrics = retrieval_metrics(
    query_emb, corpus_emb, query_labels, corpus_labels,
    k_values=[1, 3, 5, 10], exclude_self=True,
    query_ids=query_ids, corpus_ids=corpus_ids,
)  # {"precision@1":…, "ndcg@5":…, "hit_rate@10":…}
```

## Trainable heads (only when you have labels/targets)

Small heads over frozen embeddings, all trained via the shared `TrainerClass`. Dataset factories return
`(train_ds, val_ds, test_ds)` and every DataLoader must use `collator` as `collate_fn`.

| Task | Model | Dataset factory | Input |
| --- | --- | --- | --- |
| Reconstruction (AD via error) | `ReconstructionModel` | `create_reconstruction_datasets(raw_data, ...)` | one long `(T, C)` |
| Forecasting head | `ForecastingModel` | `create_forecasting_datasets(raw_data, ...)` | one long `(T, C)` |
| Classification | `ClassificationModel` | `create_classification_datasets(raw_data, labels, ...)` | pre-windowed `(N, T, C)` |

```python
from charm_toolkit import (
    ForecastingModel, create_forecasting_datasets, collator, TrainerClass,
)
from torch.utils.data import DataLoader

train_ds, val_ds, test_ds = create_forecasting_datasets(
    raw_data, descriptions=channel_names,
    train_horizon=96, test_horizon=96, train_ratio=0.7, val_ratio=0.15,
    sequential=True, scale=True,
)
model = ForecastingModel(
    embedding_client=client, horizon=96, input_size=96,
    head="linear", hidden_dim=128, mode="last",
    per_channel=True, num_channels=len(channel_names),
)
trainer = TrainerClass(
    model=model,
    train_loader=DataLoader(train_ds, batch_size=512, collate_fn=collator),
    val_loader=DataLoader(val_ds, batch_size=512, collate_fn=collator),
    epochs=1000, patience=10, lr=1e-2,
)
trainer.fit()
```

For **classification heads, don't pool over channels**: set `pooling_over_channels="flatten"` (and pass
`num_channels=C`, which flatten requires) — it beats the default `"mean"`. This is the SDK's documented
classification best practice.

Other real `ClassificationModel` knobs (all optional): `pooling_over_t` (`"mean"`/`"last"`/`"flatten"`;
`"flatten"` requires `T`), `classifier_type` (`"linear"`/`"mlp"`/`"svm"` — `"svm"` uses `SVMHead` with
`kernel`/`gamma`), and `dropout`.

> **Precompute embeddings for classification too.** A classifier trains for many epochs and toolkit
> models call the CHARM API on *every* forward pass, so **always** wrap the datasets with
> `precompute_dataset_embeddings` + `PrecomputedEmbeddingsDataset` (see below) before `trainer.fit()` —
> without it, training is effectively unusable. This applies to every trainable head
> (Reconstruction/Forecasting/Classification), not just forecasting.

### Precompute embeddings before training (important)

Toolkit models call the CHARM API **every forward pass**. For multi-epoch training, cache embeddings once:

```python
from charm_toolkit import precompute_dataset_embeddings, PrecomputedEmbeddingsDataset

shape = precompute_dataset_embeddings(
    client=client, dataset=train_ds,
    output_path="./outputs/train_emb.pt", memory_batch_size=8192,
)
train_ds = PrecomputedEmbeddingsDataset(train_ds, "./outputs/train_emb.pt", shape)
# model skips API calls when the "embeds" key is present — orders of magnitude faster
```

## Zero-shot vs. fine-tuned — pick the cheapest that works

| Approach | When | Effort |
| --- | --- | --- |
| `prediction.create(target_len=H)` | quick forecast baseline, no labels | none — one API call |
| Embeddings + sklearn / kNN | moderate data; retrieval, AD, features | minutes, no training |
| Toolkit head (Reconstruction/Forecasting/Classification) | you have labels/targets and want best accuracy | train a small head (~minutes on CPU) |

Start zero-shot; only reach for a trainable head when labels justify it. If the user wants a **native,
deployable, retrainable** tabular model instead, that's the `c3-machine-learning` framework, not this.
