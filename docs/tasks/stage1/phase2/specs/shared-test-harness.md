---
column: in-progress
pr: 4
created: 2026-11-02T13:05:00-07:00
tags: [dev-tooling, formats, host-contract, common, scaffold]
---

# Spec: the ready signal, one playground host, and the contract conformance suite

## High-level goal

Every surface element can say when it is settled, one playground host under `tooling/` replaces
the five `dev/` folders, and a conformance suite in `common` proves each element honours the host
contract. The template starts from both. Context Manager compiles unchanged and gains the signal
for free.

## Related context

- Spike: [shared-test-harness](../spikes/shared-test-harness.md), including the 2026-11-02 addendum
  on the ready signal. No brief: one spec, no user-facing change in the host.
- Depends on: stage 1 phase 1 (`packages/common`, the three entry points, the template).
- Architecture (Context Manager, private):
  [ADR-0009](https://github.com/stillpointlab/context-manager/blob/main/docs/adr/0009-pluggable-editor-types.md)
  (the contract; takes an amendment line for `whenReady`),
  [ADR-0035](https://github.com/stillpointlab/context-manager/blob/main/docs/adr/0035-surfaces-monorepo.md).
- Seeds this advances: [one scaffold for formats and apps](../../../unassigned/seeds/one-scaffold-for-formats-and-apps.md)
  (the harness is where a fake `get` / `list` / `put` host will go when apps arrive).
- Main files/areas: `packages/common/src/contracts.ts` (+ a ready gate and the conformance suite),
  every element under `packages/formats/*/src/{editor,preview,diff,grid}/`, `packages/formats/*/dev/`
  (removed) and `vite.config.ts` (removed), `tooling/harness/` (new), `tooling/template/format/`,
  `tooling/new-format.mjs`, root `package.json` and README.

## Technical requirement

1. **The ready signal, settled semantics.** `PreviewElement` gains `whenReady(): Promise<void>`,
   inherited by `EditorElement`; `ImagePreviewElement` and `DiffElement` gain the same member. It
   resolves once the element is hydrated _and_ the most recent `setContent` (`setSource`,
   `setContents`) has reached the DOM; a later call supersedes an earlier one the way
   `md-preview`'s render token already does. Synchronous elements return a resolved promise. The
   promise is per connection cycle: a disconnect that tears down the view resets it. Two
   companions: a reflected boolean `ready` attribute (present when settled, removed while pending)
   and a `ready` `CustomEvent` dispatched each time the element settles. Decision recorded in the
   spike: settled, not loaded; a "loaded" event can be added later if anyone needs it.
2. **A gate helper in `common`.** `createReadyGate()` (name open) returning `{ whenReady, begin,
settle, reset }` plus the attribute and event plumbing, so the six asynchronous elements
   (`md-editor`, `md-preview`, `code-editor`, `code-preview`, `code-diff`, `image-preview`) and the
   three synchronous ones (`sheet-editor`, `sheet-preview`, `sheet-grid`; `xmdl-editor`,
   `xmdl-preview`) implement it the same way. `common` still ships no elements.
3. **The conformance suite in `common`.** Exported from a `./testing` subpath so it never lands in
   a runtime bundle: `describePreviewContract(tag, fixture)`, `describeEditorContract(tag, fixture,
options)`, `describeImagePreviewContract`, `describeDiffContract`. Each is a vitest `describe`
   block run inside the format's own vitest project, on jsdom, and asserts: `whenReady` resolves
   and the attribute and event agree with it; set then read back round-trips after `whenReady`;
   `content-change` fires on an edit with `{ content }` and not on `setContent`; a second
   `setContent` with the same content is idempotent; `readonly` is honoured; keymap-mode results
   match the contract where supported; disconnect then reconnect settles again. Every format runs
   the suite for each element it ships; existing timing workarounds in the element tests
   (`useFakeTimers` with `_loading` pokes, the sleeps in `md-preview.test.ts`, the 4 s vim wait)
   are replaced by `await el.whenReady()`.
4. **One playground host.** `tooling/harness/` is a single Vite app (one port, the root README's
   table collapses to it) that mounts any format from the format's `dev/fixtures.ts`: a default
   export of `{ elements: { editor?, preview?, extra? }, fixtures: Record<name, string>, controls?
}`. The host provides what only sheet has today: editor beside preview, fixture picker,
   read-only toggle, narrow-pane toggle, light/dark with the `common` tokens, source readback, a
   settled indicator driven by `whenReady`. Sheet's 27 fixtures and its three `.sheet` document
   paths move into its `fixtures.ts` unchanged; its extra `setDocument` path is a `controls` hook,
   which is the pattern for anything beyond the contract. `npm run dev` at the root starts the
   host; `npm run dev` in a package starts it pointed at that package.
5. **Template and scaffold.** `tooling/template/format` loses `dev/` and `vite.config.ts`, gains
   `dev/fixtures.ts` and runs the conformance suite as its element tests; `new-format.mjs` stops
   allocating a port.
6. **Context Manager follow-ups, tracked there:** bump the submodule pin; ADR-0009 amendment;
   optionally take the draft-manager baseline after `whenReady`, apply the stored keymap
   preference after it, and have the e2e walk wait on `[ready]`. The host must not await
   readiness before its first `setContent`.

## Clarifications

- **jsdom now, browser mode per package when earned.** Jamie's note of 2026-11-02 mentioned
  "playwright tests" with the longer view in mind: more complex image, video and audio editors,
  and a repository that stands on its own so anyone can take one surface into their own project.
  jsdom has no layout, computed styles, canvas, media playback, real clipboard, IME or pointer
  gestures, so it tests the wrapper of a media editor and nothing that matters; those need a real
  browser. The path that does not fork the suite is vitest's browser mode (on this vitest 5 line,
  `@vitest/browser` plus `@vitest/browser-playwright` and a Chromium install in CI), which runs
  the same test files in headless Chromium. So: testing is chosen per package through
  `formatTest({ browser: true })`, the five text formats stay on jsdom, nothing is added to the
  dependency graph until a package needs it, and the first media editor (or sheet's clipboard
  tests, if they move here first) flips the flag and CI gains Chromium then. Jamie, 2026-11-02:
  "stick with testing per project and keep the playground separate from that concern until we
  have an explicit reason."
- **Environment-agnostic tests, as a requirement.** The conformance suite and every element test
  must pass unchanged under either environment: no fake timers on hydration, no private-field
  pokes, no jsdom-specific stubs. The settled `whenReady` is what makes that possible.
- **The playground is not a test runner.** `tooling/harness/` is for hands and eyes; it is not
  wired into vitest or Playwright. If screenshot comparison or page-level walks are ever wanted
  here, that is a new decision with its own reason.
- `whenReady` is required on the contract, not optional. Synchronous elements pay one line; the
  suite needs to rely on it.

## Non-goals

- Any change to what an element renders or how it edits.
- A fake `get` / `list` / `put` host; that arrives with the apps breakout and lands in the harness.
- Adding `@vitest/browser`, Playwright or a Chromium install to this repository now; browser mode
  is a per-package switch for a package that needs it.
- Visual regression or page-level e2e against the harness.
- Changing Context Manager's host behaviour in this PR; item 6 is tracked on its boards.

## Acceptance / completion checklist

- [ ] `whenReady`, the `ready` attribute and the `ready` event exist on all nine elements and
      agree with each other; `packages/common/src/contracts.ts` documents the settled semantics.
- [ ] Every format runs the conformance suite for each element it ships; no element test uses
      fake timers, `_loading` pokes or sleeps to wait for hydration.
- [ ] `npm run check` is green and the vim keymap test no longer carries a widened timeout.
- [ ] The conformance suite was run once under vitest browser mode locally (dependencies not
      committed) and the result is recorded in the first PR, so `formatTest({ browser: true })` is a
      proven switch and not a promise.
- [ ] `packages/formats/*/dev/index.html`, `dev/main.ts` and `vite.config.ts` are gone; each
      format has `dev/fixtures.ts`; sheet's fixture list is intact in the harness.
- [ ] `npm run dev` at the root and in any package opens the harness; the README port table is
      replaced by one port and the harness section.
- [ ] A format scaffolded by `npm run new-format` runs the suite and appears in the harness with
      no edits beyond its name.
- [ ] Context Manager follow-ups are listed in its stage 5 WAL with a link to this spec.

## Implementation plan

Two PRs, in order, so the host can take the pin after the first without waiting for the second:

1. **Signal and suite.** Gate helper and contract change in `common`; `whenReady` on the nine
   elements; the `./testing` subpath with the four `describe*Contract` suites; each format adopts
   the suite and sheds its timing workarounds; template tests switch to the suite; `formatTest()`
   accepts `browser: true` and documents what a package must add to use it. Verify with
   `npm run check`, by running the code-format tests ten times in the parallel configuration, and
   by one local run of the suite under browser mode, recorded in the PR.
2. **Harness.** `tooling/harness/` with the Vite app and the fixtures module shape; port sheet's
   playground first (it is the acceptance test for the host), then md, code, xmdl, image; delete
   the five `dev/` folders and vite configs; template and scaffold follow; README. Verify by
   opening every format in the harness in light and dark, narrow and wide, and read-only.
