---
column: done
pr: 35
created: 2026-11-03T12:04:36-07:00
tags: [apps, host-contract, common, major-feature]
---

# Spike: the apps breakout — what moves, in what order

> Tech-spike working notes for the stage 2 seed,
> [apps breakout from Context Manager](../seeds/apps-breakout-from-context-manager.md). Read
> against Context Manager `main` at `1ff02ff6` (2026-11-03). Line counts are `wc -l`; file paths
> without a repository prefix are Context Manager's.

## Question

Tasks and inventory are to move out of Context Manager's `src/` into `packages/apps/` here. What are
they made of today, where is the line between what moves and what stays host-side, how does Context
Manager consume an app from the submodule, and in what order should stage 2's phases run?

This is not the first look. Context Manager's pooled spike
[`apps-as-executors`](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/unassigned/spikes/apps-as-executors.md)
(2026-08-08, reviewed 2026-08-19 against
[`platform-architecture.md`](https://github.com/stillpointlab/context-manager/blob/main/docs/product/platform-architecture.md))
designed the contract and an order. This spike checks it against today's code and against
something it did not have: a public repository that already builds, tests and ships surfaces into
Context Manager.

## Findings

### 1. The August contract, and what has happened since

`apps-as-executors` named the kernel object, the **reviewable changeset over a managed folder**, and
a small interface: an `AppModule` with pure `parseManifest`, `scope`, `describe`, `seed`, `project`
(folder → renderable state plus stewardship warnings) and `apply` (intent → `FileChange[]` or a
typed refusal), over a harness-owned `FolderSnapshot` (`paths()`, `read(path)`). The boundary is
paths, bytes and JSON; the harness owns drafts, identity, caching, the review gate, flush, jobs and
auth. Its re-sequenced order (amendment 5): boundary in place → name the kernel types → MCP as the
second harness → slim harness with open-sourcing → workspace package. Amendment 6: MCP speaks
through the app's vocabulary (ops become tools, `project()` state becomes resources).

What happened instead, in Context Manager:

- **None of the order's first two steps.** `src/services/tasks/` is still flat (no `core/` /
  `adapter/` split, no enforcement test); no `AppModule`, `FolderSnapshot` or `FileChange` exists in
  `src/`. 26 commits touched the tasks app since 2026-08-08, the last service change 2026-08-29; 8
  touched inventory, the last 2026-11-01.
- **MCP went generic, not per app.** The 40 tools are platform verbs (goods, repos, ledger). App
  territory is fenced rather than spoken: `repoAgent.service.ts` refuses an agent write inside an
  enabled view with `PATH_IN_VIEW_SCOPE` ("that view's own check-in carries it"). ADR-0029 kept the
  tool list a plain module-level array, "the whole extension seam per apps-as-executors amendment 6".
- **The workspace package step is half-done from the other side:** Context Manager's `workspaces`
  already list `packages/surfaces/packages/apps/*` (ADR-0035), and `packages/apps/README.md` here
  holds the placement test. The folder is empty.
- **The task board drifted away from "ops out".** The spike observed that `<spl-task-board>` "never
  fetches". Today `src/client/components/task-board/task-board.ts` (1,439 lines) still takes
  `setState`, but it calls `apiFetch` itself in 11 places (move, move-file, pool order, stage state,
  link scan and fix, import, file reads) and dispatches 6 events. The transport-blind shape has to
  be restored before the element can move.
- `board.service.ts`, "~2,500 lines" then, is 2,972 now.

The spike's caution against a separate repository ("no external consumer", "every change a two-repo
change") was overtaken by ADR-0035: the repository exists, is public MIT, and the pin-move tax is
already paid weekly for the formats. Stage 1 also built two things the spike wanted later: a
conformance-suite pattern in `common`, and a harness that mounts surfaces from fixtures.

### 2. The tasks app

**Server, `src/services/tasks/`:** 17 source files, 6,594 lines; 15 test files, about 6,300.

| Module                                     | Lines | Imports beyond `yaml`/`zod`/shared types                                   | Class      |
| ------------------------------------------ | ----: | -------------------------------------------------------------------------- | ---------- |
| `manifest.ts`                              |   338 | `RepoTreeNode` type                                                        | pure       |
| `boardDetection.ts`                        |   354 | `gitMetadata`, `RepoTreeNode` type                                         | pure       |
| `frontmatter.ts`                           |   317 | `shared/utils/frontmatterBlock`                                            | pure       |
| `cardProjection.ts`                        |   116 | `frontmatter`                                                              | pure       |
| `nav.ts`, `pool.ts`, `linkRewrite.ts`      |   306 | —                                                                          | pure       |
| `manifestRewrite.ts`                       |   462 | `errors/validation.errors`, **`inventory/roomWriter.formatYamlScalar`**    | near pure  |
| `lifecycle.ts`                             |    70 | implements the host's `RepoViewAdapter`                                    | pure       |
| `manifestSeed.ts`                          |    71 | `seedTasksManifestFile` calls `RepoImportService`; the content is pure     | mixed      |
| `prState.ts`                               |    75 | Redis `Cache` for the PR-state map; the frontmatter parse is pure          | mixed      |
| `draftState.ts`, `gitMetadata.ts`          |   196 | none, but they are git-sync utilities used across the host (below)         | host utils |
| `board.service.ts`                         | 2,972 | `Database`, `Cache`, `DraftService`, `S3Service`, `SecretService`, GitHub… | host       |
| `checkin.service.ts`, `refresh.service.ts` | 1,014 | `JobService`, `RepoCommitService`, `RepoPushService`, lifecycle, sync      | host       |

`board.service.ts` is the adapter the August spike predicted: per method, load context (tree and
goods by path) → read through draft, then latest version (S3), then upstream blob → pure transform →
`draftService.saveDraft` or metadata. About 750 lines of `routers/api/v1/project.routes.ts` and 18
request schemas are tasks routes; two jobs (`GIT_TASKS_CHECKIN`, `GIT_TASKS_REFRESH`); the
`TASKS_VIEW` flag; two Redis keys. **No MCP tools.**

**Client:** `components/task-board/task-board.ts` 1,439 + scss 648 (vanilla custom element,
`innerHTML` templates, `scss?inline`), `pages/task-board/` (page script 649, `tasksNav.ts` 311,
`boardSettings.ts` 294, `refreshButton.ts` 91, EJS 218, scss 383), `pages/project/createTasksModal.ts` 352. First render is server JSON in `<script data-board|data-stage>`; later reads re-fetch. A drag is
`POST /board/move {goodId, column}` → frontmatter rewrite → a per-user draft; nothing reaches GitHub
until check-in, a job that commits to a branch and opens one PR. The board uses host components
(`modal-dialog`, `spl-icon`, `notification-banner`, `options-menu`) and imports no surfaces format.

**Shared:** `shared/interfaces/tasks.types.ts` 335 (no imports), `tasksPath.utils.ts` 35,
`shared/components/tasks-nav.shared.ts` 98 (an HTML-string renderer used by SSR and client),
`frontmatterBlock.ts` 22.

**Tests that stay with the host:** about ten describe blocks in the API route tests,
`project.tasks.routes.test.ts` 216, the lifecycle service tests, and `e2e/walks/` (30 agent-driven
walks against `stillpointlab/scratch`, not in CI).

### 3. The inventory app

Per ADR-0022, physical goods in rooms with the repo as the database: `inventory.yaml` declares the
fields (v2 is config-driven, `docs/guides/inventory-format.md`), each `rooms/*.yaml` is a zone with an
`items:` list. The user enables or creates a space, browses overview and zone tables with search and
totals, edits items, adds zones, exports CSV or ZIP, and checks in as one PR.

**Server, `src/services/inventory/`:** `room.ts` 439, `roomWriter.ts` 515 (line-based,
byte-preserving edits), `manifest.ts` 317, `csv.ts` 275, `detection.ts` 88, `lifecycle.ts` 35 are
pure: 1,669 lines that import `yaml`, `zod`, shared types and **`@stillpointlab/sheet-format`'s
`./presentation` and `./csv` entries** (one `ApiError` throw in `csv.ts` aside). The seeds are mixed
like tasks'. `inventory.service.ts` 1,395 is host-bound the same way `board.service.ts` is, with
field validation (lines 1194–1300) and totals plus duplicate-id demotion (1303–1395) inline and
pure. `inventoryCheckin.service.ts` 506 is the job. Seven API routes, four web routes (overview,
zone, CSV, ZIP), one job, the `INVENTORY_VIEW` flag. **No MCP tools.**

**Client:** `pages/inventory/inventory.ts` 1,351 + scss 624 + EJS 70, and
`pages/project/createInventoryModal.ts` 364. Not a component: a page script that renders the
server-embedded state with `innerHTML` and calls the routes; each mutation returns fresh state.
"Open in editor" imports the good and navigates to the host's digital-good page, so raw YAML
editing is already a format's job.

**Tests that stay with the host:** `project.inventory.routes.test.ts` 450, the API route cases, and
`e2e/inventory-walks/` (19 files, about 2,900 lines, against `stillpointlab/scratch`, not in CI).

### 4. Coupling the cut has to go through

- **tasks → inventory:** `tasks/manifestRewrite.ts` and `tasks/manifestSeed.ts` import
  `formatYamlScalar` from `inventory/roomWriter.ts`; `createTasksModal` uses
  `isValidInventoryFolder`. A shared YAML helper belongs below both apps.
- **host → tasks:** `tasks/draftState.ts` and `tasks/gitMetadata.ts` are imported by
  `repoPush`, `repoImport`, `repoAgent`, `repoViewLifecycle` and both inventory services. They are
  the host's git-sync model that happens to live in `tasks/`; they stay in Context Manager and move
  to `services/git/`. One pure module leans on them: `boardDetection.ts` filters goods with
  `isAppOnlyGood(good.metadata)` (a file created in the app, not yet upstream). In the snapshot
  model that is the host's overlay, so detection should take the app-only paths, not goods.
- **The lifecycle is closed over two names.** `RepoViewName = 'tasks' | 'inventory'`, an `ADAPTERS`
  map, and `enableTasksView` / `reconcileTasksUpstream` are hard-coded in
  `repoViewLifecycle.service.ts`; `SharedTaskBoardDescriptor` is baked into the instance types for
  the repo tree's board icons. The `RepoViewAdapter` interface itself is already pure ("tree in,
  paths out") and is the natural seed of the app module's lifecycle half.
- **Host chrome in app UI.** Both UIs use Context Manager's `modal-dialog`, `spl-icon`,
  `notification-banner` and `options-menu`. A surfaces element cannot.
- **Precedent for the server consuming surfaces:** `inventory/manifest.ts` already imports
  `@stillpointlab/sheet-format/presentation` on the server, built by `npm run build:packages`
  before `tsc`. A DOM-free `./core` entry on an app package is the same move.

### 5. What fits where

Applying the August split to today's files:

- **Moves, as an app's DOM-free core** (`@stillpointlab/<app>-app`, root or `./core` entry, runs in
  Node and the browser): tasks' pure modules (about 2,000 lines) and the adapter half of
  `lifecycle.ts`; inventory's pure modules (about 1,700) plus the validation and totals carved out
  of `inventory.service.ts`; the shared types and path utils (Context Manager re-exports them, as
  `components.d.ts` re-exports the format contracts); the pure halves of both seeds. Their unit
  tests (about 2,000 lines for tasks' pure modules, 1,600 for inventory's) move with them.
- **Moves, as an app's element** (`./element`): the task board and the inventory overview and zone
  views, once each takes state and emits ops with no transport of its own, and once host chrome is
  either replaced by `common` helpers or requested through events.
- **Stays host-side:** `board.service.ts`, `inventory.service.ts`, both check-in services, refresh,
  the routes and schemas, jobs, flags, Redis keys, the lifecycle service, the EJS shells and page
  scripts that wire an element to `apiFetch`, the create modals' transport, the git-sync utilities,
  and every route, service and e2e test above. That is the substrate (ADR-0023/0024: drafts,
  identity, caching, review, flush), and it is private.
- **Not yet:** melting `board.service.ts` into snapshot → kernel `apply` → changeset, MCP app
  vocabularies, and a standalone folder harness. Each needs the contract named first; none needs to
  block the move.

### 6. What surfaces already offers the apps

- **The package shape.** Formats already ship DOM-free subpaths that the host server imports
  (`sheet-format/csv`, `./presentation`) beside element entries. An app is the same: a core entry
  and an element entry. The template and `npm run new-format` are format-shaped; the
  [one scaffold](../../../unassigned/seeds/one-scaffold-for-formats-and-apps.md) seed is the place
  to generalise, better after two apps exist by hand than before.
- **The harness as the slim harness.** `tooling/harness/` mounts every format from its
  `dev/fixtures.ts`. An app's fixtures are folders (a `tasks.yaml` plus cards; an `inventory.yaml`
  plus rooms) and its element gets `project()` state from them; an op applied in memory and
  re-projected is the August spike's "slim harness proof" at almost no cost. The harness never
  writes to disk.
- **Conformance.** `common/testing` already runs one suite per element contract. A `describeAppCore`
  suite (parse → project → apply → re-parse round-trips byte for byte, unknown files are warned)
  holds every app to ADR-0028's stewardship and byte-preserving rules.
- **Dogfood.** This repository's own `docs/tasks/` is a ready tasks fixture, as Context Manager's
  is.

### 7. Licensing

`surfaces` is public MIT (ADR-0035), and the platform architecture says the apps are not the moat
("editors and apps are deliberately not the moat"; untrusted apps, trusted substrate). Moving the
cores and elements publishes them; the host services that hold drafts, review, check-in and the
ledger stay private. Nothing found in the pure modules is sensitive, but this is a decision to
record, not assume.

## Recommendation

**A brief next**, since the work spans several specs in two repositories and changes the contract
apps are held to. Recommended shape for it, with the order the findings point to:

1. **Context Manager prep (one CM PR, no surfaces change).** Move `draftState.ts` and
   `gitMetadata.ts` to `services/git/`; move `formatYamlScalar` and `isValidInventoryFolder` to a
   shared module; give `boardDetection` app-only paths instead of goods with metadata; replace the
   `ApiError` and `ValidationError` throws in pure modules with typed results the host maps. After it, every module bound for surfaces imports only `yaml`, `zod`,
   shared types, its siblings and surfaces packages, which a CM test can assert.
2. **Inventory core moves first.** It is smaller, already depends on `sheet-format`, changes less
   (8 commits since August against 26), and has no element to untangle before the core lands.
   `packages/apps/inventory` with a core entry, the moved tests, and a `describeAppCore` suite in
   `common`; Context Manager swaps imports and re-exports the types with the pin move. This is a
   `git mv` with no contract committed: functions keep their signatures.
3. **Tasks core moves** the same way, including `manifestRewrite`, `linkRewrite` and the pure seed.
4. **The contract is named when the elements move**, because ops-out is where it bites: the op
   union each element emits, the state it takes, and the lifecycle adapter. Recorded in `common` as
   types (`AppModule` in the August shape, `RepoViewAdapter` as its lifecycle half), with a Context
   Manager ADR for the host side. `goodId` leaves app-facing ops for paths here, as the August spike
   asked.
5. **The task board element** is made transport-blind in Context Manager (its 11 fetches become op
   events the page script answers), then moves with harness fixtures.
6. **The inventory element** is extracted from the page script into overview and zone elements,
   then moves the same way.

Host chrome (decided in the brief): app elements use `common`'s switch, notice and toolbar helpers
and render their own dialogs, and raise events for anything the host owns (navigation, opening a
good, notifications). Out of the stage unless the brief pulls one in: the `board.service.ts` melt
into changesets, MCP app vocabularies, and the one-scaffold generalisation.

### Open questions for the brief

_Answered by Jamie on PR 35 (2026-11-03): all five defaults taken, and a third category added,
shared components. The [brief](../briefs/apps_breakout.md) records the decisions._

1. **Publish the cores and elements as MIT here?** Default yes, per ADR-0035 and the platform
   architecture; the host services stay private.
2. **Inventory first?** Default yes (above). The case for tasks first: it is the app both
   repositories run on, so it is the better dogfood, and the riskier move.
3. **Move as-is first, name the contract at the element step?** Default yes. The alternative is the
   August order, contract first; the package boundary now enforces what the in-place `core/` split
   would have.
4. **Do the app docs move?** `docs/guides/inventory-format.md` and the tasks manifest reference
   describe the apps' formats; default: they move to each app's README, and Context Manager links.
5. **One feature flag or two after the move?** Both apps stay behind `TASKS_VIEW` and
   `INVENTORY_VIEW` in Context Manager; nothing here changes that. Default: unchanged.

## References

- Seed: [apps breakout from Context Manager](../seeds/apps-breakout-from-context-manager.md).
- Context Manager (`main` at `1ff02ff6`): spike `docs/tasks/unassigned/spikes/apps-as-executors.md`;
  `docs/product/platform-architecture.md`; `docs/product/research/apps-editors-lenses.md` (the
  editor : preview :: app : lens table, parked); ADR-0022 (inventory view), ADR-0023/0024 (app as
  cache, dormancy), ADR-0025 (view instances), ADR-0027 (tasks kind registry), ADR-0028 (manifest
  mounts), ADR-0029 (MCP mount, tool list as the extension seam), ADR-0035 (surfaces monorepo).
- Context Manager code: `src/services/tasks/`, `src/services/inventory/`,
  `src/services/git/repoViewLifecycle.{service,types}.ts`, `src/services/git/viewScope.ts`,
  `src/client/components/task-board/`, `src/client/pages/{task-board,inventory,project}/`,
  `src/shared/interfaces/{tasks,inventory}.types.ts`, `src/routers/api/v1/project.routes.ts`,
  `src/routers/web/project.routes.ts`, `src/routers/mcp/repoTools.ts`, `src/jobs/registerHandlers.ts`,
  `e2e/walks/`, `e2e/inventory-walks/`.
- Here: `packages/apps/README.md` (placement test); `packages/formats/sheet/package.json` (DOM-free
  subpaths beside element entries); `tooling/harness/`; `packages/common/src/testing/`; stage 1
  [changelog](../../../../devlogs/stage1/changelog.md).
