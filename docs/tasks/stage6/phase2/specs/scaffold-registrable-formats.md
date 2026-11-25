---
column: todo
created: 2026-11-25T18:00:00-07:00
tags: [scaffold, formats, dev-tooling, code]
---

# Spec: the scaffold makes a format a host can register

_From the seed [one scaffold for formats and apps](../../phase1/seeds/one-scaffold-for-formats-and-apps.md)
and the [media previews brief](../../phase1/briefs/media_previews.md), phase 2. One PR here. It
takes the part of the seed that three new formats need; the rest of the seed stays a seed._

## High-level goal

`npm run new-format -- <name>` makes a package that a host can register with no edit by hand, for
a text format with an editor and for a preview-only format that is given a URL. A change to a
template is tested where the template lies, by `npm run check`.

## Related context

- Main files: `tooling/new-format.mjs`, `tooling/template/format/`, the root `package.json`
  (workspaces), `vitest.config.ts`, `eslint.config.mjs`, `tooling/harness/main.ts`,
  `packages/common/src/contracts.ts` and `packages/common/src/testing/image-preview.ts`, the root
  README.
- The model for a format that is given a URL is `packages/formats/image/`: a descriptor with
  `needs: 'url'`, one preview element with `setSource`, no editor.
- Depends on: nothing. [Browser tests](browser-tests-in-ci.md) adds one browser test to the new
  template after this lands.

## What happens today

- The template has no `./format` entry, so a scaffolded format has no descriptor (stage 4
  follow-ups).
- The template is not a workspace. A change to it is proven by scaffolding a trial format,
  testing that, removing it and putting the lockfile back by hand (stage 1 follow-ups).
- There is one template, a text format with an editor. PDF, audio and video are each a preview
  that is given a URL, which a person would have to cut out of it.

## Technical requirement

### 1. The text template gains its descriptor

`tooling/template/format/` gains what the five formats gained in stage 4:

- `src/format.ts` with `sampleFormat`, the `./format` export and its `format.d.ts` stub;
- `splitPackage` in its build, and `./dist/chunks/*` in `sideEffects`;
- `src/entries.test.ts` and `src/format.test.ts`, as the formats have them;
- `dev/fixtures.ts` switched to `format:`.

### 2. A second template, for a preview that is given a URL

`tooling/template/url-format/`: a descriptor with `needs: 'url'`, one preview element, no editor
and no core. The element is image's shape: `setSource(src, name)`, the four states (empty,
loading, loaded, failed) with words for the last, and the ready signal.

`npm run new-format -- <name> --url` scaffolds from it. Without the flag the text template is
used, as today.

### 3. The contract it is tested against

A contract in `common` is what a host may ask of an element, and there is one for each role, not
one for each format: the previews of md, code, sheet and xmdl all answer to `PreviewElement`. A
preview that is given a URL has one too, and today it is named for its only member:
`ImagePreviewElement`, which is `setSource(src, alt)` and the ready signal, with nothing in it
that is image's alone.

- The contract becomes `UrlPreviewElement`, the role, and the suite `describeUrlPreviewContract`,
  whose `load` and `fail` hooks have no default that looks for an `<img>`.
- **Each format still has its own element and its own type.** The elements are `<image-preview>`,
  `<video-preview>`, `<audio-preview>` and `<pdf-preview>`, each in its package. A format's type
  (`VideoPreviewElement`) is exported from its package and extends the role's contract with
  whatever is that format's alone, when it has something: a video's position, a PDF's page.
  Nothing is added to a format's type until a host asks for it.
- `ImagePreviewElement` and `describeImagePreviewContract` stay in `common` as they are named,
  as the same contract and a call of the same suite with image's hooks, so image and Context
  Manager change nothing.
- The URL template exports `SamplePreviewElement` in that way, so a scaffolded format starts
  with a type of its own name.

### 4. The templates are workspaces

- The root `workspaces`, the vitest projects, the lint globs and the harness's fixture glob each
  gain `tooling/template/*`. A template builds, type-checks, lints and tests with every other
  package, and shows in the harness.
- The two templates have package names of their own. The scaffold writes
  `@stillpointlab/<name>-format` from either.
- A test of the scaffold itself: it scaffolds each template into a temporary folder and checks
  that no `sample` is left in a file name or a file, and that the package's name, tags and
  descriptor id are the new ones.

### 5. The words

The root README's "new format" lines name the flag, and its note that the template has no
descriptor goes.

## Non-goals

- A scaffold for an app or a component (the rest of the seed).
- A descriptor member for a format that needs both text and a URL.
- Media of any kind: the URL template's sample shows what it is given as an image.

## Acceptance / completion checklist

- [ ] `npm run new-format -- trial` and `npm run new-format -- trial2 --url`, then `npm install`
      and `npm run check`, pass with no edit; both appear in the harness and mount through their
      descriptors. The trials are removed before the PR.
- [ ] Each template passes the descriptor suite and its element's contract suite in place.
- [ ] A scaffolded text format is registered by the local host's registry with one import and
      one array entry, and opens a file (checked by hand on a trial, not committed).
- [ ] Image's tests and Context Manager's imports are unchanged.
- [ ] `npm run check` passes.

## Implementation plan

1. `common`: the contract's name and the suite, with image's kept as they are.
2. The text template's descriptor, build, tests and fixtures.
3. The URL template.
4. Workspaces, projects, globs; the scaffold's flag and its test.
5. README.

### Work package

- **Owns:** `tooling/new-format.mjs`, `tooling/template/`, the root configuration files named
  above, `packages/common/src/contracts.ts` and `src/testing/`.
- **Must not change:** the five formats' behaviour, the hosts.
- **Runs beside:** [the raw route serves media](raw-route-serves-media.md).
