/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// discover_nexus_app.js — resolves the target Nexus app's id AND a working
// base URL from THIS app's own Microservice.Config. On multi-studio clusters
// (Microservice.Config.forName("Studio").appId set), tries "Nexus.<studioId>"
// first, then falls back to the cluster-wide "Nexus" record. Run this via
// c3-js-exec against the CONSUMER app (whatever app your agent session is
// already connected to) — NOT against Nexus itself. Nexus's appId is what you
// need before you can c3-connect / c3-js-exec anything from c3auth_rest_call.js
// against Nexus's own REST doors.
//
// READ-ONLY — this script never writes to Microservice.Config. Publishing
// serviceAppId/serviceAppUrl is a one-time cluster-admin action an operator
// performs directly on Nexus, outside this skill entirely. This script's only
// job is to read whatever an operator already published — on "none", stop
// and report the gap to the user; do not attempt to set the config yourself.
//
// URL priority (serviceAppId first, serviceAppUrl only as fallback):
//   1. serviceAppId set → resolve the LIVE base URL from the id itself via
//      App.forId(id, true).externalUrl.endpoint(apiBase). Preferred over the
//      separately-configured serviceAppUrl field because it's derived fresh
//      from the app's actual current URL config, not a second value an
//      operator could forget to update if Nexus's URL ever changes — and it
//      also gives you the real appId for c3-connect, which serviceAppUrl
//      alone never can.
//   2. serviceAppId unset, serviceAppUrl set → the "urlOnly" result. This is
//      FULLY USABLE for REST calls — pass baseUrl straight through as
//      c3auth_rest_call.js's rootUrl and every call works normally (confirmed
//      live). The only thing missing is the real <cluster>-<env>-<app> id
//      string itself, needed only if your environment's tooling addresses
//      apps by id (e.g. this harness's c3-js-exec <appId> command position) —
//      not needed for the REST calls. Don't treat this as blocked.
//   3. Neither set — Nexus has never been registered as a dependency of this
//      app. This is a genuine setup gap, not a code bug: STOP and report it
//      rather than guessing (e.g. never assume same-cluster/same-env sibling).
//
// Some runtimes return serviceAppUrl / externalUrl as a plain String rather
// than an AppUrl object, and a String has no .endpoint() — calling it throws
// "Cannot find function endpoint". joinEndpoint() (below) handles both shapes,
// so this resolver works whether or not .endpoint() exists on your platform
// version; no per-runtime edit is needed. (Before this helper existed, the
// throw was swallowed by the try/catch and a fully-usable serviceAppUrl was
// mis-reported as "none".)
//
// ARGS: optionally { "apiBase": "/agent-api/v1" } — the REST door base path
// to build the returned baseUrl against. Defaults to "" (bare app root) if
// omitted, which is still a valid, usable root URL.
//
// Returns one of:
//   { resolved: "appId",  appId: "<cluster>-<env>-<app>", baseUrl: "https://..." }
//   { resolved: "urlOnly", baseUrl: "https://...", note: "Fully usable as rootUrl for REST calls — only the real appId is missing, needed only by id-addressed tooling." }
//   { resolved: "none", error: "Nexus is not registered as a Microservice dependency on this app — an operator must publish serviceAppId/serviceAppUrl before this skill can locate Nexus from here." }

var apiBase = (ARGS && ARGS.apiBase) || '';

// Build "<base><apiBase>" whether `u` is an AppUrl (has .endpoint()) or a plain
// string. Some runtimes return serviceAppUrl / externalUrl as a String, on which
// .endpoint() throws "Cannot find function endpoint"; the try/catch in
// tryResolveFrom would then swallow it and mis-report an otherwise-usable config
// as unresolvable. This is a no-op on runtimes where .endpoint() does exist.
function joinEndpoint(u, sub) {
  sub = sub || '';
  if (u && typeof u.endpoint === 'function') {
    return u.endpoint(sub);
  }
  var s = String(u).replace(/\/+$/, ''); // trim trailing slash(es)
  if (!sub) return s;
  return s + (sub.charAt(0) === '/' ? '' : '/') + sub;
}

// --- Resolution helper: mirrors the browser's tryConfigForName pattern. ---
// Try to resolve a usable result from a named Microservice.Config record. Returns a result
// object on success, null on any failure (missing config, malformed values, App.forId throws,
// endpoint missing). The caller tries studio-scoped first, then cluster-wide — a null here
// falls through to the next level, exactly matching the browser resolver's chain.
function tryResolveFrom(configName) {
  try {
    var c = Microservice.Config.forName(configName);
    var hasAppId = c.isFieldSet('serviceAppId') && c.serviceAppId;
    var hasAppUrl = c.isFieldSet('serviceAppUrl') && c.serviceAppUrl;
    if (!hasAppId && !hasAppUrl) return null;

    if (hasAppId) {
      try {
        var appId = String(c.serviceAppId);
        var nexusApp = App.forId(appId, true);
        var baseUrlFromId = joinEndpoint(nexusApp.externalUrl, apiBase);
        return { resolved: 'appId', appId: appId, baseUrl: baseUrlFromId };
      } catch (e) {
        // Malformed appId — fall through to serviceAppUrl if present, else return null.
      }
    }
    if (hasAppUrl) {
      try {
        var baseUrlFromConfig = joinEndpoint(c.serviceAppUrl, apiBase);
        return {
          resolved: 'urlOnly',
          baseUrl: baseUrlFromConfig,
          note:
            "Fully usable — pass baseUrl as c3auth_rest_call.js's rootUrl and every REST call " +
            "works normally. Only the real <cluster>-<env>-<app> id is missing, and that's only " +
            "needed if your environment's tooling addresses apps by id (not needed for REST calls " +
            "themselves). serviceAppId is a config write on Nexus itself — outside this skill's " +
            'scope; report the gap if you specifically need the id, do not attempt the write yourself.',
        };
      } catch (e) {
        // joinEndpoint failed on a malformed serviceAppUrl — treat as unresolvable.
      }
    }
  } catch (e) {
    // forName itself failed or the config is unreadable — fall through.
  }
  return null;
}

// Studio-scoped resolution: try Nexus.<studioId> first when a Studio config exists.
var studioId = null;
try {
  var studioConfig = Microservice.Config.forName('Studio');
  studioId = studioConfig.isFieldSet('appId') && studioConfig.appId ? String(studioConfig.appId) : null;
} catch (e) {
  /* no Studio config or unreadable — fall through */
}

var result = null;
if (studioId) {
  result = tryResolveFrom('Nexus.' + studioId);
}
if (!result) {
  result = tryResolveFrom('Nexus');
}
if (!result) {
  result = {
    resolved: 'none',
    error:
      'Nexus is not registered as a Microservice dependency on this app ' +
      "(Microservice.Config.forName('Nexus') has neither serviceAppId nor serviceAppUrl set). " +
      "An operator must publish one on Nexus's own config, at cluster-admin level, before this " +
      "skill can locate Nexus from here. This is outside this skill's scope — report the gap to " +
      'the user and stop; do not attempt to set the config yourself.',
  };
}

result;
