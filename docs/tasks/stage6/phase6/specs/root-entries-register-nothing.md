---
column: todo
created: 2026-11-28T02:55:00-07:00
tags: [formats, host-contract, code]
---

# Spec: a format's root entry registers nothing

_From the [seed](../seeds/root-entries-register-nothing.md), which Jamie placed in the stage's
close on 2026-11-27 ("I think I want it for stage if possible. Find a place for it to land"). A
draft by the claude agent at phase 5's close, with what was read on 2026-11-28 at surfaces
`d8fda76` and Context Manager `6c258d42`. One PR in surfaces; Context Manager's three lines move
in the close's pin._

## High-level goal

Importing `@stillpointlab/md-format` (or `code`, `sheet`, `xmdl`, `image`) defines no element and
loads no editor. A host that wants an element imports that element's entry. The five formats that
came before the convention then follow it, as audio, video and PDF do, and the README's sentence
for the exception goes.

## Related context

- **The convention,** root README, "Formats": `./preview`, `./editor`, `./format`, `./worker`,
  each its own entry; a scaffolded package's root is "the element's type and the host's logging
  hooks" and its DOM-free core (`packages/formats/audio/src/index.ts`).
- **All five are built split** (`splitPackage` in `tooling/tsup.ts`), so what two entries share
  is built once, and an element is defined once whichever entries a page loads.
- **Each of md, code, sheet and xmdl has an `./editor` entry already,** made as "the explicit
  alias" of the root. image has `./preview`.

### What each root does today, and what leaves it

| Format | Registers on import           | Leaves the root                                                                                                                                                                                         | Stays                                                                                |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| md     | the editor (ProseMirror)      | the registering import; `buildTableNode`, `registerEditorPlugin`, `getEditorPlugins` (in `./editor` already); `createSchema`, `getSchema`, `getMarkdownParser`, `getMarkdownSerializer` (to `./editor`) | the two plugin types; `ProseMirrorEditor` as a type; the logging hooks               |
| code   | the editor                    | the registering import; `findLanguage`, `loadLanguage` (in `./editor` already)                                                                                                                          | `CodeEditor` as a type; the logging hooks                                            |
| sheet  | the editor, the grid, preview | the three registering imports                                                                                                                                                                           | `document`, `interaction` and `presentation`; `SheetEditor` and `SheetGrid` as types |
| xmdl   | the editor                    | the registering import                                                                                                                                                                                  | the parser and its types; `XmdlEditor` as a type; the logging hooks                  |
| image  | the preview                   | the registering import                                                                                                                                                                                  | `ImagePreview` as a type; `setErrorHandler`                                          |

### Who imports a root today

- **In surfaces: nothing but READMEs and one test.** The local host, the harness, the apps and
  the tooling import entries. `md`'s README imports the root in five places and `code`'s in one.
  `code/src/entries.test.ts` imports the root's source and expects elements from it.
- **In Context Manager, three lines:**
  - `src/client/utils/rawView.ts`: `await import('@stillpointlab/code-format')`, **for its side
    effect**, to define `<code-editor>` for an editor's raw text.
  - `src/client/pages/digitalGood/frontmatterNative.test.ts`: `getMarkdownParser` and
    `getMarkdownSerializer`.
  - `src/client/pages/digitalGood/citationEditorPlugin.ts`: the type `MarkdownEditorPlugin`.
    It keeps working as it is.

  Context Manager registers its markdown plugins through `./editor` already.

## Technical requirement

### 1. The five roots

- **No root imports a module that defines an element,** directly or through what it imports.
- **An element's class is exported from a root as a type only.** The class as a value is its
  entry's.
- **md's schema, parser and serializer are exported from `./editor`,** beside the plugin
  registry they read. They load ProseMirror, which a root must not.
- **Nothing is added to a root.** md's root does not gain `./markdown`'s exports.
- **Each package's `sideEffects` list loses its root** (`./src/index.ts`, `./dist/index.js`,
  `./dist/index.cjs`), since importing it now does nothing a bundler must keep.

### 2. Tests

- **Each of the five gains the test the scaffold's formats have for `./format`, for its root:**
  importing the root defines none of the package's elements and evaluates no element module. For
  md, no ProseMirror and no markdown-it; for code, no CodeMirror.
- code's test that imports the root and expects elements is changed to import the entry.
- **In the built packages, once:** a plugin registered through `@stillpointlab/md-format/editor`
  is seen by the editor that entry defines. This holds today by the split build; the test is so
  that it is not lost.

### 3. The words

- The root README's sentence ("For the formats that predate the convention, `.` still registers
  the editor and exports everything; `./editor` is the explicit alias") goes, and what a root is
  for is said once, for all eight.
- md's and code's READMEs import the entry where they import the root. Each of the five's README
  says what its root exports.
- `common`'s README, where it shows a host registering formats, is read for a root import.

### 4. Context Manager, in the close's pin

Not this PR. Written here so the pin's PR has it:

- `rawView.ts` imports `@stillpointlab/code-format/editor`.
- `frontmatterNative.test.ts` imports the parser and serializer from
  `@stillpointlab/md-format/editor`.
- **A test holds that `<code-editor>` is defined after `registerRawSourceEditor()`.** Without
  the first change nothing fails: the import succeeds, defines nothing, and an editor's raw text
  loses its highlighting without a word. This is the one silent way for the change to go wrong.

## Clarifications

For Jamie, with the agent's lean:

1. **md's root keeps types and the logging hooks, and nothing that runs.** The schema, parser and
   serializer go to `./editor`. The other way is to leave them at the root, since they define no
   element; but they load ProseMirror, and "a host that wants one type from a root gets an
   editor's code with it" is what the seed set out to end. Lean: to `./editor`.
2. **No deprecation step.** The packages are private, and Context Manager, which pins a commit,
   is the one consumer. A root that warned for a release and then changed would be work for
   nobody. Lean: change at once, with the three lines in the pin's PR.
3. **If the close runs short,** the seed says this is the first thing to go to the next stage.
   Lean: build it first in phase 6, before the release review, so the review reads the roots as
   they will be.

## Non-goals

- Changing what any `./editor`, `./preview` or `./format` entry does, beyond md's `./editor`
  gaining four exports.
- Renaming an element's class or exporting an element interface where a class is exported today.
- Context Manager's own change (it is the pin's).
- A version bump or a published package.

## Acceptance / completion checklist

- [ ] The Clarifications are ruled.
- [ ] Importing each of the five roots defines no element, by test, in source.
- [ ] No root is in a `sideEffects` list.
- [ ] The local host and the harness, built, open a file of each of the five formats in Chromium
      and Firefox as before, with no element missing.
- [ ] The root README's sentence for the exception is gone, and no README imports a root to
      register an element.
- [ ] `npm run check` passes.
- [ ] The three lines for Context Manager are in the close's pin, with the test of
      `<code-editor>`, and the walks pass at that pin.

### Work package

- **Owns:** the five packages' root entries, `sideEffects` lists, entry tests and READMEs; md's
  `./editor` entry; the root README's paragraph.
- **Must not change:** `common`'s contracts, the local host's or the harness's code (they import
  entries already; if one turns out to import a root, that line alone), audio, video, PDF.
- **Runs after:** phase 5's close. **Before:** the release review.
