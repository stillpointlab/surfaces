# Tasks

This repository's work is tracked here in the stage / phase / task shape Context Manager uses:
`tasks.yaml` configures the boards, `stage<N>/phase<M>/{briefs,specs,spikes,reviews,tests}/` hold
the cards, and `unassigned/` is the backlog pool ranked by `order.yaml`. Templates for each card
kind sit beside this file.

The flow is brief → spec → implement → review → merge: a human writes the brief, an agent writes
specs from it, implements, opens a PR, and a human reviews and squash-merges. The record at phase
and stage boundaries (changelog, reflections and the follow-up WAL) lives in
[`../devlogs/`](../devlogs/README.md), which arrived with stage 1's close.

The migration that created this repository (five editor repositories into one, then Context
Manager mounting it as one submodule) was tracked on Context Manager's boards, stage 5 phase 11,
and closed there on 2026-11-01. Phases here close the way Context Manager's do: cards to `done`,
the `current` pointer in `tasks.yaml` moved on, a `stage<N>-phase<M>-complete` tag on the last
merge of the phase, and the phase's section appended to the stage changelog. Stages close with the
devlogs and a `stage<N>-complete` tag; see [`../devlogs/`](../devlogs/README.md#milestones).
