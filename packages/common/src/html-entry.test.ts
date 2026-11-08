// @vitest-environment node
import { describe, expect, it } from 'vitest';

// Through the built entry, as for `./elements`: the package imports itself, so the
// entry loads dynamically (import-x/order classifies a self-import differently
// with and without `dist`).
describe('the ./html entry', () => {
  it('exports what the README promises', async () => {
    const entry = await import('@stillpointlab/common-format/html');

    expect(Object.keys(entry).sort()).toEqual(['escapeHtml', 'html', 'isSafeHtml', 'render']);
  });
});
