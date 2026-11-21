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

/**
 * Every module specifier a source imports: an `import` or `export` statement's
 * `from`, a bare or dynamic `import`, and a `require`. A `from` counts only in a
 * statement that starts with `import` or `export` and has no quote before it,
 * so the word in a message (`has no "from".`) is not read as one.
 */
function specifiersOf(source: string): string[] {
  return [
    ...source.matchAll(/\b(?:import|export)\b[^'";]*?\bfrom\s*["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\s*\(?\s*["']([^"']+)["']/g),
    ...source.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1]);
}

/** Every module specifier a built file imports, and the files it reaches through them. */
function importGraph(file: string, seen = new Map<string, string[]>()): Map<string, string[]> {
  if (seen.has(file)) return seen;
  const source = built[file];
  if (source === undefined) throw new Error(`${file} is not built`);
  const specifiers = specifiersOf(source);
  seen.set(file, specifiers);
  for (const specifier of specifiers) {
    if (specifier.startsWith('./')) importGraph(`../../dist/${specifier.slice(2)}`, seen);
  }
  return seen;
}

describe('reading a built file’s imports', () => {
  it('finds every form a build writes, minified or not', () => {
    expect(
      specifiersOf(
        [
          'import{a as b,c}from"node:fs";',
          "import d from './d.js';",
          'import * as e from "./e.js";',
          'import"./side.js";',
          'export{f}from"./f.js";export*from"./g.js";',
          'const h=await import("./h.js");',
          'var i=require("./i.cjs");',
        ].join('\n')
      ).sort()
    ).toEqual(
      ['./d.js', './e.js', './f.js', './g.js', './h.js', './i.cjs', './side.js', 'node:fs'].sort()
    );
  });

  it('does not take the word in a string for an import', () => {
    expect(
      specifiersOf(
        [
          'return `${at} (move) has no "from".`;',
          "const words = 'a move from \\'a.md\\' to \\'b.md\\'';",
          'message = "copied from " + JSON.stringify("a.md");',
          'const from = "x"; const to = from + "y";',
        ].join('\n')
      )
    ).toEqual([]);
  });
});

describe('the ./host entry', () => {
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
