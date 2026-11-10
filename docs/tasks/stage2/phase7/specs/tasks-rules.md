---
column: done
pr: 67
completed: 2026-11-10
created: 2026-11-09T13:30:21-07:00
tags: [apps, host-contract, code]
---

# Spec: tasks' rules live in its core

_The [app rules brief](../briefs/app_rules.md), desired outcome 3, and the tasks half of outcome 6.
After [app-core-contract](app-core-contract.md): the tasks core implements `AppCore`, and its card
moves are the contract's `move` changes. The ops match the ones
[board-dialogs](board-dialogs.md) and [tasks-nav-element](tasks-nav-element.md) give the elements._

## High-level goal

The tasks core projects the board, a stage and the nav from a snapshot of the docs folder, and
answers each board op with the file changes it makes or a refusal. Context Manager's
`BoardService` loads the files, lays its own facts over the states, links, writes and maps refusals,
as `InventoryService` now does. The harness runs the board and the nav on the core, over this
repository's own `docs/tasks/`.

## Related context

- The pattern: inventory-rules (#60, Context Manager #1062). `InventoryService.changeZone` runs the
  op, links a tracked file if the op changes it, reloads, runs the op again and writes.
- Today `board.service.ts` is about 3,000 lines and 20 public methods. Its rules sit between I/O
  calls, and the core already holds the parts: detection and synthesized boards, card projection,
  frontmatter, nav, pool order, link rewriting, manifest rewrites and the manifest seed. The service
  assembles the board, stage and pool states itself; no core function builds them.
- Mutations name cards by `goodId` (`findCardEntry`), so a tracked card (no good yet) cannot be
  changed by the service; the page links it first. The element's ops already name cards by path.
- The brief's decision on drafts: the frontmatter comparison (`metadataDelta`) moves to the core;
  deciding when to rebase stays with Context Manager. Its "is the rest the same once formatted"
  check runs the host's Markdown formatter.
- Tracked cards are projected from a cache keyed by the blob's sha, so Context Manager often holds a
  card's parsed projection and not its content.
- Things the survey found that this spec settles:
  - two refusals change code on the way out: a manifest edit's patch failures go out as
    `MANIFEST_UNPATCHABLE`, and adding a tag's go out as `VALIDATION_ERROR`;
  - moved-away paths (a card's old path while its move is pending) are hidden from the render, but
    not from pool-order validation, column counts or card lookup;
  - undoing a card move checks for a check-in in flight after the draft is already saved;
  - creating a card stamps `created` from the wall clock, and reads its template from the host.

## Technical requirement

1. **The snapshot**, `TasksSnapshot extends AppSnapshot`:
   - `paths`: every path the host can see, its tree and the files it created.
   - `files`: the contents it read, drafts laid over: the manifest, templates, the pool's order file,
     and the cards it has.
   - `projections`: cards the host holds parsed (the core's `CardProjection`), by path, for cards it
     did not read. A path in `files` wins.
   - `moves`: pending moves, as each card's current path and the old paths it moved from. The old
     paths are hidden everywhere: in the render, pool-order validation, column counts and card
     lookup.
   - `taken`: paths a new card may not use beyond `paths`.

2. **Host facts** for projection:
   - per card, by path: `title` (Context Manager's good title), `tracked`, `changed`, `dirty`,
     `versionColumn`, `diverged`, `movedFrom`, `checkinPrUrl`, `prState`;
   - the order file's `changed`.

   The elements render these; the core lays them on. Ids are not facts. `goodId`, `goodPublicId`,
   the pool order's `goodId`, and the housekeeping list move to Context Manager's extension of the
   shared types, and its JSON keeps them.

3. **Projection**: `tasksCore.project` with three views.
   - **`board { path }`**: today's board state: the board, columns, cards, pool, kinds, tags, default
     and done columns, and manifest warnings. It is `null` for a path that is neither a board nor a
     phase the nav can synthesize.
   - **`stage { stage }`**: today's stage state. It is `null` for a stage with no phases.
   - **`nav {}`**: the nav with `currentPointer`, `currentPointerPath` and `doneColumn`, which the
     route assembles today.
   - A missing manifest is `null`. `resolveTasks(snapshot)` answers `TASKS_MANIFEST_INVALID` with
     today's message for a manifest that does not parse, and the projections answer `null` for it.
   - Output matches today's for every case the service's tests cover, except where host ids now sit
     among the keys.

4. **Ops**: `tasksCore.apply`, naming cards by path, with today's codes and messages.

   | Op                   | Fields                              | Changes                             | Result                       |
   | -------------------- | ----------------------------------- | ----------------------------------- | ---------------------------- |
   | `move`               | `path`, `column \| null`            | write                               |                              |
   | `move-file`          | `path`, `target`                    | move, plus an order-file write      |                              |
   | `reorder-pool`       | `paths`                             | write, or create when no order file |                              |
   | `set-title`          | `path`, `title \| null`             | write                               |                              |
   | `set-tags`           | `path`, `tags`                      | write                               |                              |
   | `add-tag`            | `tag`                               | write, or none when present         | `tags`                       |
   | `create-card`        | `boardPath`, `title`, `kind`, `now` | create                              | `path`                       |
   | `edit-manifest`      | one manifest edit                   | write                               | `manifest`, `warnings`       |
   | `create-stage-phase` | `kind`, `stage?`                    | write                               | `stage`, `phase`, `path`     |
   | `set-current`        | `stage`, `phase`                    | write                               |                              |
   | `close`              | `kind`, `paths`                     | moves, then the manifest's write    | `target`, `moved`, `created` |
   | `fix-references`     | `path`, `referencingPaths`          | writes                              | `fixed`                      |
   - **Rules move whole**: the column guard, the frontmatter parse guard, link rewriting on a move,
     slugs and collisions, manifest-edit guards (column and kind counts, references, cards still
     carrying a column, files under a kind), target selection for create and close, and close's
     whole-selection validation.
   - **A refusal is decided before any change.** That includes the undo-a-move guard, which today
     runs after the draft is saved.
   - **The pool prune.** Moving a card out of the pool also answers the order file without it.
     Context Manager keeps writing that change best-effort, as today.
   - **`create-card` takes `now`.** The core never reads a clock. The template is a snapshot file.
   - **Queries are functions, not ops**: `referencesTo(snapshot, path)` (scan references) and the
     close candidates (the board projection, filtered).
   - **Not-found codes.** For a card, board, stage, column or kind, the core answers its own code
     (`TASKS_CARD_NOT_FOUND`, `TASKS_BOARD_NOT_FOUND`, …). Context Manager turns each back into
     today's `NotFoundError`.

5. **Drafts.**
   - The core exports `metadataDelta`, `trackedCardKeys` and `rebaseMetadata`.
     `rebaseMetadata({ draft, base, latest, keys, mineWins })` answers `rebased` (with content),
     `metadata` (a tracked key collides, or an untracked key changed) or `content`.
   - Context Manager keeps the rest: deciding when to rebase (on read, and on the explicit resolve),
     the formatter check, the saves, and take-latest.

6. **Create**: `tasksCore.seed` checks the root confirmation and the seed's validity and answers
   `tasks.yaml`. `placeNewFiles` answers `TASKS_PATH_EXISTS` for a collision or a file at a parent
   folder. Context Manager keeps the sync check, the existing row, scope overlap, resume and the
   row.

7. **Context Manager's `BoardService` becomes host work.**
   - **Loading:** the snapshot (drafts first; tracked cards from the projection cache), PR states,
     housekeeping, and the moves from goods' metadata.
   - **Calls and overlays:** it calls the core and lays ids and facts over the states.
   - **Linking:** on the first change to a tracked file, it links, reloads and runs the op again, as
     inventory does. Close still links its selection first.
   - **Writes:**
     - a `write` is a draft on its loaded version;
     - a `create` is an app-only good;
     - a `move` is a draft plus the good's move metadata (anchor, hops, undo), which stays host
       logic.
   - **Statuses:** a table from code to status, with two renames on the wire:
     - `edit-manifest`: `TASKS_MANIFEST_UNPATCHABLE` and `TASKS_ID_IMMUTABLE` go out as 409
       `MANIFEST_UNPATCHABLE`;
     - `add-tag`: the core's tag refusals go out as 400 `VALIDATION_ERROR`.
   - Routes keep taking `goodId`. The service maps it to a path.
   - The API, its responses and the walks are unchanged, apart from what this spec names.

8. **The harness runs on the core.**
   - The board's in-memory host answers every op with `tasksCore.apply` over this repository's
     `docs/tasks/` (and the hand-built fixture repo) and re-projects.
   - The same holds for the strip's and the dialogs' ops once [tasks-nav-element](tasks-nav-element.md)
     and [board-dialogs](board-dialogs.md) land.
   - If its host and inventory's turn out the same shape, they share one in the harness tooling.

9. **Tests follow the rules.**
   - The service tests the survey marks as rules move to the core: projection, moves and guards,
     titles and tags, card creation and spikes, the pool, manifest edits, lifecycle targets, close
     validation, rebase decisions, and link rewriting.
   - The host tests stay: loading tiers, caches, linking, metadata, housekeeping, PR state and the
     stale-seed suite.
   - Each PR lists what moved.

## Clarifications

- **Moved-away paths, everywhere.** Today a pending move's old path is hidden from the board but
  still counts when reordering the pool, removing a column, or finding a card. One rule is simpler,
  and no walk depends on the difference: a card is where it moved to. This is the one rule whose
  behaviour this spec changes.
- **The undo guard.** Refusing before any change is the contract, so the late check becomes an early
  one. No walk can observe the draft the late check left behind.
- **Different targets for create and close stay.** A new stage or phase follows the last one in the
  nav; closing follows the pointer. Both are today's behaviour and the walks pin them.
- **Why projections in the snapshot.** Reading every tracked card's content to render a board would
  undo the sha-keyed cache. The core already defines the parsed shape the cache holds.
- **Why `resolve` and `read-file` are not core ops.** `take-latest` deletes a draft, `rebase-metadata`
  needs the base and latest versions, and reading a file is the host's. The core supplies the
  comparison; the host does the rest.

## Non-goals

- The element's dialogs and the strip (their own specs), check-in, refresh, or the create-tasks
  dialog.
- Changing a route, a request body, a response's fields, or the refusal codes on the wire beyond the
  two renames kept above.
- Melting the draft service, the projection cache or PR state into the core.

## Acceptance / completion checklist

- [x] `tasksCore` implements `AppCore` (views, ops, seed) with the snapshot extension; the named
      functions are exported for direct use.
- [x] The core's types carry no Context Manager ids; Context Manager's extension does, and the JSON
      is unchanged.
- [x] `BoardService` holds no tasks rule: it loads, links, overlays, writes, rebases by its own
      decision, and maps codes to statuses.
- [x] Moved tests pass in the core, the service's remaining tests pass, and each PR lists what moved.
- [x] The board harness answers its ops with the core over `docs/tasks/`, with no hand-written op
      handling left.
- [x] `describeAppCore` runs the tasks round trip over its fixtures.
- [x] Context Manager is green and the tasks walks were run after each adoption.
- [x] `npm run check` green here.

## Implementation plan

Three steps. Each is a surfaces PR and a Context Manager adoption, walked; later steps stack on
earlier ones.

1. **Projection.** The snapshot and facts, the three views, `resolveTasks`, the rebase helpers, the
   types split; Context Manager loads and overlays.
2. **Card ops.** `move`, `move-file`, `reorder-pool`, `set-title`, `set-tags`, `create-card`,
   `fix-references` and `referencesTo`; Context Manager links by path and writes changes.
3. **Manifest ops and create.** `edit-manifest`, `add-tag`, `create-stage-phase`, `set-current`,
   `close`, `seed`; the harness on the core throughout.

## Implementation notes

Three steps, each a surfaces PR and a Context Manager adoption, walked.

- **Step 1, projection:** #65, merged 2026-11-09 as `fe5110e`, adopted in context-manager#1093.
  `TasksSnapshot` is the contract's snapshot plus `projections` and `moves`; the views are board,
  stage and nav; the rebase helpers moved. The core's card, pool and housekeeping types lost the
  goods' ids.
  - **Departure:** housekeeping stays in the board and stage states, named by path, because the
    element counts it for Check-in (Jamie's OK). Only `goodId` moved out.
  - `rebaseMetadata` takes the host's `metadataOnly` verdict, since the formatter check stays with
    the host.
- **Step 2, card ops:** #66, merged 2026-11-10 as `af10590`, adopted in context-manager#1095. The
  card ops answer file changes or a refusal decided before any change, `tasksCore` implements
  `AppCore`, and `seed` came forward from step 3. The snapshot gained `created` and `inFlight`.
  - Two behaviour changes in Context Manager, both tested: an undo while the move's check-in PR is
    open is refused before any write, and an unreadable template is a 409
    `TASKS_TEMPLATE_UNAVAILABLE`.
  - `reorder-pool` and `fix-references` are left out of the round trip: the first regenerates
    `order.yaml` (the WAL's 2026-11-04 entry), and the second needs a pending move the fixtures
    lack.
- **Step 3, manifest ops:** #67, merged 2026-11-10 as `2618767`, adopted in context-manager#1101.
  `add-tag`, `edit-manifest` with its guards, `create-stage-phase`, `set-current` and `close`;
  `tasksCore` carries all twelve ops.
  - One rule fixed: a pending move hides its anchor only. Hiding the paths a card passed through hid
    any card created at one since; context-manager#1095 had worked around it.
  - The harness answers every op of the board and the strip with `tasksCore.apply` over in-memory
    files (`dev/workspace.ts`) and re-projects. The hand-built states became a hand-built folder
    (`dev/workshop.ts`) the core projects. It was checked with throwaway node and jsdom tests, not
    clicked through in a browser.
  - Three behaviour changes in Context Manager: a refused settings edit no longer links a tracked
    `tasks.yaml` first (tested); removing a column is refused when a linked card can't be read; an
    invalid create request is refused before the existing-instance check.
- Context Manager's service tests passed unchanged through all three steps and stay as the
  integration check; the rules also have core tests (`projection`, `cardOps` with 32,
  `manifestOps` with 24). Tests here went from 1,700 to 1,877.
- Every adoption was walked after `e2e:reset` and a scratch baseline: 01–27 and 29 passed each
  time. Walk 03 now waits for a drag's move to settle before the menu move (context-manager#1101),
  closing the 1B race.
