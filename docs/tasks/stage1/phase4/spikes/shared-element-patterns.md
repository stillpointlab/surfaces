---
column: done
pr: 13
completed: 2026-11-02
created: 2026-11-02T18:50:35-07:00
tags: [formats, common, host-contract, dev-tooling]
---

# Spike: what the eleven elements share, and what to hoist

_Working notes, written by the claude agent on 2026-11-02 from Jamie's question. Everything below
comes from reading the elements, a throwaway test (deleted, not committed) and a read of Context
Manager's host code. Nothing was built._

_Specs written from it in the same PR (Jamie, 2026-11-02: specs for the bug fixes and the first
three candidates now; raw mode gets its brief after those land):
[element-lifecycle-fixes](../specs/element-lifecycle-fixes.md),
[design-tokens](../specs/design-tokens.md), [lazy-engine-helper](../specs/lazy-engine-helper.md)
and [toolbar-helpers](../specs/toolbar-helpers.md). The small helpers are folded into those._

## Question

Jamie, 2026-11-02, after phase 3 closed: "Have we done a sweep of the existing preview/editor
components themselves to see if there are reusable patterns that can be hoisted?" We had not. The
only hoists so far came from the migration (log, contracts, tokens) and phase 2 (the ready gate,
the conformance suites). A first read found five candidates: design tokens, the lazy-engine element
shell, toolbars, raw mode, and a handful of small helpers.

Jamie's answer to that first read set the constraints for this spike:

- All five are worth doing.
- For the lazy-engine shell and toolbars, hoist interfaces and helper functions, not a
  configurable component framework. Do not centralise too much logic.
- Raw mode should become a general rule: "In any case where the backing format is text (code, md,
  xml, yaml, etc) where we have a custom editor I would like a raw mode fallback. And this should
  follow the same conventions across format editors/previews." Jamie expects it to be the biggest
  piece.

This spike measures each candidate, says what belongs in `common` and what stays in a format, and
proposes the specs and their order.

## Findings

### The elements in scope

| Format | Editor                  | Preview(s)                    | Backing text                         | Engine            |
| ------ | ----------------------- | ----------------------------- | ------------------------------------ | ----------------- |
| md     | `md-editor` (948 lines) | `md-preview`                  | Markdown + frontmatter               | ProseMirror, lazy |
| code   | `code-editor` (452)     | `code-preview`, `code-diff`   | any source text                      | CodeMirror, lazy  |
| xmdl   | `xmdl-editor` (667)     | `xmdl-preview`                | YAML frontmatter + body              | none, synchronous |
| sheet  | `sheet-editor` (2714)   | `sheet-preview`, `sheet-grid` | CSV, or `.sheet` (frontmatter + CSV) | none, synchronous |
| image  | none                    | `image-preview`               | binary (SVG is text)                 | none              |

Code's three elements are themselves the raw view of text, so raw mode is about the three custom
editors (md, xmdl, sheet) and their previews.

### 1. Design tokens: one file, used by one format

`packages/common/src/styles/_tokens.scss` defines 19 colour tokens as `--spl-*` custom properties
with defaults, plus spacing and radius scales. Only md and the template `@use` it.

| Stylesheet                  | Hex literals | `var(--spl-*)` | Uses tokens | Own dark block |
| --------------------------- | -----------: | -------------: | ----------- | -------------- |
| code `editor.scss`          |           14 |             14 | no          | no             |
| code `preview.scss`         |            7 |              7 | no          | no             |
| code `diff.scss`            |           15 |             15 | no          | no             |
| md `editor.scss` + partials |            2 |              4 | yes         | no             |
| xmdl `editor.scss`          |           34 |             34 | no          | no             |
| xmdl `preview.scss`         |           23 |             23 | no          | no             |
| sheet `shared/table.scss`   |           47 |             94 | no          | yes            |
| image `preview.styles.ts`   |    5 (in TS) |              0 | no          | no             |

What that drift does:

- **Defaults disagree.** `--spl-border-color` falls back to `#eee` in the tokens, md and the
  harness, but to `#d0d7de` in code and xmdl. An unthemed host draws three different borders.
- **37 custom property names live outside the token file.** They fall into families: feedback
  (`--spl-error-*`, `--spl-warning-*`), focus (`--spl-focus-ring`), actions (`--spl-action-*`,
  `--spl-button-*`), status (`--spl-status-*`), code (`--spl-code-*`), and format-scoped ones
  (`--spl-sheet-*`, `--spl-xmdl-*`). A host theming the surfaces cannot know these exist.
- **Image uses another naming scheme.** Its styles are hand-written in `preview.styles.ts` with
  `--color-text`, `--color-surface`, `--color-danger`, so no `--spl-*` theme reaches it.
- **Dark mode has two owners.** Sheet carries its own `prefers-color-scheme: dark` block. Every
  other element relies on the host setting the `--spl-*` properties, which the harness does.
- **Two `*.styles.ts` files are committed** although the pattern is gitignored: sheet's
  `table.styles.ts` is generated from `table.scss` and can drift from it, and image's is the
  hand-written source.

Tokens are pure data, so hoisting them carries no framework risk. They are the cheapest and most
visible win.

### 2. The lazy-engine shell: four copies, one shared bug

`code-editor`, `code-preview`, `code-diff` and `md-editor` repeat the same lifecycle by hand:

1. The constructor attaches a shadow root.
2. `connectedCallback` begins a ready cycle, renders a loading shell, and defers `load(cycle)` with
   `setTimeout`.
3. `load` awaits a `Promise.all` of dynamic imports, stores the modules on the instance, re-renders,
   and defers `initialize(cycle)` with a second `setTimeout`.
4. On a failed import it reports the error, re-renders and settles.
5. `initialize` guards with `if (this.view || !this.modules) return`, finds the mount node, builds
   the view from the buffered `_content`, and settles the cycle.
6. `disconnectedCallback` destroys the view and begins a new cycle.
7. `setContent` buffers and dispatches to the view if one exists; `getContent` reads the view or
   the buffer.

**The shared bug.** Step 5's early returns do not settle. A throwaway test mounted each element
and moved it to another parent in the same tick, which is a synchronous disconnect and reconnect.
`whenReady()` never resolved for `code-editor`, `code-preview`, `code-diff` or `md-editor`; it did
for `md-preview`, which tracks a render token instead. The first connection's `initialize` builds
the view and settles a cycle that is no longer current, and the second connection's `initialize`
sees a view and returns. The same branch hangs if the mount node is missing. Context Manager
creates each element and swaps it in once, and never moves it, so the bug is latent there today.
Any host that re-parents panes (split views, the apps breakout) would hit it, and the host's
keymap preference and hydrated baseline both wait on `whenReady()`.

**Other defects in the same shell:**

- `md-editor` starts `setInterval(() => this.toolbar?.updateState(), 100)` on every hydration and
  never clears it, so each reconnect adds another 10 Hz timer for the element's lifetime.
- A failed engine import leaves a blank pane. No element shows the user that loading failed or
  offers the text instead. This is exactly where a raw fallback belongs (finding 4).
- Each instance re-runs its own `Promise.all` of imports. The browser caches the modules, so this
  is waste rather than a bug, but a shared memoised loader is simpler.

**What can be hoisted without a framework.** The element-specific parts (which modules, how to
build the view, the toolbar) differ completely between ProseMirror and CodeMirror. The shared
part is narrow: run a memoised loader once per connection, ignore a stale connection's
continuation, always settle the current cycle (on success, on failure, and on the "nothing to do"
branch), and tear down on disconnect. That fits in one helper beside `createReadyGate`, used by
composition: the element keeps its fields, its render and its engine code, and calls the helper
from its lifecycle callbacks. The conformance suite should gain the move test so the bug cannot
return.

### 3. Toolbars: four implementations, one accessible

| Editor | Built from                                       | Structure                                                                                   | ARIA                                                                                                                                                                          |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| md     | HTML strings in `ProseMirrorToolbar` (505 lines) | command registry, popovers, overflow via `ResizeObserver`, document-level dismiss listeners | one attribute in the whole file (`aria-hidden` on icons); icon-only buttons have only `title`; no `role="toolbar"`; popover triggers lack `aria-expanded` and `aria-haspopup` |
| sheet  | DOM built in `sheet-editor.ts`                   | static command table, grouped, flyout menus                                                 | `role="toolbar"` with label, groups with labels, roving `tabindex`, `aria-pressed`, `aria-haspopup="menu"` and `aria-expanded`                                                |
| code   | HTML string                                      | one keymap toggle group                                                                     | `aria-pressed`; `aria-label` on a `div` with no role                                                                                                                          |
| xmdl   | a `button()` helper                              | flat buttons plus a mode switch                                                             | `role="toolbar"` without a label; `role="switch"` on the mode switch                                                                                                          |

The commands are entirely format-specific and should stay in each format. What repeats is
behaviour every toolbar ought to have and only sheet has: roving focus with arrow keys, labelled
icon buttons, pressed and expanded states, popover dismissal on outside click and Escape, and
disabling everything while `readonly` (phase 3 just wrote that twice, once for md and once for
xmdl). A shared stylesheet partial for toolbar buttons (size, hover, pressed, disabled,
focus-visible) built from the tokens would replace four sets of near-identical rules.

So the hoist is a set of small functions applied to a toolbar element the format built itself
(roving focus, readonly disabling, popover dismissal), plus the style partial. A toolbar component
that takes a command schema would be the framework Jamie ruled out. md's accessibility gaps get
fixed as md adopts the helpers.

### 4. Raw mode: two inconsistent implementations and one gap

**What exists.**

|                        | md-editor                                                                   | xmdl-editor                                                                                                     | sheet-editor                                                                            |
| ---------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Raw mode               | yes                                                                         | yes                                                                                                             | none                                                                                    |
| Raw surface            | its own `<textarea>`                                                        | `<code-editor language="yaml">` if registered, else a `<textarea>`                                              | none                                                                                    |
| Switch label and sense | "Raw" in rich mode, "Markdown" in raw mode; the switch is _on_ in rich mode | "Apply Mode"; the switch is _on_ in apply mode                                                                  | none                                                                                    |
| `content-change`       | on every raw keystroke, and again when leaving raw if the text changed      | on every raw keystroke                                                                                          | n/a                                                                                     |
| Leaving raw            | re-parses; ProseMirror normalises the text                                  | re-parses; confirms before discarding incompatible apply work; invalid source shows an error list in apply mode | n/a                                                                                     |
| Parse failure on load  | never fails, but normalises on the first rich edit                          | "Invalid XMDL" error list, no source shown                                                                      | grid replaced by an error message, editing disabled, no source shown                    |
| Truncated input        | n/a                                                                         | n/a                                                                                                             | read-only grid with a notice "Editing is unavailable because not all rows were loaded." |
| Engine load failure    | blank pane                                                                  | n/a                                                                                                             | n/a                                                                                     |
| `readonly` in raw      | leaves raw mode (PR 11)                                                     | stays in raw, source read-only (PR 11)                                                                          | n/a                                                                                     |

|               | md-preview                                 | xmdl-preview                            | sheet-preview      |
| ------------- | ------------------------------------------ | --------------------------------------- | ------------------ |
| Source view   | none                                       | none on demand                          | none               |
| Parse failure | render error reported, body left as it was | error list plus the source in a `<pre>` | error message only |

So every convention differs: the switch's label, which state counts as "on", the raw surface, when
`content-change` fires, what `readonly` does in raw, and whether a parse failure shows the text.
Phase 3 itself introduced one of these differences.

**What the host does** (Context Manager, read for this spike):

- It has no raw mode, view-source toggle or edit-as-text fallback of its own. The settings menu
  offers Copy Contents and Download File, both from `getContent()`.
- It never touches the elements' raw modes. No host code or e2e walk queries
  `.prosemirror-editor-raw`, `.xmdl-editor__mode-toggle` or `.xmdl-editor__source`.
- It does keep read-only source fallbacks for previews in its own code: `sheetPreview.ts` and
  `xmdlPreview.ts` leave a `<pre>` of the source in place when the package fails to load or the
  document does not parse, and `codeEditorReadonly.ts` does the same for code. Unknown file types
  preview as a plain `<pre>`. This is the host doing, per format, what the elements should do.
- It loads exactly one format package per editor page. On an xmdl page `code-editor` is never
  registered, so xmdl's raw mode is always the bare textarea in production.
- It reaches into md-editor's shadow root for `.ProseMirror` when copying source
  (`digitalGood.ts`), a coupling worth retiring when raw mode gives a public way to get the text.

**Why a fallback matters beyond convenience.**

- _Invalid content strands the user._ A CSV that does not parse, or an XMDL file with a broken
  frontmatter, opens as an error message with no way to fix it in place. The raw text is the only
  thing that can be fixed, and it is not shown.
- _Raw is the lossless path._ md's rich editor normalises Markdown on serialisation (the reason
  Context Manager added the hydrated-baseline adoption in CM PR 993). Raw mode is where a user can
  write exactly the text they mean.
- _Engine failure leaves nothing._ If ProseMirror fails to load, a textarea of the source is a
  far better outcome than a blank pane.
- _Limits are not a reason to refuse._ Sheet's limits cap input at 256 KB and materialise 1,000
  rows, so a truncated sheet is at most 256 KB of text, which a textarea or `<code-editor>`
  handles. Whether editing should be allowed there is a decision for the brief.

**What a convention needs to decide.** These are open, and they are the brief's job:

1. _The switch:_ one label ("Raw" or "Source"), on meaning raw, same position (the end of the
   element's toolbar), same component.
2. _The host's handle:_ a reflected attribute such as `raw` (so `md-editor[raw]` selects it and a
   host can open a good in raw), and an event announcing why the mode changed (user, fallback,
   host). Whether this joins the contract as an optional capability, like the keymap-mode trio.
3. _The raw surface:_ one helper that mounts `<code-editor>` when it is registered and a textarea
   otherwise, with readonly forwarding and ready chaining. xmdl's `renderRawEditor` and
   `syncReady` are already that helper inline. Whether formats should register `code-editor`
   themselves (a dependency on `code-format`) or leave it to the host.
4. _Content semantics:_ `getContent()` in raw returns the text verbatim; `content-change` fires on
   raw edits with `{ content }`; `setContent` while raw replaces the text and stays in raw;
   leaving raw re-parses, and if the text does not parse the element stays in raw with the
   diagnostics shown beside it.
5. _Fallback triggers:_ parse failure on load, engine load failure, and possibly limits. The
   element opens in raw with a notice saying why.
6. _`readonly` in raw:_ stay in raw with the source read-only (xmdl's behaviour), which means
   changing md's.
7. _Lossy round trips:_ xmdl confirms before discarding apply work and md silently normalises.
   One rule for "leaving raw would change your text".
8. _Previews:_ the same `raw` attribute shows the source read-only (in `<code-preview>` when
   registered, else a `<pre>`), and a parse failure shows the source with the diagnostics, as
   xmdl-preview already does. The host's `<pre>` fallbacks then shrink to "the package failed to
   load".

Some of this is visible to users (the switch's label and sense, opening in raw on bad content) and
to agents driving the host (an attribute to request raw). By the rule recorded on 2026-11-02, that
earns a brief, and raw mode will need several specs anyway.

**Out of scope for now:** image has no editor, but SVG is text; an SVG source view is a natural
later case under the same convention. Code's elements need no raw mode, since they are the raw
view. The template's sample editor is already a textarea.

### 5. Small helpers

- **Unguarded registration.** Five elements call `customElements.define` without checking
  `customElements.get` first: `code-editor`, `code-preview`, `code-diff`, `md-editor`, `md-preview`.
  Loading two bundles that both include one of them throws. The other ten are guarded. A
  `defineElement(tag, ctor)` helper settles it.
- **`readonly`.** Four editors read `getAttribute('readonly') === 'true'` under two spellings
  (`isReadonly`, `isReadOnly`), and only sheet and xmdl reflect `aria-readonly`. A helper for
  reading it, plus one for applying it to a set of controls, is the smallest useful hoist.
- **Boolean attributes.** The contract's `readonly` means exactly `"true"`, while `code-diff`
  treats an attribute as on when present and not `"false"`. So `<md-editor readonly>` is editable
  and `<code-diff wrap>` wraps. One parsing rule, documented, would remove the surprise; changing
  `readonly`'s meaning is a contract change and needs care.
- **Placeholders.** Loading text is written four ways ("Loading editor…", "Loading editor...",
  "Loading…", "Loading..."), and load or parse errors render three ways. Shared helpers and style
  classes for loading, empty and error states.
- **Switches.** `md-toggle` is a registered element; xmdl reimplements the same switch as a button
  with a knob. Raw mode needs exactly one switch.

## Recommendation

Do all five, as Jamie decided, in this shape:

| Piece             | Lands as                    | What goes in `common`                                                                                                                                         | Size                |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Lifecycle defects | spec, first                 | nothing yet: fix the settle branches in the four lazy elements, clear md's interval, guard the five registrations, add the move case to the conformance suite | quick win           |
| Tokens            | spec                        | the extended token set, grouped by family; a check that format stylesheets contain no colour literals                                                         | quick win to medium |
| Lazy engine       | spec                        | one helper for memoised load, per-connection guard and always-settle, composed by each element; loading and failure placeholders                              | medium              |
| Toolbar helpers   | spec                        | roving focus, readonly disabling, popover dismissal, a toolbar style partial, the shared switch                                                               | medium              |
| Small helpers     | folded into the specs above | `defineElement`, readonly helpers, the boolean-attribute rule                                                                                                 | small               |
| Raw mode          | brief, then specs           | the raw-surface helper, the switch, the attribute and event, a raw-mode conformance suite, harness controls                                                   | major               |

**Order.** Fix the lifecycle defects first, because the race is a real bug and the fix is
small. Tokens can run in parallel with anything. The lazy-engine helper and the toolbar helpers
come before raw mode, since raw mode needs the engine-failure hook, the switch and the readonly
helpers. The raw-mode brief can be written now so its decisions are ready when the helpers land.
A likely spec breakdown under the brief: the convention and helpers in `common`, then md, xmdl
and sheet adopting it (sheet is the largest, since it has no raw mode today), then previews, then
the harness and the Context Manager follow-up.

**What stays in each format.** Commands, engine construction, rendering, parsing and
format-specific UI. Every hoist above is a function an element calls or a stylesheet it uses; none
is a base class or a component taking configuration. If a later spec finds itself designing a
toolbar schema or an element base class, that is the signal to stop.

**Host impact.** Context Manager needs nothing to adopt the lifecycle fixes, tokens or toolbar
helpers beyond moving the pin. Raw mode is element-internal, so the host keeps working unchanged,
then can drop its per-format `<pre>` fallbacks for parse failures and its reach into md-editor's
shadow root for copying. A host-facing `raw` attribute would let the host or an agent open a good
in raw.

## References

- Elements: `packages/formats/*/src/{editor,preview,diff,grid}/*.ts`; toolbars in
  `packages/formats/md/src/editor/prosemirror-toolbar.ts` and `sheet-editor.ts`
  (`createToolbar`); raw modes in `prosemirror-editor.ts` (`toggleRawMode`, `updateViewMode`) and
  `xmdl-editor.ts` (`renderRawEditor`, `syncReady`); sheet's invalid and truncated rendering in
  `sheet-editor.ts` (`render`) and `source-session.ts`.
- Tokens: `packages/common/src/styles/_tokens.scss`; the harness's light and dark values in
  `tooling/harness/harness.css`; generation in `tooling/gen-styles.mjs`.
- The ready gate and suites: `packages/common/src/ready.ts`, `packages/common/src/testing/`.
- Phase 3, which wrote readonly twice: [readonly-in-md-and-xmdl](../../phase3/specs/readonly-in-md-and-xmdl.md)
  (PR 11).
- Context Manager host: `src/client/pages/digitalGood/digitalGood.ejs` (editor per type, md as the
  fallback), `digitalGood.ts` (one package per page, shadow-root copy), `src/client/utils/sheetPreview.ts`,
  `xmdlPreview.ts`, `codeEditorReadonly.ts` (source fallbacks), `src/client/components/doc-preview/doc-preview.ts`
  (preview routing), `editorContentLoader.ts` (readonly for dormant goods).
- The rule on briefs: a brief when the work splits into several specs or changes what users or
  agents see (Jamie, 2026-11-02).
