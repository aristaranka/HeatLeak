/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// capability_report.js — READ-ONLY. Gather everything the "what can this agent
// have attached" report (references/recipes.md → Reporting) needs, in ONE call,
// so the agent never hand-assembles it from four separate list calls: the agent
// definition, the global skills / MCP connections / plugins registries (a plugin
// 404 is reported as gated, not hidden), and — when the agent id resolves — its
// publish history. The agent turns this JSON into prose + the publish-status line.
//
// Runs server-side via c3-js-exec against the AGENTIX app (host of the Nexus.*
// types — resolve its id with discover_nexus_app.js, SKILL.md §2). Auth + HTTP +
// array-normalization mirror c3auth_rest_call.js.
//
// ARGS: { "agentName": "<name>" }   // the definition to report on
//
// Returns:
//   {
//     agent:       { name, id, ...definition row } | null,   // id via Nexus.Agent.Definition.fetch (list omits it)
//     skills:      { rows: [...] },
//     mcp:         { rows: [...] } | { gated: false, error },
//     plugins:     { rows: [...] } | { gated: true },        // gated=true when nexus-plugins is off (404)
//     publishHistory: { rows: [...] } | { error }            // only when the id resolved
//   }

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

var agentName = ARGS && ARGS.agentName;

// Definition row (list omits id) + the id via the typed fetch.
var defs = rest('/agent-api/v1', 'GET', '/definitions', null);
var agentRow = null;
if (defs.body instanceof Array) {
  for (var i = 0; i < defs.body.length; i++) {
    if (defs.body[i] && defs.body[i].name === agentName) {
      agentRow = defs.body[i];
      break;
    }
  }
}
var agentId = null;
try {
  // Same FetchSpec shape the §6.8 recipe verified via c3-run; match name in JS
  // rather than trusting a filter-string dialect. The REST view omits id, and the
  // raw Nexus.Agent.Definition entity is ACL-blocked even for an AgentAdmin, so
  // read through the DefinitionApi.list facade.
  var fetched = Nexus.Agent.DefinitionApi.list({ include: 'id,name', limit: 200 });
  var objs = (fetched && fetched.objs) || [];
  for (var f = 0; f < objs.length; f++) {
    if (objs[f] && String(objs[f].name) === agentName) {
      agentId = String(objs[f].id);
      if (agentRow) agentRow.id = agentId;
      break;
    }
  }
} catch (e) {
  /* leave id null — report still useful without it */
}

var skills = rest('/agent-skills-api/v1', 'POST', '/skills/list', {});
var mcp = rest('/agent-mcp-api/v1', 'GET', '/mcp-connections/list?scope=global', null);
var plugins = rest('/agent-plugins-api/v1', 'POST', '/plugins/list', {});

var report = {
  agent: agentRow,
  skills: skills.body || { rows: [] },
  mcp: mcp.statusCode >= 400 ? { gated: false, error: mcp.body } : mcp.body || { rows: [] },
  plugins: plugins.statusCode === 404 ? { gated: true } : plugins.body || { rows: [] },
};

if (agentId) {
  try {
    report.publishHistory = normalize(Nexus.Agent.ConfigBundleApi.publishHistory(agentId, 50, null));
  } catch (e) {
    report.publishHistory = { error: String(e) };
  }
}

report;
