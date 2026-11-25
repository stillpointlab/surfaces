---
column: todo
created: 2026-11-25T18:00:00-07:00
tags: [dev-tooling, formats, code]
---

# Spec: browser tests in CI

_From the seed [browser tests in CI](../../phase1/seeds/browser-tests.md) and the
[media previews brief](../../phase1/briefs/media_previews.md), phase 2. One PR here, after
[the scaffold](scaffold-registrable-formats.md)._

## High-level goal

A package that needs a real browser runs its tests in one, on a laptop and in CI, by setting one
flag. The URL template sets it, so each media format scaffolded in phase 3 starts there.

## Related context

- Main files: `tooling/vitest.ts` (`formatTest({ browser: true })`, written in stage 1 and used
  by nothing), the root `package.json`, `.github/workflows/ci.yml`, `tooling/template/url-format/`.
- Why now: jsdom plays no media and draws no canvas. The image format's tests finish a load by
  dispatching the event themselves; a video's or a PDF page's cannot be faked that way and mean
  anything.
- The [streaming spike](../../phase1/spikes/a-video-player-that-streams.md) played VP9, Opus,
  H.264, AAC and MP3 in Playwright's headless Chromium on this machine.
- The [stage 5 reflections](../../../../devlogs/stage5/reflections.md) carry the agent's
  observation, proposed and not ruled on, that the checks by hand in Chromium found what the
  tests could not say, and that none of them is a test that runs again.

## Technical requirement

### 1. The dependencies and CI

- `@vitest/browser` and `@vitest/browser-playwright` at vitest's version, as root dev
  dependencies.
- CI installs Playwright's Chromium before the tests, with its system packages, and caches it by
  Playwright's version.
- `npm test` runs the browser projects with the others. A machine without the browser fails
  with words that name the command to install it.

### 2. The flag, proved on the URL template

- `tooling/template/url-format/vitest.config.ts` is `formatTest({ browser: true })`.
- Its sample element loads a real image from a file in the package, and its tests let the
  browser finish or fail the load: no dispatched `load` or `error`.
- The contract suites pass unchanged, as they were written to.

### 3. What a media test needs

So phase 3's specs can lean on it:

- **Media plays without a gesture** in the test browser (Chromium's autoplay switch, passed
  through the provider's launch options), since a test cannot click first.
- **A test reaches a file of its package by URL** (`new URL('./clip.webm', import.meta.url)`).
- **Test media is small and made by a command.** A package keeps its clips under `dev/media/`,
  each under 50 kB, with the `ffmpeg` line that made it in the package's README.

### 4. The words

The root README's testing section says which packages run in a browser, how to install it, and
that a package stays on jsdom unless it needs more.

## Non-goals

- Moving any of the five text formats, image, the apps or the hosts off jsdom or Node.
- Firefox or WebKit instances. Chromium alone, as the flag was written.
- Playwright drives of the harness or the local host in CI (the seed's second candidate).
- Screenshots as assertions.

## Acceptance / completion checklist

- [ ] CI runs the URL template's tests in headless Chromium and passes; the run's log shows the
      browser project.
- [ ] CI's time for `npm test` before and after is in the PR.
- [ ] A scaffolded `--url` format runs in the browser with no edit.
- [ ] A proof, not committed: a `<video>` in a browser-mode test plays a 1 s WebM from the
      package and reports its size, in CI (a draft PR's run is enough).
- [ ] `npm run check` passes locally with the browser installed.

## Implementation plan

1. Dependencies, the CI step and its cache.
2. The template's flag, its image file and its tests.
3. The autoplay switch and the proof run.
4. README.

### Work package

- **Owns:** `tooling/vitest.ts`, `.github/workflows/ci.yml`, the root `package.json` and
  lockfile, `tooling/template/url-format/`.
- **Must not change:** any package's tests outside the template.
- **Runs after:** [the scaffold](scaffold-registrable-formats.md).
