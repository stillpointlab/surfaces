---
column: review
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

Run on 2026-11-26 with `pdfjs-dist` 6.5.438, Playwright's Chromium 158 and Firefox 159, on a
detached checkout of the PDF preview with its text layer (`d0c175b`). The trial put a password
field inside `<pdf-preview>`, in place of the pages; it is not committed. Each finding says **run**
(where), **read** (which file) or **not tried**. "The built host" is `npm run build`, then
`surfaces.js <folder>`, driven by Playwright in both browsers with a listener for policy reports in
the page and the worker and a canary for each: no report was heard. Test passwords, invented:
`secret` and `owner` (`password.pdf`), `open-sesame`, `owner-only-9`, `not-it-7` (wrong).

### 1. What pdf.js gives

Run in Node (pdf.js's legacy build; the modern one needs `Uint8Array.toHex` and
`Math.sumPrecise`, which Node 24 lacks) and in both browsers in the built host; read in
`build/pdf.mjs` (`PasswordRequest`, `WorkerTransport.destroy`) and `build/pdf.worker.mjs`
(`getPassword`, `setupDoc`, `CipherTransformFactory`).

- **The sequence.** The element sets `task.onPassword` right after `getDocument`. The worker reads
  the trailer, finds `/Encrypt`, tries the empty password, and asks: `onPassword(answer, 1)` (one is
  needed). `answer('…')` sends it to the worker, which tries again: the right one resolves
  `task.promise` as for any PDF; a wrong one calls `onPassword(answer, 2)` with a new `answer`.
- **No limit on tries, and no delay.** 30 wrong, then the right one, opened. A wrong try costs
  0.4 ms for RC4 and AES-128 and 72 ms for AES-256 in Node; from Enter to asked again was 7–31 ms
  in the browsers (RC4), 110–142 ms (AES-256).
- **An empty answer** counts as none: pdf.js asks again with reason 1.
- **Giving up through pdf.js:** `answer(new Error())` rejects `task.promise` with a
  `PasswordException` (code 1 or 2). The trial never does this.
- **Left unanswered,** nothing runs: no timer, no retry. `destroy()` while it waits resolved in
  1–5 ms after 2 s of waiting, and the shared worker opened the next PDF. `task.promise` then
  rejects with `PasswordException`, not `AbortException`, so an element must ignore a rejection
  from a task it let go; the element's `live()` check already does. An `answer` called after
  `destroy()` does nothing and throws nothing.
- **What the element holds while it waits:** the loading task (as today) and the last `answer`.
  Nothing else. The password itself need not be kept: the trial reads the field, empties it, and
  hands the value on. **pdf.js keeps it** for the document's life: the main thread holds the
  resolved answer in `WorkerTransport`'s `#passwordCapability`, and the worker keeps it in
  `BasePdfManager._password` beside the derived key. Both go when the document is destroyed.
- **Not tried:** a large encrypted PDF (does its download go on while pdf.js asks?).

### 2. The two passwords

Made with Ghostscript 10.06 (RC4 128, `-dEncryptionR=3 -dKeyLength=128`; it refuses a user
password without an owner one, so "user alone" has the same password for both, and has no AES),
LibreOffice 26.2 (`--convert-to pdf` with `EncryptFile`/`PermissionPassword`: RC4 128 at PDF 1.7,
AES-256 at PDF 2.0; an owner password alone at 2.0 came out unencrypted, so that one was not made)
and a 60-line Node script writing AES-128 (V4 R4, AESV2) by hand. Run in Node for all, and in both
browsers for the five marked †.

| PDF                         | Encryption | Opens with no password | Opens with          |
| --------------------------- | ---------- | ---------------------- | ------------------- |
| user alone (gs) †           | RC4 128    | no, asks               | its password        |
| user alone (LibreOffice)    | AES-256    | no, asks               | its password        |
| user alone (Node)           | AES-128    | no, asks               | its password        |
| owner alone (gs) †          | RC4 128    | **yes**                | —                   |
| owner alone (LibreOffice)   | RC4 128    | **yes**                | —                   |
| owner alone (Node)          | AES-128    | **yes**                | —                   |
| both (gs, `password.pdf`) † | RC4 128    | no, asks               | **either** password |
| both (Node) †               | AES-128    | no, asks               | **either** password |
| both (LibreOffice) †        | AES-256    | no, asks               | **either** password |

- **pdf.js asks only for the user password,** and takes the owner password in its place, as the
  standard has it: `password.pdf` opens on `owner` as well as `secret`.
- **Permissions:** `getPermissions()` gives a `Set` of the flags granted (an owner-alone Ghostscript
  PDF: none; LibreOffice's: modify, annotate, forms, copy for accessibility; no print, no copy). It
  is the same set whichever password opened it, and nothing says which one did. **The element reads
  none of it** (read, `pages.ts`): the text layer lets a person select and copy the text of a PDF
  whose owner forbids copying, as pdf.js's own viewer does by default (`enablePermissions: false`).

### 3. Where the field is

**Inside the element, built and run** (harness and built host, both browsers). In place of the
pages: "This PDF needs a password to open.", a field labelled "Password", an Open button, and a
line for the error. Enter in the field opens. After a wrong one the field is marked invalid and
keeps the focus; the first ask takes no focus, so a person moving through the file tree is not
pulled into it. It follows the house style of a small form (the inventory's item form: a `label`
around a `span` and the `input`, an error `p` with `role="alert"`, `aria-invalid` and
`aria-describedby`), with common's tokens; `check-tokens`, `tsc` and `eslint` pass. It is a class
of 84 lines in `pdf-preview.ts`. Judged: it reads as part of the preview, and the harness and
both hosts get it with no change of theirs.

**The host draws it (not built).** `UrlPreviewElement` and the descriptor stay as they are: this is
PDF's alone, so `PdfPreviewElement` would gain it, as `contracts.ts` says a format's own type
does: an event (`password-needed`, detail `{ wrong }`) and a method (`unlock(password)`). Each
host writes a dialog, its wiring and the focus going back (the local host has `file-ops/dialog.ts`
to copy; Context Manager its modals; the harness one more). The element still needs words for a
host that draws nothing and a way to ask again after a dialog is closed, so it shrinks little. Its
gain: the host could keep the password (4).

### 4. Where the password lives

**In the element alone, run in the built host, both browsers** (the stream cut by a proxy in
Chromium only):

| What happens                                       | The pane                   | Asked again |
| -------------------------------------------------- | -------------------------- | ----------- |
| the tab hidden and shown (stream closed, reopened) | keeps the element          | no          |
| the event stream cut and reconnected               | keeps the element          | no          |
| another file opened, then this one again           | a new element              | **yes**     |
| the file touched on disk (same bytes, new time)    | a new element, new address | **yes**     |
| the file chosen again while it is open             | nothing happens            | no          |

Read in `pane.ts`: `check` makes a new element only when the validator differs; `open` does
nothing for the open path; `letGo`'s empty source destroys a leaving element's task.

**"The host keeps it for the file" (not built)** would mean: the element hands the password back
on success (an event's detail, which any listener in the page can read), the host keeps it in the
page's memory by path, and hands it to the next element (a method, never an attribute: an
attribute is DOM), which gives it to `getDocument`'s `password`. It would be cleared when the file
is deleted or moved and when the tab closes; never `sessionStorage`, which Chromium writes to disk
for session restore. A saved password that no longer opens the file needs words of its own ("the
saved password no longer opens it"). It adds a third copy to pdf.js's two, and work in the
element, `common`'s docs and each host: about 150–250 lines with tests, by the trial's measure.

### 5. What must never happen

| Where                        | Found                        | How                  |
| ---------------------------- | ---------------------------- | -------------------- |
| an address                   | none                         | run, both            |
| the console, page and worker | none                         | run, both; jsdom     |
| the error handler            | none; asking reports nothing | jsdom; Chromium test |
| the DOM after opening        | none                         | run, both            |
| form history                 | none                         | run, profiles read   |
| the password manager         | **offered to save, both**    | run, below           |

Every request's address and body was read in both browsers, and in Chromium what the host was
sent (a proxy). The DOM is the element's attributes, its shadow tree, every input's value, the
page's address and title. Form history kept only the controls' plain text fields: a
`type="password"` field is never kept there. The password manager was run with a profile of its
own in full Chromium (`chrome://password-manager-internals` open beside the page: "Show password
prompt") and in Firefox (`signon.rememberSignons` on, which Playwright turns off, and
`signon.debug`: "Prompting user to save login"):

| The field                                    | Chromium 158  | Firefox 159 |
| -------------------------------------------- | ------------- | ----------- |
| `type="password" autocomplete="off"` (trial) | prompt        | prompt      |
| the same, outside a shadow root              | prompt        | prompt      |
| `autocomplete="current-password"`            | prompt        | not tried   |
| `autocomplete="new-password"`                | prompt        | prompt      |
| `autocomplete="one-time-code"`               | **no prompt** | prompt      |
| `data-1p-ignore data-lpignore`               | prompt        | not tried   |
| `type="text"`, `-webkit-text-security: disc` | no prompt     | no prompt   |

No `<form>` does not help: Chromium calls it a "dynamic form submission" when the field is emptied
and removed and the page then fetches. The field in the trial's shadow root is seen by both. No
prompt was accepted, so no login was stored. The masked text field escapes both, but a screen
reader then hears an ordinary text field, and may echo each letter: not a fix.

### 6. States and words

| State  | Shows                                                    | Ready                      |
| ------ | -------------------------------------------------------- | -------------------------- |
| asking | "This PDF needs a password to open.", the field, Open    | **settled**                |
| sent   | the loading words                                        | pending                    |
| wrong  | the same, and "That password didn't open it. Try again." | settled again              |
| empty  | "Type the password first." (nothing sent)                | stays settled              |
| opened | the pages                                                | settled on the first drawn |

Asking is settled because nothing more comes without a person; pending would leave a host waiting
on `whenReady()` for ever. The harness shows its "ready" badge while it asks, and logs a `ready`
event three times for ask, wrong, open. A person's answer starts a new cycle without a new
source, which the contract's comment does not name (it names a set and a disconnect). Neither host
waits on a preview's ready today (read: `pane.ts` waits only to focus an editor; Context Manager's
`mountFormatPreview` does not wait).

**Giving up** is leaving the file: no button; the pane's empty source destroys the task. A Cancel
button would need a state after it ("This PDF needs a password.") and a way back.

**The accessibility tree,** run: Chromium's own (CDP `Accessibility.getFullAXTree`), Playwright's
`ariaSnapshot` in both. A group named by the sentence, inside the group named by the file; a
textbox "Password"; a button "Open"; after a wrong one the textbox is invalid, focused, and
described by the error, which sits in a `role="alert"`. Not tried: a screen reader (Orca, NVDA),
and whether the same words set again on a second wrong try are announced again.

### 7. Tests

Written for the trial and passing: **8 jsdom tests** (`pdf-preview-password.test.ts`) and **2
browser tests**; one jsdom case's words changed and the old browser case removed (jsdom 94 → 102;
browser 13 → 14, 3 s). The fake gains `onPassword`, `ask(reason)` and the passwords handed to it
(18 lines). jsdom shows: asking settled and reported nowhere; the password handed on and the field
emptied; Enter; a wrong one said, marked and focused; an empty one not sent; a new source
destroying a task that asks; a move keeping it; the password in neither the error handler nor the
console. Only a browser shows pdf.js itself: a wrong one then the right one draws with ink, `owner`
opens it too, the password is not in the shadow tree. The password managers need a profile and
Playwright outside vitest: a release-walk step, not CI. `password.pdf` is enough; an owner-alone
PDF is one more Ghostscript line.

### 8. Context Manager

Read at `origin/main` `bedf6e1e`; nothing run. It does not register the PDF format yet. It mounts
a URL preview as a new element each time (`mountFormatPreview`) and routes the formats' errors to
its own reporter (`setErrorHandler(reportError)`); the trial reports nothing while asking. Several
people opening one good: each browser asks on its own, and pdf.js decrypts in the person's worker,
so the password never reaches Context Manager's server. Two things differ:

- **Its origin holds the person's own login.** A browser's offer to save the PDF's password there
  (5) could replace the saved Context Manager password with the PDF's. Reasoned from 5, not run.
- **It hands no leaving preview an empty source** (none found), so a preview removed while it
  asks keeps its task in the shared worker until the page goes, as an opened document already does.

## Recommendation

Build the field inside the element, the password in pdf.js's memory alone. The guess (small, about
a day, larger by 3 and 4) holds, and 5 adds to it. **The trial adds 432 lines and removes 10, in
six files:** 133 in the element (the form's class is 84), 71 of styles, 18 in the fake, 210 of
tests. A README section and a release-walk step would add about 40. By size that is under half the
text layer (907 lines in the package, 9 files) and a seventh of the PDF preview (3,029 lines, 37
files), both measured with `git diff --stat` on the trial's checkout; commit times say nothing of
effort. So "about a day" is generous for this version, and fair with its spec, walk and PR.

What would make it larger: the host drawing the field (a dialog in the local host, the harness and
Context Manager, and an element that still needs words of its own: two to three times the trial);
the host keeping the password (150–250 lines, and a third copy of it); a Cancel button and the
state after it; honouring a PDF's permissions in the text layer; or stopping Firefox's offer to
save, which no attribute does.

**A first version holds:** the field in place of the pages, Enter and Open, the wrong words, the
focus kept in the field after a wrong one, asking settled, the field emptied as it is sent, the
password reported nowhere, the 8 jsdom and 2 browser tests above, and `password.pdf` as it is.
**It leaves out:** a host's dialog, a password kept past the element, a Cancel button, the
permissions, new test PDFs beyond an owner-alone one, and any attempt on Firefox's offer.

### For Jamie

1. **Build it now or later.** Ruling 5 deferred it; the trial says it is small. Lean (the
   agent's): build it at this stage's close, with the PDF format's other follow-ups.
2. **Where the field is.** Inside the element, or a host's dialog. Lean: inside.
3. **Asked again on reopen.** With the password in the element, reopening a file or a change on
   disk asks again; a hidden tab and a reconnection do not. Lean: accept that for a first version.
4. **The password manager.** Both browsers offer to save it for the host's origin; `one-time-code`
   stops Chromium's offer, nothing but a masked text field stops Firefox's. Lean: `one-time-code`,
   and Firefox's offer in Known and left, where it matters most for Context Manager (8).
5. **Ready while asking.** Lean: settled, and one sentence in `contracts.ts`'s comment that a
   person's answer starts a new cycle.
6. **Giving up.** Lean: leaving the file is giving up; no Cancel button.
7. **Permissions.** The text layer copies a PDF whose owner forbids copying, as pdf.js's viewer
   does. Lean: leave it, and say so in the README.
8. **The words.** "This PDF needs a password to open.", "That password didn't open it. Try
   again.", "Type the password first.", and "This PDF needs a password." for a failure. Lean: these.

## References

- The [pdf.js spike](pdfjs-in-a-format-package.md), which opened an encrypted PDF as far as
  `onPassword` being called, and the [PDF preview's spec](../specs/pdf-preview.md), ruling 5.
- `pdfjs-dist` 6.5.438: `types/src/display/api.d.ts` (`onPassword`, `password`, `getData`),
  `types/src/shared/util.d.ts` (`PasswordResponses`, `PermissionFlag`), `build/pdf.mjs`
  (`PasswordRequest`, `destroy`), `build/pdf.worker.mjs` (`getPassword`, `setupDoc`,
  `updatePassword`, `CipherTransformFactory`).
- The surfaces: `packages/common/src/contracts.ts`, `format.ts`, `ready.ts`, `log.ts`;
  `packages/hosts/local/src/client/pane.ts`, `host-client.ts`; the inventory's `item-form.ts`.
  Context Manager: `src/client/utils/formatPreview.ts`.
- The owner-alone test PDF, from `dev/media/text.pdf` (the others' tools are in finding 2; the
  AES-128 writer and the trial's patch are kept outside the repository):

  ```sh
  gs -q -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -sOwnerPassword=owner-only-9 \
    -dEncryptionR=3 -dKeyLength=128 -dPermissions=-3904 -o owner-rc4.pdf text.pdf
  ```
