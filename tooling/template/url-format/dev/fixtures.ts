// This format in the surfaces harness (`npm run dev`), mounted through its
// descriptor as a host would. Preview only: a fixture's content is the URL the
// host hands the element, and its path's file name the source's name.
import { sampleFormat } from '../src/format';

import type { HarnessFormat } from '../../../../tooling/harness/types';

// The sample shows its source as an image, so its fixtures are SVG data URIs.
const svg = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'>${body}</svg>`
  )}`;

const scene =
  "<rect width='640' height='360' fill='#f4f7fb'/><circle cx='220' cy='160' r='72' fill='#4f8cff'/><path d='M80 300h480L410 145 300 245l-60-64z' fill='#234'/>";

export default {
  format: sampleFormat,
  fixtures: {
    'A scene (data URI)': { path: 'scene.sample-url', content: svg(scene) },
    'Missing source': { path: 'missing.sample-url', content: '/no-such-file.sample-url' },
    'No source': { path: 'empty.sample-url', content: '' },
  },
} satisfies HarnessFormat;
