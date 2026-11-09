---
column: todo
created: 2026-11-08T14:34:29-07:00
tags: [apps, host-contract, code]
---

# Spec: inventory's rules live in its core

_The [app rules brief](../briefs/app_rules.md), desired outcome 1, and the inventory half of outcome 6. First in phase 7: the contract's `project` and `apply` are named afterwards, against the functions
this spec creates._

## High-level goal

The inventory core turns a space's files into the states the elements render, and turns each op
into the file changes it makes or a refusal. Context Manager's `InventoryService` loads the files,
calls the core, lays its own facts over the state, and writes what the core returns. The harness
runs the inventory elements on the same functions, with the files in memory.

## Related context

- Decisions on the brief: the core receives plain data (paths and contents with drafts laid over,
  plus the few host facts a rule reads); nothing assumes Context Manager is the only host; the
  create dialog stays in Context Manager.
- Today the rules sit inside `inventory.service.ts` (about 1,200 lines) between I/O calls:
  - `loadSpace` and `resolveZone` assemble the space: detection, the manifest's schema (with v1
    recovery), each zone parsed and scanned for writability, per-item read-only reasons, duplicate
    ids demoted, totals.
  - `addItem`: title, field validation and visibility, required fields, field order, the
    space-wide id.
  - `updateItem`: the same per field, extras, the repair boundary, `patchItem`.
  - `deleteItem`, `addZone` (slug, `rooms/` path, collision), and `createInventory` (manifest seed
    validation, folder, zone names, collisions and ancestors).
- The harness re-implements the assembly in `dev/example.ts` and hand-writes each op in
  `dev/host.ts`.
- The elements' ops (ADR-0038): `add-zone {title}`, `add-item {path, item}`,
  `update-item {path, id, changes}`, `delete-item {path, id}`, `link-editor` (the host's alone).

## Technical requirement

1. **What the core takes: an inventory snapshot.**
   - The manifest path, the paths the host can see (its tree and the files it created that have
     no upstream yet), and the contents of the space's files, with drafts already laid over. A
     file whose content the host could not read is `null`.
   - Taken paths: the paths a new file may not use beyond those it can see. In Context Manager
     these are every good of the connection.
   - Plain data only: no callbacks, goods, users or connections. The core's `detectInventoryAt`
     already tells a host which files to read.

2. **Projection.**
   - One function projects the space and one projects a zone by slug. They return what
     `getSpaceState` and `getZoneState` assemble today, minus the host's own facts.
   - The host's facts are parameters: whether the space is enabled, the dirty files, and a label
     that overrides the manifest's (Context Manager's disambiguation between sibling spaces).
   - Byte for byte the same output as today for every case the service tests cover: v1 recovery,
     an invalid schema, unreadable and unparseable zones, read-only zones and items, duplicate ids,
     totals and legacy aliases.

3. **Ops.** One function per op, taking the snapshot and the op in the elements' shapes.
   - Ops: `add-zone {title}`, `add-item {path, item}`, `update-item {path, id, changes}`,
     `delete-item {path, id}`. Zones are named by path, as the elements name them.
   - Each returns the changes or a refusal. A change is `{ path, content }`, marked when it
     creates a file. `add-zone` also returns the new slug, and `add-item` the new id.
   - Creating the inventory is a fifth function. It takes the create input and the taken paths,
     and returns the files to seed or a refusal: manifest validity, the root-folder refusal, zone
     names and duplicates, and collisions with a taken path or any of its ancestors.
   - Refusals are `Result` failures with today's codes and messages. Context Manager keeps a table
     from code to HTTP status, so every status stays as it is.

4. **Host ids leave the core's types.**
   - The ids that name a Context Manager good go to a Context Manager extension of the shared
     types: a zone's `goodId` and `goodPublicId`, the state's `manifestGoodPublicId`, and a dirty
     file's `goodId`.
   - The elements read none of these. The page does, and the JSON keeps them.

5. **Context Manager's service becomes host work.**
   - **Loading:** it reads the snapshot (drafts first, as now).
   - **Host-only rules:** it links a tracked zone on its first mutation, checks the enable row,
     the scope overlap with other views and a resumed create, and disambiguates labels.
   - **Calls and overlays:** it calls the core and lays its ids and dirty files over the result.
   - **Writes:** a change to an existing file is saved as a draft; a new file is seeded as an
     app-only good. The API, its responses and the walks are unchanged.

6. **The harness runs on the core.**
   - `dev/example.ts` projects the example with the core's functions instead of its own copy.
   - `dev/host.ts` keeps the files in memory and answers each op with the core's function. It
     writes the changes back into memory and re-projects, marking changed files dirty.
   - The hand-built states stay for cases a folder cannot show (a read-only file, a disabled
     space).

7. **Tests follow the rules.**
   - Service tests that test a rule move to the core beside it, unchanged but for their setup.
   - The service keeps tests for loading, linking, overlays, writes and the status table.
   - The PR lists each moved test file.

## Clarifications

- **Why not `project` and `apply` yet.** The brief names them against real functions. This spec
  builds the functions with inventory's own types; the next spec lifts the shapes into
  `common-format/app` and adds the round trip to `describeAppCore`.
- **Why the elements' op shapes.** A harness host, and later a stand-alone host, can hand an
  element's op straight to the core. Context Manager's routes translate their slug-based URLs to a
  path, as `inventoryOps.ts` does the reverse.
- **Why taken paths are separate from visible paths.** Detection sees the tree plus app-created
  files. A collision must also count files the host knows that detection does not show (an imported
  good the tree has not caught up with).

## Non-goals

- `project`, `apply`, snapshot or change types in `common` (next spec).
- Tasks, the board, or the create dialog's UI.
- Any change to codes, messages, statuses, the API or the stored files' bytes.
- Check-in, refresh, linking or drafts moving out of Context Manager.

## Acceptance / completion checklist

- [ ] The core exports the snapshot type, both projections, the four op functions and the create
      plan, all DOM-free and host-free.
- [ ] The core's types carry no Context Manager ids; Context Manager's extension does, and the JSON
      is unchanged.
- [ ] `InventoryService` holds no inventory rule: it loads, links, overlays, writes and maps codes
      to statuses.
- [ ] Moved tests pass in the core; the service's remaining tests pass; the PRs list what moved.
- [ ] The harness projects the example with the core and answers ops with it, in memory, with no
      hand-written op handling left.
- [ ] Context Manager is green and the inventory walks were run.
- [ ] `npm run check` green here.

## Implementation plan

1. Surfaces PR: the snapshot, projections, ops and create plan, with the moved tests; the types
   split; the harness on the core.
2. Context Manager PR: the service as host work, the extension types, the status table, walked.
