# Expression Engine Functions for Timeseries

The C3 expression engine (`ExpressionEngineFunction`) provides functions usable in tsEval projections, metric expressions, calc fields, and fetch filters.

- **Full function list**: Run `c3ShowType(ExpressionEngineFunction)` in the C3 console
- **Platform docs**: Search for "Expression Engine Functions" in the C3 AI Platform documentation
- **Custom functions**: Search for "Custom Expression Engine Function" in the C3 AI Platform documentation

## Key Examples in tsEval Projections

```javascript
// Aggregation
MySeries.tsEval({
  ids: ['series-1'],
  projection: 'avg(normalized.data.temperature)',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'MONTH',
});

// Rolling average (moving window of 24 points)
MySeries.tsEval({
  ids: ['series-1'],
  projection: 'rolling("AVG", sum(normalized.data.power), -24, 24)',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'HOUR',
});

// Rolling diff (difference between consecutive points, e.g., meter readings)
MySeries.tsEval({
  ids: ['series-1'],
  projection: 'rollingDiff(sum(normalized.data.meterReading))',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'DAY',
});

// Fill missing values
MySeries.tsEval({
  ids: ['series-1'],
  projection: 'fillMissing(avg(normalized.data.temperature), 0)',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'DAY',
});

// Interpolate gaps linearly
MySeries.tsEval({
  ids: ['series-1'],
  projection: 'interpolate(avg(normalized.data.temperature), "LINEAR", "MISSING")',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'HOUR',
});
```

## Testing Expressions Interactively

```javascript
Expr.eval('abs(-42)'); // 42
Expr.eval('dateTime("2024-01-01")'); // datetime object
Expr.eval('round(3.14159, 2)'); // 3.14
```
