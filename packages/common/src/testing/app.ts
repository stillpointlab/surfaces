// The app core conformance suite: a `describe` block an app core runs over
// fixture folders to show its rewrites keep what a hand-edited file holds
// (Context Manager ADR-0028, decision 1). It checks only what can be checked
// without knowing the format: the fixtures mount, and each rewrite re-parses and
// keeps comment lines, CRLF line breaks and the final newline (or its absence).
// Everything beyond that is the app's own tests.
//
// It names no contract type. Its hooks wrap whatever functions the core has, so
// the step that names the app contract can re-express them without changing what
// the suite checks. Kept apart from `./testing` so importing it never loads the
// element suites.
//
//   import { describeAppCore } from '@stillpointlab/common-format/testing/app';
//   describeAppCore('inventory', { manifest: 'inventory.yaml', fixtures, mount, rewrites });

import { describe, it } from 'vitest';

import {
  assertCommentsKept,
  assertCrlfKept,
  assertFinalNewlineKept,
  assertLifecycle,
  assertMounts,
  assertReparses,
  rewriteInput,
} from './app-checks';

import type { AppLifecycle } from '../app';

/** A fixture folder: path (relative to the folder) → text. */
export type AppFixture = Readonly<Record<string, string>>;

/** What mounting a folder gives: the paths the app claims, or why it refused. */
export type AppMountResult =
  | { ok: true; scope: Iterable<string>; warnings?: readonly unknown[] }
  | { ok: false; errors: readonly unknown[] };

/** One rewrite to check, applied to one file of one fixture. */
export interface AppCoreRewrite {
  name: string;
  /** The fixture the input file comes from. */
  fixture: string;
  /** The input file's path in the fixture. */
  path: string;
  /** The rewrite: input text → output text. Throw if the core reports a failure. */
  apply: (text: string) => string;
  /** Whether the app reads `text` (an output of `apply`) back without error. */
  reparses: (text: string) => boolean;
  /**
   * A recorded gap: the rewrite ends its output with a line break even when the
   * input had none (it appends at the end of the file). The final-newline check
   * then asserts exactly that. Record the gap in the follow-ups when setting it.
   */
  addsFinalNewline?: boolean;
}

export interface AppCoreOptions {
  /** The manifest's path in every fixture, at the folder root (`inventory.yaml`). */
  manifest: string;
  /** Fixture folders by name. Each must hold the manifest. */
  fixtures: Readonly<Record<string, AppFixture>>;
  /** Mount a folder from its files and manifest path. */
  mount: (files: AppFixture, manifestPath: string) => AppMountResult;
  /** Rewrites to check. The suite derives CRLF and final-newline variants itself. */
  rewrites: readonly AppCoreRewrite[];
  /**
   * The core's lifecycle, when it exports one. The suite then checks that every
   * fixture validates, that its scope holds the manifest, and that the instance
   * is described with a label.
   */
  lifecycle?: AppLifecycle<{ label: string }>;
}

/** Run the app core suite for `app` over the given fixtures and rewrites. */
export function describeAppCore(app: string, options: AppCoreOptions): void {
  describe(`${app} app core`, () => {
    describe('mount', () => {
      for (const name of Object.keys(options.fixtures)) {
        it(`mounts the "${name}" fixture`, () => assertMounts(options, name));
      }
    });

    const { lifecycle } = options;
    if (lifecycle) {
      describe('lifecycle', () => {
        for (const name of Object.keys(options.fixtures)) {
          it(`scopes the "${name}" fixture and describes it`, () =>
            assertLifecycle(options, lifecycle, name));
        }
      });
    }

    for (const rewrite of options.rewrites) {
      describe(`rewrite: ${rewrite.name} (${rewrite.fixture}/${rewrite.path})`, () => {
        it('output re-parses', () => assertReparses(rewrite, rewriteInput(options, rewrite)));
        it('keeps every comment line', () =>
          assertCommentsKept(rewrite, rewriteInput(options, rewrite)));
        it('keeps CRLF line breaks', () => assertCrlfKept(rewrite, rewriteInput(options, rewrite)));
        it('keeps the final newline, or its absence', () =>
          assertFinalNewlineKept(rewrite, rewriteInput(options, rewrite)));
      });
    }
  });
}
