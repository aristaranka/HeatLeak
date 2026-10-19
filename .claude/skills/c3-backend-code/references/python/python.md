# C3 AI Python Implementation Master Instructions

**Do NOT import `c3`** – the namespace is globally available. This is a concise guide for implementing Python methods in C3 AI apps.

**CRITICAL: For all CRUD operations, filtering, and pagination patterns, see the `c3-crud` skill first!**

**Tooling:** Use `generate_python_implementation` to create or edit Python (`.py`) implementations.

## 1. C3 Namespace (TOP PRIORITY)

The global `c3` variable provides access to **Types**, **utilities**, and **instances**.

```python
objType = c3.Obj                # Access Types
objInst = c3.Obj()              # Create instance
objInst2 = c3.Obj.make()        # Create instance using make()
user = c3.User.forId("user123").get("this")  # Fetch by ID
now = c3.DateTime.now()                      # Current DateTime
```

**Notes:** All package Types are accessible via `c3`; if a conflict with Python built-ins arises, use fully qualified `c3.Type`.

## 2. Static vs Member Functions (READ CAREFULLY)

- **Default to static methods** unless `.c3typ` explicitly says `member function`.
- Static → first param is **`cls`** (required — `def foo(x):` without `cls` will not bind as a static type method).
- Member → first param is `this` (only when `.c3typ` says `member function`).
- Always Pair every method with an explicit `.c3typ` language claim (`~py`, ...).

## 3. Implementing Methods on Types

- Declare methods in `.c3typ` files.
- Implement them in `.py` files with the same base name.
- **Static methods** → first parameter = `cls` (operates on the class/type)
- **Member functions** → first parameter = `this` (operates on an instance)
- Always use the `c3` namespace to call other types/utilities.
- By default, always use Static methods, unless you see the keyword member for a method in a c3 type file. This takes precedence.
- Import external libraries **inside functions**.
  Member functions are defined on **entity instances** (first parameter = `this`). They encapsulate business logic tied to one object.

### Static Function Example

```c3typ
// Panda.c3typ
type Panda {
  pawSize: float
  // Static function - operates on the class
  findByLocation: function(location: string): [Panda] py
}
```

```python
# Panda.py - Static function uses 'cls'
def findByLocation(cls, location):
    return c3.Panda.fetch(filter=c3.Filter.eq("location", location), include="this").objs
```

### Member Function Example

```c3typ
// Panda.c3typ
type Panda {
  pawSize: float
  birthday: datetime
  location: string
  // Member function - operates on an instance
  getLocationDetails: member function(): json py
}
```

```python
# Panda.py - Member function uses 'this'
def getLocationDetails(this):
    return {
        "location": this.location,
        "pawSize": this.pawSize,
        "age": (c3.DateTime.now() - this.birthday).days // 365
    }
```

✅ Use `getMissing("field1,field2")` to fetch refs.
✅ Never mutate fields directly – use `.with*().merge()` (prefer `.merge()` for partial updates; `.update()` fails if required fields are missing).

## 4. Immutability (CORE RULE)

C3 AI objects and collections are **immutable**; use `.with*` or similar APIs to create modified copies.

```python
d = c3.JSData.make({"id": "d1", "data": "orig"})   # Create object
newD = d.withData("new")                     # Correct way to modify
arr = c3.Array.ofInt([3,4])
arr2 = arr.replace(0,1).with_(5).slice(0,2)   # Replace, append, slice
m = c3.Map.ofStrToStr("a","b")
m2 = m.with_("key","val").withoutKey("a")     # Modify map immutably
```

## 5. Data Types in C3

| Data Type in C3 | Python Type   | Example             |
| --------------- | ------------- | ------------------- |
| `string`        | `str`         | `"hello"`           |
| `int`           | `int`         | `42`                |
| `double`        | `float`       | `3.14`              |
| `boolean`       | `bool`        | `True`              |
| `datetime`      | `c3.DateTime` | `c3.DateTime.now()` |
| `json`          | `dict`        | `{"k":"v"}`         |
| `native`        | Python obj    | `pandas.DataFrame`  |
| `[Type]`        | `list`        | `[obj1,obj2]`       |
| `set<Type>`     | `set`         | `{1,2,3}`           |

## 6. Creating Objects

- **Prefer the builder pattern** `c3.<Type>.make({...})` then `.create()` — this matches the authoritative `c3-crud` skill. Do NOT call `c3.<Type>.create({...})` directly on the class (that does not work).
- Use `withDefaults=True` or `.withDefaults()` to populate default fields.

```python
t = c3.WindTurbine.make({"location": "York", "power": 150})              # In-memory object
tPersisted = c3.WindTurbine.make({"location": "Chester", "power": 100}).create()  # Persisted
spec = c3.EvalSpec.make({}, withDefaults=True)                           # With defaults
```

## 7. CRUD Essentials

```python
c3.WindTurbine.make({"id": "t1", "power": 100}).create()            # Create
c3.WindTurbine.make({"id": "t1", "power": 120}).update()            # Update
c3.WindTurbine.make({"id": "t2", "power": 150}).upsert()            # Upsert
c3.WindTurbine.make({"id": "t1", "manufacturer": "Vestas"}).merge() # Merge
c3.WindTurbine.mergeBatch([                                         # MergeBatch
  c3.WindTurbine.make({"id": "t2", "power": 200}),
  c3.WindTurbine.make({"id": "t3", "location": "UK"})
])
updateAll = c3.WindTurbine.make({"location": "UK"})                 # MergeAll
c3.WindTurbine.mergeAll(updateAll, spec=c3.MergeAllSpec.make({"filter": "power<=200"}))
c3.WindTurbine.forId("t1").remove()                                 # Delete
```

✅ Prefer `mergeBatch` or `mergeAll` over looping single calls.

## 8. Fetch & Filter

```python
c3.WindTurbine.forId("oBx").get()                                   # By ID
res = c3.WindTurbine.fetch(                                          # With Filter
  filter="location=='US' && power>150",
  include="[id,power,manufacturer]",
  order="power",
  limit=10
)
flt = c3.Filter.eq("location", "US").and_(c3.Filter.gt("power", 160))  # Filter Builder
res = c3.WindTurbine.fetch(filter=flt)
c3.WindTurbine.eval(                                                 # Eval
  projection="id, upperCase(manufacturer), round(power)"
)
c3.WindTurbine.eval(                                                 # Aggregation
  group="manufacturer",
  projection="manufacturer, min(power), max(power), avg(power)"
)
```

> **Platform 8.9+ (`.to_pandas()` required):** on 8.9 and later, `.eval(...)` no longer returns a directly pandas-operable object. You **must** call `.to_pandas()` before any pandas operation — e.g. `c3.WindTurbine.eval(projection="id, power").to_pandas().sort_values("power")`. See the `c3-code-python-upgrade` skill.

### Reference Fields

```python
c3.WindTurbine.fetch(include="[id, manufacturer, facility.id, facility.address]", filter="startsWith(facility.address,'1400')")
```

### Collection Fields

```python
c3.Facility.fetch(include="[address, windTurbines]", filter="windTurbines.manufacturer=='GE'")
```

**Notes:** Fetch only necessary fields using `include`; use `.exists()` or `.fetchCount()` for existence checks.

## 9. Best Practices (For Developers & LLMs)

### General

- Always use `c3` namespace to access types.
- Functions should be short, focused, and consistent with how it's defined in c3 types.
- Never assume mutability. Use `.with*` methods.

### CRUD & Persistence

- Use `.create()` to insert new objects.
- Use `.update()` only if object exists; handle errors.
- Use `.upsert()` when unsure if object exists.
- Use `.merge()` or `.mergeBatch()` for partial updates (non-null only).
- Use batch operations for performance.

### Fetch & Query

- Filter early, return only necessary fields via `include`.
- Prefer `c3.Filter` over raw strings.
- Use `.exists()` / `.fetchCount()` for existence checks.
- Use `.eval()` for server-side transformations/aggregations (on Platform 8.9+, call `.to_pandas()` before any pandas operation on the result).

### Equality

- Use `==` / `!=`, not `is`.

### Performance

- Avoid fetching inside loops.
- Use `mergeAll` / `mergeBatch` for bulk updates.
- Use `projection` in `.eval()` for efficiency.

## 10. Common Anti-Patterns to Avoid

❌ Creating Python classes instead of C3 methods.
❌ Hardcoding values instead of parameters/configs.
❌ Fetching entities in loops (prefer batch).
❌ Ignoring utility reuse.

## 11. Utility Reuse & Best Practices

### Example - Same Type

```python
def validateEmail(email): return "@" in email
def createUser(cls, name, email):
    if not cls.validateEmail(email): raise ValueError("Invalid email")
    return c3.UserAccount.make({"name":name,"email":email}).create()
```

### Example - Related Type

```python
def createOrder(cls, customerId, items):
    customer = c3.Customer.validateCustomer(customerId)
    validated = [c3.Product.validateProduct(i) for i in items]
    return c3.Order.make({"customer":customer,"items":validated}).create()
```

## 12. Runtime Action Claims (non-standard Python library imports)

**Applies to Python methods.** The trailing token on a Python method signature in the `.c3typ` (after the return type, e.g. the `py` in `... : int py`) is its **action claim** — it selects the **runtime** the method runs in. A method can only import libraries its runtime contains; the default `py` covers roughly stdlib + pandas + numpy (plus the `c3` namespace). A method that imports something outside that (e.g. `import sklearn`) but is declared `py` fails at runtime with `ModuleNotFoundError: No module named 'sklearn'` — give it a claim for a runtime that has the library instead.

**Runtime names change across platform versions — don't hardcode them.** Discover the right runtime at build time (or create one) via the **`c3-runtime` skill** — see its [Python Runtime Workflow](../../c3-runtime/references/creation/creation.md#python-runtime-workflow) — then use its claim.

| Method imports                             | Runtime claim                                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| stdlib, `pandas`/`numpy`, or c3 namespace only | default `py`                                                                         |
| `sklearn`, `scipy`, `xgboost`, `boto3`, …  | a claim mapping to a runtime that has that library (discover via the `c3-runtime` skill) |

> **Shared-module trap.** Because all of a type's methods share one `.py` module, a **module-level** heavy import (e.g. `import xgboost`) makes *every* method need that library's runtime — so **import it inside the specific method that uses it** instead.
