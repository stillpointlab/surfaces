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
- 2026-11-07 (shared components; kept as they are by the spec): the `spinner` icon does not exist.
  Two Context Manager dashboard pages ask for `icon-name="spinner"`, which has no mask, so it draws
  a filled square.
- 2026-11-07 (shared components): `<spl-icon>` always renders `role="button"` and `tabindex="0"`,
  even when it is decorative, so decorative icons are keyboard stops announced as buttons.
- 2026-11-07 (shared components): `<spl-icon>` interpolates its attributes into `innerHTML`. Its
  callers pass fixed names and labels, apart from Context Manager's `conversation-indicator`, whose
  label comes from admin-configured provider and model names. `<modal-dialog>`'s title got this fix;
  the icon did not.
  - Closed 2026-11-08 (html-safe-templates): `<spl-icon>` builds its shadow DOM once and sets its
    attributes as attributes; hostile values for all four are tested. `<modal-dialog>` now renders
    through `html` too, with its stylesheet set as text.
- 2026-11-07 (shared components): `md-icon` holds 18 of `<spl-icon>`'s names as inline SVG. md could
  use the component now that it lives here, but the two differ (`md-icon` is not a button, and its
  sizes differ).
- 2026-11-07 (result types for app cores): only the functions that threw now answer a `Result`. The
  cores' older results keep shapes of their own: `parseInventoryManifest` and the tasks manifest
  parse (`{ ok: false, errors }`), the room writer (`reason`, `notFound`), and the lifecycles'
  `validateAndScope` (`errors`, kept on purpose since a manifest can be wrong in several ways at
  once). Converging them changes their callers in Context Manager, so it is its own step.
- 2026-11-07 (app contract): `project` and `apply` from the August `AppModule` design are not
  named in `common-format/app`. The rules they would hold are still in Context Manager's services,
  so naming them waits for the pass that extracts those rules, after phase 6.
- 2026-11-07 (transport-blind task board): the board's page-level UI stays in Context Manager:
  the nav strip and its close-phase dialogs, board settings, refresh, check-in, and the new-card,
  title and tags dialogs. The board raises requests for them by path. Whether any of it moves into
  the element, and so whether `tasks-nav.shared.ts` needs a DOM-free entry, is for the same later
  pass. Context Manager's WAL has the timing change that came with the ops.
- 2026-11-08 (task board element adoption): the tasks walks' step 03 1B still races a cold server:
  a linked card's menu move is refused while the drag before it is in flight. The walk could wait
  for the first move to settle, as 1D and 3.1 now do. Not done, to keep the merge moving; it is a
  Context Manager walk change.
- 2026-11-08 (html-safe-templates): the task board still builds its markup as string templates,
  escaping each value with `escapeHtml` from `common-format/html` (it no longer has its own). Moving
  it onto `html` and `render` is mechanical but touches most of its 1,400 lines. Its file-level
  exception to the `innerHTML` lint rule is the reminder.
- 2026-11-08 (html-safe-templates): the formats are outside the `innerHTML` lint rule. Eleven of
  their element modules set markup directly (md's editor, toolbar, icon and preview; code's editor,
  preview and diff; xmdl's editor and preview; sheet's editor; image's preview), mostly static
  scaffolding around an engine. A pass over them, onto `html` and `render` with the rule widened to
  `packages/formats`, is its own step.
- 2026-11-08 (zone-vocabulary): two messages from the core still say room to users: a zone file
  that is not a mapping ("room file must be a YAML mapping") and a duplicate id's reason ("in this
  room"). The rename left them alone because it changes no behaviour, and each is commented. Saying
  zone is a wording change that the inventory walks would need to check, so it is its own step. The
  `rooms/` folder rename is still the seed-sized question the spec records.
- 2026-11-08 (phase 6 close): repositories still keep their zones in a `rooms/` folder beside
  `inventory.yaml`, and Context Manager's routes and API paths say room. Renaming the folder means a
  migration across existing repositories: detection would read both folders, and a check-in or a
  one-off pull request would move the files. The routes would need redirects. The question is
  seed-sized and has no card yet.
