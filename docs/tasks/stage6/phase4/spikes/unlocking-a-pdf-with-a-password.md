---
column: todo
created: 2026-11-26T16:10:00-07:00
tags: [formats, feature, spike]
---

> Tech-spike working notes: capture the question, what you find, and where it points — enough that a
> brief can be distilled from it later. Keep it honest about uncertainty; link sources. The
> `column:` frontmatter above drives this file's card on the task board (absent for pooled spikes).

# Spike: unlocking a PDF with a password

## Question

Jamie, 2026-11-26, on the [PDF preview's spec](../specs/pdf-preview.md), which tells a person in
words that a PDF needs a password and offers no field: "how much effort to add the unlock? we can
defer for now but if so let's add a spike". So: what does it take for `<pdf-preview>` to ask for a
password and open the file?

To answer:

1. **What pdf.js gives.** Read in `pdfjs-dist` 6.5.438 and not yet run: a loading task has an
   `onPassword` callback, called with a function to hand a password back and a reason
   (`PasswordResponses`: one is needed, or the one given was wrong), and `getDocument` takes a
   `password`. Run it: a right password, a wrong one, several wrong ones, giving up.
2. **The two passwords.** A PDF may have a user password (to open it) and an owner password (to
   lift limits on printing and copying). Which does pdf.js ask for, and does a PDF with an owner
   password alone open with none?
3. **Where the field is.** Inside the element, in place of the pages, or the host's to draw (a
   dialog), with the element only saying "a password is needed" and taking one through its
   contract. The second adds to `UrlPreviewElement` for one format.
4. **Where the password lives.** In the element's memory and no longer, or kept by the host for
   the file. The local host's pane makes a new element when the file changes on disk and when it
   is opened again: is the person asked again each time?
5. **What must never happen:** the password in an address, a log, the error handler's report, or
   the browser's store of form values (`autocomplete`).
6. **The states and words:** asking, wrong, and how a person gives up. What a screen reader is
   told.
7. **Tests:** a PDF with a known password, made by command; what jsdom can show with pdf.js
   faked, and what needs a browser.
8. **Context Manager:** whether anything differs there (a good opened by several people; a
   password is not the good's to keep).

## Findings

Not run yet.

## Recommendation

None yet. The agent's guess before running it, to be checked by the spike and not relied on: a
field inside the element with the password kept in memory alone is small, about a day's build
with its tests, since pdf.js does the work; the questions that could make it larger are 3 and 4.

## References

- The [pdf.js spike](pdfjs-in-a-format-package.md), which opened an encrypted PDF as far as
  `onPassword` being called.
- `pdfjs-dist`: `types/src/display/api.d.ts` (`onPassword`, `password`),
  `types/src/shared/util.d.ts` (`PasswordResponses`).
