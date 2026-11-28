---
column: review
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

| Format | Registers on import           | Leaves the root                                                                                                                                                                                                 | Stays                                                                                |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| md     | the editor (ProseMirror)      | the registering import; `buildTableNode`, `registerEditorPlugin`, `getEditorPlugins` (in `./editor` already); `createSchema`, `getSchema`, `getMarkdownParser`, `getMarkdownSerializer` (to a new `./document`) | the two plugin types; `ProseMirrorEditor` as a type; the logging hooks               |
| code   | the editor                    | the registering import; `findLanguage`, `loadLanguage` (in `./editor` already)                                                                                                                                  | `CodeEditor` as a type; the logging hooks                                            |
| sheet  | the editor, the grid, preview | the three registering imports                                                                                                                                                                                   | `document`, `interaction` and `presentation`; `SheetEditor` and `SheetGrid` as types |
| xmdl   | the editor                    | the registering import                                                                                                                                                                                          | the parser and its types; `XmdlEditor` as a type; the logging hooks                  |
| image  | the preview                   | the registering import                                                                                                                                                                                          | `ImagePreview` as a type; `setErrorHandler`                                          |

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
- **md's schema, parser and serializer get an entry of their own, `./document`,** as sheet's
  parser and serializer have. They load ProseMirror and markdown-it, which a root must not; and
  they must not go to `./editor`, which defines `<md-editor>` and loads none of its engine until
  the element is first connected (`src/editor/entry.test.ts` holds this). The editor goes on
  loading them by a dynamic import, and the split build keeps them out of the entry's own chunk.
- **Nothing is added to a root.** md's root does not gain `./markdown`'s exports.
- **Each package's `sideEffects` list loses its root** (`./src/index.ts`, `./dist/index.js`,
  `./dist/index.cjs`), since importing it now does nothing a bundler must keep.

### 2. Tests

- **Each of the five gains the test the scaffold's formats have for `./format`, for its root:**
  importing the root defines none of the package's elements and evaluates no element module. For
  md, no ProseMirror and no markdown-it; for code, no CodeMirror.
- **md's `./editor` still evaluates none of its engine on import.** Its test stands unchanged,
  and a test for `./document` holds that it defines no element.
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
  `@stillpointlab/md-format/document`.
- **A test holds that `<code-editor>` is defined after `registerRawSourceEditor()`.** Without
  the first change nothing fails: the import succeeds, defines nothing, and an editor's raw text
  loses its highlighting without a word. This is the one silent way for the change to go wrong.

## Decided

Jamie, 2026-11-28:

1. **Where md's schema, parser and serializer go.** The draft's lean was `./editor`. He asked:
   "will this change the initial size of ./editor ?" It would have. `./editor` today defines the
   element and loads ProseMirror, the parser and the serializer on the first connect; exporting
   them from it would put them in what a page loads at once, and the package has a test to stop
   exactly that. So they get an entry of their own. **The name `./document` is the agent's, not
   yet his.**
2. **No deprecation step:** "that is fine".
3. **Built first in phase 6:** "yes, build before stage close reviews both for adversarial
   review and user validation".

## Clarifications

1. **The new entry's name.** `./document`, after sheet's entry of the same job (text to a
   document and back). The other name considered is `./prosemirror`, which says what it loads
   and not what it is for. The build uses `./document`; a rename before the merge is small.

## Non-goals

- Changing what any `./editor`, `./preview` or `./format` entry does.
- Renaming an element's class or exporting an element interface where a class is exported today.
- Context Manager's own change (it is the pin's).
- A version bump or a published package.

## Acceptance / completion checklist

- [ ] The Clarification is ruled.
- [x] Importing each of the five roots defines no element, by test, in source.
- [x] No root is in a `sideEffects` list.
- [x] The local host and the harness, built, open a file of each of the five formats in Chromium
      and Firefox as before, with no element missing. _The local host built; the harness has no
      build and ran under Vite. By the building agent's script, not by a person._
- [x] The root README's sentence for the exception is gone, and no README imports a root to
      register an element.
- [x] `npm run check` passes.
- [ ] The three lines for Context Manager are in the close's pin, with the test of
      `<code-editor>`, and the walks pass at that pin.

### Work package

- **Owns:** the five packages' root entries, `sideEffects` lists, entry tests and READMEs; md's
  new `./document` entry; the root README's paragraph.
- **Must not change:** `common`'s contracts, the local host's or the harness's code (they import
  entries already; if one turns out to import a root, that line alone), audio, video, PDF.
- **Runs after:** phase 5's close. **Before:** the release review.

## As built

One pull request, built by an Opus 5.5 sub-agent on 2026-11-28 and read by the orchestrating
agent, which wrote this section. Context Manager's three lines are not in it.

### The roots

| Format | The root exports now                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------ |
| md     | `setErrorHandler`, `setReporter`; types `ProseMirrorEditor`, `MarkdownEditorPlugin`, `MarkdownNodeSerializer`            |
| code   | `setErrorHandler`, `setReporter`; type `CodeEditor`                                                                      |
| sheet  | `document`, `interaction`, `presentation` as before, `setErrorHandler`; types `SheetEditor`, `SheetGrid`, `SheetPreview` |
| xmdl   | the parser and its types, `setErrorHandler`, `setReporter`; type `XmdlEditor`                                            |
| image  | `setErrorHandler`; type `ImagePreview`                                                                                   |

- **sheet's root also exported `SheetPreview` as a class,** which the table above this section
  missed. It is a type now, by the same rule.
- **md's `./document`** is `src/document.ts`: `createSchema`, `getSchema`, `getMarkdownParser`,
  `getMarkdownSerializer`. `./editor` is as it was, and its test, unchanged, passes.
- **`getSchema()` and `getMarkdownParser()` keep what they first build,** so a plugin registered
  after the first call to `./document` is not seen. This was so at the root too. md's README now
  says to register before the first `<md-editor>` connects and before any call to `./document`.
- The one test that imported a root for its elements (code's) lost that line. No other importer
  of a root was found in surfaces: the local host, the harness, the apps and `common`'s README
  import entries.

### Tests

- **A test for each root,** `src/index.test.ts` in each of the five: no element defined, no
  element module evaluated, and for md and code no engine. They are files of their own and not
  in `entries.test.ts`, since a file shares one module registry.
- **`md/src/document.test.ts`:** the entry defines no element and exports the four functions.
- **`md/src/build.test.ts`, against built output:** it builds the package with its own tsup
  config into a folder under the package's `node_modules`, registers a plugin through the built
  `editor.js`, and sees the plugin's node in the connected editor's schema and in the built
  `document.js`'s. About a second. The building agent built without splitting to see it fail,
  and put a class back at md's root to see the root's test fail.
- `npm run check`: 4,159 tests, on the build's machine.

### What was run, and what was not

- **By the building agent's script,** Chromium and Firefox: the built local host opened a file
  of each of the five formats as a preview and as an editor; the harness, under Vite, showed each
  format's two panes. Every element was defined and ready, with no console line and no page
  error.
- **Both of those alias a package to its source,** so neither loads a format's `dist`. The built
  packages are held by `build.test.ts` for md, and by a read of each built root's imports for the
  rest.
- **Not run:** typing in any editor. The repository's browser tests are audio's, video's and
  PDF's, which this change does not touch, so the PR's job skips them.
- **The CommonJS build** is split as the ESM one is (read in `dist`), and no test loads it.

### Noticed, not changed

- md's `sideEffects` list names `./src/editor/md-toggle.ts`, a file that does not exist.
- md's build puts `w3c-keyname` into a chunk of its own and does not leave it to the host.

Both were so before this change. They go to the stage's log.
