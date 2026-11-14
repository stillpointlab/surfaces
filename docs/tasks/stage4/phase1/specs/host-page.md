---
column: todo
created: 2026-11-13T18:36:00-07:00
tags: [dev-tooling, formats, code, major-feature]
---

# Spec: the local host's page

_The [local host brief](../briefs/local_host.md), outcome 1. Stage 4, phase 2, second wave: after
[format-descriptors](format-descriptors.md), [host-server](host-server.md) and
[explorer-tree](explorer-tree.md) have merged. One PR here._

## High-level goal

`npm run serve -- <path>` opens a folder in the browser: the explorer on the left, and a pane
that shows the selected file in its format's preview or editor. Edits save to disk, and a change
made on disk shows in the page.

## Related context

- The brief's outcome 1 (the changed-on-disk flow and its draft words) and its constraints (one
  client interface; the client builds to static files).
- The three first-wave specs, whose contracts this one reads and does not change.
- Context Manager's `client/utils/markdownPreview.ts`: how a host makes `<md-preview>` safe.
- `<modal-dialog>` in `packages/components/modal-dialog`.

## Work package

- **Owns:** `packages/hosts/local/src/client/` except `tree/`; the package's Vite config and
  client build; the server's `/` route and its development mode.
- **Reads, does not change:** `StoragePort` and the routes (host-server), the registry
  (format-descriptors), `<host-file-tree>` (explorer-tree).
- **Runs alone** in its wave.

## Technical requirement

### One client interface

```ts
export type HostEvent = { type: 'changed'; paths: string[] } | { type: 'listed' };

export interface HostClient {
  list(): Promise<{ nodes: FolderNode[]; truncated: boolean }>;
  get(path: string): Promise<Result<{ text: string; version: string }>>;
  /** A URL an element can load the file from. */
  urlFor(path: string): string;
  put(changes: readonly PortChange[]): Promise<Result<{ versions: Record<string, string> }>>;
  status(): Promise<Record<string, FileStatus>>;
  watch(listener: (event: HostEvent) => void): () => void;
}
```

`createHttpClient(base)` implements it over the server's routes. It is the only module in the
client that calls `fetch` or `EventSource`; an ESLint rule on the client folder enforces it.
Later specs add methods here, never a second way to reach the server.

### The layout

- **Left:** `<host-file-tree>`, fed by `list()` and `status()`, and again on a `listed` event.
  The open folders are kept in `localStorage` by root, read and written inside `try`.
- **Right:** the pane. Its header shows the path, a **Preview / Edit** switch when the format has
  an editor, a **Save** button and an unsaved mark. Its body holds one element.
- **The address** names what is open, in the fragment: `#/file/<path>` for the preview and
  `#/edit/<path>` for the editor. Back and forward work, and a reload opens the same file.

One file is open at a time.

### Opening a file

1. `tree-select` opens the file in its preview; `tree-activate` opens it in its editor, or its
   preview when it has none. A folder row only opens and closes.
2. The registry's `find(path)` picks the format. Nothing found: `get` the file, and if it is
   text, use the registry's `fallback`.
3. A format that needs a URL gets `urlFor(path)`. A format that needs text gets `get(path)`.
4. The page loads the entry, creates the element, places it, and calls the descriptor's `apply`.

What the pane says when it cannot open a file:

| Case                                   | The pane says                                    |
| -------------------------------------- | ------------------------------------------------ |
| `HOST_NOT_TEXT`, and no format matched | "No format opens this file, and it is not text." |
| `HOST_FILE_TOO_LARGE`                  | "This file is too large to open here."           |
| `HOST_FILE_NOT_FOUND`                  | "There is no file at this path."                 |
| `HOST_PATH_OUTSIDE_ROOT`               | "This path leads outside the served folder."     |

### Markdown is untrusted

`<md-preview>`'s default renderer does not sanitize. Before any file opens, the page installs a
renderer that sanitizes the rendered markup, as Context Manager does. The sanitizer is a
dependency of this package only. The page is also served with a content security policy that
allows scripts from the host's own origin alone.

### Editing and saving

- A `content-change` from the editor marks the file unsaved.
- **Save** (the button, Ctrl+S or Cmd+S) calls `put` with one `write` whose `base` is the version
  the file was opened or last saved at. Success takes the new version and clears the mark.
- Leaving an unsaved file (another row, the switch to Preview, back) asks first: "Discard your
  unsaved edits to `<name>`?" (Discard, Cancel). Closing the tab uses `beforeunload`.

### A change on disk

On a `changed` event that names the open file, the page reads it again and compares versions, so
its own save raises nothing.

- **No unsaved edits:** the element is given the new content, in place.
- **Unsaved edits:** the banner, with the brief's words (a draft Jamie may change):
  - banner: "This file changed on disk after you opened it. Your edits are not saved." with a
    **Reload** button;
  - Reload asks: "Reload from disk? Your unsaved edits will be lost." (Reload, Cancel);
  - Save while the banner shows asks: "Save over the newer file? The file on disk changed after
    you opened it, and saving replaces those changes with yours." (Save anyway, Cancel). Save
    anyway sends the newer version as the `base`.
- **A save refused with `HOST_FILE_CHANGED`** shows the same banner: the server's check does not
  depend on the event having arrived.
- **The file was deleted:** with no edits, the pane says so. With edits, the banner reads "This
  file was deleted on disk. Your edits are not saved.", and Save asks before creating it again.

### Building and development

- `vite build` writes static files to `dist/client`, with relative asset paths. The server
  serves them at `/`.
- `npm run serve -- <path>` runs in development mode: Vite as middleware in the same process,
  with the workspace packages resolved to their sources, so a change to a format reloads the
  page.

## Clarifications

- **Confirmations** are one helper over `<modal-dialog>`, not `window.confirm`.
- **Light and dark** follow `prefers-color-scheme`, with the shared tokens.
- **The raw view and keymap modes** are the elements' own; the page adds no control for them.
- **`status()` is empty** until [git-in-the-host](git-in-the-host.md); the tree shows no marks.

## Non-goals

- Creating, renaming and deleting files: [file-operations](file-operations.md).
- Tabs, split panes, search, and a resizable explorer.
- Apps in the tree. A manifest is a file like any other until
  [apps-in-the-local-host](../../../stage5/phase1/specs/apps-in-the-local-host.md).

## Acceptance / completion checklist

- [ ] From a clean checkout, `npm run serve -- <path>` opens a folder; each of the five formats
      previews, and the four with editors edit and save.
- [ ] A text file with no matching format opens as plain code; a binary one says it cannot open.
- [ ] Tests for the client with a fake `HostClient`: open by address, the unsaved mark, save, a
      refused save, each branch of the changed-on-disk flow, and the discard confirmation.
- [ ] A markdown file with a script in it does not run the script (a test, and by hand).
- [ ] No module but the HTTP client calls `fetch` or `EventSource` (the lint rule fails if one
      does).
- [ ] The built client loads from the server with no development server running.
- [ ] `npm run check` is green.

## Implementation plan

1. The client interface, its HTTP implementation and the lint rule.
2. The layout, the tree wiring and the address.
3. Opening files through the registry, with the sanitizing renderer.
4. Editing, saving and the changed-on-disk flow.
5. The build and development mode.
