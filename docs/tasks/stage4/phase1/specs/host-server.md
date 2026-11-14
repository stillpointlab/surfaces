---
column: todo
created: 2026-11-13T18:32:00-07:00
tags: [dev-tooling, host-contract, code, major-feature]
---

# Spec: the local host's server

_The [local host brief](../briefs/local_host.md), outcome 1. Stage 4, phase 2, first wave: it runs
beside [format-descriptors](format-descriptors.md) and [explorer-tree](explorer-tree.md). One PR
here._

## High-level goal

`surfaces [path]` starts a server over a folder. It lists the folder, reads and writes its text
files, serves its binary files by URL, and tells a listener when files change. Nothing in it is
about a page yet: [host-page](host-page.md) builds on its API.

## Related context

- The [local host spike](../spikes/local-host.md), finding 6 (the storage port, safety) and
  finding 8 (a desktop shell stays a wrapper).
- The brief's constraints: the server is a library first; bound to loopback; no path outside the
  served root.
- `FolderNode`, `FileChange` and `Result` in `packages/common/src/app.ts`.

## Work package

- **Owns:** a new package, `packages/hosts/local` (`@stillpointlab/local-host`, private), and a
  new entry in `common`, `@stillpointlab/common-format/host`
  (`packages/common/src/host/`). The root `package.json` gains the `packages/hosts/*` workspace
  and a `serve` script.
- **Does not change:** `packages/common/src/app.ts`.
- **Hands on to:** host-page, which reads `StoragePort`, `PortChange`, `FileStatus` and the HTTP
  routes below exactly as written here.

## Technical requirement

### The storage port

In `@stillpointlab/common-format/host`. Types only in this spec; the runner joins them in
[host-runner](../../../stage5/phase1/specs/host-runner.md). DOM-free and Node-free.

```ts
export type FileStatus = 'changed' | 'new' | 'moved' | 'deleted';

/** A change a host writes. `base` is the version the writer read; absent means "do not check". */
export type PortChange =
  (FileChange & { base?: string }) | { kind: 'delete'; path: string; base?: string };

export interface StoragePort {
  /** Every file and folder under the root, by path. */
  list(): Promise<FolderNode[]>;
  /** A text file's content, with an opaque version of it. */
  get(path: string): Promise<Result<{ text: string; version: string }>>;
  /** Write all the changes or none. Answers the new version of each path written. */
  put(changes: readonly PortChange[]): Promise<Result<{ versions: Record<string, string> }>>;
  /** What differs from the last commit, by path. Empty until git arrives. */
  status(): Promise<Record<string, FileStatus>>;
}
```

- **A version** is a hash of the file's bytes (SHA-256). Only equality matters.
- **`put` checks before it writes.** Every `base` is compared with the file on disk first; one
  mismatch refuses the whole call and writes nothing.
- **Refusals** are `Result` failures with these codes:

  | Code                     | When                                                      |
  | ------------------------ | --------------------------------------------------------- |
  | `HOST_FILE_NOT_FOUND`    | `get`, `write`, `move` or `delete` of a path with no file |
  | `HOST_PATH_EXISTS`       | `create`, or a `move` onto a path that has a file         |
  | `HOST_FILE_CHANGED`      | a `base` that is no longer the file's version             |
  | `HOST_NOT_TEXT`          | `get` of a file with a NUL byte or invalid UTF-8          |
  | `HOST_FILE_TOO_LARGE`    | `get` of a file over 2 MiB (a draft limit, one constant)  |
  | `HOST_PATH_OUTSIDE_ROOT` | any path the confinement rule below refuses               |

### The Node port

`createNodePort({ root })` in the package, the only place `node:fs` and `child_process` appear
besides the watcher and the `bin`.

- **Listing.** In a git work tree: `git ls-files -z --cached --others --exclude-standard`, with
  files missing from disk left out, so ignored files stay out. Elsewhere: a walk that skips
  `.git` and `node_modules`. Folder nodes are derived from the file paths, so an empty folder is
  not listed.
- **Paths** are relative to the root with `/` separators, as the app contract's are.
- **Confinement.** A path is refused when it is absolute, has a `..`, `.git`, empty or NUL
  segment, or a backslash; or when the real path of its nearest existing ancestor is outside the
  real path of the root. A symbolic link that leaves the root is listed and cannot be opened.
- **Writes** create missing parent folders, and write through a temporary file and a rename.

### The server, as a library

```ts
export interface Host {
  /** Answer one request. */
  fetch(request: Request): Promise<Response>;
  close(): Promise<void>;
}
export function createHost(options: { root: string; origin: string }): Host;
```

The handler takes and returns the web's `Request` and `Response`, so the `bin` is a thin adapter
from `node:http`, and a desktop shell can serve the same handler under its own scheme (not
tested).

| Route                 | Answers                                                               |
| --------------------- | --------------------------------------------------------------------- |
| `GET /api/list`       | `{ nodes, truncated }`; over 20,000 nodes the list is cut and says so |
| `GET /api/file?path=` | `{ text, version }`, or a refusal                                     |
| `GET /api/raw?path=`  | the file's bytes, for a format that takes a URL                       |
| `PUT /api/files`      | body `{ changes }`; `{ versions }`, or a refusal                      |
| `GET /api/status`     | `{}` until [git-in-the-host](git-in-the-host.md)                      |
| `GET /api/events`     | server-sent events, below                                             |

- **A refusal** is `{ ok: false, code, message }` with status 404, 409 or 400: not found, a
  conflict (`HOST_PATH_EXISTS`, `HOST_FILE_CHANGED`), or anything else.
- **`/api/raw`** sends the type for the extension, `X-Content-Type-Options: nosniff` and
  `Content-Security-Policy: sandbox`, so a file opened in its own tab cannot script the host's
  origin.

### The watcher

`fs.watch` on the root, recursive, with changes under `.git` ignored and bursts joined over
100 ms. It sends two events to every `/api/events` listener:

- `{ type: 'changed', paths }`: these files' contents changed, appeared or went;
- `{ type: 'listed' }`: the set of paths changed, so the list is stale.

### Safety

- The `bin` binds to `127.0.0.1` only.
- Every request's `Host` must be the host's own (`127.0.0.1:<port>` or `localhost:<port>`), or it
  is answered 403. This stops another site reaching the server through a name it controls.
- Every request that is not a `GET` must carry an `Origin` equal to `options.origin`.

### The `bin`

`surfaces [path] [--port <n>]`: the path defaults to the current directory and the port to 5190.
It refuses a path that is not a folder, and a port in use, with a plain message, and prints the
URL it serves. `npm run serve -- <path>` runs it from this repository after building what it
needs. Until host-page lands, `/` answers a one-line page naming the root.

## Clarifications

- **Git is used for the listing only** in this spec. Status, diff and commit are
  [git-in-the-host](git-in-the-host.md).
- **`delete` is on the port from the start,** for [file-operations](file-operations.md) and
  [undo-journal](../../../stage5/phase1/specs/undo-journal.md). The app contract's `FileChange` is
  unchanged.
- **No framework.** `node:http` and a route table. The package's only runtime dependency is
  `@stillpointlab/common-format`.
- **A per-run token is not added.** The `Host` and `Origin` checks cover a page on another site;
  a program on the same machine can already write the files.

## Non-goals

- The page, the client interface and development mode with Vite: [host-page](host-page.md).
- Apps, check-in and undo.
- Publishing the package, and Windows paths.

## Acceptance / completion checklist

- [ ] `npm run serve -- <path>` and the `surfaces` bin start the server from a clean checkout.
- [ ] Port tests over temporary folders: list in a repository and outside one; `get` and each
      refusal; `put` with matching and stale bases, all-or-nothing; create, move and delete.
- [ ] Confinement tests: `..`, an absolute path, `.git`, and a symbolic link out of the root, for
      reads and writes.
- [ ] Server tests: each route, the `Host` and `Origin` checks, and an event after a write made
      outside the server.
- [ ] `common-format/host` builds as its own entry and imports nothing from Node or the DOM.
- [ ] `npm run check` is green, with the new workspace included in lint, typecheck and tests.

## Implementation plan

1. The workspace, the package scaffold and the `common-format/host` types.
2. The Node port and its tests.
3. `createHost`, the routes, the watcher and the safety checks.
4. The `bin` and the `serve` script.
