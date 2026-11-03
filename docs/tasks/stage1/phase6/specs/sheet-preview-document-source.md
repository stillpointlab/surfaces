---
column: done
pr: 28
completed: 2026-11-03
created: 2026-11-02T23:46:29-07:00
tags: [formats, host-contract]
---

# Spec: `<sheet-preview>` takes a `.sheet` source

_Landed 2026-11-03 in [#28](https://github.com/stillpointlab/surfaces/pull/28), as specified;
`setContent`, `setDocument` and `setDocumentSource` all leave the fallback. In the harness, the two
invalid `.sheet` fixtures now show source and error in the preview where it was empty. Context
Manager's `sheetPreview.ts` stopped parsing documents in context-manager#1013._

_From the Context Manager adoption of the raw view (context-manager#1009, stage 5 WAL). Independent
of the other phase 6 spec._

## High-level goal

A host gives `<sheet-preview>` a `.sheet` document as text, as it already does for `<sheet-editor>`.
The preview shows the grid when the document parses. When it does not, the preview shows the
source with the error, and its raw view always shows the source as given.

## Related context

- Follow-up to: [preview-raw-view](../../phase5/specs/preview-raw-view.md), which left `setDocument`'s
  raw view as the document serialised, and the
  [raw view convention](../../phase5/specs/raw-view-convention.md).
- Depends on: nothing.
- Main files/areas: `packages/formats/sheet/src/preview/sheet-preview.ts` and its tests,
  `editor/source-session.ts` (how the editor parses a document source),
  `packages/formats/sheet/dev/fixtures.ts`, the sheet README.

## Why

`<sheet-preview>` takes CSV text (`setContent`) or a document that is already parsed
(`setDocument`). So a host that has a `.sheet` file must parse it first. Context Manager does, in
`src/client/utils/sheetPreview.ts`, and when the envelope does not parse it keeps its own `<pre>` of
the source with no error, outside the raw view convention. The harness has the same gap: an invalid
document fixture empties the preview. And because `setDocument` has no source text, the preview's raw
view shows the document re-serialised, which can differ from the stored file.

## Technical requirement

1. **`setDocumentSource(source, options?)`.** It parses `source` with `parseSheetDocument`, using
   the same CSV limits as `setContent`. `options.presentation` is applied over the document's
   presentation, as `setDocument` does. When parsing succeeds, the preview shows the grid, as
   `setDocument` would for the parsed document.
2. **The raw view shows the source as given.** After `setDocumentSource`, `view="raw"` shows
   `source` verbatim, frontmatter included, with no serialisation.
3. **An envelope that does not parse falls back.** The preview opens raw with reason `fallback`
   and a notice with the parse error's message, as `setContent` does for CSV that does not parse.
   It is not sticky: a later valid `setDocumentSource`, `setContent` or `setDocument` returns to
   the grid.
4. **`setDocument` stays** for a host that holds a parsed document, with its serialised raw view.
   The README says to prefer `setDocumentSource` when the host has the text.
5. **Harness.** The sheet module's document fixtures give the preview `setDocumentSource`, so an
   invalid document shows its source and error in the preview instead of an empty grid.

## Non-goals

- A shared source-session for the editor and the preview. The preview needs only the parse result,
  so reusing `parseSheetDocument` directly is enough. Hoisting the editor's
  `createDocumentSourceSession` is a separate refactor if it ever pays.
- Any change to `setContent`, the grid, or the editor.

## Acceptance / completion checklist

- [x] `setDocumentSource` renders a valid document like `setDocument`, with the override applied.
- [x] Its raw view equals the source byte for byte, CRLF included.
- [x] An invalid envelope opens raw with the parse error, and valid content afterwards returns to
      the grid.
- [x] The raw view suite still passes for `sheet-preview`; new unit tests cover the three cases
      above.
- [x] The harness's invalid document fixture shows source and error in the preview.
- [x] `npm run check` is green.

## Context Manager follow-up (with the next pin move)

`mountSheetPreview(fallback, content, 'document')` calls `setDocumentSource(content)` and no longer
imports `@stillpointlab/sheet-format/document` or throws on an invalid envelope. Its `<pre>` is then
only for a package that failed to load. Load `<code-preview>` when the preview opens raw, as the
CSV path already does. Update `sheetPreview.test.ts` and the integration test. Strike the WAL
deferral and the sheet clause in ADR-0009's phase 5 amendment.

## Implementation plan

One PR. Add `setDocumentSource` beside `setDocument`, sharing the code that applies a parsed
document. Add the unit tests, then switch the harness fixtures, and check them in Chromium.
