// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { fail, ok, placeNewFiles } from '../app';
import { lineBreakOf } from '../line-endings';

import { describeAppCore } from './app';
import {
  assertBoundsAcceptOp,
  assertBoundsRefuseOp,
  assertCommentsKept,
  assertCrlfKept,
  assertFinalNewlineKept,
  assertFromChanges,
  assertMeta,
  assertModuleCases,
  assertMounts,
  assertPagePathMatches,
  assertPageResolves,
  assertReparses,
  assertRoundTripCommentsKept,
  assertRoundTripCrlfKept,
  assertRoundTripFinalNewlineKept,
  assertRoundTripProjects,
  assertRoundTripReparses,
} from './app-checks';

import type {
  AppChangesCase,
  AppCoreOptions,
  AppCoreRewrite,
  AppCoreRoundTrip,
  AppCoreRoundTripOptions,
  AppFixture,
  AppModuleOptions,
  AppMountResult,
} from './app';
import type {
  AnyAppModule,
  AppBounds,
  AppCore,
  AppModule,
  AppPage,
  AppSnapshot,
  Result,
} from '../app';

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

// The sample as an `AppModule`: the core above behind a projection that needs
// the facts `fromChanges` makes (the files changed since the check-in), bounds
// written by hand (`common` has no schema library), and two pages: the landing,
// which shows the manifest or redirects a `?path=` to its file's page, and a
// file's page.

type KvFacts = { dirty: string[] };
type KvElementOps = {
  set: { op: { path: string; key: string; value: string }; reply: object };
  move: { op: { path: string; to: string }; reply: object };
  add: { op: { path: string }; reply: object };
};

const KV_MAX = 100;
const isText = (value: unknown, max = KV_MAX): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

const kvBounds: AppBounds<KvViews, KvElementOps, { folder: string }> = {
  op: (input) => {
    const op = input as Record<string, unknown>;
    const fields =
      op.type === 'set' ? ['path', 'key', 'value'] : op.type === 'move' ? ['path', 'to'] : ['path'];
    const causes = ['set', 'move', 'add'].includes(op.type as string)
      ? fields.filter((field) => !isText(op[field])).map((field) => ({ path: [field] }))
      : [{ path: ['type'] }];
    return causes.length > 0
      ? fail('APP_OP_INVALID', 'The op is not valid', causes)
      : ok({ op: op as never });
  },
  view: (input) => {
    const view = input as Record<string, unknown>;
    return view.type === 'file' && isText(view.path)
      ? ok({ view: { type: 'file', path: view.path } })
      : fail('APP_VIEW_INVALID', 'The view is not valid', [{ path: ['type'] }]);
  },
  create: (input) => {
    const folder = (input as { folder?: unknown }).folder;
    return isText(folder)
      ? ok({ input: { folder } })
      : fail('APP_CREATE_INVALID', 'The input is not valid', [{ path: ['folder'] }]);
  },
};

const kvPages: AppPage[] = [
  {
    path: '',
    resolve: async ({ query, base }) =>
      query.path !== undefined
        ? { redirect: `${base}/file/${encodeURIComponent(query.path)}` }
        : { view: { type: 'file', path: 'kv.app' } },
    title: () => 'KV',
    emptyWhenMissing: true,
  },
  {
    path: '/file/:path',
    resolve: async ({ params }) =>
      isText(params.path) && params.path.endsWith('.kv')
        ? { view: { type: 'file', path: params.path } }
        : { notFound: true },
    title: (state) => `${(state as { entries: string[] }).entries.length} entries — KV`,
    emptyWhenMissing: false,
  },
];

const kvModule: AppModule<KvViews, KvOps, KvFacts, { folder: string }, AppSnapshot, KvElementOps> =
  {
    id: 'kv',
    lifecycle: {
      manifestName: 'kv.app',
      validateAndScope: (_content, _nodes, manifestPath) => ({
        ok: true,
        scope: new Set([manifestPath]),
        warnings: [],
      }),
      describeInstance: () => ({ label: 'KV' }),
    },
    core: {
      ...kvCore,
      // Without the facts `fromChanges` makes, nothing projects.
      project: (snapshot, view, facts) => {
        if (!Array.isArray(facts?.dirty)) return null;
        const state = kvCore.project(snapshot, view, null);
        return state && { ...state, dirty: facts.dirty };
      },
    },
    coreOps: ['set', 'move', 'add'],
    hostOps: [],
    toCoreOp: (op) => op,
    reply: () => ok(),
    refusalClass: () => 'invalid',
    meta: { label: 'KV', icon: 'file', create: { noun: 'a kv folder', defaultFolder: 'kv' } },
    bounds: kvBounds,
    pages: kvPages,
    placeCreate: (plan, paths) => {
      const placed = placeNewFiles(plan.files, paths);
      return placed.ok ? ok({ files: placed.files }) : fail('KV_PATH_EXISTS', placed.path);
    },
    fromChanges: (changes) => ({
      facts: {
        dirty: changes
          .filter((change) => change.status === 'changed' || change.status === 'new')
          .map((change) => change.path),
      },
    }),
  };

const showsDirty =
  (path: string) =>
  (state: object): void => {
    expect((state as KvFacts).dirty).toContain(path);
  };

const moduleChecks: AppModuleOptions = {
  module: kvModule,
  ops: [
    {
      name: 'set b',
      fixture: 'commented',
      op: { type: 'set', path: 'notes/two.kv', key: 'b', value: 'twenty' },
    },
    { name: 'add a file', fixture: 'minimal', op: { type: 'add', path: 'one.kv' } },
  ],
  overLong: { type: 'set', path: 'notes/two.kv', key: 'b', value: 'x'.repeat(KV_MAX + 1) },
  pages: [
    { name: 'the manifest', fixture: 'minimal', path: '' },
    {
      name: 'a legacy link',
      fixture: 'commented',
      path: '',
      query: { path: 'notes/two.kv' },
      answers: { redirect: '/file/notes%2Ftwo.kv' },
    },
    { name: 'a file', fixture: 'commented', path: '/file/notes%2Ftwo.kv' },
    { name: 'not a kv file', fixture: 'commented', path: '/file/README.md', answers: 'not-found' },
    { name: 'no such page', fixture: 'commented', path: '/nowhere', answers: 'not-found' },
  ],
  changes: [
    {
      name: 'an edited file',
      fixture: 'commented',
      changes: [
        { path: 'notes/two.kv', status: 'changed' },
        { path: 'README.md', status: 'moved', from: 'OLD.md' },
      ],
      view: { type: 'file', path: 'notes/two.kv' },
      shows: showsDirty('notes/two.kv'),
    },
  ],
};

describeAppCore('sample module', {
  manifest: 'kv.app',
  fixtures,
  mount,
  core: roundTrip,
  module: moduleChecks,
});

describe('the module checks fail on a broken module', () => {
  const options: AppCoreOptions = { manifest: 'kv.app', fixtures, mount, module: moduleChecks };
  const withModule = (changes: Partial<AnyAppModule>): AnyAppModule =>
    ({ ...kvModule, ...changes }) as AnyAppModule;
  const withPage = (page: Partial<AppPage>, at = 0): AnyAppModule =>
    withModule({ pages: kvPages.map((each, i) => (i === at ? { ...each, ...page } : each)) });

  it('a page no case resolves', () => {
    expect(() => assertModuleCases(kvModule, { ...moduleChecks, pages: [] })).toThrow(
      /no page case resolves the page ""/
    );
  });

  it('an empty icon', () => {
    expect(() => assertMeta(withModule({ meta: { label: 'KV', icon: ' ' } }))).toThrow(/meta.icon/);
  });

  it('an empty subject for a create', () => {
    const create = { noun: 'a kv folder', subject: ' ', defaultFolder: 'kv' };
    expect(() => assertMeta(withModule({ meta: { label: 'KV', icon: 'file', create } }))).toThrow(
      /meta.create.subject/
    );
  });

  it('bounds that accept an over-long field', () => {
    const lax = withModule({
      bounds: { ...kvBounds, op: (input: unknown) => ok({ op: input as never }) },
    });
    expect(() => assertBoundsRefuseOp(lax, moduleChecks.overLong)).toThrow(/accepted/);
  });

  it('bounds whose answer the core refuses', () => {
    const elsewhere = withModule({
      bounds: { ...kvBounds, op: () => ok({ op: { type: 'set', path: 'nowhere.kv' } as never }) },
    });
    expect(() => assertBoundsAcceptOp(options, elsewhere, moduleChecks.ops![0])).toThrow(
      /KV_NO_FILE/
    );
  });

  it('a refusal without its causes', () => {
    const bare = withModule({
      bounds: { ...kvBounds, op: (): Result<never> => fail('APP_OP_INVALID', 'no') },
    });
    expect(() => assertBoundsRefuseOp(bare, moduleChecks.overLong)).toThrow(/causes/);
  });

  it('a page shadowed by an earlier one', () => {
    const shadowing = withModule({
      pages: [kvPages[1], { ...kvPages[1], path: '/file/new' }],
    });
    expect(() => assertPagePathMatches(shadowing, '/file/new')).toThrow(/does not match/);
  });

  it('a redirect that drops a fragment base', async () => {
    // Resolving the sub-path against the base as a URL keeps a path base and
    // loses a fragment one.
    const throughUrl = withPage({
      resolve: async ({ query, base }) => ({
        redirect: new URL(`file/${encodeURIComponent(query.path)}`, `http://host${base}/`).pathname,
      }),
    });
    await expect(assertPageResolves(options, throughUrl, moduleChecks.pages![1])).rejects.toThrow(
      /base #\/app\/kv\.app\) redirected elsewhere/
    );
  });

  it('a page whose view the core does not project', async () => {
    const missing = withPage(
      { resolve: async () => ({ view: { type: 'file', path: 'gone.kv' } }) },
      1
    );
    await expect(assertPageResolves(options, missing, moduleChecks.pages![2])).rejects.toThrow(
      /does not project its view/
    );
  });

  it('a page that answers a view for a parameter it should refuse', async () => {
    const lax = withPage({ resolve: async () => ({ view: { type: 'file', path: 'one.kv' } }) }, 1);
    await expect(assertPageResolves(options, lax, moduleChecks.pages![3])).rejects.toThrow(
      /must answer not found/
    );
  });

  it('fromChanges answering facts the core cannot project with', () => {
    const blind = withModule({ fromChanges: () => ({ facts: null }) });
    expect(() => assertFromChanges(options, blind, moduleChecks.changes![0])).toThrow(
      /over no changes/
    );
  });

  it('fromChanges missing what the case says the state shows', () => {
    const forgetful = withModule({ fromChanges: () => ({ facts: { dirty: [] } }) });
    const changesCase: AppChangesCase = moduleChecks.changes![0];
    expect(() => assertFromChanges(options, forgetful, changesCase)).toThrow(/notes\/two\.kv/);
  });
});
