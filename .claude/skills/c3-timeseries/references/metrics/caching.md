# Metric Caching

Use this reference when enabling precomputation on `SimpleMetric`, selecting cached intervals, or debugging cached evaluations.

## SimpleMetricCacheSpec

SimpleMetrics support pre-computation caching via `SimpleMetricCacheSpec`:

| Field            | Type        | Default | Description                                        |
| ---------------- | ----------- | ------- | -------------------------------------------------- |
| `intervals`      | `![string]` |         | Intervals to cache (for example `['HOUR', 'DAY']`) |
| `monthsInPast`   | `int`       | 60      | How far back to cache                              |
| `monthsInFuture` | `int`       | 1       | How far forward to cache                           |

## Example: Single-Interval Cache

```json
{
  "id": "validCachedMetric_FixedAsset",
  "name": "validCachedMetric",
  "srcType": "FixedAsset",
  "path": "timeseries.(metricName == 'ElectricityConsumption')",
  "cache": {
    "intervals": ["MONTH"]
  },
  "expression": "sum(sum(normalized.data.quantity))"
}
```

## Example: Custom Cache Range

```json
{
  "id": "IdentityCacheSpecMetricWithCustomRange_FixedAsset",
  "name": "IdentityCacheSpecMetricWithCustomRange",
  "srcType": "FixedAsset",
  "cache": {
    "intervals": ["MONTH"],
    "monthsInPast": 84,
    "monthsInFuture": 12
  },
  "expression": "identity(10)"
}
```

## Using Cached Results

Set `cache: true` in `EvalMetricsSpec` to use cached results during evaluation.

## Caveats

- Automatic cache invalidation depends on `MetricDependency`. If dependencies are missing, you may need `App.rebuild(AppRebuildSpec.make({ metricDeps: true }))`.
- Cached metric evaluation must use `timeZone: 'NONE'` / UTC semantics. Cached metrics are not supported with other time zones.
