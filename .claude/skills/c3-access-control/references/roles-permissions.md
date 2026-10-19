# C3 Roles & Permissions

Manage UserGroup, Role, and User permissions in the C3 AI platform.

## Core Concepts

**UserGroup, User, and Role are C3 platform built-in types** - globally available, not defined in custom packages. UserGroups map users to roles; each UserGroup has at most one Role.

### Security Hierarchy (platform roles with security levels)

Security levels are defined in `SecurityLevel.c3typ`. Lower value = higher privilege.

| Role Constant        | Group ID        | Description               | Security Level |
| -------------------- | --------------- | ------------------------- | -------------- |
| `Role.CLUSTER_ADMIN` | C3.ClusterAdmin | Cluster administrative    | 1 (highest)    |
| `Role.ENV_ADMIN`     | C3.EnvAdmin     | Environment administrator | 2              |
| `Role.APP_ADMIN`     | C3.AppAdmin     | Application administrator | 3              |
| `Role.DEVELOPER`     | C3.Developer    | Development access        | 7              |

**Key rule**: Users cannot modify groups with higher security levels than their own.

### User Group Types

- **c3Groups**: Groups assigned directly in the C3 platform
- **idpGroups**: Groups synced from external Identity Providers (SAML, OIDC)
- **groups**: Combined active groups (union of c3Groups and idpGroups)

### Role constants

Use these when passing group IDs to `User#addToGroup` / `User#removeFromGroup` (group id = role id for platform groups): `Role.CLUSTER_ADMIN`, `Role.ENV_ADMIN`, `Role.APP_ADMIN`, `Role.OPERATOR`, `Role.USER_ADMIN`, `Role.DEVELOPER`, `Role.DATA_INTEGRATOR`, `Role.DATA_SCIENTIST`, `Role.READ_ALL`, `Role.MEMBER_APP`, `Role.PUBLIC`, `Role.ARTIFACT_READER`, `Role.ANONYMOUS`, `Role.OAUTH_CLIENT`, `Role.LIBRARY_MANAGER`.

### User group types

- **groups**: All active groups (public field)
- **c3Groups** / **idpGroups**: Private; use `user.groups` or `user.allGroups()` to inspect membership

## Quick Reference

### Check Current User Permissions

**Python:**

```python
user = c3.User.myUser()
user.isClusterAdmin()     # Returns boolean
user.isEnvAdmin()         # Returns boolean
user.securityLevel()      # Returns int (lower = more privileged)
```

**JavaScript:**

```javascript
var user = User.myUser();
user.isClusterAdmin(); // Returns boolean
user.isEnvAdmin(); // Returns boolean
user.securityLevel(); // Returns int (lower = more privileged)
```

### Add/Remove User from Group

`User#addToGroup(groupId)` and `User#removeFromGroup(groupId)` take a **group id string** (e.g. `Role.DEVELOPER` = `'C3.Developer'`). Requires user-admin or higher privileges.

**JavaScript:**

```javascript
// Add user to group (groupId = role id for groups)
User.forId(userId).addToGroup(Role.DEVELOPER);

// Remove user from group
User.forId(userId).removeFromGroup(Role.DEVELOPER);

// Check user's groups (use groups or allGroups())
var groupIds = User.forId(userId)
  .allGroups()
  .map(function (g) {
    return g.id;
  });
```

**Python:**

```python
c3.User.forId(userId).addToGroup(c3.Role.DEVELOPER)
c3.User.forId(userId).removeFromGroup(c3.Role.DEVELOPER)
```

### Get UserGroup by ID

```javascript
var group = UserGroup.forId('C3.Developer');
var group = UserGroup.forId(Role.APP_ADMIN);
```

### IDP Group Mapping

Map external IDP groups to C3 UserGroups. `idp` is string-serialized IdpConfig:

```javascript
// Add IDP group mapping
UserGroup.forId(Role.DEVELOPER).addIdpGroupForIdp(idpConfig, idpGroupName);

// Remove IDP group mapping (idpGroup optional; omit to remove all for that Idp)
UserGroup.forId(Role.DEVELOPER).removeIdpGroupForIdp(idpConfig, idpGroupName);
```

### Run Code as Different User/Role (Testing)

**Requirement:** The app must be in test mode. `TestRunner.asRole` and `TestRunner.asUser` are only available when the application is running in test mode.

**JavaScript:**

```javascript
// Run as specific role
TestRunner.asRole(
  Role.APP_ADMIN,
  Lambda.fromJsFunc(function () {
    // Code runs with APP_ADMIN privileges
    User.forId(username).addToGroup(Role.USER_ADMIN);
  })
);

// Run as specific user
TestRunner.asUser(
  User.forId(userId),
  Lambda.fromJsFunc(function () {
    // Code runs as that user
  })
);

// With parameters
TestRunner.asRole(
  Role.USER_ADMIN,
  Lambda.fromJsFunc(function (username) {
    User.forId(username).addToGroup(Role.DEVELOPER);
  }).partiallyCall(username)
);
```

**Python:**

```python
c3.TestRunner.asUser(
    c3.User.forId(test_user_id),
    c3.Lambda.fromPyFunc(lambda: do_something())
)
```

### Permission-Based UI Rendering

```json
{
  "type": "UiSdlConditionalRenderer",
  "condition": {
    "type": "UiSdlPermissionRenderCondition",
    "adminGroup": { "id": "C3.Group.ClusterAdmin" }
  },
  "thenComponent": { "id": "MyApp.AdminGrid" },
  "elseComponent": { "id": "MyApp.UserGrid" }
}
```

## Common Patterns

### Create Test User with Role

**JavaScript:**

```javascript
TestIdp.createUser(username, email, firstName, lastName);
TestIdp.setPassword(TestIdp.user(username), 'Password1');
User.forId(username).addToGroup(Role.DEVELOPER);
```

**Python:**

```python
c3.TestIdp.createUser(email, firstName, lastName, userId)
c3.TestIdp.setPassword(c3.User.forId(userId), password)
c3.User.forId(userId).addToGroup("C3.Developer")  # or c3.Role.DEVELOPER
```

### Check Group Membership

```javascript
var user = User.forId(username);

if (user.isAppAdmin()) {
  // User is an App Admin
}
```

### Fetch User with Groups

```javascript
var user = User.forId(username).get('this, groups.this');
User.forId(username).allGroups(); // alternatively can be used
```

### UserGroup Properties

```javascript
var group = UserGroup.make({ id: 'C3.JupyterLab' }).get('inactive, description');
group.inactive; // boolean - if true, users cannot be added/removed
group.description; // string
group.role(false); // Role for this group (failIfNoRole: false for optional)
```

## Security Enforcement

The platform enforces security levels automatically:

```javascript
// This will throw an error if current user is USER_ADMIN trying to add APP_ADMIN
try {
  User.forId(username).addToGroup(Role.APP_ADMIN);
} catch (e) {
  // Error: "cannot call this method for roles with higher security level: [C3.AppAdmin]"
}
```

## Studio-Specific Roles

Studio roles are UserGroup ids (not constants on `Role`). Use string ids or `UserGroup.forId('C3.StudioUser')`:

| Group ID          | Description                                               |
| ----------------- | --------------------------------------------------------- |
| `C3.StudioUser`   | Basic studio user, can create 1 SNE and 1 MNE             |
| `C3.StudioAdmin`  | Studio admin, unlimited environments                      |
| `C3.ClusterAdmin` | Full access (platform role constant `Role.CLUSTER_ADMIN`) |

## Custom Roles in Packages

Define custom roles as JSON files in `metadata/Role/`:

```
myPackage/
├── metadata/
│   └── Role/
│       └── MyApp.Role.User.json
```

### Permission Syntax

**Two formats:**

- `allow:<TypeName>:<actionGroup>:` - Grant all methods in an action group
- `allow:<TypeName>::<methodName>` - Grant a specific method

### Action Groups (USE THESE!)

**Use action groups instead of listing individual methods:**

- **`read:`** - Includes: `fetch`, `fetchCount`, `get`, `getMissing`, `exists`, `scan`
- **`write:`** - Includes: `create`, `createBatch`, `update`, `updateBatch`, `upsert`, `upsertBatch`, `merge`, `mergeBatch`, `mergeAll`
- **`delete:`** - Includes: `remove`, `removeBatch`, `removeAll`, `replace`

**Example - CORRECT:**

```json
{
  "permissions": ["allow:Task:read:", "allow:Task:write:"]
}
```

**Example - WRONG (redundant):**

```json
{
  "permissions": ["allow:Task:write:", "allow:Task::create", "allow:Task::merge"]
}
```

### Basic Role Structure

```json
{
  "id": "MyApp.Role.User",
  "description": "Basic user role",
  "nestedRoles": [],
  "permissions": ["allow:Document:read:", "allow:Document::customSearch"],
  "dataPermissions": []
}
```

### How Permissions Are Combined

**Nested roles and permissions are ORed together (additive):**

- If a role has `nestedRoles: ["ViewerRole"]`, it gets ALL permissions from ViewerRole PLUS its own
- Multiple permissions in the same role are ORed - having ANY matching `allow` grants access
- Default is DENY - access is denied unless explicitly granted by a permission

**Example:**

```json
{
  "id": "Editor",
  "nestedRoles": ["Viewer"],
  "permissions": ["allow:Document:write:"]
}
```

Editor gets: ALL Viewer permissions + `write:` on Document

### Critical Rules

1. **Verify type names** - Check `.c3typ` files for actual type name (e.g., `Task` not `MyPackage.Task`)
2. **`nestedRoles` are strings** - Use `["RoleId"]` not `[{"id": "RoleId"}]`
3. **Use action groups** - `write:` instead of listing `create`, `update`, `merge` separately
4. **Don't duplicate** - Nested roles inherit permissions; don't repeat them
5. **`C3.UiSdlAccess`** - Only add if package depends on `uiComponentLibrary`

### Adding Methods to Action Groups

If you create custom methods, add `@action` annotation to include them in action groups:

```c3typ
@action(group+='read')
getActiveItems: function(): [Item] js

@action(group+='write')
importData: function(data: json): int js
```

For detailed examples see [api-patterns.md](api-patterns.md#defining-custom-roles-in-packages).

## Detailed Reference

For comprehensive API patterns, error handling, and advanced examples, see [api-patterns.md](api-patterns.md).
