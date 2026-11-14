---
column: todo
created: 2026-11-13T18:50:00-07:00
tags: [apps, dev-tooling, code, major-feature]
---

# Spec: apps in the local host

_The [local host brief](../../../stage4/phase1/briefs/local_host.md), outcomes 1 (the lock) and 3.
Stage 5, phase 3: after [app-module-grows](app-module-grows.md), [host-runner](host-runner.md) and
[app-shells](app-shells.md). Two steps, each one PR here: inventory with the lock, then tasks and
create._

> Written with stage 4's specs, before any of stage 4 was built. Stage 5 opens by reading it
> again against what stage 4 made.

## High-level goal

A folder with a tasks or inventory manifest shows as one row in the explorer, named for the app.
Selecting it opens the app, which works on the files underneath. The files are locked for other
writes until the person unlocks them. A new instance is created from the app's own form.

## Related context

- The brief's outcome 1, "Inside an app's scope": the lock, as Jamie decided it.
- The runner ([host-runner](host-runner.md)), the shells ([app-shells](app-shells.md)), and the
  module's `meta`, `bounds` and `pages` ([app-module-grows](app-module-grows.md)).
- The tree's app rows ([explorer-tree](../../../stage4/phase2/specs/explorer-tree.md)) and the
  host's menu ([file-operations](../../../stage4/phase2/specs/file-operations.md)).
- Context Manager ADR-0028: one executor per path, and scopes never overlap.

## Work package

- **Owns:** `packages/hosts/local/src/server/apps/` (the registry, discovery, facts, routes, the
  lock) and `src/client/apps/` (the registry, the app pane, the create dialog).
- **Changes:** the server's `PUT /api/files` (the lock check), the client's tree wiring and
  menu entries, `HostClient` (new methods).
- **Runs alone** in its phase.

## Technical requirement

### One registration per app, on each side

- **Server:** a list of modules (`inventoryModule`, `tasksModule`) and, per app, one `facts`
  function from the files' status to the module's facts.
- **Client:** per app id, how to load its shell and its create form.

Nothing else in the host names an app. Each `facts` function stays under about 40 lines; a
longer one is the sign the core should derive its facts from file status itself, which is the
spike's "surgery" and not this spec.

### Finding instances

At every listing, each file named a module's `lifecycle.manifestName` is a candidate. The server
asks `validateAndScope` and `describeInstance` and answers `GET /api/apps`:

```ts
interface FoundInstance {
  app: string; // the module's id
  manifestPath: string;
  /** The manifest's folder: the row in the tree. `''` is the served root. */
  folder: string;
  label: string;
  icon: string;
  valid: boolean;
  errors: string[];
  unlocked: boolean;
}
```

Two instances whose folders overlap are both reported with an error naming the other, and
neither mounts.

### The row and the lock

- **Locked** (how every run starts): the host leaves every node under the folder out of the
  tree and marks the folder as an app. `tree-select` on the row opens the app.
- **Unlocking:** "Show files…" in the row's menu, which asks first, with the brief's words (a
  draft): "Show this app's files? Changes made to them skip the app's rules, and the app may
  report problems until they are fixed." (Show files, Cancel). The server then lists the files
  under the row, which stays the app's entry point and carries the unlocked mark.
- **Locking again:** "Lock files" in the same menu. The server runs `validateAndScope` again,
  answers its errors and warnings, and locks either way. The page shows them in a notice, and
  the app itself shows whatever else is wrong when it next opens.
- **The server enforces it.** `PUT /api/files` refuses any change to a path under a locked
  instance's folder with `HOST_SCOPE_LOCKED`. The runner's writes and the undo journal's are
  the server's own and are not refused.
- **A file in a locked scope still opens in its preview:** by a link from the app (`open-card`,
  `link-editor`), or by its address. Its editor, and the address `#/edit/…`, show the preview
  with a line saying the app's files are locked. Unlocked, they behave as any file.
- **The state is the server's,** in memory: a set of unlocked manifest paths.

### Opening the app

The address is `#/app/<manifestPath>` followed by the app's own sub-path.

1. `GET /api/apps/page` with the manifest path, the sub-path and the query runs
   `matchAppPage` and the page's `resolve` in the server, and answers the view, its state, the
   extras and the title, or a redirect, or not found.
2. The pane mounts the shell and sets its input: `base` is `#/app/<manifestPath>`, `location` is
   the served folder's name, and there is no back link.
3. `answerOps` on the shell:
   - a core op: `POST /api/apps/op` (the runner), then `shell.learn`;
   - `project`: `GET /api/apps/project`;
   - `refresh`: the listing and status are read again;
   - inventory's `link-editor`: `{ href }` to the file's address;
   - tasks' `read-file`: the port's `get`; `scan-references`: the core's `referencesTo` over the
     scope's files, in the server; `resolve`: refused with `HOST_NOTHING_TO_RESOLVE`, since there
     is no divergence without a remote.
4. Requests: `navigate` sets the address; `open-card` opens the file; `notification` shows the
   host's notice; `reload-request` resolves the page again; `open-options-menu` opens the
   host's menu.
5. A `changed` event for a file under the open instance resolves the page again, unless the
   change is the reply the pane is already showing.

An invalid manifest opens a pane that lists the errors and offers "Show files…".

### Facts

Both come from `status()` over the instance's folder, and need no network:

- **Inventory:** `enabled: true`, and `dirty` as the changed and new files, each a manifest or a
  zone.
- **Tasks:** what `TasksCardFacts` and the snapshot's optional parts accept from a file's status
  alone (changed, new, moved). Everything about pull requests and divergence is absent, which
  the board already accepts.

### Creating an instance

A folder's menu, and the empty space's, gain one entry per app with `meta.create`: "New
`<noun>` here…". The dialog holds the app's create form, with `meta.create`'s folder copy and
root consent. `answerOps` on the form sends `create` to `POST /api/apps/create`, which runs
`createInstance`. The tree then shows the new row, and the pane opens it.

### Step 1: inventory, and the lock

Discovery, the row, the lock with its server check, the app pane, and inventory end to end.

### Step 2: tasks, and create

Tasks' facts and host ops, the board's menu request, and creating either app.

## Clarifications

- **An instance at the served root** has no folder row. Its row sits at the top of the tree, and
  the lock covers the paths in its scope, not the whole folder. This is the agent's reading;
  the brief does not cover it.
- **"Runs the app's own projection" on lock** is met by `validateAndScope`, which is the part
  every app has in one shape. A projection's problems are in each app's own state, so they show
  in the app.
- **Inventory's exports** are not offered here; the shell hides them without `extras.exports`.
- **Check-in from the app** arrives in [checkin-review](checkin-review.md). Until then the
  explorer's Commit button is how app changes are committed.

## Non-goals

- A third app, and an app chosen at start by a flag.
- Any GitHub state on a card.
- Moving an instance, or deleting one from its row. Unlock it and use the file operations.

## Acceptance / completion checklist

- [ ] Server tests over temporary folders: discovery (valid, invalid, overlapping), the lock
      check on `PUT /api/files`, lock and unlock, each app route, and create.
- [ ] Client tests with a fake `HostClient`: the row locked and unlocked, the two confirmations,
      the app pane's ops, a locked file opening in its preview, and the create dialog.
- [ ] By hand, on this repository's own `docs/tasks`: open the board, move a card, see the file
      change on disk and the mark in the tree; unlock, edit a card as a file, lock again.
- [ ] By hand, in a scratch folder: create an inventory, add a zone and an item, and commit.
- [ ] Adding an app touches the two registrations and its `facts` function, and nothing else.
- [ ] `npm run check` is green.

## Implementation plan

1. PR: the registrations, discovery, the row and the lock, the app pane, inventory.
2. PR: tasks, the board's menu, and create.
