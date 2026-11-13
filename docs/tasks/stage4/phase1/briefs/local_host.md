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
questions. Phase 1 holds the spikes, this brief and its specs; the work starts in phase 2._

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
- **The tree** follows the tree spike's recommendation, once Jamie has read it: the host's own
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

1. **Files and formats.** A folder opens with an explorer. A file opens in its format's preview,
   and its editor where it has one, chosen from the path by a registry of format descriptors that
   each format package exports. Saving writes the file. The explorer creates, renames and
   deletes files.

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

2. **Git.** The explorer marks changed, new and moved files. A changed file shows its diff
   against `HEAD`. Chosen files are committed, on the current branch or a new one. A folder that
   is not a repository works without any of this.
3. **Apps.** A tasks or inventory manifest shows as an instance in the explorer and opens as the
   app, inventory first. One runner applies ops over the storage port. Each app's page (its
   shell), its pages' rules, its bounds and its copy come from its package. An app is created
   from its create form.
4. **Check-in.** One review element, used by both apps: the changed files, the ones to include,
   a title and a body. Locally it commits.
5. **Undo and redo** for what the host writes, if its spec finds it sound. The lean: every write
   through the storage port (an app's op, a file created, renamed or deleted) is kept with its
   inverse in a bounded journal in the server, for the run. Undo writes the inverse, and is
   refused when a file it would touch has changed since. Text undo inside an open editor stays
   the editor's own.
6. **Context Manager adopts** what moved (the registry, the shells, the pages, the bounds, the
   check-in element), piece by piece.

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

## Open questions

Each is for the spec that meets it, unless Jamie answers first:

- **The format descriptor.** What it is: a small object each format package exports, from an
  entry that loads no editor, which tells a host
  - which paths the format opens (`.md`; `.csv` and `.sheet`; the image extensions);
  - its preview and editor tags, and how to load each;
  - whether its content is text or a URL (`<image-preview>` takes a URL);
  - the attributes a path implies (the code language; the sheet's CSV or document source).

  A host's registry is an ordered list of them: the first match opens the file, and code is the
  fallback for text. Two things are open:
  - **its shape:** data with one small function for the attributes (the lean, so the host stays
    the one that mounts and drives the element), or a `mount()` the format supplies (less for a
    host to know, but the format then drives itself);
  - **what Context Manager does with it.** Context Manager stores a content type on each good
    and keeps two tables of its own, by content type and by path (`codeLanguage.utils.ts`,
    `repoFileKind.utils.ts`). Adopting the registry replaces the second and maps the first onto
    format ids. That changes ADR-0009, which pinned how a good's type picks its editor, so it
    wants an amendment there rather than a new record.

  The harness's `HarnessFormat.elements` already names each format's tags; the descriptor would
  replace that field, so the harness reads it too.

- **Files inside an app's scope.** The app is the sole executor in its scope (Context Manager
  ADR-0028). Does the explorer create, rename and delete there, or only outside it? Opening a
  card or a zone file in its format's editor is allowed in Context Manager today.
- **Undo's reach:** whether a save from an editor is in the journal, whether the journal outlives
  a commit, and what a delete too large to keep does (the lean: say it cannot be undone, and ask).
- **Deletes and git.** A deleted file is removed from disk and shows as deleted until it is
  committed; whether a delete is staged, as a move is.
