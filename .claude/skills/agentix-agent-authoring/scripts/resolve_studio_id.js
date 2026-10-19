/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// resolve_studio_id.js — convenience script for Nexus operators on multi-studio
// clusters. Reads Microservice.Config.forName("Studio").appId and returns the
// studio id plus the ready-to-run publish command for the studio-scoped
// Microservice.Config record. Run on the NEXUS app itself (where App.inst().id is the Nexus id).
//
// Usage:
//   c3-js-exec <nexusAppId> ./scripts/resolve_studio_id.js
//
// Returns one of:
//   { studioId: "<tag>", configName: "Nexus.<tag>", appId: "<this-app-id>",
//     publishCommand: "Microservice.Config.forName('Nexus.<tag>').setConfigValue('serviceAppId', '<appId>', ConfigOverride.CLUSTER)" }
//   { studioId: null, error: "No Studio config record on this environment — this is a single-Nexus cluster, use Microservice.Config.forName('Nexus') instead." }

var studioId = null;
try {
  var studioConfig = Microservice.Config.forName('Studio');
  studioId = studioConfig.isFieldSet('appId') && studioConfig.appId ? String(studioConfig.appId) : null;
} catch (e) {
  /* no Studio config — fall through */
}

var result;
if (studioId) {
  var appId = String(App.inst().id);
  var configName = 'Nexus.' + studioId;
  result = {
    studioId: studioId,
    configName: configName,
    appId: appId,
    publishCommand:
      "Microservice.Config.forName('" +
      configName +
      "').setConfigValue('serviceAppId', '" +
      appId +
      "', ConfigOverride.CLUSTER)",
  };
} else {
  var appId = String(App.inst().id);
  result = {
    studioId: null,
    appId: appId,
    note: 'No Studio config record on this environment — this is a single-Nexus cluster.',
    publishCommand:
      "Microservice.Config.forName('Nexus').setConfigValue('serviceAppId', '" + appId + "', ConfigOverride.CLUSTER)",
  };
}

result;
