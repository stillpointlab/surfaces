---
column: todo
created: 2026-11-02T20:14:50-07:00
tags: [formats, host-contract]
---

# Spec: md, xmdl and sheet previews adopt the raw view

_From the phase 5 brief [raw_mode](../briefs/raw_mode.md). Depends on
[raw-view-convention](raw-view-convention.md)._

## High-level goal

Every preview of a text format can show its source on request, and shows it, with the errors,
whenever its content does not parse, so a host never needs its own source fallback.

## Related context

- `packages/formats/md/src/preview/md-preview.ts` (Markdown always renders; no source view).
- `packages/formats/xmdl/src/preview/xmdl-preview.ts`: `renderInvalidState` already shows the errors
  and the source in a `<pre>`.
- `packages/formats/sheet/src/preview/sheet-preview.ts`: `setContent` parses CSV and an invalid
  model renders only an error message; `setDocument` takes an already-parsed document.
- Context Manager's fallbacks this replaces for parse failures: `src/client/utils/sheetPreview.ts`
  and `xmdlPreview.ts` (they keep the "package failed to load" case).

## Technical requirement

1. **The `view` capability on all three previews.** `view` observed and reflected; `view="raw"`
   shows the source read-only through `createRawView` (`<code-preview>` with `markdown`, `yaml` or
   no language when registered, else a `<pre>`); `view-change` with reasons. Previews have no switch:
   the host decides whether to offer one.
2. **Parse failure shows the source.** xmdl-preview and sheet-preview (`setContent`) show the raw
   view with a notice listing the errors, reason `fallback`, instead of their current invalid
   states. xmdl's `renderInvalidState` goes.
3. **Content rules.** The raw view shows the text exactly as set. A later `setContent` updates
   whichever view is showing; a preview in fallback that receives valid content returns to the
   rendered view only if the host had not asked for raw (fallback is not sticky for previews, since
   the user cannot fix the text there).
4. **Tests.** `describeRawViewContract(tag, { kind: 'preview', … })` for all three, with invalid
   fixtures for xmdl and sheet. md-preview's case also checks a document with frontmatter shows it
   in raw.

## Non-goals

- A switch inside previews.
- `<code-preview>` and `<code-diff>`, which already show source; `<image-preview>`.
- `sheet-preview.setDocument` fallbacks (its input is already parsed).

## Acceptance / completion checklist

- [ ] The raw view suite passes for `md-preview`, `xmdl-preview` and `sheet-preview`.
- [ ] Invalid xmdl and CSV show the source and errors in the standard notice.
- [ ] `npm run check` is green; the harness's Raw control drives each preview.

## Implementation plan

One PR after the convention lands; it can run in parallel with the editor specs.
