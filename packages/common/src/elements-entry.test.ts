// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

// The package imports itself, which import-x/order classifies differently with and
// without `dist` built (CI lints before building), so the entries load dynamically.
const { defineElement: rootDefineElement, setReporter } =
  await import('@stillpointlab/common-format');
const { defineElement } = await import('@stillpointlab/common-format/elements');

// Through the built entries, not the source: what matters is that the bundle gives
// them one `log` instance, so a host configuring the root also hears `./elements`.
describe('the ./elements entry', () => {
  afterEach(() => setReporter(null));

  it('is the same function as the root export', () => {
    expect(defineElement).toBe(rootDefineElement);
  });

  it('reports to a reporter set through the root entry', () => {
    const reporter = vi.fn();
    setReporter(reporter);
    class First extends HTMLElement {}
    class Second extends HTMLElement {}

    defineElement('spl-entry-shared-log', First);
    defineElement('spl-entry-shared-log', Second);

    expect(reporter).toHaveBeenCalledOnce();
    expect(reporter.mock.calls[0][0]).toContain('<spl-entry-shared-log>');
  });
});
