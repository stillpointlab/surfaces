---
column: done
pr: 110
completed: 2026-11-14
created: 2026-11-14T19:50:00-07:00
tags: [apps, host-contract, dev-tooling, docs]
---

> A brief captures the _why_ and the desired outcome before any task breakdown exists. Keep it short
> — one page. Specs derived from it live in the sibling `specs/` folder, built from
> `spec.template.md`. The `column:` frontmatter above drives this file's card on the task board.

# Brief: the stage 5 sprint

_Drafted by the claude agent on 2026-11-14, at stage 5's setup. The why and the outcomes are the
[local host brief](../../../stage4/phase1/briefs/local_host.md)'s, which covers stages 4 and 5,
and nothing here changes them. This is what that brief could not hold: the order after the specs
were read against stage 4, and how the sprint runs, from how stage 4's ran._

## High-level goal

Stage 5 finishes the local host's first pass: a tasks or inventory manifest opens as its app,
check-in is one review, what the host writes can be undone, and Context Manager adopts what
moved. It lands the way stage 4 did, as one stack and one integration.

## Background

- The seven specs in [`../specs/`](../specs/) were written before stage 4 was built. The
  [review](../reviews/specs-against-stage-4.md) read them against it and amended each.
- Jamie's [stage 4 reflections](../../../../devlogs/stage4/reflections.md): Fable planning and
  then orchestrating Opus 5.5 sub-agents was effective, with ten and more PRs as one deliverable;
  one Context Manager integration at the stage's end meant less contention and less review; the
  walks are slow and heavy; next is to finish the plan for the server's first pass.

## Desired outcome

The local host brief's outcomes 3 to 6. In order:

| Phase | Wave | Spec                                                                   | PRs | Where           |
| ----- | ---- | ---------------------------------------------------------------------- | --- | --------------- |
| 2     | 1    | [app-module-grows](../../phase2/specs/app-module-grows.md)             | 2   | here            |
| 2     | 2    | [host-runner](../../phase2/specs/host-runner.md)                       | 1   | here            |
| 2     | 2    | [app-shells](../../phase2/specs/app-shells.md)                         | 2   | here            |
| 3     | 1    | [apps-in-the-local-host](../specs/apps-in-the-local-host.md)           | 2   | here            |
| 4     | 1    | [checkin-review](../specs/checkin-review.md)                           | 2   | here            |
| 5     | 1    | [undo-journal](../specs/undo-journal.md)                               | 1   | here            |
| 6     | 1    | [context-manager-adopts-apps](../specs/context-manager-adopts-apps.md) | 2   | Context Manager |

Ten PRs here, and two in Context Manager where the first draft had four. A spec
moves to its phase's folder when its phase opens.

## How the sprint runs

What stage 4 did, kept, and what it taught:

- **One spec is one work package and one sub-agent,** in a worktree of its own. Specs in the
  same wave run at the same time. An agent commits and never pushes.
- **The orchestrating agent** reads each result, runs `npm run check` from a clean tree, pushes,
  and opens the PR on top of the one before it. New files are added before the tree is cleaned.
- **Every spec gets its "As built" section** when its PR is up, and the next spec is read
  against it before its agent starts. In stage 4 every agent found something its spec had
  wrong by trying it, and this is where that was caught.
- **The stack is not merged piece by piece.** CI runs only on a PR to `main`, so one draft PR
  of the stack's tip gives the whole stack's CI run, and is closed. Jamie merges.
- **By-hand items** are done by driving Chromium with a script, and the orchestrating agent
  repeats the main path at the stack's tip.
- **Context Manager is not touched until everything here is on `main`.** Then the pin alone and
  the adoption, in the `context-manager-surfaces` clone.
- **Walks:** both suites at the pin and at the tip of each Context Manager PR, never the two at
  once, and not while another CI run is on the machine. Each round needs Jamie's go-ahead, for
  the database reset and the pushes to the scratch repository.
- **Phases close as stage 4's did:** cards done, the changelog's section, the tag, the pointer,
  and the session's transcript backed up.

## Constraints

- The local host brief's constraints stand.
- Nothing merges without Jamie, and no agent starts a spec before this phase closes.
- A decision of Jamie's that a spec waits on is settled before that spec's agent starts, not
  before the sprint does.

## Open questions

Jamie answered the review's [five decisions](../reviews/specs-against-stage-4.md#decisions-for-jamie)
on 2026-11-14: a deleted image cannot be undone and the host asks first; Context Manager's
adoption is two PRs; an app's facts come from a `fromChanges` member of its module; the md
editor's save is fixed ahead of the sprint, in
[#111](https://github.com/stillpointlab/surfaces/pull/111).

The work on Context Manager's preview pages is a seed in its own pool (context-manager#1199),
and not part of this sprint.
