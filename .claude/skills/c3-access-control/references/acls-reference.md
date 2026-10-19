# C3 ACLs — Reference

## Table of Contents

1. [Platform docs](#platform-docs)
2. [Key types (source)](#key-types-source)
3. [Type definition files (.c3typ)](#type-definition-files-c3typ)

---

## Platform docs

- [Define Permissions](https://docs.c3.ai/docs/platform/latest/topic/access-control) — Overview of access control; includes data permissions (expression-based on Role).
- [Add Access Controls to a Type Using AclEnabled](https://docs.c3.ai/docs/platform/latest/topic/security-aclenabled) — Entity types; mixin AclEnabled, create EnableAclPrivilege and AclPrivilege.
- [Add Access Controls Using ConfigAclEnabled](https://docs.c3.ai/docs/platform/latest/topic/security-configaclenabled) — Non-entity (config) types; mixin ConfigAclEnabled, same privilege flow.

## Key types (source)

| Type                    | Purpose                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AclEnabled**          | Mixin: adds `acl`, `myUserCanRead/Update/Remove/ModifyAcl`, `defaultAclForMyUser`, `populateAcl`, `refreshAcls`, `mergeAclEntry(s)`, `grantMemberReadUpdateRemove`. |
| **ConfigAclEnabled**    | Mixin for non-entity types; store as config, accessible across apps.                                                                                                |
| **AclEntry**            | One grant: `member` (AccessControlEntity), `canUpdate`, `canRemove`, `canModifyAcl`, `source` (AclSource).                                                          |
| **AclPrivilege**        | Defines how entries are created: `typeName`, `acl` (expression → member(s) or AclEntry/array), `canUpdate`/`canRemove`/`canModifyAcl`.                              |
| **EnableAclPrivilege**  | Per-type switch: `enabled: true` turns on ACL enforcement and automatic refresh from AclPrivilege.                                                                  |
| **AclSource**           | `Default` = creator default (replaced by populateAcl); `PrivilegePolicy` = from AclPrivilege.                                                                       |
| **AccessControl**       | Base for permission-like definitions (typeName, action, actionGroup); distinct from per-object ACLs.                                                                |
| **AccessControlEntity** | Abstract: User, Role, UserGroup (who can be an ACL member).                                                                                                         |
| **AclEnabledTypes**     | Cached set of types with ACL enforced; `AclEnabledTypes.isEnabled(type)`.                                                                                           |
| **RefreshAclsSpec**     | Spec for batch refresh (e.g. by type, ids, batch sizes).                                                                                                            |

## Type definition files (.c3typ)

- `AclEnabled.c3typ`
- `ConfigAclEnabled.c3typ`
- `AclEntry.c3typ`
- `AccessControl.c3typ`
- `EnableAclPrivilege.c3typ`
- `AclPrivilege.c3typ`
- `AclSource.c3typ`
- `AccessControlEntity.c3typ`
- `AclEnabledTypes.c3typ`
- `RefreshAclsSpec.c3typ`
