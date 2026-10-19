/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

var logger = Logger.for('Genai.SourceFile');

/*
 * Doc AI-aware override of the platform processWithPipeline (see the type header for why this backport is
 * needed). Groups the incoming files by their collection's pipeline and dispatches each group:
 *   - collections with a docAiPipeline  -> Genai.DocAiPipeline.run(files)          (Doc AI microservice)
 *   - collections with only an unstructuredPipeline -> Genai.UnstructuredPipeline.run(files) (platform legacy)
 * Files whose collection has neither pipeline configured are skipped (nothing to dispatch to).
 *
 * run() re-fetches each group by id, so passing bare { id } refs is sufficient and avoids re-serialising
 * the (potentially large) file objects.
 */
function processWithPipeline(files) {
  if (!files || files.length === 0) {
    return;
  }

  var loaded = Genai.SourceFile.fetch({
    filter: Filter.intersects('id', files.pluck('id')),
    include: 'id, collection.id, collection.docAiPipeline.id, collection.unstructuredPipeline.id',
    limit: files.length,
  }).objs;

  // pipelineId -> [{ id }] for each dispatch target.
  var docAiGroups = {};
  var unstructuredGroups = {};

  loaded.each(function (file) {
    var collection = file.collection;
    var docAiPipeline = collection ? collection.docAiPipeline : null;
    var unstructuredPipeline = collection ? collection.unstructuredPipeline : null;

    if (docAiPipeline && docAiPipeline.id) {
      if (!docAiGroups[docAiPipeline.id]) {
        docAiGroups[docAiPipeline.id] = [];
      }
      docAiGroups[docAiPipeline.id].push({ id: file.id });
    } else if (unstructuredPipeline && unstructuredPipeline.id) {
      if (!unstructuredGroups[unstructuredPipeline.id]) {
        unstructuredGroups[unstructuredPipeline.id] = [];
      }
      unstructuredGroups[unstructuredPipeline.id].push({ id: file.id });
    } else {
      logger.warn(
        'Skipping Genai.SourceFile ' +
          file.id +
          ': its collection has neither a docAiPipeline nor an unstructuredPipeline configured.'
      );
    }
  });

  var docAiPipelineIds = Object.keys(docAiGroups);
  for (var i = 0; i < docAiPipelineIds.length; i++) {
    var docAiId = docAiPipelineIds[i];
    Genai.DocAiPipeline.forId(docAiId).run(docAiGroups[docAiId], null);
  }

  var unstructuredPipelineIds = Object.keys(unstructuredGroups);
  for (var j = 0; j < unstructuredPipelineIds.length; j++) {
    var unstructuredId = unstructuredPipelineIds[j];
    Genai.UnstructuredPipeline.forId(unstructuredId).run(unstructuredGroups[unstructuredId], null);
  }
}

/*
 * Doc AI-aware override of the platform unprocessWithPipeline (see the type header for why this backport is
 * needed). The platform version groups files by their collection's unstructuredPipeline and unindexes them,
 * so for a DocAI collection (unstructuredPipeline null) it dispatches nothing and the "Unprocess" action
 * leaves files stuck in the 'Removing' state the UI put them in.
 *
 * Unindexing is pipeline-agnostic — it only needs the target retriever — so this override skips pipeline
 * grouping entirely: it groups files by the retriever their collection targets (docAiPipeline.retrieverId,
 * defaulting to 'default-pg'), unindexes each group via the low-level Genai.SourceFile.unprocess, and then
 * completes the terminal status transition. The low-level unprocess only sets a terminal status when
 * shouldTransitionToDeleted is true (-> 'Deleted'); when false it does NOT move the status, so we finish the
 * removal by transitioning back to 'Not Indexed' via handleTransitionToNotIndexed.
 */
function unprocessWithPipeline(files, shouldTransitionToDeleted) {
  if (!files || files.length === 0) {
    return;
  }

  var loaded = Genai.SourceFile.fetch({
    filter: Filter.intersects('id', files.pluck('id')),
    include: 'id, collection.id, collection.docAiPipeline.id, collection.docAiPipeline.retrieverId',
    limit: files.length,
  }).objs;

  // retrieverId -> [{ id }]. Removal only needs the retriever the passages were indexed into.
  var groupsByRetriever = {};
  loaded.each(function (file) {
    var collection = file.collection;
    var docAiPipeline = collection ? collection.docAiPipeline : null;
    var retrieverId = docAiPipeline && docAiPipeline.retrieverId ? docAiPipeline.retrieverId : 'default-pg';
    if (!groupsByRetriever[retrieverId]) {
      groupsByRetriever[retrieverId] = [];
    }
    groupsByRetriever[retrieverId].push({ id: file.id });
  });

  var retrieverIds = Object.keys(groupsByRetriever);
  for (var i = 0; i < retrieverIds.length; i++) {
    var retrieverId = retrieverIds[i];
    var group = groupsByRetriever[retrieverId];
    var retriever = Genai.Retriever.forId(retrieverId);

    // Unindex the passages from the retriever (synchronous within this dispatch).
    Genai.SourceFile.unprocess(group, retriever, shouldTransitionToDeleted);

    // unprocess() only transitions status when shouldTransitionToDeleted is true (-> 'Deleted').
    // For the "remove from index but keep the file" case, finish the transition out of 'Removing'.
    if (!shouldTransitionToDeleted) {
      Genai.SourceFile.handleTransitionToNotIndexed(group);
    }
  }
}
