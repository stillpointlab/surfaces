# Stage 6 Follow-ups

Write-ahead log of knowingly deferred work — short bullets appended at the moment of deferral, by
humans and agents alike. No triage, estimates, or owners at capture time. Reviewed at the next
stage's setup. See [devlogs](../README.md#follow-up-wal).

Opened 2026-11-25 at stage 6's setup. The [stage 5 WAL](../stage5/followups.md) was drained at that
stage's close, and Jamie ruled on the two entries it had left: nothing is carried here.

From this stage the log is drained at each phase's close, and a phase carries on at most three
entries (the [media previews brief](../../tasks/stage6/phase1/briefs/media_previews.md)).

## Phase 1

- 2026-11-25 (a token for the run): a page whose stream reconnects while the server answers
  "Starting." (503) is dropped by the browser for good, and the check of `/api/root` meets the
  same 503. The page then learns of a restart only at its next call. Older than the token; the
  restart notice now leans on it.
- 2026-11-25 (a token for the run): once the restart notice shows, Undo, Redo and Commit can
  still be clicked, and their failures are not shown, since the notice keeps its place.
- 2026-11-25 (a token for the run): `statusFor` in `respond.ts` has no case for
  `HOST_FORBIDDEN`, which falls to 400. Every caller passes 403 itself, so nothing is wrong
  today.
