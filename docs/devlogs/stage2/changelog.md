# Stage 2: The Apps Breakout Changelog

- **Dates:** 2026-11-03 – TBD
- **Stage Tag:** TBD _(filled with `stage2-complete` at stage close)_

> Agent-drafted from evidence (merged PRs, git history, task cards). Appended per phase at phase
> close. Regenerable at any time; see [devlogs](../README.md). Reflections do NOT belong here — they
> go in `reflections.md`.

> The stage's theme is the [apps breakout brief](../../tasks/stage2/phase1/briefs/apps_breakout.md):
> tasks and inventory move here from Context Manager as a DOM-free core and an element each, with a
> limited set of shared components, in six phases.

---

## Phase 1: The spike and the brief (`stage2-phase1-complete`)

Range: `stage1-complete..stage2-phase1-complete` (`eecebb0..2d01ec9`), 2026-11-03 — one merge, 3
files, +394/−3. The stage was opened before the baseline, in the stage 1 close-out
([#33](https://github.com/stillpointlab/surfaces/pull/33)): the `current` pointer moved to 2/1 and
the apps breakout seed moved from the backlog to this phase.

### Shipped

- The apps breakout spike and brief
  ([#35](https://github.com/stillpointlab/surfaces/pull/35);
  [spike](../../tasks/stage2/phase1/spikes/apps-breakout.md);
  [brief](../../tasks/stage2/phase1/briefs/apps_breakout.md)). The spike mapped Context Manager's
  tasks and inventory apps at `1ff02ff6` against its August `apps-as-executors` spike: about 2,000
  pure lines in tasks and 1,700 in inventory, five ties to cut first, and a task board that fetches
  for itself again (11 `apiFetch` calls).

### Decisions

- Recorded in the brief (Jamie, on #35): one MIT license for the whole repository; inventory first;
  cores move as-is and the contract is named at the element step; app docs move with the apps;
  feature flags stay in Context Manager; a third category, `packages/components/`, for a limited set
  of shared UI components (`modal-dialog` and `spl-icon`, `options-menu` only if needed), one
  package each; helpers both apps share go in a DOM-free subpath of `common`; the Context Manager
  prep spec lives here, and specs here are public, so they carry only what a change needs; ADR-0035
  is amended for components in phase 4.

### Testing & review

- Docs only. The spike's load-bearing counts and imports were checked by hand against a clean
  Context Manager worktree after two read-only agents mapped the code.

---

## Phase 2: The inventory core moves (`stage2-phase2-complete`)

Range: `stage2-phase1-complete..stage2-phase2-complete` (`2d01ec9..93cfde4`), 2026-11-03 –
2026-11-04: three merges, 47 files, +5,268/−15. Two Context Manager PRs carried the host side.

### Shipped

- Phase 1 closed and phase 2 opened with three specs; Jamie's review added the result types seed
  and dropped the unrecognised-file check ([#36](https://github.com/stillpointlab/surfaces/pull/36)).
- Groundwork for app cores: `@stillpointlab/common-format/yaml` (`formatYamlScalar`), the app core
  suite `describeAppCore` in `./testing/app`, `appTest()`, and the app package convention with the
  components line in the placement test
  ([#37](https://github.com/stillpointlab/surfaces/pull/37);
  [spec](../../tasks/stage2/phase2/specs/app-core-groundwork.md)).
- Context Manager's prep cut the five ties: the git-sync utilities out of `tasks/`, board detection
  over paths, one YAML scalar formatter, the manifest-folder rule, seeds split into content and
  I/O; inventory's field rules and totals carved out of its service; module-owned rule errors the
  host maps back byte for byte; and a boundary test (context-manager#1019;
  [spec](../../tasks/stage2/phase2/specs/cm-app-prep.md)).
- `@stillpointlab/inventory-app` in `packages/apps/inventory`, copied from Context Manager at the
  prep's merge with its 131 tests and the format guide as its README; `describeAppCore` over v2,
  configured-v2 and v1 fixtures; a `./paths` entry for clients
  ([#38](https://github.com/stillpointlab/surfaces/pull/38);
  [spec](../../tasks/stage2/phase2/specs/inventory-core.md)). Context Manager adopted it in
  context-manager#1022.

### Decisions

- Result types (`{ ok: true, … } | { ok: false, code, message }`) are Jamie's preferred error
  pattern; the cores keep their thrown rule errors until the contract step
  ([seed](../../tasks/unassigned/seeds/result-types-for-app-cores.md)).
- No history import: Context Manager is private, so the apps arrive as new files and each PR names
  its source commit.
- ADR-0028 decision 4 (warn on files an app cannot map) is likely to be relaxed, so the suite does
  not check it.
- `appendItem` ending its output with a newline is intended (Jamie): every file should end with
  one, and repeated appends do not accumulate them. The suite records it per rewrite with
  `addsFinalNewline`.

### Testing & review

- 884 → 1,084 tests: 33 for the groundwork, then the inventory package's 162 (131 moved, 31 from
  the suite) and 5 more in `common`'s suite tests.
- The inventory package's `tsconfig` drops the DOM lib, so its DOM-freeness is typechecked. The
  root `typecheck` and `test` build `common` and `sheet-format` first (`build:deps`), since
  inventory is the first package here to depend on a format.
- The adoption's client build caught the core's zod schemas (built at module scope, so not
  tree-shaken) pulling the shared zod chunk into Context Manager's inventory and project pages;
  `./paths` fixed it before merge, and the inventory page stayed at its phase 6 size (40.93 kB).
- The prep (#1019) ran without the e2e walks, for want of an agent slot. For the adoption a
  dedicated Context Manager checkout got its own slot, and all 38 inventory walk steps passed: the
  first pin move this stage walked in the app, as the brief's constraint asks.
- After the tag: the phase 2 close-out, which opens phase 3 (the tasks core) empty.

---

## Phase 3: The tasks core moves (`stage2-phase3-complete`)

Range: `stage2-phase2-complete..stage2-phase3-complete` (`93cfde4..d81d7c3`), 2026-11-04: three
merges, 40 files, +5,173/−36. One Context Manager PR carried the host side; no prep was needed,
since #1019 had already cut the tasks ties.

### Shipped

- Phase 2 closed and phase 3 opened empty
  ([#39](https://github.com/stillpointlab/surfaces/pull/39)), then got one spec, modelled on
  inventory's ([#40](https://github.com/stillpointlab/surfaces/pull/40)).
- `@stillpointlab/common-format/frontmatter`: the frontmatter block pattern md and Context Manager
  had held byte for byte, now once; md re-exports it
  ([#41](https://github.com/stillpointlab/surfaces/pull/41)).
- `@stillpointlab/tasks-app` in `packages/apps/tasks`, copied from Context Manager `30428c3c` with
  its 192 tests, with three entries (`.`, and the import-free `./types` and `./paths`), and a README
  written as the tasks format reference from Context Manager's ADRs 0014, 0020, 0021 and 0027, which
  had no guide ([#41](https://github.com/stillpointlab/surfaces/pull/41);
  [spec](../../tasks/stage2/phase3/specs/tasks-core.md)). Context Manager adopted it in
  context-manager#1025 and retired its boundary test: with both cores here, the package boundary
  holds the line.

### Decisions

- The pool's `order.yaml` losing hand-written comments on a reorder (it is regenerated, not
  rewritten) is a follow-up, not part of the move (Jamie, on #40).
- Where an ADR and the code differ, the tasks README follows the code.

### Testing & review

- 1,084 → 1,331 tests: 4 for the frontmatter entry, and the tasks package's 243 (192 moved, 51 from
  `describeAppCore` over minimal, configured and surfaces-shaped fixtures, with no gaps).
- No client page gained the zod chunk: the task board and dialogs read the light entries, and the
  same two pages import it as at the phase 6 pin.
- The adoption was walked in full for the first time this stage: the inventory walks (38/38) and
  the tasks walks, steps 01-29 apart from an alternative setup, from the dedicated slot. The tasks
  walks' levers (a baseline reset of the scratch repository, upstream edits, merging and closing
  check-in PRs) were replayed from that repository's own history of the 2026-08-29 run, after Jamie
  allowed pushes to it. The few failures on the way were walk-script drift, recorded in Context
  Manager's WAL.
- After the tag: the phase 3 close-out, which opens phase 4 (components) empty.

---

## Phase 4: The shared components (`stage2-phase4-complete`)

Range: `stage2-phase3-complete..stage2-phase4-complete` (`d81d7c3..2f51b4c`), 2026-11-07: four
merges, 40 files, +1,693/−31. One Context Manager PR carried the host side.

### Shipped

- Phase 3 closed and phase 4 opened empty
  ([#42](https://github.com/stillpointlab/surfaces/pull/42)), then got one spec for both components
  and their adoption ([#43](https://github.com/stillpointlab/surfaces/pull/43);
  [spec](../../tasks/stage2/phase4/specs/shared-components.md)).
- `packages/components/`, the third category beside formats and apps, wired into the workspaces,
  style generation, token check, lint, tests and harness, with its convention in a README.
  `@stillpointlab/modal-dialog-component` and `@stillpointlab/spl-icon-component` were copied from
  Context Manager `e8e8450b`, each with a README and harness fixtures. Two tokens,
  `--spl-overlay-scrim` and `--spl-overlay-shadow`, carry the modal's literal colours with today's
  values as defaults. The harness badges only elements with a ready signal
  ([#44](https://github.com/stillpointlab/surfaces/pull/44)).
- `@stillpointlab/common-format/elements`, `defineElement` alone, with `common` built with splitting
  so its entries share one `log`. The components import it
  ([#45](https://github.com/stillpointlab/surfaces/pull/45)). Context Manager adopted both
  components in context-manager#1039 and deleted its copies.

### Decisions

- One spec, not one per component: the two are small and share one adoption.
- The modal's default title is set as text, the phase's one behaviour change. Its fix in Context
  Manager waited for the adoption rather than shipping separately (Jamie, 2026-11-07).
- `spl-icon` moved as the brief decided, although no app element renders it yet: on the two app
  pages it appears only in the host's EJS shells.
- The brief expected a token conversion. Context Manager's variables for the modal were already
  `var(--spl-*)`, so the work was three literal colours and two new tokens.

### Testing & review

- 1,331 → 1,347 tests: the 8 moved modal tests unchanged, 2 for the title, 4 for `spl-icon`, and 2
  that hold the shared `log` through the built `common` entries.
- Compiled against Context Manager's stylesheets, `icon.scss` is identical and `modal.scss` differs
  only in token fallbacks and the two new tokens. Both components were checked in the harness with
  Chromium in light and dark, and a bare import of each registers its tag in a production build.
- The adoption's first build failed the spec's page-growth check: through `common`'s root entry, one
  module, every Context Manager page took the formats' whole runtime (+7.9 KB raw). #45 is the fix;
  the app elements in phases 5 and 6 will meet the same rule.
- CI caught what the local check did not: `import-x/order` classifies a package's import of itself
  differently with and without `dist` built, and CI lints before building.
- The adoption was walked as phase 3's was: the inventory walks (38/38) and the tasks walks, with
  the same levers replayed against the scratch repository. The one failure was walk-script drift.
- After the tag: the phase 4 close-out, which opens phase 5 (the contract and the task board)
  empty.

---

## Phase 5: The contract and the task board (`stage2-phase5-complete`)

Range: `stage2-phase4-complete..stage2-phase5-complete` (`2f51b4c..4939d67`), 2026-11-07: three
merges, 58 files, +5,767/−280. Three stacked PRs (#48–#50) landed as one merge. Three Context
Manager PRs carried the host side.

### Shipped

- Phase 4 closed and phase 5 opened empty
  ([#46](https://github.com/stillpointlab/surfaces/pull/46)), then got four specs: the contract,
  result types for the cores, the transport-blind board and the element's move
  ([#47](https://github.com/stillpointlab/surfaces/pull/47)).
- `@stillpointlab/common-format/app`, a light entry: `Result` with `ok()` and `fail()`, the
  lifecycle half (`AppLifecycle` over `FolderNode`) and the element half (`AppElement`, ops as a
  claimable `app-op` event through `requestOp` and `answerOps`). `describeAppElementContract` joins
  `./testing`. Both cores export their lifecycles, which `describeAppCore` checks
  ([#48](https://github.com/stillpointlab/surfaces/pull/48);
  [spec](../../tasks/stage2/phase5/specs/app-contract.md)).
- The cores answer results instead of throwing, with every former code and message, and
  `TasksRuleError` and `InventoryRuleError` are gone
  ([#49](https://github.com/stillpointlab/surfaces/pull/49);
  [spec](../../tasks/stage2/phase5/specs/result-types-for-app-cores.md)). Context Manager adopted
  both in context-manager#1043.
- In Context Manager, `<spl-task-board>` stopped fetching: eight ops by path, answered by the page,
  which links tracked cards on demand. ADR-0037 records the host side (context-manager#1045;
  [spec](../../tasks/stage2/phase5/specs/transport-blind-task-board.md)).
- `@stillpointlab/tasks-app/element`: the board moved here with its 60 tests, its styles on tokens
  (five Context Manager names and four new ones), and `common-format/pointer-drag`. The harness
  mounts apps, with fixtures that include this repository's own `docs/tasks/` and an in-memory host
  ([#50](https://github.com/stillpointlab/surfaces/pull/50);
  [spec](../../tasks/stage2/phase5/specs/task-board-element.md)). Context Manager adopted it in
  context-manager#1047 and deleted its copies.

### Decisions

- Only the contract halves that exist are named. `project` and `apply` from the August design wait
  for the pass that extracts the services' rules.
- An op is an event the host claims and answers through `respond`; an unclaimed op resolves to
  `OP_UNHANDLED` at once, so an element never waits on a missing host.
- Ops name cards by path. The ids stay in Context Manager, whose page keeps the path → good index,
  and the API did not change.
- Only the throwers were converted. The cores' older result shapes stay, with a WAL entry.
- Page-level UI stays in Context Manager this phase: the nav strip and its dialogs, settings,
  refresh, check-in, and the new-card, title and tags dialogs.
- The harness uses hand-built states plus `docs/tasks/` projected from the files, not Context
  Manager's overlay.

### Testing & review

- 1,347 → 1,451 tests: the entry and its suite, the lifecycle checks over every fixture, 8 field
  validator tests, and the board's 60 tests with the contract suite. The 8 assertions that expected
  a throw now check the failure.
- The element was checked in the harness with Chromium on every fixture in light and dark,
  including both failure controls and a tracked card's link. A bare import builds to 44 KB with no
  zod and none of `common`'s runtime. In Context Manager, the task board page grew by 946 bytes raw
  (281 gzipped).
- Every Context Manager PR was walked. The inventory walks passed 38/38 on each. The tasks walks
  passed 01-29 apart from 28 on #1043 (with 09's known drift) and on #1047, where step 09 passed in
  full for the first time. #1045's last run stopped at step 03's 1B, the cold-server flake from the
  tasks adoption; #1047 contains it and passed.
- The walks needed changes, not the board: four read a host id the board no longer has, and two
  acted while a move was in flight, which the new timing makes visible (a dropped tracked card
  shows at once while the page links it).
- After the tag: the phase 5 close-out, which opens phase 6 (the inventory elements) empty.

## Phase 6: The inventory elements (`stage2-phase6-complete`)

Range: `stage2-phase5-complete..stage2-phase6-complete` (`4939d67..11f2b15`), 2026-11-07 – 2026-11-08:
five merges, 80 files, +5,771/−340. Three Context Manager PRs carried the host side. This phase
covered the brief's last outcome. There was no new brief, only four specs.

### Shipped

- Phase 5 closed and phase 6 opened empty
  ([#52](https://github.com/stillpointlab/surfaces/pull/52)). Phase 6 then got four specs and the
  decisions behind them ([#53](https://github.com/stillpointlab/surfaces/pull/53)).
- `@stillpointlab/common-format/html`, a light entry of 1.4 KB:
  - `html`, a tagged template that escapes every value it did not build itself, with no way to mark
    a string as safe;
  - `render`, which sets markup only from `html`, and `escapeHtml`.
  - `<spl-icon>` builds its DOM once and sets attributes through the DOM, and `<modal-dialog>`
    renders through `html`. The task board uses `common`'s `escapeHtml`.
  - `hostile()` and `expectNoHostileMarkup()` joined `./testing`, and a lint rule bans direct markup
    writes in components and app elements
    ([#54](https://github.com/stillpointlab/surfaces/pull/54);
    [spec](../../tasks/stage2/phase6/specs/html-safe-templates.md)).
- In Context Manager, the inventory page became `<spl-inventory-overview>` and
  `<spl-inventory-zone>`, in light DOM on `html`:
  - five ops by zone path, answered by the page with the same endpoints;
  - three requests for what the page keeps: notifications, check-in and reload;
  - links supplied by the page.
  - ADR-0038 records it (context-manager#1056;
    [spec](../../tasks/stage2/phase6/specs/inventory-elements-in-cm.md)).
- `@stillpointlab/inventory-app/element` and `./types`: the elements moved here with their 50 tests,
  their styles on tokens (two new: `alert-bg`, `alert-text`) and a harness entry. The harness has
  17 fixtures, including an example inventory parsed by the core and a hostile fixture, and an
  in-memory host ([#55](https://github.com/stillpointlab/surfaces/pull/55);
  [spec](../../tasks/stage2/phase6/specs/inventory-elements.md)). Context Manager adopted them in
  context-manager#1058 and deleted its copies.
- The core says zone: its exported names, its state fields (`space.zones`, `state.zone`, the dirty
  kind `'zone'`) and its files (`zone.ts`, `zoneWriter.ts`, `zoneSeed.ts`)
  ([#56](https://github.com/stillpointlab/surfaces/pull/56);
  [spec](../../tasks/stage2/phase6/specs/zone-vocabulary.md)). Context Manager adopted the names in
  context-manager#1059.

### Decisions

- Zone is the term, renamed wherever no one outside the code holds the name. These keep room: the
  `rooms/` folder (a migration across existing repositories, left as a seed-sized question), the
  routes and API paths, v1's export names, and the error codes.
- Context Manager's API responses carry the renamed state fields, since the page is their only
  reader. Messages users see kept their room wording, because the rename changed no behaviour.
- `html` has no escape hatch. A stylesheet goes in as text instead.
- "Open in editor" became an op (`link-editor`) rather than a request, so the button learns whether
  linking worked. It is the one departure from the specs.
- Light DOM, like the board. Check-in and the editor link stay with Context Manager's page.
- The elements keep the host's `button`, `form-input` and `sr-only` classes rather than shipping
  their own.
- Prettier no longer formats embedded languages in `.ts` files in either repository: it reformatted
  `html` templates and changed what they render.

### Testing & review

- 1,451 → 1,546 tests:
  - `html` and its entry, `hostile` and `expectNoHostileMarkup`;
  - `<spl-icon>`'s hostile tests, five of which failed on the old element;
  - `<modal-dialog>`'s render tests;
  - the elements' 50 tests, each zone fixture also rendered with hostile strings, with
    `describeAppElementContract` on both.
- The zone rename changed test names and nothing else.
- The elements were checked in the harness with Chromium on every fixture in light and dark,
  including both failure controls, the editor link and the hostile fixture.
- A bare import of the elements builds to 67 KB minified (16 KB gzipped), with no zod and none of
  the core's root.
- Context Manager's inventory page:
  - grew from 60.0 to 65.9 kB raw when it became elements, with their stylesheet now inside the
    script;
  - grew by 0.7 kB more when the elements came from the submodule.
- Every Context Manager PR was walked after `e2e:reset`, and the inventory walks passed 38/38 on
  each:
  - #1056 renamed about 34 walk selectors to say zone;
  - #1058 and #1059 needed no walk changes.
  - #1056's first run hit a stale phase 5 server on port 3004.
- After the tag: the phase 6 close-out, which opens phase 7 empty, ahead of the stage close.
