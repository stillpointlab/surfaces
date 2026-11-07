---
column: in-progress
created: 2026-11-07T14:51:39-07:00
tags: [apps, host-contract, code]
---

# Spec: the task board asks its page for every op

_The [apps breakout brief](../../phase1/briefs/apps_breakout.md), desired outcome 5, second half: the
board is made transport-blind in Context Manager first. The work is a Context Manager PR; this spec
names only what it needs. It needs [app-contract](app-contract.md) on the pin._

## High-level goal

`<spl-task-board>` in Context Manager stops fetching. Each of its ten fetches becomes an op asked
through `requestOp`, keyed by path, and the task board page answers them with the API calls the
element makes today. The element no longer knows the API, the project, the connection or any
`goodId`. Users see no change.

## Related context

- Context Manager: `src/client/components/task-board/` (the element, 1,439 lines, and its 60 tests),
  `src/client/pages/task-board/` (the page script, `tasksNav`, `boardSettings`, `refreshButton`, the
  EJS shell).
- The element half of the contract: [app-contract](app-contract.md), requirement 5.
- The board renders optimistically and rolls back on failure, one move at a time (the review's M11
  latches). Those rules stay in the element.

## Technical requirement

1. **The ops.** The element's fetches become these ops; each reply is what the endpoint answers today.

   | Today (the element fetches)         | Op                                          | Reply                   |
   | ----------------------------------- | ------------------------------------------- | ----------------------- |
   | `POST board/move`                   | `move { path, column }`                     | `{ card }`              |
   | `POST board/move-file` (2 places)   | `move-file { path, target }`                | `{ card }`              |
   | `POST pool/order`                   | `reorder-pool { paths }`                    | `{ pool }`              |
   | `POST board/resolve`                | `resolve { path, mode }`                    | `{ card }`              |
   | `POST links/scan`                   | `scan-references { path }`                  | `{ references: paths }` |
   | `POST links/fix`                    | `fix-references { path, referencingPaths }` | `{ fixed }`             |
   | `GET file`                          | `read-file { path }`                        | `{ content }`           |
   | `GET stage-state`                   | `refresh-stage { stage }`                   | `{ stage }`             |
   | `POST import` (link a tracked card) | none: the page links on its side            |                         |

   A failure carries the endpoint's error `code` and `message`, so the element's messages, including
   the special case for `DRAFT_SAVE_IN_PROGRESS`, are unchanged.

2. **Paths inside the element.** A card's identity is its path. Selection, the in-flight latches,
   lookups, row membership and the card menu's target are all keyed by path. A `move-file` reply
   carries the card's new path, and the element replaces the card it moved at the old one. The
   element still renders cards whose state has a `goodId`, but never reads it.

3. **Requests stay events, by path.** `set-title-request`, `set-tags-request`, `brief-request` and
   `checkin-request` keep their names, with `path` where they carried `goodId`. The check-in request
   lists cards and the order file by path. Two new requests replace the element's own navigation:
   - `open-card { path }` for a double-click on a card and for a tracked preview's "Edit in app";
   - the page links the file first if it is tracked, then navigates as it does today.

   `markCheckinInFlight` takes paths.

4. **The page answers.** The page script calls `answerOps` on the board.
   - It maps each op to today's endpoint, keeping a path-to-`goodId` index from the latest state it
     set.
   - An op on a tracked card (no `goodId`) links the file through the import endpoint first, which is
     what the element did on a tracked drag.
   - The link-references fix maps the scan's paths back to goods on the page.
   - The API, its schemas and its responses do not change.

5. **State reaches the element only through its setters.** The EJS shell moves the server's JSON out
   of the element into sibling scripts. The page reads them and calls `setState` or `setStageState`
   once the element is defined. The element drops `parseJsonScript` and the `project-public-id`,
   `connection-public-id` and `instance-public-id` attributes. The pool's collapse preference is keyed
   by a `storage-key` attribute the page sets.

6. **Ready and errors.** The element implements `ReadyElement` through `createReadyGate` from `common-format/app`, settling after its first render with state. It reports errors through that entry's `reportError`, and the page routes them to Context Manager's reporter with `setErrorHandler`, as the digital-good page does for the formats.

7. **Tests.**
   - The element's tests answer ops with `answerOps` instead of mocking `apiFetch`, and keep every
     behaviour they check: optimism, rollback, latches, the stage view's settle, the reference fix.
   - The page gets tests for its op answers: each op to its endpoint, the link-on-demand path, and
     an API error becoming a failure with the same code.
   - The element passes `describeAppElementContract`.

8. **ADR-0037**, the host side: the task board talks to its page in ops keyed by path. Ids, linking
   and the API are the page's. The element is on its way to surfaces.

## Clarifications

- **Why this lands in Context Manager before the move.** The rewrite is the risky part, and it is
  walked with the element where it runs. The move ([task-board-element](task-board-element.md)) is
  then only packaging.
- **Page-level UI stays in Context Manager.** It answers requests from the element and lives in the
  page, not the element: the nav strip and its close-phase dialogs, board settings, the refresh
  button, the check-in dialog and the new-card, title and tags dialogs. The brief keeps page chrome
  with the host. Moving any of it is a later question, recorded in the WAL.
- **`window.confirm` stays in the element** (take-latest, the link fix). It is the browser's, not the
  host's.

## Non-goals

- Any API or server change.
- Moving the element (next spec).
- New ops, or any change to what a move, reorder or resolve does.

## Acceptance / completion checklist

- [ ] The element imports nothing from Context Manager's `utils/` apart from `pointerDrag` (which moves to `common` in the next spec), and reads no `goodId`, project or connection id.
- [ ] Each op in the table is answered by the page with today's endpoint, and tracked cards link on
      demand.
- [ ] The element's behaviours keep their tests, rewritten to answer ops. The page's op answers are
      tested, and the element passes `describeAppElementContract`.
- [ ] ADR-0037 is written.
- [ ] The tasks walks were run, or the PR says which were not and why. A walk selector the markup
      change breaks is fixed in the walk, and says so.

## Implementation plan

1. Context Manager PR, after the [app-contract](app-contract.md) adoption: the element, the page, the
   EJS shell, the tests and the ADR, walked.
2. Phase notes here: this card done, with the PR.
