// The files pdf.js asks the page for by kind and name: where each is, which it
// may ask for, and how one is read when a host's build wrote it into the code.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { addressOf, bytesOfData, PackageFiles } from './files';

// Beside this module, wherever a build puts it: the test's own Vite rewrites
// each address, as a host's does.
const beside = (path: string) =>
  expect.stringMatching(new RegExp(`/src/preview/${path.replaceAll('.', '\\.')}$`));

describe('addressOf', () => {
  it('names a character map and a standard font beside this module', () => {
    expect(addressOf({ kind: 'cMapUrl', filename: 'UniJIS-UCS2-H.bcmap' })).toEqual(
      beside('pdfjs/cmaps/UniJIS-UCS2-H.bcmap')
    );
    expect(addressOf({ kind: 'standardFontDataUrl', filename: 'FoxitSymbol.pfb' })).toEqual(
      beside('pdfjs/standard_fonts/FoxitSymbol.pfb')
    );
    expect(addressOf({ kind: 'standardFontDataUrl', filename: 'LiberationSans-Bold.ttf' })).toEqual(
      beside('pdfjs/standard_fonts/LiberationSans-Bold.ttf')
    );
  });

  it.each([
    ['a .wasm (WebAssembly is off)', 'wasmUrl', 'openjpeg.wasm'],
    ['a map by the fonts’ kind', 'standardFontDataUrl', 'UniJIS-UCS2-H.bcmap'],
    ['a licence', 'standardFontDataUrl', 'LICENSE_FOXIT'],
    ['a name with a folder', 'cMapUrl', '../../index.bcmap'],
    ['a name with a slash', 'cMapUrl', 'a/b.bcmap'],
    ['a name that starts with a dot', 'cMapUrl', '..bcmap'],
    ['an empty name', 'cMapUrl', ''],
  ])('names nothing for %s', (_, kind, filename) => {
    expect(addressOf({ kind, filename })).toBeNull();
  });
});

describe('bytesOfData', () => {
  it('reads a base64 address', () => {
    expect([...bytesOfData('data:application/octet-stream;base64,AAH/')]).toEqual([0, 1, 255]);
  });

  it('reads a percent-encoded address', () => {
    expect([...bytesOfData('data:application/octet-stream,a%00%FFb')]).toEqual([97, 0, 255, 98]);
  });
});

describe('PackageFiles', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches a file by its address', async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetch);

    const bytes = await new PackageFiles().fetch({ kind: 'cMapUrl', filename: '78-H.bcmap' });

    expect([...bytes]).toEqual([1, 2, 3]);
    expect(fetch).toHaveBeenCalledWith(beside('pdfjs/cmaps/78-H.bcmap'));
  });

  it('says a file that did not arrive', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));

    await expect(
      new PackageFiles().fetch({ kind: 'cMapUrl', filename: '78-H.bcmap' })
    ).rejects.toThrow(/answered 404/);
  });

  it('refuses a file it does not have, without a fetch', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(
      new PackageFiles().fetch({ kind: 'wasmUrl', filename: 'openjpeg.wasm' })
    ).rejects.toThrow('The PDF format has no wasmUrl file named openjpeg.wasm.');
    expect(fetch).not.toHaveBeenCalled();
  });
});
