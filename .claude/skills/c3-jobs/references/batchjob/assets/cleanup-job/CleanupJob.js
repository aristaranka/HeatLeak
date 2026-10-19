/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Implementation of CleanupJob batch processing methods.
 */

/**
 * Initialize the job and schedule batches.
 * Filters records older than the specified date and creates batches.
 */
function doStart(job, options) {
  // Calculate cutoff date
  var cutoffDate = DateTime.now().minusDays(options.olderThanDays);

  // Build filter for old records
  var filter = Filter.lt('meta.created', cutoffDate);

  // Apply additional filter if provided
  if (options.additionalFilter) {
    filter = filter.and(options.additionalFilter);
  }

  // Stream records and create batches
  var builder = OldRecord.arrayBuilder();
  var stream = OldRecord.fetchObjStream({
    filter: filter,
  });

  while (stream.hasNext()) {
    builder.push(stream.next());

    // Schedule batch when size reached or stream ends
    if (builder.size() >= options.batchSize || !stream.hasNext()) {
      var batchSpec = CleanupJobBatch.make({
        records: builder.build(),
      });

      job.scheduleBatch(batchSpec);

      // Reset builder for next batch
      builder.clear();
    }
  }
}

/**
 * Process a single batch of records.
 * Either soft-deletes (marks as deleted) or hard-deletes records.
 */
function processBatch(batch, _job, options) {
  if (options.softDelete) {
    // Store timestamp once for all records
    var now = DateTime.now();

    // Soft delete: update status field
    var updates = batch.records.map((record) => record.withField('status', 'DELETED').withField('deletedDate', now));
    OldRecord.mergeBatch(updates);
  } else {
    // Hard delete: remove records
    OldRecord.removeBatch(batch.records);
  }
}

/**
 * Called after all batches complete.
 * Reports summary statistics.
 */
function allComplete(job, options) {
  // Count remaining old records (for verification)
  var cutoffDate = DateTime.now().minusDays(options.olderThanDays);
  var remainingCount = OldRecord.fetchCount({
    filter: Filter.lt('meta.created', cutoffDate),
  });

  // Store job summary
  CleanupJobSummary.make({
    jobId: job.id,
    cutoffDate: cutoffDate,
    remainingRecords: remainingCount,
    softDelete: options.softDelete,
    completedAt: DateTime.now(),
  }).upsert();
}
