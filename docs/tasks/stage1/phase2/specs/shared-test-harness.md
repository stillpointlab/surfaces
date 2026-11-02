---
column: todo
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

- Jamie's note of 2026-11-02 mentions "playwright tests". The spike keeps the conformance suite on
  jsdom and leaves real-browser interaction to Context Manager's walks; this spec follows the spike.
  If the suite hits a jsdom wall (sheet clipboard is the likely first case), vitest browser mode is
  the upgrade path and is a separate decision.
- `whenReady` is required on the contract, not optional. Synchronous elements pay one line; the
  suite needs to rely on it.

## Non-goals

- Any change to what an element renders or how it edits.
- A fake `get` / `list` / `put` host; that arrives with the apps breakout and lands in the harness.
- Playwright or browser-mode tests in this repository.
- Changing Context Manager's host behaviour in this PR; item 6 is tracked on its boards.

## Acceptance / completion checklist

- [ ] `whenReady`, the `ready` attribute and the `ready` event exist on all nine elements and
      agree with each other; `packages/common/src/contracts.ts` documents the settled semantics.
- [ ] Every format runs the conformance suite for each element it ships; no element test uses
      fake timers, `_loading` pokes or sleeps to wait for hydration.
- [ ] `npm run check` is green and the vim keymap test no longer carries a widened timeout.
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
   the suite and sheds its timing workarounds; template tests switch to the suite. Verify with
   `npm run check` and by running the code-format tests ten times in the parallel configuration.
2. **Harness.** `tooling/harness/` with the Vite app and the fixtures module shape; port sheet's
   playground first (it is the acceptance test for the host), then md, code, xmdl, image; delete
   the five `dev/` folders and vite configs; template and scaffold follow; README. Verify by
   opening every format in the harness in light and dark, narrow and wide, and read-only.
