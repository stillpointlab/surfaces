---
column: in-progress
created: 2026-11-08T00:43:23-07:00
tags: [apps, host-contract, code]
---

# Spec: the inventory elements move here

_The [apps breakout brief](../../phase1/briefs/apps_breakout.md), desired outcome 6, last step. It
follows [inventory-elements-in-cm](inventory-elements-in-cm.md): once the elements ask their page for
every op, moving them is packaging, as [task-board-element](../../phase5/specs/task-board-element.md)
was._

## High-level goal

`<spl-inventory-overview>` and `<spl-inventory-zone>` live in `packages/apps/inventory` as
`@stillpointlab/inventory-app/element`. The harness mounts them from fixtures, including an example
inventory parsed by the core, and answers their ops in memory. Context Manager's inventory page
imports them from the submodule, and users see no change.

## Related context

- The elements after [inventory-elements-in-cm](inventory-elements-in-cm.md): no fetches, ops by
  path, links and state through setters, markup through `common-format/html`.
- `packages/apps/README.md` reserves `./element`. The task board's entry is the model:
  `tsconfig.element.json` with the DOM so the core's stays DOM-free, jsdom per test file, and
  `sideEffects` listing the element files.
- The phase 2 and phase 4 lesson: a client imports light entries only. The inventory core's `.`
  builds zod schemas at module scope, which is why `./paths` exists.
- The stylesheet uses Context Manager's SCSS variables, most of which `common`'s `_tokens.scss` already
  has under the same names.

## Technical requirement

1. **The entries.**
   - `@stillpointlab/inventory-app/element` registers both tags through `defineElement` from
     `common-format/elements`. It exports the classes, the op map (`InventoryOps`), `InventoryLinks`
     and the request event details.
   - A new `./types` entry carries the shared types, so the element's imports never touch `.`, even
     for types. Context Manager's client imports types from it too.
   - The element imports `./types`, `./paths` (the field id rules the dialog checks),
     `@stillpointlab/sheet-format/presentation`, `common-format/app`, `common-format/elements` and
     `common-format/html`, plus `@stillpointlab/modal-dialog-component` and
     `@stillpointlab/spl-icon-component` for what it renders.

2. **What moves.**

   | Context Manager                                 | Here                                                 |
   | ----------------------------------------------- | ---------------------------------------------------- |
   | `components/inventory/` (both elements, shared) | `packages/apps/inventory/src/element/`               |
   | their stylesheet                                | `packages/apps/inventory/src/element/inventory.scss` |
   | their tests                                     | beside them, unchanged but imports                   |

   The page script, the EJS shell and the page shell's styles stay in Context Manager.

3. **Styles pass `check-tokens`.**
   - The variables become `@use 'common/src/styles/tokens' as *;`. `$alert-bg` and `$alert-text` have
     no token yet: each becomes one under the name Context Manager already sets
     (`--spl-alert-bg`, `--spl-alert-text`), with its light value as the default, and joins the
     Theming table.
   - The elements keep using the host's `button`, `button-primary`, `button-secondary` and
     `form-input` classes, as they do today. The README lists them as host-styled classes, and the
     harness gives them a plain stand-in style. Context Manager sets nothing new.

4. **Harness fixtures** (`packages/apps/inventory/dev/fixtures.ts`).
   - **Hand-built states**, one per case the page renders: no manifest; an overview with zones, a
     dirty zone, a broken zone and totals, in configured and legacy modes; an invalid manifest; zones
     in configured, legacy and neutral modes; a read-only zone; a zone with a parse error; items with
     invalid, structured and other-data values; a zone that needs attention; an empty zone.
   - **An example inventory** under `dev/example/` (`inventory.yaml` and `rooms/*.yaml`), parsed with
     the core's functions (`parseInventoryManifest`, `parseRoomFile`, `applyRoomTotals`,
     `aggregateItems`) and assembled into states in `dev/`. The assembly is Context Manager's service,
     so it is fixture code here, as the board's projection was. Every file is untracked, with no
     dirty overlay.
   - **A hostile fixture**: the configured zone through `hostile()`.
   - **An in-memory host** in `dev/` answers the four ops on the hand-built states (adding and editing
     items, adding a zone) and logs the requests in the harness's event list. Its `links` return `#`
     anchors, and `editor` returns `undefined` for half the files so both recovery forms show.
   - **Controls:** turn the host off, so every op is unhandled; and fail the next op, including once
     with `INVENTORY_ITEM_NOT_FOUND`.

5. **The README** gains an Element section: the two tags, setters and `links`, the op table with
   replies, the requests, the host-styled classes, and the tokens they read.

6. **The Context Manager adoption** (one PR there, after this merges):
   - Move the pin. The page imports `@stillpointlab/inventory-app/element`, and the client imports
     inventory types from `./types`.
   - Delete `components/inventory/` and its tests.
   - Amend ADR-0038: the elements now live in surfaces.
   - Compare the client build: the inventory page neither gains `common`'s runtime nor the zod chunk,
     and its size is recorded against the previous PR's build.
   - Run the inventory walks.

## Clarifications

- **Fixtures, not a projection in the core.** As for the board: the real states come from Context
  Manager's service, which overlays drafts and check-ins. Moving that assembly into the core is the
  deferred pass's question.
- **Light DOM**, as for the board (Jamie, on the phase 6 plan). It is also what lets the host's button
  and input classes keep styling the elements.

## Non-goals

- The page script, the check-in dialog, the editor link and the create-inventory dialog, which stay
  in Context Manager.
- Any change to the elements' behaviour or markup beyond imports and tokens.
- The core's names ([zone-vocabulary](zone-vocabulary.md)).

## Acceptance / completion checklist

- [ ] `@stillpointlab/inventory-app/element` builds and registers both tags from a bare import in a
      production build, and imports neither the core's root nor `common`'s runtime.
- [ ] `./types` exists, and Context Manager's client imports inventory types from it.
- [ ] The moved tests pass unchanged apart from imports, both elements pass
      `describeAppElementContract`, and the hostile fixture passes `expectNoHostileMarkup`.
- [ ] `check-tokens` passes on `inventory.scss`, and the Theming table lists the two new tokens.
- [ ] The harness mounts every fixture in light and dark, the in-memory host answers ops, and both
      failure controls behave as the page does today.
- [ ] The Context Manager adoption is green: the build check holds, ADR-0038 is amended, and the
      inventory walks were run.
- [ ] `npm run check` green here.

## Implementation plan

1. Surfaces PR: `./types`, the elements, their tests and styles, the tokens, the fixtures, example
   inventory and in-memory host, and the README.
2. Context Manager PR: the adoption above, walked.
