---
column: in-progress
created: 2026-11-18T19:30:00-07:00
tags: [apps, host-contract, dev-tooling, code]
---

# Stage 5 Code Review — 2026-11-18

> Jamie asked for a code review of stage 5 before it merges, with bugs fixed in a new pull
> request and anything larger written up as a spike, brief or spec. This is that review, by the
> claude agent that orchestrated the stage.

Scope: the stage 5 stack at its tip, `feat/undo-journal` (`1f3edce`), against `main` (`5639b02`):
pull requests #113 to #128, 170 files, 21,270 lines added and 1,858 removed. Two passes:

- **A read of the whole diff** by a second claude agent with none of the build's context, asked
  for correctness bugs. It returned seven findings. Each was then reproduced against the built
  server or in a failing test before anything was changed. None was dropped.
- **A pass by hand** in Chromium against the built server, over a scratch repository holding
  every format, two inventories, a small tasks board and a copy of this repository's own board:
  each format opened and saved; an inventory item added and checked in; a card moved, created
  and checked in on a new branch; undo and redo of each, and of every step in a run on this
  repository's board back to a clean `git status`; a delete and its undo; an inventory created
  from a folder's menu; "Show files…" and an edit by hand; a file changed on disk under an open
  app, under an undo and under unsaved edits; a phase and a stage closed and undone.

Not reviewed: stage 4's code where stage 5 did not change it, Context Manager, and the designs
the specs settled. The format packages' own tests were run, not re-read.

Overall / Verdict: the stage holds together. The flows a person would try first all work, the
journal's undo and redo returned a real board to a clean tree and back, and the conflict and
unsaved-edit guards behaved under every external change tried. The worst findings are High, not
Critical: nothing loses a person's text. Three are worth knowing before a merge. The tasks strip
keeps showing the old pointer after "Set current" in the local host (H1, fixed). An undone delete
brings a script back without its executable bit and a symbolic link back as a copy of its target
(H2, a spec). A file the server cannot read could no longer be deleted from the explorer (H3,
fixed). The single takeaway: the pane's "the reply already showed this revision" shortcut is
right for a board and wrong for whatever sits beside it, and any new shell part outside the
board should be checked against it.

> **Resolution status (2026-11-18):** H1, H3, L1, L2, L3 and L4 are fixed in the pull request
> that adds this review ([#131](https://github.com/stillpointlab/surfaces/pull/131), stacked on #128), each with a test that
> fails without its fix. H2 is the spec
> [undo-keeps-modes-and-links](../specs/undo-keeps-modes-and-links.md), not yet built. M1 is the
> seed [a-tasks-page-whose-phase-is-gone](../../../unassigned/seeds/a-tasks-page-whose-phase-is-gone.md).
> The observations under [For Jamie](#for-jamie) changed nothing.

---

## High

### H1. "Set current" leaves the strip on the old pointer in the local host

- **Where:** `packages/hosts/local/src/client/apps/app-pane.ts`, `answer` and the
  `reload-request` listener.
- **What:** after an app's op the pane stamps the op's revision as the one it has shown, so that
  the write's own event does not set the shell's state a second time. The tasks strip's "Set
  current" answers `{}`, then raises `reload-request` to show the new pointer. The page read came
  back at the stamped revision and the pane returned before `setState`. A close whose next phase
  is the page on screen did the same through `navigate`.
- **Impact:** the star stays on the old phase, "Set current" is still offered and "Close…" still
  names the old pointer, until Refresh or a navigation. The file is right; the page is not.
  Reproduced in Chromium.
- **Fix (done):** a shell that asks for its page again is given it: `reload-request`, and a
  `navigate` to the address on screen, clear what the pane holds as shown before the read.

### H2. An undone delete does not bring back a file's mode, or a symbolic link

- **Where:** `packages/hosts/local/src/server/journal/journal.ts`, `plan`: a delete's inverse is
  a `create` holding the text alone.
- **What:** the node port's create writes a regular file with the default mode. A `755` script
  comes back `644`. A link comes back as a regular file with its target's text. The index entry
  the journal restores still says `100755` or `120000`.
- **Impact:** `git status` shows a mode or type change after delete and undo, which the
  undo-journal spec says it will not, and the script no longer runs. Reproduced against the
  built server. In a repository `git checkout` puts it right; outside one the mode is lost.
- **Fix (a spec):** the storage port's changes are text only, and that contract is shared, so
  the mode needs a second capability beside git's index, and a link needs the "cannot be undone"
  question. Both are choices, so this is
  [undo-keeps-modes-and-links](../specs/undo-keeps-modes-and-links.md) and not a patch.

### H3. A file the server cannot read can no longer be deleted from the explorer

- **Where:** `journal.ts`, `plan`: `port.get` throws for an open error other than a missing file.
- **What:** the journal reads a file before its delete. With no permission to read it the read
  threw, and `PUT /api/files` answered 500, "The host could not answer", where stage 4 deleted
  it without reading.
- **Impact:** a `000` file, or a folder holding one, could not be deleted at all, and the dialog
  never reached "Delete anyway". Reproduced against the built server.
- **Fix (done):** a read that throws is a file that cannot be kept (`not-text`), so the explorer
  asks first and an app's op is written with the notice. Whether the write itself is allowed
  stays the port's to say.

## Medium

### M1. A tasks address for a phase that is gone is a live board

Found by hand. `…/stage/9/phase/9` renders an empty board with working create buttons, and a card
made there lands in a phase nothing points at. The rule is Context Manager's, kept on purpose, so
it is not a stage 5 defect. What stage 5 adds is undo: "+ stage", then Undo, leaves the page on
the stage that no longer exists. It is a seed,
[a-tasks-page-whose-phase-is-gone](../../../unassigned/seeds/a-tasks-page-whose-phase-is-gone.md),
because the answer (redirect, message, or follow the undo) is a choice for both hosts.

## Low / Hygiene

- **L1 — Undo and Redo keep stale labels after the event stream reconnects** (`host-client.ts`,
  `watch`): a restarted server has no steps, and the page kept offering the old one. Fixed: a
  reconnection says the journal is stale as well as the list.
- **L2 — Two quick clicks on Commit open the review twice** (`commit/review.ts`, `open`): the
  guard was set after the first read, so the second call replaced the first's resolver and
  rebuilt the form. Fixed: one open at a time from the first click.
- **L3 — Ctrl+Z and Ctrl+S do nothing on a layout with no Latin letters** (`page.ts`): the keys
  matched the typed character. Fixed: the physical key when the layout types no Latin letter,
  the layout's own letter otherwise, so Dvorak keeps its Z. The Ctrl+S half is stage 4's.
- **L4 — A malformed create, move or delete answered 500, not 400** (`host.ts`, `writeFiles`):
  the step's label read `path` and `from` before the port checked the shape. Fixed: a change
  the label cannot read goes to the port, which refuses it.

## For Jamie

Seen by hand; opinions and rulings, so nothing was changed.

- **Two task boards both read "Tasks" in the explorer.** An inventory's row has its manifest's
  name; a tasks manifest has none, so `plan/` and `docs/tasks/` are the same word and the
  folder's own name is hidden.
- **The undo labels for an app's op are the op's id:** "Tasks: move", "Inventory: add-item",
  "Tasks: create-stage-phase". The explorer's are sentences ("Delete gamma.md").
- **A new card's row in the check-in review says "content edited".** It is Context Manager's
  label. The local host knows the file is new.
- **The page's notice stays until dismissed or replaced,** so "Committed 3a3ff8e on main." sits
  above later, unrelated steps.
- **A zone with a parse error squeezes its name** to "c.." beside the error's one long line
  (the inventory element, from stage 2).
- Still open from the build: whether a moved zone is dirty in inventory's `fromChanges`, the
  create dialog's "repository", and "Create an inventory here…".

Known and already a seed: an image a markdown file names by a relative path is asked of `/`
([markdown-relative-links](../../../unassigned/seeds/markdown-relative-links.md)).

---

## Task list

### P0 — fixed with this review

- [x] **H1:** the pane shows a page again when its shell asks.
- [x] **H3:** an unreadable file's delete asks first.
- [x] **L1, L2, L3, L4.**

### P1 — before or soon after the merge, Jamie's call

- [ ] **H2:** [undo-keeps-modes-and-links](../specs/undo-keeps-modes-and-links.md).

### P2 — the pool

- [ ] **M1:** the seed, when the tasks page is next touched.

## Tests that lock the fixes in

- `apps/apps.test.ts`: the shell is set again on `reload-request` at a stamped revision, and on a
  `navigate` to the page on screen.
- `journal/journal.test.ts`: a port whose read throws; refused to the explorer, written for an op.
- `journal/host.test.ts`: four malformed changes answer 400 with no step; a `000` file's delete
  is refused with `HOST_CANNOT_UNDO`, then written when asked again.
- `host-client.test.ts`: a reconnection sends `listed`, then `journal`.
- `undo.test.ts`: Ctrl+Z with a Russian layout undoes; with Dvorak's semicolon it does not.
- `commit/commit.test.ts`: a second `open` during the first's read opens nothing, and the first
  still settles.
