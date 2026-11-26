---
column: in-progress
created: 2026-11-25T18:00:00-07:00
tags: [formats, dev-tooling, code]
---

# Spec: a worker file in a format package

_From the [streaming spike](../../phase1/spikes/a-video-player-that-streams.md) and the
[PDF preview seed](../../phase1/seeds/pdf-preview.md), for phase 2 of the
[media previews brief](../../phase1/briefs/media_previews.md). It starts with a proof, and its
size depends on what the proof shows._

## High-level goal

A format package can ship a web worker as a file of its own, and both hosts load it from their
own origin. Whoever writes the PDF format in phase 4 follows a way that is written down and proved.

## Related context

- **pdf.js needs it.** It draws in a worker, and the seed's first open check is "can tsup emit
  the pdf.js worker as its own chunk under the current package config".
- **hls.js does not, in this stage.** Its module build runs without a worker unless given a
  path to one, and in the spike it played and sought that way. A worker for it is a later gain,
  by whatever this spec proves.
- **Both hosts' policies** allow a worker from their own origin and not from a `blob:` (no
  `worker-src`, so `script-src 'self'` decides). The spike saw hls.js's `blob:` worker refused.
- **Three builds stand between the source and the page:** the package's (tsup), and each host's
  (Vite, in the local host and in Context Manager). The local host's development mode maps a
  package's entries to its source, a fourth path.

## The name

Jamie, 2026-11-25: a format already has `<format>-preview` and `<format>-editor`, so
`<format>-worker` is the name. A worker is not an element, so it has no tag; the convention is
its entry and its files, beside the other two:

| Part    | Entry       | Source         | Built file        |
| ------- | ----------- | -------------- | ----------------- |
| Preview | `./preview` | `src/preview/` | `dist/preview.js` |
| Editor  | `./editor`  | `src/editor/`  | `dist/editor.js`  |
| Worker  | `./worker`  | `src/worker/`  | `dist/worker.js`  |

Where a name is wanted (a log line, a `Worker`'s `name`), it is `<format>-worker`.

## What is not known

How a package names its worker so that all of those find it. Two ways are candidates:

1. **The package's code names its `./worker` entry relative to itself**
   (`new URL('./worker.js', import.meta.url)`). Vite follows that pattern in a dependency when
   it builds; whether it survives tsup's split chunks, whose files sit in `dist/chunks/`, and
   the development mode's source mapping, is not known.
2. **The host gives the address.** The host builds the package's `./worker` entry as one of its
   own files and hands its address to the element. This is known to work and
   costs each host a line for each format with a worker, and the descriptor a member to carry
   the address.

## Technical requirement

### 1. The proof

A trial format with a worker that answers one message, tried by way 1 through:

- the package's own build;
- the local host, built and in development mode;
- Context Manager's client build, with the trial linked in the adoption clone.

Loaded in Chromium under each host's policy, with any policy report read.

### 2. The way, written down

- If way 1 passes all of them: `tooling/tsup.ts` gains what a package needs to declare a worker
  entry, and the root README's format convention says how a format names its worker. Nothing in
  `common` changes.
- If it does not: way 2, as an optional member of the descriptor, in a spec of its own that
  this one is closed against.

### 3. No worker is a way too

Where a library can run without its worker, a format may ship without one and say so in its
README. hls.js in phase 3 does.

## Non-goals

- The PDF format itself, or a worker for hls.js.
- Shared workers, service workers or worklets.
- WebAssembly files, which pdf.js may also want: the PDF spec's second look decides.

## Acceptance / completion checklist

- [ ] The proof's results for each of the four builds are in the PR, with the trial removed.
- [ ] One way is written in the root README's format convention, and the tooling for it is in
      `tooling/tsup.ts` if any is needed.
- [ ] No policy in either host is loosened.
- [ ] `npm run check` passes.

### Work package

- **Owns:** `tooling/tsup.ts`, the root README's format convention.
- **Must not change:** any format, `common`, either host's policy.
- **Runs after:** [the scaffold](scaffold-registrable-formats.md), which gives it a template to
  make the trial from.

## As built

The proof and the build were an Opus 5.5 sub-agent's, read by the orchestrating agent. Way 1
stands, with two conditions the spec did not have, so its table of names changes.

### What the proof showed

Each form was built four ways and loaded in headless Chromium, with a listener for policy
reports that the page's policy does not govern. A `blob:` worker under Context Manager's policy
was refused and reported, which shows the listener hears.

| Form                                                                                       | The package's build  | Local host, built | Local host, development | Context Manager's client |
| ------------------------------------------------------------------------------------------ | -------------------- | ----------------- | ----------------------- | ------------------------ |
| The spec's: `./worker.js`, worker at `src/worker/index.ts`, started in the preview         | answered             | the build fails   | 404                     | answered                 |
| The same, started from a module loaded with `import()`                                     | 404 (`dist/chunks/`) | the build fails   | 404                     | not run                  |
| The source's own address (`../worker/index.ts`)                                            | 404                  | answered          | answered                | the build fails          |
| The package's own name (`@stillpointlab/<name>/worker`)                                    | 404                  | answered          | answered                | answered                 |
| `./worker.js`, with the worker's source named `worker.ts` beside the module that starts it | answered             | answered          | answered                | answered                 |
| The same, started from a module loaded with `import()`                                     | 404 (`dist/chunks/`) | answered          | answered                | the build fails          |

No form brought a policy report in any run. The local host fails the spec's form because it
reads a package's source, built and in development mode, and no `worker.js` lies beside the
preview's source.

### The way

- **The worker is `src/worker/worker.ts`, built to `dist/worker.js` as the `./worker` entry.**
  Its name in the source matters: the local host finds `worker.ts` as the `worker.js` the
  address names.
- **A starter beside it, `src/worker/start.ts`,** holds the one expression every build follows:
  `new Worker(new URL('./worker.js', import.meta.url), { type: 'module', name: '<format>-worker' })`.
- **The starter is one entry's alone, imported statically.** Shared by two entries, or loaded
  with `import()`, it is built into `dist/chunks/`, where the address names nothing. A library
  loaded on demand is handed the worker already started.
- **No host has a line for a format's worker,** the descriptor has no new member, and no policy
  changed.

A fresh trial made this way answered in all four builds, and in the harness.

### What was built

- `tooling/tsup.ts`: the build fails when a file in `dist/chunks/` holds the worker's address,
  with 12 tests of the guard; and the CJS build is given an `import.meta.url`, without which it
  kept the expression and did not parse. Every package was built before and after: the same
  contents, under new chunk names.
- The root README's format convention: the `./worker` row, and a "Workers" section.

### Checked

- `npm run check` from a clean tree: 3,884 tests.
- Context Manager's part was its client build alone, on a throwaway branch of the adoption's
  clone at its `origin/main`, served by a scratch server under a policy made by Context Manager's
  own code with its own directives. The clone was left as it was found.

### Not tried, and what the PDF format's spec has to look at

- **pdf.js itself.** The trial's worker answers one message and imports nothing.
  `GlobalWorkerOptions.workerPort` is named in the README from pdf.js's documentation.
- **Both hosts' builds emit the worker as a classic script,** whatever `type: 'module'` says. A
  worker that loads more of itself with `import()`, as pdf.js's may, has to be tried against
  that.
- **The CJS build's address is not the worker's.** It parses; no host loads it.
- **Context Manager in development mode,** where the page's scripts come from another origin
  and a browser refuses a worker from one. Reasoned, not run.
- **Vitest's browser mode,** which was not on this branch.
- **The harness sends no policy,** so it cannot show what a host would refuse.
- Firefox and Safari.
