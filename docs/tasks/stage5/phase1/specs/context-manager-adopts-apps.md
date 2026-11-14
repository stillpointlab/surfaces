---
column: todo
created: 2026-11-13T18:58:00-07:00
tags: [apps, host-contract, code, major-feature]
---

# Spec: Context Manager adopts the apps' pieces

_The [local host brief](../../../stage4/phase1/briefs/local_host.md), outcome 6. Stage 5,
phase 6, the stage's last. Four steps, each one Context Manager PR with both walk suites. Steps
1 to 3 do not depend on each other; step 4 comes after step 2._

> Written with stage 4's specs, before any of stage 4 was built. Stage 5 opens by reading it
> again against what stage 4 made.

## High-level goal

Context Manager reads from this repository each app's bounds, pages and copy, mounts each app's
shell, and uses the one check-in review. Its own copies go. It also takes the lock on an app's
files.

## Related context

- The [local host spike](../../../stage4/phase1/spikes/local-host.md), finding 7: what each move
  lets Context Manager drop.
- The specs whose output this consumes: [app-module-grows](app-module-grows.md),
  [app-shells](app-shells.md), [checkin-review](checkin-review.md).
- Context Manager: ADR-0028 (one executor per path) and ADR-0040 (apps through one host), with
  its count of app lines.

## Work package

- **Owns:** changes in Context Manager only, in the clone `context-manager-surfaces`, plus the
  submodule pin. Each step is its own PR there.
- **Does not change:** this repository, except a fix a step proves is needed, which goes in its
  own PR here first.
- **Every step** runs both walk suites and lists any behaviour change in its PR.

## Technical requirement

### Step 1: bounds, pages and copy

- `AppHostEntry.opSchema` and `viewSchema` go; the host calls `module.bounds`.
- `AppRegistration.pages` and `create` read `module.pages`, `module.meta.create` and
  `module.placeCreate`. The route layer maps `{ notFound: true }` to its 404.
- `CLIENT_APPS` reads `meta`.
- Deleted: the op, view and create schemas in both `opSchema.ts` files, both `pages.ts` files,
  and the copy in the two registries. The check-in schemas stay.
- Refusal codes for a bad op change to `APP_OP_INVALID` and its two siblings; the PR lists it.

### Step 2: the shells

- `client/apps/inventory/` and `client/apps/tasks/` become: load the shell, set its input,
  answer its ops, handle its requests. `ClientApp` shrinks to that.
- What stays in each: Context Manager's own host ops (linking a file on first open, `resolve`,
  `scan-references` with its good lookups, the refresh job), its path-to-good maps, and the
  inventory export links (passed as `extras.exports`).
- `refresh-stage` and `close-candidates` are answered by the tasks shell through `project`; the
  two handlers go.
- `tasks.scss` and `inventory.scss` lose everything but what styles Context Manager's own
  chrome.

### Step 3: the check-in review

- Both dialogs go. Context Manager answers the shell's `checkin` op: it maps the paths to its
  public ids, calls its existing endpoint, and replies `started`.
- Its job handling stays: the notices, the stuck timer, and telling the shell when the check-in
  settles.

### Step 4: the lock

- The repo tree shows an enabled app as one row, with its files left out by default, and an
  option to show them.
- A card or a zone file opened from the app, or by its address, opens in its preview while the
  app's files are hidden.
- **Every page load starts locked** (Jamie, 2026-11-13: the aim is to discourage editing an
  app's files directly). The unlocked state is the browser tab's and is gone on a reload.
- **The server enforces it** (Jamie, 2026-11-13). A draft to a path inside an enabled app's
  scope is refused unless the request says the scope is unlocked. The page sends that only from
  an unlocked tab; any other caller has to ask for the exception on purpose. The server keeps
  no unlocked state.

Where the check can stand, read in Context Manager at `a2bc7cba`:

- **What enabling stores.** One row in `repoViewInstance`: the connection, the view type and the
  manifest's path (`RepoViewLifecycleService.enable`). The scope is derived, never stored: it
  is the manifest's folder and everything under it (`scopeRoot` in
  `services/git/viewScope.ts`, ADR-0025 decision 3).
- **What a good knows.** Its git origin, in its metadata: the connection and the path
  (`gitOriginOf`).
- **So the check needs no new storage.** For a good with a git origin, read the connection's
  instances (`getViewInstancesByConnectionId`) and ask whether one's scope root is at or above
  the path. That is the lookup `VIEW_SCOPE_OVERLAP` already makes when an app is enabled.
- **Not inside the draft write.** `DraftService.saveDraft` is also how the apps write: the app
  host (`appHost.ts`), tasks' board service (three calls) and the lifecycle's upstream
  reconcile. The check belongs at the entries a person or an agent reaches: the editor's save
  (`DigitalGoodService`, through `saveDraftFor`) and the draft saved with a new conversation
  (`project.routes.ts`).

Step 4 starts by listing every such entry. Not yet read: the paths that write a version without
a draft, the MCP tools that write, import, and how an app-only good (one with no upstream yet)
records its path.

## Clarifications

- **The order of steps 1 to 3 is free.** Take the smallest first: step 1.
- **The count.** ADR-0040's count of app lines is taken again after each step and recorded in
  that step's PR, and the ADR is refreshed once at the end.
- **Not adopted here:** the runner, the storage port, the undo journal, and the explorer's
  tree. The brief keeps the runner and the check-in shared core out of scope.

## Non-goals

- The format registry, which Context Manager adopted at the end of stage 4
  ([context-manager-adopts-formats](../../../stage4/phase1/specs/context-manager-adopts-formats.md)).
- Any change to Context Manager's storage, check-in services or board service.
- New features in either app.

## Acceptance / completion checklist

- [ ] After step 1, a module's bounds, pages and copy exist only in this repository.
- [ ] After step 2, the client halves hold no layout and no page styles of an app.
- [ ] After step 3, neither app has a check-in dialog of its own.
- [ ] After step 4, an app's files are hidden in the repo tree until shown.
- [ ] Both walk suites pass after every step, and each PR lists its behaviour changes.
- [ ] ADR-0040 is refreshed with the new count.

## Implementation plan

1. PR: bounds, pages and copy.
2. PR: the shells.
3. PR: the check-in review.
4. PR: the lock, after listing every entry that writes to an app's file.
