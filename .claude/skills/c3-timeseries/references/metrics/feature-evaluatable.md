# FeatureEvaluatable Reference

Use this reference when deciding which type is the metric subject, wiring metric evaluation APIs, or bridging metrics into Feature Store.

## Subject Type Requirements

Subject entity types mix `FeatureEvaluatable` to gain metric and feature evaluation methods. `FeatureEvaluatable` is the modern replacement for deprecated `MetricEvaluatable`, and it also mixes `Fetchable` and `Evaluatable`, which the metric engine uses internally.

Entity types that serve as the subject for metric evaluation must mix `FeatureEvaluatable` for three reasons:

1. **API surface**: The mixin provides `evalMetric()`, `evalMetrics()`, `evalFeature()`, `listMetrics()`, and related methods.
2. **Feature integration**: Feature APIs such as `Feature.subjectType` and `Metric.createFeature(subjectType, interval)` use `Type<<FeatureEvaluatable>>`.
3. **Runtime capabilities**: The metric engine uses the mixed-in `Fetchable` and `Evaluatable` behavior to fetch subject instances and run expressions.

**Subject type** = the entity you evaluate metrics on, such as `EnergyPlant` or `WindTurbine`. Must mix `FeatureEvaluatable`.

**Timeseries header** = the entity that stores measurement data, such as `MeasurementSeries`. Does not need `FeatureEvaluatable`. It typically uses `TimedDataHeader<TDP>` or `IntervalDataHeader<TDP>` instead.

## Example Data Model

```c3typ
// Subject type -- mixes FeatureEvaluatable
entity type EnergyPlant mixes FeatureEvaluatable schema name 'EPLANT' {
  capacity: double
  measurements: [PlantMeasurementSeries](plant)
}

// Timeseries header -- mixes TimedDataHeader, NOT FeatureEvaluatable
entity type PlantMeasurementSeries mixes TimedDataHeader<PlantMeasurement> schema name 'EPLANT_MS' {
  plant: !EnergyPlant
  metricName: string
}

// Timeseries data point -- mixes TimedDataPoint
@db(shortId=true, shortIdReservationRange=100000)
entity type PlantMeasurement mixes TimedDataPoint<PlantMeasurementSeries> schema name 'EPLANT_MSRMNT' {
  @ts(treatment='rate')
  quantity: double
}
```

A `SimpleMetric` then navigates from the subject through the header to the data:

```json
{
  "id": "EnergyOutput_EnergyPlant",
  "name": "EnergyOutput",
  "srcType": "EnergyPlant",
  "path": "measurements.(metricName == 'EnergyOutput')",
  "expression": "sum(sum(normalized.data.quantity))"
}
```

## Metric Evaluation Methods

| Method                                                                                            | Returns                                     | Description                                                                                                                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `evalMetric(spec)`                                                                                | `Timeseries`                                | Evaluate single metric (spec is `EvalMetricSpec`)                                                                              |
| `evalMetrics(spec)`                                                                               | `EvalMetricsResult`                         | Evaluate multiple metrics                                                                                                      |
| `evalMetricsWithMetadata(spec, overrideMetrics)`                                                  | `EvalMetricsResult`                         | Evaluate with metadata/translations and optional override metrics; primarily useful for debugging or ad hoc metric definitions |
| `evalMetricsStream(spec)`                                                                         | `EvalMetricsResultStream`                   | Stream evaluation results                                                                                                      |
| `evalMetricsWithMetadataStream(spec, overrideMetrics)`                                            | `EvalMetricsResultStream`                   | Stream evaluation with metadata and optional override metrics                                                                  |
| `listMetrics()`                                                                                   | `[Metric]`                                  | All metrics for this type (simple + compound, sorted)                                                                          |
| `listMetricsByKind()`                                                                             | `ListMetricsResult`                         | Split into `simpleMetrics` and `compoundMetrics`                                                                               |
| `getSimpleMetric(name)`                                                                           | `SimpleMetric`                              | Get specific `SimpleMetric` by name                                                                                            |
| `metricVariables(expression)`                                                                     | `[MetricVariable]`                          | All variables in a metric expression                                                                                           |
| `rollupMetric(spec)`                                                                              | `Timeseries`                                | Roll up a metric (spec is `RollupMetricSpec`)                                                                                  |
| `rollupMetrics(spec)`                                                                             | `map<string, Timeseries>`                   | Roll up multiple metrics                                                                                                       |
| `rollupMetricsWithMetadata(spec, overrideMetrics)`                                                | `map<string, Timeseries>`                   | Roll up with custom override metrics; primarily useful for debugging or ad hoc metric definitions                              |
| `evalAggregateMetrics(spec)`                                                                      | `map<string, map<string, Dimension>>`       | Aggregate across subjects into scalar results                                                                                  |
| `evalMetricsStats(spec)`                                                                          | `map<string, map<string, TimeseriesStats>>` | Compute stats (min/max/avg/count) per metric and source                                                                        |
| `refreshMetricsCache(ids, metricNames, startDate, endDate)`                                       |                                             | Refresh metric cache                                                                                                           |
| `generateMetricsStats(ids, metricNames, startDate, endDate, interval, testHash)`                  |                                             | Generate and persist statistics                                                                                                |
| `getDistribution(ids, metricName, period, start, end, ignoreZeroValues, binningType, numberBins)` | `HistogramEvaluationResult`                 | Histogram data for metrics (`js-server`)                                                                                       |
| `startEvalMetricsBatch(spec)`                                                                     | `string`                                    | Initialize batch evaluation mode and return a cache key                                                                        |
| `evalMetricsBatch(key, start, end)`                                                               | `EvalMetricsResult`                         | Run batch evaluation for a time range                                                                                          |
| `endEvalMetricsBatch(key)`                                                                        | `int`                                       | Clean up batch evaluation cache                                                                                                |

## Feature Evaluation Methods

For feature-side APIs (`features()`, `evalFeature()`, `evalFeatureSet()`, `evalFeatureSetBatch()`), see the **`c3-machine-learning`** skill (`references/feature-store/`), which covers Feature.Set creation, materialization, snapshots, and the full evaluation workflow.
