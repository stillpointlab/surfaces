---
column: done
created: 2026-11-22T19:32:14-07:00
tags: [apps, host-contract, dev-tooling, code]
---

# Stage 5 Release Review — 2026-11-22

> Jamie asked for a code review of everything stage 5 added to the local host and the dev
> harness, as a new review card, looking for what would block a release, and then for a walk of
> the local server as well. This is both, by the claude agent that orchestrated the stage. It
> changes no code.

Scope: `main` at `d9dc42d` against the tag `stage4-complete`: 278 files, 30,449 lines added and
3,095 removed. That is the local host (`packages/hosts/local`, 9,800 lines), the two apps, the
shared contract and runner in `common`, `<checkin-review>`, `<modal-dialog>`, the markdown save
path, and the harness. Stage 4's code was read where stage 5 runs on it, and four findings below
are in it; they are marked. Three passes:

- **Five readers, one area each,** with none of the build's context and the same brief: the
  server, the page, the contract with the runner and the shared components, the two apps, and
  the formats. Each was told what counts (lost or wrongly written files, a security hole, a
  crash or a hang, a regression for Context Manager) and what is already known (the follow-up
  log, the pool, the first review). Each returned "no blocker" and a short list.
- **Every finding checked again** before it was written here: against the built server with
  `curl`, in Chromium against the built server, or against the source. What was not run in a
  browser says so.
- **A walk by hand** in Chromium over the built server and a scratch repository
  ([below](#the-walk)).

Not reviewed: Context Manager itself, macOS and Windows behaviour, the development mode beyond a
read, and pointer drag on the board.

Overall / Verdict: **nothing here is Critical, and the worst findings are High.** No way was
found for another web origin to read or write anything, for a hostile file name, markdown file,
card or item to run script in the page, for a path to leave the served folder, or for a save, an
undo, a redo or a commit to lose text across the walk. The journal brought back bytes, line
endings, modes and git's index every time. Five things are worth fixing or ruling on before a
release. One held Enter on "Delete…" deletes a file with no question seen, and an image for good
(H1). Six tabs on one host freeze all of them (H2). Any other program or account on the machine
can read the served folder, and with one forged header write to it and run a commit (H3, a
stage 4 ruling that deserves a second look). The watcher stops hearing a folder that an ordinary
`git rebase` removed and made again (H4). An edit beside a link whose text is code writes the
link away (H5, older than stage 5 and in Context Manager today). The single takeaway: the
defences that were designed (the request checks, confinement, bases, the journal) held under
everything tried; what was found sits where two ordinary things meet, a key that repeats, a
browser's connection limit, a hook that leaves a child, a link inside the folder.

For a **Context Manager release** of the pin `452cba4`: nothing found is a reason to hold it.
What reaches Context Manager is either older than stage 5 (H5, M9), already in production since
the adoption's release (M8, M10, M12), or not a regression (M2).

---

## The walk

Chromium (Playwright, headless) against `node packages/hosts/local/bin/surfaces.js <folder>`, the
built page with its content security policy, over a scratch repository: three markdown notes, a
CRLF file, a file with no final newline, a markdown file with most of the syntax, code, a
`.csv`, an image, a `755` script, two inventories and a tasks board. Driver scripts stay in
scratch, as the repository keeps no browser suite.

| Part                      | What was done                                                                                                                                                                                                                                                                                                                                                                                         | Result                                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hostile names and content | A file and a folder named as an `<img onerror>` and an `<svg onload>`; markdown holding script, handlers, `javascript:` links, an iframe, a form, a fixed overlay, a remote image; a card and an item with markup in every field; an SVG with script; a branch named as markup. Every view, the row's menu, the rename and delete dialogs, the commit review, the notice, `/api/raw` opened as a page | No script ran, no policy violation, no live element from any of it, no request left the origin                                                                         |
| Saving                    | One word typed in the rich view of each markdown fixture, and in a `.ts` file; saved                                                                                                                                                                                                                                                                                                                  | Only the edited block changed; CRLF and a missing final newline kept. The edited block is reflowed (a known limit)                                                     |
| Unsaved edits             | A change on disk under edits; Save; Cancel; leaving; closing the tab                                                                                                                                                                                                                                                                                                                                  | Banner, then "Save anyway" asked; Cancel kept both; leaving asked; the tab close was held                                                                              |
| Undo and redo             | A rename under unsaved edits, undone, then saved; a create undone under unsaved text; an undo of a file changed since; two folders deleted (CRLF, no final newline, the script), undone, redone, undone; Ctrl+Z inside an editor                                                                                                                                                                      | Edits followed the file both ways; the conflict was refused with nothing written; bytes, mode `755` and a clean `git status` came back; the editor kept its own Ctrl+Z |
| Inventory                 | Zone added, item added, edited and deleted in a YAML file with comments and flow lists; undone, redone, undone                                                                                                                                                                                                                                                                                        | Only the named lines changed; clean tree after undo                                                                                                                    |
| Tasks                     | Card moved, created, retitled with quotes and a `#`, tagged, sent to the pool; "+ stage"; Set current; all undone, redone, undone                                                                                                                                                                                                                                                                     | Clean tree after undo, the same tree after redo                                                                                                                        |
| Check-in and commit       | An inventory check-in beside a stray change elsewhere; the explorer's commit with one of three rows unchecked, one of them staged                                                                                                                                                                                                                                                                     | Only the chosen paths were committed; the staged file stayed staged                                                                                                    |
| The lock                  | A write into a locked app's files by `fetch`; Show files; the same write; Lock files                                                                                                                                                                                                                                                                                                                  | Refused `HOST_SCOPE_LOCKED`, allowed, refused again                                                                                                                    |
| Create                    | An inventory in a new folder; a task project inside another app; one in a folder that already holds files; undone                                                                                                                                                                                                                                                                                     | Created; refused; created (see [For Jamie](#for-jamie)); undone to nothing                                                                                             |
| No repository             | A folder with no git: a save, an item added, undone                                                                                                                                                                                                                                                                                                                                                   | No commit button, no Changes view, no check-in bar; the rest worked                                                                                                    |

The walk found nothing by itself that the readers did not. It is where H1, H2, M1, M2, M3, H5 and
M9 were then reproduced.

---

## High

### H1. One held Enter on "Delete…" deletes with no question seen

- **Where:** `packages/hosts/local/src/client/file-ops/dialog.ts:125` (`askMessage` gives focus
  to the confirm button) and `:215` (the "cannot be undone" question does the same);
  `menu/menu.ts` opens the dialog inside the keydown that chose the entry.
- **What:** choosing "Delete…" with Enter opens the dialog with focus on "Delete" before the key
  comes up. A key repeat is an Enter on that button, which the browser treats as a click.
  `confirm.ts` gives focus to Cancel for this reason; this dialog does not.
- **Impact:** an Enter held past the repeat delay deletes the file. A text file comes back with
  Undo, though not its unsaved edits. For an image the first repeat is refused
  `HOST_CANNOT_UNDO`, the second question opens with focus on Delete again, and the next repeat
  sends it `unjournaled`: the image is gone and the journal is emptied, so earlier steps cannot
  be undone either. Reproduced in Chromium: Shift+F10, ArrowDown, one Enter held for under a
  second, on `gamma.md` (deleted, "Undo: Delete gamma.md") and on `dot.png` (deleted, "Nothing
  to undo").
- **Fix:** give focus to Cancel when the question is a danger, as `confirm.ts` does, and drop a
  repeating Enter (`event.repeat`) in the dialog's keydown.

### H2. Six tabs on one host freeze every tab

- **Where:** `packages/hosts/local/src/client/host-client.ts:228` (`watch`: one `EventSource`
  for the page's life); the server speaks HTTP/1.1 (`node:http`).
- **What:** a browser allows six connections to one host over HTTP/1.1, across all tabs, and an
  event stream holds one for good. No request has a timeout.
- **Impact:** the pane shows one file, so a tab per file is the natural way to see two. The
  sixth tab's explorer stays empty. In the others a click opens nothing, Save never answers, and
  a rename, delete or commit dialog stays busy, where Escape and the close button wait. Nothing
  says why. Closing a tab releases all of them, and no text is lost. Reproduced in Chromium: the
  sixth tab listed 0 rows, the seventh did not load, and the first tab's `GET /api/root` had no
  answer until two tabs were closed.
- **Fix:** close the stream when the tab is hidden and open it again when shown, then say
  `listed`, `journal` and `reconnected`, which the page already handles. One stream shared
  across tabs (a `BroadcastChannel` or a shared worker) is the fuller answer.

### H3. No token for the run: anything on the machine can read the folder, and write with one header

- **Where:** `packages/hosts/local/src/server/host.ts:169` (`createRequestCheck`). The ruling is
  in the [host-server spec](../../../stage4/phase2/specs/host-server.md): "a program on the same
  machine can already write the files".
- **What:** a `GET` needs nothing, and a write needs an `Origin` header a program can set. The
  checks stop a browser on another origin, which is what they were written for. They do not stop
  a program.
- **Impact:** the ruling holds for a program running as the same person with no sandbox. It does
  not hold for another account on the machine, a container on the host's network, or a sandboxed
  agent that can reach loopback: each can read every file under the root, and with the header
  write files and call `POST /api/commit`, which runs the repository's hooks as the person
  serving. Stage 5 widened what is behind the door (the commit, the apps' ops, undo). Checked:
  `curl` with no `Origin` read a file; every write probe in this review was a forged header.
  Not run from a second account.
- **Fix:** a random token per run, in the address the command prints, kept by the page and
  required on every `/api/` request. It is a ruling to change, so it is Jamie's call
  ([For Jamie](#for-jamie)).

### H4. The watcher stops hearing a folder that was removed and made again (stage 4's code)

- **Where:** `packages/hosts/local/src/server/watcher.ts:175` (a watched path is skipped) and
  `:138` (watches are set again only when the listing differs).
- **What:** watches are kept by path. A folder removed and made again within one burst leaves
  the listing as it was, so the old watch, on a folder that no longer exists, stays.
- **Impact:** `git rebase`, and a checkout between branches that differ by a folder, do this in
  milliseconds. Afterwards changes in that folder send no event until the server restarts: the
  tree, the open file, the marks and an app's page stay as they were. When the served folder
  itself is replaced the whole page goes quiet. A save is still safe (its `base` is refused and
  the banner shows). Reproduced against the built server: `rm -rf docs && mkdir docs`, the file
  written back, then an edit and a new file in it gave no event, while `/api/list` showed the
  new file.
- **Fix:** keep each watch's inode; on every listing, check each watched folder and open the
  watch again where the inode moved.

### H5. An edit beside a link whose text is code writes the link away (older than stage 5)

- **Where:** `packages/formats/md/src/editor/prosemirror-schema.ts:308` (`code` is declared
  before `link`); the table case is in `prosemirror-markdown.ts`, `parseInlineTokens`.
- **What:** the serializer writes a code span correctly only when `code` is the last mark. With
  `link` after it, the backticks go outside and the link's syntax becomes the code's text.
- **Impact:** in Chromium, one word typed at the end of the second item of

  ```md
  - [`parse()`](https://e.com/api#parse) reads a file
  - [`write()`](https://e.com/api#write) writes one
  ```

  saved both items as `` `[parse()](https://e.com/api#parse)` ``: neither is a link any more,
  the untouched item included. In a table cell the URL leaves the file. It is how API names are
  written: the reader counted 17 such blocks in 15 of this repository's 174 markdown files. The
  schema has not changed since stage 4, where a save wrote the whole document this way; stage 5
  narrowed it to the edited block. Context Manager has it in production.

- **Fix:** declare `link` before `code` in the schema's marks (the reader ran the serializer
  over that order and got the links back), and give a table cell's code text the marks around
  it.

## Medium

### M1. A commit lands on the branch git is on, not the one the open review names

`client/commit/review.ts`: the branch is read when the review opens; `changesMoved` reads the
files again and not the branch; the request names no branch (`:179`). Reproduced in Chromium:
the review said "On first", `git switch -c elsewhere` in a terminal left it saying so, and
Commit put the commit on `elsewhere`. Only the notice afterwards says which. The apps' reviews
are the same. Fix: read the branch again before the commit and refuse when it differs, or send
the expected branch and let the server refuse.

### M2. On a board, a check-in leaves out a file the last op wrote beside its card

`packages/apps/tasks/src/shell/tasks-app.ts:96` (`READS_THE_BOARD_AGAIN`): the shell reads the
board again after four ops. `move-file` from the pool also rewrites `unassigned/order.yaml`,
`fix-references` rewrites other cards, and `add-tag` rewrites `tasks.yaml`, and none is among
the four, so the count, the dots and the check-in keep the old marks. Reproduced in Chromium: a
pool card listed in `order.yaml`, "Move to Todo", "1 uncommitted change", one row in the review,
and a commit of the move alone; `order.yaml` was left changed and showed as a new change after.
With `fix-references` the commit takes the move and leaves the links the person just asked to
fix. The stage view is not affected. Not a regression for Context Manager, whose page read the
board again after the same four. Fix: read the view again after those three as well, and the
strip after `edit-manifest`.

### M3. A card made where a moved card used to be is written, hidden, and committed under the move

`packages/apps/tasks/src/changes.ts:57`: every moved change hides its old path, which is right
where the old file still exists upstream and wrong in a folder, where the path is free.
Reproduced in Chromium: `landing.md` moved to phase 2; "+ New spec" titled "Landing" on phase 1
wrote the file and answered "No card at …/phase1/specs/landing.md"; phase 1 showed no new card
and no bar; phase 2's review had one row, the move, and its commit also wrote the hidden card.
Nothing is lost, and Undo takes the create back. Fix: in `tasksFromChanges`, a move whose old
path is among the snapshot's paths is two changes, with no pending move.

### M4. A commit does not answer, and holds every write, while a hook's child keeps git's output open (stage 4's code)

`server/git/run.ts:151` waits for `close`, which waits for every holder of the pipes. Reproduced:
a `pre-commit` hook of `(setsid sleep 25 &); exit 0` made the commit at once, and
`POST /api/commit` answered 25 seconds later; a save sent meanwhile waited 22. With a longer
child both wait as long, since the timeout signals the process group and the child left it. Fix:
answer on `exit` after a short drain, then destroy the pipes.

### M5. A link inside the folder reaches `.git`, and steps around an app's lock

`server/paths.ts:160` (`locate` checks that the real path is inside the root; the test for git's
folder reads the path as written) and `server/apps/app-host.ts:176` (the lock compares strings).
Reproduced: with `cfg.md -> .git/config` in the folder, `GET /api/file?path=cfg.md` returned the
config and a `write` changed it (`git config probe.x` answered `1`); with `w2 -> work`, a create
at `work/…` was refused `HOST_SCOPE_LOCKED` and the same at `w2/…` was written. git checks such
links out of a cloned repository. It is reachable only from the page's own origin, so it needs
the person to save such a file, but the README says git's folder is refused, and a write to
`.git/config` runs code at the host's next `git status`. Fix: refuse when the real path, relative
to the root, holds a git name; test the lock against the located path.

### M6. One unreadable file named like a manifest makes every write answer 500

`server/apps/discovery.ts:71` reads each manifest with no catch, and the write check runs
discovery for every `PUT /api/files`. Reproduced: `vendor/thing/inventory.yaml` at mode `000`
made `GET /api/apps` and a create of an unrelated file answer 500 `HOST_ERROR`; removing it put
both right. Rare (a file owned by another account, a container's output), total while it lasts.
Fix: discovery records the read's failure as that instance's error.

### M7. Serving a folder git ignores shows an empty tree (stage 4's code)

`server/git/repository.ts:137` decides `repository` from `--is-inside-work-tree` alone, and the
listing asks git, which lists nothing ignored. Reproduced: a `scratch/` named in `.gitignore`,
served by itself, listed `{"nodes":[]}` while its file opened by address. Fix: at the start,
`git check-ignore -q .`; when ignored, list by the walk.

### M8. The Enter that accepts an input method's candidate confirms the check-in

`packages/components/checkin-review/src/checkin-review.ts:494` (`onKeydown`) confirms on
`event.key === 'Enter'` and does not look at `event.isComposing`. On macOS with a Japanese,
Chinese or Korean input source that Enter commits, or checks in, with the summary as it stood.
Read in the source and run by the reader under jsdom; not run with a real input method. Both
hosts. Fix: return first when `event.isComposing || event.keyCode === 229`, as the sheet editor
does.

### M9. A bare URL gains backslashes, and an entity changes meaning, when its block is edited (older than stage 5)

`packages/formats/md/src/editor/prosemirror-markdown.ts`, the text writer: it escapes inside an
autolink, where a backslash is literal, and does not write `&` or `<` back as they were.
Reproduced in Chromium, one word typed in each paragraph:
`https://example.edu/~user/notes` became `<https://example.edu/\~user/notes>`, `__init__.py` in
an angle-bracket link became `\__init_\_.py`, and `&amp;lt;` became `&lt;` while
`&lt;me@example.com&gt;` became a mail link. Fix: pass `!state.inAutolink` to `state.text`, and
write `&` before an entity and `<` before an autolink escaped.

### M10. A link definition inside a list item or a quote is dropped by an edit there (stage 5)

`packages/formats/md/src/editor/markdown-source.ts:98` collects definitions only from the gaps
between top-level blocks. One written inside a list item or a block quote is no node, so an edit
to that list writes it away while a paragraph elsewhere still says `[text][d]`, and the seam
check does not see it. Run by the reader against the built package; none of 609 real files
(47 with definitions) has one. Fix: when the parse's references hold a label the kept
definitions do not, write the document whole, as before.

### M11. The runner rewrites a file it could not read, with no base

`packages/common/src/host/runner.ts:199` (`withBases`): a file the port cannot read loads as
`null` with no version, and a change to it goes to `put` with no `base`. Only the pool's
`order.yaml` can be written this way; cards, the manifest and zones are refused by their cores.
Run by the reader over the node port: a Latin-1 order file was replaced by `reorder-pool`. Fix:
refuse a `write` or `move` whose source has no loaded version.

### M12. With two `<modal-dialog>`s open, Tab moves focus into the covered one

`packages/components/modal-dialog/src/modal-dialog.ts:253` (`trapFocus`): each open dialog
listens on `document`, the covered one pulls focus in, and the new `defaultPrevented` test makes
the top one stand down. At `stage4-complete` focus stayed in the top dialog. Run by the reader
under jsdom against both versions; not in a browser. Nothing in surfaces opens two (every
`.open()` caller was read). Whether Context Manager ever does was not checked. Fix: stand down
when focus is inside another open dialog.

## Low / Hygiene

- **L1 — A rule that becomes the first block reads back as frontmatter**
  (`prosemirror-markdown.ts`): delete the paragraph above a `---` and the next load hides what
  follows it, down to the next `---` or setext underline. The text stays in the file.
- **L2 — `/api/raw` serves a repository's `.js` as script from the page's own origin**
  (`server/host.ts`), so `script-src 'self'` would not stop an injection bug, if one existed,
  from loading a file as script. Refuse `Sec-Fetch-Dest: script`, `style` and `worker` there.
- **L3 — A kind with the id `constructor` answers 500 on its board** until a card exists
  (`packages/apps/tasks/src/boardDetection.ts`, `holder.paths[kind.id]` on a plain object).
- **L4 — A manifest whose `current` key is quoted is invalid after Set current:** a second
  `current:` is appended. Stage 3's code, both hosts.
- **L5 — The strip is not read again after `edit-manifest`,** so "Close…" lists by the old done
  column. The close is then refused; nothing is written. Closed by M2's fix.
- **L6 — A page loaded at `#/edit/<a locked app's file>` can mount the editor,** since the
  instances are read after the view is chosen. The server refuses the save.
- **L7 — The create dialog closes on Escape while its create runs;** the instance still appears.
- **L8 — `reorder-pool` sent with no view writes and then answers not found.** The shell always
  sends one.

## For Jamie

Rulings and opinions; nothing was changed.

- **H3 is a decision, not a defect in what was specified.** For a release that only you run on
  your own account, the stage 4 ruling stands. For one that anyone else installs, or that runs
  beside an agent in a sandbox, I would not ship without the token.
- **What "release" means decides the list.** For Context Manager's next release, nothing here
  blocks. For the local host handed to another person, I would fix H1 and H2 first (small,
  certain, and each makes the page do something a person did not ask for), then H5 and M1, M2
  and M8, and rule on H3.
- **A task project created in a folder that already holds files hides them** behind the app's
  row, with no word that it will. `notes/` with three notes became one "Tasks" row. Show files…
  brings them back and Undo takes the create away.
- **The walk could be a `test` card** (the board has the kind and a template) so it is run
  again at a release. It is recorded here as a table for now.
- Seen in the walk and already known: an edited paragraph is written on one line and a
  reference link in it becomes an inline one
  ([a-save-keeps-the-file](../../../unassigned/seeds/a-save-keeps-the-file.md)).

---

## Task list

Triaged with Jamie on 2026-11-22; the [outcome](#outcome) below says what was built.

### P0 — before a release of the local host

- [x] **H1:** the delete question gives focus to Cancel and ignores a repeating Enter. [#165](https://github.com/stillpointlab/surfaces/pull/165)
- [x] **H2:** a hidden tab gives its event stream back. [#165](https://github.com/stillpointlab/surfaces/pull/165)
- [x] **H5, M9:** `link` before `code` in the schema; the text writer inside an autolink and
      before an entity. [#166](https://github.com/stillpointlab/surfaces/pull/166)
- [x] **M1:** a commit is refused when the branch is not the one the review opened on. [#165](https://github.com/stillpointlab/surfaces/pull/165)
- [x] **M2 (with L5):** the shell reads again after `move-file`, `fix-references`, `add-tag` and
      `edit-manifest`. [#165](https://github.com/stillpointlab/surfaces/pull/165)
- [x] **M8:** no confirm while an input method is composing. [#165](https://github.com/stillpointlab/surfaces/pull/165)

### P1 — hardening, and one ruling

- [x] **H3:** Jamie's ruling on a token per run: build it, in phase 1 of the next stage. The seed
      is [a token for the run](../../../unassigned/seeds/a-token-for-the-run.md).
- [x] **H4:** the watcher follows a folder that was made again. [#167](https://github.com/stillpointlab/surfaces/pull/167)
- [x] **M3:** a move whose old path is taken is two changes. [#165](https://github.com/stillpointlab/surfaces/pull/165)
- [ ] **M4:** a commit answers when git exits. Deferred to the
      [follow-up log](../../../../devlogs/stage5/followups.md).
- [x] **M5:** confinement and the lock test the real path. [#167](https://github.com/stillpointlab/surfaces/pull/167)
- [x] **M6:** an unreadable manifest is one instance's error. [#167](https://github.com/stillpointlab/surfaces/pull/167)
- [ ] **M7:** an ignored root is walked. Deferred to the follow-up log.

### P2 — the pool

- [x] **M12:** Tab with two dialogs open. Raised from P2 because it is a regression from the
      drain's own Tab fix. [#165](https://github.com/stillpointlab/surfaces/pull/165)
- [ ] **M10, M11, L1 to L4, L6 to L8:** deferred to the follow-up log, one entry each.

## Suggested tests to lock in fixes

- `file-ops/file-ops.test.ts`: the delete question opens with focus on Cancel; a keydown with
  `repeat: true` on the confirm button writes nothing.
- `host-client.test.ts`: `visibilitychange` to hidden closes the stream; to visible opens one and
  sends `listed`, `journal`, `reconnected`.
- `server/watcher.test.ts`: a watched folder removed and made again in one burst still reports a
  later change.
- `server/confinement.test.ts`: a link to `.git/config` and a link to `.git` are refused for a
  read, a write and a create; `apps/apps.test.ts`: a write through a link into a locked region is
  refused.
- `server/git/commit.test.ts`: a hook that leaves a child in its own session answers within a
  second of git's exit.
- `apps/discovery` test: a manifest the port cannot read is an invalid instance, and a write
  elsewhere still succeeds.
- `commit/commit.test.ts`: a branch that moved while the review is open refuses the commit.
- `packages/apps/tasks` shell test: after `move-file` from the pool the check-in request names
  the order file; `changes.test.ts`: a moved change whose `from` is in the snapshot hides nothing.
- `checkin-review.test.ts`: Enter with `isComposing` asks nothing.
- `packages/formats/md`: an edit beside ``[`code`](url)`` keeps the link, in a list and in a
  table; a bare URL with `~` and `_` and an `&amp;lt;` come back as written.

---

## Outcome

2026-11-22, by the same agent, on Jamie's word to decide what to fix and what to defer.

**Fixed, in three pull requests that touch no file in common:**

- [#165](https://github.com/stillpointlab/surfaces/pull/165), the page, the check-in review, the tasks app and the dialog: H1, H2, M1, M2 with L5,
  M3, M8 and M12.
- [#166](https://github.com/stillpointlab/surfaces/pull/166), the md format: H5 and M9.
- [#167](https://github.com/stillpointlab/surfaces/pull/167), the server: H4, M5 and M6.

Each finding was reproduced before its fix, in a unit test that fails without it or in Chromium
against the built host, and checked again after. M8 and M12 were not run in a browser: headless
Chromium has no input method, and nothing in surfaces opens two dialogs.

**Where a fix differs from this card's wording:**

- **M1** is refused by the server, not the page. The review's op carries the branch it showed
  (`onBranch`, one new optional field in the shared contract), so an app's review is held to it
  too.
- **M3** asks whether the old path is among the **changes**, not the snapshot's paths. A host
  whose snapshot includes upstream holds the old path for a real pending move, and the existing
  tests say so.
- **H1** changes what Enter does in the delete dialog: it opens on Cancel now. Jamie may narrow
  it to the repeat guard alone.

**Rulings (Jamie, 2026-11-22):**

- **H3:** build the token, in phase 1 of the next stage.
- **A task project created in a folder that already holds files:** the create dialog says the
  files will sit behind the app's row and names "Show files…" ([#165](https://github.com/stillpointlab/surfaces/pull/165)).
- **The walk is a `test` card,**
  [local-host-release-walk](../../../unassigned/tests/local-host-release-walk.test.md), run at
  each stage's close with a release review and Jamie's own validation
  ([devlogs](../../../../devlogs/README.md#milestones)).

**Deferred,** each a bullet in the [follow-up log](../../../../devlogs/stage5/followups.md) for
the next stage's setup: M4, M7, M10, M11, L1 to L4 and L6 to L8. None loses text or opens the
folder to another origin; each is rare, refused safely, or stage 4's code with a fix that needs
more care than a close allows.

**Context Manager** takes the md, review, dialog and tasks fixes with its next pin.
