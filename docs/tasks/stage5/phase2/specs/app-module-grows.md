---
column: done
pr: 113
completed: 2026-11-20
created: 2026-11-13T18:44:00-07:00
tags: [apps, common, host-contract, code]
---

# Spec: the module carries its bounds, pages and copy

_The [local host brief](../../../stage4/phase1/briefs/local_host.md), outcome 3. Stage 5, phase 2,
first wave. Two steps, each one PR here: the contract with inventory, then tasks._

> Written with stage 4's specs, before any of stage 4 was built, and read again on 2026-11-14
> against what stage 4 made. The [review](../../phase1/reviews/specs-against-stage-4.md) lists what changed
> and why (M4, L2). "What stage 4 built" is what an implementer reads first.

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

## What stage 4 built

_Added 2026-11-14._

- **Nothing here moved.** `packages/common/src/app.ts` and both app packages are as they were
  when this was written, and the line counts above still hold at Context Manager's `main`
  (`74ecae8c`).
- **The local host's base is a fragment:** `#/app/<manifestPath>`. The query a page reads sits
  inside the fragment, after the sub-path.
- **The explorer draws `meta.icon` in an `<spl-icon>`** on the app's row. The icon set has
  `task` and `inventory`.
- **The local host's page allows no `eval`.** zod probes `Function('')`, and the page's content
  security policy reports it; stage 4's follow-up log has the same for xmdl. It does no harm.
  The local host runs the bounds in its server, so the light entry rule below is also what
  keeps the probe out of its page.
- **Stage 5's follow-up log** is `docs/devlogs/stage5/followups.md`.

## Work package

- **Owns:** the additions to `packages/common/src/app.ts` and to the app suite; a `bounds.ts`,
  `pages.ts`, `meta.ts` and `changes.ts` in each of `packages/apps/{inventory,tasks}/src/`; the
  alias in `packages/common/src/host/index.ts`.
- **Does not change:** Context Manager. Its copies stay until
  [context-manager-adopts-apps](../../phase6/specs/context-manager-adopts-apps.md); the PR adds one line to the stage's
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

/** One file that differs from the last check-in, as a host that knows only files reports it. */
export interface AppFileChange {
  path: string;
  status: 'changed' | 'new' | 'moved' | 'deleted';
  /** For a moved file, the path it had. */
  from?: string;
}

/** What a module tells its core from file changes alone. */
export interface AppKnown<Facts, S extends AppSnapshot> {
  facts: Facts;
  /** The snapshot's host parts: plain data the core reads beyond the files (tasks' pending moves). */
  snapshot?: Partial<S>;
}
```

`AppModule` gains five members:

- `meta: AppMeta`;
- `bounds: AppBounds<V, E, …>`;
- `pages: readonly AppPage[]`;
- `placeCreate(plan, paths)`: whether a seeded plan's files fit, which Context Manager's
  registry holds today as `create.place`;
- `fromChanges(changes: readonly AppFileChange[], snapshot: S): AppKnown<Facts, S>`: the facts,
  and the snapshot's host parts, for a host that knows nothing but which files changed.

**`fromChanges` is to an app what `apply` is to a format's descriptor** (Jamie, 2026-11-14, on
decision 3 of the review: "something like the format object?"). The module is the object a host
registers, and this member is the one place the app says how file changes read in its own terms:
data in, data out, and the host does not look inside. The harness's memory host and the local
host both call it, over what their port reports. A host that knows more (Context Manager, with
its drafts, pull requests and divergence) builds its facts itself and does not call it.

- **Inventory:** `enabled: true`, and `dirty` as the changed and new files that are the
  manifest or a zone.
- **Tasks:** a changed card is `changed`; a new one is in the snapshot's `created`; a moved one
  has `movedFrom` and an entry in the snapshot's `moves`. The order file and the housekeeping
  files follow the same statuses. Everything about pull requests and divergence is absent,
  which the board already accepts.

`HostChange` in `common-format/host` has this shape already and becomes an alias of
`AppFileChange`, so there is one. No core changes: this is not the shared fact shape the spike
called "surgery", which stays a non-goal.

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
- **A page joins its redirect as text:** `base`, then a sub-path, then a query if it has one. It
  never builds a `URL` from `base`, which in the local host is a fragment.

### The suite

`describeAppCore`'s module checks grow, so every app proves the same things:

- `bounds.op` accepts each op its fixtures apply, and refuses an unknown type and an over-long
  field;
- `bounds.view` accepts each view its fixtures project;
- every page's `path` matches through `matchAppPage`, and `resolve` over a fixture answers a view
  the core projects;
- a page that redirects answers its `base` followed by a sub-path, for a base that is a path
  (`/apps/x`) and for one that is a fragment (`#/app/docs/tasks/tasks.yaml`);
- `meta.label` and `meta.icon` are not empty;
- `fromChanges` over no changes, and over each fixture's changes, answers facts the core
  projects with, and a moved card's state says where it moved from.

### Step 1: the contract, and inventory

The types, `matchAppPage`, the suite's checks, and inventory's three files and its
`fromChanges`. Inventory is the smaller: two pages, four ops.

### Step 2: tasks

Tasks' three files and its `fromChanges`. Its landing page (`''`) keeps its rules: a legacy `?path=` redirect, the
default board, and an empty view with extras when there is none.

## As built: step 1

_2026-11-14, by an Opus 5.5 sub-agent; reviewed and checked by the orchestrating agent. Where the
work departed from the text above, this is what step 2 and the later specs read._

- **The five members are optional on `AppModule` in this step,** since tasks supplies them in
  step 2. A module without them gets a to-do in the suite, which tasks shows today. Step 2 makes
  them required.
- **`AppModule` has a seventh type parameter, `CreateInput`,** which defaults to `Seed`. The
  create bound answers the form's fields; the host adds the folder before `seed`. Inventory
  passes `InventoryCreateFields`.
- **`matchAppPage`,** where the text above is silent:
  - the sub-path carries no query;
  - `''` and `/` are the empty path, and one trailing slash is ignored;
  - any other sub-path starts with `/`;
  - a parameter is one non-empty segment, decoded, and a segment that does not decode matches
    nothing;
  - the first page that matches wins.
- **A page's `params` and `query` are strings,** decoded and not yet checked. A zone slug the
  rule refuses is not found, where Context Manager answered 400. The check is plain code, so
  `pages.ts` loads no zod.
- **`bounds.op` covers the core's ops.** A host op (`link-editor`) is refused, as Context
  Manager's schema refused it; a host bounds its own.
- **A refusal reads "The op is not valid: title: …",** with the schema's issues in `details`.
  Context Manager's message was "Validation failed".
- **`FileStatus` in `common-format/host` is `AppFileChange['status']`,** beside the `HostChange`
  alias, so the status has one shape too.
- **`meta` has its own entry, `@stillpointlab/inventory-app/meta`,** which a test and the built
  file show loads no zod and none of the core.
- **`meta.create.folderHelp` is plain text.** Inventory's has no markup. Tasks' has, in Context
  Manager (`tasks.yaml` as code), and step 2 writes it plain.
- **Inventory's `fromChanges` counts changed and new files.** A moved zone is not dirty. It is
  in the follow-up log.
- **Inventory has no page that redirects,** so the redirect check, over a path base and a
  fragment base, runs on the suite's own sample module until tasks' landing page does.
- **The suite checks more than the list above:** a page's title is not empty, `bounds.view`
  refuses an unknown view, and a broken module fails (eleven tests of that).
- **The bounds' cases carried from Context Manager** (at `8fa439ba`) are the six in its app host
  and route tests. It has no test beside the schema file. The rest are one test a limit, at its
  edge and past it.
- **Not checked in this step:** Context Manager's build against the branch. It is checked once,
  after step 2.

## As built: step 2

_2026-11-14, by an Opus 5.5 sub-agent; reviewed and checked by the orchestrating agent. Read at
Context Manager's `8fa439ba`._

- **The five members are required on `AppModule`,** and the suite's to-do path is gone.
- **`bounded(key, schema, input, code, what)` is in `common-format/app`:** a schema's
  `safeParse` answered as a `Result`, typed against the shape of `safeParse` with no import of
  zod. Both apps' bounds use it.
- **Tasks' `bounds.op` covers the core's twelve ops.** Its host ops are refused, as are
  `create-card` with `now` (the host adds the time through `toCoreOp`) and `move-file`'s
  `coMoving`, all as Context Manager's schema refused them. The four constants the schemas
  need were in the package already.
- **A page's stage and phase are read with `parseInt`,** as Context Manager read them, so
  `/stage/3x` is stage 3. Kept so that nothing changes; it is in the follow-up log.
- **Not found where Context Manager answered 400 or threw:** a `?path=` over 1,024 characters,
  a parameter that is not a positive number, and any page whose nav cannot be projected.
- **A stage the nav does not have still answers its view;** the host gives not found, since
  `emptyWhenMissing` is false. The suite cannot say that yet.
- **`meta.create.noun` is "a task project",** and `folderHelp` is plain text.
- **Tasks' `fromChanges`, exactly:**
  - a card is a path in a board's or the pool's kind folders; a broken manifest has none;
  - a changed, new or moved card is `changed`; `created` lists the new ones;
  - a moved card has `movedFrom` and `moves[path] = [from]`: the anchor alone, since one change
    cannot carry the paths a card passed through;
  - the `order` fact is there when the order file is among the snapshot's paths, and `changed`
    when the file is changed, new or moved;
  - housekeeping is the manifest when it is changed, new or moved, and every new `.gitkeep`
    among the changes;
  - a deleted file adds nothing;
  - the answer always carries `snapshot: { moves, created }`, empty or not.
- **Facts the statuses cannot give are left out:** `dirty` and `versionColumn` (whether a card's
  column moved needs the last check-in's content), `diverged`, `title`, `tracked`, and anything
  about pull requests. The harness's own facts still have `dirty`; the follow-up log has it for
  [host-runner](host-runner.md).
- **The bounds' cases carried from Context Manager** are all 31 of its test file for the op
  schema. It has none for the view or create schemas, which have one test a limit.
- **The suite has a fourth tasks fixture, `flat`:** a board outside the stage and phase folders,
  for the landing page's `?path=` link.

## Clarifications

- **Entries.** A client that needs only `meta` must not pull in zod. `meta` is exported from a
  light entry of each package as well as on the module (the packages' `./paths` precedent).
- **Check-in bodies stay in Context Manager.** They name files by its public ids.
  [checkin-review](../../phase4/specs/checkin-review.md) names files by path instead.
- **Lifecycle policy stays a host's** (`notFoundCode`, `maxAdoptionsPerRun`, `skipPendingMoves`):
  it is about Context Manager's adoption, not the app.

## Non-goals

- Changing any op, view or page's behaviour.
- A shared fact shape for file status (the spike's "surgery").
- Context Manager reading any of this.

## Acceptance / completion checklist

- [x] `AppModule` has `meta`, `bounds`, `pages`, `placeCreate` and `fromChanges`, and both
      modules supply them.
- [x] Each schema's limits match Context Manager's at the commit the PR names, checked by tests
      that carry over that repository's cases for them.
- [x] `matchAppPage` has tests: an empty path, a parameter, two parameters, no match.
- [x] Both apps pass the grown suite, the redirect check with a fragment base included.
- [x] `common` still does not depend on zod; the apps' light entries still do not load it.
- [x] `npm run check` is green, and Context Manager's build against this branch is unchanged.

## Implementation plan

1. PR: the contract, `matchAppPage`, the suite, inventory.
2. PR: tasks.
