# Stage 1: Common Ground for the Formats Changelog

- **Dates:** 2026-11-01 – 2026-11-03
- **Stage Tag:** `stage1-complete` _(created on the merge of the stage close PR)_

> Agent-drafted from evidence (merged PRs, git history, task cards). Regenerable at any time; see
> [devlogs](../README.md). Reflections do NOT belong here — they go in `reflections.md`.

> Stage 1 is the repository's first: the five editor repositories were merged into this one on
> 2026-10-31 and 2026-11-01, tracked on Context Manager's boards (stage 5 phase 11), and the stage
> opened once that migration was done. Its theme was giving the five formats one footing: a package
> convention, one harness and one contract suite, and the shared element patterns, ending in the raw
> view. The devlogs arrived with this stage's close, so the changelog is written whole rather than
> appended per phase; each phase's range runs from the previous phase tag (for phase 1, the parent of
> the #1 merge, `354c8b6`, the rename to surfaces). Close-out docs PRs land after their phase's tag,
> so each falls in the next phase's range.

---

## Phase 1: The format package convention (`stage1-phase1-complete`)

Range: `354c8b6..c0c50d5`, 2026-11-01 — two merges, 100 files, +950/−186.

### Shipped

- The brief and spec, moved from Context Manager's stage 5 phase 11
  ([#1](https://github.com/stillpointlab/surfaces/pull/1);
  [brief](../../tasks/stage1/phase1/briefs/format_package_convention.md);
  [spec](../../tasks/stage1/phase1/specs/format-package-convention.md)).
- `packages/common` (`@stillpointlab/common-format`): one shared log, the element contracts moved
  from Context Manager's `components.d.ts`, and the SCSS tokens; a `./editor` entry on md, code and
  xmdl beside the unchanged root entries; `tooling/template/format` with
  `npm run new-format -- <name>`; root `typecheck` and `test` build `common` first
  ([#2](https://github.com/stillpointlab/surfaces/pull/2)).

### Decisions

- Image stays a format; the placement test lives in `packages/apps/README.md`.
- The scaffold is shaped so the same template can later produce an app (the
  [one scaffold](../../tasks/unassigned/seeds/one-scaffold-for-formats-and-apps.md) seed).

### Testing & review

- `npm run check` green; the scaffold verified by generating a trial format, checking it, and
  removing it. A code-format vim test's wait widened from 1 s to 4 s (the real cause was found in
  phase 2).
- Context Manager adopted `common` first in its workspaces and re-exported the contracts from it
  (context-manager#988).

---

## Phase 2: The ready signal and one harness (`stage1-phase2-complete`)

Range: `c0c50d5..1c43435`, 2026-11-02 — five merges, 88 files, +2,780/−941.

### Shipped

- Phase 1 closed and phase 2 opened with the shared test harness spike
  ([#3](https://github.com/stillpointlab/surfaces/pull/3);
  [spike](../../tasks/stage1/phase2/spikes/shared-test-harness.md)), then its ready-signal addendum
  and the spec ([#4](https://github.com/stillpointlab/surfaces/pull/4);
  [spec](../../tasks/stage1/phase2/specs/shared-test-harness.md)).
- The vim keymap flake fixed: a race between two lazy imports, not a slow import
  ([#5](https://github.com/stillpointlab/surfaces/pull/5)).
- `whenReady()`, a `ready` attribute and event on all nine elements through `createReadyGate` in
  `common`; the `./testing` conformance suites (`describePreviewContract`, `describeEditorContract`,
  `describeImagePreviewContract`, `describeDiffContract`) run by every format; a
  `formatTest({ browser: true })` switch for vitest browser mode. md and code stop emitting
  `content-change` for a programmatic `setContent`; md-editor survives reconnect; xmdl's
  `content-change` carries `{ content }` ([#6](https://github.com/stillpointlab/surfaces/pull/6)).
- `tooling/harness/`: one Vite app on port 5180 fed by each format's `dev/fixtures.ts`, replacing
  the five per-format playgrounds and their port registry
  ([#7](https://github.com/stillpointlab/surfaces/pull/7)).

### Decisions

- `whenReady()` has settled semantics: hydrated and the last `setContent` in the DOM (Jamie,
  2026-11-02); a "loaded" event can be added if anyone needs one.
- Testing is per package: the text formats stay on jsdom, browser mode is a switch a package flips
  when it needs it, and the harness is a playground, not a test runner — no Playwright and no
  screenshot layer here without an explicit reason.
- No brief: the spike's semantics were settled, so it went straight to a spec.

### Testing & review

- 692 tests at #6 and #7. The contract suites passed unchanged in headless Chromium under browser
  mode, run once locally (the dependencies were not committed). The harness was driven in headless
  Chromium: every format mounts and every element settles.
- The suites recorded two gaps rather than fixing them: xmdl-editor ignored `readonly`, and md's
  toolbar bypassed it. They became phase 3.
- Context Manager adopted the signal in context-manager#993.

---

## Phase 3: Readonly in md and xmdl (`stage1-phase3-complete`)

Range: `1c43435..80ab309`, 2026-11-02 — three merges, 13 files, +371/−42.

### Shipped

- Phase 2 closed ([#9](https://github.com/stillpointlab/surfaces/pull/9)); phase 3 opened with one
  spec straight from the gaps ([#10](https://github.com/stillpointlab/surfaces/pull/10);
  [spec](../../tasks/stage1/phase3/specs/readonly-in-md-and-xmdl.md)).
- `<xmdl-editor>` observes `readonly` and forwards it to its embedded `<code-editor>`;
  `<md-editor>` disables its toolbar and raw toggle, and applies a `readonly` set before the engine
  loads, which it had silently ignored ([#11](https://github.com/stillpointlab/surfaces/pull/11)).

### Testing & review

- 700 tests; the two `readonly: false` opt-outs dropped from the contract tests, so the readonly
  case runs for every editor. Harness pass in headless Chromium recorded in #11.
- Context Manager needed no change; its WAL records the gaps closed with the pin move to `ba83322`.

---

## Phase 4: Shared element patterns (`stage1-phase4-complete`)

Range: `80ab309..ba83322`, 2026-11-02 — three merges on `main` (the four-PR stack landed through
#14), 68 files, +3,235/−874.

### Shipped

- Phase 3 closed ([#12](https://github.com/stillpointlab/surfaces/pull/12)); the shared element
  patterns spike and four specs ([#13](https://github.com/stillpointlab/surfaces/pull/13);
  [spike](../../tasks/stage1/phase4/spikes/shared-element-patterns.md)).
- Lifecycle fixes: `ReadyGate.isCurrent`; the four lazy elements settle when moved in the DOM right
  after mount (they never did, latent in Context Manager); md-editor's leaked 100 ms interval
  removed; move and reconnect cases in every suite
  ([#14](https://github.com/stillpointlab/surfaces/pull/14);
  [spec](../../tasks/stage1/phase4/specs/element-lifecycle-fixes.md)).
- One `--spl-*` token set used by every stylesheet; dark mode reaches xmdl and image; six new tokens
  the host sets ([#15](https://github.com/stillpointlab/surfaces/pull/15);
  [spec](../../tasks/stage1/phase4/specs/design-tokens.md)).
- Lazy-engine helpers (`createLazyLoader`, `hydrate`, `createStatus`) composed by each element; a
  failed load shows a message and settles
  ([#16](https://github.com/stillpointlab/surfaces/pull/16);
  [spec](../../tasks/stage1/phase4/specs/lazy-engine-helper.md)).
- Toolbar helpers, the shared switch (`createSwitch` replacing `<md-toggle>` and xmdl's switch),
  `role="toolbar"`, names and arrow-key focus on every toolbar
  ([#17](https://github.com/stillpointlab/surfaces/pull/17);
  [spec](../../tasks/stage1/phase4/specs/toolbar-helpers.md)).

### Decisions

- Helpers and interfaces, not a base class or a configurable component framework (Jamie).
- Raw mode is user- and agent-facing, so it got a brief of its own rather than a spec from the spike.

### Testing & review

- 724 → 768 tests across the stack. Toolbar geometry was not unified (the shared partial carries
  only focus and disabled states); md's switch announced "Raw, checked" in rich mode, left for the
  raw-mode brief.
- Context Manager moved its pin and set the six new tokens in context-manager#1002.

---

## Phase 5: The raw view (`stage1-phase5-complete`)

Range: `ba83322..7146752`, 2026-11-02 — three merges on `main` (the four-PR format stack landed
through #21), 62 files, +3,206/−508.

### Shipped

- Phase 4 closed; the raw mode brief with Jamie's decisions and five specs
  ([#19](https://github.com/stillpointlab/surfaces/pull/19);
  [brief](../../tasks/stage1/phase5/briefs/raw_mode.md)).
- The raw view convention in `common`: the `view` attribute and `view-change` event in the
  contract, `createViewState`, `createRawSource`, `createRawView`, `createNotice`,
  `describeRawViewContract`; the template's sample elements implement it; a Raw control in the
  harness ([#20](https://github.com/stillpointlab/surfaces/pull/20);
  [spec](../../tasks/stage1/phase5/specs/raw-view-convention.md)).
- xmdl: "Raw Text" replaces "Apply Mode"
  ([#21](https://github.com/stillpointlab/surfaces/pull/21));
  md: text as set until the first rich edit, engine failure falls back to raw
  ([#22](https://github.com/stillpointlab/surfaces/pull/22));
  sheet: a raw view, with fallback for invalid and over-limit sheets
  ([#23](https://github.com/stillpointlab/surfaces/pull/23));
  md, xmdl and sheet previews show source on request and on parse failure
  ([#24](https://github.com/stillpointlab/surfaces/pull/24)).

### Decisions

- Recorded in the brief (Jamie, on #19): the label is "Raw Text"; the host handle is the `view`
  attribute plus `view-change`; fallback covers parse failure, engine failure and the sheet row
  limit, and a failed switch back shows the current errors; read-only never forces a view; switching
  never changes the text.

### Testing & review

- 780 → 836 tests across the stack; md's six normalising samples round-trip byte for byte.
- Context Manager adopted the raw view in context-manager#1009 with five deferrals; the four that
  were surfaces changes became phase 6, and the fifth (a "View source" item or a raw handle over
  MCP) stays open in Context Manager's WAL.

---

## Phase 6: Raw view follow-ups (`stage1-phase6-complete`)

Range: `7146752..23d4bef`, 2026-11-03 — two merges on `main` (the four-PR stack landed through #27),
40 files, +1,629/−102.

### Shipped

- Phase 5 closed and phase 6 opened with four specs
  ([#26](https://github.com/stillpointlab/surfaces/pull/26)).
- Defining `<code-editor>` loads no CodeMirror; a per-entry evaluation test guards it
  ([#27](https://github.com/stillpointlab/surfaces/pull/27);
  [spec](../../tasks/stage1/phase6/specs/code-format-light-entries.md)).
- `<sheet-preview>` takes a `.sheet` source through `setDocumentSource`
  ([#28](https://github.com/stillpointlab/surfaces/pull/28);
  [spec](../../tasks/stage1/phase6/specs/sheet-preview-document-source.md)).
- Raw text keeps its line endings (`lineBreakOf`, `withLineBreak`)
  ([#29](https://github.com/stillpointlab/surfaces/pull/29);
  [spec](../../tasks/stage1/phase6/specs/line-endings-as-set.md)).
- Editors with a raw view take a keymap mode (`createKeymapState`, `describeKeymapModeContract`);
  xmdl and sheet stopped remounting the raw surface on every render
  ([#30](https://github.com/stillpointlab/surfaces/pull/30);
  [spec](../../tasks/stage1/phase6/specs/raw-source-keymap-mode.md)).

### Decisions

- The embedded `<code-editor>` toolbar stays inside raw views (Jamie left it open to moving).

### Testing & review

- 839 → 884 tests across the stack.
- Context Manager adopted the phase in context-manager#1013: defining `<code-editor>` now adds
  4.3 KB gzipped to its md, xmdl and sheet editor pages (112.3 KB before), and its draft manager's
  hydrated baseline is gone.
- After the tag: the phase 6 close-out, which opened phase 7 empty
  ([#32](https://github.com/stillpointlab/surfaces/pull/32)). Phase 7 was never used and is removed
  at stage close.

---

## Stage totals

- `354c8b6..23d4bef`: 54 commits, 18 of them merges on `main` (`git rev-list --count`, with and
  without `--first-parent`); 226 files, +11,627/−2,109 (`git diff --shortstat`). 28 PRs merged, #1
  to #32, of which 9 were stacked into another PR's branch rather than `main`.
- Tests: 605 at the end of the migration (Context Manager's formats-repo-init spec) to 884 at #30.
- No token or cost figures were collected.
