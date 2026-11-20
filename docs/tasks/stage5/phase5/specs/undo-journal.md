---
column: done
pr: 128
completed: 2026-11-20
created: 2026-11-13T18:54:00-07:00
tags: [dev-tooling, code]
---

# Spec: undo and redo in the local host

_The [local host brief](../../../stage4/phase1/briefs/local_host.md), outcome 5. Stage 5, phase 5.
One PR here._

> Written with stage 4's specs, before any of stage 4 was built, and read again on 2026-11-14
> against what stage 4 made. The [review](../../phase1/reviews/specs-against-stage-4.md) lists what changed
> and why (H1, H2). It was read once more on 2026-11-14 against phases 2 to 4 as built. "What
> stage 4 built" and "What phases 2 to 4 built" are what an implementer reads first.

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
  port ([host-runner](../../phase2/specs/host-runner.md)); the lock
  ([apps-in-the-local-host](../../phase3/specs/apps-in-the-local-host.md)).

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

## What phases 2 to 4 built

_Added 2026-11-14, from the "As built" sections of
[host-runner](../../phase2/specs/host-runner.md),
[apps-in-the-local-host](../../phase3/specs/apps-in-the-local-host.md) and
[checkin-review](../../phase4/specs/checkin-review.md). Paths are under
`packages/hosts/local/src/`._

- **Where the host writes today:**
  - `PUT /api/files` in `server/host.ts`: the lock's check (`checkWrite`), then `port.put`;
  - an app's op: `POST /api/apps/op` in `server/apps/app-host.ts`, which runs `runOp` with the
    runner host `server/apps/facts.ts` makes. Its `port` is the node port. One op is one
    `put`;
  - a create: `POST /api/apps/create`, which runs `createInstance`: one `put`;
  - a commit, which writes no file.
- **A port in memory** (`createMemoryPort` in `@stillpointlab/common-format/host`) keeps the
  node port's rules, and one suite, `describeStoragePort` in
  `@stillpointlab/common-format/testing/host`, runs over both.
- **The op route answers `{ ok, reply, revision }`,** and the page's app pane shows the open
  app again when the host's `revision` moves. A file an undo writes moves it.
- **The host's own events** are a union in `shared/apps.ts`: `LocalHostEvent`, which is
  `HostEvent` and `{ type: 'apps' }`. The server finds the instances again when the watcher
  reports a listing or a manifest changed, so an undone create is seen with nothing more.
- **The request helpers and the status for a code** are in `server/respond.ts`.
- **The node port's git** (`server/git/repository.ts`, `HostGitAccess`) answers `start`,
  `info`, `changes`, `status` and `base`. Staging is inside the port's `put`.
- **The page** has one notice, which an app's reply or the page can write to, and the explorer's
  header holds the folder's name and the Commit button, which is disabled with nothing
  changed.
- **The delete dialog** is `client/file-ops/dialog.ts`, and `HostClient.put(changes)` is the
  page's one way to write.
- **The lock:** a write through `PUT /api/files` to a locked app's file is refused. The
  runner's writes are the server's own.

## Work package

- **Owns:** `server/journal/`, its three routes, the `HostClient` methods and the explorer
  header's two buttons.
- **Changes:** where the server builds its port (the journal wraps it), the runner host
  `server/apps/facts.ts` makes and the two app routes that write, the node port's git (two
  calls for index entries), `shared/apps.ts` (the event), `server/respond.ts` (the codes), the
  delete dialog (one more question), `HostClient.put`, and `PUT /api/files`.
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
- **How a writer names its step.** The journal answers a port for a label,
  `journal.port(label)`, which is a `StoragePort` whose `put` is one step. The op route makes
  its runner host with it for each op, and the create route for each create. A port so made
  passes the port suite: the journal changes nothing a writer can see.
- A new step clears the redo side.

### A step that cannot be kept

Two kinds:

- **Too large:** a step whose kept content is over the size limit.
- **Not text:** a `delete` of a file the port cannot read (`HOST_NOT_TEXT`, or over 2 MiB). A
  rename of such a file is kept, since its inverse carries no content. Jamie agreed on
  2026-11-14 (decision 1 of the review): it cannot be undone, and the host asks first.

Either is handled the same way:

- from the explorer, the server refuses it with `HOST_CANNOT_UNDO`, and the dialog asks. For
  size: "This is too large to undo. Delete anyway?" For a file that is not text (a draft): "An
  image or a large file is among these, and deleting it cannot be undone. Delete anyway?"
  (Delete, Cancel). The second request says so (`{ changes, unjournaled: true }`), and is
  written without a step;
- from an app's op, it is written without a step, and the op route's answer carries a `notice`
  beside the reply, which the app pane shows in the page's notice: the change cannot be
  undone.

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
  joins `LocalHostEvent` in `shared/apps.ts`.
- `HostClient` gains `journal()`, `undo()` and `redo()`, and `put` takes a second, optional
  argument for a write the person agreed cannot be undone.
- **The open file follows an undo** as it follows the explorer's write: the page hands the
  request to `FilePane.followWrite` with the paths the answer names, so a file renamed back
  keeps its element and its edits, and no banner shows for the page's own undo.
- Everything else is brought up to date by the events the page already handles: the list, the
  statuses, the apps found (an undone create is an instance gone), and the open app, whose
  revision moved.
- With an app open, the keys undo the app's last op, since focus is in neither an editor nor a
  text field. In an app's dialog with a field focused, they are the field's.

## As built

_2026-11-15, by an Opus 5.5 sub-agent; reviewed and checked by the orchestrating agent, who
looked at the screenshots. Where the work departed from the text above, this is the record. The
package's README has the routes in full._

**Server:**

- **`createJournal({ port, index?, … })`** answers `port(label)`, `write(changes)` for a write
  with no step, `undo()`, `redo()` and `labels()`. Every step, undo and redo goes through one
  queue, so a step's read and its write are never split by another of the journal's own.
- **`PUT /api/files`** takes `{ changes, unjournaled? }`. A call with a `write` in it is an
  editor's save and goes straight to the port.
- **`GET /api/journal`** answers `{ ok, undo, redo }`, each a label or `null`. **`POST
/api/undo`** and **`POST /api/redo`** answer `{ ok, label, moved, deleted }`: the paths the
  step's own write moved and deleted, for the page to follow.
- **An app's op and a create** answer a `notice`, `{ kind: 'cannot-undo', reason }`, when the
  step could not be kept. The create dialog does not show it yet.
- **Codes, all 409:** `HOST_NOTHING_TO_UNDO`, `HOST_NOTHING_TO_REDO` (the text above named
  only the first), `HOST_UNDO_CONFLICT` with the `path`, for a redo too, and `HOST_CANNOT_UNDO`
  with its `reason`, `too-large` or `not-text`.
- **A conflict's words:** "“`<label>`” cannot be undone: "`<path>`" changed since. Nothing was
  written." Or there is a file at the path now, or the path is gone.
- **The `journal` event** is sent on every change to the steps.
- **A step's `bytes`** counts the text of its inverse and of its forward changes.
- **Redo puts the index back too.** The redo side keeps the entries the undo's own deletes
  removed, so a created file the person staged, undone and done again, is staged again.
- **A write or a move with content of a file the port cannot read** is `not-text` as well; only
  an app's op can send one.
- **A file the server has no permission to read** is `not-text` too, since the
  [stage 5 review](../reviews/stage-5-code-review.md) (H3): its delete asks first, as an
  image's does. Before, the read threw and the route answered 500.
- **An undone delete brings back the file's mode, and a link's delete asks first** (the
  review's H2), since [undo-keeps-modes-and-links](undo-keeps-modes-and-links.md). Before it,
  a script came back without its executable bit and a link as a copy of its target's text.
- **The journal is emptied only when the unkept write lands.**
- **The labels are worded in the server** (`journal/labels.ts`): "Delete x.md", "Rename a.md to
  b.md", "Move a.md to docs", "Delete 3 files in notes", "Rename docs to notes", "Inventory:
  add-item", "Tasks: move-file", "Inventory: create".
- **The node port's git** has `indexEntries(paths)` and `restoreIndex(entries)`. The restore
  takes the port's write lock on its own, after the undo's `put`, so a commit could come
  between the two. A restore that fails is a warning.

**Page:**

- **The buttons are two glyphs, ↶ and ↷,** not the words: with the words the header cut the
  folder's name to a letter beside a Commit count. The title and the name are "Undo: `<label>`"
  and "Redo: `<label>`", or "Nothing to undo" and "Nothing to redo".
- **A notice after an undo or a redo,** "Undone: `<label>`" or "Redone: `<label>`", which the
  text above did not have: a key pressed in an app otherwise says nothing.
- **The keys take the physical Z** on a layout with no Latin letters, and the layout's own
  letter otherwise (the review's L3).
- **The labels are read again when the event stream reconnects** (the review's L1).
- **The keys are not the page's** when a dialog is open, a menu has the event, the file pane
  shows its editor and the event came from it, or the focused element is a text field.
- **An undo that deletes the open file while it has unsaved edits leaves it open,** under the
  "deleted on disk" banner, so the edits are not lost. A file with none closes.
- **The delete's second question** is a warning in the same dialog, with Delete as its button.
- **`FilePane.followWrite`** hands the write's answer to the function that says where a path
  went.

**By hand,** against the built server in Chromium, light and dark, in a scratch repository:

- a folder of text files deleted, undone from the header with `git status` empty again, and
  redone;
- a file open with unsaved edits renamed and the rename undone: the editor kept its edits
  under the old name, with no banner;
- Ctrl+Z in the md editor undoing text and no host step;
- a folder with an image: the question, Cancel leaving it, Delete writing it with no step and
  the journal emptied;
- a card moved to another column, undone from the header, by the key with focus on the page,
  and by the key with focus on a card's button, the board and the file following each time;
- a card moved to another phase and undone, `git status` empty;
- an inventory item added and undone; an inventory created from a folder's menu and undone,
  its row gone;
- a file changed from a shell after a step: the undo refused, the file named, nothing
  written, and working once the text was put back;
- a commit between a step and its undo: the undo is a new change.

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

- [x] The journal's port passes the port suite, over the memory port and over the node port.
- [x] Journal tests over the memory port: each inverse; redo after undo; a new step clearing
      redo; both limits; a step too large; a file changed between the wrapper's read and its
      write.
- [x] Conflict tests: a file changed after the step refuses the undo, and nothing is written.
- [x] Tests over a temporary folder: a delete of an image is refused with `HOST_CANNOT_UNDO`
      and written when asked again; a rename of an image is undone and redone.
- [x] Git tests over a temporary repository: undo of a staged move, of a deleted file with a
      staged edit and of a deleted staged new file leaves `git status` as it was before the
      step.
- [x] Runner test: an op with several changes is one step, undone and redone whole.
- [x] Page tests: the open file follows an undone rename and closes on an undone create, with
      no banner.
- [x] By hand, light and dark: delete a folder of text files and undo it; delete a folder with
      an image and see the question; move a card on a board and undo it from the header and
      with the key, and see the board follow; create an app and undo it.
- [x] `npm run check` is green.

## Implementation plan

1. The journal wrapper and its tests.
2. The routes, the limits, the step that cannot be kept, and the index.
3. The buttons, the keys and the delete dialog's question.
