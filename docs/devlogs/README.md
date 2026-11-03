# Devlogs

The record at phase and stage boundaries, kept the way Context Manager keeps its own
(`docs/process/milestones.md` there). The goal is an honest record without documentation becoming a
tax.

## Stage artifacts

Each stage has three documents under `stage<N>/`:

- **`changelog.md`**: the mechanical record of what shipped, the decisions made and the testing
  done. Drafted by an agent from evidence (merged PRs, git history, task cards) and regenerable at
  any time; nothing in it should exist only in a human's head. See the
  [changelog template](changelog.template.md).
- **`reflections.md`**: the human-led record of challenges, learnings and process observations,
  written by Jamie at stage close. Agents review it and may propose attributed notes for its
  agent-observations section, but never draft or rewrite its prose. See the
  [reflections template](reflections.template.md).
- **`followups.md`**: the follow-up WAL, below.

## Changelog cadence

At each phase close an agent appends that phase's section, ranged from the previous milestone tag
(the prior phase's tag, or `stage<N-1>-complete` for phase 1) to the new phase tag. Stage 1's
changelog was written whole at stage close, since the devlogs arrived with it.

## Follow-up WAL

A write-ahead log of things knowingly deferred: bugs accepted for now, rough edges, testing gaps,
docs that need reconciling, debt noticed in passing. Humans and agents append a short dated bullet at
the moment of deferral, with no triage, estimate or owner. The next stage's setup reviews the
previous stage's WAL: each entry is promoted to a card, carried forward, or dropped, and struck
through with where it went.

Context Manager follow-ups (pin moves, host adoption) stay in Context Manager's own WAL; this one
holds what is deferred in this repository.

## Milestones

- Phase close: cards to `done`, the `current` pointer in `../tasks/tasks.yaml` moved on, the
  `stage<N>-phase<M>-complete` tag on the phase's last merge, the phase's changelog section.
- Stage close: the changelog covers every phase and names the stage tag; `reflections.md` written;
  the devlog PR reviewed and merged; then `stage<N>-complete` tagged on that merge and pushed. The
  next stage opens with its board and reviews the WAL.
