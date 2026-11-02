// This format in the surfaces harness (`npm run dev`). Preview only: a fixture's
// content is the image source, applied with `setSource`.
import '../src/preview';

import type { HarnessFormat } from '../../../../tooling/harness/types';
import type { ImagePreviewElement } from '@stillpointlab/common-format';

const svg = (body: string, size = '') =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'${size}>${body}</svg>`
  )}`;

const scene =
  "<rect width='640' height='360' fill='#f4f7fb'/><circle cx='220' cy='160' r='72' fill='#4f8cff'/><path d='M80 300h480L410 145 300 245l-60-64z' fill='#234'/>";

export default {
  elements: { preview: 'image-preview' },
  apply: ({ preview }, content) =>
    (preview as ImagePreviewElement | null)?.setSource(content, 'Fixture image'),
  fixtures: {
    'SVG scene (data URI)': svg(scene),
    'SVG with fixed size': svg(scene, " width='320' height='180'"),
    'Missing image': '/no-such-image.webp',
    'No source': '',
  },
} satisfies HarnessFormat;
