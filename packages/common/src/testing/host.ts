// The storage port suite: the rules a `StoragePort` keeps, as tests any port
// runs, so the ports cannot drift apart. The memory port runs it in `common`;
// the node port runs it over a temporary folder in `packages/hosts/local`.
//
// It checks what the runner relies on: `list` answers every file and the
// folders above it; `get` answers text with a version, and refuses a missing
// file, a folder, a text with a NUL, a file over 2 MiB and a path outside the
// root; `put` writes all the changes or none, one call at a time, a path once
// per call, each `base` checked, a `create` or a `move` only where nothing is,
// and a `move` without content keeps the text. With `status`, a port made over
// committed files says what each kind of change did.
//
//   import { describeStoragePort } from '@stillpointlab/common-format/testing/host';
//   describeStoragePort('memory', (files) => createMemoryPort(files));

import { describe, expect, it } from 'vitest';

import type { FolderNode } from '../app';
import type { PortChange, StoragePort } from '../host';

export interface StoragePortSuiteOptions {
  /**
   * Whether `make` commits the files, so `status()` says what a `put` changed.
   * Default true; false for a port whose status is always empty (a folder
   * outside a repository).
   */
  status?: boolean;
}

/** `get` refuses a file over this many bytes of UTF-8. */
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

/** The files most tests start from. */
const FILES = { 'a.md': 'a', 'docs/b.md': 'b' };

const nodes = (listed: FolderNode[]): string[] =>
  listed.map((node) => `${node.type === 'tree' ? 'd' : 'f'} ${node.path}`);

/** Every file's text, by path, as the port answers it: what a refused `put` must leave alone. */
async function contents(port: StoragePort): Promise<Record<string, string | null>> {
  const listed = await port.list();
  const out: Record<string, string | null> = {};
  for (const node of listed) {
    if (node.type !== 'blob') continue;
    const answer = await port.get(node.path);
    out[node.path] = answer.ok ? answer.text : null;
  }
  return out;
}

async function versionOf(port: StoragePort, path: string): Promise<string> {
  const answer = await port.get(path);
  if (!answer.ok) throw new Error(`${path}: ${answer.code} ${answer.message}`);
  return answer.version;
}

async function textOf(port: StoragePort, path: string): Promise<string> {
  const answer = await port.get(path);
  if (!answer.ok) throw new Error(`${path}: ${answer.code} ${answer.message}`);
  return answer.text;
}

export function describeStoragePort(
  name: string,
  make: (files: Record<string, string>) => StoragePort | Promise<StoragePort>,
  options: StoragePortSuiteOptions = {}
): void {
  const withStatus = options.status ?? true;

  describe(`${name}: the storage port`, () => {
    describe('list', () => {
      it('answers every file and the folders above it, sorted by path', async () => {
        const port = await make({ 'z.md': 'z', 'docs/b.md': 'b', 'docs/deep/c.md': 'c' });
        expect(nodes(await port.list())).toEqual([
          'd docs',
          'f docs/b.md',
          'd docs/deep',
          'f docs/deep/c.md',
          'f z.md',
        ]);
      });

      it('follows a put: a new file, a moved one, and no folder a move or delete emptied', async () => {
        const port = await make({ 'a.md': 'a', 'old/b.md': 'b', 'gone/c.md': 'c' });
        const answer = await port.put([
          { kind: 'create', path: 'new/n.md', content: 'n' },
          { kind: 'move', from: 'old/b.md', path: 'b.md' },
          { kind: 'delete', path: 'gone/c.md' },
        ]);
        expect(answer.ok).toBe(true);
        expect(nodes(await port.list())).toEqual(['f a.md', 'f b.md', 'd new', 'f new/n.md']);
      });
    });

    describe('get', () => {
      it('answers the text and a version, the one `put` answered for it', async () => {
        const port = await make(FILES);
        const read = await port.get('a.md');
        expect(read).toMatchObject({ ok: true, text: 'a' });
        expect(read.ok && typeof read.version).toBe('string');

        const written = await port.put([{ kind: 'write', path: 'a.md', content: 'A' }]);
        if (!written.ok) throw new Error(written.message);
        expect(await port.get('a.md')).toEqual({
          ok: true,
          text: 'A',
          version: written.versions['a.md'],
        });
        expect(written.versions['a.md']).not.toBe(read.ok && read.version);
      });

      it('keeps a byte order mark and CRLF line breaks', async () => {
        const port = await make({ 'bom.txt': '\ufeffone\r\ntwo' });
        expect(await textOf(port, 'bom.txt')).toBe('\ufeffone\r\ntwo');
      });

      it.each([
        ['a missing file', 'missing.md', 'HOST_FILE_NOT_FOUND'],
        ['a folder', 'docs', 'HOST_FILE_NOT_FOUND'],
        ['a text with a NUL', 'nul.bin', 'HOST_NOT_TEXT'],
        ['a file over 2 MiB', 'big.txt', 'HOST_FILE_TOO_LARGE'],
        ['a path with ..', '../a.md', 'HOST_PATH_OUTSIDE_ROOT'],
        ['an absolute path', '/a.md', 'HOST_PATH_OUTSIDE_ROOT'],
        ["git's own folder", '.git/config', 'HOST_PATH_OUTSIDE_ROOT'],
        ['an empty segment', 'docs//b.md', 'HOST_PATH_OUTSIDE_ROOT'],
        ['a backslash', 'docs\\b.md', 'HOST_PATH_OUTSIDE_ROOT'],
      ])('refuses %s', async (_what, path, code) => {
        const port = await make({
          ...FILES,
          'nul.bin': 'PNG\0\u0001',
          'big.txt': 'a'.repeat(MAX_TEXT_BYTES + 1),
        });
        expect(await port.get(path)).toMatchObject({ ok: false, code });
      });

      it('opens a file of exactly 2 MiB, counted as UTF-8', async () => {
        const port = await make({
          'edge.txt': 'a'.repeat(MAX_TEXT_BYTES),
          'wide.txt': 'é'.repeat(MAX_TEXT_BYTES / 2 + 1),
        });
        expect((await port.get('edge.txt')).ok).toBe(true);
        expect(await port.get('wide.txt')).toMatchObject({ code: 'HOST_FILE_TOO_LARGE' });
      });
    });

    describe('put', () => {
      it('writes with a matching base and answers the new version', async () => {
        const port = await make(FILES);
        const base = await versionOf(port, 'a.md');
        const answer = await port.put([{ kind: 'write', path: 'a.md', content: 'new', base }]);
        expect(answer).toEqual({ ok: true, versions: { 'a.md': await versionOf(port, 'a.md') } });
        expect(await textOf(port, 'a.md')).toBe('new');
      });

      it('writes without a base', async () => {
        const port = await make(FILES);
        expect((await port.put([{ kind: 'write', path: 'a.md', content: 'A' }])).ok).toBe(true);
        expect(await textOf(port, 'a.md')).toBe('A');
      });

      it('one stale base refuses the whole call and writes nothing', async () => {
        const port = await make({ 'a.md': 'a', 'b.md': 'b', 'c.md': 'c' });
        const a = await versionOf(port, 'a.md');
        const stale = await versionOf(port, 'b.md');
        await port.put([{ kind: 'write', path: 'b.md', content: 'what b is now' }]);
        const before = await contents(port);
        const answer = await port.put([
          { kind: 'write', path: 'a.md', content: 'A', base: a },
          { kind: 'create', path: 'new.md', content: 'N' },
          { kind: 'delete', path: 'c.md' },
          { kind: 'write', path: 'b.md', content: 'B', base: stale },
        ]);
        expect(answer).toMatchObject({ ok: false, code: 'HOST_FILE_CHANGED' });
        expect(answer.ok || answer.message).toContain('b.md');
        expect(await contents(port)).toEqual(before);
      });

      it('creates a file, with the folders it needs', async () => {
        const port = await make(FILES);
        const answer = await port.put([{ kind: 'create', path: 'new/deep/n.md', content: 'n' }]);
        expect(answer).toEqual({
          ok: true,
          versions: { 'new/deep/n.md': await versionOf(port, 'new/deep/n.md') },
        });
        expect(await textOf(port, 'new/deep/n.md')).toBe('n');
      });

      it.each<[string, PortChange[], string]>([
        [
          'a create onto a file',
          [{ kind: 'create', path: 'a.md', content: '' }],
          'HOST_PATH_EXISTS',
        ],
        [
          'a create onto a folder',
          [{ kind: 'create', path: 'docs', content: '' }],
          'HOST_PATH_EXISTS',
        ],
        [
          'a create under a file',
          [{ kind: 'create', path: 'a.md/x.md', content: '' }],
          'HOST_PATH_EXISTS',
        ],
        [
          'a move onto a file',
          [{ kind: 'move', from: 'a.md', path: 'docs/b.md', content: '' }],
          'HOST_PATH_EXISTS',
        ],
        [
          'a write of a missing file',
          [{ kind: 'write', path: 'no.md', content: '' }],
          'HOST_FILE_NOT_FOUND',
        ],
        [
          'a move of a missing file',
          [{ kind: 'move', from: 'no.md', path: 'docs/c.md', content: '' }],
          'HOST_FILE_NOT_FOUND',
        ],
        ['a delete of a missing file', [{ kind: 'delete', path: 'no.md' }], 'HOST_FILE_NOT_FOUND'],
        ['a delete of a folder', [{ kind: 'delete', path: 'docs' }], 'HOST_FILE_NOT_FOUND'],
        [
          'a stale base on a move',
          [{ kind: 'move', from: 'a.md', path: 'c.md', base: 'stale' }],
          'HOST_FILE_CHANGED',
        ],
        [
          'a stale base on a delete',
          [{ kind: 'delete', path: 'a.md', base: 'stale' }],
          'HOST_FILE_CHANGED',
        ],
        [
          'two new files where one is the folder of the other',
          [
            { kind: 'create', path: 'n', content: '' },
            { kind: 'create', path: 'n/m.md', content: '' },
          ],
          'HOST_PATH_EXISTS',
        ],
        [
          'one path named twice',
          [
            { kind: 'write', path: 'a.md', content: '1' },
            { kind: 'delete', path: 'a.md' },
          ],
          'HOST_BAD_REQUEST',
        ],
        [
          "a move's source named again as another change's path",
          [
            { kind: 'move', from: 'a.md', path: 'c.md' },
            { kind: 'create', path: 'a.md', content: 'again' },
          ],
          'HOST_BAD_REQUEST',
        ],
        ['an unknown kind', [{ kind: 'chmod', path: 'a.md' } as never], 'HOST_BAD_REQUEST'],
        ['a write without content', [{ kind: 'write', path: 'a.md' } as never], 'HOST_BAD_REQUEST'],
        [
          'a create outside the root',
          [{ kind: 'create', path: '../out.md', content: '' }],
          'HOST_PATH_OUTSIDE_ROOT',
        ],
        [
          "a create in git's folder",
          [{ kind: 'create', path: '.git/hooks/pre-commit', content: '' }],
          'HOST_PATH_OUTSIDE_ROOT',
        ],
        [
          'a move out of the root',
          [{ kind: 'move', from: 'a.md', path: '/tmp/a.md' }],
          'HOST_PATH_OUTSIDE_ROOT',
        ],
        [
          'a move from outside the root',
          [{ kind: 'move', from: '../a.md', path: 'c.md' }],
          'HOST_PATH_OUTSIDE_ROOT',
        ],
      ])('refuses %s, and writes nothing', async (_what, changes, code) => {
        const port = await make(FILES);
        const before = await contents(port);
        expect(await port.put(changes)).toMatchObject({ ok: false, code });
        expect(await contents(port)).toEqual(before);
        expect(nodes(await port.list())).toEqual(['f a.md', 'd docs', 'f docs/b.md']);
      });

      it('moves a file with new content, and the folder it emptied goes', async () => {
        const port = await make({ 'old/a.md': 'a', 'keep.md': 'k' });
        const base = await versionOf(port, 'old/a.md');
        const answer = await port.put([
          { kind: 'move', from: 'old/a.md', path: 'new/b.md', content: 'b', base },
        ]);
        expect(answer).toEqual({
          ok: true,
          versions: { 'new/b.md': await versionOf(port, 'new/b.md') },
        });
        expect(await contents(port)).toEqual({ 'keep.md': 'k', 'new/b.md': 'b' });
        expect(nodes(await port.list())).toEqual(['f keep.md', 'd new', 'f new/b.md']);
      });

      it('moves a file without content, keeping its text and its version', async () => {
        const port = await make({ 'a.md': 'the same text' });
        const version = await versionOf(port, 'a.md');
        const answer = await port.put([{ kind: 'move', from: 'a.md', path: 'docs/a.md' }]);
        expect(answer).toEqual({ ok: true, versions: { 'docs/a.md': version } });
        expect(await contents(port)).toEqual({ 'docs/a.md': 'the same text' });
      });

      it('deletes files, with a base, and the folders left empty go', async () => {
        const port = await make({ 'a/b/c.md': 'c', 'a/b/d.md': 'd', 'e.md': 'e' });
        const base = await versionOf(port, 'a/b/c.md');
        const answer = await port.put([
          { kind: 'delete', path: 'a/b/c.md', base },
          { kind: 'delete', path: 'a/b/d.md' },
        ]);
        expect(answer).toEqual({ ok: true, versions: {} });
        expect(nodes(await port.list())).toEqual(['f e.md']);
      });

      it('two puts at once run one after the other: the second sees the first', async () => {
        const port = await make(FILES);
        const base = await versionOf(port, 'a.md');
        const [first, second] = await Promise.all([
          port.put([{ kind: 'write', path: 'a.md', content: 'first', base }]),
          port.put([{ kind: 'write', path: 'a.md', content: 'second', base }]),
        ]);
        expect(first.ok).toBe(true);
        expect(second).toMatchObject({ ok: false, code: 'HOST_FILE_CHANGED' });
        expect(await textOf(port, 'a.md')).toBe('first');

        const both = await Promise.all([
          port.put([{ kind: 'create', path: 'n.md', content: '1' }]),
          port.put([{ kind: 'create', path: 'n.md', content: '2' }]),
        ]);
        expect(both.map((answer) => answer.ok)).toEqual([true, false]);
        expect(both[1]).toMatchObject({ code: 'HOST_PATH_EXISTS' });
        expect(await textOf(port, 'n.md')).toBe('1');
      });

      it('answers an empty call with no versions', async () => {
        const port = await make(FILES);
        expect(await port.put([])).toEqual({ ok: true, versions: {} });
      });
    });

    describe.runIf(withStatus)('status', () => {
      it('is empty over the files as made', async () => {
        const port = await make(FILES);
        expect(await port.status()).toEqual({});
      });

      it('says what each kind of change did, a moved file by its new path', async () => {
        const port = await make({
          'a.md': 'a',
          'b.md': 'the file that moves, long enough for git to see it as itself',
          'c.md': 'c',
        });
        const answer = await port.put([
          { kind: 'write', path: 'a.md', content: 'A' },
          { kind: 'move', from: 'b.md', path: 'docs/b.md' },
          { kind: 'delete', path: 'c.md' },
          { kind: 'create', path: 'n.md', content: 'n' },
        ]);
        expect(answer.ok).toBe(true);
        expect(await port.status()).toEqual({
          'a.md': 'changed',
          'docs/b.md': 'moved',
          'c.md': 'deleted',
          'n.md': 'new',
        });
      });
    });
  });
}
