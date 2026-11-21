---
column: todo
created: 2026-11-20T16:10:00-07:00
tags: [apps, host-contract, dev-tooling, code]
---

# Spec: drain the stage's follow-ups

_Before this arc closes (Jamie, 2026-11-20): drain what the
[follow-up log](../../../../devlogs/stage5/followups.md) holds, stage 4's carried entries
included, by fixing, seeding or carrying each one. Stage 5, phase 7, after Context Manager's
adoption ([context-manager-adopts-apps](../../phase6/specs/context-manager-adopts-apps.md)), as
stage 3's phase 6 was._

## High-level goal

At the stage's close the follow-up log is empty: every entry has a line under it saying where it
went, and each of those is Jamie's ruling.

## How it runs

- **A few entries at a time,** so each ruling is a judgement and not a signature. The claude agent
  puts a batch forward with a recommendation for each; Jamie rules; the fixes land as small pull
  requests, each closing its entries in the log.
- **A ruling is one of:** fix now; a seed in the pool, ranked; carried to a named phase; closed
  with the reason (done elsewhere, could not be reproduced, by design).
- **An entry's line** is a sub-bullet under it: "Closed", "Moved" or "Carried", the date, whose
  ruling, and the pull request or the seed.

## Before the adoption

The log held 71 entries when phase 6 opened, 19 of them carried from stage 4. The entries that
touch what Context Manager adopts were ruled on first, so that its pin moves once:

- The two app packages' builds split, and `tooling/tsup.ts` carries the setup
  ([#136](https://github.com/stillpointlab/surfaces/pull/136); three entries).
- `meta.create.subject`, and two leftovers removed
  ([#137](https://github.com/stillpointlab/surfaces/pull/137); three entries).
- The apps' "repository" and "PR…" are a seed,
  [the host's words in an app](../../../unassigned/seeds/the-hosts-words-in-an-app.md)
  ([#138](https://github.com/stillpointlab/surfaces/pull/138); two entries).
- The md editor's cursor in the frontmatter could not be reproduced (one entry).

## The items

1. **`tasksModule.hostOps` names two ops a shell answers itself,** `refresh-stage` and
   `close-candidates`. Drop them once Context Manager mounts the shell, which the adoption's
   first pull request does. The bare elements' fixtures in the harness answer them by hand
   today and need another way. _Done ([#148](https://github.com/stillpointlab/surfaces/pull/148)):
   `TASKS_SHELL_OPS` names the two. The fixtures answer them by hand still, which never read
   the module's list, so they needed no other way._
2. **Tasks' pages read a stage or phase with `parseInt`,** so `/stage/3x` opens stage 3. Tighten
   it once Context Manager serves the module's pages, so the two hosts change together. _Done
   ([#148](https://github.com/stillpointlab/surfaces/pull/148)): digits alone, with no leading
   zero._
3. **Two copies of each app's bounds, pages and copy,** here and in Context Manager. The
   adoption's step 1 deletes Context Manager's; the two entries close when it merges.
4. **The other 58 entries,** in batches. None changes what Context Manager adopts. By where they
   are, roughly: the local host's server and page, the harness, the two apps' elements and
   shells, the check-in review, and the format packages (most of stage 4's carried entries).

Two defects join the phase (Jamie, 2026-11-20). They were found in Context Manager during its
stage 7, in elements that live here, and arrived as seeds
([#140](https://github.com/stillpointlab/surfaces/pull/140)). They are not log entries, and each
seed leaves the pool when its fix lands:

5. **A changed block comes back with its brackets escaped**
   ([seed](../../../unassigned/seeds/brackets-escaped-in-a-changed-block.md)). The narrow fix:
   the md serializer leaves `[ ]` and `[x]` alone at the start of a list item, and escapes a
   bracket only where it would otherwise start a link or an image. Task items as nodes of their
   own, with a checkbox to click, are a feature and stay in the seed.
6. **A dialog keeps Tab inside it** (the seed `a-dialog-keeps-tab-inside`, which the fix removes:
   [#144](https://github.com/stillpointlab/surfaces/pull/144)). The defect was read from the
   code and not seen in a browser, so the first step is a test that fails. Then: read the
   focused element down through the shadow roots, and trap with a sentinel at each end of the
   dialog in place of a list of focusable elements, which covers a slotted component with a
   shadow root of its own.

Items 1, 2, 5 and 6 need a pin move in Context Manager after they land, with its walks.

## Non-goals

- New features. An entry that wants one becomes a seed.
- The seeds already in the pool, but for the two defects above.

## Acceptance / completion checklist

- [ ] Items 1, 2, 5 and 6 merged here, each with a test that fails without it, and Context
      Manager's pin moved past them with both walk suites.
- [ ] Item 3's two entries closed by the adoption's first pull request.
- [ ] Every entry in the follow-up log has its line, each from a ruling of Jamie's.
- [ ] The stage's changelog lists what was fixed, seeded and dropped.

## Implementation plan

1. After the adoption's first pull request merges: one pull request here for items 1 and 2.
2. Items 5 and 6, a pull request each.
3. The remaining entries in batches, a pull request for each batch's fixes and seeds.
4. One pin move in Context Manager for everything the phase changed, walked.
