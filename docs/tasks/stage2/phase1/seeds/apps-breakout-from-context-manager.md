---
column: done
created: 2026-11-01T15:32:34-07:00
tags: [apps, host-contract, major-feature]
---

# Apps breakout from Context Manager

Tasks and inventory move out of Context Manager's `src/` into `packages/apps/` behind the
source-agnostic contract the platform architecture names as the strategic critical path. The
contract extracted for them is the same one MCP binds to. Sheet is the stress test for holding the
contract at good granularity; if it can live with propose-whole-good plus its own cell-level diff,
the contract is right.

_Moved from the backlog on 2026-11-03 to open stage 2: this breakout is the stage. Grown into the
[apps breakout spike](../spikes/apps-breakout.md) the same day._

## Where the apps live today

In Context Manager (`main`): the tasks app is `src/services/tasks/` (manifest, pool, lifecycle,
refresh, PR state, link and manifest rewrites), `src/client/pages/task-board/` and
`src/client/components/task-board/`; inventory is `src/services/inventory/` and
`src/client/pages/inventory/`, walked end to end by `e2e/inventory-walks/`. Shared shapes sit in
`src/shared/interfaces/{tasks,inventory}.types.ts` and `src/shared/utils/{tasks,inventory}Path.utils.ts`.
The decisions they rest on: ADR-0027 (the tasks manifest kind registry), ADR-0028 (manifest mounts,
full takeover), ADR-0035 (the surfaces monorepo), and `docs/product/platform-architecture.md`.

## What the spike should answer

- The app contract: what an app needs from the host (`get` / `list` / `put` as a proposal, plus
  whatever the boards and the inventory need beyond one good: mounts, scope, refresh, PR state), and
  how close it is to what MCP already binds to.
- The cut line: which code moves (client pages, components, the pure manifest and pool logic) and
  which stays host-side (GitHub, persistence, jobs), with the seams that need cutting first.
- How Context Manager mounts an app from the submodule, the way it defines a format's elements.
- Whether [one scaffold for formats and apps](../../../unassigned/seeds/one-scaffold-for-formats-and-apps.md)
  comes first, alongside, or after.
- Testing: what the apps' tests become here, and what stays in Context Manager's walks.
- An order: tasks first or inventory first, and the phases that follow.
