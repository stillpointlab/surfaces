// This format in the surfaces harness (`npm run dev`), mounted through its
// descriptor. Preview only: a fixture's content is the image's URL, and its path's
// file name the alternative text.
import { imageFormat } from '../src/format';

import type { HarnessFormat } from '../../../../tooling/harness/types';

const svg = (body: string, size = '') =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'${size}>${body}</svg>`
  )}`;

const scene =
  "<rect width='640' height='360' fill='#f4f7fb'/><circle cx='220' cy='160' r='72' fill='#4f8cff'/><path d='M80 300h480L410 145 300 245l-60-64z' fill='#234'/>";

export default {
  format: imageFormat,
  fixtures: {
    'SVG scene (data URI)': { path: 'scene.svg', content: svg(scene) },
    'SVG with fixed size': {
      path: 'scene-fixed.svg',
      content: svg(scene, " width='320' height='180'"),
    },
    'Missing image': { path: 'no-such-image.webp', content: '/no-such-image.webp' },
    'No source': { path: 'empty.png', content: '' },
  },
} satisfies HarnessFormat;
