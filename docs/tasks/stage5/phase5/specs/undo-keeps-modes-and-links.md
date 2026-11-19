---
column: in-progress
created: 2026-11-18T19:25:00-07:00
tags: [dev-tooling, code]
---

# Spec: an undone delete brings back the file it deleted

_From the [stage 5 code review](../reviews/stage-5-code-review.md), finding H2. A follow-up to
[undo and redo in the local host](undo-journal.md). One PR here._

## High-level goal

Undoing a delete in the local host leaves the folder as it was before the delete. Today the file
comes back as plain text with the default mode: a script loses its executable bit, and a symbolic
link comes back as a regular file holding its target's text. `git status` shows both as changed,
so the undo-journal spec's "undo leaves `git status` as it was" does not hold for them.

## Related context

- Follow-up to: [undo-journal](undo-journal.md), "The journal" and "A step that cannot be kept".
- Main files: `packages/hosts/local/src/server/journal/journal.ts` (`plan`, `undo`),
  `packages/hosts/local/src/server/port.ts` (the node port; `temp` already takes a mode, and a
  `write` and a `move` already keep the file's), `packages/hosts/local/src/shared/journal.ts`
  (`UnkeptReason`), the page's words for a delete that cannot be undone.
- The storage port's changes are text only (`PortChange` in `packages/common/src/host/`). That
  contract is shared with Context Manager and the memory port, and this spec does not change it.

## What happens today

Reproduced on 2026-11-18 against the built server, in a repository:

| Deleted from the explorer, then undone | Before             | After                                |
| -------------------------------------- | ------------------ | ------------------------------------ |
| `scripts/run.sh`, mode 755             | `100755`           | `100644`; git: "mode change"         |
| `scripts/link.md` → `../notes/beta.md` | `120000`, the link | `100644`, a copy of `beta.md`'s text |

The inverse of a `delete` is a `create` with the text the journal read, and the node port's create
writes with no mode. The index entry the journal puts back still says `100755` or `120000`, so the
difference shows as an unstaged change. A `write`, a `move` and a rename keep the mode already,
and a rename keeps a link.

## Technical requirement

Two parts. The first is the fix; the second is the honest answer where the first cannot reach.

### 1. The mode comes back

- The journal takes one more optional capability beside git's index, in the same shape: what the
  node port knows of a file that a `StoragePort` does not say.

  ```ts
  export interface JournalFiles {
    /** A file's permission bits, `'link'` for a symbolic link, or `null` when there is no file. */
    kind(path: string): Promise<number | 'link' | null>;
    /** Set a file's permission bits. */
    setMode(path: string, mode: number): Promise<void>;
  }
  ```

- Before a step with a `delete`, the journal asks `kind` for each deleted path and keeps the
  modes in the step (`modes?: Record<string, number>`), as it keeps the index entries.
- After an undo's `put` lands, it sets the mode of each file the inverse created, before it puts
  the index back. A `setMode` that fails is a warning, as a failed index restore is: the text is
  back either way.
- A redo of the delete needs nothing. An undo after that redo reads the step's modes again.
- The node port supplies the capability (`lstat` on the entry, inside the root's confinement, and
  `chmod` under its write lock). The memory port has none, and the journal's tests over it are
  unchanged.

### 2. A link's delete asks first

- A delete of a symbolic link cannot be kept: the port has no change that makes a link, and
  bringing back a copy of the target's text is the bug. `UnkeptReason` gains `'link'`.
- From the explorer it is refused with `HOST_CANNOT_UNDO` and `reason: 'link'`, and the delete
  dialog asks its second question, as it does for an image. Draft words: "`<name>` is a link, so
  deleting it cannot be undone. Delete anyway?"
- From an app's op it is written with no step and the notice says so. Draft: "This change removed
  a link, so it cannot be undone."
- A link inside a deleted folder makes the whole delete ask, as an image inside one does.

## Clarifications

- Only the permission bits are kept, not the owner or the times. The host runs as the person, so
  the owner is theirs either way.
- A `move` with content and a `write` are unchanged: the port keeps the mode through both.
- Outside a repository the mode is kept the same way; nothing here needs git.

## Non-goals

- Making a link again on undo. That needs a change the storage port does not have, and a rule
  for a link that leads out of the served folder.
- Any change to `PortChange` or to Context Manager.
- Directories' modes. A folder the delete emptied is made again by the create, with the default
  mode.

## Decision

Jamie, 2026-11-18: build it as recommended. The mode is kept, and only a link's delete asks. The
alternative was to keep no mode and ask before an executable's delete as well.

## Acceptance / completion checklist

- [x] Delete and undo of a `755` file leaves `git status` empty, in a repository and with the
      mode intact outside one.
- [x] Undo after a redo of that delete does the same.
- [x] A link's delete from the explorer asks; Cancel writes nothing; Delete removes the link, with
      no step, and the journal empties.
- [x] A folder holding a link asks once for the whole delete.
- [x] An app's op that deletes a link is written, and the notice says it cannot be undone.
- [x] The journal's tests over the memory port pass unchanged; the new ones run over a temporary
      folder (`journal/host.test.ts`).
- [x] The undo-journal spec's As built and the package's README say what is kept.

## Implementation plan

1. `JournalFiles` in `journal.ts`; `plan` reads the kinds of deleted paths; the step keeps the
   modes; `undo` sets them.
2. The node port's `files` capability; `host.ts` passes it with the index.
3. `'link'` in `UnkeptReason`, the refusal's message, the page's two sets of words.
4. Tests, then the docs.

## As built

_2026-11-18, by the claude agent, in [#132](https://github.com/stillpointlab/surfaces/pull/132), stacked on the review's._

- **`JournalFiles`** is `{ kind(path), setMode(path, mode) }`, as above, and the node port's
  `files` supplies it. `kind` reads the name itself (`lstat`), inside the port's confinement.
  `setMode` runs under the write lock, warns when it fails, and does nothing when a link stands at
  the path by then.
- **Every deleted file's bits are kept,** not only an executable's: a `600` file comes back `600`.
  A step with no capability, or whose `kind` could not say, keeps none and undoes as before.
- **The link is asked about before the read,** so a link to an image, or one that leads nowhere,
  is `link` and not `not-text`.
- **The words** follow the image's, which speak of a folder's files: "A link is among these, and
  deleting it cannot be undone. Delete anyway?", and for an app's op "This change removed a link,
  so it cannot be undone." The draft above named the file.
- **The refusal's message** is "`<path>` is a symbolic link, so deleting it cannot be undone.
  Send it again with "unjournaled": true to write it anyway."
- **Not built, as the non-goals say:** a `move` with content of a link (only an app's op sends
  one) still leaves a regular file at the new path, and its undo a regular file at the old one.

**Checked** over a temporary folder and repository (`journal/host.test.ts`): a `755` script
deleted, undone, done again and undone, with `git status` empty each time; `750` and `600` kept
outside a repository; a link's delete refused, then removing the link alone; a folder holding a
link asking once; a renamed link still a link after the undo. And by hand against the built
server.
