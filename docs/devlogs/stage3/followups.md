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
  - Closed 2026-11-10: the sheet's stylesheet now stays mounted across renders (re-inserting it
    re-parsed 11 KB of CSS on every committed edit), which brings the test from about 1.8 s to
    1.2 s alone, and the test gets a 20 s timeout. Two full checks after it passed.
- 2026-11-12 (stage 3 phase 3 close): `@stillpointlab/tasks-app/element` does not export
  `RELOAD_REQUEST_EVENT` (it is declared in `tasks-nav.ts`; inventory's element entry exports its
  own). Context Manager's tasks app wires `'reload-request'` by name (context-manager#1157).
  Exporting it from the element entry is one line, and Context Manager can then import it.
  - Closed 2026-11-12: exported from the element entry
    ([#84](https://github.com/stillpointlab/surfaces/pull/84)), and Context Manager's tasks app
    imports it (context-manager#1167).
- 2026-11-12 (stage 3 phase 4 close): each app page's JavaScript grew 10–14 kB in Context Manager
  (context-manager#1162), because each app's `./element` entry now carries its create form and its
  checks, and the app page loads the whole entry. A separate `./create-element` entry would keep
  the form off the app pages and still load on demand in the create dialog. Worth doing if the
  growth matters.
  - Closed 2026-11-12: the forms moved to `./create-element`
    ([#84](https://github.com/stillpointlab/surfaces/pull/84)), which Context Manager's create
    dialog loads on demand (context-manager#1167). The app chunks are back to 58.00 kB (inventory)
    and 78.97 kB (tasks).
- 2026-11-12 (stage 3 phase 4 close): Context Manager keeps the old check-in job names
  (`GIT_TASKS_CHECKIN`, `GIT_INVENTORY_CHECKIN`) as aliases of `GIT_APP_CHECKIN`, with their labels
  and the board's listener, for one release (`LEGACY_CHECKIN_JOBS`, context-manager#1163). Remove
  them after the first production release that carries `GIT_APP_CHECKIN`.
  - Closed 2026-11-12: removed in context-manager#1167, once #1163 was live in production.

Reviewed at stage close, 2026-11-12 (phase 6,
[drain-followups](../../tasks/stage3/phase6/specs/drain-followups.md)): every entry above is
closed. Nothing moved to the backlog pool.
