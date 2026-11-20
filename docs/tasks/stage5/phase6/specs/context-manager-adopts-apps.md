---
column: todo
created: 2026-11-13T18:58:00-07:00
tags: [apps, host-contract, code, major-feature]
---

# Spec: Context Manager adopts the apps' pieces

_The [local host brief](../../../stage4/phase1/briefs/local_host.md), outcome 6. Stage 5,
phase 6, the stage's last. Four steps in two Context Manager PRs: steps 1 to 3 together, then the
lock._

> Written with stage 4's specs, before any of stage 4 was built, and read again on 2026-11-14
> against what stage 4 made and how its own adoption went. The
> [review](../../phase1/reviews/specs-against-stage-4.md) lists what changed and why (H7, M9).
> Read a third time on 2026-11-20, when its phase opened, against what phases 2 to 5 built. "What
> stage 4 taught" and "What phases 2 to 5 built" are what an implementer reads first.

## High-level goal

Context Manager reads from this repository each app's bounds, pages and copy, mounts each app's
shell, and uses the one check-in review. Its own copies go. It also takes the lock on an app's
files.

## Related context

- The [local host spike](../../../stage4/phase1/spikes/local-host.md), finding 7: what each move
  lets Context Manager drop.
- The specs whose output this consumes: [app-module-grows](../../phase2/specs/app-module-grows.md),
  [app-shells](../../phase2/specs/app-shells.md), [checkin-review](../../phase4/specs/checkin-review.md). Each PR for those lists the
  ids and classes of Context Manager's page chrome it did not keep.
- [context-manager-adopts-formats](../../../stage4/phase4/specs/context-manager-adopts-formats.md),
  "As built": how stage 4's adoption went.
- Context Manager: ADR-0028 (one executor per path) and ADR-0040 (apps through one host), with
  its count of app lines.

## What stage 4 taught

_Added 2026-11-14, from stage 4's adoption (context-manager#1186) and Jamie's
[stage 4 reflections](../../../../devlogs/stage4/reflections.md)._

- **One integration at the stage's end was good process:** less contention and less review. The
  first draft of this spec had four PRs, each with both walk suites.
- **A round of walks is slow and heavy.** Both suites take over 20 minutes and load the
  machine, and two projects running CI at once caused build failures. The suites never run at
  the same time, and a round does not start while another CI run is on the machine. A round
  resets the walk database and pushes to the scratch repository, which needs Jamie's go-ahead
  each time.
- **The pin moves first, alone, and is walked alone.** In stage 4 every built entry of the
  format packages had changed shape, and walking the pin by itself showed the adoption's own
  failures apart from the pin's.
- **A PR that sits conflicts.** Both sides append to Context Manager's follow-up log, and its CI
  does not start on a PR that conflicts with `main`. Merge `main` in before marking it ready.
- **The walks passed and missed the change.** They opened no code, sheet or image file, where
  stage 4's adoption changed the most, and a pass by hand in Chromium covered it. Here the
  walks drive both apps hard (tasks 01 to 27 and 29, 38 inventory steps), which is the surface
  steps 1 to 3 change. The lock is new behaviour, and no walk covers it.
- **The walks select the pages' chrome by id and class.** The two check-in dialogs alone are
  selected 57 times. The shells and the review move that markup.
- **The shared chunk grew** by 3.9 kB in stage 4, because a barrel every page loads exported
  the registry. Here the shells and the review should load on the app pages alone, and the PR's
  sizes show whether they do.
- **The implementing agent works in the `context-manager-surfaces` clone, commits there, and
  neither pushes nor runs walks.** The orchestrating agent rebuilds on current `main`, runs the
  checks and the walks, and opens the PR.

## What phases 2 to 5 built

_Added 2026-11-20, when phase 6 opened, from the "As built" sections of
[app-module-grows](../../phase2/specs/app-module-grows.md),
[app-shells](../../phase2/specs/app-shells.md),
[checkin-review](../../phase4/specs/checkin-review.md) and
[apps-in-the-local-host](../../phase3/specs/apps-in-the-local-host.md), and the
[stage 5 code review](../../phase5/reviews/stage-5-code-review.md). Those sections are the
record; this is what the steps below did not know. Context Manager was read at `458509da`, with
its pin at `45df18d`._

**The pin** moves from `45df18d` to this repository's `main`, past all of stage 5. With nothing
adopted it still brings:

- **The md editor's save** keeps the text it did not change
  ([#111](https://github.com/stillpointlab/surfaces/pull/111)). A draft saved from the rich view
  differs from today's, and the PR lists it.
- **A new workspace,** `@stillpointlab/checkin-review-component`, which Context Manager's
  `components/*` workspace takes in. Both apps' `./shell` entries import it.
- **Changes to the bare elements,** which Context Manager still mounts at the pin:
  `<spl-tasks-nav>`'s `navigate` can be cancelled, inventory's two export links are optional,
  and the overview's row for a zone that does not parse says so briefly
  ([#133](https://github.com/stillpointlab/surfaces/pull/133)).
- **`AppModule` has five more members,** all required. Context Manager's build, type check and
  tests passed against that shape on 2026-11-14 (a comment on
  [#114](https://github.com/stillpointlab/surfaces/pull/114)), with a pin made by hand and not
  committed.

**Step 1, as the module has it:**

- **`module.bounds`** has `op`, `view` and `create`, each answering a `Result`. A refusal reads
  "The op is not valid: title: …", with the schema's causes in `details`, where Context
  Manager's said "Validation failed".
- **`bounds.op` covers the core's ops and refuses the rest,** as Context Manager's schemas did:
  a host op, `create-card` with `now` (the host adds the time through `toCoreOp`), and
  `move-file`'s `coMoving`. A host bounds its own host ops.
- **`bounds.create` answers the form's fields.** The host adds the folder before `seed`.
- **`module.pages` with `matchAppPage`.** A page's `params` and `query` are strings, and the
  page checks them. Not found where Context Manager answered 400 or threw: a zone slug its rule
  refuses, a `?path=` over 1,024 characters, a stage or phase that is not a positive number,
  and a page whose nav cannot be projected.
- **`meta` has a light entry in each package** (`./meta`, no zod), for `CLIENT_APPS`.
  `meta.create.noun` is the noun with its article ("an inventory", "a task project"), which is
  the server registry's. The client registry's other noun, for its "… created" notice
  ("Inventory", "Task project"), has no member in `AppMeta`; the follow-up log has it.
  `folderHelp` is plain text, so tasks' loses its `<code>` around `tasks.yaml`.
- **Not Context Manager's to call:** `fromChanges`, the runner, the storage port and
  `hostRefusalClass`. Its facts come from its own services.

**Step 2, as the shells are:**

- **app-shells' two "As built" sections list what Context Manager passes and does,** and the
  ids and classes each shell kept and did not. That is the list the walks' selectors change
  from.
- **The shell is enough.** Each `./shell` entry registers the app's elements and exports the
  event names a host needs (`NAVIGATE_EVENT`, `RELOAD_REQUEST_EVENT`, inventory's
  `NOTIFICATION_EVENT`). Since 2026-11-20 both apps' builds split, as the formats' do, so
  `./element` and `./shell` share one copy of the elements and a page may load both. Every
  built entry of the two packages changed shape with it, which is one more reason the pin is
  walked alone.
- **A host claims every `navigate`** with `preventDefault()`. Only a clicked link has the
  browser behind it.
- **`learn(op, reply)`**, the op first. `opView(op)` gives the view to send with an op.
- **The shell answers `refresh-stage` and `close-candidates` itself** through `project`, so
  the two handlers go. `tasksModule.hostOps` still names both.
- **A shell holds no editor links.** It asks `link-editor` for a file that is already linked
  too, where Context Manager rendered a link from its map of paths.
- **A host that keeps "the reply already showed this revision" must drop it** when the shell
  raises `reload-request`, or raises `navigate` to the page on screen: the review's H1, found
  in the local host's pane (`packages/hosts/local/src/client/apps/app-pane.ts`), which is the
  one other host that mounts a shell.
- **Seen once in Context Manager:** the pool's collapsed state resets (the board's
  `storage-key` is `base`), the empty state says "upstream" for GitHub, and the sticky pool
  reads `--spl-tasks-app-sticky-top`.

**Step 3, as the review is:**

- **Each shell stops `checkin-request` and asks its host `checkin`:** paths, a title and a
  body when typed, and the app's own `context`, passed back untouched.
- **Context Manager replies `started`,** with a message for the notice, and calls
  `checkinSettled()` when its job ends. Tasks' shell has it; inventory's marks nothing in
  flight, and Context Manager sets its state again.
- **`checkin.words` on the shell's input:** `heading`, `title`, `body`, `confirm` and `cancel`,
  with `help` and five more that have plain defaults (`busy`, `noFiles`, `noTitle`, `detached`,
  `nothing`). No `branch` is passed.
- **Tasks' rows keep Context Manager's labels.** On a stage view the order file and the
  housekeeping are now under "Pool & config", where Context Manager left them under whichever
  group came last.
- **The review's ids are its own for each instance,** so a walk cannot select it by a fixed
  id. A row has its label in `data-label`.
- **In an app's review focus goes to the refusal's line** after a refusal: a shell's input is
  data and cannot carry `refusalField`.
- **The board's in-flight chip reads "PR…",** which is right for Context Manager.

**Step 4, beside the local host's lock:**

- The local host's server holds each instance's lock (`POST /api/apps/lock`), and a new
  instance starts locked. Context Manager's is the tab's, as below, and its server holds none.
- A write is checked for its `path` and for a move's `from`. The refusal is one code,
  `HOST_SCOPE_LOCKED`, answered 409.
- "Lock files" with unsaved edits in the open file asks about discarding them first, and the
  file goes to its preview.
- A root instance's row says "unlocked" in a chip while it is.

## Work package

- **Owns:** changes in Context Manager only, in the clone `context-manager-surfaces`, plus the
  submodule pin.
- **Does not change:** this repository, except a fix a step proves is needed, which goes in its
  own PR here first.
- **Two PRs** (Jamie, 2026-11-14: "two is fine if less disruptive overall"; decision 2 of the
  review):
  1. the adoption: the pin alone, then steps 1, 2 and 3, each its own commit. Both walk suites
     run on the pin's commit and on the tip. A failure at the tip is found by commit;
  2. the lock (step 4), after the first has merged, with one walk of its own.
- **Each PR** lists every behaviour change, and the sizes of the app pages' entries and the
  shared chunk before and after.

## Technical requirement

### The pin

The first commit moves `packages/surfaces` to this repository's `main` and changes nothing else.
Context Manager builds, and both suites pass, with nothing adopted: the grown module, the shells
and the review are additions.

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
- **The walks' selectors** for the bars, Refresh and Settings change in this commit, from the
  list the shells' PRs gave.

### Step 3: the check-in review

- Both dialogs go. Context Manager answers the shell's `checkin` op: it maps the paths to its
  public ids, calls its existing endpoint, and replies `started`.
- It passes its own words as `checkin.words` (a pull request's title and description), and no
  `branch`: its check-in opens a pull request on a branch of its own naming.
- Its job handling stays: the notices, the stuck timer, and telling the shell when the check-in
  settles.
- **The walks' selectors** for the two dialogs change in this commit.

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

The local host built the same lock first
([apps-in-the-local-host](../../phase3/specs/apps-in-the-local-host.md), with its "As built" section by then). What
carries over: the listing stays whole and the page hides the files; the lock covers the
manifest's folder and everything under it; a file in a locked scope opens in its preview with a
line saying why; the server's refusal has one code.

Where the check can stand, read in Context Manager at `a2bc7cba`; nothing there changed during
stage 4:

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

**A walk for the lock.** One new walk: an app's files are hidden in the tree; a card opened from
the board shows its preview; a draft to it is refused; after "show files" the editor opens and
saves; a reload hides the files again.

## Clarifications

- **The order of steps 1 to 3 is free.** Take the smallest first: step 1.
- **The count.** ADR-0040's count of app lines is taken again after each step and recorded in
  the PR, and the ADR is refreshed once at the end.
- **Not adopted here:** the runner, the storage port, the undo journal, and the explorer's
  tree. The brief keeps the runner and the check-in shared core out of scope.
- **The preview pages** (public, library, claim review) still mount without the format
  descriptors, which stage 4's follow-up log left for this spec to decide. They do not join
  this adoption: they are format work, and the walks do not open them. Jamie asked on
  2026-11-14 where the work is captured, since it reads as more than a follow-up, and then
  for the seed: it is in Context Manager's own pool (context-manager#1199), since the pages
  are its own and this repository already supplies the descriptors they would mount through.
  Decision 5 of the review.

## Non-goals

- The format registry, which Context Manager adopted at the end of stage 4
  ([context-manager-adopts-formats](../../../stage4/phase4/specs/context-manager-adopts-formats.md)).
- Any change to Context Manager's storage, check-in services or board service.
- New features in either app.

## Acceptance / completion checklist

- [ ] Both walk suites pass on the pin alone.
- [ ] After step 1, a module's bounds, pages and copy exist only in this repository.
- [ ] After step 2, the client halves hold no layout and no page styles of an app.
- [ ] After step 3, neither app has a check-in dialog of its own.
- [ ] Both walk suites pass on the first PR's tip, with the walks' edits in the commits that
      moved the markup.
- [ ] After step 4, an app's files are hidden in the repo tree until shown, the server refuses
      a draft to them, and the lock's walk passes with both suites.
- [ ] Each PR lists its behaviour changes and the sizes before and after.
- [ ] ADR-0040 is refreshed with the new count.

## Implementation plan

1. PR: the pin; bounds, pages and copy; the shells; the check-in review. Walked at the pin and
   at the tip.
2. PR: the lock, after listing every entry that writes to an app's file, with its walk.
