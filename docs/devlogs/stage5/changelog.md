# Stage 5: The Apps in the Local Host Changelog

- **Dates:** 2026-11-14 –
- **Stage Tag:** TBD _(filled with `stage5-complete` at stage close)_

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
