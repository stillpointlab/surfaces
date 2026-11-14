# @stillpointlab/local-host

A server over a folder on this machine, and the page it serves: an explorer on the left and a
pane that opens the selected file in its format's preview or editor, saving to disk. Private;
nothing here needs Context Manager. See the
[local host brief](../../../docs/tasks/stage4/phase1/briefs/local_host.md), the
[host-server spec](../../../docs/tasks/stage4/phase2/specs/host-server.md) and the
[host-page spec](../../../docs/tasks/stage4/phase2/specs/host-page.md), the
[file-operations spec](../../../docs/tasks/stage4/phase2/specs/file-operations.md) and
[git in the host](../../../docs/tasks/stage4/phase3/specs/git-in-the-host.md).

## Running it

- In this repository: `npm run serve -- <path> [--port <n>]` serves `<path>` (relative to where
  you typed it; the current folder by default) in development mode: the page from its sources
  through Vite, as middleware in the server's own process, so a change to the page or a format
  reloads it. It builds only what the server needs (`common` and `dist/server`).
- `surfaces [path] [--port <n>]`: the built page, with no Vite. In this repository `npx surfaces`
  once the package is built (`npm run build:common`, then
  `npm run build --workspace @stillpointlab/local-host`, which writes `dist/server` and
  `dist/client`), and anywhere once linked (`npm link` from `packages/hosts/local`). The port
  defaults to 5190. It binds to `127.0.0.1` only, and refuses a path that is not a folder and a
  port in use. The command is `bin/surfaces.js`, checked in so npm links it when it installs; it
  runs the built `dist/server/bin.js`.

## The page

`src/client`, built by `vite build` (`vite.config.ts`, from `src/server/client-build.ts`) to static
files in `dist/client` with relative paths, so a desktop shell can load the same files.

| Module           | What it is                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `main.ts`        | The entry: the HTTP client, the five formats, md's sanitizing renderer                   |
| `host-client.ts` | `HostClient` and `createHttpClient`: the only module that calls `fetch` or `EventSource` |
| `page.ts`        | `startPage`: the layout, the tree's events, the address, the host's events               |
| `pane.ts`        | `FilePane`: what is open, opening, saving, and a change on disk                          |
| `registry.ts`    | md, xmdl, sheet, image and code, in that order, with code as the fallback                |
| `markdown.ts`    | The renderer `<md-preview>` is given: markdown-it, then DOMPurify                        |
| `confirm.ts`     | One confirmation helper over `<modal-dialog>`                                            |
| `address.ts`     | `#/file/<path>` and `#/edit/<path>`                                                      |
| `stored.ts`      | The open folders in `localStorage`, by the root's id                                     |
| `words.ts`       | Everything the page says                                                                 |
| `tree/`          | `<host-file-tree>`                                                                       |
| `menu/`          | `HostMenu`: the page's one options menu, entries opened at a point                       |
| `file-ops/`      | Create, rename and delete: a row's menu entries, the dialogs, the checks and the writes  |

- **The address** names what is open: `#/file/<path>` for the preview, `#/edit/<path>` for the
  editor, each segment percent-encoded. Back and forward work, and a reload opens the same file.
- **Saving** (Save, Ctrl+S, Cmd+S) sends one `write` whose `base` is the version the file was
  opened or last saved at. A change on disk to the open file is read again and compared by
  version: with no unsaved edits it shows in place; with edits a banner offers Reload, and Save
  asks before it writes over the newer file. Leaving unsaved edits asks first.
- **Files are created, renamed and deleted** from a row's menu (right click, the row's `⋯`
  button, the ContextMenu key or Shift+F10): New file… on a folder and on the space under the
  rows, Rename… and Delete… on a file or a folder. Each write is one `put`, so renaming or
  deleting a folder is one `move` or `delete` per file under it, all or nothing; a rename is a
  `move` without content, so any file keeps its bytes. A path is checked before it is sent (not
  empty, no name after a last slash, no `..` segment, no leading slash, nothing listed there or
  above it, a folder not moved into itself) and the server's refusal shows in the same place.
  The open file follows a rename with its unsaved edits, and closes on a delete, which warns
  first when it has edits; a `move` or `delete` of the open file carries its version as `base`.
  A folder listed with nothing under it (a submodule, a nested repository), a folder holding
  one, and every folder while the list is cut (`truncated`) cannot be renamed or deleted here.
- **The menu** (`page.menu`) is the host's only one: `menu.open({ x, y, entries, label? })`
  shows `{ label, action, danger?, disabled?, title? }` entries at a point in the viewport,
  kept inside it, and replaces anything open. Escape, Tab, a click outside, a scroll and a
  resize close it; Escape, Tab and a choice give focus back (`returnFocus`, or what had focus).
  A row's entries are `page.fileOps.entriesFor({ path, kind })`; another kind of row, or an
  app's request, adds its own in the page's `tree-menu` listener.
- **Markdown is untrusted:** the page installs a renderer that sanitizes with DOMPurify before any
  md element mounts.
- **The content security policy** (`PAGE_POLICY` in `src/server/page.ts`, and the same `<meta>` in
  `src/client/index.html`) lets scripts come from the page's own origin alone. Styles may also be
  inline, because the elements write their stylesheets into their shadow roots at run time.
  Images may be `data:` and `blob:` URLs as well; nothing loads from another origin.
- **The workspace packages** resolve to their sources in the build and in development mode
  (`workspaceAliases`), so each module exists once and the client needs no other package built.

## As a library

`createHost({ root, origin })` answers the web's `Request` with a `Response`; `close()` ends its
event streams and its watcher. The `bin` is `nodeListener` around it on `node:http`, and a desktop
shell can serve the same handler under its own scheme. `createNodePort({ root })` is the
`StoragePort` (from `@stillpointlab/common-format/host`) over the folder.

## Routes

| Route                  | Answers                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `GET /api/list`        | `{ nodes, truncated }`: every file and folder; past 20,000 nodes cut, and saying so         |
| `GET /api/file?path=`  | `{ ok: true, text, version }`, or a refusal                                                 |
| `GET /api/raw?path=`   | the bytes, typed by extension, with `nosniff` and `Content-Security-Policy: sandbox`        |
| `PUT /api/files`       | body `{ changes: PortChange[] }`; `{ ok: true, versions }`, or a refusal                    |
| `GET /api/status`      | `{ [path]: status }`: what differs from `HEAD`, deleted files included (`{}` outside git)   |
| `GET /api/git`         | `{ state, branch }`: `repository`, `no-repository` or `no-git`; `branch` `null` if detached |
| `GET /api/changes`     | `{ ok: true, changes }`, each `{ path, status, from? }` (`from` for a moved file)           |
| `GET /api/base?path=`  | `{ ok: true, text }`: the file's text at `HEAD`, under its old path when it moved           |
| `GET /api/root`        | `{ name, id }`: the folder's name, and a SHA-256 of its real path                           |
| `GET /api/events`      | server-sent events (below)                                                                  |
| `GET /`, `GET /<file>` | the page: `dist/client`, or Vite in development mode (any path outside `/api/`)             |

A path is relative to the root with `/` separators, in the `path` query (percent-encoded as any
query value). A version is a SHA-256 of the file's bytes, as hex; only equality matters.

**Refusals** are `{ ok: false, code, message }`:

| Status | Codes                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------- |
| 404    | `HOST_FILE_NOT_FOUND`, and `HOST_NO_ROUTE` for a route that does not exist                                                |
| 409    | `HOST_PATH_EXISTS`, `HOST_FILE_CHANGED`; `HOST_NOT_A_REPOSITORY`, `HOST_GIT_NOT_FOUND` (a git route outside `repository`) |
| 400    | `HOST_PATH_OUTSIDE_ROOT`, `HOST_NOT_TEXT`, `HOST_FILE_TOO_LARGE`, `HOST_BAD_REQUEST`                                      |
| 403    | `HOST_FORBIDDEN`: the `Host`, `Origin` or `Sec-Fetch-Site` checks below                                                   |
| 405    | `HOST_METHOD_NOT_ALLOWED`, with an `Allow` header                                                                         |
| 413    | `HOST_BODY_TOO_LARGE`: a `PUT` body over 64 MiB                                                                           |
| 500    | `HOST_WRITE_FAILED`: a write failed part way (a full disk); what it wrote was taken back                                  |
| 500    | `HOST_GIT_FAILED`: git ran and failed (its message says why)                                                              |

**Events** are unnamed server-sent events, one JSON object per `data:` line:
`{"type":"changed","paths":[...]}` (these files' contents changed, appeared or went),
`{"type":"listed"}` (the set of paths changed, so the list is stale) and `{"type":"status"}`
(git's `HEAD` or index changed: a commit, a stage or a switch, the host's own staging
included, so the statuses are stale). The stream opens with `retry: 1000` and sends a comment
every 25 seconds. The server's own writes are reported too.

## `put`

- **All or nothing.** Every change is checked first (paths, `base`s, what exists); one refusal
  refuses the call and writes nothing. A path is named once per call.
- **Writes** go through a temporary file (`.<name>.surfaces-tmp-<hex>`, passed over by the
  listing and the watcher) and a rename. A file a write replaces, or a move or delete removes, is
  kept aside until the call ends, so a failure part way puts everything back. Folders a move or
  delete leaves empty are removed; a create makes the folders it needs.
- **One at a time.** Two calls at once run in turn, so the second's bases are checked against
  what the first wrote.
- A `write` through a symbolic link writes the link's target and keeps the link; a `move` or a
  `delete` acts on the link itself. A `move` without `content` keeps the file's bytes.
- **In a repository, a `move` or `delete` of a tracked file is staged** once it is written, as
  `git mv` and `git rm` would have: the old path's index entry goes to the new path, or is
  removed (`git update-index --index-info`, one call for the whole `put`). So git reports a
  rename however much the file was edited, edits that were not staged stay unstaged, and a file
  moved into an ignored folder stays tracked. An untracked file, a file in conflict, a `write`
  and a `create` stage nothing. If staging fails (another git holds `index.lock`), the write
  stands, `put` succeeds, and the host warns on its terminal.

## Safety

- **Confinement.** A path is refused when it is absolute, has a `..`, `.`, empty or NUL segment,
  or a backslash, or names git's folder (`.git` in any case, with the characters HFS+ ignores or
  the trailing dots and spaces Windows drops, and `git~1`); or when the real path of the nearest
  thing that exists along it, or of the folder that holds it, is outside the real root. A
  symbolic link that leaves the root is listed and cannot be opened, written, moved or deleted.
- **The page's files.** `createStaticPage(dir)` lists the folder's regular files (no links, no
  dot-files) and answers a request only when its path, exactly as sent, is one of them, so no
  request path can leave `dist/client`. In development mode the same request checks stand in front
  of everything Vite serves, and Vite's HMR socket opens only for the host's own `Host` and
  `Origin` (and Vite's own token).
- **Requests.** The `Host` must be the host's own (`127.0.0.1:<port>` or `localhost:<port>`). A
  request that is not a `GET` must carry the host's `Origin` (or its `localhost` twin). Any
  request whose `Origin` is another, and any the browser marks `Sec-Fetch-Site: cross-site` or
  `same-site` (except a navigation), is refused.

## Git

`src/server/git/`: `run.ts` runs `git` (an argument list, a timeout, `GIT_OPTIONAL_LOCKS=0` for
reads, standard input when asked); `repository.ts` is the host's git (`createGit`, the port's
`git`); `status.ts` reads `git status --porcelain=v2 -z` into changes; `stage.ts` plans the
staging. Nothing else runs git.

- **Three states, decided once at start** (`GET /api/git`): `repository` when git runs and the
  root is in a work tree; `no-git` when git cannot be run and a `.git` entry (a folder or a
  file) is in the root or above it; `no-repository` otherwise. Outside `repository` the status
  is `{}`, the git routes refuse, and a write stages nothing.
- **A served root inside a repository** sees only its own paths, relative to itself. A rename
  across its edge is half of one: in from outside is `new`, out to elsewhere is `deleted`.
- **The statuses:** untracked, added and intent-to-add files are `new`; a staged rename is
  `moved` on its new path (a move made with plain `mv` is a deletion and a new file until it is
  staged); a file gone from disk or removed from the index is `deleted`; a modified, type-changed
  or conflicted file is `changed`; a file added and then deleted from disk is left out.
  Submodules are left out.
- **`HEAD` text** is the blob as committed (`git cat-file blob`), with no filters run, so
  nothing reaches the network. A symbolic link, a blob that is not text, and one over 2 MiB are
  refused as `HOST_NOT_TEXT` and `HOST_FILE_TOO_LARGE`.
- **Paths are literal** (`--literal-pathspecs`): a file named `*.md` is that file.

## The listing and the watcher

- In a git work tree the list is `git ls-files --cached --others --exclude-standard`, with files
  gone from disk left out; elsewhere a walk that skips `.git` and `node_modules`. When `git`
  cannot be run and the folder looks like a repository, the `bin` says "git was not found; listing
  every file". A submodule or a nested repository is listed as one folder with nothing under it.
- The watcher watches each folder that holds a listed file (not the root recursively, which on
  Linux watches each file by itself and loses one replaced by a rename), joins bursts within
  100 ms, and lists again when a name comes or goes. `watchNames(folder, names, onChange)` watches
  names in a folder outside the root: in a repository, `HEAD` and `index` in git's own folder
  (`git rev-parse --absolute-git-dir`: a worktree's own, and above a served subfolder), which
  sends `status`. The host's own reads never write the index, so reading after the event raises
  no other.
