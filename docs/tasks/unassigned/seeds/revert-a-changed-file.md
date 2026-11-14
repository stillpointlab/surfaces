---
created: 2026-11-14T16:10:00-07:00
tags: [dev-tooling, feature, code]
---

# Revert a changed file in the local host

Jamie, 2026-11-14, after trying the local host on `.md`, `.ts`, `.sheet` and `.csv` files: a
modified file needs a revert option, for example in the row's right-click menu.

Where it stands:

- Stage 4's [git spec](../../stage4/phase3/specs/git-in-the-host.md) lists "discard a change"
  among its non-goals, so the host can mark a change, show its diff and commit it, and cannot
  take it back.
- Stage 5's [undo journal](../../stage5/phase1/specs/undo-journal.md) undoes steps the host
  itself made. It does not return a file to the last commit.

What a spec would have to settle (the claude agent's list, not Jamie's):

- what revert means for each status: `changed` goes back to the `HEAD` text; `moved` goes back
  to its old path; `new` has nothing to go back to; `deleted` comes back, and has no row in the
  tree today, so it needs a place to be offered;
- the confirmation, since the change is lost, and the open file's unsaved edits with it;
- whether a revert is a step in the undo journal, which would make it recoverable;
- a folder's row: revert everything under it, or nothing.
