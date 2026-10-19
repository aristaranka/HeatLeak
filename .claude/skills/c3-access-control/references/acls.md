# C3 ACLs (Access Control Lists)

ACL-based authorization grants access **per object instance**: each instance has an `acl` (array of `AclEntry`) that defines which **AccessControlEntity** (User, Role, UserGroup) can read/update/remove it. Setup uses **AclEnabled** (entity types) or **ConfigAclEnabled** (non-entity/config types), plus **AclPrivilege** and **EnableAclPrivilege**. **Data permissions** (expression-based on Role) are an alternative; ACL and data permission are combined with OR (user needs at least one path). See [acls-reference.md](acls-reference.md) for doc links and type references.

## When to use ACLs vs expression-based data permissions

- **ACLs**: Per-object, per **AccessControlEntity** (User, Role, UserGroup) access. Use when which rows a user can see depends on who is explicitly granted on each row or on relationships (e.g. "only users in this object's department").
- **Expression-based (DataPermission on Role)**: Single expression per type/action; use when the rule is the same for all instances (e.g. `building == 'bld1'`).

## Quick Start

### 1. Enable ACL on the type

**Entity type** — mix `AclEnabled`. If the type also mixes Configurable/Versionable, use this order: **Configurable** first, then **AclEnabled**, then **Versionable**.

```c3typ
entity type Foo mixes AclEnabled {
  id: !string
  name: !string
  description: string
}
```

**Non-entity (config) type** — mix `ConfigAclEnabled` instead. See [Add Access Controls Using ConfigAclEnabled](https://docs.c3.ai/docs/platform/latest/topic/security-configaclenabled).

```c3typ
type FooConfig mixes ConfigAclEnabled {
  id: !string
  name: !string
}
```

### 2. Create AclPrivilege seed

Add `<pkgname>/seed/AclPrivilege/<id>.json`. The `acl.expr` defines who gets access (member, members, or AclEntry/array). Use `_context.userName` for "current user."

```json
{
  "id": "Foo_AclPrivilege",
  "typeName": "Foo",
  "canUpdate": "true",
  "canRemove": "true",
  "canModifyAcl": "false",
  "acl": { "expr": "(id == _context.userName)" }
}
```

### 3. Create EnableAclPrivilege seed

Add `<pkgname>/seed/EnableAclPrivilege/<id>.json`. Until this exists with `enabled: true`, ACL authorization is **not** enforced (lets you seed ACLs first).

```json
{
  "id": "Foo_EnableAclPrivilege",
  "enabled": true,
  "typeName": "Foo"
}
```

### 4. Create and access instances

**JavaScript:**

```javascript
// Create instance (creator gets a default AclEntry; AclPrivilege can add more via populateAcl)
Foo.make({ id: User.myUser().id, name: 'My Foo', description: '...' }).upsert();

// Check if current user can read/update/remove (ensure 'acl' is loaded or use getIfAclIsMissing: true)
var obj = Foo.make({ id: 'someId' }).get('this, acl');
if (obj.myUserCanRead(true)) {
  // ...
}
```

**Python:**

```python
c3.Foo.make({ 'id': c3.User.myUser().id, 'name': 'My Foo', 'description': '...' }).upsert()
obj = c3.Foo.make({ 'id': 'someId' }).get('this, acl')
if obj.myUserCanRead(True):
    pass  # ...
```

## Quick Reference (code)

### Check access in code

Requires `acl` to be loaded (or pass `getIfAclIsMissing: true`).

**JavaScript:**

```javascript
var obj = Foo.make({ id: id }).get('this, acl');
obj.myUserCanRead(true); // true if current user can read
obj.myUserCanUpdate(true); // true if current user can update
obj.myUserCanRemove(true); // true if current user can remove
obj.myUserCanModifyAcl(true); // true if current user can change ACL
```

**Python:**

```python
obj = c3.Foo.make({'id': id}).get('this, acl')
obj.myUserCanRead(True)
obj.myUserCanUpdate(True)
obj.myUserCanRemove(True)
obj.myUserCanModifyAcl(True)
```

### Add a grant and persist

**JavaScript:**

```javascript
var member = User.forId('userB'); // or Role.forId(...), UserGroup.forId(...)
var updated = obj.grantMemberReadUpdateRemove(member); // read+update+remove, no modifyAcl
updated.merge(); // or .upsert() as appropriate

// Or merge a custom AclEntry and persist
var entry = AclEntry.make({
  member: member,
  canUpdate: true,
  canRemove: false,
  canModifyAcl: false,
  source: null, // null = manual, not replaced by populateAcl
});
var updated = obj.mergeAclEntry(entry);
updated.merge();
```

### Is ACL enforced? Default ACL for new instances

**JavaScript:**

```javascript
AclEnabled.isAclEnforcedForMyUser(Foo); // true if ACL is enforced for current user on Foo
AclEnabled.defaultAclForMyUser(Foo); // default AclEntry for new Foo instances for my user

AclEnabledTypes.isEnabled(Foo); // true if Foo has ACL enforced (cached from EnableAclPrivilege)
```

## Enabling ACL on a type (detail)

1. **Mixin order** (if also using Configurable/Versionable): Configurable first, then AclEnabled, then Versionable.
2. **Mixin AclEnabled** on the entity type (adds `acl: [AclEntry]` and ACL helpers). For **non-entity (config) types**, use **ConfigAclEnabled** instead.
3. **Create EnableAclPrivilege** for the type with `enabled: true` so ACL is enforced and entries are maintained from AclPrivilege.
4. **Create AclPrivilege** objects: `typeName`, `acl` (expression returning member(s) or AclEntry/array), and `canUpdate` / `canRemove` / `canModifyAcl` (`'true'`, `'false'`, or `'fromSource'`).

> **Note:** Until EnableAclPrivilege is created and enabled, ACL authorization is not enforced; this allows seeding ACLs before turning enforcement on.

## Key types (concise)

| Type                    | Purpose                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AclEnabled**          | Mixin: adds `acl`, `myUserCanRead/Update/Remove/ModifyAcl`, `defaultAclForMyUser`, `populateAcl`, `refreshAcls`, `mergeAclEntry(s)`, `grantMemberReadUpdateRemove`. |
| **AclEntry**            | One grant: `member` (AccessControlEntity: User/Role/UserGroup), `canUpdate`, `canRemove`, `canModifyAcl`, `source` (AclSource).                                     |
| **AclPrivilege**        | Defines how entries are created: `typeName`, `acl` (expression returning member(s) or AclEntry/array), `canUpdate`/`canRemove`/`canModifyAcl`.                      |
| **EnableAclPrivilege**  | Per-type switch: `enabled: true` turns on ACL enforcement and automatic refresh from AclPrivilege.                                                                  |
| **AclSource**           | `Default` = creator default (replaced by populateAcl); `PrivilegePolicy` = from AclPrivilege, maintained by populateAcl.                                            |
| **AccessControl**       | Base for permission-like definitions (typeName, action, actionGroup); distinct from per-object ACLs.                                                                |
| **AccessControlEntity** | Abstract: User, Role, UserGroup (who can be an ACL member).                                                                                                         |

Full type list and platform docs: [acls-reference.md](acls-reference.md).

## Fetch/get vs update/remove

- **Fetch/get**: Query is filtered so only objects with an AclEntry for a member in the current user's member list (user + roles) are returned. Include traversals to ACL-enabled types also apply this filter.
- **Update/remove**: Checked against the object's ACL entries; at least one entry must authorize a member in the current user's member list. Creator of an AclEnabled object is always granted access.

Filtering/ordering that traverses an ACL-enabled reference does not add the ACL filter by default; use `@db(blockAclRefFiltering)` to block such filter/order use.

## Populating and refreshing ACLs

- **populateAcl(objs)**: For given instances (or null for all), (re)builds ACL entries from AclPrivilege expressions. Entries with source `PrivilegePolicy` are replaced; `Default` creator entry can be replaced when privilege-derived entries exist.
- **refreshAcls(spec)**: Batch refresh driven by `RefreshAclsSpec` (e.g. by type, ids, batch sizes); can run async and return a BatchJob. Used by app rebuild and PopulateAclIssue.
- **When to call**: After schema/privilege changes, or when dependencies of AclPrivilege expressions change. Automatic refresh only considers dependencies in the same app/tenant (not e.g. data-sharing facades).

## Common patterns

- **Creator access**: With ACL enforced, non-authorizer creators get a default AclEntry (source `Default`); removed/replaced when `populateAcl` adds privilege-based entries.
- **Add grant**: `obj.mergeAclEntry(entry)` or `mergeAclEntries(entries)`; then persist the returned object. Or `obj.grantMemberReadUpdateRemove(member)` for read+update+remove.
- **Types currently enforced**: `AclEnabledTypes` (cached, depends on EnableAclPrivilege); `AclEnabledTypes.isEnabled(type)`.

## Development checklist

- [ ] Entity type mixes `AclEnabled` (or non-entity mixes `ConfigAclEnabled`); mixin order correct if using Configurable/Versionable.
- [ ] `EnableAclPrivilege` seed created with `enabled: true` and correct `typeName`.
- [ ] `AclPrivilege` seed(s) created with `typeName`, `acl.expr`, and `canUpdate`/`canRemove`/`canModifyAcl` as needed.
- [ ] When checking access in code, load `acl` or call `myUserCan*` with `getIfAclIsMissing: true`.
- [ ] After `mergeAclEntry` / `mergeAclEntries` / `grantMemberReadUpdateRemove`, persist the returned object (e.g. `merge()` or `upsert()`).

## Common mistakes

1. **ACL not enforced** — Ensure an `EnableAclPrivilege` exists for the type with `enabled: true`.
2. **Wrong mixin order** — Use Configurable → AclEnabled → Versionable.
3. **Checking access without `acl`** — Include `acl` in `get()` or use `myUserCanRead(obj, true)` so the instance is refetched with ACL if needed.
4. **Forgetting to persist after merge** — `mergeAclEntry` / `grantMemberReadUpdateRemove` return an updated instance; call `merge()` or `upsert()` to persist.

## References

For platform doc links, full type list, and type definition file names, see [acls-reference.md](acls-reference.md).
