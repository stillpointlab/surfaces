/// <reference types="node" />
// The package as its own build writes it. A plugin registered through the
// `./editor` entry is seen by the editor that entry defines, and by the schema
// `./document` exports. This holds because the build is split: the registry is
// built once, into a file both entries import, and not copied into each.
//
// The test builds the package by its tsup config (ESM, no type files) and
// imports the built files. tsup runs in a process of its own, since esbuild
// refuses jsdom's globals, and from the package's folder, as `npm run build`
// runs it. It builds into a folder under the package's `node_modules`, so the
// built files find their dependencies as a host's would.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as Document from './document';
import type * as Editor from './editor/index';
import type { MarkdownEditorPlugin } from './index';
import type { EditorView } from 'prosemirror-view';

let out = '';
const pkg = join(import.meta.dirname, '..');

beforeAll(async () => {
  await mkdir(join(pkg, 'node_modules'), { recursive: true });
  out = await mkdtemp(join(pkg, 'node_modules', '.md-format-build-'));
  const tsup = join(
    dirname(createRequire(join(pkg, 'package.json')).resolve('tsup/package.json')),
    'dist',
    'cli-default.js'
  );
  await promisify(execFile)(
    process.execPath,
    [tsup, '--format', 'esm', '--no-dts', '--no-sourcemap', '--silent', '--out-dir', out],
    { cwd: pkg }
  );
  // A folder under `node_modules` is no package's, so it says its files are ESM.
  await writeFile(join(out, 'package.json'), '{ "type": "module" }\n');

  // ProseMirror's focus path uses execCommand for a Safari compatibility
  // workaround; jsdom does not provide the deprecated DOM method.
  if (typeof document.execCommand !== 'function') {
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    });
  }
}, 60_000);

afterEach(() => {
  document.body.replaceChildren();
});

afterAll(async () => {
  if (out) await rm(out, { recursive: true, force: true });
});

const built = <T>(name: string): Promise<T> =>
  import(/* @vite-ignore */ pathToFileURL(join(out, `${name}.js`)).href) as Promise<T>;

describe('the built package', () => {
  it('gives a plugin registered through ./editor to its editor and to ./document', async () => {
    const editor = await built<typeof Editor>('editor');
    const views: EditorView[] = [];
    const plugin: MarkdownEditorPlugin = {
      name: 'built-test',
      schemaNodes: { builtTestNode: { group: 'block', content: 'text*' } },
      onReady: (view) => views.push(view),
    };
    editor.registerEditorPlugin(plugin);

    const element = document.createElement('md-editor');
    expect(element).toBeInstanceOf(editor.ProseMirrorEditor);
    (element as Editor.ProseMirrorEditor).setContent('# Title');
    document.body.append(element);
    await (element as Editor.ProseMirrorEditor).whenReady();

    expect(views).toHaveLength(1);
    expect(views[0].state.schema.nodes.builtTestNode).toBeDefined();

    const { getSchema } = await built<typeof Document>('document');
    expect(getSchema().nodes.builtTestNode).toBeDefined();
  });
});
