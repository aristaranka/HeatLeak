# C3 AI Backend Advanced Patterns

These instructions guide advanced C3 AI backend development focusing on service layers, complex type patterns, and business logic.

**Related skills:**

- For CRUD operations and Filter API: see `c3-crud`
- For Python-specific patterns: see `references/python/python.md`
- For JavaScript-specific patterns: see `references/javascript/javascript.md`
- For data transforms and canonicals: see `c3-data-ingestion`

## Language Selection Guidelines

**Choose the right implementation language:**

- **JavaScript (`.js`)**: Use for simple CRUD operations, data transformations, and general business logic
  - Faster for simple operations
  - Easier debugging and testing
- **Python (`.py`)**: Use for complex tasks, especially ML-related operations
  - Better for data science, ML models, and complex computations
  - Access to rich Python libraries (pandas, numpy, sklearn, etc.)

**Decision Rule**:

1. **If the user specifies a language preference (Python or JavaScript), use that**
2. **Otherwise, decide based on task complexity:**
   - Simple CRUD/data operations → JavaScript
   - Complex computations/ML/data science → Python

## 1. Advanced Type Definitions

### Relationships & References

Foreign key (fkey) references use the syntax `[ChildType](fkeyField)` where `fkeyField` is a field **actually declared on ChildType** that points back to the parent. You MUST verify the referenced field exists on the child type before writing the inverse collection.

**Rules for fkey references:**

1. The field name inside `(...)` must be a real field on the child type that has the parent type as its value type.
2. NEVER guess or assume fkey field names — always check the child type definition first.
3. Both sides of the relationship must be defined: the child type declares a forward reference (e.g., `qaPair: !ChatQAPair`), and the parent type declares the inverse collection (e.g., `feedback: [ChatExperimentFeedback](qaPair)`).
4. Avoid using field names that collide with platform reserved words (e.g., `type`, `make`, `meta`). If you encounter an fkey error and the field name might conflict with a platform identifier, rename the field with a prefix (e.g., `forComponent` instead of `component`).

```c3typ
// CHILD type — declares the forward reference field
entity type ChatExperimentFeedback {
  qaPair: !ChatQAPair  // ← This field name is what goes in the parent's (...)
  rating: int
  comment: string
}

// PARENT type — uses the child's field name in the inverse collection
entity type ChatQAPair {
  question: !ChatQuestion
  answer: ChatAnswer
  chat: !UserChat
  feedback: [ChatExperimentFeedback](qaPair)  // "qaPair" must exist on ChatExperimentFeedback
  pipeline: ChatPipeline
}
```

**Common error pattern (DO NOT DO THIS):**

```c3typ
// ❌ WRONG — declaring inverse ref without verifying the child has this field
entity type Project {
  tasks: [Task](parentProject)  // ERROR if Task has no "parentProject" field
}
```

**Correct approach:**

```c3typ
// ✅ Step 1: Verify or declare the forward reference on the child type
entity type Task {
  project: !Project  // Forward reference to the parent
}

// ✅ Step 2: Use the exact field name from the child in the parent's inverse collection
entity type Project {
  tasks: [Task](project)  // Matches the field on Task
}
```

### Mixins & Extensions

```c3typ
// Base type for auditable entities
type Auditable {
  auditLog: [AuditEntry](entity)
}

// Extend with mixins
entity type UserChat mixes Auditable {
  // chat-specific fields
}

// Type inheritance
entity type AdminUser extends User {
  permissions: [Permission]
  lastAdminAction: datetime
}
```

**`mixes` vs `mixing` — there is no `mixin` keyword.** The example above uses **`mixes`**, which consumes a base type on a _declaration_ (the base is a plain `type X { }`, not `entity`). A separate keyword, **`mixing X`**, is a _value-type_ modifier meaning "`X` or any subtype that mixes it" (a polymorphic / self type). `mixing` is legal only in value-type positions — field types, method params/returns, and generic bounds — never as a declaration modifier.

```c3typ
// ✅ `mixing` — polymorphic / self type, only in value-type positions:
entity type Animal {
  buddy: mixing Animal                                                            // field: any Animal subtype
  makeFriend: member function(friend: !mixing Animal): !mixing Animal js-server   // self-type return
}
type Crustacean<T: mixing Invertebrate> mixes Invertebrate { }                    // generic bound on T
// ❌ WRONG — `mixin` is not a keyword; none of these parse (E no viable alternative / E missing EOF):
//   mixin type X { }   type X mixin { }   mixing type X { }   — a reusable base is `type X { }`, consumed with `mixes X`.
```

### Reserved Field Names

Entity types inherit methods from `Obj` (the universal base), `Persistable`, and `Fetchable`. A field whose name matches an inherited method fails to load with:
`<pkg>.<Type>.<field>: redeclaring method as field!`

Confirmed colliding names (not exhaustive — these base types expose many methods): `type`, `make`, `at` (on `Obj`), `scan` (on `Fetchable`/`Persistable`), `schema` (on `Persistable`). When a field name mirrors a platform method/accessor, prefix it (e.g. `eventTime`, `scanRef`, `docSchema`) rather than guess. (`id`, `name`, `meta`, and `version` are a separate concern — they are auto-managed fields, see section 7 — don't redefine them.)

If a field that collides with an inherited method was also meant to be an fkey target, the parent's inverse collection additionally fails with `type <Child> does not have field '<name>' used in the fkey ref` (the field never registered). Prefix the field on the child and use that exact name in the inverse collection. (See "Relationships & References" above for the general fkey rule: the named field must actually exist on the child.)

### Complex Field Types

```c3typ
entity type DataPipeline {
  config: json  // JSON configuration
  processors: map<string, ProcessorConfig>  // Key-value mapping
  inputSources: set<DataSource>  // Unique set of sources
  schedule: CronExpression  // Custom type

  // Computed properties
  isActive: function(): boolean py
  nextRunTime: function(): datetime py
}
```

### Stream Functions & Agents

```c3typ
entity type UserChat {
  // Streaming response for real-time chat
  askQuestion: function(chatId: string, question: string, context: ProjectState): stream<string> py-agents
  // Batch processing
  processMultipleChats: function(chatIds: [string]): [ChatResult] py
  // Native Python objects
  getAnalytics: function(): native py
}
```

## 2. Service Layer

### Type Definition with Methods

Methods can be implemented in either JavaScript or Python. **Always** put an explicit language claim on every method you author — `py`, `js`, `js-server`, `py-agents`, etc. Do **not** omit the claim (omission causes `Method … is not implemented!`).

```c3typ
entity type Sensor {
  windTurbine: !WindTurbine  // Forward reference — this field name is used in the inverse below
  temperature: double
  humidity: double
}

entity type WindTurbine {
  status: string enum('Operational','Maintenance','Offline')
  sensors: [Sensor](windTurbine)  // "windTurbine" verified to exist on Sensor above
  facility: Facility
  // JavaScript implementation (simple CRUD - preferred)
  getWindTurbine: function(turbineId: string): WindTurbine js
  getAllTurbines: function(): [WindTurbine] js
  // Python implementation (complex/ML tasks - preferred)
  predictMaintenanceNeeds: function(): native py
  analyzePerformancePatterns: function(dateRange: string): json py
}
```

### Field Types

- Primitive types: `int`, `double`, `string`, `boolean`, `datetime`, `binary`, `json`.
- Collections: arrays (`[Type]`), sets (`set<Type>`), maps (`map<Type1,Type2>`).
- Use `native` instead of specifying a type to return native Python/JavaScript objects
- Use `!` to mark required fields (e.g., `id: !string`).
- Note: `make` is a reserved keyword and CANNOT be a field/function name.
- All entity types have `id`, `name`, `meta`, and `version` as default fields—you should NEVER add them to the `.c3typ`.

## 3. Implementing Methods

Method implementations live alongside `.c3typ` files in `src/`. Choose JavaScript or Python based on the complexity of your logic.

### JavaScript Implementation (`.js` files)

**Preferred for**: Simple CRUD operations, data transformations, basic business logic

- Do **not** create classes; define top-level functions matching the c3 type signatures.
- Do **not** use `c3` prefix (unlike Python) - types are globally available.
- Example:

  ```javascript
  function getWindTurbine(turbineId) {
    return WindTurbine.forId(turbineId).get('this, sensors.this');
  }

  function getTurbinesInDateRange(start, end) {
    return WindTurbine.fetch({
      limit: -1,
      include: 'this, sensors.this',
      excludeMeta: true,
      filter: Filter.gt('meta.created', start).and(Filter.lt('meta.created', end)),
      order: 'descending(meta.created)',
    }).objs;
  }
  ```

### Python Implementation (`.py` files)

**Preferred for**: Complex tasks, ML operations, data science workflows, advanced computations

- Do **not** create classes; define top-level functions matching the c3 type signatures.
- Each method receives `cls` as the first parameter for static functions.
- Use `c3.<TypeName>` prefix to access types.
- Example:

  ```python
  def getWindTurbine(cls, turbineId):
      return c3.WindTurbine.forId(turbineId).get("this, sensors.this")

  def getTurbinesInDateRange(cls, start, end):
      return c3.WindTurbine.fetch({
          "limit": -1,
          "include": "this,sensors.this",
          "excludeMeta": "true",
          "filter": c3.Filter.gt("meta.created", start)
                      .and_(c3.Filter.lt("meta.created", end)),
          "order": "descending(meta.created)"
      }).objs
  ```

**Key Differences**:

- JavaScript: No `c3` prefix, no `cls` parameter, use `.and()` for filters
- Python: Requires `c3` prefix, `cls` parameter, use `.and_()` for filters

**Common to Both**:

- Use `<TypeName>.forId(...)`, `fetch()`, and filter utilities
- When using fetch, you MUST add `"include": "this, objectField1.this, objectField2.this"`. For fields that are other objects, you must add the fieldName.this to fetch the entire object instead of just the id.
- Ensure all implementations satisfy any provided Jasmine tests.

## 4. Seeding Data and Sample Data

**Default for sample / dashboard domain data:** use a plain `entity type` and put rows under `data/<TypeName>/`, then call `upsertSeedData`. Do **not** mix `SeedData` or invent `mixes MetadataFile` just to load sample data — `SeedData` is only for protected package defaults under `seed/`, and `MetadataFile` is not a valid seeding mixin.

**The choice between `seed/` and `data/` is based solely on whether the type mixes `SeedData` — not on data volume or any other factor.** Match the folder to the type you already have; do not add or invent mixins just to pick a folder.

### `seed/` — Types That Mixin `SeedData` Only

For each type that mixes `SeedData`, place JSON (or CSV) under a `seed/<TypeName>/` subfolder (e.g. `seed/Car/anything.json`). Deployed automatically on app start or package upgrade, with user modification tracking and upgrade preservation via the `@seed` annotation.

**Two hard requirements (not style):**

1. The file must sit inside a `seed/<TypeName>/` subfolder — the type name comes from the **folder**, so the filename is free and a folder may hold multiple files. A flat `seed/<TypeName>.json` fails to load with `Unable to extract c3 type name from Seed file`.
2. The owning type must `mixes SeedData` (e.g. `entity type Car mixes SeedData`) or the file is silently ignored.

So if you hit `Unable to extract c3 type name from Seed file`, check both. (Minor: a single-instance file warns if its name ≠ the instance `id` — prefer `seed/<TypeName>/<id>.json` there.) If the type is a normal mutable domain entity, do **not** add `mixes SeedData` to silence that error — move the files to `data/<TypeName>/` instead.

- Each object must include `"id"` plus all `!`-required fields:

  ```json
  [{ "id": "seed_turbine_us_1", "identifier": "WT-US-001", "status": "Operational", "facility": "seed_facility_us" }]
  ```

### `data/` — Standard Persistable Entity Types (No `SeedData` Mixin)

For Persistable entity types that do **not** mixin `SeedData`, `Metadata`, or `Config`, place JSON or CSV files under `data/<TypeName>/`. Same path convention as `seed/`. Also collected by `Pkg.upsertAllSeed()` but uses standard persistence without user modification tracking or upgrade preservation.

## 5. Backend Type Examples

Canonical type files should be in the `src/canonical/` directory (example path: `src/canonical/CanonicalType.c3typ`).

```c3typ
type OrderCanonical mixes Canonical<OrderCanonical> {
  customerName: string
  productDescription: string
  orderQuantity: int
  unitPrice: double

  @ser(name="Order Date") // Example of serialization in canonical file
  orderDate: datetime
}
```

## 6. Best Practices

- Refer to `references/python/python.md` for Python-specific patterns and `references/javascript/javascript.md` for JavaScript-specific patterns.
- Keep the backend focused on business logic; do not include console logging.
- Review and lint all `.py` files for syntax and style consistency before committing.
- Never fill out 'meta' fields anywhere, they are automatically populated.

## 7. Things to Avoid

- **Do NOT create README.md files in C3 packages** - they are not part of the C3 package structure
- Do not use `console.log` or print statements for logging
- Do not manually populate `meta`, `id`, `type`, or `version` fields - these are auto-generated
- Do not name a field after an inherited method (`type`, `make`, `at` on `Obj`; `scan` on `Fetchable`/`Persistable`; `schema` on `Persistable`; among others) - it fails with `redeclaring method as field!`. Prefix instead, e.g. `eventTime`, `scanRef`, `docSchema`. (`id`, `name`, `meta`, `version` are auto-managed fields - covered above.) See "Reserved Field Names" under section 1.
- Do not write `mixin type X`, `mixing type X`, or `type X mixin` - these fail to parse. Declare a base as a plain `type X { }` and consume it with `mixes X`; `mixing X` is only a value type ("X or any subtype that mixes it"). See "Mixins & Extensions" under section 1.
- Do not mix `SeedData` or `MetadataFile` onto domain entities just to load sample data — use plain `entity type` + `data/<Type>/` (see section 4).
