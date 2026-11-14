# @stillpointlab/image-editor

Preview-only image web components for Stillpoint Lab editor surfaces.

## Components

- `<image-preview>` displays an image URL in a read-only, fit-to-pane view.

```ts
import '@stillpointlab/image-editor/preview';

const preview = document.createElement('image-preview');
preview.setSource('/image.png', 'Screenshot');
```

## The format descriptor

`@stillpointlab/image-format/format` exports `imageFormat`, which a host registers (see
`@stillpointlab/common-format/format`): it opens `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.avif`,
`.bmp` and `.svg` (Context Manager's image extensions), needs a URL the host gives it, not the
file's text, and `apply` calls `setSource(url, <file name>)`. It has no editor. Importing it defines
no element and loads no engine; `load()` resolves to the package's own `./preview` module, so an
element is never defined twice. The build splits so that it can: `format.js` imports `preview.js`
itself, and shared code goes to `dist/chunks/`, which `sideEffects` lists. `src/entries.test.ts`
keeps the entry light, and `src/format.test.ts` runs `describeFormatDescriptor` over it.

## Development

Use Node.js 24.15+ on the 24.x line for development. Node.js 22.22.2+ on the
22.x line and 26+ also satisfy the build and test requirements.

Run `npm ci` to install dependencies, then `npm run build` to generate ESM,
CommonJS, and type declarations with tsup 9.
