---
column: todo
created: 2026-11-07T14:51:39-07:00
tags: [apps, host-contract, code]
---

# Spec: the app cores return results instead of throwing

_From the seed [result-types-for-app-cores](../seeds/result-types-for-app-cores.md), scheduled for
the contract step. It uses the `Result` type from [app-contract](app-contract.md), and the two land
together in Context Manager._

## High-level goal

No core function throws for input that breaks a rule. Every exported function that throws
`TasksRuleError` or `InventoryRuleError` today returns a `Result` instead. The two error classes are
deleted, and Context Manager maps each result's `code` to the same response it sends now.

## Related context

- Jamie's preferred pattern (2026-11-03, on PR 36): `{ ok: true, … } | { ok: false, code, message }`.
- [cm-app-prep](../../phase2/specs/cm-app-prep.md) introduced the two classes as a stopgap so the
  cores could move as-is.
- Main files here: `packages/apps/tasks/src/{manifestRewrite,errors}.ts`,
  `packages/apps/inventory/src/{fields,csv,errors}.ts`. In Context Manager:
  `src/services/tasks/board.service.ts` (the manifest edits, the pointer and the tag registry),
  `src/services/inventory/inventory.service.ts` (`fieldRule`), `src/routers/web/project.routes.ts`
  (the CSV and ZIP exports).

## Technical requirement

1. **The functions.** Every exported function from which a rule error can escape, directly or
   through a helper. Today that is:

   | Core      | Functions                                                                                                                                                                                                                       |
   | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | tasks     | the `manifestRewrite.ts` patches that find an entry or key (`patchManifestEntryKey`, `removeManifestListEntry`, `patchManifestTopLevelScalar`, `appendManifestTag`, and any other the implementation finds reaching `findItem`) |
   | inventory | `validateLegacyDeclaredField`, `validateConfiguredField`, `rejectConfiguredLegacyInput`, `validateExtraKey` (`fields.ts`); `serializeRoom`, `serializeSpace` (`csv.ts`, through `assertExportable`)                             |

   Each returns `Result<{ … }>` with its former return value as a named field (`{ content }` for a
   rewrite, `{ field }` for a validator that returned one). A validator that returned nothing returns
   `Result`.

2. **Codes and messages are kept.** Every `code` and `message` a function threw becomes the same
   `code` and `message` in its failure. The tasks core's zod `details` travel in `Failure.details`.

3. **Composed rewrites.** Where a caller chains several rewrites, as the manifest settings edit does,
   the chain stops at the first failure and returns it.

4. **The classes go.** `TasksRuleError`, `InventoryRuleError` and both `errors.ts` files are deleted,
   along with their exports.

5. **The Context Manager adoption**, in the same PR as the [app-contract](app-contract.md) adoption:
   - Each catch site becomes a check on `ok` that raises the error it raised before: the same class,
     status, code and message. That covers `fieldRule` (a 400 `ApiError`), the manifest settings edit
     (409 `MANIFEST_UNPATCHABLE`), the tag registry (`ValidationError` with details), and the export
     routes (409 `ApiError`).
   - Route tests that assert those responses pass unchanged.

## Clarifications

- **The existing results stay as they are.** `parseInventoryManifest` (`errors`), the room writer
  (`reason`, `notFound`) and the lifecycles' `validateAndScope` already return results in shapes of
  their own. Converging them is a separate change with its own callers. This spec records it in the
  WAL.
- **Moved tests change where they asserted a throw.** Such a test now asserts the failure's `code`
  and `message`. The PR says how many changed.

## Non-goals

- Any change to a code, message, status or the conditions that fail.
- Converting functions that already return results.
- Context Manager's own error classes.

## Acceptance / completion checklist

- [ ] No core source file contains `throw new` for a rule, and neither error class exists.
- [ ] Each converted function's failures keep their former codes and messages, and tests cover them.
- [ ] Context Manager's route tests for the affected endpoints pass unchanged.
- [ ] `npm run check` green here.

## Implementation plan

1. Surfaces PR, after [app-contract](app-contract.md) or stacked on it: both cores converted, with
   their tests.
2. Context Manager: the call sites, in the [app-contract](app-contract.md) adoption PR.
