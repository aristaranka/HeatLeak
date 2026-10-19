# Timeseries API Reference

The `Timeseries` type provides member functions for arithmetic, aggregation, time manipulation, and transformation.

- **Full API**: Run `c3ShowType(Timeseries)` in the C3 console
- **Platform docs**: Search for "Time Series" in the C3 AI Platform documentation

## Commonly Used APIs

| Category        | Methods                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| Data access     | `data()`, `expandedData()`, `count()`, `isEmpty()`, `missing()`, `valueAt(i)`, `timeInfo()`                         |
| Arithmetic      | `add(ts)`, `subtract(ts)`, `multiply(ts)`, `divide(ts)`, `pow(n)`, `negate()`, `abs()`, `sqrt()`, `log()`, `exp()`  |
| Aggregation     | `sum([ts])`, `avg([ts])`, `min([ts])`, `max([ts])`, `aggregate(aggOp)`, `stat(fn)`, `rollup(tsArr, stat)`           |
| Time ops        | `toInterval(interval, aggOp)`, `slice(start, end)`, `extend(start, end)`, `shift(start)`, `convertToTimeZone(tz)`   |
| Rolling         | `rolling(aggOp, offset, span, step)`, `rollingDiff(threshold)`                                                      |
| Transform       | `scaleMinMax(min, max)`, `scaleStandard()`, `interpolate(type, performOn)`, `fillMissing(val)`, `convertToUnit(id)` |
| Boolean/compare | `not()`, `ternary(trueVal, falseVal)`, `equality(ts, op)`, `exists()`                                               |
| Construction    | `fromValues(timeInfo, values, unit)`, `fromObjStream(objs, spec)`, `randomTimeseries(ti, lo, hi)`                   |

## Examples

### Data Access

```javascript
// tsEval returns a Timeseries directly
var ts = MySeries.tsEval({
  ids: ['series-1'],
  projection: 'avg(normalized.data.temperature)',
  start: '2024-01-01',
  end: '2024-01-31',
  interval: 'DAY',
});

ts.data(); // raw data array, e.g. [22.5, 23.1, null, 21.8, ...]
ts.count(); // number of data points, e.g. 31
ts.isEmpty(); // false
ts.missing(); // boolean array: [false, false, true, false, ...]
ts.timeInfo(); // { start: '2024-01-01', end: '2024-01-31', interval: 'DAY' }
ts.valueAt(0); // first value, e.g. 22.5
```

### Arithmetic

```javascript
var power = MySeries.tsEval({
  ids: ['power-series'],
  projection: 'avg(normalized.data.power)',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'HOUR',
});
var price = MySeries.tsEval({
  ids: ['price-series'],
  projection: 'avg(normalized.data.price)',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'HOUR',
});

var cost = power.multiply(price); // element-wise cost = power * price
var delta = power.subtract(price); // difference between two series
var absDelta = delta.abs(); // absolute values
var logTransformed = power.log(); // natural log of each value
```

### Aggregation & Multi-Series (Double Aggregation)

When querying multiple series via `ids`, `tsEval` requires **double aggregation**:

- **Inner function** — aggregates data points _within_ each individual series (e.g., hourly → daily)
- **Outer function** — aggregates _across_ the multiple series into a single result

```javascript
// Double aggregation: avg across series, sum within each series
var campusTotal = BuildingEnergySeries.tsEval({
  ids: ['building-1', 'building-2', 'building-3'],
  projection: 'avg(sum(normalized.data.energy))',
  //           ^^^  ^^^
  //           |    └─ inner: sum hourly points within each building's series
  //           └────── outer: average across the 3 buildings
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'DAY',
});

// Sum across all series, avg within each
var totalEnergy = BuildingEnergySeries.tsEval({
  ids: ['building-1', 'building-2', 'building-3'],
  projection: 'sum(avg(normalized.data.energy))',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'DAY',
});

// Single series — only inner aggregation needed
var singleBuilding = BuildingEnergySeries.tsEval({
  ids: ['building-1'],
  projection: 'avg(normalized.data.energy)',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'DAY',
});
```

Post-hoc operations on Timeseries objects:

```javascript
var ts = MySeries.tsEval({
  ids: ['series-1'],
  projection: 'avg(normalized.data.temperature)',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'DAY',
});

// Single timeseries stats
var total = ts.stat('SUM'); // scalar sum as a single-point timeseries
var average = ts.stat('AVG'); // scalar average
var peak = ts.stat('MAX'); // scalar max

// Combine multiple Timeseries objects element-wise (outside of tsEval)
var ts1 = MySeries.tsEval({
  ids: ['building-1'],
  projection: 'sum(normalized.data.energy)',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'DAY',
});
var ts2 = MySeries.tsEval({
  ids: ['building-2'],
  projection: 'sum(normalized.data.energy)',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'DAY',
});
var ts3 = MySeries.tsEval({
  ids: ['building-3'],
  projection: 'sum(normalized.data.energy)',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'DAY',
});

var totalAcrossBuildings = ts1.sum([ts2, ts3]); // element-wise sum
var avgAcrossBuildings = ts1.avg([ts2, ts3]); // element-wise average

// Rollup: aggregate an array of timeseries into one
var campus = Timeseries.rollup([ts1, ts2, ts3], 'SUM');
```

### Time Operations

```javascript
// Downsample hourly data to daily
var hourlyTs = MySeries.tsEval({
  ids: ['series-1'],
  projection: 'avg(normalized.data.temperature)',
  start: '2024-01-01',
  end: '2024-01-31',
  interval: 'HOUR',
});
var dailyAvg = hourlyTs.toInterval('DAY', 'AVG');
var dailyMax = hourlyTs.toInterval('DAY', 'MAX');

// Slice a subset of the timeseries
var dailyTs = MySeries.tsEval({
  ids: ['series-1'],
  projection: 'avg(normalized.data.temperature)',
  start: '2024-01-01',
  end: '2024-03-31',
  interval: 'DAY',
});
var janOnly = dailyTs.slice('2024-01-01', '2024-01-31');

// Extend to cover a wider range (pads with missing)
var extended = dailyTs.extend('2023-12-01', '2024-02-28');

// Convert timezone
var localTs = dailyTs.convertToTimeZone(TimeZone.fromId('America/New_York'));
```

### Rolling & Window

```javascript
var dailyTs = MySeries.tsEval({
  ids: ['series-1'],
  projection: 'avg(normalized.data.temperature)',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'DAY',
});

// 7-day rolling average (centered window: 3 before, 3 after + current)
var rollingAvg = dailyTs.rolling('AVG', -3, 7);

var hourlyTs = MySeries.tsEval({
  ids: ['series-1'],
  projection: 'sum(normalized.data.power)',
  start: '2024-01-01',
  end: '2024-01-31',
  interval: 'HOUR',
});

// 24-hour rolling sum
var rolling24hSum = hourlyTs.rolling('SUM', -23, 24);

// Rolling diff for meter readings (detects resets with threshold)
var meterTs = MeterSeries.tsEval({
  ids: ['meter-1'],
  projection: 'sum(normalized.data.reading)',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'HOUR',
});
var consumption = meterTs.rollingDiff(1000000);
```

### Transform

```javascript
var ts = MySeries.tsEval({
  ids: ['series-1'],
  projection: 'avg(normalized.data.temperature)',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'DAY',
});

// Fill missing values with 0
var filled = ts.fillMissing(0);

// Linear interpolation over gaps
var interpolated = ts.interpolate('LINEAR', 'MISSING');

// Normalize to 0-1 range
var normalized = ts.scaleMinMax(0, 1);

// Standardize (z-score: mean=0, stddev=1)
var standardized = ts.scaleStandard();

// Convert units (e.g., kWh to MWh)
var inMWh = ts.convertToUnit('megawatt_hour');
```

### Boolean & Comparison

```javascript
var temperature = MySeries.tsEval({
  ids: ['series-1'],
  projection: 'avg(normalized.data.temperature)',
  start: '2024-01-01',
  end: '2024-01-31',
  interval: 'DAY',
});

// Create a constant threshold timeseries for comparison
var threshold = Timeseries.fromValues(temperature.timeInfo(), Array(temperature.count()).fill(30));

// Compare element-wise
var isAboveThreshold = temperature.equality(threshold, 'GT'); // > 30

// Negate boolean timeseries
var isBelowThreshold = isAboveThreshold.not();

// Conditional: pick one value when condition is true, another otherwise
var highLabel = Timeseries.fromValues(temperature.timeInfo(), Array(temperature.count()).fill(1));
var lowLabel = Timeseries.fromValues(temperature.timeInfo(), Array(temperature.count()).fill(0));
var labels = isAboveThreshold.ternary(highLabel, lowLabel);

// Check which points have data
var availability = temperature.exists(); // 1.0 where data exists, 0.0 where missing
```

### Construction (static)

```javascript
// Create from explicit values
var ti = TimeInfo.from('2024-01-01', '2024-01-05', 'DAY');
var ts = Timeseries.fromValues(ti, [10, 20, 30, 40, 50]);

// Create from database objects (e.g., Observation type with timestamp/value)
var observations = Observation.fetch({
  filter: "sensor.id == 'sensor-1'",
  order: 'ascending(timestamp)',
}).objs;
var spec = EvalTimeseriesSpec.make({
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'HOUR',
  startExpr: 'timestamp',
  valueExpr: 'value',
  aggFunc: 'AVG',
  overlapHandling: 'AVG',
});
var ts = Timeseries.fromObjStream(observations.stream(), spec);

// Random timeseries (useful for testing)
var testTs = Timeseries.randomTimeseries(ti, 0, 100);
```
