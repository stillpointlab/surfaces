// When CodeMirror cannot load, each element says so and still settles.
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReadyElement } from '@stillpointlab/common-format';

vi.mock('@codemirror/view', () => {
  throw new Error('engine unavailable');
});

afterEach(() => document.body.replaceChildren());

const elements = [
  { tag: 'code-editor', module: './editor/code-editor', message: "Couldn't load the editor." },
  { tag: 'code-preview', module: './preview/code-preview', message: "Couldn't load the preview." },
  { tag: 'code-diff', module: './diff/code-diff', message: "Couldn't load the preview." },
];

describe('code elements when the engine fails to load', () => {
  for (const { tag, module, message } of elements) {
    it(`<${tag}> shows the error status and settles`, async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await import(module);
      const el = document.createElement(tag) as ReadyElement;
      document.body.append(el);

      await el.whenReady();

      const status = el.shadowRoot?.querySelector('.spl-status--error');
      expect(status?.textContent).toBe(message);
      expect(status?.getAttribute('role')).toBe('alert');
      expect(el.shadowRoot?.querySelector('.spl-status--loading')).toBeNull();
    });
  }
});
