---
column: in-progress
created: 2026-11-13T16:45:00-07:00
tags: [apps, formats, host-contract, dev-tooling, major-feature]
---

> A brief captures the _why_ and the desired outcome before any task breakdown exists. Keep it short
> — one page. Specs derived from it live in the sibling `specs/` folder, built from
> `spec.template.md`. The `column:` frontmatter above drives this file's card on the task board.

# Brief: a local host for the formats and apps

_Drafted by the claude agent from the [local host spike](../spikes/local-host.md), the
[host file tree spike](../spikes/host-file-tree.md) and Jamie's answers to the first spike's open
questions. It covers two stages: stage 4 builds the host for files, formats and git, and stage 5
puts the apps in it. Stage 4's phase 1 holds the spikes, this brief and stage 4's specs; stage
5's specs wait in its own phase 1._

## Decisions (Jamie, 2026-11-13, on PR 87)

- **The next step is a second host,** not a third app: a third app also means building the app.
- **The aim is independence,** not a line count: develop the apps and formats apart from Context
  Manager, and run them in a host of their own. The far end is a Surfaces app, the formats and
  apps over a local server, in a desktop shell.
- **The core runs in the server,** and the choice must stay clean for a desktop shell (Electron,
  Tauri or another).
- **It lives in `packages/hosts/local`,** so other hosts have a place, and its `bin` is
  `surfaces`.
- **The formats are part of it:** an explorer on the left with the folder's contents, and a
  preview or editor chosen from the file's type.
- **Git by shelling out** to the installed `git`. Everything GitHub (pull request state, opening
  a pull request, divergence) is deferred.
- **Check-in offers a new branch.**
- **The tree** follows the tree spike's recommendation, which Jamie accepted: the host's own
  small tree, with Context Manager's trees and its context picker left as they are.

A second round, the same day, on this brief's open questions:

- **Moves are staged** (`git mv`), so `git status` reports them as renames.
- **The runner and the storage port go where their users are:** in `common` if anything outside
  the hosts will use them, under `packages/hosts/` if not. The agent's reading of that rule:
  `common`, as an entry of their own (`common-format/host`), because the harness's memory host
  is the same runner today and Context Manager running on it is the end state the local host
  spike names (its finding 4). The Node implementation of the port stays in
  `packages/hosts/local`.
- **Context Manager adopts in this stage** (outcome 6).
- **The explorer creates, renames and deletes files.**
- **A file that changes on disk under unsaved edits** raises a banner with a reload button, and
  both ways of losing work ask first (outcome 1).
- **Undo and redo are to be considered** (outcome 5).

A third round, the same day:

- **An app's scope is locked for writes by default,** with an escape hatch. A file there still
  opens in its preview (outcome 1).
- **Undo's journal has limits,** generous ones, on both the number of steps and the total size
  it keeps (outcome 5).
- **Deletes are staged,** as moves are (outcome 2).

A fourth round, the same day:

- **Context Manager takes the lock** when it adopts (outcome 6).
- **The undo journal is in the server's memory,** for the run. It does not outlive the server.

A fifth round, the same day:

- **The format descriptor is data and one `apply`** the format supplies (outcome 1).
- **Undo leaves editor saves out at first, and a commit does not clear the journal**
  (outcome 5).

A sixth round, the same day, on the specs:

- **Two stages, not one.** Thirteen specs is too many for a stage. Stage 4 is the host for
  files, formats and git; stage 5 is the apps in it, check-in and undo. Each stage ends with
  Context Manager adopting what that stage moved, which keeps the second-round decision.
- **The specs are implemented by Opus 5.5 sub-agents,** with the claude agent orchestrating.

## High-level goal

`surfaces <path>` serves a folder: its files open in their formats, its tasks and inventory
manifests mount as apps, and changes are committed with git. Nothing in it needs Context Manager.

## Background

Stage 3 gave Context Manager one path for every app, and about 5,850 lines there are still an
app's. Roughly 2,500 of them are app behaviour that any second host would write again: the pages
around the elements, the check-in review, the URL-to-view rules, the bounds on an op. The formats
have the same gap: nothing here says which format opens a path, so Context Manager decides.

The harness mounts elements over fixtures. It has no real files, pages, check-in or explorer, so
the apps and formats as a person uses them exist only in Context Manager. A second host makes
each of those pieces live here, because it needs them.

## Desired outcome

Each phase ends with something to use. `npm run serve -- <path>` runs it from this repository
with the packages' sources reloading; `surfaces [path]` runs it anywhere.

Outcomes 1 and 2 are stage 4, with the format registry's share of outcome 6. Outcomes 3, 4 and 5
are stage 5, with the rest of outcome 6. The lock under outcome 1 arrives with the apps, in
stage 5.

1. **Files and formats.** A folder opens with an explorer. A file opens in its format's preview,
   and its editor where it has one, chosen from the path by a registry of format descriptors.
   Saving writes the file. The explorer creates, renames and deletes files.

   A format descriptor is a small object each format package exports, from an entry that loads
   no editor, and a host registers it. It names:
   - the paths the format opens;
   - its preview and editor tags, and how to load each;
   - whether it wants the file's text or a URL;
   - one `apply(element, file)`, which hands the element its content.

   The registry is an ordered list: the first match opens the file, and code is the fallback
   for text. The host creates the element, places it, listens to it and reads it back through
   the element contracts. The format only chooses its own setter and attributes in `apply`:
   the sheet takes CSV through `setContent` and a `.sheet` document through
   `setDocumentSource`, and the image takes a URL through `setSource`. The harness's
   `HarnessFormat.elements` and `apply` become the descriptor's, so the harness reads it too.

   A change on disk shows without a reload when the open file has no unsaved edits. When it
   has:
   - a banner says so, with a **Reload** button: "This file changed on disk after you opened
     it. Your edits are not saved.";
   - Reload asks first: "Reload from disk? Your unsaved edits will be lost." (Reload, Cancel);
   - saving while the banner shows asks first: "Save over the newer file? The file on disk
     changed after you opened it, and saving replaces those changes with yours." (Save anyway,
     Cancel).

   The words are a draft. The server makes the same check: a save names the content it was
   based on, and is refused when the file on disk is no longer that, so the check does not
   depend on the banner having arrived.

   Inside an app's scope (the folder its manifest mounts), the app is the only writer by
   default. How that looks (Jamie, 2026-11-13):
   - **Locked,** the app is one row in the explorer, where its folder would be, named for the
     app. Its files are not listed. Selecting the row opens the app at its default page.
   - **Unlocking** is an option on the row, and it asks first. A draft of the words: "Show this
     app's files? Changes made to them skip the app's rules, and the app may report problems
     until they are fixed." (Show files, Cancel).
   - **Unlocked,** that row is still the app's entry point: it keeps the app's name and still
     opens the app. Under it are the scope's folders and files, which act as any others do:
     they open in their editors, and the explorer creates, renames and deletes there.
   - **Locking again** is a lock entry in the row's menu, not a matter of collapsing the row.
     A mark on the row shows while the scope is unlocked. Locking hides the files again, runs
     the app's own projection over the scope and shows the problems it reports. It locks
     either way: the app shows the same problems when it opens, and a lock that refused would
     leave the scope open.
   - **Every run starts locked.** An unlocked scope does not outlive the run.

   A link to a file in a locked scope opens the file in its preview. The server enforces the
   lock, not only the page: a write to a locked scope that does not come through the app's
   runner is refused.

2. **Git.** The explorer marks changed, new, moved and deleted files. A changed file shows its
   diff against `HEAD`. The host stages its own moves and deletes, so git reports them as such.
   Chosen files are committed, on the current branch or a new one. A folder that is not a
   repository works without any of this.
3. **Apps.** A tasks or inventory manifest shows as an instance in the explorer and opens as the
   app, inventory first. One runner applies ops over the storage port. Each app's page (its
   shell), its pages' rules, its bounds and its copy come from its package. An app is created
   from its create form.
4. **Check-in.** One review element, used by both apps: the changed files, the ones to include,
   a title and a body. Locally it commits.
5. **Undo and redo** for what the host writes, if its spec finds it sound. The lean: every write
   through the storage port (an app's op, a file created, renamed or deleted) is kept with its
   inverse in a journal in the server's memory, for the run. Undo writes the inverse, and is
   refused when a file it would touch has changed since. Undoing a staged move or delete puts
   the index back as well as the file.

   Text undo inside an open editor stays the editor's own. A save from an editor is not in the
   journal at first: the editor has its own undo, and git shows the change. A commit does not
   clear the journal, so undoing after one makes a new change to commit.

   The journal has two limits, both generous: a number of steps and a total size of kept
   content. The draft is 1,000 steps and 256 MB. Past either, the oldest steps are dropped. One
   write too large to keep at all (a delete, mostly) says it cannot be undone and asks first.

6. **Context Manager adopts** what moved (the registry, the shells, the pages, the bounds, the
   check-in element), piece by piece, and takes the lock on an app's scope. Today its tree
   lists an app's files, and a card or a zone file opens in its format's editor.

## Constraints

- **A desktop shell stays a wrapper** (the spike's finding 8):
  - the runner is DOM-free and Node-free and reads only the storage port;
  - the page reaches its host through one client interface, never a `fetch` of its own;
  - the server is a library first, with the `bin` a thin listener around it;
  - the client builds to static files, and binary media gets its URL from the host.
- **Safe on a person's machine:** bound to loopback, no path outside the served root (symlinks
  included), and a request checked by origin or a per-run token.
- **Context Manager is not required to change** for any phase but the last, and its walks run on
  every PR there.
- **The harness stays** the place for fixtures and hostile states. The local host does not
  replace it, and the cores stay DOM-free and host-free.
- **The tree holds its line** (the tree spike's non-goals): no drag and drop, rename in place,
  multiple selection or virtual scrolling until one is decided on its own. File operations are
  decided: the tree asks for a menu on a row, and the host owns the menu, its dialogs and the
  writes.
- **An app's core still cannot delete.** The storage port takes a delete for the explorer and
  for undo; the app contract's `FileChange` stays as it is until an app needs one.
- **This repository's rules apply to the host's client:** markup through `html` and `render`,
  the shared tokens, `npm run check` green.
- **Out of scope:**
  - GitHub: pull request state, opening a pull request, divergence;
  - the desktop shell itself, and publishing to npm;
  - the check-in shared core and one host runner inside Context Manager;
  - a third app.

## Specs, in order

Each spec is one work package: what it owns, what it reads and must not change, and what it can
run beside. The claude agent hands a wave to sub-agents, reviews and merges each PR, and starts
the next wave. Specs in the same wave can run at the same time.

**Stage 4: the host for files, formats and git** (specs in `stage4/phase1/specs/`)

| Phase | Wave | Spec                                                                         | PRs |
| ----- | ---- | ---------------------------------------------------------------------------- | --- |
| 2     | 1    | [format-descriptors](../specs/format-descriptors.md)                         | 1   |
| 2     | 1    | [host-server](../specs/host-server.md)                                       | 1   |
| 2     | 1    | [explorer-tree](../specs/explorer-tree.md)                                   | 1   |
| 2     | 2    | [host-page](../specs/host-page.md)                                           | 1   |
| 2     | 3    | [file-operations](../specs/file-operations.md)                               | 1   |
| 3     | 1    | [git-in-the-host](../specs/git-in-the-host.md)                               | 2   |
| 4     | 1    | [context-manager-adopts-formats](../specs/context-manager-adopts-formats.md) | 1   |

**Stage 5: the apps in the host** (specs in `stage5/phase1/specs/`)

| Phase | Wave | Spec                                                                                       | PRs |
| ----- | ---- | ------------------------------------------------------------------------------------------ | --- |
| 2     | 1    | [app-module-grows](../../../stage5/phase1/specs/app-module-grows.md)                       | 2   |
| 2     | 2    | [host-runner](../../../stage5/phase1/specs/host-runner.md)                                 | 1   |
| 2     | 2    | [app-shells](../../../stage5/phase1/specs/app-shells.md)                                   | 2   |
| 3     | 1    | [apps-in-the-local-host](../../../stage5/phase1/specs/apps-in-the-local-host.md)           | 2   |
| 4     | 1    | [checkin-review](../../../stage5/phase1/specs/checkin-review.md)                           | 2   |
| 5     | 1    | [undo-journal](../../../stage5/phase1/specs/undo-journal.md)                               | 1   |
| 6     | 1    | [context-manager-adopts-apps](../../../stage5/phase1/specs/context-manager-adopts-apps.md) | 4   |

A spec moves to its phase's folder when its phase opens, as stage 3's did. Stage 5's specs were
written with stage 4's, before any of it was built, so stage 5 opens by reading them again
against what stage 4 made.

## Open questions

None is left for Jamie. The two that were open have a home:

- **The lock in Context Manager** is decided (2026-11-13): every page load starts locked, and
  the server refuses a draft to a locked app's file. Where that check stands is in
  [context-manager-adopts-apps](../../../stage5/phase1/specs/context-manager-adopts-apps.md).
- **The descriptor's place in Context Manager** is
  [context-manager-adopts-formats](../specs/context-manager-adopts-formats.md): one table from
  content types to format ids, and an amendment to ADR-0009.
