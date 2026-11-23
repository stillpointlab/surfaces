# Stage 5: The Apps in the Local Host Changelog

- **Dates:** 2026-11-14 – 2026-11-22
- **Stage Tag:** `stage5-complete` _(created on the merge of Jamie's reflections PR, which follows
  the stage close PR)_

> Agent-drafted from evidence (merged PRs, git history, task cards). Appended per phase at phase
> close. Regenerable at any time; see [devlogs](../README.md). Reflections do NOT belong here — they
> go in `reflections.md`.

> The stage's theme is the second half of the
> [local host brief](../../tasks/stage4/phase1/briefs/local_host.md): a tasks or inventory manifest
> opens as its app in the local host, check-in is one review, what the host writes can be undone,
> and Context Manager adopts what moved. Phase 1 reads the specs against stage 4 and sets the
> sprint up; the work runs in phases 2–6, in the order the
> [sprint brief](../../tasks/stage5/phase1/briefs/apps_sprint.md) gives.

---

## Phase 1: The specs read against stage 4, and the sprint's setup (`stage5-phase1-complete`)

Range: `stage4-complete..stage5-phase1-complete` (`2c3a3ee..05f6ff7`), 2026-11-14: seven commits,
three merges, 26 files, +2,782/−210. Under `packages/`: 6 files, +680/−24, all in the md format.

### Shipped

- Three manual test plans moved from Context Manager's pool
  ([#109](https://github.com/stillpointlab/surfaces/pull/109), Jamie): the sheet editor, the
  inventory's configured fields and the task board's refresh. Each is rewritten for the local
  host or the harness before it is walked.
- The stage 5 specs read against stage 4
  ([#110](https://github.com/stillpointlab/surfaces/pull/110)):
  - the [review](../../tasks/stage5/phase1/reviews/specs-against-stage-4.md): what stage 4 built
    that the specs did not know, seven findings that would have sent an implementing agent the
    wrong way, nine smaller ones, and five decisions for Jamie;
  - all seven specs amended, each with a "What stage 4 built" section;
  - the [sprint brief](../../tasks/stage5/phase1/briefs/apps_sprint.md): the order of the
    specs, and how the sprint runs, from how stage 4's ran;
  - stage 4's follow-up log reviewed: of its 30 entries, six went into a stage 5 spec or were
    closed by the read, five went to four seeds (three new), and nineteen are carried in
    [stage 5's log](followups.md), which this opened;
  - the board's pointer moved to stage 5.
- A save in the md editor keeps the text it did not change
  ([#111](https://github.com/stillpointlab/surfaces/pull/111)). After an edit in the rich view,
  each top-level block that did not change is written back as the text it was set with; only
  the blocks that changed go through the serializer. Before, one edit rewrote the whole file.

### Decisions

Jamie's, 2026-11-14, on the review's five questions:

- A deleted image or large file cannot be undone, and the host asks first.
- Context Manager's adoption is two PRs: bounds, pages, shells and the check-in review
  together, and the lock apart.
- An app's facts come from one member of its module, `fromChanges`, which is to an app what
  `apply` is to a format's descriptor. The harness and the local host both call it.
- The md editor's reflow is fixed ahead of the sprint, as close to a bug.
- Context Manager's preview pages stay out of the adoption. The work is a seed in Context
  Manager's own pool (context-manager#1199).

From the review, written into the specs:

- The local host's listing stays whole, and the page hides a locked app's files.
- Undo puts git's index back from the entries a delete removed, not with `git reset`.
- The check-in element takes over everything the commit dialog does, with its words given by
  its host.

### Testing & review

- The review is the phase's review card. Its undo finding was tried in a scratch repository on
  git 2.56: restoring the index entries a delete removed left `git status` exactly as it was,
  where `git reset` unstaged a staged edit and left a staged new file untracked.
- #111: `npm run check` passes with 2,654 tests, 22 of them new. A corpus run, not committed,
  over the 897 markdown files of this repository and of Context Manager's `docs/`: unedited
  files wrote back byte-identical, and 7,751 simulated edits to a paragraph or a heading each
  changed only that block's lines. In Chromium, through the built local host, one edit to a
  file with frontmatter, a hand-wrapped paragraph, a `*` list, a setext heading, an aligned
  table and a reference link saved as a one-line `git diff`.
- #110 is docs only: the format check passes and every relative link resolves.

### Deferred

- What #111 leaves is the seed
  [a save keeps the rest of the file](../../tasks/unassigned/seeds/a-save-keeps-the-file.md): an
  edit inside a list or a table rewrites that whole block, a changed paragraph is written on one
  line, and the sheet editor's save is untouched.
- Context Manager gets #111 when its pin next moves, at stage 5's adoption unless it moves
  sooner.
- The nineteen entries carried from stage 4 are in [stage 5's log](followups.md).

---

## Phase 2: What an app carries, the runner, and each app's page (`stage5-phase2-complete`)

Range: `stage5-phase1-complete..stage5-phase2-complete` (`05f6ff7..95fe8fa`), 2026-11-14: six
pull requests and phase 1's close, 100 files, +9,897/−579. The six were a stack, each on the one
before, and reached main on 2026-11-20 in one merge with phases 3 to 5 (`94ddb0e`), so the
phase's tag is on its last commit and not on a merge.

### Shipped

- Phase 1 closed and phase 2 opened ([#112](https://github.com/stillpointlab/surfaces/pull/112)).
- The module carries its bounds, pages and copy
  ([#113](https://github.com/stillpointlab/surfaces/pull/113),
  [#114](https://github.com/stillpointlab/surfaces/pull/114);
  [spec](../../tasks/stage5/phase2/specs/app-module-grows.md)): `AppModule` gains `meta`,
  `bounds`, `pages`, `placeCreate` and `fromChanges`, and inventory and tasks supply them;
  `matchAppPage` and `bounded` in `common-format/app`; a `./meta` entry in each app that loads
  no zod; the app suite checks all five.
- One runner over the storage port
  ([#116](https://github.com/stillpointlab/surfaces/pull/116);
  [spec](../../tasks/stage5/phase2/specs/host-runner.md)): `loadInstance`, `runOp`,
  `projectView`, `createInstance` and `hostRefusalClass` in `common-format/host`; a port in
  memory with `changes()` and `commit()`; `describeStoragePort`, a suite both ports pass; the
  harness's apps on the runner.
- Each app's page as an element ([#115](https://github.com/stillpointlab/surfaces/pull/115),
  [#117](https://github.com/stillpointlab/surfaces/pull/117);
  [spec](../../tasks/stage5/phase2/specs/app-shells.md)): the shell contract (`AppShellInput`,
  `AppShellElement`, `AppShellOps`); `<spl-inventory-app>` and `<spl-tasks-app>` behind a
  `./shell` entry in each package; `pageHref`; a fixture for each in the harness.
- The apps-in-the-local-host spec read against the phase
  ([#119](https://github.com/stillpointlab/surfaces/pull/119)).

### Decisions

Jamie has not ruled on these. They are the agents' calls, each in its spec's "As built" section,
and Jamie merged the stack on 2026-11-20.

- A change may carry the text it was based on (`AppFileChange.base`), so tasks' `fromChanges`
  can mark a card whose column moved. The orchestrating agent's amendment, before host-runner
  started.
- A page's parameters are strings the page checks itself, so a bad one is not found where
  Context Manager answered 400.
- The runner loads a manifest its lifecycle refuses, with the refusal in `warnings`, as Context
  Manager's loader does. Only a manifest that is not there is a refusal.
- A host that mounts a shell answers `navigate`. Every `navigate` can be cancelled, and only a
  clicked link has the browser behind it.
- Tasks' shell answers `refresh-stage` and `close-candidates` itself, through `project`.
- A shell holds no editor links and asks `link-editor` for a file that is already linked too.

### Testing & review

- `npm run check` passed from a clean tree at each level of the stack: 2,761, 2,901, 2,938,
  3,112 and 3,172 tests.
- Each schema's limits were compared with Context Manager's at `8fa439ba`, and its tests'
  cases carried over. Context Manager's build, type check and tests passed against #114's tip
  with a pin made by hand and not committed.
- Each shell was driven in Chromium over the harness's memory host with a script, in light and
  dark. The orchestrating agent looked at a sample of the screenshots.
- CI runs on pull requests to main only. The stack through phase 2 ran through CI once on a
  draft pull request (#118, closed unmerged).

### Deferred

- Twenty-six entries in the [follow-up log](followups.md), among them: neither app's build
  splits, so `./element` and `./shell` each carry the elements; `AppMeta` has no noun for a
  host's "… created" notice; inventory's `fromChanges` does not count a moved zone; tasks' pages
  read `/stage/3x` as stage 3; `tasksModule.hostOps` still names the two ops the shell answers.

### At the phase's opening and close

- Opening: the five new members were optional in step 1 and required in step 2, so the two
  steps could land apart.
- Close: the [apps-in-the-local-host](../../tasks/stage5/phase3/specs/apps-in-the-local-host.md)
  spec moved to `stage5/phase3/specs/` with a section on what phase 2 built: base texts from
  git's `HEAD`, kept until it moves; a revision of the host's own over the runner's; the pane
  claiming every `navigate`; the overlap check on a create.

---

## Phase 3: The apps in the local host (`stage5-phase3-complete`)

Range: `stage5-phase2-complete..stage5-phase3-complete` (`95fe8fa..f94cf1a`), 2026-11-14: three
pull requests, 49 files, +5,074/−250. On main with the one merge (`94ddb0e`); the tag is on the
phase's last commit.

### Shipped

- The row, the lock and inventory ([#120](https://github.com/stillpointlab/surfaces/pull/120);
  [spec](../../tasks/stage5/phase3/specs/apps-in-the-local-host.md), step 1): discovery of the
  instances in the served folder, with overlapping ones marked invalid; `GET /api/apps`, the
  lock route, and the page, project and op routes over the runner; an instance as one locked
  row with its files hidden; a write to a locked file refused; the app pane mounting a shell at
  an address of its own; `focusRow(path)` on the tree.
- Tasks, the board's menu and create
  ([#121](https://github.com/stillpointlab/surfaces/pull/121); step 2): tasks registered; its
  host ops answered by the server; the board's options menu as the page's menu; "Create … here…"
  on a folder, with a dialog around the app's own form and `POST /api/apps/create`.
- The checkin-review spec read against phases 2 and 3
  ([#123](https://github.com/stillpointlab/surfaces/pull/123)).

### Decisions

The agents' calls, in the spec's "As built" sections.

- Discovery runs afresh for each route that needs it, a write's lock check included, so a lock
  is never checked against stale regions.
- Two instances that overlap are both invalid, each with a line naming the other. A create
  that would overlap is refused before anything is written.
- The server holds each instance's lock, and a new instance starts locked.
- A host op is answered before the runner and carries no revision.
- Tasks' `resolve` is refused in the local host: nothing there diverges from an upstream.

### Testing & review

- `npm run check` passed from a clean tree at both steps: 3,229 and 3,253 tests.
- By hand in Chromium against the built server, light and dark: two inventories in a scratch
  repository, one in a folder and one at the root; this repository's own board on a copy of
  it, with a card moved, the file read back from disk and a commit from the explorer clearing
  the marks; an inventory and a task project created in a scratch folder, and one inside the
  other refused.
- The stack through phase 3 ran through CI on a draft pull request (#122, closed unmerged).

### Deferred

- Nine entries in the [follow-up log](followups.md), among them: discovery lists the folder on
  every write; the apps' create copy says "repository" where the local host serves a folder;
  tasks' `read-file` answers any file the port reads; in the md editor a click could put the
  cursor in the frontmatter.

### At the phase's close

The [checkin-review](../../tasks/stage5/phase4/specs/checkin-review.md) spec moved to
`stage5/phase4/specs/` with a section on what phases 2 and 3 built: the review in the light DOM
with the classes the apps borrow, the request stopping at the shell, and the harness answering a
check-in with the memory port's commit.

---

## Phase 4: One check-in review (`stage5-phase4-complete`)

Range: `stage5-phase3-complete..stage5-phase4-complete` (`f94cf1a..4ea6575`), 2026-11-14: three
pull requests, 55 files, +3,751/−882. On main with the one merge (`94ddb0e`); the tag is on the
phase's last commit.

### Shipped

- The review, the op and both shells
  ([#124](https://github.com/stillpointlab/surfaces/pull/124);
  [spec](../../tasks/stage5/phase4/specs/checkin-review.md), step 1): a new package,
  `@stillpointlab/checkin-review-component`, with `<checkin-review>`; `checkin` in
  `AppShellOps`, with `CheckinWords`, `CheckinBranch` and `checkinSettled()` in the shell
  contract; each shell taking its app's `checkin-request` and asking its host.
- The local host answers it ([#125](https://github.com/stillpointlab/surfaces/pull/125);
  step 2): an app's check-in is a commit; the explorer's commit dialog is the same element,
  with its rows in the tree's order; the Commit button is disabled when nothing has changed.
- The undo-journal spec read against phases 2 to 4
  ([#127](https://github.com/stillpointlab/surfaces/pull/127)).

### Decisions

The agents' calls, in the spec's "As built" sections.

- The words and the branch type are in `common`'s shell contract, since `common` cannot depend
  on a component. Five more words have plain defaults.
- Each shell stops `checkin-request`, so no host hears it.
- Tasks' rows keep Context Manager's labels. On a stage view the order file and the
  housekeeping sit under "Pool & config".
- An app's check-in with no title is "`<app>` check-in" in the local host.
- A shell's input is data, so it cannot say where focus goes after a refusal. In an app's
  review focus goes to the refusal's line.

### Testing & review

- `npm run check` passed from a clean tree at both steps: 3,296 and 3,310 tests. The commit
  dialog's tests were rewritten against the element, with nine more.
- By hand in Chromium, light and dark: in the harness, each shell's review with a row
  unchecked; against the built server in a scratch repository, a check-in from the inventory
  and from the board on a new branch with the commits read back, the explorer's review with a
  branch that exists refused in git's words, and a `pre-commit` hook that refuses.
- The stack through phase 4 ran through CI on a draft pull request (#126, closed unmerged).

### Deferred

- Ten entries in the [follow-up log](followups.md), among them: the board's in-flight chip
  says "PR…" in every host; a review's groups keep the order they first appear in; tasks' shell
  has a copy of the board's rule for a check-in request; inventory's `./shell` still exports
  the name of `checkin-request`.

### At the phase's close

The [undo-journal](../../tasks/stage5/phase5/specs/undo-journal.md) spec moved to
`stage5/phase5/specs/` with a section on what phases 2 to 4 built: the journal's port passes the
port suite, an op's answer carries a notice, and the page's client reads the journal.

---

## Phase 5: Undo, and the stage's code review (`stage5-phase5-complete`)

Range: `stage5-phase4-complete..stage5-phase5-complete` (`4ea6575..f91c77d`), 2026-11-14 –
2026-11-20: four pull requests, 43 files, +3,624/−142. The undo journal reached main in the one
merge (`94ddb0e`); the review's three pull requests, stacked on it, in a second (`f91c77d`),
which the tag is on.

### Shipped

- Undo and redo in the local host ([#128](https://github.com/stillpointlab/surfaces/pull/128);
  [spec](../../tasks/stage5/phase5/specs/undo-journal.md)): a journal around the storage port
  with one step for each of the host's own writes, an app's op and a create included; the
  journal, undo and redo routes and a `journal` event; git's index put back as it was; a step
  that cannot be kept asked about first; two buttons in the explorer's header, and the keys.
- The [stage 5 code review](../../tasks/stage5/phase5/reviews/stage-5-code-review.md) and its
  fixes ([#131](https://github.com/stillpointlab/surfaces/pull/131)): the app pane gives a shell
  its page again when it asks (H1); a file the server cannot read asks before its delete (H3);
  stale undo labels after a reconnection, a second commit review, the keys on a layout with no
  Latin letters, and a malformed change answered 400 (L1 to L4).
- An undone delete brings back the file's mode, and a link's delete asks first
  ([#132](https://github.com/stillpointlab/surfaces/pull/132);
  [spec](../../tasks/stage5/phase5/specs/undo-keeps-modes-and-links.md)): the review's H2.
- The inventory overview says briefly that a zone could not be parsed
  ([#133](https://github.com/stillpointlab/surfaces/pull/133)), from Jamie's pass over the
  stage in the local host.
- Four seeds: [a tasks page whose phase is
  gone](../../tasks/unassigned/seeds/a-tasks-page-whose-phase-is-gone.md) (the review's M1),
  [app errors in the explorer](../../tasks/unassigned/seeds/app-errors-in-the-explorer.md),
  [errors at line and column](../../tasks/unassigned/seeds/errors-at-line-and-column.md), and
  [inventory says zone in URLs and
  folders](../../tasks/unassigned/seeds/inventory-says-zone-in-urls-and-folders.md), which takes
  in the older seed for the zones folder.

### Decisions

Jamie's:

- 2026-11-18: a code review of the stage before it merges, with bugs fixed in a new pull
  request and anything larger written up.
- 2026-11-18, on H2: the mode is kept, and only a link's delete asks. The alternative was to
  keep no mode and ask before an executable's delete as well.
- 2026-11-18, from his pass by hand: the overview's row for a broken zone is brief, and the
  three seeds above.

The agents', in the spec's "As built" section:

- Undo and Redo are two glyphs. With the words, the header cut the folder's name to a letter.
- An editor's save is not a step. A `put` that carries a `write` goes straight to the port.
- Redo puts the index back too.
- A commit does not clear the journal. Undoing a committed step makes a new change.

### Testing & review

- `npm run check` passed from a clean tree at each level: 3,458, 3,468, 3,478 and 3,479 tests.
- The review: a read of the whole diff (#113 to #128) by a second agent with none of the
  build's context, which returned seven findings, each reproduced before anything changed; and
  a pass by hand in Chromium against the built server. Each fix has a test that fails without
  it.
- The orchestrating agent's own run at the stack's tip: a card moved, undone, redone and
  checked in from the board on a new branch, then undone after the commit as a new change.
- Jamie tried the stage by hand on a local server before merging.
- The stack through phase 5 ran through CI on a draft pull request (#129, closed unmerged). CI
  passed on main at `94ddb0e` and at `f91c77d`.

### Deferred

- Six entries in the [follow-up log](followups.md), among them: the glyphs depend on the
  system's font; an undo's write and the putting back of the index take the write lock one
  after the other; the create dialog does not show a create's "cannot be undone" notice.
- The review's observations for Jamie, which changed nothing: two boards both named "Tasks"
  in the explorer, undo labels that are an op's id, "content edited" for a new card, and a
  notice that stays until replaced.

### At the phase's close

- Phases 2 to 5 closed together on 2026-11-20, once Jamie had merged both stacks: the seven
  specs and the review are done, and the pointer is at phase 6.
- The [adoption spec](../../tasks/stage5/phase6/specs/context-manager-adopts-apps.md) moved to
  `stage5/phase6/specs/` with a section on what phases 2 to 5 built: what the pin brings with
  nothing adopted, the module's bounds, pages and copy as they are, what a host of a shell
  does, the review's op and words, and where the local host's lock differs.
- The follow-up log holds 71 entries, 19 of them carried from stage 4. It is drained with
  Jamie, a few entries at a time, starting with those that touch the adoption.

---

## Phase 6: Context Manager adopts the apps' pieces (`stage5-phase6-complete`)

Range: `stage5-phase5-complete..stage5-phase6-complete`, 2026-11-20 – 2026-11-21. The phase's code
is two Context Manager pull requests: context-manager#1242 (72 files, +1,914/−2,959) and
context-manager#1246 (77 files, +4,036/−308). Here: the close of phases 2 to 5, what the pin
needed first, and the lock read against Context Manager. The follow-up drain's pull requests
reached main in the same range; they are phase 7's.

### Shipped

- Context Manager adopts the apps' pieces (context-manager#1242;
  [spec](../../tasks/stage5/phase6/specs/context-manager-adopts-apps.md), steps 1 to 3): each
  app's bounds, pages and copy come from its module; the app view page mounts each app's shell;
  the shells' check-in review replaces both check-in dialogs. Its first commit is the pin alone,
  at `21d3385`.
- The lock on an app's files (context-manager#1246; the spec's step 4): an enabled app's files
  are hidden in the repo tree and refused by the server (`APP_SCOPE_LOCKED`, 409) until a person
  shows them or an agent asks with `scopeUnlocked`; a file in an app's folder opens read-only
  behind a banner; six MCP tools take the flag; ADR-0028 is amended.
- The lock, read against Context Manager
  ([#147](https://github.com/stillpointlab/surfaces/pull/147)): a section of the spec that lists
  every entry that writes to an app's file, written before the second pull request.
- What the pin needed first:
  - the two app packages' builds split
    ([#136](https://github.com/stillpointlab/surfaces/pull/136));
  - `meta.create.subject`, and two leftovers removed
    ([#137](https://github.com/stillpointlab/surfaces/pull/137));
  - an app's meta loads its default folder alone, not the naming rules
    ([#141](https://github.com/stillpointlab/surfaces/pull/141)), found in the pin's sizes.
- Three fixes Context Manager's stage 7 asked for, which came with the pin: a changed block
  keeps its square brackets as typed
  ([#143](https://github.com/stillpointlab/surfaces/pull/143)), Tab stays inside an open dialog
  ([#144](https://github.com/stillpointlab/surfaces/pull/144)), and a line break inside a
  paragraph renders as a space ([#145](https://github.com/stillpointlab/surfaces/pull/145)).
- After the adoption, two changes that waited for it
  ([#148](https://github.com/stillpointlab/surfaces/pull/148)): the shell's two ops leave
  `tasksModule.hostOps`, and a tasks page number is digits alone. Context Manager takes them
  with its next pin.
- ADR-0040's count, taken again (context-manager#1249): 4,752 lines of Context Manager are
  still an app's, where 5,850 were after stage 3 and 8,413 before it.
- A seed: [the check-in review takes length limits from its
  host](../../tasks/unassigned/seeds/checkin-review-length-limits.md)
  ([#146](https://github.com/stillpointlab/surfaces/pull/146)).

### Decisions

Jamie's:

- 2026-11-20: the follow-up log is drained before the arc closes, a few entries at a time, with
  the entries that touch the adoption first, so that Context Manager's pin moves once.
- 2026-11-20: `e2e:reset` and pushes to the scratch repository were approved for each pull
  request's walks, and again on 2026-11-21 for the lock's.
- 2026-11-20: the lock is a second pull request, after a read of every entry that writes to an
  app's file.
- He merged both pull requests.

The agents', in the spec's "As built" section and each pull request's description:

- A bad op, view or create input is refused with the module's code (`APP_OP_INVALID` and the
  rest), where it was `VALIDATION_ERROR`.
- The review has no length limit of its own; the route's refusal shows in it.
- `publishVersion`'s default is the checked one, so both check-in services pass `bySystem`,
  which the spec's non-goals did not foresee.
- Three entries the list of writes missed are locked too.
- The lock's follow-ups opened Context Manager's stage 8 log.

### Testing & review

- Tests here: 3,479 at phase 5's close to 3,521 at `051a781`, the drain's included.
- Context Manager at #1242's tip: type check and lint clean, 4,986 unit tests (5,012 at the
  pin; the deleted schemas' and pages' tests went with them). At #1246: 5,111.
- **Walks,** each round after a full build and a reset of the walk database, never both suites
  at once and never while CI ran:
  - #1242 at the pin alone and at its tip: inventory 38 of 38, tasks 01 to 27 and 29, every
    step on its first run;
  - #1246 at `6e43bf40`: the same, and the new walk 30 failed on a fault of its own (it waited
    for an autosave the page does not schedule when the text equals the published version);
  - #1246 at its tip: every step of both suites, walk 30 among them, on its first run.
- **By hand in Chromium:** at #1242's tip, the board in its shell, a card dragged, and the
  check-in review's keys; at #1246's tip, the locked row, the "Show files" question, the
  unlocked row and the file page's banner in both states. One defect was found and fixed in
  #1246: the unlocked row's caret pointed right with its files shown. An app at a
  repository's root was not looked at by hand.
- Each pull request's sizes are in its description: every page gains 0.83 kB with #1242, and
  nothing every page loads changed with #1246.

### Deferred

- In Context Manager's logs: the review's message line has no style there, and five small
  entries from the lock (stage 8's log), among them an unlocked publish that still opens its
  one-file pull request beside the app's check-in.
- The count script is in neither repository.
- Context Manager's pin is at `21d3385`. One more move at the end of phase 7 brings #148 and
  the drain's fixes.

### At the phase's close

- The spec is done, with an "As built" section. The two log entries for the apps' bounds,
  pages and copy being in both repositories are closed.
- The pointer is at phase 7, the [follow-up
  drain](../../tasks/stage5/phase7/specs/drain-followups.md), which has run beside this phase
  since 2026-11-20: 71 entries when phase 6 opened, 39 left to rule on.

---

## Phase 7: The follow-up log drained (`stage5-phase7-complete`)

Range: `stage5-phase6-complete..stage5-phase7-complete`, 2026-11-21 – 2026-11-22: 19 commits, nine
merges, 85 files, +1,859/−202; under `packages/`, 72 files, +1,274/−198. The drain began on
2026-11-20, beside phase 6, so four of its batches ([#149](https://github.com/stillpointlab/surfaces/pull/149) to [#152](https://github.com/stillpointlab/surfaces/pull/152)) and what the pin
needed first ([#136](https://github.com/stillpointlab/surfaces/pull/136) to [#138](https://github.com/stillpointlab/surfaces/pull/138), [#148](https://github.com/stillpointlab/surfaces/pull/148), listed under phase 6) reached main before that
tag. They are counted here.

### Shipped

The [spec](../../tasks/stage5/phase7/specs/drain-followups.md): every entry of the
[follow-up log](followups.md) ruled on by Jamie, a few at a time, and each batch's fixes landed
as one small pull request. Of 72 entries, 50 were fixed, 13 closed with a reason (by design,
could not be reproduced, or fine as it is), eight moved to seeds, and one is carried.

- **The docs and the tests' ground** ([#149](https://github.com/stillpointlab/surfaces/pull/149)): the root README and the md format's name the
  `./format` entry and the package as they are; two dead links; a `.git` above the temporary
  folder no longer fails the local host's tests (the host's look for one stops at
  `GIT_CEILING_DIRECTORIES`).
- **The dev harness** ([#150](https://github.com/stillpointlab/surfaces/pull/150)): a link to an empty fixture opens it; the log lists the
  tree's events; Dark follows the system's scheme; the tasks shell fixture's host can be
  switched off or made to refuse; a dialog's id is on the page once.
- **The local host's page** ([#151](https://github.com/stillpointlab/surfaces/pull/151), [#152](https://github.com/stillpointlab/surfaces/pull/152)):
  - the open file is read again when the event stream comes back, and the tree's focus ring
    follows a selection set from outside;
  - a path refused for how it is written has its own code, `HOST_PATH_INVALID`, in the port's
    contract and its conformance suite;
  - an open image is no longer read as text; a folder with nothing listed under it has no
    caret and a trailing slash; a disabled menu entry's reason is text, not a tooltip; a
    dialog with nothing in its body draws no body;
  - the Changes view has a whitespace control (compare, ignore, show) and says when two sides
    differ in line endings or whitespace alone; a git failure answers 422.
- **The check-in review** ([#154](https://github.com/stillpointlab/surfaces/pull/154)): its buttons stay focusable while it is busy, the
  confirm button shows a spinner, and a refusal's line carries its code; tasks' groups are in
  phase order; the local host's Commit button shows it is reading; inside a repository the
  title field offers a default.
- **Apps in the local host** ([#155](https://github.com/stillpointlab/surfaces/pull/155), [#157](https://github.com/stillpointlab/surfaces/pull/157)): an app's `read-file` host op reads only
  the instance's own files; the bases an app's facts are made from follow the host's commit;
  undo and redo have icons and a second key (Ctrl+Y); an undone create leaves the app's page;
  a commit and an undo cannot interleave; a step the journal cannot keep says so.
- **The two apps** ([#156](https://github.com/stillpointlab/surfaces/pull/156), [#158](https://github.com/stillpointlab/surfaces/pull/158), [#159](https://github.com/stillpointlab/surfaces/pull/159)):
  - one rule for what a check-in takes (`checkinRequestOf`), used by the board and the shell,
    and a dot on every card with an uncommitted change;
  - an empty phase on the stage view takes a dropped card; inventory's download link, dirty
    badge and narrow layout; a zone renamed outside the app is "moved", checked in as one
    rename; a pool card is never marked as having moved column;
  - `<image-preview>` hears only the image it shows; the xmdl parser no longer trips a
    content security policy (`z.config({ jitless: true })`).
- **The contracts** ([#160](https://github.com/stillpointlab/surfaces/pull/160)): a format descriptor may have `applyPath`, which sets what a
  path implies and leaves the content, so a file renamed with edits in it takes its new
  language; the app suite's page cases can say a subject is missing.
- **Seeds,** each ranked in `order.yaml`:
  [the host's words in an app](../../tasks/unassigned/seeds/the-hosts-words-in-an-app.md),
  [diff whitespace in one place](../../tasks/unassigned/seeds/diff-whitespace-in-one-place.md),
  [the local host keeps its listing](../../tasks/unassigned/seeds/the-local-host-keeps-its-listing.md),
  [how the icons are made](../../tasks/unassigned/seeds/how-the-icons-are-made.md),
  [delete an app](../../tasks/unassigned/seeds/delete-an-app.md),
  [one look for the apps' buttons and fields](../../tasks/unassigned/seeds/one-look-for-the-apps-buttons-and-fields.md)
  and [Context Manager on the runner](../../tasks/unassigned/seeds/context-manager-on-the-runner.md).
  Two older seeds grew: the review's length limits (a pass over its display) and stranded
  references (a path a card only passed through). A seed for [a Tasks app's
  title](../../tasks/unassigned/seeds/a-title-for-a-tasks-app.md) came from Context Manager's
  stage 8 ([#162](https://github.com/stillpointlab/surfaces/pull/162)).
- **In Context Manager:**
  - the pin moves once, to `452cba4`, with everything above (context-manager#1272);
  - a locked app file's preview says the app's files are locked (context-manager#1269), an
    entry of its stage 8 log passed to the agent that built the lock;
  - a seed for its rename dialog to use `applyPath` (context-manager#1264).

### Decisions

Jamie's, one for each entry, in the log under it. Those that set a rule:

- 2026-11-21: batches stay at five entries. A close, a carry or a seed takes more thought than
  a fix, because of its second-order effects, so those come with fuller reasoning.
- 2026-11-21: a git failure is a 4xx: the repository is the person's, not the server's.
- 2026-11-21: an app deals only with the files it holds.
- 2026-11-21: the pin moves once, after the log is drained, so the walks are read against the
  drain as its last task.
- 2026-11-22: the board's state is the files' frontmatter, and a file being among the changes
  is enough for tasks to look again.
- 2026-11-22: Context Manager adopting the runner is likely wanted, and needs more information
  first; the seed gathers it.
- 2026-11-22: the harness's two ways to read is held for this pass.
- 2026-11-22: `e2e:reset` and pushes to the scratch repository were approved for the pin's
  walks.

The agent's, in each pull request's description: the contract additions (`HOST_PATH_INVALID`,
`AppShellInput.checkin.defaultTitle`, `movedFrom` on an inventory dirty file, `applyPath`,
`answers: 'missing'`), each optional or additive, and what was left out of a fix and why.

### Testing & review

- `npm run check` passed from a clean tree for every pull request: 3,521 tests at `051a781` to
  3,570 at the close.
- Each fix has a test that fails without it, where a test can say it. The exceptions are in
  the pull requests' descriptions: the timed assertion kept as it was, and the looks checked
  by hand.
- **By hand in Chromium,** for each batch that changed what a person sees, against the local
  host (dev mode, and the built server where a content security policy mattered) or the dev
  harness; each pull request lists its checks.
- **Context Manager's walks, read against the drain** ([#161](https://github.com/stillpointlab/surfaces/pull/161)): no expectation had to
  change by the reading.
- **The pin's walks** (context-manager#1272, at `e951acfa`), after a full build and a reset of
  the walk database, never both suites at once, and started with CI idle: inventory 38 of 38,
  tasks 01 to 27, 29 and 30, every step on its first run. Walk 23, the one the reading named
  to watch, passed. Walk 30 gained a step for the locked preview. Context Manager's unit suite
  at the pin: 5,181 tests.
- **The locked preview** (context-manager#1269) was reproduced in Chromium before it was
  changed. One part of the report did not reproduce: the document tree lists no linked
  repository file at all.
- **Two faults of the orchestrating agent's on the shared machine:** a local build that
  overlapped a CI run on Context Manager's main, which passed; and a commit whose pre-commit
  hook ran while CI built the same branch, which tripped the resource guard and failed that
  run. It passed when run again.

### Deferred

- One log entry is carried, undecided, to the next stage's review: the harness reads an app
  two ways.
- The seeds above. The one that leaves a defect in place: a link to a path a card only passed
  through is not found by the reference fix.
- Context Manager's rename dialog keeps its own language branch until its seed is taken up.

### At the phase's close

- The spec is done, with an "As built" section.
- The follow-up log has a line under every entry.
- The pointer stays at stage 5, phase 7 until the next stage is set up; its theme is Jamie's
  call.

---

## Stage totals

- `2c3a3ee..452cba4` (`stage4-complete` to the last merge before the close): 160 commits, 34 of
  them merges on `main`, 277 files, +30,199/−3,095. Forty-eight pull requests merged here, #109
  to #162; sixteen of them (#113 to #128, and #131 to #133) reached main in two stacks.
- Under `packages/` and `tooling/`: 216 files, +24,044/−1,930.
- Tests: 2,632 at stage 4's close to 3,570.
- Context Manager carried the stage in four pull requests of code (context-manager#1242 and
  #1246 for the adoption and the lock, #1272 for the last pin, #1269 for the locked
  preview), each walked or checked in a browser.
- **How the work was done:** phases 2 to 5 were specs implemented by Opus 5.5 sub-agents in
  worktrees of their own, reviewed, checked and stacked by the orchestrating agent, then
  reviewed once more as a whole before Jamie merged the two stacks. Phase 6's two pull
  requests were sub-agents' work, rebuilt, reviewed and walked by the orchestrating agent;
  the lock was designed from a read of every write first. Phase 7 was the orchestrating agent
  alone, a batch at a time, each on Jamie's ruling.
- **What reached main with no ruling from Jamie:** the departures listed in each spec's "As
  built" section for phases 2 to 6. In phase 7 nothing did: each entry's line names his ruling.
- **Follow-ups:** the [follow-up log](followups.md) ends with no open entry and one carried.
  Seventeen seeds were added to the pool over the stage.
- **The next stage** is not decided. What may weigh on it: ADR-0040's count in Context Manager
  (4,752 lines there are still an app's; the count script is kept outside both repositories),
  and the seed on Context Manager adopting the runner.
- No token or cost figures were collected.
