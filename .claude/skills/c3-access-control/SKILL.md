---
name: c3-access-control
description: |
  Work with C3 AI access control — Roles, Permissions, UserGroups, and ACLs. Use this skill when:
  (1) Defining custom roles in metadata/Role/ with permissions
  (2) Adding or removing users from groups/roles
  (3) Checking user permissions (isClusterAdmin, isEnvAdmin, securityLevel)
  (4) Managing IDP group mappings
  (5) Implementing permission-based UI rendering
  (6) Running code as different users/roles in tests
  (7) Understanding action groups (read, write, delete) and the C3 security hierarchy
  (8) Adding per-object permissions (who can see/edit specific instances)
  (9) Configuring ACL-enabled entity or config types
  (10) Populating or refreshing ACLs from AclPrivilege
  (11) User asks about ACLs, access control lists, AclEnabled, ConfigAclEnabled, data permissions, or per-object access
core: true
category: platform
version: 8.9.0
minimumVersion: 8.7.0
---

# C3 Access Control

Unified skill for **role-based** and **per-object (ACL)** access control in C3 AI.

## Reference Dispatch

| Task                                                                                                            | Reference File                                                                       |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Roles, permissions, UserGroups, security hierarchy, custom roles, IDP mappings, TestRunner, permission-based UI | [references/roles-permissions.md](references/roles-permissions.md)                   |
| API patterns for User, UserGroup, Role, SessionToken, error handling, test patterns                             | [references/api-patterns.md](references/api-patterns.md)                             |
| Conceptual model: User vs UserGroup vs Role (relationship & distinction)                                        | [references/users-usergroups-roles.md](references/users-usergroups-roles.md)         |
| Per-object ACLs: AclEnabled, ConfigAclEnabled, AclEntry, AclPrivilege, EnableAclPrivilege                       | [references/acls.md](references/acls.md)                                             |
| ACL type definitions, platform doc links                                                                        | [references/acls-reference.md](references/acls-reference.md)                         |

## When to Use Roles vs ACLs

| Mechanism                                       | Best For                                                                                                       | How It Works                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Roles & Permissions** (type-level)            | Controlling which _actions_ (read, write, delete, custom methods) a user can perform on an entire type         | Define permissions in `metadata/Role/*.json`; users get permissions through UserGroup membership |
| **Data Permissions** (expression-based on Role) | Restricting _which rows_ a user sees when the rule is the same for all instances (e.g. `building == 'bld1'`)   | Expression in `dataPermissions` on the Role; evaluated per object at query time                  |
| **ACLs** (per-object)                           | Restricting _which rows_ based on explicit grants per instance (e.g. "only users in this object's department") | Mixin `AclEnabled`; each instance carries an `acl` array of `AclEntry` grants                    |

**Combining:** Role permissions and ACL/data permissions are independent layers. A user needs the role permission _and_ must pass the ACL/data-permission check. ACL and expression-based data permissions are combined with OR (user needs at least one path).

## Quick Decision Guide

1. "Can this user call `fetch` on Type X at all?" → **Role permission** (`allow:X:read:`)
2. "Can this user see _all_ rows, or only some based on a simple rule?" → **Data permission** on Role (`dataPermissions`)
3. "Can this user see _this specific instance_, based on who was granted access?" → **ACL** (AclEnabled + AclPrivilege)
