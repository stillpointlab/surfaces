// @vitest-environment node
/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// Through the built entry, as for `./html`: the package imports itself, so the
// entry loads dynamically (import-x/order classifies a self-import differently
// with and without `dist`). The built files are read as text through Vite, since
// `common` has no Node types.
const built = import.meta.glob<string>('../../dist/*.{js,cjs}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Every module specifier a built file imports, and the files it reaches through them. */
function importGraph(file: string, seen = new Map<string, string[]>()): Map<string, string[]> {
  if (seen.has(file)) return seen;
  const source = built[file];
  if (source === undefined) throw new Error(`${file} is not built`);
  const specifiers = [
    ...source.matchAll(/\bfrom\s*["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\s*\(?\s*["']([^"']+)["']/g),
    ...source.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1]);
  seen.set(file, specifiers);
  for (const specifier of specifiers) {
    if (specifier.startsWith('./')) importGraph(`../../dist/${specifier.slice(2)}`, seen);
  }
  return seen;
}

describe('the ./host entry', () => {
  it('is types only: it exports no values', async () => {
    const entry = await import('@stillpointlab/common-format/host');

    expect(Object.keys(entry)).toEqual([]);
  });

  it('imports nothing from Node or the DOM, directly or through a chunk', () => {
    for (const file of ['../../dist/host.js', '../../dist/host.cjs']) {
      for (const [module, specifiers] of importGraph(file)) {
        for (const specifier of specifiers) {
          expect(specifier, `${module} imports ${specifier}`).toMatch(/^\.\//);
        }
        expect(built[module], module).not.toMatch(
          /\b(document|window|HTMLElement|customElements|process|Buffer)\b/
        );
      }
    }
  });
});
