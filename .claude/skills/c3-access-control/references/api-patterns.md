# C3 Access Control API Patterns

Comprehensive reference for UserGroup, Role, and User permission management.

## Table of Contents

1. [User API](#user-api)
2. [UserGroup API](#usergroup-api)
3. [Role Constants](#role-constants)
4. [Defining Custom Roles in Packages](#defining-custom-roles-in-packages)
5. [TestRunner Context Switching](#testrunner-context-switching)
6. [SessionToken and Authentication](#sessiontoken-and-authentication)
7. [Error Handling](#error-handling)
8. [Test Patterns](#test-patterns)

---

## User API

### Core Methods

| Method                          | Returns | Description                            |
| ------------------------------- | ------- | -------------------------------------- |
| `User.myUser()`                 | User    | Get currently logged-in user           |
| `User.forId(userId)`            | User    | Get user by ID                         |
| `user.isClusterAdmin()`         | boolean | Check cluster admin status             |
| `user.isEnvAdmin()`             | boolean | Check environment admin status         |
| `user.isAppAdmin()`             | boolean | Check application admin status         |
| `user.securityLevel()`          | int     | Get numeric security level (1=highest) |
| `user.addToGroup(groupId)`      | void    | Add user to a group                    |
| `user.removeFromGroup(groupId)` | void    | Remove user from a group               |

### User Fields

| Field               | Type        | Description                              |
| ------------------- | ----------- | ---------------------------------------- |
| `id`                | string      | User identifier                          |
| `email`             | string      | User email address                       |
| `c3Groups`          | [UserGroup] | Groups assigned directly in C3           |
| `idpGroups`         | [UserGroup] | Groups from Identity Provider            |
| `groups`            | [UserGroup] | All active groups (c3Groups + idpGroups) |
| `idpAssignedGroups` | json        | Raw IDP group assignments                |

### Fetch User with Related Data

```javascript
// Fetch user with all group information
var user = User.forId(userId).get('this, c3Groups.this, idpGroups.this, groups.this');

// Access groups
user.c3Groups; // Array of UserGroup objects
user.idpGroups; // Array of UserGroup objects
user.groups; // Combined groups
```

---

## UserGroup API

### Core Methods

| Method                                              | Returns   | Description            |
| --------------------------------------------------- | --------- | ---------------------- |
| `UserGroup.forId(groupId)`                          | UserGroup | Get group by ID        |
| `UserGroup.make({id: groupId})`                     | UserGroup | Create group reference |
| `group.addIdpGroupForIdp(idpConfig, idpGroup)`      | void      | Map IDP group          |
| `group.removeIdpGroupForIdp(idpConfig, [idpGroup])` | void      | Remove IDP mapping     |

### UserGroup Fields

| Field         | Type     | Description                             |
| ------------- | -------- | --------------------------------------- |
| `id`          | string   | Group identifier (e.g., "C3.Developer") |
| `description` | string   | Human-readable description              |
| `inactive`    | boolean  | Whether group is deactivated            |
| `idpGroups`   | [string] | Mapped IDP group names                  |

### Fetch UserGroup Properties

```javascript
var group = UserGroup.make({ id: 'C3.JupyterLab' }).get('inactive, description');
console.log(group.description);
console.log(group.inactive);
```

### Modify UserGroup Properties

```javascript
// Deactivate a group
UserGroup.make({ id: 'C3.JupyterLab', inactive: true }).merge({ include: 'inactive' });

// Reactivate a group
UserGroup.make({ id: 'C3.JupyterLab', inactive: false }).merge({ include: 'inactive' });
```

---

## Role Constants

### Standard Role IDs

Use these constants instead of hardcoded strings:

```javascript
Role.CLUSTER_ADMIN; // "C3.ClusterAdmin"
Role.ENV_ADMIN; // "C3.EnvAdmin"
Role.APP_ADMIN; // "C3.AppAdmin"
Role.USER_ADMIN; // "C3.UserAdmin"
Role.DEVELOPER; // "C3.Developer"
Role.APP_USER; // "C3.AppUser"
```

### Additional Standard Groups

```javascript
'C3.StudioUser'; // Studio access
'C3.StudioAdmin'; // Studio administrator
'C3.JupyterLab'; // JupyterLab access
'C3.DataIntegrator'; // Data integration access
'C3.Group.UiSdlAccess'; // UI SDL access
```

### Python Role Access

```python
c3.Role.CLUSTER_ADMIN
c3.Role.ENV_ADMIN
c3.Role.APP_ADMIN
c3.Role.USER_ADMIN
c3.Role.DEVELOPER
c3.Role.forId("C3.Developer")  # Alternative
```

---

## Defining Custom Roles in Packages

Custom roles are defined as JSON files in `metadata/Role/` directory within your package.

### File Location

```
myPackage/
├── metadata/
│   └── Role/
│       ├── MyApp.Role.User.json
│       ├── MyApp.Role.Admin.json
│       └── MyApp.Role.PageAccess.Dashboard.json
├── src/
└── myPackage.c3pkg.json
```

### Role JSON Structure

```json
{
  "id": "MyApp.Role.User",
  "description": "Basic user role for MyApp application",
  "nestedRoles": [],
  "permissions": [],
  "dataPermissions": []
}
```

### Role Fields

| Field             | Type     | Description                                                  |
| ----------------- | -------- | ------------------------------------------------------------ |
| `id`              | string   | Unique role identifier (must match filename without `.json`) |
| `description`     | string   | Human-readable description of the role                       |
| `nestedRoles`     | [string] | Array of role IDs this role inherits from                    |
| `permissions`     | [string] | Array of permission strings                                  |
| `dataPermissions` | [string] | Array of data-level permission strings                       |

### Permission String Format

```
<access>:<typeName>:<actionGroup>:
<access>:<typeName>::<action>
```

**Permission fields (from AccessControl):**

| Field         | Type        | Description                                                               |
| ------------- | ----------- | ------------------------------------------------------------------------- |
| `access`      | string enum | `allow` or `deny`                                                         |
| `typeName`    | string      | Type name. If not specified, applies to all types. Use `*` for all.       |
| `action`      | string      | Action/method name. If not specified, applies to all actions of a type.   |
| `actionGroup` | string      | Action group name: `read`, `write`, `delete`, `run`, `monitor`, or custom |

**String format:** `<access>:<typeName>:<actionGroup>:` or `<access>:<typeName>::<action>`

**Example:** `allow:App.Metric.Dashboard:read:` grants read access to the `App.Metric.Dashboard` type.

**Examples:**

```json
{
  "permissions": [
    "allow:MyType:read:",
    "allow:MyType:write:",
    "allow:MyType::myMethod",
    "allow:MyType::*",
    "allow:FileApi::handle"
  ]
}
```

### Standard Action Groups

The C3 platform defines standard action groups that map to CRUD operations. When granting permissions via `actionGroup`, all methods in that group are allowed.

**`read`** - `fetch`, `fetchCount`, `fetchObjStream`, `get`, `getMissing`, `exists`, `scan`

**`write`** - `create`, `createBatch`, `update`, `updateBatch`, `upsert`, `upsertBatch`, `merge`, `mergeBatch`, `mergeAll`, `touch`, `touchBatch`

**`delete`** - `remove`, `removeBatch`, `removeAll`, `replace`

**Example:** Granting `allow:MyType:write:` permits `create`, `createBatch`, `merge`, `mergeBatch`, `upsert`, `upsertBatch`, and all other write operations on `MyType`.

### Adding Custom Methods to Action Groups

Use the `@action` annotation on custom methods to include them in an action group. This enables access control based on the group permission.

**Syntax:**

```c3typ
@action(group+='read')
getForId: function(id: string): MyType js

@action(group+='write')
saveData: function(data: json): MyType js

@action(group+='delete')
archiveOld: function(cutoffDate: datetime): int js
```

**When to add `@action` annotations:**

- **Add `@action(group+='read')`** for methods that fetch, get, or query data (e.g., `getById`, `fetchActive`, `search`, `list*`)
- **Add `@action(group+='write')`** for methods that create or update data (e.g., `save`, `update*`, `import`, `sync`)
- **Add `@action(group+='delete')`** for methods that remove data (e.g., `archive`, `purge`, `cleanup`)

**If unsure:** Read the method implementation. If still unclear, ask the user which action group is appropriate.

### Data Permission Format

Data permissions restrict which **objects** a user can access for a given action or action group. They are expressions evaluated per object.

**String format:** `typeName:actionGroup:action:condition`

| Token         | Description                                  |
| ------------- | -------------------------------------------- |
| `typeName`    | Type name or `*` for all types               |
| `actionGroup` | Action group (e.g. `read`, `write`) or empty |
| `action`      | Action/method name or `*` for all, or empty  |
| `condition`   | Expression; must be true for access          |

You can specify **only one** of `actionGroup` or `action` in a single data permission string.

**Examples:**

```json
{
  "dataPermissions": [
    "*::*:(FullDataAccess)",
    "User:write::(id == _context.userName)",
    "Foo:read::(building == 'bld1')",
    "Role::fetch:intersects('TestRole13', _context.accessControlEntities.id)"
  ]
}
```

- `*::*:(FullDataAccess)` — No object-level restriction (default when `dataPermissions` is omitted).
- `User:write::(id == _context.userName)` — User can only write their own `User` instance.
- `Foo:read::(building == 'bld1')` — Read access only to objects where `building == 'bld1'`.
- `intersects('TestRole13', _context.accessControlEntities.id)` — Returns true if `'TestRole13'` is in the user’s access control entity IDs (users, groups, roles). So the user can fetch that role only if they have it. Other ExpressionEngineFunction methods can be used in conditions.

**`_context`** — In conditions, `_context` refers to the current action context (e.g. `_context.userName`). See ActionCtxFilter type for available fields.

**Combining rules** Within a role (including nested roles), data permissions are combined with **AND**. Across groups (user in multiple groups), data permissions are combined with **OR**.

### Nested Roles: When to Include C3.UiSdlAccess

**Include `C3.UiSdlAccess`** as a nested role only if your package has `uiComponentLibrary` as a dependency. This role grants permissions needed for UI SDL rendering.

To check if `C3.UiSdlAccess` is needed:

1. Open your package's `<packageName>.c3pkg.json`
2. Look for `uiComponentLibrary` in the `dependencies` array
3. If present, include `C3.UiSdlAccess` in your user-facing roles

**Example check:**

```json
// In myPackage.c3pkg.json
{
  "dependencies": ["uiComponentLibrary", "..."] // <-- uiComponentLibrary present
}
```

If `uiComponentLibrary` is **not** a dependency (or you're unsure), ask whether UI SDL access is required before adding it.

### Common Mistakes to Avoid

**1. Wrong `nestedRoles` format:**

```json
// ❌ WRONG - nestedRoles must be strings, not objects
"nestedRoles": [{"id": "MyApp.Role.Viewer"}]

// ✅ CORRECT - nestedRoles is an array of strings
"nestedRoles": ["MyApp.Role.Viewer"]
```

**2. Redundant permissions with actionGroup:**

```json
// ❌ WRONG - write: already includes create, update, merge, etc.
"permissions": [
  "allow:Task:write:",
  "allow:Task::create",      // redundant
  "allow:Task::update",      // redundant
  "allow:Task::merge"        // redundant
]

// ✅ CORRECT - just use the actionGroup
"permissions": [
  "allow:Task:write:"
]
```

**3. Duplicating nested role permissions:**

```json
// ❌ WRONG - if Viewer already has read:, don't repeat it
{
  "id": "MyApp.Role.Editor",
  "nestedRoles": ["MyApp.Role.Viewer"],
  "permissions": [
    "allow:Document:read:",   // redundant - inherited from Viewer
    "allow:Document:write:"
  ]
}

// ✅ CORRECT - only add new permissions
{
  "id": "MyApp.Role.Editor",
  "nestedRoles": ["MyApp.Role.Viewer"],
  "permissions": [
    "allow:Document:write:"
  ]
}
```

**4. Using incorrect type names:**

```json
// ❌ WRONG - verify the actual type name exists
"allow:MyPackage.Task:read:"  // if type is just "Task", not "MyPackage.Task"

// ✅ CORRECT - use the actual type name from the .c3typ file
"allow:Task:read:"
```

**Before creating permissions, verify type names by checking the `.c3typ` files in `src/`.**

### Complete Examples

**Basic User Role (without UI dependency):**

```json
{
  "id": "MyApp.Role.User",
  "description": "Basic user permissions for MyApp",
  "nestedRoles": [],
  "permissions": ["allow:MyApp.Document:read:", "allow:MyApp.Document::search", "allow:MyApp.Settings:read:"],
  "dataPermissions": []
}
```

**Basic User Role (with uiComponentLibrary dependency):**

```json
{
  "id": "MyApp.Role.User",
  "description": "Basic user permissions for MyApp",
  "nestedRoles": ["C3.UiSdlAccess"],
  "permissions": ["allow:MyApp.Document:read:", "allow:MyApp.Document::search", "allow:MyApp.Settings:read:"],
  "dataPermissions": []
}
```

**Admin Role (inherits from User):**

```json
{
  "id": "MyApp.Role.Admin",
  "description": "Admin permissions for MyApp",
  "nestedRoles": ["C3.UserAdmin", "MyApp.Role.User"],
  "permissions": [
    "allow:MyApp.Document:write:",
    "allow:MyApp.Document::remove",
    "allow:MyApp.Settings:write:",
    "allow:MyApp.AdminUtil::*"
  ],
  "dataPermissions": []
}
```

**Page Access Role:**

```json
{
  "id": "MyApp.Role.PageAccess.Dashboard",
  "description": "Permissions needed for the Dashboard page",
  "nestedRoles": [],
  "permissions": ["allow:MyApp.Dashboard::getData", "allow:MyApp.Dashboard::refresh", "allow:MyApp.Metrics:read:"]
}
```

**Composite Role with Multiple Nested Roles:**

```json
{
  "id": "MyApp.Role.PowerUser",
  "description": "Power user with access to multiple features",
  "nestedRoles": [
    "MyApp.Role.User",
    "MyApp.Role.PageAccess.Dashboard",
    "MyApp.Role.PageAccess.Reports",
    "MyApp.Role.PageAccess.Settings"
  ],
  "permissions": [],
  "dataPermissions": []
}
```

### Naming Conventions

| Pattern                            | Use Case                  | Example                                  |
| ---------------------------------- | ------------------------- | ---------------------------------------- |
| `<Package>.Role.User`              | Basic user role           | `GenAiSearch.Role.User`                  |
| `<Package>.Role.Admin`             | Admin role                | `GenAiSearch.Role.Admin`                 |
| `<Package>.Role.PageAccess.<Page>` | Page-specific permissions | `GenAiSearch.Role.PageAccess.SearchPage` |
| `<Package>.<Feature>User`          | Feature-specific user     | `Genai.BasicUser`                        |
| `C3.<RoleName>`                    | Platform-level roles      | `C3.StudioUser`                          |

### Using Custom Roles

Once defined, custom roles can be used like built-in roles:

**JavaScript:**

```javascript
// Add user to custom role
User.forId(userId).addToGroup('MyApp.Role.User');

// Check membership
if (User.forId(userId).hasGroup('MyApp.Role.Admin')) {
  // User is an admin
}

// Reference in TestRunner
TestRunner.asRole(
  'MyApp.Role.Admin',
  Lambda.fromJsFunc(function () {
    // Code runs with MyApp.Role.Admin privileges
  })
);
```

**Python:**

```python
c3.User.forId(userId).addToGroup("MyApp.Role.User")
```

### UI Permission Rendering with Custom Roles

```json
{
  "type": "UiSdlConditionalRenderer",
  "condition": {
    "type": "UiSdlPermissionRenderCondition",
    "adminGroup": { "id": "MyApp.Role.Admin" }
  },
  "thenComponent": { "id": "MyApp.AdminPanel" },
  "elseComponent": { "id": "MyApp.UserPanel" }
}
```

---

## TestRunner Context Switching

### Run as Role (JavaScript)

```javascript
// Simple role execution
TestRunner.asRole(
  Role.APP_ADMIN,
  Lambda.fromJsFunc(function () {
    // Code runs with APP_ADMIN privileges
    var result = SomeType.someMethod();
    return result;
  })
);

// With parameters using partiallyCall
TestRunner.asRole(
  Role.USER_ADMIN,
  Lambda.fromJsFunc(function (param1, param2) {
    User.forId(param1).addToGroup(param2);
  }).partiallyCall(username, Role.DEVELOPER)
);

// Capture return value
var result = TestRunner.asRole(
  Role.APP_ADMIN,
  Lambda.fromJsFunc(function () {
    return User.fetch({ limit: 10 }).objs;
  })
);
```

### Run as User (JavaScript)

```javascript
// Run code as specific user
TestRunner.asUser(
  User.forId(userId),
  Lambda.fromJsFunc(function () {
    // Code runs as that specific user
    return User.myUser().id; // Returns userId
  })
);

// With parameters
TestRunner.asUser(
  User.forId(userId),
  Lambda.fromJsFunc(function (arg1) {
    return SomeType.methodNeedingAuth(arg1);
  }).partiallyCall(someValue)
);
```

### Run as Role/User (Python)

```python
# Run as user with Lambda
c3.TestRunner.asUser(
    c3.User.forId(test_user_id),
    c3.Lambda.fromPyFunc(lambda: c3.SomeType.someMethod())
)

# Run as user with inline lambda
result = c3.TestRunner.asUser(
    c3.User.forId(user_id),
    lambda: c3.User.myUser().securityLevel()
)
```

---

## SessionToken and Authentication

### Get current user's own token

A user can obtain a session token for themselves (no admin required):

```javascript
// Token for current user (from memory or generated)
var token = User.myUser().mySessionToken().signedToken;

// Or generate with explicit expiry (e.g. 24 hours)
var token = User.myUser().generateSessionToken(DateTime.now().plusHours(24)).signedToken;
```

### Generate Session Token (admin, for another user)

```javascript
// Generate token for user. Only allowed for 'C3.ClusterAdmin'
var token = SessionToken.generate(User.forId(username)).signedToken;

// Parse token to inspect
var parsed = SessionToken.fromString(token);
var user = parsed.user;
var groups = user.c3Groups;
var idpGroups = user.idpGroups;
```

### Token User Properties

```javascript
// Generate token for user. Only allowed for 'C3.ClusterAdmin'
var token = SessionToken.generate(User.forId(username)).signedToken;
var tokenUser = SessionToken.fromString(token).user;

// Access properties from token
tokenUser.id;
tokenUser.c3Groups; // Direct C3 group assignments
tokenUser.idpGroups; // IDP-derived groups
tokenUser.groups; // All active groups
```

---

## Error Handling

### Security Level Violations

```javascript
// Attempting to modify higher-privileged group throws error
try {
  TestRunner.asRole(
    Role.USER_ADMIN,
    Lambda.fromJsFunc(function () {
      User.forId(username).addToGroup(Role.APP_ADMIN);
    })
  );
} catch (e) {
  // e.message contains: "cannot call this method for roles with higher security level: [C3.AppAdmin]"
}

// IDP group mapping violations
try {
  TestRunner.asRole(
    Role.ENV_ADMIN,
    Lambda.fromJsFunc(function () {
      UserGroup.forId(Role.CLUSTER_ADMIN).addIdpGroupForIdp(idpConfig, idpGroup);
    })
  );
} catch (e) {
  // e.message contains: "can not modify higher privileged UserGroup: C3.ClusterAdmin"
}
```

### Common Error Messages

| Error Message                                                                 | Cause                                                                  |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `cannot call this method for roles with higher security level: [C3.AppAdmin]` | User tried to add/remove someone to a group above their security level |
| `can not modify higher privileged UserGroup: C3.ClusterAdmin`                 | User tried to modify IDP mapping for higher-privileged group           |
| `Invalid value null for !UserGroup`                                           | Required UserGroup field is null                                       |

---

## Debugging Permissions

### Permission.fromString and Permission.toString

Use `Permission.fromString()` to parse permission strings and `toString()` to serialize them. This is useful for validating permission syntax and debugging.

**JavaScript:**

```javascript
// Parse a permission string into a Permission object
var perm = Permission.fromString('allow:MyType::myMethod');

// Convert back to string for inspection
var permStr = perm.toString(); // "allow:MyType::myMethod"
```

### Listing User Permissions

Use `allPermissions()` to get all effective permissions for a user (including inherited from nested roles):

**JavaScript:**

```javascript
// Get all permissions for a user
var user = User.forId(userId);
var permissions = user.allPermissions();

// Convert to strings for easy inspection
var permStrings = permissions.map(function (p) {
  return p.toString();
});

// Check if user has specific permission
var hasReadAccess = permStrings.some(function (p) {
  return p.indexOf('allow:MyType:read:') !== -1;
});
```

### Debugging Permission Issues

**Step 1: Check user's groups**

```javascript
var user = User.forId(userId).get('this, groups.this, c3Groups.this');
var groupIds = user.groups.map(function (g) {
  return g.id;
});
// Returns: ["C3.Developer", "MyApp.Role.User", ...]
```

**Step 2: List all effective permissions**

```javascript
var allPerms = User.forId(userId)
  .allPermissions()
  .map(function (p) {
    return p.toString();
  });
// Returns: ["allow:MyType:read:", "allow:MyType::search", ...]
```

**Step 3: Check specific role's permissions**

```javascript
var role = UserGroup.forId('MyApp.Role.User').get('permissions, nestedRoles');
// Inspect role.permissions and role.nestedRoles
```

### Permission String Syntax Reference

| Format                           | Description               | Example                       |
| -------------------------------- | ------------------------- | ----------------------------- |
| `allow:<Type>:read:`             | Read access to type       | `allow:Document:read:`        |
| `allow:<Type>:write:`            | Write access to type      | `allow:Document:write:`       |
| `allow:<Type>::<method>`         | Access to specific method | `allow:Document::search`      |
| `allow:<Type>::*`                | Access to all methods     | `allow:AdminUtil::*`          |
| `allow:<Type>:<action>:<filter>` | Filtered access           | `allow:*:selfservicedi-user:` |

### Testing Permissions in Unit Tests

```javascript
describe('permission tests', function () {
  it('should have expected permissions', function () {
    var permissions = User.forId(testUserId)
      .allPermissions()
      .map(function (p) {
        return p.toString();
      });

    expect(permissions).toContain('allow:MyApp.Document:read:');
    expect(permissions).toContain('allow:MyApp.Document::search');
    expect(permissions).not.toContain('allow:MyApp.Admin::*');
  });
});
```

---

## Test Patterns

### Complete Test Setup/Teardown

```javascript
describe('access control tests', function () {
  var username = 'testuser_' + Str.randomSuffix();

  beforeAll(function () {
    // Create test user
    TestIdp.createUser(username, username + '@test.com', 'Test', 'User');
    TestIdp.setPassword(TestIdp.user(username), 'Password123!');
  });

  afterAll(function () {
    // Cleanup
    User.forId(username).remove();
    TestIdp.removeTestUsers(username);
  });

  it('should add user to group', function () {
    User.forId(username).addToGroup(Role.DEVELOPER);
    var groups = User.forId(username).c3Groups.map((g) => g.id);
    expect(groups).toContain(Role.DEVELOPER);
  });
});
```

### Python Test Setup

```python
def create_test_user(user_id, email, first_name, last_name, role, password):
    c3.TestIdp.createUser(email, first_name, last_name, user_id)
    c3.TestIdp.setPassword(c3.User.forId(user_id), password)
    c3.TestIdp.addUserToGroup(c3.User.forId(user_id), c3.Role.forId(role))

# Usage
create_test_user("test123", "test@example.com", "Test", "User", "C3.Developer", "Pass123!")
```

### Testing Permission-Based Logic

```javascript
it('should restrict access based on security level', function () {
  var errorThrown = false;

  try {
    TestRunner.asRole(
      Role.DEVELOPER,
      Lambda.fromJsFunc(function () {
        User.forId(username).addToGroup(Role.APP_ADMIN);
      })
    );
  } catch (e) {
    errorThrown = true;
    expect(e.message).toContain('higher security level');
  }

  expect(errorThrown).toBe(true);
});
```
