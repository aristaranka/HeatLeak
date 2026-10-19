# Users, UserGroups, and Roles — Relationship and Distinction

This reference explains **what** User, UserGroup, and Role are and **how they relate**. It does not duplicate API or implementation details for adding or removing users, permission checks, custom role authoring, IDP mappings, TestRunner, and security hierarchy — those are in the main `c3-roles-permissions` SKILL.md.

## When to Use This

- Explaining or documenting the _difference_ between User, UserGroup, and Role
- Clarifying that roles are **metadata**, User/UserGroup are **entities**, and **role id must equal UserGroup id**
- Understanding the model: c3Groups vs idpGroups, nested roles, and where IDP mappings fit
- Onboarding or docs that describe the C3 security _model_ (not implementation)
- Debugging "why does this user have this permission?" (tracing User → groups → Role conceptually)

**When you need code or APIs** (assigning users to groups, checking permissions, defining roles in metadata, IDP mappings): see the main SKILL.md.

## Key Concepts

### 1. User — Identity (Entity)

**User** is an **entity**: stored in the cluster, fetched with `User.forId()`, created/updated at runtime. It represents an **individual** (human or app) with credentials and attributes.

- **Represents:** An identity that can log in and perform actions in the system.
- **Key idea:** Users are _assigned to_ one or more **UserGroups**; they do not "have" roles directly. Permissions come through the groups they belong to.
- **Group membership:** Users are assigned to groups in two ways — **c3Groups** (assigned in C3) and **idpGroups** (from Identity Provider mappings). **groups** are a union of both **c3Groups** and **idpGroups**.

### 2. UserGroup — Container That Maps Users to a Role (Entity)

**UserGroup** is an **entity**: stored in the cluster, fetched with `UserGroup.forId()`, updated at runtime. It is a **collection** that associates users with a **single** Role—the link between "who" (users) and "what they can do" (role/permissions).

- **Represents:** A named group (e.g. `C3.Developer`, `MyApp.Role.Admin`) that has exactly one Role and contains many users. Its **id must equal the Role id** (the same id is used for both the Role and the UserGroup that grants it).
- **Key idea:** UserGroups _have_ a Role. All users in the group inherit that role's permissions. UserGroups can be mapped to external IDP groups; then users in that IDP group get the C3 UserGroup automatically.

### 3. Role — Permission Set (Metadata); Role Id Must Equal UserGroup Id

**Role** is **metadata**: role definitions live in `metadata/Role/*.json` (and platform roles in the Platform package). They are loaded as part of package/metadata, not fetched like entity data. A Role defines a **collection of permissions** (what actions and resources are allowed).

- **Represents:** A set of permissions. The role's id is the same as the UserGroup id that grants that role.
- **Key idea:** **Role id must equal UserGroup id.** "Adding a user to a role" means adding the user to the **UserGroup** whose id equals that role id. Role constants (e.g. `Role.DEVELOPER`) are those shared ids. A role can list other role ids in `nestedRoles` and inherits their permissions (additive).

## Relationship Summary

| Concept       | What it is                                                                   | Entity or metadata? | Relationship to others                                                                                                           |
| ------------- | ---------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **User**      | Individual identity                                                          | **Entity**          | Assigned to one or more **UserGroups**; gets permissions via those groups' **Roles**; has `c3Groups` and `idpGroups`.            |
| **UserGroup** | Collection of Users associated with exactly one Role that shares the same id | **Entity**          | Has one **Role** (id = role id); contains **Users**; can have **IDP group mappings**; id must equal the Role id.                 |
| **Role**      | Permission set                                                               | **Metadata**        | Defined in `metadata/Role/*.json`; **role id = UserGroup id**; can have **nestedRoles**; attached to the UserGroup with that id. |

**Chain:** User → belongs to UserGroups → each UserGroup has one Role → Role defines permissions.

## Relationship Diagram (Conceptual)

```
User  ──(member of)──►  UserGroup  ──(has one)──►  Role  ──(grants)──►  Permissions
  │                            │                         │
  │                            │                         └── nestedRoles, dataPermissions
  │                            └── users, idpGroups, inactive
  └── groups / c3Groups / idpGroups
```

**Distinction at a glance:** **User** = _who_ (identity). **UserGroup** = _which group_ (container for users + one role). **Role** = _what they can do_ (permissions). You **add a User to a UserGroup** (by that group's id, which you refer to via **Role** constants); the **Role** attached to that UserGroup defines the user's permissions.

## Best Practices Checklist (Model Clarity)

- [ ] Keep the model clear: **User** = identity (entity); **UserGroup** = container with one Role (entity); **Role** = permission set (metadata); **role id = UserGroup id**.
- [ ] Grant access by **adding users to UserGroups**, not by "assigning a Role" to a User. Prefer "users are in groups" and "groups have a role" over "users have roles."
- [ ] For custom roles: **role id = UserGroup id** (the id in the role metadata JSON is the group id); the UserGroup that grants the role uses that same id.

## Common Pitfalls & Solutions

### Pitfall 1: Treating Role as something you "assign to a User"

**Problem:** Code or docs that try to "assign a Role" directly to a User. The platform does not model User ↔ Role directly.

**Solution:** Assign the user to a **UserGroup** whose Role is the one you want. The Role id is the UserGroup id (e.g. `User.forId(userId).addToGroup(Role.DEVELOPER)` adds to the UserGroup with id `C3.Developer`).

### Pitfall 2: Treating "Role" and "UserGroup" as unrelated

**Problem:** Code or docs treat Role and UserGroup as separate concepts without stating that the Role id is the UserGroup id for built-in and many custom roles.

**Solution:** Describe it explicitly: "Adding a user to Role.DEVELOPER adds them to the UserGroup with id `C3.Developer`, which has the Developer role."

### Pitfall 3: Saying "users have roles"

**Problem:** Saying "users have roles" can obscure the model (users have _groups_, groups have _roles_).

**Solution:** Prefer "users are a part of groups" and "groups have a role"; or "users get permissions through the groups they belong to."

### Pitfall 4: Role id not equal to UserGroup id (custom roles)

**Problem:** Defining a role in `metadata/Role/MyApp.Role.User.json` but expecting a _different_ UserGroup id to grant that role. The platform expects one id for both.

**Solution:** Use one id for both. The role's `id` in the metadata is the UserGroup id; users are added to that same id to get the role.

## Related Concepts

- **Skill: c3-roles-permissions** — Add/remove users from groups, check permissions (isClusterAdmin, securityLevel, hasGroup), IDP group mappings, custom roles in `metadata/Role/`, action groups, security hierarchy, TestRunner.asRole/asUser, permission-based UI.
- **C3 docs:** [Security – users, roles, and groups](https://docs.c3.ai/docs/platform/latest/topic/security-groups), [Assigning roles](https://docs.c3.ai/docs/platform/latest/topic/security-assigning-roles), [Access control](https://docs.c3.ai/docs/platform/latest/topic/access-control), [Access control examples](https://docs.c3.ai/docs/platform/latest/topic/access-control-examples).
