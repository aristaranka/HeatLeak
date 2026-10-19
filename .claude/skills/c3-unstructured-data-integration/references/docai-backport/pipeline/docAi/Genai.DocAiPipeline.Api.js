/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

function baseUrl() {
  /*
   * The DocAI endpoint is resolved solely from Microservice.Config (Ops-owned, per-environment). Ops publishes
   * serviceAppUrl for the DocAI service; if it is unset, DocAI is not configured on this environment.
   */
  var url = Microservice.Config.forName(Genai.DocAiPipeline.Api.SERVICE_NAME).serviceAppUrl;
  if (!url) {
    throw new Error(
      'Genai.DocAiPipeline.Api: Microservice.Config.forName("' +
        Genai.DocAiPipeline.Api.SERVICE_NAME +
        '").serviceAppUrl is not set. Ops must configure the DocAI Microservice.Config for this environment.'
    );
  }

  return String(url).trim().replace(/\/$/, '');
}

function initialize() {
  /*
   * Forward the current user's C3 session token as the Authorization header so the microservice can
   * authenticate the caller (standard @restful auth). RestConfig's minimum override level is APP, so the
   * value is (re)written per call; each call refreshes it with the current caller's token.
   */
  var auth = 'C3Bearer ' + User.myUser().sessionToken().signedToken;
  Genai.DocAiPipeline.Api.setApiUrlAndAuth(Genai.DocAiPipeline.Api.baseUrl(), auth, ConfigOverride.APP);
}

function isDeployed() {
  try {
    Genai.DocAiPipeline.Api.initialize();
    var response = Genai.DocAiPipeline.Api.health();
    return response.statusCode >= 200 && response.statusCode < 300;
  } catch (e) {
    return false;
  }
}

function strategies() {
  Genai.DocAiPipeline.Api.initialize();
  return Genai.DocAiPipeline.Api.listStrategies();
}
