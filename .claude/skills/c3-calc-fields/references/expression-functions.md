# Expression Engine Functions Reference

Complete reference for functions available in calc field expressions.

## Table of Contents

- [Aggregation Functions](#aggregation-functions)
- [String Functions](#string-functions)
- [Conditional Functions](#conditional-functions)
- [Math Functions](#math-functions)
- [Date/Time Functions](#datetime-functions)
- [Collection Operations](#collection-operations)
- [Creating Custom Functions](#creating-custom-functions)

## Aggregation Functions

### count(collection)

Count items in a collection, optionally with a filter.

```c3typ
// Count all items
itemCount: int stored calc count(items)

// Count with filter condition
activeCount: int stored calc count(items.(status == "Active"))
```

### sum(collection.field)

Sum numeric values from a collection.

```c3typ
totalValue: double stored calc sum(orders.amount)
totalWithFilter: double stored calc sum(orders.(status == "Paid").amount)
```

### max(collection.field)

Get the maximum value from a collection.

```c3typ
highestScore: double stored calc max(components.score)
peakTemperature: double stored calc max(readings.temperature)
```

### min(collection.field)

Get the minimum value from a collection.

```c3typ
lowestScore: double stored calc min(components.score)
minTemperature: double stored calc min(readings.temperature)
```

### avg(collection.field)

Calculate the average of numeric values.

```c3typ
averageScore: double stored calc avg(reviews.rating)
meanTemperature: double stored calc avg(readings.temperature)
```

### latest(field1, field2, ...)

Get the most recent non-null value from multiple fields.

```c3typ
lastUpdated: datetime stored calc latest(field1.updated, field2.updated, field3.updated)
```

### latestValue(collection.field)

Get the latest value from a time-ordered collection field.

```c3typ
currentStatus: string calc latestValue(statusHistory.value)
latestReading: double calc latestValue(measurements.value)
```

### unique(collection.field)

Get unique values as a set.

```c3typ
uniqueCategories: set<string> stored calc unique(items.category)
distinctCodes: set<string> stored calc unique(components.code.name)
```

## String Functions

### upperCase(string)

Convert string to uppercase.

```c3typ
upperName: string calc upperCase(name)
normalizedCode: string stored calc upperCase(productCode)
```

### lowerCase(string)

Convert string to lowercase.

```c3typ
lowerName: string calc lowerCase(name)
normalizedEmail: string stored calc lowerCase(email)
```

### concat(s1, s2, ...)

Concatenate multiple strings.

```c3typ
fullName: string stored calc concat(firstName, " ", lastName)
displayId: string stored calc concat("ID-", id)
formattedAddress: string stored calc concat(street, ", ", city, ", ", state)
```

### join(collection, separator)

Join array elements into a single string.

```c3typ
displayGroups: string calc join(groups, ', ')
tagList: string calc join(tags, ' | ')
```

## Conditional Functions

### exists(field)

Check if a field is not null. Returns boolean.

```c3typ
hasManager: boolean stored calc exists(manager)
hasEmail: boolean stored calc exists(contactInfo.email)
```

### Ternary Operator

`condition ? trueValue : falseValue`

```c3typ
// Simple null check
displayName: string calc exists(nickname) ? nickname : name

// Multiple conditions
status: string calc (score > 90) ? "Excellent" : ((score > 70) ? "Good" : "Needs Improvement")

// Safe array access
latest: Item stored calc exists(items) ? items[0] : null
```

## Math Functions

### round(number)

Round a number to the nearest integer.

```c3typ
roundedScore: int calc round(rawScore)
scaledValue: int calc round(value * 100)
```

### Basic Operators

Standard arithmetic operators: `+`, `-`, `*`, `/`

```c3typ
total: int stored calc quantity * price
difference: double stored calc endValue - startValue
percentage: double stored calc (part / total) * 100
combined: int stored calc fieldA + fieldB + fieldC
```

## Date/Time Functions

### now()

Get the current timestamp.

```c3typ
// Calculate age in milliseconds
ageMs: long stored calc now() - createdTimestamp

// Calculate age in days
ageDays: int stored calc (now() - createdTimestamp) / (24 * 60 * 60 * 1000)

// Conditional based on time
isRecent: boolean calc (now() - lastUpdated) < (7 * 24 * 60 * 60 * 1000)
```

### Date Arithmetic

Dates are represented as milliseconds. Use division for conversions:

```c3typ
// Milliseconds in common time units
// 1 second = 1000
// 1 minute = 60 * 1000 = 60000
// 1 hour = 60 * 60 * 1000 = 3600000
// 1 day = 24 * 60 * 60 * 1000 = 86400000

durationDays: int stored calc (endDate - startDate) / 86400000
durationHours: int stored calc (endDate - startDate) / 3600000
```

## Collection Operations

### Filter Syntax: .(condition)

Filter collections inline using dot-parenthesis syntax.

```c3typ
// Single condition
activeItems: [Item] stored calc items.(status == "Active")

// Multiple conditions with AND
filteredItems: [Item] stored calc items.(status == "Active" && priority > 5)

// Multiple conditions with OR
urgentItems: [Item] stored calc items.(priority == "High" || priority == "Critical")

// Nested field access
matchingItems: [Item] stored calc items.(category.name == "Electronics")
```

### Array Indexing

Access specific elements in ordered collections.

```c3typ
// Requires @db(order=...) on the collection field
@db(order='descending(timestamp)')
history: [HistoryRecord](parent)

// Get first (most recent) element
latest: HistoryRecord stored calc history[0]

// Combine with filter
latestActive: HistoryRecord stored calc history[0].(status == "Active")

// Safe access with exists check
safeLatest: HistoryRecord stored calc exists(history) ? history[0] : null
```

### Flatten Nested Collections

Access fields through nested relationships.

```c3typ
// Get all alerts from all components
allAlerts: [Alert] stored calc components.alerts

// Get specific field from nested collection
allCodes: [string] stored calc components.code.name

// Chain multiple levels
allDescriptions: [string] stored calc departments.employees.skills.description
```

## Creating Custom Functions

When built-in functions are insufficient, create custom ExpressionEngineFunction types.

### Step 1: Define Function Type

```c3typ
type MyEntity.ExpressionEngineFunction mixes ExpressionEngineFunction {
  /**
   * Calculate a complex value
   * @param id
   *         The entity ID
   * @return The calculated result
   */
  calculateComplexValue: function(id: !string): !int js-rhino

  /**
   * Format a display string
   * @param id
   *         The entity ID
   * @return Formatted string
   */
  formatDisplayString: function(id: !string): !string js-rhino
}
```

### Step 2: Use in Entity Type

```c3typ
entity type MyEntity {
  // Reference custom function in calc expression
  complexValue: int calc calculateComplexValue(id)
  displayString: string calc formatDisplayString(id)
}
```

### Step 3: Implement in JavaScript

```javascript
// MyEntity.ExpressionEngineFunction.js

function calculateComplexValue(id) {
  var entity = MyEntity.make(id).get('fieldA, relatedField.multiplier');
  if (!entity) return 0;

  // Complex calculation logic
  var result = 0;
  if (entity.relatedField) {
    result = entity.fieldA * entity.relatedField.multiplier;
  }
  return result;
}

function formatDisplayString(id) {
  var entity = MyEntity.make(id).get('name, status, category.name');
  if (!entity) return 'Unknown';

  var parts = [entity.name];
  if (entity.status) {
    parts.push('[' + entity.status + ']');
  }
  if (entity.category) {
    parts.push('(' + entity.category.name + ')');
  }
  return parts.join(' ');
}
```

### Best Practices for Custom Functions

1. **Minimize database calls** - Fetch all needed fields in one `get()` call
2. **Handle null values** - Always check for null before accessing properties
3. **Keep functions focused** - One function per calculation/transformation
4. **Document parameters and return types** - Use JSDoc comments
5. **Return consistent types** - Match the declared return type exactly
