---
column: done
pr: 62
completed: 2026-11-09
created: 2026-11-09T13:30:21-07:00
tags: [apps, host-contract, common, code]
---

# Spec: the contract's other half, `project` and `apply`

_The [app rules brief](../briefs/app_rules.md), desired outcome 2. Named against the functions
[inventory-rules](inventory-rules.md) built (#60, adopted in Context Manager #1062), and shaped so
[tasks-rules](tasks-rules.md) fits it: card moves are the one change inventory does not make._

## High-level goal

`common-format/app` names what an app core does with files: given a snapshot of a folder and the
host's facts, `project` the state an element renders; given an op, `apply` it and answer the file
changes or a refusal; given a create input, `seed` the files of a new instance. Inventory's core
implements it with the functions it already has. `describeAppCore` gains the round trip: apply an
op to a fixture, write the changes, check they re-parse and keep what a hand-edited file holds, and
project again.

## Related context

- The [app contract](../../phase5/specs/app-contract.md) named the lifecycle and element halves and
  left `project` and `apply` for "the deferred pass that extracts the services' rules".
- The August design (Context Manager's `apps-as-executors` spike): `AppModule` with `project` and
  `apply` over a `FolderSnapshot`, answering `FileChange`s (`write`, `move`, `delete`). Its snapshot
  was read through async callbacks; the brief decided a core receives plain data instead.
- What inventory has now (`packages/apps/inventory/src`):
  - `InventorySnapshot { manifestPath, paths, files, taken? }` and `InventoryHostFacts { enabled, dirty }`
    (`space.ts`);
  - `projectInventorySpace(snapshot, facts)` and `projectInventoryZone(snapshot, slug, facts)`;
  - four op functions answering `Result<{ changes: InventoryChange[] } & extras>`, where
    `InventoryChange` is `{ path, content, created? }` (`ops.ts`);
  - `planInventoryCreate(input)` and `placeInventoryCreate(plan, { taken, reusable })` (`create.ts`).
- What tasks will need ([tasks-rules](tasks-rules.md)): a card file moves, keeping its content
  rewritten (its column and relative links), and closing a phase moves several cards and rewrites
  `tasks.yaml` in one op. Nothing in either app deletes a file.
- `describeAppCore` (`packages/common/src/testing/app.ts`) checks mounts, the lifecycle, and
  per-file `rewrites` given as `text → text` functions.

## Technical requirement

1. **The snapshot**, moved from inventory into `common-format/app`:

   ```ts
   interface AppSnapshot {
     manifestPath: string;
     /** Every path the host can see: its tree and the files it created that have no upstream yet. */
     paths: readonly string[];
     /** Contents by path, the host's drafts laid over. `null` or absent: the host could not read it. */
     files: Readonly<Record<string, string | null>>;
     /** Paths a new file may not use beyond `paths`. */
     taken?: readonly string[];
   }
   ```

   An app may extend it with plain data of its own (tasks adds parsed card projections and pending
   moves).
   `InventorySnapshot` becomes an alias.

2. **The change**:

   ```ts
   type FileChange =
     | { kind: 'write'; path: string; content: string }
     | { kind: 'create'; path: string; content: string }
     | { kind: 'move'; from: string; path: string; content: string };
   ```

   - Every change carries the file's whole new content, so a host never re-derives it.
   - A `move` is one file under a new path; its content may change with it.
   - There is no `delete` until an app needs one.
   - `InventoryChange` goes; inventory answers `write` and `create`.

3. **The core**:

   ```ts
   /** An app's views: each names its parameters and the state it projects. */
   type AppViewMap = Record<string, { params: object; state: object }>;
   /** An app's core ops: each names its fields and what `apply` answers beside the changes. */
   type AppCoreOpMap = Record<string, { op: object; result: object }>;

   interface AppCore<V extends AppViewMap, O extends AppCoreOpMap, Facts, Seed> {
     project<K extends keyof V & string>(
       snapshot: AppSnapshot,
       view: { type: K } & V[K]['params'],
       facts: Facts
     ): V[K]['state'] | null;
     apply<K extends keyof O & string>(
       snapshot: AppSnapshot,
       op: { type: K } & O[K]['op']
     ): Result<{ changes: FileChange[] } & O[K]['result']>;
     seed(input: Seed): Result<{ manifestPath: string; files: FileChange[] }>;
   }
   ```

   - **`project`** answers `null` when the view's subject is gone: the manifest, or the zone a slug
     names. It does not throw for a broken file; a broken file is part of the state.
   - **`facts`** are the app's own type: plain data a second host could supply. A host's ids are
     never facts; the host lays them over the state afterwards.
   - **`apply`** answers the changes, or a refusal with the app's codes and messages. An op that
     changes nothing answers no changes. Op types share their names with the element's ops where
     they correspond, so a host can hand an element's op straight to `apply`.
   - **`seed`** answers the files of a new instance (`create` changes) or a refusal. It does not
     see the host's paths: whether the files fit is the next helper's question.

4. **Placing new files**: `placeNewFiles(files, { taken, reusable })`, moved from inventory's
   `placeInventoryCreate`, answers the files still to create, or the first path in the way (a file
   among `taken`, or a file at one of their parent folders) as `{ ok: false, path }`. `reusable`
   files are skipped instead of refused. Each app turns the path into its own refusal
   (`INVENTORY_PATH_EXISTS`, `TASKS_PATH_EXISTS`).

5. **Inventory implements it.**
   - `inventoryCore: AppCore<InventoryViews, InventoryCoreOps, InventoryHostFacts, CreateInventoryInput>`
     is built from the existing functions:
     - views `space {}` and `zone { slug }`;
     - ops `add-zone`, `add-item`, `update-item`, `delete-item`, with the element's op fields;
     - `seed` = `planInventoryCreate`.
   - The named functions stay exported: a host may call them directly, as Context Manager does.
   - `placeInventoryCreate` becomes a thin wrapper over `placeNewFiles`.
   - The harness's in-memory host answers ops through `inventoryCore.apply` and re-projects through
     `inventoryCore.project`.

6. **The round trip in `describeAppCore`.** An optional `core` hook:

   ```ts
   core?: {
     core: AppCore<any, any, any, any>;
     facts: unknown;
     /** Ops to apply, each to one fixture, and the view to project before and after. */
     ops: { name: string; fixture: string; op: { type: string }; view: { type: string } }[];
     /** Whether the app reads one written file back without error. */
     reparses: (path: string, text: string) => boolean;
   };
   ```

   For each op, the suite builds a snapshot from the fixture (every file visible), checks that the
   view projects, applies the op, and checks:
   - the op succeeds and each change's `content` re-parses;
   - a `write` or `move` keeps every comment line, and the final newline or its absence;
   - the same op over the fixture with CRLF line breaks keeps them;
   - the view projects again over the written snapshot.

   The `rewrites` hook stays for rewrites that are not yet ops (tasks, until its rules land).
   Inventory's three rewrites become ops.

7. **Context Manager** moves its pin and switches `InventoryService.write` on `change.kind`. Nothing
   else there changes: it keeps calling inventory's named functions. The inventory walks run.

## Clarifications

- **Why `move` has content.** A card moving to another phase rewrites its column and its relative
  links in the same step. A move without content would make the host apply a second change to a
  path that no longer exists.
- **Why plain data and not the August callbacks.** The brief decided it: a host reads files its own
  way (drafts first, caches) before calling the core, and a pure core can be tested from a folder of
  fixtures. A host that cannot afford to read every file lays parsed data over the snapshot through
  the app's own extension, as tasks does.
- **Why `project` takes a view.** Inventory renders two states and tasks four. One function per view
  would make the contract a bag of names; a view type keeps one entry point a generic host can call.
- **Why `seed` is not `apply`.** A create has no snapshot of the instance yet, and the host checks
  things only it knows (a synced tree, overlapping views, a resumed create) between planning the
  files and placing them.

## Non-goals

- Tasks' rules ([tasks-rules](tasks-rules.md)).
- A generic in-memory host shared by both harnesses (tasks-rules decides once both exist).
- `delete` changes, binary files, or async reads.
- Any change to Context Manager's API, or to how it calls the inventory core beyond `write`.

## Acceptance / completion checklist

- [x] `common-format/app` exports `AppSnapshot`, `FileChange`, `AppViewMap`, `AppCoreOpMap`,
      `AppCore` and `placeNewFiles`, still importing nothing else from `common`'s runtime.
- [x] `inventoryCore` implements `AppCore`; `InventoryChange` is gone; the harness host goes through
      `project` and `apply`.
- [x] `describeAppCore` runs the round trip, and inventory's app-core test uses it for its ops.
- [x] Context Manager is green on the new pin, and the inventory walks were run.
- [x] `npm run check` green here.

## Implementation plan

1. Surfaces PR: the types and helper in `common`, the suite's round trip, inventory on the contract,
   the harness host.
2. Context Manager PR: the pin and `write`'s switch, walked.

## Implementation notes

- Landed in #62, merged 2026-11-09 as `3a8bd2d`. `common-format/app` names `AppSnapshot` (moved
  from inventory), `FileChange` (`write`, `create`, `move`), the view and op maps, `AppCore` with
  `project`, `apply` and `seed`, and `placeNewFiles`. `AppCore` takes a fifth, defaulted parameter
  for an extended snapshot, which tasks uses. The `app` entry imports the same shared chunks.
- `describeAppCore`'s round trip checks, per op: the view projects before and after, every written
  file re-parses, comments survive, CRLF survives, and the final newline (or its absence) is kept.
  It is tested against a sample core, each check failing on a broken variant.
- `inventoryCore` puts the named functions behind the contract; they stay exported, and Context
  Manager keeps calling them. Its app-core test runs 8 ops (the seven former rewrites and add zone),
  40 checks. Tests went from 1,609 to 1,648.
- Context Manager adopted it in context-manager#1069, merged 2026-11-09: `InventoryService.write`
  switches on the change's kind. The inventory walks passed 38/38.
