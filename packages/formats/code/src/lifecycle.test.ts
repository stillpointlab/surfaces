// Lifecycle edges the conformance suites do not reach: a connection that ends
// before its engine loads, and the element module loading twice.
import { afterEach, describe, expect, it, vi } from 'vitest';

import './editor';
import './preview';
import './diff';

import type { ReadyElement } from '@stillpointlab/common-format';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const views: Record<string, string> = {
  'code-editor': '.cm-editor',
  'code-preview': '.cm-editor',
  'code-diff': '.cm-mergeView',
};

describe('code elements across connections', () => {
  for (const [tag, viewSelector] of Object.entries(views)) {
    it(`<${tag}> builds no view for a connection that ended before the engine loaded`, async () => {
      const detached = document.createElement(tag) as ReadyElement;
      document.body.append(detached);
      detached.remove();

      // A second instance loads the same modules; once it has settled, the
      // first one's load has resolved too.
      const live = document.createElement(tag) as ReadyElement;
      document.body.append(live);
      await live.whenReady();

      expect(live.shadowRoot?.querySelector(viewSelector)).not.toBeNull();
      expect(detached.shadowRoot?.querySelector(viewSelector)).toBeNull();
      expect(detached.hasAttribute('ready')).toBe(false);
    });
  }

  it('loading the element module a second time does not throw', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.resetModules();
    await expect(import('./editor/code-editor')).resolves.toBeDefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('<code-editor>'));
  });
});
