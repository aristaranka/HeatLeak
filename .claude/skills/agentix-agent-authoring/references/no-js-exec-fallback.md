# Running the scripts without `c3-js-exec`

Long-form companion to `SKILL.md` §3. Read this only if your harness has no
`c3-js-exec` tool. Everything else in the skill works unchanged.

## The wrapper is not a C3 API

`c3-js-exec <appId> <file.js> [args]` is **this harness's own wrapper name**.
A coding agent in a different environment won't have that exact tool. What it
wraps is a real, generic platform action any C3 app exposes to any caller with
`Js.exec` permission:

```
POST <appUrl>/api/8/Js/exec
Cookie: c3auth=<token>          (or however your environment carries auth)
Content-Type: application/json

{"src": "<javascript source as a string>"}
```

## Two things you must get right

Both were found by testing the raw call directly, not assumed. Get either
wrong and you silently receive `204 No Content` or a useless deeply-boxed
result.

### 1. Use top-level `eval()` — never wrap the script in a function

Every script in this skill ends in a **bare trailing expression** (`result;`).
Inside a function body that is just a statement: it returns nothing without an
explicit `return`, so a naive `(function(){ <script> })()` wrapper yields
`undefined` and the endpoint answers `204`.

`eval()`'s completion value **is** the last expression evaluated, no `return`
needed. This is exactly what `c3-js-exec` itself does (confirmed by reading
its source): its real `src` is `var __c3r = eval(<your script, unmodified>);`.

### 2. Wrap the whole `eval()` in `JSON.stringify(...)`

Skip this and an object result comes back **deep-boxed** — every nested field
individually wrapped as `{"type":"Boxed<...>","value":...}` (confirmed by
direct testing). A single top-level `.value` unwrap is not enough.
`JSON.stringify` around the whole thing returns one string, which boxes flat.

Final shape of the `src` you POST:

```
JSON.stringify(eval(<the script's exact original text, as a JSON string>));
```

## Translating any recipe — step by step

Verified end-to-end against the real, unmodified `discover_nexus_app.js` (not
a hand-copied approximation):

1. Read the script's file content **exactly as shipped** — no edits.
2. Prepend the args file's JSON as a literal `var ARGS = {...};\n` line.
3. JSON-encode that whole combined string **once** (so newlines and quotes
   inside it are escaped as one JS string literal), then build the final `src`
   by **string concatenation**:
   `"JSON.stringify(eval(" + <that encoded string> + "));"`
   Template interpolation here duplicates the encoding — don't.
4. POST `{"src": "<that>"}` to `/api/8/Js/exec` on the resolved Agentix app's
   URL, with `c3auth` however your environment authenticates (a `c3auth`
   cookie is the norm; see `SKILL.md` §7 for how real C3 code mints one via
   `User.mySessionToken()`).
5. Read `.value` from the `200` response and `JSON.parse()` it — that's your
   clean result, identical to what `c3auth_rest_call.js` returns via
   `c3-js-exec`.

Confirmed with the real file: this produced the exact same
`{"resolved":"none","error":"..."}` output the script gives through
`c3-js-exec` — same script, same result, different transport.

## `c3-run` steps have a fallback too

Two publish-path steps in `SKILL.md` §6.7 use `c3-run` rather than the REST
door: resolving definition ids (`Nexus.Agent.DefinitionApi.list`) and preflight
(`Nexus.Agent.ConfigBundleApi.checkTargetApp`). Both are typed platform methods,
and there are two ways to reach them without `c3-run`.

### Preferred: call the method inside a `Js.exec` script

No second transport to get right — you already have `Js.exec` working from the
steps above, and the method is a plain global in JS. **Pass arguments
positionally:**

```js
Nexus.Agent.ConfigBundleApi.checkTargetApp('plat-myenv-myapp');
// -> {"ok":false,"code":"not_dev_mode","mode":"test"}
```

A named-arg object **throws** here — `checkTargetApp({appId: "…"})` fails with
`Invalid value … for parameter: appId: !string`. Positional only. (Verified live.)

### Alternative: the typed REST endpoint

```
POST <nexusAppUrl>/api/8/Nexus.Agent.ConfigBundleApi/checkTargetApp
Content-Type: application/json; charset=UTF-8
Cookie: c3auth=<token>

{"appId":"<cluster>-<env>-<app>"}
```

The method name is the URL's last segment and the JSON body carries the named
arguments. **The `charset=UTF-8` is load-bearing:** omit it and the call returns

```
500  {"type":"Error","message":"Error calling /api/8/… with provided values, error UTF-8, application/json"}
```

That message reads like a malformed body, so it sends you rewriting the payload
when the real fix is one header parameter. With the charset present the exact
same body returns `200`. (Verified live — bare `application/json` 500s, the
charset form succeeds.)

### Worked example: `publishHistory` via `/api/8`

Retrieving publication history for an agent (recipes §6.8 → Publication
history) without `c3-run`:

**Option A — inside `Js.exec` (preferred):**

```js
// positional args — the method takes (agentId, limit, status)
var result = Nexus.Agent.ConfigBundleApi.publishHistory('<definition-uuid>', 50, 'succeeded');
result;
```

Wrap in `JSON.stringify(eval(...))` per the encoding rules above, then POST to
`/api/8/Js/exec` on `<nexusAppUrl>`.

**Option B — typed REST endpoint:**

```
POST <nexusAppUrl>/api/8/Nexus.Agent.ConfigBundleApi/publishHistory
Content-Type: application/json; charset=UTF-8
Cookie: c3auth=<token>

{"agentId":"<definition-uuid>","limit":50,"status":"succeeded"}
```

Returns `{rows: [{agentId, appId, publishedAt, publishedBy, sha, status,
error}]}`. Remember: `charset=UTF-8` is required on this route (see above),
and the target must be the **Agentix** appId, not the consumer app.
