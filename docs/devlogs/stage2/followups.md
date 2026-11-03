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
