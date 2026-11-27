// This format in the surfaces harness (`npm run dev`), mounted through its
// descriptor as a host would. Preview only: a fixture's content is the URL the
// host hands the element, and its path's file name the source's name. One clip
// for each ending the format opens, so each can be heard by hand in any browser;
// the README has the command that made each.
import { audioFormat } from '../src/format';

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

export default {
  format: audioFormat,
  fixtures: {
    'MP3, 4 s': clip('tone.mp3'),
    WAV: clip('tone.wav'),
    FLAC: clip('tone.flac'),
    'Ogg Vorbis (.ogg)': clip('tone.ogg'),
    'Ogg Vorbis (.oga)': clip('tone.oga'),
    'Ogg Opus (.opus)': clip('tone.opus'),
    'AAC in MP4 (.m4a)': clip('tone.m4a'),
    'AAC, ADTS (.aac)': clip('tone.aac'),
    'WebM Opus (.weba)': clip('tone.weba'),
    'Missing file': missing('no-such-file.mp3'),
    'Noise the browser cannot decode': clip('noise.mp3'),
    'No source': { path: 'empty.mp3', content: '' },
  },
} satisfies HarnessFormat;
