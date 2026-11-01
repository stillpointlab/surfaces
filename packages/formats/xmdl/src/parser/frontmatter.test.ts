import { describe, expect, it } from 'vitest';

import { splitFrontmatterBlock } from './frontmatter';

describe('splitFrontmatterBlock', () => {
  it('splits only the first leading frontmatter block', () => {
    const input = '---\ntitle: Template\n---\n---\ntitle: "{{title}}"\n---\n# Body\n';
    const parts = splitFrontmatterBlock(input);

    expect(parts?.yaml).toBe('title: Template');
    expect(parts?.body).toBe('---\ntitle: "{{title}}"\n---\n# Body\n');
    expect(`${parts?.raw}${parts?.body}`).toBe(input);
  });

  it('returns null for missing or unterminated frontmatter', () => {
    expect(splitFrontmatterBlock('# Body')).toBeNull();
    expect(splitFrontmatterBlock('---\ntitle: Template\n')).toBeNull();
  });
});
