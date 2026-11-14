# @stillpointlab/code-editor

A CodeMirror-based code editor web component — `<code-editor>` — with syntax
highlighting for popular languages and line numbers. It is the code-file sibling of
[`@stillpointlab/md-editor`](../md-editor) and honors the same host contract, so the
two are interchangeable behind a shared `EditorElement` interface.

## Usage

```ts
import '@stillpointlab/code-editor'; // registers the <code-editor> element

const editor = document.querySelector('code-editor');
editor.setContent('print("hello")');
editor.setAttribute('language', 'python');

editor.addEventListener('content-change', (e) => {
  console.log(e.detail.content); // current text on every edit
});
```

```html
<code-editor language="python"></code-editor>
<!-- read-only, highlighted view -->
<code-editor language="python" readonly="true"></code-editor>
<!-- keyboard mode selector defaults to normal -->
<code-editor language="python" keymap-mode="normal"></code-editor>
```

## Contract

The element matches `<md-editor>` so it drops into the same host machinery
(autosave, publish, share):

- `setContent(content: string): void` — replace the document.
- `getContent(): string` — current text (works before the lazy view loads, too). Text is
  returned as set until an edit; an edit keeps the line break of the text as set (CRLF stays
  CRLF), though CodeMirror itself joins lines with LF.
- `focus(): void`.
- `content-change` — `CustomEvent<{ content: string }>` fired on every edit.
- `readonly` attribute — `"true"` makes the view non-editable.
- `language` attribute — a CodeMirror language name (e.g. `python`, `javascript`,
  `json`); unknown/absent values render as plain text (line numbers only).
- `keymap-mode` attribute — keyboard mode selector. `normal` and `vim` are supported.

Importing an entry (`.`, `./editor`, `./preview` or `./diff`) defines its element and
loads no CodeMirror: the engine loads when an element first connects, and a language's
grammar when it is first used. A host can therefore define `<code-editor>` on any page
that might need it (such as a raw view) and pay only for the element module, a few KB.
`src/entries.test.ts` keeps it so. `findLanguage(name)` resolves asynchronously for the
same reason.

## The format descriptor

`@stillpointlab/code-format/format` exports `codeFormat`, which a host registers (see
`@stillpointlab/common-format/format`), and `languageFromPath(path)`, the language a path implies by
its extension (`app.py` → `Python`) or `null`. It opens every extension with a language (the table
started as Context Manager's), needs the file's text, and `apply` sets `language` from the path, or
removes it when the path has none, then calls `setContent`. That removal is how a host's fallback
shows any other text file as plain text, so register `code` last and as the registry's `fallback`:
it opens `.md` and `.markdown` too, which `md` should win. Importing it defines no element and loads
no engine; `load()` resolves to the package's own `./preview` or `./editor` module, so an element is
never defined twice. The build splits so that it can: `format.js` imports `preview.js` and
`editor.js` themselves, and shared code goes to `dist/chunks/`, which `sideEffects` lists.
`src/entries.test.ts` keeps the entry light, and `src/format.test.ts` runs
`describeFormatDescriptor` over it.

## Keyboard modes

`<code-editor>` exposes a formal, optional keymap API for hosts that want to persist or coordinate
keyboard preferences across editor packages:

```ts
type EditorKeymapMode = 'normal' | 'vim';
type EditorKeymapModeStatus = 'applied' | 'unsupported';

interface EditorKeymapModeResult {
  requestedMode: EditorKeymapMode;
  activeMode: EditorKeymapMode;
  status: EditorKeymapModeStatus;
  reason?: string;
}

editor.getSupportedKeymapModes(); // readonly EditorKeymapMode[]
editor.getKeymapMode(); // EditorKeymapMode
await editor.setKeymapMode('vim'); // EditorKeymapModeResult
```

Vim bindings are loaded dynamically the first time Vim mode is requested. Unsupported requests are
non-fatal and leave the active mode unchanged. In read-only mode the toolbar is hidden and only
`normal` is available; mode-specific command filtering is left to future package work.

In Normal mode, `Tab` indents and `Shift-Tab` outdents using CodeMirror's language-aware indentation
rules. To move keyboard focus out of the editor, press `Escape` and then `Tab` (or `Shift-Tab`) within
two seconds. CodeMirror's persistent tab-focus toggle is `Ctrl-m` on Windows/Linux and `Shift-Alt-m`
on macOS. When text is selected, `ArrowUp` and `ArrowDown` move one visual line from the active end
of the selection on the first key press instead of only collapsing the selection.

## Theming

The editor, preview, and diff surfaces inherit Stillpoint design-token custom properties when a
host provides them and include standalone fallbacks. Set `--spl-code-selection-bg` on the component
or an ancestor to customize the primary text-selection background. The active-line background uses
`--spl-code-active-line-bg`; keep its value translucent so the selection layer remains visible
through it.

## Scripts

Use Node.js 24.15+ on the 24.x line for development. Node.js 22.22.2+ on the
22.x line and 26+ also satisfy the build and test requirements.

- `npm run build` — generate styles, then bundle with tsup (ESM + CJS + d.ts).
- `npm run dev` — standalone playground at <http://localhost:5181>.
- `npm test` — unit tests (Vitest + jsdom).
- `npm run lint` / `npm run format:fix`.

## Logging

Editor logs default to `console`. A host can route them via `setErrorHandler` /
`setReporter` exported from the package.
