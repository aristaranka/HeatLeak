# Metric Utilities and Guidance

Use this reference when tracing metric dependencies, inspecting metric definitions, or checking platform-specific caveats.

## MetricUtils

`MetricUtils` provides inspection functions (all static):

| Method                                               | Description                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `MetricUtils.findUsages(metric)`                     | Find all metrics that reference this metric (`metric` is a `Metric` object, returns `[CompoundMetric]`)     |
| `MetricUtils.findDirectUsages(metric)`               | Find direct references only (`metric` is a `Metric` object, returns `[CompoundMetric]`)                     |
| `MetricUtils.findUsagesForMultipleMetrics(metrics)`  | Find usages for multiple metrics at once (`metrics` is `[Metric]`, returns `map<string, [CompoundMetric]>`) |
| `MetricUtils.findCompoundMetrics(metrics)`           | Find all `CompoundMetric` objects that reference any of the given metrics                                   |
| `MetricUtils.identifyVariables(expression)`          | Extract variable names from an expression                                                                   |
| `MetricUtils.isExpressionValid(expression, srcType)` | Validate expression syntax                                                                                  |
| `MetricUtils.listTSDeclMetrics(filter)`              | List `TSDecl` metrics matching a filter string                                                              |
| `MetricUtils.listActionDeclMetrics(filter)`          | List action metrics matching a filter string                                                                |
| `MetricUtils.listMetricsForType(typeRef)`            | List all metrics for a type                                                                                 |
| `MetricUtils.listMetricsForField(typeRef, field)`    | List metrics using a field                                                                                  |

## Best Practices

- Use `EXPRESSION` mode for most metrics.
- Use `ASTIMESERIES` when you need to construct a timeseries from non-timeseries raw or event data at evaluation time.
- Use `CompoundMetric` to compose `SimpleMetric` definitions rather than duplicating logic.
- Enable `cache` on high-frequency metrics to improve evaluation performance.
- Use `variables` for parameterized metrics instead of creating separate metrics per threshold.
- Use `explain: true` during development to inspect evaluation plans.
- Use `continueOnError: true` in batch evaluations to keep one failure from stopping all metrics.
- Prefer expression or `TSDecl` metrics over `actionDecl`; reserve action metrics for prototyping or genuinely custom logic.
- Access metric context in expressions via `$metric.src`, `$metric.interval`, and `$metric.range`.

## Limitations

- Metric caching uses KV storage, so large cache ranges may consume significant storage.
- Cached evaluation requires `timeZone: 'NONE'` / UTC semantics.
- `CompoundMetric` expressions reference `SimpleMetric` names rather than ids.
- `actionDecl` metrics are harder to optimize and do not participate in incremental invalidation.
- `evalMetricsBatch` requires explicit start and end calls through `startEvalMetricsBatch()` and `endEvalMetricsBatch()`.
