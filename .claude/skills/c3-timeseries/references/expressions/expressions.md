# C3 AI Expression Engine

The C3 Expression Engine powers filters, metrics, calc fields, and data transformations. It provides a rich expression language with the `Filter` builder, `Expr` evaluation, `Metric` types, and the `StdLib` collection API.

## Quick Reference

| Operation           | Code                                                |
| ------------------- | --------------------------------------------------- |
| Evaluate expression | `Expr.eval('1 + 2', null, 'int')`                   |
| Build filter        | `Filter.eq('status', 'active')`                     |
| Parse expression    | `Expr.parse('a + b')`                               |
| Compile expression  | `Expr.parse('expr').compile(inputType, outputType)` |
| Validate            | `Expr.validate('expr')`                             |
| Eval metrics        | `type.evalMetrics(spec)`                            |

## Filter Builder

`Filter` provides a fluent API for building type-safe filter expressions:

### Comparison

```javascript
Filter.eq('status', 'active'); // status == 'active'
Filter.ne('status', 'deleted'); // status != 'deleted'
Filter.gt('count', 10); // count > 10
Filter.ge('count', 10); // count >= 10
Filter.lt('createdAt', cutoffDate); // createdAt < cutoffDate
Filter.le('priority', 5); // priority <= 5
```

### String Matching

```javascript
Filter.contains('name', 'test'); // name contains 'test'
Filter.containsIgnoreCase('name', 'test');
Filter.startsWith('path', '/api/');
Filter.endsWith('file', '.json');
```

### Collection/Existence

```javascript
Filter.exists('email'); // email is not null
Filter.intersects('id', ['a', 'b', 'c']); // id IN ('a','b','c')
```

### Logical Operators

```javascript
// and() / or() are MEMBER functions - chain them
Filter.eq('status', 'active').and(Filter.gt('priority', 5));

Filter.eq('type', 'A').or(Filter.eq('type', 'B'));

// not() is a 0-arg member function on Filter.inst()
Filter.inst().not().eq('deleted', true);
```

### Nested / Chained

```javascript
Filter.eq('status', 'active').and().gt('priority', 5).and().exists('assignee');
```

### Time Range

```javascript
Filter.ge('createdAt', startDate).and().le('createdAt', endDate);
```

### Match All Fields

```javascript
Filter.matchAllFields(MyType.make({ status: 'active', priority: 5 }));
```

## Expr - Expression Evaluation

### Basic Evaluation

```javascript
// Minimum 3 args: expr, in (context obj or null), outType
Expr.eval('1 + 2', null, 'int'); // 3

// With variables (4-arg: expr, input, vars, outType)
Expr.eval('a * b', null, { a: 3, b: 4 }, 'double'); // 12

// With input object
Expr.eval('name + " - " + status', myObj, 'string');
```

### Compile for Performance

```javascript
// compile() is a MEMBER function on a parsed Expr
var compiled = Expr.parse('price * quantity').compile(MyType, 'double');
var result = compiled.eval(myObj);
```

### Parse and Inspect

```javascript
var expr = Expr.parse('a + b * c');
expr.isConst(); // false
expr.constValue(); // null
```

### Literal Values

```javascript
// Quote values for use in expressions
var literal = Expr.literal("O'Brien"); // properly escaped
```

## Metrics

### SimpleMetric

SimpleMetrics are entity types that mix `SimpleMetric`. Each defines a calculation on a source entity type using `~=` to override inherited fields:

```c3typ
entity type Consumption_FixedAsset mixes SimpleMetric {
  srcType: ~= 'FixedAsset'
  path: ~= "measurements.(metricName == 'ElectricityConsumption')"
  expression: ~= 'sum(sum(normalized.data.quantity))'
}
```

Expressions navigate **field paths** (lowercase) from the `path` endpoint or from `srcType` directly:

```c3typ
entity type GrossFloorArea_FixedAsset mixes SimpleMetric {
  srcType: ~= 'FixedAsset'
  expression: ~= 'sum(sum(grossFloorArea.normalized.data.quantity))'
}
```

### CompoundMetric

CompoundMetrics are entity types that mix `CompoundMetric`, composing SimpleMetrics (or other CompoundMetrics) by referencing their **names** in expressions:

```c3typ
entity type ElectricityConsumptionPerSquareFoot mixes CompoundMetric {
  expression: ~= 'validMetricWattHour / validMetricProductionUnit'
}
```

```javascript
// List underlying simple metrics (static: expression, sourceType)
CompoundMetric.listSimpleMetrics('validMetricWattHour / validMetricProductionUnit', FixedAsset);
```

### Evaluate Metrics

The `expressions` field takes metric **names** (matching SimpleMetric or CompoundMetric `name` fields):

```javascript
var result = FixedAsset.evalMetrics(
  EvalMetricsSpec.make({
    ids: ['asset-1', 'asset-2'],
    expressions: ['Consumption', 'GrossFloorArea'],
    start: '2024-01-01',
    end: '2024-12-31',
    interval: 'MONTH',
    continueOnError: true,
  })
);

// Access results (metricName first, then srcId)
var ts = result.timeseries('Consumption', 'asset-1');
result.allTimeseries(); // flat array of all timeseries
result.errors; // per-metric errors
```

### EvalMetricsSpec Fields

| Field             | Type               | Description                                      |
| ----------------- | ------------------ | ------------------------------------------------ |
| `expressions`     | `!set<string>`     | Metric names to evaluate                         |
| `ids`             | `set<string>`      | Entity IDs to evaluate                           |
| `filter`          | `string`           | Filter for entities (alternative to `ids`)       |
| `start`           | `!datetime`        | Evaluation start date                            |
| `end`             | `!datetime`        | Evaluation end date                              |
| `interval`        | `!string`          | Interval: DAY, MONTH, YEAR, etc. (default: DAY)  |
| `continueOnError` | `boolean`          | Don't fail on individual errors (default: false) |
| `explain`         | `boolean`          | Include evaluation plan                          |
| `bindings`        | `map<string, any>` | Variable bindings                                |

## StdLib Collection API

The `StdLib` provides a rich functional API available on all C3 collections:

### Transform

```javascript
array.map(fn); // Transform each element
array.mapToStr(fn); // Transform to string array
array.flatMap(fn); // Transform and flatten
array.filter(fn); // Keep matching elements
array.reject(fn); // Remove matching elements
array.compact(); // Remove nulls
array.unique(); // Remove duplicates
array.sorted(fn); // Sort elements
array.slice(start, end); // Sub-array
array.batch(size); // Split into batches
array.partition(fn); // Split by predicate into [match, nonMatch]
```

### Access

```javascript
array.at(index); // Element at index
array.first(); // First element
array.last(); // Last element
array.only(); // Single element (error if not exactly 1)
array.findAny(fn); // First matching element
```

### Test

```javascript
array.contains(element); // Contains element
array.containsAll(fn); // All match predicate
array.containsAny(fn); // Any matches predicate
array.isEmpty(); // Is empty
```

### Aggregate

```javascript
array.count(); // Count elements
array.sum(fn); // Sum values
array.avg(fn); // Average
array.min(fn); // Minimum
array.max(fn); // Maximum
array.median(fn); // Median
array.percentile(fn, p); // Percentile
array.stddev(fn); // Standard deviation
array.variance(fn); // Variance
array.prod(fn); // Product
array.fold(init, fn); // Left fold/reduce
```

### Statistics

```javascript
array.leastSquares(xFn, yFn); // Linear regression
array.cusum(fn); // Cumulative sum
array.histogram(fn, bins); // Histogram
array.summarize(fn); // Statistical summary
array.downsample(fn, n); // Reduce to n elements
```

### Iteration

```javascript
array.each(fn); // Iterate (void)
array.eachWhile(fn); // Iterate until false
array.stream(); // Convert to stream
```

## Arithmetic with Null/NaN

C3 has specific rules for arithmetic with null and NaN:

- **null operands**: Return the other operand (`null + 5 = 5`, `null * 3 = 3`)
- **NaN propagates**: `NaN + 5 = NaN`, `NaN * 3 = NaN`
- **Comparison with null/NaN**: Returns false

## Best Practices

- Use `Filter` builder instead of raw string expressions for type safety
- Compile expressions with `Expr.parse('expr').compile()` when evaluating repeatedly
- Use `continueOnError: true` in `EvalMetricsSpec` for batch operations
- Use `StdLib` methods instead of manual loops for cleaner code
- Use `fetchCount()` instead of `fetch().count` for counting
- Filter fields don't need to be in the `include` string

## Common Anti-Patterns

1. **String concatenation for filters** - use `Filter` builder instead
2. **Re-parsing expressions in loops** - use `Expr.parse('expr').compile()` once
3. **Manual iteration** - use `StdLib` map/filter/fold
4. **Ignoring null semantics** - null arithmetic may surprise you

## Detailed Reference

- For the complete expression function list, see the `ExpressionEngineFunction` type hierarchy in the C3 platform
