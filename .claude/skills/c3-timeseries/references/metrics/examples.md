# Metric Definition and Evaluation Examples

Use these examples when authoring seed data, validating metric definitions, or testing evaluation APIs from JavaScript.

## Defining Metrics

### Expression Metric (Seed Data)

Expressions navigate through **field paths** (lowercase) from the `srcType` or from the path endpoint:

```json
{
  "id": "Consumption_FixedAsset",
  "name": "Consumption",
  "srcType": "FixedAsset",
  "path": "measurements.(metricName == 'ElectricityConsumption')",
  "expression": "sum(sum(normalized.data.quantity))"
}
```

Without `path`, the expression navigates from `srcType` fields directly:

```json
{
  "id": "GrossFloorArea_FixedAsset",
  "name": "GrossFloorArea",
  "srcType": "FixedAsset",
  "expression": "sum(sum(grossFloorArea.normalized.data.quantity))"
}
```

### TSDecl Metric (Seed Data)

```json
{
  "id": "ValidMetricWithTSDecl_FixedAsset",
  "name": "ValidMetricWithTSDecl",
  "srcType": "FixedAsset",
  "path": "timeseries.(metricName == 'ElectricityConsumption')",
  "tsDecl": {
    "data": "data",
    "treatment": "INTEGRAL",
    "start": "start",
    "end": "end",
    "value": "quantity"
  }
}
```

### Verifying SimpleMetrics

```javascript
// List all registered SimpleMetrics
SimpleMetric.metrics();

// Lookup a specific metric by id
SimpleMetric.metricForId('Consumption_FixedAsset');

// Check if a metric definition is valid (throws on invalid if true)
SimpleMetric.metricForId('Consumption_FixedAsset').isValid(true);

// List all metrics (simple + compound) for the subject type
FixedAsset.listMetrics();

// Split by kind
FixedAsset.listMetricsByKind();
// Returns: { simpleMetrics: [...], compoundMetrics: [...] }
```

### CompoundMetric (Seed Data)

CompoundMetric expressions reference `SimpleMetric` or `CompoundMetric` **names** rather than ids or field paths:

```json
{
  "id": "ElectricityConsumptionPerSquareFoot",
  "name": "ElectricityConsumptionPerSquareFoot",
  "expression": "validMetricWattHour / validMetricProductionUnit"
}
```

### With Variables

```json
{
  "id": "validIndicatorWithBinding",
  "name": "validIndicatorWithBinding",
  "expression": "validMetric * staticMultiplier",
  "variables": [{ "name": "staticMultiplier", "dataType": "integer", "description": "It is just a static multiplier" }]
}
```

### Verifying CompoundMetrics

```javascript
// Validate a compound metric expression against a source type
CompoundMetric.isValid(
  CompoundMetric.make({ expression: 'validMetricWattHour / validMetricProductionUnit' }),
  FixedAsset
);

// List all SimpleMetrics referenced by a CompoundMetric expression
CompoundMetric.listSimpleMetrics('ElectricityConsumptionPerSquareFoot', FixedAsset);

// List SimpleMetric ids referenced
CompoundMetric.listSimpleMetricsIds('ElectricityConsumptionPerSquareFoot', FixedAsset);

// Get full descendant tree of a compound expression
CompoundMetric.getDescendants('ElectricityConsumptionPerSquareFoot', FixedAsset);
```

## Evaluating Metrics

### JavaScript

```javascript
// Single metric
var ts = FixedAsset.evalMetric(
  EvalMetricSpec.make({
    expression: 'validMetric',
    id: 'asset-1',
    start: '2024-01-01',
    end: '2024-12-31',
    interval: 'MONTH',
  })
);

// Multiple metrics on multiple subjects
var result = FixedAsset.evalMetrics(
  EvalMetricsSpec.make({
    expressions: ['validMetric', 'Consumption'],
    ids: ['asset-1', 'asset-2'],
    start: '2024-01-01',
    end: '2024-12-31',
    interval: 'MONTH',
  })
);

// Access results (metricName first, then srcId)
var ts = result.timeseries('validMetric', 'asset-1');

// With filter instead of ids
var result = FixedAsset.evalMetrics(
  EvalMetricsSpec.make({
    expressions: ['validMetric'],
    filter: "status == 'active'",
    start: '2024-01-01',
    end: '2024-12-31',
    interval: 'MONTH',
  })
);

// With variable bindings
var result = FixedAsset.evalMetrics(
  EvalMetricsSpec.make({
    expressions: ['validMetricWithBinding'],
    ids: ['asset-1'],
    start: '2024-01-01',
    end: '2024-12-31',
    interval: 'MONTH',
    bindings: { staticMultiplier: 7.0 },
  })
);

// With explain
var result = FixedAsset.evalMetrics(
  EvalMetricsSpec.make({
    expressions: ['validMetric'],
    ids: ['asset-1'],
    start: '2024-01-01',
    end: '2024-12-31',
    interval: 'DAY',
    explain: true,
  })
);
// result.evalPlan contains the execution plan

// Rollup
var rolled = FixedAsset.rollupMetric(
  RollupMetricSpec.make({
    expressions: ['validMetric'],
    ids: ['asset-1'],
    start: '2024-01-01',
    end: '2024-12-31',
    interval: 'MONTH',
    rollupFunc: 'SUM',
  })
);
```
