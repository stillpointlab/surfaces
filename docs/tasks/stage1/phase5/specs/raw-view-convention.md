---
column: done
pr: 20
completed: 2026-11-02
created: 2026-11-02T20:14:50-07:00
tags: [common, host-contract, dev-tooling, major-feature]
---

# Spec: the raw view convention in `common`

_Landed 2026-11-02 in [#20](https://github.com/stillpointlab/surfaces/pull/20), as specified; the
template's sample elements treat a line starting with `!` as invalid, so new formats start with the
fallback path exercised. Context Manager adopted it in context-manager#1009, with two departures
from the follow-up below. Defining `<code-editor>` costs a host about 108 KB gzipped of CodeMirror
up front, because `language.ts` imports CodeMirror's language core statically, so CodeMirror does
not yet load only when raw opens ([phase 6](../../phase6/specs/code-format-light-entries.md)). And
`sheetPreview.ts` keeps its `<pre>` for a `.sheet` envelope that does not parse, since
`<sheet-preview>` takes parsed documents only
([phase 6](../../phase6/specs/sheet-preview-document-source.md)). The host's hydrated baseline stays
for `<code-editor>`, which reads CRLF back as LF._

_From the phase 5 brief [raw_mode](../briefs/raw_mode.md) and Jamie's decisions on PR 19. This spec
lands the contract, the helpers, the conformance suite and the harness controls. The four specs
beside it adopt them per format._

## High-level goal

`common` defines what "raw view" means for every surface whose content is text, and gives formats the
pieces to build it: the contract capability (a `view` attribute and a `view-change` event), a raw
surface helper, a notice helper, and a conformance suite that proves the rules. The harness can
drive all of it.

## Related context

- Brief and decisions: [raw_mode](../briefs/raw_mode.md).
- What exists: md-editor's raw mode (`toggleRawMode`, `updateViewMode` in `prosemirror-editor.ts`);
  xmdl-editor's (`renderRawEditor`, `syncReady` in `xmdl-editor.ts`, already the raw-surface helper
  inline); xmdl-preview's invalid state (`renderInvalidState`).
- Phase 4 helpers this builds on: `createSwitch`, `createStatus`, `isReadonly`, `hydrate`, the
  toolbar helpers, the README's "Attributes" rule.
- Main files: `packages/common/src/contracts.ts`, new `packages/common/src/raw.ts` and
  `packages/common/src/testing/raw-view.ts`, `packages/common/src/styles/`, `tooling/harness/`.

## Technical requirement

1. **The contract capability.** `contracts.ts` gains:

   ```ts
   export type SurfaceView = 'rich' | 'raw';
   export type ViewChangeReason = 'user' | 'fallback' | 'host';
   export interface ViewChangeDetail {
     view: SurfaceView;
     reason: ViewChangeReason;
   }
   ```

   and documents the capability on `PreviewElement` and `EditorElement` as optional, like the
   keymap-mode trio: an element that supports it observes a `view` attribute (`"rich"` or `"raw"`;
   absent or any other value means rich), reflects its current view to that attribute, and
   dispatches a non-bubbling `view-change` `CustomEvent<ViewChangeDetail>` each time the view
   changes, with the reason. A host setting `view` gets reason `host`; the element's own switch,
   `user`; an automatic switch, `fallback`. There is no `view` property (several elements already
   keep their engine in a private `view` field); the attribute is the API. The README's "Attributes"
   note gains the rule: `view` is an enumerated contract attribute.

2. **The rules every implementation follows** (written into the README as "Raw view" and enforced
   by the suite):
   - Switching views never changes the text: `getContent()` is byte-identical before and after a
     switch with no edit in between.
   - In raw, `getContent()` returns the raw text verbatim; each raw edit emits `content-change`
     with `{ content }`; leaving raw emits nothing more; `setContent` replaces the text and stays in
     raw.
   - Leaving raw re-parses. If the text does not parse, the element stays in raw, shows the parse
     errors (updated for the current text) in its notice, and announces them. A host that set
     `view="rich"` sees the attribute reflected back to `raw`.
   - Content the rich view cannot show (it does not parse, its engine failed to load, or a format's
     limit) opens in raw with a notice saying why, with reason `fallback`. Fixing the text does not
     switch back by itself.
   - `readonly="true"` never changes the view. Both views are uneditable; the switch stays usable.
3. **`createRawSource(options)`** in `common`, for editors:

   ```ts
   createRawSource({ value, language?, readonly?, label, onInput }): RawSource
   interface RawSource {
     readonly element: HTMLElement;
     getValue(): string;
     setValue(text: string): void; // never calls onInput
     setReadonly(readonly: boolean): void;
     focus(): void;
     whenReady(): Promise<void>;
   }
   ```

   It mounts `<code-editor language=…>` when the host registered that element, else a
   `<textarea class="spl-raw-source">` with `aria-label` from `label`; forwards `readonly`; calls
   `onInput(text)` on every user edit; and resolves `whenReady()` once the embedded editor is ready
   (at once for the textarea). xmdl's inline version is the reference.

4. **`createRawView(options)`** in `common`, for previews: `{ value, language?, label }` returning
   `{ element, setValue, whenReady }`. It mounts `<code-preview language=…>` when registered, else a
   `<pre class="spl-raw-view">`.
5. **`createNotice(options)`** in `common`: `{ tone: 'error' | 'warning' | 'info', title, items? }`
   returning an element with `class="spl-notice spl-notice--<tone>"`, a title and an optional list
   (one item per parse error, `path: message` where the format has a path). `role="alert"` for
   errors raised by a user action (a failed switch back), `role="status"` otherwise; an
   `announce` option chooses. A `_notice.scss` partial styles it from the tokens.
6. **The switch.** Every editor that supports the capability uses `createSwitch` with the label
   "Raw Text", checked in raw, as the last control of its toolbar (so it joins the toolbar's
   keyboard order), and keeps it enabled while `readonly`. A `RAW_VIEW_LABEL` constant in `common`
   holds the label.
7. **The conformance suite.** `describeRawViewContract(tag, options)` in
   `@stillpointlab/common-format/testing`, with options `{ kind: 'editor' | 'preview', content,
editRaw?(el, text), invalidContent?, invalidErrors?(el): string[], prepare?, fallbackReason? }`.
   Cases:
   - absent `view` means rich; `view="raw"` switches with `view-change` `{ view: 'raw', reason:
'host' }` and settles; `view="rich"` switches back;
   - editors: the "Raw Text" switch switches with reason `user`; a rich → raw → rich round trip
     with no edit leaves `getContent()` byte-identical to the content as set;
   - editors: a raw edit emits one `content-change` with the exact text, `getContent()` returns
     it, and leaving raw emits nothing; `setContent` while raw stays raw;
   - editors: `readonly="true"` keeps the current view, the switch still works, and the raw edit
     is inert;
   - with `invalidContent`: the element opens in raw with reason `fallback` and a notice listing the
     errors; switching to rich keeps it in raw with the notice updated and `role="alert"`; after a
     raw edit that fixes the text, switching to rich succeeds;
   - previews: `view="raw"` shows the text exactly as set; with `invalidContent`, the preview shows
     the source and the errors.
8. **The harness.** A "Raw" checkbox in the bar sets `view="raw"` on the editor and preview (and
   follows `view-change` back); `view-change` joins the events pane; the harness registers
   `code-editor` and `code-preview` so the raw surfaces use them, and `?raw=plain` skips that to
   exercise the textarea and `<pre>` fallbacks. Formats add an invalid fixture where they have one.
9. **README.** A "Raw view" section with the rules above and the helpers; the "Attributes" note
   gains `view`.

## Non-goals

- Adopting the convention in any format (the md, xmdl, sheet and preview specs).
- A raw view for image (binary; an SVG source view can follow under the same convention) or for
  code's elements, which are the raw view.
- Anything Context Manager offers its users (a "View source" item, an MCP way to open raw).

## Acceptance / completion checklist

- [x] The contract types, the README rules and the attribute note are in place.
- [x] `createRawSource`, `createRawView`, `createNotice` and `RAW_VIEW_LABEL` are exported and
      unit-tested, including the `<code-editor>` / `<code-preview>` and fallback paths.
- [x] `describeRawViewContract` exists and passes against a sample implementation in the template
      (the template's sample editor and preview gain raw view, so new formats start with it).
- [x] The harness's Raw control, events, registration and `?raw=plain` work.
- [x] `npm run check` is green.

## Context Manager follow-up (one CM PR after the phase 5 specs land)

Register `@stillpointlab/code-format/editor` on editor pages for md, xmdl and sheet goods (and
`code-format/preview` where their previews mount), so the raw surfaces use CodeMirror; CodeMirror
still loads only when raw opens. Trim `sheetPreview.ts` and `xmdlPreview.ts` to the
package-failed-to-load case. Amend ADR-0009 for the `view` capability. Whether to add a "View
source" item or an MCP handle is a separate CM decision.

## Implementation plan

One PR: the contract types and README first, then the helpers with their tests, then the suite with
the template's sample elements as its first passing implementation, then the harness.
