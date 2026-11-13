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
   each format package exports. Saving writes the file. A change on disk shows without a reload.
2. **Git.** The explorer marks changed, new and moved files. A changed file shows its diff
   against `HEAD`. Chosen files are committed, on the current branch or a new one. A folder that
   is not a repository works without any of this.
3. **Apps.** A tasks or inventory manifest shows as an instance in the explorer and opens as the
   app, inventory first. One runner applies ops over the storage port. Each app's page (its
   shell), its pages' rules, its bounds and its copy come from its package. An app is created
   from its create form.
4. **Check-in.** One review element, used by both apps: the changed files, the ones to include,
   a title and a body. Locally it commits.
5. **Context Manager adopts** what moved (the registry, the shells, the pages, the bounds, the
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
  multiple selection, menu, file operations or virtual scrolling until one is decided on its own.
- **This repository's rules apply to the host's client:** markup through `html` and `render`,
  the shared tokens, `npm run check` green.
- **Out of scope:**
  - GitHub: pull request state, opening a pull request, divergence;
  - the desktop shell itself, and publishing to npm;
  - the check-in shared core and one host runner inside Context Manager;
  - a third app.

## Open questions

Each is for the spec that meets it, unless Jamie answers first:

- **Moves.** `git status` reports a rename only once it is staged. Does the host stage a move, or
  keep its own record of pending moves for the tasks core?
- **The format descriptor's shape,** and whether Context Manager's adoption of it wants an ADR
  there.
- **Where the runner and the storage port live:** in `common-format/app` beside the contract, or
  a package of their own under `packages/hosts/`.
- **Whether outcome 5 is this stage's last phase or the next stage,** given how the stage 3
  reflections describe contention between the agents in the two repositories.
- **File operations in the explorer** (new file, rename, delete). The app contract has no
  `delete` change, and the tree spike leaves them out; which, if any, does this stage want?
- **The watcher and an editor with unsaved changes:** what the page does when the file under an
  open editor changes on disk.
