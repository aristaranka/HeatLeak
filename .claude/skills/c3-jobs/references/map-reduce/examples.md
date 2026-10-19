# MapReduce Examples

## Word Count Example

Classic word count implementation demonstrating basic map-reduce patterns.

### Entity Type (WordDocument.c3typ)

```c3typ
entity type WordDocument {
  title: string
  content: string
}
```

### MapReduce Job Type (WordCount.c3typ)

```c3typ
type WordCount extends MapReduce<WordDocument, string, int, int> type key 'WORDCOUNT' {
  /**
   * Map function: Extract words and count occurrences
   */
  map: ~ js-rhino

  /**
   * Reduce function: Sum word counts across batches
   */
  reduce: ~ js-rhino
}
```

### Implementation (WordCount.js)

```javascript
function map(batch, objs, job, subBatch) {
  var resultMap = {};

  objs.each((doc) => {
    if (doc.content) {
      var words = doc.content.toLowerCase().split(/\s+/);
      words.each((word) => {
        word = word.replace(/[^\w]/g, '');
        if (word.length > 0) {
          resultMap[word] = (resultMap[word] || 0) + 1;
        }
      });
    }
  });

  return resultMap;
}

function reduce(word, counts, job) {
  var total = 0;
  counts.each((count) => {
    total += count;
  });
  return [total];
}
```

### Usage

```javascript
// Create sample documents
WordDocument.createBatch([
  { title: 'Doc1', content: 'hello world hello' },
  { title: 'Doc2', content: 'world of data processing' },
]);

// Create and start job
var job = WordCount.make({
  targetType: WordDocument,
  include: 'content',
  batchSize: 100,
}).upsert();

job.start();

// Check status
job.status();

// Get results
var results = job.results(10);
results.each((entry) => {
  console.log(entry.key + ': ' + entry.value);
});
```

## Aggregation Example

Aggregate metrics across entities with grouping.

### Entity Type (SalesTransaction.c3typ)

```c3typ
entity type SalesTransaction {
  product: string
  amount: double
  quantity: int
  region: string
  timestamp: datetime
}
```

### Value Type (ProductMetrics.c3typ)

```c3typ
type ProductMetrics {
  totalAmount: double
  totalQuantity: int
  transactionCount: int
}
```

### MapReduce Job Type (SalesByProduct.c3typ)

```c3typ
type SalesByProduct extends MapReduce<SalesTransaction, string, ProductMetrics, ProductMetrics> type key 'SALESBYPRODUCT' {
  /**
   * Map function: Group by product and calculate metrics
   */
  map: ~ js-rhino

  /**
   * Reduce function: Aggregate metrics across batches
   */
  reduce: ~ js-rhino
}
```

### Implementation (SalesByProduct.js)

```javascript
function map(batch, objs, job, subBatch) {
  var resultMap = {};

  objs.each((txn) => {
    var key = txn.product;

    if (!resultMap[key]) {
      resultMap[key] = ProductMetrics.make({
        totalAmount: 0,
        totalQuantity: 0,
        transactionCount: 0,
      });
    }

    var metrics = resultMap[key];
    resultMap[key] = metrics
      .withTotalAmount(metrics.totalAmount + txn.amount)
      .withTotalQuantity(metrics.totalQuantity + txn.quantity)
      .withTransactionCount(metrics.transactionCount + 1);
  });

  return resultMap;
}

function reduce(product, metricsArray, job) {
  var aggregated = ProductMetrics.make({
    totalAmount: 0,
    totalQuantity: 0,
    transactionCount: 0,
  });

  metricsArray.each((metrics) => {
    aggregated = aggregated
      .withTotalAmount(aggregated.totalAmount + metrics.totalAmount)
      .withTotalQuantity(aggregated.totalQuantity + metrics.totalQuantity)
      .withTransactionCount(aggregated.transactionCount + metrics.transactionCount);
  });

  return [aggregated];
}
```

## Filtering and Complex Keys Example

Process entities with filtering and composite keys.

### MapReduce Job Type (RegionalSales.c3typ)

```c3typ
type RegionalSales extends MapReduce<SalesTransaction, string, double, double> type key 'REGIONALSALES' {
  minAmount: double  // Filter threshold

  /**
   * Map function: Filter and group by region
   */
  map: ~ js-rhino

  /**
   * Reduce function: Sum amounts per region-product
   */
  reduce: ~ js-rhino
}
```

### Implementation (RegionalSales.js)

```javascript
function map(batch, objs, job, subBatch) {
  var resultMap = {};
  var minAmount = job.minAmount || 0;

  objs.each((txn) => {
    // Filter: only process transactions above threshold
    if (txn.amount >= minAmount) {
      var key = txn.region + '|' + txn.product; // Composite key
      resultMap[key] = (resultMap[key] || 0) + txn.amount;
    }
  });

  return resultMap;
}

function reduce(key, amounts, job) {
  var total = 0;
  amounts.each((amount) => {
    total += amount;
  });
  return [total];
}
```

### Usage with Filter

```javascript
// Create job with filter configuration
var job = RegionalSales.make({
  targetType: SalesTransaction,
  include: 'product, amount, region',
  batchSize: 50,
  minAmount: 100.0, // Custom filter threshold
  filter: "region == 'US' || region == 'EU'", // C3 filter
}).upsert();

job.start();
```

## JSON Processing Example

Process JSON data stored in entity fields.

### Entity Type (LogEntry.c3typ)

```c3typ
entity type LogEntry {
  timestamp: datetime
  userId: string
  eventData: json
}
```

### Value Type (EventStats.c3typ)

```c3typ
type EventStats {
  count: int
  userIds: set<string>
}
```

### MapReduce Job Type (EventAnalytics.c3typ)

```c3typ
type EventAnalytics extends MapReduce<LogEntry, string, EventStats, EventStats> type key 'EVENTANALYTICS' {
  /**
   * Map function: Extract event types from JSON
   */
  map: ~ js-rhino

  /**
   * Reduce function: Merge event statistics
   */
  reduce: ~ js-rhino
}
```

### Implementation (EventAnalytics.js)

```javascript
function map(batch, objs, job, subBatch) {
  var resultMap = {};

  objs.each((entry) => {
    if (entry.eventData && entry.eventData.eventType) {
      var eventType = entry.eventData.eventType;

      if (!resultMap[eventType]) {
        resultMap[eventType] = EventStats.make({
          count: 0,
          userIds: [],
        });
      }

      var stats = resultMap[eventType];
      var updatedUserIds = stats.userIds.slice();
      if (entry.userId && updatedUserIds.indexOf(entry.userId) === -1) {
        updatedUserIds.push(entry.userId);
      }

      resultMap[eventType] = stats.withCount(stats.count + 1).withUserIds(updatedUserIds);
    }
  });

  return resultMap;
}

function reduce(eventType, statsArray, job) {
  var merged = EventStats.make({
    count: 0,
    userIds: [],
  });

  var uniqueUsers = {};

  statsArray.each((stats) => {
    merged = merged.withCount(merged.count + stats.count);
    stats.userIds.each((userId) => {
      uniqueUsers[userId] = true;
    });
  });

  merged = merged.withUserIds(Object.keys(uniqueUsers));
  return [merged];
}
```

## Timeseries Aggregation Example

Process time-series data with temporal grouping.

### Entity Type (SensorReading.c3typ)

```c3typ
entity type SensorReading {
  sensor: Sensor
  value: double
  timestamp: datetime
}
```

### Value Type (TimeSeriesStats.c3typ)

```c3typ
type TimeSeriesStats {
  sum: double
  count: int
  min: double
  max: double
}
```

### MapReduce Job Type (HourlyAverages.c3typ)

```c3typ
type HourlyAverages extends MapReduce<SensorReading, string, TimeSeriesStats, TimeSeriesStats> type key 'HOURLYAVERAGES' {
  /**
   * Map function: Group by sensor and hour
   */
  map: ~ js-rhino

  /**
   * Reduce function: Aggregate statistics across batches
   */
  reduce: ~ js-rhino
}
```

### Implementation (HourlyAverages.js)

```javascript
function map(batch, objs, job, subBatch) {
  var resultMap = {};

  objs.each((reading) => {
    // Round timestamp to hour
    var hour = Math.floor(reading.timestamp.millis() / (1000 * 60 * 60));
    var key = reading.sensorId + '|' + hour;

    if (!resultMap[key]) {
      resultMap[key] = TimeSeriesStats.make({
        sum: 0,
        count: 0,
        min: reading.value,
        max: reading.value,
      });
    }

    var stats = resultMap[key];
    resultMap[key] = stats
      .withSum(stats.sum + reading.value)
      .withCount(stats.count + 1)
      .withMin(Math.min(stats.min, reading.value))
      .withMax(Math.max(stats.max, reading.value));
  });

  return resultMap;
}

function reduce(key, statsArray, job) {
  var aggregated = TimeSeriesStats.make({
    sum: 0,
    count: 0,
    min: Number.MAX_VALUE,
    max: Number.MIN_VALUE,
  });

  statsArray.each((stats) => {
    aggregated = aggregated
      .withSum(aggregated.sum + stats.sum)
      .withCount(aggregated.count + stats.count)
      .withMin(Math.min(aggregated.min, stats.min))
      .withMax(Math.max(aggregated.max, stats.max));
  });

  return [aggregated];
}
```

### Calculate Average from Results

Run this snippet in the C3 REPL/console to inspect job results. `console.log` is appropriate here because this is user-facing diagnostic code, not method-body implementation. (Never use `console.log` inside BatchJob / MapReduce implementation code — use `Logger.for()` instead.)

```javascript
var job = HourlyAverages.get(jobId);
var results = job.results(1000);

results.each((entry) => {
  var parts = entry.key.split('|');
  var sensorId = parts[0];
  var hour = parseInt(parts[1]);
  var stats = entry.value;
  var average = stats.sum / stats.count;

  console.log(
    'Sensor: ' + sensorId + ', Hour: ' + hour + ', Avg: ' + average + ', Min: ' + stats.min + ', Max: ' + stats.max
  );
});
```
