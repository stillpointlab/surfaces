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

## Also: a path a card only passed through

From stage 5's follow-up log (host-runner, 2026-11-14), moved here on 2026-11-22. Jamie: a
seed is fine, "but this one is borderline IMO", so it may be taken before the rest of this
card.

- a pending move keeps the path a card started at and not the paths it passed through, in the
  local host and the harness as in tasks' `fromChanges`: git reports one move, from the first
  path to the last
- the sequence that strands a link: move a card, apply the reference fix (links now point at
  the second path), then move it again before a check-in. The next scan looks for the first
  path alone, and the links to the second are left
- Context Manager keeps the paths between (`viaPaths` above), so it finds them; a host that
  knows only files does not
- fix shape (the claude agent's, not Jamie's): the host keeps a record of an instance's pending
  moves, as the local host's journal already knows each step's moves, and hands the paths
  between to `fromChanges`; or the scan also looks for links to a path where no file is
- cost while it waits: a link that points nowhere, visible in the file and fixable by hand
