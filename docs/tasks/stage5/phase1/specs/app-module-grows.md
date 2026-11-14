---
column: todo
created: 2026-11-13T18:44:00-07:00
tags: [apps, common, host-contract, code]
---

# Spec: the module carries its bounds, pages and copy

_The [local host brief](../../../stage4/phase1/briefs/local_host.md), outcome 3. Stage 5, phase 2,
first wave. Two steps, each one PR here: the contract with inventory, then tasks._

> Written with stage 4's specs, before any of stage 4 was built. Stage 5 opens by reading it
> again against what stage 4 made.

## High-level goal

An `AppModule` says everything a host needs that is the app's own: how to check an op, a view and
a create input; which URLs it has and what each shows; its label, icon and create copy. A host
reads them from the module and keeps no per-app file for any of it.

## Related context

- The [local host spike](../../../stage4/phase1/spikes/local-host.md), finding 4 ("Easy"), and
  finding 1's table.
- What Context Manager holds today, to move from:
  - `services/inventory/opSchema.ts` (133 lines) and `services/tasks/opSchema.ts` (248): the op,
    view and create schemas. Their check-in schemas name Context Manager's ids and stay there.
  - `services/inventory/pages.ts` (36) and `services/tasks/pages.ts` (165), over
    `services/apps/pages.ts` (`AppPage`, 55).
  - `client/apps/registry.ts` (`CLIENT_APPS`): label, icon, create noun, default folder, folder
    copy, root consent. `services/apps/registry.ts`: the create noun and `place`.
- `AppModule` in `packages/common/src/app.ts`; the module suite in
  `packages/common/src/testing/app.ts`.

## Work package

- **Owns:** the additions to `packages/common/src/app.ts` and to the app suite; a `bounds.ts`,
  `pages.ts` and `meta.ts` in each of `packages/apps/{inventory,tasks}/src/`.
- **Does not change:** Context Manager. Its copies stay until
  [context-manager-adopts-apps](context-manager-adopts-apps.md); the PR adds one line to the stage's
  follow-up log naming the duplication.
- **Step 2 can run beside** step 1 of [app-shells](app-shells.md), once step 1 here has merged.
  [host-runner](host-runner.md) waits for both steps, since its tests run both apps.

## Technical requirement

### The contract

Added to `@stillpointlab/common-format/app`. `common` stays free of zod: the module gives
functions, and each app builds them from its own schemas.

```ts
/** What a host shows for the app before any instance is open. */
export interface AppMeta {
  label: string; // 'Inventory'
  icon: string; // an <spl-icon> name
  create?: {
    noun: string; // 'an inventory'
    defaultFolder: string;
    folderExample?: string;
    folderHelp?: string;
    /** Asked before creating at the root of a folder. */
    rootConsent?: { warning: string; confirm: string };
  };
}

/** Untyped input in, the typed thing or a refusal (with the causes in `details`) out. */
export interface AppBounds<V extends AppViewMap, E extends AppOpMap, CreateInput> {
  op(input: unknown): Result<{ op: AppOp<E> }>;
  view(input: unknown): Result<{ view: AppView<V> }>;
  create(input: unknown): Result<{ input: CreateInput }>;
}

export interface AppPageInput {
  params: Record<string, string>;
  query: Record<string, string>;
  /** Where the app's pages hang, for a redirect. */
  base: string;
  manifestPath: string;
  project(view: { type: string } & Record<string, unknown>): Promise<object | null>;
}

export type AppPageResolution =
  | { view: ({ type: string } & Record<string, unknown>) | null; extras?: Record<string, unknown> }
  | { redirect: string; permanent?: boolean }
  | { notFound: true };

export interface AppPage {
  /** The path under the app's base: `''`, `/room/:roomSlug`. */
  path: string;
  resolve(input: AppPageInput): Promise<AppPageResolution>;
  title(state: object | null): string;
  /** Whether a missing subject renders an empty page instead of not found. */
  emptyWhenMissing: boolean;
}

/** The page a sub-path names, with its parameters, or `null`. */
export function matchAppPage(
  pages: readonly AppPage[],
  subPath: string
): { page: AppPage; params: Record<string, string> } | null;
```

`AppModule` gains four members:

- `meta: AppMeta`;
- `bounds: AppBounds<V, E, …>`;
- `pages: readonly AppPage[]`;
- `placeCreate(plan, paths)`: whether a seeded plan's files fit, which Context Manager's
  registry holds today as `create.place`.

### What changes on the way

- **A page checks its own parameters.** Context Manager's `AppPage` carries zod schemas for
  `params` and `query`; here `resolve` does the check and answers `{ notFound: true }` for a bad
  one.
- **Tasks' pages stop throwing.** The `NotFoundError('Page')` they throw when the nav cannot be
  projected becomes `{ notFound: true }`.
- **Refusal codes.** `bounds` answers `APP_OP_INVALID`, `APP_VIEW_INVALID` and
  `APP_CREATE_INVALID`, with the schema's issues in `details`.
- **Constants the schemas need** that live only in Context Manager move with them. Tasks' schema
  imports `UNASSIGNED_COLUMN_ID`, `UNASSIGNED_DIR`, `TASKS_ID_MAX_LENGTH` and `TASKS_SLUG_PATTERN`
  from Context Manager's shared code; check which the package already has before copying any.
- **The bounds are behaviour-identical.** Every limit, enum and pattern is carried over as it is.

### The suite

`describeAppCore`'s module checks grow, so every app proves the same things:

- `bounds.op` accepts each op its fixtures apply, and refuses an unknown type and an over-long
  field;
- `bounds.view` accepts each view its fixtures project;
- every page's `path` matches through `matchAppPage`, and `resolve` over a fixture answers a view
  the core projects;
- `meta.label` and `meta.icon` are not empty.

### Step 1: the contract, and inventory

The types, `matchAppPage`, the suite's checks, and inventory's three files. Inventory is the
smaller: two pages, four ops.

### Step 2: tasks

Tasks' three files. Its landing page (`''`) keeps its rules: a legacy `?path=` redirect, the
default board, and an empty view with extras when there is none.

## Clarifications

- **Entries.** A client that needs only `meta` must not pull in zod. `meta` is exported from a
  light entry of each package as well as on the module (the packages' `./paths` precedent).
- **Check-in bodies stay in Context Manager.** They name files by its public ids.
  [checkin-review](checkin-review.md) names files by path instead.
- **Lifecycle policy stays a host's** (`notFoundCode`, `maxAdoptionsPerRun`, `skipPendingMoves`):
  it is about Context Manager's adoption, not the app.

## Non-goals

- Changing any op, view or page's behaviour.
- A shared fact shape for file status (the spike's "surgery").
- Context Manager reading any of this.

## Acceptance / completion checklist

- [ ] `AppModule` has `meta`, `bounds`, `pages` and `placeCreate`, and both modules supply them.
- [ ] Each schema's limits match Context Manager's at the commit the PR names, checked by tests
      that carry over that repository's cases for them.
- [ ] `matchAppPage` has tests: an empty path, a parameter, two parameters, no match.
- [ ] Both apps pass the grown suite.
- [ ] `common` still does not depend on zod; the apps' light entries still do not load it.
- [ ] `npm run check` is green, and Context Manager's build against this branch is unchanged.

## Implementation plan

1. PR: the contract, `matchAppPage`, the suite, inventory.
2. PR: tasks.
