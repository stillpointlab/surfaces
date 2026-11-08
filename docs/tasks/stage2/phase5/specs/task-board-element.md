---
column: done
pr: 50
completed: 2026-11-07
created: 2026-11-07T14:51:39-07:00
tags: [apps, host-contract, code]
---

# Spec: the task board element moves here

_The [apps breakout brief](../../phase1/briefs/apps_breakout.md), desired outcome 5, last step. It
follows [transport-blind-task-board](transport-blind-task-board.md): once the board asks its page for
every op, moving it is packaging._

## High-level goal

`<spl-task-board>` lives in `packages/apps/tasks` as `@stillpointlab/tasks-app/element`. The harness
mounts it from fixtures, including this repository's own `docs/tasks/`, and answers its ops in
memory. Context Manager's task board page imports it from the submodule, and users see no change.

## Related context

- The element after [transport-blind-task-board](transport-blind-task-board.md): no fetches, ops by
  path, state through setters, ready through `common-format/app`.
- `packages/apps/README.md` reserves `./element` for this.
- The phase 2 lesson: a client imports a light entry, never `.`, because the manifest's zod schemas
  are built at module scope. The phase 4 lesson: the same holds for `common`.
- Context Manager: `src/client/components/task-board/`, `src/client/utils/pointerDrag.ts` (also used
  by its folder tree and the input resizer), and their tests.

## Technical requirement

1. **The entry.** `@stillpointlab/tasks-app/element` registers `<spl-task-board>` through
   `defineElement` from `common-format/elements`, and exports the class, the op map (`TaskBoardOps`)
   and the request event details.
   - It imports `./types`, `common-format/app`, `common-format/elements` and
     `common-format/pointer-drag`, and never the core's root.
   - `sideEffects` lists its files.
   - Its tests run under jsdom, opted into per file, as the apps README says.

2. **What moves.**

   | Context Manager                            | Here                                                                |
   | ------------------------------------------ | ------------------------------------------------------------------- |
   | `components/task-board/task-board.ts`      | `packages/apps/tasks/src/element/task-board.ts`                     |
   | `components/task-board/task-board.scss`    | `packages/apps/tasks/src/element/board.scss`                        |
   | `components/task-board/task-board.test.ts` | beside it, unchanged but imports                                    |
   | `utils/pointerDrag.ts` and its test        | `packages/common/src/pointer-drag.ts`, a new `./pointer-drag` entry |

   The element keeps injecting its stylesheet into its light DOM, as it does today. `pointer-drag` is
   a light DOM helper, so Context Manager's folder tree and input resizer import it from `common`
   too, and Context Manager's copy goes.

3. **Styles pass `check-tokens`.** Most of the board's variables are already `var(--spl-*)`. The
   rest:
   - **Five Context Manager names with no token:** `--spl-primary-color`, `--spl-alert-color`,
     `--spl-pool-surface`, `--spl-hover-gray` and `--spl-gold-color`. Each becomes a token under the
     name Context Manager already sets, with its light value as the default.
   - **Five literal colours** (one hex, four `rgba`): each uses an existing token where the value
     matches what Context Manager sets, and a new token with today's value where none does.

   The Theming table lists every new token, and Context Manager sets nothing new.

4. **Harness fixtures** (`packages/apps/tasks/dev/fixtures.ts`). The harness's glob gains
   `packages/apps/*/dev/fixtures.ts`.
   - **Hand-built states:** a board with every card state (linked, tracked, dirty, needs attention,
     diverged, a check-in chip, tags), a pool with an order, the stage view, and an empty board.
   - **This repository's `docs/tasks/`:** loaded with Vite's raw glob and projected with the core's
     functions (`parseTasksManifest`, `detectBoards`, `detectPool`, the card projection and
     `orderPoolCards`). Every card is tracked, with no host overlay. It shows real content as a host
     shows a repository nobody has edited.
   - **An in-memory host** in `dev/` answers ops on the hand-built states: `move`, `move-file` and
     `reorder-pool` change the state, `read-file` returns the fixture's text, and the rest return
     their empty reply.
   - **Controls:** turn the host off, so every op is unhandled and the optimistic render rolls back;
     and fail the next op.
   - Requests are logged in the harness's event list.

5. **The README** gains an Element section: setters, attributes, the op table with replies, the
   requests, and the tokens it reads.

6. **The Context Manager adoption** (one PR there, after this merges):
   - Move the pin. The page imports `@stillpointlab/tasks-app/element`, and the folder tree and input
     resizer import `@stillpointlab/common-format/pointer-drag`.
   - Delete `components/task-board/` and `utils/pointerDrag.ts` with their tests.
   - Amend ADR-0037: the element now lives in surfaces.
   - Compare the client build: the task board page neither gains `common`'s runtime nor the zod
     chunk.
   - Run the tasks walks.

## Clarifications

- **Fixtures, not a projection in the core.** The board's real state comes from Context Manager's
  board service, which overlays drafts, check-ins and PRs on the files. The hand-built fixtures stand
  in for that overlay. The `docs/tasks/` fixture is the files alone. Extracting the projection into
  the core is the deferred pass's question.
- **The board stays in light DOM.** Moving it into a shadow root would change what page styles reach
  it, which is a behaviour change. The WAL records it as a candidate.
- **`tasks-nav.shared.ts` stays** with the page's nav strip in Context Manager (see
  [transport-blind-task-board](transport-blind-task-board.md)), so it needs no DOM-free entry here.

## Non-goals

- The page-level UI (nav, settings, dialogs, refresh, check-in), which stays in Context Manager.
- The inventory elements (phase 6).
- Any change to the element's behaviour or markup beyond its imports and tokens.

## Acceptance / completion checklist

- [x] `@stillpointlab/tasks-app/element` builds and registers its tag from a bare import in a
      production build, and imports neither the core's root nor `common`'s runtime.
- [x] The moved tests pass unchanged apart from imports, and the element passes
      `describeAppElementContract`.
- [x] `common-format/pointer-drag` carries the moved helper and its tests.
- [x] `check-tokens` passes on `board.scss`, and the Theming table lists the new tokens.
- [x] The harness mounts every fixture in light and dark, the in-memory host answers ops, and the
      failure controls roll the optimistic render back.
- [x] The Context Manager adoption is green: the build check holds, ADR-0037 is amended, and the tasks
      walks were run.
- [x] `npm run check` green here.

## Implementation plan

1. Surfaces PR: `pointer-drag` into `common`; the element, its tests and styles; the tokens; the
   fixtures and in-memory host; the README.
2. Context Manager PR: the adoption above, walked.
3. Phase close: the four cards done, WAL entries, changelog section.

## Implementation notes

- Landed in #50, copied from Context Manager's transport-blind board (`085df527`). The element has
  its own `tsconfig.element.json` with the DOM, so the core's stays DOM-free. A bare import builds
  to 44 KB in production and registers the tag, with no zod and none of `common`'s runtime.
- Tokens: five names Context Manager already set became tokens under those names (`primary-color`,
  `hover-gray`, `pool-surface`, `alert-color`, `gold-color`), one literal mapped to `overlay-scrim`,
  and four are new (`chip-hover-bg`, `drag-shadow`, `popover-shadow`, `text-faint`). Every default
  is today's value.
- The harness mounts apps now. Context Manager's page lays the board out on its own grid with
  `display: contents`, so the fixture does the same, and the harness needed dark values for the new
  tokens. Checked in Chromium on all four fixtures in both themes: a drag settles on the host's
  answer, both failure controls roll back with their message, a tracked card comes back linked, and
  the repo fixture's preview reads the file.
- The Context Manager adoption is context-manager#1047 (merged 2026-11-07), pinned on `4939d67`. It
  deleted the element, its styles and tests, and `pointerDrag`, and the folder tree imports the
  helper from `common-format/pointer-drag`. The task board page grew by 946 bytes raw (281
  gzipped) against #1045's build, with neither zod nor the formats' runtime. ADR-0037 is amended,
  and three docs links point here. The inventory walks passed (38/38), and the tasks walks passed
  01-29 apart from 28 (skipped by design), with step 09 passing in full for the first time.
