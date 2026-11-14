---
column: in-progress
created: 2026-11-13T16:20:00-07:00
tags: [dev-tooling, host-contract, code]
---

# Spike: the local host's file tree — build, share or move?

> Tech-spike working notes for stage 4, before its brief. Read against Context Manager `main` at
> `2d99a40b` and this repository at `dc615da`. Line counts are `wc -l` without tests; file paths
> are Context Manager's unless they start with `packages/`.

## Question

The [local host](local-host.md) needs an explorer: the folder's contents in a tree on the left.
Context Manager already has trees, for digital goods and for repository files, with a lot of
behaviour built for Context Manager, and a context picker that shows trees in several places. Jamie's caution (2026-11-13): this is a classic "one
component to rule them all" situation, and trees are complex enough to become tar pits.

So: does the local host move one of Context Manager's trees here, share a base with them, or
build its own? Does the context picker change the answer? And where is the line that keeps it
out of the tar pit?

## Findings

### 1. Context Manager has three trees and one shared base

| File                                                           | Lines | What it is                              |
| -------------------------------------------------------------- | ----- | --------------------------------------- |
| `client/components/tree-base/tree-base.ts`                     | 303   | the shared base, `TreeBase<R, K>`       |
| `client/components/folder-tree/folder-tree.ts`                 | 924   | digital goods in folders, by public id  |
| `client/components/repo-tree/repo-tree.ts`                     | 953   | a connected repository's files, by path |
| `client/components/context-picker-tree/context-picker-tree.ts` | 1,397 | picking context for a conversation      |

That is 3,577 lines, with about 770 more of styles. The base was extracted from the first two
(context-manager#155), and the third extends it too.

### 2. What the base shares is behaviour, and it is a twelfth of the code

`TreeBase` holds:

- the keyboard cursor, with VS Code's meaning for the arrows, Home, End and Enter;
- focus, a roving tabindex and the ARIA row attributes;
- the collapsed set, saved to `localStorage`;
- double-click detection by hand, because selecting a row renders the tree again and replaces
  the clicked node, so the native `dblclick` never fires;
- a relay to the page's one options menu (it looks up `#shared-options-menu`);
- handing the cursor to a neighbouring tree (`tree-nav-boundary`).

Each tree keeps everything else: its data and how it loads, its rendering, its mutations, its
menus and its dialogs. Context Manager's own rule for the base says the same: it is "NOT a
custom element", with no markup, styles or lifecycle of its own
(`client/components/README.md`).

So Context Manager already met this question, and its answer was to share the interaction and
nothing else. After that, the three trees still have 3,274 lines between them that the base
could not take.

### 3. What `repo-tree` holds beyond a tree of paths

It is the nearest to what the local host shows, and most of it is Context Manager's:

- import state per file and rolled up per folder (`RepoFileStatus`), and the good each linked
  path was imported as;
- the pull request per path;
- app instances and manifest candidates, with their notices, badges and drift states;
- the Create flyout per app, gated by the feature flags;
- board links for tasks' folders;
- the repository's header row and menu, and a destination picker for moves.

A local host has none of the first two, and reaches the rest differently (an instance is a
manifest in the folder).

### 4. The context picker is a chooser, not an explorer

`context-picker-tree` is the largest of the three, and it is on the conversation page and the
good page (`pages/conversation/`, `pages/digitalGood/`), where it attaches context to a
conversation. It extends `TreeBase` for the cursor, and everything else about it differs from
an explorer:

- **It spans sources.** Projects are at the top level, and under each are its goods in folders,
  its library snapshots and its connected repositories' files.
- **It loads as it opens.** Each project and each repository tree is fetched when first
  expanded, with its own loading and error rows.
- **It filters as you type**, pruning the tree live, with caches for the row model and a
  progressive render window so a broad query stays quick.
- **It picks, it does not open.** A row is a candidate to attach: already-attached goods render
  disabled, one good can be excluded, and an unknown repository file is a candidate only while a
  bounded probe could accept it as text.

Its tree is the display for a search-and-choose flow over Context Manager's own things. The
local host has no conversations and nothing to attach, so it has no use for a picker in this
stage. If it later wants one (a move's destination, a link's target), that is a chooser over
paths, and it would be nearer to this component's shape than to the explorer's. That would be
the moment to look at it again, with a real second use to compare.

### 5. The base does not fit this repository's rules as it is

- It builds markup as strings with `escapeHtml`. Here, markup goes through `html` and `render`
  from `common-format/html`, and ESLint enforces it.
- Its double-click workaround and its "call `computeTabbableKey()` at the top of `render()`"
  rule come from rendering the whole tree on every selection.
- It reaches into the page: the options menu's id, the stored collapsed sets, `window.location`.

Moving it here means rewriting it, and then changing three working trees in Context Manager to
match.

### 6. This repository's own placement rule

`packages/components/README.md`: "a component moves here when an app element needs to render it
inside itself … Page chrome stays with the host." No app element or format renders a file tree.
The explorer is the local host's page chrome.

### 7. What the local host's tree needs

For the brief's first phases:

- rows from `FolderNode`s, by path; folders expand and collapse, and a collapsed folder's
  children are not rendered;
- the keyboard cursor and ARIA of a tree, with the same key meanings as Context Manager's, so
  the two feel alike;
- select (preview) and activate (open), as events;
- one marker per path from the host: changed, new or moved (git status), rolled up to folders;
- an app instance shown at its manifest, with its label and icon;
- reveal a path, for a link that opens a file.

Not needed to open, edit, save, commit and run the apps: drag and drop, rename in place, several
rows selected, a menu, file operations (the contract has no `delete` change yet), a second tree
to hand the cursor to, or virtual scrolling (`git ls-files` already leaves ignored folders out).

## Recommendation

**Build the local host's own small tree, inside `packages/hosts/local`, and share nothing with
Context Manager's trees but the conventions.**

1. **It is the host's chrome, not a component package.** It becomes one only when a second
   consumer exists here.
2. **It knows paths and nothing else.** It takes the nodes and a small record of marks by path
   (a status, an instance's label and icon), and raises `select`, `activate` and `toggle`. It
   loads nothing, changes nothing, and owns no menu or dialog.
3. **Borrow the behaviour, not the class.** The cursor's key meanings and the ARIA pattern are
   the part worth keeping the same, and they are about 150 lines written against this
   repository's `html` and `render`. Context Manager's `TreeBase` and its three trees stay as
   they are.

4. **Hold the line in the spec.** The list under finding 7 ("not needed") is the tree's
   non-goals. Each one that the local host later wants is its own decision, taken when it is
   wanted. The estimate is 350–450 lines with styles; a tree heading past twice that is the sign
   to stop and look again.

   Decided since (Jamie, 2026-11-13): the explorer creates, renames and deletes files. That
   takes "a menu" and "file operations" off the list, and keeps the tree as described: it
   raises a request for a menu on a row, and the host owns the menu, its dialogs and the
   writes. Rename is a dialog, so "rename in place" stays a non-goal.

   Also since: an app's scope is locked by default, and shows as one row named for the app
   where its folder would be. An option on the row unlocks it, which lists its folders and
   files under that row; a lock item hides them again (the
   [brief](../briefs/local_host.md), outcome 1). The tree needs nothing new for that. The host
   leaves the app's children out of the nodes it gives the tree while the scope is locked, the
   two options are entries in the menu the host owns, and "unlocked" is one more mark on a row.

5. **Do not plan a shared tree.** If Context Manager's `repo-tree` and this one should ever
   converge, the evidence will be the second consumer, and it is cheaper to compare two working
   trees then than to design one for both now. The context picker stays separate for the same
   reason, and more firmly: it is a different kind of control.

Rejected:

- **Move `repo-tree` here.** Most of it is Context Manager's goods, imports and pull requests
  (finding 3).
- **Start from the context picker,** or fold the explorer and the picker into one. The picker
  is a chooser across sources with lazy loading and a filter (finding 4); an explorer needs
  none of those, and a tree that did both would be the largest of the four.
- **Move `TreeBase` here as the shared base.** It is a rewrite under this repository's markup
  rule, it ties two hosts to one rendering model, and it saves about 300 lines (finding 5).
- **One configurable tree** with row renderers, menus and drag as options. That is the tar pit,
  and it is the "configurable component framework" Jamie ruled out in the shared element
  patterns spike.

## References

- Context Manager: `client/components/tree-base/tree-base.ts`, `repo-tree/`, `folder-tree/`,
  `context-picker-tree/`, and the "Shared component bases" section of
  `client/components/README.md`.
- Here: [`packages/components/README.md`](../../../../../packages/components/README.md) (the
  placement rule), `packages/common/src/app.ts` (`FolderNode`), the
  [local host spike](local-host.md), and the
  [shared element patterns spike](../../../stage1/phase4/spikes/shared-element-patterns.md).
