/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Simple data migration implementation.
 */

function doStart(job, options) {
  // Stream source data and create batches
  var builder = SourceEntity.arrayBuilder();
  var stream = SourceEntity.fetchObjStream({
    filter: options.sourceFilter || 'true',
    include: 'id, name, amount, category',
  });

  while (stream.hasNext()) {
    builder.push(stream.next());

    if (builder.size() >= options.batchSize || !stream.hasNext()) {
      job.scheduleBatch(
        MigrationJobBatch.make({
          sourceRecords: builder.build(),
        })
      );
      builder.clear();
    }
  }
}

function processBatch(batch, _job, options) {
  // Store timestamp once for all records
  var now = DateTime.now();

  // Transform source records to target format
  var targetRecords = batch.sourceRecords.map((source) =>
    TargetEntity.make({
      // Map fields from source to target
      name: source.name,
      value: source.amount * 1.1, // Example transformation
      category: source.category,
      sourceId: source.id,
      migratedAt: now,
    })
  );

  // Persist target records (unless dry run)
  if (!options.dryRun) {
    TargetEntity.createBatch(targetRecords);
  }
}
