---
column: done
pr: 'stillpointlab/context-manager#1157'
completed: 2026-11-12
created: 2026-11-10T14:53:28-07:00
tags: [apps, host-contract, code]
---

# Spec: one view page

_The [generic app host brief](../../phase1/briefs/generic_app_host.md), desired outcome 4. After
[one-op-route](one-op-route.md), whose registration it extends. Inventory, then tasks._

**Both steps are done:** inventory (context-manager#1153) and tasks (context-manager#1157). Every app
page is served by one handler, one template (`app-view.ejs`) and one page script, at today's URLs.
The steps departed from this spec in five places, all open until Jamie's review of the whole stage
(Jamie: "fine for now"):

- **`load()` returns the app's whole client half** (`mount`, `hostOps`, `requests`), not just the
  element bundle. The tree and preview import the registry for labels and icons; with `mount` and
  the host ops on the entry, the app's code would be in their bundles.
- **`mount` returns `{ learn?, opView? }`, not the elements.** The page answers ops and requests on
  its root, from before the app mounts. `learn(reply, op)` lets the app take what it needs from a
  core op's answer; `opView(op)` names the view a core op's reply needs (tasks' `reorder-pool`).
- **Pages resolve, not just name a view.** A page's `resolve` gets the checked params and query, the
  instance's base URL and manifest path, and `project(view)`. It answers `{ view, extras? }` or
  `{ redirect, permanent? }`. Tasks' pages read the nav first: to choose the landing board or
  redirect to it, to place a phase that is not in the nav, and to embed the strip's state beside the
  board as `extras`. Inventory's pages are one line each.
- **The generic read also replaces tasks' `GET …/nav`,** not only `GET board` and
  `GET stage-state`. The core's nav view is exactly that endpoint's answer.
- **Tasks wires `'reload-request'` by name.** `RELOAD_REQUEST_EVENT` is not exported from
  `@stillpointlab/tasks-app/element` (a [follow-up](../../../../devlogs/stage3/followups.md)).

## High-level goal

One server route handler and one page script serve every registered app's pages, at the URLs each
registration names. Those are today's URLs. The page loads the app's element bundle on demand,
mounts it with the projection the server embedded, and answers its host ops and requests through
the app's client registration. The two app page templates, their page scripts and their per-page
build entries go.

## Related context

- The [spike](../../phase1/spikes/generic-app-host.md), §7.
- Context Manager's pages:
  - routes in `routers/web/project.routes.ts`: tasks' board, stage and phase; inventory's space and
    zone, plus its two exports;
  - templates `task-board.ejs` (101 lines) and `inventory.ejs` (65);
  - scripts `client/pages/task-board/` (1,388 lines) and `client/pages/inventory/` (533);
  - Vite entries `task-board` and `inventory` in `vite.config.ts`.
- The per-view label and icon maps in `repo-tree.ts` and `doc-preview.ts`.

## Technical requirement

### Server: pages from the registration

Each registration gains `pages`: its routes, each with the path it keeps today and the view it
projects, for example `{ path: '/inventory/:instance/room/:slug', view: ({ slug }) => ({ type:
'zone', path: … }) }`. One handler registers them all. For each request it:

- checks the flag;
- resolves the instance;
- projects through the host, with facts and overlay;
- renders `app-view.ejs` with the embedded state, the title the registration builds, and the view.

A missing manifest renders the empty state, as both pages do today.

A generic read, `GET …/views/:instance/project?view=…`, answers a projection for any view. It
replaces tasks' `GET board` and `GET stage-state`, which `close-candidates` and `refresh-stage`
call today.

Inventory's two exports (ZIP and CSV) stay inventory routes, registered through the entry's extra
routes. They are part of the minimum.

### Client: one page script and the client registration

`client/apps/registry.ts` holds one client entry per app. This answers the brief's third open
question: the page loads an app's bundle through a static map of dynamic imports, which Vite splits
into one chunk per app.

```ts
interface ClientAppEntry {
  load(): Promise<unknown>; // import('@stillpointlab/<app>-app/element')
  label: string;
  icon: string; // the tree's and the preview's maps move here
  /** Lay the elements out in the page's root and give each its state and links. */
  mount(root: HTMLElement, state: unknown, context: PageContext): MountedApp;
  /** The host ops the elements ask for, beyond the core ops the generic answerer sends. */
  hostOps: Record<string, (op, context) => Promise<Result<object>>>;
  /** The elements' requests: check-in, refresh, navigation, notifications. */
  requests: Record<string, (detail, context) => void>;
}
```

`client/pages/app-view/app-view.ts` is the one page script. It:

- reads the embedded state and the view;
- `load`s and `mount`s the app;
- answers core ops through the route from [one-op-route](one-op-route.md);
- answers host ops through the entry's handlers;
- wires the entry's requests.

The task board's layout (pool sidebar and grid, the nav strip above) and the refresh button move
into tasks' `mount`. Inventory's links (zone pages, exports, the editor) move into inventory's.

### What goes

- the `task-board` and `inventory` templates and Vite entries;
- the page scripts, except the code that moves into the two client entries;
- the label and icon maps in `repo-tree.ts` and `doc-preview.ts`, which read the client registry
  instead.

## Clarifications

- **URLs do not change.** The registration holds today's paths so they can change later, once Jamie
  has seen it all (the brief's decision).
- **One bundle per app, loaded on demand.** The app-view entry itself carries no app code. Check
  each app page's size in the PR against today's per-page bundle.
- **Server-rendered first paint stays:** the state is embedded as today, and the element renders on
  mount.
- **The refresh button and check-in stay host requests.** Their endpoints are tasks' refresh and
  [checkin-endpoint](../../phase4/specs/checkin-endpoint.md).

## Non-goals

- New URLs or redirects.
- Moving the exports into a generic shape.
- Changing what any page shows.

## Acceptance / completion checklist

- [x] One route handler and one template serve every app page at its current URL. The generic read
      replaces tasks' two reads.
- [x] One page script mounts any registered app. The two page scripts and Vite entries are gone.
- [x] The tree and preview take labels and icons from the client registry.
- [x] Bundle sizes for each app page are recorded before and after.
- [x] Both walk suites pass after each app switches, with no selector changes.

## Implementation plan

1. Context Manager PR: the handler, template, page script and client registry, with inventory
   switched, walked (done: context-manager#1153).
2. Context Manager PR: tasks switched, walked (done: context-manager#1157).
