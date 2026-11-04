import { expect } from 'vitest';

import { withLineBreak } from '../line-endings';

import type { AppCoreOptions, AppCoreRewrite, AppFixture } from './app';

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
