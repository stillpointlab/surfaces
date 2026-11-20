---
created: 2026-11-18T19:20:00-07:00
tags: [apps, polish, code]
---

# A tasks page whose phase is gone

From the [stage 5 code review](../../stage5/phase5/reviews/stage-5-code-review.md), found by hand
in the local host.

A tasks address for a stage or phase the board does not have shows a live, empty board:
`#/app/plan/tasks.yaml/stage/9/phase/9` renders the strip with no stage chosen, three empty
columns and working "+ New spec" buttons. Creating a card there writes
`plan/stage9/phase9/specs/<card>.md`, a card in a phase nothing points at.

This is the rule Context Manager's page had, kept on purpose in `packages/apps/tasks/src/pages.ts`
("a phase the nav does not have still shows, as an empty board at the path the convention gives
it: a gap between phases stays reachable"), and a phase with no folders is still a board to the
core (`synthesizeBoardForPath`), since a stage made with "+ stage" is only the `current:` pointer
until it holds a card.

What is new in stage 5 is how easily a person lands there:

- **Undo.** "+ stage" goes to the new stage's page. Undo takes the pointer back, and the page
  stays on the stage that no longer exists, with its create buttons live.
- **"+ stage", then "Close stage".** The empty stage leaves the strip the moment the pointer
  moves on, because the pointer was all there was of it.
- A link kept from before a close, or the browser's Back.

What a spec would have to settle (the claude agent's list, not Jamie's):

- whether a page for a phase that is not in the nav and is not the pointer's should be the
  landing (a redirect), a "there is no stage 9" message, or the empty board without its create
  buttons;
- whether the page should follow an undo off a board the undo removed, as the file pane follows
  an undone create;
- whether an empty stage should exist on disk (a `.gitkeep`, which `fromChanges` already counts
  as housekeeping) so that it outlives the pointer;
- Context Manager's page has the same rule and no undo: whether the two hosts change together.
