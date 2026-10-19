/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// openapi_slice.js — READ-ONLY. Fetch one Agentix REST door's live OpenAPI spec
// and return ONLY the node you asked for, so you never inhale the whole document
// (~60 paths / ~75 schemas / tens of thousands of tokens) into context. This is
// the deterministic form of SKILL.md §4 "Recon — read the live spec first":
// point it at a door, name what you need, get back a few hundred tokens.
//
// Runs server-side via c3-js-exec against the AGENTIX app (the app hosting the
// Nexus.* types — resolve its id first with discover_nexus_app.js, SKILL.md §2).
// Auth + HTTP + array-normalization mirror c3auth_rest_call.js exactly.
//
// ARGS:
//   {
//     "apiBase": "/agent-api/v1",     // door whose /openapi.json to read
//     "want":    "paths" | "schema" | "required" | "operation",
//     "name":    "<schema name>"      // for want=schema/required, e.g. "McpConnectionWrite"
//                                     // for want=operation, the path key e.g. "/mcp-connections/create"
//   }
//
// Returns one of:
//   want=paths     -> { paths: ["/definitions", "/definitions/create", ...] }        (path keys only, names cheap)
//   want=schema    -> { name, schema: {...} }                                         (one components.schemas.<name>)
//   want=required  -> { name, required: [...] }                                       (that schema's required list)
//   want=operation -> { path, operation: {...} }                                      (paths[<path>], incl. requestBody schema ref)
//   not found      -> { error: "...", available: [...] }                              (nearest keys, so you can retry)

// Rhino's HttpResponse.json() deserializes a JSON ARRAY as an object with
// numeric string keys ({"0":...}), so a sliced schema's `required` / `enum`
// come back array-shaped. Normalize the returned node back to real arrays
// (same fix as c3auth_rest_call.js), so callers never special-case it.
function normalize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Array) {
    var arr = [];
    for (var i = 0; i < value.length; i++) arr.push(normalize(value[i]));
    return arr;
  }
  var keys = Object.keys(value);
  if (keys.length === 0) return {}; // spec nodes are objects; an empty {} is not an array here
  var isArrayShaped = true;
  for (var k = 0; k < keys.length; k++) {
    if (String(k) !== keys[k]) {
      isArrayShaped = false;
      break;
    }
  }
  if (isArrayShaped) {
    var out = [];
    for (var j = 0; j < keys.length; j++) out.push(normalize(value[keys[j]]));
    return out;
  }
  var obj = {};
  for (var m = 0; m < keys.length; m++) obj[keys[m]] = normalize(value[keys[m]]);
  return obj;
}

var apiBase = (ARGS && ARGS.apiBase) || '/agent-api/v1';
var want = (ARGS && ARGS.want) || 'paths';
var name = ARGS && ARGS.name;

var token = User.mySessionToken().signedToken;
var client = HttpClient.open(App.inst().externalUrl.endpoint(apiBase), null, null);
var resp = client
  .request('GET', '/openapi.json')
  .withHeader('Cookie', 'c3auth=' + token)
  .sendSync({});
var spec = resp.hasBody() ? resp.json() : null;
client.close();

var result;
if (!spec || typeof spec !== 'object') {
  result = { error: 'No OpenAPI spec returned from ' + apiBase + '/openapi.json (status ' + resp.statusCode + ').' };
} else if (want === 'paths') {
  result = { paths: spec.paths ? Object.keys(spec.paths) : [] };
} else if (want === 'operation') {
  var pathItem = spec.paths && spec.paths[name];
  result = pathItem
    ? { path: name, operation: normalize(pathItem) }
    : { error: 'No path "' + name + '" in this door.', available: spec.paths ? Object.keys(spec.paths) : [] };
} else {
  // want=schema or want=required
  var schemas = (spec.components && spec.components.schemas) || {};
  var schema = schemas[name];
  if (!schema) {
    result = { error: 'No schema "' + name + '" in this door.', available: Object.keys(schemas) };
  } else if (want === 'required') {
    result = { name: name, required: normalize(schema.required || []) };
  } else {
    result = { name: name, schema: normalize(schema) };
  }
}

result;
