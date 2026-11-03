# Stage 1 Follow-ups

Write-ahead log of knowingly deferred work — short bullets appended at the moment of deferral, by
humans and agents alike. No triage, estimates, or owners at capture time. Reviewed at the next
stage's setup. See [devlogs](../README.md#follow-up-wal).

Stage 1 ran without a WAL; its deferrals lived in the cards' landing notes and in Context Manager's
stage 5 WAL (which keeps the host-side ones, such as the "View source" item and the in-app walks the
pin moves did not do). The entries below were collected from the cards at stage close, 2026-11-03,
each dated by when it was deferred. Stage 2's setup reviews them.

- 2026-11-02 (claude, phase 2, [#6](https://github.com/stillpointlab/surfaces/pull/6)): vitest
  browser mode is a `formatTest({ browser: true })` switch that no package flips yet. Its two
  dependencies are not committed and CI runs no browser tests; the contract suites passed under it
  once, locally. The first media editor or sheet's clipboard tests are the expected first users.
- 2026-11-02 (claude, phase 4, [#17](https://github.com/stillpointlab/surfaces/pull/17)): toolbar
  geometry is not unified. `_toolbar.scss` carries only the shared states (focus ring, disabled);
  making the four toolbars look alike would be a redesign.
- 2026-11-02 (claude, phase 5 brief): image has no raw view. SVG is text, so a source view can
  follow under the raw view convention; the
  [media formats seed](../../tasks/unassigned/seeds/media-formats-preview-first.md) is the likely
  home.
- 2026-11-02 (claude, phase 5, [#20](https://github.com/stillpointlab/surfaces/pull/20)): the format
  template is not a workspace, so a template change is proven by scaffolding a trial format with
  `npm run new-format`, testing it, then removing it and restoring the lockfile by hand. Worth
  folding into the [one scaffold](../../tasks/unassigned/seeds/one-scaffold-for-formats-and-apps.md)
  work.
- 2026-11-03 (claude, phase 6, [#30](https://github.com/stillpointlab/surfaces/pull/30)): raw views
  keep the embedded `<code-editor>`'s own Normal/Vim toolbar; Jamie left moving it into the format's
  toolbar open.
