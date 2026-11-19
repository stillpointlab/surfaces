---
created: 2026-11-10T12:47:26-07:00
tags: [apps, host-contract]
---

# Inventory says zone in its URLs and its folders

Jamie, 2026-11-18, trying stage 5 in the local host: a zone's page is at
`#/app/house/inventory.yaml/room/cellar`. The URL should say zone, and the folder's name with it.
This seed was "Inventory's `zones/` folder" (stage 2's follow-ups, 2026-11-08), which had the
folder alone.

Where it stands:

- The code and the page say zone since stage 2 phase 6. Two names still say room, both kept on
  purpose then.
- **The URL.** `packages/apps/inventory/src/pages.ts` has the zone's page at `/room/:roomSlug`,
  Context Manager's URL at `8fa439ba`. Both hosts take the path from the module, so one change
  there moves both. Context Manager's API paths, bodies and error codes also say room.
- **The folder.** A repository keeps its zones in `rooms/` beside `inventory.yaml`
  (`INVENTORY_ROOMS_DIR` in `detection.ts`, ADR-0022's file format in Context Manager). The
  overview's empty state names `rooms/<zone>.yaml`, and the paths the app's ops write are under
  it.
- v1's export format keeps its `room` column.

What a spec would have to settle (the claude agent's list, not Jamie's):

- the URL: `/zone/:slug`, with `/room/:slug` redirecting for good so a kept link still opens.
  Whether Context Manager's API paths move in the same change or stay;
- the folder is a migration across existing repositories. Detection reads both `zones/` and
  `rooms/` for a while; a repository with both needs a rule. The move itself is a check-in or a
  one-off pull request in Context Manager, and in the local host a step the undo journal keeps;
- whether a new inventory is made with `zones/` from the day detection reads both;
- the file format's version: whether the folder's name is part of it (ADR-0022);
- the export's `room` column, which other tools may read.
