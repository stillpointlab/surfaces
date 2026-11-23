---
column: done
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
   adoption's step 1 deletes Context Manager's; the two entries close when it merges. _Done
   (context-manager#1242, merged 2026-11-20): both entries are closed._
4. **The other 58 entries,** in batches. None changes what Context Manager adopts. By where they
   are, roughly: the local host's server and page, the harness, the two apps' elements and
   shells, the check-in review, and the format packages (most of stage 4's carried entries).
   _Done in fourteen batches, the last on 2026-11-22
   ([#161](https://github.com/stillpointlab/surfaces/pull/161)). One entry is carried,
   undecided, to the next stage's review of the log: the harness's two ways to read._

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

7. **The drain's last task: Context Manager's walks, read against what the batches changed in
   shared elements,** before the pin moves (Jamie, 2026-11-21: the repin comes once the log is
   drained, so the walks' fixes are scheduled before it). Known so far:
   - **The board's dot** is on every card with an uncommitted change
     ([#156](https://github.com/stillpointlab/surfaces/pull/156)). Eight walks look at
     `.card-badge--dirty` (03, 06, 07, 08, 09, 10, 17 and 23), and five expect none on some
     card. One that edits a card's content, or moves it to another phase, and then expects
     no dot needs its expectation changed.
   - **The check-in review's buttons** are `aria-disabled` while it is busy, not `disabled`
     ([#154](https://github.com/stillpointlab/surfaces/pull/154)). A walk that waits on
     `disabled` needs the attribute.
   - **`<modal-dialog>`** draws no body when nothing in it shows
     ([#152](https://github.com/stillpointlab/surfaces/pull/152)); a walk that measures or
     clicks a dialog's empty body would notice.

   The walks' edits go in the pin's own pull request in Context Manager, in the commit that
   moves the pin, as the adoption's did.

   _Read on 2026-11-22, with the log drained, against everything that changed in the shared
   packages since Context Manager's pin (`21d3385`; 33 source files). No walk's expectation has
   to change by the reading; the walks themselves, run at the pin, decide._
   - **The board's dot.** The five expectations of no dot are on a card that is tracked again
     (06, 08, 10), a card whose changes were discarded (09), and a whole board after a refresh
     with nothing uncommitted (23). None follows an edit or a move to another phase. Walk 23's
     is the one to watch: it counts every dot on the board, so a card that is linked and
     differs from its latest version would now show there.
   - **The review's buttons.** No walk waits on a review button being `disabled`. The walks'
     `toBeDisabled` and `toBeEnabled` are on the board's Refresh, the file page's Publish and
     inventory's item dialog.
   - **A dialog with no body.** No walk measures or clicks a dialog's body.
   - **Also read, with nothing found:** the review's rows are read by their text and by
     `data-label="new"`, never by position, so tasks' new group order
     ([#154](https://github.com/stillpointlab/surfaces/pull/154)) does not show; every walk
     fills the review's title, so a default title would not either; inventory's badge still
     reads "new" for a new zone ([#159](https://github.com/stillpointlab/surfaces/pull/159)
     added "moved"); the download link keeps `is-disabled`.
   - **For the pin itself, not the walks:** `<checkin-review>` now depends on
     `@stillpointlab/spl-icon-component`, so Context Manager's lock file changes with the pin;
     and its unit tests are the check on `tasksModule.hostOps` losing two names (item 1).

## Non-goals

- New features. An entry that wants one becomes a seed.
- The seeds already in the pool, but for the two defects above.

## Acceptance / completion checklist

- [x] Items 1, 2, 5 and 6 merged here, each with a test that fails without it, and Context
      Manager's pin moved past them with both walk suites.
- [x] Item 3's two entries closed by the adoption's first pull request.
- [x] Every entry in the follow-up log has its line, each from a ruling of Jamie's.
- [x] The stage's changelog lists what was fixed, seeded and dropped.

## Implementation plan

1. After the adoption's first pull request merges: one pull request here for items 1 and 2.
2. Items 5 and 6, a pull request each.
3. The remaining entries in batches, a pull request for each batch's fixes and seeds.
4. Item 7: the walks read against the batches' changes to shared elements.
5. One pin move in Context Manager for everything the phase changed, walked, with the walks'
   edits from item 7.

## As built

_Added 2026-11-22, at the phase's close. The record of each entry is its line in the
[follow-up log](../../../../devlogs/stage5/followups.md); the record of each batch is its pull
request. This is what the plan above did not say._

- **The count.** The log held 72 entries at the end, one more than when phase 6 opened. 51
  were fixed, 12 closed with a reason, eight moved to seeds and one is carried, undecided, to
  the next stage's review of the log: the harness's two ways to read. (This line first said 50
  and 13; a recount from the log on 2026-11-22 corrected it.)
- **Fourteen batches.** The first two were ruled before the adoption (#136 to #138, and one
  entry that could not be reproduced); batches 3 to 14 are
  [#149](https://github.com/stillpointlab/surfaces/pull/149) to
  [#161](https://github.com/stillpointlab/surfaces/pull/161), less #153, which closed phase 6.
- **Batches stayed at five entries** (Jamie, 2026-11-21). A close, a carry or a seed takes
  more of his thought than a fix, so those came with fuller reasoning, second-order effects
  included.
- **Two pin moves, not one.** Items 5 and 6, and three fixes Context Manager's stage 7 asked
  for, went with the adoption's pin (`21d3385`) in phase 6. Items 1 and 2 and the batches went
  with the last one (`452cba4`, context-manager#1272).
- **Additions to the contracts,** each optional or additive, each in its pull request's
  description: `HOST_PATH_INVALID` in the port's refusal codes (#151); `defaultTitle` on a
  shell's check-in (#154); `movedFrom` on an inventory dirty file (#159); `applyPath` on a
  format descriptor, and `answers: 'missing'` on a page case (#160). The first is the one a
  port must change for: a port that passed the suite fails four cases until it splits the two
  codes.
- **The walks' reading (item 7)** found nothing to change, and the walks agreed: at the pin
  both suites passed, every step on its first run (inventory 38 of 38; tasks 01 to 27, 29 and
  30), walk 23 among them.
- **One step was added to Context Manager's walk 30,** for a fix made there during the close:
  a locked app file's preview says the app's files are locked (context-manager#1269).
- **A seed arrived from outside the drain** at its end: a title for a Tasks app (#162), from
  Context Manager's stage 8.
