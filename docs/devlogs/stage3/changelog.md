# Stage 3: The Generic App Host Changelog

- **Dates:** 2026-11-10 – TBD
- **Stage Tag:** TBD _(filled with `stage3-complete` at stage close)_

> Agent-drafted from evidence (merged PRs, git history, task cards). Appended per phase at phase
> close. Regenerable at any time; see [devlogs](../README.md). Reflections do NOT belong here — they
> go in `reflections.md`.

> The stage's theme is the [generic app host brief](../../tasks/stage3/phase1/briefs/generic_app_host.md):
> Context Manager runs any app through one path (one op route, one page, one check-in endpoint),
> driven by an app module and a per-app registration, so that inventory and tasks are named only in
> their registrations and the few hooks that are truly theirs. Phase 1 holds the spike, the brief
> and the specs; the work runs in phases 2–5.

---

## Phase 1: The spike, the brief and the specs (`stage3-phase1-complete`)

Range: `stage2-complete..stage3-phase1-complete` (`313930f..37fb615`), 2026-11-10: four merges, 54
files, +1,407/−29. Two Context Manager PRs moved and closed backlog cards.

### Shipped

- The stage 3 follow-up log's one entry, closed: sheet's table stylesheet stays mounted across
  renders instead of being re-created and re-parsed on every committed edit. The history test also
  gets a 20 s timeout ([#74](https://github.com/stillpointlab/surfaces/pull/74)).
- Context Manager's backlog reviewed. 28 unassigned seeds that are now a format's or an app's moved
  into this pool, ranked in Context Manager's order
  ([#75](https://github.com/stillpointlab/surfaces/pull/75); context-manager#1118):
  - 16 formats: the md and code editor features and the new and media formats;
  - 12 apps: the task board, the tasks views and the inventory view.

  Three cards that were already done were removed there with a dated note (context-manager#1120).
  The pool's seeds dropped their `column:` key, which pooled cards ignore with a warning.

- The [generic app host spike](../../tasks/stage3/phase1/spikes/generic-app-host.md), read against
  Context Manager `98608e57`:
  - about 9,100 lines in Context Manager are wholly an app's;
  - enable and reconcile are already generic;
  - both services run the same five steps for every op;
  - inventory's check-in is "a deliberately thin parallel" of tasks'.

  The [brief](../../tasks/stage3/phase1/briefs/generic_app_host.md) records Jamie's answers
  ([#76](https://github.com/stillpointlab/surfaces/pull/76)).

- Six specs ([#77](https://github.com/stillpointlab/surfaces/pull/77)), moved at this close to the
  phases that implement them:
  - phase 2: [app-module](../../tasks/stage3/phase2/specs/app-module.md) and
    [one-op-route](../../tasks/stage3/phase2/specs/one-op-route.md);
  - phase 3: [one-view-page](../../tasks/stage3/phase3/specs/one-view-page.md);
  - phase 4: [create-from-the-app](../../tasks/stage3/phase4/specs/create-from-the-app.md) and
    [checkin-endpoint](../../tasks/stage3/phase4/specs/checkin-endpoint.md);
  - phase 5: [app-host-adr](../../tasks/stage3/phase5/specs/app-host-adr.md).

### Decisions

- Jamie, on the brief:
  - **A per-app registration** in Context Manager is the minimum that names an app.
  - **Page URLs stay** for now.
  - **Each app switches in one PR,** inventory first.
  - **Create moves into the app:** its form and the core's `seed`, inside one host dialog.
  - **The two named flags stay,** looked up through the registration.
  - **Check-in gets one endpoint and job type** over the two existing services (option C). The
    shared core (option A) is the [check-in shared core](../../tasks/unassigned/seeds/checkin-shared-core.md)
    seed.
- **Context Manager's `apps-as-executors` spike stays there.** Moving it here would publish product
  strategy from a private repository (Jamie agreed).
- **The specs answer the brief's open questions:**
  - the reply mapping lives in the module;
  - `load` and `facts` are per app, over one shared helper;
  - the page loads each app's bundle through a client registry of dynamic imports;
  - the record is a new ADR, with ADR-0025 and ADR-0038 amended.
- **Codes go out as the core answers them,** with two small visible changes named in the specs.
  App-specific (host) ops keep their endpoints this stage.

### Testing & review

- Tests stay at 1,897. #74 changed render code and one timeout, and two full checks in a row passed
  with no timeouts. The sheet editor was checked in Chromium: one stylesheet through edit, undo and
  raw.
- The pool was projected through the tasks core after the move: 39 cards, no warnings.
- Stage 2's session transcript, through the `stage2-complete` tag, was backed up to Context Manager
  with its 95 output files linked.

---

## Phase 2: The app module, and inventory through one op route (`stage3-phase2-complete`)

Range: `stage3-phase1-complete..stage3-phase2-complete` (`37fb615..20771ae`), 2026-11-11: two
merges here (the phase 1 close and the app module), 46 files, +1,051/−374. Context Manager's two
PRs carry the rest: context-manager#1128 (+99/−60) and context-manager#1134 (+1,947/−1,599).

### Shipped

- [app-module](../../tasks/stage3/phase2/specs/app-module.md)
  ([#79](https://github.com/stillpointlab/surfaces/pull/79)), in three commits:
  - **Results everywhere:** the lifecycle's validation, both manifest parsers and the inventory zone
    writer answer `Result`, with every manifest error kept in `details`.
  - **DOM-free op maps:** the elements' op lists moved to `elementOps.ts` in each app, and
    inventory's item ops use the core's own input types.
  - **The module:** `AppModule` in `common-format/app` (`coreOps`, `hostOps`, `toCoreOp`, `reply`,
    `refusalClass`), with `inventoryModule` and `tasksModule`. One in-memory host
    (`tooling/harness/memory-host.ts`) answers either app through its module, so the harness has
    no per-app answering code left.
- Context Manager adopted the module (context-manager#1128): one `refusalStatus` maps a refusal's
  class to 404, 409 or 400, replacing both apps' status tables.
- [one-op-route](../../tasks/stage3/phase3/specs/one-op-route.md), step 1 (context-manager#1134):
  - the app registry, which the repo-view lifecycle now reads its adapters from;
  - a shared instance file loader;
  - the generic host and `POST …/views/:instance/ops`;
  - one seed helper for both apps.

  Inventory's four op endpoints and the service's op methods are gone; its page sends every core op
  to the route unchanged. Step 2 (tasks) and the spec moved to phase 3.

### Decisions

- **Codes go out as the core answers them.** For inventory that changed four answers:
  - an item op on a missing zone is 404 `INVENTORY_ZONE_NOT_FOUND` with the core's message;
  - every op on a gone manifest is 404 `INVENTORY_MANIFEST_NOT_FOUND`;
  - a link that yields no good is 409 `APP_FILE_NOT_LINKED`;
  - add zone answers 200 with the space only (the page never read the slug).
- **The host checks every change is inside the instance before it links anything.** A test caught
  the host linking first.
- **Two departures from the spec, open until Jamie's review of the whole stage** (Jamie: "fine for
  now"):
  - the op's fields are still bounded in Context Manager, by the app's `opSchema`, because the core
    trusts typed input;
  - the registration is a constant (module, flag, adapter) plus a per-app `AppHostEntry` of hooks
    bound where the services are built.

### Testing & review

- Tests here: 1,897 → 1,929. Both harnesses were driven headlessly in Chromium, light and dark:
  inventory 52 checks, tasks 40.
- Context Manager: 4,441 tests after the adoption, 4,456 after step 1. The op cases the inventory
  service's tests covered now run through the host and the registry.
- **Walks, run after each Context Manager PR merged its pin:**
  - #1128: inventory 38/38. Tasks passed everywhere except walk 29, which failed once and passed on
    a rerun. Its refresh synced a second after the walk's push, and GitHub still served the old head.
  - #1134: inventory 38/38. Tasks passed everywhere except walk 06, which failed once and passed when
    the suite resumed from it. The walk waits a fixed 3 s after Refresh, and the sync finished
    half a second later.

  Both failures were timing in the walks, not the changes. Each walk could poll instead of waiting a
  fixed time.

- This phase's transcript waits for the stage close, with the rest of stage 3's.
