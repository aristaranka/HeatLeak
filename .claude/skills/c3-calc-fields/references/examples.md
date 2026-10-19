# Calc Field Examples

Real-world examples from the C3 AI codebase demonstrating calc field patterns.

## Table of Contents

- [Basic Patterns](#basic-patterns)
- [Collection Aggregations](#collection-aggregations)
- [Conditional Logic](#conditional-logic)
- [Date/Time Calculations](#datetime-calculations)
- [Custom ExpressionEngineFunction](#custom-expressionenginefunction)
- [Complete Entity Examples](#complete-entity-examples)

## Basic Patterns

### Simple Field Reference

Copy a value from a related entity:

```c3typ
entity type ExMachinaTestService {
  servicePoint: ExMachinaTestServicePoint stored calc to
  resource: ExMachinaTestResource stored calc servicePoint.resource
  start: datetime stored calc activationDate
}
```

### Arithmetic Operations

```c3typ
entity type GenaiCore.Observability.Trace.Fields {
  llmCallsInputTokenSum: int
  llmCallsOutputTokenSum: int
  llmCallsTokenSum: ?int stored calc llmCallsInputTokenSum + llmCallsOutputTokenSum
}
```

### String Manipulation

```c3typ
entity type TypeWorkerTestType {
  requiredField: !string
  storedCalcField: string stored calc upperCase(requiredField)
  calcField: string calc lowerCase(id)
}

entity type TransformationEditorTarget {
  FirstName: string
  LastName: string
  FullName: string stored calc concat(FirstName, " ", LastName)
}

entity type WindTurbine {
  turbineId: string
  turbineId2x: string stored calc concat("2x_", turbineId)
}
```

### Boolean Checks

```c3typ
entity type Mcp.UserInfo {
  directReports: [Mcp.UserInfo]
  isManager: boolean stored calc exists(directReports)
}

entity type AiVisionManyStaticPlaneData {
  altitude: double
  grounded: boolean stored calc altitude == 0
}
```

## Collection Aggregations

### Count with Filter

Filter a collection and count matching items using `.(condition)` syntax:

```c3typ
entity type WindTurbine {
  turbineEvents: [WindTurbineEvent](asset)

  // Count events matching specific codes
  unplannedMaintenanceEvents: int stored calc count(turbineEvents.(eventCode == "f1"))
  plannedMaintenanceEvents: int stored calc count(turbineEvents.(eventCode == "f3"))
  rebootEvents: int stored calc count(turbineEvents.(eventCode == "m2"))
}
```

### Max/Min/Avg over Collection

```c3typ
entity type Genai.Aircraft {
  components: [Genai.AircraftComponent](aircraft)

  // Get maximum risk score from all components
  riskScore: double stored calc max(components.riskScore)
}
```

### Simple Count

```c3typ
entity type Genai.SourceCollection {
  files: [Genai.SourceFile](collection)
  fileCount: int calc count(files)
}
```

### Flatten Nested Collections

```c3typ
entity type Genai.Aircraft {
  components: [Genai.AircraftComponent](aircraft)

  // Flatten alerts from all components into single array
  @db(order='descending(triggeredTimestamp)')
  alerts: [Genai.AircraftComponentAlert] stored calc components.alerts

  // Flatten cases from all components
  @db(order='descending(createdTimestamp)')
  cases: [Genai.AircraftComponentCase] stored calc components.cases

  // Get all component code descriptions
  componentCodesDescription: [string] stored calc components.code.description

  // Get unique values as a set
  componentCodesDescriptionAsSet: set<string> stored calc unique(components.code.description)
}
```

### Latest Value from Collection

```c3typ
entity type WindTurbine {
  turbineEvents: [WindTurbineEvent](asset)
  latestEvent: string calc latestValue(turbineEvents.eventCode)
}
```

## Conditional Logic

### Null Handling with exists()

```c3typ
entity type TypeWithCalc {
  intField: int
  parent: TypeWithCalc

  // Use parent's value if local is null
  calcInt3: int stored calc exists(intField) ? intField : parent.calcInt3
}

entity type Genai.Aircraft {
  alerts: [Genai.AircraftComponentAlert]

  // Safely get first element or null
  latestAlert: Genai.AircraftComponentAlert stored calc exists(alerts) ? alerts[0] : null
  latestCase: Genai.AircraftComponentCase stored calc exists(cases) ? cases[0] : null
}
```

### Complex Boolean Conditions

```c3typ
entity type Genai.SourceFile {
  statusHistory: [Genai.SourceFile.StatusHistory](parent)

  // Multiple OR conditions
  isProcessing: boolean calc (statusHistory[0].value == 'Indexing') ||
                             (statusHistory[0].value == 'Syncing') ||
                             (statusHistory[0].value == 'Removing') ||
                             (statusHistory[0].value == 'Chunking')
}
```

### Conditional Display Values

```c3typ
entity type Genai.SourceFile {
  lastProcessedBy: string

  // Transform system user to friendly name
  displayLastProcessedBy: string calc lastProcessedBy == 'worker@c3' ? 'Batch Job' : lastProcessedBy
}
```

## Date/Time Calculations

### Calculate Age in Days

```c3typ
entity type Genai.AircraftComponentCase {
  createdTimestamp: !datetime
  closedTimestamp: datetime
  status: string enum ('Open', 'Assigned', 'Closed')

  // Calculate age based on status
  // For open cases: days since creation
  // For closed cases: days between creation and closure
  caseAge: int stored calc (status == 'Open' || status == 'Assigned') ?
    (now() - createdTimestamp) / (24 * 60 * 60 * 1000) :
    (closedTimestamp - createdTimestamp) / (24 * 60 * 60 * 1000)
}
```

### Latest Timestamp

```c3typ
entity type Genai.Conversation {
  parentResult: Genai.Query.Result

  // Get the most recent update from multiple sources
  lastUpdated: datetime stored calc latest(
    parentResult.meta.updated,
    latest(parentResult.chatHistory.meta.updated)
  )
}
```

## Array Indexing with Filters

### Get First Element with Condition

```c3typ
entity type TestSmartBulb {
  /**
   * Collection ordered by date for array access
   */
  @db(order='descending(start), descending(end)')
  fixtureHistory: [TestSmartBulbToFixtureRelation](from)

  /**
   * Get current fixture by:
   * 1. Get first element (most recent due to ordering)
   * 2. Filter to only include records where end is null
   * 3. Get the 'to' reference from the relation
   */
  currentFixture: TestFixture stored calc fixtureHistory[0].(end == null).to
}
```

### Get Latest from Ordered Collection

```c3typ
entity type TestSmartBulb {
  @db(order='descending(timestamp)')
  bulbPredictions: [TestSmartBulbPrediction](smartBulb)

  // Simply get first element from ordered collection
  currentPrediction: TestSmartBulbPrediction stored calc bulbPredictions[0]
}
```

## Custom ExpressionEngineFunction

For complex calculations not supported by built-in functions:

### Define the Function Type

```c3typ
/**
 * Custom ExpressionEngineFunctions for Genai.Query.Result calc fields
 */
type Genai.Query.Result.ExpressionEngineFunction mixes ExpressionEngineFunction {
  /**
   * Calculate query latency in milliseconds
   */
  getQueryLatency: function(id: !string): !int js-rhino

  /**
   * Parse and return the engine log JSON
   */
  getParsedEngineLog: function(id: !string): !json js-rhino

  /**
   * Get user email from user ID
   */
  getUserEmail: function(userId: string): !string js-rhino
}
```

### Use in Entity Type

```c3typ
entity type Genai.Query.Result {
  // Use custom function in calc field
  userEmail: string calc getUserEmail(meta.createdBy)
  latency: double calc getQueryLatency(id)
  parsedEngineLog: json calc getParsedEngineLog(id)
}
```

### Implement in JavaScript

```javascript
// Genai.Query.Result.ExpressionEngineFunction.js

function getQueryLatency(id) {
  var result = Genai.Query.Result.forId(id).get('meta.created, meta.updated');
  if (!result || !result.meta) return 0;
  return result.meta.updated - result.meta.created;
}

function getUserEmail(userId) {
  if (!userId) return 'Unknown';
  var user = User.forId(userId).get('email');
  return user ? user.email : 'Unknown';
}

function getParsedEngineLog(id) {
  var result = Genai.Query.Result.forId(id).get('engineLog');
  if (!result || !result.engineLog) return {};
  try {
    return JSON.parse(result.engineLog);
  } catch (e) {
    return { error: 'Failed to parse log' };
  }
}
```

## Complete Entity Examples

### WindTurbine - Comprehensive Example

```c3typ
entity type WindTurbine mixes Obj, MlSubject schema name 'WNDT' {
  turbineId: string
  location: string
  coordinates: GpsCoordinates
  power: int
  manufacturer: Manufacturer

  turbineMeasurements: [WindTurbineMeasurementSeries](windTurbine)
  turbineEvents: [WindTurbineEvent](asset)
  facility: Facility
  prediction: [WindTurbinePrediction](subject)

  // Stored calc: count events by type
  unplannedMaintenanceEvents: int stored calc count(turbineEvents.(eventCode == "f1"))
  plannedMaintenanceEvents: int stored calc count(turbineEvents.(eventCode == "f3"))
  rebootEvents: int stored calc count(turbineEvents.(eventCode == "m2"))

  // Non-stored calc: get latest event code
  latestEvent: string calc latestValue(turbineEvents.eventCode)

  // Stored calc: string manipulation
  turbineId2x: string stored calc concat("2x_", turbineId)
}
```

### Aircraft - Complex Aggregations

```c3typ
entity type Genai.Aircraft mixes FeatureEvaluatable schema name 'GEN_AIRCRFT' {
  status: Genai.AircraftStatus
  sensors: [Genai.AircraftMeasurementSeries](aircraft)
  components: [Genai.AircraftComponent](aircraft)
  model: Genai.AircraftModel
  location: Genai.Airport

  // Aggregation over components
  riskScore: double stored calc max(components.riskScore)

  // Flatten nested collections with ordering
  @db(order='descending(triggeredTimestamp)')
  alerts: [Genai.AircraftComponentAlert] stored calc components.alerts

  @db(order='descending(createdTimestamp)')
  cases: [Genai.AircraftComponentCase] stored calc components.cases

  // Safe access to first element
  latestAlert: Genai.AircraftComponentAlert stored calc exists(alerts) ? alerts[0] : null
  latestCase: Genai.AircraftComponentCase stored calc exists(cases) ? cases[0] : null

  // Extract and deduplicate values
  componentCodesDescription: [string] stored calc components.code.description
  componentCodesDescriptionAsSet: set<string> stored calc unique(components.code.description)
}
```
