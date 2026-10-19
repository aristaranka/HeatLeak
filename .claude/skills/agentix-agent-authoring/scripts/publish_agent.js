/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// publish_agent.js — the deterministic form of the whole §6.8 publish sequence,
// which otherwise spans four hand-run steps and three separate gotchas:
//   1. resolve the definition id (names -> ids; the REST view omits id, so the
//      Nexus.Agent.DefinitionApi.list facade is required — the raw
//      Nexus.Agent.Definition entity is ACL-blocked even for an AgentAdmin),
//   2. preflight every target with Nexus.Agent.ConfigBundleApi.checkTargetApp
//      (publishing needs AppMode.DEV; a non-ok code is an environment fact, not
//      a retryable error),
//   3. publish via the ONE camelCase door (/publish takes defs/appIds, not
//      snake_case), then read the PER-ROW status (ok:true does not mean success).
// This script does all of it and REFUSES to publish if any preflight is non-ok.
//
// DEFAULTS TO DRY RUN. dryRun:true (the default) resolves ids + preflights and
// returns the verdicts WITHOUT publishing, so you can confirm the target(s) with
// the user (SKILL.md rule 1) before re-running with dryRun:false.
//
// Runs server-side via c3-js-exec against the AGENTIX app (host of the Nexus.*
// types). Auth + HTTP + array-normalization mirror c3auth_rest_call.js.
//
// ARGS:
//   {
//     "agentNames": ["<name>", ...],   // resolved to ids for you (or)
//     "agentIds":   ["<uuid>", ...],   // pass ids directly if you already have them
//     "appIds":     ["<cluster>-<env>-<app>", ...],
//     "dryRun": true                   // default true — set false to publish
//   }
//
// Returns:
//   { resolvedIds: {"<name>":"<id>", ...}, unresolved: [...names], preflight: {"<appId>":{ok,code,mode}, ...},
//     published: false, reason: "dry_run" | "preflight_failed" | "no_ids" }
//   { ...same..., published: true, ok, results: [{agentId,agentName,appId,status,error,sha,writtenUrl}, ...] }

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

var names = (ARGS && ARGS.agentNames) || [];
var ids = (ARGS && ARGS.agentIds) || [];
var appIds = (ARGS && ARGS.appIds) || [];
var dryRun = !(ARGS && ARGS.dryRun === false); // default true

// Step 1 — resolve names -> ids (the REST view omits id, so use the DefinitionApi.list facade;
// the raw Nexus.Agent.Definition entity is ACL-blocked even for an AgentAdmin).
var resolvedIds = {};
var unresolved = [];
var allIds = [];
for (var d = 0; d < ids.length; d++) allIds.push(ids[d]);
if (names.length) {
  var byName = {};
  try {
    var fetched = Nexus.Agent.DefinitionApi.list({ include: 'id,name', limit: 200 });
    var objs = (fetched && fetched.objs) || [];
    for (var f = 0; f < objs.length; f++) if (objs[f]) byName[String(objs[f].name)] = String(objs[f].id);
  } catch (e) {
    /* byName stays empty; every name falls into unresolved */
  }
  for (var n = 0; n < names.length; n++) {
    if (byName[names[n]]) {
      resolvedIds[names[n]] = byName[names[n]];
      allIds.push(byName[names[n]]);
    } else {
      unresolved.push(names[n]);
    }
  }
}

// Step 2 — preflight every target (positional arg; a named-arg object throws).
var preflight = {};
var allOk = appIds.length > 0;
for (var a = 0; a < appIds.length; a++) {
  try {
    preflight[appIds[a]] = normalize(Nexus.Agent.ConfigBundleApi.checkTargetApp(appIds[a]));
  } catch (e) {
    preflight[appIds[a]] = { ok: false, code: 'error', error: String(e) };
  }
  if (!preflight[appIds[a]] || preflight[appIds[a]].ok !== true) allOk = false;
}

var base = { resolvedIds: resolvedIds, unresolved: unresolved, preflight: preflight };

var result;
if (!allIds.length) {
  base.published = false;
  base.reason = 'no_ids';
  result = base;
} else if (!allOk) {
  base.published = false;
  base.reason = 'preflight_failed';
  result = base;
} else if (dryRun) {
  base.published = false;
  base.reason = 'dry_run';
  result = base;
} else {
  // Step 3 — publish through the camelCase door, then return per-row status.
  var client = HttpClient.open(App.inst().externalUrl.endpoint('/agent-config-bundle-api/v1'), null, null);
  var resp = client
    .request('POST', '/publish', { defs: allIds, appIds: appIds })
    .withHeader('Content-Type', 'application/json')
    .withHeader('Cookie', cookie)
    .sendSync({});
  var body = resp.hasBody() ? normalize(resp.json()) : null;
  client.close();
  base.published = true;
  base.ok = body ? body.ok : null;
  base.results = body ? body.results : null;
  base.warnings = body ? body.warnings : null;
  result = base;
}

result;
