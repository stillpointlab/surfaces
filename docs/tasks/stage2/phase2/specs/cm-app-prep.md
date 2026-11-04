---
column: done
completed: 2026-11-03
created: 2026-11-03T12:29:49-07:00
tags: [apps, host-contract, code]
---

# Spec: Context Manager prep for the apps breakout

_The first step of the [apps breakout brief](../../phase1/briefs/apps_breakout.md). It is tracked
here and lands as one Context Manager PR. No surfaces change. This repository is public, so the spec
names only the paths and module shapes the change needs._

## High-level goal

Every module of the tasks and inventory apps that is bound for surfaces imports only `yaml`, `zod`,
surfaces packages, its siblings, a few shared utilities and shared types. A Context Manager test
holds that line. After this PR, moving each app's core is a `git mv` plus import changes.
Users see no change: every route, job and response behaves as before.

## Related context

- Brief: [apps breakout](../../phase1/briefs/apps_breakout.md), desired outcome 1.
- Spike: [apps breakout](../../phase1/spikes/apps-breakout.md), findings 2–4 (the ties).
- Context Manager decisions: ADR-0022 (inventory view), ADR-0028 (manifest mounts).
- Unblocks: [inventory-core](inventory-core.md), and phase 3's tasks core.
- Main files (Context Manager, `main` at `1ff02ff6`): `src/services/tasks/`,
  `src/services/inventory/`, `src/services/git/`, `src/shared/utils/`.

## Technical requirement

1. **The host's git-sync utilities leave `tasks/`.** Move `tasks/draftState.ts` and
   `tasks/gitMetadata.ts` (and their tests) to `services/git/`, then update the importers. Those are
   currently `backupLink`, `conversation/toolsets/linkedFiles`, `digitalGood`, `repoAgent`,
   `repoImport`, `repoPush`, `repoViewLifecycle`, both inventory services, and the tasks board and
   check-in services. Only file locations change.
2. **Board detection takes paths, not goods.** `appOnlyBoardPaths(board, kinds, candidateGoods)` →
   `appOnlyBoardPaths(board, kinds, appOnlyPaths: Iterable<string>)`. It no longer imports
   `isAppOnlyGood`. Each caller passes `appOnlyEligiblePaths(goodByPath)`, the filter
   `gitMetadata.ts` already provides for detection: seven calls in `board.service.ts` and two in
   `checkin.service.ts`. Compute it once per request where a method calls it more than once.
3. **One YAML scalar formatter, owned by neither app.** `formatYamlScalar` moves from
   `inventory/roomWriter.ts` to `src/shared/utils/yamlScalar.ts`, with the type widened to
   `string | number | boolean`; `SharedInventoryScalar` already is that type. Its four inventory
   importers and two tasks importers switch over. The surfaces `common` package gets the same
   function later ([app-core-groundwork](app-core-groundwork.md)), and the inventory core adoption
   swaps the import.
4. **The manifest-folder rule leaves inventory.** `isValidInventoryFolder` is the one grammar for
   "a folder a manifest can live in" (the `tasksPath.utils.ts` header says so). It becomes
   `isValidManifestFolder` in `src/shared/utils/manifestFolder.utils.ts`. Both create dialogs and
   `project.schemas.ts` import it from there. It stays host-side, because only the create flows use
   it.
5. **Seeds split into content and I/O.** In `inventory/manifestSeed.ts`, `inventory/roomSeed.ts`
   and `tasks/manifestSeed.ts`, the async `seed…File` functions (the ones that call
   `RepoImportService`) move to a host file per app (`inventory/seedFiles.ts`,
   `tasks/seedFiles.ts`). The seed modules keep only the pure builders: `manifestSeedContent`,
   `roomSeedContent`, `slugifyRoomTitle`, `tasksManifestSeedContent` and the seed types.
6. **Inventory's pure rules leave the service.**
   - `inventory.service.ts`'s field validation (`validateLegacyDeclaredField`,
     `validateConfiguredField`, `rejectConfiguredLegacyInput`, `validateExtraKey`) becomes module
     functions in `inventory/fields.ts`.
   - Its totals and duplicate handling (`configuredNumber`, `aggregateItems`, `emptyTotals`,
     `applyRoomTotals`, `demoteDuplicateIds`) move to `inventory/totals.ts`.
   - The service calls them, and `itemEditError` stays in the service.
7. **Pure modules throw their own errors.**
   - An app module that rejects input throws an error class it owns. `inventory/errors.ts` exports
     `InventoryRuleError { code, message }`, and `tasks/errors.ts` exports
     `TasksRuleError { code, message, details }`.
   - The host maps each to the error it threw before, with the same status, code and message,
     where the service or route catches it. That makes responses byte-identical.
   - Affected throws: `csv.ts`'s `assertExportable` (409 `INVENTORY_SCHEMA_INVALID`); the field
     validators in step 6 (400, their current codes); and every `ValidationError` in
     `tasks/manifestRewrite.ts`.
   - `room.ts`'s rethrow of a YAML parse error is not a host error and stays.
   - A function that already returns a result keeps returning it.
8. **The boundary test.** `src/services/appBoundary.test.ts` lists the modules bound for surfaces
   and fails if any of them has a value import outside the allowed set.
   - Inventory modules: `room`, `roomWriter`, `manifest`, `csv`, `detection`, `fields`, `totals`,
     `errors`, `manifestSeed`, `roomSeed`.
   - Tasks modules: `manifest`, `boardDetection`, `cardProjection`, `frontmatter`, `nav`, `pool`,
     `linkRewrite`, `manifestRewrite`, `manifestSeed`, `errors`.
   - Shared files: `inventory.types.ts`, `tasks.types.ts`, `inventoryPath.utils.ts`,
     `tasksPath.utils.ts`, `frontmatterBlock.ts`, `yamlScalar.ts`.
   - Allowed value imports: `yaml`, `zod`, `@stillpointlab/*`, listed modules, and the listed shared
     utilities.
   - Type-only imports from `shared/interfaces` and `types/database` are also allowed. The cores
     replace those with their own types when they move.
   - The test parses import declarations from the source text. It does not need a bundler.

## Clarifications

- **Why an owned error class and not a result type.** The brief's wording was "typed failures". A
  thrown error class owned by the module keeps every signature as it is, which is the brief's
  move-as-is decision. Result types are Jamie's preferred pattern; moving the cores to them is the
  [result types seed](../../../unassigned/seeds/result-types-for-app-cores.md), for the contract
  step.
- **What stays.** Both `lifecycle.ts` adapter objects implement the host's `RepoViewAdapter`, so they
  stay host-side and call into the cores. The same goes for `prState.ts` (Redis) and
  `tasks-nav.shared.ts` (element phase).

## Non-goals

- Moving any code to surfaces, or changing `RepoViewName` or the lifecycle service.
- Behaviour changes. Any test that has to change, other than for imports and paths, says why in the
  PR.

## Acceptance / completion checklist

- [x] Steps 1–7 done. `npm run check` is green, and the API, web route and service tests pass with
      no change to their expectations.
- [x] `appBoundary.test.ts` passes, and it fails when a forbidden import is added back (shown in the
      PR).
- [x] The tasks and inventory e2e walks were run against the scratch repository, or the PR says
      which ones were not run and why (brief constraint).
- [x] An entry in Context Manager's current WAL points at this spec and the PR.

## Implementation plan

Do it in one PR in a Context Manager worktree, never Jamie's checkout. Commit in the order of the
steps above, so a reviewer can read each tie as it is cut. Write the boundary test last, and show in
the PR that it fails on the commit before step 1.

## Landed

Context Manager #1019 (merged 2026-11-03), one commit per step. CM has no `npm run check`; lint,
typecheck, test and the server build stood in. The walks were not run for #1019 (no agent slot
yet); the inventory walks then passed on the adoption, #1022, and the tasks walks wait for the
tasks core adoption.
