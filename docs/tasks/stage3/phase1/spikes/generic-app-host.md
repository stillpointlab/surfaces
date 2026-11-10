---
column: in-progress
created: 2026-11-10T14:31:13-07:00
tags: [apps, host-contract, common, major-feature]
---

# Spike: the generic app host — what Context Manager still holds per app, and what can be one path

> Tech-spike working notes for stage 3. Read against Context Manager `main` at `98608e57`
> (2026-11-10), after stage 2 closed. Line counts are `wc -l` without tests; file paths are
> Context Manager's unless they start with `packages/`.

## Question

Stage 2 moved the apps' rules into their cores and their UI into elements, and both apps now run in
this repository's harness on their cores alone. Context Manager still hosts them app by app: each
has its own endpoints, service, page, check-in and job. Jamie's direction for stage 3 is to keep
going: the apps should leave Context Manager through **one generic interface** that any app plugs
into, until Context Manager names inventory and tasks only where it has to. "No mention at all" is
probably too high a bar; the stage should aim at a reasonable minimum.

So:

1. What does Context Manager still hold for each app, and which of it is generic host work, which
   is a host fact an app needs, and which is truly app-specific?
2. Can one op route answer any core's ops: addressing, refusals, linking, writing, replies?
3. Can the host facts each app needs come from one small per-app provider?
4. How much of check-in and refresh can be shared?
5. Can one page mount any app's element?
6. What is left, the "minimum", once those are done?

## Findings

### 1. What Context Manager holds today

About 9,100 lines are wholly an app's, plus a few hundred lines of app mentions in shared code.

| Area           | Tasks                                                                                        | Inventory                                                                 | Notes                                                                             |
| -------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Services       | 3,493 (`services/tasks/`: board 2,357, check-in 724, refresh 288, PR state, seed, lifecycle) | 1,279 (`services/inventory/`: service 724, check-in 506, seed, lifecycle) | the host work around the cores                                                    |
| API routes     | 22 endpoints under `/tasks/…`                                                                | 7 under `/inventory/…` (`/rooms…`)                                        | about 1,200 lines of `routers/api/v1/project.routes.ts`, plus ~20 request schemas |
| Web routes     | 3 pages (board, stage, phase)                                                                | 4 (space, zone, two exports)                                              | about 320 lines of `routers/web/project.routes.ts`                                |
| Page scripts   | 1,388 (`pages/task-board/`: page, op answers, nav, refresh button)                           | 533 (`pages/inventory/`)                                                  | they answer the elements' ops by calling the endpoints                            |
| Create dialogs | 353                                                                                          | 364                                                                       | in the project page; stage 2 kept them here                                       |
| Types          | `tasks.types.ts`, path utils                                                                 | `inventory.types.ts`, path utils                                          | 211 lines: the ids laid over the cores' types                                     |

App names also appear in shared code:

- **Feature flags:** `TASKS_VIEW` and `INVENTORY_VIEW` gate each app's routes and pages (6 uses).
- **Jobs:** three job types, `GIT_TASKS_CHECKIN`, `GIT_TASKS_REFRESH` and `GIT_INVENTORY_CHECKIN`,
  with payload schemas and handlers in `jobs/`.
- **The project page's tree and preview:** `repo-tree.ts` and `doc-preview.ts` keep per-view label
  and icon maps, and the tree's menu opens each app's create dialog by name.
- **Cache keys:** tasks' card projections and PR states.
- **MCP:** tool descriptions name the two views. Agent writes refuse a path a view owns
  (`PATH_IN_VIEW_SCOPE`), which is already generic over views.
- **Export/import:** one import of the tasks core's frontmatter parser.

### 2. What is already generic

- **Enable, reconcile and the tree.** `RepoViewAdapter` (`services/git/repoViewLifecycle.types.ts`)
  extends the cores' `AppLifecycle` and calls itself "the model seam for future views (sheets,
  record types): implement this, wire an adapter, and enable/reconcile come for free". Each app's adapter is under 20 lines:
  the core's lifecycle plus four policy fields. The only closed part is the
  `RepoViewName = 'tasks' | 'inventory'` union.
- **The contract.** `AppCore` (`project`, `apply`, `seed`) in `common-format/app`, with both cores
  on it and `describeAppCore` holding every op to the round trip.
- **The elements.** Both apps' elements are transport-blind: they ask ops by path and raise requests
  (stage 2, phases 5–7).
- **A second host exists.** The harness hosts both apps on their cores alone
  (`packages/apps/*/dev/host.ts`), with no hand-written op handling left. Any interface the brief
  proposes can be tried there first.

### 3. The op path today, and the shape both services share

An element asks an op by path. The page maps the path back to an id (a zone slug, a good's public
id) and calls that op's endpoint. The route validates and calls a service method, and the service
then runs the same five steps in both apps:

1. **Load:** the files in scope, drafts laid over, as the core's snapshot (`loadSpace`,
   `getBoardContext`).
2. **Decide:** the core's `apply`, and on a refusal its code mapped to a status
   (`INVENTORY_REFUSAL_STATUS`, `TASKS_REFUSAL_STATUS`, plus each app's not-found map).
3. **Link on first change:** a tracked file is linked, the snapshot reloads, and the op runs again
   (`changeZone`; `runManifestOp`; the card ops).
4. **Write:** a `write` becomes a draft with `explicitBase`, and a `create` becomes an app-only good.
   Inventory refuses `move`.
5. **Answer:** re-project, lay the ids and host facts on, and reply.

Steps 1–4 are the same code twice, and neither copy needs to know which app it is running. The
differences are in what each app adds:

- **Tasks' moves** are the one write kind only tasks makes. A `move` becomes a draft plus move
  bookkeeping on the good (`recordMove`: anchor, hops, undo), which the core reads back as
  `snapshot.moves`. This is generic too, a host's handling of the contract's `move` change, but
  only tasks exercises it.
- **Tasks' write bases** come from three places: drafts, cached projections and tracked blobs
  (`linkedCardSources`, `trackedCardSources`, `getCachedProjection`), because a board can hold
  hundreds of tracked cards that are never read in full. Inventory reads every zone.
- **Rebase:** tasks rebases a metadata-only draft automatically (`tryAutoRebaseDraft`) and resolves
  divergence (`resolveDivergedCard`). The core decides what changed (`metadataDelta`); the host
  decides when to do it. Draft-related, not app-related.

### 4. Host facts

What each core reads beyond the files:

- **Inventory:** `enabled` and `dirty`, both derived from goods and drafts.
- **Tasks**, per card: `changed`, `dirty`/`versionColumn`, `movedFrom`, `tracked`, `diverged`,
  `checkinPrUrl`, `prState`. Then the order file's `changed`, `housekeeping`, and the snapshot
  extensions `created`, `inFlight`, `moves` and `projections`.

Almost all of these are draft and good state that Context Manager has for any linked file. The
exceptions are tasks' PR state (from the refresh job's cache) and the check-in PR. A per-app
provider would be small. Most of the facts could even be one generic provider, mapped onto each
app's fact type by a few lines of app code.

### 5. Host ops and replies

Not every element op is a core op. The harness hosts show the split exactly.

- **Tasks:** 12 core ops across the board (9) and the nav (3). The board adds host ops `resolve`
  (divergence), `scan-references`, `read-file` and `refresh-stage`, and the nav adds
  `close-candidates`.
- **Inventory:** 4 core ops, plus the host op `link-editor`.

The replies are re-projections shaped per op: a card, the pool, a zone state. A generic route
needs a per-app mapping from (op, result) to the element's reply. The harness writes these as small
switches today.

### 6. Check-in and refresh

- **Check-in** exists twice:
  - tasks' (`checkin.service.ts`, 724 lines);
  - inventory's (506 lines), whose header calls it "a deliberately thin parallel of
    `TasksCheckinService`", with the shared core's extraction already flagged.

  Both app check-ins have the same policy: one branch, one commit and one PR, abort-all on upstream
  divergence, PR before publish, own merged check-ins exonerated. Tasks adds three things: renames
  for moved cards, "deliberate" dirty flags, and the metadata-only conflict classification.

- **Refresh** (288 lines) is tasks-only. It refreshes PR states for check-in chips and `pr:`
  frontmatter. It is the clearest candidate for app-specific code that stays.

### 7. Pages

Each app's page is server-rendered with the state embedded:

- tasks: the board, stage and phase views, plus the nav;
- inventory: the space and zone views.

The page scripts mostly answer ops by calling endpoints, remember ids, and build links. With one op
route the scripts shrink to a generic answerer, plus each app's links and its host requests
(check-in, refresh, navigation). The web routes differ in what they pre-load, and the URL shapes
are user-facing: `/tasks/<instance>/stage/<n>/phase/<m>`, `/inventory/<instance>/room/<slug>`.

### 8. Constraints from earlier designs

Context Manager's August app design anticipated an `AppModule` and a slim harness; stage 2 built
the core half and the harness. Its later amendments have two consequences for the brief:

- It must not foreclose a second binding of the same contract for agents (MCP app vocabularies).
- It must not hard-wire "every op commits at once" as the only policy.

Neither needs building in stage 3. The stage 2 constraint carries over as it is: nothing assumes
Context Manager is the only host.

## Recommendation

Write the stage 3 brief around **an app module in `common-format/app`, and one host path in
Context Manager that runs any module**, inventory first.

1. **`AppModule` (surfaces).** One object per app that a host registers. It has:
   - an `id` and the manifest file name;
   - the core and the lifecycle;
   - the element entry and tags;
   - the host ops the elements ask for, beyond the core's;
   - the reply mapping from (op, result) to the element's answer;
   - a status class for each refusal code (not found, conflict, invalid).

   `results-everywhere` lands here, so one table maps any core's refusal. `inventory-element-op-types`
   lands too, so ops are typed end to end. The harness hosts are rewritten onto it first, as proof.

2. **One op route (Context Manager).** `POST …/views/<instance>/ops` takes an element op as it is
   asked, by path, with no id mapping. A generic `AppHost` runs load → decide → link → write →
   answer for any registered module. Two hooks remain:
   - a facts provider per app;
   - a `move` handler, which is generic but used only by tasks.

   Inventory moves first, then tasks. Each app's per-op endpoints retire as its ops move.

3. **One page.** A generic view page mounts the module's element from the embedded projection.
   Check-in, refresh and navigation stay as host requests the page answers. Whether the URLs change
   is a decision, not a requirement: the page can keep each app's path shapes.
4. **One check-in core.** Extract the shared check-in from the two app services, with hooks for
   tasks' renames, dirty selection and conflict classification. The jobs become one job type keyed
   by view.
5. **The minimum, written down.** What stays app-named after 1–4, as far as this reading shows:
   - tasks' refresh job and its PR-state cache;
   - the per-app facts and `move` hook;
   - the create dialogs, unless `seed` replaces them;
   - each app's feature flag;
   - the module list itself.

   The spec for each step should update this list.

Every step runs both walk suites, as stage 2's did. Steps 1–2 for inventory are about the size of
stage 2's inventory-rules phase. Tasks' half of step 2 is the largest single piece: the board
service is 2,357 lines, of which the draft and projection plumbing stays host work, but generic.

### Open questions for the brief

- **URLs:** keep each app's page and API path shapes, or move to `/views/<instance>/…` with
  redirects? The API is only the pages' own, so it can change freely. The page URLs are bookmarked.
- **Migration:** do per-op endpoints and the generic route coexist while an app moves, or does each
  app switch in one PR?
- **Create:** do the create dialogs become generic through the core's `seed`, or stay per app as
  stage 2 decided?
- **Check-in scope:** extract the shared core in this stage, or record it as the minimum and do it
  next?
- **Flags:** one generic gate keyed by view type, or keep the two named flags?
- **Order:** inventory first, as in stage 2? It is smaller and has no moves, which makes it the
  cheaper proof.

## References

- Stage 2: [the apps breakout spike](../../../stage2/phase1/spikes/apps-breakout.md), the
  [app rules brief](../../../stage2/phase7/briefs/app_rules.md), and the
  [changelog](../../../../devlogs/stage2/changelog.md).
- The contract: `packages/common/src/app.ts` (`AppCore`, `AppLifecycle`) and its README; the cores'
  `core.ts` in `packages/apps/{tasks,inventory}/src/`.
- The second host: `packages/apps/{tasks,inventory}/dev/host.ts`.
- Context Manager: `services/git/repoViewLifecycle.types.ts` (`RepoViewAdapter`),
  `services/tasks/`, `services/inventory/`, `routers/api/v1/project.routes.ts`,
  `routers/web/project.routes.ts`, `client/pages/{task-board,inventory}/`, and `jobs/registerHandlers.ts`.
- Pool seeds this touches: `results-everywhere`, `inventory-element-op-types`,
  `inventory-zones-folder` (generic routes would leave the folder rename a core-only change),
  `move-undo-reference-strand` and `browser-tests`.
