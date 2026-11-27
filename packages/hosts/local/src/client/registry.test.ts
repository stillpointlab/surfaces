import { describe, expect, it } from 'vitest';

import { createHostRegistry } from './registry';

describe('the host registry', () => {
  const registry = createHostRegistry();

  it('registers the eight formats in order, with code as the fallback', () => {
    expect(registry.formats.map((format) => format.id)).toEqual([
      'md',
      'xmdl',
      'sheet',
      'image',
      'audio',
      'video',
      'pdf',
      'code',
    ]);
    expect(registry.fallback?.id).toBe('code');
  });

  it.each([
    ['README.md', 'md'],
    ['notes.MARKDOWN', 'md'],
    ['brief.xmdl', 'xmdl'],
    ['data/table.csv', 'sheet'],
    ['data/merged.sheet', 'sheet'],
    ['img/dot.PNG', 'image'],
    ['img/shape.svg', 'image'],
    ['music/track.mp3', 'audio'],
    ['music/Track.FLAC', 'audio'],
    ['music/take.weba', 'audio'],
    ['film/clip.mp4', 'video'],
    ['film/Clip.MKV', 'video'],
    ['film/take.webm', 'video'],
    ['film/talk/index.m3u8', 'video'],
    ['papers/report.pdf', 'pdf'],
    ['papers/Scan.PDF', 'pdf'],
    ['src/app.ts', 'code'],
    ['types.d.ts', 'code'],
  ])('opens %s with %s', (path, id) => {
    expect(registry.find(path)?.id).toBe(id);
  });

  it('finds nothing for a file with no known extension', () => {
    expect(registry.find('Makefile')).toBeNull();
    expect(registry.find('notes.txt')).toBeNull();
  });
});
