---
column: todo
created: 2026-11-08T00:43:23-07:00
tags: [apps, code]
---

# Spec: the inventory core says zone

_Phase 6, last. Jamie on the phase 6 plan: zone is the preferred term, and the move is the time to
rename where possible. [inventory-elements-in-cm](inventory-elements-in-cm.md) renames the new code;
this spec renames the core's names, which Context Manager imports. It lands after
[inventory-elements](inventory-elements.md) so the move stays a move._

## High-level goal

The inventory core's exported names, its state fields and its files say zone where they say room
today, and Context Manager uses the new names. What a repository or a user sees by name stays as it
is: the `rooms/` folder, the routes and API paths, and the export files. Users see no change.

## Related context

- The core already documents the split: its README says the application calls the groups zones, and
  `types.ts` notes that "the storage name stays legacy". The v2 CSV leads with a `zone` column and
  the v2 ZIP uses `zones/<slug>.csv`; v1 keeps `room` and `rooms/<slug>.csv`.
- Room names exported by the core today: `SharedInventoryRoom`, `SharedInventoryRoomSummary`,
  `SharedInventoryRoomState`, `InventoryRoomFile`, `RoomEntrySpan`, `RoomParseResult`,
  `RoomShapeScan`, `parseRoomFile`, `scanRoomShape`, `serializeRoom`, `slugifyRoomTitle`,
  `applyRoomTotals` and `roomSeedContent`. The state fields: `SharedInventorySpace.rooms`,
  `SharedInventoryRoomState.room`, and the dirty file `kind: 'room'`.
- Context Manager imports them in six files (the inventory service, its seed files, the project
  routes, the shared re-exports, the page and its test), and reads the state fields in those and in
  the check-in service and their tests.

## Technical requirement

1. **The core** (`packages/apps/inventory`):
   - Each exported name above becomes its zone form (`SharedInventoryZone`, `parseZoneFile`,
     `zoneSeedContent` and so on). No aliases under the old names: Context Manager is the only
     consumer, and it moves in the same step.
   - `room.ts`, `roomWriter.ts` and `roomSeed.ts` become `zone.ts`, `zoneWriter.ts` and `zoneSeed.ts`,
     with their tests.
   - The state fields become `space.zones`, `state.zone` and `kind: 'zone'`.
   - Internal names, comments, test names and the README follow, except where they name storage or
     output (below).

2. **What keeps the room name**, each with a comment where the code meets it:
   - the `rooms/` folder a manifest's zones live in (ADR-0022's file format, in repositories that
     already exist), and the path rules that find it;
   - the v1 CSV's `room` column and the v1 ZIP's `rooms/<slug>.csv`, which are export formats people
     already have;
   - Context Manager's route (`/room/:slug`), its API paths (`/rooms`, `/rooms/:slug/items`) and any
     error codes those return.

3. **Context Manager's adoption** (one PR there, after this merges): move the pin; switch every
   import and every state field to the new names, in the service, the routes that serialise states,
   the page, the shared re-exports and the tests; rename the inventory service's own room
   identifiers where they are the state's; the API, its schemas and its responses on the wire keep
   their paths. Run the inventory walks.

## Clarifications

- **Why the state fields change but the API paths do not.** The state is SSR'd JSON that only the
  page reads, and the server and the page change in one PR. The API paths are URLs that walks, tools
  and MCP clients may hold.
- **Why last.** Renaming during the move would mix a rename into the diff that should read as a
  move. As its own step it is a mechanical rename on both sides.

## Non-goals

- Renaming the `rooms/` folder, the routes, the API paths or the export files. A folder rename needs
  a migration across existing repositories and is recorded in the WAL as a seed-sized question.
- Any behaviour change.

## Acceptance / completion checklist

- [ ] No exported name, state field or file name in the core says room, apart from those in
      requirement 2, each commented.
- [ ] The core's tests pass with their names changed and nothing else.
- [ ] The Context Manager adoption is green, the wire API is unchanged, and the inventory walks were
      run.
- [ ] `npm run check` green here.

## Implementation plan

1. Surfaces PR: the rename in the core, its tests and README, and the elements' imports.
2. Context Manager PR: the adoption above, walked.
3. Phase close: the four cards done, WAL entries, changelog section.
