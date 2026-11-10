// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { fail, ok } from '../app';
import { lineBreakOf } from '../line-endings';

import { describeAppCore } from './app';
import {
  assertCommentsKept,
  assertCrlfKept,
  assertFinalNewlineKept,
  assertMounts,
  assertReparses,
  assertRoundTripCommentsKept,
  assertRoundTripCrlfKept,
  assertRoundTripFinalNewlineKept,
  assertRoundTripProjects,
  assertRoundTripReparses,
} from './app-checks';

import type {
  AppCoreOptions,
  AppCoreRewrite,
  AppCoreRoundTrip,
  AppCoreRoundTripOptions,
  AppFixture,
  AppMountResult,
} from './app';
import type { AppCore, AppSnapshot } from '../app';

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

// Appends always end with a line break: the recorded-gap shape.
const appendD: AppCoreRewrite = {
  ...rewrite(
    'append d',
    (text) => `${text.replace(/(\r\n|\r|\n)?$/, lineBreakOf(text))}d: 4${lineBreakOf(text)}`
  ),
  addsFinalNewline: true,
};

const options: AppCoreOptions = {
  manifest: 'kv.app',
  fixtures,
  mount,
  rewrites: [editB, addC, appendD],
};

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

  it('a rewrite with the addsFinalNewline gap that loses it', () => {
    const broken = {
      ...rewrite('trim', (text: string) => setValue(text, 'b', 'twenty').trimEnd()),
      addsFinalNewline: true,
    };
    expect(() => assertFinalNewlineKept(broken, input)).toThrow(/lost the final newline/);
  });

  it('an added final newline', () => {
    const broken = rewrite('terminate', (text) => setValue(text.trimEnd(), 'b', 'twenty') + '\n');
    expect(() => assertFinalNewlineKept(broken, input)).toThrow(/added the final newline/);
  });
});

// The sample as an `AppCore`: one view (a file's entries), three ops (set a
// value, move a file, add a file) and a seed. `garble`, `strip`, `normalise`,
// `trim` and `vanish` are the broken variants the failure tests apply.

type KvViews = { file: { params: { path: string }; state: { entries: string[] } } };
type KvOps = {
  set: { op: { path: string; key: string; value: string; broken?: string }; result: object };
  move: { op: { path: string; to: string }; result: object };
  add: { op: { path: string }; result: object };
};

function setBroken(text: string, key: string, value: string, broken?: string): string {
  const set = setValue(text, key, value);
  switch (broken) {
    case 'garble':
      return `${set}not an entry\n`;
    case 'strip':
      return set
        .split(/(?<=\n)/)
        .filter((line) => !line.trimStart().startsWith('#'))
        .join('');
    case 'normalise':
      return set.replace(/\r\n/g, '\n');
    case 'trim':
      return set.trimEnd();
    default:
      return set;
  }
}

const kvCore: AppCore<KvViews, KvOps, null, { folder: string }> = {
  project: (snapshot: AppSnapshot, view) => {
    const text = snapshot.files[view.path];
    return typeof text === 'string' && parses(text)
      ? { entries: text.split(/\r\n|\r|\n/).filter((line) => entry.test(line)) }
      : null;
  },
  apply: (snapshot, op) => {
    const text = snapshot.files[op.path];
    if (typeof text !== 'string') return fail('KV_NO_FILE', `No file at ${op.path}`);
    // A host fact beyond the files: a path the host holds.
    if ((snapshot as AppSnapshot & { held?: string }).held === op.path) {
      return fail('KV_HELD', `${op.path} is held`);
    }
    switch (op.type) {
      case 'set': {
        const { key, value, broken } = op as KvOps['set']['op'];
        return ok({
          changes: [{ kind: 'write', path: op.path, content: setBroken(text, key, value, broken) }],
        });
      }
      case 'move':
        return ok({
          changes: [
            { kind: 'move', from: op.path, path: (op as KvOps['move']['op']).to, content: text },
          ],
        });
      default:
        return ok({ changes: [{ kind: 'create', path: `${op.path}.new.kv`, content: 'a: 0\n' }] });
    }
  },
  seed: ({ folder }) =>
    ok({
      manifestPath: `${folder}/kv.app`,
      files: [{ kind: 'create', path: `${folder}/kv.app`, content: 'kind: kv\n' }],
    }),
};

const trip = (name: string, op: AppCoreRoundTrip['op'], extra: Partial<AppCoreRoundTrip> = {}) => ({
  name,
  fixture: 'commented',
  op,
  view: { type: 'file', path: 'notes/two.kv' },
  ...extra,
});

const roundTrip: AppCoreRoundTripOptions = {
  core: kvCore,
  facts: null,
  reparses: (_path, text) => parses(text),
  ops: [
    trip('set b', { type: 'set', path: 'notes/two.kv', key: 'b', value: 'twenty' }),
    trip('add a file', { type: 'add', path: 'notes/two.kv' }),
    {
      ...trip('move the file', {
        type: 'move',
        path: 'notes/two.kv',
        to: 'notes/moved.kv',
      }),
      view: { type: 'file', path: 'kv.app' },
    },
  ],
};

describeAppCore('sample core', { manifest: 'kv.app', fixtures, mount, core: roundTrip });

describe('the round trip fails on a broken core', () => {
  const coreOptions: AppCoreOptions = { manifest: 'kv.app', fixtures, mount, core: roundTrip };
  const broken = (variant: string) =>
    trip(variant, {
      type: 'set',
      path: 'notes/two.kv',
      key: 'b',
      value: 'twenty',
      broken: variant,
    });

  it('a refused op', () => {
    const refused = trip('refused', {
      type: 'set',
      path: 'nowhere.kv',
      key: 'a',
      value: '1',
    });
    expect(() => assertRoundTripReparses(coreOptions, roundTrip, refused)).toThrow(/KV_NO_FILE/);
  });

  it("an op's snapshot fields reach the core", () => {
    const held = trip(
      'held',
      { type: 'set', path: 'notes/two.kv', key: 'b', value: 'twenty' },
      { snapshot: { held: 'notes/two.kv' } }
    );
    expect(() => assertRoundTripReparses(coreOptions, roundTrip, held)).toThrow(/KV_HELD/);
  });

  it('a view that no longer projects', () => {
    expect(() => assertRoundTripProjects(coreOptions, roundTrip, broken('garble'))).toThrow(
      /does not project after/
    );
  });

  it('output that does not parse', () => {
    expect(() => assertRoundTripReparses(coreOptions, roundTrip, broken('garble'))).toThrow(
      /does not parse/
    );
  });

  it('a dropped comment', () => {
    expect(() => assertRoundTripCommentsKept(coreOptions, roundTrip, broken('strip'))).toThrow(
      /dropped or changed the comment/
    );
  });

  it('LF written into CRLF text', () => {
    expect(() => assertRoundTripCrlfKept(coreOptions, roundTrip, broken('normalise'))).toThrow(
      /other than CRLF/
    );
  });

  it('a lost final newline', () => {
    expect(() => assertRoundTripFinalNewlineKept(coreOptions, roundTrip, broken('trim'))).toThrow(
      /lost the final newline/
    );
  });
});
