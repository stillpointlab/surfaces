import { beforeAll, describe, expect, it } from 'vitest';

import type { SampleEditor } from './sample-editor';

describe('<sample-editor>', () => {
  beforeAll(async () => {
    await import('./index');
  });

  it('reads back what it was given and reports edits', () => {
    const editor = document.createElement('sample-editor') as SampleEditor;
    document.body.append(editor);
    editor.setContent('draft');
    expect(editor.getContent()).toBe('draft');

    const seen: string[] = [];
    editor.addEventListener('content-change', (event) => {
      seen.push((event as CustomEvent<{ content: string }>).detail.content);
    });
    const area = editor.shadowRoot?.querySelector('textarea');
    if (!area) throw new Error('textarea missing');
    area.value = 'edited';
    area.dispatchEvent(new Event('input'));
    expect(seen).toEqual(['edited']);
  });
});
