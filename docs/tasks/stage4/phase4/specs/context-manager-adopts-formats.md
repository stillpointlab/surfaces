---
column: done
pr: 'stillpointlab/context-manager#1186'
completed: 2026-11-14
created: 2026-11-13T18:56:00-07:00
tags: [formats, host-contract, code]
---

# Spec: Context Manager adopts the format registry

_The [local host brief](../../phase1/briefs/local_host.md), outcome 6. Stage 4, phase 4, the stage's last:
after [format-descriptors](../../phase2/specs/format-descriptors.md) has merged. One Context Manager PR, with both
walk suites._

## High-level goal

Context Manager asks this repository's registry which format opens a file and how to mount it.
Its own path tables and per-format branches go, so the two hosts cannot drift apart.

## Related context

- The [local host spike](../../phase1/spikes/local-host.md), finding 3: where Context Manager decides
  today.
- Context Manager:
  - `shared/utils/repoFileKind.utils.ts` (`classifyRepoFilePath`, 39 lines);
  - `shared/utils/codeLanguage.utils.ts` (173 lines): the content type constants and tests, and
    `languageFromFilename`, `imageContentTypeFromFilename`;
  - `client/components/doc-preview/doc-preview.ts` (904 lines) and the good page
    (`client/pages/digitalGood/`), which branch per format;
  - `client/utils/{markdown,sheet,xmdl,image}Preview.ts`, which set each preview up.
- ADR-0009, "Pluggable editor types": a good's content type chooses its editor, and the
  language comes from the filename.

## Work package

- **Owns:** changes in Context Manager only, in the clone `context-manager-surfaces`, and the
  submodule pin.
- **Does not change:** this repository, except a fix this work proves is needed, which goes in
  its own PR here first.

## What stage 4 built (read before the text below)

_Added 2026-11-14 by the claude agent, from reading this spec against
[format-descriptors](../../phase2/specs/format-descriptors.md) as built
([#93](https://github.com/stillpointlab/surfaces/pull/93)) and the local host's page, its first
user ([#94](https://github.com/stillpointlab/surfaces/pull/94))._

- **The pin moves past a change to every format package's build.** Splitting is on, with shared
  code in `dist/chunks/` and `./dist/chunks/*` in each package's `sideEffects`. Check Context
  Manager's client build before anything else: its bundle sizes per page, and that every
  element still registers. Both walk suites run on the pin alone, before the adoption's own
  changes.
- **Register in this order:** md, xmdl, sheet, image, code, with code as the fallback. The code
  format opens `.md`, as Context Manager's language table did.
- **`common-format/format` has `extensionOf` and `fileNameOf`.** `classifyRepoFilePath` keeps
  its two sheet kinds with `extensionOf`.
- **Two paths class differently** and go in the PR's list: Context Manager trims the path and
  the registry does not, so trim before asking; and `x.constructor` was code by an accident of
  an object lookup, and is unknown now.
- **The descriptor does not carry the image MIME table** (`imageContentTypeFromFilename`) or
  the "XML content type is XML" rule in `languageForContentType`. Both are about content types,
  and stay.
- **Do not compare module namespaces.** Under a production build `await load()` is not `===` to
  a static import of the same entry. The module is evaluated once.
- **`load()` before the element is created,** and for markdown the sanitizing renderer before
  that, as the local host's page does (`packages/hosts/local/src/client/registry.ts` and
  `markdown.ts` here).

## Technical requirement

- **One table joins the two vocabularies.** A stored content type maps onto a format id
  (`md`, `code`, `sheet`, `xmdl`, `image`). It is the only place Context Manager names a format.
- **Paths go through the registry.** `classifyRepoFilePath` keeps its signature and answers from
  `registry.find(path)`; `languageFromFilename` becomes the code package's `languageFromPath`,
  and the extension tables in Context Manager go.
- **Mounting goes through the descriptor.** The good page and `doc-preview` load a format's
  preview or editor with the descriptor's `load`, and hand it content with `apply`. Their
  branches for the sheet's two setters, the image's URL and the code language go.
- **ADR-0009 is amended,** not replaced: the content type still chooses the format, and the
  format's descriptor now says which paths it opens and how it is mounted.

What stays Context Manager's:

- the bounded safe-text probe for a file no format claims;
- the sanitizing, citation-aware markdown renderer it installs into `<md-preview>`;
- import preflight, and which families may be imported directly.

## Clarifications

- **No behaviour change is intended.** The extension lists here started as Context Manager's, so
  every path should class as it did. The PR lists any path that classes differently.
- **`sheet-csv` and `sheet-document`** stay two kinds in Context Manager where import treats
  them differently; both are the `sheet` format.
- **The count.** The lines removed are recorded in the PR, beside ADR-0040's count for apps.

## Non-goals

- The apps' pieces:
  [context-manager-adopts-apps](../../../stage5/phase6/specs/context-manager-adopts-apps.md), in
  stage 5.
- Changing which content types exist, or how a good stores its type.

## As built

_context-manager#1186, 2026-11-14: the pin alone, then the adoption, by an Opus 5.5 sub-agent in the
`context-manager-surfaces` clone. Its description lists every behaviour difference._

- **The table is `src/shared/utils/formats.utils.ts`:** the registry, and rows from a repository
  path kind and a stored content type to a format. The server uses it too.
- **A good is handed to its format under a path its content type fixes:** the trimmed title, with
  `.csv`, `.sheet` or `.xml` added when the title lacks it. The content type, not the title,
  still picks the sheet's setter and XML's highlighting.
- **`x.constructor` was an image, not code,** by the same accident of an object lookup. It is
  unknown now, and goes to the safe-text probe.
- **One read-only mount,** `src/client/utils/formatPreview.ts`, serves the preview pane for every
  format. A mount that is superseded or whose host has left the page is dropped.
- **The good page's editor is still rendered by the server,** with the tag the descriptor names,
  and upgraded on load. `apply` runs only after `load()`.
- **One language branch is left on the good page:** renaming a code good sets `language` by
  hand, because `apply` would also replace the person's text.
- **Not moved:** the public and library preview pages and claim review, which mount code and
  sheets from server-rendered sources. The spec names the good page and `doc-preview` only.
- **The registry and the five descriptors add 3.9 kB** (1.4 kB gzip) to the chunk every Context
  Manager page shares, because its shared utils barrel exports them. The good page's entry and
  the project page's entry are each smaller than before.
- **The walks** ran twice, on the pin alone and on the adoption: inventory 38/38 and tasks 01–27
  and 29, all on the first try. They open no code, sheet or image file, so the orchestrating
  agent drove the preview pane and the good page over those in Chromium.

## Acceptance / completion checklist

- [x] No file in Context Manager maps an extension to a format or a language.
- [x] The good page and `doc-preview` hold no per-format setter branch.
- [x] ADR-0009 carries the amendment.
- [x] Both walk suites pass, and the PR lists any behaviour change.

## Implementation plan

1. The content type table, and `classifyRepoFilePath` over the registry, with its tests.
2. The good page and `doc-preview` over the descriptors.
3. The ADR amendment, the pin, and the walks.
