# C3 AI CronJob Scheduling

CronJob schedules repetitive actions in C3 AI Platform. Jobs run on a cron schedule and are managed through the `CronJob` entity type backed by Quartz scheduler.

## Quick Reference

| Operation         | Code                              |
| ----------------- | --------------------------------- |
| Create job        | `CronJob.make({...}).create()`    |
| Trigger now       | `job.triggerNow()`                |
| Pause             | `job.pause()`                     |
| Resume            | `job.resume()`                    |
| Cancel            | `job.cancel()`                    |
| Last run          | `job.lastRun()`                   |
| Last N runs       | `job.lastRuns(n)`                 |
| Last error        | `job.lastError()`                 |
| Execution info    | `CronJob.executionInfo()`         |
| Validate schedule | `CronSchedule.validateExpr(expr)` |
| Sync all jobs     | `Cron.syncJobs()`                 |

## Quick Start

### 1. Define a Type with the Action

```c3typ
type MyCleanup {
  runCleanup: function() js-server
}
```

```javascript
function runCleanup() {
  var cutoff = DateTime.now().plusDays(-30);
  MyType.removeAll(RemoveAllSpec.make({ filter: Filter.lt('meta.created', cutoff) }), true);
}
```

### 2. Create the CronJob

```javascript
CronJob.make({
  id: 'daily-cleanup',
  description: 'Remove records older than 30 days',
  action: ActionRef.make({
    typeName: 'MyCleanup',
    actionName: 'runCleanup',
  }),
  scheduleDef: CronSchedule.make({
    cronExpression: '0 0 2 * * ?',
    timeZone: 'America/Los_Angeles',
  }),
}).create();
```

### 3. Create via Seed Data

```json
{
  "id": "daily-cleanup",
  "description": "Remove records older than 30 days",
  "action": {
    "typeName": "MyCleanup",
    "actionName": "runCleanup"
  },
  "scheduleDef": {
    "cronExpression": "0 0 2 * * ?",
    "timeZone": "America/Los_Angeles"
  }
}
```

## Cron Expression Format

Quartz 6-field format: `second minute hour day-of-month month day-of-week`. Use `?` for "no specific value" in day-of-month or day-of-week.

| Expression       | Schedule                         |
| ---------------- | -------------------------------- |
| `0 0 * * * ?`    | Every hour                       |
| `0 0/15 * * * ?` | Every 15 minutes                 |
| `0 0 2 * * ?`    | Daily at 2:00 AM                 |
| `0 0 0 * * MON`  | Every Monday at midnight         |
| `0 0 9 1 * ?`    | First day of every month at 9 AM |
| `0 0 0 L * ?`    | Last day of every month          |

## CronJob Fields

| Field            | Type            | Description                         |
| ---------------- | --------------- | ----------------------------------- |
| `id`             | string          | Unique identifier                   |
| `description`    | string          | Human-readable description          |
| `action`         | ActionRef       | The action to execute               |
| `inputs`         | map<string,any> | Input parameters for the action     |
| `scheduleDef`    | CronSchedule    | Schedule configuration              |
| `concurrent`     | boolean         | Allow concurrent executions         |
| `runOnLeader`    | boolean         | Only run on leader node             |
| `inactive`       | boolean         | Disable without removing            |
| `noHistory`      | boolean         | Don't record execution history      |
| `runAsCreatedBy` | boolean         | Run as the user who created the job |

## CronSchedule Fields

| Field            | Type     | Description                               |
| ---------------- | -------- | ----------------------------------------- |
| `cronExpression` | string   | Quartz cron expression                    |
| `startTime`      | datetime | Earliest execution time                   |
| `endTime`        | datetime | Stop executing after this time            |
| `timeZone`       | string   | IANA time zone (e.g., `America/New_York`) |
| `skipOverdue`    | boolean  | Skip missed executions                    |

## Monitoring

### Execution History

```javascript
var job = CronJob.make({ id: 'daily-cleanup' }).get();

// Last run
var last = job.lastRun(); // returns JobHistory

// Last 10 runs
var runs = job.lastRuns(10);

// Last error
var err = job.lastError();

// Last 5 errors
var errs = job.lastErrors(5);

// Full execution info (static - returns array for all jobs)
var infos = CronJob.executionInfo(); // returns [CronExecutionInfo]
infos.each(function (info) {
  info.prevTriggerTime;
  info.nextTriggerTime;
  info.currStatus;
});
```

### JobHistory Fields

| Field               | Type     | Description                           |
| ------------------- | -------- | ------------------------------------- |
| `job`               | CronJob  | Reference to the job                  |
| `scheduledTime`     | datetime | When it was supposed to run           |
| `actualTime`        | datetime | When it actually ran                  |
| `status`            | string   | COMPLETED, FAILED, SKIPPED, CANCELLED |
| `durationInMSecs`   | long     | Execution duration                    |
| `result`            | any      | Return value                          |
| `error`             | Error    | Error object if failed                |
| `executionAttempts` | int      | Number of execution attempts          |

### Processor Status

`Cron` is the low-level scheduling service that manages the Quartz scheduler (sync jobs, check processor status). `CronJob` is the persistent entity type representing a scheduled recurring job that you create, monitor, and manage. Use `CronJob` for defining and interacting with jobs; use `Cron` for system-level scheduler operations.

```javascript
var status = Cron.Processor.status();
status.isProcessing;
status.activeJobs;
status.runOnLeaderJobs;
```

> Use `CronJob` for persistent scheduled jobs. Use `CronSchedule` as a field type on other entity types for embedding schedule definitions.

## Troubleshooting

### Job Not Running

```javascript
// Check if cron sync is disabled
Cron.isSyncDisabled();

// Re-sync all jobs
Cron.syncJobs();

// Check processor status
Cron.Processor.status();

// Verify schedule is valid
CronSchedule.validateExpr('0 0 * * * ?');
```

### Job Failing

```javascript
var job = CronJob.make({ id: 'daily-cleanup' }).get();

// Check recent errors
job.lastErrors(10);

// Trigger manually for debugging
job.triggerNow();

// Check queue status
CronQueue.report();
CronQueue.errors();
```

## Default Platform Cron Jobs

Key platform cron jobs (full list in admin docs):

| Job                             | Description                              |
| ------------------------------- | ---------------------------------------- |
| `clean-failed-resources`        | Removes failed cloud resources           |
| `validate-db-schema`            | Validates database schema consistency    |
| `gc-feature-store-blocks`       | Garbage collect feature store blocks     |
| `norm-hot-cold-migrator`        | Migrate normalization data between tiers |
| `workflow-run-recovery`         | Recover stuck workflow runs              |
| `self-healing-request-recovery` | Recover stuck requests                   |
| `console-notebook-cleanup`      | Clean up old console notebooks           |

## Best Practices

- Always set `timeZone` explicitly to avoid DST issues
- Use `skipOverdue: true` for jobs where missed runs are acceptable
- Set `runOnLeader: true` for jobs that must run on a single node
- Avoid `concurrent: true` unless the action is truly idempotent
- Use `noHistory: true` for very frequent jobs (every minute) to avoid history bloat
- Validate cron expressions before creating jobs: `CronSchedule.validateExpr(expr)`
- Use seed data for cron jobs that should exist in every deployment

## Common Anti-Patterns

1. **No time zone** - defaults to server time zone, breaks with DST
2. **Missing `runOnLeader`** - job runs on every node simultaneously
3. **Concurrent without idempotency** - data corruption from parallel runs
4. **Not checking errors** - silent failures go unnoticed
5. **Very frequent + history** - `noHistory: true` for sub-minute jobs
