# @stillpointlab/md-editor

A [ProseMirror](https://prosemirror.net/)-based **markdown editor web component**
(`<md-editor>`) plus an isomorphic **markdown renderer**. Written in TypeScript,
shipped as ESM + CJS with type declarations, and usable from plain JavaScript or
TypeScript with no build-time CSS imports (styles are injected into the
component's shadow root at runtime).

- **`<md-editor>`** — a WYSIWYG markdown editor custom element (toolbar, lists,
  tables, code blocks, a raw-markdown toggle), with ProseMirror loaded lazily.
- **`@stillpointlab/md-editor/markdown`** — a DOM-free `createMarkdownIt` /
  `renderMarkdown` (CommonMark + GFM strikethrough + tables) for Node SSR or the
  browser.
- **Plugin interface** — host-specific syntax (e.g. citations) plugs in without
  forking the editor.

## Install

```sh
npm install @stillpointlab/md-editor
```

Peer runtime deps (`markdown-it`, `prosemirror-*`) are declared as regular
dependencies and installed automatically.

## Usage

### The editor component

```ts
import '@stillpointlab/md-editor'; // registers <md-editor>

const editor = document.querySelector('md-editor');
editor.setContent('# Hello\n\nSome **markdown**.');

editor.addEventListener('content-change', (e) => {
  console.log(e.detail.content); // current document serialized to markdown
});
```

Or in HTML:

```html
<md-editor></md-editor>
<script type="module">
  import '@stillpointlab/md-editor';
</script>
```

**Element API**

| Member                          | Description                                       |
| ------------------------------- | ------------------------------------------------- |
| `setContent(markdown: string)`  | Replace the document with parsed markdown.        |
| `getContent(): string`          | The markdown; see "What a save keeps".            |
| `readonly` attribute (`"true"`) | Render the editor read-only.                      |
| `content-change` event          | Fired on edits; `detail.content` is the markdown. |

### What a save keeps

`getContent()` returns the text exactly as it was set until the user edits in the rich view. After
an edit, each top-level block that did not change (a paragraph, a heading, a whole list, a whole
table) is written back as the text it was set with: its line wrapping, its bullet characters, its
blank lines. Only the blocks that changed are written by the serializer, and the text keeps its
line endings and its final newline. So a file saved after one edit differs from the file on disk
by that edit.

The unit is the top-level block. An edit inside a list or a table rewrites that list or table,
and a changed paragraph is written on one line.

If the kept text would read differently beside its new neighbours (two lists that become
adjacent join into one), nothing is kept and the whole document is written by the serializer, as
it was before this rule.

### Rendering markdown (no DOM required)

```ts
import { renderMarkdown } from '@stillpointlab/md-editor/markdown';

const html = await renderMarkdown('# Title\n\n- a\n- b');
// NOTE: output is NOT sanitized — sanitize before inserting into the DOM.
```

For a reusable, configured instance:

```ts
import { createMarkdownIt } from '@stillpointlab/md-editor/markdown';

const md = createMarkdownIt({
  plugins: [/* markdown-it plugins */],
});
const html = md.render('**hi**');
```

> ⚠️ **Sanitization is the caller's responsibility.** `renderMarkdown` returns
> raw HTML. Run it through a sanitizer (e.g. DOMPurify) before inserting it into
> the page.

## Extending: the plugin interface

Host-specific features are added through a `MarkdownEditorPlugin`, registered
**before** the element initializes. A plugin can contribute a markdown-it plugin,
ProseMirror schema nodes, a markdown-it-token → node parse mapping, a
node → markdown serializer, and an `onReady` hook.

```ts
import { registerEditorPlugin, type MarkdownEditorPlugin } from '@stillpointlab/md-editor';

const highlightPlugin: MarkdownEditorPlugin = {
  name: 'highlight',
  markdownItPlugin: (md) => {
    /* register an inline rule + renderer for ==highlight== */
  },
  schemaNodes: {/* highlight: { ... NodeSpec ... } */},
  parserTokens: {/* highlight: { node: 'highlight' } */},
  serializerNodes: {/* highlight: (state, node) => state.write('==' + node.textContent + '==') */},
  onReady: (view) => {
    /* e.g. register any custom elements the nodes render to */
  },
};

registerEditorPlugin(highlightPlugin);
import '@stillpointlab/md-editor'; // now initialize the element
```

### Error / log injection

By default the editor logs via `console`. Override the handlers:

```ts
import { setErrorHandler, setReporter } from '@stillpointlab/md-editor';

setErrorHandler((message, err) => myLogger.error(message, err));
setReporter((message, context) => myLogger.info(message, context));
```

## Exports

From `@stillpointlab/md-editor`:

- `ProseMirrorEditor` — the element class (also registered as `<md-editor>`)
- `registerEditorPlugin`, `getEditorPlugins`
- `setErrorHandler`, `setReporter`
- `createSchema`, `getSchema`, `getMarkdownParser`, `getMarkdownSerializer`,
  `buildTableNode`
- types: `MarkdownEditorPlugin`, `MarkdownNodeSerializer`

From `@stillpointlab/md-format/editor`: the same, without `createSchema`, `getSchema`,
`getMarkdownParser` and `getMarkdownSerializer`. Those are the engine, which the editor imports on
its first connect; `src/editor/entry.test.ts` keeps this entry from loading it sooner.

From `@stillpointlab/md-editor/markdown`:

- `createMarkdownIt`, `getMarkdownIt`, `renderMarkdown`, `selectedMarkdownSource`
- types: `MarkdownIt`, `MarkdownItPlugin`, `CreateMarkdownItOptions`,
  `MarkdownSourceSelectionOptions`

## The format descriptor

`@stillpointlab/md-format/format` exports `mdFormat`, which a host registers (see
`@stillpointlab/common-format/format`): it opens `.md` and `.markdown`, needs the file's text, and
`apply` calls `setContent`. Register it before `code`, which opens the same extensions. Importing it
defines no element and loads no engine; `load()` resolves to the package's own `./preview` or
`./editor` module, so an element is never defined twice. The build splits so that it can:
`format.js` imports `preview.js` and `editor.js` themselves, and shared code goes to `dist/chunks/`,
which `sideEffects` lists. `src/entries.test.ts` keeps the entry light, and `src/format.test.ts`
runs `describeFormatDescriptor` over it.

## Development

Use Node.js 24.15+ on the 24.x line for development. Node.js 22.22.2+ on the
22.x line and 26+ also satisfy the build and test requirements.

```sh
npm install
npm run dev        # standalone Vite playground (dev/)
npm test           # vitest
npm run typecheck
npm run lint
npm run build      # tsup → dist/ (ESM + CJS + .d.ts)
```

The editor's SCSS is compiled to a CSS string (`npm run gen:styles`, run
automatically by build/dev/test) and injected into the shadow root, so consumers
never import CSS.

## License

[MIT](./LICENSE)
