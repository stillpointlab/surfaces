---
column: in-progress
created: 2026-11-10T14:53:28-07:00
tags: [apps, host-contract, code]
---

# Spec: the registration and one op route

_The [generic app host brief](../../phase1/briefs/generic_app_host.md), desired outcomes 2 and 3. After
[app-module](../../phase2/specs/app-module.md). Two steps, each one Context Manager PR: inventory, then tasks._

**Step 1 is done** (context-manager#1134, stage 3 phase 2): inventory runs through the registry, the
host and the route. Step 2, tasks, is this phase's. Step 1 departed from this spec in two places,
both open until Jamie's review of the whole stage:

- **The op's fields are bounded in Context Manager.** Each app's host entry may carry an `opSchema`;
  inventory's keeps the retired endpoints' bounds, because the core trusts typed input.
- **The registration is two pieces.** A constant (module, flag, adapter) that the lifecycle reads,
  and an `AppHostEntry` (`opSchema`, `load`, `facts`, `overlay`, `move`) bound where the services
  are built.

## High-level goal

Context Manager keeps one registration entry per app. A generic host answers every core op of any
registered app through one route: it loads the instance, lets the core decide, links on first
change, writes drafts, and replies through the module. The pages send core ops there as the
elements ask them, by path. Each app's per-op endpoints retire in the PR that switches it.

## Related context

- The [spike](../../phase1/spikes/generic-app-host.md), §3: the five steps both services already run, and
  what tasks adds (moves, write bases, rebase).
- Context Manager's `RepoViewAdapter` and its `RepoViewName` union
  (`services/git/repoViewLifecycle.types.ts`); the services' op paths (`changeZone` and `write` in
  `inventory.service.ts`; `runManifestOp`, `cardOpBase`, `writeCardChange` and `recordMove` in
  `board.service.ts`); and the pages' op answers (`inventoryOps.ts`, `boardOps.ts`, `tasksNav.ts`).
- The endpoints that retire:
  - **Inventory (4):** add zone, add item, update item, delete item.
  - **Tasks (12):** `board/move`, `board/move-file`, `board/title`, `board/tags`, `tags`,
    `pool/order`, `links/fix`, `manifest/edit`, `briefs`, `lifecycle/create`, `pointer`,
    `lifecycle/close`.

## Technical requirement

### The registration

`services/apps/registry.ts` holds one entry per app, keyed by the module's id:

```ts
interface AppRegistration<M extends AppModule> {
  module: M;
  flag: FlagName; // TASKS_VIEW, INVENTORY_VIEW
  adapter: RepoViewAdapter; // today's, unchanged
  /** The instance's snapshot, its write bases (path → good and version) and the goods by path. */
  load(ctx: HostContext, view?: AppView): Promise<LoadedInstance<M>>;
  /** The host facts the module's core reads, for the loaded instance. */
  facts(ctx: HostContext, loaded: LoadedInstance<M>): Promise<FactsOf<M>>;
  /** Context Manager's ids laid over a reply, for the page's links. */
  overlay?(reply: object, loaded: LoadedInstance<M>): object;
  /** A `move` change written: the draft and the move's bookkeeping. Absent: moves are refused. */
  move?(ctx: HostContext, loaded: LoadedInstance<M>, change: MoveChange): Promise<void>;
}
```

- **`RepoViewName` becomes the registry's keys.** The lifecycle reads its adapters from the
  registry.
- **`load` and `facts` are per app.** This answers the brief's second open question. Inventory's
  `load` reads every file in scope, draft-first, as `loadSpace` does today. Tasks' keeps its own
  sources (projections, tracked blobs, linked write bases), because a board must not read hundreds
  of tracked cards in full. A generic default loader is used when an entry gives none, so a third
  app with small folders needs no code.
- **Facts are drafts-and-goods state almost everywhere.** One shared helper derives
  changed/dirty/linked from goods and drafts, and each entry maps it onto its core's fact type.
  Tasks adds PR state from its cache.

### The generic host

`services/apps/appHost.ts` exposes `runOp(user, instance, view, op)`:

1. **Look up the registration** by the instance's view type, and check its flag.
2. **`load`, then `core.apply`.** On a refusal, answer the core's code and message with the status
   for `module.refusalClass(code, op.type)`: 404, 409 or 400.
3. **Link on first change:** link every changed path that is tracked but not linked yet
   (`ensureLinkedGood`), reload, and apply again. If the reload is refused or links nothing, fail
   closed, as both services do today.
4. **Write each change:**
   - `write` becomes a draft with `explicitBase`, from the loaded write base;
   - `create` becomes an app-only good (one generic seed helper, replacing `seedInventoryFile` and
     `seedTasksManifestFile`);
   - `move` goes to the entry's `move` hook, or is refused when the entry has none.
5. **Reply:** reload, project with the entry's facts, `module.reply`, then `overlay`.

### The route

`POST /api/v1/projects/:project/repos/:connection/views/:instance/ops` takes
`{ view?, op }`, the element's op as asked, with its view where the reply needs one. The schema
checks the shape (`type` is one of the module's core ops) and leaves the fields to the core.

### The pages

`inventoryOps.ts`, `boardOps.ts` and `tasksNav.ts` send every core op to the route unchanged. Their
path → id maps go wherever they only served op endpoints. Host ops keep their current endpoints in
this spec:

- **Tasks' board:** `resolve` and `scan-references`, plus `read-file` (the repo's file endpoint) and
  `refresh-stage` (`stage-state`).
- **Tasks' nav:** `close-candidates` (the board read).
- **Inventory:** `link-editor` (the repo's import).

### Step 1: inventory

The registry, the host, the route and the generic seed helper, with inventory switched to them. The
four inventory op endpoints and the service's op methods go: `addZone`, `addItem`, `updateItem`,
`deleteItem`, `changeZone` and `write`. The service keeps its state reads and export.

### Step 2: tasks

Tasks' entry takes its `load` from `getBoardContext` and `opSnapshot`, its `facts` from the
projection inputs, and its `move` from `recordMove`. Its 12 op endpoints and the service methods
behind them go. `runManifestOp`'s link-then-rerun becomes step 3 above. What stays in
`board.service.ts`:

- the state reads, `resolve` and the reference scan;
- the loading behind `load`;
- auto-rebase.

## Clarifications

- **Codes go out as the core answers them** ([app-module](../../phase2/specs/app-module.md)). Two things change:
  - tasks' `MANIFEST_UNPATCHABLE` becomes `TASKS_MANIFEST_UNPATCHABLE` or `TASKS_ID_IMMUTABLE`;
  - not-found refusals carry the core's message.

  Neither the client nor the walks match on either; walk 11 only mentions a 404 in a comment. Both
  are listed as behaviour changes in step 2's PR.

- **Today's behaviour changes in the services stay as they are.** Refusals decided before any link,
  linking only on a real change, and the tracked-card count for removing a column all carry over;
  the host makes them generic.
- **Optimistic UI is unchanged.** The elements render optimistically and settle on the reply, which
  has the same shape as before.
- **The route takes no good ids.** Paths come from the element, and the host checks they are in the
  instance's scope before writing.

## Non-goals

- Host ops through the generic route: they keep their endpoints. Moving them is
  [the minimum ADR](../../phase5/specs/app-host-adr.md)'s question.
- The pages themselves: [one-view-page](one-view-page.md).
- Create and check-in: [create-from-the-app](../../phase4/specs/create-from-the-app.md) and
  [checkin-endpoint](../../phase4/specs/checkin-endpoint.md).

## Acceptance / completion checklist

- [ ] The registry holds both apps, the lifecycle reads its adapters from it, and `RepoViewName`
      is its keys.
- [ ] One route and one host answer every core op of both apps. The 16 op endpoints are gone, along
      with the service methods only they called.
- [ ] Refusal statuses match today's for every code, except the two named changes.
- [ ] The service tests that covered op paths now cover the host, through the registry, with the
      same cases. A host test checks link-on-first-change, fail-closed, `create`, a refused `move`
      and the scope check.
- [ ] Both walk suites pass after each step.

## Implementation plan

1. Context Manager PR: the registry, host, route and seed helper, inventory switched, walked
   (done: context-manager#1134).
2. Context Manager PR: tasks switched, walked.
