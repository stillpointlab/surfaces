---
column: done
pr: 29
completed: 2026-11-03
created: 2026-11-03T00:05:12-07:00
tags: [formats, common, host-contract]
---

# Spec: raw text keeps its line endings

_Landed 2026-11-03 in [#29](https://github.com/stillpointlab/surfaces/pull/29). The helpers are
`lineBreakOf` and `withLineBreak` in `common`. The suite's CRLF case fails for md, xmdl and sheet
with the textarea fix reverted. Context Manager removed its hydrated baseline in
context-manager#1013._

_From the Context Manager adoption of the raw view (context-manager#1009, stage 5 WAL). Touches
`common/src/raw.ts` like [raw-source-keymap-mode](raw-source-keymap-mode.md); whichever lands
second rebases._

## High-level goal

`<code-editor>`, and the raw surfaces built on it or on a textarea, return the text with the line
endings it was given. A file with CRLF line endings reads back byte-identical after load, and an
edit keeps the file's line endings. This extends the phase 5 rule that switching never changes the
text to loading and editing.

## Related context

- Follow-up to: the [raw view convention](../../phase5/specs/raw-view-convention.md) and
  [md-raw-view](../../phase5/specs/md-raw-view.md), which made md return text as set for the same
  reason.
- Depends on: nothing.
- Main files/areas: `packages/formats/code/src/editor/code-editor.ts`, `common/src/raw.ts`
  (`createRawSource`), their tests, and `common/src/testing/raw-view.ts`.

## Why

- **`<code-editor>` rewrites line endings on load.** CodeMirror splits a document on any line break
  and `doc.toString()` joins with `\n`. So `getContent()` returns CRLF text as set until the
  engine hydrates, then as LF. Context Manager keeps a "hydrated baseline" in its draft manager only
  for this. Without it, opening a CRLF code good reads as an edit and autosaves the file with LF
  line endings.
- **Raw edits rewrite the whole file.** The raw surfaces inherit the problem: one keystroke in a CRLF
  md, xmdl or sheet file's raw view rewrites every line ending.
- **The textarea fallback does the same.** A `<textarea>`'s `value` always reports LF, so
  `createRawSource`'s `getValue()` already differs from the text set, even with no edit.

## Technical requirement

1. **`<code-editor>` returns the text as set until the first user edit.** It keeps the last text
   it was given, and `getContent()` returns it until the user changes the document. This is the
   rule md follows: a `setContent` resets it.
2. **After an edit, `<code-editor>` keeps the text's line ending.** On `setContent` the element
   records the first line break in the text (`\r\n`, `\n` or `\r`, default `\n`). After an edit,
   `getContent()` and the `content-change` detail join lines with it, through
   `doc.sliceString(0, doc.length, lineBreak)`. Text with mixed line endings comes back with the
   first one throughout after an edit, which the README states. CodeMirror's default splitting
   stays, so mixed text still displays one line per break.
3. **`createRawSource`'s textarea path does the same.** `getValue()` returns the text as set until
   an input. After an input it returns `area.value` with `\n` replaced by the recorded line break,
   and `onInput` gets that text. The `<code-editor>` path inherits requirement 2.
4. **The suites check it.** `describeEditorContract` keeps its current shape. The raw view suite
   gains a CRLF case for editors: content with CRLF line endings round-trips through
   rich → raw → rich unchanged, and a raw edit keeps CRLF on every line the edit did not touch.
   Formats pass a CRLF `content` through a new optional `crlfContent` (default: `content` with its
   line breaks replaced). code-editor's own tests cover requirements 1 and 2, before and after
   hydration.

## Non-goals

- Rich editors' serialisers. md after a rich edit, or the sheet grid, write the line ending their
  serialiser writes. The sheet document session already keeps the frontmatter's line ending.
- `<code-preview>` and `<code-diff>`. They are read-only and have no `getContent`, and the diff
  already has its own whitespace option.
- A setting to convert line endings.

## Acceptance / completion checklist

- [x] `<code-editor>` returns CRLF text byte-identical after hydration, and an edit keeps CRLF on
      every untouched line.
- [x] `createRawSource` returns the text as set with no edit, on both paths, and keeps its line
      ending after an edit.
- [x] The raw view suite's CRLF case passes for md, xmdl, sheet and the template's sample editor.
- [x] The README states the rule and the mixed-ending behaviour.
- [x] `npm run check` is green.

## Context Manager follow-up (with the next pin move)

Remove the draft manager's hydrated baseline: `adoptHydratedBaseline`, `editedSinceSeed` and their
tests. `getContent()` is now stable for every format across hydration. Strike the WAL deferral and
note it in ADR-0009's phase 2 amendment, which introduced the baseline.

## Implementation plan

One PR: `<code-editor>` first with its tests, then `createRawSource`, then the suite case. Run the
harness with a CRLF fixture in md and xmdl, once with `<code-editor>` registered and once with
`?raw=plain`.
