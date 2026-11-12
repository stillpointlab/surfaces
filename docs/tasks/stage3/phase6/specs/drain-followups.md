---
column: done
pr: 'stillpointlab/context-manager#1167'
completed: 2026-11-12
created: 2026-11-12T15:30:00-07:00
tags: [apps, host-contract, code]
---

# Spec: drain the stage's follow-ups

_Before stage 3 closes (Jamie, 2026-11-12): drain what the [follow-up log](../../../../devlogs/stage3/followups.md)
holds instead of carrying it forward, along with the small items
[ADR-0040](https://github.com/stillpointlab/context-manager/pull/1166)'s minimum lists. The ADR is
refreshed after this phase, so it records what is left._

## High-level goal

Close every stage 3 follow-up that can be closed now, and move what can cheaply move out of the
ADR's minimum. Anything that can't be closed goes to the backlog pool as a seed at the stage close.

## The items

1. **`RELOAD_REQUEST_EVENT` from the tasks element entry** (the log, phase 3 close). Export it
   from `@stillpointlab/tasks-app/element`, as inventory's entry exports its own. Context Manager's
   tasks app imports it instead of wiring `'reload-request'` by name.
2. **A separate create-form entry** (the log, phase 4 close). The create forms move from each
   app's `./element` to a new `./create-element`, so an app page no longer loads them. Context
   Manager's create dialog loads `./create-element`. The app pages' JavaScript should be back near
   their sizes before context-manager#1162.
3. **One enable route** (ADR-0040's minimum). `POST …/views/enable { app, manifestPath }` over the
   registry's adapters replaces `POST tasks/enable` and `POST inventory/enable`, with the
   lifecycle's `enableTasksView` and `enableInventoryView`. The page already builds the URL from the
   view type. The registration's flag gates it.
4. **The legacy check-in job names** (the log, phase 4 close). Remove `LEGACY_CHECKIN_JOBS`,
   their labels and the board listener's legacy match once context-manager#1163 is in production
   and its queue has drained. Jamie confirms the release.
5. **Walks that poll** (the phase 2 changelog). Tasks walks 06 and 29 each failed once on a fixed
   wait after Refresh. They should wait for the refresh to land instead.

## Non-goals

- The spec departures listed in ADR-0040: they wait for Jamie's review of the whole stage.
- The check-in shared core: it stays a seed.

## Acceptance / completion checklist

- [x] Items 1 and 2 merged here, with tests, and the harness still driving both create fixtures
      ([#84](https://github.com/stillpointlab/surfaces/pull/84)).
- [x] Items 1–5 in one Context Manager PR, with both walk suites (context-manager#1167).
- [x] The follow-up log has each entry closed or moved to a seed (all closed).
- [x] ADR-0040's count and minimum refreshed after the Context Manager PR merges.

## Implementation plan

1. Surfaces PR: items 1 and 2, and this spec (done: #84).
2. Context Manager PR: the pin, items 1–3, item 4 once released, item 5; walked (done:
   context-manager#1167).
3. ADR-0040 (context-manager#1166) refreshed; then the stage close drains the log.
