---
column: todo
created: 2026-11-25T18:00:00-07:00
tags: [dev-tooling, formats, code]
---

# Spec: browser tests, kept small

_From the seed [browser tests in CI](../../phase1/seeds/browser-tests.md) and the
[media previews brief](../../phase1/briefs/media_previews.md), phase 2. One PR here, after
[the scaffold](scaffold-registrable-formats.md)._

## High-level goal

A package can test in a real browser what jsdom cannot do: play a clip, seek in it, draw a page.
Those tests are few, they run in a pull request only for the packages it touches, and the whole
set runs at a stage's close. `npm test` and `npm run check` stay as fast as they are.

## Related context

- Jamie, 2026-11-25: "playwright tests tend to get expensive in CPU and time. We can do something
  like, limit runs during CI (PRs and merges) and have a stage close full-suite integration. I
  don't want to get bogged down waiting for CI".
- Main files: `tooling/vitest.ts` (`formatTest({ browser: true })`, written in stage 1 and used
  by nothing), the root `package.json` and `vitest.config.ts`, `.github/workflows/ci.yml`,
  `tooling/template/url-format/`, `docs/devlogs/README.md` (the milestones).
- Why now: jsdom plays no media and draws no canvas. The image format's tests finish a load by
  dispatching the event themselves; a video's or a PDF page's cannot be faked that way and mean
  anything.
- This is vitest's browser mode: a package's unit tests run inside headless Chromium, which
  Playwright starts. It is not a Playwright walk of a running host, and none is added.
- The [streaming spike](../../phase1/spikes/a-video-player-that-streams.md) played VP9, Opus,
  H.264, AAC and MP3 in Playwright's headless Chromium.
- CI here runs on GitHub's own runners, so its cost is the wait and not this machine's CPU.

## Technical requirement

### 1. Two kinds of test file in a package

- `*.test.ts` runs in jsdom, as today, in `npm test`. A media format's descriptor, its entries,
  its states and its words are tested here.
- `*.browser.test.ts` runs in headless Chromium, and only through `npm run test:browser`. It
  holds what needs a real browser and nothing else.
- A package that has browser tests has a second config beside its first
  (`vitest.browser.config.ts`), from a helper in `tooling/vitest.ts` that replaces the unused
  flag. The root has a second config that collects those.
- `npm run test:browser -- --project <name>` runs one package's.

`npm test` and `npm run check` run no browser and need none installed.

### 2. When they run

| When                          | What runs                                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A pull request                | The browser tests of each package the pull request changes, in a job of its own beside `check`. A pull request that changes no such package starts no browser. |
| A push to `main`              | None: the pull request ran them.                                                                                                                               |
| By hand (`workflow_dispatch`) | All of them.                                                                                                                                                   |
| A stage's close               | All of them, by hand, as a step of the close beside the release walk.                                                                                          |
| An agent building a spec      | Its own package's, locally, before it reports.                                                                                                                 |

A change to `common` or to the tooling does not run them all in a pull request. That gap is what
the run at the stage's close is for, and `docs/devlogs/README.md`'s milestones gain the step.

### 3. A budget

- One package's browser tests take under 30 seconds on a laptop.
- A test waits for an event, never for a time.
- The job's time is written in each pull request that adds browser tests. If the job for one
  package passes two minutes in CI, the next step is fewer tests and not a longer wait.

### 4. The dependencies and CI

- `@vitest/browser` and `@vitest/browser-playwright` at vitest's version, as root dev
  dependencies.
- The browser job installs Playwright's Chromium with its system packages, cached by
  Playwright's version. The `check` job installs no browser.
- `npm run test:browser` on a machine without the browser fails with words that name the
  command to install it.

### 5. Proved on the URL template

- `tooling/template/url-format/` gains one browser test: its sample element loads a real image
  from a file in the package, and the browser finishes the load; a second loads a missing one
  and the browser fails it.
- Its jsdom tests stay as the scaffold spec leaves them.

### 6. What a media test needs

So phase 3's specs can lean on it:

- **Media plays without a gesture** in the test browser (Chromium's autoplay switch, passed
  through the provider's launch options), since a test cannot click first.
- **A test reaches a file of its package by URL** (`new URL('./clip.webm', import.meta.url)`).
- **Test media is small and made by a command.** A package keeps its clips under `dev/media/`,
  each under 50 kB, with the `ffmpeg` line that made it in the package's README.

### 7. The words

The root README's testing section says what goes in a browser test and what does not, how to
install the browser, and when the tests run.

## Non-goals

- Moving any existing test into a browser.
- Firefox or WebKit. Chromium alone.
- Playwright walks of the harness or the local host in CI (the seed's second candidate).
- Screenshots as assertions.
- A scheduled run. By hand and at the stage's close, until that proves too little.

## Acceptance / completion checklist

- [ ] `npm test` and `npm run check` start no browser, and their times before and after are in
      the PR.
- [ ] This PR's own browser job runs the URL template's two tests and passes; its time is in
      the PR.
- [ ] A pull request that changes only `docs/` starts no browser job (shown by this stack's next
      docs PR, or a draft).
- [ ] The job run by hand runs every package's browser tests.
- [ ] A scaffolded `--url` format has its browser test and passes it with no edit.
- [ ] A proof, not committed: a `<video>` in a browser test plays a 1 s WebM from the package
      and reports its size, in CI.
- [ ] `docs/devlogs/README.md` and the release walk's card name the run at the stage's close.

## Implementation plan

1. The helper, the second root config and the script.
2. The CI job, its filter by changed package and its cache; the job by hand.
3. The template's browser test, the autoplay switch and the proof run.
4. README and the milestones.

### Work package

- **Owns:** `tooling/vitest.ts`, `.github/workflows/ci.yml`, the root `package.json`, lockfile
  and vitest configs, `tooling/template/url-format/`, `docs/devlogs/README.md`.
- **Must not change:** any package's existing tests.
- **Runs after:** [the scaffold](scaffold-registrable-formats.md).
