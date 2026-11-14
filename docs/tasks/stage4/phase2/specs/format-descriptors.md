---
column: in-progress
pr: 93
created: 2026-11-13T18:30:00-07:00
tags: [formats, common, host-contract, code]
---

# Spec: format descriptors and the registry

_The [local host brief](../../phase1/briefs/local_host.md), outcome 1. Stage 4, phase 2, first wave: it runs
beside [host-server](host-server.md) and [explorer-tree](explorer-tree.md). One PR here._

## High-level goal

Each format package says which paths it opens and how a host mounts it. A host registers the five
descriptors and asks one registry "what opens this path", with no table of its own.

## Related context

- The brief's outcome 1 fixes the shape: data and one `apply(element, file)`.
- The [local host spike](../../phase1/spikes/local-host.md), finding 3: Context Manager decides today, in
  `shared/utils/repoFileKind.utils.ts` (`classifyRepoFilePath`) and
  `shared/utils/codeLanguage.utils.ts` (`languageFromFilename`, `imageContentTypeFromFilename`).
- The element contracts: `packages/common/src/contracts.ts`.
- The harness's `HarnessFormat` (`tooling/harness/types.ts`), which already names tags and an
  `apply`.

## Work package

- **Owns:** `packages/common/src/format.ts` and its `./format` entry; a `./format` entry in each
  of `packages/formats/{md,code,sheet,xmdl,image}`; the descriptor suite in
  `packages/common/src/testing/`; the harness's `types.ts` and `main.ts`.
- **Does not change:** any element, or the contracts in `contracts.ts`.
- **Shares nothing with a parallel spec.** The harness's glob line for the hosts is in
  [host-server](host-server.md)'s scaffold commit, which this work starts from (changed
  2026-11-13, when the phase opened).

## Technical requirement

### The contract

A new light entry, `@stillpointlab/common-format/format`. Importing it touches no DOM.

```ts
/** A file as a host hands it to a format. */
export interface FormatFile {
  path: string;
  /** The file's text, for a format that needs text. */
  text?: string;
  /** A URL the element can load, for a format that needs a URL. */
  url?: string;
}

export interface FormatElementEntry {
  tag: string;
  /** Load the module that defines `tag`. */
  load(): Promise<unknown>;
}

export interface FormatDescriptor {
  /** `md`, `code`, `sheet`, `xmdl`, `image`. */
  id: string;
  /** The extensions it opens: lower case, with the dot (`.md`). */
  opens: readonly string[];
  needs: 'text' | 'url';
  preview: FormatElementEntry;
  editor?: FormatElementEntry;
  /** Hand a mounted preview or editor its content, with the attributes the path implies. */
  apply(element: HTMLElement, file: FormatFile): void;
}

export interface FormatRegistry {
  /** The first registered format whose `opens` has the path's extension, or `null`. */
  find(path: string): FormatDescriptor | null;
  /** What opens a text file nothing matched. */
  readonly fallback: FormatDescriptor | null;
  readonly formats: readonly FormatDescriptor[];
}

export function createFormatRegistry(
  formats: readonly FormatDescriptor[],
  options?: { fallback?: FormatDescriptor }
): FormatRegistry;
```

Matching is by the extension alone, without regard to case. `find` never reads a file: whether an
unmatched file is text is the host's question, and the host then uses `fallback`.

### The five descriptors

Each package exports `<name>Format` from `./format`.

| Format  | `opens`                                                      | `needs` | `apply`                                                           |
| ------- | ------------------------------------------------------------ | ------- | ----------------------------------------------------------------- |
| `md`    | `.md`, `.markdown`                                           | text    | `setContent(text)`                                                |
| `xmdl`  | `.xmdl`                                                      | text    | `setContent(text)`                                                |
| `sheet` | `.csv`, `.sheet`                                             | text    | `.sheet`: `setDocumentSource(text)`; otherwise `setContent(text)` |
| `image` | Context Manager's image extensions                           | url     | `setSource(url, <file name>)`                                     |
| `code`  | every extension in Context Manager's `EXTENSION_TO_LANGUAGE` | text    | set or remove `language` from the path, then `setContent(text)`   |

- **The extension lists start as Context Manager's,** copied from the two utilities at the commit
  the PR names, so both hosts agree from the first day.
- **`code` owns path to language.** The table moves into the code package as
  `languageFromPath(path): string | null`, exported from `./format`. A path with no known
  language gets no `language` attribute, which is how the registry's fallback shows plain text.
- **`image` has no editor.** The other four have both entries.

### Loading stays lazy

Importing a `./format` entry defines no element and evaluates no engine. `load()` resolves to the
same module the package's `./preview` or `./editor` entry is, so an element is never defined
twice.

`tooling/tsup.ts` builds without splitting, so a relative `import('./preview')` would be inlined
into the format entry. Two ways meet the requirement; choose one and say which in the PR:

- import the package's own entry by name (`import('@stillpointlab/md-format/preview')`), marked
  external in the build, with the tests' alias pointing at the source;
- turn splitting on for the ESM build of these packages.

### The harness reads it

`HarnessFormat` gains `format?: FormatDescriptor`. With it:

- the harness takes the preview and editor tags from the descriptor and loads them through it;
- a plain-string fixture is applied with `format.apply`, under the fixture's `path` when it has
  one, and otherwise under `fixture` plus the format's first extension.

`elements` stays for components and apps, and for `extra` tags. A fixture's own `apply` still
wins, since hostile states need it. The five formats' fixtures switch to `format`.

### The suite

`describeFormatDescriptor(format, samples)` in `@stillpointlab/common-format/testing`, run by each
format package:

- importing the entry defines none of the format's tags;
- after `preview.load()` (and `editor.load()`) the tag is defined;
- for each sample file, `apply` then `whenReady()` settles;
- for a text format with an editor, `getContent()` returns the text applied.

## Clarifications

- **Extensions with two dots** (`.d.ts`) match on the last one. Nothing registered needs more.
- **A `needs: 'url'` format gets no `text`,** and a text format gets no `url`.
- **The registry holds no host policy:** no size limits, no "is it text". Those are
  [host-page](host-page.md)'s.

## Non-goals

- Content types. Mapping Context Manager's stored types onto format ids is
  [context-manager-adopts-formats](../../phase1/specs/context-manager-adopts-formats.md).
- The diff element. `<code-diff>` stays an extra the host mounts by tag.
- A handle the format supplies for itself. Jamie chose data and `apply` (2026-11-13).

## As built

_[#93](https://github.com/stillpointlab/surfaces/pull/93), 2026-11-14._

- **Splitting, the second of the two ways.** It is on for the five format packages, with the
  split files in `dist/chunks/` and `./dist/chunks/*` in each package's `sideEffects`: without
  that line a Vite build dropped `<md-editor>`, whose `defineElement` had moved into a chunk.
  Every built entry of the five packages changed shape, so Context Manager's walks run when its
  pin next moves.
- **`common-format/format` also exports `extensionOf` and `fileNameOf`,** which the descriptors
  share.
- **The registry throws** on a format registered twice and on an `opens` entry that is not a
  lower-case extension with one dot.
- **A host registers md, xmdl, sheet, image, code, in that order,** with code as the fallback:
  the code format opens `.md` too, because Context Manager's language table does.
- **`describeFormatDescriptor` takes an optional `{ load }`,** since jsdom never loads an image.
- **Two paths class differently from Context Manager's classifier:** it trims the path, and its
  object lookup took `x.constructor` for code.

## Acceptance / completion checklist

- [ ] `@stillpointlab/common-format/format` exports the types and `createFormatRegistry`.
- [ ] Each of the five packages exports its descriptor from `./format`, and its entries test
      proves the entry defines no element and loads no engine.
- [ ] Each package runs `describeFormatDescriptor` over at least one sample per extension family.
- [ ] The harness mounts all five formats through their descriptors, and looks the same.
- [ ] `npm run check` is green.

## Implementation plan

1. The contract and the registry in `common`, with tests.
2. The five descriptors and `languageFromPath`, with the suite.
3. The harness switched over.
