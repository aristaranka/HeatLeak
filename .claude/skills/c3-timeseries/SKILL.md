---
name: c3-timeseries
description: |
  Work with C3 AI time series, normalization, metrics, expressions, and features. Use when the agent needs to:
  (1) Create types to store time-stamped measurements (TimedDataPoint, IntervalDataPoint)
  (2) Query normalized time series data with tsEval
  (3) Define SimpleMetrics with expressions, TSDecl, or ActionDecl
  (4) Define CompoundMetrics that compose SimpleMetrics
  (5) Evaluate metrics on subject types via FeatureEvaluatable
  (6) Configure metric caching and rollups
  (7) Use the Expression Engine (Expr.eval, Filter builder, StdLib collection API)
  (8) Work with expression engine functions in projections and calc fields
  (9) Materialize timeseries-derived values with Feature Sets for analytics, reporting, or ML (see c3-machine-learning for the Feature Store API — Feature Sets are not ML-exclusive)
core: true
category: platform
version: 8.9.0
minimumVersion: 8.7.0
---

# Working with Timeseries, Metrics & Expressions in C3

This skill helps you work with time series data, metrics, and the expression engine in the C3 AI Platform. Use this skill when creating types to store time-stamped measurements, building metrics for aggregation, materializing timeseries-derived features for analytics, reporting, or ML, querying normalized time series data, defining and evaluating metrics, or working with the expression engine.

## Reference Dispatch

| Task | Reference File |
| ---- | -------------- |
| Timeseries API (arithmetic, aggregation, rolling, transform) | [references/timeseries/timeseries-api.md](references/timeseries/timeseries-api.md) |
| Expression engine functions for tsEval projections | [references/timeseries/expression-engine-functions.md](references/timeseries/expression-engine-functions.md) |
| Metrics overview (SimpleMetric, CompoundMetric, evaluation) | [references/metrics/metrics.md](references/metrics/metrics.md) |
| Metric type definitions (TSDecl, ActionMetricDecl, MetricVariable) | [references/metrics/metric-types.md](references/metrics/metric-types.md) |
| FeatureEvaluatable subject type & metric eval APIs | [references/metrics/feature-evaluatable.md](references/metrics/feature-evaluatable.md) |
| EvalMetricsSpec, EvalMetricSpec, EvalMetricsResult | [references/metrics/evaluation-specs.md](references/metrics/evaluation-specs.md) |
| Metric seed data examples & evaluation snippets | [references/metrics/examples.md](references/metrics/examples.md) |
| Metric caching (SimpleMetricCacheSpec) | [references/metrics/caching.md](references/metrics/caching.md) |
| MetricUtils, best practices, limitations | [references/metrics/utilities-and-guidance.md](references/metrics/utilities-and-guidance.md) |
| Expression Engine (Filter builder, Expr.eval, StdLib) | [references/expressions/expressions.md](references/expressions/expressions.md) |
| Features & Feature Sets for timeseries (materialization, snapshots, analytics/reporting/ML) | See the `c3-machine-learning` skill, `references/feature-store/` — Feature Sets are **not ML-exclusive** |

## Features & Feature Sets for Timeseries

Feature Sets (Lambda or Metric-based) can materialize timeseries-derived values for analytics dashboards, reporting, or ML training — they are **not an ML-only concept**. Common non-ML use cases include:

- Pre-computing rolling aggregates (averages, sums, counts) that are too expensive to evaluate on the fly
- Snapshotting historical derived signals for audit or point-in-time reporting
- Persisting metric outputs so downstream UI and analytics don't re-evaluate every request

For the full Feature Store API (Lambda Feature Sets, Metric Feature Sets, materialization, snapshots, `evalFeatureSetBatch`), see the `c3-machine-learning` skill — specifically `references/feature-store/feature-store.md` and related files. The skill name is historical; the APIs apply to any use case that benefits from cached, materialized, or snapshotted derived data.

## Instructions

When the user requests time series functionality:

1. **Identify the data category** - Determine if the data is:

   - **Point data** (instant in time): Use `TimedDataPoint` and `TimedDataHeader` mixins
     - Examples: temperature readings, sensor values, status changes
   - **Interval data** (spans a time range): Use `IntervalDataPoint` and `IntervalDataHeader` mixins
     - Examples: billing cycles, energy consumption over periods, production output

2. **Create the header type** - Define a type that mixes the appropriate header:

   ```c3typ
   // For point data
   entity type SensorMeasurementSeries mixes TimedDataHeader<SensorMeasurement> {
     sensor: Sensor
     temperatureUnit: !string
   }

   // For interval data
   entity type UtilityBillSeries mixes IntervalDataHeader<UtilityBill> {
     facility: Facility
     currencyUnit: !string
   }
   ```

3. **Create the data point type** - Define the actual measurements with proper annotations:

   ```c3typ
   @db(datastore='kv', partitionKeyField='parent', persistenceOrder='start')
   entity type SensorMeasurement mixes TimedDataPoint<SensorMeasurementSeries> {
     @ts(treatment='RATE', unitPath="parent.temperatureUnit")
     temperature: double

     @ts(treatment='PREVIOUS')
     status: string
   }
   ```

4. **Choose the correct treatment** - Annotate time series fields with `@ts(treatment='...')` using values from the `AggOp` enum. Run `c3ShowType(AggOp)` in the C3 console for all options. Common choices:

   - Instantaneous values (temperature, speed) → `RATE` or `AVG`
   - Cumulative values (energy, cost, counts) → `INTEGRAL` or `SUM`
   - State that holds until changed → `PREVIOUS`
   - Latest snapshot without carry-forward → `LATEST`

5. **Query normalized data** - Use `tsEval` to query time series:

   ```python
   # Always query normalized.data.<fieldName>
   # Either ids or filter is required to specify which series to query
   ts = c3.SensorMeasurementSeries.tsEval({
       'ids': ['series-1', 'series-2'],
       'projection': 'avg(avg(normalized.data.temperature))',
       'start': '2024-01-01',
       'end': '2024-12-31',
       'interval': 'DAY',
   })
   ```

   ```javascript
   // JavaScript equivalent
   var ts = SensorMeasurementSeries.tsEval({
     ids: ['series-1', 'series-2'],
     projection: 'avg(avg(normalized.data.temperature))',
     start: '2024-01-01',
     end: '2024-12-31',
     interval: 'DAY',
   });
   ```

## Best Practices

- Always annotate time series fields with `@ts(treatment='...')` annotation using `AggOp` enum values
- Establish 1-to-1 mapping between header and data point types
- Use `datastore='kv'` in `@db` annotation for efficient time series storage in configured key value store
- Always query `normalized.data.<fieldName>` in tsEval, never raw `data.<fieldName>`
- Specify `unitPath` to reference units from parent header (e.g., `unitPath="parent.temperatureUnit"`)
- Use `treatmentPath` instead of `treatment` when treatment varies by instance
- Configure normalization behavior on header instances (`interval`, `interpolator`, `overlapHandling`, `duplicateHandling`)
- Use batch normalization (`refreshNormalization()`) after bulk data loading
- Always provide `ids` or `filter` in `tsEval` to specify which series to query
- Use `interval` parameter in `tsEval` to control aggregation level

## Common Pitfalls & Solutions

### Missing @ts Annotation

❌ **Problem:** Time series field not normalizing

```c3typ
temperature: double  // Missing annotation
```

✅ **Solution:** Always annotate with treatment from AggOp enum

```c3typ
@ts(treatment='RATE')
temperature: double
```

### Wrong Treatment Choice

❌ **Problem:** Normalized values are incorrect (too high/low)

✅ **Solution:** Match the treatment to data semantics (see step 4 in Instructions above). For the full list, run `c3ShowType(AggOp)` in the C3 console.

### Missing Aggregation Function in tsEval Projection

❌ **Problem:** Bare field reference without aggregation function

```js
projection: 'normalized.data.temperature'; // Wrong - tsEval requires an aggregation function
```

✅ **Solution:** Always wrap with an aggregation function (`sum`, `avg`, `min`, `max`, etc.)

```js
projection: 'avg(normalized.data.temperature)'; // Correct
projection: 'sum(normalized.data.usage)'; // Correct - use sum for cumulative counts/totals
```

Match the aggregation function to the data semantics:

- Counts/totals (crashes, events, energy) → `sum`
- Instantaneous values (temperature, speed) → `avg`
- Extremes → `min` or `max`

When querying **multiple series** (multiple `ids`), use double aggregation — inner for within each series, outer for across series:

```js
projection: 'sum(avg(normalized.data.temperature))';
//           ^^^  ^^^ inner: avg within each series
//           └── outer: sum across series
```

### Querying Raw Instead of Normalized Data

❌ **Problem:** Queries return messy, un-aggregated data

```js
projection: 'avg(data.temperature)'; // Wrong
```

✅ **Solution:** Always query normalized data

```js
projection: 'avg(normalized.data.temperature)'; // Correct
```

### Using fromObjStream for @ts-Annotated Types

❌ **Problem:** Manually building timeseries with `fromObjStream` for types that already mix `TimedDataPoint`/`IntervalDataPoint` with `@ts` annotations

```js
var data = MyDataPoint.fetch({ filter: "parent.id == 'series-1'" }).objs;
var ts = Timeseries.fromObjStream(data.stream(), spec); // Inefficient - data is already normalized via tsEval
```

✅ **Solution:** Use `tsEval` on the header type - normalization is automatic for `@ts`-annotated fields

```js
var ts = MySeries.tsEval({
  ids: ['series-1'],
  projection: 'avg(normalized.data.value)',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'DAY',
});
```

`fromObjStream` is only for types that do NOT use `TimedDataPoint`/`IntervalDataPoint` mixins.

### Integer Timeseries Before Arithmetic or Rolling

❌ **Problem:** Calling `.rolling()`, `.multiply()`, etc. on an integer `Timeseries<int>` fails or gives wrong results

✅ **Solution:** Convert to double first

```js
var dailyCounts = Athena.candidateOutageCountByDay('-90d');
var rollingAvg = dailyCounts.toDoubleTimeseries().rolling('AVG', -4, 5);
```

### Normalization Failed: numOfNormalizedValues Exceeded maxAllowed

❌ **Problem:** Error message: `Normalization failed since numOfNormalizedValues=700800 exceeded maxAllowed=700800`

✅ **Solution:** The series has too many data points for the configured interval. Either:

- Use a coarser interval (e.g., `HOUR` instead of `MINUTE`)
- Split the data into multiple series
- Increase the limit via `NormalizationConfig` (not recommended for production)

### fetchNormalizedData Failed: Could Not Acquire Lock

❌ **Problem:** Error message: `Could not acquire lock for key`

✅ **Solution:** This occurs when concurrent normalization is attempted on the same series. These errors are re-tryable:

- Retry the query or normalization
- Recover failed jobs from the queue
- For high contention, increase lock attempts:

```javascript
NormalizationConfig.make().setConfigValue('maxLockAttempts', 100);
```

### Unit Not Found in Database

❌ **Problem:** Error message: `Could not find definition of unit in database`

✅ **Solution:** The unit referenced in `unitPath` doesn't exist. Create the unit definition and re-normalize:

```javascript
Unit.make({ id: 'celsius' }).upsert();
MySeries.refreshNormalization({ ids: ['series-1'], force: true, async: false });
```

## Constructing Timeseries from Arrays

Use `Timeseries.fromValues` or `Timeseries.fromObjStream` to create Timeseries objects programmatically.

### Timeseries.fromValues

Create a Timeseries from an array of values with explicit time information.

```javascript
// Basic usage with TimeInfo
var timeInfo = TimeInfo.from('2024-01-01', '2024-01-05', 'DAY');
var ts = Timeseries.fromValues(timeInfo, [1.0, 2.0, 3.0, 4.0], Unit.make({ id: 'celsius' }));

// With TimeseriesInfo (includes missing data handling)
var tsInfo = TimeseriesInfo.from(TimeInfo.from('2024-01-01', '2024-01-05', 'DAY'));
var ts = Timeseries.fromValues(tsInfo, [1.0, 2.0, null, 4.0], Unit.make({ id: 'celsius' }));
// null values are automatically converted to missing data points

// Convert to double timeseries for arithmetic operations
var doubleTs = ts.toDoubleTimeseries();
```

```python
# Python equivalent
time_info = c3.TimeInfo.from('2024-01-01', '2024-01-05', 'DAY')
ts = c3.Timeseries.fromValues(time_info, [1.0, 2.0, 3.0, 4.0], c3.Unit.make({'id': 'celsius'}))
```

### Timeseries.fromObjStream

Convert a stream of persisted objects into a Timeseries. Use this for types that do **not** have `@ts` annotations (see [Using fromObjStream for @ts-Annotated Types](#using-fromobjstream-for-ts-annotated-types) pitfall above).

```javascript
var observations = Observation.fetch({
  filter: "sensor.id == 'sensor-1'",
  order: 'ascending(timestamp)',
}).objs;

var spec = EvalTimeseriesSpec.make({
  start: '2024-01-01',
  end: '2024-01-04',
  interval: 'DAY',
  startExpr: 'timestamp',
  valueExpr: 'value',
  aggFunc: 'AVG',
  overlapHandling: 'AVG',
});

var ts = Timeseries.fromObjStream(observations.stream(), spec);
```

For interval-based data, add `endExpr`:

```javascript
var spec = EvalTimeseriesSpec.make({
  start: '2024-01-01',
  end: '2024-01-31',
  interval: 'DAY',
  startExpr: 'start',
  endExpr: 'end',
  valueExpr: 'usage',
  aggFunc: 'INTEGRAL',
  overlapHandling: 'SUM',
});
```

## Expression Engine Functions

The C3 expression engine (`ExpressionEngineFunction`) provides functions usable in tsEval projections, metric expressions, calc fields, and fetch filters. Run `c3ShowType(ExpressionEngineFunction)` for the full list.

- For projection examples and testing expressions, see [references/timeseries/expression-engine-functions.md](references/timeseries/expression-engine-functions.md)

## Timeseries API Reference

The `Timeseries` type provides member functions for arithmetic, aggregation, time manipulation, and transformation. Run `c3ShowType(Timeseries)` for the full API.

- For a summary of commonly used APIs by category, see [references/timeseries/timeseries-api.md](references/timeseries/timeseries-api.md)

## Quick Reference

### AggOp Treatments (from AggOp.c3typ enum)

| Treatment      | Pandas Equivalent | Description                                        | Example Use Case                                      |
| -------------- | ----------------- | -------------------------------------------------- | ----------------------------------------------------- |
| `PREVIOUS`     | -                 | Latest value carries forward until next point      | Equipment status, alarm state, on/off switches        |
| `EARLIEST`     | first             | First value in interval                            | First reading of the day, opening price               |
| `LATEST`       | last              | Latest value in interval (no carry-forward)        | End-of-period snapshot, closing price                 |
| `AND`          | -                 | Logical AND of boolean values                      | All safety checks passed, all conditions met          |
| `OR`           | -                 | Logical OR of boolean values                       | Any alarm triggered, any threshold exceeded           |
| `COUNT`        | count             | Count of data points in interval                   | Event counts, transaction counts, sensor readings     |
| `ROLLINGCOUNT` | -                 | Rolling count from beginning of data               | Cumulative event tracking, total occurrences          |
| `INTEGRAL`     | sum               | Sum values (for cumulative data like energy)       | Energy consumption, total cost, billing amounts       |
| `SUM`          | sum               | Sum values (same as INTEGRAL)                      | Total sales, aggregated quantities, production output |
| `PROD`         | prod              | Product of values                                  | Compound growth rates, chained multipliers            |
| `RATE`         | mean              | Weighted average (for instantaneous values)        | Temperature, speed, pressure, voltage                 |
| `AVG`          | mean              | Weighted average (same as RATE)                    | Average flow rate, mean power, typical load           |
| `MIN`          | min               | Minimum value in interval                          | Minimum temperature, lowest inventory, floor price    |
| `MAX`          | max               | Maximum value in interval                          | Peak demand, maximum temperature, ceiling price       |
| `STDDEV`       | std               | Standard deviation                                 | Volatility measurement, quality control variance      |
| `VARIANCE`     | var               | Variance                                           | Data spread analysis, risk assessment                 |
| `PERCENTILE`   | -                 | Xth percentile (parameter not supported in pandas) | 95th percentile response time, P90 latency            |
| `MEDIAN`       | median            | Median value                                       | Median price, typical value, central tendency         |

### Normalization Configuration Options (on Header Type)

| Field               | Options                                                                                                      | Default             | Description                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------- | ------------------------------ |
| `interval`          | `SECOND`, `MINUTE`, `FIVE_MINUTE`, `TEN_MINUTE`, `QUARTER_HOUR`, `HALF_HOUR`, `HOUR`, `DAY`, `MONTH`, `YEAR` | Auto-detected       | Normalization interval         |
| `duplicateHandling` | `IGNORE`, `KEEP`                                                                                             | `IGNORE`            | How to handle duplicate points |
| `overlapHandling`   | `AVG`, `SUM`, `MIN`, `MAX`                                                                                   | `AVG`               | How to aggregate overlaps      |
| `interpolator`      | `LINEAR_INTERPOLATOR`, `ZERO_INTERPOLATOR`                                                                   | `ZERO_INTERPOLATOR` | How to fill gaps               |
| `extrapolate`       | `true`, `false`                                                                                              | `false`             | Repeat last value beyond range |
| `timeZone`          | TimeZone string                                                                                              | Source TZ           | Normalize in specific timezone |
| `doNotNormalize`    | `true`, `false`                                                                                              | `false`             | Disable normalization          |
| `bucketInterval`    | Interval enum                                                                                                | Auto                | Storage bucket interval        |

### @ts Annotation Options (on Data Point Fields)

| Option          | Type   | Description                                             |
| --------------- | ------ | ------------------------------------------------------- |
| `treatment`     | string | AggOp enum value (e.g., 'RATE', 'INTEGRAL', 'PREVIOUS') |
| `treatmentPath` | string | Path to treatment field when it varies by instance      |
| `unitPath`      | string | Path to unit field (e.g., "parent.temperatureUnit")     |
| `normalizer`    | string | Custom normalizer type name (must mix `Normalizer`)     |
| `valueMapping`  | Type   | Mapping from code to numeric equivalent                 |

### Common Operations

| Operation               | Code Example                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Create header           | `MySeries.make({id: 'series-1', interval: 'HOUR'}).upsert()`                                           |
| Load data point         | `MyDataPoint.make({start: '2024-01-01', parent: {id: 'series-1'}, value: 42}).upsert()`                |
| Normalize manually      | `MySeries.normalizeTimeseries(MySeries.make({id: 'series-1'}))`                                        |
| Trigger async normalize | `MySeries.triggerNormalizeTimeseries(MySeries.make({id: 'series-1'}))`                                 |
| Batch normalize         | `MySeries.refreshNormalization({ids: ['series-1', 'series-2'], async: true})`                          |
| Query time series       | `MySeries.tsEval({ids: ['series-1'], projection: 'avg(normalized.data.value)', interval: 'DAY', ...})` |
| Check if normalized     | `mySeries.isNormalized('fieldName')`                                                                   |
| Invalidate series       | `MySeries.invalidateTimeseries(['series-1', 'series-2'])`                                              |

### End-to-End Example: Utility Bill Time Series

```c3typ
// Header type - stores metadata about the series
entity type UtilityBillSeries mixes IntervalDataHeader<UtilityBill> {
  currencyUnit: !string
}

// Data point type - stores actual measurements
@db(datastore='kv', partitionKeyField='parent', persistenceOrder='start')
entity type UtilityBill mixes IntervalDataPoint<UtilityBillSeries> {
  @ts(treatment='INTEGRAL', unitPath="parent.currencyUnit")
  usage: !double
}
```

```javascript
// Create header and load data
UtilityBillSeries.make({ id: 'customer-1', currencyUnit: { id: 'dollars' } }).upsert();

UtilityBill.make({
  start: '2024-01-01',
  end: '2024-01-02',
  usage: 50,
  parent: { id: 'customer-1' },
}).upsert();

// Normalize and query
UtilityBillSeries.normalizeTimeseries(UtilityBillSeries.make({ id: 'customer-1' }));

var ts = UtilityBillSeries.tsEval({
  projection: 'sum(normalized.data.usage)',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'MONTH',
  filter: "id == 'customer-1'",
});
```
