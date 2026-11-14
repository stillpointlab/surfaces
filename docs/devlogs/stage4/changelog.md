# Stage 4: The Local Host for Files, Formats and Git Changelog

- **Dates:** 2026-11-13 –
- **Stage Tag:** TBD _(filled with `stage4-complete` at stage close)_

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

Phase 2's five specs moved to `stage4/phase2/specs/`, with four small amendments from reading
them against the repository, each dated in its spec:

- the package scaffold and its place in the tooling are the first commit of host-server's PR,
  so the first wave's three specs share no file;
- `GET /api/root` and `HostClient.root()`: the page keeps its open folders by root, and no route
  said which root it was;
- the tree asks for a menu on the empty space under its rows, which file-operations lists and
  the tree's events did not cover.
