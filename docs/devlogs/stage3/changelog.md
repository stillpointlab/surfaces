# Stage 3: The Generic App Host Changelog

- **Dates:** 2026-11-10 – 2026-11-12
- **Stage Tag:** `stage3-complete` _(created on the merge of the stage close PR)_

> Agent-drafted from evidence (merged PRs, git history, task cards). Appended per phase at phase
> close. Regenerable at any time; see [devlogs](../README.md). Reflections do NOT belong here — they
> go in `reflections.md`.

> The stage's theme is the [generic app host brief](../../tasks/stage3/phase1/briefs/generic_app_host.md):
> Context Manager runs any app through one path (one op route, one page, one check-in endpoint),
> driven by an app module and a per-app registration, so that inventory and tasks are named only in
> their registrations and the few hooks that are truly theirs. Phase 1 holds the spike, the brief
> and the specs; the work runs in phases 2–5. A sixth phase drained the stage's follow-ups before
> it closed (Jamie).

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
    [one-op-route](../../tasks/stage3/phase3/specs/one-op-route.md);
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

---

## Phase 3: Tasks through the op route, and one view page (`stage3-phase3-complete`)

Range: `stage3-phase2-complete..stage3-phase3-complete`, 2026-11-11 – 2026-11-12. Here, only docs:
the phase 2 close (#80) and this close. The phase's code is in three Context Manager PRs:
context-manager#1142 (+1,320/−2,348), #1153 (+1,568/−927) and #1157 (+2,577/−2,572).

### Shipped

- [one-op-route](../../tasks/stage3/phase3/specs/one-op-route.md), step 2 (context-manager#1142):
  tasks runs through the registry, the generic host and `POST …/views/:instance/ops`. Its host entry
  has an op-scoped loader, facts, an overlay and a `move` hook. Tasks' 12 op endpoints and the
  service methods behind them are gone. The spec is done.
- [one-view-page](../../tasks/stage3/phase3/specs/one-view-page.md), in two steps:
  - **Inventory** (context-manager#1153): `AppHostService.project` and the entries' `viewSchema` and
    `overlayView`; each registration's `pages`, served by one handler and `app-view.ejs`; one page
    script; and the client registry (`client/apps/`), from which the tree and preview take labels
    and icons.
  - **Tasks** (context-manager#1157): tasks' pages through the same handler, at today's URLs, with
    the landing's redirects and the legacy `?path=` links. The generic read,
    `GET …/views/:instance/project?view=…`, replaces tasks' board, stage-state and nav reads.
    Tasks' client half lays out what its template rendered.

  Both page templates, both page scripts and both per-page Vite entries are gone.

### Decisions

- **Codes and replies are the module's, for tasks too** (#1142):
  - not-found refusals carry the core's code and message;
  - `MANIFEST_UNPATCHABLE` is now `TASKS_MANIFEST_UNPATCHABLE` or `TASKS_ID_IMMUTABLE`;
  - set title and set tags answer `{}`.
- **Tracked cards link on their first change, after the core accepts the op** (#1142), not before
  any op. A first pool reorder whose freshly linked order file isn't visible yet fails closed (409
  `APP_FILE_NOT_LINKED`), as inventory's link always did. A reorder keeps the order file's comments.
- **Failure reporting is one rule for every core op** (#1153, #1157): a failed op is reported to
  client telemetry unless the server refused it (400, 404, 409).
- **First paint:** each app's bar is laid out by its `mount`, so it appears with the element, once
  the app's chunk has loaded.
- **Five departures from one-view-page, open until Jamie's review of the whole stage** (Jamie: "fine
  for now"). They are listed in [the spec](../../tasks/stage3/phase3/specs/one-view-page.md):
  - `load()` returns the whole client half;
  - `mount` returns `{ learn?, opView? }`;
  - pages resolve (projecting other views, redirecting, embedding `extras`) rather than only naming
    a view;
  - the generic read also replaces the nav read;
  - tasks wires `'reload-request'` by name (a [follow-up](followups.md)).

  one-op-route's two step 1 departures stay open as well.

### Testing & review

- Context Manager's tests: 4,456 → 4,506 (#1142) → 4,667 (#1153) → 4,678 (#1157). The tasks
  service's op and view cases run through the host and the registry. The page script is tested with
  a fake app, and tasks' client half through the real page script. Nothing changed here, so this
  repo's tests are still 1,929.
- **Bundle sizes**, per app page, production build:

  |           | Before                    | After                     |
  | --------- | ------------------------- | ------------------------- |
  | Inventory | 56.95 kB JS, 9.32 kB CSS  | 60.37 kB JS, 10.34 kB CSS |
  | Tasks     | 77.67 kB JS, 10.87 kB CSS | 81.66 kB JS, 11.89 kB CSS |

  2.4–2.8 kB of each is the page script and the registry, which both apps' pages load.

- **Walks:** each PR was walked after a full build and `e2e:reset`. Inventory passed 38/38 each
  time. Tasks passed walks 01–27 and 29 each time (28 is skipped by design). Every walk passed on
  the first try, and no walk needed a selector change.
- This phase's transcript is backed up to Context Manager at the close, once context-manager#1157
  merges.

---

## Phase 4: Create from the app, and one check-in (`stage3-phase4-complete`)

Range: `stage3-phase3-complete..stage3-phase4-complete` (`57f0d2e..31d498a`), 2026-11-12: one merge
here ([#82](https://github.com/stillpointlab/surfaces/pull/82)), 29 files, +2,039/−61. Context
Manager's two PRs carry the rest: context-manager#1162 (+1,012/−2,505) and #1163 (+730/−367).

### Shipped

- [create-from-the-app](../../tasks/stage3/phase4/specs/create-from-the-app.md), in two steps:
  - **Here** ([#82](https://github.com/stillpointlab/surfaces/pull/82)):
    - **`./create` in each app:** `checkInventoryCreate` and `checkTasksCreate`, the create dialogs'
      checks with their copy, DOM-free and zod-free. Each core's plan runs them first, so the form
      and the plan cannot drift.
    - **`<spl-inventory-create>` and `<spl-tasks-create>`**, from each element entry: the app's own
      fields, with the dialogs' markup, ids and copy.
    - **Harness:** a "Create" fixture per app, answered through `core.seed` in the folder a
      control picks.
  - **Context Manager** (context-manager#1162):
    - `POST …/views/create` and `AppHostService.create`: the registration's input bounds, the
      core's `seed`, then the host's checks, placement and seeding;
    - one create dialog around the app's form, with the app's ids;
    - the tree's Create items from the client registry.

    Both dialogs, their markup and both create endpoints are gone.
- [checkin-endpoint](../../tasks/stage3/phase4/specs/checkin-endpoint.md) (context-manager#1163):
  - `POST …/views/:instance/checkin`, with each app's own body and its unchanged check-in service
    behind an `AppCheckin`;
  - one job type, `GIT_APP_CHECKIN`, with `app` in its payload;
  - one handler that leaves each app's notifications in its own words;
  - the job's app on its events and the job listing, so pages label check-ins by app and the
    board refreshes only on its own.

  The two routes, job constants and handlers are gone.

### Decisions

- **Six departures from create-from-the-app, open until Jamie's review of the whole stage.** They are
  listed in [the spec](../../tasks/stage3/phase4/specs/create-from-the-app.md):
  - the form is an app element with one op, `create`;
  - the error line is the form's;
  - the validity event is `create-validity`;
  - the Create button stays enabled;
  - the folder field's copy is Context Manager's;
  - the registration's create block holds a `place` hook.
- **One create rule for both apps.** An enabled instance of the same app whose scope overlaps
  refuses with `<APP>_ALREADY_EXISTS` ("This repository already has <noun> at …"), which was
  inventory's rule. A repeated tasks create used to answer the existing instance and is now refused.
  A partial attempt still resumes for both.
- **The plans refuse with the form's codes and messages.** Through the API that changes a few
  codes, such as `INVENTORY_TOTAL_INVALID` and `TASKS_COLUMNS_REQUIRED`. Every one of them was
  already a 400.
- **The flag gates create and check-in.** Both are 404s while an app's flag is off, like its ops.
- **The old check-in job names stay one release** as aliases of the one handler, so a check-in
  queued in production at deploy time still runs. Removing them is a
  [follow-up](followups.md).

### Testing & review

- Tests here: 1,929 → 1,973. Both create fixtures were driven headlessly in Chromium, light and
  dark: 14/14 checks.
- Context Manager's tests: 4,683 after #1162, 4,696 after #1163 merged with it.
- **Bundle sizes** after #1162:

  | Page               | Before   | After    |
  | ------------------ | -------- | -------- |
  | Project page entry | 66.59 kB | 56.89 kB |
  | Inventory page     | 60.74 kB | 74.28 kB |
  | Tasks page         | 81.66 kB | 91.90 kB |

  The create forms ride each app's element chunk, which the dialog loads on demand. Keeping them
  off the app pages is a [follow-up](followups.md).

- **Walks**, after a full build and `e2e:reset`:
  - **#1162:** inventory 38/38; walks 06 and 08 drive the new dialog by the old ids, with no
    selector changes. Tasks walks 01–27 and 29 all passed on the first try. A recorded drive of the
    tasks create dialog passed 15/15: the root warning and its consent, the server's overlap
    refusal and a create that lands on the new board. No walk creates a tasks instance. The drive's
    first run scored 13/15 on two mistakes in the drive itself.
  - **#1163**, merged with main after #1162: inventory 38/38, and tasks walks 01–27 and 29 on the
    first try. That covers every check-in walk through `GIT_APP_CHECKIN`. An earlier run, on the
    branch before #1162 merged, was stopped so the walks would test the merged code.
- This phase's transcript was backed up to Context Manager at the close (`conv_W5v4a2LXWbNn`).

---

## Phase 5: The minimum, written down (`stage3-phase5-complete`)

No merges here: the phase's one spec is a Context Manager record, context-manager#1166. It was
written after phase 4 and refreshed after phase 6, so it records the stage as finished.

### Shipped

- [app-host-adr](../../tasks/stage3/phase5/specs/app-host-adr.md): Context Manager's **ADR-0040,
  "Apps through one host"** (context-manager#1166). It holds:
  - the app module and the three registration entries per app (server registration, host entry,
    client entry);
  - the host's five steps;
  - the six generic routes, the one page, create and check-in;
  - the minimum that still names an app, each item with its reason and what would move it;
  - an "adding an app" checklist, and the count below.

  ADR-0025, ADR-0037 and ADR-0038 point to it. ADR-0037 was not in the spec, but it is the tasks
  twin of ADR-0038.

### Decisions

- **Its own record**, answering the brief's last open question; the three older records point to it.
- **Proposed, not Accepted:** it moves to Accepted when Jamie agrees the minimum it lists, which
  the spec asks for. That agreement is open at the stage close.
- **The departures stay listed for Jamie's review of the whole stage.** The ADR lists every
  departure from the stage's specs in one place, with the two phase 6 resolved.

### The count

The same script read both commits. It counts:

- non-test `.ts` and `.ejs` lines per area;
- `router.<verb>` blocks, by the app their path names;
- shared lines naming an app's id, flag, jobs or services.

|                             | Before (`98608e57`, 2026-11-10) | After (`50b1d44b`, 2026-11-12)     |
| --------------------------- | ------------------------------- | ---------------------------------- |
| Wholly an app's             | 8,413 lines                     | 5,850 lines                        |
| App endpoints               | 35                              | 5 (tasks 3, inventory's 2 exports) |
| App mentions in shared code | 198 lines in 17 files           | 87 lines in 15 files               |
| The generic host            | —                               | 1,776 lines                        |

Most of what is left is the two check-in services (1,302 lines), tasks' board service (1,572) and
the client halves (1,382). The spike's "about 9,100 lines" was tallied by hand from the same areas.

---

## Phase 6: The follow-ups drained (`stage3-phase6-complete`)

Range: `stage3-phase4-complete..stage3-phase6-complete` (`31d498a..80d08af`), 2026-11-12: two
merges here (the phase 4 close and [#84](https://github.com/stillpointlab/surfaces/pull/84)), 22
files, +299/−50. Context Manager carried the rest: context-manager#1167 (merged), and the ADR
refresh on #1166.

### Shipped

- [drain-followups](../../tasks/stage3/phase6/specs/drain-followups.md). Jamie asked to drain the
  stage's follow-ups before it closed, rather than carry them forward:
  1. **Tasks' reload event:** `@stillpointlab/tasks-app/element` exports `RELOAD_REQUEST_EVENT`
     ([#84](https://github.com/stillpointlab/surfaces/pull/84)), and Context Manager imports it.
  2. **The create forms off the app pages:** each app's form moved to a new `./create-element`
     entry ([#84](https://github.com/stillpointlab/surfaces/pull/84)). Context Manager's create
     dialog loads it on demand, so the app chunks are back to 58.00 kB (inventory) and 78.97 kB
     (tasks).
  3. **One enable route:** `POST …/views/enable { app, manifestPath }` replaces the two per-app
     enable routes. The app's own flag gates it.
  4. **The legacy check-in job names removed**, once context-manager#1163 was live in production.
  5. **Walks that poll:**
     - tasks walk 06 waits for the repo sync job instead of a fixed 3 s;
     - walk 29 waits for GitHub's API to serve its pushed head before Refresh.

     These were phase 2's two one-off walk failures.

  Items 3–5 and the pin are context-manager#1167.

- The follow-up log is drained: every entry closed.

### Testing & review

- Tests here: 1,973 → 1,978, from a guard per app that `./element` neither exports nor registers
  the form. The harness's create fixtures were driven again in Chromium: 14/14.
- Context Manager: all 4,707 tests pass after a full build.
- **Walks for #1167:**
  - inventory 38/38;
  - tasks walks 01–26 on the first try;
  - walk 27 was interrupted by a GitHub 502 on its merge. The merge had landed on scratch `main`,
    but GitHub left #702 open.
  - With Jamie's OK: #702 was closed by hand, and the PR a first rerun had opened (#703) was merged
    and the repo refreshed. Walks 27 and 29 then passed.
- This phase's transcript is backed up at the stage close, with the rest of the stage's.

---

## Stage totals

- `313930f..80d08af` (`stage2-complete` to the last merge before the close): 25 commits, 11 of them
  merges on `main`, 120 files, +4,900/−440. Eleven PRs merged here, #74 to #84.
- Tests: 1,897 at stage 2's close to 1,978.
- Context Manager carried the host side in eleven PRs: context-manager#1118 and #1120 (the backlog
  review), #1128, #1134, #1142, #1153, #1157, #1162, #1163, #1167, and #1166 (ADR-0040).
- **Every Context Manager code PR was walked**, both suites, after a full build and `e2e:reset`.
  Every walk failure was the walks' timing or GitHub's, never the change:
  - phase 2's two fixed waits, now polls;
  - phase 6's 502.
- **The app-named code:** 8,413 → 5,850 lines, 35 → 5 endpoints (phase 5).
- No token or cost figures were collected.
