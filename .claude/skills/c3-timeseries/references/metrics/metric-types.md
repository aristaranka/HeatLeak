# Metric Types Reference

Use this reference when defining metric objects, choosing between metric modes, or inspecting metric metadata and helper APIs.

## SimpleMetric

Defines a single metric on a source entity type. Three modes:

| Mode           | When                                                     | Key Field    |
| -------------- | -------------------------------------------------------- | ------------ |
| `EXPRESSION`   | Standard expression-based metric                         | `expression` |
| `ASTIMESERIES` | Constructs a timeseries from raw/event data via `TSDecl` | `tsDecl`     |
| `ACTION`       | Calls a custom action                                    | `actionDecl` |

Key fields:

| Field         | Type                    | Description                                           |
| ------------- | ----------------------- | ----------------------------------------------------- |
| `name`        | `!string`               | Metric name                                           |
| `srcType`     | `!Type`                 | Source entity type                                    |
| `expression`  | `string`                | Metric expression (for EXPRESSION mode)               |
| `tsDecl`      | `TSDecl`                | Timeseries declaration (for ASTIMESERIES mode)        |
| `actionDecl`  | `ActionMetricDecl`      | Action declaration (for ACTION mode)                  |
| `path`        | `string`                | Navigation path from `srcType` to the evaluation type |
| `unit`        | `Unit`                  | Unit of measure                                       |
| `label`       | `string`                | Display label (translatable)                          |
| `description` | `string`                | Description (translatable)                            |
| `variables`   | `[MetricVariable]`      | Parameterized variables                               |
| `tags`        | `[string]`              | Searchable tags                                       |
| `cache`       | `SimpleMetricCacheSpec` | Caching configuration                                 |

Key static functions:

| Method                                 | Returns                     | Description                                                           |
| -------------------------------------- | --------------------------- | --------------------------------------------------------------------- |
| `SimpleMetric.metrics()`               | `[SimpleMetric]`            | All registered SimpleMetrics                                          |
| `SimpleMetric.metricForId(id)`         | `SimpleMetric`              | Lookup by id                                                          |
| `SimpleMetric.refreshMetricDeps(spec)` | `RefreshMetricDepsBatchJob` | Refresh dependency graph                                              |
| `SimpleMetric.invalidateCache(specs)`  |                             | Invalidate cached evaluations (`specs` is `[MetricInvalidationSpec]`) |

Key member functions:

| Method                                 | Returns       | Description                          |
| -------------------------------------- | ------------- | ------------------------------------ |
| `isValid(throwOnInvalid)`              | `boolean`     | Check if metric definition is valid  |
| `cacheRange(srcId, interval, srcType)` | `TimeRange`   | Get cache range for source/interval  |
| `cacheId(srcId, interval, srcType)`    | `!string`     | Cache identifier for source/interval |
| `includes()`                           | `set<string>` | Optimized include for fetch          |
| `typeAtEndOfPath()`                    | `Type`        | Resolved type at end of path         |
| `allTypesInPath()`                     | `[Type]`      | All types referenced in the path     |
| `allReferencedTypes()`                 | `[Type]`      | All types referenced in metric       |

## TSDecl

Configures how timeseries data is read for ASTIMESERIES metrics:

| Field             | Type                 | Default  | Description                            |
| ----------------- | -------------------- | -------- | -------------------------------------- |
| `data`            | `!string`            | `"this"` | Path to data points                    |
| `treatment`       | `!string enum AggOp` | `SUM`    | Aggregation operation (required)       |
| `overlapHandling` | `string enum`        | `'AVG'`  | How to handle overlapping intervals    |
| `start`           | `!string`            |          | Expression for start timestamp         |
| `end`             | `string`             |          | Expression for end timestamp           |
| `value`           | `string`             |          | Expression for the value               |
| `dataVersion`     | `string`             |          | Data version expression                |
| `isEstimated`     | `string`             |          | Expression indicating estimated values |
| `filter`          | `string`             |          | Filter expression on data points       |
| `rollupFunc`      | `string enum`        |          | Rollup function                        |
| `transform`       | `string`             |          | Post-aggregation transform expression  |

## ActionMetricDecl

For `ACTION` mode metrics:

| Field     | Type      | Description                              |
| --------- | --------- | ---------------------------------------- |
| `action`  | `!string` | Action name to invoke on the source type |
| `include` | `string`  | Include spec for the action              |

Action metrics are recommended mainly for prototyping. They are less optimizable than expression or `TSDecl` metrics and do not support incremental invalidation.

## CompoundMetric

Composes multiple metrics into a single expression.

| Field        | Type               | Description                         |
| ------------ | ------------------ | ----------------------------------- |
| `expression` | `!string`          | Expression referencing metric names |
| `name`       | `!string`          | Compound metric name                |
| `variables`  | `[MetricVariable]` | Variables for the expression        |

Key static functions:

| Method                                                         | Returns             | Description                                                         |
| -------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------- |
| `CompoundMetric.isValid(metric, sourceType, overridenMetrics)` | `boolean`           | Validate compound metric definition (`metric` is `!CompoundMetric`) |
| `CompoundMetric.getDescendants(expression, sourceType)`        | `DescendantsResult` | All descendant metric tree                                          |
| `CompoundMetric.listSimpleMetrics(expression, sourceType)`     | `[SimpleMetric]`    | All referenced SimpleMetrics (`sourceType` is `Type`)               |
| `CompoundMetric.listSimpleMetricsIds(expression, sourceType)`  | `[string]`          | All referenced SimpleMetric ids                                     |
| `CompoundMetric.dependentMetrics(expression)`                  | `[string]`          | Metrics that depend on this expression                              |

Key member functions:

| Method       | Returns    | Description                    |
| ------------ | ---------- | ------------------------------ |
| `unitId()`   | `string`   | Resolved unit id               |
| `evalExpr()` | `string`   | Compiled evaluation expression |
| `varNames()` | `[string]` | Variable names in expression   |

## Metric Base Type Utilities

The abstract `Metric` base type provides static utility methods shared by `SimpleMetric` and `CompoundMetric`:

| Method                                                             | Returns     | Description                                                                                |
| ------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------ |
| `Metric.fromTemplate(template, bindings, bindingCartesianProduct)` | `![Metric]` | Generate metrics from a template with variable substitution                                |
| `Metric.fromTSDeclOrExpr(type, metrics)`                           | `[Metric]`  | Generate metrics from a map of `TSDecl` or expression strings                              |
| `metric.createFeature(subjectType, interval)`                      | `!Feature`  | Create a Feature from this metric (bridges metrics to Feature Store)                       |
| `metric.evalKeyFieldValue()`                                       | `!string`   | Value used as key during evaluation (`name` for `SimpleMetric`, `id` for `CompoundMetric`) |

`Metric.fromTemplate()` example:

```javascript
// Parallel bindings (zip): 1st of each array paired together, 2nd with 2nd, etc.
var m = SimpleMetric.make({
  id: '${a}And${b}_Car',
  name: '${a}And${b}',
  expression: "color == '${a}' && type == '${b}'",
});
var metrics = Metric.fromTemplate(m, { a: ['White', 'Black'], b: ['Sedan', 'SUV'] });
// Result: WhiteAndSedan_Car, BlackAndSUV_Car

// Cartesian product (3rd arg = true): all combinations
var metrics = Metric.fromTemplate(m, { a: ['White', 'Black'], b: ['Sedan', 'SUV'] }, true);
// Result: WhiteAndSedan_Car, BlackAndSUV_Car, BlackAndSedan_Car, WhiteAndSUV_Car
```

## MetricVariable

| Field         | Type      | Description   |
| ------------- | --------- | ------------- |
| `name`        | `!string` | Variable name |
| `dataType`    | `string`  | Data type     |
| `value`       | `any`     | Default value |
| `description` | `string`  | Description   |

## MetricContext

Available in metric expressions via `$metric`:

| Field      | Type                   | Access                                      |
| ---------- | ---------------------- | ------------------------------------------- |
| `src`      | `Identifiable`         | `$metric.src` — the subject being evaluated |
| `interval` | `string enum Interval` | `$metric.interval` — evaluation interval    |
| `range`    | `TimeRange`            | `$metric.range` — evaluation time range     |
| `timeZone` | `TimeZone`             | `$metric.timeZone`                          |
