import { expect } from 'vitest';

import { withLineBreak } from '../line-endings';

import type {
  AppCoreOptions,
  AppCoreRewrite,
  AppCoreRoundTrip,
  AppCoreRoundTripOptions,
  AppFixture,
} from './app';
import type { AppLifecycle, AppSnapshot, FileChange, FolderNode } from '../app';

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
