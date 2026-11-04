# Stage 2 Follow-ups

Write-ahead log of knowingly deferred work — short bullets appended at the moment of deferral, by
humans and agents alike. No triage, estimates, or owners at capture time. Reviewed at the next
stage's setup. See [devlogs](../README.md#follow-up-wal).

Opened 2026-11-03 with the stage's board. The [stage 1 WAL](../stage1/followups.md) is reviewed
during this stage's setup, each entry struck with where it went.

- 2026-11-03 (Jamie, on PR 36): ADR-0028 decision 4 (an app warns on every file in its scope it
  cannot map) is likely to be relaxed in Context Manager. Agents routinely leave READMEs and helper
  files beside cards, so tasks' unprojected-file warnings are noise. Inventory never warned and keeps
  not warning; `describeAppCore` does not check it. The ADR change is Context Manager's.
- 2026-11-03 (inventory core): `appendItem` ends its output with a line break when it appends at
  the end of a file that had none. Context Manager tests this on purpose ("adds a newline first when
  the file does not end with one"), and an insert before trailing lines keeps the absence. The move
  keeps the behaviour, and `describeAppCore` records it per rewrite with the new `addsFinalNewline`
  gap. Whether an append should keep a missing final newline is Jamie's call; changing it is a
  behaviour change in the inventory core, after the adoption.
  - Closed 2026-11-04 (Jamie): intended. Every file should end with a newline, and a probe of 100
    appends mixed with edits and deletes showed none accumulate (a file keeps one, three blank
    lines stay three).
- 2026-11-03 (cm-app-prep, Context Manager #1019): the tasks and inventory e2e walks were not run.
  They need a provisioned agent slot, the shared `.env`, the dev S3 bucket and a GitHub token for
  the scratch repository. Run them at the inventory adoption (brief constraint).
  - Inventory half closed 2026-11-04: the 38 inventory walk steps passed on the adoption (Context
    Manager #1022), from a dedicated checkout and agent slot. The tasks walks remain, for the tasks
    core adoption.
  - Tasks half closed 2026-11-04: the tasks walks passed on the tasks adoption (Context Manager
    #1025), every step 01-29 apart from 28, an alternative drift setup.
- 2026-11-04 (tasks core; Jamie: fine as a follow-up): the pool's `order.yaml` is regenerated
  whole by `formatOrderFile` when the app reorders the pool, so comments added by hand are lost.
  This repository's own order file carries grouping comments that a reorder in the app would drop.
  It breaks ADR-0028 decision 1 for that one file; the move keeps the behaviour, and a rewrite that
  keeps comments comes after the tasks adoption.
