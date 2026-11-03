---
column: done
pr: 23
completed: 2026-11-02
created: 2026-11-02T20:14:50-07:00
tags: [formats, host-contract, major-feature]
---

# Spec: `<sheet-editor>` gains a raw view

_Landed 2026-11-02 in [#23](https://github.com/stillpointlab/surfaces/pull/23). The raw surface
stops the key, clipboard and pointer events the grid listens for at its root. Fifteen existing tests
changed with the new layout: truncated cases ask for `view="rich"`, malformed cases assert the
fallback, and End in the toolbar now lands on the switch._

_From the phase 5 brief [raw_mode](../briefs/raw_mode.md). Depends on
[raw-view-convention](raw-view-convention.md). The largest of the phase 5 specs: sheet has no raw
mode today._

## High-level goal

A sheet's CSV, or a `.sheet` document's whole source, can be viewed and edited as text, and a sheet
the grid cannot edit (it does not parse, or it exceeds the row limit) opens as text the user can
fix instead of an error message.

## Related context

- `packages/formats/sheet/src/editor/sheet-editor.ts`: `setContent(content, options)` (CSV, with an
  optional presentation override), `setDocumentSource(source, options)` (`.sheet`: frontmatter plus
  CSV), `getContent()` (the original source until rows or presentation change), `render()` (an
  invalid or truncated model renders a message or a read-only grid with a notice, and no toolbar),
  `isInteractive`, `isEditingDisabled`, the undo and redo history, and the cell draft.
- `packages/formats/sheet/src/editor/source-session.ts`: `createCsvSourceSession`,
  `createDocumentSourceSession` (each knows whether its source parsed, its errors and whether it is
  editable).
- Limits (`DEFAULT_CSV_LIMITS`): 256 KB of input, 1,000 materialised rows, 256 columns. A truncated
  sheet is at most 256 KB of text.
- Context Manager mounts `.sheet` goods through `setDocumentSource` and CSV goods through
  `setContent` (`editorContentLoader.ts`).

## Technical requirement

1. **The switch.** The toolbar gains a group at its end with the "Raw Text" switch (it joins the
   toolbar's arrow-key order). The raw view has a toolbar with only the switch. The switch stays
   enabled while `readonly`.
2. **The raw surface.** `createRawSource` with no language (plain text), holding the CSV, or the
   whole `.sheet` source including its frontmatter.
3. **The `view` capability.** `view` observed and reflected; `view-change` with reasons.
4. **Entering raw.** A cell draft is committed first (as the toolbar does), so the raw text is
   `getContent()` at that moment.
5. **Leaving raw.** After a raw edit, the text is re-parsed into a new source session of the same
   kind (CSV or document), keeping the presentation override the host passed. If it parses and is
   within the limits, the grid shows it and the undo history starts afresh. If it does not parse,
   the element stays in raw with the errors in the notice, announced. If it parses but exceeds the
   row limit, the grid shows read-only with the existing truncation notice; the user can go back to
   raw.
6. **Fallback on load.** Content that does not parse, or exceeds the row limit, opens in raw with a
   notice (the parse error, or "This sheet has more rows than the grid can edit; showing the raw
   text.") and reason `fallback`. The raw text is editable unless `readonly`.
7. **Content rules.** In raw, `getContent()` returns the text verbatim; each raw edit emits
   `content-change` with `{ content }`; `setContent` or `setDocumentSource` while raw replaces the
   text and stays raw. Switching with no edit keeps `getContent()` byte-identical (the source
   session already returns the original source while rows are unchanged).
8. **Read-only.** `readonly="true"` keeps the current view; the grid and the raw text are both
   uneditable; the switch works.
9. **Tests.** `describeRawViewContract('sheet-editor', …)` with an invalid CSV fixture. Element
   tests: a document source round-trips with its frontmatter; a presentation override survives a
   raw edit; an over-limit sheet opens in raw and shows the read-only grid when switched; a draft is
   committed on entering raw; undo history resets after a raw edit.

## Non-goals

- Syntax highlighting for CSV.
- Raising the limits, or editing an over-limit sheet in the grid.
- `<sheet-grid>` (the host does not use it).

## Acceptance / completion checklist

- [x] The raw view suite passes for `sheet-editor`.
- [x] Invalid and over-limit sheets open in raw with a notice; a failed switch back shows the errors.
- [x] CSV and `.sheet` sources round-trip byte-identically through raw with no edit.
- [x] The presentation override and the document's frontmatter survive raw edits.
- [x] `npm run check` is green; the harness's invalid and limit fixtures behave as above.

## Implementation plan

One PR after the convention lands, possibly two: the raw view and switching first, then the
load-time fallbacks for invalid and over-limit content.
