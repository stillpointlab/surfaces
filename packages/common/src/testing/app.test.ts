// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { lineBreakOf } from '../line-endings';

import { describeAppCore } from './app';
import {
  assertCommentsKept,
  assertCrlfKept,
  assertFinalNewlineKept,
  assertMounts,
  assertReparses,
} from './app-checks';

import type { AppCoreOptions, AppCoreRewrite, AppFixture, AppMountResult } from './app';

// A sample app core: line-based `key: value` files under a `kv.app` manifest that
// says `kind: kv`. `#` lines are comments; blank lines are allowed.

const entry = /^[\w-]+: .*$/;

function parses(text: string): boolean {
  return text
    .split(/\r\n|\r|\n/)
    .every((line) => line.trim() === '' || line.trimStart().startsWith('#') || entry.test(line));
}

function mount(files: AppFixture, manifestPath: string): AppMountResult {
  const manifest = files[manifestPath] ?? '';
  if (!parses(manifest) || !/^kind: kv$/m.test(manifest)) {
    return { ok: false, errors: ['the manifest does not say kind: kv'] };
  }
  return { ok: true, scope: Object.keys(files).filter((path) => path.endsWith('.kv')) };
}

/** Set `key` to `value`: the line rewritten in place, or appended before the final newline. */
function setValue(text: string, key: string, value: string): string {
  const lineBreak = lineBreakOf(text);
  const lines = text.split(/\r\n|\r|\n/);
  const at = lines.findIndex((line) => line.startsWith(`${key}: `));
  if (at >= 0) {
    lines[at] = `${key}: ${value}`;
  } else {
    const end = lines.at(-1) === '' ? lines.length - 1 : lines.length;
    lines.splice(end, 0, `${key}: ${value}`);
  }
  return lines.join(lineBreak);
}

const fixtures = {
  minimal: { 'kv.app': 'kind: kv\n', 'one.kv': 'a: 1\n' },
  commented: {
    'kv.app': '# the sample app\nkind: kv\n',
    'notes/two.kv': '# header\na: 1\n\n  # indented note\nb: 2\n# trailer\n',
    'README.md': 'not the app’s; ignored\n',
  },
};

function rewrite(name: string, apply: (text: string) => string): AppCoreRewrite {
  return { name, fixture: 'commented', path: 'notes/two.kv', apply, reparses: parses };
}

const editB = rewrite('edit b', (text) => setValue(text, 'b', 'twenty'));
const addC = rewrite('add c', (text) => setValue(text, 'c', '3'));

const options: AppCoreOptions = { manifest: 'kv.app', fixtures, mount, rewrites: [editB, addC] };

describeAppCore('sample', options);

describe('describeAppCore checks fail on a broken core', () => {
  const input = fixtures.commented['notes/two.kv'];

  it('a fixture that does not mount', () => {
    const broken = { ...options, fixtures: { bad: { 'kv.app': 'kind: other\n' } } };
    expect(() => assertMounts(broken, 'bad')).toThrow(/did not mount/);
  });

  it('a fixture without the manifest', () => {
    const broken = { ...options, fixtures: { bare: { 'one.kv': 'a: 1\n' } } };
    expect(() => assertMounts(broken, 'bare')).toThrow(/no manifest/);
  });

  it('output that does not parse', () => {
    const broken = rewrite('garble', (text) => `${text}not an entry\n`);
    expect(() => assertReparses(broken, input)).toThrow(/does not parse/);
  });

  it('a dropped comment', () => {
    const broken = rewrite('strip comments', (text) =>
      text
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('#'))
        .join('\n')
    );
    expect(() => assertCommentsKept(broken, input)).toThrow(/dropped or changed the comment/);
  });

  it('a changed comment', () => {
    const broken = rewrite('reindent', (text) => text.replace('  # indented', '# indented'));
    expect(() => assertCommentsKept(broken, input)).toThrow(/indented note/);
  });

  it('LF output on CRLF input', () => {
    const broken = rewrite('normalise', (text) =>
      setValue(text.replace(/\r\n/g, '\n'), 'b', 'twenty')
    );
    expect(() => assertCrlfKept(broken, input)).toThrow(/other than CRLF/);
  });

  it('one LF line among CRLF', () => {
    const broken = rewrite('append with \\n', (text) => `${text}c: 3\n`);
    expect(() => assertCrlfKept(broken, input)).toThrow(/other than CRLF/);
  });

  it('a lost final newline', () => {
    const broken = rewrite('trim', (text) => setValue(text, 'b', 'twenty').trimEnd());
    expect(() => assertFinalNewlineKept(broken, input)).toThrow(/lost the final newline/);
  });

  it('an added final newline', () => {
    const broken = rewrite('terminate', (text) => setValue(text.trimEnd(), 'b', 'twenty') + '\n');
    expect(() => assertFinalNewlineKept(broken, input)).toThrow(/added the final newline/);
  });
});
