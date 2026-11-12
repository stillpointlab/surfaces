---
column: done
pr: 'stillpointlab/context-manager#1163'
completed: 2026-11-12
created: 2026-11-10T14:53:28-07:00
tags: [apps, host-contract, code]
---

# Spec: one check-in endpoint and job

_The [generic app host brief](../../phase1/briefs/generic_app_host.md), desired outcome 6: option C. Can land
any time after [one-op-route](../../phase3/specs/one-op-route.md)'s registry._

## High-level goal

Check-in has one endpoint and one job type, keyed by app. Each hands off to the app's check-in
service, which does not change. The routes and job names stop naming the apps. Extracting the two
services' shared core is the [check-in shared core](../../../unassigned/seeds/checkin-shared-core.md)
seed.

## Related context

- The [spike](../../phase1/spikes/generic-app-host.md), §6, and the seed: both services run the same five
  steps, and tasks adds moves, frontmatter-only conflict labels and selection.
- Context Manager today:
  - the routes: `POST /tasks/:instance/checkin` and `POST /inventory/:instance/checkin`;
  - the jobs: `GIT_TASKS_CHECKIN` and `GIT_INVENTORY_CHECKIN`, with their payload schemas and
    handlers in `jobs/`;
  - the job labels in `shared/utils/jobLabels.ts`;
  - the task board page's job listener (`type !== 'GIT_TASKS_CHECKIN'`).

## Technical requirement

- **The registration gains `checkin`:** the app's service as `{ enqueue, run }`, a thin adapter over
  today's `enqueueCheckin(user, instance, request)` and `runCheckinJob(payload, job)`.
- **`POST …/views/:instance/checkin`** takes the app's own request body, as today: tasks' selection
  and snapshot hashes, inventory's. The entry's request schema validates it, and the route hands it
  to the entry's `enqueue`.
- **One job type, `GIT_APP_CHECKIN`,** with a payload of `{ app, … }`, where the rest is the app's
  payload as today. One handler hands off to the entry's `run`. The notification contract is
  unchanged.
- **Jobs already queued under the old names** still run: the old job names stay registered as
  aliases for one release, then go. Without production releases until the stage is done, they can
  also go in this PR. That is the PR's call, stated in its description.
- **One job label** ("Check-in"), with the app's label from the client registry where a label is
  shown.
- **Listeners match the new job type and the app** (the board's check-in listener, the header's job
  list).
- **What goes:** the two check-in routes, the two job registrations and payload schemas, and the
  two labels.

## Clarifications

- **No check-in behaviour changes:** same conflicts, same PR, same publish order. Most tasks walks
  check in somewhere: 05 and 07, the conflict and post-merge walks 17–20, and 22–27. Together with
  inventory walk 04 (`04-checkin-pr-1G`), they are the check.
- **Refresh stays tasks-only** (the minimum). It is not a check-in, and only tasks has PR state.

## Non-goals

- The shared core (the seed).
- Any change to what a check-in commits.

## Acceptance / completion checklist

- [x] One route and one job type check in either app through the registration.
- [x] The two routes, two job types and their schemas are gone, or aliased with a stated removal.
- [x] Both walk suites pass.

**Done** (context-manager#1163). The old job names, `GIT_TASKS_CHECKIN` and
`GIT_INVENTORY_CHECKIN`, stay registered as aliases of the one handler for one release, with their
labels, so a check-in queued in production at deploy time still runs. They go after the first
production release that carries `GIT_APP_CHECKIN` (a
[follow-up](../../../../devlogs/stage3/followups.md)). The job's `app` rides its events and the job
listing, so a page labels a check-in by its app and the board refreshes on its own.

## Implementation plan

1. Context Manager PR, walked (done: context-manager#1163).
