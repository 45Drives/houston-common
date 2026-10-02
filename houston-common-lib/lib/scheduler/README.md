## Scheduler Snapshot Retention

Snapshot and ZFS replication retention belongs to each schedule interval in the
task's `/etc/systemd/system/houston_scheduler_<template>_<name>.json` file, not
the task's `.env` file. For example, an hourly snapshot interval kept for a day:

```json
{
  "minute": { "value": "0" },
  "hour": { "value": "*" },
  "retention": {
    "destination": { "retentionTime": 1, "retentionUnit": "days" }
  }
}
```

Replication intervals support independent `source` and `destination` retention.
Snapshot intervals use `destination`, with `source` accepted for migrated legacy
tasks. Missing retention or a zero retention time means keep indefinitely.

The shared scheduler migrates legacy task-level retention when loading,
importing, registering, or updating tasks with intervals. If no interval already
has retention, positive legacy values are copied to every interval. If any
interval has retention, all existing interval policies are preserved, including
intervals intentionally left unlimited. Saved env files no longer contain legacy
retention keys, and task updates persist schedule JSON before replacing env files.

Easy Setup's standard policy creates hourly snapshots kept for one day, daily
snapshots kept for one week, and Friday snapshots kept for one month. These
policies are emitted directly on the intervals.

After updating this library, sync the `houston-common` submodule and rebuild each
consuming application, including `cockpit-super-simple-setup`. Existing tasks
with no retention in either their env or schedule JSON cannot be recovered from
their names automatically. Set their interval retention in Cockpit Scheduler's
Manage Schedule view. The next scheduled run can then prune expired snapshots;
confirm the policy before enabling it.

Focused regression tests: run `npm test -- lib/scheduler/retention.test.ts` from
`houston-common-lib`.
