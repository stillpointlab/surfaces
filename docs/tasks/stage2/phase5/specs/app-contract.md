---
column: done
pr: 48
completed: 2026-11-07
created: 2026-11-07T14:51:39-07:00
tags: [apps, host-contract, common, code]
---

# Spec: the app contract, as far as the apps use it

_The [apps breakout brief](../../phase1/briefs/apps_breakout.md), desired outcome 5, first half. The
board work ([transport-blind-task-board](transport-blind-task-board.md),
[task-board-element](task-board-element.md)) is built on it. Lands with
[result-types-for-app-cores](result-types-for-app-cores.md), which gives it the `Result` shape._

## High-level goal

`common` names the contract between a host and an app, in the two halves the apps already have:

- the **lifecycle**: a manifest marks an instance, and the app says what it owns. This is Context
  Manager's `RepoViewAdapter` without the host's policy fields.
- the **element**: it takes state and asks the host for ops, with a reply for each.

Both cores implement the lifecycle half, and Context Manager builds its adapters from them. The task
board is the first element on the element half (the next two specs).

## Related context

- The August contract: Context Manager's spike `apps-as-executors` (`AppModule` with `parseManifest`,
  `scope`, `describe`, `seed`, `project`, `apply` over a `FolderSnapshot`). This spec names the parts
  that exist today and leaves `project` and `apply` unnamed: the logic they would hold is still in
  Context Manager's services, and Jamie has deferred extracting it until the breakout is done.
- Context Manager: `src/services/git/repoViewLifecycle.types.ts` (`RepoViewAdapter`),
  `src/services/{tasks,inventory}/lifecycle.ts` (the two adapters, pure).
- Precedent here: `common`'s element contracts are interfaces plus events (`contracts.ts`), each with
  a conformance suite in `./testing`.

## Technical requirement

1. **`@stillpointlab/common-format/app`**, a new light entry: types, plus a few small helpers that
   touch the DOM only when called. It is the entry an app and a host page import, so neither pulls
   in `common`'s runtime (the phase 4 lesson). It also re-exports `createReadyGate`, which imports nothing, and `common`'s log (`report`, `reportError`, `setErrorHandler`, `setReporter`), which is already a shared chunk. So an app element meets `ReadyElement` and reports errors from this entry alone, and a host routes those reports where it routes the formats'.

2. **`Result`**, the shape every app answer uses (Jamie's preferred pattern):

   ```ts
   type Failure = { ok: false; code: string; message: string; details?: unknown[] };
   type Result<T extends object = object> = ({ ok: true } & T) | Failure;
   ```

   `code` is stable and machine-readable; `message` is for a person; `details` carries structured
   causes where a caller had them (the tasks core's zod issues). `ok()` and `fail()` build them.

3. **The lifecycle half.**

   ```ts
   interface FolderNode {
     path: string;
     type: 'blob' | 'tree';
     sha?: string;
   }

   interface AppLifecycle<Detail extends { label: string }> {
     manifestName: string;
     validateAndScope(
       content: string,
       nodes: FolderNode[],
       manifestPath: string
     ): { ok: true; scope: Set<string>; warnings: string[] } | { ok: false; errors: string[] };
     describeInstance(
       content: string | null,
       nodes: FolderNode[],
       manifestPath: string,
       appOnlyPaths: string[]
     ): Detail;
   }
   ```

   - The signatures are `RepoViewAdapter`'s, unchanged. `validateAndScope` keeps its list of errors,
     because a manifest can be wrong in several ways at once and the host shows them all.
   - The host's policy stays the host's: the view's name, its HTTP error codes, the adoption budget
     and whether pending moves are skipped.
   - `FolderNode` is the structural tree node each core already defines as `TreeNode`; the cores now
     use `common`'s.

4. **Each core exports its lifecycle**: `tasksLifecycle` and `inventoryLifecycle`, moved from Context
   Manager's two `lifecycle.ts` files without their host fields. `describeAppCore` gains an optional
   `lifecycle` hook and checks that each mounting fixture validates and that its scope contains the
   manifest.

5. **The element half.**

   ```ts
   interface AppElement<State> extends ReadyElement {
     setState(state: State): void;
   }

   const APP_OP_EVENT = 'app-op';
   interface AppOpDetail<Op, Reply extends object> {
     op: Op;
     respond(result: Result<Reply> | Promise<Result<Reply>>): void;
   }
   ```

   - `requestOp(element, op)` dispatches a bubbling, composed, cancelable `app-op` event and returns
     a promise of the `Result`. A host claims the op by calling `preventDefault()` and answers it
     through `respond`. If nothing claims it, the promise resolves to `fail('OP_UNHANDLED', …)`, so
     an element never waits forever and works in the harness without a host.
   - `answerOps(element, handler)` is the host's side: it claims every op, passes it to `handler`,
     and turns a thrown error into `fail('OP_FAILED', …)`. It returns a dispose function.
   - An app types its ops as a map from the op's `type` to its fields and its reply, so `requestOp`
     returns the reply type for that op.
   - Ops carry **paths**, never a host's ids. A host that keeps ids, as Context Manager does, maps
     paths to them on its own side.
   - Requests the host answers with its own UI, such as opening a dialog or navigating, stay plain
     events with no reply. They also name things by path.

6. **Conformance**: `describeAppElementContract` in `./testing`:
   - the element registers and becomes ready;
   - `setState` renders without raising an op;
   - an op nobody claims resolves to `OP_UNHANDLED`;
   - a claimed op resolves to the host's reply, and a rejected one to `OP_FAILED`.

   The hooks are the tag, a state to set, and a way to make the element ask for one op.

7. **The Context Manager adoption** (one PR there, after this and
   [result-types-for-app-cores](result-types-for-app-cores.md) merge, in the
   `context-manager-surfaces` checkout):
   - Move the pin. `RepoViewAdapter` becomes `AppLifecycle` plus the host fields, and the two
     adapters spread the cores' lifecycles. Delete the two `lifecycle.ts` bodies.
   - Re-export `FolderNode` where Context Manager re-exports the cores' types.
   - Run the tasks and inventory walks, as for every adoption.

## Clarifications

- **Why not the whole `AppModule`.** Naming `project` and `apply` now would describe functions no app
  has. The deferred pass that extracts the services' rules will name them against real code.
- **Why a claimable event and not a method the host calls back.** The board renders optimistically
  and rolls back on failure, so each op needs its own answer. A reply on the event keeps the element
  unaware of who answers, works across shadow roots, and has a defined result when nobody does.
- **`Result` and the existing results.** The cores already return several ad-hoc shapes (`{ ok:
false, errors }`, `reason`, `notFound`). This spec does not change them; the result-types spec
  converts only the functions that throw.

## Non-goals

- `project`, `apply`, `FolderSnapshot` or `FileChange`.
- MCP app vocabularies.
- Any element: the board is the next two specs, inventory is phase 6.
- Changing a lifecycle's behaviour.

## Acceptance / completion checklist

- [x] `common-format/app` exports `Result`, `ok`, `fail`, `FolderNode`, `AppLifecycle`, `AppElement`,
      `APP_OP_EVENT`, `AppOpDetail`, `requestOp`, `answerOps`, `createReadyGate` and the log functions, and its built file imports nothing else from `common`'s runtime.
- [x] Both cores export their lifecycles, and `describeAppCore` checks them over the existing
      fixtures.
- [x] `describeAppElementContract` passes against a sample element in `common`'s own tests.
- [x] The Context Manager adoption is green, and walked.
- [x] `npm run check` green here.

## Implementation plan

1. Surfaces PR: the `./app` entry, its tests and the suite; the lifecycles into the cores; the apps
   README describes both halves.
2. Context Manager PR: the adoption above, combined with the result-types adoption if both land
   together.

## Implementation notes

- Landed in #48, merged with #49 and #50 as `4939d67`. `common-format/app` is 492 bytes of ESM plus
  the chunks it shares with the other entries.
- An element test cannot see the promise `requestOp` returns. `describeAppElementContract` checks
  what the element does (it raises one well-formed event, and keeps working when an op goes
  unanswered or is refused), and `app.test.ts` covers `OP_UNHANDLED` and `OP_FAILED` directly.
- The sample element in `common`'s tests first had a `title` field, which set the attribute from
  its constructor. It is `heading` now. Overloads on `ok()` tripped `no-redeclare`, so it has one
  signature with a default type parameter.
- The cores' `TreeNode` is an alias of `FolderNode`, imported as a type, so their `./types` entries
  still load nothing at runtime.
- The Context Manager adoption is context-manager#1043, merged 2026-11-07 together with the
  result types and pinned on `4939d67`. `RepoViewAdapter` is now `AppLifecycle` plus the host's
  policy, and the two adapters spread the cores' lifecycles. The inventory walks passed (38/38),
  and the tasks walks passed 01-29 apart from 28 and step 09's closing assertion (the drift
  recorded in #1039).
