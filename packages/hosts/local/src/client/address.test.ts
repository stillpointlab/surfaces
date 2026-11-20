import { describe, expect, it } from 'vitest';

import { appAddress, formatAddress, parseAddress } from './address';

describe('the address', () => {
  it.each([
    ['README.md', 'preview', '#/file/README.md'],
    ['docs/notes.md', 'edit', '#/edit/docs/notes.md'],
    ['docs/notes.md', 'diff', '#/diff/docs/notes.md'],
    ['a b/#c?d%e.md', 'preview', '#/file/a%20b/%23c%3Fd%25e.md'],
    ['<script>/ünïcode.md', 'edit', '#/edit/%3Cscript%3E/%C3%BCn%C3%AFcode.md'],
  ] as const)('round-trips %s in the %s', (path, view, hash) => {
    expect(formatAddress({ path, view })).toBe(hash);
    expect(parseAddress(hash)).toEqual({ path, view });
  });

  it.each(['', '#', '#/', '#/file/', '#/other/a.md', '#/file/%E0%A4%A', '#/constructor/a'])(
    'names nothing for %j',
    (hash) => {
      expect(parseAddress(hash)).toBeNull();
    }
  );

  describe('an app', () => {
    const manifests = [
      'docs/inventory.yaml',
      'docs/tasks/tasks.yaml',
      'tasks.yaml',
      'a b/inventory.yaml',
    ];

    it.each([
      ['#/app/docs/inventory.yaml', 'docs/inventory.yaml', '', ''],
      ['#/app/docs/inventory.yaml/room/kitchen', 'docs/inventory.yaml', '/room/kitchen', ''],
      // The longest manifest path that is a prefix wins, at a segment's edge.
      [
        '#/app/docs/tasks/tasks.yaml/stage/4?path=a%2Fb.md',
        'docs/tasks/tasks.yaml',
        '/stage/4',
        'path=a%2Fb.md',
      ],
      ['#/app/tasks.yaml?x=1', 'tasks.yaml', '', 'x=1'],
      ['#/app/a%20b/inventory.yaml/room/a%2Fb', 'a b/inventory.yaml', '/room/a%2Fb', ''],
    ])('splits %s with the instances, and joins it again', (hash, manifestPath, subPath, query) => {
      const address = parseAddress(hash, manifests);
      expect(address).toEqual({ view: 'app', manifestPath, subPath, query });
      expect(formatAddress(address!)).toBe(hash);
    });

    it('keeps the sub-path encoded as the app wrote it', () => {
      expect(formatAddress(appAddress('a b/inventory.yaml', '/room/x%20y'))).toBe(
        '#/app/a%20b/inventory.yaml/room/x%20y'
      );
    });

    it('names no instance where none is a prefix, and keeps the address', () => {
      for (const hash of ['#/app/docs/inventory.yamlx', '#/app/elsewhere/inventory.yaml/room/a']) {
        const address = parseAddress(hash, manifests);
        expect(address).toMatchObject({ view: 'app', manifestPath: null });
        expect(formatAddress(address!)).toBe(hash);
      }
      expect(parseAddress('#/app/docs/inventory.yaml')).toMatchObject({ manifestPath: null });
    });

    it('names nothing for a malformed escape', () => {
      expect(parseAddress('#/app/docs/%E0%A4%A', manifests)).toBeNull();
    });
  });
});
