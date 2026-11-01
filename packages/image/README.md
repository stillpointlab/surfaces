# @stillpointlab/image-editor

Preview-only image web components for Stillpoint Lab editor surfaces.

## Components

- `<image-preview>` displays an image URL in a read-only, fit-to-pane view.

```ts
import '@stillpointlab/image-editor/preview';

const preview = document.createElement('image-preview');
preview.setSource('/image.png', 'Screenshot');
```

## Development

Use Node.js 24.15+ on the 24.x line for development. Node.js 22.22.2+ on the
22.x line and 26+ also satisfy the build and test requirements.

Run `npm ci` to install dependencies, then `npm run build` to generate ESM,
CommonJS, and type declarations with tsup 9.
