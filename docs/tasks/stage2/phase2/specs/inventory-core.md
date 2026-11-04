---
column: in-progress
created: 2026-11-03T12:29:49-07:00
tags: [apps, host-contract, code]
---

# Spec: the inventory core moves here

_The [apps breakout brief](../../phase1/briefs/apps_breakout.md), desired outcome 2. It depends on
[cm-app-prep](cm-app-prep.md) (merged in Context Manager) and
[app-core-groundwork](app-core-groundwork.md) (merged here)._

## High-level goal

`packages/apps/inventory` (`@stillpointlab/inventory-app`) holds the inventory app's DOM-free core,
moved as-is from Context Manager with its tests, with the inventory format guide as its README.
Context Manager's server and client import the core from the submodule, and users see no change.

## Related context

- Context Manager decisions: ADR-0022 (the inventory view and its format), ADR-0028 (mounts), ADR-0035 (apps live in `packages/apps/`).
- Spike: [apps breakout](../../phase1/spikes/apps-breakout.md), finding 3.
- Convention: `packages/apps/README.md` as [app-core-groundwork](app-core-groundwork.md) leaves it.
- Main files: Context Manager's `src/services/inventory/`, `src/shared/interfaces/inventory.types.ts`,
  `src/shared/utils/inventoryPath.utils.ts` and `docs/guides/inventory-format.md`, after the prep.

## Technical requirement

1. **What moves.** Each file keeps its name and contents, apart from imports.

   | Context Manager (after the prep)                    | Here (`packages/apps/inventory/src/`) |
   | --------------------------------------------------- | ------------------------------------- |
   | `services/inventory/room.ts`, `roomWriter.ts`       | `room.ts`, `roomWriter.ts`            |
   | `services/inventory/manifest.ts`, `csv.ts`          | `manifest.ts`, `csv.ts`               |
   | `services/inventory/detection.ts`                   | `detection.ts`                        |
   | `services/inventory/fields.ts`, `totals.ts`         | `fields.ts`, `totals.ts`              |
   | `services/inventory/errors.ts`                      | `errors.ts`                           |
   | `services/inventory/manifestSeed.ts`, `roomSeed.ts` | `manifestSeed.ts`, `roomSeed.ts`      |
   | `shared/interfaces/inventory.types.ts`              | `types.ts`                            |
   | `shared/utils/inventoryPath.utils.ts`               | `paths.ts`                            |
   | the tests of all of the above                       | beside them, unchanged except imports |
   - `src/index.ts` exports all of it.
   - `formatYamlScalar` comes from `@stillpointlab/common-format/yaml`.
   - The sheet helpers come from `@stillpointlab/sheet-format/presentation` and `/csv`.
   - `RepoTreeNode` is replaced by a structural `TreeNode { path; type: 'blob' | 'tree'; sha?;
size? }` exported from `types.ts`. Context Manager's type stays assignable to it.

2. **The package.**
   - `package.json`: MIT, `type: module`, one entry `.`, built with `formatPackage`.
   - Dependencies: `yaml ^2.9.0`, `zod ^4.6.7`, `@stillpointlab/common-format`,
     `@stillpointlab/sheet-format`.
   - `vitest.config.ts` uses `appTest()`, and `tsconfig.json` follows the formats'.
   - The root `build` and `typecheck` reach it through the existing `packages/apps/*` workspace
     glob, which runs after `common` and the formats.
3. **The README** is `docs/guides/inventory-format.md`, moved, plus a short opening that says what
   the package exports. It describes the file format, so nothing in it is host-specific.
4. **`describeAppCore`** runs over fixtures for a minimal v2 inventory, a configured v2 inventory
   with comments, and a v1 inventory.
   - Its rewrites are an added item, an edited item, a deleted item and an added zone, each through
     `roomWriter`.
   - `mount` wraps `parseInventoryManifest` plus `detectInventoryAt`, the way Context Manager's
     inventory `lifecycle.ts` derives the scope.
   - Inventory ignores files it does not recognise (a `notes.md` beside `inventory.yaml`, a non-YAML
     file in `rooms/`). ADR-0028 decision 4 asks for a warning, but Jamie expects to relax that rule
     (agent-made helper files make it noise), so nothing changes here and the suite does not check
     it.
5. **The Context Manager adoption** (one PR there, after this merges):
   - Move the submodule pin, and delete the moved files and their tests.
   - Import from `@stillpointlab/inventory-app` in `inventory.service.ts`,
     `inventoryCheckin.service.ts`, `lifecycle.ts`, `seedFiles.ts`, the routes, the client page and
     the create dialog. Point `yamlScalar.ts`'s users at `common-format/yaml`.
   - Turn `shared/interfaces/inventory.types.ts` and `shared/utils/inventoryPath.utils.ts` into
     re-exports of the package, so the barrel and its importers stay as they are.
   - Replace `docs/guides/inventory-format.md` with a pointer to the package README, and update
     ADR-0022's reference.
   - Shrink `appBoundary.test.ts`'s list by the inventory modules.
   - Run the inventory e2e walks against the scratch repository.
   - Add a WAL entry.

## Clarifications

- **The client imports the core.** `pages/inventory/inventory.ts` and `createInventoryModal.ts` use
  the path rules and types. Vite resolves the workspace package as it resolves the formats. Only
  `paths.ts` and the types reach the client bundle, so it should not grow beyond them; the PR
  checks this in the build output.
- **The server imports the built package**, as it already imports `sheet-format/presentation`.
  `npm run build:packages` runs before `tsc`, and the Dockerfile copies `packages/` whole.

- **No history comes with the code.** The formats arrived with their histories because they were
  public repositories. Context Manager is private, and its commit messages were never written for a
  public record, so the apps arrive as new files. Their history stays in Context Manager, and the PR
  names the source commit.

## Non-goals

- Any element, harness or component work (phases 4 and 6).
- Changing a function's signature or behaviour.
- The tasks core (phase 3).

## Acceptance / completion checklist

- [x] `packages/apps/inventory` builds, typechecks and passes its moved tests (`csv`, `detection`,
      `manifest`, `manifestSeed`, `room`, `roomWriter`, plus whatever tests the prep gave `fields`
      and `totals`) under Node.
- [x] `describeAppCore` passes over the inventory fixtures.
- [x] README = the format guide.
- [ ] Context Manager adoption PR is green, with the pin on the merge commit.
- [ ] The inventory e2e walks were run against the scratch repository after the adoption, or the PR
      says which ones were not run and why.
- [x] `npm run check` green here.

## Implementation plan

1. Surfaces PR: add the package, copy the files from the Context Manager commit that lands the prep
   (named in the PR, so a reviewer can diff each file against its source), and add the suite
   fixtures.
2. Context Manager PR (worktree): the adoption above.
3. Phase close: this card done, WAL entry, changelog section.

## Implementation notes

- The surfaces PR copies from Context Manager `373a20ae` (the merge of #1019). Each file differs from
  its source only in import lines, plus `RepoTreeNode` renamed to `TreeNode` in `detection.ts` and
  its test. The prep gave `fields.ts` and `totals.ts` no tests of their own, so the moved tests are
  the six files' 131.
- `sheet-format` is the first workspace a package here depends on besides `common`, so the root
  `typecheck` and `test` now build both first (`build:deps`).
- The package's `tsconfig.json` drops the DOM lib, so the core's DOM-freeness is typechecked.
- A second entry, `./paths`, carries the path rules alone. The adoption's client build showed `.`
  pulling the manifest's zod schemas (built at module scope, so not tree-shaken) and the shared
  zod chunk into the inventory and project pages, which before loaded only the path rules. Context
  Manager's `inventoryPath.utils.ts` re-exports from `./paths`.
- "Add a zone" is not a rewrite of an existing file: a new zone is a new file
  (`roomSeedContent`). The suite covers it as a seeded zone in the configured fixture, which must
  mount, and a rewrite that adds that zone's first item.
- `appendItem` at the end of a file without a final newline adds one, by design in Context Manager.
  `describeAppCore` gained a per-rewrite `addsFinalNewline` gap for it (stage 2 follow-ups).
