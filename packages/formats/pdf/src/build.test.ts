// @vitest-environment node
/// <reference types="node" />
// The package as its own build writes it. The test builds the package by its
// tsup config (ESM, no type files) into a folder of its own and reads the files:
//
// - pdf.js's main module is a dependency, which the build names and leaves to
//   the host's bundler, from a file of its own that only an `import()` reaches;
// - the worker is a file of its own, `worker.js`, and keeps its import of the
//   copy of pdf.js's worker, which is beside it with its one change in place;
// - the files pdf.js fetches by name are where the built modules name them, so
//   a host that builds from `dist/` (Context Manager) emits each; no `.wasm`.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type Options } from 'tsup';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  HOOKED_FROM,
  HOOKED_TO,
  hookedHeader,
  installedPdfjs,
} from '../../../../tooling/gen-pdfjs';
import config from '../tsup.config';

let out = '';
const pkg = fileURLToPath(new URL('..', import.meta.url));
const files = new Map<string, string>();

beforeAll(async () => {
  out = await mkdtemp(join(tmpdir(), 'pdf-format-build-'));
  // From the package's folder, as `npm run build` runs it: tsup reads the
  // package's dependencies (what it leaves external) from there, and the copied
  // folders are named from there. The entries are named by their whole path,
  // since esbuild keeps the folder it started in.
  const options = config as Options;
  const entry = Object.fromEntries(
    Object.entries(options.entry as Record<string, string>).map(([name, path]) => [
      name,
      join(pkg, path),
    ])
  );
  const from = process.cwd();
  process.chdir(pkg);
  try {
    await build({
      ...options,
      entry,
      config: false,
      outDir: out,
      format: ['esm'],
      dts: false,
      sourcemap: false,
      silent: true,
    });
  } finally {
    process.chdir(from);
  }
  for (const name of await readdir(out, { recursive: true })) {
    if (/\.m?js$/.test(name) && !name.startsWith('pdfjs')) {
      files.set(name.replaceAll('\\', '/'), await readFile(join(out, name), 'utf8'));
    }
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

/** The built files that import pdf.js's main module. */
const importersOfPdfjs = () =>
  [...files.keys()].filter(
    (file) =>
      staticImportsOf(file).includes('pdfjs-dist') || dynamicImportsOf(file).includes('pdfjs-dist')
  );

/** Every file under `dir`, relative to it. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1));
}

describe('the built package', () => {
  it('has one file that imports pdf.js, a split file of its own', () => {
    expect(files.has('preview.js')).toBe(true);
    expect(importersOfPdfjs()).toEqual([expect.stringMatching(/^chunks\/engine-[\w-]+\.js$/)]);
  });

  it('keeps pdf.js out of what every entry loads', () => {
    for (const entry of ['preview.js', 'format.js', 'index.js', 'worker.js']) {
      for (const file of reachedFrom(entry)) {
        expect(file, `${entry} reaches pdf.js`).not.toMatch(/^pdfjs-dist/);
        expect(importersOfPdfjs(), `${entry} reaches the engine`).not.toContain(file);
      }
    }
  });

  it('reaches the engine file from the preview through import() alone', () => {
    const [engine] = importersOfPdfjs();
    const loaders = [...files.keys()].filter((file) => dynamicImportsOf(file).includes(engine));
    expect(loaders.length).toBeGreaterThan(0);
    const preview = reachedFrom('preview.js');
    for (const file of loaders) expect(preview.has(file), `${file} is the preview's`).toBe(true);
  });

  it('starts the worker from the preview entry’s own file', () => {
    expect(files.get('preview.js')).toMatch(
      /new Worker\(new URL\("\.\/worker\.js", import\.meta\.url\)/
    );
    expect(files.has('worker.js')).toBe(true);
  });

  it('builds the worker as a file of its own that imports the copy of pdf.js’s worker beside it', () => {
    expect(staticImportsOf('worker.js')).toEqual(['pdfjs/pdf.worker.mjs']);
    // Built into the worker's file, not dropped: it names the fallbacks.
    expect(files.get('worker.js')).toContain('globalThis.pdfjsFallbackUrl = ');
  });

  it('holds pdf.js’s worker, with its one change in place', async () => {
    const { version } = installedPdfjs(pkg);
    const worker = await readFile(join(out, 'pdfjs/pdf.worker.mjs'), 'utf8');

    expect(worker.slice(0, worker.indexOf('\n'))).toBe(hookedHeader(version));
    expect(worker.split(HOOKED_TO)).toHaveLength(2);
    expect(worker).not.toContain(`\n    ${HOOKED_FROM}`);
    expect(worker).toContain('this.initializeFromPort(self);');
    expect(worker.length).toBeGreaterThan(1_000_000);
  });

  it('puts each file the worker names beside it', () => {
    const named = [
      ...(files.get('worker.js') ?? '').matchAll(/new URL\("(\.\/[^"]+)", import\.meta\.url\)/g),
    ];
    expect(named.map((match) => match[1]).sort()).toEqual([
      './pdfjs/jbig2_nowasm_fallback.js',
      './pdfjs/openjpeg_nowasm_fallback.js',
    ]);
    for (const [, path] of named) expect(existsSync(join(out, path)), path).toBe(true);
  });

  it('puts the character maps and standard fonts where the preview names them', () => {
    const preview = files.get('preview.js') ?? '';
    for (const address of [
      'new URL(`./pdfjs/cmaps/${base}.bcmap`, import.meta.url)',
      'new URL(`./pdfjs/standard_fonts/${base}.pfb`, import.meta.url)',
      'new URL(`./pdfjs/standard_fonts/${base}.ttf`, import.meta.url)',
    ]) {
      expect(preview).toContain(address);
    }
    const { dir } = installedPdfjs(pkg);
    const maps = readdirSync(join(out, 'pdfjs/cmaps')).filter((name) => name.endsWith('.bcmap'));
    const fonts = readdirSync(join(out, 'pdfjs/standard_fonts')).filter((name) =>
      /\.(pfb|ttf)$/.test(name)
    );
    expect(maps.length).toBe(168);
    expect(fonts.length).toBe(14);
    for (const name of maps) {
      expect(statSync(join(out, 'pdfjs/cmaps', name)).size).toBe(
        statSync(join(dir, 'cmaps', name)).size
      );
    }
  });

  it('ships no WebAssembly', () => {
    expect(filesUnder(out).filter((name) => name.endsWith('.wasm'))).toEqual([]);
  });
});
