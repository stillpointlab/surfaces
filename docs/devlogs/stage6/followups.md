# Stage 6 Follow-ups

Write-ahead log of knowingly deferred work — short bullets appended at the moment of deferral, by
humans and agents alike. No triage, estimates, or owners at capture time. Reviewed at the next
stage's setup. See [devlogs](../README.md#follow-up-wal).

Opened 2026-11-25 at stage 6's setup. The [stage 5 WAL](../stage5/followups.md) was drained at that
stage's close. The two entries it left without an end are carried here as they were written, each
waiting for a ruling.

## Carried from stage 5

- 2026-11-14 (host-runner): the harness has two ways to read: an op loads the scope through
  `runOp`, and a fixture's view projects every file directly.
  - What was found for it (2026-11-22): a fixture is the dev page's sample data only. No walk and
    no unit test loads one, so the two ways can mislead only someone looking at the dev page.
    Jamie held the decision for that pass.
- 2026-11-23 (the close's fixes, md): a `[d]` typed into a changed block is checked against the
  definitions between blocks alone (`prosemirror-markdown.ts`, the bracket writer). Where `d` is
  defined inside a list item or a quote that is kept, the typed text is written with its brackets
  bare and reads back as a link. Seen while fixing M10; rare, since such definitions are.
