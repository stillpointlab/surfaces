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
- 2026-11-03 (cm-app-prep, Context Manager #1019): the tasks and inventory e2e walks were not run.
  They need a provisioned agent slot, the shared `.env`, the dev S3 bucket and a GitHub token for
  the scratch repository. Run them at the inventory adoption (brief constraint).
