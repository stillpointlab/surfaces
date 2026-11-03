---
column: done
completed: 2026-11-03
pr: 35
created: 2026-11-03T12:18:56-07:00
tags: [apps, host-contract, common, major-feature]
---

> A brief captures the _why_ and the desired outcome before any task breakdown exists. Keep it short
> — one page. Specs derived from it live in the sibling `specs/` folder, built from
> `spec.template.md`. The `column:` frontmatter above drives this file's card on the task board.

# Brief: the apps breakout

_Drafted by the claude agent from the phase 1 spike [apps-breakout](../spikes/apps-breakout.md) and
Jamie's answers to its open questions on PR 35. A brief because the work runs to several phases and
two repositories, and names the contract apps are held to._

## Decisions (Jamie, 2026-11-03, on PR 35)

- **One license for the repository.** The app cores, app elements and components move here under
  MIT like everything else; relicensing or a commercial license stays possible later. The host
  services stay in Context Manager, private.
- **Inventory first**, as the smaller and simpler of the two.
- **Move as-is first, contract at the element step.** Cores move with their signatures unchanged;
  the contract is named when the elements move.
- **App docs move with the apps.** `docs/guides/inventory-format.md` and the tasks manifest
  reference become each app's README; Context Manager links to them.
- **Feature flags unchanged.** `TASKS_VIEW` and `INVENTORY_VIEW` stay in Context Manager.
- **A third category: components.** Beside `formats/` and `apps/`, a limited set of shared UI
  components moves from Context Manager into `packages/components/`, so app elements (and formats)
  can render what they need without the host.

The brief's own open questions (below) were answered the same day, all as recommended:

- **Components:** `modal-dialog` and `spl-icon`; `options-menu` only if the board element needs a
  menu of its own once the page-level relay is gone; `spl-toggle` stays in Context Manager.
- **Packaging:** one package per component, `packages/components/<name>`.
- **Shared helpers** go in a DOM-free subpath of `common`.
- **The Context Manager prep spec lives here**, in phase 2, with its PR in Context Manager. Specs
  here are public, so a spec about Context Manager code names what the change needs (paths,
  module shapes, behaviour) and nothing else: no credentials, private URLs, customer data or
  product plans beyond what the private repository's own public surfaces already say.
- **ADR-0035 is amended** for components in phase 4's adoption PR.

## High-level goal

Tasks and inventory live here as apps: a DOM-free core that Context Manager's server and the harness
both run, and an element that takes state and emits ops, with no knowledge of the host's transport.
Context Manager keeps the substrate (drafts, identity, caching, check-in, jobs, routes) and consumes
both apps from the submodule, as it does the formats.

## Background

The platform architecture puts apps and editors in one box, human surfaces, as stateless clients of
one host contract, and calls the apps breakout the strategic critical path (ADR-0035 created this
repository for it). Context Manager's August spike `apps-as-executors` designed that contract
(`AppModule`, `FolderSnapshot`, `FileChange[]`); none of it was built. The spike here found the code
splits cleanly (about 2,000 pure lines in tasks, 1,700 in inventory), five ties to cut first, and a
task board that fetches for itself again.

## Desired outcome

Each phase below ends with Context Manager on a new pin and nothing changed for its users.

1. **Context Manager prep** (CM PR). `draftState` and `gitMetadata` move to `services/git/`;
   `formatYamlScalar` and `isValidInventoryFolder` leave the apps' folders; `boardDetection` takes
   app-only paths instead of goods with metadata; pure modules return typed failures instead of
   throwing host errors. A CM test asserts that every module bound for surfaces imports only `yaml`,
   `zod`, shared types, its siblings and surfaces packages.
2. **Inventory core.** `packages/apps/inventory` (`@stillpointlab/inventory-app`): the pure modules,
   the validation and totals carved out of `inventory.service.ts`, the shared types and path utils,
   their tests, and the inventory format guide as its README. Context Manager imports from it and
   re-exports the types. A `common/testing` suite holds an app core to ADR-0028: parse, project,
   rewrite and re-parse round-trip byte for byte, and unrecognised files in scope are reported (dropped on PR 36: Jamie expects to relax that rule).
3. **Tasks core.** `packages/apps/tasks` the same way, including the rewrites and the pure seed.
4. **Components.** `packages/components/` with the limited set the app elements render inside
   themselves (below), restyled on `common`'s `--spl-*` tokens with Context Manager's current values
   as the host's settings. Tag names unchanged. Context Manager imports them from the submodule and
   deletes its copies.
5. **The contract and the task board.** The contract named in `common` as types: the August
   `AppModule` shape, with the host's `RepoViewAdapter` as its lifecycle half, paths rather than
   `goodId` in ops. The board's 11 fetches become op events its page answers (in Context Manager
   first), then the element moves with harness fixtures; this repository's own `docs/tasks/` is one.
   A Context Manager ADR records the host side.
6. **The inventory elements.** The page script's overview and zone views become elements that take
   state and emit ops, then move the same way.

The phases are a sketch: each opens with its specs, and may split or merge as they are written.

## Constraints

- **No user-visible change in Context Manager** from any phase, beyond what a spec names. Routes,
  jobs, flags, drafts and check-in behave as before.
- **Cores are DOM-free and host-free.** They run in Node and the browser and import nothing from
  Context Manager; the package boundary is the enforcement.
- **Moved code keeps its behaviour and its tests.** A move changes imports, not logic; a test that
  has to change says why in the PR.
- **Walk the app at every adoption.** Each Context Manager adoption PR runs the affected e2e walks
  (`e2e/walks/`, `e2e/inventory-walks/`) or records why not, closing the gap the stage 1 reflections
  name (no pin move was walked in the app).
- **Page chrome stays with the host:** `user-header`, `notification-banner`, page navigation and the
  page-level options menu. An element raises an event for anything the host owns.
- **Out of scope:** melting `board.service.ts` into snapshot → `apply` → changeset, MCP app
  vocabularies, a standalone folder host beyond the harness, and generalising the scaffold (the
  [one scaffold](../../../unassigned/seeds/one-scaffold-for-formats-and-apps.md) seed is better
  after two apps and the components exist by hand).

## Open questions

1. **Which components.** Recommended: the ones an app element renders inside itself, `modal-dialog`
   and `spl-icon` (33 icons) for certain; `options-menu` (474 lines) only if the board element needs
   its own menu once the page-level relay is gone. `spl-toggle` stays in Context Manager, since
   `common`'s switch replaced its role for surfaces.
2. **Component packaging.** One package per component (`packages/components/<name>`,
   `@stillpointlab/<name>-component`), matching formats and apps, or one `@stillpointlab/components`
   package with an entry per element. Recommended: one per component, so each has its own tests and
   the host imports only what it uses; the placement test in `packages/apps/README.md` grows a
   components line.
3. **Where helpers both apps share go** (`formatYamlScalar`, frontmatter parsing). Recommended: a
   DOM-free subpath of `common` (such as `./yaml`), so neither app imports the other.
4. **Where the Context Manager prep is tracked.** Recommended: its spec lives here in phase 2 with
   the inventory core it unblocks, and the PR lands in Context Manager, as the stage 1 adoption PRs
   did.
5. **Context Manager's ADR for components.** ADR-0035 names formats and apps; a short amendment adds
   components and the `packages/surfaces/packages/components/*` workspace glob. Recommended: amend
   with phase 4's adoption PR.
