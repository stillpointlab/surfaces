---
column: todo
created: 2026-11-22T20:20:00-07:00
tags: [local-host, apps]
---

# Local Host Release Walk (local)

> The walk of the built local host that the
> [stage 5 release review](../../stage5/phase7/reviews/stage-5-release-review.md) did by hand,
> kept as a card so it is run again at each stage's close (Jamie, 2026-11-22). It covers what a
> person does every day and the ordinary ways each goes wrong. It does not replace the unit
> suite, which holds the edge cases. A walk is one copy of this card in the closing phase's
> `tests/` folder, ticked as it goes; this one stays in the pool unticked.

Background: the local host's [README](../../../../packages/hosts/local/README.md), and the review
above for what each part once found.

## Setup (once)

- [ ] `npm ci && npm run build`, then `node packages/hosts/local/bin/surfaces.js <folder>`: the
      built page with its content security policy, not the dev mode. Open the address it
      prints, with its `?token=`.
- [ ] `<folder>` is a scratch git repository holding: three markdown notes; a CRLF file; a file
      with no final newline; a markdown file with links whose text is code, a table, a bare URL
      and an autolink; a code file; a `.csv`; an image; a `755` script; two inventories; a tasks
      board with a pool (a copy of this repository's `docs/tasks` at `docs/tasks` serves).
- [ ] Chromium, by hand or driven by Playwright. Driver scripts stay in scratch: the repository
      keeps no walk of the host (its browser tests are packages' unit tests, section 0).
- [ ] Nothing here touches a remote but section 0's run: no push, no pull request.

## 0. Every package's browser tests

- [ ] CI run by hand on `main` at the stage's last commit (`gh workflow run CI --ref main`, or
      Actions → CI → Run workflow; it starts a run on GitHub, so Jamie starts it or says to) →
      the `browser` job ran every package's browser tests and passed. A pull request runs only
      those of the packages it changes; this is where a change to `common` or the tooling meets
      them all. Run: `<link>`; `browser` job: `<time>`.

---

## 1. Hostile names and content

- [ ] A file and a folder named as markup (`<img onerror>`, `<svg onload>`); markdown holding
      script, handlers, `javascript:` links, an iframe, a form and a remote image; a card and an
      item with markup in every field; an SVG with script; a branch named as markup. Open every
      view, the row's menu, the rename and delete dialogs, the commit review, the notice, and
      `/api/raw` as a page → no script runs, no policy violation, no request leaves the origin.
- [ ] A repository's `.js` asked for through `/api/raw` by a `<script>` added from the console →
      refused (403), and nothing runs.

## 2. Files

- [ ] One word typed in the rich view of each markdown fixture and in the code file, saved →
      only the edited block changes; CRLF and a missing final newline are kept; a link whose
      text is code is still a link; an autolink's address is as written.
- [ ] A change on disk under unsaved edits → the banner; Save asks "Save anyway"; Cancel keeps
      both; leaving asks; closing the tab is held.
- [ ] New file, Rename and Delete from a row's menu, by pointer and by keyboard → each lands,
      and the open file follows a rename with its edits.
- [ ] "Delete…" chosen with Enter held down, on a text file and on an image → nothing is
      deleted; the question is open with the focus on Cancel.
- [ ] A link in the folder to `.git/config`, opened and saved → refused, and git's config is as
      it was.

## 3. Undo and redo

- [ ] A rename under unsaved edits, undone, then saved; a create undone under unsaved text; an
      undo of a file changed since → edits follow the file both ways; the conflict is refused
      with nothing written.
- [ ] Two folders deleted (the CRLF file, the one with no final newline, the script), undone,
      redone, undone → bytes, mode `755` and a clean `git status` come back.
- [ ] Ctrl+Z inside an editor → the editor's own undo, not the page's.

## 4. Inventory

- [ ] A zone added; an item added, edited and deleted in a YAML file with comments and flow
      lists; all undone, redone, undone → only the named lines change; a clean tree after undo.
- [ ] A check-in beside a stray change elsewhere → only the inventory's paths are committed.

## 5. Tasks

- [ ] A card moved, created, retitled with quotes and a `#`, tagged, sent to the pool; "+ stage";
      Set current; all undone, redone, undone → a clean tree after undo, the same tree after
      redo.
- [ ] A pool card moved onto the board → the count says two changes, and the review lists the
      move and the pool's order file.
- [ ] A card sent to the pool, then a new card of the same name made on the board → the new card
      shows, the review has a row for each, and checking in one commits that one.

## 6. Commit

- [ ] The explorer's commit with one of three rows unchecked, one of them staged → only the
      chosen paths are committed; the staged file stays staged.
- [ ] `git switch -c elsewhere` in a terminal while the review is open, then Commit → refused,
      with both branches named and nothing committed.
- [ ] A new branch from the review → the commit is on it and the page says so.
- [ ] A `pre-commit` hook that leaves a child running (`(sleep 30 &)`) → the commit answers at
      once, and so does a save sent after it.

## 7. The lock and create

- [ ] A write into a locked app's files by `fetch`; Show files…; the same write; Lock files →
      refused `HOST_SCOPE_LOCKED`, allowed, refused again. The same write through a link to the
      app's folder → refused.
- [ ] An inventory created in a new folder; a task project inside another app; one in a folder
      that already holds files; undone → created; refused; created, and the dialog said the
      files would sit behind the app's row; undone to nothing.
- [ ] Escape, Cancel and the close button pressed while a create runs → the dialog stays until
      the create lands.
- [ ] A reload at `#/edit/<a locked app's file>` → the preview with the locked line, never the
      editor.

## 8. Staying current

- [ ] Eight tabs on the one host → each lists its rows and opens a file.
- [ ] A tab left hidden while a file changes on disk, then shown → it shows the change.
- [ ] `git rebase` or a checkout that removes and makes a folder again, then an edit and a new
      file in it → the open file and the tree follow.

## 9. No repository

- [ ] A folder with no git: a save, an item added, undone → no commit button, no Changes view,
      no check-in bar; the rest works.
- [ ] A folder its repository ignores, served by itself → its files are listed, the server said
      at its start that it is served without git, and the page shows nothing of git.

## 10. Who the host answers

- [ ] The address without the token, in a browser that has no cookie for it (a private window)
      → refused (403) with "Open the address the `surfaces` command printed in its terminal.",
      and nothing about the folder.
- [ ] `curl -i http://127.0.0.1:<port>/api/list` without the token → 403
      `HOST_TOKEN_REQUIRED`; with `-H "Authorization: Bearer <token>"` → the list.
- [ ] A second tab opened at the address without the token → it loads, lists its rows and opens
      a file.
- [ ] A page left open while the server is stopped and started again → "This page’s server was
      started again. Open the address its terminal printed." stays, with no close button;
      Undo, Redo and Commit are disabled; the event stream is not tried again (the network
      panel); the new printed address opens.

---

## Sign-off

- [ ] All sections pass, or every failure is a bullet in the stage's
      `docs/devlogs/stage<N>/followups.md` before the walk is called done.
