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
