---
column: todo
created: 2026-11-10T14:46:34-07:00
tags: [apps, host-contract, common, major-feature]
---

> A brief captures the _why_ and the desired outcome before any task breakdown exists. Keep it short
> — one page. Specs derived from it live in the sibling `specs/` folder, built from
> `spec.template.md`. The `column:` frontmatter above drives this file's card on the task board.

# Brief: Context Manager hosts apps through one interface

_Drafted by the claude agent from the [generic app host spike](../spikes/generic-app-host.md) and
Jamie's answers to its open questions. Phase 1 holds the spike, this brief and its specs; the work
starts in phase 2._

## Decisions (Jamie, 2026-11-10, on PR 76)

- **A per-app registration in Context Manager** is the minimum that names each app. A short entry
  per app names its module, its feature flag, its page and API paths, its create surface and its
  host hooks. Everything else runs off the entry.
- **Page URLs stay as they are for now.** The registration names them, so they can change once the
  rest is in place.
- **Migration:** whatever reads most clearly in review. Each app switches in one PR, and its
  per-op endpoints retire in that same PR. Nothing ships to production until the stage's work is
  done.
- **Create:** an app will always need some per-app detail when it is created. The app supplies
  that surface, and Context Manager stops keeping custom create UI for each app.
- **Flags:** the two named flags stay, `TASKS_VIEW` and `INVENTORY_VIEW`. Each registration names
  its own, and the generic route and page check that one.
- **Check-in:** one endpoint and one job type, keyed by app, which hand off to the two existing
  check-in services unchanged. Extracting their shared core waits; the
  [check-in shared core](../../../unassigned/seeds/checkin-shared-core.md) seed holds it.
- **Inventory first**, then tasks.

## High-level goal

Context Manager runs any app through one path: one op route, one page and one check-in endpoint,
driven by an app module and a per-app registration. Inventory and tasks are named only in their
registrations and in the few hooks that are truly theirs.

## Background

Stage 2 moved the apps' rules into their cores and their UI into elements. The harness now hosts
both apps on their cores alone. Context Manager still hosts them app by app: about 9,100 lines are
wholly an app's (the spike's §1). That covers:

- 29 API endpoints and 7 pages;
- a service per app, whose op paths run the same five steps;
- two check-ins, one of which calls itself "a deliberately thin parallel" of the other;
- a create dialog per app;
- per-app flags, jobs and label maps.

Enable and reconcile are already generic (`RepoViewAdapter`). This stage does the same for the rest.

## Desired outcome

Each step ends with Context Manager on a new pin, both walk suites run, and nothing changed for its
users beyond what a spec names.

1. **The app module (surfaces).** `common-format/app` names an `AppModule`, the object a host
   registers. It holds:
   - the app's id and manifest file;
   - its core and lifecycle;
   - its element entry;
   - the host ops its elements ask for, beyond the core's;
   - the mapping from an op's result to the element's reply;
   - a status class for each refusal code.

   Both apps export one, and the harness hosts run on them. `results-everywhere` lands here, so any
   core's refusals map the same way, and so does `inventory-element-op-types`.

2. **The registration (Context Manager).** One entry per app names its module, flag, paths, create
   surface and host hooks: a facts provider, and for tasks the `move` bookkeeping and refresh. The
   lifecycle's `RepoViewName` union becomes the registry's keys.
3. **One op route.** A generic host loads an app instance's snapshot, lets the core decide, links on
   first change, writes drafts, and answers through the module's reply mapping, for any registered
   app. Elements' ops reach it by path, with no id mapping in the page. Inventory moves first, then
   tasks, and each app's per-op endpoints retire as it moves.
4. **One page.** A generic view page mounts the registered element from the embedded projection, at
   the URLs the registration names. Check-in, refresh and navigation stay as requests the page
   answers.
5. **Create from the app.** Each app's element package ships its create form, and the core's `seed`
   writes the files. Context Manager hosts one create dialog around the form, and keeps only the
   host's checks: a synced tree, overlapping views, a resumed create.
6. **One check-in endpoint and job,** keyed by app, handing off to the existing check-in services
   unchanged.
7. **The minimum, written down.** A Context Manager ADR records what stays app-named and why: the
   registrations and their hooks, tasks' refresh and PR states, the two check-in services until the
   seed above lands, and the flags.

## Constraints

- **No user-visible change in Context Manager** beyond what a spec names: the same URLs, flags,
  drafts, check-in and walks. Every Context Manager PR runs both walk suites.
- **Cores stay DOM-free and host-free,** and nothing assumes Context Manager is the only host. The
  harness hosts are the first users of the app module.
- **Each app switches in one PR,** inventory before tasks.
- **Out of scope:**
  - extracting the shared check-in core (the seed);
  - MCP app vocabularies and review-gate policy, though the module must not rule them out;
  - the `rooms/` folder rename;
  - a stand-alone host beyond the harness.

## Open questions

Each is for the spec that meets it:

- **Where the reply mapping lives:** in the app module, so the harness and Context Manager share it,
  or in each host.
- **The facts provider's shape:** one generic provider over drafts and goods, mapped onto each
  app's fact type, or one provider per app.
- **How the generic page loads an app's element bundle,** given Context Manager's per-page build
  entries.
- **Whether the ADR in outcome 7 amends** ADR-0025 (view instances) and ADR-0038 (the inventory
  elements), or is its own.
