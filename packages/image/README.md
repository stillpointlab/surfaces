# @stillpointlab/image-editor

Preview-only image web components for Stillpoint Lab editor surfaces.

## Components

- `<image-preview>` displays an image URL in a read-only, fit-to-pane view.

```ts
import '@stillpointlab/image-editor/preview';

const preview = document.createElement('image-preview');
preview.setSource('/image.png', 'Screenshot');
```
