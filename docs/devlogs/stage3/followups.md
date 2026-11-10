# Stage 3 Follow-ups

Write-ahead log of knowingly deferred work — short bullets appended at the moment of deferral, by
humans and agents alike. No triage, estimates, or owners at capture time. Reviewed at the next
stage's setup. See [devlogs](../README.md#follow-up-wal).

Opened 2026-11-10 at stage 2's close. The [stage 2 WAL](../stage2/followups.md) and the
[stage 1 WAL](../stage1/followups.md) were drained before it opened; their open work is in the
backlog pool as seeds.

- 2026-11-10 (stage 2 close): sheet's "bounds committed transaction history to the latest 100
  edits" (`sheet-editor-edit.test.ts`) times out under a full `npm run check` now and then, and
  passes alone and on a re-run. It failed that way three times during stage 2's last phase. The
  test makes 101 edits and 101 undos through the editor's DOM in jsdom, so its time grows with
  machine load; a longer timeout for it, or fewer DOM steps per edit, would steady it.
