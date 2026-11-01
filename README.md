# Stillpoint Lab surfaces

The human surfaces over [Context Manager](https://stillpointlab.com): **formats**, each a preview
and optionally an editor over one good, and **apps**, each a manifest-mounted scope of goods. Both
are stateless clients of the same host contract (`get` / `list` / `put`, where `put` is a proposal),
so they share one toolchain, one `common` package and, in time, one scaffold.

| Package                  | npm name                      | Elements                                            | Editor |
| ------------------------ | ----------------------------- | --------------------------------------------------- | ------ |
| `packages/formats/md`    | `@stillpointlab/md-format`    | `<md-editor>`, `<md-preview>`                       | yes    |
| `packages/formats/code`  | `@stillpointlab/code-format`  | `<code-editor>`, `<code-preview>`, `<code-diff>`    | yes    |
| `packages/formats/sheet` | `@stillpointlab/sheet-format` | `<sheet-editor>`, `<sheet-grid>`, `<sheet-preview>` | yes    |
| `packages/formats/xmdl`  | `@stillpointlab/xmdl-format`  | `<xmdl-editor>`, `<xmdl-preview>`                   | yes    |
| `packages/formats/image` | `@stillpointlab/image-format` | `<image-preview>`                                   | no     |
| `packages/apps/`         |                               | tasks and inventory arrive with the apps breakout   |        |

A **format** always ships a core (parser, document model, theme) and a preview (the read-only
element, friendly to a no-JS fallback), and optionally an editor (the interactive element). Image,
video, audio, PDF, 3D objects and materials all start as preview-only formats and gain editors when
there is something to edit. An **app** owns a folder: see [`packages/apps/README.md`](packages/apps/README.md)
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
docs/
  tasks/             this repository's own task boards (tasks.yaml + templates)
packages/
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
```

Playground ports: md 5180, code 5181, sheet 5182; xmdl and image take vite's default.

Styles: write SCSS next to the component. `gen:styles` compiles every non-partial
`src/**/<name>.scss` into a sibling `<name>.styles.ts` exporting `<name>Styles`; the generated files
are ignored by git, lint and prettier, and every build, test and typecheck script regenerates them
first.

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
