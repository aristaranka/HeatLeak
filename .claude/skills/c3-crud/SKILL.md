---
name: c3-crud
description: |
  Runtime CRUD on Persistable entity rows from a Python or JavaScript backend method: create, read, update, soft-delete, and delete records, with the `Filter` API, backend pagination (`limit`/`offset`/`order`), count-only `fetchCount`, memory-efficient row streaming via `fetchObjStream`, and batched writes `mergeBatch` / `createBatch`. Create with `.make({...}).create()`, read via `forId().get(...)` / `fetch({...})` with `include`, update via `forId().withField(...).merge()`, delete via `remove` / `removeBatch`.
core: true
category: platform
version: 8.9.0
minimumVersion: 8.7.0
---

# CRUD C3 Instructions

These guidelines cover Create, Read, Update, and Delete operations for **entity types** in the C3 AI Platform. They apply to both C3 type definitions (`.c3typ`) and implementations in Python (`.py`) and JavaScript (`.js`).

**Related Instructions:**

- For advanced service layer patterns, Python-specific patterns, and JavaScript-specific patterns, see `c3-backend-code`

## Basic Entity Type

### Entity Type Requirements

```c3typ
entity type User {
  email: string
  status: string enum('Active','Inactive','Deleted')
  department: Department

  // Business Logic
  validateUserCredentials: function(email: string, password: string): boolean py
  onboardNewUser: function(userData: json, workflowConfig: json): OnboardingResult py
}
```

## Create Operations

**ALWAYS use the builder pattern:** `c3.<Type>.make({fields}).create()` (Python)
or `<Type>.make({fields}).create()` (JavaScript). The `.make(...)` call
constructs an in-memory instance; `.create()` persists it.

`<Type>.create({fields})` called directly on the class with a dict argument
is **wrong** — it does not work. `.create()` must be called on an instance
produced by `.make({fields})`.

```python
# ✅ CORRECT — builder pattern
employee = c3.Employee.make({
    "name": name,
    "email": email,
    "department": department,
    "hireDate": c3.DateTime.now(),
}).create()

# ❌ WRONG — `.create({...})` directly on the class does not work
employee = c3.Employee.create({
    "name": name,
    ...
})
```

- **Creating new entities**

  ```python
  # Simple entity creation
  def createUser(cls, name, email, department=None):
      return c3.User.make({
          "name": name,
          "email": email,
          "department": department,
          "status": "Active",
          "createdDate": c3.DateTime.now()
      }).create()

  # Creating with relationships — pass the handle directly, no need to `.get()`
  def createEmployeeWithLocation(cls, name, email, locationId):
      return c3.Employee.make({
          "name": name,
          "email": email,
          "location": c3.Location.forId(locationId),
          "hireDate": c3.DateTime.now()
      }).create()

  # Batch creation
  def createMultipleUsers(cls, userDataList):
      users = []
      for userData in userDataList:
          user = c3.User.make(userData)
          users.append(user)
      return c3.User.createBatch(users)
  ```

## Read Operations

## C3 Filter API Reference

The `Filter` type provides a builder pattern for constructing filter expressions. Use it instead of string filters for type safety and proper escaping.

### Comparison Operators

| Method            | Description                  | Example                          |
| ----------------- | ---------------------------- | -------------------------------- |
| `eq(name, value)` | Equality (`==`)              | `Filter.eq("status", "Active")`  |
| `ne(name, value)` | Not equal (`!=`)             | `Filter.ne("status", "Deleted")` |
| `lt(name, value)` | Less than (`<`)              | `Filter.lt("age", 30)`           |
| `le(name, value)` | Less than or equal (`<=`)    | `Filter.le("price", 100)`        |
| `gt(name, value)` | Greater than (`>`)           | `Filter.gt("count", 0)`          |
| `ge(name, value)` | Greater than or equal (`>=`) | `Filter.ge("rating", 4.5)`       |

### String Matching

| Method                            | Description                        | Example                                     |
| --------------------------------- | ---------------------------------- | ------------------------------------------- |
| `startsWith(name, value)`         | Prefix match                       | `Filter.startsWith("email", "admin")`       |
| `endsWith(name, value)`           | Suffix match                       | `Filter.endsWith("filename", ".pdf")`       |
| `contains(name, value)`           | Substring match (case-sensitive)   | `Filter.contains("description", "urgent")`  |
| `containsIgnoreCase(name, value)` | Substring match (case-insensitive) | `Filter.containsIgnoreCase("name", "john")` |

### Logical Operators

| Method              | Description | Example (Python)                               | Example (JavaScript)                        |
| ------------------- | ----------- | ---------------------------------------------- | ------------------------------------------- |
| `and()` or `and_()` | Logical AND | `c3.Filter.eq("a", 1).and_().eq("b", 2)`       | `Filter.eq("a", 1).and().eq("b", 2)`        |
| `or()`              | Logical OR  | `c3.Filter.eq("a", 1).or().eq("a", 2)`         | `Filter.eq("a", 1).or().eq("a", 2)`         |
| `not()`             | Logical NOT | `c3.Filter.not().contains(user.id, "Deleted")` | `Filter.not().contains(user.id, "Deleted")` |
| `ne()`              | NOT EQUAL   | `c3.Filter.ne(user.id, "user1")`               | `Filter.ne(user.id, "user1")`               |

**Note:** In Python, use `and_()` instead of `and()` because `and` is a reserved keyword. In JavaScript, use `and()`.

### Advanced Filtering

| Method                     | Description                | Example                                          |
| -------------------------- | -------------------------- | ------------------------------------------------ |
| `exists(name)`             | Check if field is not null | `Filter.exists("email")`                         |
| `intersects(name, values)` | Match any value in array   | `Filter.intersects("category", ["A", "B", "C"])` |

### Filter Examples

**Python:**

```python
# Simple equality
c3.Filter.eq("status", "Active")

# Multiple conditions with AND
c3.Filter.eq("status", "Active").and_(c3.Filter.gt("score", 80))

# String matching
c3.Filter.contains("description", "urgent").and_(c3.Filter.startsWith("title", "ALERT"))

# Match multiple values (OR)
c3.Filter.intersects("category", ["Sales", "Marketing", "Support"])

# Date range
c3.Filter.ge("createdDate", start_date).and_(c3.Filter.le("createdDate", end_date))

# Complex nested conditions
filter_obj = c3.Filter.eq("status", "Active")
if department_id:
    filter_obj = filter_obj.and_(c3.Filter.eq("department", department_id))
if min_score:
    filter_obj = filter_obj.and_(c3.Filter.ge("score", min_score))
```

**JavaScript:**

```javascript
// Simple equality
Filter.eq('status', 'Active');

// Multiple conditions with AND
Filter.eq('status', 'Active').and().gt('score', 80);

// String matching
Filter.contains('description', 'urgent').and().startsWith('title', 'ALERT');

// Match multiple values (OR)
Filter.intersects('category', ['Sales', 'Marketing', 'Support']);

// Date range
Filter.ge('createdDate', startDate).and().le('createdDate', endDate);

// Complex nested conditions
var filter = Filter.eq('status', 'Active');
if (departmentId) {
  filter = filter.and().eq('department', departmentId);
}
if (minScore) {
  filter = filter.and().ge('score', minScore);
}
```

## Pagination Best Practices

**Always use pagination** when fetching data, especially for external data sources or large datasets.

### Pagination Parameters

- **`limit`**: Maximum number of records to return (use `50` or `100` as default, never use `-1` when doing pagination)
- **`offset`**: Number of records to skip (for page-based navigation)
- **`order`**: Sort order (e.g., `"ascending(name)"`, `"descending(createdDate)"`)

### Pagination Examples

**Python:**

```python
# Paginated fetch
def getUsers(cls, limit=50, offset=0):
    return c3.User.fetch({
        "limit": limit,
        "offset": offset,
        "include": "this",
        "order": "ascending(name)"
    })

# With filters
def getActiveUsers(cls, limit=50, offset=0, status="Active"):
    return c3.User.fetch({
        "limit": limit,
        "offset": offset,
        "filter": c3.Filter.eq("status", status),
        "include": "this",
        "order": "descending(createdDate)"
    })
```

**JavaScript:**

```javascript
// Paginated fetch
function getUsers(limit, offset) {
  limit = limit || 50;
  offset = offset || 0;
  return User.fetch({
    limit: limit,
    offset: offset,
    include: 'this',
    order: 'ascending(name)',
  });
}

// With filters
function getActiveUsers(limit, offset, status) {
  limit = limit || 50;
  offset = offset || 0;
  status = status || 'Active';
  return User.fetch({
    limit: limit,
    offset: offset,
    filter: Filter.eq('status', status),
    include: 'this',
    order: 'descending(createdDate)',
  });
}
```

### Fetch Response Structure

Both Python and JavaScript `fetch()` calls return an object with:

- **`objs`**: Array of fetched objects
- **`count`**: Total count of matching records

```python
response = c3.User.fetch({"limit": 50, "offset": 0})
users = response.objs       # List of User objects
total = response.count      # Total number of users matching filter
```

```javascript
var response = User.fetch({ limit: 50, offset: 0 });
var users = response.objs; // Array of User objects
var total = response.count; // Total number of users matching filter
```

### Fetching Counts

Use the `fetchCount` method to efficiently retrieve the number of records matching a filter without retrieving the objects themselves.

**Python:**

```python
# Get total count of all users
count = c3.User.fetchCount()

# Get count of matching records
active_count = c3.User.fetchCount({"filter": c3.Filter.eq("status", "Active")})
```

**JavaScript:**

```javascript
// Get total count of all users
var count = User.fetchCount();

// Get count of matching records
var activeCount = User.fetchCount({ filter: Filter.eq('status', 'Active') });
```

## Read Operations - Fetch Examples

- **Fetch single by ID**

```python
# Retrieve one object with all fields. Object fields must be included with fieldName.this
c3.WindTurbine.forId(turbineId).get('this, sensors.this')

# Retrieve specific fields only
c3.WindTurbine.forId(turbineId).get('location, speed, site.this')
```

- **Fetch specific fields and relationships**

  ```python
  # Retrieve nested relationships using dot notation
  def getUserCountry(cls, userId):
      user = c3.User.forId(userId).get('employee.location.country')
      return user.employee.location.country if user.employee else None

  # Retrieve collections with specific fields
  def getUserProjects(cls, userId):
      return c3.User.forId(userId).get('projects.this,projects.manager.name')
  ```

- **Fetch multiple entities with filtering**

  ```python
  # Basic fetch all
  def getAllUsers(cls):
      return c3.User.fetch({"limit": -1}).objs

  # Filtered fetch with date ranges
  def getUsersInDateRange(cls, start, end, limit=50):
      return c3.User.fetch({
          "limit": limit,
          "include": "this,department.this",
          "filter": c3.Filter.ge("createdDate", start)
                    .and_(c3.Filter.le("createdDate", end)),
          "order": "descending(createdDate)"
      }).objs

  # Complex filtering
  def getActiveUsersInDepartment(cls, departmentId, limit=50):
      return c3.User.fetch({
          "limit": limit,
          "include": "this,department.this",
          "filter": c3.Filter.eq("department", departmentId)
                    .and_(c3.Filter.eq("status", "Active")),
          "order": "ascending(name)"
      }).objs

  # Search with contains filter
  def searchUsersByName(cls, searchTerm):
      return c3.User.fetch({
          "filter": c3.Filter.contains("name", searchTerm),
          "include": "this",
          "order": "ascending(name)"
      }).objs
  ```

- **Count and streaming operations**

  ```python
  # Count entities matching criteria
  def getActiveUserCount(cls):
      return c3.User.fetchCount({"filter": c3.Filter.eq("status", "Active")})

  # Stream large datasets efficiently (Python)
  def processAllUsers(cls):
      for user in c3.User.fetchObjStream({"include": "this"}):
          cls.processUser(user)
  ```

  ```javascript
  // Count entities matching criteria
  function getActiveUserCount() {
    return User.fetchCount({ filter: Filter.eq('status', 'Active') });
  }

  // Stream large datasets efficiently (JavaScript)
  function processAllUsers() {
    User.fetchObjStream({ include: 'this' }).each((user) => {
      // Process each user individually
    });
  }
  ```

**See "Pagination Best Practices" section above for proper pagination patterns.**

## Update Operations

**ALWAYS use the load-modify-merge pattern:**
`c3.<Type>.forId(id).withField(name, value)[.withField(...)*].merge()`.
Calling `.create()` on an existing instance will fail; always use `.merge()`
(partial update) — or `.upsert()` only when you explicitly want create-or-update
semantics.

**Do NOT call `.get()` with no arguments just to chain `.withField`/`.merge`.**
`c3.<Type>.forId(id)` already returns a handle you can mutate. Only call
`.get(...)` when you need to actually read fields from the database first
(e.g. to inspect a collection like `tasks` before deciding what to do, or to
compute new values from existing ones), and pass the include spec you need
(`.get("this, tasks.this")`).

```python
# ✅ CORRECT — no DB read needed, just chain withField + merge
return (
    c3.Ticket.forId(ticketId)
    .withField("status", "Resolved")
    .withField("resolvedDate", c3.DateTime.now())
    .merge()
)

# ✅ CORRECT — read first because the logic depends on existing fields
ticket = c3.Ticket.forId(ticketId).get("this, assignee.this")
if ticket.assignee is None:
    return ticket  # skip — nothing to resolve
return ticket.withField("status", "Resolved").merge()

# ❌ POINTLESS — `.get()` with no args does an extra round-trip for nothing
ticket = c3.Ticket.forId(ticketId).get()
return ticket.withField("status", "Resolved").merge()

# ❌ WRONG — `.create()` is for new entities, not updates
c3.Ticket.forId(ticketId).withField("status", "Resolved").create()
```

- **Single field updates**

  ```python
  # Update a single field directly — no DB read needed
  def updateUserStatus(cls, userId, newStatus):
      return c3.User.forId(userId).withField("status", newStatus).merge()

  # Update multiple fields — chain withField calls, still no DB read needed
  def updateUserInfo(cls, userId, name=None, email=None, department=None):
      user = c3.User.forId(userId)

      if name is not None:
          user = user.withField("name", name)
      if email is not None:
          user = user.withField("email", email)
      if department is not None:
          user = user.withField("department", department)

      return user.merge()
  ```

- **Relationship updates**

  ```python
  # Update entity relationships — no DB read needed on either side
  def assignUserToDepartment(cls, userId, departmentId):
      return (
          c3.User.forId(userId)
          .withField("department", c3.Department.forId(departmentId))
          .merge()
      )

  # Add to collections — `.get(...)` IS needed here because we read existing projects
  def addUserToProject(cls, userId, projectId):
      user = c3.User.forId(userId).get("this, projects.this")
      project = c3.Project.forId(projectId)

      current_projects = user.projects or []
      if project not in current_projects:
          current_projects.append(project)
          return user.withField("projects", current_projects).merge()
      return user

  # Remove from collections — also reads existing projects, so `.get(...)` is required
  def removeUserFromProject(cls, userId, projectId):
      user = c3.User.forId(userId).get("this, projects.this")
      current_projects = user.projects or []
      updated_projects = [p for p in current_projects if p.id != projectId]
      return user.withField("projects", updated_projects).merge()
  ```

- **Batch updates**

  ```python
  # Update multiple entities — no DB read needed per entity
  def updateMultipleUserStatus(cls, userIds, newStatus):
      users = [
          c3.User.forId(userId).withField("status", newStatus)
          for userId in userIds
      ]
      return c3.User.mergeBatch(users)

  # Conditional updates — we fetch from the stream because we need to read fields to filter
  def deactivateInactiveUsers(cls, cutoffDate):
      inactive_users = c3.User.fetchObjStream({
          "filter": c3.Filter.lt("lastLoginDate", cutoffDate)
                    .and_(c3.Filter.eq("status", "Active")),
          "include": "this"
      })

      updated_users = []
      for user in inactive_users:
          updated_user = user.withField("status", "Inactive")
          updated_users.append(updated_user)

      return c3.User.mergeBatch(updated_users)
  ```

## Delete Operations

- **Single entity deletion**

```python
# Soft delete (recommended) — mark as deleted (no DB read needed)
c3.WindTurbine.forId(turbineId) \
    .withField("status", "Deleted") \
    .withField("deletedDate", c3.DateTime.now()) \
    .merge()

# Hard delete (use with caution)
c3.WindTurbine.forId(turbineId).remove()

# Conditional deletion — `.get("this, projects.this")` IS needed
# because we read `projects` to decide whether to remove.
user = c3.User.forId(userId).get("this, projects.this")
if not user.projects or len(user.projects) == 0:
    user.remove()
```

## Update Operations

- **Merge (partial update)**

```python
# Load object, apply new value via withField, then merge
bulb = c3.LightBulb.forId(bulbId).get('this')
modifiedBulb = bulb.withField("temperature", 75.0)
updatedBulb = modifiedBulb.merge()
```

- **Batch Delete**

```python
# Batch delete
c3.User.removeBatch(listOfUserObjects)

# Delete all (use with extreme caution)
c3.User.removeAll({}, True)
```

## Best Practices

1. **Always use appropriate include clauses** to fetch only needed data
2. **Handle null/empty cases** gracefully in your implementations
3. **Use pagination** for large datasets to avoid memory issues
4. **Validate inputs** before performing operations
5. **Use soft deletes** instead of hard deletes when possible
6. **Test edge cases** like empty collections, missing relationships
7. **Use batch operations** for better performance when working with multiple entities
8. **Always handle exceptions** appropriately and provide meaningful error messages
9. **Use descriptive method names** that clearly indicate the operation being performed
10. **Document complex business logic** with comments

## Important Notes

- When calling any CRUD method of any `<TypeName>`, make sure `<TypeName>.c3typ` exists and it is an entity type.
- Otherwise, there will be an error!
- Use MCP tools to generate and modify C3 types and implementations
- Always test your CRUD operations with appropriate unit tests
