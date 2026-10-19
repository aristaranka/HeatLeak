/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// attach_capability.js — the deterministic form of the read -> merge -> send
// discipline (SKILL.md §5, recipes §6.5/§6.6). Update REPLACES each array you
// send, so a naive single-name update silently wipes every other attachment;
// this script reads the current definition, merges, and sends the WHOLE array,
// so that footgun cannot happen. Only the arrays you name are touched
// (PATCH-merge leaves the rest of the definition alone).
//
// DEFAULTS TO DRY RUN. dryRun:true (the default) reads + computes the merged
// arrays and returns them WITHOUT writing, so you can show the user exactly what
// would change and get approval (SKILL.md rule 1) before re-running with
// dryRun:false. A capability name unknown to the registry still 400s server-side
// on the real write — author the body first (recipes §6.2–§6.4).
//
// Runs server-side via c3-js-exec against the AGENTIX app. Auth + HTTP +
// array-normalization mirror c3auth_rest_call.js.
//
// ARGS:
//   {
//     "agentName": "<name>",
//     "mode": "add" | "remove" | "set",   // default "add"
//     "skill_names":        [...],         // any subset of the four arrays
//     "mcp_connection_keys":[...],
//     "plugin_names":       [...],
//     "custom_tool_names":  [...],
//     "dryRun": true                       // default true — set false to apply
//   }
//
// Returns:
//   dry run -> { dryRun: true, agentName, current: {<array>:[...]}, would: {<array>:[...]} }
//   applied -> { dryRun: false, agentName, sent: {<array>:[...]}, statusCode, body }
//   error   -> { error: "agent '<name>' not found" }

function normalize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Array) {
    var arr = [];
    for (var i = 0; i < value.length; i++) arr.push(normalize(value[i]));
    return arr;
  }
  var keys = Object.keys(value);
  if (keys.length === 0) return [];
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

var token = User.mySessionToken().signedToken;
var cookie = 'c3auth=' + token;

function rest(apiBase, method, path, body) {
  var client = HttpClient.open(App.inst().externalUrl.endpoint(apiBase), null, null);
  var req = body
    ? client.request(method, path, body).withHeader('Content-Type', 'application/json')
    : client.request(method, path);
  var resp = req.withHeader('Cookie', cookie).sendSync({});
  var r = { statusCode: resp.statusCode, body: resp.hasBody() ? normalize(resp.json()) : null };
  client.close();
  return r;
}

function has(arr, v) {
  for (var i = 0; i < arr.length; i++) if (arr[i] === v) return true;
  return false;
}
function merge(current, incoming, mode) {
  current = current || [];
  var out = [];
  if (mode === 'set') {
    for (var s = 0; s < incoming.length; s++) if (!has(out, incoming[s])) out.push(incoming[s]);
    return out;
  }
  if (mode === 'remove') {
    for (var r = 0; r < current.length; r++) if (!has(incoming, current[r])) out.push(current[r]);
    return out;
  }
  // add (union), current first, preserving order
  for (var c = 0; c < current.length; c++) if (!has(out, current[c])) out.push(current[c]);
  for (var a = 0; a < incoming.length; a++) if (!has(out, incoming[a])) out.push(incoming[a]);
  return out;
}

var agentName = ARGS && ARGS.agentName;
var mode = (ARGS && ARGS.mode) || 'add';
var dryRun = !(ARGS && ARGS.dryRun === false); // default true
var ARRAYS = ['skill_names', 'mcp_connection_keys', 'plugin_names', 'custom_tool_names'];

var defs = rest('/agent-api/v1', 'GET', '/definitions', null);
var row = null;
if (defs.body instanceof Array) {
  for (var i = 0; i < defs.body.length; i++) {
    if (defs.body[i] && defs.body[i].name === agentName) {
      row = defs.body[i];
      break;
    }
  }
}

var result;
if (!row) {
  result = { error: "agent '" + agentName + "' not found in GET /definitions" };
} else {
  var current = {};
  var would = {};
  for (var q = 0; q < ARRAYS.length; q++) {
    var key = ARRAYS[q];
    if (ARGS[key]) {
      current[key] = row[key] || [];
      would[key] = merge(row[key], ARGS[key], mode);
    }
  }
  if (dryRun) {
    result = { dryRun: true, agentName: agentName, mode: mode, current: current, would: would };
  } else {
    var upd = rest('/agent-api/v1', 'POST', '/definitions/' + agentName + '/update', would);
    result = { dryRun: false, agentName: agentName, sent: would, statusCode: upd.statusCode, body: upd.body };
  }
}

result;
