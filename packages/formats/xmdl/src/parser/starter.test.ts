import { describe, expect, it } from 'vitest';

import { parseXmdl } from './parse';
import { createXmdlStarter } from './starter';

describe('createXmdlStarter', () => {
  it('creates a minimal parse-valid Markdown template', () => {
    const source = createXmdlStarter('Market Brief.xmdl');
    const result = parseXmdl(source);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document).toMatchObject({
      title: 'Market Brief',
      version: '0.1.0',
      outputFileType: 'markdown',
      params: [],
      body: '# Template output\n',
    });
  });

  it('serializes user-derived titles as YAML without changing the template body', () => {
    const title = 'Risk: {{undeclared}}\n---';
    const result = parseXmdl(createXmdlStarter(title));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.title).toBe(title);
    expect(result.document.placeholders).toEqual([]);
  });

  it('uses a non-empty fallback title', () => {
    const result = parseXmdl(createXmdlStarter('  .xmdl  '));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.title).toBe('Untitled Template');
  });
});
