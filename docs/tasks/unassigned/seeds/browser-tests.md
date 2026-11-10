---
created: 2026-11-10T12:47:26-07:00
tags: [dev-tooling, formats]
---

# Browser tests in CI

Vitest's browser mode is a `formatTest({ browser: true })` switch that no package flips. Its two
dependencies are not committed and CI runs no browser tests; the contract suites passed under it
once, locally. Sheet's clipboard tests or the first media editor are the expected first users. The
harness drives (the task board's, stage 2) are a second candidate: Playwright over the harness, run
in CI. From the stage 1 follow-ups (phase 2, 2026-11-02).
