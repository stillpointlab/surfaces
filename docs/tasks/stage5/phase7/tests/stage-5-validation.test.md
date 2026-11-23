---
column: todo
created: 2026-11-23T10:26:00-07:00
tags: [local-host, apps]
---

# Stage 5 Validation (local)

> Jamie's own validation of stage 5, the last step before the stage's tag
> ([milestones](../../../../devlogs/README.md#milestones)). About fifteen minutes by hand. It
> touches what the stage added once each: an app created and opened from its manifest, one
> check-in review, undo, and the lock. Every step was driven in Chromium against the built host
> on 2026-11-23 before the card was handed over. It is not the
> [release walk](../../../unassigned/tests/local-host-release-walk.test.md), which holds the ways
> each goes wrong.

## Setup (once)

- [X] In this repository, on `main`: `npm ci && npm run build`.
- [X] A scratch repository with one note in it:

  ```sh
  mkdir ~/s5 && cd ~/s5 && git init -q
  printf '# Notes\n\nA first paragraph.\n\nA second paragraph, with [`code`](https://example.com) as a link.\n' > notes.md
  git add -A && git commit -qm start
  ```
- [X] `node packages/hosts/local/bin/surfaces.js ~/s5`, and open the address it prints. Nothing here touches a remote.

---

## 1. A file, saved as it was

- [X] Open `notes.md`, choose Edit, add a word to the first paragraph, Save → Changes is offered beside Preview and Edit, and shows that one line. The second paragraph's link is still a link.

## 2. An app, created and used

- [X] Right-click the empty space under the rows → "Create a task project here…", folder `board`, Create → the board opens, and the explorer shows one row for the app in the folder's place.
- [X] "+ New task", give it a title, Create; then the card's menu → "Move to In progress" → the card carries a dot, and the bar counts the uncommitted changes beside "Check in".
- [X] "Create an inventory here…" in a folder `stock`, with a name; add a zone, open it, and add an item → a bar says how many files have local changes.

## 3. Undo and redo

- [X] Undo (the explorer's button, or Ctrl+Z outside a field) twice → the item, then the zone, are gone, each named in the notice. Redo twice (the button, or Ctrl+Y) → both are back.
- [X] "Delete…" on `notes.md`'s row menu → the question opens with the focus on Cancel. Delete, then Undo → the file is back as it was.

## 4. One check-in review

- [x] On the board, "Check in" → the review lists the board's files alone, not `notes.md` or the inventory's. Untick one, give a summary, Commit → the notice names the commit and the branch, and the unticked file is still a change.
- [X] The explorer's Commit button, which shows the count → the same review over everything left. Choose "On a new branch", name it, Commit → the notice names the new branch, the button is disabled at nothing left, and `git log --oneline --all` in a terminal shows both commits.

## 5. The lock

- [X] The inventory's row menu → "Show files…", confirmed → its files are rows. Open one, edit and save it → saved. The row menu → "Lock files" → the rows are gone again.
- [X] Edit the address to `#/edit/stock/inventory.yaml` and reload → the file opens in its preview, with a line saying whose file it is.

## 6. Staying current

- [X] In a terminal, `echo more >> ~/s5/notes.md` → the open page shows the change without a reload.
- [X] Open the page in eight tabs of one window → each lists its rows and opens a file.

---

## Sign-off

- [X] Every step passes, or each failure is a bullet in [the stage's follow-up log](../../../../devlogs/stage5/followups.md).
