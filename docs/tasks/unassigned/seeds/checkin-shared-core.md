---
created: 2026-11-10T14:46:34-07:00
tags: [apps, host-contract, code]
---

# The check-in's shared core

Context Manager's two app check-ins run the same five steps:

1. reload the dirty set, dropping anything clean or changed since the click;
2. read GitHub's head and tree;
3. check for conflicts, all or nothing, with the user's own merged check-in exonerated;
4. make one commit and one PR, guarded by the expected parent;
5. publish in the recoverable order: stamp, publish, stamp the version.

Inventory's (506 lines) is that and little more. Tasks' (724 lines) adds:

- for moved cards, both paths in the conflict check, the old path deleted in the same commit, and a
  move that already merged skipped;
- a moved card with no draft, rebuilt from its latest version;
- conflicts that differ only in frontmatter, labelled for the board's one-click resolve;
- choosing which cards go in.

Stage 3 gives them one endpoint and one job type, keyed by app, handing off to both services
unchanged (Jamie, 2026-11-10: option C). This seed is the next step, option A: one check-in service
runs the five steps for any app, with hooks for what tasks adds. The `move` hooks are the generic
host's own by then. The tasks walks lean heavily on check-in, so this is a careful step.

From the [generic app host brief](../../stage3/phase1/briefs/generic_app_host.md).
