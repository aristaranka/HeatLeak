# Auth — agentix-agent-authoring

Writes are **admin-gated**; reads are open.

| Operation                                                               | Required role                                                          |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Create / update / delete a definition, skill, plugin, or MCP connection | `Agentix.AgentAdmin` (canonical; `Nexus.AgentAdmin` is a legacy alias) |
| **Publish**, preflight a target, read publish history                   | `Agentix.AgentAdmin` — same role ACL                                   |
| List / read definitions, skills, plugins, connections, models, apps     | any authenticated user (`Agentix.User`)                                |

The role must be held **on Agentix itself** — a role on the consuming app grants
nothing there. Confirm the caller holds `Agentix.AgentAdmin` before a write; if
they don't, say so rather than retrying. Skill and plugin writes are always
global; an MCP connection defaults to `global`, and `scope=user` forces it to
the caller.

**How `c3auth` is obtained in real C3 server code:**

```
User.mySessionToken().signedToken
```

`SessionToken.signedToken` is documented as _"the signed and serialized token
string… what the client sends to authenticate requests to the server"_ — this
**is** the `c3auth` value. Server code acting as the logged-in user mints or
reuses that user's own token rather than holding a service credential.

For _cross-cluster_ targets (no shared cookie domain) real code instead uses an
admin service-account token (`Nexus.RemoteCluster.AuthConfig.serviceTokenByApp`)
or a per-user OAuth token (`Nexus.RemoteCluster.UserToken` + its vault) — a
different mechanism, relevant only when bridging clusters.
