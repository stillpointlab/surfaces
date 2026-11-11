---
column: done
pr: 79
completed: 2026-11-11
created: 2026-11-10T14:53:28-07:00
tags: [apps, host-contract, common, code]
---

# Spec: the app module

_The [generic app host brief](../../phase1/briefs/generic_app_host.md), desired outcome 1. The first spec:
[one-op-route](../../phase3/specs/one-op-route.md) and every spec after it register these modules._

## High-level goal

`common-format/app` names an `AppModule`: everything a host needs to run one app without knowing
which app it is. Inventory and tasks each export one. The harness answers both apps' elements
through one generic in-memory host that takes a module, which proves the module is enough before
Context Manager relies on it. The cores' older result shapes become `Result`, and inventory's
element ops are typed with the core's inputs.

## Related context

- The [spike](../../phase1/spikes/generic-app-host.md), §§2–5: what is already generic, the five steps both
  services share, host facts, and host ops and replies.
- The contract today (`packages/common/src/app.ts`): `AppLifecycle`, `AppCore`, `AppSnapshot`,
  `FileChange`, and the element half (`requestOp`, `answerOps`).
- The harness hosts: `packages/apps/inventory/dev/host.ts` (126 lines) and
  `packages/apps/tasks/dev/host.ts` (232). Both apply the core, write the changes into memory, and
  build each reply by hand. The tasks one also answers the host ops.
- Pool seeds this lands: `results-everywhere` and `inventory-element-op-types`.

## Technical requirement

### `AppModule` (`common-format/app`)

```ts
interface AppModule<V, O, Facts, Seed, S extends AppSnapshot, E extends AppOpMap> {
  id: string;                              // 'inventory', 'tasks'
  lifecycle: AppLifecycle<…>;              // manifestName is the module's manifest
  core: AppCore<V, O, Facts, Seed, S>;
  /** The element ops that are the core's, by element op type. */
  coreOps: readonly (keyof E & keyof O & string)[];
  /** The element ops a host answers itself (tasks: resolve, read-file, …; inventory: link-editor). */
  hostOps: readonly (keyof E & string)[];
  /**
   * The element's reply to a core op, from the projection after the op is written:
   * a card, the pool, a zone state. `view` is the one the page shows.
   */
  reply<K>(op, applied, context: { project(view): state | null; view }): Result<E[K]['reply']>;
  /** How a host should treat a refusal of an op: 'not-found' | 'conflict' | 'invalid'. */
  refusalClass(code: string, op: string): RefusalClass;
}
```

- **The module is DOM-free.** It imports the core's root entry, never the element. A host finds the
  element through its own registration, since only a browser loads it.
- **The reply mapping lives in the module,** which answers the brief's first open question. The
  harness and Context Manager both need the same mapping from (op, result) to the element's reply.
  It belongs with the app, not with each host.
- **`refusalClass` replaces the status tables.** A host maps the three classes to its own responses.
  Context Manager maps them to 404, 409 and 400, and that mapping is generic. Any code the module
  does not classify is `invalid`. The class for each code comes from today's
  `INVENTORY_REFUSAL_STATUS` and `TASKS_REFUSAL_STATUS` tables (400, 404 and 409 only), unchanged.
  The op is passed too, because tasks classifies by op in two places. Today `edit-manifest`'s
  rewriter refusals go out as 409 under the renamed code `MANIFEST_UNPATCHABLE`, and `add-tag`'s
  go out as validation errors.
- **Host ops are named, not implemented.** A host must answer each one; the module says which they
  are, so a host can refuse an op it does not know. The tasks harness's host ops move unchanged.
- **Views for replies:** a reply may need the view the element is showing (tasks' `reorder-pool`
  answers the pool of the board or stage on screen). The op request carries it.

### One in-memory host (`common-format/testing` or `tooling/harness`)

`createMemoryHost(module, { files, facts, hostOps })` answers an element's ops for any module:

1. Snapshot the files.
2. `apply` the op.
3. Write the changes into memory.
4. Reply through `module.reply`.

The host-op handlers are passed in. The tasks harness's facts (`factsOf`) and move bookkeeping
(`write`) become the options the tasks fixtures pass. Both harness hosts are rewritten on it, and
their per-app reply switches go.

### Results everywhere (the seed)

- **`AppLifecycle.validateAndScope`** answers `Result<{ scope, warnings }>`. A failure keeps every
  error in `details` and the first one as `message`, with code `<APP>_MANIFEST_INVALID`. Context
  Manager's three call sites (`repoViewLifecycle.service.ts`) read `details`.
- **The manifest parses** (`parseInventoryManifest` and the tasks manifest parse) answer the same
  shape. Inventory's `declaredVersion` stays a field on both success and failure.
- **The zone writer's results** (`AppendResult`, the replace and remove results with `reason` and
  `notFound`) become `Result` with codes. The ops that call them already answer `Result`, so only
  their internals change.

### Typed inventory ops (the seed)

`InventoryItemInput` and `InventoryItemChanges` become the core's `AddInventoryItemInput` and
`UpdateInventoryItemInput`. The item form builds them, and the harness's casts go.

## Clarifications

- **No Context Manager behaviour changes in this spec.** Context Manager's adoption moves the pin,
  reads `details` at the three lifecycle sites, and replaces its two status tables with
  `refusalClass`. The statuses must come out identical; a test pins every code's status before and
  after.
- **Codes go out as the core answers them.** A generic route has no per-op renames, and two
  differences follow.
  - Tasks' `MANIFEST_UNPATCHABLE` becomes the core's `TASKS_MANIFEST_UNPATCHABLE` or
    `TASKS_ID_IMMUTABLE`.
  - Not-found refusals carry the core's message instead of Context Manager's `NotFoundError`
    wording.

  [one-op-route](../../phase3/specs/one-op-route.md) checks the client and the walks for either before switching. If
  something relies on the old forms, the module maps them back.

- **The module is a value, not a class:** `inventoryModule` and `tasksModule`, exported from each
  app's root entry.
- **The tasks module needs host facts that only Context Manager has today** (PR state, divergence).
  The memory host takes them as fixture data, as the workshop does now.

## Non-goals

- Context Manager running the modules: that is [one-op-route](../../phase3/specs/one-op-route.md).
- The create form: [create-from-the-app](../../phase4/specs/create-from-the-app.md).
- Any change to what the elements ask or render.

## Acceptance / completion checklist

- [x] `AppModule` and `RefusalClass` are exported from `common-format/app`, which still imports
      nothing else from `common`'s runtime.
- [x] `inventoryModule` and `tasksModule` exist, and every element op is either a core op or a
      host op of its module.
- [x] Both harness hosts run on the generic memory host with no per-app reply code. A headless drive
      of both harnesses in Chromium passes, as stage 2's did.
- [x] `validateAndScope`, both manifest parses and the zone writer answer `Result`.
- [x] The inventory element ops use the core's input types, with no casts.
- [x] Context Manager is green on the new pin, every refusal code keeps its status, and both walk
      suites were run.
- [x] `npm run check` green here.

## Implementation plan

1. Surfaces PR: the types, both modules, the memory host and both harnesses on it, the result
   shapes and the typed ops.
2. Context Manager PR: the pin, `details` at the lifecycle sites, `refusalClass` in place of the two
   tables, walked.
