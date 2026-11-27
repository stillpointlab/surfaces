// This format in the surfaces harness (`npm run dev`), mounted through its
// descriptor as a host would. Preview only: a fixture's content is the URL the
// host hands the element, and its path's file name the source's name. One PDF of
// each kind the format is tested with, so each can be seen by hand in any
// browser; the README has the command that made each.
import { pdfFormat } from '../src/format';

import type { HarnessFixture, HarnessFormat } from '../../../../tooling/harness/types';

const pdf = (name: string): HarnessFixture => ({
  path: name,
  content: new URL(`./media/${name}`, import.meta.url).href,
});

// An address that answers nothing. A missing path will not do here: the harness's
// Vite answers any path it has no file for with its own page, 200, which pdf.js
// reads and cannot parse. A revoked object URL fails as a file that never
// arrived does, at once, and asks nothing of the network.
const gone = URL.createObjectURL(new Blob([]));
URL.revokeObjectURL(gone);

export default {
  format: pdfFormat,
  fixtures: {
    'Text, its fonts not embedded': pdf('text.pdf'),
    'Twelve pages': pdf('pages.pdf'),
    'Japanese text through a character map': pdf('cjk.pdf'),
    'A JPEG 2000 image': pdf('jpx.pdf'),
    'Fonts embedded': pdf('embedded-fonts.pdf'),
    'A password': pdf('password.pdf'),
    'Not a PDF': pdf('not-a-pdf.pdf'),
    'Missing file': { path: 'no-such-file.pdf', content: gone },
    'No source': { path: 'empty.pdf', content: '' },
  },
} satisfies HarnessFormat;
