# Stage 4: The Local Host for Files, Formats and Git Changelog

- **Dates:** 2026-11-12 – 2026-11-14
- **Stage Tag:** `stage4-complete` _(created on the merge of the stage close PR)_

> Agent-drafted from evidence (merged PRs, git history, task cards). Appended per phase at phase
> close. Regenerable at any time; see [devlogs](../README.md). Reflections do NOT belong here — they
> go in `reflections.md`.

> The stage's theme is the [local host brief](../../tasks/stage4/phase1/briefs/local_host.md):
> `surfaces <path>` serves a folder, so the formats and apps run in a host of their own with
> nothing from Context Manager. The brief covers two stages. Stage 4 builds the host for files,
> formats and git, and ends with Context Manager adopting the format registry. Stage 5 puts the
> apps in it. Phase 1 holds the spikes, the brief and the specs; the work runs in phases 2–4.

---

## Phase 1: The spikes, the brief and the specs (`stage4-phase1-complete`)

Range: `stage3-complete..stage4-phase1-complete` (`e1db06c..25fdc7c`), 2026-11-12 – 2026-11-13:
three merges, 18 files, +2,835/−10. No code changed.

### Shipped

- Jamie's stage 3 reflections ([#86](https://github.com/stillpointlab/surfaces/pull/86)).
- Two spikes and the brief ([#87](https://github.com/stillpointlab/surfaces/pull/87)):
  - the [local host spike](../../tasks/stage4/phase1/spikes/local-host.md): what a second host
    needs that only Context Manager has today (which format opens a path, the pages around the
    app elements, the check-in review, the bounds on an op), and what keeps a desktop shell a
    wrapper;
  - the [host file tree spike](../../tasks/stage4/phase1/spikes/host-file-tree.md): the host
    gets a small tree of its own, and Context Manager's trees and context picker stay as they
    are;
  - the [local host brief](../../tasks/stage4/phase1/briefs/local_host.md), with six rounds of
    Jamie's decisions.
- Thirteen specs, split over two stages
  ([#88](https://github.com/stillpointlab/surfaces/pull/88)): seven for stage 4 and six drafts
  for stage 5, each written as one work package (what it owns, what it must not change, what it
  can run beside).

### Decisions

All Jamie's, 2026-11-13, recorded in the brief:

- The next step is a second host, not a third app, and the aim is independence from Context
  Manager, not a line count.
- The host lives in `packages/hosts/local` with the `bin` `surfaces`. The core runs in the
  server, and the server is a library first, so a desktop shell stays a wrapper.
- A format descriptor is data and one `apply` the format supplies.
- Git by shelling out to the installed `git`. Moves and deletes are staged. Everything GitHub is
  deferred.
- An app's scope is locked for writes by default, in the local host and in Context Manager.
- Undo's journal is in the server's memory, with limits on steps and size.
- Two stages, not one, each ending with Context Manager adopting what it moved.
- The specs are implemented by Opus 5.5 sub-agents, with the claude agent orchestrating.

### Testing & review

- Docs only. The staging and commit commands in the git spec were tried in a scratch repository
  before the spec was written.

### Deferred

- Nothing new in the [follow-up log](followups.md).

### At the phase's opening

Phase 2's five specs moved to `stage4/phase2/specs/`, with three small amendments from reading
them against the repository, each dated in its spec:

- the package scaffold and its place in the tooling are the first commit of host-server's PR,
  so the first wave's three specs share no file;
- `GET /api/root` and `HostClient.root()`: the page keeps its open folders by root, and no route
  said which root it was;
- the tree asks for a menu on the empty space under its rows, which file-operations lists and
  the tree's events did not cover.

---

## Phase 2: The host for files and formats (`stage4-phase2-complete`)

Range: `stage4-phase1-complete..stage4-phase2-complete` (`25fdc7c..4735fd8`), 2026-11-13 –
2026-11-14: seven pull requests, 141 files, +12,196/−137. The seven were a stack, each on the one
before, and reached main in one merge with phase 3's (`c574c5d`), so the phase's tag is on its
last commit and not on a merge.

### Shipped

- Phase 1 closed and phase 2 opened ([#89](https://github.com/stillpointlab/surfaces/pull/89)).
- The server ([#91](https://github.com/stillpointlab/surfaces/pull/91);
  [spec](../../tasks/stage4/phase2/specs/host-server.md)): the package
  `packages/hosts/local` and its place in the tooling; `@stillpointlab/common-format/host` with
  the storage port's types; the Node port (list, get, an all-or-nothing `put`, confinement to
  the served root); `createHost` over the web's `Request` and `Response`; the watcher; the
  `surfaces` command and `npm run serve`.
- The explorer's tree, `<host-file-tree>`
  ([#92](https://github.com/stillpointlab/surfaces/pull/92);
  [spec](../../tasks/stage4/phase2/specs/explorer-tree.md)): rows from a flat list of nodes,
  keys, marks that roll up to folders, a locked app row, and events for select, activate, toggle
  and menu.
- Format descriptors and the registry
  ([#93](https://github.com/stillpointlab/surfaces/pull/93);
  [spec](../../tasks/stage4/phase2/specs/format-descriptors.md)): `common-format/format`, a
  `./format` entry in each of the five format packages, `describeFormatDescriptor` in the
  conformance suite, and the harness mounting every format through its descriptor.
- The page ([#94](https://github.com/stillpointlab/surfaces/pull/94);
  [spec](../../tasks/stage4/phase2/specs/host-page.md)): one `HostClient`, the tree and the
  pane, the address in the fragment, Preview and Edit, save with a base version, the
  changed-on-disk flow, sanitized markdown, a content security policy, the static build and
  development mode.
- Create, rename and delete in the explorer
  ([#96](https://github.com/stillpointlab/surfaces/pull/96);
  [spec](../../tasks/stage4/phase2/specs/file-operations.md)): a menu, three dialogs, a folder's
  rename or delete as one `put`, and the open file following its own move.
- Each spec's "As built" section, the phase's follow-ups, and the git spec read against what
  was built ([#97](https://github.com/stillpointlab/surfaces/pull/97)).

### Decisions

Jamie has not ruled on these. They are the agents' calls, each recorded in its spec's "As
built" section, and Jamie merged the stack on 2026-11-14.

- The first wave's three specs ran at once and the two later ones alone, each by an Opus 5.5
  sub-agent in a worktree of its own. The orchestrating agent reviewed each, ran the checks from
  a clean tree and opened the pull requests.
- Splitting is on in the five format packages, so a descriptor's `load()` is the package's own
  `./preview` or `./editor` entry and an element is never defined twice. Every built entry
  changed shape.
- The watcher is one watch per folder, not a recursive one, which on Linux stops reporting a
  file that was replaced by a rename.
- A `move` may carry no content, so a file that is not text can be renamed.
- The sanitizer is DOMPurify. The page's policy allows scripts from its own origin alone and
  inline styles, which the elements write into their shadow roots.
- The tree's keys move from the selected row, as Context Manager's trees do.

### Testing & review

- `npm run check` passed from a clean tree at each level of the stack: 2,149, 2,184, 2,334,
  2,423 and 2,494 tests.
- Each agent drove its work in Chromium with a script, in light and dark. The orchestrating
  agent looked at a sample of the screenshots.
- CI runs on pull requests to main only, so the stack's own pull requests had none. The whole
  stack ran through CI once on a draft pull request (#101, closed unmerged), and again on main
  after the merge.

### Deferred

- Eighteen entries in the [follow-up log](followups.md), among them: the format template has no
  `./format` entry; the code editor's highlighting is dark on dark; relative links and images
  in a markdown file are not found; a path with bad text is answered as "outside the served
  folder".

### At the phase's opening and close

- Opening: the three amendments listed under phase 1.
- Close: the git spec moved to `stage4/phase3/specs/` with a section on what phase 2 built: the
  `GET /api/changes` route it needs, `watchNames`, what a failed staging does to a `put`, and
  where the page takes a view, a button and a notice.

---

## Phase 3: Git in the host (`stage4-phase3-complete`)

Range: `stage4-phase2-complete..stage4-phase3-complete` (`4735fd8..c574c5d`), 2026-11-14: three
pull requests, 36 files, +5,129/−147. `c574c5d` is the merge that brought phases 2 and 3 to main.

### Shipped

- Status, the Changes view and staging
  ([#98](https://github.com/stillpointlab/surfaces/pull/98);
  [spec](../../tasks/stage4/phase3/specs/git-in-the-host.md), step 1): the three states
  (`repository`, `no-repository`, `no-git`); `GET /api/git`, `/api/changes` and `/api/base`; a
  `status` event from watches on `HEAD` and the index; marks in the tree; a diff against the
  last commit at `#/diff/<path>`; the host's own moves and deletes staged.
- Commit ([#99](https://github.com/stillpointlab/surfaces/pull/99); step 2):
  `POST /api/commit` for chosen paths on the current branch or a new one, its refusals, the
  Commit button, the dialog and the notice.
- The spec's "As built" section, eight more follow-ups, and the Context Manager adoption spec
  read against the stage ([#100](https://github.com/stillpointlab/surfaces/pull/100)).

Two fixes found on the way went to main beside the stack:

- generated styles carry no byte order mark, which had broken the first rule of a style sheet
  ([#90](https://github.com/stillpointlab/surfaces/pull/90));
- `<modal-dialog>` with `close-on-overlay-click` closes on a click on the scrim only, not on
  any click inside it ([#95](https://github.com/stillpointlab/surfaces/pull/95)).

### Decisions

As in phase 2, these are the agents' calls, recorded in the spec's "As built" section.

- Staging moves the index entry, as `git mv` does, in place of the spec's `git add -A`. The
  spec's command staged a heavily edited moved file as a deletion and an addition, and failed
  on an ignored target and an untracked source.
- The commit is `git commit --only` over the chosen paths, with no `git add` first. Paths go
  to git on stdin and the message in a file.
- A conflicted path is refused whether or not a merge is in progress.
- A commit that fails on a new branch is undone, and a commit and a `put` share one write lock.

### Testing & review

- `npm run check` passed from a clean tree at both steps: 2,572 and 2,628 tests.
- The orchestrating agent repeated two of the three failures of the spec's staging command in
  a scratch repository before accepting the change.
- Both agents drove the work in Chromium with a script. The orchestrating agent ran one pass
  of its own at the stack's tip: an edit, the mark, the Changes view and a commit, read back
  with `git log`.
- CI passed on main at `c574c5d`.

### Deferred

- Ten more entries in the [follow-up log](followups.md). The one that matters most: the md
  editor's save reflows a file (lines joined, the final newline gone), and the editor now
  writes files on disk.

### At the phase's close

The [adoption spec](../../tasks/stage4/phase4/specs/context-manager-adopts-formats.md) moved to
`stage4/phase4/specs/` with a section on what stage 4 built: check the client build and both
walk suites on the new pin alone first, because every built entry changed shape; the order a
host registers the formats in; the two paths that class differently; and the image types the
descriptor does not carry.

---

## Phase 4: Context Manager adopts the format registry (`stage4-phase4-complete`)

Range: `stage4-phase3-complete..stage4-phase4-complete`, 2026-11-14. Here: two fixes that reached
main beside the stack (#90 and #95, listed under phase 3), a build fix, a seed, and two close
PRs. The phase's code is one Context Manager PR, context-manager#1186 (29 files, +1,194/−573
against its pin commit).

### Shipped

- Context Manager asks the registry which format opens a file and how to mount it
  (context-manager#1186;
  [spec](../../tasks/stage4/phase4/specs/context-manager-adopts-formats.md)): one table from its
  path kinds and stored content types to the formats; `classifyRepoFilePath` over the registry;
  the good page and the project page's preview pane mounting through each descriptor's `load`
  and `apply`; 84 lines of extension tables gone; ADR-0009 amended. Its first commit is the pin
  alone, past the change to every format package's build.
- The md package's `./editor` entry exports nothing from the engine
  ([#103](https://github.com/stillpointlab/surfaces/pull/103)). Jamie saw a warning from the
  local host's build: the entry exported the schema, the parser and the serializer statically,
  so the editor's lazy import of them deferred nothing. The md editor's chunk in the local host
  went from 160 kB to 46 kB.
- Phases 2 and 3 closed ([#104](https://github.com/stillpointlab/surfaces/pull/104)).
- A seed for a revert option on a changed file
  ([#105](https://github.com/stillpointlab/surfaces/pull/105)), from Jamie's first pass over
  the local host.

### Decisions

- Jamie, 2026-11-14: he merged the stage's stack himself; the adoption's walks, `e2e:reset` and
  scratch pushes were approved; the work runs to the stage's close, and stage 5 is revisited
  with him before it starts.
- Jamie tried the local host on `.md`, `.ts`, `.sheet` and `.csv` files and found it working.
  A revert option for a changed file is the one thing he asked for; it is a seed, since neither
  stage 4's git spec nor stage 5's undo journal covers it.
- The agents' calls in the adoption, recorded in the spec's "As built" section and open to
  Jamie's ruling: a good's path takes the extension its content type fixes; the public and
  library previews and claim review were left as they are.

### Testing & review

- Tests here: 2,628 → 2,632 (three for `<modal-dialog>`, one for the md entry).
- Context Manager: the packages build, typecheck, lint and all 4,852 tests pass.
- **Walks for context-manager#1186**, after a full build and `e2e:reset`, run twice: on the pin
  alone and on the adoption. Each time inventory was 38/38 and tasks walks 01–27 and 29 passed
  on the first try.
- The walks open no code, sheet or image file. The orchestrating agent drove the adoption build
  in Chromium: the preview pane on markdown, JSON, YAML, CSV, `.sheet` and unknown text, and
  the good page on a file of each of the first five kinds linked from the repository. An XMDL
  file, an image, the public previews and a rename of a code good were not driven.
- The transcript for phases 2 and 3 was backed up at their close. This phase's is backed up at
  the stage's close.

### Deferred

- Two entries in the [follow-up log](followups.md): `apply` cannot give a path's attributes
  without content, and the Context Manager pages the adoption did not move. Three more are in
  Context Manager's own log.

---

## Stage totals

- `e1db06c..RANGE_END` (`stage3-complete` to the last merge before the close): COMMITS commits,
  MERGES of them merges on `main`, FILES files, +ADDED/−REMOVED. PRS.
- Code and tooling: 136 files, +16,774/−89. The local host is a new package,
  `packages/hosts/local`: about 7,600 lines of source without its tests and styles.
- Tests: 1,978 at stage 3's close to 2,632.
- Context Manager carried the adoption in one PR, context-manager#1186, walked twice.
- **How the work was done:** seven specs, each one work package. Eight Opus 5.5 sub-agent runs
  implemented them (the git spec took two, and the adoption one), each in a worktree or clone
  of its own, committing and never pushing. The orchestrating agent reviewed each, ran the
  checks from a clean tree, integrated the stack, and wrote the closes.
- **What reached main with no ruling from Jamie:** the departures listed in each spec's "As
  built" section. He merged the stack and tried the host by hand; the calls stay open to him.
- **Follow-ups:** 30 entries in the [follow-up log](followups.md), reviewed when stage 5 is set
  up. The one that changes what a person's files look like: the md editor's save reflows a file.
- **Stage 5** (apps, check-in and undo in the local host) has six draft specs in
  `stage5/phase1/specs/`. They are read against what stage 4 built before any of them starts,
  and Jamie revisits the stage first.
- No token or cost figures were collected.
