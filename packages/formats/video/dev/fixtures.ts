// This format in the surfaces harness (`npm run dev`), mounted through its
// descriptor as a host would. Preview only: a fixture's content is the URL the
// host hands the element, and its path's file name the source's name. One clip
// for each ending the format opens, so each can be seen and heard by hand in any
// browser; the README has the command that made each.
import { videoFormat } from '../src/format';

import type { HarnessFormat, HarnessFixture } from '../../../../tooling/harness/types';

const clip = (name: string): HarnessFixture => ({
  path: name,
  content: new URL(`./media/${name}`, import.meta.url).href,
});

// An address that answers nothing. A missing path will not do here: the harness's
// Vite answers any path it has no file for with its own page, 200, which the
// browser then fails to decode. A revoked object URL fails as a file that never
// arrived does, at once, and asks nothing of the network.
const gone = URL.createObjectURL(new Blob([]));
URL.revokeObjectURL(gone);

export default {
  format: videoFormat,
  fixtures: {
    'WebM, VP9 and Opus, 4 s': clip('clip.webm'),
    'MP4, H.264 and AAC': clip('clip.mp4'),
    'MP4, H.264 and AAC (.m4v)': clip('clip.m4v'),
    'QuickTime, H.264 and AAC (.mov)': clip('clip.mov'),
    'Matroska, H.264 and Opus (.mkv)': clip('clip.mkv'),
    'Sound and no picture (Theora in .mkv)': clip('no-picture.mkv'),
    'Missing file': { path: 'no-such-file.mp4', content: gone },
    'Noise the browser cannot decode': clip('noise.mp4'),
    'No source': { path: 'empty.mp4', content: '' },
  },
} satisfies HarnessFormat;
