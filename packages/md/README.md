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
| `getContent(): string`          | Serialize the current document to markdown.       |
| `readonly` attribute (`"true"`) | Render the editor read-only.                      |
| `content-change` event          | Fired on edits; `detail.content` is the markdown. |

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
  plugins: [
    /* markdown-it plugins */
  ],
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
  schemaNodes: {
    /* highlight: { ... NodeSpec ... } */
  },
  parserTokens: {
    /* highlight: { node: 'highlight' } */
  },
  serializerNodes: {
    /* highlight: (state, node) => state.write('==' + node.textContent + '==') */
  },
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

From `@stillpointlab/md-editor/markdown`:

- `createMarkdownIt`, `getMarkdownIt`, `renderMarkdown`
- types: `MarkdownIt`, `MarkdownItPlugin`, `CreateMarkdownItOptions`

## Development

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
