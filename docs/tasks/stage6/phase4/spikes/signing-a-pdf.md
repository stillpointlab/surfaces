---
column: todo
created: 2026-11-26T16:10:00-07:00
tags: [formats, feature, spike]
---

> Tech-spike working notes: capture the question, what you find, and where it points — enough that a
> brief can be distilled from it later. Keep it honest about uncertainty; link sources. The
> `column:` frontmatter above drives this file's card on the task board (absent for pooled spikes).

# Spike: signing a PDF

## Question

Jamie, 2026-11-26, with the [PDF preview's spec](../specs/pdf-preview.md): "add a spike for
supporting signing pdfs". So: what would it take for a person to sign a PDF in a surface, and
what does "sign" mean here?

To answer:

1. **Which signing.** Two different things share the word, and the spike asks Jamie which he
   means, or both:
   - **a drawn or typed signature placed on a page,** as a person signs a form: a picture or ink
     added to the PDF, proving nothing by itself;
   - **a digital signature** (a certificate and a hash over the file's bytes, PAdES), which a
     reader can verify and which breaks if the file changes.
2. **Reading comes first.** Read in `pdfjs-dist` 6.5.438 and not yet run: a document answers
   `getSignatures()` (who signed, why, when) and `getSignatureData(id)` (the bytes needed to
   verify one). Can the preview say "signed by …", and can a signature be verified in the
   browser, against which certificates?
3. **Writing is new ground.** pdf.js draws and reads; whether it can save what a signature
   needs is to be found out, and it does not sign. What writes a signature: a library in the
   browser (which, under which licence, how large), or the host? Each candidate is tried under
   both hosts' policies, as pdf.js was.
4. **Where the key is,** for a digital signature: a file the person chooses, the browser's own
   store (WebCrypto, a passkey), a card or token, or a service. What may a page under our
   policies reach, and what must never pass through a host?
5. **The bytes.** A signed PDF is a new version of a binary file. The storage port is text
   today, and the stage's spike on writing bytes is where that is asked: this spike says what
   signing needs of it (an incremental save that leaves earlier signatures valid).
6. **Where it belongs.** A preview does not write. Signing is an editor's work, or a step of its
   own in a host, and is nearer the
   [basic media editors](../../../unassigned/seeds/basic-media-editors.md) than this stage's
   previews.
7. **Context Manager:** a signed version of a good, who signed it, and whether its own record of
   a check-in says anything a signature should carry.

## Findings

Not run yet.

## Recommendation

None yet.

## References

- The [pdf.js spike](pdfjs-in-a-format-package.md) and the
  [PDF preview's spec](../specs/pdf-preview.md).
- `pdfjs-dist`: `types/src/display/api.d.ts` (`getSignatures`, `getSignatureData`).
- The [media previews brief](../../phase1/briefs/media_previews.md): the spike on writing bytes
  at the stage's close.
