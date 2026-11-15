---
column: in-progress
created: 2026-11-13T18:46:00-07:00
tags: [apps, common, host-contract, code]
---

# Spec: one runner over the storage port

_The [local host brief](../../../stage4/phase1/briefs/local_host.md), outcome 3. Stage 5, phase 2,
second wave: after both steps of [app-module-grows](app-module-grows.md); beside
[app-shells](app-shells.md). One PR here._

> Written with stage 4's specs, before any of stage 4 was built, and read again on 2026-11-14
> against what stage 4 made. The [review](../../phase1/reviews/specs-against-stage-4.md) lists what changed
> and why (H3, M1, M2). "What stage 4 built" is what an implementer reads first.

## High-level goal

Running an app's op is one function in `common`, written against the storage port and nothing
else. The harness's memory host becomes that function over a port in memory, and the local host
will be the same function over a folder.

## Related context

- The brief's second-round decision: the runner and the port live in `common-format/host`,
  because the harness uses the same runner and Context Manager running on it is the end state.
- `tooling/harness/memory-host.ts` (65 lines): today's runner.
- Context Manager's `services/apps/appHost.ts`: `runOp`'s steps, `checkChanges` (the scope check),
  `AppFilesService.loadInstance` (the generic loader) and `AppHostEntry` (what one app adds: its
  own loader, its facts). Read them; do not import them.
- `StoragePort` ([host-server](../../../stage4/phase2/specs/host-server.md), with its "As
  built" section); `bounds` ([app-module-grows](app-module-grows.md)).

## What stage 4 built

_Added 2026-11-14._

- **`StoragePort`** (`packages/common/src/host/index.ts`) is `list`, `get`, `put` and `status`.
  `get` answers text of at most 2 MiB with a `version`. A file that is not text, or is larger,
  is refused, and is `null` in a snapshot. `put` answers each written path's new `version`.
- **`put`'s rules,** which the runner relies on and the memory port keeps:
  - all the changes or none;
  - one `put` at a time;
  - a path once per call, as a `path` or as a `from`;
  - `base` checked for each change that gives one (`HOST_FILE_CHANGED`);
  - a `create` onto a path that exists is `HOST_PATH_EXISTS`;
  - a `move` without `content` keeps the file's bytes.
- **The node port stages its own moves and deletes** in git's index after a `put`. A card the
  runner moves shows in git as a rename with nothing more to do.
- **`status()` has no old path for a moved file.** The node port's git answers `changes()`
  (`HostChange[]`, a moved file with its `from`), which is not on `StoragePort`.
- **`common-format/host` exports types only,** and `src/host/entry.test.ts` says so. The same
  test fails the entry when its built text holds `process`, `Buffer`, `document`, `window`,
  `HTMLElement` or `customElements`: in code, in a message, or in a comment the build keeps.
- **A snapshot is not always files alone.** `TasksSnapshot` carries `moves` (a moved card's old
  paths), `created` (cards with no committed file yet) and two more optional parts. Context
  Manager fills them from a loader per app. The harness keeps `moves` in its workspace's
  `write` (`packages/apps/tasks/dev/workspace.ts`), which the memory port replaces.

## Work package

- **Owns:** `packages/common/src/host/runner.ts` and its tests; a memory port in
  `packages/common/src/host/memory-port.ts`; the port suite in `packages/common/src/testing/`;
  `src/host/entry.test.ts`; `tooling/harness/memory-host.ts`; one test file in
  `packages/hosts/local` that runs the port suite over the node port.
- **Reads, does not change:** `StoragePort`, `AppModule`.
- **Runs beside** app-shells. Neither touches the other's files.

## Technical requirement

Everything here is DOM-free and Node-free: it imports `common-format/app` and the port's types.

### Loading an instance

```ts
export interface LoadedInstance<S extends AppSnapshot = AppSnapshot> {
  snapshot: S;
  /** The paths the app owns, from the lifecycle. */
  scope: ReadonlySet<string>;
  /** The version each file in the snapshot was read at. */
  versions: Readonly<Record<string, string>>;
  /** One string for the files as loaded: equal for two loads of the same paths at the same versions. */
  revision: string;
  warnings: string[];
}

export function loadInstance(
  port: StoragePort,
  module: AnyAppModule,
  manifestPath: string
): Promise<Result<LoadedInstance>>;
```

It lists the port, reads the manifest, asks `lifecycle.validateAndScope`, and reads every file in
the scope. A file the port cannot read is `null` in the snapshot. `snapshot.paths` and `taken`
follow what Context Manager's generic loader gives a core. A missing manifest is
`APP_MANIFEST_NOT_FOUND`; an invalid one is the lifecycle's refusal.

### Running an op

```ts
export interface RunnerHost {
  port: StoragePort;
  /**
   * What only this host knows about the instance: the module's facts, and the
   * plain data the app's snapshot carries beyond its files (tasks' pending
   * moves and created cards), laid over the loaded snapshot before the core
   * sees it.
   */
  know(
    module: AnyAppModule,
    loaded: LoadedInstance
  ): Promise<{ facts: unknown; snapshot?: object }>;
  now(): string;
}

export function runOp(
  host: RunnerHost,
  module: AnyAppModule,
  manifestPath: string,
  request: { op: unknown; view?: unknown }
): Promise<Result<{ reply: object; revision: string }>>;
```

1. Refuse an op whose type is not in `module.coreOps` (`APP_OP_UNKNOWN`).
2. Check the op with `module.bounds.op`, and the view, when given, with `module.bounds.view`.
3. `loadInstance`, then `host.know`, whose `snapshot` parts are laid over the loaded one.
4. `module.core.apply(snapshot, module.toCoreOp(op, { now }))`. A refusal goes back as it is.
5. Check every change is the instance's, as Context Manager's `checkChanges` does: a `create`
   lands under the manifest's folder; a `write`'s path and a `move`'s source are files that were
   loaded, and a `move`'s target is under the folder. Otherwise `APP_PATH_OUT_OF_SCOPE`.
6. `port.put` the changes in one call, each `write` and `move` with the version it was loaded
   at as its `base`. Changes that name a path twice are refused first (`APP_CHANGES_INVALID`),
   since the port takes a path once per call. `HOST_FILE_CHANGED` and `HOST_PATH_EXISTS` go back
   as a conflict: the file moved on under the op.
7. Load again, ask `know` again, and answer `module.reply(op, applied, { snapshot, facts, view })`
   with the new load's `revision`.

The caller maps a refusal to its own answer with `module.refusalClass`; the `HOST_` and `APP_`
codes above are classed by one exported function, `hostRefusalClass(code)`.

### Reading a view, and creating

```ts
export function projectView(
  host: RunnerHost,
  module: AnyAppModule,
  manifestPath: string,
  view: unknown
): Promise<Result<{ state: object | null; revision: string }>>;

export function createInstance(
  host: RunnerHost,
  module: AnyAppModule,
  request: { folder: string; confirmRoot?: boolean; input: unknown }
): Promise<Result<{ manifestPath: string }>>;
```

`createInstance` checks the input with `module.bounds.create`, asks `core.seed`, fits the files
with `module.placeCreate` against the port's list, and writes them as `create` changes in one
`put`.

### The memory port, and one suite for both ports

`createMemoryPort(files)` answers a `StoragePort` over a map of paths to text, with `put`'s
rules as listed under "What stage 4 built" and the same refusal codes. It also answers:

- `changes(): HostChange[]`: what differs from the files it was made with, a moved file with
  its `from`, as the node port's git reports a staged move. `status()` is the same by path;
- `commit(paths?)`: the named files, or all of them, as they are now become what `changes()`
  compares against. A check-in in the harness is this.

`describeStoragePort(name, make)` in `common-format/testing` holds the port's rules as tests.
The memory port runs it here, and the node port runs it over a temporary folder, so the two
cannot drift apart.

### The harness

`memoryAnswer` keeps its signature and its fixtures' behaviour, and its body becomes `runOp`
over `createMemoryPort(files)`. The hand-built-state refusal (`HARNESS_NO_FILES`) and the host
op table stay in the harness. Each app's `dev/host.ts` shrinks by what the memory port now does:
writing changes into the snapshot, and, for tasks, recording a move as it is written. Its
`know` is `module.fromChanges` over the memory port's `changes()`
([app-module-grows](app-module-grows.md); Jamie's decision 3 of the review, 2026-11-14), so the
facts code in each `dev/host.ts` goes too.

## Clarifications

- **No linking, no drafts, no bases by good.** Those are Context Manager's steps between 5 and
  6, and they stay there. This runner is the five steps both hosts share.
- **The runner never deletes.** `FileChange` has no delete; the port's `delete` is for the
  explorer and for undo.
- **Facts stay per host and per app.** The runner asks the host for them and does not look
  inside.
- **The entry stops being types only.** `src/host/entry.test.ts` drops that check and keeps
  the other: nothing from Node or the DOM, and none of the words it scans for, in the built
  entry.
- **Synchronous callers.** `memoryAnswer` is synchronous today and `runOp` is not. The harness's
  answer becomes a promise, which `answerOps` already accepts.

## Non-goals

- Context Manager adopting the runner (the brief's out of scope).
- Host ops. Each host answers its own.
- Discovering instances in a folder: [apps-in-the-local-host](../../phase1/specs/apps-in-the-local-host.md).

## Acceptance / completion checklist

- [ ] Runner tests over the memory port, with both apps' fixture folders: each step's refusal,
      the scope check for `create`, `write` and `move`, a stale base, changes that name a path
      twice, and a reply with its revision.
- [ ] The port suite passes over the memory port and over the node port.
- [ ] A card moved in the harness shows where it moved from, read from the memory port's
      `changes()`.
- [ ] `projectView` and `createInstance` have tests, including a create that does not fit.
- [ ] The harness's apps behave as before, by its existing tests and by hand.
- [ ] `common-format/host` imports nothing from Node or the DOM (the entry test, without its
      types-only check).
- [ ] `npm run check` is green.

## Implementation plan

1. The memory port and the port suite, `loadInstance` and `runOp`, with tests.
2. `projectView` and `createInstance`.
3. The harness on the runner.
