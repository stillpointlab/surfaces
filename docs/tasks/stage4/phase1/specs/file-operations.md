---
column: todo
created: 2026-11-13T18:38:00-07:00
tags: [dev-tooling, code]
---

# Spec: create, rename and delete in the explorer

_The [local host brief](../briefs/local_host.md), outcome 1. Stage 4, phase 2, third wave: after
[host-page](host-page.md). One PR here._

## High-level goal

A person creates a file, renames or moves one, and deletes one, from a menu on a row in the
explorer. The tree only asks for the menu. The host owns the menu, the dialogs and the writes.

## Related context

- The brief's constraint "The tree holds its line", and the tree spike's "Decided since" note.
- `<host-file-tree>`'s `tree-menu` event ([explorer-tree](explorer-tree.md)); `HostClient.put`
  with `PortChange` ([host-server](host-server.md), [host-page](host-page.md)).
- The tasks board's `open-options-menu` request (`packages/apps/tasks/src/element/task-board.ts`):
  the same menu will answer it in
  [apps-in-the-local-host](../../../stage5/phase1/specs/apps-in-the-local-host.md).

## Work package

- **Owns:** `packages/hosts/local/src/client/menu/` (the host's one options menu) and
  `src/client/file-ops/` (the dialogs and the writes).
- **Changes:** the page's wiring, to listen for `tree-menu`.
- **Does not change:** the tree, the port or the routes.

## Technical requirement

### The menu

One menu element for the page, positioned at the point a request gives, closed by Escape, a
click outside, or a choice. It takes a list of `{ label, action, danger? }` and is keyboard
operable (Up, Down, Enter). It is page chrome: built with `html` and `render`, with no
dependency on Context Manager's `options-menu`.

| Row                            | Entries                     |
| ------------------------------ | --------------------------- |
| a file                         | Rename…, Delete…            |
| a folder                       | New file…, Rename…, Delete… |
| the empty space under the rows | New file…                   |

### The dialogs

Each is a `<modal-dialog>` with one field or one message, and Enter confirms.

- **New file.** A path field, starting with the folder's path and a slash. Confirm sends a
  `create` with empty content, then opens the file in its editor.
- **Rename.** A path field holding the current path, with the name selected. Confirm sends a
  `move`. Changing the folder part moves the file. Renaming a folder sends one `move` per file
  under it, in one `put`, so it is all or nothing.
- **Delete.** "Delete `<name>`?" for a file, and "Delete `<name>` and the `<n>` files in it?" for
  a folder (Delete, Cancel). Confirm sends one `delete` per file in one `put`.

A path is checked before it is sent: not empty, no `..`, no leading slash, not an existing path.
The message sits under the field. A refusal from the server shows in the same place, with the
server's message.

### After a write

- The tree reads the list again and reveals the new path.
- **The open file was renamed:** the pane follows it to the new path, keeping unsaved edits.
- **The open file was deleted:** the pane closes. If it had unsaved edits, the delete dialog says
  so first: "`<name>` has unsaved edits. Delete it anyway?"
- Every `move` and `delete` carries the file's version as its `base` when the page holds one (the
  open file). Other files are sent without a base.

## Clarifications

- **A new folder** is made by creating a file inside it. Empty folders are not listed
  ([host-server](host-server.md)), so there is no "New folder".
- **Moves are not staged here.** Staging a move or a delete is
  [git-in-the-host](git-in-the-host.md), which changes the server's `put`, not this page.
- **An app's scope** is not special yet. The lock arrives with
  [apps-in-the-local-host](../../../stage5/phase1/specs/apps-in-the-local-host.md).
- **Nothing is undone here.** [undo-journal](../../../stage5/phase1/specs/undo-journal.md) adds
  that under the same writes.

## Non-goals

Rename in place, drag and drop, several rows at once, copy and paste, duplicate, and a trash
folder.

## Acceptance / completion checklist

- [ ] Tests with a fake `HostClient`: each dialog's happy path, each path check, a server
      refusal, a folder rename and a folder delete as one `put`.
- [ ] The open file follows a rename, and closes on a delete, with the unsaved-edits warning.
- [ ] The menu works by mouse and by keyboard, and closes on Escape and on an outside click.
- [ ] By hand: create, rename, move and delete in a served folder, and see each on disk.
- [ ] `npm run check` is green.

## Implementation plan

1. The menu element and its tests.
2. The three dialogs with the path checks.
3. The page's wiring: the tree's request, the writes, and the pane following the open file.
