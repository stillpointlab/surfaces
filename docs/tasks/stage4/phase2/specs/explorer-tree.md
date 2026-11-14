---
column: in-progress
pr: 92
created: 2026-11-13T18:34:00-07:00
tags: [dev-tooling, code]
---

# Spec: the explorer's tree

_The [local host brief](../../phase1/briefs/local_host.md), outcome 1, and the [host file tree
spike](../../phase1/spikes/host-file-tree.md), whose recommendation Jamie accepted (2026-11-13). Stage 4,
phase 2, first wave: it runs beside [format-descriptors](format-descriptors.md) and
[host-server](host-server.md). One PR here._

## High-level goal

A small tree element that shows a folder's paths, marks some of them, and says what the person
did. It loads nothing, changes nothing, and owns no menu or dialog.

## Related context

- The tree spike: findings 2 and 7, and the recommendation's five points.
- Context Manager's `client/components/tree-base/tree-base.ts`, for the key meanings and the ARIA
  pattern to keep the same. Borrow the behaviour, not the class.
- `FolderNode` in `packages/common/src/app.ts`; `html` and `render` in
  `@stillpointlab/common-format/html`; `<spl-icon>` in `packages/components/spl-icon`.

## Work package

- **Owns:** `packages/hosts/local/src/client/tree/` (the element, its styles, its tests) and
  `packages/hosts/local/dev/fixtures.ts`.
- **Starts from the scaffold:** the package, its place in the tooling and the harness's glob are
  the first commit of [host-server](host-server.md)'s PR, and this work starts from that commit.
  It adds no file outside the folders it owns (changed 2026-11-13, when the phase opened).
- **Does not import:** anything from the server, or `common-format/host`.

## Technical requirement

### The element

`<host-file-tree>`, defined through `defineElement`. It is page chrome, so it has no `whenReady`
and no conformance suite.

```ts
export interface TreeMark {
  /** Shown as a letter beside the name, and rolled up to every folder above as a dot. */
  status?: 'changed' | 'new' | 'moved' | 'deleted';
  /** An app mounted here: the row shows the app's icon and this label, not the folder's name. */
  app?: { label: string; icon: string; unlocked?: boolean };
}

export interface FileTreeElement extends HTMLElement {
  setNodes(nodes: readonly FolderNode[], marks?: Readonly<Record<string, TreeMark>>): void;
  /** The selected path. Setting it selects without raising an event. */
  selected: string | null;
  /** The open folders' paths. The host may store and restore them. */
  openPaths: readonly string[];
  /** Open every folder above the path, select it and scroll it into view. */
  reveal(path: string): void;
}
```

Events, all bubbling and composed, with `detail.path` and `detail.kind` (`'file'`, `'folder'` or
`'app'`):

| Event           | When                                                             |
| --------------- | ---------------------------------------------------------------- |
| `tree-select`   | a row is selected: a click, or the cursor moving onto it         |
| `tree-activate` | Enter, or a double click                                         |
| `tree-toggle`   | a folder opens or closes; `detail.open`                          |
| `tree-menu`     | a menu is asked for on a row; `detail.x` and `detail.y` place it |

A menu is asked for by a right click, the ContextMenu key, Shift+F10, or the row's own button
(shown on hover and on focus).

A right click on the empty space under the rows asks for one as well, for the served folder,
which has no row: `detail.path` is `''` and `detail.kind` is `'folder'`.
[file-operations](file-operations.md) answers it with New file… (added 2026-11-13, when the phase
opened).

### Rows

- Folders come before files; each group is sorted by name, with numbers in order.
- A closed folder's children are not rendered. Every folder starts closed.
- **An app row** is a node whose mark has `app`. With no children among the nodes it is a leaf;
  with children it opens and closes like a folder. Which of the two it is, the host decides by
  the nodes it passes. An unlocked app shows a mark of its own.
- File and folder names are text. A name with markup in it renders as that text.

### Keys and ARIA

The same as Context Manager's trees: Up and Down move the cursor; Right opens a folder, or moves
to its first child; Left closes it, or moves to its parent; Home and End; Enter activates. The
tree is one tab stop with a roving `tabindex`. Roles are `tree`, `treeitem` and `group`, with
`aria-expanded`, `aria-selected` and `aria-level`.

### Rendering

Markup goes through `html` and `render`, and styles use the shared tokens. `setNodes` with the
same paths keeps the open folders, the selection, the scroll position and the focused row. A
double click activates even though the first click selected the row.

### In the harness

The harness's glob takes `packages/hosts/*/dev/fixtures.ts` (the scaffold adds the line). The fixture mounts the tree as an
extra element with: a small folder, a deep folder, statuses on files, a locked and an unlocked
app, and hostile names.

## Clarifications

- **Size.** The spike's estimate is 350–450 lines with styles. A tree heading past 800 is the
  sign to stop and report, not to continue.
- **`tree-select` on an app row** is how the host opens the app. The tree does not know what an
  app is beyond the mark.
- **Status letters** are `M`, `N`, `R` and `D`, with a title that spells the word.

## Non-goals

The tree spike's list, as amended by the brief: drag and drop, rename in place, several rows
selected, a second tree to hand the cursor to, virtual scrolling, a filter, and type-ahead. Any
menu or dialog: the host owns those ([file-operations](file-operations.md)). Sharing code with
Context Manager's trees or its context picker.

## As built

_[#92](https://github.com/stillpointlab/surfaces/pull/92), 2026-11-14._

- **A shadow root.** The element scrolls itself and the page gives it a size. 629 lines with
  its model and styles.
- **A folder raises no `tree-activate`:** Enter and a double click open and close it.
- **A click on the selected row raises no second `tree-select`,** and asking for a menu does not
  select the row.
- **`reveal` raises `tree-toggle`** for each folder it opens, and no `tree-select`.
- **A folder missing from the nodes still has a row,** and the nodes' order does not matter.
- **The row's menu button is a text `⋯`.** `<spl-icon>` is used for an app's row only.
- **The keys move from the selected row,** as Context Manager's trees do.

## Acceptance / completion checklist

- [ ] Element tests in jsdom: rows and order; open and close; each key; each event with its
      detail; marks and their roll-up; an app row locked and unlocked; `reveal`; hostile names.
- [ ] `setNodes` with unchanged paths keeps the open folders, selection and focus.
- [ ] The ARIA attributes are present and change with the state.
- [ ] The harness shows the fixtures, in light and dark.
- [ ] `npm run check` is green.

## Implementation plan

1. The element with rows, open and close, and selection.
2. Keys, ARIA and the events.
3. Marks, app rows, `reveal`, the fixture and the tests.
