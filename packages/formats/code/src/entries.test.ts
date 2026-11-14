// Importing an entry defines its element and loads no CodeMirror: the engine
// loads on first connect. A static import of any module below in an element
// module (or anything it imports) fails here. The `./format` entry defines
// nothing at all, and its `load()` is the `./preview` or `./editor` entry itself.
import { describe, expect, it, vi } from 'vitest';

import type { ReadyElement } from '@stillpointlab/common-format';

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('codemirror', async (load) => {
  evaluated.add('codemirror');
  return load();
});
vi.mock('@codemirror/commands', async (load) => {
  evaluated.add('@codemirror/commands');
  return load();
});
vi.mock('@codemirror/language', async (load) => {
  evaluated.add('@codemirror/language');
  return load();
});
vi.mock('@codemirror/language-data', async (load) => {
  evaluated.add('@codemirror/language-data');
  return load();
});
vi.mock('@codemirror/merge', async (load) => {
  evaluated.add('@codemirror/merge');
  return load();
});
vi.mock('@codemirror/state', async (load) => {
  evaluated.add('@codemirror/state');
  return load();
});
vi.mock('@codemirror/view', async (load) => {
  evaluated.add('@codemirror/view');
  return load();
});
vi.mock('@replit/codemirror-vim', async (load) => {
  evaluated.add('@replit/codemirror-vim');
  return load();
});

const tags = ['code-editor', 'code-preview', 'code-diff'];

// One sequence, in order: the module registry is shared by the file.
describe('code-format entries', () => {
  it('./format defines no element and loads no CodeMirror', async () => {
    await import('./format');

    for (const tag of tags) expect(customElements.get(tag), tag).toBeUndefined();
    expect([...evaluated]).toEqual([]);
  });

  it('define their elements without loading CodeMirror', async () => {
    await import('./index');
    await import('./editor');
    await import('./preview');
    await import('./diff');

    for (const tag of tags) expect(customElements.get(tag), tag).toBeDefined();
    expect([...evaluated]).toEqual([]);
  });

  it('create elements without loading CodeMirror', () => {
    for (const tag of tags) {
      const element = document.createElement(tag);
      element.setAttribute('language', 'python');
      const preview = element as HTMLElement & { setContent?(text: string): void };
      preview.setContent?.('print(1)\n');
    }
    expect([...evaluated]).toEqual([]);
  });

  it('load CodeMirror once an element connects', async () => {
    for (const tag of tags) {
      const element = document.createElement(tag) as ReadyElement;
      element.setAttribute('language', 'python');
      document.body.append(element);
      await element.whenReady();
    }
    expect(evaluated).toContain('@codemirror/view');
    expect(evaluated).toContain('@codemirror/language');
    expect(evaluated).toContain('@codemirror/merge');
    document.body.replaceChildren();
  });

  it('./format loads the ./preview and ./editor entries themselves', async () => {
    const { codeFormat } = await import('./format');

    expect(await codeFormat.preview.load()).toBe(await import('./preview'));
    expect(await codeFormat.editor?.load()).toBe(await import('./editor'));
  });
});
