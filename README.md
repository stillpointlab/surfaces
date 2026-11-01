# Stillpoint Lab surfaces

The human surfaces over [Context Manager](https://stillpointlab.com): **formats**, each a preview
and optionally an editor over one good, and **apps**, each a manifest-mounted scope of goods. Both
are stateless clients of the same host contract (`get` / `list` / `put`, where `put` is a proposal),
so they share one toolchain, one `common` package and, in time, one scaffold.

| Package                  | npm name                       | Ships                                                       | Port |
| ------------------------ | ------------------------------ | ----------------------------------------------------------- | ---- |
| `packages/common`        | `@stillpointlab/common-format` | logging, element contracts, SCSS tokens; no elements        |      |
| `packages/formats/md`    | `@stillpointlab/md-format`     | core + `<md-preview>` + `<md-editor>`                       | 5180 |
| `packages/formats/code`  | `@stillpointlab/code-format`   | core + `<code-preview>` + `<code-editor>`, `<code-diff>`    | 5181 |
| `packages/formats/sheet` | `@stillpointlab/sheet-format`  | core + `<sheet-preview>` + `<sheet-editor>`, `<sheet-grid>` | 5182 |
| `packages/formats/xmdl`  | `@stillpointlab/xmdl-format`   | core + `<xmdl-preview>` + `<xmdl-editor>`                   | 5183 |
| `packages/formats/image` | `@stillpointlab/image-format`  | `<image-preview>` only                                      | 5184 |
| `packages/apps/`         |                                | tasks and inventory arrive with the apps breakout           |      |

The port column is the registry for `npm run dev` playgrounds; `npm run new-format` takes the next
free one.

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
    vite.config.ts   the `dev/` playground
    src/, dev/, README.md
```

## Working on it

```sh
npm install        # once, at the root
npm run check      # lint, format, typecheck, test, build: what CI runs
npm run build      # every package
npm test           # every package

cd packages/formats/sheet   # or any package
npm run dev                 # the playground on that package's port
npm test                    # that package only

npm run new-format -- video # a new format from the template; then npm install and add its row above
```

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
`EditorElement`, `ImagePreviewElement`, `DiffElement`), and the `--spl-*` SCSS tokens. A format
styles with `@use 'common/src/styles/tokens' as *;`.

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
