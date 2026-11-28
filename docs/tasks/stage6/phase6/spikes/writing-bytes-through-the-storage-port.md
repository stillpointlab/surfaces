---
column: todo
created: 2026-11-27T18:40:00-07:00
tags: [common, hosts, host-contract, spike]
---

> Tech-spike working notes: capture the question, what you find, and where it points — enough that a
> brief can be distilled from it later. Keep it honest about uncertainty; link sources. The
> `column:` frontmatter above drives this file's card on the task board (absent for pooled spikes).

# Spike: writing bytes through the storage port

## Question

The [media previews brief](../../phase1/briefs/media_previews.md) put this spike in the stage's
close (ruling 7), "so [very basic media editors](../../../unassigned/seeds/basic-media-editors.md)
can start from an answer". The storage port (`packages/common/src/host/index.ts`) reads and writes
text: `get` answers `{ text, version }` and refuses a file that is not UTF-8 or is over 2 MiB;
`put` writes text, or moves and deletes a file whole. What would it take for an editor to read
and save a file that is not text?

The card is written at the opening of phase 5, before the spike is run, to hold what the stage
has already asked of it.

To answer:

1. **The shape of a write.** A change that carries bytes (a `Uint8Array`, a `Blob`, a stream)
   beside the changes that carry text, in the same all-or-none `put`. What a version to write
   against is for a file whose text was never read (the raw route's validator is one answer).
2. **The shape of a read.** A preview is given a URL and asks it for ranges. What an editor is
   given: the same URL, the bytes whole, or a way to read a part. Jamie, 2026-11-27: "we should
   extend the preview and edit interfaces for the range request", and, on the previews, the
   surfaces contracts were what he meant. So an editor of bytes reads in ranges too, and this
   spike says through what.
3. **The editor's contract.** `EditorElement` is text in and text out (`setContent`,
   `getContent`, `content-change`). What an editor of bytes answers to: how it says it is dirty,
   how it hands over what to save, and whether a descriptor that `needs: 'url'` may name an
   editor.
4. **Size.** What bound a write has, in the page's memory and over the wire, and what a large
   file needs (a stream, parts, a file handed over by reference).
5. **Undo.** The local host's journal keeps the text of what it replaces or deletes, and for a
   file that is not text it asks first and cannot undo. What undo is for a saved picture or
   clip: a copy kept, a bound on what is kept, or none and said so.
6. **The local host:** its `put` route, its request check, its token, its limits on a body, and
   what git shows for a changed binary file (status, and the Changes view, which diffs text).
7. **Context Manager:** its goods hold no bytes yet
   ([its spike](https://github.com/stillpointlab/context-manager/pull/1322)). What a port over
   goods would need for bytes is asked there; this spike says what surfaces would ask of it.
8. **The first users, and what each has already asked:**
   - **[A drawn signature on a PDF](../../../unassigned/seeds/a-drawn-signature-on-a-pdf.md):** a
     body of bytes about 1 kB larger than the original, a version to write against, a new path
     beside the original and never over it, and a way for the element to hand the bytes to the
     host ([the signing spike](../../phase4/spikes/signing-a-pdf.md), finding 5).
   - **The basic image editor:** a whole file replaced, of a few megabytes.
   - **Sound and film:** far larger, and likely the case that sets the shape.

## Findings

Not run yet.

## Recommendation

None yet.

## References

- `packages/common/src/host/index.ts` (`StoragePort`, `PortChange`, the refusal codes) and
  `packages/common/src/contracts.ts` (`EditorElement`).
- The local host's raw route and its README; the root README's "What a host's URL owes such a
  format".
- [Very basic media editors](../../../unassigned/seeds/basic-media-editors.md), "What stands in
  the way today".
