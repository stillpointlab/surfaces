---
column: in-progress
created: 2026-11-13T18:48:00-07:00
tags: [apps, host-contract, code, major-feature]
---

# Spec: an app's page is an element of its own

_The [local host brief](../../../stage4/phase1/briefs/local_host.md), outcome 3. Stage 5, phase 2,
second wave: after step 1 of [app-module-grows](app-module-grows.md). Two steps, each one PR here:
the contract with inventory, then tasks. The two can go to two agents once step 1's contract is
merged._

> Written with stage 4's specs, before any of stage 4 was built, and read again on 2026-11-14
> against what stage 4 made. The [review](../../phase1/reviews/specs-against-stage-4.md) lists what changed
> and why (M8, H7). "What stage 4 built" is what an implementer reads first.

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

## What stage 4 built

_Added 2026-11-14._

- **The local host mounts a shell in its one pane,** at `#/app/<manifestPath>`. `base` is that
  fragment, so every link a shell renders is `base` joined to a sub-path as text.
- **The local host has a dark colour scheme,** and Context Manager has none. The shells and the
  app elements are seen dark there for the first time; stage 4 found the code editor's
  highlighting dark on dark this way. `tooling/check-tokens.mjs` already fails a literal colour.
- **Its page allows no inline script and no `eval`.** A shell sets no `on…` attribute, and
  builds its markup with `html` and `render`.
- **The host's menu takes `{ x, y, entries }`.** The board's `open-options-menu` carries
  `{ items, anchor }`, and the board waits for `options-menu-select` with the chosen `itemId`.
  A shell lets both through unchanged.
- **Context Manager's walks select the pages' chrome by id and class** (`e2e/walks/` and
  `e2e/inventory-walks/` there): the bars, Refresh, Settings and both check-in dialogs.

## Work package

- **Owns:** the shell contract in `packages/common/src/app.ts`; a `./shell` entry and
  `src/shell/` in each app package; each app's `dev/fixtures.ts` (one new fixture).
- **Does not change:** the existing elements' ops or events, except the one named under
  "Inventory" below. Context Manager is not touched.
- **Leaves for later:** the check-in dialog ([checkin-review](../../phase4/specs/checkin-review.md)).

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
- **A shell renders in the light DOM,** as every app element does, so a host's selectors and a
  drag across the board still reach inside it.
- **Markup the walks know.** Read Context Manager's walks before choosing a shell's markup, and
  keep an id or a class where keeping it costs nothing. Each PR lists the ids and classes of
  Context Manager's page chrome that the shell does not keep, so
  [context-manager-adopts-apps](../../phase1/specs/context-manager-adopts-apps.md) can change the walks in the
  commit that mounts the shell.

## As built: step 1

_2026-11-14, by an Opus 5.5 sub-agent; reviewed and checked by the orchestrating agent, who
looked at the screenshots. Where the work departed from the text above, this is what step 2 and
the later specs read._

- **The contract is as written:** `AppShellInput`, `AppShellElement` and `AppShellOps`, one
  block at the end of `packages/common/src/app.ts`.
- **`navigate` can be cancelled.** A plain click on a link in the shell raises `navigate` with
  `{ href }`. A host that claims it calls `preventDefault()` and navigates itself; unclaimed,
  the browser follows the link. A click with a modifier, on a download, or for another target
  raises nothing. The nav element's own `navigate` is not cancelable today, and step 2 has to
  make the two one rule.
- **Back on a zone's page is the shell's own:** it links to `base`, "Back to inventory
  overview". The host's `back` shows on the overview only.
- **The shell holds no editor links.** A file that is already linked shows the "Open in editor"
  button and asks `link-editor`, where Context Manager rendered a link from its own map of
  paths. A host answers the op from whatever it holds.
- **Inventory's shell asks neither `project` nor `refresh`,** and `opView` answers nothing: no
  inventory reply reads the view. The harness answers both ops all the same.
- **The empty states:** no view, or the overview with no state, is the overview's own "no
  inventory" notice; a zone with no state, or a view the shell does not know, is a line with a
  link to the overview.
- **`learn` takes a reply only when it is for the view on screen.** The title is the space's
  label on the overview, and "space — zone" on a zone.
- **A zone's link uses the slug the state gave;** without one, the file's name less its
  extension, which is the rule that moved in.
- **The link helpers** (`pageHref`, which joins `base` and a page's path as text) are in
  inventory's `shell/links.ts`. Tasks needs the same, and step 2 moves it beside
  `matchAppPage`.
- **The page's top margin stays the host's.** The shell has the column, the padding and the
  bar.
- **`InventoryLinks.exportAll` and `exportZone` are optional,** which is the change to the two
  elements: a link that is absent has no control.
- **No splitting in the package's build:** `./shell` carries its own copy of the two elements,
  so a page that loads `./element` and `./shell` defines them twice and is warned. In the
  follow-up log.
- **The markup rule's lint** now covers `packages/apps/*/src/shell/`.
- **Context Manager's page chrome that the shell does not keep:**
  - `.inventory-page` on the root, which Context Manager can keep on its own container;
  - `data-variant`, which is on `<spl-inventory-app>` now;
  - the back icon's own `aria-label`; the link carries the name, and the icon is hidden from
    assistive technology.

  Kept: `.inventory-bar`, `.back-button`, `#inventory-title`, `.inventory-title`,
  `.inventory-repo`, and both back links' accessible names. The check-in dialog's chrome is
  [checkin-review](../../phase4/specs/checkin-review.md)'s.

- **What Context Manager passes when it mounts the shell:** `extras.exports` (two walks click
  the downloads), `back` with the label its page has today, and `location`.
- **By hand, in Chromium over the harness's memory host, light and dark:** the overview, a zone
  added, its link followed, an item added, back, and the exports shown and hidden. Both
  schemes read well in the shell. What reads badly is in the elements, and in the follow-up
  log.

## As built: step 2

_2026-11-14, by an Opus 5.5 sub-agent; rebased onto host-runner, reviewed and checked by the
orchestrating agent, who looked at the screenshots._

- **One rule for `navigate`.** Every `navigate` a host sees bubbles, can be cancelled and
  carries `{ href }`, and a host claims it with `preventDefault()`. It comes from a link
  clicked in the shell, from the tab strip (a phase or a board chosen, one just made or closed
  to), and from the shell when Refresh leaves the page with nothing to show.
- **Only a clicked link has a fallback.** Unclaimed, the browser follows the link. The other
  two have no link behind them and go nowhere unclaimed, so **a host that mounts a shell
  answers `navigate`** (the orchestrating agent's ruling: the alternative has the shell
  navigating, which the text above forbids).
- **The one change to an existing element:** `<spl-tasks-nav>`'s `navigate` can now be
  cancelled. Unclaimed it still goes nowhere, and a host that listens without claiming, as
  Context Manager does, is unaffected. `<spl-task-board>` is unchanged.
- **`pageHref(base, path, params, query)` is in `common-format/app`,** beside `matchAppPage`.
  Both shells build their links with it.
- **The two ops the shell claims.** It hears `app-op` in the capture phase and stops
  `refresh-stage` and `close-candidates` there, so no host sees them:
  - `refresh-stage` answers the stage through `project`, or `TASKS_STAGE_NOT_FOUND`;
  - `close-candidates` answers the board's cards (path, title, column), or
    `TASKS_BOARD_NOT_FOUND`;
  - a malformed one is `APP_OP_INVALID`, and a refused `project` goes back as it is.

  `tasksModule.hostOps` still lists both, for the bare elements' fixtures.

- **Refresh** asks `refresh`, then reads the nav and the view again, the newest read winning.
  From the empty state, or a stage with no phases left, it raises `navigate` to the landing.
  While it runs the button is busy and keeps focus. A refusal raises `notification` with the
  host's message.
- **`learn` reads the board again on a board view only,** as Context Manager did, and does not
  read the reply.
- **A new view is a new board and a new strip,** as a page load was. The same view with a new
  state is `setState` on the board there.
- **A view the shell does not know** is a line with a link to the landing. A board with no
  state lets the board say so.
- **The board's `storage-key` is `base`,** since a shell holds no ids. In Context Manager the
  pool's collapsed state resets once.
- **The empty state says "upstream"** where Context Manager's said GitHub.
- **The sticky pool reads `--spl-tasks-app-sticky-top`** (0 by default) in place of Context
  Manager's header height. The top margin stays the host's.
- **Context Manager's page chrome the shell does not keep:**
  - `.task-board-page` on the root, which carries its header margin and can stay on its own
    container;
  - the back icon's and the task icon's own `aria-label` (both are hidden from assistive
    technology; the link carries the name);
  - `storage-key` as an id.

  Kept: `.tasks-topbar`, `.back-button`, `.task-board-repo`, the Refresh and Settings
  buttons' classes, titles and labels, `.board-layout`, the strip's `aria-label`,
  `spl-task-board[variant]`, and `.task-board-empty` with its heading. The options menu and
  the check-in dialog were never in the layout and stay the host's.

- **What Context Manager does when it mounts the shell:**
  - passes `base`, `back` with the label its page has today, `location`, the view, the state
    and `extras`, sets the sticky property to its header's height, and keeps its button and
    form styles loaded;
  - answers `project` and `refresh` (the second waits for its job), and drops its handlers
    for the two claimed ops;
  - claims `navigate` with `preventDefault()`, or a clicked link is followed twice;
  - calls `learn(op, reply)`: its own `learn` took the two the other way round.
- **No hook yet for a host to say a check-in is in flight,** or to have the shell read again
  after one. [checkin-review](../../phase4/specs/checkin-review.md) adds `checkinSettled()`.
- **By hand, in Chromium over the harness's memory host on the runner, light and dark:** the
  strip to another phase and to a stage view, a card moved by its menu and by drag, a card
  created, Settings, Refresh, a card's menu, Close phase, and another board. Both schemes read
  well.

## Clarifications

- **Navigation stays the host's.** A shell renders links and raises `navigate`; it never sets
  `location`.
- **A shell holds no ids.** Context Manager's path-to-good maps stay in its host ops.
- **`open-card` and `link-editor` are not merged** into one "open a file" op here. They reach the
  host as they do today.
- **The options menu is the host's.** The board asks for it; the shell lets the request through.

## Non-goals

- The check-in review ([checkin-review](../../phase4/specs/checkin-review.md)); a shell lets `checkin-request`
  through unchanged for now.
- Inventory's export in the local host (a follow-up; the controls are hidden there).
- Context Manager mounting the shells
  ([context-manager-adopts-apps](../../phase1/specs/context-manager-adopts-apps.md)).

## Acceptance / completion checklist

- [ ] `common-format/app` exports the shell contract.
- [ ] Each package's `./shell` entry defines its element; its entries test proves the root entry
      still loads no DOM code.
- [ ] Shell tests in jsdom: each view; the links for a given `base`; `learn` after each op that
      changes the title or needs a re-read; `opView`; tasks' two claimed ops answered through
      `project`; the empty state; a hostile state.
- [ ] The harness shows each shell over the memory host, and ops work end to end there, in a
      light and in a dark colour scheme.
- [ ] Each PR lists the ids and classes of Context Manager's page chrome the shell does not
      keep.
- [ ] `npm run check` is green.

## Implementation plan

1. PR: the contract and inventory's shell, with the export change to its elements.
2. PR: tasks' shell.
