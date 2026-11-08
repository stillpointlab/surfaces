---
column: todo
created: 2026-11-08T14:34:29-07:00
tags: [apps, host-contract, code]
---

# Spec: the board's dialogs move into the element

_The [app rules brief](../briefs/app_rules.md), desired outcome 4. Independent of the rules
extraction: the dialogs ask for ops that Context Manager's page answers with today's endpoints, as
the board's moves have since [transport-blind-task-board](../../phase5/specs/transport-blind-task-board.md).
When [tasks' rules](../briefs/app_rules.md) land, a host can answer the same ops with the core._

## High-level goal

`<spl-task-board>` owns its settings, new-card, title and tags dialogs. It renders them inside
itself and asks its host for each change as an op. Context Manager's page answers the ops and no
longer holds these dialogs or their markup. Users see no change, and the harness can drive every
dialog.

## Related context

- Today the page owns all four (ADR-0037 §4 deferred them):
  - **Settings** (`board-settings-dialog`, `boardSettings.ts`, about 290 lines, 11 tests) opens
    from the page's ⚙ button. It edits columns, kinds and the default and done columns through
    `POST …/manifest/edit`, one op per change.
  - **New card** (`new-brief-dialog`, about 70 lines in `task-board.ts`) opens on the board's
    `brief-request` and posts `…/briefs {path, title, kind}`.
  - **Title** (`set-title-dialog`, about 50 lines) opens on `set-title-request` from a card's ⋯
    menu. It links a tracked file, then posts `…/board/title {goodId, title | null}`.
  - **Tags** (`set-tags-dialog`, about 95 lines) opens on `set-tags-request`. It adds to the
    registry at once (`…/tags {tag}`), then posts `…/board/tags {goodId, tags}` on Save.
- The board already holds what they read: columns, kinds, default and done columns, the tag
  registry, and each card's title and tags.
- New card, title and tags have no page unit tests; walks 03, 04, 21, 22, 24 and 28 cover them.
- Check-in stays on the page (jobs, a stuck timer, `goodId`s).

## Technical requirement

1. **Four dialogs in the element**, each a `<modal-dialog>` the element creates once, with markup
   through `common-format/html`.
   - They keep today's ids, classes, labels, limits and copy, so the walks need no selector
     changes. Examples: `#new-brief-title`, `#set-title-input`, `#tag-options`, `#new-tag-input`,
     `#board-settings-status`.
   - **Settings** opens through a public `openSettings()` method. The ⚙ button stays in the page's
     top bar and calls it, and the element disables nothing the page shows.
   - **New card, title and tags** open from the board's own buttons and menu items. Their
     `*-request` events go away.
   - Title and tags stay unavailable in stage view, as today.

2. **New ops**, by path like the board's others, answered by the page with today's endpoints:

   | Op              | Detail                                | Reply                    |
   | --------------- | ------------------------------------- | ------------------------ |
   | `edit-manifest` | one manifest edit op (today's union)  | `{ manifest, warnings }` |
   | `create-card`   | `boardPath`, `title`, `kind`          | `{ card }`               |
   | `set-title`     | `path`, `title` (or `null` to remove) | `{}`                     |
   | `set-tags`      | `path`, `tags`                        | `{}`                     |
   | `add-tag`       | `tag`                                 | `{ tags }`               |
   - The page links a tracked file before `set-title` and `set-tags`, as it does for moves.
   - The page maps `DRAFT_SAVE_IN_PROGRESS` to today's message in its failure.
   - After `edit-manifest`, `create-card`, `set-title` and `set-tags`, the page refreshes the
     board as it does today.

3. **Behaviour stays as it is.**
   - Settings: changes save on change, one in flight at a time; an add line's id fills from
     `slugifyTaskId` until edited; failures appear in its status line and the rows snap back.
   - New card, title and tags close before their op and report a failure as a notification,
     today's notices included ("Created …", "Title updated.", "Tags updated.").
   - A tag added in the tags dialog is checked and kept across re-renders.

4. **The element's tests cover the dialogs**, answering ops instead of mocking `apiFetch`.
   - `boardSettings.test.ts`'s 11 cases move to the element.
   - New card, title and tags get element tests for the first time: open, validate, op detail,
     failure, and stage view.
   - The page's op answers are tested in `boardOps.test.ts`.

5. **The harness** answers the new ops in its in-memory host. Its fixtures open each dialog,
   including a refused op.

## Clarifications

- **Why the ⚙ button stays on the page.** It sits in the page's top bar beside Refresh, which
  stays. A method keeps the chrome where it is without the element reaching outside itself.
- **Why behaviour is kept as-is**, including closing before the op. Keeping a dialog open on
  failure, as the inventory item dialog does, would be better, but it is a change users see and the
  walks would need to check. It can be its own step once the dialogs live here.
- **The close-phase dialog** belongs to the tab strip, whose button opens it and whose state it
  reads: [tasks-nav-element](tasks-nav-element.md).

## Non-goals

- Check-in, refresh, or the create-tasks dialog.
- Any endpoint, schema or response change.
- Moving manifest-edit or card rules into the core (the tasks rules spec).

## Acceptance / completion checklist

- [ ] The four dialogs render inside `<spl-task-board>` through `html`, and the page holds none of
      their markup or logic.
- [ ] The five ops are answered by the page with today's endpoints, with linking and the draft
      message as today; the three `*-request` events are gone.
- [ ] Element tests cover all four dialogs; the page's answers are tested.
- [ ] The harness opens every dialog and answers its ops.
- [ ] Context Manager is green and the tasks walks were run, with no selector changes.
- [ ] `npm run check` green here.

## Implementation plan

1. Surfaces PR: the dialogs, ops, tests and harness answers.
2. Context Manager PR: move the pin, answer the ops, delete `boardSettings.ts` and the three dialogs'
   markup and handlers, call `openSettings()`, walked.
