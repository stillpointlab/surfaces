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
