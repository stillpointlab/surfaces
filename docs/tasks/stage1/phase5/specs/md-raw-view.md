---
column: done
pr: 22
completed: 2026-11-02
created: 2026-11-02T20:14:50-07:00
tags: [formats, host-contract]
---

# Spec: `<md-editor>` adopts the raw view convention

_Landed 2026-11-02 in [#22](https://github.com/stillpointlab/surfaces/pull/22). The six normalising
samples round-trip byte-identically. A failed engine load opens raw with a warning notice, and
switching back retries the load. Read-only no longer leaves raw, per the brief's decision._

_From the phase 5 brief [raw_mode](../briefs/raw_mode.md). Depends on
[raw-view-convention](raw-view-convention.md)._

## High-level goal

md-editor's raw mode follows the convention, and switching views never changes the text: the
Markdown a host sets is what it reads back, and what raw shows, until the user edits in the rich
view.

## Related context

- Raw mode today: `toggleRawMode`, `updateViewMode`, `handleRawInput` and `renderRawModeToolbar` in
  `packages/formats/md/src/editor/prosemirror-editor.ts`; the toolbar's switch in
  `prosemirror-toolbar.ts` (`mountRawSwitch`).
- **Normalisation, measured 2026-11-02.** md-editor rewrites Markdown on load, before any edit:
  `__b__` becomes `**b**`, `*` bullets become `-`, `1)` becomes `1.`, runs of blank lines collapse, a
  trailing two-space hard break becomes `\`, and the trailing newline is dropped. `getContent()`
  after hydration returns the rewritten text, and raw mode shows it. This is why Context Manager
  adopts a "hydrated baseline" in its draft manager (CM PR 993). Frontmatter already round-trips
  byte-identically.
- Other differences from the convention: the switch reads "Raw" in rich mode and "Markdown" in raw
  mode and is on in rich mode; leaving raw emits a second `content-change`; `readonly` leaves raw
  mode and blocks entering it; a failed engine load shows an error placeholder.

## Technical requirement

1. **Text as set until the first rich edit.** The element keeps the last text it was given (by
   `setContent` or a raw edit) and returns it from `getContent()` until a user edit changes the
   ProseMirror document; from then on it returns the serialiser's output, as now. A `setContent`
   resets this. So does leaving raw after a raw edit, since the raw text becomes the text as set.
   Entering raw shows `getContent()`, so a rich → raw → rich round trip with no edit is
   byte-identical, and so is load → `getContent()`.
2. **The switch.** One "Raw Text" switch from `common` (`RAW_VIEW_LABEL`), checked in raw, as the
   last control of the rich toolbar and the only control of the raw toolbar. The "Raw" and
   "Markdown" labels go. It stays enabled while `readonly`.
3. **The raw surface.** `createRawSource({ language: 'markdown', … })` replaces the element's own
   textarea, so a host that registered `<code-editor>` gets CodeMirror with Markdown highlighting.
4. **The `view` capability.** The element observes `view`, reflects it, and dispatches
   `view-change` with the right reason, following the convention's rules.
5. **Content events.** Each raw edit emits `content-change` with `{ content }`; leaving raw emits
   nothing more.
6. **Read-only.** `readonly="true"` keeps the current view. In raw the text is read-only; in rich,
   as now. Entering and leaving raw stay possible. This reverses PR 11's "leave raw on readonly",
   per Jamie's decision.
7. **Engine failure falls back to raw.** If ProseMirror fails to load, the element shows the raw
   view (editable unless read-only) with a notice ("The rich editor could not load; showing the raw
   text.") and reason `fallback`, instead of the error placeholder. Switching to rich retries the
   load; if it fails again the element stays in raw with the notice. Markdown always parses, so md
   has no parse-failure fallback.
8. **Tests.** `describeRawViewContract('md-editor', …)` in `src/contract.test.ts` with an
   `editRaw` hook. Element tests: the six normalisation samples above round-trip byte-identically
   through load, raw and back; the first rich edit switches `getContent()` to serialiser output;
   engine failure (the existing mocked-import test) lands in raw with the notice; the readonly test
   from PR 11 is updated for the new rule.

## Non-goals

- Making the serialiser itself lossless. After a rich edit, normalisation still happens; that is a
  property of the Markdown model.
- Context Manager's hydrated-baseline code. It becomes a no-op once `getContent()` is stable and can
  be removed in the CM follow-up.

## Acceptance / completion checklist

- [x] The raw view suite passes for `md-editor`.
- [x] The six samples round-trip byte-identically; `getContent()` after load equals the text set.
- [x] One "Raw Text" switch, on in raw, enabled while read-only; no "Markdown" label.
- [x] Raw uses `<code-editor>` when registered (checked in the harness both ways).
- [x] Engine failure lands in raw with the notice; switching back retries.
- [x] `npm run check` is green.

## Implementation plan

One PR after the convention lands: text tracking first (with the normalisation tests), then the
switch and raw surface, then `view` and events, then read-only and the engine fallback.
