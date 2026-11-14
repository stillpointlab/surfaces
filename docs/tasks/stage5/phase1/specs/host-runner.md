---
column: todo
created: 2026-11-13T18:46:00-07:00
tags: [apps, common, host-contract, code]
---

# Spec: one runner over the storage port

_The [local host brief](../../../stage4/phase1/briefs/local_host.md), outcome 3. Stage 5, phase 2,
second wave: after both steps of [app-module-grows](app-module-grows.md); beside
[app-shells](app-shells.md). One PR here._

> Written with stage 4's specs, before any of stage 4 was built. Stage 5 opens by reading it
> again against what stage 4 made.

## High-level goal

Running an app's op is one function in `common`, written against the storage port and nothing
else. The harness's memory host becomes that function over a port in memory, and the local host
will be the same function over a folder.

## Related context

- The brief's second-round decision: the runner and the port live in `common-format/host`,
  because the harness uses the same runner and Context Manager running on it is the end state.
- `tooling/harness/memory-host.ts` (65 lines): today's runner.
- Context Manager's `services/apps/appHost.ts`: `runOp`'s steps, `checkChanges` (the scope check),
  and `AppFilesService.loadInstance` (the generic loader). Read them; do not import them. -
  `StoragePort` ([host-server](../../../stage4/phase1/specs/host-server.md)); `bounds`
  ([app-module-grows](app-module-grows.md)).

## Work package

- **Owns:** `packages/common/src/host/runner.ts` and its tests; a memory port in
  `packages/common/src/host/memory-port.ts`; `tooling/harness/memory-host.ts`.
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
  /** What only this host knows about the instance, as the module's facts. */
  facts(module: AnyAppModule, loaded: LoadedInstance): Promise<unknown>;
  now(): string;
}

export function runOp(
  host: RunnerHost,
  module: AnyAppModule,
  manifestPath: string,
  request: { op: unknown; view?: unknown }
): Promise<Result<object>>;
```

1. Refuse an op whose type is not in `module.coreOps` (`APP_OP_UNKNOWN`).
2. Check the op with `module.bounds.op`, and the view, when given, with `module.bounds.view`.
3. `loadInstance`.
4. `module.core.apply(snapshot, module.toCoreOp(op, { now }))`. A refusal goes back as it is.
5. Check every change is the instance's, as Context Manager's `checkChanges` does: a `create`
   lands under the manifest's folder; a `write`'s path and a `move`'s source are files that were
   loaded, and a `move`'s target is under the folder. Otherwise `APP_PATH_OUT_OF_SCOPE`.
6. `port.put` the changes, each `write` and `move` with the version it was loaded at as its
   `base`. A `HOST_FILE_CHANGED` goes back as a conflict: the file moved on under the op.
7. Load again, and answer `module.reply(op, applied, { snapshot, facts, view })`.

The caller maps a refusal to its own answer with `module.refusalClass`; the `HOST_` and `APP_`
codes above are classed by one exported function, `hostRefusalClass(code)`.

### Reading a view, and creating

```ts
export function projectView(
  host: RunnerHost,
  module: AnyAppModule,
  manifestPath: string,
  view: unknown
): Promise<Result<{ state: object | null }>>;

export function createInstance(
  host: RunnerHost,
  module: AnyAppModule,
  request: { folder: string; confirmRoot?: boolean; input: unknown }
): Promise<Result<{ manifestPath: string }>>;
```

`createInstance` checks the input with `module.bounds.create`, asks `core.seed`, fits the files
with `module.placeCreate` against the port's list, and writes them as `create` changes in one
`put`.

### The harness

`memoryAnswer` keeps its signature and its fixtures' behaviour, and its body becomes `runOp`
over `createMemoryPort(files)`. The hand-built-state refusal (`HARNESS_NO_FILES`) and the host
op table stay in the harness. Each app's `dev/host.ts` shrinks by what the memory port now does
(writing changes into the snapshot).

## Clarifications

- **No linking, no drafts, no bases by good.** Those are Context Manager's steps between 5 and
  6, and they stay there. This runner is the five steps both hosts share.
- **The runner never deletes.** `FileChange` has no delete; the port's `delete` is for the
  explorer and for undo.
- **Facts stay per host and per app.** The runner asks the host for them and does not look
  inside.
- **Synchronous callers.** `memoryAnswer` is synchronous today and `runOp` is not. The harness's
  answer becomes a promise, which `answerOps` already accepts.

## Non-goals

- Context Manager adopting the runner (the brief's out of scope).
- Host ops. Each host answers its own.
- Discovering instances in a folder: [apps-in-the-local-host](apps-in-the-local-host.md).

## Acceptance / completion checklist

- [ ] Runner tests over the memory port, with both apps' fixture folders: each step's refusal,
      the scope check for `create`, `write` and `move`, a stale base, and a reply.
- [ ] `projectView` and `createInstance` have tests, including a create that does not fit.
- [ ] The harness's apps behave as before, by its existing tests and by hand.
- [ ] `common-format/host` imports nothing from Node or the DOM (an entry test).
- [ ] `npm run check` is green.

## Implementation plan

1. The memory port, `loadInstance` and `runOp`, with tests.
2. `projectView` and `createInstance`.
3. The harness on the runner.
