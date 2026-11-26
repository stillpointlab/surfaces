# @stillpointlab/local-host

A server over a folder on this machine, and the page it serves: an explorer on the left and a
pane that opens the selected file in its format's preview or editor, saving to disk. Private;
nothing here needs Context Manager. See the
[local host brief](../../../docs/tasks/stage4/phase1/briefs/local_host.md), the
[host-server spec](../../../docs/tasks/stage4/phase2/specs/host-server.md) and the
[host-page spec](../../../docs/tasks/stage4/phase2/specs/host-page.md), the
[file-operations spec](../../../docs/tasks/stage4/phase2/specs/file-operations.md) and
[git in the host](../../../docs/tasks/stage4/phase3/specs/git-in-the-host.md), and
[apps in the local host](../../../docs/tasks/stage5/phase3/specs/apps-in-the-local-host.md), and
[a token for the run](../../../docs/tasks/stage6/phase1/specs/a-token-for-the-run.md).

## Running it

- In this repository: `npm run serve -- <path> [--port <n>]` serves `<path>` (relative to where
  you typed it; the current folder by default) in development mode: the page from its sources
  through Vite, as middleware in the server's own process, so a change to the page or a format
  reloads it. It builds only what the server needs (`build:deps`, which includes the apps'
  modules the server runs, and `dist/server`).
- `surfaces [path] [--port <n>]`: the built page, with no Vite. In this repository `npx surfaces`
  once the package is built (`npm run build:common`, then
  `npm run build --workspace @stillpointlab/local-host`, which writes `dist/server` and
  `dist/client`), and anywhere once linked (`npm link` from `packages/hosts/local`). The port
  defaults to 5190. It binds to `127.0.0.1` only, and refuses a path that is not a folder and a
  port in use. It prints the address to open, with the run's token in it
  (`Serving <root> at http://127.0.0.1:5190/?token=<token>`): see
  [Who the host answers](#who-the-host-answers). The command is `bin/surfaces.js`, checked in so npm links it when it installs; it
  runs the built `dist/server/bin.js`.

## The page

`src/client`, built by `vite build` (`vite.config.ts`, from `src/server/client-build.ts`) to static
files in `dist/client` with relative paths, so a desktop shell can load the same files.

| Module           | What it is                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `main.ts`        | The entry: the HTTP client, the seven formats, md's sanitizing renderer                  |
| `host-client.ts` | `HostClient` and `createHttpClient`: the only module that calls `fetch` or `EventSource` |
| `page.ts`        | `startPage`: the layout, the tree's events, the address, the host's events, undo, redo   |
| `pane.ts`        | `FilePane`: what is open, opening, saving, a change on disk, and the Changes view        |
| `registry.ts`    | md, xmdl, sheet, image, audio, video and code, in that order, with code as the fallback  |
| `markdown.ts`    | The renderer `<md-preview>` is given: markdown-it, then DOMPurify                        |
| `confirm.ts`     | One confirmation helper over `<modal-dialog>`                                            |
| `address.ts`     | `#/file/<path>`, `#/edit/<path>`, `#/diff/<path>` and `#/app/<manifestPath>…`            |
| `stored.ts`      | The open folders in `localStorage`, by the root's id                                     |
| `words.ts`       | Everything the page says                                                                 |
| `tree/`          | `<host-file-tree>`                                                                       |
| `menu/`          | `HostMenu`: the page's one options menu, entries opened at a point                       |
| `file-ops/`      | Create, rename and delete: a row's menu entries, the dialogs, the checks and the writes  |
| `commit/`        | The commit over `<checkin-review>` (`review.ts`) and its pure parts (`rows.ts`)          |
| `apps/`          | The apps' registration, the app pane, the tree's view of the apps, the page's host ops   |

- **The address** names what is open: `#/file/<path>` for the preview, `#/edit/<path>` for the
  editor and `#/diff/<path>` for the Changes view, each segment percent-encoded. Back and
  forward work, and a reload opens the same file.
- **Git.** The page asks `GET /api/git` once. In a repository the tree's marks are the
  statuses (`GET /api/status`), read again on a `changed` or `status` event, and a `changed` or
  `moved` file in a format that takes text offers **Changes** beside Preview and Edit: `<code-diff>`
  with the text at `HEAD` on the left (`GET /api/base`; a moved file's under its old path) and
  the file on the right, read again when either moves. The switch comes and goes with the
  status without touching the editor or its edits; a Changes view whose file stops being changed
  (a commit) goes to the preview. An image has no Changes. Over the view, **Whitespace** chooses
  how it is treated (Compared, Ignored or Shown: `<code-diff>`'s `ignore-whitespace` and
  `show-whitespace`), and the page keeps the choice. The view compares lines and not their
  endings, so beside it the page says when the two sides' line endings differ (git may count
  every line as changed where the view marks none), and when they differ in whitespace alone.
  When git was not found and the folder
  looks like a repository, the explorer says "git was not found, so changes and commit are
  off."; outside a repository the page shows nothing of git and calls none of its routes.
- **Commit.** In a repository the explorer's header holds a **Commit** button with the number of
  changed files (one per moved file, deleted files included), disabled when nothing has changed.
  It reads the branch and the changes (the button is `aria-busy` meanwhile, and shows a spinner
  in place of its count once the read has taken 150 ms), then opens the check-in review
  (`@stillpointlab/checkin-review-component`), the same element an app's shell holds: every
  changed file checked, in the tree's order (folders first, numbered names in order), its status
  as its label (coloured by `[data-label]` in `page.scss`) and a moved file as old → new, with an
  All box; a summary (required) and details, sent as one message; the current branch or a new one
  by name (only a new one when `HEAD` is detached). A read that fails, or finds nothing changed,
  says so in the notice and opens nothing. Commit says what is missing (no file, no summary, no
  branch name) under the form and puts focus there, so the button is never disabled without a
  reason. While the commit runs the form is held, and Escape and the close button wait. A
  refusal, git's own words included, shows under the form as text (git's in a monospace face,
  by the line's `data-code`; the others as sentences), the review keeps everything,
  and focus goes to the field it is about (`HOST_BRANCH_*` the branch, `HOST_COMMIT_NO_MESSAGE`
  the summary, `HOST_COMMIT_NO_PATHS` the files) or to the refusal. When the changes move while
  it is open, or after `HOST_NOT_CHANGED`, it reads them again: checks are kept, a new row starts
  unchecked; a read that fails then is said under the form. Unsaved edits in the open file are
  not in a commit, and the review says so. After a commit the marks are read at once, the branch
  is the commit's, and a notice under the header (a live region) says "Committed `<short id>` on
  `<branch>`." until it is dismissed or the next commit replaces it. The request is
  `{ paths, message, branch? }` (`commitRequestOf` in `commit/rows.ts`), sent by
  `HostClient.commit`.
- **Saving** (Save, Ctrl+S, Cmd+S) sends one `write` whose `base` is the version the file was
  opened or last saved at. A change on disk to the open file is read again and compared by
  version: with no unsaved edits it shows in place; with edits a banner offers Reload, and Save
  asks before it writes over the newer file. Leaving unsaved edits asks first.
- **A file in a format that takes a URL** (an image, audio) is not read by the page: its element
  loads it from the raw route. As it opens, the pane asks for the file's validator
  (`HostClient.probe`, a `GET` of its first byte), and the address it hands the element names
  it (`/api/raw/<path>?rev=<validator>`). A change event for the file, and the event stream's
  return, ask again: the same validator changes nothing, so a track that plays plays on through a
  hidden tab or a dropped stream; another one makes a new element at the new address, which the
  browser loads anew (a track that played starts again at its start); a file gone says so. A
  probe that learns nothing (the host away) leaves the element as it is.
- **Files are created, renamed and deleted** from a row's menu (right click, the row's `⋯`
  button, the ContextMenu key or Shift+F10): New file… on a folder and on the space under the
  rows, Rename… and Delete… on a file or a folder. Each write is one `put`, so renaming or
  deleting a folder is one `move` or `delete` per file under it, all or nothing; a rename is a
  `move` without content, so any file keeps its bytes. A path is checked before it is sent (not
  empty, no name after a last slash, no `..` segment, no leading slash, nothing listed there or
  above it, a folder not moved into itself) and the server's refusal shows in the same place.
  The open file follows a rename with its unsaved edits, taking what its new path implies (a
  code file's language) through the format's `applyPath`, and closes on a delete, which warns
  first when it has edits; a `move` or `delete` of the open file carries its version as `base`.
  The delete question, and the second one for a delete the host cannot undo, open with the focus
  on Cancel, and a repeating Enter answers nothing in the dialog: the Enter that chose the menu's
  entry is still down when it opens.
  A folder listed with nothing under it (a submodule, a nested repository), a folder holding
  one, and every folder while the list is cut (`truncated`) cannot be renamed or deleted here.
  Such a folder's row has no chevron, since it would open to nothing, and its name ends in a
  slash.
- **The menu** (`page.menu`) is the host's only one: `menu.open({ x, y, entries, label? })`
  shows `{ label, action, danger?, disabled?, title? }` entries at a point in the viewport,
  kept inside it, and replaces anything open. An entry's `title` (why it is disabled) is a line
  of text under its label, not a tooltip, so the keyboard and a touch read it. Escape, Tab, a click outside, a scroll and a
  resize close it; Escape, Tab and a choice give focus back (`returnFocus`, or what had focus).
  A row's entries are `page.fileOps.entriesFor({ path, kind })`; another kind of row, or an
  app's request, adds its own in the page's `tree-menu` listener.
- **Apps** (`apps/`, the server's `src/server/apps/`). Each side has one registration: the
  server's list of modules (`createHost`'s `apps`, inventory and tasks by default) with the
  host ops it answers (`hostOps`), and the page's `createAppRegistry()` (per app id: its
  `./meta`, how to load its `./shell` and its `./create-element`, and the host ops the page
  answers). A folder with a manifest is one row in the tree, named for the app; an
  instance at the served root has a row above the tree. Every run starts locked: the instance's
  files are left out of the tree (the listing stays whole) and the server refuses a
  `PUT /api/files` into them. The row's menu offers Open and "Show files…" (asked first), or
  Open, "Lock files" and "New file…". A folder above locked files cannot be renamed or deleted
  here, and a locked file opens in its preview. The app opens at `#/app/<manifestPath>`, then
  its own sub-path and query, in the app pane beside the file pane; the pane resolves the page
  on the server, answers the shell's ops, opens the page's menu for `open-options-menu`, and
  reads the page again on the host's events. The shell's input carries `checkin`: the commit's
  words and, in a repository, the branch, read again each time it is set, with a new one
  offered. A shell's check-in review asks `checkin`, and the pane answers it with the page's
  commit: the title as the summary ("`<the instance's label>` check-in" when there is none, which
  the pane also gives the shell as `checkin.defaultTitle`), the body as the
  details, `branch` a new branch; `done` with the commit notice's words, or the refusal as it
  is. The commit's `status` event resolves the page again, so the app's marks clear. A folder's menu, and the space under the rows,
  offer "Create <noun> here…" for each app with a create form: a dialog with the folder, the
  app's root consent where it asks one, and the app's own form.
- **The notice** under the explorer's header is the page's one: a commit, an app's
  notification, or what a lock reports. A page left open while its server started again says
  "This page’s server was started again. Open the address its terminal printed." there, with no
  close button, and nothing replaces it.
- **Markdown is untrusted:** the page installs a renderer that sanitizes with DOMPurify before any
  md element mounts.
- **The content security policy** (`PAGE_POLICY` in `src/server/page.ts`, and the same `<meta>` in
  `src/client/index.html`) lets scripts come from the page's own origin alone. Styles may also be
  inline, because the elements write their stylesheets into their shadow roots at run time.
  Images may be `data:` and `blob:` URLs as well, and media `blob:` URLs, through which a
  streaming library feeds a `<video>`; nothing loads from another origin.
- **The workspace packages** resolve to their sources in the build and in development mode
  (`workspaceAliases`), so each module exists once and the client needs no other package built.

## As a library

`createHost({ root, origin, token })` answers the web's `Request` with a `Response`; `close()` ends its
event streams and its watcher. The `bin` is `nodeListener` around it on `node:http`, and a desktop
shell can serve the same handler under its own scheme. `createNodePort({ root })` is the
`StoragePort` (from `@stillpointlab/common-format/host`) over the folder, with `commit(request)`
beside it: `HostCommitRequest` in, `HostCommit` out, under the port's write lock. The port runs
`common`'s storage port suite over a repository in a temporary folder
(`src/server/port-suite.test.ts`), the same suite the memory port runs.

## Routes

| Route                   | Answers                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /api/list`         | `{ nodes, truncated }`: every file and folder; past 20,000 nodes cut, and saying so                  |
| `GET /api/file?path=`   | `{ ok: true, text, version }`, or a refusal                                                          |
| `GET /api/raw/<path>`   | the bytes, typed by extension, with `nosniff` and `Content-Security-Policy: sandbox`; in ranges      |
| `PUT /api/files`        | body `{ changes: PortChange[], unjournaled?: true }`; `{ ok: true, versions }`, or a refusal         |
| `GET /api/journal`      | `{ ok: true, undo, redo }`: the label of the step each would take next, or `null`                    |
| `POST /api/undo`        | `{ ok: true, label, moved: [{ from, path }], deleted }`: what undoing the newest step did            |
| `POST /api/redo`        | the same, for the step last undone                                                                   |
| `GET /api/status`       | `{ [path]: status }`: what differs from `HEAD`, deleted files included (`{}` outside git)            |
| `GET /api/git`          | `{ state, branch }`: `repository`, `no-repository` or `no-git`; `branch` `null` if detached          |
| `GET /api/changes`      | `{ ok: true, changes }`, each `{ path, status, from? }` (`from` for a moved file)                    |
| `GET /api/base?path=`   | `{ ok: true, text }`: the file's text at `HEAD`, under its old path when it moved                    |
| `POST /api/commit`      | body `{ paths, message, branch?, onBranch? }`; `{ ok: true, commit, short, branch }`, or a refusal   |
| `GET /api/root`         | `{ name, id }`: the folder's name, and a SHA-256 of its real path                                    |
| `GET /api/apps`         | `{ apps }`: every instance found (`FoundInstance`), valid or not, locked or not                      |
| `POST /api/apps/lock`   | body `{ manifestPath, locked }`; `{ ok: true, errors, warnings }` (on lock, the lifecycle's)         |
| `GET /api/apps/page`    | `?manifestPath=&path=&query=`; `{ ok, view, state, extras?, title, revision }` or `{ ok, redirect }` |
| `GET /api/apps/project` | `?manifestPath=&view=<JSON>`; `{ ok: true, state, revision }`                                        |
| `POST /api/apps/op`     | body `{ manifestPath, op, view? }`; `{ ok: true, reply, revision, notice? }`                         |
| `POST /api/apps/create` | body `{ app, folder, confirmRoot?, input }`; `{ ok: true, manifestPath, notice? }`                   |
| `GET /api/events`       | server-sent events (below)                                                                           |
| `GET /`, `GET /<file>`  | the page: `dist/client`, or Vite in development mode (any path outside `/api/`)                      |

A path is relative to the root with `/` separators, in the `path` query (percent-encoded as any
query value). A version is a SHA-256 of the file's bytes, as hex; only equality matters.

**The raw route** takes the path in the address's own path, each segment percent-encoded
(`/api/raw/docs/a%20b.png`), so an address relative to a file resolves to its neighbour: a
playlist's `seg0.m4s` is `/api/raw/docs/seg0.m4s`. Any query (the page's `?rev=<validator>`, which only the browser's caches read) is ignored.
The rest of the address after `/api/raw/` is decoded once, whole, and checked as any path is,
so an encoded `..%2F` is refused. The URL parser has already resolved `.` and `..` segments, in
any spelling (`%2e%2e`), and read a backslash as `/`: an address that climbs out of `/api/raw/`
is no route's. A trailing slash is an empty segment, and refused. Every answer carries
`Accept-Ranges: bytes`. One range (`bytes=a-b`, `bytes=a-`, `bytes=-n`) is answered `206` with
its `Content-Range`, and only that part of the file is read; one with no byte of the file in it,
`416` with `Content-Range: bytes */<size>`. Several ranges, or a header that does not parse, are
answered with the whole file. `HEAD` is not answered.

**The browser may keep a raw file.** Each answer of the file, whole or in a range, carries its
validator, `ETag` (its size and the time it was last written, from the `stat` that reads its
size), and `Cache-Control: no-cache`: the browser keeps what it was sent and asks the route
before it uses any of it again. An `If-None-Match` that names the file's tag is answered `304`
with no body, so a seek back into a part a player has already played is not downloaded again; a
file changed on disk has another tag, and is sent again. A range under an `If-Range` that is not
the file's tag (another file's, a weak tag, a date) is answered with the whole file, so no part
of one file is laid beside parts of another. A refusal, a `416` included, stays `no-store`, as
every other route's answer does: nothing but a file's bytes is kept, and each use of them is
still asked of the route, its checks and the token.

**Refusals** are `{ ok: false, code, message }`:

| Status | Codes                                                                                                                        |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 404    | `HOST_FILE_NOT_FOUND`, and `HOST_NO_ROUTE` for a route that does not exist                                                   |
| 404    | `HOST_APP_NOT_FOUND` (no instance at the manifest path), `HOST_APP_PAGE_NOT_FOUND` (the app has no page there)               |
| 409    | `HOST_SCOPE_LOCKED`: a `PUT /api/files` change's path, or a move's `from`, is in a locked app's files                        |
| 409    | `HOST_APP_INVALID`: an app route for an instance discovery marks invalid (its manifest, or an overlap)                       |
| 409    | `HOST_APP_OVERLAP`: a create whose region would share a path with a found instance's                                         |
| 409    | `HOST_NOTHING_TO_RESOLVE`: tasks' `resolve`, since a folder has no upstream to differ from                                   |
| 409    | `HOST_NOTHING_TO_UNDO`, `HOST_NOTHING_TO_REDO`; `HOST_UNDO_CONFLICT` with the `path` that changed since the step             |
| 409    | `HOST_CANNOT_UNDO` with its `reason` (`too-large`, `not-text`, `link`): send the same changes again with `unjournaled: true` |
| 409    | `HOST_PATH_EXISTS`, `HOST_FILE_CHANGED`; `HOST_NOT_A_REPOSITORY`, `HOST_GIT_NOT_FOUND` (a git route outside `repository`)    |
| 409    | A commit: `HOST_NOT_CHANGED`, `HOST_PATH_CONFLICTED`, `HOST_GIT_IN_PROGRESS`, `HOST_DETACHED_HEAD`, `HOST_BRANCH_EXISTS`     |
| 400    | `HOST_PATH_OUTSIDE_ROOT`, `HOST_PATH_INVALID`, `HOST_NOT_TEXT`, `HOST_FILE_TOO_LARGE`, `HOST_BAD_REQUEST`                    |
| 400    | A commit: `HOST_COMMIT_NO_PATHS`, `HOST_COMMIT_NO_MESSAGE`, `HOST_BRANCH_INVALID`                                            |
| 403    | `HOST_FORBIDDEN`: the `Host`, `Origin` or `Sec-Fetch-Site` checks, and a raw file asked for to run (below)                   |
| 416    | `HOST_RANGE_NOT_SATISFIABLE`: a raw file's range with no byte of the file in it, with `Content-Range: bytes */<size>`        |
| 403    | `HOST_TOKEN_REQUIRED`: no run's token (below); outside `/api/` a plain page with the same words                              |
| 405    | `HOST_METHOD_NOT_ALLOWED`, with an `Allow` header                                                                            |
| 413    | `HOST_BODY_TOO_LARGE`: a `PUT` body over 64 MiB                                                                              |
| 422    | `HOST_GIT_FAILED`: git ran and failed (its message says why). The repository is the person's to put right, so not a 500      |
| 500    | `HOST_WRITE_FAILED`: a write failed part way (a full disk); what it wrote was taken back                                     |

**Events** are unnamed server-sent events, one JSON object per `data:` line:
`{"type":"changed","paths":[...]}` (these files' contents changed, appeared or went),
`{"type":"listed"}` (the set of paths changed, so the list is stale), `{"type":"apps"}` (the
instances found, or a lock, changed), `{"type":"journal"}` (the steps undo and redo would take
changed) and `{"type":"status"}`
(git's `HEAD` or index changed: a commit, a stage or a switch, the host's own staging
included, so the statuses are stale). The stream opens with `retry: 1000` and sends a comment
every 25 seconds. The server's own writes are reported too.

When the stream drops and comes back, the page's client says `listed`, `journal` and then
`reconnected`, its own word and not the server's: the page lists again, and reads the open file
again, since a change made meanwhile was sent to nobody. The browser reconnects by itself only
after a dropped connection: a stream answered with anything else (the command's `503`
"Starting." while it starts) it gives up, and the client opens it again a second later.

A page of an earlier run (its server was started again) is refused every request. The client
says `restarted`, once, when a call is refused with `HOST_TOKEN_REQUIRED` or the stream fails and
`GET /api/root` is, and then closes the stream for good; the page says so in its notice, and
disables Undo, Redo and Commit, which the server would refuse, their titles saying why. The rest
is refused as it is tried: the explorer's create, rename and delete, a save, and a commit review
already open show the refusal in their own dialog or banner, and an app's op, whose app shows its
failures in the page's notice, shows it under the notice's words.

The client holds its stream only while the tab shows. A browser allows six connections to one
host over HTTP/1.1 across all its tabs, and a stream holds one for good, so a stream in every
tab left the sixth tab's requests, and then every tab's, waiting. A hidden tab closes its stream;
shown again it opens one and says the same three words.

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

## Undo and redo

`src/server/journal/`: the journal, in the server's memory for the run. It wraps the port,
git's index (`port.index`) and what the folder knows of a file beyond its text (`port.files`: its
permission bits, and whether it is a symbolic link), and nothing else, so its tests run over the
memory port.

- **What is a step:** the explorer's create, rename and delete (a `PUT /api/files` whose
  changes are all `create`, `move` or `delete`, labelled from them: "Delete notes.md",
  "Rename docs to notes", "Delete 3 files in drafts"), an app's op ("Inventory: add-item") and
  a create ("Tasks: create"). A `PUT /api/files` with a `write` is an editor's save and is not
  one. A commit, a lock and an unlock are not either, and a commit does not clear the journal.
- **Before a step** the journal reads the old text of each `write`, `delete` and `move` with
  content, and the index entries and permission bits of the files it deletes, and sends each change at the version
  it read (a writer's own `base` is kept): a file changed between the read and the write
  refuses the step.
- **Undo** writes the newest step's inverse in one `put`, each change at the version the step
  left (a `create` at none), gives each file it brought back the permission bits it had (a
  script comes back executable), then puts back the index entries the step's deletes removed, with
  `git update-index --index-info`. A file changed since (by anyone) refuses it with
  `HOST_UNDO_CONFLICT`, naming the file; the step stays and nothing is written. **Redo** is the
  same with the step's forward changes. Neither is refused by the lock, and neither adds a step.
- **A step that cannot be kept:** a delete of a file the port cannot read as text (an image,
  one over 2 MiB, or one the server has no permission to read), a delete of a symbolic link
  (nothing the port writes makes a link again), or a step whose text is over 256 MiB. From the explorer it is refused with
  `HOST_CANNOT_UNDO`; the page asks, and sends it again with `unjournaled: true`. From an app it
  is written, and the answer carries `notice: { kind: 'cannot-undo', reason }`. Either way the
  journal empties. A rename of an image carries no text, and is kept, as a rename of a link is.
- **Limits:** 1,000 steps and 256 MiB of kept text (`limits.ts`); past either, the oldest go.
- **A commit runs between steps** (`journal.exclusive`): an undo writes its files and then puts
  git's index back, and a commit asked meanwhile waits for both.
- **The page:** Undo and Redo in the explorer's header (`<spl-icon>`'s `undo` and `redo`), with
  the step's label as the title; Ctrl+Z and Ctrl+Shift+Z (Cmd on a Mac), and Ctrl+Y for redo
  where Ctrl is the key, when focus is in no editor, text field, dialog or menu. An undo that
  takes the open app away (its create) shows nothing open. A create the host wrote with no
  step says so in the notice, as an app's op does.
  On a layout with no Latin letters (Russian, Greek) the keys are the physical Z, and S for
  Save, as the browser's own shortcuts are. The labels are read again when the event stream
  reconnects, since a server that restarted has no steps.

## Safety

- **Confinement.** A path is refused when it is absolute, has a `..`, `.`, empty or NUL segment,
  or a backslash, or names git's folder (`.git` in any case, with the characters HFS+ ignores or
  the trailing dots and spaces Windows drops, and `git~1`); or when the real path of the nearest
  thing that exists along it, or of the folder that holds it, is outside the real root. A
  symbolic link that leaves the root is listed and cannot be opened, written, moved or deleted.
  A link that stays inside the root and leads into git's folder (`cfg.md` to `.git/config`) is
  refused the same way, `HOST_PATH_INVALID`: the name check reads a path as written, so the real
  path is checked too. An app's lock is asked of where a path leads (`port.leadsTo`) as well as
  of the path as written.
  The refusal says which: `HOST_PATH_OUTSIDE_ROOT` for a path that would leave the folder (an
  absolute one, a `..`, a link out), and `HOST_PATH_INVALID` for one that stays inside and is not
  a path the host takes (the rest).
- **The page's files.** `createStaticPage(dir)` lists the folder's regular files (no links, no
  dot-files) and answers a request only when its path, exactly as sent, is one of them, so no
  request path can leave `dist/client`. In development mode the same request checks stand in front
  of everything Vite serves, and Vite's HMR socket opens only for the host's own `Host` and
  `Origin` (and Vite's own token).
- **Requests.** The `Host` must be the host's own (`127.0.0.1:<port>` or `localhost:<port>`). A
  request that is not a `GET` must carry the host's `Origin` (or its `localhost` twin). Any
  request whose `Origin` is another, and any the browser marks `Sec-Fetch-Site: cross-site` or
  `same-site` (except a navigation), is refused. Then every request must carry the run's token
  (below).
- **A raw file is shown, never run.** `GET /api/raw/<path>` refuses a request whose
  `Sec-Fetch-Dest` says the browser would run or apply it: `script`, `style`, a worker (`worker`,
  `sharedworker`, `serviceworker`), a worklet (`audioworklet`, `paintworklet`), `xslt`,
  `manifest` and `json` (a module). The page's scripts may come from its own origin, so a
  repository's `.js` would otherwise load as the page's own. An image, a document or frame
  (sandboxed), media (`video`, `audio`, `track`), a font and a `fetch` are served, and so is a
  request with no `Sec-Fetch-Dest` (curl).

## Who the host answers

Only someone who has the address the command printed. The three checks above keep out another
site in the browser; they do not keep out another program, which can send any `Host` and
`Origin` it likes. So each start makes a token, and every request on every route, the page's own
files, `/api/events` and `/api/raw` included, must carry it.

- **The token** is 32 random bytes from `node:crypto`, written as base64url, new at each start.
  The printed address carries it: `http://127.0.0.1:5190/?token=<token>`.
- **The exchange.** A `GET` or `HEAD` for the page (any path outside `/api/`) with `token` in its
  query is answered `303` to the same path and query without it, and sets the cookie
  `surfaces-<port>=<token>; HttpOnly; SameSite=Strict; Path=/`. The port is in the name, so two
  runs on two ports each keep their own. A wrong token is refused and sets nothing. The token in
  a query is taken only there: `/api/list?token=…` is refused.
- **Where it travels.** In the cookie, which the browser sends with every request to the host:
  the page's `fetch`es, the event stream, every `<img>`, `<video>` and `<audio>`, what a library
  fetches, a second tab opened at the address without the token. Nothing in the page sets it.
  A program sends `Authorization: Bearer <token>` instead (the tests do). The comparison takes
  the same time whatever was sent (`timingSafeEqual` over SHA-256 digests).
- **Without it** a request is refused with `403`: under `/api/` the JSON refusal
  `HOST_TOKEN_REQUIRED`, "Open the address the `surfaces` command printed in its terminal.";
  for the page a plain page with the same words and nothing about the folder served. The three
  checks above run first, so a request another site started is refused by them, with the token
  or without.
- **A restart** makes a new token. A page left open holds the old run's cookie and is refused;
  it says so (above) and stops retrying its stream. Opening the new address sets the new cookie.
- **Development mode** holds what Vite serves to the same check, the exchange included, and its
  HMR socket too (the browser sends the cookie with it).
- **As a library**, `createHost({ token: null })` turns the check off, and the `null` is written
  out: a desktop shell that serves the handler under a scheme of its own.

### What it does not stop

- **A program running as the same person, unsandboxed.** It can read the folder itself.
- **Another server on `127.0.0.1` that the person visits in the same browser while the host
  runs.** A cookie belongs to a host name and not to a port, so the browser sends that server
  the cookie, and with it a program can call the host. The token is new at each start, and a
  visit to `localhost` at another port is sent nothing. Jamie accepted this ("local host is
  trusted enough"); Jupyter's notebook server makes the same trade.
- **Anything on the wire.** There is no TLS, and the server listens on loopback alone.

## Git

`src/server/git/`: `run.ts` runs `git` (an argument list, a timeout, `GIT_OPTIONAL_LOCKS=0` for
reads, standard input when asked, and `isolate` for a command that may run a hook); `repository.ts`
is the host's git (`createGit`, the port's `git`); `status.ts` reads `git status --porcelain=v2 -z`
into changes; `stage.ts` plans the staging; `commit.ts` holds the commit's pure parts. Nothing else
runs git.

- **Three states, decided once at start** (`GET /api/git`): `repository` when git runs and the
  root is in a work tree; `no-git` when git cannot be run and a `.git` entry (a folder or a
  file) is in the root or above it; `no-repository` otherwise. The look above the root stops
  below a folder `GIT_CEILING_DIRECTORIES` names, as git's own does. Outside `repository` the
  status is `{}`, the git routes refuse, and a write stages nothing.
- **A served folder its repository ignores** (`git check-ignore -q .`: by a `.gitignore` there
  or above, or `.git/info/exclude`) is `no-repository`, and the host says once on its terminal
  that it is served without git: git lists nothing ignored, so the listing walks it. A file in
  it added with `--force` is tracked, but has no Changes and no commit here. The work tree's top
  is never asked (git never ignores it), and a `check-ignore` that fails keeps `repository`.
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

### The commit

`POST /api/commit` (`port.commit`, `git.commit` in `repository.ts`, the pure parts in `commit.ts`)
commits the chosen paths, and nothing else, on the current branch or a new one. It runs under the
port's write lock: a `put` that arrives during a commit waits for it, and the reverse.

- **Refused first, with nothing changed:** a body of the wrong shape (`HOST_BAD_REQUEST`); no path
  (`HOST_COMMIT_NO_PATHS`); a message that is empty or only spaces (`HOST_COMMIT_NO_MESSAGE`); a path
  the port would refuse (`HOST_PATH_OUTSIDE_ROOT`, `HOST_PATH_INVALID`); a merge, cherry-pick, revert, rebase, `git am`,
  or a sequence of picks in progress (`HOST_GIT_IN_PROGRESS`, saying which and how to finish or
  abort it); git on another branch than the one the review showed, when the request says which
  (`onBranch`; `HOST_BRANCH_MOVED`); `HEAD` detached and no branch given (`HOST_DETACHED_HEAD`); a path that is not a
  change or a moved file's old path (`HOST_NOT_CHANGED`); a chosen path in conflict
  (`HOST_PATH_CONFLICTED`); a branch name git refuses, one `@{-1}` style that git would expand, or
  `@` (`HOST_BRANCH_INVALID`); a branch that exists, differs from one only in case, would be a
  folder of one or hold one, or exists on a remote (`refs/remotes/<remote>/<name>`)
  (`HOST_BRANCH_EXISTS`). In progress is git's answer: `MERGE_HEAD`, `CHERRY_PICK_HEAD` and
  `REVERT_HEAD` through `git cat-file --batch-check`, and the `rebase-merge`, `rebase-apply` and
  `sequencer` folders where `git rev-parse --git-path` says they are. A bisect does not stop a
  commit.
- **A moved file is one change:** naming either of its paths commits both, the removal and the
  addition.
- **What runs**, in order: `git switch --create <branch>` for a new branch (from the current
  commit, the work tree and index carried across; on a repository with no commit yet it names
  the first branch); `git add --intent-to-add` for the chosen paths git does not track;
  `git commit --only --cleanup=whitespace --file <message> --pathspec-from-file=-`, the paths on
  standard input. `--only` takes the work tree's content of those paths (a file gone from disk is
  a removal) on top of `HEAD`, and leaves every other staged change staged, outside a served
  subfolder too. The message is a file in the system's temporary folder, never an argument;
  `whitespace` cleanup trims trailing spaces and blank lines and keeps a line that starts with `#`.
- **When git refuses** (a hook, no identity set, signing that fails), the answer is
  `HOST_GIT_FAILED` (422): what failed, that nothing was committed and where the person is, then
  `git said:` and git's own words (standard error, then standard output) as text. Past 8,000
  characters the middle is left out, so a hook's first and last lines stay. The paths it added
  with `--intent-to-add` are taken out of the index again, and a new branch it made is undone
  (`HEAD` back where it was, the branch deleted while it still points at the starting commit), so
  the person is where they were. If `HEAD` moved anyway (a `post-commit` hook that failed or was
  stopped after the commit was made), the commit is answered as made.
- **Nothing waits on a person:** `commit` and `switch` (which runs `post-checkout`) run in a
  session of their own, with no controlling terminal, so a passphrase prompt on `/dev/tty` fails
  at once; standard input is closed after the paths (git gives hooks none); after 60 seconds
  (`COMMIT_TIMEOUT_MS`) the whole process group gets `SIGTERM` (git removes its `index.lock`), then
  `SIGKILL` two seconds later. A hook waiting for input is answered as "did not finish within 60
  seconds (a hook or signing may be waiting for input), so it was stopped", with what it printed.
  The host sets no identity and passes none.

## The listing and the watcher

- In `repository` the list is `git ls-files --cached --others --exclude-standard`, with files
  gone from disk left out; elsewhere a walk that skips `.git` and `node_modules`. When `git`
  cannot be run and the folder looks like a repository, the `bin` says "git was not found; listing
  every file". A submodule or a nested repository is listed as one folder with nothing under it.
- The watcher watches each folder that holds a listed file (not the root recursively, which on
  Linux watches each file by itself and loses one replaced by a rename), joins bursts within
  100 ms, and lists again when a name comes or goes. A burst in which a watched folder's own
  name came or went (one removed and made again, as a rebase does) opens that folder's watch
  again, and those under it, and says their files changed; each watch also keeps the folder it
  was opened on, for the root made again. `watchNames(folder, names, onChange)` watches
  names in a folder outside the root: in a repository, `HEAD` and `index` in git's own folder
  (`git rev-parse --absolute-git-dir`: a worktree's own, and above a served subfolder), which
  sends `status`. The host's own reads never write the index, so reading after the event raises
  no other.

## Apps

`src/server/apps/`: `registry.ts` (the modules), `discovery.ts`, `facts.ts` (the runner's
`know`) and `app-host.ts` (the lock and the routes). The wire types and the region rule are in
`src/shared/apps.ts`, which both halves import.

- **Discovery** reads every file the port lists that is named a module's
  `lifecycle.manifestName`, and asks `validateAndScope` and `describeInstance`. **An instance's
  region** is its manifest's folder and everything under it; at the served root, its scope's
  paths and nothing else. Two instances whose regions share a path are both invalid, each with
  an error naming the other. Discovery runs whenever a route needs it, and again on a `listed`
  event, a `changed` manifest and a lock; `apps` is sent when its answer differs.
- **The lock** is a set of unlocked manifest paths in memory; every run starts with none.
  `PUT /api/files` checks every change's `path` and a move's `from` against the locked
  regions before the port sees it. The runner writes through the port, not the route, so its
  writes are not refused. Locking runs `validateAndScope` again and answers its errors and
  warnings; it locks either way.
- **The runner's `know`** is the module's `fromChanges` over git's changes in the region (a
  change whose path or `from` is in it), each changed or moved file with its `base`, read once
  through `git.base` and kept until git's `HEAD` or index moves (the watch on them, and at once
  when the host's own commit lands). Outside a repository nothing is changed.
- **The revision** the page and op routes answer is the runner's joined with a digest of the
  changes `know` was handed, so a commit, which changes no file, moves it.
- **Host ops** an app's registration names (`host-ops.ts`) are answered before the runner:
  tasks' `read-file` (the port's text, for one of the instance's own files: a path outside its
  region is refused `APP_OP_INVALID`), `scan-references` (the core's `referencesTo` over the
  instance as known) and `resolve` (refused). Their answers carry no revision.
- **Create** checks the folder against the found instances' regions first (at the root, the
  scope the app's lifecycle would give the seeded manifest), then runs `createInstance`.
- **A refusal's status** on an app route: the runner's class (`hostRefusalClass`), else the
  host's own (`statusFor`), else the module's `refusalClass`: 404, 409 or 400.
