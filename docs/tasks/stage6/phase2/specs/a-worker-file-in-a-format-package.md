---
column: todo
created: 2026-11-25T18:00:00-07:00
tags: [formats, dev-tooling, code]
---

# Spec: a worker file in a format package

_From the [streaming spike](../../phase1/spikes/a-video-player-that-streams.md) and the
[PDF preview seed](../../phase1/seeds/pdf-preview.md), for phase 2 of the
[media previews brief](../../phase1/briefs/media_previews.md). It starts with a proof, and its
size depends on what the proof shows._

## High-level goal

A format package can ship a worker as a file of its own, and both hosts load it from their own
origin. Whoever writes the PDF format in phase 4 follows a way that is written down and proved.

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

## What is not known

How a package names its worker so that all of those find it. Two ways are candidates:

1. **The package builds the worker as an entry of its own** (`dist/worker.js`), and its code
   names it relative to itself (`new URL('./worker.js', import.meta.url)`). Vite follows that
   pattern in a dependency when it builds; whether it survives tsup's split chunks, whose files
   sit in `dist/chunks/`, and the development mode's source mapping, is not known.
2. **The host gives the address.** The package exports the worker as an entry, the host builds
   it as one of its own files, and hands its address to the element. This is known to work and
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
