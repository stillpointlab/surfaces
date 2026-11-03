---
column: done
completed: 2026-11-02
created: 2026-11-02T20:02:17-07:00
tags: [formats, host-contract, common, major-feature]
---

> A brief captures the _why_ and the desired outcome before any task breakdown exists. Keep it short
> — one page. Specs derived from it live in the sibling `specs/` folder, built from
> `spec.template.md`. The `column:` frontmatter above drives this file's card on the task board.

# Brief: raw mode, one convention for every text format

_Drafted by the claude agent from Jamie's direction and the phase 4 spike
[shared-element-patterns](../../phase4/spikes/shared-element-patterns.md) (finding 4, with the eight
open decisions). A brief rather than a straight spec because the work splits into several specs and
changes what users see and what a host or agent can ask for._

## Decisions (Jamie, 2026-11-02, on PR 19)

- **Label: "Raw Text"**, on means raw, the same switch in every editor. xmdl's "Apply Mode" switch
  was the same toggle under another name with the sense inverted (on meant the apply view); it
  becomes "Raw Text".
- **Host handle: the `view` attribute and the `view-change` event**, as recommended.
- **Fallback: yes**, on parse failure, engine failure and the sheet row limit. And when the user
  edits raw text and tries to switch back while it still does not parse, the element stays in raw
  and shows the updated parse errors.
- **Read-only does not force raw.** A read-only editor behaves like a preview: the rich view by
  default, the switch still usable to view the raw text, and neither view editable.
- **Switching never changes the text.** md has bugs here (it normalises Markdown on load, before any
  edit); the principle stands and the md spec fixes them.

The open questions below are kept as asked; the specs in `../specs/` carry the answers.

## High-level goal

Every custom editor over a text format can show and edit its source as plain text, and every
preview can show its source, through one convention: the same switch, the same host handle, the
same content rules, and the same automatic fallback when the rich view cannot show the content.

## Background

Jamie, 2026-11-02: "In any case where the backing format is text (code, md, xml, yaml, etc) where we
have a custom editor I would like a raw mode fallback. And this should follow the same conventions
across format editors/previews."

What exists today (measured in the spike, and after phase 4):

- **md-editor** has raw mode with its own textarea. Its switch is labelled "Raw" in rich mode and
  "Markdown" in raw mode, and is _on_ in rich mode, so a screen reader now announces "Raw, checked"
  while the user edits rich text. `content-change` fires on every raw keystroke and again on
  leaving raw. Setting `readonly` leaves raw mode. A failed engine load shows an error message.
- **xmdl-editor** has raw mode through `<code-editor>` when the host registered it, else a
  textarea. Its switch is "Apply Mode", _on_ in apply mode. `readonly` keeps raw mode and makes the
  source read-only. Invalid XMDL shows an error list without the source.
- **sheet-editor** has no raw mode. Invalid CSV shows only an error message, and a sheet over the
  row limit is read-only with a notice. Neither lets the user fix the text in place.
- **Previews.** xmdl-preview shows the source beside its errors when the template is invalid.
  md-preview and sheet-preview never show source.
- **Context Manager** has no raw mode of its own. It keeps per-format `<pre>` source fallbacks for
  previews in its own code (`sheetPreview.ts`, `xmdlPreview.ts`), never registers `<code-editor>`
  on xmdl pages (so production raw XMDL is always the bare textarea), and hooks markdown copy into
  md-editor's `.ProseMirror` root.

Why it matters beyond convenience: invalid content strands the user (the text is the only thing
they could fix, and it is hidden); raw is the lossless path where the rich editor normalises (the
reason for Context Manager's hydrated-baseline adoption); and an engine that fails to load should
leave the text, not a message.

## Desired outcome

- md, xmdl and sheet editors each have a "Raw" switch at the end of their toolbar, on in raw mode,
  built from `common`'s `createSwitch`.
- Content that the rich view cannot show (it does not parse, or the engine failed to load) opens in
  raw mode with a notice saying why, and the user can fix it there.
- A host can open any of these editors or previews in raw mode and learn when the mode changes.
- md, xmdl and sheet previews show their source on request and when the content does not parse.
- One conformance suite proves the convention for every format that has raw mode, and the harness
  can drive it.
- Code's elements need nothing: they are the raw view. Image is out of scope (binary; an SVG source
  view can follow under the same convention later).

## Constraints

- **Helpers, not a framework** (Jamie, 2026-11-02): the shared part is functions and a contract;
  each format keeps its own rich view, parsing and toolbar.
- **Text is never changed by switching modes.** Switching to raw and back without editing leaves
  `getContent()` byte-identical.
- **No new runtime dependency between formats.** A format uses `<code-editor>` for its raw surface
  only if the host registered it.
- **The host keeps working unchanged** until it opts into anything new; `readonly`, `content-change`
  and `whenReady()` keep their meanings.
- **Raw mode is not a save path of its own**: edits in raw mode reach the host as `content-change`
  like any other edit.

## Open questions

Each has a recommendation; the spec for the convention records the answer.

1. **The switch's label and sense.** _Recommend:_ "Raw", on means raw, at the end of the toolbar,
   the same in every editor. md loses its second label ("Markdown") and xmdl's "Apply Mode" becomes
   "Raw" with the sense flipped. The alternative is "Source".
2. **The host handle.** _Recommend:_ an enumerated, reflected attribute `view="rich" | "raw"`
   (absent means rich), so `md-editor[view="raw"]` selects it and a host or agent can set it; plus
   a non-bubbling `view-change` event with `{ view, reason: 'user' | 'fallback' | 'host' }`. An
   enumerated value leaves room for a later split view and avoids a third boolean-attribute rule.
   It joins the contract as an optional capability, like the keymap-mode trio. The alternative is a
   boolean `raw="true"` in the style of `readonly`.
3. **The raw surface.** _Recommend:_ one `common` helper that mounts `<code-editor>` (with the right
   `language`) when it is registered and a textarea otherwise, forwards `readonly`, and chains
   `whenReady()`. xmdl's `renderRawEditor` and `syncReady` are that helper today, inline. Context
   Manager then registers `code-format/editor` on editor pages for formats with raw mode; CodeMirror
   still loads only when raw mode opens.
4. **Content rules in raw.** _Recommend:_ `getContent()` returns the text verbatim; `content-change`
   fires on each raw edit with `{ content }`, and not again on leaving raw; `setContent` while raw
   replaces the text and stays raw.
5. **Leaving raw.** _Recommend:_ the rich view re-parses the text. If it does not parse, the element
   stays in raw with the diagnostics beside the text and the switch disabled until it does. If
   leaving would discard work held only in the rich view (xmdl's apply decisions), confirm first, as
   xmdl does now.
6. **Fallback triggers.** _Recommend:_ open in raw, editable, with a notice, when the content does
   not parse (xmdl, sheet; md always parses), when the engine fails to load (md), and when a sheet
   exceeds the row limit (its full text is at most 256 KB, which a raw surface handles). The
   fallback does not switch back by itself once the text is fixed; the user does.
7. **`readonly` in raw.** _Recommend:_ stay in raw with the text read-only (xmdl's behaviour), so
   md changes from leaving raw mode. The switch stays usable while readonly, since viewing source
   is not an edit.
8. **Normalisation.** md's rich editor rewrites Markdown on serialisation (the hydrated-baseline
   issue). _Recommend:_ in scope only as far as the constraint above (switching modes never changes
   the text); making md byte-stable until the first rich edit is its own spec if wanted.
9. **Previews.** _Recommend:_ the same `view` attribute; raw shows the source read-only
   (`<code-preview>` when registered, else a `<pre>`); a preview whose content does not parse shows
   the source with the diagnostics, as xmdl-preview already does. Previews get no switch of their
   own; the host decides whether to offer one. Context Manager's `<pre>` fallbacks then shrink to
   "the package failed to load".
10. **What Context Manager offers users.** Out of scope here beyond adopting the elements. Whether
    the good page gets a "View source" item, and whether agents can open a good in raw through the
    MCP surface, are Context Manager decisions after this lands.

Likely specs, in order: (a) the convention in `common` (contract capability, raw-surface helper,
notice, conformance suite, harness `view` control and a "code-editor registered" toggle, README);
(b) md adopts it; (c) xmdl adopts it; (d) sheet gains raw mode and its fallbacks (the largest); (e)
previews; then the Context Manager follow-up (register `code-editor`, trim the preview fallbacks).
