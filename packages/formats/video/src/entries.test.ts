// Importing the `./format` entry defines no element and evaluates no element
// module; its `load()` is the `./preview` entry itself, so the element is never
// defined twice. Neither evaluates the engine for a stream (hls.js), which only a
// playlist loads.
import { describe, expect, it, vi } from 'vitest';

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('./preview/video-preview', async (load) => {
  evaluated.add('video-preview');
  return load();
});

// The engine for a stream: loaded by a playlist alone, never by an entry.
vi.mock('./preview/hls-engine', async (load) => {
  evaluated.add('hls-engine');
  return load();
});

// One sequence, in order: the module registry is shared by the file.
describe('video-format ./format entry', () => {
  it('defines no element and evaluates no element module', async () => {
    await import('./format');

    expect(customElements.get('video-preview')).toBeUndefined();
    expect([...evaluated]).toEqual([]);
  });

  it('loads the ./preview entry itself', async () => {
    const { videoFormat } = await import('./format');

    expect(await videoFormat.preview.load()).toBe(await import('./preview/index'));
    expect([...evaluated]).toEqual(['video-preview']);
  });
});
