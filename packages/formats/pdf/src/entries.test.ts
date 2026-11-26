// Importing the `./format` entry defines no element and evaluates no element
// module; its `load()` is the `./preview` entry itself, so the element is never
// defined twice. Neither evaluates pdf.js's document API (the engine), which
// only a PDF opened loads.
import { describe, expect, it, vi } from 'vitest';

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('./preview/pdf-preview', async (load) => {
  evaluated.add('pdf-preview');
  return load();
});

// pdf.js's document API: loaded by a PDF opened alone, never by an entry.
vi.mock('./preview/engine', async () => {
  evaluated.add('engine');
  return {};
});

// One sequence, in order: the module registry is shared by the file.
describe('pdf-format ./format entry', () => {
  it('defines no element and evaluates no element module', async () => {
    await import('./format');

    expect(customElements.get('pdf-preview')).toBeUndefined();
    expect([...evaluated]).toEqual([]);
  });

  it('loads the ./preview entry itself, and not the engine', async () => {
    const { pdfFormat } = await import('./format');

    expect(await pdfFormat.preview.load()).toBe(await import('./preview/index'));
    expect([...evaluated]).toEqual(['pdf-preview']);
  });
});
