---
column: in-progress
created: 2026-11-02T12:33:37-07:00
tags: [dev-tooling, formats, host-contract]
---

# Spike: one test harness for the surfaces

_Working notes, written by the claude agent on 2026-11-02 from Jamie's question. Everything below
is from reading the repository and Context Manager's host code; nothing was built._

## Question

The five formats arrived here each with its own web server for trying the client by hand. Jamie,
2026-11-02: "I believe a few of the format preview/editors have their own web servers for testing
the clients, but I assume there is some sharing between them. I am not completely convinced there
should be a single harness that holds each of them, but my intuition suggests it would be
beneficial." So: what do the five playgrounds actually share, what do the automated tests share,
and would one harness earn its place?

## Findings

### The "web servers" are five copies of one idea

Every format has a `dev/` folder (`index.html` + `main.ts`) served by Vite on a fixed port from the
root README's table (5180–5184; the template takes 5199). The `vite.config.ts` files differ only in
`strictPort` (sheet) and a vestigial `build.outDir: '../dist-dev'` (sheet, xmdl, image) that no
script uses. Nothing is shared between the five beyond `vite` itself and the port table.

| Playground | Lines | Page chrome                                 | Fixtures  | Controls                                           | Waits for the editor |
| ---------- | ----: | ------------------------------------------- | --------- | -------------------------------------------------- | -------------------- |
| md         |    95 | own styles                                  | 1 inline  | none                                               | `setTimeout(…, 300)` |
| code       |    72 | own styles                                  | 1 inline  | none                                               | `setTimeout(…, 300)` |
| xmdl       |    33 | none                                        | 1 inline  | none                                               | none                 |
| image      |    22 | none                                        | 1 `data:` | none                                               | n/a                  |
| sheet      |   432 | own styles, `--spl-*` tokens light and dark | 27 named  | readonly, narrow pane, dark theme, source readback | none needed          |
| template   |    45 | own styles                                  | 1 inline  | none                                               | none                 |

Four of them do exactly the same thing: import the element modules, put an editor and a preview on
a page, `setContent(sample)`, and wire `content-change` from the editor into the preview. Sheet is
the outlier, and it is the outlier in the direction every format would want: a fixture picker over
27 named documents (every edge case its tests know about), a read-only toggle, a narrow-pane toggle,
a dark-theme toggle with the `--spl-*` tokens defined for both schemes, and a `<pre>` that always
shows the current source. The other four lack this because it is 400 lines to copy, not because
they do not need it. The template scaffolds the minimal shape, so every new format starts without
it too.

### No element says when it is ready

md and code lazy-load their engines (ProseMirror, CodeMirror, the vim keymap) after connect, and
nothing announces completion: `content-change` is the only custom event any element in the
repository emits. The playgrounds cope with a 300 ms sleep. The tests cope with fake timers,
poking `_loading = false` and calling `render()` directly (`prosemirror-editor-styles.test.ts`),
real sleeps (`md-preview.test.ts`), and the one test that waits up to 4 s for the vim import and
flaked twice under the parallel run before PR 2 widened its timeout. Any harness, by hand or
automated, needs a readiness signal, and today it would have to invent one per format.

### What the automated tests share, and where the contract is actually tested

All packages test with vitest + jsdom through `tooling/vitest.ts` (`formatTest()`): 47 test files,
14 of which create elements and query their shadow roots. There is no browser-mode or Playwright
dependency here. The template gives a new format one element test per entry: `setContent` then
`getContent`, and a `content-change` on `input`.

The thing a format must get right for the host is small and already named in
`packages/common/src/contracts.ts`: `PreviewElement.setContent`, `EditorElement.getContent` /
`focus` / the optional keymap-mode trio, `ImagePreviewElement.setSource`, `DiffElement.setContents`,
and the `content-change` event with `{ content }`. But the tests that exercise a format _through_
that contract live in Context Manager, private, and only for sheet in depth:
`sheetEditorHost.integration.test.ts`, `sheetEditorClipboardHost.integration.test.ts`,
`editorContentLoader.test.ts`, `draftManager.test.ts` (jsdom, `src/client/pages/digitalGood/`), and
the Playwright inventory walk that reads `getContent()` off `#digital-good-editor`. So "does this
element honour the host contract" is answered host-side, per format, ad hoc, and after the fact.

### What is genuinely per-format

Fixtures (they are the content type), the extra API some formats carry beyond the contract (sheet's
`setDocument` and `presentation` options, `<sheet-grid>`, `<code-diff>`, image's `src` attribute
and `setSource`), and interaction detail (cell editing, toolbar keys, clipboard). A harness that
tried to know these would become the mega-app Jamie's doubt is about.

## Recommendation

One harness, thin, and in two pieces that share the contract and nothing else. The intuition is
right; the doubt is right about scope.

1. **One playground host** replacing the five `dev/` folders: a single Vite app under `tooling/`
   that mounts any format from a small per-format fixtures module (`dev/fixtures.ts`: named
   fixtures plus optional extra controls) and gives every format what only sheet has today: editor
   beside preview, fixture picker, read-only, narrow pane, light/dark with the `common` tokens, and
   source readback. One port instead of a table. The harness drives elements only through the
   `common` contracts; a format wanting more registers it from its fixtures module. If a format
   cannot express something that way, that is a finding about the contract, which the apps
   breakout needs to know anyway. The template points at the harness and loses its `dev/`.
2. **A contract conformance suite in `common`**: `describeEditorContract(tag, fixture)` and
   `describePreviewContract(tag, fixture)` (plus image and diff variants) that each format's vitest
   project runs: set/get round-trip, `content-change` shape, re-set idempotence, `readonly`,
   keymap-mode results where supported. This moves the host-contract tests out of Context
   Manager's private tree to the public repository, next to the elements, and gives the template a
   real test instead of a sample one. It stays on jsdom.
3. **A readiness signal in the contract first.** Both pieces need it, and the 300 ms sleeps and
   the 4 s vim wait are the symptom. Propose `ready: Promise<void>` on `PreviewElement` (resolved
   on connect for synchronous elements, after the lazy import for md and code) and a `ready` event
   for hosts that only listen. That is a contract change the host sees, so it is the brief's first
   decision and sequences before the suite.
4. **No Playwright here yet.** Real-browser interaction (clipboard, selection, IME) stays in
   Context Manager's walks, which already own the server and the seeded data. vitest browser mode
   is the upgrade path if the conformance suite hits a jsdom wall; sheet's clipboard tests in
   Context Manager are the likely first case.

Write the brief from this. The forward-looking argument, flagged as speculation: when the apps
breakout lands, apps will need a fake host for `get` / `list` / `put`, and formats will need the same
one once `put`-as-proposal reaches them. A harness that already mounts any surface from a manifest
is where that fake host goes; five playgrounds are not.

## References

- `packages/formats/*/dev/`, `packages/formats/*/vite.config.ts`, `tooling/template/format/dev/`.
- `packages/common/src/contracts.ts`; `tooling/vitest.ts`.
- Timing workarounds: `packages/formats/md/src/editor/prosemirror-editor-styles.test.ts`,
  `packages/formats/md/src/preview/md-preview.test.ts`,
  `packages/formats/code/src/editor/code-editor.test.ts` (the vim wait, PR 2).
- Context Manager (private): `src/client/pages/digitalGood/sheetEditorHost.integration.test.ts`,
  `sheetEditorClipboardHost.integration.test.ts`, `editorContentLoader.ts`, `draftManager.ts`,
  `e2e/inventory-walks/walk.ts`; `playwright.config.ts`.
- [ADR-0009](https://github.com/stillpointlab/context-manager/blob/main/docs/adr/0009-pluggable-editor-types.md)
  (the contract), [ADR-0035](https://github.com/stillpointlab/context-manager/blob/main/docs/adr/0035-surfaces-monorepo.md)
  (this repository), the phase 1 [convention spec](../../phase1/specs/format-package-convention.md).
- Seeds this touches: [one scaffold for formats and apps](../../../unassigned/seeds/one-scaffold-for-formats-and-apps.md),
  [apps breakout](../../../unassigned/seeds/apps-breakout-from-context-manager.md).
