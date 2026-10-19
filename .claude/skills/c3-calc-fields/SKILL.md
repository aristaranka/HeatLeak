---
name: c3-calc-fields
description: |
  Define and use calc fields in C3 AI entity types. Calc fields are computed fields that automatically calculate values based on expressions. Use this skill when creating new calc fields (stored or non-stored), working with collection filtering in calc expressions, using aggregation functions, creating custom ExpressionEngineFunction types, debugging calc field performance, or understanding stored vs non-stored trade-offs.
core: true
category: platform
version: 8.9.0
minimumVersion: 8.7.0
---

# C3 Calc Fields

Calc fields are computed fields in C3 entity types that automatically calculate values based on expressions.

## Quick Reference

### Syntax

```c3typ
// Stored calc - persisted to database
fieldName: type stored calc expression

// Non-stored calc - computed on-the-fly
fieldName: type calc expression
```

### When to Use Each

| Type          | Use When                                                               | Example                                     |
| ------------- | ---------------------------------------------------------------------- | ------------------------------------------- |
| `stored calc` | Frequently accessed, expensive computations, needed in filters/queries | `eventCount: int stored calc count(events)` |
| `calc`        | Simple transformations, infrequently accessed, always need fresh value | `displayName: string calc upperCase(name)`  |

## Common Patterns

### Simple Field Reference

```c3typ
resource: Resource stored calc servicePoint.resource
```

### Arithmetic Operations

```c3typ
totalTokens: int stored calc inputTokens + outputTokens
```

### Conditional Logic

```c3typ
calcField: int stored calc exists(value) ? value : defaultValue
latestAlert: Alert stored calc exists(alerts) ? alerts[0] : null
```

### Collection Filtering & Aggregation

```c3typ
// Count with filter - use .(condition) syntax
unplannedEvents: int stored calc count(events.(eventCode == "f1"))

// Max/Min/Sum over collection
riskScore: double stored calc max(components.riskScore)

// Flatten nested collections
alerts: [Alert] stored calc components.alerts

// Get unique values as set
uniqueCodes: set<string> stored calc unique(components.code.description)
```

### Array Indexing with Filters

```c3typ
// Get first element matching condition
currentFixture: Fixture stored calc fixtureHistory[0].(end == null).to

// Get latest from ordered collection (requires @db(order=...))
currentPrediction: Prediction stored calc predictions[0]
```

### String Manipulation

```c3typ
displayName: string calc upperCase(name)
fullName: string stored calc concat(firstName, " ", lastName)
```

### Date/Time Calculations

```c3typ
// Calculate age in days
caseAge: int stored calc (status == 'Open') ?
  (now() - createdTimestamp) / (24 * 60 * 60 * 1000) :
  (closedTimestamp - createdTimestamp) / (24 * 60 * 60 * 1000)
```

## Built-in Expression Functions

### Aggregation

- `count(collection)` - Count items
- `sum(collection.field)` - Sum numeric values
- `max(collection.field)` - Maximum value
- `min(collection.field)` - Minimum value
- `avg(collection.field)` - Average value
- `latest(field1, field2, ...)` - Latest non-null value
- `latestValue(collection.field)` - Latest value from collection
- `unique(collection.field)` - Get unique values as set

### String

- `upperCase(string)` - Convert to uppercase
- `lowerCase(string)` - Convert to lowercase
- `concat(s1, s2, ...)` - Concatenate strings
- `join(collection, separator)` - Join array to string

### Conditional

- `exists(field)` - Check if field is not null
- Ternary: `condition ? trueValue : falseValue`

### Math

- `round(number)` - Round to integer
- Basic operators: `+`, `-`, `*`, `/`

### Date/Time

- `now()` - Current timestamp

## Custom Expression Engine Functions

For complex logic not supported by built-in functions, create a custom ExpressionEngineFunction:

```c3typ
// Define the function type
type MyType.ExpressionEngineFunction mixes ExpressionEngineFunction {
  calculateComplexValue: function(id: !string): !int js-rhino
}

// Use in calc field
entity type MyType {
  complexValue: int calc calculateComplexValue(id)
}
```

Implementation in `.js`:

```javascript
function calculateComplexValue(id) {
  var obj = MyType.forId(id).get('this, relatedField.this');
  // Complex logic here
  return result;
}
```

## Important Considerations

### Stored Calc on KV-Store Types

**Avoid stored calc fields on key-value store types.** KV-store data is high-volume and frequently invalidated, causing the `CalcFieldsQueue` to become congested. Use a pre-compute job instead.

### Collection Ordering for Array Access

When using `collection[0]`, ensure the collection has an `@db(order=...)` annotation:

```c3typ
@db(order='descending(timestamp)')
history: [HistoryRecord](parent)

latest: HistoryRecord stored calc history[0]
```

### Nullable Calc Fields

Use `?` prefix for nullable results:

```c3typ
maybeNull: ?int stored calc possiblyNullField + otherField
```

## Detailed Reference

For comprehensive examples and advanced patterns, see:

- [references/examples.md](references/examples.md) - Real-world examples from the codebase
- [references/expression-functions.md](references/expression-functions.md) - Complete function reference
