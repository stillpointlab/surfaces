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
  - Closed 2026-11-20 (Jamie: fix now;
    [#136](https://github.com/stillpointlab/surfaces/pull/136)): `splitPackage` in
    `tooling/tsup.ts` carries it, for the five formats and the two apps. `common` splits with
    its chunks beside its entries, as before.
- 2026-11-14 (format-descriptors): `<image-preview>` reports a failed load twice when `alt` and
  `src` change together: a stale `load` from the previous image renders over the new source. The
  local host does not hit it, because it makes a new element for each file.
  - Closed 2026-11-21 (Jamie: fix, taking care not to ignore too much; [#158](https://github.com/stillpointlab/surfaces/pull/158)): only the image the
    element shows is heard. Nothing is lost by it, since every render draws a new image that
    loads its source and says so itself. A late answer about an SVG's size is dropped too when
    the source changed meanwhile.
- 2026-11-14 (format-descriptors): the root `README.md`'s harness paragraph and format-convention
  table predate the `./format` entry.
  - Closed 2026-11-20 (Jamie: fix; [#149](https://github.com/stillpointlab/surfaces/pull/149)): both
    name the descriptor, and the table has its row. The template still has no `./format` entry, and
    the README says so.
- 2026-11-14 (format-descriptors): in the harness, a deep link to a fixture whose content is `''`
  falls back to the first fixture (a truthiness test in `main.ts`), and `vite.config.ts`'s
  default-format pattern does not match `@stillpointlab/local-host`.
  - Closed 2026-11-20 (Jamie: fix; [#150](https://github.com/stillpointlab/surfaces/pull/150)): a
    fixture is found by its name. The pattern takes a host's package, and the local host has a `dev`
    script, so `npm run dev` in it opens the harness on the tree.
- 2026-11-14 (explorer-tree): the harness's event log (`WATCHED_EVENTS`) does not list the
  tree's events, so the tree's fixture keeps a log of its own.
  - Closed 2026-11-20 (Jamie: fix; [#150](https://github.com/stillpointlab/surfaces/pull/150)): the
    log lists the tree's four events with their path, and the fixture's own log is gone.
- 2026-11-14 (host-page): xmdl's validator (zod 4) probes `Function('')`, which the page's
  policy blocks. It falls back, and two policy reports show in the console.
  - Closed 2026-11-21 (Jamie: fix if possible, a clean console is preferred; [#158](https://github.com/stillpointlab/surfaces/pull/158)): in a page
    the parser sets zod's `jitless`, zod's own switch for a strict policy, before its first
    schema. It is zod's global setting. Outside a page nothing is set.
- 2026-11-14 (host-page): after the event stream reconnects, the page lists again but does not
  check the open file, so a change made during the outage shows only at the next event or save.
  - Closed 2026-11-21 (Jamie: fix; [#151](https://github.com/stillpointlab/surfaces/pull/151)):
    after `listed` and `journal` the page's client says `reconnected`, its own word, and the page
    reads the open file again as it does for a change on disk. An image's address changes too, so it
    is loaded again.
- 2026-11-14 (host-page): after a fragment navigation the tree's focus ring stays on the row
  that had focus, while the selection moves.
  - Closed 2026-11-21 (Jamie: fix; [#151](https://github.com/stillpointlab/surfaces/pull/151)): a
    selection set from outside takes the ring with it when a row had focus. Focus outside the tree,
    or on a row's menu button, stays where it is.
- 2026-11-14 (file-operations): a path the server refuses for its text (a `.` segment, a
  backslash, git's folder) is answered `HOST_PATH_OUTSIDE_ROOT`, worded "is outside the served
  folder". It needs a code and words of its own.
  - Closed 2026-11-21 (Jamie: fix; [#151](https://github.com/stillpointlab/surfaces/pull/151)):
    `HOST_PATH_INVALID`, worded "is not a usable path", in the port's contract, the memory port and
    the local host. `HOST_PATH_OUTSIDE_ROOT` is left for a path that would leave the folder: an
    absolute one, a `..`, a link out.
- 2026-11-14 (file-operations): the pane's change check reads an open image as text and is
  answered 400 (`HOST_NOT_TEXT`), which it takes for "still there". Harmless, and a console
  error on every change to an open image.
  - Closed 2026-11-21 (Jamie: fix; [#151](https://github.com/stillpointlab/surfaces/pull/151)): the
    client has `probe`, which asks the raw route whether the file is there and reads none of it. The
    pane uses it for a format that takes a URL.
- 2026-11-14 (file-operations): a nested repository's row has a chevron that opens to nothing,
  and a disabled menu entry's reason is only a `title`.
  - Closed 2026-11-21 (Jamie: fix; [#152](https://github.com/stillpointlab/surfaces/pull/152)): a
    folder with nothing listed under it has no chevron, and its name ends in a slash. A menu
    entry's reason is a line of text under its label.
- 2026-11-14 (file-operations): going back to an address from before a rename says there is no
  file at that path.
  - Closed 2026-11-21 (Jamie: by design). The file is no longer at that path, and the page says so.
- 2026-11-14 (file-operations): a dialog with no detail line shows an empty band between its
  title and its buttons (`<modal-dialog>`'s body padding).
  - Closed 2026-11-21 (Jamie: fix; [#152](https://github.com/stillpointlab/surfaces/pull/152)):
    `<modal-dialog>` draws no body when no element is slotted into it, or each one is `hidden`. The
    local host's two dialogs give it none until there is a detail, a refusal or a second question.
- 2026-11-14 (git-in-the-host): `HEAD` text is read with no filter, so a repository that
  converts line endings on checkout, or uses a smudge filter, shows every line as changed.
  - Closed 2026-11-21 (Jamie: say it, as the code diff's whitespace options do;
    [#152](https://github.com/stillpointlab/surfaces/pull/152)). The line-ending half did not
    reproduce: `<code-diff>` compares lines and not their endings, so a CRLF file with one edit
    showed one line. What was missing was any word of it. The Changes view now has the diff's
    whitespace control (Compared, Ignored, Shown), and says when the sides' line endings differ
    and when they differ in whitespace alone. No count of whitespace lines against other lines.
    A smudge filter is still not run, by design: the host runs no filter, so nothing it reads
    can reach the network.
- 2026-11-14 (git-in-the-host): a folder whose only file moved out of the served folder loses
  its row, so that deletion shows in the commit dialog and nowhere in the tree.
  - Closed 2026-11-21 (Jamie: by design, to live with for a while and see how it feels). The tree
    lists what is on disk, the dot shows on every folder above that still has a row, and the
    commit dialog lists the deletion.
- 2026-11-14 (git-in-the-host): `HOST_GIT_FAILED` answers 500, as the mapping it joined does. A
  hook that refuses is not the server's fault; 422 would say so.
  - Closed 2026-11-21 (Jamie: 4xx, since the repository is the person's and not the server's;
    [#152](https://github.com/stillpointlab/surfaces/pull/152)): 422 for every failure of git's,
    since the server cannot tell a hook's refusal from another. `HOST_WRITE_FAILED` stays 500.
- 2026-11-14 (git-in-the-host): one commit test checks that a `put` has not finished after
  300 ms, the only assertion in the package that depends on time.
  - Closed 2026-11-20 (Jamie: fix; [#149](https://github.com/stillpointlab/surfaces/pull/149)), with
    a comment and no change to the test. "Nothing happened yet" needs a wait, and this one can only
    hide a failure, never cause one. The same test already says it with no clock: what the hook
    read, and the order of the two answers.
- 2026-11-14 (phase 3's close): `packages/formats/md/README.md` still calls the package
  `@stillpointlab/md-editor`, its name before the monorepo, in its title, install line and
  examples.
  - Closed 2026-11-20 (Jamie: fix; [#149](https://github.com/stillpointlab/surfaces/pull/149)): it
    is `@stillpointlab/md-format` throughout.
- 2026-11-14 (context-manager-adopts-formats): a descriptor's `apply` always sets the content,
  so a host that renames an open file cannot ask it for the path's attributes alone (the code
  language). Context Manager keeps one language branch for that. A way to re-derive a path's
  attributes without content would remove it, and the local host's rename would use it too.
  - Closed 2026-11-22 (Jamie: fix, and a seed for Context Manager's change; [#160](https://github.com/stillpointlab/surfaces/pull/160)): a descriptor
    may have `applyPath(element, path)`, which sets what the path implies and leaves the content.
    The code format has it, the descriptor suite checks it, and the local host calls it for a
    file renamed with edits in it (with none, it already handed the element the new path).
    Context Manager's branch goes at a later pin: its seed is
    `docs/tasks/unassigned/seeds/rename-through-the-formats-apply-path.md` there.

## Stage 5

- 2026-11-14 (phase 1's close): three relative links in older docs point at files that are gone:
  `related-tasks.md` (a seed) to `../tasks/public_page_viewer_bootstrap.md`, and stage 2's
  `cm-app-prep.md` and changelog to the seed `result-types-for-app-cores.md`. Nothing checks
  links in CI.
  - Closed 2026-11-20 (Jamie: fix; [#149](https://github.com/stillpointlab/surfaces/pull/149)): the
    two links to the seed point at where it went, `stage2/phase5/seeds/`. The third is not a link:
    the seed quotes a line of markdown in a code span, as an example. No link check was added to CI.
- 2026-11-14 (app-module-grows): inventory's bounds, pages and create copy are now in
  `packages/apps/inventory` (`bounds.ts`, `pages.ts`, `meta.ts`) and still in Context Manager
  (`services/inventory/opSchema.ts`, `services/inventory/pages.ts`, `client/apps/registry.ts`, the
  create noun in `services/apps/registry.ts`). Two copies until context-manager-adopts-apps.
  - Carried 2026-11-20 (Jamie) to phase 7,
    [drain-followups](../../tasks/stage5/phase7/specs/drain-followups.md): closed when the
    adoption's step 1 merges.
  - Closed 2026-11-21 (context-manager#1242, merged 2026-11-20): Context Manager's copies are gone.
    Its `opSchema.ts` keeps the check-in schemas alone.
- 2026-11-14 (app-module-grows, step 1): `AppMeta` has no noun for the "… created" notice a host
  shows after a create (Context Manager's client says "Inventory", "Task project"). The local
  host will want one.
  - Closed 2026-11-20 (Jamie: add an optional member, before Context Manager's pin moves;
    [#137](https://github.com/stillpointlab/surfaces/pull/137)): `meta.create.subject`,
    "Inventory" and "Task project". The local host shows no notice after a create yet.
- 2026-11-14 (app-module-grows, step 1): inventory's `fromChanges` counts changed and new files,
  as its spec says, so a zone or a manifest renamed by hand is not dirty and an app's check-in
  would not list it. The explorer's commit would.
  - Closed 2026-11-21 (Jamie: fix; [#159](https://github.com/stillpointlab/surfaces/pull/159)): a moved manifest or zone is dirty, with the path it had
    (`movedFrom`, a new optional member of a dirty file). Its badge and its check-in row say
    "moved", and the check-in takes both paths.
- 2026-11-14 (app-module-grows, step 1): the suite's page cases cannot say "the page answers a
  view whose subject is missing, so the host gives not found" (`/room/garage` with no garage).
  `answers: 'not-found'` covers no match and a page that refuses.
  - Closed 2026-11-22 (Jamie: fix; [#160](https://github.com/stillpointlab/surfaces/pull/160)): a page case can say `answers: 'missing'`: the page
    answers a view, the core projects nothing for it, and the page is not `emptyWhenMissing`, so
    a host answers not found. Inventory has `/room/garage` and tasks `/stage/9`.
- 2026-11-14 (app-module-grows, step 1): the module has no bound for its host ops
  (`link-editor`); each host bounds them itself.
  - Closed 2026-11-22 (Jamie: fine to close; [#160](https://github.com/stillpointlab/surfaces/pull/160)) as by design. A host op is the part a host
    does its own way, its input is a path or two, and the types are shared. Two hosts that
    accept different input would show as a refusal in one, not as bad data. To look at again if
    a host op with a richer input appears.
- 2026-11-14 (app-module-grows, step 2): tasks' bounds, pages and create copy are now in
  `packages/apps/tasks` (`bounds.ts`, `pages.ts`, `meta.ts`) and still in Context Manager. Two
  copies until context-manager-adopts-apps, as for inventory.
  - Carried 2026-11-20 (Jamie) to phase 7,
    [drain-followups](../../tasks/stage5/phase7/specs/drain-followups.md), with inventory's.
  - Closed 2026-11-21 (context-manager#1242), with inventory's.
- 2026-11-14 (app-module-grows, step 2): tasks' `fromChanges` cannot say whether a card's column
  moved (`dirty`, `versionColumn`): that needs the last check-in's content, not a status. The
  harness's workspace works it out from its base files today. host-runner has to choose: the
  module reads a base the host supplies, or the mark is given up outside Context Manager.
  - Closed 2026-11-21 (Jamie: done, and of little weight either way). host-runner chose: a host
    may give each change the file's text at the last check-in (`base`), and `fromChanges` marks
    the column move from it; the local host does. Jamie's view: the board's state is the files'
    frontmatter, and a file being among the changes is enough for tasks to look at it again.
    What `base` adds is the check-in row reading "todo → done" where it would read "content
    edited".
- 2026-11-14 (app-module-grows, step 2): tasks' pages read a stage or phase with `parseInt`, as
  Context Manager's did, so `/stage/3x` opens stage 3. Tighten it once Context Manager has
  adopted the pages.
  - Carried 2026-11-20 (Jamie) to phase 7,
    [drain-followups](../../tasks/stage5/phase7/specs/drain-followups.md), after the adoption.
  - Closed 2026-11-20 ([#148](https://github.com/stillpointlab/surfaces/pull/148)): a segment
    that is not a positive whole number in digits alone is not found. Context Manager takes it
    with its next pin.
- 2026-11-14 (app-module-grows, step 2): the `add-kind` bound carries a reserved-folder check
  from Context Manager that can never be true.
  - Closed 2026-11-20 ([#137](https://github.com/stillpointlab/surfaces/pull/137)): the
    check is gone. A kind's id is still refused when it is the pool's.
- 2026-11-14 (app-module-grows, step 2): tasks' `fromChanges` takes every new `.gitkeep` among
  the changes as housekeeping, wherever it is. A host hands it the instance's changes only.
  - Closed 2026-11-21 (Jamie: by design, to fix if it causes issues later; [#159](https://github.com/stillpointlab/surfaces/pull/159)). The local host
    hands a module only the changes in its instance's region. The contract's comment on
    `fromChanges` now says a host does.
- 2026-11-14 (app-shells, step 1): inventory's build has no splitting, so `./element` and
  `./shell` each carry the two elements, and a page that loads both defines them twice. The
  format packages' splitting (with `dist/chunks` in `sideEffects`) would give one copy.
  - Closed 2026-11-20 (Jamie: fix now, before Context Manager's pin moves;
    [#136](https://github.com/stillpointlab/surfaces/pull/136)): the build splits. `./element`
    and `./shell` together are 81 kB built where they were 148 kB, and the two elements are
    defined in one shared file.
- 2026-11-14 (app-shells, step 1): seen in the inventory elements in a dark scheme: the
  download link is the browser's default purple (it has no colour of its own), and the NEW
  badge is faint.
  - Closed 2026-11-21 (Jamie: fix both; [#158](https://github.com/stillpointlab/surfaces/pull/158)): the link takes the theme's link colour, and the
    badge the warning tokens, with a border. In a dark scheme the badge's background was the
    row's own.
- 2026-11-14 (app-shells, step 1): in the zone's quick add, the Title field runs under the
  Owner field, in both schemes. At phone width the overview's rows do not wrap, and the page
  scrolls sideways.
  - Closed 2026-11-21 (Jamie: fix; [#158](https://github.com/stillpointlab/surfaces/pull/158)): the title's minimum width applies in the plain quick
    add's row alone, not in the configured one's grid, where it made the field wider than its
    column. The overview's rows, its totals and its check-in bar wrap, so the page no longer
    scrolls sideways at 390 px.
- 2026-11-14 (app-shells, step 1): the harness's Dark toggle sets a class and does not follow
  the system's colour scheme, so a check in dark has to tick it.
  - Closed 2026-11-20 (Jamie: fix; [#150](https://github.com/stillpointlab/surfaces/pull/150)): Dark
    starts as the system has it and follows it. The box overrides until the system changes.
- 2026-11-14 (host-runner): `common-format/host`'s entry test reads the word `from` before a
  quote in any string as an import, so two of the memory port's messages are worded around it.
  A tighter pattern would let a message read naturally.
  - Closed 2026-11-21 (Jamie: fix; [#159](https://github.com/stillpointlab/surfaces/pull/159)): the test reads a `from` only in a statement that starts
    with `import` or `export`, with cases for every form a build writes and for the word in a
    string. The one message still worded around it reads as the node port's: `has no "from".`
- 2026-11-14 (host-runner): `createInstance` does not know of a create that was cut off half
  way (the `reusable` files Context Manager passes), and does not check the new instance against
  the others.
  - Moved 2026-11-22 (Jamie: a seed; [#161](https://github.com/stillpointlab/surfaces/pull/161)) to the seed
    [Context Manager on the runner](../../tasks/unassigned/seeds/context-manager-on-the-runner.md).
    Neither happens in the local host: its create is one all-or-nothing write, and it checks
    for an overlap before calling the runner.
- 2026-11-14 (host-runner): a `revision` covers the scope's files. A state that reads the
  listing beyond the scope (a board in a folder the manifest does not name yet) would not show
  as stale.
  - Moved 2026-11-22 (Jamie: a seed; [#161](https://github.com/stillpointlab/surfaces/pull/161)) to the same seed,
    [Context Manager on the runner](../../tasks/unassigned/seeds/context-manager-on-the-runner.md).
    The local host's own revision also covers the uncommitted changes in the instance's folder.
- 2026-11-14 (host-runner): the harness has two ways to read: an op loads the scope through
  `runOp`, and a fixture's view projects every file directly.
  - Carried 2026-11-22 (Jamie: "I'll hold on this decision for this pass"; [#161](https://github.com/stillpointlab/surfaces/pull/161)), undecided,
    to the next stage's review of this log. What was found for it: a fixture is the dev page's
    sample data only. No walk and no unit test loads one, so the two ways can mislead only
    someone looking at the dev page.
- 2026-11-14 (host-runner): a pending move keeps the path a card started at and not the paths
  it passed through, in the harness now as in `fromChanges`, so fixing references cannot find a
  link to a path a card only passed through.
  - Moved 2026-11-22 (Jamie: a seed is OK, "but this one is borderline IMO"; [#161](https://github.com/stillpointlab/surfaces/pull/161)) to the seed
    [card move undo strands retargeted references](../../tasks/unassigned/seeds/move-undo-reference-strand.md),
    which holds the same kind of stranded link. It is live in the local host: move a card, fix
    its references, move it again before a check-in.
- 2026-11-14 (host-runner): tasks' dirty mark reads a pool card's column as a board card's, as
  the harness did. The board does not draw `movedFrom`; it is in the state.
  - Closed 2026-11-21 (Jamie: fix; [#159](https://github.com/stillpointlab/surfaces/pull/159)): `fromChanges` marks a column move for a board's cards
    alone; a pool card is changed, and moved when it is, and never `dirty`. The board marks every
    changed card since [#156](https://github.com/stillpointlab/surfaces/pull/156), a moved one
    among them.
- 2026-11-14 (app-shells, step 2): the harness's "Host answers ops" and "Refuse the next op"
  controls do not reach a shell fixture's host.
  - Closed 2026-11-20 (Jamie: fix; [#150](https://github.com/stillpointlab/surfaces/pull/150)): both
    reach the tasks shell's host. Off, no op is claimed. A refusal takes the next op that is not a
    read (`project`, `refresh`), as inventory's shell fixture already did.
- 2026-11-14 (app-shells, step 2): in the harness the bare board, hidden, and the shell's board
  both make their dialogs, so an id such as `#new-brief-title` is on the page twice.
  - Closed 2026-11-20 (Jamie: fix; [#150](https://github.com/stillpointlab/surfaces/pull/150)): only
    one of the two is on the page at a time. The fixture takes the other off and puts it back when
    its fixture is chosen.
- 2026-11-14 (app-shells, step 2): a stage made with "+ stage" has no folder until it has a
  card: the strip shows it because the pointer names it. "Close stage" then moves the pointer
  on, and the empty stage is gone from the strip. The core writes nothing for an empty stage
  by design; whether an empty stage should outlive its pointer is not decided.
  - Closed 2026-11-22 (Jamie: "I think empty is fine, if I feel it is broken later we can
    fix"; [#161](https://github.com/stillpointlab/surfaces/pull/161)) as by design. A stage with no card is its pointer and nothing else, as a new
    phase is. Closing an empty stage leaves a gap in the numbers and no trace of it in the files.
- 2026-11-14 (app-shells, step 2): `tasksModule.hostOps` still names `refresh-stage` and
  `close-candidates`, which a shell answers itself. Drop them once every host mounts the shell.
  - Carried 2026-11-20 (Jamie) to phase 7,
    [drain-followups](../../tasks/stage5/phase7/specs/drain-followups.md), after the adoption.
  - Closed 2026-11-20 ([#148](https://github.com/stillpointlab/surfaces/pull/148)): the module
    names three host ops, and `TASKS_SHELL_OPS` names the shell's two.
- 2026-11-14 (app-shells, step 2): tasks' build has no splitting either, so `./shell` carries
  its own copy of the board and the strip (as inventory's, above).
  - Closed 2026-11-20 ([#136](https://github.com/stillpointlab/surfaces/pull/136)), with
    inventory's: 127 kB together where they were 221 kB.
- 2026-11-14 (phase 2's read for phase 3): the app elements take their buttons' and form
  fields' looks from classes their host must style (`.button`, `.form-input` and six more).
  Each host styles them again; the harness has stand-ins. A shared partial in `common`'s styles
  would give every host the same.
  - Moved 2026-11-22 (Jamie: a seed is fine; [#160](https://github.com/stillpointlab/surfaces/pull/160)) to the seed
    [one look for the apps' buttons and fields](../../tasks/unassigned/seeds/one-look-for-the-apps-buttons-and-fields.md).
- 2026-11-14 (apps-in-the-local-host, step 1): discovery lists the folder on every write and
  every app route. Keeping the answer until the watcher reports a change would save it once
  folders are large.
  - Moved 2026-11-21 (Jamie: it is speed, so a seed; [#155](https://github.com/stillpointlab/surfaces/pull/155)) to the seed
    [the local host keeps its listing](../../tasks/unassigned/seeds/the-local-host-keeps-its-listing.md).
- 2026-11-14 (apps-in-the-local-host, step 1): the kept base texts are dropped when the watch
  on git's `HEAD` fires, about 100 ms after a commit. A file changed again inside that window
  could be compared with the old base.
  - Closed 2026-11-21 (Jamie: fix; [#155](https://github.com/stillpointlab/surfaces/pull/155)): the host's own commit drops them as it lands. A commit
    made outside the host keeps the window, until the watch fires.
- 2026-11-14 (apps-in-the-local-host, step 1): an instance nested inside another is reported
  invalid with it, and its row is hidden by the outer one's lock until that is unlocked.
  - Closed 2026-11-21 (Jamie: by design, as long as the error is reported and a person can unlock
    and fix it). Checked in Chromium against the built host: the outer app's page names the inner
    manifest in its error and offers "Show files…"; shown, the inner one has its row, its files
    can be shown too, and deleting its manifest from the tree makes the outer app valid again.
- 2026-11-14 (apps-in-the-local-host, step 1): a root instance's row shows a dot for changes
  and no status letter. An instance whose app the page has no shell for still gets a row.
  - Closed 2026-11-21 (Jamie: by design, both halves). The dot is fine: an app's row stands for a
    folder. A row with no shell cannot happen while the server and the page name the same apps,
    and if they ever differ the row's message says the page cannot show that app.
- 2026-11-14 (apps-in-the-local-host, step 2): a card moved to another phase has `movedFrom` in
  its state and no mark on the board, in the local host as in Context Manager. The board marks
  a column that moved, not a file that did.
  - Closed 2026-11-21 (Jamie: fix, it should show a dirty mark; [#156](https://github.com/stillpointlab/surfaces/pull/156)): the board's dot is on
    every card with an uncommitted change (moved to another phase, edited, new), as it already
    was on a pool card, and as the bar's count counts them. Context Manager's boards show the
    same after its next pin.
- 2026-11-14 (apps-in-the-local-host, step 2): each app's create copy says "repository" (the
  folder help, tasks' root warning), which is Context Manager's word. The local host serves a
  folder.
  - Moved 2026-11-20 (Jamie: leave the copy for the adoption, and seed it) to the seed
    [the host's words in an app](../../tasks/unassigned/seeds/the-hosts-words-in-an-app.md).
- 2026-11-14 (apps-in-the-local-host, step 2): tasks' `read-file` answers any file the port
  reads, not only the instance's.
  - Closed 2026-11-21 (Jamie: fix, an app deals only with the files it holds; [#155](https://github.com/stillpointlab/surfaces/pull/155)): `read-file`
    refuses a path outside the instance's region with `APP_OP_INVALID`.
- 2026-11-14 (apps-in-the-local-host, step 2): in the md editor, a click in the document and
  Control+End put the cursor in the frontmatter block, and typing added a line there.
  - Closed 2026-11-20 (Jamie: could not reproduce is fine). Tried in Chromium against the built
    local host at `04764d0`, over sixteen paths: clicks in the text, below it and around the
    frontmatter's chip, Control+End and Control+Home, Preview then Edit, and one of this
    repository's own cards. A click on the chip opens the frontmatter and puts the cursor in
    it, by design, and Control+End from there goes to the document's end. The likeliest cause
    is a script's click landing on the chip.
- 2026-11-14 (apps-in-the-local-host, step 2): creating an app at the served root, with its
  consent, is covered by tests and was not done by hand.
  - Closed 2026-11-21 (Jamie: a check by hand is enough; [#156](https://github.com/stillpointlab/surfaces/pull/156)). Done in Chromium against the
    built host over a new repository: an empty folder shows the root warning and its consent
    box; Create without the consent is refused in the dialog and writes nothing; with it,
    `tasks.yaml` is at the root, the instance has its row above the tree with its files hidden,
    it opens as the board, and Undo names the create.
- 2026-11-14 (checkin-review, step 1): tasks' shell works out the board's check-in request from
  the state with a copy of the board's own rule, since the board has no method for it.
  - Closed 2026-11-21 (Jamie: fix; [#156](https://github.com/stillpointlab/surfaces/pull/156)): one rule, `checkinRequestOf` in
    `packages/apps/tasks/src/checkinRequest.ts`, which the board and the shell both call.
- 2026-11-14 (checkin-review, step 1): the board's in-flight chip reads "PR…" and speaks of a
  pull request. The word should be the host's.
  - Moved 2026-11-20 to the seed [the host's words in an
    app](../../tasks/unassigned/seeds/the-hosts-words-in-an-app.md), as the
    same question.
- 2026-11-14 (checkin-review, step 1): while a review is busy, focus falls to the page, since
  the button that had it is disabled. The commit dialog does the same.
  - Closed 2026-11-21 (Jamie: fix; [#154](https://github.com/stillpointlab/surfaces/pull/154)): the review's two buttons are `aria-disabled` while it
    is busy, not `disabled`, so the one pressed keeps the focus. The commit dialog is the same
    element.
- 2026-11-14 (checkin-review, step 1): a review's groups keep the order they first appear in,
  so a phase's new folder can come after "Pool & config".
  - Closed 2026-11-21 (Jamie: fix; [#154](https://github.com/stillpointlab/surfaces/pull/154)): on a stage view the tasks shell gives its rows with the
    phases by number and "Pool & config" last. The review still keeps the order it is given.
- 2026-11-14 (checkin-review, step 1): inventory's `./shell` entry still exports the name of
  `checkin-request`, which no host hears now.
  - Closed 2026-11-20 ([#137](https://github.com/stillpointlab/surfaces/pull/137)): the
    export is gone from `./shell`. `./element` keeps it, for a host of the bare elements.
- 2026-11-14 (checkin-review, step 2): a shell cannot say where focus goes after a refusal, so
  in an app's review it goes to the refusal's line. Rules a host can pass as data would let it
  reach the branch or the title.
  - Moved 2026-11-21 (Jamie: a seed, and the review's display needs a full pass; [#156](https://github.com/stillpointlab/surfaces/pull/156)) to the seed
    [a host gives the check-in review its length limits](../../tasks/unassigned/seeds/checkin-review-length-limits.md),
    which now starts that pass.
- 2026-11-14 (checkin-review, step 2): nothing shows between pressing Commit and the review
  opening while the page reads the changes.
  - Closed 2026-11-21 (Jamie: fix, with a spinner; [#154](https://github.com/stillpointlab/surfaces/pull/154)): the Commit button is `aria-busy` while
    the page reads, and shows `<spl-icon>`'s spinner in place of its count once the read has
    taken 150 ms. The review's confirm button shows the same spinner while the host answers.
- 2026-11-14 (checkin-review, step 2): the review's error line is framed and monospace for
  git's words, so the review's own short messages ("Choose at least one file…") are monospace
  too in the local host.
  - Closed 2026-11-21 (Jamie: fix; [#154](https://github.com/stillpointlab/surfaces/pull/154)): the line carries the refusal's code (`data-code`), and
    the local host sets `HOST_GIT_FAILED` alone in a monospace face. The frame stays for all.
- 2026-11-14 (checkin-review, step 2): an app's check-in with no title is "`<app>` check-in";
  the instance's own name ("Workshop assets check-in") may read better.
  - Closed 2026-11-21 (Jamie: fix; [#154](https://github.com/stillpointlab/surfaces/pull/154)): it is named for the instance. The pane gives the shell
    that title as `checkin.defaultTitle`, a new optional member of the shell's input, and
    inventory's review shows it as its placeholder.
- 2026-11-14 (checkin-review, step 2): the app pane asks for git's state at every resolve. The
  branch could come with the `status` event.
  - Closed 2026-11-21 (Jamie: fine to leave for now). It is asked each time the pane reads an
    app's page, beside that read: when an app opens or moves between its pages, when one of its
    files changes on disk, when git's `HEAD` or index moves or the listing changes while it is
    open, and when the shell asks for its page again. Never outside a repository.
- 2026-11-15 (undo-journal): the Undo and Redo buttons are the glyphs ↶ and ↷, which depend on
  the system's font. Two icons in `<spl-icon>` would be steadier.
  - Closed 2026-11-21 (Jamie: fix, and a seed to review how icons are made; [#157](https://github.com/stillpointlab/surfaces/pull/157)): `<spl-icon>`
    has `undo` and `redo`, and the two buttons show them. The seed is
    [how the icons are made](../../tasks/unassigned/seeds/how-the-icons-are-made.md).
- 2026-11-15 (undo-journal): after a create is undone while that app is open, the pane says
  there is no app at the address. It could go to the folder.
  - Closed 2026-11-21 (Jamie: fix; [#157](https://github.com/stillpointlab/surfaces/pull/157)): an undo that takes the open app away shows nothing
    open, with the notice saying what was undone. The folder usually goes with the app. A create
    already opened the new app's page with its row selected, as Jamie asked; a test says so now.
- 2026-11-15 (undo-journal): an undo's write and the putting back of the index take the port's
  write lock one after the other, so a commit could land between them.
  - Closed 2026-11-21 (Jamie: fix; [#157](https://github.com/stillpointlab/surfaces/pull/157)): a commit runs between the journal's steps
    (`journal.exclusive`), so it waits for an undo's write and its index together.
- 2026-11-15 (undo-journal): the create dialog does not show a create's "cannot be undone"
  notice. Ctrl+Y is not a redo. A conflict's message quotes its label and its path two ways.
  - Closed 2026-11-21 (Jamie: fix all three, best effort on the first; [#157](https://github.com/stillpointlab/surfaces/pull/157)): the page shows the
    host's notice for a create written with no step, as it does for an op (a create only makes
    new text files, so today's two apps cannot cause it); Ctrl+Y redoes where Ctrl is the key;
    a conflict quotes the step and the path alike, `"Delete a.md" cannot be undone: …`.
- 2026-11-15 (undo-journal): the page knows an editor's keys from the file pane alone. An
  editor anywhere else would need the same care.
  - Closed 2026-11-21 (Jamie: by design; apps have their own pages and controls, and anything
    more is dealt with when it comes up). Ctrl+Z in a text field, a text area or an editable
    region anywhere on the page is already that field's.
- 2026-11-15 (undo-journal): on the board's stage view a phase with no card takes no drop.
  - Closed 2026-11-21 (Jamie: fix; [#158](https://github.com/stillpointlab/surfaces/pull/158)): the empty phase's row is a drop target. The card's file
    moves there in the column it is in, or the first column for a pool card, as the card menu's
    move to another phase does.
- 2026-11-20 (phase 7, the dialog's Tab fix): two of the local host's tests (`port.test.ts`,
  `git/repository.test.ts`) take a fresh folder under the system's temporary directory for "not a
  repository". With a `.git` entry anywhere above it (an empty `/tmp/.git` appeared on the
  development machine) the host says `no-git`, rightly, and both fail. They should make their
  own ceiling, or say why they were skipped.
  - Closed 2026-11-20 (Jamie: fix; [#149](https://github.com/stillpointlab/surfaces/pull/149)): the
    host's look for a `.git` entry stops below a folder `GIT_CEILING_DIRECTORIES` names, as git's
    does, and the tests' environment names their temporary folder. A third test (`cli.test.ts`) had
    the same fault.
- 2026-11-22
  ([release review](../../tasks/stage5/phase7/reviews/stage-5-release-review.md), M4):
  a commit does not answer, and holds every write, while a hook's child keeps git's output open.
  `server/git/run.ts` waits for `close`, which waits for every holder of the pipes; a hook that
  leaves a child in its own session escapes the timeout's signal too. Answer on `exit` after a short
  drain, then destroy the pipes. Stage 4's code.
  - Closed 2026-11-23 (Jamie: as much as possible at the stage's end, not the next one's start; [#169](https://github.com/stillpointlab/surfaces/pull/169)): the answer comes when git itself exits. What git wrote is
    read for a moment more (100 ms), then the pipes are destroyed. An ordinary run closes its
    output with its exit and is no slower. A child a hook left running is left running, where
    it was killed at the commit's timeout before.
- 2026-11-22 (release review, M7): serving a folder git ignores shows an empty tree, since the
  listing asks git and git lists nothing ignored. At the start, `git check-ignore -q .`; when
  ignored, list by the walk. Stage 4's code.
  - Closed 2026-11-23 (Jamie: as much as possible at the stage's end, not the next one's start; [#169](https://github.com/stillpointlab/surfaces/pull/169)): a served folder its repository ignores is served as a
    folder with no repository. The listing walks it, there is no Changes view and no commit,
    and the server says so once at its start. The card said to walk and keep git; nothing in
    an ignored folder can be committed, so the page no longer offers to. The repository's own
    top is never asked, and a `check-ignore` that fails keeps the repository.
- 2026-11-22 (release review, M10): a link definition written inside a list item or a block quote is
  dropped by an edit there, while a paragraph elsewhere still uses it. When the parse's references
  hold a label the kept definitions do not, write the document whole. None of 609 real files has
  one.
  - Closed 2026-11-23 (Jamie: as much as possible at the stage's end, not the next one's start; [#170](https://github.com/stillpointlab/surfaces/pull/170)): when the text defines a label inside a block, a save
    whose output would no longer define every label as the text did writes the document
    whole, where each link carries its own address. A document with no such definition is
    written as before.
- 2026-11-22 (release review, M11): the runner rewrites a file it could not read, with no `base`.
  Only the pool's `order.yaml` can be written this way (a Latin-1 order file was replaced by
  `reorder-pool`). Refuse a `write` or `move` whose source has no loaded version.
  - Closed 2026-11-23 (Jamie: as much as possible at the stage's end, not the next one's start; [#171](https://github.com/stillpointlab/surfaces/pull/171)): the runner answers a rewrite or a move of a file the load
    could not read with the port's own refusal for that file (`HOST_NOT_TEXT` for the order
    file), and writes nothing.
- 2026-11-22 (release review, L1): a rule that becomes a markdown file's first block reads back as
  frontmatter, and the next load hides what follows it. The text stays in the file.
  - Closed 2026-11-23 (Jamie: as much as possible at the stage's end, not the next one's start; [#170](https://github.com/stillpointlab/surfaces/pull/170)): a body with no frontmatter that would read back as having
    one has its first rule written `***`, the same rule. A first block that would not be
    misread keeps its text.
- 2026-11-22 (release review, L2): `/api/raw` serves a repository's `.js` as script from the page's
  own origin, so `script-src 'self'` would not stop an injection, if one existed, from loading a
  file as script. Refuse `Sec-Fetch-Dest: script`, `style` and `worker` there.
  - Closed 2026-11-23 (Jamie: as much as possible at the stage's end, not the next one's start; [#169](https://github.com/stillpointlab/surfaces/pull/169)): the raw route answers 403 to a request the browser marks
    as one it would run or apply (`Sec-Fetch-Dest`: script, style, a worker, a worklet, `xslt`,
    `manifest`, `json`). An image, a document, media, a font, a `fetch` and a request with no
    such header are served as before.
- 2026-11-22 (release review, L3): a tasks kind with the id `constructor` answers 500 on its board
  until a card exists (`holder.paths[kind.id]` on a plain object, in `boardDetection.ts`).
  - Closed 2026-11-23 (Jamie: as much as possible at the stage's end, not the next one's start; [#171](https://github.com/stillpointlab/surfaces/pull/171)): a kind's paths are read as the board's own key.
- 2026-11-22 (release review, L4): a tasks manifest whose `current` key is quoted is invalid after
  Set current: a second `current:` is appended. Stage 3's code, both hosts.
  - Closed 2026-11-23 (Jamie: as much as possible at the stage's end, not the next one's start; [#171](https://github.com/stillpointlab/surfaces/pull/171)): the manifest's rewriter finds a top-level key in quotes
    or with a space before its colon. The same fault held for a quoted `tags` key and a new
    tag, and went with it.
- 2026-11-22 (release review, L6): a page loaded at `#/edit/<a locked app's file>` can mount the
  editor, since the instances are read after the view is chosen. The server refuses the save.
  - Closed 2026-11-23 (Jamie: as much as possible at the stage's end, not the next one's start; [#171](https://github.com/stillpointlab/surfaces/pull/171)): an edit address waits for the first listing, as a Changes
    view and an app's page do, so the lock is known before the view is chosen.
- 2026-11-22 (release review, L7): the create dialog closes on Escape while its create runs; the
  instance still appears.
  - Closed 2026-11-23 (Jamie: as much as possible at the stage's end, not the next one's start; [#171](https://github.com/stillpointlab/surfaces/pull/171)): Escape, Cancel and the close button wait for the create,
    as the file dialogs wait for a write.
- 2026-11-22 (release review, L8): `reorder-pool` sent with no view writes and then answers not
  found. The shell always sends one.
  - Closed 2026-11-23 (Jamie: as much as possible at the stage's end, not the next one's start; [#171](https://github.com/stillpointlab/surfaces/pull/171)): the pool is the instance's, the same beside every board
    and stage, so the reply needs no view.
- 2026-11-22 (the review's fixes, md): an edit to a block still rewrites two things that read back
  the same: a bare URL gains angle brackets, and an email autolink (`<me@example.com>`) becomes
  `[me@example.com](mailto:me@example.com)`. Seen while fixing M9; for [a save keeps the
  file](../../tasks/unassigned/seeds/a-save-keeps-the-file.md).
  - Moved 2026-11-23 (the agent's call, for Jamie to overrule: both read back the same, and
    the spelling an edit keeps is the seed's subject) to the seed
    [a save keeps the file](../../tasks/unassigned/seeds/a-save-keeps-the-file.md).
- 2026-11-22 (the review's fixes, modal-dialog): with two `<modal-dialog>`s open, Escape closes
  both, since each hears the key on the document. Older than stage 5, and nothing in surfaces opens
  two. The fix for Tab (M12) keeps the order they opened in, which Escape could use.
  - Closed 2026-11-23 (Jamie: as much as possible at the stage's end, not the next one's start; [#171](https://github.com/stillpointlab/surfaces/pull/171)): one Escape closes one dialog, the one opened last.
- 2026-11-23 (the close's fixes, md): a `[d]` typed into a changed block is checked against the
  definitions between blocks alone (`prosemirror-markdown.ts`, the bracket writer). Where `d` is
  defined inside a list item or a quote that is kept, the typed text is written with its brackets
  bare and reads back as a link. Seen while fixing M10; rare, since such definitions are.
