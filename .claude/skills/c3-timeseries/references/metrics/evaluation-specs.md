# Metric Evaluation Specs

Use this reference when building evaluation requests, choosing subject selection fields, or inspecting the result shape returned by metric APIs.

## EvalMetricsSpec

Main spec for evaluating metrics. Inherits from `MetricSpecBase`:

| Field                      | Type                                     | Description                                                         |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| `expressions`              | `!set<string>`                           | Metric expressions to evaluate                                      |
| `ids`                      | `set<string>`                            | Subject ids to evaluate on                                          |
| `filter`                   | `string`                                 | Filter to select subjects                                           |
| `limit`                    | `int`                                    | Max subjects                                                        |
| `start`                    | `!datetime`                              | Start of evaluation range (from `MetricSpecBase`)                   |
| `end`                      | `!datetime`                              | End of evaluation range (from `MetricSpecBase`)                     |
| `interval`                 | `!Interval`                              | Evaluation interval, default `DAY` (from `MetricSpecBase`)          |
| `timeZone`                 | `TimeZone`                               | Time zone (from `MetricSpecBase`)                                   |
| `continueOnError`          | `boolean`                                | Continue if a metric fails (default false)                          |
| `explain`                  | `boolean`                                | Include evaluation plan                                             |
| `bindings`                 | `map<string, any> or [map<string, any>]` | Variable bindings                                                   |
| `bindingsCartesianProduct` | `boolean`                                | Cartesian product of binding arrays                                 |
| `cache`                    | `boolean`                                | Use cached results (default false, from `MetricSpecBase`)           |
| `srcKey`                   | `lambda(e: Obj): string`                 | Custom source key function (from `MetricSpecBase`)                  |
| `sources`                  | `Collection<Obj>`                        | Direct source objects instead of ids/filter (from `MetricSpecBase`) |
| `resultKey`                | `lambda(expression, bindings): !string`  | Custom result key function                                          |
| `locale`                   | `string`                                 | Locale for label translations                                       |
| `options`                  | `EvalMetricsOptions`                     | Advanced options (from `LegacyMetricAdvancedSpec`)                  |

For normal evaluation, provide one of:

- `EvalMetricSpec.id`
- `EvalMetricsSpec.ids`
- `EvalMetricsSpec.filter`
- `MetricSpecBase.sources`

## EvalMetricSpec

Single-metric variant:

| Field        | Type               | Description              |
| ------------ | ------------------ | ------------------------ |
| `expression` | `!string`          | Single metric expression |
| `id`         | `string`           | Subject id               |
| `bindings`   | `map<string, any>` | Variable bindings        |

## EvalMetricsResult

| Field          | Type                            | Description                                           |
| -------------- | ------------------------------- | ----------------------------------------------------- |
| `result`       | `map<string, map<string, any>>` | `{sourceId: {resultKey: Timeseries}}`                 |
| `evalPlan`     | `EvalPlan`                      | Evaluation plan (when `explain=true`)                 |
| `errors`       | `map<string, string>`           | Per-source error messages when `continueOnError=true` |
| `translations` | `map<string, string>`           | Label translations                                    |

Key member methods:

| Method                          | Returns                         | Description                               |
| ------------------------------- | ------------------------------- | ----------------------------------------- |
| `timeseries(metricName, srcId)` | `TimeseriesBase`                | Get a specific result (metric name first) |
| `allTimeseries()`               | `[TimeseriesBase]`              | All timeseries as a flat array            |
| `byMetrics()`                   | `map<string, map<string, any>>` | Results grouped by metric                 |
