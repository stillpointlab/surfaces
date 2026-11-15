---
column: todo
created: 2026-11-13T18:54:00-07:00
tags: [dev-tooling, code]
---

# Spec: undo and redo in the local host

_The [local host brief](../../../stage4/phase1/briefs/local_host.md), outcome 5. Stage 5, phase 5.
One PR here._

> Written with stage 4's specs, before any of stage 4 was built, and read again on 2026-11-14
> against what stage 4 made. The [review](../reviews/specs-against-stage-4.md) lists what changed
> and why (H1, H2). "What stage 4 built" is what an implementer reads first.

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
change), undo across a restart, or undo of a deleted file the port cannot read (below).

## Related context

- The brief's outcome 5 and Jamie's decisions: in the server's memory; generous limits on steps
  and on size; editor saves left out at first; a commit does not clear it.
- `StoragePort.put` with `PortChange` and `base`
  ([host-server](../../../stage4/phase2/specs/host-server.md)); staging of moves and deletes
  ([git-in-the-host](../../../stage4/phase3/specs/git-in-the-host.md)); the runner and the memory
  port ([host-runner](host-runner.md)); the lock
  ([apps-in-the-local-host](apps-in-the-local-host.md)).

## What stage 4 built

_Added 2026-11-14. Paths are under `packages/hosts/local/src/`._

- **The port is text.** `get` answers text of at most 2 MiB, and a `write` or `create` carries
  a string. An image, or a larger file, cannot be read into the journal or written back from
  it. A `move` without `content` keeps the file's bytes, and it is what the explorer's rename
  sends.
- **`put` answers the new version of each path it wrote,** takes one call at a time, and takes
  a path once per call. A `put` and a commit share one write lock.
- **The port stages its own moves and deletes** after a `put` lands (`server/git/stage.ts`): a
  move takes the old path's index entry to the new path, and a delete removes the entry, with
  `git update-index --index-info`. It never runs `git add`. A staging that fails is a warning,
  not a refusal.
- **The explorer's writes** (`client/file-ops/`): a new file is one `create`; a rename is one
  `move` without `content` per file; a delete is one `delete` per file; a folder's are all in
  one `put`. Only the open file's change carries a `base`.
- **The open file follows the page's own write** through `FilePane.followWrite`: it moves with
  a rename and closes on a delete, and the event for the write raises no banner.
- **The watcher** sends `status` when git's index moves, so the marks follow a restored index
  with nothing more.
- **The explorer's header** holds the folder's name and the Commit button.

## Work package

- **Owns:** `server/journal/`, its three routes, the `HostClient` methods and the explorer
  header's two buttons.
- **Changes:** where the server builds its port (the journal wraps it), the node port's git
  (two calls for index entries), the delete dialog (one more question), and `PUT /api/files`.
- **Runs alone.**

## Technical requirement

### The journal

A wrapper around the port, used for every write except an editor's save. It is written against
`StoragePort` and one optional capability, the index, so its own tests run over the memory port.

```ts
interface JournalStep {
  label: string; // "Delete notes.md", "Inventory: add-item"
  /** What undo writes. */
  inverse: PortChange[];
  /** What redo writes. */
  forward: PortChange[];
  /** Each touched path's version after the step (absent: no file). */
  after: Record<string, string | null>;
  /** The index entries the step's deletes removed, for undo to put back. */
  index?: IndexEntry[];
  bytes: number;
}

/** What the journal needs of git's index. The node port's git supplies it. */
interface JournalIndex {
  entries(paths: readonly string[]): Promise<IndexEntry[]>;
  restore(entries: readonly IndexEntry[]): Promise<void>;
}
```

- **Before a journaled `put`,** the wrapper reads what the inverse needs: the old content for a
  `write`, a `delete` and a `move` that carries content, and the index entries of the paths it
  deletes.
- **It names what it read.** A change the caller gave no `base` gets the version the wrapper
  read, so a file that changed between the read and the write refuses the step instead of
  leaving a wrong inverse.
- **Inverses:**
  - a `write` is a `write` of the old content;
  - a `create` is a `delete`;
  - a `move` without `content` is a `move` back without `content`;
  - a `move` with `content` is a `move` back with the old content;
  - a `delete` is a `create` with the old content.
- **`after`** comes from the `put`'s answer.
- **`bytes`** is the size, as UTF-8, of the content the step keeps.
- **What is journaled:** the runner's writes (one step per op, labelled "`<app's label>`: `<op
type>`"), `createInstance`, and the explorer's create, rename and delete. `PUT /api/files`
  journals a request whose changes are all `create`, `move` or `delete`, and the server words
  its label from the changes; a `write` there is an editor's save and is not journaled. The
  order in the route is the lock's check, then the journal, then the port.
- A new step clears the redo side.

### A step that cannot be kept

Two kinds:

- **Too large:** a step whose kept content is over the size limit.
- **Not text:** a `delete` of a file the port cannot read (`HOST_NOT_TEXT`, or over 2 MiB). A
  rename of such a file is kept, since its inverse carries no content. This is the agent's
  reading of what stage 4's port allows; keeping bytes instead is decision 1 of the review.

Either is handled the same way:

- from the explorer, the server refuses it with `HOST_CANNOT_UNDO`, and the dialog asks. For
  size: "This is too large to undo. Delete anyway?" For a file that is not text (a draft): "An
  image or a large file is among these, and deleting it cannot be undone. Delete anyway?"
  (Delete, Cancel). The second request says so (`{ changes, unjournaled: true }`), and is
  written without a step;
- from an app's op, it is written without a step, and the reply's notice says the change cannot
  be undone.

Either way the journal is emptied, since an older step could no longer be undone in order.

### Limits

Two constants: 1,000 steps and 256 MiB of kept content. Past either, the oldest steps are
dropped.

### Undo and redo

`POST /api/undo` and `POST /api/redo`; `GET /api/journal` answers the two labels, or `null`.

1. Take the newest step. Nothing there: `HOST_NOTHING_TO_UNDO`.
2. Write its `inverse` in one `put`, each change with the step's `after` version as its `base`;
   a `create` needs none, since a path that exists refuses it. A mismatch
   (`HOST_FILE_CHANGED`, `HOST_PATH_EXISTS`, `HOST_FILE_NOT_FOUND`) is `HOST_UNDO_CONFLICT`, with
   the file named; the step stays, and nothing is written.
3. Put the index back. A move needs nothing: the `put` moved the file back, and the port moved
   its index entry with it. For each delete undone, `index.restore` puts back the entries the
   step kept, with the command staging uses.
4. Move the step to the redo side, with the versions the undo left.
5. Answer the label, and the paths the undo moved and deleted.

Redo is the same with `forward`, and its deletes are staged by the port as any delete is. Both
writes are the server's own: the lock does not refuse them, and they add no new step.

### In the page

- **Undo** and **Redo** buttons in the explorer's header, disabled with nothing to do, each
  with its step's label as the title ("Undo: Delete notes.md").
- Ctrl+Z and Ctrl+Shift+Z (Cmd on a Mac) act only when focus is outside an editor and outside a
  text field; `deepActiveElement` in `menu/menu.ts` finds the focused element inside a shadow
  root. Inside an editor, the key is the editor's.
- The server sends `{ type: 'journal' }` on its event stream when the labels change. The event
  is the local host's own, in the union beside `HostEvent` that the apps' event started.
- **The open file follows an undo** as it follows the explorer's write: the page hands the
  request to `FilePane.followWrite` with the paths the answer names, so a file renamed back
  keeps its element and its edits, and no banner shows for the page's own undo.
- Everything else is brought up to date by the events the page already handles: the list, the
  statuses, and the open app, whose revision changed.

## Clarifications

- **A commit does not clear the journal.** Undoing a committed step makes a new uncommitted
  change.
- **Branches need nothing.** A commit on a new branch leaves every file as it was, so each step
  still holds. A switch made in a terminal changes files, and the `base` check refuses the undo
  of a step over one it changed. Stage 4's follow-up log asked both questions.
- **The index comes back as it was.** A file with a staged edit of the person's own, or a new
  file they had staged, is deleted by the host and restored: the entry the step kept goes back,
  so the edit is staged again. Tried in a scratch repository (git 2.56, 2026-11-14): after a
  move of a file with an unstaged edit, and deletes of a file with a staged edit and of a
  staged new file, undo left `git status` reading exactly as before. `git reset` on the paths,
  which the first draft named, unstaged the edit and left the new file untracked. The tests
  here repeat it.
- **A file git does not track** has no index entry to keep, and none to put back.
- **Lock and unlock are not steps.** They change no file.
- **A refused undo is not retried.** The person sees which file moved on and decides.

## Non-goals

- Undo of editor saves, of commits, or of anything written outside the host.
- A history panel, or undo of a chosen older step.
- Returning a file to the last commit. That is the seed
  [revert a changed file](../../../unassigned/seeds/revert-a-changed-file.md).
- Any journal in Context Manager.

## Acceptance / completion checklist

- [ ] Journal tests over the memory port: each inverse; redo after undo; a new step clearing
      redo; both limits; a step too large; a file changed between the wrapper's read and its
      write.
- [ ] Conflict tests: a file changed after the step refuses the undo, and nothing is written.
- [ ] Tests over a temporary folder: a delete of an image is refused with `HOST_CANNOT_UNDO`
      and written when asked again; a rename of an image is undone and redone.
- [ ] Git tests over a temporary repository: undo of a staged move, of a deleted file with a
      staged edit and of a deleted staged new file leaves `git status` as it was before the
      step.
- [ ] Runner test: an op with several changes is one step, undone and redone whole.
- [ ] Page tests: the open file follows an undone rename and closes on an undone create, with
      no banner.
- [ ] By hand: delete a folder of text files and undo it; delete a folder with an image and see
      the question; move a card on a board and undo it from the header.
- [ ] `npm run check` is green.

## Implementation plan

1. The journal wrapper and its tests.
2. The routes, the limits, the step that cannot be kept, and the index.
3. The buttons, the keys and the delete dialog's question.
