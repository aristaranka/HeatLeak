/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

var logger = Logger.for('Genai.DocAiPipeline');

function run(files, executeSpec) {
  var pipeline = this.get('strategyRef, ingestionSettings, retrieverId');

  var loadedFiles = Genai.SourceFile.fetch({
    filter: Filter.intersects('id', files.pluck('id')),
    include: 'originalFile, metadata.tags.this, metadata.tags.category.label',
    limit: files.length,
  }).objs;

  /*
   * `file.originalFile.url` is a C3 tagged string, not a plain JS string. Explicit String() coercion
   * ensures the REST body serialises correctly for the microservice (a bare tagged string serialises
   * differently than a primitive string in some runtimes).
   */
  var fileUrls = [];
  loadedFiles.each(function (file) {
    fileUrls.push(String(file.originalFile.url));
  });

  var source = { files: fileUrls };

  /*
   * When usePresignedUrls is enabled, mint presigned URLs for each file. The DocAI pod streams directly
   * from storage via the presigned URL, avoiding file bytes passing through DocAI's memory. Recommended
   * for large files (>50 MB) or high-volume jobs.
   */
  var config = Genai.DocAiPipeline.Config.inst().getConfig();
  if (config.usePresignedUrls) {
    var presignedUrls = _mintPresignedUrls(loadedFiles, config.presignedUrlTtl || '24 hours');
    if (Object.keys(presignedUrls).length > 0) {
      source.presignedUrls = presignedUrls;
    }
  }

  var manualTagsByFile = _buildManualTagsByFile(loadedFiles);
  if (Object.keys(manualTagsByFile).length > 0) {
    source.manualTags = manualTagsByFile;
  }

  var retrieverId = pipeline.retrieverId;

  /*
   * The microservice resolves the calling app from the browser Referer header, which is absent on this
   * server-to-server REST call. Pass this app's id explicitly so it can read the files and persist results back.
   */
  var sourceApp = C3.app().id;

  /*
   * Resolve the strategy: strategyRef is either the id of a Genai.DocAiStrategy row or a bare OOTB
   * strategy name registered in the Doc AI microservice. Try to look up a row first; if found, delegate
   * to its ootbName (for built-in strategies) or inline script source (for app-owned custom strategies).
   * If no row exists, treat strategyRef directly as a built-in strategy name.
   */
  var strategyName = null;
  var script = null;

  var strategyRow = Genai.DocAiStrategy.forId(pipeline.strategyRef);
  var fetchedRow = strategyRow && strategyRow.get('ootbName, scriptRef, pySrcString');
  if (fetchedRow) {
    if (fetchedRow.ootbName) {
      strategyName = fetchedRow.ootbName;
    } else {
      script = fetchedRow.scriptSource();
    }
  } else {
    strategyName = pipeline.strategyRef;
  }

  /*
   * Per-run overrides take precedence over the pipeline's stored settings, so a single run can tune
   * extraction (e.g. tagsToExtract) without mutating the pipeline row.
   */
  var ingestionSettings = (executeSpec && executeSpec.ingestionSettings) || pipeline.ingestionSettings || null;

  /*
   * initialize() resolves the microservice URL from Microservice.Config; Api.process is a synchronous
   * @rest call to the Doc AI pod. Two distinct failure modes reach here:
   *
   *   1. TRANSIENT transport errors — the pod (or the ingress in front of it) drops the connection
   *      mid-request (java.net.SocketException: "Connection reset"), times out, or returns a 502/503/504.
   *      These are intermittent: the same file fails on one attempt and succeeds on the next while its
   *      neighbours go through. A single unretried drop was stranding otherwise-healthy files (marking
   *      them FAILED, or on older client paths leaving them stuck in PROCESSING with the banner unable to
   *      re-select them). We retry these a few times with linear backoff before giving up.
   *   2. PERMANENT errors — DocAI unconfigured (no serviceAppUrl), bad strategy, auth/4xx. Retrying can
   *      never help, so we do NOT retry these; they fall straight through to the FAILED handler.
   *
   * See {@link _isTransientDocAiError} for the transient-vs-permanent classification.
   */
  var MAX_ATTEMPTS = 4;
  var result = null;
  var lastError = null;
  for (var attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      Genai.DocAiPipeline.Api.initialize();
      result = Genai.DocAiPipeline.Api.process(source, retrieverId, sourceApp, strategyName, script, ingestionSettings);
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
      if (attempt >= MAX_ATTEMPTS || !_isTransientDocAiError(e)) {
        break;
      }
      logger.warn(
        'Doc AI microservice call failed on attempt ' +
          attempt +
          ' of ' +
          MAX_ATTEMPTS +
          ' (transient), retrying: ' +
          e.message
      );
      /*
       * Brief linear backoff (0.5s, 1s, 1.5s) so a momentarily-overwhelmed pod / recycling connection
       * has time to recover before the next attempt, without holding the dispatched action open for long.
       */
      try {
        Thread.sleep(500 * attempt);
      } catch (sleepErr) {
        // Sleep is best-effort; if unavailable, fall through to an immediate retry.
      }
    }
  }

  if (lastError) {
    /*
     * All attempts exhausted (or a permanent error). The files were already transitioned to PROCESSING by
     * the caller (processAllRelevantFiles / the grid path), so mark them FAILED — this makes them visible in
     * the grid AND re-processable via the grid selection path (a file stranded in PROCESSING cannot be
     * retried from the warning banner, whose filter only re-selects Not Indexed / Needs Re-indexing).
     *
     * Do NOT re-throw: run() is invoked (via processWithPipeline) inside the caller's transaction. Letting the
     * exception propagate across the dispatched-action boundary rolls back this FAILED transition, re-stranding
     * the files in PROCESSING. Swallowing here commits the FAILED status and lets the caller move on to the next
     * batch cleanly. See GEN-21416.
     */
    var baseUrlForError;
    try {
      baseUrlForError = Genai.DocAiPipeline.Api.baseUrl();
    } catch (urlErr) {
      baseUrlForError = '(unconfigured)';
    }
    var errorMessage =
      'Unable to reach Doc AI microservice at ' +
      baseUrlForError +
      ' after ' +
      MAX_ATTEMPTS +
      ' attempt(s): ' +
      lastError.message;
    logger.error(errorMessage);
    Genai.SourceFile.transitionFilesToStatus(
      loadedFiles,
      Genai.SourceFile.StatusEnum.FAILED,
      User.myUser().email,
      C3.Array.repeat(PrimitiveType.ofStr(), loadedFiles.length, errorMessage)
    );
    return;
  }

  var rejectedUrls = (result && result.rejected ? result.rejected : []).map((r) => r.file);

  if (rejectedUrls.length > 0) {
    var rejectedFiles = loadedFiles.filter((file) => rejectedUrls.indexOf(file.originalFile.url) !== -1);

    Genai.SourceFile.transitionFilesToStatus(rejectedFiles, Genai.SourceFile.StatusEnum.FAILED, User.myUser().email);
  }

  var acceptedFiles = loadedFiles.filter((file) => rejectedUrls.indexOf(file.originalFile.url) === -1);

  /*
   * Kick off the job first (Api.process above), then transition — this order is retry-safe:
   * if the transition crashes, a re-run of run() won't double-submit because the microservice job is idempotent.
   */
  Genai.SourceFile.transitionFilesToStatus(acceptedFiles, Genai.SourceFile.StatusEnum.PROCESSING, User.myUser().email);
}

/*
 * Mints presigned URLs for each file. Returns a map of { filePath: presignedUrl }.
 * Files that fail to generate a presigned URL are omitted (they fall back to base64 transport).
 */
function _mintPresignedUrls(loadedFiles, ttl) {
  var presignedUrls = {};
  loadedFiles.each(function (file) {
    var filePath = String(file.originalFile.url);
    try {
      var presignedUrl = FileSystem.generatePresignedUrl(filePath, 'GET', ttl, null);
      if (presignedUrl) {
        presignedUrls[filePath] = presignedUrl;
      }
    } catch (e) {
      /*
       * The generatePresignedUrl call may fail if the storage backend doesn't support it or the platform
       * version is <8.10. Log and skip — the file falls back to base64 transport.
       */
      logger.warn(
        'Failed to generate presigned URL for ' + filePath + ', falling back to base64 transport: ' + e.message
      );
    }
  });
  return presignedUrls;
}

/*
 * Builds the manualTags map for the pod payload: { <filePath>: [{tagName, values}] }.
 * Only MANUAL (user-curated) tags are forwarded — AUTOMATIC tags are omitted because the pod
 * produces those itself during extraction. Returns an empty object when no files have manual tags.
 */
function _buildManualTagsByFile(loadedFiles) {
  var byFile = {};
  loadedFiles.each(function (file) {
    var tags = file.metadata && file.metadata.tags ? file.metadata.tags : [];
    var manualTags = tags.filter(function (tag) {
      return tag.metadataType === Genai.SourceFile.Metadata.TypeEnum.MANUAL;
    });
    if (manualTags.length === 0) {
      return;
    }

    var tagsByName = {};
    manualTags.each(function (tag) {
      var name = tag.category ? String(tag.category.label) : '';
      if (!tagsByName[name]) {
        tagsByName[name] = [];
      }
      tagsByName[name].push(String(tag.label));
    });

    byFile[String(file.originalFile.url)] = Object.keys(tagsByName).map(function (name) {
      return { tagName: name, values: tagsByName[name] };
    });
  });
  return byFile;
}

/*
 * Classifies an error thrown by the Doc AI microservice call as transient (worth retrying) or permanent.
 *
 * Transient = a transport-level hiccup that a re-attempt can plausibly clear: the pod resetting the socket
 * ("Connection reset" / SocketException), a read/connect timeout, a broken pipe, an unexpected EOF, or a
 * gateway status (502/503/504) from the ingress while the pod is briefly unavailable or recycling.
 *
 * Everything else (DocAI unconfigured, unknown/invalid strategy, auth failures, other 4xx) is treated as
 * permanent — retrying would only delay the inevitable FAILED transition — so this returns false and the
 * caller gives up immediately.
 */
function _isTransientDocAiError(e) {
  var msg = (e && e.message ? e.message : String(e)).toLowerCase();
  var transientMarkers = [
    'connection reset',
    'socketexception',
    'socket closed',
    'connection refused',
    'broken pipe',
    'timed out',
    'timeout',
    'unexpected end',
    'premature eof',
    'end of stream',
    'no route to host',
    'connection closed',
    '502',
    '503',
    '504',
    'bad gateway',
    'service unavailable',
    'gateway timeout',
  ];
  for (var i = 0; i < transientMarkers.length; i++) {
    if (msg.indexOf(transientMarkers[i]) !== -1) {
      return true;
    }
  }
  return false;
}
