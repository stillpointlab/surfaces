# Stillpoint Lab surfaces

The human surfaces over [Context Manager](https://stillpointlab.com): **formats**, each a preview
and optionally an editor over one good, and **apps**, each a manifest-mounted scope of goods. Both
are stateless clients of the same host contract (`get` / `list` / `put`, where `put` is a proposal),
so they share one toolchain, one `common` package and, in time, one scaffold.

| Package                  | npm name                       | Ships                                                       |
| ------------------------ | ------------------------------ | ----------------------------------------------------------- |
| `packages/common`        | `@stillpointlab/common-format` | logging, contracts, ready gate, tokens, conformance suites  |
| `packages/formats/md`    | `@stillpointlab/md-format`     | core + `<md-preview>` + `<md-editor>`                       |
| `packages/formats/code`  | `@stillpointlab/code-format`   | core + `<code-preview>` + `<code-editor>`, `<code-diff>`    |
| `packages/formats/sheet` | `@stillpointlab/sheet-format`  | core + `<sheet-preview>` + `<sheet-editor>`, `<sheet-grid>` |
| `packages/formats/xmdl`  | `@stillpointlab/xmdl-format`   | core + `<xmdl-preview>` + `<xmdl-editor>`                   |
| `packages/formats/image` | `@stillpointlab/image-format`  | `<image-preview>` only                                      |
| `packages/apps/`         |                                | tasks and inventory arrive with the apps breakout           |

Every format opens in the one harness (`npm run dev`, <http://localhost:5180>); see
[the harness](#the-harness) below.

A **format** always ships a core (parser, document model, theme) and a preview (the read-only
element, friendly to a no-JS fallback), and optionally an editor (the interactive element). Image,
video, audio, PDF, 3D objects and materials all start as preview-only formats and gain editors when
there is something to edit. See [the format convention](#the-format-convention) below. An **app** owns a folder: see [`packages/apps/README.md`](packages/apps/README.md)
for the placement test between the two.

Each package's README documents its own API. The formats were imported from the former
`md-editor`, `code-editor`, `sheet-editor`, `xmdl-editor` and `image-editor` repositories with their
history rewritten under `packages/formats/<name>/`.

## Layout

```
package.json         one npm workspace, one lockfile, every dev dependency hoisted here
tsconfig.base.json   compiler options every package extends
eslint.config.mjs    one lint config; packages add none of their own
.prettierrc          one format config
vitest.config.ts     runs every package as a vitest project
tooling/
  gen-styles.mjs     SCSS -> `*.styles.ts` string modules for shadow roots (all packages, or one)
  tsup.ts            the shared build: ESM + CJS + d.ts per entry
  vitest.ts          the shared test preset
  new-format.mjs     scaffolds packages/formats/<name> from tooling/template/format
  template/format/   a complete, buildable sample format: what every new one starts from
  harness/           the one playground: mounts any format from its dev/fixtures.ts
docs/
  tasks/             this repository's own task boards (tasks.yaml + templates)
packages/
  common/            what every surface shares: logging, element contracts, SCSS tokens
  formats/<name>/    one good; core + preview + optional editor
  apps/<name>/       a scope; manifest mount
    package.json     name, entries, runtime dependencies, and five one-line scripts
    tsconfig.json    extends the base; overrides only what the package needs
    tsup.config.ts   entries and externals through `formatPackage()`
    vitest.config.ts `formatTest()` with any override
    src/, README.md
    dev/fixtures.ts  this format in the harness: elements by role, fixtures, controls
```

## Working on it

```sh
npm install        # once, at the root
npm run check      # lint, format, typecheck, test, build: what CI runs
npm run build      # every package
npm test           # every package
npm run dev        # the harness, every format, at http://localhost:5180

cd packages/formats/sheet   # or any package
npm run dev                 # the harness opened on this package
npm test                    # that package only

npm run new-format -- video # a new format from the template; then npm install and add its row above
```

## The harness

`tooling/harness/` is the one playground. It finds every `packages/formats/*/dev/fixtures.ts`,
mounts the chosen format's elements by role (editor beside preview, extras below), applies a
fixture, mirrors edits into the preview, reads the source back, and shows each element's `ready`
state and events. Read-only, narrow panes and light/dark (with the shared `--spl-*` tokens) are
common controls; `?format=sheet&fixture=Ragged%20rows` deep-links a state.

A format's `dev/fixtures.ts` imports its own entries (so the elements register) and default-exports
a `HarnessFormat` (`tooling/harness/types.ts`): `elements` (`editor`, `preview`, `extra` tags),
`fixtures` (name → content, or `{ content, apply }` when the fixture must drive a setter beyond the
contract), an optional module-level `apply`, `controls` (toggles and selects beside the common
ones) and `mirror: false` when a plain `setContent` mirror would lose something. The harness drives
elements only through the contracts in `common`; whatever a format wants beyond them, it does in
`apply` or a control. The template ships a minimal one, so a new format appears in the harness
with no edits beyond its name.

## The format convention

Every format exposes the same three entry points, so the host and the scaffold can rely on the
shape instead of reading each package:

| Entry       | Ships                                                                     |
| ----------- | ------------------------------------------------------------------------- |
| `.`         | the core: parser, document model, theme, anything isomorphic              |
| `./preview` | the read-only element, implementing `PreviewElement`                      |
| `./editor`  | the interactive element, implementing `EditorElement`; only if it has one |

Formats may add subpaths of their own (`md` has `./markdown`, `code` has `./diff`, `sheet` has
several). For the formats that predate the convention, `.` still registers the editor and exports
everything; `./editor` is the explicit alias.

`packages/common` (`@stillpointlab/common-format`) holds what every surface shares and nothing
else: the injectable logging (`setErrorHandler`, `setReporter`; one instance for all formats, which
each format also re-exports), the element contracts the host drives (`PreviewElement`,
`EditorElement`, `ImagePreviewElement`, `DiffElement`), the ready gate behind them, the `--spl-*`
SCSS tokens, and the contract conformance suites (`@stillpointlab/common-format/testing`). A format
styles with `@use 'common/src/styles/tokens' as *;`.

### Ready

Every element answers `whenReady(): Promise<void>` with _settled_ semantics: it resolves once the
element is hydrated (its lazy engine, if any, loaded and its view built) and the most recent
content it was given has reached its DOM. A later `setContent` starts a new cycle, so
`await el.whenReady()` right after a set resolves once that set is visible. The state is reflected
as a boolean `ready` attribute (so `md-editor[ready]` selects settled elements) and announced by a
non-bubbling `ready` event each time the element settles; disconnecting makes the element pending
again. Elements implement it with `createReadyGate(this)` from `common`. A host must never wait for
readiness before its first `setContent`: content set early is buffered and shows as soon as the
element can. Readiness is for what needs the engine, such as `focus()`, keymap modes, reading back
normalised content, and tests.

Cycles carry tokens: `begin()` returns one, `settle(token)` is ignored once a newer cycle has
begun, and `isCurrent(token)` tells an asynchronous continuation whether its cycle is still the
live one. An element that loads an engine checks `isCurrent` after every `await` and stops if a
newer connection has taken over (a DOM move is a disconnect and a reconnect in one tick), and it
settles the live cycle on every path: success, a failed load, and nothing left to do.

### Registration and attributes

Elements register with `defineElement(tag, constructor)` from `common`, which leaves a tag that is
already registered alone (and warns if a different copy of the package registered it), so loading
an element module twice never throws.

Attributes follow one of two rules. Contract attributes compare to an explicit value:
`readonly="true"` makes an editor read-only, and a bare `readonly` does not. Display options are on
when present and not `"false"`, so `<code-diff wrap>` and `wrap="true"` wrap and `wrap="false"`
does not; an option that defaults on is off only with `"false"`. `booleanAttribute(el, name,
{ defaultOn })` from `common` reads the second kind.

### Conformance

`@stillpointlab/common-format/testing` exports `describePreviewContract`, `describeEditorContract`,
`describeImagePreviewContract` and `describeDiffContract`: vitest `describe` blocks a format runs
in `src/contract.test.ts` for each element it ships. They prove readiness, set and read back,
`content-change` on user edits and never on `setContent`, `readonly`, keymap modes and focus,
settling after a DOM move and after a reconnect,
and take hooks for what only the format knows (how to tell content reached the DOM, how to
perform one edit). They use no fake timers, private fields or jsdom-specific stubs, so they run
unchanged under vitest browser mode: a package that needs a real browser (media editors, clipboard)
sets `formatTest({ browser: true })` in its `vitest.config.ts` and the root adds `@vitest/browser`,
`@vitest/browser-playwright` and Playwright's Chromium at that point. Until then everything runs on
jsdom.

Styles: write SCSS next to the component. `gen:styles` compiles every non-partial
`src/**/<name>.scss` into a sibling `<name>.styles.ts` exporting `<name>Styles`; the generated files
are ignored by git, lint and prettier, and every build, test and typecheck script regenerates them
first.

Build order: the formats resolve `@stillpointlab/common-format` through its built `dist/`, so the
root `typecheck` and `test` scripts build `common` first (`npm run build:common`). Inside one
package, run that once from the root before `npm test` or `npm run typecheck` there.

Dependencies: there is one `package-lock.json`. Refresh with `npm outdated` → update → `npm run
check`. The `glob` and `minimatch` overrides and the `eslint-plugin-import-x/rules/order` import
mirror Context Manager's dependency policy and go away together when upstream ranges catch up.

## Process

Work on this repository is tracked on its own boards under [`docs/tasks/`](docs/tasks/README.md),
in the same stage / phase / task shape Context Manager uses. The migration out of the five editor
repositories and into Context Manager is tracked in Context Manager's own tasks until it completes.

## Consumers

Context Manager mounts this repository as a git submodule and lists its packages in its npm
workspace, so the application's lockfile governs these packages when they are installed there.
