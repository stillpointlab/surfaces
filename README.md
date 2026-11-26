# Stillpoint Lab surfaces

The human surfaces over [Context Manager](https://stillpointlab.com): **formats**, each a preview
and optionally an editor over one good, **apps**, each a manifest-mounted scope of goods, and the
few **components** they share. Formats and apps
are stateless clients of the same host contract (`get` / `list` / `put`, where `put` is a proposal),
so they share one toolchain, one `common` package and, in time, one scaffold.

| Package                       | npm name                           | Ships                                                                  |
| ----------------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| `packages/common`             | `@stillpointlab/common-format`     | logging, contracts, ready gate, tokens, conformance suites             |
| `packages/formats/md`         | `@stillpointlab/md-format`         | core + `<md-preview>` + `<md-editor>`                                  |
| `packages/formats/code`       | `@stillpointlab/code-format`       | core + `<code-preview>` + `<code-editor>`, `<code-diff>`               |
| `packages/formats/sheet`      | `@stillpointlab/sheet-format`      | core + `<sheet-preview>` + `<sheet-editor>`, `<sheet-grid>`            |
| `packages/formats/xmdl`       | `@stillpointlab/xmdl-format`       | core + `<xmdl-preview>` + `<xmdl-editor>`                              |
| `packages/formats/image`      | `@stillpointlab/image-format`      | `<image-preview>` only                                                 |
| `packages/apps/`              |                                    | tasks and inventory arrive with the apps breakout                      |
| `packages/components/`        | `@stillpointlab/<name>-component`  | shared UI elements: `<modal-dialog>`, `<spl-icon>`, `<checkin-review>` |
| `tooling/template/format`     | `@stillpointlab/sample-format`     | the text template: core + `<sample-preview>` + `<sample-editor>`       |
| `tooling/template/url-format` | `@stillpointlab/sample-url-format` | the URL template: `<sample-url-preview>` only                          |

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
vitest.browser.config.ts  runs the packages' browser tests (see Testing)
tooling/
  gen-styles.mjs     SCSS -> `*.styles.ts` string modules for shadow roots (all packages, or one)
  tsup.ts            the shared build: ESM + CJS + d.ts per entry
  vitest.ts          the shared test preset
  new-format.mjs     scaffolds packages/formats/<name> from a template (`--url` for the URL one)
  browser-projects.mjs  which packages' browser tests a CI run starts
  template/format/   a complete text format with an editor: what a new one starts from
  template/url-format/ a complete preview given a URL, no editor: what `--url` starts from
  harness/           the one playground: mounts any format from its dev/fixtures.ts
docs/
  tasks/             this repository's own task boards (tasks.yaml + templates)
packages/
  common/            what every surface shares: logging, element contracts, SCSS tokens
  formats/<name>/    one good; core + preview + optional editor
  apps/<name>/       a scope; manifest mount
  components/<name>/ one shared UI element, with no good and no mount
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
npm run test:browser  # the browser tests, in headless Chromium; not part of check
npm run dev        # the harness, every format, at http://localhost:5180

cd packages/formats/sheet   # or any package
npm run dev                 # the harness opened on this package
npm test                    # that package only

npm run new-format -- notes        # a text format with an editor, from tooling/template/format
npm run new-format -- video --url  # a preview given a URL, from tooling/template/url-format
                                   # then npm install, and add its row above
```

## Testing

A package has two kinds of test file:

- **`src/**/*.test.ts`** run in jsdom (in Node for `common`, the apps and the local host), in
  `npm test` and so in `npm run check`. Nearly everything is tested here: a format's descriptor,
  its entries, its states and its words, and the conformance suites.
- **`src/**/*.browser.test.ts`** run in headless Chromium through vitest's browser mode, and only
  in `npm run test:browser`. They hold what jsdom cannot do and nothing else: a clip that plays or
  seeks, a page that draws, a file the browser really loads or really fails. A package that has
  them keeps a `vitest.browser.config.ts` (`browserTest()` from `tooling/vitest.ts`) beside its
  `vitest.config.ts`, and the root's `vitest.browser.config.ts` collects them. The URL template
  has one, so a format made with `new-format --url` starts with it.

What does not go in a browser test: anything jsdom can show, a screenshot as an assertion, and a
wait for a time (a test waits for an event, or the element's ready signal). One package's browser
tests take under 30 seconds on a laptop; a pull request that adds some says how long the CI job
took, and if one package's job passes two minutes, the answer is fewer tests.

Media for a test lives in the package's `dev/media/`, each file under 50 kB and made by a command,
with the `ffmpeg` line that made it in the package's README. A test reaches it by URL
(`new URL('../../dev/media/clip.webm', import.meta.url)`), and media plays there without a gesture
(Chromium's autoplay switch, in `browserTest()`).

The browser is Playwright's Chromium, at the version the root's `playwright` names. Install it once:

```sh
npx playwright install chromium               # into ~/.cache/ms-playwright
npx playwright install --with-deps chromium   # on Linux, with its system packages (sudo)
```

`npm test` and `npm run check` need no browser installed. Without one, `npm run test:browser`
stops at once and names the command above.

```sh
npm run test:browser                                                  # every package's
npm run test:browser -- --project @stillpointlab/sample-url-format    # one package's
cd tooling/template/url-format && npm run test:browser                # the same, from the package
```

When they run:

| When                     | What runs                                                                                                                                                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A pull request           | The browser tests of each package it changes, in CI's `browser` job beside `check` (`tooling/browser-projects.mjs` chooses them). A pull request that changes no such package starts no browser; one that changes only `common` or the tooling runs none. |
| A push to `main`         | None: the pull request ran them.                                                                                                                                                                                                                          |
| By hand                  | All of them: Actions → CI → Run workflow, or `gh workflow run CI --ref main`.                                                                                                                                                                             |
| A stage's close          | All of them, by hand, beside the release walk ([milestones](docs/devlogs/README.md#milestones)).                                                                                                                                                          |
| An agent building a spec | Its own package's, locally, before it reports.                                                                                                                                                                                                            |

## The harness

`tooling/harness/` is the one playground. It finds every `dev/fixtures.ts` under
`packages/formats/*`, `packages/components/*`, `packages/apps/*`, `packages/hosts/*` and
`tooling/template/*` (each template under its package's name, `sample` or `sample-url`), mounts
the chosen one's elements by role (editor beside preview, extras below), applies a fixture,
mirrors edits into the preview, reads the source back, and shows each element's `ready` state and
events. Read-only, narrow panes and light/dark (with the shared `--spl-*` tokens) are common
controls; Dark starts as the system's colour scheme has it. `?format=sheet&fixture=Ragged%20rows`
deep-links a state.

A package's `dev/fixtures.ts` default-exports a `HarnessFormat` (`tooling/harness/types.ts`):

- `format`: the format's descriptor, from its `./format` entry. The harness takes the editor and
  preview tags from it, loads them through it, and applies a fixture with its `apply`, as a host
  does. The five formats and the two templates mount this way.
- `elements` (`editor`, `preview`, `extra` tags): what to mount without a descriptor, for which the
  module imports its own entries so the elements register. Components and apps name theirs
  here. With `format`, only `extra` is read (`<code-diff>`).
- `fixtures`: name → content, or `{ content, path, apply }`. `path` is the file the content stands
  for, which a descriptor reads attributes from (the code language, a `.sheet` document); `apply`
  drives a setter beyond the contract.
- an optional module-level `apply`, `controls` (toggles and selects beside the common ones), and
  `mirror: false` when a plain `setContent` mirror would lose something.

The harness drives elements only through the contracts in `common` and a format's descriptor;
whatever a package wants beyond them, it does in `apply` or a control. Each template ships a
minimal one, so a new format appears in the harness with no edits beyond its name.

## The format convention

Every format exposes the same entry points, so the host and the scaffold can rely on the shape
instead of reading each package:

| Entry       | Ships                                                                                  |
| ----------- | -------------------------------------------------------------------------------------- |
| `.`         | the core: parser, document model, theme, anything isomorphic                           |
| `./preview` | the read-only element, implementing `PreviewElement` (`UrlPreviewElement` given a URL) |
| `./editor`  | the interactive element, implementing `EditorElement`; only if it has one              |
| `./format`  | the descriptor: which paths the format opens, and how a host loads and fills it        |

`./format` is light: importing it defines no element and loads no editor. Its `load()` functions
import `./preview` and `./editor`, which the build keeps as files of their own. A host gives the
descriptors to `createFormatRegistry` (`@stillpointlab/common-format/format`; see
[`packages/common/README.md`](packages/common/README.md)). The five formats and both templates
ship one, so a host registers a new format with one import of its `./format` and one entry in its
list.

A format given a URL (image, and video, audio or PDF to come) has a preview and no editor, and its
descriptor `needs: 'url'`. Its element answers to `UrlPreviewElement`, the role's contract in
`common` (`setSource(src, name)` and the ready signal), and keeps its own tag and its own exported
type extending that contract (`VideoPreviewElement`), to which it adds what is its alone once a host
asks for it. `ImagePreviewElement` is the same contract under image's name. The URL template
(`npm run new-format -- <name> --url`) starts one: `<name>PreviewElement`, the empty, loading,
loaded and failed states, and `describeUrlPreviewContract` with hooks for its media.

Formats may add subpaths of their own (`md` has `./markdown`, `code` has `./diff`, `sheet` has
several). For the formats that predate the convention, `.` still registers the editor and exports
everything; `./editor` is the explicit alias.

`packages/common` (`@stillpointlab/common-format`) holds what every surface shares and nothing
else: the injectable logging (`setErrorHandler`, `setReporter`; one instance for all formats, which
each format also re-exports), the element contracts the host drives (`PreviewElement`,
`EditorElement`, `UrlPreviewElement` with its image name `ImagePreviewElement`, `DiffElement`),
the ready gate behind them, the `--spl-*` SCSS tokens (see "Theming"), and the contract
conformance suites (`@stillpointlab/common-format/testing`).

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
{ defaultOn })` from `common` reads the second kind. The raw view's `view` attribute is an enumerated
contract attribute: `"raw"` asks for the raw view, and absent or any other value means the rich one.

### Raw view

A surface over a text format can show its source as text: its _raw view_, beside its rendered
_rich view_. It is an optional capability of the contracts, like the keymap modes. An element that
supports it observes a `view` attribute (`"rich"` or `"raw"`), reflects its current view there, and
dispatches a non-bubbling `view-change` event with `{ view, reason }`. The reason is `user` (the
element's switch), `host` (the host set `view`) or `fallback` (the element switched by itself).
There is no `view` property.

The rules, which `describeRawViewContract` proves:

- **Switching never changes the text.** `getContent()` is byte-identical before and after a switch
  with no edit in between.
- **Raw is the text.** In raw, `getContent()` returns the raw text verbatim. Each raw edit emits
  `content-change` with `{ content }`, and leaving raw emits nothing more. `setContent` replaces the
  text and stays in raw.
- **Leaving raw re-parses.** If the text does not parse, the element stays in raw and announces the
  current errors in its notice. A host that set `view="rich"` sees the attribute reflected back.
- **Fallback.** Content the rich view cannot show (it does not parse, its engine failed to load, or
  a format's limit) opens in raw with a notice saying why, with reason `fallback`. In an editor,
  fixing the text does not switch back by itself; a preview returns to the rich view when valid
  content arrives, since nobody can fix the text there.
- **Read-only never changes the view.** Both views are uneditable, and the switch still works.
- **Line endings are kept.** Text with CRLF (or CR) line endings reads back as set, and a raw edit
  writes the whole text with the line break the text was set with: `<code-editor>` and the
  textarea both report LF otherwise. Text with mixed line endings is returned as set until an
  edit, and with its first line break throughout after one. `lineBreakOf` and `withLineBreak` are
  the helpers.

Editors put a "Raw Text" switch (`createSwitch` with `RAW_VIEW_LABEL`, checked in raw) last in their
toolbar. Previews have no switch; the host decides whether to offer one. The pieces in `common`:

- `createViewState(el)` keeps the current view in step with the attribute: `commit(view, reason)`
  reflects it and dispatches `view-change` when it changed, `reflect()` writes it back after a
  refused request, and `reflecting` lets `attributeChangedCallback` ignore the element's own writes.
- `createRawSource({ value, language, readonly, label, onInput })` is the editable raw surface: a
  `<code-editor>` when the host registered one, else a `<textarea>`. `createRawView({ value,
language, label })` is the read-only one: a `<code-preview>` or a `<pre>`. Both are marked
  `data-spl-raw` and styled by `@use 'common/src/styles/raw';`.
- `createNotice({ tone, title, items, announce })` is the banner that says why, styled by
  `@use 'common/src/styles/notice';`. `announce: 'assertive'` makes it an alert, for errors the user
  just caused.

An editor with a raw view also implements the contract's keymap-mode methods for its raw text,
through `createKeymapState(el)`: the `keymap-mode` attribute (reflected), `keymap-mode-change`, and
`getSupportedKeymapModes` / `getKeymapMode` / `setKeymapMode` (Normal, plus Vim while `<code-editor>`
is defined and the element is editable). The mode is recorded while the rich view shows and the raw
view opens in it; a choice made on the embedded `<code-editor>`'s toolbar comes back as the
element's own event, so a host stores one preference for every editor. The rich view's keys never
change. Read-only raw text runs in Normal without changing the recorded mode, and without an
event. `describeKeymapModeContract` proves it, in a test file of its own since it defines a
`<code-editor>` stand-in.

The text template's sample editor and preview implement all of it, so a new format starts with a
raw view. The harness has a Raw control, logs `view-change`, and registers `<code-editor>` and
`<code-preview>` (`?raw=plain` leaves them out).

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

### Toolbars

Each format builds its own toolbar and owns its commands. `common` supplies only behaviour and
states every toolbar must share, as functions the format calls and mixins it includes:

- `moveToolbarFocus(event, items)` and `setToolbarTabStop(items, preferred)`: the toolbar is one
  tab stop, and ArrowLeft, ArrowRight (wrapping), Home and End move between its enabled controls.
- `dismissOnOutside(inside, { isOpen, close, escape })`: closes a popover or menu on a pointer
  outside it, or on Escape, across shadow roots; returns a dispose function.
- `isReadonly(el)` and `reflectReadonly(el, target, readonly?)`: the contract's `readonly="true"`,
  and `aria-readonly` on the editing root.
- `createSwitch({ label, checked, disabled, onToggle })`: the on/off switch (`role="switch"`),
  styled by `@use 'common/src/styles/switch';`. `onToggle` may return false to refuse the change.
- `@use 'common/src/styles/toolbar';` provides `toolbar.focus-ring` and `toolbar.disabled`, the
  keyboard focus and disabled states, included in each format's own button classes. Sizes and
  layout stay with the format.

Every toolbar carries `role="toolbar"` and an `aria-label`, icon-only buttons have an accessible
name, and popover triggers expose `aria-haspopup` and `aria-expanded`. There is deliberately no
toolbar component or command schema in `common`.

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
| `--spl-hover-gray`           | `#d9f0e3`                  | the board's hovered drop targets         |
| `--spl-pool-surface`         | `#e7e4da`                  | the task board's Unassigned pool         |
| `--spl-surface-overlay`      | `#ffffff`                  | popovers and menus                       |
| `--spl-header-bg`            | `#f6f8fa`                  | table headers, sheet toolbar and notices |
| `--spl-code-bg`              | `#f0f0f0`                  | inline code and code blocks              |
| `--spl-text-primary`         | `#000`                     | body text                                |
| `--spl-text-secondary`       | `#333`                     | secondary text, labels                   |
| `--spl-text-color`           | `#444`                     | toolbar icons and controls               |
| `--spl-text-muted`           | `#666`                     | hints, metadata, line numbers            |
| `--spl-text-faint`           | `#888`                     | quiet notes (the pool order warning)     |
| `--spl-border-color`         | `#eee`                     | element frames and dividers              |
| `--spl-border-light`         | `#ddd`                     | light rules, table borders               |
| `--spl-border-dark`          | `#ccc`                     | inputs, menu outlines                    |
| `--spl-border-strong`        | `#b0b0b0`                  | table cell borders                       |
| `--spl-primary-color`        | `#33312a`                  | the board's drag and kind accents        |
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
| `--spl-alert-color`          | `#d9662b`                  | check-in chips, inventory warning frames |
| `--spl-alert-bg`             | `#f9e7d8`                  | the inventory's check-in bar and notices |
| `--spl-alert-text`           | `#8a4516`                  | text on alert backgrounds                |
| `--spl-gold-color`           | `#b98a24`                  | the board's selected card                |
| `--spl-chip-hover-bg`        | `rgba(139, 92, 246, 0.1)`  | hovered outlined chips                   |
| `--spl-code-active-line-bg`  | `rgba(88, 166, 255, 0.12)` | CodeMirror's active line                 |
| `--spl-code-selection-bg`    | `rgba(88, 166, 255, 0.38)` | CodeMirror's selection                   |
| `--spl-shadow-color`         | `rgba(0, 0, 0, 0.18)`      | popover and menu shadows                 |
| `--spl-overlay-scrim`        | `rgba(0, 0, 0, 0.5)`       | the backdrop behind a modal dialog       |
| `--spl-drag-shadow`          | one soft black layer       | a dragged card's ghost                   |
| `--spl-popover-shadow`       | one soft black layer       | the board's tracked-file preview         |
| `--spl-overlay-shadow`       | two soft black layers      | a modal dialog's whole `box-shadow`      |

A format stylesheet starts with `@use 'common/src/styles/tokens' as *;` and uses the variables
(`$text-primary`, `$error-bg`, …) for every colour. A format may add properties of its own
(`--spl-sheet-*`, `--spl-xmdl-*`) as long as each falls back to a token, never to a literal.
`npm run lint` runs `tooling/check-tokens.mjs`, which fails on a hardcoded colour in any format
stylesheet.

### Conformance

`@stillpointlab/common-format/testing` exports `describePreviewContract`, `describeEditorContract`,
`describeUrlPreviewContract` (and `describeImagePreviewContract`, the same with image's hooks) and
`describeDiffContract`: vitest `describe` blocks a format runs in `src/contract.test.ts` for each
element it ships. They prove readiness, set and read back, `content-change` on user edits and never
on `setContent`, `readonly`, keymap modes and focus, settling after a DOM move and after a
reconnect, and take hooks for what only the format knows (how to tell content reached the DOM, how
to perform one edit, how its media is told it loaded or failed). They use no fake timers, private fields or jsdom-specific stubs, so they run
unchanged under vitest browser mode. What needs a real browser (a clip that plays, a page that is
drawn) is a package's `*.browser.test.ts`, run by `browserTest()` and not by `npm test`: see
[Testing](#testing).

Styles: write SCSS next to the component. `gen:styles` compiles every non-partial
`src/**/<name>.scss` into a sibling `<name>.styles.ts` exporting `<name>Styles`; the generated files
are ignored by git, lint and prettier, and every build, test and typecheck script regenerates them
first.

Build order: packages resolve each other through their built `dist/`. The formats depend on
`common`, and the inventory app also on `sheet-format`, so the root `typecheck` and `test` scripts
build those two first (`npm run build:deps`). Inside one package, run that once from the root before
`npm test` or `npm run typecheck` there. A package that starts depending on another workspace adds
it to `build:deps`.

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
