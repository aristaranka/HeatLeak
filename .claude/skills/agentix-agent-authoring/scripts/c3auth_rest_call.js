/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// c3auth_rest_call.js — generic single-call REST client, authenticated via the
// CURRENT USER's own c3auth session token (User.mySessionToken().signedToken),
// run server-side via c3-js-exec. This is the REST-authoring script this skill
// ships (§3 onward) — every agent/skill/MCP/plugin recipe in SKILL.md targets
// it. The sibling discover_nexus_app.js script finds Nexus's appId from a
// consumer app. This script drives ANY operation on the
// five Nexus REST doors (definitions, skills, MCP connections, plugins, and
// the config-bundle publish door) generically via {apiBase, method, path,
// body} - no hardcoded shape per operation.
//
// SAFETY POSTURE: this script is a generic RELAY, not itself read-only. It
// performs exactly the one HTTP call described by ARGS - so whether a given
// invocation reads or writes is decided entirely by ARGS.method/path. The
// caller is responsible for confirming any mutating call with the user BEFORE
// invoking this (SKILL.md rule 1), and for the fact that DELETE paths are
// irreversible with no unpublish/restore door (SKILL.md 6.9). This script
// itself never retries, never loops, and never writes to the filesystem or to
// Microservice.Config.
//
// rootUrl is AUTO-DERIVED from App.inst().externalUrl — the app this script
// actually runs on (i.e. the <appId> you pass to c3-js-exec) — via
// App.externalUrl.endpoint(apiBase). Verified empirically: this produces the
// exact same external URL as manually supplying rootUrl. You never need to
// look up or hardcode a rootUrl/appUrl by hand. An explicit ARGS.rootUrl is
// still honored if supplied (e.g. deliberately targeting a DIFFERENT app's
// REST door than the one this script executes on) — omit it for the common
// case.
//
// Four things found + fixed empirically, all baked in below:
//   1. `mySessionToken` is a STATIC-style call: `User.mySessionToken()`, NOT
//      `User.myUser().mySessionToken()` (that throws a Js#exec Err.NoMatch).
//   2. This Rhino engine's `HttpResponse.json()` deserializes a JSON ARRAY as
//      an object with numeric string keys ({"0":..., "1":...}), not a real JS
//      array — `.length` / `arr[i]` silently misbehave. This script recursively
//      normalizes any such object back into a real array before returning, so
//      callers never have to special-case it again.
//   3. `rootUrl` doesn't need to be user-supplied at all — `App.inst()` always
//      resolves to the app the script is executing ON, and its `externalUrl`
//      IS the correct public base URL for that same app's own REST doors.
//   4. Attaching a JSON body is exactly ONE call shape: `client.request(method,
//      path, entity)` — the 3-ARGUMENT form, passing the plain object directly
//      as the third argument. `withBody(jsonString, "application/json")` on a
//      2-arg request() throws (its first param is typed !?binary, not string —
//      confirmed live); `sendSync(bodyObject)` also throws (sendSync's param is
//      an HttpRequest.SendSpec, not the body). No base64, no manual
//      Content-Type header — the platform serializes the object on its own via
//      the 3-arg form.
//
// ARGS (injected by c3-js-exec):
//   {
//     "rootUrl":  "https://<cluster>.<domain>/<env>/<app>",   // OPTIONAL — auto-derived if omitted
//     "apiBase":  "/agent-api/v1",   // or /agent-skills-api/v1, /agent-mcp-api/v1,
//                                    // /agent-plugins-api/v1, /agent-config-bundle-api/v1
//     "method":   "GET" | "POST" | "DELETE" | ...,
//     "path":     "/definitions",           // path WITHIN apiBase, leading slash
//     "body":     { ... } or omitted/null   // raw REST payload (NOT pre-wrapped)
//   }
//
// Returns: { statusCode: int, body: <normalized json or null> }
//
// Example ARGS for each op used this session (rootUrl omitted — auto-derived):
//   create skill:     {"apiBase":"/agent-skills-api/v1","method":"POST","path":"/skills/create",
//                       "body":{"name":"...","files":{"SKILL.md":"..."}}}
//   list definitions: {"apiBase":"/agent-api/v1","method":"GET","path":"/definitions"}
//   attach to agent:  {"apiBase":"/agent-api/v1","method":"POST",
//                       "path":"/definitions/<agentName>/update","body":{"skill_names":[...]}}
//   publish agent:    {"apiBase":"/agent-config-bundle-api/v1","method":"POST","path":"/publish",
//                       "body":{"defs":["<definitionId>"],"appIds":["<cluster>-<env>-<app>"]}}
//                      NOTE: this door is camelCase (defs/appIds), unlike every other
//                      body above; snake_case there 400s.

// Fix #2: recursively turn a Rhino "array-shaped object" ({"0":x,"1":y,...}) back
// into a real JS array. Leaves real arrays, primitives, and non-array-shaped
// objects untouched; recurses into nested objects/arrays. An EMPTY object {} is
// ambiguous (could be an empty array or empty object) — Rhino's json() never
// round-trips that distinction, so this treats {} as [] since every observed
// empty-collection field in this API (skill_names, plugin_names, etc.) is an
// array in the schema, never an object.
function normalize(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Array) {
    var arr = [];
    for (var i = 0; i < value.length; i++) {
      arr.push(normalize(value[i]));
    }
    return arr;
  }
  var keys = Object.keys(value);
  if (keys.length === 0) {
    return [];
  }
  var isArrayShaped = true;
  for (var k = 0; k < keys.length; k++) {
    if (String(k) !== keys[k]) {
      isArrayShaped = false;
      break;
    }
  }
  if (isArrayShaped) {
    var out = [];
    for (var j = 0; j < keys.length; j++) {
      out.push(normalize(value[keys[j]]));
    }
    return out;
  }
  var obj = {};
  for (var m = 0; m < keys.length; m++) {
    obj[keys[m]] = normalize(value[keys[m]]);
  }
  return obj;
}

// Fix #1: static-style call, not chained off myUser().
var token = User.mySessionToken().signedToken;
var cookieHeader = 'c3auth=' + token;

// Fix #3: derive rootUrl from the app this script is executing on, unless the
// caller explicitly overrode it (e.g. deliberately targeting a different app).
var baseUrl;
if (ARGS.rootUrl) {
  baseUrl = ARGS.rootUrl + ARGS.apiBase;
} else {
  baseUrl = App.inst().externalUrl.endpoint(ARGS.apiBase);
}

var client = HttpClient.open(baseUrl, null, null);

// Fix #4: 3-arg request(method, path, entity) — the ONLY shape that accepts a
// JSON body directly. Do not "fix" this to 2-arg + withBody(string) — that
// throws (see Fix #4 note above).
var req;
if (ARGS.body) {
  req = client.request(ARGS.method, ARGS.path, ARGS.body).withHeader('Content-Type', 'application/json');
} else {
  req = client.request(ARGS.method, ARGS.path);
}
req = req.withHeader('Cookie', cookieHeader);

var resp = req.sendSync({});
var result = {
  statusCode: resp.statusCode,
  body: resp.hasBody() ? normalize(resp.json()) : null,
};
client.close();

result;
