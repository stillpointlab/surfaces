---
column: todo
created: 2026-11-27T09:30:00-07:00
tags: [formats, feature, spike]
---

> Tech-spike working notes: capture the question, what you find, and where it points — enough that a
> brief can be distilled from it later. Keep it honest about uncertainty; link sources. The
> `column:` frontmatter above drives this file's card on the task board (absent for pooled spikes).

# Spike: a PDF signature that can be verified

## Question

Jamie, 2026-11-27, on [signing a PDF](signing-a-pdf.md): "a signature drawn on the page. we can
add verifiable as a spike". So: what would it take for a surface to show, check and make a
digital signature on a PDF (a certificate and a hash over the file's bytes, PAdES), which a
reader can verify and which breaks if the file changes?

To answer:

1. **Reading comes first.** Read in `pdfjs-dist` 6.5.438 and not yet run: a document answers
   `getSignatures()` (who signed, why, when) and `getSignatureData(id)` (the bytes needed to
   verify one). Can the preview say "signed by …" from these alone?
2. **Verifying.** Can a signature be verified in the browser (WebCrypto and a parser for what a
   signature holds), against which certificates, and what may honestly be said when the chain
   of trust cannot be checked: "unchanged since it was signed" is one claim, "signed by this
   person" another.
3. **Signing.** pdf.js does not sign. What does: a library in the browser (which, under which
   licence, how large), or the host. Each candidate is tried under both hosts' policies, as
   pdf.js was.
4. **Where the key is:** a file the person chooses, the browser's own store (WebCrypto, a
   passkey), a card or token, or a service. What may a page under our policies reach, and what
   must never pass through a host?
5. **The bytes.** A signature is added to a PDF's end so that earlier signatures stay valid. What
   that needs of the spike on writing bytes, and what the [drawn signature](signing-a-pdf.md)'s
   save must not do to a PDF signed this way.
6. **Context Manager:** whether its own record of a check-in says anything a signature should
   carry, or stands in for one.

## Findings

Not run yet.

## Recommendation

None yet.

## References

- [Signing a PDF](signing-a-pdf.md), the spike on a drawn signature, which this one was part of
  until Jamie's ruling.
- `pdfjs-dist`: `types/src/display/api.d.ts` (`getSignatures`, `getSignatureData`).
- The [media previews brief](../../phase1/briefs/media_previews.md): the spike on writing bytes
  at the stage's close.
