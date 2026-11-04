---
column: done
pr: 41
completed: 2026-11-04
created: 2026-11-04T01:02:42-07:00
tags: [apps, host-contract, code]
---

# Spec: the tasks core moves here

_The [apps breakout brief](../../phase1/briefs/apps_breakout.md), desired outcome 3. It follows the
inventory core ([inventory-core](../../phase2/specs/inventory-core.md)) step for step, and needs no
Context Manager prep: [cm-app-prep](../../phase2/specs/cm-app-prep.md) already cut the tasks ties._

## High-level goal

`packages/apps/tasks` (`@stillpointlab/tasks-app`) holds the tasks app's DOM-free core, moved as-is
from Context Manager with its tests, and a README that is the tasks file-format reference. Context
Manager's server and client import the core from the submodule, and users see no change.

## Related context

- Context Manager decisions:
  - ADR-0014 (the tasks view);
  - ADR-0020 (the backlog pool and repo-held state);
  - ADR-0021 (folder names are convention);
  - ADR-0027 (the kind registry);
  - ADR-0028 (mounts);
  - ADR-0035 (apps live in `packages/apps/`).
- Precedent: [inventory-core](../../phase2/specs/inventory-core.md), including its two lessons:
  - a client imports a light entry, never `.`, because the manifest's zod schemas are built at
    module scope and do not tree-shake;
  - the adoption is walked in a dedicated Context Manager checkout with its own agent slot.
- Main files: Context Manager's `src/services/tasks/`, `src/shared/interfaces/tasks.types.ts`,
  `src/shared/utils/tasksPath.utils.ts` and `src/shared/utils/frontmatterBlock.ts`, at `30428c3c`
  (the inventory adoption's merge).

## Technical requirement

1. **`@stillpointlab/common-format/frontmatter`.** Context Manager's `frontmatterBlock.ts` and md's
   `src/markdown/frontmatter.ts` hold the same `FRONTMATTER_BLOCK_PATTERN` and
   `splitFrontmatterBlock`, byte for byte, and md's comment says the two must not drift. They
   become one DOM-free entry in `common`.
   - md's `frontmatter.ts` re-exports them from there, so md's exports and its tests do not change.
   - xmdl keeps its own `splitFrontmatterBlock`. It has a different contract: it returns `null`
     when there is no block.
2. **What moves.** Each file keeps its name and contents, apart from imports.

   | Context Manager                                                                   | Here (`packages/apps/tasks/src/`)  |
   | --------------------------------------------------------------------------------- | ---------------------------------- |
   | `services/tasks/{manifest,boardDetection,cardProjection,frontmatter,nav,pool}.ts` | the same names                     |
   | `services/tasks/{linkRewrite,manifestRewrite,manifestSeed,errors}.ts`             | the same names                     |
   | `shared/interfaces/tasks.types.ts`                                                | `types.ts` (+ `TreeNode`)          |
   | `shared/utils/tasksPath.utils.ts`                                                 | `paths.ts`                         |
   | the tests of all of the above (nine files, 192 tests)                             | beside them, unchanged but imports |
   - `frontmatter.ts` takes `FRONTMATTER_BLOCK_PATTERN` from `common-format/frontmatter`.
   - `RepoTreeNode` becomes a structural `TreeNode`, as in inventory. The two apps each define one,
     because one app never imports the other; the contract step (phase 5) can name a shared folder
     type in `common`.
   - Imports through the `shared/interfaces` barrel become imports from `./types.js`.

3. **The package.**
   - Three entries:
     - `.`, the core;
     - `./types`, `types.ts` alone: the tasks types plus their values (`BUILTIN_TASK_KINDS`,
       `taskKindById`, `UNASSIGNED_DIR`, `UNASSIGNED_COLUMN_ID`, `POOL_ORDER_FILE`);
     - `./paths`, `paths.ts` alone.

     Both light entries import nothing.

   - `package.json`: MIT, `type: module`, built with `formatPackage`.
   - Dependencies: `yaml ^2.9.0`, `zod ^4.6.7`, `@stillpointlab/common-format`.
   - `tsconfig.json` drops the DOM lib; `vitest.config.ts` uses `appTest()`.

4. **The README is the tasks format reference.** Context Manager has no format guide for tasks: its
   rules live in four ADRs and `manifest.ts`'s schema. The README is written from them, for someone
   editing a tasks folder by hand:
   - `tasks.yaml`: columns, `defaultColumn` / `doneColumn`, kinds with their paths and badges, the
     tag registry, and `current`;
   - the `stage<N>/phase<M>/<kind>/` layout, the pool (`unassigned/`, `order.yaml`), and card
     frontmatter (`column`, `tags`, a kind's own projection key);
   - what is convention and what is configuration (ADR-0021, ADR-0027).

   It opens with what the package exports, as inventory's does.

5. **`describeAppCore`** runs over three fixtures:
   - a minimal manifest with one board;
   - a configured manifest with kinds, tags, `current`, a pool and comments, plus a `README.md` and
     a helper file beside cards. Agents leave these, and the folder still mounts.
   - a fixture shaped like this repository's own `docs/tasks/`.

   `mount` wraps `parseTasksManifest`, `detectBoards` and `detectPool`, the way Context Manager's
   tasks `lifecycle.ts` derives the scope.

   The rewrites:
   - moving a card and setting its tags (`rewriteFrontmatter`);
   - moving `current` (`rewriteManifestCurrent`);
   - adding, relabelling and removing a column (`appendManifestListEntry`,
     `patchManifestEntryKey`, `removeManifestListEntry`);
   - adding a tag (`appendManifestTag`);
   - relinking a moved card's body (`rewriteRelativeLinks`).

   Any rewrite the suite fails is recorded as a gap, not fixed, as `appendItem`'s final newline was.

6. **The Context Manager adoption** (one PR there, after this merges), in the
   `context-manager-surfaces` checkout:
   - Move the pin. Delete the moved files and their tests, and `shared/utils/frontmatterBlock.ts`.
   - Import from `@stillpointlab/tasks-app` in `board.service`, `checkin.service`, `lifecycle`,
     `seedFiles`, both projects routers and the tests that import the moved modules.
   - Turn `tasks.types.ts` into named re-exports of `./types`, and `tasksPath.utils.ts` into named
     re-exports of `./paths`. Then the barrel, the client's task board and `boardSettings` keep
     their imports, and no client page gains the zod chunk. The PR checks this in the build
     output, against the inventory adoption's build.
   - Retire `appBoundary.test.ts`: with both cores in surfaces its list is empty, and the package
     boundary holds the line.
   - ADR-0014, ADR-0020, ADR-0021 and ADR-0027 link to the package README.
   - Run the tasks walks (`e2e/walks/`) and the inventory walks against the scratch repository. The
     database reset needs Jamie: Prisma refuses `migrate reset` from an agent.
   - Add a WAL entry.

## Clarifications

- **Unrecognised files.** `collectUnprojectedFileWarnings` (ADR-0028 decision 4) moves unchanged,
  and the suite does not check it. Relaxing it is Context Manager's ADR change (stage 2 WAL).
- **The pool's order file is regenerated, not rewritten.** `formatOrderFile` writes `order.yaml`
  whole from a path list and its own header comment, so a comment added by hand is lost when the
  app reorders the pool. That breaks ADR-0028 decision 1 for that one file.
  - The move keeps the behaviour. The suite leaves it out, since it is not a text-to-text rewrite.
  - The WAL records it, for a rewrite that keeps comments after the adoption.
- **`tasks-nav.shared.ts` stays** in Context Manager. It is element code, for phase 5.
- **No history comes with the code**, as for inventory. The PR names the Context Manager source
  commit.

## Non-goals

- The task board element, the contract, or any harness fixture (phase 5).
- Changing a function's signature or behaviour, including the order file and the unprojected-file
  warnings.
- Components (phase 4).

## Acceptance / completion checklist

- [x] `common-format/frontmatter` exported. md re-exports it, and md's tests pass unchanged.
- [x] `packages/apps/tasks` builds, typechecks without the DOM lib, and passes its 192 moved tests
      under Node.
- [x] `./types` and `./paths` import nothing.
- [x] `describeAppCore` passes over the tasks fixtures, with any gaps recorded.
- [x] The README is the tasks format reference.
- [x] Context Manager adoption PR is green, with the pin on the merge commit, and no client page
      gains the zod chunk.
- [x] The tasks and inventory walks were run after the adoption, or the PR says which were not and
      why.
- [x] `npm run check` green here.

## Implementation plan

1. Surfaces PR: the frontmatter entry, then the package copied from Context Manager `30428c3c`, the
   README, and the suite fixtures.
2. Context Manager PR, from `context-manager-surfaces`: the adoption above, walked.
3. Phase close: this card done, WAL entries, changelog section.

## Implementation notes

- Copied from Context Manager `30428c3c`. Each file differs from its source only in its import
  lines and `RepoTreeNode` renamed to `TreeNode`. The 192 moved tests pass unchanged.
- `describeAppCore` runs 12 rewrites over the three fixtures (51 checks), and none needs a gap. The
  `remove a column` rewrite removes `in-progress`, not `done`, because the configured fixture's
  `doneColumn` names `done`, and removing a referenced column is an invalid manifest, not a rewrite
  failure.
- Where an ADR and the code differ, the README follows the code. ADR-0021 says a kind's folder has
  no override, but ADR-0027 later added `dir`.
- The Context Manager adoption is #1025 (merged 2026-11-04), pinned on `d81d7c3`. Two importers the
  spec did not list moved too: `projectExportImport.service.ts` and `scripts/check-doc-links.ts`.
  The inventory walks passed (38/38), and the tasks walks passed 01-29 apart from 28 (an alternative
  drift setup), with their levers replayed from the scratch repository's history.
