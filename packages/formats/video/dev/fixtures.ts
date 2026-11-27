// This format in the surfaces harness (`npm run dev`), mounted through its
// descriptor as a host would. Preview only: a fixture's content is the URL the
// host hands the element, and its path's file name the source's name. One clip
// for each ending the format opens, and one stream of each kind, so each can be
// seen and heard by hand in any browser; the README has the command that made each.
import { videoFormat } from '../src/format';

import type { HarnessFormat, HarnessFixture } from '../../../../tooling/harness/types';

const clip = (name: string): HarnessFixture => ({
  path: name,
  content: new URL(`./media/${name}`, import.meta.url).href,
});

// A clip that is not in `media/`, which the harness answers 404, as a host does.
// Vite is told not to look for it: it would find no file and leave no address.
const missing = (name: string): HarnessFixture => ({
  path: name,
  content: new URL(/* @vite-ignore */ `./media/${name}`, import.meta.url).href,
});

// A stream: its playlist, with its segments beside it in its folder. The one
// whose segments are missing names files that are not there, which the harness
// answers 404, as a host does, so it says the first sentence.
const stream = (folder: string): HarnessFixture => ({
  path: `${folder}/index.m3u8`,
  content: new URL(`./media/${folder}/index.m3u8`, import.meta.url).href,
});

export default {
  format: videoFormat,
  fixtures: {
    'WebM, VP9 and Opus, 4 s': clip('clip.webm'),
    'MP4, H.264 and AAC': clip('clip.mp4'),
    'MP4, H.264 and AAC (.m4v)': clip('clip.m4v'),
    'QuickTime, H.264 and AAC (.mov)': clip('clip.mov'),
    'Matroska, H.264 and Opus (.mkv)': clip('clip.mkv'),
    'Sound and no picture (Theora in .mkv)': clip('no-picture.mkv'),
    'Missing file': missing('no-such-file.mp4'),
    'Noise the browser cannot decode': clip('noise.mp4'),
    'HLS stream, fMP4 (VP9 and Opus), 6 s': stream('hls-fmp4'),
    'HLS stream, MPEG-TS (H.264 and AAC), 6 s': stream('hls-mpegts'),
    'HLS stream, fMP4 in byte ranges of one file': stream('hls-ranges'),
    'HLS stream with its segments missing': stream('hls-missing'),
    'No source': { path: 'empty.mp4', content: '' },
  },
} satisfies HarnessFormat;
