import { describe, expect, it } from 'vitest';

import { referencesPath, rewriteRelativeLinks } from './linkRewrite.js';

const FILES = new Set([
  'docs/tasks/stage1/phase1/tasks/sibling.md',
  'docs/tasks/stage1/phase1/briefs/idea.md',
  'docs/tasks/stage2/phase1/tasks/other.md',
  'docs/adr/0020-tasks.md',
  'docs/img/pic.png',
]);
const exists = (path: string): boolean => FILES.has(path);

describe('rewriteRelativeLinks', () => {
  const FROM = 'docs/tasks/stage1/phase1/tasks';
  const TO = 'docs/tasks/unassigned/tasks';

  it('re-roots same-dir, up-dir, and image links; preserves anchors and titles', () => {
    const md = [
      'See [sibling](sibling.md#notes) and [idea](../briefs/idea.md "the idea").',
      'ADR: [adr](../../../../adr/0020-tasks.md)',
      '![pic](../../../../img/pic.png)',
    ].join('\n');

    const result = rewriteRelativeLinks(md, FROM, TO, exists);

    expect(result.rewritten).toBe(4);
    expect(result.broken).toBe(0);
    expect(result.content).toBe(
      [
        'See [sibling](../../stage1/phase1/tasks/sibling.md#notes) and [idea](../../stage1/phase1/briefs/idea.md "the idea").',
        'ADR: [adr](../../../adr/0020-tasks.md)',
        '![pic](../../../img/pic.png)',
      ].join('\n')
    );
  });

  it('rewrites reference-style definitions', () => {
    const md = 'Text [x][ref]\n\n[ref]: sibling.md\n';
    const result = rewriteRelativeLinks(md, FROM, TO, exists);
    expect(result.content).toContain('[ref]: ../../stage1/phase1/tasks/sibling.md');
  });

  it('leaves absolute URLs, anchors, and pre-broken links untouched (broken counted)', () => {
    const md = '[web](https://example.com) [anchor](#top) [gone](missing.md) [abs](/project/1)';
    const result = rewriteRelativeLinks(md, FROM, TO, exists);
    expect(result.content).toBe(md);
    expect(result.rewritten).toBe(0);
    expect(result.broken).toBe(1);
  });

  it('co-moving siblings stay byte-identical when their relative shape is unchanged', () => {
    const md = '[sibling](sibling.md)';
    const coMoving = new Map([
      ['docs/tasks/stage1/phase1/tasks/sibling.md', 'docs/tasks/unassigned/tasks/sibling.md'],
    ]);
    const result = rewriteRelativeLinks(md, FROM, TO, exists, coMoving);
    expect(result.content).toBe(md);
    expect(result.rewritten).toBe(0);
  });

  it('a co-moving file at a DIFFERENT relative position rewrites to its new home', () => {
    const md = '[other](../../../stage2/phase1/tasks/other.md)';
    const coMoving = new Map([
      ['docs/tasks/stage2/phase1/tasks/other.md', 'docs/tasks/unassigned/tasks/other.md'],
    ]);
    const result = rewriteRelativeLinks(md, FROM, TO, exists, coMoving);
    expect(result.content).toBe('[other](other.md)');
  });
});

describe('referencesPath', () => {
  it('detects inline and reference-style links resolving to the target', () => {
    const from = 'docs/tasks/stage1/phase1/briefs';
    expect(
      referencesPath('[t](../tasks/sibling.md)', from, 'docs/tasks/stage1/phase1/tasks/sibling.md')
    ).toBe(true);
    expect(
      referencesPath('[x]: ../tasks/sibling.md', from, 'docs/tasks/stage1/phase1/tasks/sibling.md')
    ).toBe(true);
    expect(
      referencesPath('[t](../tasks/other.md)', from, 'docs/tasks/stage1/phase1/tasks/sibling.md')
    ).toBe(false);
    expect(referencesPath('[t](https://x.md)', from, 'https://x.md')).toBe(false);
  });
});
