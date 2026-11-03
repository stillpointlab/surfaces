---
column: done
pr: 37
completed: 2026-11-03
created: 2026-11-03T12:29:49-07:00
tags: [apps, common, dev-tooling, host-contract]
---

# Spec: groundwork for app cores in `common` and the tooling

_From the [apps breakout brief](../../phase1/briefs/apps_breakout.md), desired outcome 2 (the suite)
and the answer to open question 3 (shared helpers in a DOM-free subpath of `common`). Independent of
[cm-app-prep](cm-app-prep.md). [inventory-core](inventory-core.md) builds on it._

## High-level goal

An app core can be built, tested and held to ADR-0028 here before the first one arrives. That means
four things: a DOM-free YAML helper both apps share, a conformance suite for app cores, a test preset
that runs in Node, and the package convention written down.

## Related context

- Context Manager ADR-0028 (manifest mounts): an app is the sole executor over its scope.
  - Hand edits are first-class, so manifest and data writes are byte-preserving rewrites (decision
    1).
  - Decision 4 (a warning for every file in scope the app cannot map) is not checked: Jamie expects
    to relax it, since agents routinely leave READMEs and helper files beside cards and the warnings
    are noise (2026-11-03, on PR 36).
- Precedent: the element conformance suites in `packages/common/src/testing/`, with opt-outs for
  recorded gaps (stage 1's `readonly: false`).
- Main files: `packages/common/` (new `./yaml` and `./testing/app` entries), `tooling/vitest.ts`,
  `packages/apps/README.md`.

## Technical requirement

1. **`@stillpointlab/common-format/yaml`.** A new DOM-free entry exporting
   `formatYamlScalar(value: string | number | boolean): string`.
   - Behaviour is identical to Context Manager's `inventory/roomWriter.ts` version: plain whenever
     YAML reads the text back as the same value, otherwise JSON-quoted, and any value with a newline
     is quoted.
   - Its tests are Context Manager's `describe('formatYamlScalar')` cases, copied.
   - `yaml` becomes a dependency of `common`, at the version the formats already use (`^2.9.0`).
   - The entry must not import anything that touches the DOM. A test imports it under
     `environment: 'node'`.
2. **`describeAppCore`, in a new `./testing/app` entry.** It is kept apart from `./testing` so that
   importing it never loads the element suites. It is a `describe` block an app core runs over
   fixture folders, and it names no contract type. Its hooks wrap whatever functions the core has
   today:

   ```ts
   describeAppCore('inventory', {
     /** Fixture folders: path → text, with the manifest at the folder root. */
     fixtures: { minimal: { 'inventory.yaml': '…', 'rooms/kitchen.yaml': '…' } },
     /** Mount a folder: the paths the app claims and its warnings, or errors. */
     mount: (files, manifestPath) => ({ ok: true, scope, warnings }),
     /** Rewrites to check, each over one fixture file. */
     rewrites: [{ name: 'edit an item', fixture: 'minimal', path: 'rooms/kitchen.yaml',
                  apply: (text) => …, reparses: (text) => boolean }],
   });
   ```

   It checks:
   - every fixture mounts;
   - for each rewrite:
     - the output re-parses;
     - every `#` comment line in the input survives verbatim;
     - a CRLF copy of the input gives output whose line breaks are all CRLF;
     - the presence or absence of a final newline is kept.

   The suite derives the CRLF and no-final-newline variants from each fixture itself.

3. **`appTest()` in `tooling/vitest.ts`.** The same `include` as `formatTest`, with
   `environment: 'node'`. An app's element tests (later phases) opt into jsdom per file with
   `// @vitest-environment jsdom`.
4. **The package convention in `packages/apps/README.md`.**
   - Name: `@stillpointlab/<name>-app`.
   - The root entry `.` is the core: DOM-free, runs in Node and the browser, and imports only
     `yaml`, `zod`, `common` and formats' DOM-free entries.
   - `./element` is reserved for the element (later phases).
   - Shared types are exported from the root.
   - The README carries the app's file-format reference.
   - Built with `formatPackage` from `tooling/tsup.ts`, tested with `appTest`.
   - Components get a line in the placement test now, so phase 4 does not reopen this README:
     "a UI element with no good and no mount of its own, rendered by formats, apps or the host →
     a component (`packages/components/<name>`)".

## Clarifications

- **Why the suite names no contract.** The brief puts the contract at the element step. These hooks
  wrap today's functions, and the step that names `AppModule` can re-express them without changing
  what the suite checks.
- **Why comments, line breaks and the final newline.** They are what a byte-preserving rewrite
  visibly keeps, and they can be checked without knowing the format. Each app's own tests check
  everything beyond that.

## Non-goals

- A scaffold or template for apps (the one-scaffold seed).
- Adding apps to the harness, which comes with the elements.
- Any change in Context Manager.

## Acceptance / completion checklist

- [x] `./yaml` exported, built and tested under Node; the copied cases pass.
- [x] `./testing/app` exported. The suite runs against a sample core in `common`'s own tests: a
      tiny line-based `key: value` app. It passes there, and each check fails when the sample breaks
      it (a fixture that fails to mount, a dropped comment, LF output on CRLF input, a lost final
      newline).
- [x] `appTest()` in `tooling/vitest.ts`; the root `vitest.config.ts` already includes
      `packages/apps/*`.
- [x] `packages/apps/README.md` carries the convention and the components line.
- [x] `npm run check` green.

## Implementation plan

One surfaces PR. It can merge before or after [cm-app-prep](cm-app-prep.md), and Context Manager
needs nothing from it until the inventory core adoption.

## Implementation notes

- `describeAppCore` takes one more option than the sketch: `manifest`, the manifest's path in every
  fixture, which is what `mount` receives as `manifestPath`.
- Each check is a function in `src/testing/app-checks.ts` that the suite's `it` calls. `common`'s
  own tests call the same functions on broken rewrites of the sample core and expect them to throw,
  so every check is shown failing without running a failing suite. That module is not exported.
- The CRLF check also requires the CRLF output to re-parse. The final-newline check runs on the
  fixture file as given and on its variant with the final newline toggled.
