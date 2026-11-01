# Stillpoint Lab formats

One repository for the content formats Context Manager edits and previews. Each package under
`packages/` is one format. A format always ships a **core** (parser, document model, theme) and a
**preview** (a read-only element), and optionally an **editor** (the interactive element). Previews
are the no-JS-fallback-friendly layer; editors are the enhancement on top.

| Package          | npm name                      | Elements                                            | Editor |
| ---------------- | ----------------------------- | --------------------------------------------------- | ------ |
| `packages/md`    | `@stillpointlab/md-format`    | `<md-editor>`, `<md-preview>`                       | yes    |
| `packages/code`  | `@stillpointlab/code-format`  | `<code-editor>`, `<code-preview>`, `<code-diff>`    | yes    |
| `packages/sheet` | `@stillpointlab/sheet-format` | `<sheet-editor>`, `<sheet-grid>`, `<sheet-preview>` | yes    |
| `packages/xmdl`  | `@stillpointlab/xmdl-format`  | `<xmdl-editor>`, `<xmdl-preview>`                   | yes    |
| `packages/image` | `@stillpointlab/image-format` | `<image-preview>`                                   | no     |

Each package's README documents its own API. The packages were imported from the former
`md-editor`, `code-editor`, `sheet-editor`, `xmdl-editor` and `image-editor` repositories with
their history rewritten under `packages/<name>/`.

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
packages/<name>/
  package.json       name, entries, runtime dependencies, and five one-line scripts
  tsconfig.json      extends the base; overrides only what the package needs
  tsup.config.ts     entries and externals through `formatPackage()`
  vitest.config.ts   `formatTest()` with any override
  vite.config.ts     the `dev/` playground
  src/, dev/, README.md
```

## Working on it

```sh
npm install        # once, at the root
npm run check      # lint, format, typecheck, test, build: what CI runs
npm run build      # every package
npm test           # every package

cd packages/sheet  # or any package
npm run dev        # the playground on that package's port
npm test           # that package only
```

Styles: write SCSS next to the component. `gen:styles` compiles every non-partial
`src/**/<name>.scss` into a sibling `<name>.styles.ts` exporting `<name>Styles`; the generated files
are ignored by git, lint and prettier, and every build, test and typecheck script regenerates them
first.

Dependencies: there is one `package-lock.json`. Refresh with `npm outdated` → update → `npm run
check`. The `glob` and `minimatch` overrides and the `eslint-plugin-import-x/rules/order` import
mirror Context Manager's dependency policy and go away together when upstream ranges catch up.

## Consumers

Context Manager mounts this repository as a git submodule and lists its packages in its npm
workspace, so the application's lockfile governs these packages when they are installed there.
