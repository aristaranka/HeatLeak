# C3 AI JavaScript Implementation Instructions

⚠️ **Do not import types**. All C3 types are automatically available in the global namespace.

**CRITICAL: For all CRUD operations, filtering, and pagination patterns, see the `c3-crud` skill first!**

**Tooling:** Use `generate_js_implementation` to create or edit JavaScript (`.js`) implementations.

This document is a **comprehensive guide** for implementing JavaScript methods in C3 AI platform applications using the JavaScript SDK.  
It consolidates namespace usage, typing, object lifecycle, CRUD operations, fetch/filtering patterns, utility reuse, integration guidelines, best practices, and anti-patterns.

---

## 1. C3 Type Namespace

All types are available directly without prefixes (unlike Python's `c3.` prefix).

```javascript
var objInst = Obj.make(); // Create instance
var user = User.forId('user123').get('this'); // Access by ID
var now = DateTime.now(); // Platform utilities
var flt = Filter.eq('status', 'Active');
```

---

## 2. Creating Objects

- Use object literal notation. IDs auto-generated if not provided.
- Use `withDefaults: true` or `.withDefaults()` to populate default values.

```javascript
var bulb = SmartBulb.make({ bulbType: 'LED', manufacturer: 'Philips' }); // In-memory only
var bulb = SmartBulb.make({ bulbType: 'LED', manufacturer: 'Philips' }).create(); // Persisted
var spec = EvalSpec.make({}, { withDefaults: true }); // With defaults
var bulb = SmartBulb.make({ bulbType: 'LED' }).create({ returnInclude: 'id' }); // Custom return
```

---

## 3. Immutability and Object Modification

C3 objects are **immutable**. Direct property assignment won't work (no error, but won't update). Use auto-generated `.with*` methods:

- `withFieldName(value)` - set field (e.g., `withBulbType("CFL")`)
- `withoutFieldName()` - set to null (e.g., `withoutManufacturer()`)

```javascript
var bulb = SmartBulb.make({ bulbType: 'LED', manufacturer: 'Philips' }).create();
// ❌ bulb.bulbType = "CFL";  // Won't work
// ✅ Correct:
bulb = bulb.withBulbType('CFL').withoutManufacturer();
bulb = bulb.update();
// Collections are also immutable
var arr = C3.Array.ofInt(3, 4);
var arr2 = arr.replace(0, 1);
var m = C3.Map.ofStrToStr('a', 'b', 'c', 'd');
var m2 = m.with('key', 'value').withoutKey('a');
```

---

## 4. Typing in C3

| C3 Type         | Runtime Type    | Example          |
| --------------- | --------------- | ---------------- |
| `string`        | `string`        | `"hello"`        |
| `int`, `double` | `number`        | `42`, `3.14`     |
| `boolean`       | `boolean`       | `true`           |
| `datetime`      | C3 `DateTime`   | `DateTime.now()` |
| `json`          | `object`        | `{"key":"val"}`  |
| `native`        | any JS object   | `new Date()`     |
| `[Type]`        | `C3.Array`      | C3 Array (not native JS array) |
| `map<K,V>`      | `C3.Map`        | C3 Map (not native JS object)  |

> ⚠️ C3 `DateTime` is **not** native JS `Date`.

### C3 Collections (Arrays and Maps)

C3 methods that declare `[Type]` in a `.c3typ` file (e.g., `fetchItems(): [Item]`) return **C3 Arrays**, not native JavaScript arrays. Similarly, `map<K,V>` fields are **C3 Maps**, not plain JS objects.

**Creating C3 collections:**

> **Note on the `C3.` prefix:** entity/utility types are global with **no** prefix (`SmartBulb`, `Filter`, `DateTime`), but the C3 collection factories are namespaced under `C3.` — you must write `C3.Array` and `C3.Map` (capital `C3.`). This is the one place the `C3.` prefix is required in JavaScript; do not strip it (contrast with the "no `c3.` prefix" anti-pattern in §10, which refers to entity types).

```javascript
// C3 Arrays — use C3.Array factory methods
var ints = C3.Array.ofInt(1, 2, 3);
var strs = C3.Array.ofStr('a', 'b', 'c');
var objs = C3.Array.ofAny(obj1, obj2);           // array of C3 objects

// C3 Maps — use C3.Map factory methods
var m = C3.Map.ofStrToStr('key1', 'val1', 'key2', 'val2');
```

**C3 Array methods (NOT native JS array methods):**

```javascript
// ✅ Correct — C3 Array methods
arr.each((item) => { /* iterate */ });
arr.map((item) => item.id);
arr.mapToStr((item) => item.name);
arr.filter((item) => item.status === 'Active');
arr.contains(value);
arr.length;
arr.get(0);                    // access by index

// ❌ WRONG — these are native JS array methods that do NOT exist on C3 Arrays
arr.forEach(...)               // use .each() instead
arr.push(...)                  // C3 Arrays are immutable
arr.splice(...)                // C3 Arrays are immutable
```

**C3 Arrays are immutable** — mutation methods like `push`, `pop`, `splice` do not exist. Use functional methods that return new arrays:

```javascript
var arr2 = arr.replace(0, newValue);   // replace at index
var arr3 = arr.with(newItem);        // add to end
```

---

## 5. Implementing Methods on Types

- Declare in `.c3typ`, implement in `.js` with same base name
- **Static methods** (default): function parameters only
- **Member functions**: access instance via `this` (requires `member` keyword)

```c3typ
type Panda {
  location: string
  findByLocation: function(location: string): [Panda] js
  getDetails: member function(): json js
}
```

```javascript
// Static function
function findByLocation(location) {
  return Panda.fetch({ filter: Filter.eq('location', location), include: 'this' }).objs;
}
// Member function - uses 'this'
function getDetails() {
  return { location: this.location, pawSize: this.pawSize };
}
```

### Member Function Example (Real-world)

```c3typ
  /**
   * NOTE: this will create a new {@link GenaiCore.Agent.Draft} instance and upsert it to the database!
   */
  createDraft: member function(spec: GenaiCore.Agent.CreateDraftSpec): !GenaiCore.Agent.Draft js
```

```javascript
function createDraft(spec) {
  spec = spec || GenaiCore.Agent.CreateDraftSpec.make({}, { withDefaults: true });
  var agentFieldValues = this.fieldValuesByFieldName();
  agentFieldValues = agentFieldValues.withoutKey('name');
  return GenaiCore.Agent.Draft.make({
    agentTypeName: this.typeName(),
    agentFieldValues: agentFieldValues,
    name: spec.name,
    source: this,
  })
    .create()
    .get();
}
```

| Declaration                  | Implementation                       |
| ---------------------------- | ------------------------------------ |
| `member function(): Type js` | `function name() { /* use this */ }` |
| `function(): Type js`        | `function name(params) { }`          |

**Member function guidelines:** Use `getMissing("field1, field2")` to fetch reference fields. Use `this.fieldValuesByFieldName()` to get all field values. Keep functions short and focused.

---

## 6. CRUD Operations

| Method      | Behavior                                  | Use When         |
| ----------- | ----------------------------------------- | ---------------- |
| `.create()` | Creates new. Fails if ID exists.          | New records      |
| `.update()` | Updates existing. Fails if doesn't exist. | Known records    |
| `.upsert()` | Creates or updates.                       | Unsure if exists |
| `.merge()`  | Updates only non-null fields.             | Partial updates  |

### Create

```javascript
var bulb = SmartBulb.make({ bulbType: 'LED', startDate: '2024-01-07' }).create(); // Auto ID
var bulb = SmartBulb.make({ id: 'jW2dGw', bulbType: 'LED' }).create(); // Specific ID
var bulb = SmartBulb.make({ bulbType: 'LED' }).create({ returnInclude: 'id' }); // Custom return
// Validation enforced
try {
  SmartBulb.make({}).create();
} catch (err) {
  // Throws: Write failed: Required field SmartBulb.bulbType not set.
}
```

### Update, Upsert, Merge

```javascript
// Update (must exist)
var bulb = SmartBulb.make({ bulbType: 'LED' }).create();
bulb = bulb.withBulbType('CFL').withoutManufacturer().update();
// Upsert (create or update)
var bulb = SmartBulb.make({ bulbType: 'LED' }).upsert();
bulb = bulb.withBulbType('CFL').upsert();
// Merge (only non-null fields updated)
SmartBulb.make({ id: '2x3fMq', bulbType: 'LED' }).create();
SmartBulb.make({ id: '2x3fMq', manufacturer: 'Philips' }).merge(); // bulbType unchanged
```

### Remove

```javascript
bulb.remove();
SmartBulb.removeAll({ filter: "bulbType == 'INCAN'" });
```

### Batch Operations

```javascript
var bulbs = [
  { id: 'a', bulbType: 'LED', manufacturer: 'Philips' },
  { id: 'b', bulbType: 'LED', manufacturer: 'GE' },
];
SmartBulb.createBatch(bulbs);
SmartBulb.removeBatch(bulbs);
var turbines = [WindTurbine.make({ id: 't1', power: 370 }), WindTurbine.make({ id: 't2', power: 355 })];
WindTurbine.mergeBatch(turbines); // ✅ Preferred over looping .merge()
WindTurbine.mergeAll(WindTurbine.make({ location: 'UK' }), { spec: MergeAllSpec.make({ filter: 'power<=200' }) });
```

---

## 7. Fetch & Filter Data

### Basic Fetch

```javascript
WindTurbine.forId('oBxDEs').get();
SmartBulb.forId('bulb-123').get('id, manufacturer');
SmartBulb.fetch({ filter: Filter.eq('bulbType', 'LED').and().gt('wattage', 10), limit: 10 });
```

### Existence, Count, and Streaming

```javascript
var hasLed = SmartBulb.exists({ filter: Filter.eq('bulbType', 'LED') });
var count = SmartBulb.fetchCount({ filter: Filter.eq('bulbType', 'LED') });
// Memory-efficient streaming
SmartBulb.fetchObjStream({ filter: Filter.eq('bulbType', 'LED') }).each( (bulb) => {
  processLowMemory(bulb);
});
```

### Reference and Collection Fields

```javascript
// Reference fields (like SQL JOIN)
SmartBulb.fetch({ include: '[id, building.address]', filter: "endsWith(building.address, 'Floor 1')" });
// Collection fields
Building.fetch({ include: '[address, bulbs.manufacturer]', filter: 'exists(bulbs.id)' });
```

### Eval for Transformation/Aggregation

```javascript
SmartBulb.eval({ filter: "bulbType == 'LED'", projection: 'id, upperCase(manufacturer)' });
WindTurbine.eval({
  filter: "intersects(location,['US','CA'])",
  group: 'manufacturer',
  projection: 'manufacturer, min(power), max(power), avg(power)',
});
```

---

## 8. Utility/Function Reuse

**Priority:** Same Type → Related Types → C3 Platform utilities → External libraries

```javascript
// Platform utilities
function getUsersInRange(start, end) {
  return User.fetch({ filter: Filter.between('createdDate', start, end), include: 'this' }).objs;
}
// Underscore.js for functional patterns
var grouped = _.groupBy(items, function (item) {
  return item.category;
});
var result = _.reduce(
  items,
  function (acc, obj) {
    return { score: acc.score + obj.weight * obj.value, weight: acc.weight + obj.weight };
  },
  { score: 0, weight: 0 }
);
```

---

## 9. Best Practices

**General:** Use `var` for declarations. Never assume mutability—use `.with*` methods.
**CRUD:** Use `.create()` for new, `.upsert()` when unsure, `.merge()`/`.mergeBatch()` for partial updates.
**Fetch:** Filter early, return only necessary fields via `include`. Prefer `Filter` builder over strings.
**Performance:** Avoid fetching in loops. Use batch operations. Use `.fetchObjStream()` for large datasets.
**DateTime:**

```javascript
var now = DateTime.now();
var future = now.plusDays(7);
var fromString = DateTime.fromString('2024-01-01T12:00:00Z');
```

---

## 10. Common Anti-Patterns

❌ Using `c3.` prefix (not needed in JS)  
❌ Creating native JS classes instead of C3 methods  
❌ Fetching entities in loops (use batch/stream)  
❌ Modifying objects directly instead of `.with*` methods  
❌ Using `.fetch()` on large datasets instead of `.fetchObjStream()`  
❌ Using `.forEach()` on C3 Arrays (use `.each()` — `.forEach()` does not exist on C3 Arrays)  
❌ Using native JS array syntax `arr[i]` on C3 Arrays (use `.get(i)`)

---

## 11. Advanced Patterns

### Complex Filtering

```javascript
function findComplexEntities(criteria) {
  var filter = Filter.eq('status', 'Active');
  if (criteria.dateRange) {
    filter = filter.and().between('createdDate', criteria.dateRange.start, criteria.dateRange.end);
  }
  if (criteria.categories && criteria.categories.length > 0) {
    filter = filter.and().intersects('category', criteria.categories);
  }
  return MyEntity.fetch({ filter: filter, include: 'this', limit: criteria.limit || 100 });
}
```

### Lifecycle Hooks

C3 provides hooks: `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeRemove`, `afterRemove`.

```javascript
function beforeCreate(objs) {
  return objs.map((obj) => {
    return obj.status ? obj : obj.withStatus('Pending');
  });
}
function afterCreate(objs) {
  ProcessingQueue.mergeBatch(
    objs.map((obj) => {
      return { id: obj.id, timestamp: DateTime.now() };
    })
  );
}
```
