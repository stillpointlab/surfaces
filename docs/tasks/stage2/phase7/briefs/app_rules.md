---
column: done
completed: 2026-11-08
pr: 58
created: 2026-11-08T14:21:10-07:00
tags: [apps, host-contract, common, major-feature]
---

> A brief captures the _why_ and the desired outcome before any task breakdown exists. Keep it short
> — one page. Specs derived from it live in the sibling `specs/` folder, built from
> `spec.template.md`. The `column:` frontmatter above drives this file's card on the task board.

# Brief: the apps' rules, and the UI that can follow them

_Drafted by the claude agent from a sweep of what Context Manager still holds after phase 6 (Jamie,
2026-11-08: "put the moveable items including rules into phase 7 as a brief"). A brief because the
work names the rest of the app contract and runs across two repositories._

## Decisions (Jamie, 2026-11-08, on PR 58)

- **Inventory first**, then the contract's other half, then tasks.
- **A core receives plain data:** paths and contents with drafts already laid over, plus the few
  host facts a rule reads.
- **Draft rebase splits:** the frontmatter comparison (`metadataDelta`) moves to the tasks core;
  deciding when to rebase stays with Context Manager.
- **One phase.** Everything here is phase 7, landed as several PRs.
- **The create-tasks and create-inventory dialogs stay** in Context Manager for now.
- **The direction:** inventory and tasks should run in a harness in surfaces, as the foundation for
  stand-alone versions of both apps. That may in time mean re-implementing or moving the GitHub
  work. This phase does not do that, but nothing in it should assume Context Manager is the only
  host.

## High-level goal

What each app does with its files lives in its core: given the files, the state to render; given an
op, the file changes or a refusal. Context Manager's services keep only the host's work around it.
The app UI that waited on those rules then moves into the elements, and the harness runs both apps
on their cores alone: the first step towards stand-alone apps.

## Background

Phases 1–6 moved the cores, the elements, the components and the contract's lifecycle and element
halves. The [apps breakout brief](../../phase1/briefs/apps_breakout.md) put "melting
`board.service.ts` into snapshot → `apply` → changeset" out of scope, and the
[app contract](../../phase5/specs/app-contract.md) left `project` and `apply` unnamed until "the
deferred pass that extracts the services' rules". This is that pass.

The sweep found four kinds of code in Context Manager:

- **Host work, staying for now:** check-in and refresh (jobs, GitHub, PR state), the generic view lifecycle,
  seeding app-only goods, routes and schemas, flags, walks and ADRs.
- **Glue, staying:** `boardOps.ts` and `inventoryOps.ts` answering ops, and the lifecycle adapters'
  host policy.
- **App rules inside the services:** `board.service.ts` (about 3,000 lines, 20 public methods)
  and `inventory.service.ts` (about 1,200 lines, 8). Each operation mixes the rule with I/O: closing
  a phase picks its target and validates the selection between loading cards and linking goods;
  adding an item checks fields and assigns a space-wide id between loading the space and saving
  the draft. Some helpers are already pure but private (`applyManifestEdit`, `metadataDelta`,
  `kindFileHolders`). The harness shows the cost: `dev/example.ts` re-implements how a space and
  its zones are assembled, because that lives in `loadSpace` and `resolveZone`.
- **Page UI that waited on those rules:** the task board page's settings, new-card, title, tags and
  close-phase dialogs, and its stage/phase tab strip (rendered on the server from
  `tasks-nav.shared.ts`).

## Desired outcome

Each step ends with Context Manager on a new pin, its walks run, and nothing changed for its users.

1. **Inventory's rules in its core.** The overview and zone states projected from files, and add
   zone, add item, update item and delete item as pure functions from files and an op to file
   changes or a refusal. The service loads files (drafts first), calls the core, and saves what it
   returns. The harness projects its example with the core instead of its own copy.
2. **The contract's other half.** `project` and `apply`, with the snapshot and change types they
   take, named in `common-format/app` against inventory's real functions. `describeAppCore` gains
   the round trip: project, apply, re-parse.
3. **Tasks' rules in its core**, the same way: board, stage and nav projection, card moves and
   reorders, title and tags, new cards, manifest edits, the pointer, and closing a phase or stage.
4. **The board's dialogs in the element.** Settings, new card, title, tags and the close-phase
   selection render inside `<spl-task-board>` and raise ops. Check-in and refresh stay with the page.
5. **The tab strip**, as an element or part of the board, rendered from the core's nav projection.
6. **Both apps run in the harness on their cores.** The in-memory hosts answer ops with the core's
   `apply` over the fixture folder and re-project, instead of hand-written op handling (the August
   spike's "slim harness proof"). Edits live in memory; there are no drafts, check-in or GitHub.

## Constraints

- **No user-visible change in Context Manager**, beyond what a spec names. The API, routes, jobs,
  flags, drafts and check-in behave as before, and every adoption runs the affected walks.
- **Cores stay DOM-free and host-free.** They see paths and file contents, never goods, users,
  drafts or GitHub. Linking, draft bases, dirty state and editor links are the host's, laid over
  the core's state.
- **Nothing assumes Context Manager is the host.** The snapshot, the changes and the host facts are
  plain data a second host could supply: the harness now, a stand-alone host later. Host facts
  that are Context Manager's own (goods, editor links) stay out of the cores' types.
- **Moved rules keep their behaviour and their tests.** A service test that becomes a core test
  says so in its PR; the service keeps tests for what it still does.
- **Out of scope:** a stand-alone host beyond the harness, the GitHub work (check-in, refresh, PR
  state), persistence in the harness, MCP app vocabularies, the `rooms/` folder rename, and the
  wording of messages users see.

## Open questions

All five of the draft's questions are answered above. Specs may raise their own.
