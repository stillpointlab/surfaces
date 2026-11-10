---
title: 'Card move undo strands retargeted references'
tags: [code, apps]
created: 2026-08-14T22:45:57-07:00
---

- undoing a card's file move AFTER applying the inbound-reference fix strands those links: the fix
  retargeted them at the interim location, but undo clears `movedFrom` (and `viaPaths`) entirely, so
  no pending move remains for the scan to key on — links silently point at a path that will never
  exist
- fix shape: offer the reference scan on undo too, using the departure path before `movedFrom` is
  cleared
- from stage 3 WAL (2026-07-15, chained-move reference fix PR #479)
- Moved from Context Manager's backlog pool, 2026-11-10.
