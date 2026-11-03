---
column: todo
created: 2026-11-02T23:46:29-07:00
tags: [formats, polish, quick-win]
---

# Spec: defining `<code-editor>` loads no CodeMirror

_From the Context Manager adoption of the raw view (context-manager#1009, stage 5 WAL). Independent
of the other phase 6 spec._

## High-level goal

Importing a code-format entry defines its element and nothing more. CodeMirror loads when an
element first connects, as the lazy-engine helper intends, so a host can define `<code-editor>` or
`<code-preview>` on every page that might show raw text without paying for CodeMirror on pages that
never do.

## Related context

- Follow-up to: the [raw view convention](../../phase5/specs/raw-view-convention.md), whose Context
  Manager follow-up expected "CodeMirror still loads only when raw opens".
- Depends on: nothing.
- Main files/areas: `packages/formats/code/src/editor/language.ts` and its importers
  (`code-editor.ts`, `preview/code-preview.ts`, `diff/code-diff.ts`), the entry files under
  `src/`, `language.test.ts`, the code README.

## Why

Context Manager now defines `<code-editor>` on md, xmdl and sheet editor pages, so the raw view
edits text in CodeMirror. Measured from a `vite build` manifest of context-manager#1009, that import
adds about 112 KB gzipped to those pages up front. The element module itself is about 4 KB. The rest
is CodeMirror's core (`@codemirror/view`, `state`, `language`, `@lezer/*` and the language-data
descriptors), reached through one file. `language.ts` imports `LanguageDescription` from
`@codemirror/language` and `languages` from `@codemirror/language-data` as values. Its comment
says the import is cheap because no grammar loads, but `@codemirror/language` pulls in the view and
state packages. Every other `@codemirror/*` import in the element modules is already type-only;
the engines import the real modules in their `createLazyLoader` callbacks.

## Technical requirement

1. **`language.ts` imports CodeMirror lazily.** `loadLanguage(name)` imports
   `@codemirror/language-data` (and `@codemirror/language` if it still needs it) inside the call.
   Its result is unchanged: the language's extension, or `[]` for an unknown name or a failed
   load, reported through `reportError`. The value imports become type-only.
2. **`findLanguage` becomes async.** It returns `Promise<LanguageDescription | null>` with the same
   matching (case-insensitive, aliases, `null` for empty or unknown). It stays exported from the
   entries. This changes a public export, but nothing outside the package imports it: Context
   Manager does not, and neither does any other format.
3. **A test keeps it so.** One test per entry (`.`, `./editor`, `./preview`, `./diff`) imports it
   with `codemirror`, `@codemirror/*` and `@replit/*` mocked to record their evaluation. It asserts
   that importing the entry and creating the element evaluate none of them, and that connecting
   the element does. A static `import` of any of them in an element module then fails CI.
4. **Comments and README.** `language.ts`'s comment says what is lazy and why. The code README
   gains one line under its existing usage notes: importing an entry defines the element, and
   CodeMirror loads on first connect.

## Non-goals

- The same audit of the other formats' entries. md-format's entry has a static closure of about
  190 KB gzipped in the same build, but Context Manager loads it to show the md editor anyway. A
  separate spike can look at it if a page ever imports md-format without mounting the editor.
- Splitting the language descriptors finer or changing which languages are bundled.
- Any change to when the engine loads: still on first connect, through `createLazyLoader`.

## Acceptance / completion checklist

- [ ] No value import of `codemirror`, `@codemirror/*` or `@replit/*` is left in a code-format
      module that an entry imports statically.
- [ ] The per-entry evaluation tests pass and fail when a static import is put back.
- [ ] `loadLanguage` and the async `findLanguage` keep their behaviour; `language.test.ts` is updated.
- [ ] The harness shows `code-editor`, `code-preview` and `code-diff` as before, and md's raw view
      still uses `<code-editor>`.
- [ ] `npm run check` is green.

## Context Manager follow-up (with the next pin move)

No code change: `registerRawSourceEditor()` and `registerRawSourceView()` already import the
entries. Rebuild with `vite build --manifest` and confirm the code-format entry's static closure on
an md editor page is the element module alone (a few KB). Strike the deferral in the stage 5 WAL
and update ADR-0009's phase 5 amendment, which says CodeMirror is defined on those pages.

## Implementation plan

One PR. Make `language.ts` lazy and `findLanguage` async, update its test and three callers. Then
add the evaluation tests, and check the harness, including `?raw=plain`, which should not change.
