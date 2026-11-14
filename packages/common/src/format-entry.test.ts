// @vitest-environment node
import { describe, expect, it } from 'vitest';

// Through the built entry, as for `./html`: the package imports itself, so the
// entry loads dynamically (import-x/order classifies a self-import differently
// with and without `dist`). In Node, so loading it proves it touches no DOM.
describe('the ./format entry', () => {
  it('exports what the README promises', async () => {
    const entry = await import('@stillpointlab/common-format/format');

    expect(Object.keys(entry).sort()).toEqual([
      'createFormatRegistry',
      'extensionOf',
      'fileNameOf',
    ]);
  });
});
