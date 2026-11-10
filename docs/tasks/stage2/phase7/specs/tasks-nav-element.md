---
column: done
pr: 64
completed: 2026-11-09
created: 2026-11-08T14:34:29-07:00
tags: [apps, host-contract, code]
---

# Spec: the tab strip becomes an element

_The [app rules brief](../briefs/app_rules.md), desired outcome 5, with the close-phase selection
from outcome 4. Independent of the rules extraction: the strip renders the tasks core's existing
nav projection (`buildTasksNav`), and its changes are ops Context Manager's page answers with
today's endpoints._

## High-level goal

The stage/phase tab strip is `<spl-tasks-nav>` in `@stillpointlab/tasks-app/element`. It renders
from the nav state and asks its host to create a phase or stage, set the current phase, and close a
phase or stage. The close dialog comes with it. Context Manager's page supplies the state and the
links, answers the ops, and decides where to navigate. Users see no change.

## Related context

- Today:
  - `renderTasksNavStrip` (`tasks-nav.shared.ts`, about 100 lines) builds the strip as a string,
    which the server embeds in `task-board.ejs`.
  - `tasksNav.ts` (about 310 lines, 12 tests) binds it and re-renders it after a refresh from
    `GET …/nav`. It also owns the close dialog: its datasets on `#close-dialog`, its load of the
    pointer phase's board, and the `POST …/lifecycle/close` call.
  - Three tests pin the server-rendered and client-rendered strings to each other.
- What the strip renders:
  - stage tabs (links), the active tab's phase select (with "+ New phase"), "+ stage", and the
    "Boards…" select for other boards;
  - "Close…", which opens the page's options menu with "Close phase" and "Close stage";
  - the ★ current marker, or "Set current".
- What its controls call:
  - `POST …/lifecycle/create {kind, stage?}`, then navigate to the new phase;
  - `POST …/pointer {stage, phase}`, then reload;
  - `POST …/lifecycle/close {kind, moveGoodIds, movePaths}`, then navigate to the target.
- Walk selectors: `.tasks-tab-filter`, the "+ stage" button, `.tasks-set-current`,
  `.tasks-current-marker`, `.tasks-close` with the menu items, and `.tasks-nav` (walks 02, 04, 11,
  22, 25 and 29).

## Technical requirement

1. **`<spl-tasks-nav>`**, light DOM like the board, markup through `common-format/html`.
   - **State:** `setState({ nav, current, currentPointer, currentPointerPath, doneColumn })`,
     which is today's nav state plus the page's selection.
   - **Links:** a setter takes `stage(n)`, `phase(n, m)` and `board(path)` hrefs.
   - **Markup:** it renders today's markup: the same elements, classes, labels, `aria-*`, order and
     rules (the ★ only on the pointer, no Set current on a gap phase).
   - **Styles:** the strip's rules move with it onto tokens. The page keeps its grid placement and
     the top bar's own buttons.

2. **Ops**, answered by the page with today's endpoints:

   | Op                   | Detail           | Reply                                  |
   | -------------------- | ---------------- | -------------------------------------- |
   | `create-stage-phase` | `kind`, `stage?` | `{ stage, phase }`                     |
   | `set-current`        | `stage`, `phase` | `{}`                                   |
   | `close-candidates`   | `path`           | `{ cards: [{ path, title, column }] }` |
   | `close`              | `kind`, `paths`  | `{ target: { stage, phase }, moved }`  |
   - `close-candidates` lists the pointer phase's cards, which the page loads with today's board
     request.
   - `close` names cards by path. The page turns them into the `moveGoodIds` and `movePaths` the
     endpoint takes.

3. **Requests**, for what the page owns:
   - **`navigate {href}`:** after a phase select, a board select, a create or a close, with the
     href from the links.
   - **`reload-request`:** after Set current, which reloads today.
   - **`notification`**, as the board raises it.
   - **"Close…":** raises the page's `open-options-menu`, as the board's card menus do, and handles
     the selection itself.

4. **The close dialog moves into the element** with its markup, ids and copy.
   - It reads the pointer and the done column from the state, not datasets.
   - Its card list and "Loading…", "Could not load the phase board." and "No unfinished cards —
     clean close." come from `close-candidates`.

5. **The page sets the state.**
   - The server embeds the nav state as JSON beside the element, as it does the board's.
   - After a refresh the page calls `setState`, and keeps `reconcileLocation`.
   - `renderTasksNavStrip`, `tasks-nav.shared.ts`, the strip's string parity tests, and most of
     `tasksNav.ts` go away.

6. **Tests and harness.**
   - Element tests carry the strip's rules (active tab, ★, Set current, gap phases, the Boards
     bucket) and every control's op or request. `describeAppElementContract` covers the element.
   - The page's answers are tested.
   - The harness mounts the strip from this repository's own `docs/tasks/` nav and from
     hand-built cases, with the in-memory host answering its ops.

## Clarifications

- **Why the close dialog comes here, not with the board's dialogs.** Its button is the strip's, and
  it reads the pointer and the done column from the nav. The board raises nothing for it today.
- **Why no server-rendered string.** The board already renders on the client from embedded JSON;
  the strip does the same. One renderer removes the parity tests that kept two in step.
- **Why navigation is a request.** Where a phase lives is the host's URL scheme. The element knows
  links, not routes, as the inventory elements do.

## Non-goals

- Any endpoint, route or URL change, or how a refresh runs.
- Moving the close or pointer rules into the core (the tasks rules spec).
- The board's own dialogs ([board-dialogs](board-dialogs.md)).

## Acceptance / completion checklist

- [x] `<spl-tasks-nav>` renders today's strip from state and links, with markup only through
      `render`.
- [x] The four ops and the requests are answered or handled by the page as today, and the close
      dialog lives in the element.
- [x] `tasks-nav.shared.ts` and its parity tests are gone; the page keeps only state, answers and
      navigation.
- [x] Element tests and the contract suite pass; the harness mounts the strip with ops answered.
- [x] Context Manager is green and the tasks walks were run, with no selector changes.
- [x] `npm run check` green here.

## Implementation plan

1. Surfaces PR: the element, its styles, tests and harness fixtures.
2. Context Manager PR: move the pin, embed the nav state, answer the ops, delete the string
   renderer and the close dialog's page code, walked.

## Implementation notes

- Landed in #64, merged 2026-11-09 as `51e99f7`. `<spl-tasks-nav>` renders in light DOM through
  `html`, from `setState` and `links`. Its markup was checked against Context Manager's
  `renderTasksNavStrip` in 7 cases, escaping included, and matched after DOM normalisation.
- The four ops (`create-stage-phase`, `set-current`, `close-candidates`, `close`) and the requests
  (`navigate`, `reload-request`, `notification`, `open-options-menu`) keep today's notices. The close
  dialog lives in the element and stays attached when the strip re-renders.
- 27 element tests, with `describeAppElementContract`. Tests went from 1,673 to 1,700. The harness
  puts the strip above the board in every tasks fixture.
- Context Manager adopted it in context-manager#1083, merged 2026-11-09, deleting
  `tasks-nav.shared.ts`, its parity tests and the strip's page styles. The tasks walks passed 01–27
  and 29 in one run with no selector changes.
