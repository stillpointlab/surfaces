# Tasks

This repository's work is tracked here in the stage / phase / task shape Context Manager uses:
`tasks.yaml` configures the boards, `stage<N>/phase<M>/{briefs,specs,spikes,reviews,tests}/` hold
the cards, and `unassigned/` is the backlog pool ranked by `order.yaml`. Templates for each card
kind sit beside this file.

The flow is brief → spec → implement → review → merge: a human writes the brief, an agent writes
specs from it, implements, opens a PR, and a human reviews and squash-merges. Devlogs and the
follow-up WAL will arrive with the first stage close.

The migration that created this repository (five editor repositories into one, then Context
Manager mounting it as one submodule) is tracked on Context Manager's boards, stage 5 phase 11,
until it completes.
