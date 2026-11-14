---
column: todo
created: 2026-11-13T18:54:00-07:00
tags: [dev-tooling, code]
---

# Spec: undo and redo in the local host

_The [local host brief](../../../stage4/phase1/briefs/local_host.md), outcome 5. Stage 5, phase 5.
One PR here._

> Written with stage 4's specs, before any of stage 4 was built. Stage 5 opens by reading it
> again against what stage 4 made.

## High-level goal

What the host writes can be undone and done again: an app's op, and a file created, renamed or
deleted in the explorer. Undo never overwrites a change made since.

## Is it sound?

The brief asks this spec to say. It is, under three rules, each enforced below:

- **One writer keeps the journal.** Every write the host makes goes through one place in the
  server, so nothing it writes is missed.
- **Undo checks before it writes.** A file changed by anyone since the step (an editor save, a
  terminal, an agent) refuses the undo. The check is the port's `base`, which already exists.
- **The journal is memory, for the run.** It makes no promise across a restart, so it has no
  format to keep and nothing to repair.

What it does not give: undo of an editor's save (the editor has its own undo, and git shows the
change), or undo across a restart.

## Related context

- The brief's outcome 5 and Jamie's decisions: in the server's memory; generous limits on steps
  and on size; editor saves left out at first; a commit does not clear it.
- `StoragePort.put` with `PortChange` and `base`
  ([host-server](../../../stage4/phase2/specs/host-server.md)); staging of moves and deletes
  ([git-in-the-host](../../../stage4/phase1/specs/git-in-the-host.md)); the runner
  ([host-runner](host-runner.md)).

## Work package

- **Owns:** `packages/hosts/local/src/server/journal/`, its two routes, the `HostClient` methods
  and the explorer header's two buttons.
- **Changes:** where the server builds its port (the journal wraps it), and the delete dialog
  (one more question).
- **Runs alone.**

## Technical requirement

### The journal

A wrapper around the port, used for every write except an editor's save.

```ts
interface JournalStep {
  label: string; // "Delete notes.md", "Inventory: add-item"
  /** What undo writes. */
  inverse: PortChange[];
  /** What redo writes. */
  forward: PortChange[];
  /** Each touched path's version after the step (absent: no file). */
  after: Record<string, string | null>;
  bytes: number;
}
```

- Before a journaled `put`, the wrapper reads what it needs for the inverse: the old content
  for a `write` and a `delete`, the source for a `move`.
- **Inverses:** a `write` is a `write` of the old content; a `create` is a `delete`; a `move` is
  a `move` back, with the old content; a `delete` is a `create` with the old content.
- **What is journaled:** the runner's writes (one step per op), `createInstance`, and the
  explorer's create, rename and delete. `PUT /api/files` journals a request whose changes are
  all `create`, `move` or `delete`; a `write` there is an editor's save and is not.
- A new step clears the redo side.

### Limits

Two constants: 1,000 steps and 256 MiB of kept content. Past either, the oldest steps are
dropped.

A single step larger than the size limit cannot be kept:

- from the explorer, the server refuses it with `HOST_CANNOT_UNDO`, and the dialog asks: "This
  is too large to undo. Delete anyway?" (Delete, Cancel). The second request says so, and is
  written without a step;
- from an app's op, it is written without a step, and the reply's notice says the change cannot
  be undone.

Either way the journal is emptied, since an older step could no longer be undone in order.

### Undo and redo

`POST /api/undo` and `POST /api/redo`; `GET /api/journal` answers the two labels, or `null`.

1. Take the newest step. Nothing there: `HOST_NOTHING_TO_UNDO`.
2. Write its `inverse` in one `put`, each change with the step's `after` version as its `base`.
   A mismatch is `HOST_UNDO_CONFLICT`, with the file named; the step stays, and nothing is
   written.
3. Move the step to the redo side, with the versions the undo left.
4. Where the step's move or delete was staged, put the index back as well: after the inverse is
   written, `git reset -q -- <paths>` returns those paths' entries to `HEAD`.

Redo is the same with `forward`. Both writes are the server's own: the lock does not refuse
them, and they add no new step.

### In the page

- **Undo** and **Redo** buttons in the explorer's header, disabled with nothing to do, each
  with its step's label as the title ("Undo: Delete notes.md").
- Ctrl+Z and Ctrl+Shift+Z (Cmd on a Mac) act only when focus is outside an editor and outside a
  text field. Inside one, the key is the editor's.
- The server sends `{ type: 'journal' }` on its event stream when the labels change.
- After an undo, the page is brought up to date by the events it already handles: the list, the
  status, the open file and the open app.

## Clarifications

- **A commit does not clear the journal.** Undoing a committed step makes a new uncommitted
  change.
- **Index edge.** If a file had staged changes of the person's own before the host deleted it,
  undo restores the file's content and returns its index entry to `HEAD`, so those changes are
  kept but no longer staged.
- **Lock and unlock are not steps.** They change no file.
- **A refused undo is not retried.** The person sees which file moved on and decides.
- **The index step was tried** in a scratch repository (git on Fedora 44, 2026-11-13): after a
  staged delete and a staged move of edited files were undone and the paths reset, `git status`
  read as it had before. The tests here repeat it.

## Non-goals

- Undo of editor saves, of commits, or of anything written outside the host.
- A history panel, or undo of a chosen older step.
- Any journal in Context Manager.

## Acceptance / completion checklist

- [ ] Journal tests over the memory port: each inverse; redo after undo; a new step clearing
      redo; both limits; a step too large.
- [ ] Conflict tests: a file changed after the step refuses the undo, and nothing is written.
- [ ] Git tests over a temporary repository: undo of a staged move and of a staged delete leaves
      `git status` as it was before the step.
- [ ] Runner test: an op with several changes is one step, undone and redone whole.
- [ ] By hand: delete a folder and undo it; move a card on a board and undo it from the header.
- [ ] `npm run check` is green.

## Implementation plan

1. The journal wrapper and its tests.
2. The routes, the limits, and the index step.
3. The buttons, the keys and the delete dialog's question.
