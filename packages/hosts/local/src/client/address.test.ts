import { describe, expect, it } from 'vitest';

import { formatAddress, parseAddress } from './address';

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
});
