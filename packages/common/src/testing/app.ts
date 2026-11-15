// The app core conformance suite: a `describe` block an app core runs over
// fixture folders to show its rewrites keep what a hand-edited file holds
// (Context Manager ADR-0028, decision 1). It checks only what can be checked
// without knowing the format: the fixtures mount, and each rewrite re-parses and
// keeps comment lines, CRLF line breaks and the final newline (or its absence).
// Everything beyond that is the app's own tests.
//
// A core that implements `AppCore` also gets the round trip: each op is applied
// to a fixture, its changes are written, and the view projects before and after.
// Rewrites that are not yet ops are checked through the `rewrites` hook. Kept
// apart from `./testing` so importing it never loads the element suites.
//
// A module (`AppModule`) gets the module checks: its bounds accept the ops the
// fixtures apply and refuse an unknown or an over-long one, each page matches
// and resolves, a redirect joins a path base and a fragment base alike, its
// meta names it, and `fromChanges` answers facts the core projects with.
//
//   import { describeAppCore } from '@stillpointlab/common-format/testing/app';
//   describeAppCore('inventory', { manifest: 'inventory.yaml', fixtures, mount, rewrites });

import { describe, it } from 'vitest';

import {
  assertBoundsAcceptOp,
  assertBoundsRefuseOp,
  assertBoundsView,
  assertCommentsKept,
  assertCrlfKept,
  assertFinalNewlineKept,
  assertFromChanges,
  assertLifecycle,
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
  missingMembers,
  rewriteInput,
} from './app-checks';

import type { AnyAppModule, AppCore, AppFileChange, AppLifecycle } from '../app';

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

/** One op the round trip applies to one fixture, and the view it projects around it. */
export interface AppCoreRoundTrip {
  name: string;
  /** The fixture the op is applied to: every file visible and readable. */
  fixture: string;
  /** The op, as `apply` takes it: its `type` and its fields. */
  op: { type: string; [field: string]: unknown };
  /** The view, as `project` takes it: its `type` and its parameters. */
  view: { type: string; [param: string]: unknown };
  /**
   * Fields laid over the fixture's snapshot, for a core whose snapshot carries
   * host facts an op needs (a pending move, say).
   */
  snapshot?: Readonly<Record<string, unknown>>;
  /** The same recorded gap as a rewrite's: a written file always ends with a line break. */
  addsFinalNewline?: boolean;
}

/** The round trip's hook: the core, the facts it projects with, and its ops. */
export interface AppCoreRoundTripOptions {
  core: AppCore<any, any, any, any>;
  facts: unknown;
  ops: readonly AppCoreRoundTrip[];
  /** Whether the app reads one written file back without error. */
  reparses: (path: string, text: string) => boolean;
}

/** One element op a fixture applies: the bounds accept it, and the core applies what they answer. */
export interface AppModuleOpCase {
  name: string;
  /** The fixture the op is applied to. */
  fixture: string;
  /** The op as an element raises it: its `type` and its fields. */
  op: { type: string; [field: string]: unknown };
  /** Fields laid over the fixture's snapshot, as a round trip's. */
  snapshot?: Readonly<Record<string, unknown>>;
}

/** One sub-path of the app's pages, over one fixture, and what it answers. */
export interface AppPageCase {
  name: string;
  fixture: string;
  /** The sub-path under the app's base, without its query: `''`, `/room/kitchen`. */
  path: string;
  /** The query, decoded. */
  query?: Readonly<Record<string, string>>;
  /** Fields laid over the fixture's snapshot. */
  snapshot?: Readonly<Record<string, unknown>>;
  /**
   * What the page answers: a view the core projects (the default), the app's
   * empty state, not found (no page matches, or the page refuses), or a
   * redirect to the base followed by `redirect` (a sub-path, then any query).
   */
  answers?: 'view' | 'empty' | 'not-found' | { redirect: string };
}

/** File changes over one fixture, and the view projected with what `fromChanges` makes of them. */
export interface AppChangesCase {
  name: string;
  fixture: string;
  changes: readonly AppFileChange[];
  /** The view, as `project` takes it. */
  view: { type: string; [param: string]: unknown };
  /** What the state projected over the changes must show of them (a dirty file, a card's old path). */
  shows?: (state: object) => void;
}

/** The module checks' hook: the module, and the cases its checks run over. */
export interface AppModuleOptions {
  module: AnyAppModule;
  /** Element ops the fixtures apply. */
  ops?: readonly AppModuleOpCase[];
  /** An op the bounds refuse for a field past its limit. */
  overLong?: AppModuleOpCase['op'];
  /** Page cases: at least one per page. */
  pages?: readonly AppPageCase[];
  /** `fromChanges` cases. */
  changes?: readonly AppChangesCase[];
}

export interface AppCoreOptions {
  /** The manifest's path in every fixture, at the folder root (`inventory.yaml`). */
  manifest: string;
  /** Fixture folders by name. Each must hold the manifest. */
  fixtures: Readonly<Record<string, AppFixture>>;
  /** Mount a folder from its files and manifest path. */
  mount: (files: AppFixture, manifestPath: string) => AppMountResult;
  /** Rewrites to check. The suite derives CRLF and final-newline variants itself. */
  rewrites?: readonly AppCoreRewrite[];
  /** The core, when it implements `AppCore`: its ops are checked through the round trip. */
  core?: AppCoreRoundTripOptions;
  /**
   * The core's lifecycle, when it exports one. The suite then checks that every
   * fixture validates, that its scope holds the manifest, and that the instance
   * is described with a label.
   */
  lifecycle?: AppLifecycle<{ label: string }>;
  /**
   * The app's module, for the module checks. A module without the grown
   * members (`meta`, `bounds`, `pages`, `placeCreate`, `fromChanges`) has the
   * checks listed as to do; one with them must name the cases.
   */
  module?: AppModuleOptions;
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

    const { core } = options;
    for (const trip of core?.ops ?? []) {
      describe(`op: ${trip.name} (${trip.fixture})`, () => {
        it('projects the view before and after', () =>
          assertRoundTripProjects(options, core!, trip));
        it('output re-parses', () => assertRoundTripReparses(options, core!, trip));
        it('keeps every comment line', () => assertRoundTripCommentsKept(options, core!, trip));
        it('keeps CRLF line breaks', () => assertRoundTripCrlfKept(options, core!, trip));
        it('keeps the final newline, or its absence', () =>
          assertRoundTripFinalNewlineKept(options, core!, trip));
      });
    }

    const checks = options.module;
    if (checks) describeModule(options, checks);

    for (const rewrite of options.rewrites ?? []) {
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

/** The module checks, or a to-do naming what the module lacks. */
function describeModule(options: AppCoreOptions, checks: AppModuleOptions): void {
  const { module } = checks;
  describe('module', () => {
    const missing = missingMembers(module);
    if (missing.length > 0) {
      it.todo(`has no ${missing.join(', ')} yet (app-module-grows, step 2)`);
      return;
    }
    it('names the cases its checks run over', () => assertModuleCases(module, checks));
    it('meta names the app and its icon', () => assertMeta(module));

    for (const opCase of checks.ops ?? []) {
      it(`bounds.op accepts "${opCase.name}" (${opCase.fixture}), and the core applies it`, () =>
        assertBoundsAcceptOp(options, module, opCase));
    }
    it('bounds.op refuses an unknown type', () =>
      assertBoundsRefuseOp(module, { type: '__no-such-op__' }));
    const { overLong } = checks;
    if (overLong) {
      it(`bounds.op refuses an over-long field (${overLong.type})`, () =>
        assertBoundsRefuseOp(module, overLong));
    }

    const views = new Map<string, { type: string }>();
    for (const trip of options.core?.ops ?? []) views.set(JSON.stringify(trip.view), trip.view);
    for (const changesCase of checks.changes ?? []) {
      views.set(JSON.stringify(changesCase.view), changesCase.view);
    }
    for (const [key, view] of views) {
      it(`bounds.view accepts ${key}, and refuses an unknown view`, () =>
        assertBoundsView(module, view));
    }

    for (const page of module.pages ?? []) {
      it(`the page "${page.path}" matches its own path`, () =>
        assertPagePathMatches(module, page.path));
    }
    for (const pageCase of checks.pages ?? []) {
      it(`the page at "${pageCase.path}" resolves: ${pageCase.name} (${pageCase.fixture})`, () =>
        assertPageResolves(options, module, pageCase));
    }

    for (const changesCase of checks.changes ?? []) {
      it(`fromChanges: ${changesCase.name} (${changesCase.fixture})`, () =>
        assertFromChanges(options, module, changesCase));
    }
  });
}
