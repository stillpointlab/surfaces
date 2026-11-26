// @vitest-environment node
/// <reference types="node" />
// The package as its own build writes it: hls.js is a file a playlist loads, not
// part of the preview. The test builds the package by its tsup config (ESM, no
// type files) into a folder of its own, and reads what the `./preview` entry
// reaches before anything is asked for: its file and every file it imports.
// hls.js is a dependency, so the build names it and leaves it to the host's
// bundler, which makes it a file of its own there too.
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build, type Options } from 'tsup';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import config from '../tsup.config';

let out = '';
const files = new Map<string, string>();

beforeAll(async () => {
  out = await mkdtemp(join(tmpdir(), 'video-format-build-'));
  await build({
    ...(config as Options),
    config: false,
    outDir: out,
    format: ['esm'],
    dts: false,
    sourcemap: false,
    silent: true,
  });
  for (const name of await readdir(out, { recursive: true })) {
    if (name.endsWith('.js'))
      files.set(name.replaceAll('\\', '/'), await readFile(join(out, name), 'utf8'));
  }
}, 60_000);

afterAll(async () => {
  if (out) await rm(out, { recursive: true, force: true });
});

/** Where `specifier`, imported by `file`, points: a file of the build, or a package's name. */
function resolved(file: string, specifier: string): string {
  return specifier.startsWith('./') || specifier.startsWith('../')
    ? join(file, '..', specifier).replaceAll('\\', '/')
    : specifier;
}

/** What a built file imports by a static `import` or `export … from`. */
function staticImportsOf(file: string): string[] {
  const source = files.get(file) ?? '';
  return [
    ...source.matchAll(/^\s*(?:import|export)\b[^'";]*?\bfrom\s*["']([^"']+)["']/gm),
    ...source.matchAll(/^\s*import\s*["']([^"']+)["']/gm),
  ].map((match) => resolved(file, match[1]));
}

/** What a built file imports with `import()`. */
function dynamicImportsOf(file: string): string[] {
  const source = files.get(file) ?? '';
  return [...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((match) =>
    resolved(file, match[1])
  );
}

/** What loads with `file`: it and every file it imports statically, as far as they go. */
function reachedFrom(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const imported of staticImportsOf(file)) reachedFrom(imported, seen);
  return seen;
}

/** The built files that import hls.js. */
const importersOfHls = () =>
  [...files.keys()].filter(
    (file) => staticImportsOf(file).includes('hls.js') || dynamicImportsOf(file).includes('hls.js')
  );

describe('the built package', () => {
  it('has one file that imports hls.js, a split file of its own', () => {
    expect(files.has('preview.js')).toBe(true);
    expect(importersOfHls()).toEqual([expect.stringMatching(/^chunks\/hls-engine-[\w-]+\.js$/)]);
  });

  it('keeps hls.js out of what the preview entry and the format entry load', () => {
    for (const entry of ['preview.js', 'format.js', 'index.js']) {
      for (const file of reachedFrom(entry)) {
        expect(file, `${entry} reaches hls.js`).not.toBe('hls.js');
        expect(importersOfHls(), `${entry} reaches the engine`).not.toContain(file);
      }
    }
  });

  it('reaches the engine file from the preview through import() alone', () => {
    const [engine] = importersOfHls();
    const loaders = [...files.keys()].filter((file) => dynamicImportsOf(file).includes(engine));
    expect(loaders.length).toBeGreaterThan(0);
    const preview = reachedFrom('preview.js');
    for (const file of loaders) expect(preview.has(file), `${file} is the preview's`).toBe(true);
  });
});
