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
  - Built 2026-11-25 ([#185](https://github.com/stillpointlab/surfaces/pull/185)): a stream the browser gave up on is opened again each
    second, until the server answers it or the run is found over. The built command never answers
    that 503; development mode does, while Vite starts.
- 2026-11-25 (a token for the run): once the restart notice shows, Undo, Redo and Commit can
  still be clicked, and their failures are not shown, since the notice keeps its place.
  - Built 2026-11-25 ([#185](https://github.com/stillpointlab/surfaces/pull/185)): the three are disabled with the notice, and the keys
    ask nothing.
- 2026-11-25 (a token for the run): `statusFor` in `respond.ts` has no case for
  `HOST_FORBIDDEN`, which falls to 400. Every caller passes 403 itself, so nothing is wrong
  today.
  - Built 2026-11-25 ([#185](https://github.com/stillpointlab/surfaces/pull/185)): 403 by its code.

## Phase 2

- 2026-11-25 (the raw route serves media): the raw route answers `cache-control: no-store`, so a
  browser keeps no media on disk and a seek back in a long file is downloaded again.
- 2026-11-25 (the raw route serves media): a file is sent after its size is read, so one that
  shrinks while it is sent ends short of its `Content-Length`. Older than the ranges, which it
  now holds for too.
- 2026-11-25 (the scaffold makes a registrable format): `tooling/new-format.test.ts` is linted
  and run, and no type check reads it.
- 2026-11-25 (the scaffold makes a registrable format): image's root entry registers its
  element, where the templates' register nothing, and its README's heading still names
  `@stillpointlab/image-editor`.
- 2026-11-25 (the token's follow-ups): after a restart, the explorer's create, rename and
  delete, an app's op, a save, and a commit review already open still call the server. Whether
  each failure shows was not checked. A disabled Undo keeps the title of its step.
