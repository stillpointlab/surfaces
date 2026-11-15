---
column: in-progress
created: 2026-11-13T18:50:00-07:00
tags: [apps, dev-tooling, code, major-feature]
---

# Spec: apps in the local host

_The [local host brief](../../../stage4/phase1/briefs/local_host.md), outcomes 1 (the lock) and 3.
Stage 5, phase 3: after [app-module-grows](../../phase2/specs/app-module-grows.md), [host-runner](../../phase2/specs/host-runner.md) and
[app-shells](../../phase2/specs/app-shells.md). Two steps, each one PR here: inventory with the lock, then tasks and
create._

> Written with stage 4's specs, before any of stage 4 was built, and read again on 2026-11-14
> against what stage 4 made. The [review](../../phase1/reviews/specs-against-stage-4.md) lists what changed
> and why (H4, H5, M3, M4, M5, M7, M8). It was read once more on 2026-11-14 against phase 2 as
> built. "What stage 4 built" and "What phase 2 built" are what an implementer reads first.

## High-level goal

A folder with a tasks or inventory manifest shows as one row in the explorer, named for the app.
Selecting it opens the app, which works on the files underneath. The files are locked for other
writes until the person unlocks them. A new instance is created from the app's own form.

## Related context

- The brief's outcome 1, "Inside an app's scope": the lock, as Jamie decided it.
- The runner ([host-runner](../../phase2/specs/host-runner.md)), the shells ([app-shells](../../phase2/specs/app-shells.md)), and the
  module's `meta`, `bounds` and `pages` ([app-module-grows](../../phase2/specs/app-module-grows.md)).
- Stage 4's specs, each with an "As built" section:
  [host-server](../../../stage4/phase2/specs/host-server.md),
  [explorer-tree](../../../stage4/phase2/specs/explorer-tree.md),
  [host-page](../../../stage4/phase2/specs/host-page.md),
  [file-operations](../../../stage4/phase2/specs/file-operations.md) and
  [git-in-the-host](../../../stage4/phase3/specs/git-in-the-host.md).
- Context Manager ADR-0028: one executor per path, and scopes never overlap.

## What stage 4 built

_Added 2026-11-14. Paths are under `packages/hosts/local/src/`._

- **The server** (`server/host.ts`) is a table of routes over one `NodePort`. `PUT /api/files`
  hands its changes to `port.put`. A success body carries `ok: true`; a refusal's status comes
  from `statusFor(code)`, which answers 400 for a code it does not know.
- **The listing is whole.** `GET /api/list` answers every file git lists, or the walk finds, cut
  at 20,000. The explorer renames or deletes a folder with one `put` of every file the listing
  has under it, and disables both for a folder the page cannot see whole.
- **The events** are `changed` (contents), `listed` (a path added or removed) and `status`
  (git's `HEAD` or index moved). The event for a write can reach the page before the write's
  answer.
- **The page** (`client/page.ts`) has one tree, one `FilePane`, one menu (`HostMenu`, which takes
  `{ x, y, entries }`), one confirm, and one notice, which is the commit's. `navigate` is the
  one way to open something, and it asks before unsaved edits are lost. `openFromTree` ignores
  a row that is not a file.
- **The address** (`client/address.ts`) is `{ view, path }`, written `#/file/…`, `#/edit/…` or
  `#/diff/…`.
- **The tree** takes an app's mark, `{ label, icon, unlocked? }`, and draws the row with the
  icon. A row with an app's mark opens only when it has children among the nodes. A status
  rolls up to every folder above its file, whether or not the file has a row. The tree has no
  row for the served folder itself (`''`). `fileOps.entriesFor` answers nothing for an app's
  row.
- **The pane** already answers the preview where an editor was asked for and cannot be given
  (`viewFor`), and the page writes the address to match.
- **`HostClient`** is the only module that may call `fetch` or `EventSource`; an ESLint rule
  fails any other. Reads the page cannot work without throw. `get`, `put` and the git calls
  answer a `Result`.
- **The page runs under a content security policy** (scripts from its own origin, no `eval`)
  and has a dark colour scheme. Context Manager has neither.

## What phase 2 built

_Added 2026-11-14, from the "As built" sections of
[app-module-grows](../../phase2/specs/app-module-grows.md),
[host-runner](../../phase2/specs/host-runner.md) and
[app-shells](../../phase2/specs/app-shells.md). Read those sections; this is what they change
here._

- **The module** has `meta`, `bounds`, `pages`, `placeCreate` and `fromChanges`, all required.
  Each app has a light `./meta` entry (no zod, none of the core) and a `./shell` entry.
- **The runner** (`@stillpointlab/common-format/host`): `loadInstance`, `runOp`,
  `projectView`, `createInstance`, `hostRefusalClass`. A host gives it `{ port, know, now }`.
- **`know` is `module.fromChanges(changes, snapshot)`.** A change is `AppFileChange`: `path`,
  `status`, `from` for a moved file, and an optional `base`, the file's text at the last
  commit. Tasks needs `base` to say a card's column moved. The node port's `git.changes()`
  gives no `base`; `git.base(path)` reads one.
- **A manifest the lifecycle refuses still loads,** with the refusal in `warnings`, and the
  core answers for it. Only a manifest that is not there is `APP_MANIFEST_NOT_FOUND`.
- **The runner's `revision` covers the scope's files,** not what the host knows. A commit
  changes no file, so it does not move it.
- **`createInstance` does not check the new instance against the others.**
- **`hostRefusalClass(code)`** answers `invalid`, `not-found` or `conflict` for the runner's
  and the port's codes, and nothing for a code that is the module's (ask `refusalClass`).
- **A shell is a light-DOM element** a host loads, sets (`AppShellInput`), answers and listens
  to. A host's whole client half is in each app's harness host, which is the model for the app
  pane: `packages/apps/inventory/dev/host.ts` (`attachHost`) and
  `packages/apps/tasks/dev/shell.ts`. A core op goes out with `shell.opView(op)`, read before
  the first wait, and its reply goes to `shell.learn(op, reply)`.
- **Every `navigate` can be cancelled and carries `{ href }`,** and only a clicked link has a
  fallback. The strip choosing a phase has none. A host that mounts a shell claims it.
- **Tasks' shell answers `refresh-stage` and `close-candidates` itself,** through `project`.
  It asks its host `project` and `refresh`. Inventory's asks neither.
- **A shell holds no editor links.** Inventory's "Open in editor" asks `link-editor`.
- **Inventory's export controls are hidden** without `extras.exports`.
- **The app elements borrow their host's classes** for buttons and form fields: `.button`,
  `.button-primary`, `.button-secondary`, `.form-field`, `.form-label`, `.form-input`,
  `.form-help` and `.form-message`. The local host's stylesheet has the first two.
- **Tasks' sticky pool reads `--spl-tasks-app-sticky-top`,** and the board keys its stored
  state by `base`.
- **`pageHref(base, path, params, query)`** in `common-format/app` writes a page's address
  under a base, the query after a `?`, which is the address this spec gives.

## Work package

- **Owns:** `server/apps/` (the registry, discovery, facts, routes, the lock) and `client/apps/`
  (the registry, the app pane, the create dialog).
- **Changes:**
  - `server/host.ts`: the routes, the lock check before `put`, the `apps` option;
  - `client/page.ts`: the tree's wiring, the events, the notice;
  - `client/address.ts`: the app's address;
  - `client/tree/`: `focusRow(path)` on the element, which the page's menus use for an app's
    row as for a file's, in place of reaching into its shadow root (stage 4's follow-up log);
  - `client/pane.ts`: `viewFor`, and the locked line;
  - `client/file-ops/`: a folder above a locked instance, and the create entries;
  - `client/host-client.ts` and `client/words.ts`;
  - the package's dependencies, and wherever the five format packages are named for the build,
    development mode, type checking and tests.
- **Runs alone** in its phase.

## Technical requirement

### One registration per app, on each side

- **Server:** a list of modules (`inventoryModule`, `tasksModule`). `createHost` takes it as an
  option (`apps`), both apps by default, so a test can hand it a fake.
- **Client:** per app id, how to load its shell (`./shell`) and its create form
  (`./create-element`), and its `./meta`.

Nothing else in the host names an app. The runner's `know` is one function for every app:
`module.fromChanges` over what git reports (Jamie's decision 3 of the review, 2026-11-14; the
member is [app-module-grows](../../phase2/specs/app-module-grows.md)'s).

### Finding instances

The server finds instances over the port's whole listing: each file named a module's
`lifecycle.manifestName` is a candidate, and the server asks `validateAndScope` and
`describeInstance`. `GET /api/apps` answers:

```ts
interface FoundInstance {
  app: string; // the module's id
  manifestPath: string;
  /** The manifest's folder: the row in the tree. `''` is the served root. */
  folder: string;
  label: string;
  icon: string; // the module's `meta.icon`
  valid: boolean;
  errors: string[];
  unlocked: boolean;
}
```

**An instance's region** is one rule, used by the lock, the tree and the overlap check:

- the manifest's folder and everything under it;
- for an instance at the served root (`folder` is `''`), the paths in its scope and nothing
  else. This is the agent's reading; the brief does not cover it.

Two instances whose regions share a path are both reported with an error naming the other, and
neither mounts.

The server finds instances again when its watcher reports a change to the listing or to a
manifest, and when a lock changes. When the answer differs it sends `{ type: 'apps' }` on the
event stream, and the page reads `GET /api/apps` again. The event is the local host's own, in a
union beside `HostEvent`; `common` does not gain it.

### The row and the lock

**The listing stays whole.** `GET /api/list` answers a locked instance's files like any others:
the runner reads them, and the explorer's folder writes need every file under a folder. The page
hides them, and the server refuses the writes.

- **Locked** (how every run starts): the page leaves every path in the region out of the nodes
  it gives the tree, and marks the folder as an app. `tree-select` on the row opens the app.
  A changed file in the region still rolls its status up, so the row shows the dot.
- **An instance at the root** has no folder to stand for it, and the tree has no row for `''`.
  The page draws its row above the tree: the app's icon and label on a button, and a menu
  button, both reachable by the keyboard.
- **The row's menu** (the page adds these in `openMenu`; `fileOps.entriesFor` still answers
  nothing for an app's row):
  - locked: Open, "Show files…";
  - unlocked: Open, "Lock files", "New file…".

  The row never offers Rename… or Delete…: see the non-goals.

- **Unlocking:** "Show files…" asks first, with the brief's words (a draft): "Show this app's
  files? Changes made to them skip the app's rules, and the app may report problems until they
  are fixed." (Show files, Cancel). The page then gives the tree the region's nodes under the
  row, which stays the app's entry point and carries the unlocked mark.
- **Locking again:** "Lock files". The server runs `validateAndScope` again, answers its errors
  and warnings, and locks either way. The page shows them in its notice, and the app itself
  shows whatever else is wrong when it next opens.
- **The server enforces it.** `PUT /api/files` refuses a request in which any change's `path`,
  or a move's `from`, is in a locked region, with `HOST_SCOPE_LOCKED` (409), before the port
  sees it. The runner's writes and the undo journal's are the server's own and are not refused.
- **A folder above a locked instance** has Rename… and Delete… disabled, as a folder that holds
  a nested repository does, with the reason (a draft): "This folder holds an app's locked
  files. Show the files first." The server would refuse the write anyway.
- **A file in a locked region still opens in its preview:** by a link from the app (`open-card`,
  `link-editor`), or by its address. `viewFor` answers the preview for `#/edit/…`, with a line
  saying the app's files are locked. The Changes view is unaffected. Unlocked, the file behaves
  as any other.
- **A commit is not a write to the files.** The explorer's Commit button counts and lists a
  locked region's changed files like any others.
- **The state is the server's,** in memory: a set of unlocked manifest paths.

### Opening the app

The address is `#/app/<manifestPath>`, then the app's own sub-path, then a query if the page has
one: `#/app/docs/tasks/tasks.yaml/stage/4?path=…`. Path segments are percent-encoded as in every
other address. The page splits it with the instances it knows: the longest manifest path that
is a prefix, ending at a segment's edge, is the instance; the rest is the sub-path and the
query. With no such instance the pane says there is no app at that address. `address.ts` gains
the kind, and `navigate`, the title and the history handling treat it as they treat a file's.

1. `GET /api/apps/page` with the manifest path, the sub-path and the query runs `matchAppPage`
   and the page's `resolve` in the server, with `projectView` as the page's `project`. It
   answers the view, its state, the extras, the title (`page.title(state)`) and a `revision`,
   or a redirect, or not found. A view that projects nothing is not found unless the page says
   `emptyWhenMissing`.

   **The `revision` here is the host's:** the runner's, joined with a digest of the changes
   `know` was handed. The runner's alone covers the files, and a commit changes none of them,
   yet it changes every mark the app shows.

2. An app pane, beside `FilePane` in the page's `<main>`, mounts the shell and sets its input:
   `base` is `#/app/<manifestPath>`, `location` is the served folder's name, and there is no
   back link. One pane shows at a time. Leaving a file with unsaved edits for an app asks first,
   through `navigate`.
3. `answerOps` on the shell:
   - a core op: `POST /api/apps/op` (the runner) with `shell.opView(op)`, which answers the
     reply and the new `revision`; then `shell.learn(op, reply)`;
   - `project`: `GET /api/apps/project`, the view as JSON in the query;
   - `refresh`: the listing, the statuses and the instances are read again;
   - inventory's `link-editor`: `{ href }` to the file's address, which is the only way a
     shell opens a file's editor;
   - tasks' `read-file`: the port's `get`; `scan-references`: the core's `referencesTo` over the
     scope's files, in the server; `resolve`: refused with `HOST_NOTHING_TO_RESOLVE`, since there
     is no divergence without a remote.
4. Requests:
   - `navigate`: the pane claims it (`preventDefault()`) and sets the address when the `href`
     starts with `#/`, whether a link was clicked or the strip chose a phase. Any other `href`
     is left to the browser;
   - `open-card`: the file's preview, through `navigate`;
   - `notification`: the page's notice;
   - `reload-request`: the page is resolved again;
   - `open-options-menu` carries `{ items, anchor }`. The page opens `HostMenu` at the anchor's
     corner with an entry per item (its `label` and `title`), and a chosen entry dispatches
     `options-menu-select` with `{ itemId }` on the element that asked, which is what the board
     and the nav wait for.
5. **Staying current.** The pane resolves the page again:
   - on `changed`, for a path in the instance's region;
   - on `listed`: a card file made or removed on disk;
   - on `status`: after a commit nothing is changed any more, and the facts say so.

   Events that arrive while the pane's own op is unanswered wait for the answer, as
   `FilePane.followWrite` does for the explorer's writes. The pane then sets the shell's input
   only when the resolved `revision` differs from the one it shows, so its own op, already
   learned from the reply, sets nothing twice.

An invalid manifest opens a pane that lists discovery's errors and offers "Show files…". The
shell is not mounted, though the runner would load the instance.

A refusal's status: `statusFor` learns `HOST_SCOPE_LOCKED` and `HOST_NOTHING_TO_RESOLVE`; an
`APP_` code and a core's refusal take their class from `hostRefusalClass` or the module's
`refusalClass` (404, 409 or 400).

### The page's notice

The commit's notice under the explorer's header becomes the page's one notice: a line of text,
or a short list, and a dismiss button, in the same live region. The commit's message, an app's
`notification` and the problems a lock reports all show there, the newest in place of the last.

### Facts

Both apps' facts come from the port, and need no network: `know` hands `module.fromChanges`
the changes in the instance's region, from `port.git.changes()`, which names a moved file's old
path. What each app makes of them is in [app-module-grows](../../phase2/specs/app-module-grows.md).

Each changed or moved file's change carries its `base`, the text at the last commit, from
`port.git.base(path)`. A base is kept until git's `HEAD` moves (the `status` event's cause),
so an op does not read it twice. A file whose base cannot be read as text goes without.

In a folder that is not a repository nothing is changed, new or moved.

### Creating an instance

A folder's menu, and the empty space's, gain one entry per app with `meta.create`: "New
`<noun>` here…". The dialog holds the app's create form, with `meta.create`'s folder copy and
root consent. `answerOps` on the form sends `create` to `POST /api/apps/create`. The route
refuses a folder whose region would share a path with a found instance's
(`HOST_APP_OVERLAP`, 409), which `createInstance` does not check, and then runs it. The tree
then shows the new row, and the pane opens it.

### Styles the apps borrow

The page's stylesheet gains the classes the app elements take from their host and it lacks:
`.button-secondary`, `.form-field`, `.form-label`, `.form-input`, `.form-help` and
`.form-message`, from the shared tokens, in both colour schemes. It sets
`--spl-tasks-app-sticky-top` if the pane scrolls under anything.

### `HostClient`

Six methods, and no other way to the server: `apps()`, `appPage(…)`, `appProject(…)`,
`appOp(…)`, `appCreate(…)` and `setAppLock(manifestPath, locked)`. `apps()` throws like the other
reads the page cannot work without; the rest answer a `Result`.

### Step 1: inventory, and the lock

Discovery, the row, the lock with its server check, the app pane, the notice, and inventory end
to end.

### Step 2: tasks, and create

Tasks' facts and host ops, the board's menu request, and creating either app.

## Clarifications

- **"Runs the app's own projection" on lock** is met by `validateAndScope`, which is the part
  every app has in one shape. A projection's problems are in each app's own state, so they show
  in the app.
- **Inventory's exports** are not offered here; the shell hides them without `extras.exports`.
- **Check-in from the app** arrives in [checkin-review](../../phase1/specs/checkin-review.md). Until then the
  explorer's Commit button is how app changes are committed.
- **Fixtures are instances too.** This repository has two `inventory.yaml` files under
  `packages/apps/inventory/dev/examples/`. Served here, each is a locked app row. That is the
  rule working, and the by-hand check will meet it.
- **zod in the page.** The bounds run in the server. A create form's own checks may load zod in
  the page, where its probe of `Function('')` is reported by the content security policy and
  does no harm (stage 4's follow-up log has the same for xmdl).

## Non-goals

- A third app, and an app chosen at start by a flag.
- Any GitHub state on a card.
- Moving an instance, or deleting one from its row. Unlock it and use the file operations on
  its files.

## Acceptance / completion checklist

- [ ] Server tests over temporary folders: discovery (valid, invalid, overlapping, at the
      root), the lock check on `PUT /api/files` for a `path` and for a move's `from`, lock and
      unlock, the `apps` event, each app route, and create.
- [ ] Client tests with a fake `HostClient`: the row locked and unlocked, a root instance's row,
      the two confirmations, a folder above a locked instance, the app's address split and
      joined, the app pane's ops, the three events with and without an op in flight, a locked
      file opening in its preview, the notice, and the create dialog.
- [ ] By hand, on this repository's own `docs/tasks`: open the board, move a card, see the file
      change on disk and the dot on the app's row; commit from the explorer and see the board's
      marks clear; unlock, edit a card as a file, lock again.
- [ ] By hand, in a scratch folder: create an inventory, add a zone and an item, and commit.
- [ ] By hand, in a dark colour scheme: both apps read well, their dialogs' buttons and fields
      included.
- [ ] After a commit from the explorer the open app's marks clear, by a test: the page's
      `revision` moves when only the changes do.
- [ ] Adding an app touches the two registrations and nothing else.
- [ ] `npm run check` is green.

## Implementation plan

1. PR: the registrations, discovery, the row and the lock, the app pane, the notice, inventory.
2. PR: tasks, the board's menu, and create.
