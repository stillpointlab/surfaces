---
column: todo
created: 2026-11-13T18:48:00-07:00
tags: [apps, host-contract, code, major-feature]
---

# Spec: an app's page is an element of its own

_The [local host brief](../../../stage4/phase1/briefs/local_host.md), outcome 3. Stage 5, phase 2,
second wave: after step 1 of [app-module-grows](app-module-grows.md). Two steps, each one PR here:
the contract with inventory, then tasks. The two can go to two agents once step 1's contract is
merged._

> Written with stage 4's specs, before any of stage 4 was built. Stage 5 opens by reading it
> again against what stage 4 made.

## High-level goal

Each app has one shell element: the page around its elements. A host gives it a view and a state
and answers what it asks. The bar, the layout, the links between the app's pages and the rules
for what to read again after an op come from the app's package, not from a host.

## Related context

- The [local host spike](../../../stage4/phase1/spikes/local-host.md), finding 1: the client halves
  are app behaviour living in the host (1,382 lines and 325 of styles).
- What moves, in Context Manager's `client/apps/`:
  - `types.ts`: `ClientApp` and `MountedApp` (`mount`, `learn`, `opView`, `hostOps`, `requests`).
  - `inventory/inventoryApp.ts` (254) and `inventoryOps.ts` (101): the bar (back link, title,
    location), the overview or zone element, the links, and what `learn` tracks.
  - `tasks/tasksApp.ts` (626), `boardOps.ts` (189), `tasksNav.ts` (121), `refreshButton.ts` (91):
    the top bar (back, Refresh, Settings), the nav beside the board or the empty state, the nav's
    links, `learn`, `opView`, and the two host ops that only read a view.
  - `tasks.scss` (222) and `inventory.scss` (103), without their check-in blocks.
- `AppElement`, `requestOp` and `answerOps` in `packages/common/src/app.ts`; the app element
  suite in `packages/common/src/testing/app-element.ts`.

## Work package

- **Owns:** the shell contract in `packages/common/src/app.ts`; a `./shell` entry and
  `src/shell/` in each app package; each app's `dev/fixtures.ts` (one new fixture).
- **Does not change:** the existing elements' ops or events, except the one named under
  "Inventory" below. Context Manager is not touched.
- **Leaves for later:** the check-in dialog ([checkin-review](checkin-review.md)).

## Technical requirement

### The shell contract

```ts
/** What a host gives a shell. */
export interface AppShellInput {
  /** Where the app's pages hang; the shell builds its links from it and its module's pages. */
  base: string;
  /** Where "back" leads. Absent: no back link. */
  back?: { href: string; label: string };
  /** A name for where the instance lives: a repository, a folder. */
  location?: string;
  view: ({ type: string } & Record<string, unknown>) | null;
  state: object | null;
  extras?: Record<string, unknown>;
}

export interface AppShellElement extends AppElement<AppShellInput> {
  /** What a core op answered, so the title, the links and the counts follow. */
  learn(op: { type: string }, reply: object): void;
  /** The view an op's reply depends on, for the host to send with it. */
  opView(op: { type: string }): ({ type: string } & Record<string, unknown>) | undefined;
}

/** The ops a shell itself asks its host, beside its module's. */
export type AppShellOps = {
  /** Read one view. */
  project: {
    op: { view: { type: string } & Record<string, unknown> };
    reply: { state: object | null };
  };
  /** Bring the instance up to date with its source, whatever that means to the host. */
  refresh: { op: Record<never, never>; reply: Record<never, never> };
};
```

A host's whole client half for an app is then:

1. load the shell and call `setState`;
2. `answerOps(shell, …)`: a core op goes to the runner with `shell.opView(op)`, and the reply is
   passed to `shell.learn`; the module's host ops and the two shell ops it answers itself;
3. listen for the requests below.

Requests a shell lets through or raises, all bubbling: `navigate` (`{ href }`), `notification`,
`reload-request`, `checkin-request`, `open-card`, and the board's `open-options-menu`.

### Inventory: `<spl-inventory-app>`

- The bar: the back link, the title (kept current from each reply) and the location.
- The body: `<spl-inventory-overview>` for the `space` view, `<spl-inventory-zone>` for `zone`.
- Links come from `base` and the module's pages (`/room/:roomSlug`). The path-to-slug rule moves
  in from `inventoryOps.ts`.
- **Exports are the host's.** The shell reads `extras.exports` (`{ all?: string;
zone?(path): string }`). Without it the export controls are hidden, which is the one change to
  the two inventory elements.
- `link-editor` stays a host op of the module; the shell lets it through.

### Tasks: `<spl-tasks-app>`

- The top bar: back, the location, **Refresh** and, on a board, **Settings**.
- The body: `<spl-tasks-nav>` beside `<spl-task-board>`, or the empty state when the view is
  `null`. `extras` is what tasks' pages answer: `{ nav, docsRoot }`.
- The nav's links come from `base` and the module's pages (`/stage/:stage`,
  `/stage/:stage/phase/:phase`, `?path=`).
- **Refresh** asks `refresh`, then reads the nav and the view again with `project`.
- **`learn`** keeps Context Manager's rule: after `edit-manifest`, `create-card`, `set-title` or
  `set-tags`, read the board again with `project`.
- **`opView`** answers the view on screen for `reorder-pool`.
- **Two host ops become the shell's.** `refresh-stage` and `close-candidates` only read a view.
  The shell claims them from its elements and answers them through `project`, so a host that
  mounts the shell answers neither.

### Styles and tests

- The page styles move in with the shared tokens, and pass `tooling/check-tokens.mjs`.
- Each shell runs the app element suite, with a `hostile()` state.
- Each app's harness fixtures gain the shell over the memory host, with `project` and `refresh`
  answered from the workspace. The app can then be developed as a page in the harness.

## Clarifications

- **Navigation stays the host's.** A shell renders links and raises `navigate`; it never sets
  `location`.
- **A shell holds no ids.** Context Manager's path-to-good maps stay in its host ops.
- **`open-card` and `link-editor` are not merged** into one "open a file" op here. They reach the
  host as they do today.
- **The options menu is the host's.** The board asks for it; the shell lets the request through.

## Non-goals

- The check-in review ([checkin-review](checkin-review.md)); a shell lets `checkin-request`
  through unchanged for now.
- Inventory's export in the local host (a follow-up; the controls are hidden there).
- Context Manager mounting the shells
  ([context-manager-adopts-apps](context-manager-adopts-apps.md)).

## Acceptance / completion checklist

- [ ] `common-format/app` exports the shell contract.
- [ ] Each package's `./shell` entry defines its element; its entries test proves the root entry
      still loads no DOM code.
- [ ] Shell tests in jsdom: each view; the links for a given `base`; `learn` after each op that
      changes the title or needs a re-read; `opView`; tasks' two claimed ops answered through
      `project`; the empty state; a hostile state.
- [ ] The harness shows each shell over the memory host, and ops work end to end there.
- [ ] `npm run check` is green.

## Implementation plan

1. PR: the contract and inventory's shell, with the export change to its elements.
2. PR: tasks' shell.
