---
column: todo
created: 2026-08-01T22:30:57-07:00
tags: [formats]
---

# Sheet Editor Test Plan (local)

> **Moved from Context Manager, 2026-11-14 (Jamie's ruling of 2026-11-09).** This plan was written
> for the sheet format (`packages/formats/sheet`) as mounted in Context Manager. It was not signed
> off there: no box in it is ticked. Do not walk it as written: rewrite its setup and steps for the
> local host (`npm run serve`) or the harness first. Creating and linking a sheet, autosave and
> publish are Context Manager's host behaviour: keep those sections only as far as the local host
> has an equivalent. Links below point into the Context Manager repository.

Manual test pass for CSV and `.sheet` preview, selection, editing, clipboard/clear commands,
structural, text-formatting, and value-formatting controls, and host lifecycle behavior, run against
a local build. This plan covers the **99% cases**: creating and linking sheets, moving and extending
a selection, cell/structure/presentation editing, multiline cells, cross-application copy/paste,
autosave/publish, and ordinary invalid/read-only states. It deliberately does not repeat codec
boundary matrices, IME event permutations, or every merge/format partition; those are locked in by
the package's automated suite.

Feature background: [ADR-0009](https://github.com/stillpointlab/context-manager/blob/main/docs/adr/0009-pluggable-editor-types.md), the
[original sheet spike](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage3/phase7/spikes/sheet-editor.md),
[merged-cell spike](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage3/phase7/spikes/sheet-merged-cells.md),
[edit-readiness spike](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage3/phase7/spikes/sheet-edit-readiness.md), and the completed
specs for [preview](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage3/phase7/specs/sheet_editor_preview.md),
[merge presentation](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage3/phase7/specs/sheet_merge_presentation.md),
[`.sheet` v1](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage3/phase7/specs/sheet_document_v1.md),
[interaction](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage3/phase7/specs/sheet_editor_interaction.md),
[CSV editing](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage3/phase7/specs/sheet_editor_csv_edit.md),
[caret editing](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage3/phase7/specs/sheet_editor_caret_edit.md), and
[host adoption](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage3/phase7/specs/sheet_editor_host_adoption.md),
[`.sheet` host adoption](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage3/phase7/specs/sheet_document_host_adoption.md), and
[structural-toolbar host adoption](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage3/phase7/specs/sheet_structure_toolbar_host_adoption.md),
[formatting toolbar](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage3/phase7/specs/sheet_editor_formatting_toolbar.md),
[value formatting](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage3/phase7/specs/sheet_editor_value_formatting.md), and
[cell clipboard and clear commands](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage3/phase7/specs/sheet_editor_clipboard_clear.md).

## Setup (once)

Follow [smoke-test.md](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage1/phase12/tests/smoke-test.md) steps 1–4 for a clean local
build, then start the app and sign in.

- [ ] Connect a project to the `stillpointlab/scratch` repository. Confirm its
      `fixtures/sheets/inventory.csv` and `fixtures/sheets/edge-cases.csv` files are visible after
      repo Refresh.
- [ ] Create one local digital good using **New Digital Good → Sheet (CSV)** and name it
      `manual-sheet.csv`.
- [ ] For package-only merge and failure fixtures, run
      `npm run dev --workspace @stillpointlab/sheet-editor` and open the Vite URL it reports.
- [ ] Keep browser DevTools available to check focus, the saved/dirty indicator, console errors, and
      downloaded source when a result is ambiguous.
- [ ] Keep one external spreadsheet application available for TSV interoperability checks; run the
      focused clipboard pass in Firefox, Chromium, and Safari where those browsers are available.

---

## 1. Happy paths

### 1A. Repository CSV preview and link

- [ ] Select `fixtures/sheets/inventory.csv` in the repo tree → the preview is an addressed sheet
      with column letters and row numbers, not raw comma-delimited text.
- [ ] The preview preserves `Widget, Deluxe` as one cell, renders `Café Mug` correctly, and displays
      `=SUM(D2:D5)` as literal text without evaluating it.
- [ ] Row gutters are compact (roughly four small digits wide, not a 160 px data column), row height
      is about 20 px, and cell padding/type remain spreadsheet-dense at normal browser zoom.
- [ ] Link/Edit the file → one stable `text/csv` digital good opens in `<sheet-editor>` with A1
      active; returning to the repo and choosing Edit reopens the same good rather than duplicating
      it.
- [ ] Select `fixtures/sheets/edge-cases.csv` → columns continue through `AB`; quoted commas,
      doubled quotes, the embedded newline, ragged final rows, and literal `<script>` text render
      safely in their expected cells.

### 1B. Selection and movement

- [ ] In `manual-sheet.csv`, A1 is selectable even though the source is empty; arrow movement into
      virtual cells does not mark the document dirty.
- [ ] Enter a small 3×3 table, then use each arrow key → the active outline moves one cell without
      wrapping and clamps at the top/left edge.
- [ ] Hold Shift while moving right and down → one rectangular range is highlighted; reverse the
      direction → the range shrinks while its original anchor remains fixed.
- [ ] Click a cell, then drag across several cells and release just outside the last cell → the same
      rectangular selection remains and keyboard movement continues from its active end.
- [ ] Tab from the sheet → focus leaves the component normally rather than being trapped in every
      cell.

### 1C. Quick edit

- [ ] Select a populated cell and press Enter → an input opens with the exact existing value; change
      it and press Escape → the prior value/source returns and focus returns to that cell.
- [ ] Type a printable character while navigating → it replaces the active value and begins quick
      edit; Enter commits and selects the next cell down; Shift+Enter commits and selects up.
- [ ] In quick edit, change a value and press each unmodified arrow direction → the value commits
      once and selection moves in that direction.
- [ ] Change a value and click another cell → the edit commits before the destination becomes
      active. Change another value and click outside the editor → it commits before focus leaves.
- [ ] Enter `0012`, surrounding whitespace, and `=A1+1` in separate cells → values remain literal
      strings with no trimming, coercion, or formula evaluation.
- [ ] In navigation mode, Ctrl/Command+Z undoes the last committed cell transaction and redo
      restores it; selection-only movement creates no undo entry.

### 1D. Caret edit and multiline cells

- [ ] Select a populated cell and press F2 → caret edit opens at the end of the exact value.
      Double-clicking another cell selects it and opens the same caret mode.
- [ ] In caret mode, Left/Right/Up/Down, Home/End, Shift-selection, clipboard shortcuts, and native
      textarea undo affect text/caret state and never move the grid selection.
- [ ] Place the caret in the middle of a value and press Alt/Option+Enter → exactly one line break
      is inserted, the caret stays after it, and the editor remains open.
- [ ] Press Enter → the multiline value commits and selection moves down. Reopen the cell and verify
      both lines remain; project preview and a downloaded CSV preserve them as one quoted field.
- [ ] Start another multiline change and press Escape → the full pre-edit value is restored,
      including removal of newly inserted line breaks.

### 1E. Draft, publish, preview, and download lifecycle

- [ ] While an in-cell draft is still open, type a change → the host dirty/saved indicator updates;
      after autosave, refresh/reopen and verify the visible draft content was not lost.
- [ ] Publish `manual-sheet.csv` → the new version contains the edited CSV; subsequent edits create
      a draft without changing the published preview until published.
- [ ] Project preview renders the published good as a sheet. If made public and pinned to a library,
      those read-only surfaces also enhance to a sheet while retaining a safe text fallback if the
      package load is blocked.
- [ ] Copy/download uses the current exact CSV content, `text/csv`, and a `.csv` filename; it does
      not add formula escaping or a BOM that was not already present.
- [ ] Edit the linked scratch CSV, check it in, inspect the PR's text diff, merge it, and Refresh →
      the normal repo lifecycle clears/releases the local state without losing the edited cell.

### 1F. Merged movement in the package harness

- [ ] In the sheet-editor harness, select each **Horizontal merge**, **Vertical merge**, and
      **Rectangle merge** fixture → preview, grid, and editor show one native spanned anchor and do
      not hide a non-empty covered value.
- [ ] From each merged anchor, arrows move beyond the merge's full edge; movement from a
      neighbouring cell into the merge lands on its top-left anchor. Shift+Arrow and pointer drag
      never leave only part of a merge selected.
- [ ] Enter/F2 edits only the merge anchor; Enter or an arrow commits and moves beyond the merged
      unit in the requested direction.
- [ ] Toggle narrow width and dark theme → focus, selected range, cell text, gutters, and the edit
      control remain legible and aligned while scrolling.

### 1G. Structural toolbar and source lifecycle

- [ ] Open an empty `manual-sheet.csv`; invoke add row above/below, add column before/after, delete
      row, and delete column. Undo and redo representative operations, reload, and confirm the
      resulting structure survives.
- [ ] Paste or open a ragged CSV, then insert and delete columns around its short rows → existing
      values shift to the intended coordinates, blank fields remain present in copied/downloaded CSV
      source, and reload/bfcache restoration shows the same grid.
- [ ] Link a repository `.sheet` fixture containing horizontal, vertical, and rectangular merges.
      Insert/delete rows and columns across and around the merges, then inspect the saved draft, raw
      diff, and check-in source → complete envelope and data remain intact and every affected merge
      has the expected adjusted A1 range.
- [ ] For both `text/csv` and `application/vnd.stillpoint.sheet`, make a structural change and wait
      for autosave; then publish, reload, use browser back/forward restore, copy, and download. The
      copied/downloaded source exactly matches the current draft, with `.csv` + `text/csv` versus
      `.sheet` + `application/vnd.stillpoint.sheet` metadata.
- [ ] Tab into the toolbar and traverse it by keyboard; visible focus and accessible control names
      are clear. On a dormant good every structural control is disabled and an open edit is
      cancelled when read-only state takes effect.
- [ ] In light and dark themes and a narrow resized split pane, the toolbar stays inside the editor
      surface while the grid scrolls horizontally and vertically beneath it; no page-level
      horizontal scrollbar appears and the toolbar itself does not scroll away.
- [ ] Recheck project, repository-file, public-share, and pinned-library preview surfaces → each
      renders `<sheet-preview>` only, with no toolbar or mutation controls and no eager editor load.

### 1H. `.sheet` formatting and alignment lifecycle

- [ ] Link a repository `.sheet` containing a merged heading plus overlapping `formats` and
      `alignments` rules. Editor and repository/project/public/library previews show the same bold,
      italic, strikethrough, horizontal, and vertical presentation while preserving literal cell
      text; preview surfaces contain no toolbar.
- [ ] In the `.sheet` editor, verify the toolbar order is Bold, Italic, Strikethrough, horizontal
      alignment, vertical alignment, the five value-format controls, then the six structural
      controls. Select homogeneous and mixed rectangles and confirm the emphasis state and the two
      current/mixed alignment icons follow the complete selection without marking source dirty.
- [ ] Open both alignment flyouts by pointer and keyboard. Exercise Up/Down, Home/End, Enter/Space,
      Escape, Tab, and outside click; only one menu remains open, checked state is accurate, focus
      returns predictably, and the logical grid selection is unchanged.
- [ ] Apply emphasis and both alignment axes to ordinary, ragged, and merged selections, then insert
      and delete a row/column through the styled ranges. Values and ragged row shapes remain intact,
      the merged selection formats as one expanded unit, and the saved A1 rules move/expand/contract
      with the structure.
- [ ] Wait for autosave, reload and exercise a browser back/forward restore, publish, inspect the
      raw diff, copy, download, and check in the repository good. Every surface carries the same
      complete `.sheet` string, including canonical `presentation.formats`/`alignments`, and the
      check-in PR contains that exact YAML plus CSV body.
- [ ] Open the same valid document as a dormant/read-only good → all sixteen controls remain visible
      and disabled. In light/dark themes and a narrow split pane, pressed/mixed/focus states remain
      legible, the toolbar scrolls horizontally within the editor when needed, the grid scrolls
      independently below it, and no page-level horizontal overflow appears.
- [ ] Open an ordinary CSV editor → only the six structural controls exist. Selecting cells, using
      every visible control, undoing, autosaving, copying, and downloading never adds YAML or any
      formatting, alignment, or value-format source channel.

### 1I. Cell clipboard and clear lifecycle

- [ ] In both CSV and `.sheet` editors, copy forward- and reverse-selected rectangles into an
      external spreadsheet and paste them back at another selection. Tabs, multiline/quoted cells,
      leading zeroes, surrounding whitespace, literal HTML, and formula-looking text remain literal;
      paste starts at the selection's top-left and does not tile to fill a larger selection.
- [ ] Cross-copy between CSV and `.sheet`, including ragged and virtual edges. Non-empty missing
      destinations materialize with only necessary padding, blank clipboard cells clear existing
      values without creating empty trailing structure, and `.sheet` formats, alignments, and value
      formats never travel with copied values or change at the destination.
- [ ] Copy and paste a complete merged selection, then try a non-empty value over a covered merge
      coordinate. The anchor-plus-empty-covered matrix succeeds, the invalid matrix is refused
      atomically, and the merge, emphasis, alignment, value format, selection, focus, and scroll
      position remain intact.
- [ ] Press Delete and Backspace on single, rectangular, ragged, virtual, formatted, and merged
      selections. Only cell values clear; explicit trailing fields and row lengths remain, while the
      toolbar's Delete row/column controls retain their structural behavior.
- [ ] Undo and redo representative paste and clear operations, then autosave, reload, use
      back/forward restoration, publish, inspect the raw diff, download, and check in each content
      type. Every host path receives one complete current CSV or `.sheet` string and undo to the
      baseline restores the exact originally loaded bytes.
- [ ] Compare focused grid Ctrl/Command+C with **Copy Contents** in the editor settings: grid copy
      contains only the selected TSV values, while Copy Contents and download contain the complete
      current file, including `.sheet` YAML. In a dormant/read-only editor grid copy still works but
      paste, Delete, and Backspace do not mutate; inside quick/caret textareas all clipboard and
      deletion behavior remains native.

### 1J. `.sheet` value-formatting lifecycle

- [ ] Link a repository `.sheet` whose overlapping `valueFormats` cover Number, Currency, Percent,
      Date, Time, and Date time. Editor and repository/project/public/library previews render the
      same fixed `en-US` values; an Automatic cell and incompatible text show their exact raw text,
      safely, with no inferred type or error markup.
- [ ] Exercise Currency, Percent, Decrease decimal places, Increase decimal places, and every Value
      format flyout choice on single and rectangular selections. Navigation shows formatted text;
      Enter/F2 editing and focused grid copy expose the exact raw strings, including leading zeroes,
      whitespace, and formula-looking text, and committing an edit reapplies its display format.
- [ ] Select homogeneous and mixed kind/precision ranges, then operate the Value format flyout by
      pointer and keyboard using Up/Down, Home/End, Enter/Space, Escape, Tab, and outside click.
      Current/mixed labels, checked state, focus return, one-open-menu behavior, logical selection,
      and disabled decimal bounds remain correct without a selection-only source change.
- [ ] Apply formats across horizontal/rectangular merges and missing fields in ragged rows, then
      insert and delete rows/columns through those ranges. Complete merge-expanded selections are
      formatted without materializing missing values, and canonical A1 rules transform with the
      structure while unrelated presentation and raw row shapes remain intact.
- [ ] Undo and redo raw edits and value-format commands independently; then autosave, reload, use
      browser back/forward restoration, publish, inspect the raw diff, use Copy Contents, download,
      and check in. Each host path carries the same complete `.sheet` bytes, including
      `presentation.valueFormats` and the unchanged raw CSV body, and undo to baseline restores the
      originally loaded source exactly.
- [ ] Open the document dormant/read-only, in light and dark themes, and in a narrow split pane. All
      five value-format controls remain visible and disabled when read-only; display text, flyout
      labels, mixed/checked/focus states, independent toolbar/grid scrolling, and preview parity
      stay legible without page-level overflow or eager editor loading on preview-only surfaces.
- [ ] Repeat selection, structural edits, undo, autosave, copy, download, preview, and reload in an
      ordinary CSV good. Only the six structural controls exist—there is no value-format trigger,
      flyout, or action—and the source remains exact CSV with no YAML, metadata, or side channel.

## 2. Ordinary error paths

- [ ] Harness **Malformed CSV** and **Over 256 KiB** fixtures show an accessible error and cannot
      enter edit; **1,001 rows** remains readable with a truncation notice but cannot mutate or
      serialize only the visible prefix.
- [ ] Harness **Rejected merge fallback** shows the complete unmerged table plus its diagnostic;
      selection remains usable and no covered value disappears.
- [ ] Set a sheet editor/read-only host state where available → selection/content remain readable,
      Enter/F2/typing do not open an edit, and changing to read-only during a draft cancels rather
      than committing an accidental value.
- [ ] Block the lazy sheet-editor module in DevTools and load project/public/library CSV preview →
      escaped source remains readable, literal HTML does not execute, and the failure follows the
      existing client error path rather than blanking the page.
- [ ] A repo CSV that is malformed or exceeds current edit limits may still preview safely, but Link
      is rejected with the sheet-not-editable error and creates no partial DigitalGood.
- [ ] Open malformed or unsupported `.sheet` source → the complete source remains recoverable and an
      accessible diagnostic is shown; no structural or formatting control can serialize a partial
      table or silently discard the document envelope/presentation block.

## 3. End-to-end sweep

- [ ] Link `fixtures/sheets/inventory.csv` → move to the Deluxe Widget row → quick-edit `on_hand`
      and commit right → F2-edit notes, insert an Alt/Option+Enter line break, and commit down →
      verify autosave → check in → inspect the preview/download → merge and Refresh. The
      comma-bearing name, Unicode, formula-like text, multiline note, and untouched rows all survive
      as literal CSV values, and keyboard focus remains on the expected cell after every edit
      transition.

---

## Sign-off

- [ ] All sections above pass, or every failure is filed as an issue or follow-up WAL bullet before
      sheet editing and presentation authoring are treated as complete.
