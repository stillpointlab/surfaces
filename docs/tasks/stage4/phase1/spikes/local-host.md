---
column: in-progress
created: 2026-11-13T15:30:36-07:00
tags: [apps, formats, host-contract, dev-tooling, major-feature]
---

# Spike: a second host — a local server that runs the formats and apps on a folder

> Tech-spike working notes for stage 4. Read against Context Manager `main` at `2d99a40b`
> (2026-11-13; its app code is unchanged since `50b1d44b`, the commit ADR-0040 counted) and this
> repository at `dc615da`. Line counts are `wc -l` without tests; file paths are Context Manager's
> unless they start with `packages/` or `tooling/`.

## Question

Stage 3 gave Context Manager one host path for every app, and its reflections still say "way too
much app code in context manager … 2 steps forward, 1.9 steps back". Jamie's goal, restated on
2026-11-13:

> I'm seeking the highest level of independence I reasonably can get. I want to develop the apps
> separately from the context-manager, even run them in their own harness eventually. … The
> grandest vision is a Surfaces app that contains all of the formats and the apps that could
> target a local server (e.g. running in electron or something).

Two next steps were on the table: a third app, or a second host. A third app also means building
the app; a second host uses the two apps and five formats that exist. So:

1. What is still an app's in Context Manager, and which of it would a second host have to write
   again?
2. Which of that moves easily, and which is surgery?
3. What does a third app cost today?
4. What would a local host be: how it starts, what it serves, and what stands in for drafts and
   check-in?
5. What does building it force out of Context Manager, and in what order?

## Findings

### 1. What is left, by who would have to rewrite it

About 5,850 lines are still wholly an app's (ADR-0040, Decision 10; a recount of the same folders
agrees). Lines left in Context Manager is the wrong measure for independence. The useful split is
whether a second host would write the code again:

| Kind                                           | What                                                                                                                                | Lines     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **App behaviour living in the host**           | The client halves (`client/apps/tasks/`, `client/apps/inventory/`): page layout, top bar, check-in review dialog, link building     | 1,382     |
|                                                | Their page styles (`tasks.scss`, `inventory.scss`), which ADR-0040's count leaves out                                               | 325       |
|                                                | The op, view and create bounds (`services/*/opSchema.ts`)                                                                           | 381       |
|                                                | The pages: URL to view, titles, tasks' landing choice (`services/*/pages.ts`)                                                       | 201       |
|                                                | Inventory's CSV and ZIP export routes (`routers/web/apps/inventory.routes.ts`)                                                      | 149       |
|                                                | Copy and metadata: labels, icons, create nouns, folder help, root consent, lifecycle policy (the two registries, `lifecycle.ts` ×2) | about 80  |
| **Context Manager's storage, written per app** | Tasks' board service: selective load, facts, divergence resolve, auto-rebase, the reference scan, the projection cache              | 1,572     |
|                                                | The two check-in services                                                                                                           | 1,302     |
|                                                | Tasks' refresh and PR state (`refresh.service.ts`, `prState.ts`)                                                                    | 363       |
|                                                | Inventory's host entry: load, facts, the id overlay (`inventory.service.ts`)                                                        | 210       |
| **Naming**                                     | Flags, the job payload literals, a job label, the tree's `'tasks'` lookups, a label ternary, the hand-listed available view types   | under 100 |

The first kind is the independence problem. Some of it is already written twice: the harness's
tasks host (`packages/apps/tasks/dev/host.ts`, `navState`) recomputes the tab strip's selection
that `services/tasks/pages.ts` computes.

The second kind is legitimately a host's, but it is hand-mapped per app. A host whose storage is
a folder needs almost none of it: tasks' facts and snapshot extensions are all optional
(`TasksCardFacts`, `TasksSnapshot` in `packages/apps/tasks/src/projection.ts`), so a thin host
already runs the board.

### 2. What the harness is, and is not

`tooling/harness/` mounts elements over fixtures. `memory-host.ts` (65 lines) is the whole op
runner: apply, write into memory, reply through the module. Each app adds a workspace and its
host ops (`dev/host.ts`: inventory 127 lines, tasks 193).

It does not have real files, pages (a URL that picks a view), the page around the elements, a
check-in, or a create that places files in a tree. Each of those exists only in Context Manager.
The harness should stay what it is: the place for states that are hard to reach and hostile
states. A local host is a different thing, a host over real files.

### 3. Formats are not self-describing

Nothing in this repository says which format opens a path. Context Manager decides:

- `shared/utils/codeLanguage.utils.ts` (173 lines) classes a content type as code, xmdl, sheet or
  image, and picks a code language;
- `client/components/doc-preview/doc-preview.ts` (904 lines) and the good page
  (`client/pages/digitalGood/`, 405 + 314 lines) branch on those classes to choose a tag, and
  hold what each tag needs: `language` on `<code-editor>`, the sheet's document or CSV source,
  `setSource` with a URL for `<image-preview>`;
- `client/utils/{markdown,sheet,xmdl,image}Preview.ts` (about 240 lines) set each preview up.

So the formats have the same gap the apps had before `AppModule`: a second host cannot mount a
format from its package alone.

### 4. What moves easily, and what is surgery

**Easy** (mechanical, about 600 lines, no behaviour change):

- **Bounds into each module.** The app packages already depend on zod (`manifest.ts`), so
  ADR-0040's "zod-free cores" condition does not block it. The check-in body stays, because it
  names files by Context Manager's public ids.
- **Pages into each module.** Both `pages.ts` files are pure functions of `project()`. `AppPage`
  moves to `common-format/app`, and tasks' one `NotFoundError` becomes a not-found resolution.
- **Metadata into each module:** label, icon, create noun, default folder, folder copy, root
  consent, and the lifecycle policy (the error codes derive from the id).
- **Naming:** the label ternary (`repoConnections.ts`), the available view types
  (`project.routes.ts`), and the overlay types moved beside their host entries.

**Medium** (needs both walk suites, not a redesign):

- **App shell elements.** One element per app that takes the view, the state and the links, and
  lays out the bar and the app's elements. It moves most of the client halves and their styles.
- **Check-in review as one element.** Both apps build their own dialog. One element takes the
  dirty list and asks a `checkin` op with paths, a title and a body.
- **Open a file by path as one host op.** Inventory's `link-editor` and tasks' `open-card` are
  the same request. With check-in by path, inventory's id overlay goes away.

**Surgery:**

- **The check-in shared core** (the [seed](../../../unassigned/seeds/checkin-shared-core.md)).
- **Tasks' board service.** It shrinks only when cores derive their own facts from one shared
  file-status shape.
- **One host runner.** `services/apps/appHost.ts` (553 lines) and `memory-host.ts` run the same
  five steps. One runner in this repository over a storage port is the end state where a host is
  a port implementation.

### 5. What a third app costs today

An inventory-sized app, beyond its package here, is about 1,200–1,400 lines in Context Manager:

- the registry entries, lifecycle adapter and flag: about 50;
- bounds and pages: 150–250;
- the host entry: 100–200;
- the client half and styles: 350–450;
- **its own check-in service: about 540**, since nothing is shared;
- three edits in shared code (the job payload literal, the available view types, the label).

After the easy and medium moves that is the host entry and the check-in. After the shared
check-in it is about 150 lines.

### 6. A local host

**How it starts.** One entry, written as a `bin` from the first day, started two ways:

- in this repository, `npm run serve -- <path>`: development mode, with Vite as middleware so a
  change to a package's source reloads the page. This is the loop for developing an app or a
  format without Context Manager.
- anywhere, `surfaces [path]` (the path defaults to the current directory): `npm link` from a
  checkout at first; a global install or `npx` once the packages are published (they are consumed
  through Context Manager's submodule today, and whether any is on npm was not checked). Electron
  later wraps the same server and the built client.

**What it serves.** The page is the usual shape: an explorer on the left with the folder's
contents, and a pane that opens what was picked.

- A file opens in its format's preview, and its editor where it has one, chosen from the path by
  a format registry (below). Save is a `put`.
- A folder with an app's manifest shows as an instance in the tree, from the lifecycle's
  `manifestName`, `validateAndScope` and `describeInstance`. Opening it mounts the app.
- A watcher on the folder tells the page when files change underneath it, so an edit made in
  another editor, or by an agent, shows without a reload.

**The storage port.** What the server implements, and what Context Manager's host would
implement over drafts and goods:

- `list()`: the tree, as `FolderNode`s (from `git ls-files` with untracked files when the folder
  is a repository, so ignored files stay out; a plain walk otherwise);
- `get(path)`: the content (text; binary media by URL, as `<image-preview>` takes it);
- `put`: a `FileChange` (`write`, `create`, `move`), written to disk inside the served root;
- `status()`: per path, whether it is changed, new or moved.

**Git stands in for drafts and check-in**, by shelling out to the installed `git`:

| Context Manager                        | Local host                                                        |
| -------------------------------------- | ----------------------------------------------------------------- |
| a good, linked or app-only             | a file on disk                                                    |
| a draft                                | an uncommitted change in the working tree                         |
| the latest version                     | `HEAD` (`git show HEAD:<path>`, which also feeds `<code-diff>`)   |
| a tracked file, read-only until linked | nothing: every file is editable                                   |
| the dirty set                          | `git status --porcelain=v2` within the instance's scope           |
| a new file                             | an untracked file                                                 |
| a pending move                         | a rename (see the open questions)                                 |
| check-in: a branch, a commit and a PR  | `git add` the chosen paths and `git commit` on the current branch |
| `link-editor`, `open-card`             | open the path in the pane                                         |
| the refresh job                        | the watcher                                                       |
| divergence, PR state, the check-in PR  | deferred: they need a fetch or GitHub                             |

A folder that is not a repository still works: nothing is dirty and check-in is hidden.

**Apps.** One runner: read the instance's whole scope as the snapshot (Context Manager's generic
loader does the same), `core.apply`, check every changed path is in scope, write, and
`module.reply`. That is `memory-host.ts` over the port. Tasks' host ops are small here: the
reference scan is the core's `referencesTo` over the folder's files, `read-file` is a `get`, and
`resolve` has nothing to do without divergence.

**Formats.** Each format package exports a descriptor: which paths it opens, its preview and
editor tags, how to load them, whether its content is text or a URL, and the attributes a path
implies (the code language). A registry of the descriptors answers "what opens this path". The
host then drives the element through the contracts in `common` alone.

**Safety.** The server binds to loopback, refuses any path outside the served root (symlinks
included), and checks the request's origin or a per-run token, so another site's page cannot
write files through it.

### 7. What it forces out of Context Manager

Each piece the local host needs is one Context Manager holds today, and it has to live here for
the local host to use it:

| The local host needs   | So this moves here                              | Context Manager then                                |
| ---------------------- | ----------------------------------------------- | --------------------------------------------------- |
| to open a file by path | the format descriptors and registry (finding 3) | can choose its tags from the registry               |
| an app as a page       | the app shells and their styles                 | mounts the shell; its client halves shrink to links |
| an app's URLs          | the pages, in each module                       | registers the module's pages                        |
| to bound an op         | the bounds, in each module                      | reads them from the module                          |
| a check-in review      | one check-in element                            | answers its op with the existing services           |
| to run an op           | one runner over a storage port                  | may adopt it later (surgery; not this stage)        |

Nothing in the last column has to happen for the local host to work, so Context Manager can
adopt each piece when it suits, with its walks.

### 8. Keeping a desktop shell clean

The core runs in the server (Jamie, 2026-11-13). A desktop app later must not undo that choice,
and the two likely shells differ:

- **Electron's** main process is Node, so the server runs there as it is and the window loads
  the client. The page can keep talking to it over loopback HTTP, or over Electron's own channel
  so that no port is open.
- **Tauri's** backend is Rust, with no Node. Either the Node server ships beside it as a bundled
  binary, or the runner runs in the page over Rust commands for files and git.

Neither was built for this spike; this is from how the two platforms work. Three rules keep both
open, and each is cheap if it holds from the first commit:

1. **The runner is isomorphic.** It is DOM-free and Node-free and reads only the storage port,
   as the cores already are. `fs`, `child_process`, the HTTP server and the watcher appear only
   in the port's implementation and the server's entry.
2. **The page reaches its host through one client interface** (list, get, put, a URL for a
   path, status, op, project, create, check-in, watch), never through `fetch` of its own. HTTP
   with server-sent events is the first implementation. A desktop shell adds a second without
   touching the page.
3. **The server is a library first.** `createHost({ root })` answers requests; the `bin` wraps
   it with a listener. Electron imports the library.

Two smaller ones follow: the client builds to static files that load from disk as well as from
the server, and binary media gets its URL from the host (`<image-preview>` takes a URL), since
a desktop shell serves files under its own scheme.

With those, Electron is no rewrite, and Tauri stays possible either way.

## Recommendation

Write the stage 4 brief around **a local host in this repository**, in this order:

1. **Files and formats.** The format descriptors and registry, the host's file tree (the
   [tree spike](host-file-tree.md)), and the server with `list`, `get`, `put` and the watcher.
   The result: `npm run serve -- <path>` opens a folder, previews any file and edits and saves
   the ones with editors.
2. **Git.** Status in the tree, a diff against `HEAD`, and commit of chosen files.
3. **Apps.** The runner over the port, instances in the tree, and the app shells, inventory
   first. The bounds, pages and metadata move into the modules as the host needs them.
4. **Check-in.** One review element; local check-in is a commit.
5. **Context Manager adopts** what moved, piece by piece, each with both walk suites.

Deferred: everything GitHub (PR state, opening a PR, divergence), Electron, publishing to npm,
the shared check-in core and the one runner in Context Manager.

### The open questions, answered

Jamie's answers on PR 87 (2026-11-13); the [brief](../briefs/local_host.md) carries them and
what is still open.

- **Where the core runs:** in the server, kept clean for a desktop shell (finding 8).
- **Where it lives and what it is called:** `packages/hosts/local`, so other hosts have a place,
  with the `bin` named `surfaces`.
- **Check-in's branch:** offer a new branch.
- **The tree:** its own spike first, the [host file tree](host-file-tree.md).
- **Moves:** the host stages them (`git mv`). `git status --porcelain=v2` reports a rename only
  once it is staged; an unstaged move is a deleted file and an untracked one (tested in a
  scratch repository, git on Fedora 44).
- **Deletes:** staged too. `git rm` refuses a file with uncommitted changes, so the host removes
  the file and then stages that path (`git add -u -- <path>`), which works for a changed file
  as for a clean one (tested the same way). Deleting an untracked file leaves nothing for git
  to report.
- **Files in an app's scope:** locked for writes by default, with an escape hatch; they still
  open in their preview.
- **Undo:** to be considered, with generous limits on the number of steps and the total size.
- **The format descriptor:** still open; the brief sets out what it is and the two questions
  about it.

## References

- Context Manager [ADR-0040](https://github.com/stillpointlab/context-manager/blob/main/docs/adr/0040-apps-through-one-host.md)
  (the minimum, the count, adding an app), ADR-0023 (lazy link), ADR-0025 (view instances),
  ADR-0028 (manifest mounts).
- Stage 3: the [generic app host spike](../../../stage3/phase1/spikes/generic-app-host.md) and
  [brief](../../../stage3/phase1/briefs/generic_app_host.md), and the
  [reflections](../../../../devlogs/stage3/reflections.md).
- Here: `packages/common/src/app.ts` (the app contract), `packages/common/src/contracts.ts` (the
  element contracts), `tooling/harness/memory-host.ts`, `packages/apps/*/dev/host.ts`,
  [`packages/apps/README.md`](../../../../../packages/apps/README.md).
- Seeds this touches: [check-in shared core](../../../unassigned/seeds/checkin-shared-core.md),
  [one scaffold for formats and apps](../../../unassigned/seeds/one-scaffold-for-formats-and-apps.md),
  [typed inventory element ops](../../../unassigned/seeds/inventory-element-op-types.md).
