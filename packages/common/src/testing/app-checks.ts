import { expect } from 'vitest';

import { matchAppPage } from '../app';
import { withLineBreak } from '../line-endings';

import type {
  AppChangesCase,
  AppCoreOptions,
  AppCoreRewrite,
  AppCoreRoundTrip,
  AppCoreRoundTripOptions,
  AppFixture,
  AppModuleOpCase,
  AppModuleOptions,
  AppPageCase,
} from './app';
import type {
  AnyAppModule,
  AppKnown,
  AppLifecycle,
  AppPageResolution,
  AppSnapshot,
  FileChange,
  FolderNode,
  Result,
} from '../app';

// The checks describeAppCore runs, one function per `it`, so common's own tests
// can show each one failing against a broken sample core.

/** The fixture's files, failing when the suite's options name one it lacks. */
export function fixtureFiles(options: AppCoreOptions, name: string): AppFixture {
  const files = options.fixtures[name];
  expect(files, `no fixture named "${name}"`).toBeDefined();
  expect(
    files[options.manifest],
    `fixture "${name}" has no manifest at "${options.manifest}"`
  ).toBeDefined();
  return files;
}

/** The fixture folder mounts: the app accepts its manifest. */
export function assertMounts(options: AppCoreOptions, name: string): void {
  const files = fixtureFiles(options, name);
  const result = options.mount(files, options.manifest);
  expect(
    result.ok,
    `fixture "${name}" did not mount: ${JSON.stringify(result.ok ? [] : result.errors)}`
  ).toBe(true);
}

/** A fixture's tree: a blob per file and a tree per folder above one. */
export function fixtureNodes(files: AppFixture): FolderNode[] {
  const folders = new Set<string>();
  for (const path of Object.keys(files)) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'));
  }
  return [
    ...[...folders].sort().map((path) => ({ path, type: 'tree' as const })),
    ...Object.keys(files).map((path) => ({ path, type: 'blob' as const })),
  ];
}

/** The lifecycle accepts the fixture, its scope holds the manifest, and it has a label. */
export function assertLifecycle(
  options: AppCoreOptions,
  lifecycle: AppLifecycle<{ label: string }>,
  name: string
): void {
  const files = fixtureFiles(options, name);
  const nodes = fixtureNodes(files);
  const result = lifecycle.validateAndScope(files[options.manifest], nodes, options.manifest);
  expect(result.ok, `fixture "${name}" did not validate: ${result.ok ? '' : result.message}`).toBe(
    true
  );
  if (result.ok) {
    expect(result.scope.has(options.manifest), 'the scope must hold the manifest').toBe(true);
  }
  const detail = lifecycle.describeInstance(files[options.manifest], nodes, options.manifest, []);
  expect(typeof detail.label, 'describeInstance must give a label').toBe('string');
  expect(lifecycle.manifestName, 'manifestName must name the manifest file').toBe(
    options.manifest.split('/').pop()
  );
}

/** The text a rewrite starts from: its fixture file. */
export function rewriteInput(options: AppCoreOptions, rewrite: AppCoreRewrite): string {
  const text = fixtureFiles(options, rewrite.fixture)[rewrite.path];
  expect(text, `fixture "${rewrite.fixture}" has no file "${rewrite.path}"`).toBeDefined();
  return text;
}

/** The rewrite's output parses again as the app reads it. */
export function assertReparses(rewrite: AppCoreRewrite, input: string): void {
  const output = rewrite.apply(input);
  expect(rewrite.reparses(output), `"${rewrite.name}" output does not parse`).toBe(true);
}

/** Every `#` comment line of the input appears in the output, as often and verbatim. */
export function assertCommentsKept(rewrite: AppCoreRewrite, input: string): void {
  const kept = countLines(commentLines(rewrite.apply(input)));
  for (const [line, count] of countLines(commentLines(input))) {
    expect(
      kept.get(line) ?? 0,
      `"${rewrite.name}" dropped or changed the comment ${JSON.stringify(line)}`
    ).toBeGreaterThanOrEqual(count);
  }
}

/** A CRLF input gives output that parses and whose every line break is CRLF. */
export function assertCrlfKept(rewrite: AppCoreRewrite, input: string): void {
  const crlf = withLineBreak(input, '\r\n');
  const output = rewrite.apply(crlf);
  const breaks = output.match(/\r\n|\r|\n/g) ?? [];
  expect(
    breaks.every((lineBreak) => lineBreak === '\r\n'),
    `"${rewrite.name}" wrote a line break other than CRLF into CRLF text`
  ).toBe(true);
  expect(rewrite.reparses(output), `"${rewrite.name}" output on CRLF input does not parse`).toBe(
    true
  );
}

/**
 * The output ends with a line break exactly when the input does, for the input
 * as given and for its variant with the final newline toggled. A rewrite with
 * the `addsFinalNewline` gap must end with one either way.
 */
export function assertFinalNewlineKept(rewrite: AppCoreRewrite, input: string): void {
  for (const text of [input, toggleFinalNewline(input)]) {
    const endsWithBreak = /(\r\n|\r|\n)$/.test(text);
    const expected = endsWithBreak || rewrite.addsFinalNewline === true;
    const output = rewrite.apply(text);
    expect(
      /(\r\n|\r|\n)$/.test(output),
      `"${rewrite.name}" ${expected ? 'lost' : 'added'} the final newline`
    ).toBe(expected);
  }
}

// ---- The round trip ---------------------------------------------------------

/** A fixture as the snapshot a host would hand the core: every file visible and readable. */
export function fixtureSnapshot(files: AppFixture, manifestPath: string): AppSnapshot {
  return { manifestPath, paths: Object.keys(files), files };
}

/** The snapshot an op runs over: the fixture's, with the trip's host facts laid on. */
function tripSnapshot(
  trip: AppCoreRoundTrip,
  files: AppFixture,
  manifestPath: string
): AppSnapshot {
  return { ...fixtureSnapshot(files, manifestPath), ...trip.snapshot };
}

/** The op's changes over these files, failing when the core refuses it. */
function applyTrip(
  options: AppCoreOptions,
  core: AppCoreRoundTripOptions,
  trip: AppCoreRoundTrip,
  files: AppFixture
): FileChange[] {
  const result = core.core.apply(tripSnapshot(trip, files, options.manifest), trip.op);
  expect(
    result.ok,
    `"${trip.name}" was refused: ${result.ok ? '' : `${result.code}: ${result.message}`}`
  ).toBe(true);
  return result.ok ? result.changes : [];
}

/** The files after a host writes the changes. */
function written(files: AppFixture, changes: readonly FileChange[]): Record<string, string> {
  const next: Record<string, string> = { ...files };
  for (const change of changes) {
    if (change.kind === 'move') delete next[change.from];
    next[change.path] = change.content;
  }
  return next;
}

/** A changed file's text before the op: the file it rewrites, or none for a new file. */
function inputOf(files: AppFixture, change: FileChange): string | undefined {
  if (change.kind === 'create') return undefined;
  return files[change.kind === 'move' ? change.from : change.path];
}

/** The view projects over the fixture, the op changes something, and the view projects after. */
export function assertRoundTripProjects(
  options: AppCoreOptions,
  core: AppCoreRoundTripOptions,
  trip: AppCoreRoundTrip
): void {
  const files = fixtureFiles(options, trip.fixture);
  const before = core.core.project(
    tripSnapshot(trip, files, options.manifest),
    trip.view,
    core.facts
  );
  expect(before, `"${trip.name}": the view does not project before the op`).not.toBeNull();
  const changes = applyTrip(options, core, trip, files);
  expect(changes.length, `"${trip.name}" changed nothing`).toBeGreaterThan(0);
  const after = core.core.project(
    tripSnapshot(trip, written(files, changes), options.manifest),
    trip.view,
    core.facts
  );
  expect(after, `"${trip.name}": the view does not project after the op`).not.toBeNull();
}

/** Every file the op writes parses again as the app reads it. */
export function assertRoundTripReparses(
  options: AppCoreOptions,
  core: AppCoreRoundTripOptions,
  trip: AppCoreRoundTrip
): void {
  for (const change of applyTrip(options, core, trip, fixtureFiles(options, trip.fixture))) {
    expect(
      core.reparses(change.path, change.content),
      `"${trip.name}" wrote ${change.path}, which does not parse`
    ).toBe(true);
  }
}

/** Every comment line of a rewritten file appears in its new content, as often and verbatim. */
export function assertRoundTripCommentsKept(
  options: AppCoreOptions,
  core: AppCoreRoundTripOptions,
  trip: AppCoreRoundTrip
): void {
  const files = fixtureFiles(options, trip.fixture);
  for (const change of applyTrip(options, core, trip, files)) {
    const input = inputOf(files, change);
    if (input === undefined) continue;
    const kept = countLines(commentLines(change.content));
    for (const [line, count] of countLines(commentLines(input))) {
      expect(
        kept.get(line) ?? 0,
        `"${trip.name}" dropped or changed the comment ${JSON.stringify(line)} in ${change.path}`
      ).toBeGreaterThanOrEqual(count);
    }
  }
}

/** Over a fixture whose files all break lines with CRLF, every rewritten file keeps CRLF and parses. */
export function assertRoundTripCrlfKept(
  options: AppCoreOptions,
  core: AppCoreRoundTripOptions,
  trip: AppCoreRoundTrip
): void {
  const files = Object.fromEntries(
    Object.entries(fixtureFiles(options, trip.fixture)).map(([path, text]) => [
      path,
      withLineBreak(text, '\r\n'),
    ])
  );
  for (const change of applyTrip(options, core, trip, files)) {
    if (change.kind === 'create') continue;
    const breaks = change.content.match(/\r\n|\r|\n/g) ?? [];
    expect(
      breaks.every((lineBreak) => lineBreak === '\r\n'),
      `"${trip.name}" wrote a line break other than CRLF into ${change.path}`
    ).toBe(true);
    expect(
      core.reparses(change.path, change.content),
      `"${trip.name}" wrote ${change.path} from CRLF text, which does not parse`
    ).toBe(true);
  }
}

/**
 * A rewritten file ends with a line break exactly when it did before, over the
 * fixture as given and over its variant with every final newline toggled. An op
 * with the `addsFinalNewline` gap must end with one either way.
 */
export function assertRoundTripFinalNewlineKept(
  options: AppCoreOptions,
  core: AppCoreRoundTripOptions,
  trip: AppCoreRoundTrip
): void {
  const given = fixtureFiles(options, trip.fixture);
  const toggled = Object.fromEntries(
    Object.entries(given).map(([path, text]) => [path, toggleFinalNewline(text)])
  );
  for (const files of [given, toggled]) {
    for (const change of applyTrip(options, core, trip, files)) {
      const input = inputOf(files, change);
      if (input === undefined) continue;
      const expected = /(\r\n|\r|\n)$/.test(input) || trip.addsFinalNewline === true;
      expect(
        /(\r\n|\r|\n)$/.test(change.content),
        `"${trip.name}" ${expected ? 'lost' : 'added'} the final newline of ${change.path}`
      ).toBe(expected);
    }
  }
}

function toggleFinalNewline(text: string): string {
  return /(\r\n|\r|\n)$/.test(text) ? text.replace(/(\r\n|\r|\n)+$/, '') : `${text}\n`;
}

function countLines(lines: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

function commentLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/).filter((line) => /^\s*#/.test(line));
}

// ---- The module -------------------------------------------------------------

/** The time the suite's host stamps a new file with. */
const NOW = '2026-01-01T00:00:00.000Z';

/** A fixture's snapshot with a case's host parts laid on. */
function caseSnapshot(
  options: AppCoreOptions,
  fixture: string,
  extra?: Readonly<Record<string, unknown>>
): AppSnapshot {
  return { ...fixtureSnapshot(fixtureFiles(options, fixture), options.manifest), ...extra };
}

/** What `fromChanges` knows over a snapshot, and the snapshot with its host parts laid on. */
function known(
  module: AnyAppModule,
  changes: AppChangesCase['changes'],
  snapshot: AppSnapshot
): { facts: unknown; snapshot: AppSnapshot } {
  const answer = module.fromChanges(changes, snapshot) as AppKnown<unknown, AppSnapshot>;
  expect(answer, 'fromChanges must answer an object').toBeTypeOf('object');
  return { facts: answer.facts, snapshot: { ...snapshot, ...answer.snapshot } };
}

const describeRefusal = (result: Result): string =>
  result.ok ? 'it was accepted' : `${result.code}: ${result.message}`;

/** A module's checks name their cases: an op, an over-long op, a case per page, a change. */
export function assertModuleCases(module: AnyAppModule, checks: AppModuleOptions): void {
  const { pages } = module;
  expect(checks.ops?.length ?? 0, 'name at least one op a fixture applies').toBeGreaterThan(0);
  expect(checks.overLong, 'name an op with a field past its limit').toBeDefined();
  expect(checks.changes?.length ?? 0, 'name at least one fromChanges case').toBeGreaterThan(0);
  for (const page of pages) {
    const covered = (checks.pages ?? []).some(
      (pageCase) => matchAppPage(pages, pageCase.path)?.page === page
    );
    expect(covered, `no page case resolves the page "${page.path}"`).toBe(true);
  }
}

/** `meta` names the app and its icon. */
export function assertMeta(module: AnyAppModule): void {
  const { meta } = module;
  expect(meta.label.trim(), 'meta.label must not be empty').not.toBe('');
  expect(meta.icon.trim(), 'meta.icon must not be empty').not.toBe('');
  if (meta.create) {
    expect(meta.create.noun.trim(), 'meta.create.noun must not be empty').not.toBe('');
  }
}

/** `bounds.op` accepts an op a fixture applies, and the core applies what it answers. */
export function assertBoundsAcceptOp(
  options: AppCoreOptions,
  module: AnyAppModule,
  opCase: AppModuleOpCase
): void {
  const { bounds, core, toCoreOp } = module;
  const bounded = bounds.op(opCase.op);
  expect(bounded.ok, `bounds.op refused "${opCase.name}": ${describeRefusal(bounded)}`).toBe(true);
  if (!bounded.ok) return;
  const applied = core.apply(
    caseSnapshot(options, opCase.fixture, opCase.snapshot),
    toCoreOp(bounded.op, { now: NOW })
  );
  expect(
    applied.ok,
    `the core refused "${opCase.name}" as bounds.op answered it: ${describeRefusal(applied)}`
  ).toBe(true);
}

/** `bounds.op` refuses `op` with `APP_OP_INVALID` and its causes. */
export function assertBoundsRefuseOp(module: AnyAppModule, op: unknown): void {
  const refused = module.bounds.op(op);
  expect(refused.ok, `bounds.op accepted ${JSON.stringify(op).slice(0, 200)}`).toBe(false);
  if (refused.ok) return;
  expect(refused.code).toBe('APP_OP_INVALID');
  expect(refused.details?.length ?? 0, 'a refusal carries its causes in details').toBeGreaterThan(
    0
  );
}

/** `bounds.view` accepts a view the fixtures project, and refuses an unknown one. */
export function assertBoundsView(module: AnyAppModule, view: AppCoreRoundTrip['view']): void {
  const { bounds } = module;
  const bounded = bounds.view(view);
  expect(
    bounded.ok,
    `bounds.view refused ${JSON.stringify(view)}: ${describeRefusal(bounded)}`
  ).toBe(true);
  const unknown = bounds.view({ type: '__no-such-view__' });
  expect(unknown.ok, 'bounds.view accepted an unknown view type').toBe(false);
  if (!unknown.ok) expect(unknown.code).toBe('APP_VIEW_INVALID');
}

/** Each page's own path, its parameters given their names, matches that page and no other first. */
export function assertPagePathMatches(module: AnyAppModule, path: string): void {
  const { pages } = module;
  const sample = path.replace(/:(\w+)/g, '$1');
  const match = matchAppPage(pages, sample);
  expect(match?.page.path, `"${sample}" does not match the page "${path}"`).toBe(path);
}

/** The bases a page's redirect is checked against: a path, and the local host's fragment. */
export function pageBases(options: AppCoreOptions): string[] {
  return ['/apps/x', `#/app/${options.manifest}`];
}

/**
 * A page case resolves as it says over each base: a view that `bounds.view`
 * accepts and the core projects (with a title), the empty state, not found, or
 * a redirect to the base followed by the case's text.
 */
export async function assertPageResolves(
  options: AppCoreOptions,
  module: AnyAppModule,
  pageCase: AppPageCase
): Promise<void> {
  const { bounds, core, pages } = module;
  const answers = pageCase.answers ?? 'view';
  const match = matchAppPage(pages, pageCase.path);
  if (answers === 'not-found' && match === null) return;
  expect(match, `no page matches "${pageCase.path}"`).not.toBeNull();
  if (!match) return;
  const { facts, snapshot } = known(
    module,
    [],
    caseSnapshot(options, pageCase.fixture, pageCase.snapshot)
  );
  const project = async (view: { type: string }): Promise<object | null> =>
    core.project(snapshot, view, facts);

  for (const base of pageBases(options)) {
    const resolution: AppPageResolution = await match.page.resolve({
      params: match.params,
      query: { ...pageCase.query },
      base,
      manifestPath: options.manifest,
      project,
    });
    const at = `"${pageCase.name}" (base ${base})`;
    if (typeof answers === 'object') {
      expect(resolution, `${at} must redirect`).toHaveProperty('redirect');
      expect((resolution as { redirect: string }).redirect, `${at} redirected elsewhere`).toBe(
        base + answers.redirect
      );
      continue;
    }
    if (answers === 'not-found') {
      expect(resolution, `${at} must answer not found`).toEqual({ notFound: true });
      continue;
    }
    expect(resolution, `${at} answered no view`).toHaveProperty('view');
    const { view } = resolution as { view: { type: string } | null };
    const state = view === null ? null : await project(view);
    if (view !== null) {
      const bounded = bounds.view(view);
      expect(bounded.ok, `${at}: bounds.view refused its view: ${describeRefusal(bounded)}`).toBe(
        true
      );
    }
    if (answers === 'view') {
      expect(state, `${at}: the core does not project its view`).not.toBeNull();
    } else {
      expect(
        view === null || (state === null && match.page.emptyWhenMissing),
        `${at} must answer the empty state`
      ).toBe(true);
    }
    const title = match.page.title(state);
    expect(typeof title === 'string' && title.trim() !== '', `${at} has no title`).toBe(true);
  }
}

/**
 * `fromChanges` over no changes, and over the case's, answers facts the core
 * projects the case's view with; what it shows of the changes is the case's.
 */
export function assertFromChanges(
  options: AppCoreOptions,
  module: AnyAppModule,
  changesCase: AppChangesCase
): void {
  const snapshot = caseSnapshot(options, changesCase.fixture);
  for (const changes of [[], changesCase.changes]) {
    const answer = known(module, changes, snapshot);
    const state = module.core.project(answer.snapshot, changesCase.view, answer.facts);
    const over = changes.length === 0 ? 'no changes' : `"${changesCase.name}"`;
    expect(
      state,
      `the view does not project with what fromChanges knows over ${over}`
    ).not.toBeNull();
    if (changes.length > 0 && state) changesCase.shows?.(state as object);
  }
}
