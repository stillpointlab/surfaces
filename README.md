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
SCSS tokens (see "Theming"), and the contract conformance suites
(`@stillpointlab/common-format/testing`).

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

### Lazy engines

An element that loads a heavy engine on demand (ProseMirror in `md-editor`, CodeMirror in the code
elements) composes three functions from `common` instead of hand-writing the lifecycle:

- `createLazyLoader(load)` wraps the element's dynamic imports, defined once at module level, so
  every instance shares one import; a failed import is retried by the next connection.
- `hydrate(gate, { load, build, fail })`, called from `connectedCallback` after rendering the
  loading state, begins a ready cycle, loads, and calls `build` only while that connection is the
  live one. It settles when `build` (which may be async) finishes, and calls `fail` and settles if
  the load or the build throws. A connection superseded by a move or reconnect does nothing.
- `createStatus(kind, message)` renders the `loading`, `empty` or `error` placeholder, styled by
  `@use 'common/src/styles/status';`, with the standard texts in `STATUS_MESSAGES`.

The element keeps everything else: its fields, `render()`, the code that builds its view, and its
teardown in `disconnectedCallback`. There is deliberately no base class.

### Theming

Every colour an element draws comes from a `--spl-*` custom property, defined once in
`packages/common/src/styles/_tokens.scss` with a light default. A host themes every surface by
setting the properties on `:root` or any ancestor, and provides dark values the same way (the
harness does it in `tooling/harness/harness.css`, Context Manager in its base stylesheet). Elements
ship light defaults only and carry no `prefers-color-scheme` rules of their own.

| Property                     | Light default              | Colours                                  |
| ---------------------------- | -------------------------- | ---------------------------------------- |
| `--spl-background-primary`   | `#ffffff`                  | element surfaces, editing areas          |
| `--spl-background-secondary` | `#f5f5f5`                  | toolbars, gutters, secondary panels      |
| `--spl-background-muted`     | `#f8f8f8`                  | quiet panels (frontmatter, chips)        |
| `--spl-background-hover`     | `#e8e8e8`                  | hovered controls and menu items          |
| `--spl-surface-overlay`      | `#ffffff`                  | popovers and menus                       |
| `--spl-header-bg`            | `#f6f8fa`                  | table headers, sheet toolbar and notices |
| `--spl-code-bg`              | `#f0f0f0`                  | inline code and code blocks              |
| `--spl-text-primary`         | `#000`                     | body text                                |
| `--spl-text-secondary`       | `#333`                     | secondary text, labels                   |
| `--spl-text-color`           | `#444`                     | toolbar icons and controls               |
| `--spl-text-muted`           | `#666`                     | hints, metadata, line numbers            |
| `--spl-border-color`         | `#eee`                     | element frames and dividers              |
| `--spl-border-light`         | `#ddd`                     | light rules, table borders               |
| `--spl-border-dark`          | `#ccc`                     | inputs, menu outlines                    |
| `--spl-border-strong`        | `#b0b0b0`                  | table cell borders                       |
| `--spl-primary-blue`         | `#0066cc`                  | accent: links, active states, selection  |
| `--spl-primary-blue-hover`   | `#0052a3`                  | accent on hover                          |
| `--spl-focus-ring`           | `#0969da`                  | focus outlines                           |
| `--spl-button-bg`            | `#2f6b5b`                  | filled buttons and active toggles        |
| `--spl-button-text`          | `#ffffff`                  | text on filled buttons and accents       |
| `--spl-error-color`          | `#dc3545`                  | error text and danger actions            |
| `--spl-error-bg`             | `#fff1f1`                  | error panels                             |
| `--spl-error-bg-subtle`      | `rgba(220, 53, 69, 0.08)`  | error line highlights                    |
| `--spl-error-border`         | `#f2a7a7`                  | error panel borders                      |
| `--spl-warning-color`        | `#5f4400`                  | warning text, incomplete status          |
| `--spl-warning-bg`           | `#fff8e6`                  | warning panels and badges                |
| `--spl-warning-border`       | `#f0c36a`                  | warning panel borders                    |
| `--spl-success-color`        | `#166534`                  | success text, complete status            |
| `--spl-success-bg`           | `#dcfce7`                  | success badges, conditional markers      |
| `--spl-info-color`           | `#1d4ed8`                  | informational text, template slots       |
| `--spl-info-bg`              | `#dbeafe`                  | informational badges, template slots     |
| `--spl-code-active-line-bg`  | `rgba(88, 166, 255, 0.12)` | CodeMirror's active line                 |
| `--spl-code-selection-bg`    | `rgba(88, 166, 255, 0.38)` | CodeMirror's selection                   |
| `--spl-shadow-color`         | `rgba(0, 0, 0, 0.18)`      | popover and menu shadows                 |

A format stylesheet starts with `@use 'common/src/styles/tokens' as *;` and uses the variables
(`$text-primary`, `$error-bg`, …) for every colour. A format may add properties of its own
(`--spl-sheet-*`, `--spl-xmdl-*`) as long as each falls back to a token, never to a literal.
`npm run lint` runs `tooling/check-tokens.mjs`, which fails on a hardcoded colour in any format
stylesheet.

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
