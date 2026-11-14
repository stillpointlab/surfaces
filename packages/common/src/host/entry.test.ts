// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Through the built entry, as for `./html`: the package imports itself, so the
// entry loads dynamically (import-x/order classifies a self-import differently
// with and without `dist`).
const builtEntry = createRequire(import.meta.url).resolve('@stillpointlab/common-format/host');

/** Every module specifier the built file imports, and the files it reaches through them. */
function importGraph(file: string, seen = new Map<string, string[]>()): Map<string, string[]> {
  if (seen.has(file)) return seen;
  const source = readFileSync(file, 'utf8');
  const specifiers = [
    ...source.matchAll(/\bfrom\s*["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\s*\(?\s*["']([^"']+)["']/g),
    ...source.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1]);
  seen.set(file, specifiers);
  for (const specifier of specifiers) {
    if (specifier.startsWith('.')) importGraph(join(dirname(file), specifier), seen);
  }
  return seen;
}

describe('the ./host entry', () => {
  it('is types only: it exports no values', async () => {
    const entry = await import('@stillpointlab/common-format/host');

    expect(Object.keys(entry)).toEqual([]);
  });

  it('imports nothing from Node or the DOM, directly or through a chunk', () => {
    for (const file of [builtEntry, builtEntry.replace(/\.c?js$/, '.js')]) {
      const graph = importGraph(file);
      for (const [module, specifiers] of graph) {
        for (const specifier of specifiers) {
          expect(specifier, `${module} imports ${specifier}`).toMatch(/^\.\.?\//);
        }
        const source = readFileSync(module, 'utf8');
        expect(source, module).not.toMatch(/\b(document|window|HTMLElement|customElements)\b/);
      }
    }
  });
});
