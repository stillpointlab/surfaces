---
column: in-progress
created: 2026-11-01T16:32:57-07:00
tags: [common, scaffold, formats, host-contract]
---

# Spec: the format package convention and the common package

## High-level goal

Every format package has the same shape, the few things they genuinely share live in one place, and
a new format starts from a template. The host's editor registry and the scaffold can then rely on
the convention instead of reading each package.

## Related context

- Brief: [format_package_convention](../briefs/format_package_convention.md).
- Depends on: the repository init (done 2026-11-01: five formats under `packages/formats/`, one
  toolchain, CI).
- Architecture (Context Manager, private):
  [ADR-0009](https://github.com/stillpointlab/context-manager/blob/main/docs/adr/0009-pluggable-editor-types.md)
  (the `EditorElement` contract and the "read-only views reuse the editor package" rule),
  [ADR-0001](https://github.com/stillpointlab/context-manager/blob/main/docs/adr/0001-server-side-rendering-with-web-components.md)
  (previews are the progressive-enhancement layer),
  [ADR-0035](https://github.com/stillpointlab/context-manager/blob/main/docs/adr/0035-surfaces-monorepo.md)
  (this repository).
- Seeds this spec partly covers: [one scaffold for formats and apps](../../../unassigned/seeds/one-scaffold-for-formats-and-apps.md)
  (the format half; the app half waits for the apps breakout).
- Main files/areas: `packages/common` (new), each format's `src/index.ts`, `tsup.config.ts` and
  `package.json` exports, `tooling/`, the root README.

## Technical requirement

1. **Three entry points.** Every format exports `.` (the core: parser, document model, theme, and
   whatever is isomorphic), `./preview` (the read-only element), and `./editor` (the interactive
   element) when it has one. Existing extra subpaths (`./markdown`, `./parser`, `./diff`, the sheet
   subpaths) stay; this adds the common three, it does not remove anything. The package README
   states which of the three it ships.
2. **`packages/common`.** `@stillpointlab/common-format` holds the copied `log.ts` (today in four
   places), the `EditorElement` and a matching `PreviewElement` contract moved out of the Context
   Manager host (`src/client/types/components.d.ts`), and the shared SCSS tokens (`md`'s
   `_variables.scss` is the seed). It is a workspace dependency of the five formats and is built
   first; it has no element of its own. The host switches to importing the contracts from it in a
   follow-up Context Manager PR.
3. **The image question.** Decide, with Jamie, whether `image` is a format (default) or a preview
   shim. If a format, it gains nothing but the README line; if a shim, it moves into `common` and
   Context Manager's import changes with it.
4. **Scaffold.** `packages/formats/_template` (excluded from the workspace glob) and an
   `npm run new-format <name>` script that copies it, with the three entry points stubbed, a `dev/`
   playground on the next free port, and a test per entry. Shape the script so a `new-app` sibling
   can grow from it once the apps breakout lands: the host-contract pieces come from `common`, not
   from the template.
5. **Playground ports.** One table in the root README; `vite.config.ts` per package reads its port
   from nowhere else.

## Non-goals

- Changing any element's behaviour or public API beyond the new subpath aliases.
- Moving host-side editor selection (`contentType` to element) out of Context Manager.
- The apps half of the scaffold.

## Acceptance / completion checklist

- [ ] `npm run check` passes with `common` in the graph.
- [ ] Each format's `exports` lists `.` and `./preview`, plus `./editor` where an editor exists.
- [ ] `log.ts` exists once; the four copies import it.
- [ ] A format created from the template builds, tests and lints with no edits beyond its name.
- [ ] Root README documents the convention and the port table.
- [ ] Context Manager follow-up PR imports the contracts from `common` (tracked there).
