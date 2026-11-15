---
column: todo
created: 2026-08-29T11:45:19-07:00
tags: [apps]
---

# Task Board Refresh Test Plan (local)

> **Moved from Context Manager, 2026-11-14 (Jamie's ruling of 2026-11-09).** This plan was written
> for the task board (`packages/apps/tasks`) as mounted in Context Manager. It was not signed off
> there: no box in it is ticked. Do not walk it as written: rewrite its setup and steps for the
> local host (`npm run serve`) or the harness first. The refresh job, the GitHub sync and the `pr:`
> chip lookups are Context Manager's server (`src/services/tasks/`); only the board's side of a
> refresh is in this repository. Links below point into the Context Manager repository.

Manual test pass for the board's own ⟳ Refresh button — the busy cycle, the in-place settle of
cards/badges/nav after upstream work lands, and the live `pr:` chip states — run against a local
build with a real GitHub connection. This plan covers the **99% cases**: the refresh a user hits
right after an agent's PR merges, and the ordinary failure paths (failed sync, missing PAT). It
deliberately does NOT cover long-tail edge cases — idempotent enqueue and terminal requeue,
latest-wins sequencing, cache corruption, the 50-lookup cap, stage-vanished navigation — those are
locked in by the automated suite (`src/services/tasks/refresh.service.test.ts`, `prState.test.ts`,
`refreshButton.test.ts`, `tasksNav.test.ts`); re-testing them by hand buys nothing.

Feature background: [task_board_refresh spec](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage4/phase4/specs/task_board_refresh.md)
and [brief](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage4/phase4/briefs/task_board_refresh.md);
[ADR-0014](https://github.com/stillpointlab/context-manager/blob/main/docs/adr/0014-tasks-view.md) (boards, frontmatter, check-in),
[ADR-0027](https://github.com/stillpointlab/context-manager/blob/main/docs/adr/0027-tasks-manifest-kind-registry.md) (a vanished phase is an empty
board, not an error). The refresh loop this button replaces is the project-page Refresh in the
[tasks-view plan](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage3/phase8/tests/tasks-view.test.md) §1F.

## Setup (once)

Follow [smoke-test.md](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage1/phase12/tests/smoke-test.md) steps 1–4 for a clean local
build (migrate, reset, seed, build) and log in. Then:

- [ ] **A scratch GitHub repo** with a tasks tree, connected to a project with its tasks instance
      enabled and a board showing cards (the `stillpointlab/scratch` fixture, per the tasks-view
      plan setup). Check-ins open real PRs and levers push real commits — do NOT use a repo you care
      about.
- [ ] A stored GitHub PAT on the account (§2B needs a second account, or the PAT temporarily
      removed).
- [ ] The test levers used throughout:
  - **Upstream change**: commit to the default branch outside the app (github.com web editor, or a
    local clone → edit → push).
  - **Board Refresh**: the ⟳ Refresh button on the board topbar — the thing under test. The
    project-page repo-card Refresh still exists and is NOT this button.
  - **PR levers**: `gh pr merge` / `gh pr close` on PRs this pass opened.

---

## 1. Happy paths

### 1A. Refresh on the board variant (busy cycle, in-place settle)

- [ ] The ⟳ Refresh button sits next to Settings on the board topbar. Click → the button disables
      and reads "Refreshing…" until the job settles, then re-arms with its idle label.
- [ ] With an upstream change pushed first (a new card file, a `column:` move, a body edit): on
      completion the cards, badges, pool, and needs-attention bucket reflect the new tree **without
      a page reload**; scroll position and pool-collapse state survive.
- [ ] Rapid second click while "Refreshing…" does nothing (no second job in the feed, no flicker); a
      refresh started in another tab settles this tab's board too. _(Automated:
      `e2e/walks/29-board-refresh-1A-1B.walk.ts` covers the busy cycle, in-place adoption, and
      no-reload proof.)_

### 1B. Live `pr:` chip state

- [ ] A card whose frontmatter `pr:` names an **open** PR of this repo keeps the neutral chip after
      a refresh; merge the PR and refresh again → the chip turns merged (the ✓/done color language);
      a closed-unmerged PR shows the muted closed treatment. Label text stays `#N`/`PR`.
- [ ] Chip state persists across a normal page reload with no new refresh (cache-read path — the
      board never calls GitHub on render).
- [ ] A card with a foreign-repo `pr:` URL keeps today's stateless chip after a refresh.
      _(Automated: the walk asserts the merged state class on an adopted card.)_

### 1C. Refresh on the stage variant (nav strip in place)

- [ ] From the stage view, after a phase is closed / `current:` moved elsewhere (another tab or an
      upstream manifest edit): Refresh → the ★ current marker and the phase list update in place —
      no reload, no navigation, and the nav's controls (tabs, phase select, Set current) still work.

### 1D. Refresh on the empty variant

- [ ] On a fresh instance with no boards, the empty state offers the Refresh button (its copy points
      here, not at the project page); push the first board upstream → Refresh → lands on the newly
      revealed board.

---

## 2. Expected error paths

### 2A. Failed sync

- [ ] Make the sync fail (e.g. invalidate the connection's credentials) → Refresh → "Repository
      refresh failed" notification carrying the job's reason, the button re-enables, and the board
      is left as it was.

### 2B. No GitHub token

- [ ] Without a stored PAT, Refresh still completes — the sync and reconcile land — with the honest
      info notice "Refreshed — PR status unavailable (no GitHub token connected)"; `pr:` chips keep
      their last cached state instead of silently pretending freshness.

---

## 3. Compound pass

- [ ] **The merged-agent-PR moment**: move a card, check it in, merge its PR with `gh`, hit board
      Refresh once → the card settles tracked in its merged column, the check-in chip clears, its
      `pr:` chip shows merged, and the nav strip stays correct — all in place, one click, no reload.

---

## Sign-off

- [ ] All sections above pass, or every failure is filed (issue / follow-up WAL bullet in
      `docs/devlogs/stage4/followups.md`) before the pass is called done.
