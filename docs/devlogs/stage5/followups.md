# Stage 5 Follow-ups

Write-ahead log of knowingly deferred work — short bullets appended at the moment of deferral, by
humans and agents alike. No triage, estimates, or owners at capture time. Reviewed at the next
stage's setup. See [devlogs](../README.md#follow-up-wal).

Opened 2026-11-14 at stage 5's setup. The [stage 4 WAL](../stage4/followups.md) was reviewed
first: what a stage 5 spec covers is in that spec, five entries went to four seeds, and the rest
are carried here as they were written.

## Carried from stage 4

- 2026-11-14 (format-descriptors): the splitting setup (`splitting: true` and `chunkNames`) is
  repeated in five `tsup.config.ts` files. `tooling/tsup.ts` could carry it.
  - Closed 2026-11-20 (Jamie: fix now; #PRNUM): `splitPackage` in `tooling/tsup.ts` carries it,
    for the five formats and the two apps. `common` splits with its chunks beside its entries,
    as before.
- 2026-11-14 (format-descriptors): `<image-preview>` reports a failed load twice when `alt` and
  `src` change together: a stale `load` from the previous image renders over the new source. The
  local host does not hit it, because it makes a new element for each file.
- 2026-11-14 (format-descriptors): the root `README.md`'s harness paragraph and format-convention
  table predate the `./format` entry.
- 2026-11-14 (format-descriptors): in the harness, a deep link to a fixture whose content is `''`
  falls back to the first fixture (a truthiness test in `main.ts`), and `vite.config.ts`'s
  default-format pattern does not match `@stillpointlab/local-host`.
- 2026-11-14 (explorer-tree): the harness's event log (`WATCHED_EVENTS`) does not list the
  tree's events, so the tree's fixture keeps a log of its own.
- 2026-11-14 (host-page): xmdl's validator (zod 4) probes `Function('')`, which the page's
  policy blocks. It falls back, and two policy reports show in the console.
- 2026-11-14 (host-page): after the event stream reconnects, the page lists again but does not
  check the open file, so a change made during the outage shows only at the next event or save.
- 2026-11-14 (host-page): after a fragment navigation the tree's focus ring stays on the row
  that had focus, while the selection moves.
- 2026-11-14 (file-operations): a path the server refuses for its text (a `.` segment, a
  backslash, git's folder) is answered `HOST_PATH_OUTSIDE_ROOT`, worded "is outside the served
  folder". It needs a code and words of its own.
- 2026-11-14 (file-operations): the pane's change check reads an open image as text and is
  answered 400 (`HOST_NOT_TEXT`), which it takes for "still there". Harmless, and a console
  error on every change to an open image.
- 2026-11-14 (file-operations): a nested repository's row has a chevron that opens to nothing,
  and a disabled menu entry's reason is only a `title`.
- 2026-11-14 (file-operations): going back to an address from before a rename says there is no
  file at that path.
- 2026-11-14 (file-operations): a dialog with no detail line shows an empty band between its
  title and its buttons (`<modal-dialog>`'s body padding).
- 2026-11-14 (git-in-the-host): `HEAD` text is read with no filter, so a repository that
  converts line endings on checkout, or uses a smudge filter, shows every line as changed.
- 2026-11-14 (git-in-the-host): a folder whose only file moved out of the served folder loses
  its row, so that deletion shows in the commit dialog and nowhere in the tree.
- 2026-11-14 (git-in-the-host): `HOST_GIT_FAILED` answers 500, as the mapping it joined does. A
  hook that refuses is not the server's fault; 422 would say so.
- 2026-11-14 (git-in-the-host): one commit test checks that a `put` has not finished after
  300 ms, the only assertion in the package that depends on time.
- 2026-11-14 (phase 3's close): `packages/formats/md/README.md` still calls the package
  `@stillpointlab/md-editor`, its name before the monorepo, in its title, install line and
  examples.
- 2026-11-14 (context-manager-adopts-formats): a descriptor's `apply` always sets the content,
  so a host that renames an open file cannot ask it for the path's attributes alone (the code
  language). Context Manager keeps one language branch for that. A way to re-derive a path's
  attributes without content would remove it, and the local host's rename would use it too.

## Stage 5

- 2026-11-14 (phase 1's close): three relative links in older docs point at files that are gone:
  `related-tasks.md` (a seed) to `../tasks/public_page_viewer_bootstrap.md`, and stage 2's
  `cm-app-prep.md` and changelog to the seed `result-types-for-app-cores.md`. Nothing checks
  links in CI.
- 2026-11-14 (app-module-grows): inventory's bounds, pages and create copy are now in
  `packages/apps/inventory` (`bounds.ts`, `pages.ts`, `meta.ts`) and still in Context Manager
  (`services/inventory/opSchema.ts`, `services/inventory/pages.ts`, `client/apps/registry.ts`, the
  create noun in `services/apps/registry.ts`). Two copies until context-manager-adopts-apps.
- 2026-11-14 (app-module-grows, step 1): `AppMeta` has no noun for the "… created" notice a host
  shows after a create (Context Manager's client says "Inventory", "Task project"). The local
  host will want one.
- 2026-11-14 (app-module-grows, step 1): inventory's `fromChanges` counts changed and new files,
  as its spec says, so a zone or a manifest renamed by hand is not dirty and an app's check-in
  would not list it. The explorer's commit would.
- 2026-11-14 (app-module-grows, step 1): the suite's page cases cannot say "the page answers a
  view whose subject is missing, so the host gives not found" (`/room/garage` with no garage).
  `answers: 'not-found'` covers no match and a page that refuses.
- 2026-11-14 (app-module-grows, step 1): the module has no bound for its host ops
  (`link-editor`); each host bounds them itself.
- 2026-11-14 (app-module-grows, step 2): tasks' bounds, pages and create copy are now in
  `packages/apps/tasks` (`bounds.ts`, `pages.ts`, `meta.ts`) and still in Context Manager. Two
  copies until context-manager-adopts-apps, as for inventory.
- 2026-11-14 (app-module-grows, step 2): tasks' `fromChanges` cannot say whether a card's column
  moved (`dirty`, `versionColumn`): that needs the last check-in's content, not a status. The
  harness's workspace works it out from its base files today. host-runner has to choose: the
  module reads a base the host supplies, or the mark is given up outside Context Manager.
- 2026-11-14 (app-module-grows, step 2): tasks' pages read a stage or phase with `parseInt`, as
  Context Manager's did, so `/stage/3x` opens stage 3. Tighten it once Context Manager has
  adopted the pages.
- 2026-11-14 (app-module-grows, step 2): the `add-kind` bound carries a reserved-folder check
  from Context Manager that can never be true.
- 2026-11-14 (app-module-grows, step 2): tasks' `fromChanges` takes every new `.gitkeep` among
  the changes as housekeeping, wherever it is. A host hands it the instance's changes only.
- 2026-11-14 (app-shells, step 1): inventory's build has no splitting, so `./element` and
  `./shell` each carry the two elements, and a page that loads both defines them twice. The
  format packages' splitting (with `dist/chunks` in `sideEffects`) would give one copy.
  - Closed 2026-11-20 (Jamie: fix now, before Context Manager's pin moves; #PRNUM): the build
    splits. `./element` and `./shell` together are 81 kB built where they were 148 kB, and the
    two elements are defined in one shared file.
- 2026-11-14 (app-shells, step 1): seen in the inventory elements in a dark scheme: the
  download link is the browser's default purple (it has no colour of its own), and the NEW
  badge is faint.
- 2026-11-14 (app-shells, step 1): in the zone's quick add, the Title field runs under the
  Owner field, in both schemes. At phone width the overview's rows do not wrap, and the page
  scrolls sideways.
- 2026-11-14 (app-shells, step 1): the harness's Dark toggle sets a class and does not follow
  the system's colour scheme, so a check in dark has to tick it.
- 2026-11-14 (host-runner): `common-format/host`'s entry test reads the word `from` before a
  quote in any string as an import, so two of the memory port's messages are worded around it.
  A tighter pattern would let a message read naturally.
- 2026-11-14 (host-runner): `createInstance` does not know of a create that was cut off half
  way (the `reusable` files Context Manager passes), and does not check the new instance against
  the others.
- 2026-11-14 (host-runner): a `revision` covers the scope's files. A state that reads the
  listing beyond the scope (a board in a folder the manifest does not name yet) would not show
  as stale.
- 2026-11-14 (host-runner): the harness has two ways to read: an op loads the scope through
  `runOp`, and a fixture's view projects every file directly.
- 2026-11-14 (host-runner): a pending move keeps the path a card started at and not the paths
  it passed through, in the harness now as in `fromChanges`, so fixing references cannot find a
  link to a path a card only passed through.
- 2026-11-14 (host-runner): tasks' dirty mark reads a pool card's column as a board card's, as
  the harness did. The board does not draw `movedFrom`; it is in the state.
- 2026-11-14 (app-shells, step 2): the harness's "Host answers ops" and "Refuse the next op"
  controls do not reach a shell fixture's host.
- 2026-11-14 (app-shells, step 2): in the harness the bare board, hidden, and the shell's board
  both make their dialogs, so an id such as `#new-brief-title` is on the page twice.
- 2026-11-14 (app-shells, step 2): a stage made with "+ stage" has no folder until it has a
  card: the strip shows it because the pointer names it. "Close stage" then moves the pointer
  on, and the empty stage is gone from the strip. The core writes nothing for an empty stage
  by design; whether an empty stage should outlive its pointer is not decided.
- 2026-11-14 (app-shells, step 2): `tasksModule.hostOps` still names `refresh-stage` and
  `close-candidates`, which a shell answers itself. Drop them once every host mounts the shell.
- 2026-11-14 (app-shells, step 2): tasks' build has no splitting either, so `./shell` carries
  its own copy of the board and the strip (as inventory's, above).
  - Closed 2026-11-20 (#PRNUM), with inventory's: 127 kB together where they were 221 kB.
- 2026-11-14 (phase 2's read for phase 3): the app elements take their buttons' and form
  fields' looks from classes their host must style (`.button`, `.form-input` and six more).
  Each host styles them again; the harness has stand-ins. A shared partial in `common`'s styles
  would give every host the same.
- 2026-11-14 (apps-in-the-local-host, step 1): discovery lists the folder on every write and
  every app route. Keeping the answer until the watcher reports a change would save it once
  folders are large.
- 2026-11-14 (apps-in-the-local-host, step 1): the kept base texts are dropped when the watch
  on git's `HEAD` fires, about 100 ms after a commit. A file changed again inside that window
  could be compared with the old base.
- 2026-11-14 (apps-in-the-local-host, step 1): an instance nested inside another is reported
  invalid with it, and its row is hidden by the outer one's lock until that is unlocked.
- 2026-11-14 (apps-in-the-local-host, step 1): a root instance's row shows a dot for changes
  and no status letter. An instance whose app the page has no shell for still gets a row.
- 2026-11-14 (apps-in-the-local-host, step 2): a card moved to another phase has `movedFrom` in
  its state and no mark on the board, in the local host as in Context Manager. The board marks
  a column that moved, not a file that did.
- 2026-11-14 (apps-in-the-local-host, step 2): each app's create copy says "repository" (the
  folder help, tasks' root warning), which is Context Manager's word. The local host serves a
  folder.
- 2026-11-14 (apps-in-the-local-host, step 2): tasks' `read-file` answers any file the port
  reads, not only the instance's.
- 2026-11-14 (apps-in-the-local-host, step 2): in the md editor, a click in the document and
  Control+End put the cursor in the frontmatter block, and typing added a line there.
- 2026-11-14 (apps-in-the-local-host, step 2): creating an app at the served root, with its
  consent, is covered by tests and was not done by hand.
- 2026-11-14 (checkin-review, step 1): tasks' shell works out the board's check-in request from
  the state with a copy of the board's own rule, since the board has no method for it.
- 2026-11-14 (checkin-review, step 1): the board's in-flight chip reads "PR…" and speaks of a
  pull request. The word should be the host's.
- 2026-11-14 (checkin-review, step 1): while a review is busy, focus falls to the page, since
  the button that had it is disabled. The commit dialog does the same.
- 2026-11-14 (checkin-review, step 1): a review's groups keep the order they first appear in,
  so a phase's new folder can come after "Pool & config".
- 2026-11-14 (checkin-review, step 1): inventory's `./shell` entry still exports the name of
  `checkin-request`, which no host hears now.
- 2026-11-14 (checkin-review, step 2): a shell cannot say where focus goes after a refusal, so
  in an app's review it goes to the refusal's line. Rules a host can pass as data would let it
  reach the branch or the title.
- 2026-11-14 (checkin-review, step 2): nothing shows between pressing Commit and the review
  opening while the page reads the changes.
- 2026-11-14 (checkin-review, step 2): the review's error line is framed and monospace for
  git's words, so the review's own short messages ("Choose at least one file…") are monospace
  too in the local host.
- 2026-11-14 (checkin-review, step 2): an app's check-in with no title is "`<app>` check-in";
  the instance's own name ("Workshop assets check-in") may read better.
- 2026-11-14 (checkin-review, step 2): the app pane asks for git's state at every resolve. The
  branch could come with the `status` event.
- 2026-11-15 (undo-journal): the Undo and Redo buttons are the glyphs ↶ and ↷, which depend on
  the system's font. Two icons in `<spl-icon>` would be steadier.
- 2026-11-15 (undo-journal): after a create is undone while that app is open, the pane says
  there is no app at the address. It could go to the folder.
- 2026-11-15 (undo-journal): an undo's write and the putting back of the index take the port's
  write lock one after the other, so a commit could land between them.
- 2026-11-15 (undo-journal): the create dialog does not show a create's "cannot be undone"
  notice. Ctrl+Y is not a redo. A conflict's message quotes its label and its path two ways.
- 2026-11-15 (undo-journal): the page knows an editor's keys from the file pane alone. An
  editor anywhere else would need the same care.
- 2026-11-15 (undo-journal): on the board's stage view a phase with no card takes no drop.
