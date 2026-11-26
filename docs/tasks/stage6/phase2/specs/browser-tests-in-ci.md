---
column: done
pr: 188
completed: 2026-11-25
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

- [x] `npm test` and `npm run check` start no browser, and their times before and after are in
      the PR.
- [x] This PR's own browser job runs the URL template's two tests and passes; its time is in
      the PR.
- [x] A pull request that changes only `docs/` starts no browser job (shown by this stack's next
      docs PR, or a draft).
- [x] The job run by hand runs every package's browser tests.
- [x] A scaffolded `--url` format has its browser test and passes it with no edit.
- [x] A proof, not committed: a `<video>` in a browser test plays a 1 s WebM from the package
      and reports its size, in CI.
- [x] `docs/devlogs/README.md` and the release walk's card name the run at the stage's close.

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

## As built

Built by an Opus 5.5 sub-agent, read and checked by the orchestrating agent, which mended the
README's conformance paragraph and ran what needs a push.

How it is put together, which the spec left to the build:

- **`browserTest()`** in `tooling/vitest.ts` replaces the unused flag. `formatTest` and `appTest`
  leave `src/**/*.browser.test.ts` out. Playwright is loaded inside `browserTest`'s own config,
  so a jsdom config never loads it.
- **The root's `vitest.browser.config.ts`** collects each package's `vitest.browser.config.ts`.
- **Which packages a run starts** is decided by `tooling/browser-projects.mjs`, which needs only
  Node and git: the workspaces that keep a browser config, and of those the ones a file of the
  diff from the pull request's base lies under. A pull request gives those, a run by hand gives
  all, a push gives none. The workflow only calls it; its 12 tests build small repositories of
  their own.
- **Three jobs:** `check`, as it was; `browser-projects`, skipped on a push; `browser`, skipped
  when no package was chosen, so such a run installs no browser.

Where it differs from the spec:

- **`playwright` is a root dev dependency too,** at the version whose Chromium vitest's provider
  starts, and the `vitest` range moved to the version already locked.
- **The scaffold copies a file that is not text byte for byte.** It read every file as UTF-8,
  which broke the template's image.
- **The template's image is a 149-byte PNG made by `ffmpeg`,** under `dev/media/`, with its line
  in the README.
- **The release walk's card** is the pool's, which each stage's walk is copied from. It gains a
  section 0 for the run by hand.

Checked:

- `npm run check` from a clean tree: 3,885 tests.
- `npm test` three times before and three after, on one machine under other load: 40.7 to
  45.8 s before, 40.8 to 48.8 s after. No difference beyond the noise.
- `npm test` twice with no browser installed, while every process under it was sampled five
  times a second: no browser process was seen.
- `npm run test:browser`: 15.3 s, of which the two tests are half a second and the build of
  what they depend on is most of the rest.
- Without the browser, `npm run test:browser` stops with the command that installs it.
- A trial made with `--url` passed its browser test with no edit, and was removed.
- The filter against this repository's history: #183 gives the URL template, and ten merges
  that touch no template give nothing.

In CI, on this pull request (#188) and a throwaway beside it (#189, closed unmerged):

- **The browser job ran the template's two tests and passed in 1 min 7 s,** with Chromium and
  its system packages installed from nothing. It runs beside `check` (2 min 18 s in the same
  run), so the pull request waited no longer for it.
- **The proof:** with one test added that plays a 1 s WebM (VP9 and Opus, 160×90) with its
  sound on and no gesture, the job printed `played clip.webm: 160×90, 1.008 s` and passed in
  53 s. Without the autoplay switch the same test fails locally with `NotAllowedError`.

After the merge:

- **The run by hand** from `main` ran every package's browser tests (the URL template's two,
  the only ones so far) and passed, its browser job in 1 min 6 s.
- **A docs-only pull request starts no browser job:** the phase's close (#191) changes only
  `docs/`; its run chose no package in 7 s and skipped the browser job.

One thing the first runs showed: each missed the cache of Chromium. A cache saved by a pull
request's run serves that pull request alone; one saved from `main` serves all, and only the
run by hand saves there. The run above saved one. Before it, each pull request's first browser
job installed Chromium, which is the minute measured above; the time with the cache is not
measured yet.

Noticed, and ruled on by Jamie at the phase's close (the [log](../../../../devlogs/stage6/followups.md#phase-2)):

- The root's browser config names its folders as globs, and `browser-projects.mjs` reads the
  workspaces. The two can drift apart.
- `npm run test:browser` builds everything `build:deps` does, for one package too.
- The words for a missing browser print once for each package, inside vitest's own error.
- `tooling/vitest.ts` and `tooling/*.test.ts` are read by no type check (the log has
  `new-format.test.ts` already).
