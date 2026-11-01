---
column: todo
# Stamp at creation (ISO 8601 datetime) and keep verbatim.
created: <datetime>
---

# <Feature> Test Plan (local)

> Manual release test pass for <feature>, run against a local build. This plan covers the **99%
> cases**: the flows a real user hits every day, and the ordinary error paths of each. It
> deliberately does NOT cover long-tail edge cases (races, mid-job crashes, hand-mangled inputs) —
> those are locked in by the automated suite; re-testing them by hand buys nothing. The `column:`
> frontmatter above drives this file's card on the task board.

Feature background: link the ADRs, briefs, and reviews that define the behavior under test.

## Setup (once)

Follow the smoke-test steps (`docs/tasks/unassigned/tests/smoke-test.md`) for a clean local build
(migrate, reset, seed, build) and log in. Then list anything feature-specific:

- [ ] Fixtures, scratch repos/accounts, env flags — and an explicit warning when a step touches real
      external state (GitHub PRs, Stripe, email).
- [ ] The test levers used throughout (how to trigger an upstream change, refresh, inspect state).

---

## 1. Happy paths

### 1A. <Flow name>

- [ ] Action → expected result. One checkbox per observable behavior, concrete enough that pass /
      fail needs no judgment call.
- [ ] ...

## 2. Ordinary error paths

- [ ] The everyday failure of each flow above (conflict, validation error, closed PR, empty state) →
      the expected surfaced message/recovery, not a crash.

## 3. End-to-end sweep

- [ ] The one scenario that chains the flows together and confirms the feature holds as a whole.

---

## Sign-off

- [ ] All sections above pass, or every failure is filed (issue / follow-up WAL bullet in
      `docs/devlogs/stage<N>/followups.md`) before the pass is called done.
